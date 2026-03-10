/**
 * legal-legislation-lookup capability
 *
 * Hatályos jogszabály keresés — Njt (Nemzeti Jogszabálytár) integráció.
 *
 * P0 ütemben: LLM-alapú jogszabály elemzés a user kérdése alapján,
 *             hatályossági dátum kezeléssel és citation-first output contract-tal.
 *
 * P1-ben: net.jogtar.hu web scraping / API integráció a valós jogszabályszövegekért.
 */

import type { CapabilityManifest } from './types.js';
import { registerCapability } from './registry.js';
import type { CoreAgentState } from '../state.js';
import type { LegalLookupInput, LegalLookupOutput, LegalSource } from '../legal/types.js';
import { LEGAL_DISCLAIMER } from '../legal/types.js';
import { enforceLegalGuardrails, assessRiskLevel, checkProhibitedPatterns } from '../legal/disclaimer.js';

// ---------------------------------------------------------------------------
// Közismert jogszabály rövidítések → teljes azonosítók
// ---------------------------------------------------------------------------

const WELL_KNOWN_LAWS: Record<string, { identifier: string; title: string; njt_path?: string }> = {
  'ptk': { identifier: '2013. évi V. törvény', title: 'Polgári Törvénykönyv (Ptk.)', njt_path: '2013-V' },
  'polgári törvénykönyv': { identifier: '2013. évi V. törvény', title: 'Polgári Törvénykönyv (Ptk.)', njt_path: '2013-V' },
  'áfa': { identifier: '2007. évi CXXVII. törvény', title: 'Általános forgalmi adóról szóló törvény (Áfa tv.)', njt_path: '2007-CXXVII' },
  'áfa tv': { identifier: '2007. évi CXXVII. törvény', title: 'Áfa tv.', njt_path: '2007-CXXVII' },
  'szja': { identifier: '1995. évi CXVII. törvény', title: 'Személyi jövedelemadóról szóló törvény (Szja tv.)', njt_path: '1995-CXVII' },
  'szja tv': { identifier: '1995. évi CXVII. törvény', title: 'Szja tv.', njt_path: '1995-CXVII' },
  'tao': { identifier: '1996. évi LXXXI. törvény', title: 'Társasági adóról szóló törvény (Tao tv.)', njt_path: '1996-LXXXI' },
  'tao tv': { identifier: '1996. évi LXXXI. törvény', title: 'Tao tv.', njt_path: '1996-LXXXI' },
  'art': { identifier: '2017. évi CL. törvény', title: 'Adóigazgatási rendtartásról szóló törvény (Art.)', njt_path: '2017-CL' },
  'art.': { identifier: '2017. évi CL. törvény', title: 'Art.', njt_path: '2017-CL' },
  'kata': { identifier: '2022. évi XIII. törvény', title: 'Kisadózó vállalkozások tételes adójáról szóló törvény (KATA)', njt_path: '2022-XIII' },
  'kiva': { identifier: '2012. évi CXLVII. törvény', title: 'Kisvállalati adóról szóló törvény (KIVA)', njt_path: '2012-CXLVII' },
  'mt': { identifier: '2012. évi I. törvény', title: 'Munka Törvénykönyve (Mt.)', njt_path: '2012-I' },
  'munka törvénykönyve': { identifier: '2012. évi I. törvény', title: 'Munka Törvénykönyve (Mt.)', njt_path: '2012-I' },
  'gt': { identifier: '2006. évi IV. törvény', title: 'Gazdasági társaságokról szóló törvény (Gt.)', njt_path: '2006-IV' },
  'civil tv': { identifier: '2011. évi CLXXV. törvény', title: 'Civil szervezetek bírósági nyilvántartásáról szóló tv.', njt_path: '2011-CLXXV' },
  'civil': { identifier: '2011. évi CLXXV. törvény', title: 'Civil tv.', njt_path: '2011-CLXXV' },
  'számviteli tv': { identifier: '2000. évi C. törvény', title: 'Számviteli törvény (Szt.)', njt_path: '2000-C' },
  'szt': { identifier: '2000. évi C. törvény', title: 'Számviteli törvény (Szt.)', njt_path: '2000-C' },
  'infotv': { identifier: '2011. évi CXII. törvény', title: 'Információs önrendelkezési jogról szóló tv. (Infotv.)', njt_path: '2011-CXII' },
  'gdpr': { identifier: 'EU 2016/679 rendelet', title: 'Általános Adatvédelmi Rendelet (GDPR)' },
  'btk': { identifier: '2012. évi C. törvény', title: 'Büntető Törvénykönyv (Btk.)', njt_path: '2012-C' },
  'ket': { identifier: '2016. évi CL. törvény', title: 'Általános közigazgatási rendtartásról szóló tv. (Ákr.)', njt_path: '2016-CL' },
  'ákr': { identifier: '2016. évi CL. törvény', title: 'Ákr.', njt_path: '2016-CL' },
};

