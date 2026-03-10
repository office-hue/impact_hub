/**
 * Jogi / adójogi / pénzügyi válaszok típusdefiníciói.
 *
 * Minden jogi/adó capability-nek LegalCapabilityOutput-ot kell visszaadnia,
 * így a responseAssemblyNode egységes citation-first formátumot tud generálni.
 */

// ---------------------------------------------------------------------------
// Forrás típusok
// ---------------------------------------------------------------------------

export type LegalSourceType =
  | 'legislation'           // Jogszabály (Njt / net.jogtar.hu)
  | 'court_decision'        // Bírósági döntés (BH, EBH, Kúria)
  | 'administrative_ruling' // Hatósági határozat (NAV, MNB)
  | 'professional_material' // Szakmai anyag (NAV infó, MNB közlemény, NGM állásfoglalás)
  | 'local_ordinance';      // Helyi önkormányzati rendelet

export type ValidityStatus =
  | 'hatályos'
  | 'nem_hatályos'
  | 'módosított'
  | 'hatályon_kívül'
  | 'ismeretlen';

export interface LegalSource {
  /** Forrás típusa */
  type: LegalSourceType;
  /** Jogszabály / döntés azonosító, pl. "2007. évi CXXVII. törvény 85. § (1)" */
  identifier: string;
  /** Emberi-olvasható cím, pl. "Áfa tv." */
  title: string;
  /** Hatályossági állapot a referencia dátumra */
  validity_status: ValidityStatus;
  /** Hatályosság ellenőrzés dátuma (YYYY-MM-DD) */
  validity_date: string;
  /** Njt / Jogtar URL */
  url?: string;
  /** Releváns szövegrészlet (kivágat) */
  excerpt?: string;
}

// ---------------------------------------------------------------------------
// Válasz típus
// ---------------------------------------------------------------------------

export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface LegalResponse {
  /** A válasz érdemi szövege */
  answer: string;
  /** KÖTELEZŐ: hivatkozott források (min 1) */
  sources: LegalSource[];
  /** Mennyire megalapozott a válasz */
  confidence: ConfidenceLevel;
  /** Kockázati szint — high esetén requires_human_review = true */
  risk_level: RiskLevel;
  /** Draft-only mód: human review szükséges? */
  requires_human_review: boolean;
  /** Kötelező jogi disclaimer */
  disclaimer: string;
  /** Referencia dátum (YYYY-MM-DD) — erre a dátumra vizsgáltuk a hatályosságot */
  reference_date: string;
  /** Átmeneti rendelkezések, ha vannak */
  transitional_provisions?: string;
}

// ---------------------------------------------------------------------------
// Capability I/O típusok
// ---------------------------------------------------------------------------

export interface LegalLookupInput {
  /** Keresett jogszabály kulcsszó / azonosító */
  query: string;
  /** Referencia dátum — ha nincs megadva, today() */
  reference_date?: string;
  /** Specifikus § / bekezdés / pont */
  section?: string;
}

export interface LegalLookupOutput {
  kind: 'legal';
  status: 'ok' | 'not_found' | 'error';
  response?: LegalResponse;
  raw_sources?: LegalSource[];
  error?: string;
}

export interface TaxChecklistInput {
  /** Adónem (áfa, tao, szja, helyi_adó, kata, stb.) */
  tax_type?: string;
  /** Kérdés / szituáció leírása */
  query: string;
  /** Referencia dátum */
  reference_date?: string;
  /** Összeg (ha releváns) */
  amount?: number;
  /** Pénznem */
  currency?: string;
}

export interface TaxChecklistOutput {
  kind: 'legal';
  status: 'ok' | 'not_found' | 'error';
  response?: LegalResponse;
  checklist?: TaxChecklistItem[];
  error?: string;
}

export interface TaxChecklistItem {
  rule: string;
  applicable: boolean;
  source: LegalSource;
  note?: string;
}

// ---------------------------------------------------------------------------
// Disclaimer
// ---------------------------------------------------------------------------

export const LEGAL_DISCLAIMER =
  'Ez az elemzés kizárólag informatív jellegű, nem minősül jogi tanácsadásnak. ' +
  'Konkrét ügyben kérj ügyvédi, adótanácsadói vagy könyvelői véleményt. ' +
  'A hivatkozott jogszabályok hatályosságát a megadott referencia-dátumra ellenőriztük.';

export const LEGAL_DISCLAIMER_SHORT =
  '⚠️ Informatív jellegű, nem jogi tanács. Kérj szakértői véleményt.';
