import path from 'path';
import fs from 'fs/promises';
import { createRequire } from 'module';
import type { NormalizedCoupon } from '../sources/types.js';
import { lookupReliabilityScore } from '../services/reliability.js';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const impactTable = require('../../../../data/shop-impact.json');

type ImpactEntry = {
  shop_slug: string;
  shop_name: string;
  ngo: string;
  ngo_slug?: string;
  donation_rate: number;
  category?: string;
};

const table: ImpactEntry[] = impactTable as ImpactEntry[];
const map = new Map<string, ImpactEntry>();

for (const entry of table) {
  map.set(entry.shop_slug.toLowerCase(), entry);
}

export function lookupImpact(slug: string): ImpactEntry | undefined {
  if (!slug) {
    return undefined;
  }
  return map.get(slug.toLowerCase());
}

export function getTopImpactEntries(limit = 3): ImpactEntry[] {
  return [...table]
    .sort((a, b) => (b.donation_rate || 0) - (a.donation_rate || 0))
    .slice(0, limit);
}

export function buildGoLink(slug: string, ngoSlug?: string, base = 'https://app.sharity.hu/go'): string | undefined {
  if (!slug) {
    return undefined;
  }
  const url = new URL(base);
  url.searchParams.set('shop', slug);
  if (ngoSlug) {
    url.searchParams.set('d1', ngoSlug);
  }
  url.searchParams.set('src', 'impi');
  return url.toString();
}

interface ManualFeedbackEntry {
  success?: number;
  fail?: number;
  last_verified?: string;
}

const cache: { stats?: Record<string, number>; feedback?: Record<string, ManualFeedbackEntry> } = {};
const DEFAULT_STATS_PATH = process.env.MANUAL_COUPONS_STATS
  || path.join(process.cwd(), 'tmp', 'ingest', 'manual_coupons_stats.json');
const LEGACY_STATS_PATH = path.resolve(process.cwd(), '..', 'tools', 'out', 'sandbox', 'manual_coupons_stats.json');

async function loadStats(filePath = DEFAULT_STATS_PATH): Promise<{ stats: Record<string, number>; feedback: Record<string, ManualFeedbackEntry> }> {
  if (cache.stats && cache.feedback) {
    return { stats: cache.stats, feedback: cache.feedback };
  }
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const stats = parsed?.stats_by_shop && typeof parsed.stats_by_shop === 'object'
      ? parsed.stats_by_shop
      : {};
    const feedback = parsed?.manual_feedback && typeof parsed.manual_feedback === 'object'
      ? parsed.manual_feedback
      : {};
    cache.stats = stats;
    cache.feedback = feedback;
    return { stats, feedback };
  } catch (err) {
    if (filePath !== LEGACY_STATS_PATH) {
      return loadStats(LEGACY_STATS_PATH);
    }
    cache.stats = {};
    cache.feedback = {};
    return { stats: {}, feedback: {} };
  }
}

async function resolveReliabilityFallback(coupon: NormalizedCoupon): Promise<number> {
  const { stats, feedback } = await loadStats();
  const slug = coupon.shop_slug?.toLowerCase();
  let reliability = 0.4;

  // CJ alapértelmezett küszöb: legyen magasabb, hogy ne essen ki a reliability szűrőn
  if (coupon.source === 'cj' || (slug && slug.startsWith('cj-'))) {
    reliability = Math.max(reliability, 0.7);
  }

  if (coupon.source === 'manual_csv') {
    reliability += 0.3;
  } else if (coupon.source === 'arukereso_playwright') {
    reliability += 0.15;
  }

  if (slug && stats[slug]) {
    reliability += Math.min(0.2, stats[slug] * 0.01);
  }

  const feedbackEntry = slug ? feedback[slug] : undefined;
  if (feedbackEntry && typeof feedbackEntry.success === 'number') {
    const total = (feedbackEntry.success || 0) + (feedbackEntry.fail || 0);
    if (total > 0) {
      const ratio = feedbackEntry.success / total;
      reliability += Math.min(0.15, (ratio - 0.5) * 0.3);
    }
    if (feedbackEntry.last_verified) {
      const ageMs = Date.now() - Date.parse(feedbackEntry.last_verified);
      if (!Number.isNaN(ageMs) && ageMs < 1000 * 60 * 60 * 24 * 7) {
        reliability += 0.05;
      }
    }
  }

  if (slug && slug.includes('needs_mapping')) {
    reliability -= 0.25;
  }

  if (coupon.coupon_code) {
    reliability += 0.1;
  }

  if (reliability < 0.1) {
    reliability = 0.1;
  } else if (reliability > 0.95) {
    reliability = 0.95;
  }

  return Number(reliability.toFixed(2));
}

export async function resolveReliabilitySeed(coupon: NormalizedCoupon): Promise<number> {
  const slug = coupon.shop_slug?.toLowerCase();
  if (slug) {
    const entry = await lookupReliabilityScore(slug);
    if (entry) {
      return Number(entry.score.toFixed(2));
    }
  }
  return resolveReliabilityFallback(coupon);
}
