export function scoreCapabilitiesByMessage(message: string): Record<string, number> {
  const lower = message.toLowerCase();
  const words = lower.split(/\s+/);
  const counts: Record<string, number> = {};

  const inc = (id: string, amount = 1) => {
    counts[id] = (counts[id] || 0) + amount;
  };

  const hasAny = (keywords: string[]) => keywords.some(k => lower.includes(k));

  // Merge/táblázat jellegű kérések
  if (
    hasAny([
      'excel',
      'xlsx',
      'xls',
      'csv',
      'táblázat',
      'tablazat',
      'tábla',
      'table',
      'sheet',
      'hrsz',
      'helyrajzi',
      'merge',
      'összefésül',
      'ossze',
      'fájl',
      'file',
    ])
  ) {
    inc('merge-tables', 8);
  }

  // Impi / kupon / vásárlás jellegű kérések
  if (
    hasAny([
      'kupon',
      'coupon',
      'shop',
      'bolt',
      'vásárl',
      'vasarl',
      'kedvezmény',
      'akció',
      'akcio',
      'ajánlat',
      'ajanlat',
      'vásárol',
      'vasarol',
      'kod',
      'kód',
      'kuponkód',
      'discount',
    ])
  ) {
    inc('impi-coupon-search', 5);
  }

  // Hirdetés / ads / kampány jellegű kérések
  if (
    hasAny([
      'hirdetés',
      'hirdetes',
      'ads',
      'kampány',
      'kampany',
      'reklám',
      'reklam',
      'target',
      'targetál',
      'targetal',
      'targeting',
      'remarketing',
      'konverzió',
      'konverzio',
      'conversion',
      'capi',
      'meta',
      'facebook',
      'tiktok',
      'google ads',
      'youtube',
    ])
  ) {
    inc('ads-decision', 6);
    inc('ads-execute', 4);
    inc('ads-event-ingest', 3);
  }

  // Pénzügyi chart / grafikon jellegű kérések
  if (
    hasAny([
      'chart',
      'grafikon',
      'diagram',
      'kimutatás',
      'idősor',
      'idosor',
      'trend',
      'bevétel',
      'bevetel',
      'költség',
      'koltseg',
      'cashflow',
      'forgalom',
      'profit',
      'árbevétel',
      'arbevetel',
      'pénzügyi',
      'penzugyi',
    ])
  ) {
    inc('financial-chart-builder', 8);
  }

  // Jogi / jogszabály jellegű kérések
  if (
    hasAny([
      'jogszabály',
      'jogszabaly',
      'törvény',
      'torveny',
      'rendelet',
      'hatályos',
      'hatalyos',
      'hatály',
      'hataly',
      'ptk',
      'btk',
      'jogi',
      'jog',
      'bíróság',
      'birosag',
      'ítélet',
      'itelet',
      'szerződés',
      'szerzodes',
      'felelősség',
      'felelosseg',
      'kártérítés',
      'karterites',
      'peres',
      'fellebbez',
      'jogorvoslat',
      'njt',
      'jogtar',
      'paragrafus',
      '§',
      'bekezdés',
      'bekezdes',
      'civil tv',
      'ákr',
      'akr',
      'infotv',
      'gdpr',
      'adatvédel',
      'adatvedel',
    ])
  ) {
    inc('legal-legislation-lookup', 9);
  }

  // Adó jellegű kérések
  if (
    hasAny([
      'adó',
      'ado',
      'áfa',
      'afa',
      'szja',
      'tao',
      'kata',
      'kiva',
      'szocho',
      'társasági adó',
      'tarsasagi ado',
      'személyi jövedelemadó',
      'szemelyi jovedelemado',
      'iparűzési',
      'iparuzesi',
      'helyi adó',
      'helyi ado',
      'illeték',
      'illetek',
      'tb',
      'járulék',
      'jarulek',
      'bevallás',
      'bevallas',
      'nav ',
      'adóhivatal',
      'adohivatal',
      'számla',
      'szamla',
      'adószám',
      'adoszam',
      'adóalany',
      'adoalany',
      'fordított adózás',
      'forditott adozas',
      'áfamentess',
      'afamentess',
      'adómérték',
      'adomertek',
      'számvitel',
      'szamvitel',
      'könyvelés',
      'konyveles',
    ])
  ) {
    inc('tax-checklist-hu', 8);
    // Ha jogi is triggerelt, a tax legyen erősebb (specifikusabb)
    if (counts['legal-legislation-lookup']) {
      inc('tax-checklist-hu', 2);
    }
  }

  // Ha semmi sem talált, adunk egy alap szintet, hogy legyen fallback
  if (Object.keys(counts).length === 0) {
    inc('impi-coupon-search', 1);
  }

  return counts;
}

// Opcionális LLM-alapú tie-breaker; ha nincs API kulcs vagy flag, fallback.
export async function selectCapabilityWithPrompt(
  candidates: { id: string; description?: string }[],
  state: { userMessage?: string; attachments?: unknown[]; structuredDocuments?: unknown[] },
): Promise<string | undefined> {
  if (process.env.CORE_CAPABILITY_ROUTING_PROMPT !== '1') return undefined;
  if (!process.env.OPENAI_API_KEY) return undefined;
  try {
    const { OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const messages = [
      {
        role: 'system' as const,
        content:
          'You are a capability router. Choose the best capability id for the user request. Reply with ONLY the capability id.',
      },
      {
        role: 'user' as const,
        content: `User message: "${state.userMessage ?? ''}"
Attachments: ${state.attachments?.length ?? 0}
Structured docs: ${Array.isArray(state.structuredDocuments) ? state.structuredDocuments.length : 0}

Capabilities:
${candidates.map(c => `- ${c.id}: ${c.description ?? ''}`).join('\n')}`,
      },
    ];
    const res = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      temperature: 0,
      max_tokens: 50,
    });
    const reply = res.choices[0]?.message?.content?.trim() || '';
    const match = candidates.find(c => c.id === reply);
    return match?.id;
  } catch (error) {
    // prompt alapú routing opcionális; hiba esetén fallback
    return undefined;
  }
}
