import fs from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';
import type { ProfilePreference, RecommendationResponse } from '@apps/ai-agent-core/src/impi/recommend.js';
import { getKnowledgeBaseSnippet } from './knowledge-base.js';
import { getConversationSnippet, type ConversationSnippet } from './conversation-map.js';
import type { MemoryContextNode, MemoryContextResponse } from './memory-context.js';
import { fetchTopNgoPromotions, type NgoPromotionAggregation } from './graphiti-aggregations.js';
import { extractOfferContextMetadata, formatOfferMetadataLines } from './offer-metadata.js';
import { fetchWebSearchResults } from './web-search.js';

const LOG_PATH = process.env.IMPI_CHAT_LOG || path.join(process.cwd(), 'tmp', 'logs', 'impi-chat.log');
async function logImpiEvent(payload: Record<string, unknown>): Promise<void> {
  try {
    await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
    await fs.appendFile(LOG_PATH, `${new Date().toISOString()} ${JSON.stringify(payload)}\n`, 'utf8');
  } catch (err) {
    // best-effort logging; swallow errors to avoid breaking the response flow
    console.warn('Impi log írás hiba (openai service)', err);
  }
}

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_IMPI_MODEL || 'gpt-4o-mini';
const baseTemperature = Number(process.env.OPENAI_IMPI_TEMPERATURE || '0.35');
const ENABLE_WEB_FALLBACK = process.env.ENABLE_WEB_FALLBACK === '1';
const DECISION_PROMPT_KEYWORDS = ['hogyan döntesz', 'hogyan dontod', 'döntési mechanizmus', 'dontesi mechanizmus', 'melyik ngo-t ajánlod', 'melyik ngo-t ajanlod'];
const DEFAULT_FILLOUT_URL = process.env.IMPACTSHOP_IMPI_FILLOUT_URL || '';
const IMPACT_REPORT_URL = process.env.IMPACTSHOP_IMPI_IMPACT_URL || 'https://app.sharity.hu/impactshop/leaderboard';
const VIDEO_SUPPORT_URL = process.env.IMPACTSHOP_VIDEO_SUPPORT_URL || 'https://adomany.sharity.hu/about-us?utm_source=impi';
const VIDEO_SUPPORT_NGO_SLUG = process.env.IMPACTSHOP_VIDEO_NGO_SLUG || 'bator-tabor';
const FRIENDLY_SUPPORT_FORM_LABEL = 'támogatási űrlap';
const FRIENDLY_SUPPORT_FORM_CTA = DEFAULT_FILLOUT_URL
  ? `${FRIENDLY_SUPPORT_FORM_LABEL}: ${DEFAULT_FILLOUT_URL}`
  : FRIENDLY_SUPPORT_FORM_LABEL;
const VIDEO_SUPPORT_CTA = `${VIDEO_SUPPORT_URL}${VIDEO_SUPPORT_URL.includes('?') ? '&' : '?'}ngo=${VIDEO_SUPPORT_NGO_SLUG}`;

function getTemperatureForIntent(intent?: string): number {
  const creativeIntents = new Set(['feedback', 'transparency', 'wrong_expectation', 'no_shop']);
  if (intent && creativeIntents.has(intent)) {
    return Math.min(baseTemperature + 0.15, 0.6);
  }
  return baseTemperature;
}

function getMaxTokensForIntent(intent?: string): number {
  if (!intent || intent === 'coupon_only' || intent === 'high_impact') {
    return 300;
  }
  if (['transparency', 'impact_data', 'wrong_expectation', 'feedback', 'no_shop'].includes(intent || '')) {
    return 600;
  }
  return 400;
}

function reorderOffers(offers: RecommendationResponse['offers']): RecommendationResponse['offers'] {
  const sourceWeight: Record<string, number> = {
    manual_csv: 100,
    manual: 100,
    harvester_bridge: 80,
    arukereso_playwright: 70,
    gmail_structured: 40,
    openapi: 30,
  };
  return [...offers].sort((a, b) => {
    const wa = sourceWeight[a.source || ''] || 0;
    const wb = sourceWeight[b.source || ''] || 0;
    if (wa !== wb) return wb - wa;
    const ca = a.coupon_code ? 1 : 0;
    const cb = b.coupon_code ? 1 : 0;
    if (ca !== cb) return cb - ca;
    const pa = (a as any).priority || 0;
    const pb = (b as any).priority || 0;
    return pb - pa;
  });
}

