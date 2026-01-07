import fs from 'node:fs/promises';
import path from 'node:path';

type CapabilityStats = {
  invocations: number;
  success: number;
  error: number;
  lastInvoked?: string;
};

const STATS_FILE =
  process.env.CAPABILITY_STATS_FILE ||
  path.resolve(process.cwd(), '.codex/state/capability-stats.json');

let cache: Record<string, CapabilityStats> | null = null;
let writeLock: Promise<unknown> = Promise.resolve();

function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeLock.then(fn, fn);
  writeLock = run.catch(() => undefined);
  return run;
}

async function loadStats(): Promise<Record<string, CapabilityStats>> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(STATS_FILE, 'utf8');
    cache = JSON.parse(raw);
    return cache!;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      cache = {};
      return cache;
    }
    throw error;
  }
}

async function saveStats(stats: Record<string, CapabilityStats>): Promise<void> {
  await fs.mkdir(path.dirname(STATS_FILE), { recursive: true });
  await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2), 'utf8');
  cache = stats;
}

export async function incrementCapabilityStats(capabilityId: string, success: boolean): Promise<void> {
  await withWriteLock(async () => {
    const stats = await loadStats();
    if (!stats[capabilityId]) {
      stats[capabilityId] = { invocations: 0, success: 0, error: 0 };
    }
    stats[capabilityId].invocations += 1;
    if (success) {
      stats[capabilityId].success += 1;
    } else {
      stats[capabilityId].error += 1;
    }
    stats[capabilityId].lastInvoked = new Date().toISOString();
    await saveStats(stats);
  });
}

export async function getCapabilityStats(capabilityId?: string): Promise<Record<string, CapabilityStats> | CapabilityStats | undefined> {
  const stats = await loadStats();
  if (!capabilityId) return stats;
  return stats[capabilityId];
}

export async function cleanupOldStats(maxAgeDays = 90): Promise<void> {
  await withWriteLock(async () => {
    const stats = await loadStats();
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    let changed = false;
    for (const [capId, stat] of Object.entries(stats)) {
      const lastInvoked = stat.lastInvoked ? new Date(stat.lastInvoked).getTime() : 0;
      if (lastInvoked && lastInvoked < cutoff) {
        delete stats[capId];
        changed = true;
      }
    }
    if (changed) {
      await saveStats(stats);
    }
  });
}

// Helper: egyszerű init hook, amit más modulból meg lehet hívni (pl. app start vagy periodikusan).
export async function cleanupOldStatsInit(): Promise<void> {
  try {
    await cleanupOldStats(90);
  } catch (error) {
    console.warn('cleanupOldStats failed', error);
  }
}
