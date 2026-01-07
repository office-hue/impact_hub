#!/usr/bin/env tsx
import path from 'path';
import fs from 'fs/promises';
import { generateReliabilityReports } from './reliability.js';
import type { NormalizedCoupon } from '../../apps/ai-agent-core/src/sources/types.js';

const DEFAULT_DIR = path.join(process.cwd(), 'tmp', 'ingest');
const DEFAULT_MANUAL = path.join(DEFAULT_DIR, 'manual-coupons.json');
const DEFAULT_ARUKERESO = path.join(DEFAULT_DIR, 'arukereso.json');
const DEFAULT_GMAIL = path.join(DEFAULT_DIR, 'gmail.json');

async function readCoupons(filePath: string): Promise<NormalizedCoupon[]> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      return data as NormalizedCoupon[];
    }
    console.warn(`⚠️  ${filePath} nem tömb, kihagyom.`);
    return [];
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === 'ENOENT') {
      console.warn(`⚠️  ${filePath} nem található, kihagyom.`);
      return [];
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const manualPath = process.env.MANUAL_COUPONS_JSON || DEFAULT_MANUAL;
  const arukeresoPath = process.env.ARUKERESO_COUPONS_JSON || DEFAULT_ARUKERESO;
  const gmailPath = process.env.GMAIL_COUPONS_JSON || DEFAULT_GMAIL;
  const outputDir = process.env.RELIABILITY_OUTPUT_DIR || DEFAULT_DIR;

  const [manualCoupons, arukeresoCoupons, gmailCoupons] = await Promise.all([
    readCoupons(manualPath),
    readCoupons(arukeresoPath),
    readCoupons(gmailPath),
  ]);

  if (manualCoupons.length === 0 && arukeresoCoupons.length === 0 && gmailCoupons.length === 0) {
    console.warn('⚠️  Nem találtam forrás kupont, nincs mit feldolgozni.');
    return;
  }

  await fs.mkdir(outputDir, { recursive: true });
  await generateReliabilityReports(manualCoupons, arukeresoCoupons, gmailCoupons, outputDir);
}

main().catch(error => {
  console.error('❌ Reliability riport készítése sikertelen:', error);
  process.exit(1);
});