let client: OpenAI | null = null;
if (apiKey) {
  client = new OpenAI({ apiKey });
}

export function getOpenAIClient(): OpenAI | null {
  return client;
}

interface GenerateOptions {
  userMessage: string;
  recommendation: RecommendationResponse;
  snippet?: ConversationSnippet | null;
  memoryContext?: MemoryContextResponse;
  profile?: ProfilePreference;
}

function buildFallbackHierarchy(): string[] {
  return [
    'Most nincs aktív kupon – kérj pontosítást (termék/összeg/ügy), vagy válassz ezek közül:',
    `1. Videós támogatás: ${VIDEO_SUPPORT_URL}`,
    '2. Írd meg, melyik ügy fontos, és ajánlok NGO-t/linket.',
    `3. Impact riport / toplista: ${IMPACT_REPORT_URL}`,
  ];
}

function buildLocalSummary(
  userMessage: string,
  recommendation: RecommendationResponse,
  snippet?: ConversationSnippet | null,
  ngoAggregations: NgoPromotionAggregation[] = [],
  profile?: ProfilePreference,
): string {
  const sortedOffers = reorderOffers(recommendation.offers);
  const greeting = 'Szia! Örülök, hogy itt vagy – nézzük meg együtt, hogyan tudsz támogatni.';
  const intentLine = userMessage
    ? `Ezt írtad nekem: "${userMessage}" – gondolkodjunk együtt a legjobb megoldáson!`
    : 'Mesélj, mire készülsz: vásárlás, ajándék, vagy csak körbenéznél?';
  const ngoLine = recommendation.preferred_ngo_slug
    ? `A választott ügy: ${recommendation.preferred_ngo_slug}. Ügyelj rá, hogy a linkjeimet használva az ő támogatásuk nő. 🙌`
    : 'Ha még nincs kiválasztott ügyed, írd meg, melyik téma fontos, és ajánlok hozzá szervezetet/linket.';
  const profileLine = formatProfilePreferenceLine(profile);

  const offerLines = sortedOffers.slice(0, 3).map((offer, index) => {
    const label = offer.discount_label || offer.title || `${offer.shop_name} ajánlat`;
    const donationText = offer.estimated_donation_huf
      ? `~${offer.estimated_donation_huf.toLocaleString('hu-HU')} Ft adomány`
      : `~${offer.donation_per_1000_huf} Ft / 1 000 Ft költés`;
    const ngo = offer.preferred_ngo_slug || offer.ngo || 'ImpactShop alap';
    const link = offer.cta_url || 'Írd meg, melyik ügy fontos, és adok hozzá linket';
    const coupon = offer.coupon_code ? ` Kupon: ${offer.coupon_code}.` : '';
    return `${index + 1}. ${offer.shop_name} – ${label} (${donationText} a(z) ${ngo} számára). ${coupon} Link: ${link}`;
  });

  const metadataLines = formatOfferMetadataLines(extractOfferContextMetadata(recommendation.offers, 3));

  const knowledgeLines: string[] = [];
  const ngoAggregationLines = buildNgoAggregationLines(ngoAggregations);
  if (!offerLines.length) {
    if (snippet?.knowledge?.summary) {
      knowledgeLines.push(`A tudásbázis szerint: ${snippet.knowledge.summary}`);
    } else {
      offerLines.push('Most nem találtam releváns kupont, de szívesen keresek tovább – add meg, milyen terméket vagy árkategóriát szeretnél, és kit támogatnál.');
    }
    knowledgeLines.push(...buildFallbackHierarchy());
    if (ngoAggregationLines.length) {
      knowledgeLines.push('Graphiti NGO toplista – ezekre adj CTA-t, amíg nincs konkrét kupon:');
      knowledgeLines.push(...ngoAggregationLines);
    }
  }

  const conversationLines: string[] = [];
  if (snippet) {
    const label = snippet.group ? `${snippet.nodeId} – ${snippet.group}` : snippet.nodeId;
    conversationLines.push(`Javasolt Impi lépés (${label}):`);
    conversationLines.push(snippet.text);
  }

  const closing = 'Szólj nyugodtan, ha más árkategóriára, terméktípusra vagy több ajánlatra van szükséged – figyelek. 😊';

  const videoCtaLines: string[] = [];
  if (recommendation.intent === 'video_support') {
    videoCtaLines.push(
      `Videós támogatás: nézz meg egy kampányvideót és a jutalék automatikusan a(z) ${VIDEO_SUPPORT_NGO_SLUG} szervezethez kerül.`,
    );
    videoCtaLines.push(`CTA: ${VIDEO_SUPPORT_CTA}`);
  }

  if (!offerLines.length && knowledgeLines.length) {
    return [greeting, intentLine, ...videoCtaLines, knowledgeLines.join('\n'), closing].filter(Boolean).join('\n');
  }

  return [
    greeting,
    intentLine,
    ngoLine,
    ...(profileLine ? [profileLine] : []),
    'Ajánlataim:',
    ...offerLines,
    ...videoCtaLines,
    ...(metadataLines.length ? ['Ajánlat metaadatok:', ...metadataLines] : []),
    ...(ngoAggregationLines.length && offerLines.length
      ? ['Graphiti NGO toplista (extra opciók):', ...ngoAggregationLines]
      : []),
    ...knowledgeLines,
    ...conversationLines,
    closing,
  ].join('\n');
}

