/**
 * tax-checklist-hu capability
 *
 * Magyar adó checklist — ÁFA, SZJA, TAO, helyi adó, KATA, KIVA stb.
 * Hatályossági dátummal ellenőrzi az alkalmazandó szabályokat.
 */

import type { CapabilityManifest } from './types.js';
import { registerCapability } from './registry.js';
import type { CoreAgentState } from '../state.js';
import type {
  TaxChecklistInput,
  TaxChecklistOutput,
  TaxChecklistItem,
  LegalSource,
} from '../legal/types.js';
import { LEGAL_DISCLAIMER } from '../legal/types.js';
import { enforceLegalGuardrails, assessRiskLevel, checkProhibitedPatterns } from '../legal/disclaimer.js';

// ---------------------------------------------------------------------------
// Adónem → jogszabály mapping
// ---------------------------------------------------------------------------

const TAX_TYPE_MAP: Record<string, { identifier: string; title: string; njt_path?: string }> = {
  áfa: { identifier: '2007. évi CXXVII. törvény', title: 'Áfa tv.', njt_path: '2007-CXXVII' },
  afa: { identifier: '2007. évi CXXVII. törvény', title: 'Áfa tv.', njt_path: '2007-CXXVII' },
  szja: { identifier: '1995. évi CXVII. törvény', title: 'Szja tv.', njt_path: '1995-CXVII' },
  tao: { identifier: '1996. évi LXXXI. törvény', title: 'Tao tv.', njt_path: '1996-LXXXI' },
  kata: { identifier: '2022. évi XIII. törvény', title: 'KATA tv.', njt_path: '2022-XIII' },
  kiva: { identifier: '2012. évi CXLVII. törvény', title: 'KIVA tv.', njt_path: '2012-CXLVII' },
  helyi_adó: { identifier: '1990. évi C. törvény', title: 'Helyi adókról szóló tv. (Htv.)', njt_path: '1990-C' },
  iparűzési: { identifier: '1990. évi C. törvény', title: 'Htv. (iparűzési adó)', njt_path: '1990-C' },
  illeték: { identifier: '1990. évi XCIII. törvény', title: 'Illetékekről szóló tv. (Itv.)', njt_path: '1990-XCIII' },
  tb: { identifier: '2019. évi CXXII. törvény', title: 'Társadalombiztosítási tv. (Tbj.)', njt_path: '2019-CXXII' },
  szocho: { identifier: '2018. évi LII. törvény', title: 'Szociális hozzájárulási adóról szóló tv.', njt_path: '2018-LII' },
};

