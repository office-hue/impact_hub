import fs from 'fs/promises';
import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { pathToFileURL } from 'url';
import { parse } from 'csv-parse/sync';
import fetch from 'node-fetch';
import { loadShopRegistry, ShopRegistry } from './shops-registry.js';
import { generateReliabilityReports } from './reliability.js';

export type CouponType = 'coupon_code' | 'sale_event';
export type CouponSource = 'manual_csv' | 'arukereso_playwright' | 'gmail_structured';
export type ValidationStatus = 'untested' | 'validated' | 'expired' | 'rejected';

export interface NormalizedCoupon {
  source: CouponSource;
  shop_slug: string;
  shop_name: string;
  type: CouponType;
  coupon_code?: string;
  discount_label?: string;
  title?: string;
  description?: string;
  cta_url?: string;
  fillout_url?: string;
  price_huf?: number;
  starts_at?: string;
  expires_at?: string;
  scraped_at?: string;
  source_variant?: string;
  discovered_at?: string;
  validated_at?: string;
  validation_status?: ValidationStatus;
  validation_method?: string;
  reliability_seed: string;
  merchant_priority?: number;
  raw: Record<string, unknown>;
}

interface NormalizeOptions {
  manualCsvPath?: string;
  arukeresoPath?: string;
  gmailPath?: string;
  outputDir?: string;
  shopsCsvPath?: string;
  dealsSource?: string;
}

const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), 'tmp', 'ingest');
const DEFAULT_DEALS_URL = 'https://app.sharity.hu/wp-json/impactshop/v1/deals?limit=200';
const PRICE_FIELD_KEYS = [
  'price_huf',
  'product_price_huf',
  'deal_price_huf',
  'dognet_price_huf',
  'cj_price_huf',
  'avg_price_huf',
  'list_price_huf',
  'price',
  'product_price',
  'deal_price',
  'offer_price',
  'item_price',
  'amount_huf',
  'amount',
];

interface NormalizationContext {
  priceBySlug: Map<string, number>;
  priceByDomain: Map<string, number>;
}

function createContext(): NormalizationContext {
  return {
    priceBySlug: new Map(),
    priceByDomain: new Map(),
  };
}

function buildReliabilitySeed(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join('|');
}