interface MemoryContextHighlights {
  summary: string | null;
  highlightedPromotions: Array<{
    shop: string;
    ngo?: string;
    discount_percent?: number;
    scraped_at?: string;
    score?: number;
    score_details?: Record<string, unknown>;
  }>;
}

function formatMemoryContext(memoryContext: MemoryContextResponse): MemoryContextHighlights | null {
  const nodes = memoryContext.nodes || [];
  if (!nodes.length) {
    return null;
  }
  const lines: string[] = [];
  const promotions = nodes.filter(node => hasLabel(node, 'Promotion'));
  if (promotions.length) {
    lines.push('Promóciós emlékek:');
    lines.push(
      ...promotions.slice(0, 3).map(node => {
        const props = node.properties || {};
        const shop = (props.shop_slug || props.shop || props.promotion_id) as string | undefined;
        const ngo = props.ngo_slug as string | undefined;
        const discount = props.discount_percent as number | undefined;
        const scraped = formatTimestamp(props.scraped_at || props.timestamp || props.updated_at);
        const score = typeof node.score === 'number' ? ` score=${Math.round(node.score)}` : '';
        const ngoPart = ngo ? ` → ${ngo}` : '';
        const discountPart = typeof discount === 'number' ? ` (${discount}% kedvezmény)` : '';
        return `- ${shop || 'ismeretlen shop'}${ngoPart}${discountPart} ${scraped}${score}`.trim();
      }),
    );
  }
  const conversationTurns = nodes
    .filter(node => hasLabel(node, 'ConversationTurn'))
    .sort((a, b) => {
      const aTime = Date.parse((a.properties?.timestamp as string) || '');
      const bTime = Date.parse((b.properties?.timestamp as string) || '');
      return (isNaN(bTime) ? 0 : bTime) - (isNaN(aTime) ? 0 : aTime);
    });
  if (conversationTurns.length) {
    lines.push('Legutóbbi felhasználói üzenetek:');
    lines.push(
      ...conversationTurns.slice(0, 3).map(node => {
        const props = node.properties || {};
        const speaker = props.speaker || 'user';
        const content = (props.content as string | undefined)?.slice(0, 140) || '';
        const when = formatTimestamp(props.timestamp);
        return `- ${speaker}: ${content}${when ? ` (${when})` : ''}`.trim();
      }),
    );
  }
  const ngos = nodes.filter(node => hasLabel(node, 'NGO'));
  if (ngos.length) {
    const ngoList = ngos
      .slice(0, 3)
      .map(node => node.properties?.slug || node.properties?.name || node.id)
      .filter(Boolean)
      .join(', ');
    if (ngoList) {
      lines.push(`Kapcsolódó NGO-k: ${ngoList}`);
    }
  }
  if (memoryContext.relationships?.length) {
    const relLines = memoryContext.relationships.slice(0, 3).map(rel => `- ${rel.type}: ${rel.source} → ${rel.target}`);
    lines.push('Kapcsolatok:', ...relLines);
  }
  const summary = lines.length ? lines.join('\n') : null;
  const highlightedPromotions = promotions
    .filter(node => typeof node.score === 'number')
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 3)
    .map(node => {
      const props = node.properties || {};
      return {
        shop: String(props.shop_slug || props.promotion_id || 'ismeretlen'),
        ngo: props.ngo_slug ? String(props.ngo_slug) : undefined,
        discount_percent: typeof props.discount_percent === 'number' ? props.discount_percent : undefined,
        scraped_at: formatTimestamp(props.scraped_at || props.timestamp || props.updated_at) || undefined,
        score: node.score,
        score_details: node.score_details,
      };
    });
  return {
    summary,
    highlightedPromotions,
  };
}

