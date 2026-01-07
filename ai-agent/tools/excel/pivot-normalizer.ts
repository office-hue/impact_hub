#!/usr/bin/env tsx
import path from 'path';
import fs from 'fs/promises';

interface CliArgs {
  input: string;
  output?: string;
}

interface PivotRow {
  cells: Array<{ value: unknown }>;
}

interface SheetPayload {
  name: string;
  rows: PivotRow[];
}

function parseArgs(): CliArgs {
  const args: Record<string, string> = {};
  for (const token of process.argv.slice(2)) {
    const [key, value] = token.split('=');
    if (key.startsWith('--')) {
      args[key.replace(/^--/, '')] = value ?? '';
    }
  }
  if (!args.input) {
    throw new Error('Használat: tsx tools/excel/pivot-normalizer.ts --input=sheet.json [--output=normalized.json]');
  }
  return { input: args.input, output: args.output };
}

async function normalizePivot({ input, output }: CliArgs): Promise<void> {
  const raw = await fs.readFile(path.resolve(input), 'utf8');
  const sheet = JSON.parse(raw) as SheetPayload;
  if (!Array.isArray(sheet.rows) || !sheet.rows.length) {
    throw new Error('A sheet JSON nem tartalmaz sorokat.');
  }
  const headerRow = sheet.rows[0];
  const headers = headerRow.cells.map(cell => String(cell.value ?? '').trim());
  const dimensionHeaders = headers.slice(0, 1);
  const metricHeaders = headers.slice(1);
  const flattened = sheet.rows.slice(1).flatMap(row => {
    const dimValue = String(row.cells[0]?.value ?? '').trim();
    return row.cells.slice(1).map((cell, index) => ({
      dimension: dimValue,
      metric: metricHeaders[index] ?? `Metric${index + 1}`,
      value: cell?.value ?? null,
    }));
  });
  const payload = {
    sheet: sheet.name,
    dimensions: dimensionHeaders,
    metrics: metricHeaders,
    rows: flattened,
  };
  const target = output ? path.resolve(output) : path.resolve(path.dirname(input), `${sheet.name}-normalized.json`);
  await fs.writeFile(target, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`✅ Pivot normalizálás kész: ${target}`);
}

normalizePivot(parseArgs()).catch(error => {
  console.error('Pivot normalizer hiba:', error instanceof Error ? error.message : error);
  process.exit(1);
});
