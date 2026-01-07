import fs from 'fs/promises';
import path from 'path';
import type { NormalizedCoupon } from '../../apps/ai-agent-core/src/sources/types.js';

export type ReliabilityLabel = 'super' | 'stable' | 'risky';

function collectSlugMeta(coupons: NormalizedCoupon[]): Map<string, { sources: Set<string>; scrapedAt?: string; records: number }> {
  const map = new Map<string, { sources: Set<string>; scrapedAt?: string; records: number }>();
  coupons.forEach(coupon => {
    const slug = coupon.shop_slug?.toLowerCase();
    if (!slug) {
      return;
    }
    const bucket = map.get(slug) || { sources: new Set<string>(), scrapedAt: undefined, records: 0 };
    if (coupon.source) {
      bucket.sources.add(coupon.source);
    }
    if (coupon.scraped_at && (!bucket.scrapedAt || bucket.scrapedAt < coupon.scraped_at)) {
      bucket.scrapedAt = coupon.scraped_at;
    }
    bucket.records += 1;
    map.set(slug, bucket);
  });
  return map;
}

function computeAgeFactor(lastVerified?: string): number {
  if (!lastVerified) {
    return 0.3;
  }
  const parsed = Date.parse(lastVerified);
  if (Number.isNaN(parsed)) {
    return 0.3;
  }
  const ageDays = (Date.now() - parsed) / (1000 * 60 * 60 * 24);
  if (ageDays <= 3) {
    return 1;
  }
  if (ageDays <= 7) {
    return 0.8;
  }
  if (ageDays <= 30) {
    return 0.5;
  }
  if (ageDays <= 90) {
    return 0.3;
  }
  return 0.1;
}

function labelFromScore(score: number): ReliabilityLabel {
  if (score >= 0.75) {
    return 'super';
  }
  if (score >= 0.5) {
    return 'stable';
  }
  return 'risky';
}

export async function generateReliabilityReports(
  manualCoupons: NormalizedCoupon[],
  arukeresoCoupons: NormalizedCoupon[],
  gmailCoupons: NormalizedCoupon[],
  outputDir: string,
): Promise<void> {
  const statsByShop: Record<string, number> = {};
  const manualFeedback: Record<string, { success: number; fail: number; last_verified?: string }> = {};
  const reliabilityBySeed: Record<string, { count: number; sources: string[] }> = {};

  const touch = (coupon: NormalizedCoupon) => {
    const slug = coupon.shop_slug?.toLowerCase();
    if (slug) {
      statsByShop[slug] = (statsByShop[slug] || 0) + 1;
      if (coupon.source === 'manual_csv') {
        const bucket = manualFeedback[slug] || { success: 0, fail: 0 };
        const status = (coupon.validation_status || '').toLowerCase();
        if (status === 'rejected' || status === 'expired') {
          bucket.fail += 1;
        } else {
          bucket.success += 1;
          bucket.last_verified = coupon.expires_at || coupon.scraped_at || new Date().toISOString();
        }
        manualFeedback[slug] = bucket;
      }
    }
    if (coupon.reliability_seed) {
      const entry = reliabilityBySeed[coupon.reliability_seed] || { count: 0, sources: [] };
      entry.count += 1;
      if (coupon.source && !entry.sources.includes(coupon.source)) {
        entry.sources.push(coupon.source);
      }
      reliabilityBySeed[coupon.reliability_seed] = entry;
    }
  };

  manualCoupons.forEach(touch);
  arukeresoCoupons.forEach(touch);
  gmailCoupons.forEach(touch);

  const statsPayload = {
    generated_at: new Date().toISOString(),
    stats_by_shop: statsByShop,
    manual_feedback: manualFeedback,
    reliability_by_seed: reliabilityBySeed,
  };

  const statsPath = path.join(outputDir, 'manual_coupons_stats.json');
  await fs.writeFile(statsPath, JSON.stringify(statsPayload, null, 2), 'utf8');
  console.log(`Reliability stats → ${statsPath}`);

  const slugMeta = collectSlugMeta([...manualCoupons, ...arukeresoCoupons, ...gmailCoupons]);
  const entries: Array<{
    slug: string;
    score: number;
    label: ReliabilityLabel;
    last_verified?: string;
    sources: string[];
    records: number;
  }> = [];
  const allSlugs = new Set<string>([
    ...Object.keys(statsByShop),
    ...Object.keys(manualFeedback),
    ...slugMeta.keys(),
  ]);

  allSlugs.forEach(slug => {
    const feedback = manualFeedback[slug];
    const statsCount = statsByShop[slug] || 0;
    const activityFactor = Math.min(statsCount / 10, 1);
    const total = (feedback?.success || 0) + (feedback?.fail || 0);
    const manualSuccessRate = total > 0 ? Math.max(0, Math.min(1, (feedback?.success || 0) / total)) : 0.5;
    const ageFactor = computeAgeFactor(feedback?.last_verified);
    const score = Number((0.5 * manualSuccessRate + 0.3 * activityFactor + 0.2 * ageFactor).toFixed(2));
    const meta = slugMeta.get(slug);
    entries.push({
      slug,
      score,
      label: labelFromScore(score),
      last_verified: feedback?.last_verified,
      sources: meta ? Array.from(meta.sources) : [],
      records: meta?.records ?? 0,
    });
  });

  const avgScore = entries.length ? entries.reduce((sum, entry) => sum + entry.score, 0) / entries.length : 0;
  const riskyCount = entries.filter(entry => entry.label === 'risky').length;
  const reliabilityPayload = {
    generated_at: new Date().toISOString(),
    scores: entries.sort((a, b) => b.score - a.score),
    summary: {
      average: Number(avgScore.toFixed(2)),
      risky: riskyCount,
      total: entries.length,
    },
  };
  const reliabilityPath = path.join(outputDir, 'reliability-scores.json');
  await fs.writeFile(reliabilityPath, JSON.stringify(reliabilityPayload, null, 2), 'utf8');
  console.log(`Reliability scores → ${reliabilityPath} (avg=${reliabilityPayload.summary.average}, risky=${riskyCount})`);
}