function hasLabel(node: MemoryContextNode, label: string): boolean {
  return Array.isArray(node.labels) && node.labels.includes(label);
}

function formatTimestamp(value: unknown): string {
  if (!value || typeof value !== 'string') {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('hu-HU', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function buildNgoAggregationLines(aggregations: NgoPromotionAggregation[]): string[] {
  if (!aggregations.length) {
    return [];
  }
  return aggregations.map(ngo => {
    const discount =
      typeof ngo.avg_discount_percent === 'number'
        ? ` (~${ngo.avg_discount_percent}% átlag kedvezmény)`
        : '';
    const last = ngo.last_scraped_at ? `, utolsó frissítés: ${formatTimestamp(ngo.last_scraped_at)}` : '';
    const slug = ngo.ngo_slug;
    const cta = `CTA: https://app.sharity.hu/impactshop?ngo=${slug}&d1=${slug}`;
    return `- ${slug}: ${ngo.promotion_count} aktív promó${discount}${last}. ${cta}`;
  });
}

interface ImpiSummaryDependencies {
  fetchNgoAggregations?: (limit?: number) => Promise<NgoPromotionAggregation[]>;
}

export async function generateImpiSummary(
  options: GenerateOptions & { empathyCue?: string | null },
  deps: ImpiSummaryDependencies = {},
): Promise<{ text: string; model: string } | null> {
  const { userMessage, recommendation, empathyCue, snippet, memoryContext, profile } = options;

  // Videós támogatás: adjunk fix, egyszerű szöveget, ne LLM bulletlistát.
  if (recommendation.intent === 'video_support') {
    const first = recommendation.offers[0];
    const cta = first?.cta_url || VIDEO_SUPPORT_CTA;
    const ngo = first?.preferred_ngo_slug || VIDEO_SUPPORT_NGO_SLUG;
    const text = [
      'Nézz meg egy kampányvideót, és a lejátszás rögzíti az adományt a választott ügynek.',
      `Link: ${cta}`,
      `A támogatás a(z) ${ngo} javára könyvelődik, amint elindítod a videót. Nincs kuponkód, csak kattints a linkre és indítsd a lejátszást.`
    ].join('\n');
    return { text, model: 'fixed-video-support' };
  }

  const offers = recommendation.offers.slice(0, 5).map(offer => {
    const isVideo = offer.source === 'video_support';
    return {
      shop: offer.shop_name,
      slug: offer.shop_slug,
      source: offer.source,
      coupon_code: offer.coupon_code || null,
      cta_url: offer.cta_url || null,
      desc: offer.discount_label || offer.title || '',
      donation_huf: isVideo ? null : offer.estimated_donation_huf,
      donation_per_1000_huf: isVideo ? null : offer.donation_per_1000_huf,
      donation_mode: offer.donation_mode_label,
      ngo: offer.preferred_ngo_slug || offer.ngo || 'ImpactShop',
      preferred_ngo_slug: offer.preferred_ngo_slug || null,
      expires_at: offer.expires_at || null,
      impact_score: offer.impact_score,
    };
  });

  const conversationSnippet = snippet ?? (await getConversationSnippet(userMessage));
  const knowledgeSummary = conversationSnippet?.knowledge?.summary;
  const systemPrompt = [
    'Te Impi vagy, a Sharity AI asszisztense – barátságos, játékos, de fókuszált szurikáta.',
    '',
    'ADAT-SZABÁLYOK (szigorú):',
    '- Ha kapsz "Elérhető ajánlatok" JSON-t, kizárólag ebből dolgozz; ne találj ki kupont, shopot, linket vagy összeget.',
    '- Graphiti / toplista / memóriakontextus csak inspiráció: CTA, link vagy kupon kizárólag az "Elérhető ajánlatok" JSON `cta_url`/`coupon_code` mezőiből jöhet.',
    '- Linket kizárólag a `cta_url` mezőből adj meg (pontos másolással). Ne használj markdown link szintaxist (`[szöveg](link)`); írd ki a teljes URL-t "Link: https://..." formában. A válasz legyen rövid bekezdés (2–4 mondat), bullet nélkül.',
    '- Kuponkódot kizárólag a `coupon_code` mezőből adj meg; ha null, akkor írd: "kód nélkül".',
    '- Tilos leírni a "Fillout" szót bármilyen formában; az űrlapot csak "űrlap"-ként említsd.',
    '',
    'FŐ SZEREPED:',
    '- Segíts vásárlással adományozni (ImpactShop), videókkal támogatni, Win4Good/Impact Challenge kihívásokban részt venni, és Impact riportokat megérteni.',
    '- Mindig magyarul, tegezve válaszolj rövid bekezdésekben, legfeljebb 2–3 ajánlattal.',
    '- Minden ajánlatnál jelzed, hogyan lesz belőle adomány ("ha erről a linkről indulsz...").',
    '',
    'BESZÉLGETÉS-TÉRKÉP & FLOW-K:',
    '- Kulcsszavak alapján igazodj az "Impi beszélgetés térkép" flow-jaihoz (welcome, ask_preference, ask_product_intent, video_donation_start, show_leaderboard, show_impact, ask_feedback, stb.) és a knowledge-aliases.json szinonimáihoz.',
    '',
    'ÖT LÉPÉSES MÉRLEGELÉS (minden válasz előtt):',
    '1) Szituáció beazonosítása – foglald össze a szándékot és rendeld flow-hoz.',
    '2) Bizonyíték-gyűjtés – nézd át a tudásfájlokat és ajánlatokat; ha hiányos az adat, ne találj ki kupont.',
    '3) Súlyozás és döntés – szándék + emberi kényelem + NGO-hatás + átláthatóság + Sharity-elvek alapján válassz max. 2–3 opciót, indokold röviden.',
    `4) Transzparencia – jelezd a korlátokat, javasolj ${FRIENDLY_SUPPORT_FORM_LABEL}ot vagy Impact riportot, ha nincs konkrét ajánlat.`,
    '5) Konkrét CTA – minden válasz végén egyértelmű következő lépés, és mondd el, hogy a link használata rögzíti az adományt.',
    '',
    'STÍLUS & HATÁROK:',
    '- Empatikus nyitás, bátorító hang; nem adsz jogi/adótanácsot, nem Sharity témánál udvariasan visszaterelsz.',
    '- REST vagy wp-json kérésnél magyarázd el, melyik endpoint adja az adatot.',
    '- Jegyezd meg a korábbi preferenciákat és utalj vissza rájuk.',
    '- Zavaros kérésnél foglald össze, kérdezz vissza; etikátlan kérést udvariasan utasíts vissza.',
    '',
    'ÖSSZEFOGLALÁS: mindig azonosítsd a szándékot, ellenőrizd a tudást, súlyozz emberközelien, jelezd a korlátokat, adj CTA-t.'
  ].join('\n');

  const hasOffers = recommendation.offers.length > 0;
  const knowledgeBase = await getKnowledgeBaseSnippet();
  const KNOWLEDGE_MAX_CHARS = Number(process.env.IMPI_KNOWLEDGE_MAX_CHARS || '3000');
  const trimmedKnowledge =
    knowledgeBase && knowledgeBase.length > KNOWLEDGE_MAX_CHARS
      ? `${knowledgeBase.slice(
          0,
          knowledgeBase.lastIndexOf('.', KNOWLEDGE_MAX_CHARS) > 0
            ? knowledgeBase.lastIndexOf('.', KNOWLEDGE_MAX_CHARS) + 1
            : KNOWLEDGE_MAX_CHARS,
        )}...`
      : knowledgeBase;
  const ngoAggregationFetcher = deps.fetchNgoAggregations ?? fetchTopNgoPromotions;
  const ngoAggregations = await ngoAggregationFetcher(5);
  const offerMetadata = extractOfferContextMetadata(recommendation.offers, 5);
  const userPromptSections = [
    `Felhasználói kérés: ${userMessage || 'nincs megadva'}`,
    'Elérhető ajánlatok JSON formában:' + JSON.stringify(offers, null, 2),
  ];

  if (recommendation.intent === 'video_support') {
    userPromptSections.push(
      'Videós támogatás intent: NE írd le táblázatosan/mezőlistában a shop/kupon/NGO/Link mezőket, csak 2–3 mondatban foglald össze. NE írj összeget (adomány Ft), mert változó. A linket teljes URL-ként írd ki külön sorban: "Link: https://...".'
    );
  } else if (hasOffers) {
    userPromptSections.push(
      'Írj rövid választ (2–4 mondat), egy bekezdésben, bullet nélkül. Minden ajánlatnál szerepeljen: shop + ajánlat neve, kuponkód (vagy "kód nélkül"), adomány (ha ismert), NGO neve/slug és a CTA link teljes URL-lel ("Link: https://...").'
    );
  } else {
    userPromptSections.push(
      `Nincs releváns kupon. Adj rövid magyar összefoglalót (2–4 mondat), egy bekezdésben. Emeld ki ezt a sorrendet: ImpactShop kampány, videós támogatás (${VIDEO_SUPPORT_URL}), ${FRIENDLY_SUPPORT_FORM_LABEL} (${DEFAULT_FILLOUT_URL}), Impact riport (${IMPACT_REPORT_URL}). A linkeket teljes URL-lel, plain textben írd.`
    );
  }

  if (trimmedKnowledge) {
    userPromptSections.push('Impi tudásbázis kivonat (hivatkozz rá, ha releváns):\n' + trimmedKnowledge);
  }
  if (profile) {
    const profileLine = formatProfilePreferenceLine(profile);
    if (profileLine) {
      userPromptSections.push('Felhasználói profil: ' + profileLine);
    }
  }
  if (offerMetadata.length) {
    userPromptSections.push('Ajánlat metaadatok JSON:\n' + JSON.stringify(offerMetadata, null, 2));
  }
  if (conversationSnippet) {
    userPromptSections.push(`Beszélgetés térkép javaslat (${conversationSnippet.nodeId}):\n${conversationSnippet.text}`);
  }
  const formattedMemory = memoryContext ? formatMemoryContext(memoryContext) : null;
  if (formattedMemory?.summary) {
    userPromptSections.push('Graphiti memória kivonat:\n' + formattedMemory.summary);
  }
  if (formattedMemory?.highlightedPromotions.length) {
    const promoLines = formattedMemory.highlightedPromotions
      .map(promo => {
        const base = `${promo.shop}${promo.ngo ? ` → ${promo.ngo}` : ''}`;
        const discount = promo.discount_percent ? ` (${promo.discount_percent}% kedvezmény)` : '';
        const recency = promo.scraped_at ? ` • ${promo.scraped_at}` : '';
        return `- ${base}${discount}${recency} (Graphiti score ${promo.score ?? 'n/a'})`;
      })
      .join('\n');
    userPromptSections.push(
      'KÖTELEZŐ: hivatkozz a Graphiti által kiemelt promókra és jelezd, melyik NGO profitál belőlük:\n' + promoLines,
    );
    userPromptSections.push(
      'Graphiti promóciók JSON formában:\n' + JSON.stringify(formattedMemory.highlightedPromotions, null, 2),
    );
    if (!hasOffers) {
      userPromptSections.push('Nincs kupontalálat, de a Graphiti promóciókat kezeld ajánlatként és adj CTA-t mindegyikhez.');
    }
  }
  if (ngoAggregations.length) {
    const rows = buildNgoAggregationLines(ngoAggregations).join('\n');
    userPromptSections.push('Graphiti NGO toplista (CTA minden sorban kötelező):\n' + rows);
    userPromptSections.push('Graphiti NGO aggregáció JSON:\n' + JSON.stringify(ngoAggregations, null, 2));
    if (!hasOffers) {
      userPromptSections.push('Nincs kupon? Ezeket az NGO slugokat ajánld ImpactShop CTA-val, és magyarázd el a kedvezményt.');
    }
  }
  if (knowledgeSummary && !hasOffers) {
    userPromptSections.push('Elsődleges tudásbázis összefoglaló:\n' + knowledgeSummary);
  }

  // Opcionális webfallback (Google CSE) – ha engedélyezve van
  if (ENABLE_WEB_FALLBACK) {
    const webResults = await fetchWebSearchResults(userMessage, 3);
    if (webResults.length) {
      const lines = webResults
        .map(res => `- ${res.title} — ${res.snippet} (${res.link})`)
        .join('\n');
      userPromptSections.push('Webes ötletek (Google keresés):\n' + lines);
      await logImpiEvent({ message: userMessage, note: 'web_search', model: 'google_cse', results: webResults.slice(0, 3) });
    } else {
      await logImpiEvent({ message: userMessage, note: 'web_search', model: 'google_cse', results: [] });
    }
  }

  userPromptSections.push(
    'Nyelv: magyar. Kerüld a technikai szavakat (pl. "fallback"). Tilos leírni: "Fillout". Használj barátságos kifejezéseket: "űrlap", "link", "lépés". Legyen rövid bekezdés (2–4 mondat), bullet nélkül.',
  );

  if (userMessage && DECISION_PROMPT_KEYWORDS.some(keyword => userMessage.toLowerCase().includes(keyword))) {
    userPromptSections.push('KÖTELEZŐ: a válaszodban külön számozott pontokban mutasd be az 5 lépéses döntési folyamatot (1. Szituáció, 2. Információgyűjtés, 3. Súlyozás, 4. Transzparencia, 5. Akció/CTA), és adj konkrét példát is.');
  }

  if (recommendation.intent === 'category') {
    userPromptSections.push(
      `KÖTELEZŐ: legalább két konkrét NGO-t (slug + név) említs röviden, és jelezd, miért fontosak. A CTA mindig slug alapú ImpactShop vagy ${FRIENDLY_SUPPORT_FORM_LABEL} link legyen, egy bekezdésben.`,
    );
  }
  if (recommendation.intent === 'transparency' || recommendation.intent === 'no_shop') {
    userPromptSections.push(
      `KÖTELEZŐ: Ne ajánlj webshopot! Röviden mutasd az ImpactShop toplistát (${IMPACT_REPORT_URL}) és a REST endpointot (/wp-json/impactshop/v1/leaderboard), majd adj ${FRIENDLY_SUPPORT_FORM_LABEL} linket (${DEFAULT_FILLOUT_URL}) a visszajelzéshez. Egy bekezdés, technikai szavak nélkül.`,
    );
  }
  if (recommendation.intent === 'video_support') {
    userPromptSections.push(
      `KÖTELEZŐ: röviden írd le a videós támogatást és adj konkrét videós CTA-t: ${VIDEO_SUPPORT_URL}. Adj legalább egy NGO slugot (pl. ${VIDEO_SUPPORT_NGO_SLUG}) és ImpactShop linket slug paraméterrel, hogy hova könyvelődik az adomány. Egy bekezdés, technikai kifejezések nélkül.`,
    );
  }
  if (recommendation.intent === 'leaderboard') {
    userPromptSections.push('KÖTELEZŐ: említsd a ranglista URL-t (`/wp-json/impactshop/v1/leaderboard` + ImpactShop toplista) és motiváld a felhasználót a következő lépésre, rövid bekezdésben.');
  }
  if (recommendation.intent === 'feedback') {
    userPromptSections.push(
      `KÖTELEZŐ: magyarázd el, mennyi idő a könyvelés, kérd el a rendelés azonosítóját, és adj "hibabejelentő űrlap" linket (${FRIENDLY_SUPPORT_FORM_CTA}) bátorító, rövid szöveggel. Kerüld a technikai szavakat.`,
    );
  }
  if (recommendation.intent === 'impact_data') {
    userPromptSections.push('KÖTELEZŐ: magyarázd el, hol érhető el az Impact riport + REST endpointok (`/wp-json/impactshop/v1/leaderboard`), és hogyan kérhet CSV/exportot. Ne ajánlj webshopot.');
  }
  if (recommendation.intent === 'referral') {
    userPromptSections.push('KÖTELEZŐ: írd le, hogyan osztható meg az NGO kártya/link (`https://app.sharity.hu/impactshop?ngo=<slug>&d1=<slug>`), és hogyan rögzül a ranglistán.');
  }
  if (recommendation.intent === 'high_impact') {
    userPromptSections.push('KÖTELEZŐ: emeld ki, mely shopok adják most a legnagyobb jutalékot, és adj slugos CTA-t + adomány mértéket rövid bekezdésben.');
  }
  if (recommendation.intent === 'coupon_only') {
    userPromptSections.push('KÖTELEZŐ: kizárólag a kupon/kedvezmény részleteit írd le (kód, feltételek, hivatkozás). Tilos NGO-t vagy adományt említeni – fókusz a kuponinformáción.');
  }
  if (recommendation.intent === 'wrong_expectation') {
    userPromptSections.push(
      `KÖTELEZŐ: magyarázd el, hogy a vásárlásból jutalék képződik (3–7%), nem a teljes összeg megy át. Adj egyszerű példát és javasolj ${FRIENDLY_SUPPORT_FORM_LABEL} linket a pontos rögzítéshez.`,
    );
  }
  if (empathyCue) {
    userPromptSections.push(
      `Empatikus nyitás szükséges: ${empathyCue}. Adj bíztató mondatot, és említs legalább 3 low-effort opciót egy rövid bekezdésben (videós támogatás: ${VIDEO_SUPPORT_URL}, kis összegű vásárlás konkrét példával, ${FRIENDLY_SUPPORT_FORM_LABEL} inspiráció: ${DEFAULT_FILLOUT_URL}). Minden opcióhoz legyen CTA/link, bullet nélkül.`,
    );
  }

  const userPrompt = userPromptSections.join('\n\n');

  if (!client) {
    const fallback = buildLocalSummary(userMessage, recommendation, conversationSnippet, ngoAggregations, profile);
    return { text: fallback, model: 'local-fallback' };
  }

  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: getTemperatureForIntent(recommendation.intent),
      max_tokens: getMaxTokensForIntent(recommendation.intent),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    const text = completion.choices?.[0]?.message?.content;
    if (!text) {
      const fallback = buildLocalSummary(userMessage, recommendation, conversationSnippet, ngoAggregations);
      return { text: fallback, model: 'local-fallback' };
    }

    const sentenceCount = (text.match(/[.!?]+/g) || []).length;
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const hasLink = /https?:\/\//i.test(text) || /link:/i.test(text);
    const hasKupon = /kupon|kód|kod/i.test(text);
    const hasCta = hasLink || hasKupon;
    const isShoppingIntent =
      !recommendation.intent || recommendation.intent === 'coupon_only' || recommendation.intent === 'high_impact';

    if (isShoppingIntent && (sentenceCount < 2 || !hasCta || wordCount < 20)) {
      const expandPrompt = [
        'A válaszod túl rövid volt. Kérlek, bővítsd ki így:',
        '1) Röviden magyarázd el, hogyan lesz belőle adomány.',
        '2) Világosan add meg a linket/kuponkódot.',
        '3) Legalább 2-3 mondatban válaszolj.',
        `Eredeti válaszod: "${text}"`,
      ].join('\n');
      try {
        const retry = await client.chat.completions.create({
          model,
          temperature: Math.min(getTemperatureForIntent(recommendation.intent) + 0.05, 0.7),
          max_tokens: getMaxTokensForIntent(recommendation.intent),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
            { role: 'assistant', content: text },
            { role: 'user', content: expandPrompt },
          ],
        });
        const expanded = retry.choices?.[0]?.message?.content;
        if (expanded && expanded.length > text.length) {
          return { text: expanded, model: `${model}-expanded` };
        }
      } catch (retryErr) {
        console.warn('Impi response expand retry failed', retryErr);
      }
    }

    return { text, model };
  } catch (err) {
    console.error('OpenAI Impi summary failed', err);
    const fallback = buildLocalSummary(userMessage, recommendation, conversationSnippet, [], profile);
    return { text: fallback, model: 'local-fallback' };
  }
}

function formatProfilePreferenceLine(profile?: ProfilePreference): string | null {
  if (!profile) {
    return null;
  }
  const parts: string[] = [];
  if (profile.preferredNgo) {
    parts.push(`kedvenc NGO: ${profile.preferredNgo}`);
  }
  if (profile.preferredCategory) {
    parts.push(`kedvenc kategória: ${profile.preferredCategory}`);
  }
  if (profile.lastDonationAt) {
    parts.push(`utolsó adomány: ${profile.lastDonationAt}`);
  }
  if (!parts.length) {
    return null;
  }
  return `Profil preferenciák → ${parts.join(', ')}`;
}
