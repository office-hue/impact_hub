import path from 'path';
import fs from 'fs/promises';
import ExcelJS from 'exceljs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse: (data: Buffer | Uint8Array, options?: Record<string, unknown>) => Promise<{ text: string }> = require('pdf-parse');
import type { DocumentAttachment, StructuredDocument } from '@apps/core-agent-graph/src/state.js';

const EXCEL_EXTENSIONS = new Set(['.xls', '.xlsx', '.xlsm']);

function sanitizeSheetName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

export function detectDocumentKind(attachment: DocumentAttachment): 'excel' | 'pdf' | 'unknown' {
  if (attachment.kind && attachment.kind !== 'unknown') {
    return attachment.kind;
  }
  const ext = path.extname(attachment.name || attachment.url || '').toLowerCase();
  if (EXCEL_EXTENSIONS.has(ext)) {
    return 'excel';
  }
  if (ext === '.pdf') {
    return 'pdf';
  }
  if ((attachment.mimeType || '').includes('excel')) {
    return 'excel';
  }
  if ((attachment.mimeType || '').includes('pdf')) {
    return 'pdf';
  }
  return 'unknown';
}

export function resolveLocalPathFromAttachment(attachment: DocumentAttachment): string | undefined {
  const url = attachment.url?.trim();
  if (url) {
    if (url.startsWith('file://')) {
      try {
        return new URL(url).pathname;
      } catch {
        return undefined;
      }
    }
    if (path.isAbsolute(url)) {
      return url;
    }
  }
  if (attachment.name && path.isAbsolute(attachment.name)) {
    return attachment.name;
  }
  return undefined;
}

export async function loadStructuredDocumentFromDir(dir: string, attachment: DocumentAttachment): Promise<StructuredDocument | undefined> {
  const resolvedDir = path.resolve(dir);
  const metaPath = path.join(resolvedDir, 'metadata.json');
  try {
    const metadataRaw = await fs.readFile(metaPath, 'utf8');
    const metadata = JSON.parse(metadataRaw) as { sheets?: Array<{ name: string; index: number; rowCount: number; columnCount: number }> };
    const sheets = await Promise.all(
      (metadata.sheets ?? []).map(async sheetMeta => {
        const sheetFile = path.join(resolvedDir, `${sheetMeta.index}-${sanitizeSheetName(sheetMeta.name) || 'sheet'}.json`);
        let sample: unknown[][] | undefined;
        try {
          const sheetRaw = await fs.readFile(sheetFile, 'utf8');
          const sheetPayload = JSON.parse(sheetRaw) as { rows?: Array<{ cells: Array<{ value: unknown }> }> };
          if (sheetPayload.rows?.length) {
            sample = sheetPayload.rows.slice(0, 5).map(row => row.cells.map(cell => cell.value ?? null));
          }
        } catch {
          sample = undefined;
        }
        return {
          name: sheetMeta.name,
          rows: sheetMeta.rowCount,
          columns: sheetMeta.columnCount,
          sampleRows: sample,
        };
      }),
    );
    return {
      attachment,
      sheets,
    };
  } catch {
    return undefined;
  }
}

export async function ingestExcelFile(filePath: string, attachment: DocumentAttachment): Promise<StructuredDocument> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheets = workbook.worksheets.map(ws => {
    const fullRows: unknown[][] = [];
    const rows: unknown[][] = [];
    ws.eachRow((row, rowNumber) => {
      const rawValues = Array.isArray(row.values) ? row.values.slice(1) : Object.values(row.values);
      const normalizedRow = rawValues.map(value => (value ?? null));
      fullRows.push(normalizedRow);
      if (rowNumber <= 5) {
        rows.push(normalizedRow);
      }
    });
    return {
      name: ws.name,
      rows: ws.rowCount,
      columns: ws.columnCount,
      sampleRows: rows,
      data: fullRows,
    };
  });
  return {
    attachment,
    sheets,
  };
}

export async function ingestPdfFile(filePath: string, attachment: DocumentAttachment): Promise<StructuredDocument> {
  const buffer = await fs.readFile(filePath);
  const parsed = await pdfParse(buffer);
  const lines: string[] = parsed.text.split(/\r?\n/).map((line: string) => line.trim()).filter(Boolean);
  const tables: Array<{ id: string; rows: number; columns: number; previewRows: string[][] }> = [];
  const camelotTables = ENABLE_CAMELOT ? tryCamelotExtraction(filePath) : undefined;
  if (camelotTables?.length) {
    camelotTables.forEach((tableRows, index) => {
      tables.push({
        id: `camelot-${index + 1}`,
        rows: tableRows.length,
        columns: Math.max(...tableRows.map(row => row.length)),
        previewRows: tableRows.slice(0, 5),
      });
    });
  }
  let current: string[][] = [];
  const commit = () => {
    if (current.length > 1) {
      const columns = Math.max(...current.map(row => row.length));
      tables.push({ id: `table-${tables.length + 1}`, rows: current.length, columns, previewRows: current.slice(0, 5) });
    }
    current = [];
  };
  for (const line of lines) {
    const cells = splitLine(line);
    if (cells.length > 1) {
      current.push(cells);
    } else {
      commit();
    }
  }
  commit();
  return {
    attachment,
    tables: tables.length ? tables : undefined,
    textPreview: lines.slice(0, 10),
  };
}

const ENABLE_CAMELOT = process.env.DOCUMENT_INGEST_CAMELOT === '1';

function tryCamelotExtraction(filePath: string): string[][][] | undefined {
  const script = `
import json, os
try:
    import camelot
except ImportError:
    raise SystemExit('NO_CAMELOT')
tables = camelot.read_pdf(os.environ['FILE_PATH'], pages='all')
payload = []
for table in tables:
    payload.append(table.df.values.tolist())
print(json.dumps(payload))
`;
  const result = spawnSync('python3', ['-c', script], {
    env: { ...process.env, FILE_PATH: filePath },
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0 || !result.stdout.trim()) {
    if (process.env.DOCUMENT_INGEST_VERBOSE === '1') {
      console.warn('Camelot extraction failed:', result.stderr || result.stdout);
    }
    return undefined;
  }
  try {
    return JSON.parse(result.stdout) as string[][][];
  } catch (error) {
    console.warn('Camelot JSON parse error', error);
    return undefined;
  }
}

function splitLine(line: string): string[] {
  return line
    .split(/\s{2,}/)
    .map(cell => cell.trim())
    .filter(Boolean);
}
