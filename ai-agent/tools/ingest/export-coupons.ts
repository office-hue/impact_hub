#!/usr/bin/env tsx
import fs from 'fs/promises';
import path from 'path';

type Coupon = {
  source?: string;
  shop_slug?: string;
  shop_name?: string;
  coupon_code?: string;
  title?: string;
  description?: string;
  cta_url?: string;
  starts_at?: string;
  expires_at?: string;
  type?: string;
};

async function readJson(filePath: string): Promise<Coupon[]> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as Coupon[];
  } catch {
    return [];
  }
}

function escapeCsv(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

async function main() {
  const root = process.cwd();
  const ingestDir = path.join(root, 'tmp', 'ingest');
  const gmailPath = path.join(ingestDir, 'gmail.json');
  const arukeresoPath = path.join(ingestDir, 'arukereso.json');
  const outputPath = path.join(ingestDir, 'export-coupons.csv');

  const [gmail, arukereso] = await Promise.all([
    readJson(gmailPath),
    readJson(arukeresoPath),
  ]);
  const rows = [...gmail, ...arukereso];

  const headers = [
    'source',
    'shop_slug',
    'shop_name',
    'type',
    'coupon_code',
    'title',
    'description',
    'cta_url',
    'starts_at',
    'expires_at',
  ];

  const csv = [
    headers.join(','),
    ...rows.map(row => headers.map(h => escapeCsv((row as Record<string, unknown>)[h])).join(',')),
  ].join('\n');

  await fs.writeFile(outputPath, csv, 'utf8');
  console.log(`Exportált ${rows.length} kupon → ${outputPath}`);
}

main().catch(err => {
  console.error('Export hiba:', err);
  process.exit(1);
});
