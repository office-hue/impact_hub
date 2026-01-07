import { lookupImpact, resolveReliabilitySeed, buildGoLink, getTopImpactEntries } from './impact-data.js';
import { loadSourceSnapshots } from '../snapshots.js';
import type { NormalizedCoupon } from '../sources/types.js';
import { getNgoCategory, matchNgoCategory, type NgoCategoryMatch } from './ngo-categories.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const keywordSynonyms = require('../../../../data/keyword-synonyms.json') as Record<string, string[]>;
import type { ReliabilityLabel } from '../services/reliability.js';

export interface ProfilePreference {
  preferredNgo?: string;
  preferredCategory?: string;
  lastDonationAt?: string;
}

export interface OfferContextMetadata {
  shop_slug: string;
  source_variant?: string;
  scraped_at?: string;
  merchant_priority?: number;
  reliability_score?: number;
}

interface RecommendInput {
  query: string;
  limit?: number;
  budget_huf?: number;
  ngo_preference?: string;
  /**
   * Multi-turn follow-upnál kihagyhatjuk a kategória match shortcutot,
   * így a második kör valódi shop ajánlatokat tud mutatni.
   */
  skip_category_match?: boolean;
  profile_preference?: ProfilePreference;
}

export interface RecommendationOffer extends NormalizedCoupon {
  discount_score: number;
  donation_rate: number;
  estimated_donation_huf: number;
  price_huf?: number;
  donation_per_1000_huf: number;
  donation_mode: DonationMode;
  donation_mode_label: string;
  fillout_url?: string;
  reliability: number;
  reliability_label: ReliabilityLabel;
  reliability_score: number;
  impact_score: number;
  ngo?: string;
  cta_url?: string;
  cta_label?: string;
  preferred_ngo_slug?: string;
  keyword_score: number;
  source_variant?: string;
  merchant_priority?: number;
  score_breakdown?: {
    discount_score: number;
    donation_score: number;
    reliability_score: number;
    keyword_score: number;
    profile_boost: number;
    budget_boost: number;
    total_impact_score: number;
  };
}

type DonationMode = 'legend' | 'rising' | 'base';

export interface RecommendationResponse {
  persona: 'Impi';
  summary: string;
  offers: RecommendationOffer[];
  query: string;
  preferred_ngo_slug?: string;
  intent?: string;
  intent_confidence?: number;
  intent_matched_keywords?: string[];
  category_id?: string;
  warnings?: string[];
  cleanup_candidates?: ReliabilityCleanupCandidate[];
  context_metadata?: OfferContextMetadata[];
  performance?: PerformanceMetrics;
}

export interface PerformanceMetrics {
  total_ms: number;
  reliability_batch_ms?: number;
  scoring_loop_ms?: number;
  sorting_ms?: number;
  offer_count?: number;
}

export interface ReliabilityCleanupCandidate {
  slug: string;
  shop_name?: string;
  reliability: number;
}

function isManualSource(source?: string | null): boolean {
  return source === 'manual_csv' || source === 'manual';
}

function parseBudget(queryBudget?: number, fallback = 25000): number {
  if (!queryBudget || Number.isNaN(queryBudget) || queryBudget <= 0) {
    return fallback;
  }
  return Math.min(queryBudget, 200000);
}

function classifyDonationMode(rate: number): DonationMode {
  if (rate >= 0.07) {
    return 'legend';
  }
  if (rate >= 0.05) {
    return 'rising';
  }
  return 'base';
}

function donationModeLabel(mode: DonationMode): string {
  switch (mode) {
    case 'legend':
      return 'Legend Mode';
    case 'rising':
      return 'Rising Mode';
    default:
      return 'Base Mode';
  }
}

function donationPerThousand(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) {
    return 0;
  }
  return Math.max(1, Math.round(rate * 1000));
}

function hasKnownDonation(rate: number | undefined): boolean {
  return Number.isFinite(rate) && (rate ?? 0) > 0;
}

function classifyReliability(score: number): ReliabilityLabel {
  if (score >= 0.75) {
    return 'super';
  }
  if (score >= 0.5) {
    return 'stable';
  }
  return 'risky';
}

function sanitizeSlug(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || undefined;
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function isCategoryCompatible(query: string, category?: string | null): boolean {
  if (!category) {
    return true;
  }
  const cat = category.toLowerCase();
  const applianceKeywords = [
    'huto',
    'hűtő',
    'hűtőszekrény',
    'fagyaszt',
    'mosogató',
    'mosogat',
    'mosógép',
    'mosogep',
    'sütő',
    'sutő',
    'tűzhely',
    'tuzhely',
    'mikro',
    'konyhai',
    'háztartási',
    'haztartasi',
    'kitchenaid',
    'hűtőgép',
    'boiler',
    'klíma',
    'klima',
    'hűsítő',
    'hűt',
  ];
  const applianceQuery = applianceKeywords.some(hint => query.includes(hint));
  if (applianceQuery) {
    const allowedForAppliance = ['electronics', 'tech', 'appliance', 'home', 'otthon', 'haztartas', 'butor', 'bútor'];
    return allowedForAppliance.some(allowed => cat.includes(allowed));
  }
  return true;
}

function normalizePriceCandidate(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value === 'string') {
    const digits = value.replace(/[^0-9]/g, '');
    if (digits.length >= 3) {
      const parsed = Number(digits);
      if (!Number.isNaN(parsed) && parsed > 0) {
        return Math.round(parsed);
      }
    }
  }
  return undefined;
}

function extractPrice(record: NormalizedCoupon): number | undefined {
  const raw = record.raw || {};
  const candidateFields = [
    (record as unknown as { price_huf?: number }).price_huf,
    raw.price_huf,
    raw.product_price_huf,
    raw.item_price_huf,
    raw.deal_price_huf,
    raw.price,
    raw.product_price,
    raw.offer_price,
    raw.item_price,
  ];

  for (const candidate of candidateFields) {
    const price = normalizePriceCandidate(candidate);
    if (price) {
      return price;
    }
  }

  return undefined;
}

function parseDiscount(label?: string, title?: string): number {
  const source = (label || title || '').toLowerCase();
  const percentMatch = source.match(/(\d{1,2})(?:\s*%)/);
  if (percentMatch) {
    return Number(percentMatch[1]);
  }
  const amountMatch = source.match(/(\d{3,6})\s*(?:ft|forint|huf)/);
  if (amountMatch) {
    return Math.round(Number(amountMatch[1]) / 100);
  }
  return 5;
}

function tokenize(query: string): string[] {
  const tokens = normalizeForMatch(query)
    .split(/[^a-z0-9]+/)
    .filter(token => token.length >= 3);

  const expanded = new Set(tokens);
  for (const token of tokens) {
    const synonyms = (keywordSynonyms as Record<string, string[]>)[token];
    if (synonyms) {
      synonyms.forEach(s => expanded.add(normalizeForMatch(s)));
    }
  }
  return Array.from(expanded);
}

function levenshteinDistance(a: string, b: string): number {
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  const prev: number[] = Array.from({ length: bLen + 1 }, (_, idx) => idx);
  const curr: number[] = new Array(bLen + 1).fill(0);

  for (let i = 0; i < aLen; i++) {
    curr[0] = i + 1;
    for (let j = 0; j < bLen; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      curr[j + 1] = Math.min(
        prev[j + 1] + 1, // deletion
        curr[j] + 1, // insertion
        prev[j] + cost, // substitution
      );
    }
    for (let j = 0; j <= bLen; j++) {
      prev[j] = curr[j];
    }
  }
  return prev[bLen];
}

