import fs from 'fs/promises';
import path from 'path';
import { NormalizedCoupon, SourceSnapshot } from './types.js';

const DEFAULT_CJ_LINKS_PATH = process.env.CJ_LINKS_JSON
  || path.join(process.cwd(), 'data', 'cj-links-latest.json');

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

interface CjLinkRow {
  link_id?: string;
  advertiser_id?: string;
  advertiser_name?: string;
  link_name?: string;
  description?: string;
  language?: string;
  promotion_type?: string;
  coupon_code?: string;
  click_url?: string;
  destination?: string;
  promotion_start?: string;
  promotion_end?: string;
  category?: string;
  is_coupon?: boolean;
}

function normalizeCjLinks(rows: CjLinkRow[]): NormalizedCoupon[] {
  const results: NormalizedCoupon[] = [];
  for (const row of rows) {
    const advertiserId = String(row.advertiser_id ?? '').trim();
    const linkId = String(row.link_id ?? '').trim();
    const shopSlug = advertiserId ? `cj-${advertiserId}` : '';
    const cta = (row.click_url && row.click_url.trim()) || (row.destination && row.destination.trim()) || '';
    if (!shopSlug || !cta) {
      continue;
    }
    const normalized: NormalizedCoupon = {
      source: 'cj',
      shop_slug: shopSlug,
      shop_name: row.advertiser_name || shopSlug,
      type: row.is_coupon ? 'coupon_code' : 'sale_event',
      coupon_code: row.coupon_code || undefined,
      title: row.link_name || undefined,
      description: row.description || undefined,
      cta_url: cta,
      starts_at: row.promotion_start || undefined,
      expires_at: row.promotion_end || undefined,
      discount_label: row.promotion_type || undefined,
      reliability_seed: linkId ? `${shopSlug}|${linkId}` : shopSlug,
      source_variant: 'cj_links',
      raw: row as Record<string, unknown>,
    };
    results.push(normalized);
  }
  return results;
}

export async function loadCjLinks(filePath = DEFAULT_CJ_LINKS_PATH): Promise<NormalizedCoupon[]> {
  const raw = await readFileIfExists(filePath);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return normalizeCjLinks(parsed as CjLinkRow[]);
    }
    return [];
  } catch (err) {
    console.warn(`CJ links JSON parse error (${filePath}):`, err);
    return [];
  }
}

export async function getCjSnapshot(filePath = DEFAULT_CJ_LINKS_PATH): Promise<SourceSnapshot> {
  const records = await loadCjLinks(filePath);
  const lastUpdated = await getLastUpdated(filePath);
  return {
    id: 'cj_links',
    feature: 'harvester_bridge',
    count: records.length,
    lastUpdated,
    records,
  };
}