function toIso(value?: string | number): string | undefined {
  if (!value) {
    return undefined;
  }
  if (typeof value === 'number') {
    return new Date(value).toISOString();
  }
  const ts = value.trim();
  if (!ts) {
    return undefined;
  }
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

function normalizeManualRecord(record: Record<string, string>): NormalizedCoupon {
  const slug = (record.shop_slug || record.slug || '').trim() || 'unknown';
  const name = (record.shop_name || record.name || slug).trim();
  const couponCode = (record.coupon_code || record.code || '').trim();
  const discount = (record.discount_label || record.discount || '').trim();
  const title = (record.title || record.headline || '').trim();
  const desc = (record.description || '').trim();
  const cta = (record.cta_url || record.url || '').trim();
  const fillout = (record.fillout_url || '').trim();
  const starts = toIso(record.starts_at);
  const expires = toIso(record.expires_at);
  const type: CouponType = couponCode ? 'coupon_code' : 'sale_event';

  return {
    source: 'manual_csv',
    shop_slug: slug,
    shop_name: name,
    type,
    coupon_code: couponCode || undefined,
    discount_label: discount || undefined,
    title: title || undefined,
    description: desc || undefined,
    cta_url: cta || undefined,
    fillout_url: fillout || undefined,
    starts_at: starts,
    expires_at: expires,
    scraped_at: undefined,
    reliability_seed: buildReliabilitySeed([slug, couponCode, expires, discount || title]),
    raw: record,
  };
}

function lookupShopEntry(
  registry: ShopRegistry | undefined,
  slug?: string,
  domainCandidates: Array<string | undefined> = [],
) {
  if (!registry) {
    return undefined;
  }
  const slugKey = slug?.toLowerCase();
  if (slugKey && registry.bySlug.has(slugKey)) {
    return registry.bySlug.get(slugKey);
  }
  for (const candidate of domainCandidates) {
    const domain = extractDomain(candidate);
    if (domain && registry.byDomain.has(domain)) {
      return registry.byDomain.get(domain);
    }
  }
  return undefined;
}

function hydrateCouponFromRegistry(
  coupon: NormalizedCoupon,
  registry: ShopRegistry | undefined,
  slug?: string,
  domainCandidates: Array<string | undefined> = [],
): void {
  const entry = lookupShopEntry(registry, slug ?? coupon.shop_slug, domainCandidates);
  if (!entry) {
    return;
  }
  if (!coupon.shop_name && entry.name) {
    coupon.shop_name = entry.name;
  }
  if (!coupon.fillout_url && entry.fillout_url) {
    coupon.fillout_url = entry.fillout_url;
  }
  if (!coupon.cta_url && (entry.default_cta_url || entry.go_url)) {
    coupon.cta_url = entry.default_cta_url || entry.go_url;
  }
}

function normalizeManualRecordWithContext(
  record: Record<string, string>,
  context: NormalizationContext,
  registry?: ShopRegistry,
): NormalizedCoupon {
  const coupon = normalizeManualRecord(record);
  const price = resolvePriceForRecord(record, coupon.shop_slug, [record.cta_url, record.fillout_url, record.source_ref], context);
  if (price) {
    coupon.price_huf = price;
  }
  hydrateCouponFromRegistry(coupon, registry, coupon.shop_slug, [record.cta_url, record.fillout_url, record.source_ref]);
  const nowIso = new Date().toISOString();
  coupon.discovered_at = toIso(record.discovered_at || record.created_at) || coupon.scraped_at || nowIso;
  coupon.validated_at = toIso(record.validated_at) || coupon.discovered_at;
  const status = (record.validation_status || '').toLowerCase() as ValidationStatus;
  coupon.validation_status = ['validated', 'expired', 'rejected'].includes(status) ? status : 'untested';
  coupon.validation_method = record.validation_method || 'manual_csv';
  return coupon;
}

function normalizeArukeresoRecord(
  record: Record<string, unknown>,
  context: NormalizationContext,
  registry?: ShopRegistry,
): NormalizedCoupon {
  const slug = typeof record.slug === 'string' ? record.slug : 'unknown';
  const title = typeof record.title === 'string' ? record.title : '';
  const desc = typeof record.headline === 'string' ? record.headline : '';
  const discountPercent = record.discountPercent ?? record.discount;
  const discount = typeof discountPercent === 'number'
    ? `${discountPercent}%`
    : typeof discountPercent === 'string'
      ? discountPercent
      : undefined;
  const couponCode = typeof record.couponCode === 'string' ? record.couponCode : undefined;
  const starts = typeof record.validFrom === 'string' ? toIso(record.validFrom) : undefined;
  const expires = typeof record.validUntil === 'string' ? toIso(record.validUntil) : undefined;
  const scraped = typeof record.scrapedAt === 'string' ? toIso(record.scrapedAt) : undefined;
  const url = typeof record.url === 'string' ? record.url : undefined;
  const fillout = typeof record.fillout_url === 'string' ? record.fillout_url : undefined;
  const type: CouponType = couponCode ? 'coupon_code' : 'sale_event';

  const coupon: NormalizedCoupon = {
    source: 'arukereso_playwright',
    shop_slug: slug,
    shop_name: slug,
    type,
    coupon_code: couponCode,
    discount_label: discount,
    title: title || undefined,
    description: desc || undefined,
    cta_url: url,
    fillout_url: fillout,
    starts_at: starts,
    expires_at: expires,
    scraped_at: scraped,
    reliability_seed: buildReliabilitySeed([slug, couponCode || title, expires, discount]),
    raw: record as Record<string, unknown>,
  };
  const price = resolvePriceForRecord(
    record as Record<string, unknown>,
    slug,
    [
      record.url as string | undefined,
      record.deeplink as string | undefined,
      record.shopDomain as string | undefined,
      record.fillout_url as string | undefined,
    ],
    context
  );
  if (price) {
    coupon.price_huf = price;
  }
  hydrateCouponFromRegistry(
    coupon,
    registry,
    slug,
    [
      record.url as string | undefined,
      record.deeplink as string | undefined,
      record.shopDomain as string | undefined,
      record.fillout_url as string | undefined,
    ],
  );
  const discovered = scraped || new Date().toISOString();
  coupon.discovered_at = discovered;
  coupon.validated_at = discovered;
  coupon.validation_status = 'untested';
  coupon.validation_method = 'playwright_snapshot';
  return coupon;
}

function parsePriceValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const normalized = trimmed
      .replace(/[^0-9,\.]/g, '')
      .replace(/,/g, '.');
    if (!normalized) {
      return undefined;
    }
    const parsed = Number(normalized);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return Math.round(parsed);
    }
  }
  return undefined;
}

