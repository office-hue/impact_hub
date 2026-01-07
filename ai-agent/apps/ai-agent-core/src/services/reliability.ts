import fs from 'fs/promises';
import path from 'path';

export type ReliabilityLabel = 'super' | 'stable' | 'risky';

export interface ReliabilityScoreEntry {
  slug: string;
  score: number;
  label: ReliabilityLabel;
  last_verified?: string;
  sources?: string[];
  records?: number;
}

interface ReliabilityScoresPayload {
  generated_at?: string;
  scores: ReliabilityScoreEntry[];
  summary?: {
    average?: number;
    risky?: number;
    total?: number;
  };
}

const DEFAULT_SCORES_PATH = process.env.RELIABILITY_SCORES_JSON
  || path.join(process.cwd(), 'tmp', 'ingest', 'reliability-scores.json');
const LEGACY_SCORES_PATH = path.resolve(process.cwd(), '..', 'tools', 'out', 'sandbox', 'reliability-scores.json');

let cache: { path?: string; payload?: ReliabilityScoresPayload } = {};

async function readScores(filePath = DEFAULT_SCORES_PATH): Promise<ReliabilityScoresPayload> {
  if (cache.path === filePath && cache.payload) {
    return cache.payload;
  }
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const payload: ReliabilityScoresPayload = {
      generated_at: parsed.generated_at,
      scores: Array.isArray(parsed.scores) ? parsed.scores : [],
      summary: parsed.summary,
    };
    cache = { path: filePath, payload };
    return payload;
  } catch (err) {
    if (filePath !== LEGACY_SCORES_PATH) {
      return readScores(LEGACY_SCORES_PATH);
    }
    cache = {};
    return { scores: [] };
  }
}

export async function loadReliabilityScores(filePath = DEFAULT_SCORES_PATH): Promise<ReliabilityScoresPayload> {
  return readScores(filePath);
}

export async function lookupReliabilityScore(slug?: string): Promise<ReliabilityScoreEntry | undefined> {
  if (!slug) {
    return undefined;
  }
  const payload = await readScores();
  const target = slug.toLowerCase();
  return payload.scores.find(entry => entry.slug === target);
}

export async function getReliabilityFeatureStatus(): Promise<{ enabled: boolean; count: number; average?: number; risky?: number; last_run?: string }> {
  const payload = await readScores();
  const count = payload.scores.length;
  const average = payload.summary?.average ?? (count
    ? Number((payload.scores.reduce((sum, entry) => sum + entry.score, 0) / count).toFixed(2))
    : undefined);
  const risky = payload.summary?.risky ?? payload.scores.filter(entry => entry.label === 'risky').length;
  return {
    enabled: true,
    count,
    average,
    risky,
    last_run: payload.generated_at,
  };
}
