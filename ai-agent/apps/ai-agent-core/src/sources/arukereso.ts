import fs from 'fs/promises';
import path from 'path';
import { NormalizedCoupon, SourceSnapshot } from './types.js';

const DEFAULT_JSON_PATH = process.env.ARUKERESO_COUPONS_JSON
  || path.join(process.cwd(), 'tools', 'out', 'arukereso-promotions.json');
const LEGACY_JSON_PATH = path.join(process.cwd(), 'tmp', 'ingest', 'arukereso.json');

interface PlaywrightPromotionRecord {
  slug?: string;
  url?: string;
  title?: string;
  headline?: string;
  discountPercent?: number;
  scrapedAt?: string;
}

async function readFileIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw err;
  }
}

async function getLastUpdated(filePath: string): Promise<string | undefined> {
  try {
    const stat = await fs.stat(filePath);
    return stat.mtime.toISOString();
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw err;
  }
}

function isNormalizedCoupon(record: unknown): record is NormalizedCoupon {
  return Boolean(
    record
      && typeof record === 'object'
      && typeof (record as NormalizedCoupon).shop_slug === 'string'
      && typeof (record as NormalizedCoupon).shop_name === 'string',
  );
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

function convertPlaywrightRecord(record: PlaywrightPromotionRecord, index: number): NormalizedCoupon | null {
  if (!record || (typeof record !== 'object')) {
    return null;
  }
  const url = typeof record.url === 'string' ? record.url : undefined;
  const title = typeof record.title === 'string' ? record.title : undefined;
  if (!url && !title) {
    return null;
  }
  let hostSlug: string | undefined;
  let shopName = 'Árukereső ajánlat';
  if (url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname;
      const prefix = host.replace(/\.arukereso\.hu$/i, '');
      shopName = prefix ? `${prefix} @ Árukereső` : 'Árukereső ajánlat';
      hostSlug = sanitizeSlug(prefix) || sanitizeSlug(host.split('.')[0]);
    } catch (err) {
      console.warn('Árukereső URL parse hiba:', err);
    }
  }
  const fallbackSlug = sanitizeSlug(record.slug) || hostSlug || `arukereso-${index + 1}`;
  const discountLabel = record.headline
    || (typeof record.discountPercent === 'number' ? `-${record.discountPercent}%` : undefined);
  return {
    source: 'arukereso_playwright',
    shop_slug: fallbackSlug || 'arukereso',
    shop_name: shopName,
    type: 'sale_event',
    discount_label: discountLabel,
    title,
    description: record.headline,
    cta_url: url,
    scraped_at: record.scrapedAt,
    raw: {
      slug: record.slug,
      url: record.url,
      headline: record.headline,
      discountPercent: record.discountPercent,
      scrapedAt: record.scrapedAt,
    },
  } satisfies NormalizedCoupon;
}

export async function loadArukeresoPromotions(filePath = DEFAULT_JSON_PATH): Promise<NormalizedCoupon[]> {
  const candidates = [filePath, LEGACY_JSON_PATH];
  for (const candidate of candidates) {
    const raw = await readFileIfExists(candidate);
    if (!raw) {
      continue;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        continue;
      }
      if (parsed.every(isNormalizedCoupon)) {
        return parsed as NormalizedCoupon[];
      }
      const converted = parsed
        .map((item, index) => convertPlaywrightRecord(item as PlaywrightPromotionRecord, index))
        .filter((item): item is NormalizedCoupon => Boolean(item));
      if (converted.length) {
        return converted;
      }
    } catch (err) {
      console.warn(`Árukereső JSON parse hiba (${candidate}):`, err);
    }
  }
  return [];
}

export async function getArukeresoSnapshot(filePath = DEFAULT_JSON_PATH): Promise<SourceSnapshot> {
  const records = await loadArukeresoPromotions(filePath);
  const lastUpdated = await getLastUpdated(filePath);
  return {
    id: 'arukereso_playwright',
    feature: 'playwright',
    count: records.length,
    lastUpdated,
    records,
  };
}
