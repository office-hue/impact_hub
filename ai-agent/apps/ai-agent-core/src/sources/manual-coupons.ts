import fs from 'fs/promises';
import path from 'path';
import { NormalizedCoupon, SourceSnapshot } from './types.js';

const DEFAULT_MANUAL_PATH = process.env.MANUAL_COUPONS_JSON
  || path.join(process.cwd(), 'tmp', 'ingest', 'manual-coupons.json');

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

export async function loadManualCoupons(filePath = DEFAULT_MANUAL_PATH): Promise<NormalizedCoupon[]> {
  const raw = await readFileIfExists(filePath);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as NormalizedCoupon[];
    }
    return [];
  } catch (err) {
    console.warn(`Manual coupons JSON parse error (${filePath}):`, err);
    return [];
  }
}

export async function getManualSnapshot(filePath = DEFAULT_MANUAL_PATH): Promise<SourceSnapshot> {
  const records = await loadManualCoupons(filePath);
  const lastUpdated = await getLastUpdated(filePath);
  return {
    id: 'manual_csv',
    feature: 'harvester_bridge',
    count: records.length,
    lastUpdated,
    records,
  };
}
