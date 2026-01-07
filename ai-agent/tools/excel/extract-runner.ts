#!/usr/bin/env tsx
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import ExcelJS from 'exceljs';

interface CliArgs {
  file: string;
  outDir?: string;
  sheet?: string;
}

interface CellPayload {
  column: number;
  address: string;
  value: unknown;
  formula?: string;
}

interface RowPayload {
  rowNumber: number;
  cells: CellPayload[];
}

interface SheetPayload {
  name: string;
  index: number;
  rowCount: number;
  columnCount: number;
  rows: RowPayload[];
}

function parseArgs(): CliArgs {
  const args: Record<string, string> = {};
  for (const token of process.argv.slice(2)) {
    const [key, value] = token.split('=');
    if (key.startsWith('--')) {
      args[key.replace(/^--/, '')] = value ?? '';
    }
  }
  if (!args.file) {
    throw new Error('Használat: tsx tools/excel/extract-runner.ts --file=path/to.xlsx [--outDir=tmp/ingest/excel] [--sheet="Sheet1"]');
  }
  return {
    file: args.file,
    outDir: args.outDir,
    sheet: args.sheet,
  };
}

async function ensureDir(target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true });
}

async function writeJson(targetPath: string, payload: unknown): Promise<void> {
  await ensureDir(path.dirname(targetPath));
  await fs.writeFile(targetPath, JSON.stringify(payload, null, 2), 'utf8');
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

async function extractWorkbook({ file, outDir, sheet }: CliArgs): Promise<void> {
  if (!existsSync(file)) {
    throw new Error(`A megadott fájl nem létezik: ${file}`);
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const targetDir = outDir ? path.resolve(outDir) : path.resolve('tmp/ingest/excel', `${Date.now()}`);
  await ensureDir(targetDir);

  const metadata = {
    source: path.resolve(file),
    generated_at: new Date().toISOString(),
    sheets: [] as Array<{ name: string; index: number; rowCount: number; columnCount: number }>,
  };

  const selectedSheets = sheet ? workbook.worksheets.filter(ws => ws.name === sheet) : workbook.worksheets;
  if (!selectedSheets.length) {
    throw new Error(`Nincs ilyen munkalap: ${sheet}`);
  }

  for (const worksheet of selectedSheets) {
    const sheetId = typeof (worksheet as any).id === 'number' ? (worksheet as any).id : selectedSheets.indexOf(worksheet) + 1;
    const rows: RowPayload[] = [];
    worksheet.eachRow((row, rowNumber) => {
      const cells: CellPayload[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cells.push({
          column: colNumber,
          address: cell.address,
          value: cell.value ?? null,
          formula: cell.model?.formula ?? undefined,
        });
      });
      rows.push({ rowNumber, cells });
    });

    const payload: SheetPayload = {
      name: worksheet.name,
      index: sheetId,
      rowCount: worksheet.rowCount,
      columnCount: worksheet.columnCount,
      rows,
    };
    const sheetFileName = `${sheetId}-${sanitizeSheetName(worksheet.name) || 'sheet'}.json`;
    await writeJson(path.join(targetDir, sheetFileName), payload);
    metadata.sheets.push({
      name: worksheet.name,
      index: sheetId,
      rowCount: worksheet.rowCount,
      columnCount: worksheet.columnCount,
    });
  }

  await writeJson(path.join(targetDir, 'metadata.json'), metadata);
  console.log(`✅ Excel extract kész: ${targetDir}`);
}

extractWorkbook(parseArgs()).catch(error => {
  console.error('Excel extract hiba:', error instanceof Error ? error.message : error);
  process.exit(1);
});