function detectPriceInRecord(record: Record<string, unknown>): number | undefined {
  for (const field of PRICE_FIELD_KEYS) {
    if (record[field] !== undefined) {
      const price = parsePriceValue(record[field]);
      if (price) {
        return price;
      }
    }
  }
  for (const [key, value] of Object.entries(record)) {
    if (!PRICE_FIELD_KEYS.includes(key) && /(price|amount)/i.test(key)) {
      const price = parsePriceValue(value);
      if (price) {
        return price;
      }
    }
  }
  return undefined;
}

function extractDomain(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const withProto = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    const domain = new URL(withProto).hostname;
    return domain.toLowerCase();
  } catch (err) {
    const plain = trimmed.replace(/^[^a-z0-9]+/i, '');
    if (/^[a-z0-9.-]+$/i.test(plain)) {
      return plain.toLowerCase();
    }
    return undefined;
  }
}

function resolvePriceForRecord(
  record: Record<string, unknown>,
  slug: string,
  potentialDomains: Array<string | undefined>,
  context: NormalizationContext,
): number | undefined {
  const direct = detectPriceInRecord(record);
  if (direct) {
    return direct;
  }
  const slugKey = slug ? slug.toLowerCase() : undefined;
  if (slugKey && context.priceBySlug.has(slugKey)) {
    return context.priceBySlug.get(slugKey);
  }
  for (const candidate of potentialDomains) {
    const domain = extractDomain(candidate);
    if (domain && context.priceByDomain.has(domain)) {
      return context.priceByDomain.get(domain);
    }
  }
  return undefined;
}

async function loadShopsCsvPrices(filePath?: string, context?: NormalizationContext): Promise<void> {
  if (!filePath || !context) {
    return;
  }
  if (!existsSync(filePath)) {
    return;
  }
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
    }) as Record<string, string>[];
    rows.forEach(row => {
      const slug = (row.shop_slug || row.slug || row.id || '').trim().toLowerCase();
      const price = detectPriceInRecord(row);
      const domain = extractDomain(row.domain || row.shop_domain || row.url || row.cta_url);
      if (price) {
        if (slug) {
          context.priceBySlug.set(slug, price);
        }
        if (domain) {
          context.priceByDomain.set(domain, price);
        }
      }
    });
  } catch (err) {
    console.warn(`Shops.csv betöltése sikertelen (${filePath}):`, err);
  }
}

async function loadDealPriceEntries(source?: string): Promise<Array<{ slug?: string; domain?: string; price?: number }>> {
  if (!source) {
    return [];
  }
  try {
    let payload: unknown;
    if (/^https?:/i.test(source)) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Number(process.env.IMPACTSHOP_DEALS_TIMEOUT_MS || 8000));
      const response = await fetch(source, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) {
        console.warn(`Deals API hiba (${source}): HTTP ${response.status}`);
        return [];
      }
      payload = await response.json();
    } else {
      const raw = await fs.readFile(source, 'utf8');
      payload = JSON.parse(raw);
    }
    if (!Array.isArray(payload)) {
      return [];
    }
    return payload.map(item => {
      if (!item || typeof item !== 'object') {
        return {};
      }
      const record = item as Record<string, unknown>;
      const slug = typeof record.shop_slug === 'string' ? record.shop_slug : undefined;
      const deeplink = typeof record.deeplink === 'string' ? record.deeplink : undefined;
      const goUrl = typeof record.go_url === 'string' ? record.go_url : undefined;
      const url = typeof record.url === 'string' ? record.url : undefined;
      return {
        slug,
        domain: extractDomain(deeplink || goUrl || url),
        price: detectPriceInRecord(record),
      };
    });
  } catch (err) {
    console.warn(`Deals árak betöltése sikertelen (${source}):`, err);
    return [];
  }
}

