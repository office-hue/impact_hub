import fs from 'fs/promises';
import path from 'path';
import { NormalizedCoupon, SourceSnapshot } from './types.js';

const DEFAULT_GMAIL_PATH = process.env.GMAIL_PROMOTIONS_JSON
  || path.join(process.cwd(), 'tmp', 'ingest', 'gmail.json');

async function readFileIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (err) {
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
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw err;
  }
}

export async function loadGmailPromotions(filePath = DEFAULT_GMAIL_PATH): Promise<NormalizedCoupon[]> {
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
    console.warn(`Gmail promotions JSON parse error (${filePath}):`, err);
    return [];
  }
}

export async function getGmailSnapshot(filePath = DEFAULT_GMAIL_PATH): Promise<SourceSnapshot> {
  const records = await loadGmailPromotions(filePath);
  const lastUpdated = await getLastUpdated(filePath);
  return {
    id: 'gmail_structured',
    feature: 'gmail',
    count: records.length,
    lastUpdated,
    records,
  };
}