function resolveDate(input?: string): string {
  if (input && /^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  return new Date().toISOString().slice(0, 10);
}

function buildNjtUrl(njtPath: string, date: string): string {
  // net.jogtar.hu URL formátum: https://net.jogtar.hu/jogszabaly?docid=YYYYXXXX.TV&timeshift=YYYYMMDD
  const dateCompact = date.replace(/-/g, '');
  return `https://net.jogtar.hu/jogszabaly?docid=${njtPath.replace('-', '')}.TV&timeshift=${dateCompact}`;
}

function findReferencedLaws(query: string): Array<{ identifier: string; title: string; njt_path?: string }> {
  const lower = query.toLowerCase();
  const found: Array<{ identifier: string; title: string; njt_path?: string }> = [];
  const seen = new Set<string>();

  for (const [key, law] of Object.entries(WELL_KNOWN_LAWS)) {
    if (lower.includes(key) && !seen.has(law.identifier)) {
      found.push(law);
      seen.add(law.identifier);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Invoke
// ---------------------------------------------------------------------------

async function invokeLegalLookup(
  input: LegalLookupInput & { id?: string },
  context: CoreAgentState,
): Promise<LegalLookupOutput> {
  const query = input.query?.trim() || context.userMessage;
  const referenceDate = resolveDate(input.reference_date);

  // P0: kulcsszó alapú jogszabály-azonosítás + LLM elemzés
  // P1: Njt web scraping valós szövegért
  const referencedLaws = findReferencedLaws(query);

  const sources: LegalSource[] = referencedLaws.map(law => ({
    type: 'legislation' as const,
    identifier: law.identifier,
    title: law.title,
    validity_status: 'hatályos' as const,      // P1-ben Njt-ből ellenőrizzük
    validity_date: referenceDate,
    url: law.njt_path ? buildNjtUrl(law.njt_path, referenceDate) : undefined,
  }));

  // LLM-alapú elemzés (ha van API kulcs)
  let answer: string;
  let confidence: 'high' | 'medium' | 'low' = 'medium';

  if (process.env.OPENAI_API_KEY) {
    try {
      const { OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const systemPrompt = `Te egy magyar jogi asszisztens vagy. A felhasználó jogszabállyal kapcsolatos kérdést tesz fel.

KÖTELEZŐ SZABÁLYOK:
1. Mindig a HATÁLYOS jogszabályszöveget keresd (referencia dátum: ${referenceDate}).
2. MINDIG hivatkozz konkrét jogszabályhelyre: évszám, törvényszám, §, bekezdés, pont.
3. Vizsgáld meg az ÁTMENETI és HATÁLYBALÉPTETŐ rendelkezéseket.
4. Ha nem vagy biztos a hatályosságban, JELEZD egyértelműen.
5. NE adj konkrét jogi tanácsot — csak az alkalmazandó szabályokat ismertesd.
6. Ha helyi önkormányzati rendelet is releváns lehet, jelezd.

HIVATKOZOTT JOGSZABÁLYOK (ha azonosítottak):
${sources.map(s => `- ${s.identifier} (${s.title})`).join('\n') || 'Nincs előre azonosított jogszabály.'}

Válaszolj STRUKTURÁLTAN:
- Alkalmazandó jogszabályok
- Releváns §-ok / rendelkezések
- Átmeneti rendelkezések (ha vannak)
- Kockázatok / figyelmeztetések`;

      const res = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query },
        ],
        temperature: 0.2,
        max_tokens: 2000,
      });

      answer = res.choices[0]?.message?.content?.trim() || 'Nem sikerült elemzést készíteni.';

      // Ha sok forrást hivatkoztunk, confidence felfelé
      if (sources.length >= 1) confidence = 'medium';
      if (sources.length >= 2) confidence = 'high';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ismeretlen hiba';
      answer = `Jogszabály-keresés hiba: ${message}. Kézi ellenőrzés szükséges.`;
      confidence = 'low';
    }
  } else {
    // Nincs OpenAI API → stub válasz a forrásokkal
    if (sources.length) {
      answer = `A kérdés az alábbi jogszabályokat érintheti:\n${sources.map(s => `• ${s.identifier} — ${s.title}`).join('\n')}\n\nReferencia dátum: ${referenceDate}. Részletes elemzéshez kérlek adj meg OpenAI API kulcsot.`;
    } else {
      answer = `A kérdésben nem találtam ismert jogszabály-hivatkozást. Kérlek pontosítsd, melyik jogszabályra gondolsz (pl. "Áfa tv.", "Ptk.", "Art.").`;
    }
    confidence = 'low';
  }

  // Prohibited pattern check
  const warnings = checkProhibitedPatterns(answer);
  if (warnings.length) {
    answer += `\n\n⚠️ Figyelmeztetés: ${warnings.join('; ')}`;
    confidence = 'low';
  }

  const riskLevel = assessRiskLevel({
    hasVerifiedSources: sources.length > 0,
    confidence,
    involvesMoney: /összeg|fizetés|adó|áfa|díj|bírság|forint|huf|eur/i.test(query),
    involvesDeadline: /határidő|napja|-ig|-áig|fellebbez|bevall/i.test(query),
  });

  const legalResponse = enforceLegalGuardrails({
    answer,
    sources,
    confidence,
    risk_level: riskLevel,
    requires_human_review: riskLevel === 'high',
    disclaimer: LEGAL_DISCLAIMER,
    reference_date: referenceDate,
  });

  return {
    kind: 'legal',
    status: sources.length > 0 || answer.length > 50 ? 'ok' : 'not_found',
    response: legalResponse,
    raw_sources: sources,
  };
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

const inputSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'Keresett jogszabály vagy jogi kérdés' },
    reference_date: { type: 'string', description: 'Referencia dátum (YYYY-MM-DD), default: ma' },
    section: { type: 'string', description: 'Specifikus § / bekezdés / pont' },
  },
  required: ['query'],
};

const outputSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['legal'] },
    status: { type: 'string', enum: ['ok', 'not_found', 'error'] },
    response: { type: 'object' },
    raw_sources: { type: 'array' },
    error: { type: 'string' },
  },
};

export const legalLegislationLookupCapability: CapabilityManifest<LegalLookupInput, LegalLookupOutput> = {
  id: 'legal-legislation-lookup',
  version: '1.0',
  name: 'Hatályos jogszabály keresés',
  description:
    'Magyar jogszabályok keresése hatályossági dátummal. ' +
    'Njt / net.jogtar.hu alapú forrás-hivatkozás, citation-first válasz.',
  inputSchema,
  outputSchema,
  invoke: invokeLegalLookup as any,
  tags: ['legal', 'legislation', 'law', 'jog', 'jogszabály', 'hatályos'],
  priority: 9,
};

registerCapability(legalLegislationLookupCapability);
