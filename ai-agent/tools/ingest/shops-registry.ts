import fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

export interface ShopRegistryEntry {
  slug: string;
  name?: string;
  domain?: string;
  default_cta_url?: string;
  fillout_url?: string;
  go_url?: string;
  arukereso_playwright?: boolean;
  default_d1?: string | null;
}

export interface ShopRegistry {
  entries: ShopRegistryEntry[];
  bySlug: Map<string, ShopRegistryEntry>;
  byDomain: Map<string, ShopRegistryEntry>;
}

const DEFAULT_REGISTRY_PATH = process.env.AI_AGENT_SHOPS_REGISTRY
  || path.join(process.cwd(), 'tools', 'shops_registry.json');
const DEFAULT_SHOPS_CSV = process.env.AI_AGENT_SHOPS_CSV
  || path.join(process.cwd(), 'tmp', 'ingest', 'raw', 'Shops.csv');
const DEFAULT_CJ_CSV = process.env.AI_AGENT_CJ_SHOPS_CSV
  || path.join(process.cwd(), 'tmp', 'ingest', 'raw', 'cj_shops.csv');
const FALLBACK_CJ_CSV = path.resolve(process.cwd(), '../impactshop-notes/tools/cj_shops.csv');
const DEFAULT_NGO_CODES = process.env.AI_AGENT_NGO_CODES
  || path.join(process.cwd(), 'ngo_codes.csv');
const FALLBACK_NGO_CODES = path.resolve(process.cwd(), '../impactshop-notes/ngo_codes.csv');
const SHOP_IMPACT_PATH = process.env.AI_AGENT_SHOP_IMPACT
  || path.join(process.cwd(), 'data', 'shop-impact.json');

const KEYWORD_NGO_DEFAULTS: Array<{ pattern: RegExp; ngo: string }> = [
  { pattern: /mobiltelefon|okostelefon|telefon/, ngo: 'magyar-gyermekmento' },
  { pattern: /okosora|aktivitasmero|wearable/, ngo: 'suhanj-alapitvany' },
  { pattern: /laptop|notebook|pc/, ngo: 'bator-tabor' },
  { pattern: /fulhallgato|fejhallgato|audio/, ngo: 'adamremenye' },
  { pattern: /jatekkonzol|konzol|gaming/, ngo: 'bator-tabor' },
  { pattern: /okos[-]?eszkoz|smart|tech-deal/, ngo: 'united-way-magyarorszag' },
  { pattern: /led|lcd|oled|tv/, ngo: 'tiszaert' },
  { pattern: /beauty|wellness|szepseg/, ngo: 'adamremenye' },
  { pattern: /sport|szabadido/, ngo: 'suhanj-alapitvany' },
];

function normalizeEntry(raw: Record<string, unknown>): ShopRegistryEntry | undefined {
  const slug = typeof raw.slug === 'string' ? raw.slug.trim().toLowerCase() : undefined;
  if (!slug) {
    return undefined;
  }
  const name = typeof raw.name === 'string' ? raw.name.trim() : undefined;
  const domain = typeof raw.domain === 'string' ? raw.domain.trim().toLowerCase() : undefined;
  const defaultCta = typeof raw.default_cta_url === 'string' ? raw.default_cta_url.trim() : undefined;
  const fillout = typeof raw.fillout_url === 'string' ? raw.fillout_url.trim() : undefined;
  const goUrl = typeof raw.go_url === 'string' ? raw.go_url.trim() : undefined;
  const arukeresoPlaywright = raw.arukereso_playwright === true;
  const defaultD1 = typeof raw.default_d1 === 'string' ? raw.default_d1.trim().toLowerCase() : undefined;
  return {
    slug,
    name,
    domain,
    default_cta_url: defaultCta,
    fillout_url: fillout,
    go_url: goUrl,
    arukereso_playwright: arukeresoPlaywright,
    default_d1: defaultD1 || undefined,
  };
}

export async function loadShopRegistry(registryPath?: string): Promise<ShopRegistry> {
  const target = registryPath || DEFAULT_REGISTRY_PATH;
  try {
    const raw = await fs.readFile(target, 'utf8');
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed)
      ? (parsed
          .map(item => (item && typeof item === 'object' ? normalizeEntry(item as Record<string, unknown>) : undefined))
          .filter((entry): entry is ShopRegistryEntry => Boolean(entry)))
      : [];
    const bySlug = new Map<string, ShopRegistryEntry>();
    const byDomain = new Map<string, ShopRegistryEntry>();
    entries.forEach(entry => {
      bySlug.set(entry.slug.toLowerCase(), entry);
      if (entry.domain) {
        byDomain.set(entry.domain.toLowerCase(), entry);
      }
    });
    const ngoOverrides = await loadNgoOverrides();
    ngoOverrides.forEach((ngoSlug, slug) => {
      const entry = bySlug.get(slug);
      if (entry) {
        entry.default_d1 = ngoSlug;
      }
    });
    return { entries, bySlug, byDomain };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn(`Shop registry nem található: ${target}`);
      return { entries: [], bySlug: new Map(), byDomain: new Map() };
    }
    throw err;
  }
}

export function findShopBySlug(registry: ShopRegistry, slug?: string): ShopRegistryEntry | undefined {
  if (!slug) {
    return undefined;
  }
  return registry.bySlug.get(slug.toLowerCase());
}