function fuzzyMatch(needle: string, haystack: string, maxDistance = 2): boolean {
  if (!needle || !haystack) {
    return false;
  }
  if (haystack.includes(needle)) {
    return true;
  }
  const tokens = haystack.split(/\s+/);
  for (const token of tokens) {
    if (Math.abs(token.length - needle.length) > maxDistance) {
      continue;
    }
    if (levenshteinDistance(token, needle) <= maxDistance) {
      return true;
    }
  }
  return false;
}

function computeBudgetBoost(priceHuf: number | undefined, budget: number | undefined): number {
  if (!priceHuf || !budget || budget <= 0) {
    return 0;
  }
  const ratio = priceHuf / budget;
  if (ratio >= 0.5 && ratio <= 1.2) {
    return 0.2;
  }
  if (ratio > 1.2 && ratio <= 1.5) {
    return 0.05;
  }
  if (ratio > 1.5 && ratio <= 2) {
    return 0.02;
  }
  return 0;
}

function keywordHitScore(coupon: NormalizedCoupon, keywords: string[]): number {
  if (!keywords.length) {
    return 0;
  }
  const fuzzySafe = (needle: string, haystack: string, strict = false): boolean => {
    const nLen = needle.length;
    const hLen = haystack.length;
    if (strict && (nLen < 4 || hLen < 4)) {
      return false;
    }
    const distance = strict ? 1 : 2;
    return fuzzyMatch(needle, haystack, distance);
  };

  const sourceWeight =
    coupon.source === 'manual' || coupon.source === 'manual_csv'
      ? 1.2
      : coupon.source === 'impact-table'
        ? 1.1
        : coupon.source === 'api'
          ? 0.9
          : 1.0;

  const normalizeTokens = (value?: string | null) =>
    normalizeForMatch(String(value || ''))
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean);

  const titleTokens = normalizeTokens(coupon.title);
  const descTokens = normalizeTokens(coupon.description);
  const shopTokens = normalizeTokens(`${coupon.shop_slug} ${coupon.shop_name}`);
  const categoryTokens = normalizeTokens(
    (coupon as any).raw?.category || (coupon as any).category,
  );
  const normalizedKeywords = keywords.map(k =>
    normalizeForMatch(k).replace(/[^a-z0-9]+/g, ' ').trim(),
  );

  let rawScore = 0;
  let titleHits = 0;
  let descHits = 0;
  let shopHits = 0;
  let categoryHits = 0;
  for (const kw of normalizedKeywords) {
    const exactInTitle = titleTokens.some(t => t === kw);
    const exactInDesc = descTokens.some(t => t === kw);
    const exactInShop = shopTokens.some(t => t === kw);
    const exactInCategory = categoryTokens.some(t => t === kw);

    if (exactInTitle) {
      titleHits += 1;
      rawScore += 12; // erősítsük a title-egyezést
      continue;
    }
    if (exactInDesc) {
      descHits += 1;
      rawScore += 8;
      continue;
    }
    if (exactInShop) {
      shopHits += 1;
      rawScore += 4;
      continue;
    }
    if (exactInCategory) {
      categoryHits += 1;
      rawScore += 3;
      continue;
    }

    const fuzzyInTitle = titleTokens.some(t => fuzzySafe(kw, t, true));
    const fuzzyInDesc = descTokens.some(t => fuzzySafe(kw, t, true));
    const fuzzyInShop = shopTokens.some(t => fuzzySafe(kw, t, true));
    const fuzzyInCategory = categoryTokens.some(t => fuzzySafe(kw, t));

    if (fuzzyInTitle) {
      titleHits += 1;
      rawScore += 6;
      continue;
    }
    if (fuzzyInDesc) {
      descHits += 1;
      rawScore += 3;
      continue;
    }
    if (fuzzyInShop || fuzzyInCategory) {
      if (fuzzyInShop) {
        shopHits += 1;
      }
      if (fuzzyInCategory) {
        categoryHits += 1;
      }
      rawScore += 1;
    }
  }

  if (rawScore === 0) {
    return 0;
  }

  const hasPrimaryHits = titleHits + descHits > 0;
  if (!hasPrimaryHits && (shopHits + categoryHits) > 0) {
    // Ha csak shop/category match van, vegyük vissza, hogy irreleváns ne csússzon át
    rawScore *= 0.45;
  }
  if (hasPrimaryHits) {
    rawScore += 2 * (titleHits + descHits); // kis extra boost a valódi relevanciára
  }

  const denom = Math.max(1, normalizedKeywords.length * 12);
  const normalized = (rawScore / denom) * sourceWeight;
  if (!hasPrimaryHits) {
    return Math.min(0.2, normalized); // ha nincs title/desc találat, ne kapjon nagy pontot
  }
  return Math.min(1, normalized);
}

function formatSummary(top: RecommendationOffer[]): string {
  if (!top.length) {
    return 'Most nem találtam releváns kupont, de jelezd újra és vadászok tovább.';
  }
  const first = top[0];
  const ngo = first.ngo ? `a ${first.ngo} ügyet` : 'az ImpactShop alapot';
    if (first.price_huf && first.estimated_donation_huf) {
      const ngoPart = `egy ${first.price_huf.toLocaleString('hu-HU')} Ft-os vásárlásból kb. ${first.estimated_donation_huf.toLocaleString('hu-HU')} Ft érkezik ${ngo} támogatására`;
      return `Impi szerint most a ${first.shop_name} ajánlata a legerősebb: ${first.discount_label || first.title || 'kupon'} – ${ngoPart}. Nézd meg a további tippeket is!`;
    }

  const perThousand = hasKnownDonation(first.donation_rate) ? first.donation_per_1000_huf : 0;
  const ngoPart =
    perThousand && perThousand > 0
      ? `minden 1 000 Ft költés után kb. ${perThousand.toLocaleString('hu-HU')} Ft érkezik ${ngo} támogatására (${first.donation_mode_label})`
      : `innen biztosan jó helyre mennek a jutalékok (összeg nem becsülhető)`;
  return `Impi szerint most a ${first.shop_name} ajánlata a legerősebb: ${first.discount_label || first.title || 'kupon'} – ${ngoPart}. Nézd meg a további tippeket is!`;
}

