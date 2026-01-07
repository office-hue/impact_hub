#!/usr/bin/env tsx
import fs from 'fs/promises';
import path from 'path';
import { chromium } from 'playwright';
import type { NormalizedCoupon } from '../ingest/normalizer.js';

const SOURCE_PATH = process.env.GMAIL_VALIDATION_INPUT || path.join(process.cwd(), 'tmp', 'ingest', 'gmail.json');
const OUTPUT_PATH = process.env.GMAIL_VALIDATION_OUTPUT || path.join(process.cwd(), 'tmp', 'ingest', 'gmail-validated.json');
const MAX_COUPONS = Number(process.env.GMAIL_VALIDATION_LIMIT || 20);
const TIMEOUT_MS = Number(process.env.GMAIL_VALIDATION_TIMEOUT || 15000);

interface VerificationResult extends NormalizedCoupon {
  validation_status: 'validated' | 'rejected';
  validation_method: string;
  validated_at: string;
  validation_details?: string;
}

async function readCoupons(filePath: string): Promise<NormalizedCoupon[]> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      return data as NormalizedCoupon[];
    }
    return [];
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      console.warn(`⚠️  Gmail kupon lista nem található: ${filePath}`);
      return [];
    }
    throw err;
  }
}

async function main(): Promise<void> {
  const coupons = await readCoupons(SOURCE_PATH);
  if (!coupons.length) {
    console.warn('⚠️  Nincs ellenőrizhető Gmail kupon.');
    return;
  }
  const toVerify = coupons.slice(0, MAX_COUPONS);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const results: VerificationResult[] = [];
  let success = 0;
  let fail = 0;

  for (const coupon of toVerify) {
    const page = await context.newPage();
    let status: 'validated' | 'rejected' = 'rejected';
    let details = '';
    try {
      if (!coupon.cta_url) {
        details = 'Nincs CTA URL';
      } else {
        console.log(`🔍 Ellenőrzés: ${coupon.shop_slug} → ${coupon.cta_url}`);
        const response = await page.goto(coupon.cta_url, {
          waitUntil: 'domcontentloaded',
          timeout: TIMEOUT_MS,
        });
        if (response && response.ok()) {
          status = 'validated';
          details = `HTTP ${response.status()}`;
          success += 1;
        } else {
          details = response ? `HTTP ${response.status()}` : 'Nincs válasz';
          fail += 1;
        }
      }
    } catch (err) {
      details = err instanceof Error ? err.message : 'ismeretlen hiba';
      fail += 1;
    } finally {
      await page.close();
    }

    results.push({
      ...coupon,
      validation_status: status,
      validation_method: 'playwright_link_check',
      validated_at: new Date().toISOString(),
      validation_details: details,
    });
  }

  await context.close();
  await browser.close();

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2), 'utf8');
  console.log(`✅ Gmail link ellenőrzés kész: ${success} PASS / ${fail} FAIL → ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('❌ Gmail Playwright ellenőrzés hiba:', err);
  process.exit(1);
});