async function buildPriceContext(options: { shopsCsvPath?: string; dealsSource?: string }): Promise<NormalizationContext> {
  const context = createContext();
  await loadShopsCsvPrices(options.shopsCsvPath, context);
  const dealEntries = await loadDealPriceEntries(options.dealsSource);
  dealEntries.forEach(entry => {
    if (entry.price) {
      if (entry.slug) {
        context.priceBySlug.set(entry.slug.toLowerCase(), entry.price);
      }
      if (entry.domain) {
        context.priceByDomain.set(entry.domain, entry.price);
      }
    }
  });
  return context;
}

async function normalizeManualCsv(
  manualCsvPath: string,
  context: NormalizationContext,
  registry?: ShopRegistry,
): Promise<NormalizedCoupon[]> {
  if (!manualCsvPath || !existsSync(manualCsvPath)) {
    console.warn(`Manual coupons CSV nem található: ${manualCsvPath}`);
    return [];
  }
  const raw = readFileSync(manualCsvPath, 'utf8');
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
  }) as Record<string, string>[];
  return rows.map(row => normalizeManualRecordWithContext(row, context, registry));
}

async function normalizeArukeresoJson(
  arukeresoPath: string,
  context: NormalizationContext,
  registry?: ShopRegistry,
): Promise<NormalizedCoupon[]> {
  if (!arukeresoPath || !existsSync(arukeresoPath)) {
    console.warn(`Árukereső JSON nem található: ${arukeresoPath}`);
    return [];
  }
  const raw = readFileSync(arukeresoPath, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    console.warn('Árukereső JSON nem tömb, kihagyom.');
    return [];
  }
  return data.map(item => normalizeArukeresoRecord(item as Record<string, unknown>, context, registry));
}

function normalizeGmailRecord(
  record: Record<string, unknown>,
  context: NormalizationContext,
  registry?: ShopRegistry,
): NormalizedCoupon {
  const slugFromRecord = typeof record.shop_slug === 'string' ? record.shop_slug : undefined;
  const entry = lookupShopEntry(
    registry,
    slugFromRecord,
    [record.shop_domain as string | undefined, (Array.isArray(record.urls) ? (record.urls[0] as string | undefined) : undefined)],
  );
  const slug = entry?.slug || slugFromRecord || 'unknown';
  const codes = Array.isArray(record.codes)
    ? (record.codes as unknown[]).filter(code => typeof code === 'string') as string[]
    : [];
  const urls = Array.isArray(record.urls)
    ? (record.urls as unknown[]).filter(url => typeof url === 'string') as string[]
    : [];
  const couponCode = codes[0];
  const type: CouponType = couponCode ? 'coupon_code' : 'sale_event';
  const title = typeof record.subject === 'string' ? record.subject : undefined;
  const desc = typeof record.snippet === 'string' ? record.snippet : undefined;
  const internalDate = typeof record.internal_date === 'string' ? toIso(record.internal_date) : undefined;
  const scrapedAt = typeof record.scraped_at === 'string' ? toIso(record.scraped_at) : undefined;
  const url = urls[0];
  const coupon: NormalizedCoupon = {
    source: 'gmail_structured',
    shop_slug: slug,
    shop_name: entry?.name || slug,
    type,
    coupon_code: couponCode,
    discount_label: undefined,
    title,
    description: desc,
    cta_url: url,
    fillout_url: undefined,
    starts_at: internalDate,
    expires_at: undefined,
    scraped_at: scrapedAt,
    reliability_seed: buildReliabilitySeed([slug, couponCode || title, scrapedAt]),
    raw: record,
  };
  const price = resolvePriceForRecord(
    record as Record<string, unknown>,
    slug,
    [url, record.shop_domain as string | undefined],
    context,
  );
  if (price) {
    coupon.price_huf = price;
  }
  hydrateCouponFromRegistry(coupon, registry, slug, [record.shop_domain as string | undefined, url]);
  coupon.discovered_at = scrapedAt || new Date().toISOString();
  coupon.validated_at = coupon.discovered_at;
  coupon.validation_status = 'untested';
  coupon.validation_method = 'gmail_snapshot';
  return coupon;
}