function resolveDate(input?: string): string {
  if (input && /^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  return new Date().toISOString().slice(0, 10);
}

function detectTaxTypes(query: string): string[] {
  const lower = query.toLowerCase();
  const types: string[] = [];
  for (const key of Object.keys(TAX_TYPE_MAP)) {
    if (lower.includes(key)) {
      types.push(key);
    }
  }
  // Általános adó kifejezések → ha nincs specifikus, adjuk az általános Art.-ot
  if (types.length === 0 && /adó|adóz|adózás|bevall|számla/i.test(query)) {
    types.push('áfa'); // leggyakoribb
  }
  return types;
}

// ---------------------------------------------------------------------------
// Invoke
// ---------------------------------------------------------------------------

async function invokeTaxChecklist(
  input: TaxChecklistInput & { id?: string },
  context: CoreAgentState,
): Promise<TaxChecklistOutput> {
  const query = input.query?.trim() || context.userMessage;
  const referenceDate = resolveDate(input.reference_date);
  const detectedTypes = input.tax_type
    ? [input.tax_type.toLowerCase()]
    : detectTaxTypes(query);

  const sources: LegalSource[] = detectedTypes
    .filter(t => TAX_TYPE_MAP[t])
    .map(t => {
      const law = TAX_TYPE_MAP[t];
      return {
        type: 'legislation' as const,
        identifier: law.identifier,
        title: law.title,
        validity_status: 'hatályos' as const,  // P1: Njt-ből ellenőrizzük
        validity_date: referenceDate,
        url: law.njt_path
          ? `https://net.jogtar.hu/jogszabaly?docid=${law.njt_path.replace('-', '')}.TV&timeshift=${referenceDate.replace(/-/g, '')}`
          : undefined,
      };
    });

  // LLM-alapú checklist generálás
  let answer: string;
  let confidence: 'high' | 'medium' | 'low' = 'medium';
  const checklist: TaxChecklistItem[] = [];

  if (process.env.OPENAI_API_KEY) {
    try {
      const { OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const taxContext = detectedTypes.length
        ? `Érintett adónemek: ${detectedTypes.join(', ')}`
        : 'Adónem: nem azonosított, általános áttekintés';

      const systemPrompt = `Te egy magyar adószakértő asszisztens vagy.

KÖTELEZŐ SZABÁLYOK:
1. A referencia dátum: ${referenceDate}. Erre a dátumra HATÁLYOS szabályokat ismertesd.
2. Minden szabálynál add meg a KONKRÉT jogszabályhelyet (tv. §, bekezdés, pont).
3. Vizsgáld az ÁTMENETI rendelkezéseket — ha van releváns, külön jelezd.
4. CHECKLIST formátumban válaszolj: szabály → alkalmazandó-e → jogszabályhely → megjegyzés.
5. Ha összeg (${input.amount ?? 'nincs megadva'} ${input.currency ?? 'HUF'}) releváns, számolj vele.
6. NE adj adóoptimalizálási tanácsot — csak a szabályokat ismertesd.
7. Ha helyi adó is releváns, jelezd, hogy önkormányzati rendelet szükséges.

${taxContext}

HIVATKOZOTT JOGSZABÁLYOK:
${sources.map(s => `- ${s.identifier} (${s.title})`).join('\n') || 'Nincs előre azonosított.'}

Válaszolj STRUKTURÁLTAN:
1. Alkalmazandó adószabályok (checklist)
2. Átmeneti rendelkezések
3. Figyelmeztetések / kockázatok`;

      const res = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query },
        ],
        temperature: 0.2,
        max_tokens: 2000,
      });

      answer = res.choices[0]?.message?.content?.trim() || 'Nem sikerült checklist-et készíteni.';
      if (sources.length >= 1) confidence = 'medium';
      if (sources.length >= 2) confidence = 'high';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ismeretlen hiba';
      answer = `Adó checklist hiba: ${message}. Kézi ellenőrzés szükséges.`;
      confidence = 'low';
    }
  } else {
    if (sources.length) {
      answer = `Érintett adónemek és jogszabályok:\n${sources.map(s => `• ${s.title} (${s.identifier})`).join('\n')}\n\nReferencia dátum: ${referenceDate}. Részletes checklist-hez adj meg OpenAI API kulcsot.`;
    } else {
      answer = `Nem tudtam adónemet azonosítani a kérdésből. Kérlek pontosítsd (pl. "ÁFA", "SZJA", "TAO", "KATA", "helyi adó").`;
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
    involvesMoney: true, // adó → mindig pénzügyi
    involvesDeadline: /határidő|bevall|benyújt|fizetés.*napja/i.test(query),
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
    checklist: checklist.length ? checklist : undefined,
  };
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

const inputSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    tax_type: { type: 'string', description: 'Adónem (áfa, szja, tao, kata, helyi_adó, stb.)' },
    query: { type: 'string', description: 'Adózási kérdés / szituáció' },
    reference_date: { type: 'string', description: 'Referencia dátum (YYYY-MM-DD)' },
    amount: { type: 'number', description: 'Összeg, ha releváns' },
    currency: { type: 'string', description: 'Pénznem (default: HUF)' },
  },
  required: ['query'],
};

const outputSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['legal'] },
    status: { type: 'string', enum: ['ok', 'not_found', 'error'] },
    response: { type: 'object' },
    checklist: { type: 'array' },
    error: { type: 'string' },
  },
};

export const taxChecklistCapability: CapabilityManifest<TaxChecklistInput, TaxChecklistOutput> = {
  id: 'tax-checklist-hu',
  version: '1.0',
  name: 'Magyar adó checklist',
  description:
    'ÁFA, SZJA, TAO, KATA, helyi adó és más adónemek checklist-je. ' +
    'Hatályos jogszabályok alapján, referencia-dátummal.',
  inputSchema,
  outputSchema,
  invoke: invokeTaxChecklist as any,
  tags: ['legal', 'tax', 'adó', 'áfa', 'szja', 'tao', 'kata', 'checklist', 'pénzügy'],
  priority: 9,
};

registerCapability(taxChecklistCapability);