export function findShopByDomain(registry: ShopRegistry, domain?: string): ShopRegistryEntry | undefined {
  if (!domain) {
    return undefined;
  }
  return registry.byDomain.get(domain.toLowerCase());
}

async function loadNgoOverrides(): Promise<Map<string, string>> {
  const overrides = new Map<string, string>();
  const ngoCodes = loadNgoCodeMap([
    DEFAULT_NGO_CODES,
    FALLBACK_NGO_CODES,
  ]);
  const candidatePaths = [
    DEFAULT_SHOPS_CSV,
    DEFAULT_CJ_CSV,
    FALLBACK_CJ_CSV,
  ];
  for (const candidate of candidatePaths) {
    if (!candidate) {
      continue;
    }
    if (!existsSync(candidate)) {
      continue;
    }
    const content = readFileSync(candidate, 'utf8');
    if (!content.trim()) {
      continue;
    }
    try {
      const rows = parse(content, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
      }) as Array<Record<string, string>>;
      for (const row of rows) {
        const slug = sanitizeShopSlug(row);
        const ngo = extractNgoSlugFromRow(row, ngoCodes);
        if (!slug || !ngo) {
          continue;
        }
        overrides.set(slug, ngo);
      }
    } catch (error) {
      console.warn(`⚠️  Nem sikerült beolvasni a CSV-t: ${candidate}`, error);
    }
  }
  const impactOverrides = loadShopImpactOverrides(ngoCodes);
  impactOverrides.forEach((ngoSlug, slug) => {
    if (!overrides.has(slug)) {
      overrides.set(slug, ngoSlug);
    }
  });
  return overrides;
}

export function resolveDefaultNgoSlug(
  registry: ShopRegistry,
  slug?: string,
  domain?: string,
): string | undefined {
  const slugKey = slug?.toLowerCase();
  if (slugKey && registry.bySlug.has(slugKey)) {
    const entry = registry.bySlug.get(slugKey);
    if (entry?.default_d1) {
      return entry.default_d1;
    }
  }
  if (domain) {
    const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
    const entry = registry.byDomain.get(normalizedDomain);
    if (entry?.default_d1) {
      return entry.default_d1;
    }
  }
  const keywordFallback = matchKeywordNgoSlug(slugKey) || matchKeywordNgoSlug(domain);
  if (keywordFallback) {
    return keywordFallback;
  }
  return undefined;
}

function sanitizeShopSlug(row: Record<string, string>): string | undefined {
  const candidates = [row.shop_slug, row.slug, row.program_id, row.advertiser_id];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim().toLowerCase();
    }
  }
  return undefined;
}

function normalizeNgoName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
}

function extractNgoSlugFromRow(row: Record<string, string>, ngoCodes: Map<string, string>): string | undefined {
  const direct = [row.ngo_slug, row.default_d1, row.d1]
    .map(value => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
    .find(value => Boolean(value));
  if (direct) {
    return direct;
  }
  const name = (row.ngo_name || row.ngo || row.default_d1_name || row['NGO'] || row['Név']) as string | undefined;
  if (!name) {
    return undefined;
  }
  return ngoCodes.get(normalizeNgoName(name));
}

function loadNgoCodeMap(paths: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const candidate of paths) {
    if (!candidate || !existsSync(candidate)) {
      continue;
    }
    try {
      const content = readFileSync(candidate, 'utf8');
      if (!content.trim()) {
        continue;
      }
      const rows = parse(content, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
      }) as Array<Record<string, string>>;
      for (const row of rows) {
        const name = (row['Név'] || row['name'] || row['NGO_name']) as string | undefined;
        const slug = (row['NGO_kod'] || row['ngo_slug'] || row['slug']) as string | undefined;
        if (!name || !slug) {
          continue;
        }
        map.set(normalizeNgoName(name), slug.trim().toLowerCase());
      }
    } catch (error) {
      console.warn(`⚠️  NGO lista beolvasása sikertelen: ${candidate}`, error);
    }
  }
  return map;
}

function loadShopImpactOverrides(ngoCodes: Map<string, string>): Map<string, string> {
  const overrides = new Map<string, string>();
  if (!SHOP_IMPACT_PATH || !existsSync(SHOP_IMPACT_PATH)) {
    return overrides;
  }
  try {
    const raw = readFileSync(SHOP_IMPACT_PATH, 'utf8');
    if (!raw.trim()) {
      return overrides;
    }
    const entries = JSON.parse(raw) as Array<Record<string, unknown>>;
    entries.forEach(entry => {
      const slug = typeof entry.shop_slug === 'string' ? entry.shop_slug.trim().toLowerCase() : undefined;
      if (!slug) {
        return;
      }
      let ngoSlug = typeof entry.ngo_slug === 'string' ? entry.ngo_slug.trim().toLowerCase() : undefined;
      if (!ngoSlug && typeof entry.ngo === 'string') {
        const normalized = normalizeNgoName(entry.ngo);
        ngoSlug = ngoCodes.get(normalized) || normalized;
      }
      if (ngoSlug) {
        overrides.set(slug, ngoSlug);
      }
    });
  } catch (error) {
    console.warn(`⚠️  Nem sikerült beolvasni a shop-impact fájlt: ${SHOP_IMPACT_PATH}`, error);
  }
  return overrides;
}

function matchKeywordNgoSlug(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const target = value.toLowerCase();
  const hit = KEYWORD_NGO_DEFAULTS.find(entry => entry.pattern.test(target));
  return hit?.ngo;
}