export async function recommendCoupons(input: RecommendInput): Promise<RecommendationResponse> {
  const perfStart = Date.now();
  const performance: PerformanceMetrics = {
    total_ms: 0,
  };
  const query = input.query?.trim() || 'akció';
  const limit = input.limit ?? 3;
  const budget = parseBudget(input.budget_huf);
  const keywords = tokenize(query);
  const lowerKeywords = keywords.map(k => k.toLowerCase());
  const profilePreference = input.profile_preference;
  const preferredNgoSlug = sanitizeSlug(input.ngo_preference) || sanitizeSlug(profilePreference?.preferredNgo);
  const lowerQuery = query.toLowerCase();
  const couponHints = ['kupon', 'akció', 'sportcip', 'sportcipo', 'notino', 'parfums', 'parfüm', 'kifli', 'szupermarket', 'illat'];
  const hasCouponHint = couponHints.some(hint => lowerQuery.includes(hint));
  const shoppingLike =
    hasCouponHint
    || lowerQuery.includes('kedvezm')
    || lowerQuery.includes('vásár')
    || lowerQuery.includes('vasar')
    || lowerQuery.includes('bolt')
    || lowerQuery.includes('áruház')
    || lowerQuery.includes('aruhaz');
  const intentResult = detectHighLevelIntent(query);
  const protectedIntents: HighLevelIntent[] = ['video_support', 'transparency', 'feedback', 'leaderboard', 'impact_data'];
  const isProtected = intentResult.intent && protectedIntents.includes(intentResult.intent);
  let detectedIntent = isProtected ? intentResult.intent : shoppingLike ? null : intentResult.intent;
  if (intentResult.intent && intentResult.confidence > 0 && intentResult.confidence < 0.5) {
    console.warn(`Low confidence intent: ${intentResult.intent} (${intentResult.confidence.toFixed(2)})`);
  }
  if (detectedIntent === 'unsafe_request' && shoppingLike) {
    detectedIntent = null;
  }
  if (detectedIntent === 'video_support') {
    const videoOffer = buildVideoSupportOffer(preferredNgoSlug);
    const offers = [videoOffer];
    return {
      persona: 'Impi',
      summary: summarizeVideoSupport(videoOffer),
      offers,
      query,
      preferred_ngo_slug: videoOffer.preferred_ngo_slug,
      intent: detectedIntent,
      intent_confidence: intentResult.confidence,
      intent_matched_keywords: intentResult.matched,
      context_metadata: buildContextMetadataFromOffers(offers),
    };
  }
  if (detectedIntent === 'high_impact') {
    const offers = buildHighImpactOffers(limit);
    return {
      persona: 'Impi',
      summary: summarizeHighImpactOffers(),
      offers,
      query,
      preferred_ngo_slug: preferredNgoSlug,
      intent: detectedIntent,
    };
  }
  const suppressIntent = detectedIntent ? SUPPRESS_OFFERS_INTENTS.includes(detectedIntent as HighLevelIntent) : false;
  const forceSuppression =
    detectedIntent &&
    (detectedIntent === 'transparency' ||
      detectedIntent === 'feedback' ||
      detectedIntent === 'leaderboard' ||
      detectedIntent === 'impact_data');
  if (suppressIntent && (!shoppingLike || forceSuppression)) {
    const intentValue = detectedIntent as HighLevelIntent;
    const suppressedOffers =
      intentValue === 'transparency'
        ? buildTransparencyOffers(preferredNgoSlug)
        : intentValue === 'feedback'
          ? buildFeedbackOffers(preferredNgoSlug)
          : intentValue === 'leaderboard'
            ? buildLeaderboardOffers(preferredNgoSlug)
            : [];
    return {
      persona: 'Impi',
      summary: summarizeSuppressedIntent(intentValue),
      offers: suppressedOffers,
      query,
      preferred_ngo_slug: preferredNgoSlug,
      intent: intentValue,
      intent_confidence: intentResult.confidence,
      intent_matched_keywords: intentResult.matched,
    };
  }
  const skipCategory =
    input.skip_category_match ||
    hasCouponHint ||
    shoppingLike ||
    (detectedIntent as HighLevelIntent | null) === 'video_support' ||
    suppressIntent ||
    detectedIntent === 'feedback' ||
    detectedIntent === 'transparency';
  const categoryMatch = skipCategory ? null : await matchNgoCategory(query);
  const snapshots = await loadSourceSnapshots();
  const allRecords = snapshots.flatMap(snapshot => snapshot.records.map(record => ({ ...record, source: record.source || snapshot.id })));
  // Partner whitelist: minden nem-Gmail forrás shop_slug-je bekerül, Gmailből csak akkor engedünk,
  // ha a slug már létezik partnerként (Dognet/CJ/Árukereső/manual).
  const partnerSlugs = new Set<string>();
  const partnerImpact = new Set<string>();
  snapshots.forEach(snapshot => {
    if (snapshot.id === 'gmail_structured') {
      return;
    }
    snapshot.records.forEach(r => {
      if (r.shop_slug) {
        partnerSlugs.add(r.shop_slug.toLowerCase());
        const impactEntry = lookupImpact(r.shop_slug);
        if (impactEntry?.ngo) {
          partnerImpact.add(r.shop_slug.toLowerCase());
        }
      }
    });
  });

  // Batch reliability lookup per shop_slug to avoid sequential awaits for every record
  const uniqueShopSlugs = [...new Set(allRecords.map(record => record.shop_slug).filter(Boolean))];
  const reliabilityMap = new Map<string, number>();
  const expiryPenaltyMap = new Map<string, number>();
  const reliabilityStart = Date.now();
  await Promise.all(
    uniqueShopSlugs.map(async slug => {
      try {
        const reliability = await resolveReliabilitySeed({ shop_slug: slug } as NormalizedCoupon);
        reliabilityMap.set(slug, reliability);
      } catch {
        reliabilityMap.set(slug, 0.5);
      }
    }),
  );
  performance.reliability_batch_ms = Date.now() - reliabilityStart;

  const offers: RecommendationOffer[] = [];
  const scoringStart = Date.now();
    for (const record of allRecords) {
        const slug = (record.shop_slug || '').trim();
        const code = (record.coupon_code || '').trim();
        if (!slug || /needs_mapping/i.test(slug) || /needs_mapping/i.test(record.title || '') || /doctype/i.test(code)) {
            continue; // skip kétes vagy hiányos ajánlatok
        }
    const isGmail = record.source === 'gmail_structured';
    const slugLower = slug.toLowerCase();
    if (isGmail && !partnerSlugs.has(slugLower)) {
      continue; // Gmailből csak whitelistelt (partner) shop mehet át
    }
    if (slugLower === 'unknown') {
      continue;
    }
    let expiryPenalty = 1;
    if (record.expires_at) {
      const expiresDate = new Date(record.expires_at);
      const now = new Date();
      if (expiresDate < now) {
        continue; // skip expired offers
      }
      const daysUntilExpiry = Math.floor((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry <= 1) {
        expiryPenalty = 0.5;
      } else if (daysUntilExpiry <= 3) {
        expiryPenalty = 0.7;
      } else if (daysUntilExpiry <= 7) {
        expiryPenalty = 0.9;
      }
    }
    const discountScore = parseDiscount(record.discount_label, record.title);
        const impactEntry = lookupImpact(record.shop_slug);
        const isCjSource = record.source === 'cj';
        const donationRate = impactEntry?.donation_rate ?? 0;
        const hasImpact = Boolean(impactEntry?.ngo) || (isCjSource && donationRate > 0);
        const selectedCategory = impactEntry?.category || record.category;
        if (!isCategoryCompatible(lowerQuery, selectedCategory)) {
          continue;
        }
    const donationMode = classifyDonationMode(donationRate);
    const perThousand = donationPerThousand(donationRate);
    const priceHuf = extractPrice(record);
    const reliabilityBase = reliabilityMap.get(slug) ?? 0.5;
    const reliability = reliabilityBase * expiryPenalty;
    const reliabilityLabel = classifyReliability(reliability);
    let keywordScore = keywordHitScore(record, keywords);
    keywordScore += computeBudgetBoost(priceHuf, budget);
    if (keywordScore > 1) {
      keywordScore = 1;
    }
    const estimatedDonation = hasKnownDonation(donationRate) && priceHuf ? Math.round(priceHuf * donationRate) : 0;
    // Ha nincs impact adat (nem partner), dobjuk a rekordot
    if (!hasImpact) {
      continue;
    }
    // Reliability küszöb: alacsony megbízhatóságú ajánlatokat ne küldjünk ki
    if (reliability < 0.6) {
      continue;
    }
        // Erősítsük az explicit shop kéréseket (pl. "akkuk", "aboutyou"):
        // ha a query tartalmazza a slugot vagy a shop nevét, kapjon nagy boostot,
        // hogy a kérés szerinti partner kerüljön előre.
        const normalizedQueryLocal = normalizeForMatch(lowerQuery).replace(/[^a-z0-9]+/g, ' ');
        const normalizedQueryCompact = normalizedQueryLocal.replace(/\s+/g, '');
        const normalizedSlug = normalizeForMatch(slug).replace(/[^a-z0-9]+/g, '');
        const normalizedShopName = record.shop_name
          ? normalizeForMatch(record.shop_name).replace(/[^a-z0-9]+/g, '')
          : '';
        const hasExplicitSlugMatch =
          lowerQuery.includes(slug.toLowerCase()) ||
          normalizedQueryLocal.includes(normalizedSlug) ||
          normalizedQueryCompact.includes(normalizedSlug) ||
          (normalizedShopName &&
            (normalizedQueryLocal.includes(normalizedShopName) || normalizedQueryCompact.includes(normalizedShopName)));
        const explicitSlugBoost = hasExplicitSlugMatch ? 200 : 0;

        const baseImpactScore = Number(
          (discountScore + donationRate * 100 + reliability * 20 + keywordScore + explicitSlugBoost).toFixed(2),
        );
    const impactScore = applyProfileBoost(baseImpactScore, record, profilePreference);
        const selectedNgo =
          preferredNgoSlug ||
          sanitizeSlug(impactEntry?.ngo_slug) ||
          sanitizeSlug(impactEntry?.ngo) ||
          'impactshop';
        const goLinkWithSelection = selectedNgo ? buildGoLink(record.shop_slug, selectedNgo) : undefined;
        const defaultGoLink =
          impactEntry?.ngo || impactEntry?.ngo_slug
            ? buildGoLink(record.shop_slug, sanitizeSlug(impactEntry?.ngo_slug || impactEntry?.ngo))
            : undefined;
    const ctaUrl = goLinkWithSelection || defaultGoLink || record.cta_url;
    if (!ctaUrl) {
      continue; // nincs megbízható CTA, inkább kihagyjuk
    }
    const ctaLabel = 'Támogatást választok';

    if (keywords.length) {
      const haystack = normalizeForMatch(`${record.shop_slug} ${record.shop_name} ${record.title ?? ''} ${record.description ?? ''}`);
      const hasKeywordHit = keywords.some(keyword => fuzzyMatch(keyword, haystack));
      if (!hasKeywordHit && keywordScore < 0.3) {
        if (offers.length === 0 && (record.source === 'manual_csv' || record.source === 'manual')) {
          // egyetlen fallback esetén engedjük, hogy legyen valami ajánlat
        } else {
          continue;
        }
      }
    }

    offers.push({
      ...record,
      discount_score: discountScore,
      donation_rate: donationRate,
      estimated_donation_huf: estimatedDonation,
      price_huf: priceHuf,
      donation_per_1000_huf: perThousand,
      donation_mode: donationMode,
      donation_mode_label: donationModeLabel(donationMode),
      reliability,
      reliability_label: reliabilityLabel,
      reliability_score: reliability,
      impact_score: impactScore,
      ngo: impactEntry?.ngo,
      cta_url: ctaUrl,
      cta_label: ctaLabel,
      preferred_ngo_slug: selectedNgo,
      keyword_score: keywordScore,
      source_variant: resolveSourceVariant(record),
      merchant_priority: extractMerchantPriority(record),
      score_breakdown:
        process.env.IMPI_DEBUG_SCORING === '1'
          ? {
              discount_score: discountScore,
              donation_score: donationRate * 100,
              reliability_score: reliability * 20,
              keyword_score: keywordScore,
              profile_boost: impactScore - baseImpactScore,
              budget_boost: computeBudgetBoost(priceHuf, budget),
              total_impact_score: impactScore,
            }
          : undefined,
    });
  }
  performance.scoring_loop_ms = Date.now() - scoringStart;

  const sourcePriority = (offer: RecommendationOffer): number => {
    if (isManualSource(offer.source)) {
      return 200;
    }
    if (offer.source === 'gmail_structured') {
      return 80;
    }
    if (offer.source === 'harvester_bridge' || offer.source === 'arukereso_playwright') {
      return 60;
    }
    return 0;
  };

  const sortingStart = Date.now();
  const sorted = offers.sort((a, b) => {
    const sourceDiff = sourcePriority(b) - sourcePriority(a);
    if (sourceDiff !== 0) {
      return sourceDiff;
    }
    const keywordDiff = (b.keyword_score || 0) - (a.keyword_score || 0);
    if (keywordDiff !== 0) {
      return keywordDiff;
    }
    return b.impact_score - a.impact_score;
  });
  let filtered = sorted;
  performance.sorting_ms = Date.now() - sortingStart;
  if (keywords.length) {
    const keywordMatches = sorted.filter(offer => offer.keyword_score > 0);
    filtered = keywordMatches.length ? keywordMatches : sorted;
  }
  if (filtered.length === 0 && categoryMatch) {
    const offers = buildCategoryOffers(categoryMatch, preferredNgoSlug);
    const sliced = offers.slice(0, limit);
    return {
      persona: 'Impi',
      summary: summarizeCategoryIntent(categoryMatch),
      offers: sliced,
      query,
      preferred_ngo_slug: preferredNgoSlug,
      intent: 'category',
      category_id: categoryMatch.category.id,
      context_metadata: buildContextMetadataFromOffers(sliced),
    };
  }
  const explicitShopSlugs: string[] = [];
  const allShopSlugs = new Set(filtered.map(offer => offer.shop_slug.toLowerCase()));
  const normalizedQuery = normalizeForMatch(lowerQuery).replace(/[^a-z0-9]+/g, ' ');
  const normalizedQueryTight = normalizedQuery.replace(/\s+/g, '');
  allShopSlugs.forEach(slug => {
    if (lowerQuery.includes(slug)) {
      explicitShopSlugs.push(slug);
    }
  });
  // If the user a shop name (nem csak slug) írta, toljuk előre azt is
  filtered.forEach(offer => {
    const normalizedName = offer.shop_name
      ? normalizeForMatch(offer.shop_name).replace(/[^a-z0-9]+/g, '')
      : '';
    if (
      normalizedName &&
      (normalizedQuery.includes(normalizedName) || normalizedQueryTight.includes(normalizedName))
    ) {
      explicitShopSlugs.push(offer.shop_slug.toLowerCase());
    }
  });
  if (explicitShopSlugs.length) {
    const unique = [...new Set(explicitShopSlugs)];
    const explicit = filtered.filter(offer => unique.includes(offer.shop_slug));
    if (explicit.length) {
      const rest = filtered.filter(offer => !unique.includes(offer.shop_slug));
      filtered = [...explicit, ...rest];
    }
  }
  const manualHintKeywords = [
    'sport30k',
    'sportcip',
    'sportcipo',
    'decathlon',
    'notino',
    'illat',
    'parfums',
    'parfüm',
    'parfum',
    'kifli',
    'szupermarket',
    'sport',
    'edzes',
    'edzés',
    'futas',
    'futás',
    'tura',
    'túra',
    'ruha',
    'divat',
    'cipő',
    'cipo',
    'szepseg',
    'szépség',
    'kozmetikum',
    'krem',
    'krém',
    'smink',
    'elektronika',
    'telefon',
    'laptop',
    'tablet',
    'utazas',
    'utazás',
    'szallas',
    'szállás',
    'hotel',
    'otthon',
    'butor',
    'bútor',
    'kert',
    'elelmiszer',
    'élelmiszer',
    'bevasarlas',
    'bevásárlás',
  ];
  const manualHintMatch = manualHintKeywords.some(hint => lowerQuery.includes(hint));
  const manualOffers = filtered.filter(offer => isManualSource(offer.source));
  if (manualHintMatch && manualOffers.length) {
    const keywordMatchedManual = manualOffers.filter(offer => offer.keyword_score > 0);
    filtered = keywordMatchedManual.length ? keywordMatchedManual : manualOffers;
  }
  const laptopKeywords = ['laptop', 'notebook', 'computer', 'szamitogep', 'számítógép', 'pc'];
  const applianceKeywords = [
    'mikro',
    'mikrohullamu',
    'mikrohullámú',
    'suto',
    'sütő',
    'konyhai',
    'konyhagep',
    'konyhai gep',
    'haztartasi',
    'háztartási',
    'huto',
    'hűtő',
    'mosogatoge',
    'mosogatógép',
    'mosogep',
    'mosógép',
  ];
  const laptopInQuery = lowerKeywords.some(token => laptopKeywords.includes(token));
  if (laptopInQuery) {
    const hasLaptopHit = filtered.some(offer => {
      const text = normalizeForMatch(`${offer.shop_slug} ${offer.shop_name} ${offer.title ?? ''} ${offer.description ?? ''}`);
      return laptopKeywords.some(k => text.includes(k));
    });
    if (!hasLaptopHit) {
      return {
        persona: 'Impi',
        summary:
          'Most nem találtam CJ partner laptop ajánlatot. Írd meg a pontos modellt vagy árkeretet (pl. gaming 400k alatt), és újra próbálom; addig nézd meg összehasonlításra az Árukeresőt vagy kérj konkrét boltot.',
        offers: [],
        query,
        preferred_ngo_slug: preferredNgoSlug,
        intent: 'no_shop',
        intent_confidence: intentResult.confidence,
        intent_matched_keywords: intentResult.matched,
      };
    }
  }
  const applianceInQuery = lowerKeywords.some(token => applianceKeywords.includes(token));
  if (applianceInQuery) {
    const hasApplianceHit = filtered.some(offer => {
      const text = normalizeForMatch(`${offer.shop_slug} ${offer.shop_name} ${offer.title ?? ''} ${offer.description ?? ''}`);
      return applianceKeywords.some(k => text.includes(k));
    });
    if (!hasApplianceHit) {
      return {
        persona: 'Impi',
        summary:
          'Most nem találtam konyhai/háztartási (mikro, sütő, mosogatógép) partner ajánlatot. Írd meg a pontos típust vagy boltot, és újra próbálom.',
        offers: [],
        query,
        preferred_ngo_slug: preferredNgoSlug,
        intent: 'no_shop',
        intent_confidence: intentResult.confidence,
        intent_matched_keywords: intentResult.matched,
      };
    }
  }
  const dedupedByShop = new Map<string, RecommendationOffer>();
  let dedupCount = 0;
  for (const offer of filtered) {
    const existing = dedupedByShop.get(offer.shop_slug);
    if (!existing || (offer.keyword_score || 0) > (existing.keyword_score || 0)) {
      if (existing) dedupCount++;
      dedupedByShop.set(offer.shop_slug, offer);
    }
  }
  filtered = Array.from(dedupedByShop.values());
  if (dedupCount > 0 && process.env.IMPI_DEBUG_DEDUP === '1') {
    console.log(`[IMPI_DEDUP] Removed ${dedupCount} duplicate shops`);
  }

  // Ha egyáltalán nincs partner ajánlat, adjunk tömör, link-spam mentes választ.
  if (!filtered.length) {
    return {
      persona: 'Impi',
      summary:
        'Most nem találtam releváns partner ajánlatot. Írd meg pontosabban a terméket vagy boltot (pl. konkrét márka/modell), és újra megpróbálom.',
      offers: [],
      query,
      preferred_ngo_slug: preferredNgoSlug,
      intent: 'no_shop',
      intent_confidence: intentResult.confidence,
      intent_matched_keywords: intentResult.matched,
      performance: (() => {
        performance.total_ms = Date.now() - perfStart;
        performance.offer_count = allRecords.length;
        return performance;
      })(),
    };
  }
  const top = filtered.slice(0, limit);

  const cleanupCandidates: ReliabilityCleanupCandidate[] = top
    .filter(offer => offer.reliability_label === 'risky')
    .map(offer => ({ slug: offer.shop_slug, shop_name: offer.shop_name, reliability: offer.reliability }));
  const warnings: string[] = [];
  if (cleanupCandidates.length) {
    const list = cleanupCandidates
      .map(candidate => `${candidate.shop_name || candidate.slug} (${(candidate.reliability * 100).toFixed(0)}%)`)
      .join(', ');
    warnings.push(`⚠️  Alacsony megbízhatóságú ajánlatok: ${list}. Ellenőrizd a kuponokat vagy frissítsd az ingest pipeline-t.`);
  }

  return {
    persona: 'Impi',
    summary: formatSummary(top),
    offers: top,
    query,
    preferred_ngo_slug: preferredNgoSlug,
    intent: detectedIntent || undefined,
    intent_confidence: intentResult.confidence,
    intent_matched_keywords: intentResult.matched,
    warnings: warnings.length ? warnings : undefined,
    cleanup_candidates: cleanupCandidates.length ? cleanupCandidates : undefined,
    context_metadata: buildContextMetadataFromOffers(top),
    performance: (() => {
      performance.total_ms = Date.now() - perfStart;
      performance.offer_count = allRecords.length;
      if (process.env.IMPI_PERFORMANCE_LOGGING === '1') {
        console.log('[IMPI_PERF]', JSON.stringify(performance));
      }
      return performance;
    })(),
  };
}
const DEFAULT_FILLOUT_URL = process.env.IMPACTSHOP_IMPI_FILLOUT_URL || 'https://form.fillout.com/t/eM61RLkz6jus';
const VIDEO_SUPPORT_URL = process.env.IMPACTSHOP_VIDEO_SUPPORT_URL || 'https://adomany.sharity.hu/about-us?utm_source=impi';
const VIDEO_SUPPORT_NGO_SLUG = process.env.IMPACTSHOP_VIDEO_NGO_SLUG || 'bator-tabor';
const VIDEO_SUPPORT_DONATION_HUF = Number(process.env.IMPACTSHOP_VIDEO_DONATION_HUF || '150');

type HighLevelIntent =
  | 'video_support'
  | 'transparency'
  | 'no_shop'
  | 'leaderboard'
  | 'feedback'
  | 'impact_data'
  | 'referral'
  | 'high_impact'
  | 'coupon_only'
  | 'wrong_expectation'
  | 'unsafe_request';

type IntentDetectionResult = {
  intent: HighLevelIntent | null;
  confidence: number;
  matched?: string[];
};

type IntentKeywords = { positive: string[]; negative?: string[] };

const INTENT_KEYWORDS: Record<HighLevelIntent, IntentKeywords> = {
  video_support: {
    positive: [
      'video',
      'videó',
      'videós',
      'videoval',
      'videót néznék',
      'videot neznek',
      'reklámnézés',
      'reklam nezes',
      'penz nelkul',
      'videós kampány',
      'videós támogatás',
      'video tamogatas',
      'videó mobil',
      'video mobil',
      'mobil videó',
      'mobilon video',
      'telefonon video',
      'videós cta',
      'videó cta',
      'videós visszaigazolás',
      'kampány',
      'nézd meg',
      'megnézem',
    ],
    negative: ['videó nélkül', 'video nélkül', 'nem videó', 'nem video', 'nincs video'],
  },
  transparency: {
    positive: [
      'átláthatóság',
      'atlathatosag',
      'transzparencia',
      'impact riport',
      'riport',
      'hol megy a pénz',
      'hova megy az adomány',
      'hova kerül',
      'rest api',
      'rest',
      'api',
      'json',
      'sts',
      'kimutatás',
      'kimutatas',
      'leaderboard',
      'toplista',
      'rangsor',
      'csv export',
      'adatok',
      'adatokat',
      'statisztika',
      'ellenőrzés',
      'ellenorzes',
      'bizonyíték',
      'bizonyitek',
    ],
  },
  no_shop: {
    positive: ['nem akarok vásárolni', 'nincs shop', 'csak info', 'csak információ', 'csak átláthatóság', 'nem szeretnék vásárolni', 'nem vasarolnek'],
  },
  leaderboard: {
    positive: ['leaderboard', 'ranglista', 'toplista', 'top lista', 'top 3', 'top100', 'verseny', 'hányadik', 'hanyadik'],
  },
  feedback: {
    positive: [
      'panasz',
      'hibát láttam',
      'hibat lattam',
      'hiba',
      'nem látom',
      'nem latom',
      'nem jelenik meg',
      'nem látszik',
      'nem latszik',
      'hiányzik',
      'hianyzik',
      'nincs meg',
      'elmaradt',
      'reklamacio',
      'reklamáció',
      'hibabejelentés',
      'hibabejelentes',
      'probléma',
      'problema',
      'support',
      'segítség',
      'segitseg',
    ],
  },
  impact_data: {
    positive: ['mennyi gyűlt', 'mennyi gyult', 'adatot akarok', 'adatot akarok:', 'statisztika', 'összeg', 'osszegzes', 'adatokat szeretnék', 'data report', 'összegzett adat', 'mennyi támogatás', 'mennyi tamogatas'],
  },
  referral: {
    positive: ['meghív', 'meghivas', 'meghívhatok', 'meghivhatok', 'referral', 'ngo kártya', 'ngo kartya', 'megosztom', 'barátot hívnék', 'baratot hivnek', 'invite link', 'share card'],
  },
  high_impact: {
    positive: ['legnagyobb adomány', 'max adomány', 'legnagyobb hatás', 'melyik adja a legtöbb adományt', 'legnagyobb jutalék', 'legtöbb jutalek'],
  },
  coupon_only: {
    positive: ['csak kupon', 'szigorúan kupon', 'kupon kell', 'kupon érdekel', 'kuponon kívül nem érdekel', 'csak kedvezmény', 'kizárólag kupon', 'csak code', 'kupon kód'],
  },
  wrong_expectation: {
    positive: ['teljes vásárlásom adomány', 'minden vásárlásom adomány', 'az egész összeg adomány', '100% adomány', 'teljes osszeg megy', 'minden ft adomány', 'csak adományból áll', 'miért nem az egész adomány'],
  },
  unsafe_request: {
    positive: ['bankkártyám', 'bankkártya', 'bankkartyam', 'bankkartya', 'adómat', 'adomat', 'adobevallas', 'adjam meg a kártyám', 'kartyaszam', 'card number', 'cvv', 'security code', 'jelszavad', 'password', 'személyes adat', 'szemelyes adat'],
  },
};

const SUPPRESS_OFFERS_INTENTS: HighLevelIntent[] = [
  'transparency',
  'no_shop',
  'impact_data',
  'wrong_expectation',
  'unsafe_request',
  'feedback',
  'leaderboard',
];

function detectHighLevelIntent(query: string): IntentDetectionResult {
  if (!query) {
    return { intent: null, confidence: 0 };
  }
  const normalised = query.toLowerCase();
  let bestIntent: HighLevelIntent | null = null;
  let maxMatchCount = 0;
  let matchedKeywords: string[] = [];
  for (const intent of Object.keys(INTENT_KEYWORDS) as HighLevelIntent[]) {
    const { positive, negative } = INTENT_KEYWORDS[intent];
    if (negative && negative.some(keyword => normalised.includes(keyword))) {
      continue;
    }
    const matches = positive.filter(keyword => normalised.includes(keyword));
    if (matches.length > maxMatchCount) {
      maxMatchCount = matches.length;
      bestIntent = intent;
      matchedKeywords = matches;
    }
  }
  const queryLength = Math.max(normalised.split(/\s+/).length, 3);
  const baseConfidence = Math.min(maxMatchCount / queryLength, 1);
  if (maxMatchCount > 0) {
    const isProtectedIntent =
      bestIntent && ['video_support', 'transparency', 'feedback', 'leaderboard', 'impact_data'].includes(bestIntent);
    const minConfidence = isProtectedIntent ? 0.6 : 0.5;
    const confidence = Math.max(baseConfidence, minConfidence);
    return { intent: bestIntent, confidence, matched: matchedKeywords };
  }
  return { intent: null, confidence: 0, matched: [] };
}

function summarizeSuppressedIntent(intent: HighLevelIntent): string {
  switch (intent) {
    case 'video_support':
      return 'Nézz meg egy kampányvideót, és a lejátszás rögzíti az adományt a választott ügynek. Link: https://adomany.sharity.hu/about-us?utm_source=impi&ngo=bator-tabor';
    case 'transparency':
      return [
        'Átláthatósági kérésnél nyisd meg az Impact riportot és a REST toplistát:',
        '🏆 Toplista: https://app.sharity.hu/impactshop/leaderboard (CSV export a "total_donation_huf", supporters, last_donation_at mezőkhöz).',
        '📊 REST: https://app.sharity.hu/wp-json/impactshop/v1/leaderboard?limit=50 (mezők: ngo, total_donation_huf, supporters, last_donation_at, period_start, period_end).',
        '📅 Időszakos szűrés: pl. .../leaderboard?period=2025-11 → csak a novemberi adományok.',
        'Ha visszajelzést adnál vagy konkrét ügyet választanál, használd az űrlapot; ide tölthetsz fel screenshotot is.'
      ].join('\n');
    case 'no_shop':
      return 'Fallback sorrend: kampány → videó → űrlap. Ha most nem vásárolnál, nézd meg az aktuális kampányokat vagy videós támogatást, végül válaszd ki az ügyet egy űrlapon – így pénz nélkül is segíthetsz.';
    case 'leaderboard':
      return 'A ranglistát az ImpactShop toplista és a REST API (`/wp-json/impactshop/v1/leaderboard`) adja; most a Bátor Tábor, a Csoda Emma és a Dányi Apró Patak LSE áll a csúcson. Nézd meg a dashboardot, és a linkjeimről indulva rögzül a saját helyezésed is.';
    case 'feedback':
      return [
        'Ha nem látod az adományodat a riportban, jelezd űrlapon, hogy hozzáadják manuálisan.',
        '1) Tartsd meg a rendelés azonosítóját, tölts fel screenshotot.',
        '2) Hibabejelentő űrlap: https://app.sharity.hu/impactshop?ngo=impactshop&d1=impactshop&src=impi',
        '3) Írd meg a shop nevét, NGO slugot, rendelési összeget.',
      ].join('\n');
    case 'impact_data':
      return 'Összegzett statisztikáért a sorrend: Impact riport → REST JSON → CSV export. Először nézd meg a webes toplistát (`/impactshop/leaderboard`), ha részletes adat kell, használd a REST végpontot (`/wp-json/impactshop/v1/leaderboard`), majd tölts le CSV-t és szűrd időszakra.';
    case 'referral':
      return 'Barát meghívásához oszd meg az NGO kártyát vagy a `https://app.sharity.hu/impactshop?ngo=<slug>&d1=<slug>` linket. Így ugyanarra az ügyre terelheted őket, és a ranglista pontjaid is nőnek.';
    case 'wrong_expectation':
      return 'A vásárlások után járó jutalékból lesz adomány (általában 3–7%). A teljes összeg nem kerül át, viszont ha a linkjeimet használod, pontosan rögzül, mennyi jut a kiválasztott NGO-nak. Segítek kiszámolni, milyen összeget érhetsz el.';
    case 'unsafe_request':
      return 'A bankkártya-, jelszó- vagy adóügyeket nem kezelhetem: ilyen adatot soha ne adj ki chatben. Ha hivatalos ügyben kérsz segítséget, keresd fel közvetlenül a szolgáltatódat vagy az adóhatóságot.';
    default:
      return 'Most nem mutatok konkrét shop ajánlatot – válassz ügyet egy űrlapon, vagy kérj Impact riportot az átláthatóság kedvéért.';
  }
}

function summarizeCategoryIntent(match: NgoCategoryMatch): string {
  const names = match.category.ngos.slice(0, 3).map(entry => entry.name).join(', ');
  return `${match.category.title} témában most ezek a szervezetek aktívak: ${names}. A linkekről indulva automatikusan az ő ügyük erősödik, szólj, ha máshova terelnéd a támogatást!`;
}

function buildHighImpactOffers(limit: number): RecommendationOffer[] {
  const entries = getTopImpactEntries(limit);
  return entries.map((entry, index) => {
    const donationRate = entry.donation_rate ?? 0.04;
    const donationMode = classifyDonationMode(donationRate);
    const perThousand = donationPerThousand(donationRate);
    const ctaUrl = buildGoLink(entry.shop_slug, sanitizeSlug(entry.ngo));
    return {
      source: 'impact-table',
      shop_slug: entry.shop_slug,
      shop_name: entry.shop_name,
      type: 'sale_event',
      discount_score: 0,
      donation_rate: donationRate,
      estimated_donation_huf: perThousand,
      price_huf: undefined,
      donation_per_1000_huf: perThousand,
      donation_mode: donationMode,
      donation_mode_label: donationModeLabel(donationMode),
      fillout_url: DEFAULT_FILLOUT_URL,
      reliability: 1,
      reliability_label: 'super',
      reliability_score: 1,
      impact_score: Number((150 - index * 2).toFixed(2)),
      ngo: entry.ngo,
      cta_url: ctaUrl || DEFAULT_FILLOUT_URL,
      cta_label: 'Megnézem az ajánlatot',
      preferred_ngo_slug: sanitizeSlug(entry.ngo),
      keyword_score: 20 - index,
      source_variant: 'impact-table',
      merchant_priority: 200 - index,
    } satisfies RecommendationOffer;
  });
}

function summarizeHighImpactOffers(): string {
  const entries = getTopImpactEntries(3);
  const parts = entries.map(entry => `${entry.shop_name} → ${(entry.donation_rate * 100).toFixed(1)}% a ${entry.ngo} javára`);
  return `A legnagyobb hatású vásárlások most: ${parts.join('; ')}. Használd a fenti linkeket, hogy az adomány automatikusan rögzüljön.`;
}

function buildVideoSupportOffer(preferredNgoSlug?: string): RecommendationOffer {
  const ngoSlug = preferredNgoSlug || VIDEO_SUPPORT_NGO_SLUG;
  const ctaUrl = `${VIDEO_SUPPORT_URL}${VIDEO_SUPPORT_URL.includes('?') ? '&' : '?'}ngo=${ngoSlug}`;
  const donationPerView = Number.isFinite(VIDEO_SUPPORT_DONATION_HUF) ? VIDEO_SUPPORT_DONATION_HUF : 150;
  return {
    source: 'video_support',
    shop_slug: 'video-support',
    shop_name: 'Videós támogatás',
    type: 'sale_event',
    discount_score: 0,
    discount_label: 'Videós kampány',
    title: 'Nézz meg egy kampányvideót, és könyveljük az adományt',
    description: 'A videó lejátszása után automatikusan rögzül az adomány a kiválasztott NGO-nak.',
    cta_url: ctaUrl,
    fillout_url: ctaUrl,
    donation_rate: 0,
    estimated_donation_huf: 0,
    price_huf: undefined,
    donation_per_1000_huf: 0,
    donation_mode: 'legend',
    donation_mode_label: 'Videós támogatás',
    reliability: 0.95,
    reliability_label: 'super',
    reliability_score: 0.95,
    impact_score: 999,
    ngo: ngoSlug,
    cta_label: 'Videót indítok',
    preferred_ngo_slug: ngoSlug,
    keyword_score: 50,
    source_variant: 'video',
    merchant_priority: 500,
  };
}

function summarizeVideoSupport(offer: RecommendationOffer): string {
  const ngo = offer.preferred_ngo_slug || VIDEO_SUPPORT_NGO_SLUG;
  const link = offer.cta_url || offer.fillout_url || VIDEO_SUPPORT_URL;
  return `Videós támogatás: indítsd el a kampányvideót, és a jutalék automatikusan a(z) ${ngo} ügyéhez kerül. Link: ${link}`;
}

function buildCategoryOffers(match: NgoCategoryMatch, preferredNgoSlug?: string): RecommendationOffer[] {
  const baseScore = 120;
  return match.category.ngos.map((ngo, index) => {
    const matchedSlug = sanitizeSlug(ngo.slug) || undefined;
    const resolvedSlug = matchedSlug || preferredNgoSlug || 'impactshop';
    const ctaUrl = ngo.cta_url || buildNgoCtaUrl(resolvedSlug);
    const filloutUrl = ngo.fillout_url || buildNgoFilloutUrl(resolvedSlug);
    const description = [ngo.mission, ngo.impact_focus].filter(Boolean).join(' ');
    const reliability = 1;
    return {
      source: 'ngo-category-map',
      shop_slug: `ngo-${resolvedSlug}`,
      shop_name: ngo.name,
      type: 'sale_event',
      discount_label: ngo.impact_focus || 'Kiemelt ügy',
      title: ngo.mission,
      description,
      cta_url: ctaUrl,
      fillout_url: filloutUrl,
      raw: { slug: resolvedSlug, category: match.category.id },
      discount_score: 0,
      donation_rate: 0.07,
      estimated_donation_huf: 0,
      price_huf: undefined,
      donation_per_1000_huf: 70,
      donation_mode: 'legend',
      donation_mode_label: 'Impact támogatás',
      reliability,
      reliability_label: 'super',
      reliability_score: reliability,
      impact_score: baseScore - index * 2,
      ngo: ngo.name,
      cta_label: 'Támogatom most',
      preferred_ngo_slug: resolvedSlug,
      keyword_score: 10 - index,
    } satisfies RecommendationOffer;
  });
}

function resolveSourceVariant(record: NormalizedCoupon): string | undefined {
  if (record.source_variant) {
    return record.source_variant;
  }
  const rawVariant = record.raw?.source_variant;
  if (typeof rawVariant === 'string') {
    return rawVariant;
  }
  return record.source;
}

function extractMerchantPriority(record: NormalizedCoupon): number | undefined {
  if (typeof record.merchant_priority === 'number' && Number.isFinite(record.merchant_priority)) {
    return record.merchant_priority;
  }
  const rawPriority = record.raw?.merchant_priority ?? record.raw?.priority;
  if (typeof rawPriority === 'number' && Number.isFinite(rawPriority)) {
    return rawPriority;
  }
  if (typeof rawPriority === 'string') {
    const parsed = Number(rawPriority);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function extractCategorySlug(record: NormalizedCoupon): string | undefined {
  const raw = record.raw || {};
  const candidates = [raw['category_slug'], raw['category'], raw['category_name'], raw['segment']];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim().toLowerCase();
    }
  }
  if (Array.isArray(raw['categories'])) {
    const first = (raw['categories'] as unknown[]).find(value => typeof value === 'string');
    if (first) {
      return String(first).trim().toLowerCase();
    }
  }
  return undefined;
}

function applyProfileBoost(baseScore: number, record: NormalizedCoupon, profile?: ProfilePreference): number {
  if (!profile) {
    return baseScore;
  }
  let score = baseScore;
  const profileNgoSlug = sanitizeSlug(profile.preferredNgo);
  if (profileNgoSlug) {
    const raw = record.raw || {};
    const offerNgoSlug = sanitizeSlug((raw['ngo_slug'] as string | undefined) || record.shop_slug);
    if (offerNgoSlug && offerNgoSlug.includes(profileNgoSlug)) {
      score += 8;
    } else if (offerNgoSlug) {
      const profileCategory = getNgoCategory(profileNgoSlug);
      const offerCategory = getNgoCategory(offerNgoSlug);
      if (profileCategory && offerCategory && profileCategory === offerCategory) {
        score += 4;
      }
    }
  }
  if (profile.preferredCategory) {
    const recordCategory = extractCategorySlug(record);
    if (recordCategory && recordCategory.includes(profile.preferredCategory.toLowerCase())) {
      score += 5;
    }
  }
  return Number(score.toFixed(2));
}

function buildContextMetadataFromOffers(offers: RecommendationOffer[]): OfferContextMetadata[] {
  return offers.map(offer => ({
    shop_slug: offer.shop_slug,
    source_variant: offer.source_variant,
    scraped_at: offer.scraped_at,
    merchant_priority: offer.merchant_priority,
    reliability_score: offer.reliability_score ?? offer.reliability,
  }));
}

function buildNgoCtaUrl(slug: string): string {
  const safeSlug = slug || 'impactshop';
  return `https://app.sharity.hu/impactshop?ngo=${safeSlug}&d1=${safeSlug}&src=impi`;
}

function buildNgoFilloutUrl(slug: string): string {
  const safeSlug = slug || 'impactshop';
  const separator = DEFAULT_FILLOUT_URL.includes('?') ? '&' : '?';
  return `${DEFAULT_FILLOUT_URL}${separator}ngo=${safeSlug}`;
}

function buildTransparencyOffers(preferredNgoSlug?: string): RecommendationOffer[] {
  const ngoSlug = preferredNgoSlug || 'impactshop';
  return [
    {
      source: 'transparency',
      shop_slug: 'impactshop-leaderboard',
      shop_name: 'ImpactShop Toplista',
      type: 'sale_event',
      discount_score: 0,
      donation_rate: 0,
      estimated_donation_huf: 0,
      price_huf: undefined,
      donation_per_1000_huf: 0,
      donation_mode: 'base',
      donation_mode_label: 'Átláthatóság',
      reliability: 1,
      reliability_label: 'super',
      reliability_score: 1,
      impact_score: 0,
      ngo: ngoSlug,
      cta_url: `https://app.sharity.hu/impactshop/leaderboard?ngo=${ngoSlug}`,
      cta_label: 'Toplista megnyitása',
      preferred_ngo_slug: ngoSlug,
      keyword_score: 0,
      source_variant: 'transparency',
      merchant_priority: 0,
    },
    {
      source: 'transparency',
      shop_slug: 'impactshop-rest-api',
      shop_name: 'REST API Leaderboard',
      type: 'sale_event',
      discount_score: 0,
      donation_rate: 0,
      estimated_donation_huf: 0,
      price_huf: undefined,
      donation_per_1000_huf: 0,
      donation_mode: 'base',
      donation_mode_label: 'Átláthatóság',
      reliability: 1,
      reliability_label: 'super',
      reliability_score: 1,
      impact_score: 0,
      ngo: ngoSlug,
      cta_url: 'https://app.sharity.hu/wp-json/impactshop/v1/leaderboard?limit=50',
      cta_label: 'REST API megnyitása',
      preferred_ngo_slug: ngoSlug,
      keyword_score: 0,
      source_variant: 'transparency',
      merchant_priority: 0,
    },
  ];
}

function buildLeaderboardOffers(preferredNgoSlug?: string): RecommendationOffer[] {
  const ngoSlug = preferredNgoSlug || 'impactshop';
  return [
    {
      source: 'leaderboard',
      shop_slug: 'impactshop-leaderboard',
      shop_name: 'Ranglista (Top 100 NGO)',
      type: 'sale_event',
      discount_score: 0,
      donation_rate: 0,
      estimated_donation_huf: 0,
      price_huf: undefined,
      donation_per_1000_huf: 0,
      donation_mode: 'base',
      donation_mode_label: 'Ranglista',
      reliability: 1,
      reliability_label: 'super',
      reliability_score: 1,
      impact_score: 0,
      ngo: ngoSlug,
      cta_url: `https://app.sharity.hu/impactshop/leaderboard?ngo=${ngoSlug}`,
      cta_label: 'Ranglista megnyitása',
      preferred_ngo_slug: ngoSlug,
      keyword_score: 0,
      source_variant: 'leaderboard',
      merchant_priority: 0,
    },
  ];
}

function buildFeedbackOffers(preferredNgoSlug?: string): RecommendationOffer[] {
  const ngoSlug = preferredNgoSlug || 'impactshop';
  const feedbackUrl = buildNgoFilloutUrl(ngoSlug);
  return [
    {
      source: 'feedback',
      shop_slug: 'feedback-form',
      shop_name: 'Hibabejelentő űrlap',
      type: 'sale_event',
      discount_score: 0,
      donation_rate: 0,
      estimated_donation_huf: 0,
      price_huf: undefined,
      donation_per_1000_huf: 0,
      donation_mode: 'base',
      donation_mode_label: 'Feedback',
      reliability: 1,
      reliability_label: 'super',
      reliability_score: 1,
      impact_score: 0,
      ngo: ngoSlug,
      cta_url: feedbackUrl,
      cta_label: 'Űrlap megnyitása',
      preferred_ngo_slug: ngoSlug,
      keyword_score: 0,
      source_variant: 'feedback',
      merchant_priority: 0,
    },
  ];
}