async function normalizeGmailJson(
  gmailPath: string,
  context: NormalizationContext,
  registry?: ShopRegistry,
): Promise<NormalizedCoupon[]> {
  if (!gmailPath || !existsSync(gmailPath)) {
    console.warn(`Gmail promotions JSON nem található: ${gmailPath}`);
    return [];
  }
  const raw = readFileSync(gmailPath, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    console.warn('Gmail promotions JSON nem tömb, kihagyom.');
    return [];
  }
  const mapped = data.map(item => normalizeGmailRecord(item as Record<string, unknown>, context, registry));
  const seenSeeds = new Set<string>();
  const deduped: NormalizedCoupon[] = [];
  for (const coupon of mapped) {
    const seed = coupon.reliability_seed;
    if (seed && seenSeeds.has(seed)) {
      continue;
    }
    if (seed) {
      seenSeeds.add(seed);
    }
    deduped.push(coupon);
  }
  return deduped;
}

export async function runNormalization(options: NormalizeOptions = {}): Promise<void> {
  const outputDir = options.outputDir || DEFAULT_OUTPUT_DIR;
  const rawDir = path.join(outputDir, 'raw');
  const manualCsv = options.manualCsvPath || path.join(rawDir, 'manual_coupons.csv');
  const arukeresoJson = options.arukeresoPath || path.join(rawDir, 'arukereso-promotions.json');
  const gmailJson = options.gmailPath || path.join(rawDir, 'gmail-promotions.json');
  const shopsCsv = options.shopsCsvPath
    || process.env.IMPACTSHOP_SHOPS_CSV
    || path.join(rawDir, 'Shops.csv');
  const dealsSource = process.env.IMPACTSHOP_DEALS_DISABLE === '1'
    ? undefined
    : options.dealsSource
      || process.env.IMPACTSHOP_DEALS_SOURCE
      || process.env.IMPACTSHOP_DEALS_API_URL
      || DEFAULT_DEALS_URL;

  await fs.mkdir(outputDir, { recursive: true });

  const priceContext = await buildPriceContext({ shopsCsvPath: shopsCsv, dealsSource });
  const shopRegistry = await loadShopRegistry().catch(err => {
    console.warn('Shop registry betöltése sikertelen, üres listát használok:', err);
    return { entries: [], bySlug: new Map(), byDomain: new Map() } satisfies ShopRegistry;
  });

  const [manualCoupons, arukeresoCoupons, gmailCoupons] = await Promise.all([
    normalizeManualCsv(manualCsv, priceContext, shopRegistry),
    normalizeArukeresoJson(arukeresoJson, priceContext, shopRegistry),
    normalizeGmailJson(gmailJson, priceContext, shopRegistry),
  ]);

  const manualOut = path.join(outputDir, 'manual-coupons.json');
  const arukeresoOut = path.join(outputDir, 'arukereso.json');
  const gmailOut = path.join(outputDir, 'gmail.json');

  await Promise.all([
    fs.writeFile(manualOut, JSON.stringify(manualCoupons, null, 2), 'utf8'),
    fs.writeFile(arukeresoOut, JSON.stringify(arukeresoCoupons, null, 2), 'utf8'),
    fs.writeFile(gmailOut, JSON.stringify(gmailCoupons, null, 2), 'utf8'),
  ]);

  await generateReliabilityReports(manualCoupons, arukeresoCoupons, gmailCoupons, outputDir);

  console.log(`Normalized ${manualCoupons.length} manual coupons → ${manualOut}`);
  console.log(`Normalized ${arukeresoCoupons.length} Árukereső rekord → ${arukeresoOut}`);
  console.log(`Normalized ${gmailCoupons.length} Gmail rekord → ${gmailOut}`);
}

const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (invokedDirectly) {
  runNormalization().catch(err => {
    console.error('Normalization failed:', err);
    process.exit(1);
  });
}
