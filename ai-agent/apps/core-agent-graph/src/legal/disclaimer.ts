/**
 * Jogi disclaimer és guardrail segédfüggvények.
 *
 * Minden jogi/adó/pénzügyi capability válaszához kötelezően hozzáadja
 * a disclaimert, és risk_level=high esetén requires_human_review=true-ra állít.
 */

import type { LegalResponse, RiskLevel } from './types.js';
import { LEGAL_DISCLAIMER } from './types.js';

/**
 * Ellenőrzi, hogy a LegalResponse megfelel-e a kötelező output contract-nak.
 * Ha nem, javítja (disclaimer, requires_human_review, reference_date).
 */
export function enforceLegalGuardrails(response: LegalResponse): LegalResponse {
  const enforced = { ...response };

  // 1. Disclaimer mindig legyen
  if (!enforced.disclaimer || enforced.disclaimer.trim().length === 0) {
    enforced.disclaimer = LEGAL_DISCLAIMER;
  }

  // 2. High risk → requires_human_review = true
  if (enforced.risk_level === 'high') {
    enforced.requires_human_review = true;
  }

  // 3. Reference date mindig legyen (fallback: today)
  if (!enforced.reference_date) {
    enforced.reference_date = new Date().toISOString().slice(0, 10);
  }

  // 4. Sources: legalább 1 kellene — ha nincs, confidence=low
  if (!enforced.sources || enforced.sources.length === 0) {
    enforced.confidence = 'low';
    enforced.sources = [];
  }

  return enforced;
}

/**
 * Meghatározza a kockázati szintet a kontextus alapján.
 */
export function assessRiskLevel(params: {
  hasVerifiedSources: boolean;
  confidence: 'high' | 'medium' | 'low';
  involvesMoney: boolean;
  involvesDeadline: boolean;
}): RiskLevel {
  // Nincs ellenőrzött forrás → high
  if (!params.hasVerifiedSources) return 'high';

  // Pénzügyi téma + alacsony confidence → high
  if (params.involvesMoney && params.confidence === 'low') return 'high';

  // Határidős kérdés + nincs magas confidence → medium+
  if (params.involvesDeadline && params.confidence !== 'high') return 'high';

  // Alacsony confidence egyébként → medium
  if (params.confidence === 'low') return 'medium';

  // Medium confidence → medium
  if (params.confidence === 'medium') return 'medium';

  return 'low';
}

/**
 * Tiltott mintákat keres a válaszban.
 * Ha talál, figyelmeztetést ad.
 */
const PROHIBITED_PATTERNS = [
  /optimalizál.*adó/i,
  /adóelkerül/i,
  /illegális.*megtakarítás/i,
  /nem kell bevallani/i,
  /rejtsd el/i,
  /titkol/i,
  /fekete.*gazdaság/i,
  /számlázz.*kevesebb/i,
];

export function checkProhibitedPatterns(text: string): string[] {
  const warnings: string[] = [];
  for (const pattern of PROHIBITED_PATTERNS) {
    if (pattern.test(text)) {
      warnings.push(`Tiltott minta észlelve: ${pattern.source}`);
    }
  }
  return warnings;
}

/**
 * Formázza a disclaimer szöveget az adott kontextusra.
 */
export function formatDisclaimer(params: {
  risk_level: RiskLevel;
  reference_date: string;
  requires_human_review: boolean;
}): string {
  const parts = [LEGAL_DISCLAIMER];

  if (params.requires_human_review) {
    parts.push(
      '\n\n🔒 **DRAFT — Szakértői jóváhagyás szükséges.** ' +
      'Ez a válasz vázlat státuszú, mert magas kockázatú témát érint.',
    );
  }

  parts.push(`\n\n📅 Referencia-dátum: ${params.reference_date}`);

  return parts.join('');
}
