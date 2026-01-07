#!/usr/bin/env tsx
import fs from 'fs/promises';
import path from 'path';

const INGEST_DIR = process.env.AI_AGENT_INGEST_DIR || path.join(process.cwd(), 'tmp', 'ingest');
const MANUAL_STATS_PATH = process.env.MANUAL_STATS_PATH || path.join(INGEST_DIR, 'manual_coupons_stats.json');
const GMAIL_VALIDATED_PATH = process.env.GMAIL_VALIDATED_PATH || path.join(INGEST_DIR, 'gmail-validated.json');
const SCOREBOARD_PATH = process.env.RELIABILITY_SCOREBOARD || path.join(INGEST_DIR, 'reliability-scoreboard.json');

type ManualFeedbackEntry = {
  success?: number;
  fail?: number;
  last_verified?: string;
};

type GmailValidatedRecord = {
  shop_slug?: string;
  validation_status?: string;
  validated_at?: string;
};

interface ScoreboardEntry {
  slug: string;
  manual_success_rate?: number;
  manual_total: number;
  manual_success: number;
  ai_success_rate?: number;
  ai_total: number;
  ai_success: number;
  last_manual_verified?: string;
  last_ai_verified?: string;
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

function updateLast(current?: string, candidate?: string): string | undefined {
  if (!candidate) {
    return current;
  }
  if (!current) {
    return candidate;
  }
  return new Date(candidate).getTime() > new Date(current).getTime() ? candidate : current;
}

async function main(): Promise<void> {
  const manualStats = await readJson<{
    manual_feedback?: Record<string, ManualFeedbackEntry>;
  }>(MANUAL_STATS_PATH);
  const gmailValidated = await readJson<GmailValidatedRecord[]>(GMAIL_VALIDATED_PATH);

  const entries = new Map<string, ScoreboardEntry>();

  if (manualStats?.manual_feedback) {
    Object.entries(manualStats.manual_feedback).forEach(([slug, entry]) => {
      const bucket = entries.get(slug) || {
        slug,
        manual_total: 0,
        manual_success: 0,
        ai_total: 0,
        ai_success: 0,
      };
      const success = entry.success ?? 0;
      const fail = entry.fail ?? 0;
      bucket.manual_success += success;
      bucket.manual_total += success + fail;
      bucket.last_manual_verified = updateLast(bucket.last_manual_verified, entry.last_verified);
      entries.set(slug, bucket);
    });
  }

  if (Array.isArray(gmailValidated)) {
    gmailValidated.forEach(record => {
      const slug = (record.shop_slug || 'unknown').toLowerCase();
      const bucket = entries.get(slug) || {
        slug,
        manual_total: 0,
        manual_success: 0,
        ai_total: 0,
        ai_success: 0,
      };
      bucket.ai_total += 1;
      if ((record.validation_status || '').toLowerCase() === 'validated') {
        bucket.ai_success += 1;
      }
      bucket.last_ai_verified = updateLast(bucket.last_ai_verified, record.validated_at);
      entries.set(slug, bucket);
    });
  }

  const scoreboard: ScoreboardEntry[] = Array.from(entries.values()).map(entry => {
    const manualRate = entry.manual_total > 0 ? entry.manual_success / entry.manual_total : undefined;
    const aiRate = entry.ai_total > 0 ? entry.ai_success / entry.ai_total : undefined;
    return {
      ...entry,
      manual_success_rate: manualRate ? Number(manualRate.toFixed(2)) : undefined,
      ai_success_rate: aiRate ? Number(aiRate.toFixed(2)) : undefined,
    };
  });

  scoreboard.sort((a, b) => {
    const rateA = typeof a.ai_success_rate === 'number' ? a.ai_success_rate : -1;
    const rateB = typeof b.ai_success_rate === 'number' ? b.ai_success_rate : -1;
    return rateA - rateB;
  });

  const payload = {
    generated_at: new Date().toISOString(),
    entries: scoreboard,
  };

  await fs.mkdir(path.dirname(SCOREBOARD_PATH), { recursive: true });
  await fs.writeFile(SCOREBOARD_PATH, JSON.stringify(payload, null, 2), 'utf8');

  const risky = scoreboard.filter(entry => (entry.ai_success_rate ?? 1) < 0.4);
  console.log(`Scoreboard saved → ${SCOREBOARD_PATH} (risky=${risky.length})`);
}

main().catch(err => {
  console.error('collect-stats hiba:', err);
  process.exit(1);
});
