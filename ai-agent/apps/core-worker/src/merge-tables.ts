import path from 'path';
import fs from 'fs/promises';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from 'docx';
import type { StructuredDocument } from '@apps/core-agent-graph/src/state.js';

type MergeResult = {
  rows: Record<string, Record<string, string>>;
  columns: string[];
  conflicts: Array<{
    hrsz: string;
    column: string;
    existing: string;
    newValue: string;
    newColumn: string;
    source: string;
  }>;
};

const STANDARD_COLUMNS = [
  'Ügyiratszám',
  'Előiratszám',
  'Helyrajzi szám',
  'Ügylet típusa',
  'Ügyfél megnevezése',
  'Forgalomképesség megjelölése',
  'Megnevezés',
  'Ingatlan cím',
  'Változás megnevezése',
  'Egyéb megjegyzés',
];

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/\p{Mn}/gu, '');
}

function normalizeHeader(header: string): string {
  return stripAccents(header || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isHrszHeader(header: string): boolean {
  const key = normalizeHeader(header);
  return key.includes('hrsz') || key.includes('helyrajziszam');
}

function normalizeHrsz(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  let s = String(raw).trim();
  if (!s) return '';
  s = s.replace(/\bhrsz\.?\b/gi, '').replace(/\bhelyrajzi\s*sz[aá]m\b/gi, '');
  s = s.trim().replace(/\.+$/, '');
  s = s.replace(/\s*\/\s*/g, '/');
  s = s.replace(/\s+/g, ' ').trim();
  const parts = s.split('/').map(p => p.trim()).filter(Boolean);
  if (!parts.length) return '';
  return parts.join('/'); // vezető nullák megmaradnak
}

function mapForgalomkepesseg(text: string): string {
  const lowered = stripAccents(text || '').toLowerCase();
  if (lowered.includes('forgalomkeptelen')) return 'Forgalomképtelen';
  if (lowered.includes('korlat') || lowered.includes('korlatozott')) return 'Korlátozottan forgalomképes';
  if (lowered.includes('forgalomkepes')) return 'Forgalomképes';
  return '';
}

function detectTargetColumn(header: string, hrIdx: number, currentIdx: number): string | null {
  const headerNorm = normalizeHeader(header);
  if (currentIdx === hrIdx) return 'Helyrajzi szám';
  if (headerNorm.includes('forgalomk')) return 'Forgalomképesség megjelölése';
  if (headerNorm.includes('valtozas') && headerNorm.includes('reszletez')) return 'Változás részletezése';
  if (headerNorm.includes('valtozas') && headerNorm.includes('megnevezes')) return 'Változás megnevezése';
  if (headerNorm.includes('ingatlan') && headerNorm.includes('cim')) return 'Ingatlan cím';
  if (headerNorm.includes('megjegy') || headerNorm.includes('comment')) return 'Egyéb megjegyzés';
  if (headerNorm.includes('megnevezes')) return 'Megnevezés';
  if (headerNorm.includes('cim') && headerNorm.includes('berlo')) return 'Cím/bérlő';
  if (headerNorm === 'm2' || headerNorm.includes('terulet') || headerNorm.includes('alapterulet')) return 'm2';
  return null;
}

function ensureRow(rows: Record<string, Record<string, string>>, hrsz: string, columns: string[]): void {
  if (!rows[hrsz]) {
    rows[hrsz] = Object.fromEntries(columns.map(col => [col, '']));
  }
}

function addValue(
  rows: Record<string, Record<string, string>>,
  columns: string[],
  conflicts: MergeResult['conflicts'],
  hrsz: string,
  column: string,
  value: string,
  source: string,
): void {
  if (!value) return;
  ensureRow(rows, hrsz, columns);
  const row = rows[hrsz];
  if (!columns.includes(column)) {
    columns.push(column);
  }
  if (!row[column]) {
    row[column] = value;
    return;
  }
  if (row[column] === value) {
    return;
  }
  // konfliktus → új oszlop
  let suffix = source ? ` (${source})` : ' (2)';
  let newCol = `${column}${suffix}`;
  let counter = 2;
  while (columns.includes(newCol)) {
    counter += 1;
    newCol = `${column} (${source || counter}-${counter})`;
  }
  columns.push(newCol);
  row[newCol] = value;
  conflicts.push({ hrsz, column, existing: row[column], newValue: value, newColumn: newCol, source });
}

function deriveOutputDir(structured: StructuredDocument[]): string {
  for (const doc of structured) {
    const candidate = doc.attachment.ingestPath || doc.attachment.url;
    if (candidate) {
      const p = candidate.startsWith('file://') ? fileURLToPath(candidate) : candidate;
      if (path.isAbsolute(p)) {
        return path.dirname(p);
      }
    }
  }
  return process.cwd();
}

export function mergeStructuredDocuments(structured: StructuredDocument[]): MergeResult {
  const rows: Record<string, Record<string, string>> = {};
  const columns: string[] = [...STANDARD_COLUMNS];
  const conflicts: MergeResult['conflicts'] = [];

  structured.forEach(doc => {
    const sourceLabel = `${path.basename(doc.attachment.name || doc.attachment.url || 'document')} / ${
      doc.sheets?.[0]?.name || 'sheet'
    }`;
    doc.sheets?.forEach(sheet => {
      const data = sheet.data || sheet.sampleRows;
      if (!data || data.length < 2) return;
      const headers = data[0].map(cell => (cell === null || cell === undefined ? '' : String(cell)));
      const hrIdx = headers.findIndex(h => isHrszHeader(h));
      if (hrIdx === -1) return;
      for (let i = 1; i < data.length; i += 1) {
        const rowValues = data[i];
        const hrRaw = rowValues[hrIdx];
        const hrsz = normalizeHrsz(hrRaw);
        if (!hrsz) continue;
        ensureRow(rows, hrsz, columns);
        headers.forEach((header, idx) => {
          const value = rowValues[idx];
          if (value === null || value === undefined || value === '') return;
          const valueStr = String(value).trim();
          if (!valueStr) return;
          const headerNorm = normalizeHeader(header);
          let target: string | null = null;
          if (idx === hrIdx) {
            target = 'Helyrajzi szám';
          } else if (headerNorm.includes('forgalomk')) {
            const mapped = mapForgalomkepesseg(valueStr);
            if (mapped) target = 'Forgalomképesség megjelölése';
          } else if (headerNorm.startsWith('megnevezes')) {
            target = 'Megnevezés';
          } else if (headerNorm.includes('valtozas') && headerNorm.includes('megnevezes')) {
            target = 'Változás megnevezése';
          } else if (headerNorm.includes('ingatlan') && headerNorm.includes('cim')) {
            target = 'Ingatlan cím';
          } else if (headerNorm.includes('egyebmegjegyzes')) {
            target = 'Egyéb megjegyzés';
          }
          if (!target) {
            target = header && header.trim() ? header.trim() : `Oszlop ${idx + 1}`;
          }
          addValue(rows, columns, conflicts, hrsz, target, target === 'Helyrajzi szám' ? hrsz : valueStr, sourceLabel);
        });
      }
    });
  });

  return { rows, columns, conflicts };
}

export async function exportMergedOutputs(
  merge: MergeResult,
  options: { outputDir: string; baseName?: string } = { outputDir: process.cwd() },
): Promise<void> {
  const outputDir = path.resolve(options.outputDir);
  await fs.mkdir(outputDir, { recursive: true });
  const base = options.baseName || 'Output.core';
  const xlsxPath = path.join(outputDir, `${base}.xlsx`);
  const csvPath = path.join(outputDir, `${base}.csv`);
  const jsonPath = path.join(outputDir, `${base}.json`);
  const logPath = path.join(outputDir, `${base}-conflicts.log`);
  const pdfPath = path.join(outputDir, `${base}.pdf`);
  const docxPath = path.join(outputDir, `${base}.docx`);

  const sortedHrsz = Object.keys(merge.rows).sort();

  // Excel
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Output');
  ws.addRow(merge.columns);
  sortedHrsz.forEach(hrsz => {
    const row = merge.rows[hrsz];
    ws.addRow(merge.columns.map(col => row[col] || ''));
  });
  await wb.xlsx.writeFile(xlsxPath);

  // CSV
  const csvLines = [merge.columns.join(',')];
  sortedHrsz.forEach(hrsz => {
    const row = merge.rows[hrsz];
    const line = merge.columns
      .map(col => {
        const val = row[col] || '';
        return `"${String(val).replace(/\"/g, '\"\"')}"`;
      })
      .join(',');
    csvLines.push(line);
  });
  await fs.writeFile(csvPath, csvLines.join('\n'), 'utf8');

  // JSON
  const jsonPayload = {
    columns: merge.columns,
    rows: sortedHrsz.map(hrsz => ({ hrsz, data: merge.rows[hrsz] })),
  };
  await fs.writeFile(jsonPath, JSON.stringify(jsonPayload, null, 2), 'utf8');

  // Conflicts log
  if (merge.conflicts.length) {
    const lines = merge.conflicts.map(c => JSON.stringify(c, null, 2));
    await fs.writeFile(logPath, lines.join('\n'), 'utf8');
  }

  // PDF (rövidített, első N sor)
  const pdf = new PDFDocument({ margin: 24 });
  const pdfStream = pdf.pipe((await import('fs')).createWriteStream(pdfPath));
  pdf.fontSize(14).text('Output.core – rövidített nézet', { underline: true });
  pdf.moveDown();
  const maxRows = Math.min(sortedHrsz.length, 50);
  pdf.fontSize(10).text(`Oszlopok: ${merge.columns.length}, sorok: ${sortedHrsz.length} (első ${maxRows})`);
  pdf.moveDown();
  for (let i = 0; i < maxRows; i += 1) {
    const hrsz = sortedHrsz[i];
    const row = merge.rows[hrsz];
    const line = merge.columns.map(col => row[col] || '').join(' | ');
    pdf.text(`${i + 1}. ${line}`);
  }
  pdf.end();
  await new Promise(resolve => pdfStream.on('finish', resolve));

  // DOCX (összefoglaló + első N sor táblázat)
  const maxDocRows = Math.min(sortedHrsz.length, 50);
  const tableRows: TableRow[] = [];
  // header
  tableRows.push(new TableRow({
    children: merge.columns.map(col => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: col, bold: true })] })],
    })),
  }));
  for (let i = 0; i < maxDocRows; i += 1) {
    const hrsz = sortedHrsz[i];
    const row = merge.rows[hrsz];
    tableRows.push(new TableRow({
      children: merge.columns.map(col => new TableCell({ children: [new Paragraph(String(row[col] || ''))] })),
    }));
  }
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({ children: [new TextRun({ text: 'Output.core – összefoglaló', bold: true, size: 28 })] }),
        new Paragraph({ text: `Oszlopok: ${merge.columns.length}, sorok: ${sortedHrsz.length} (első ${maxDocRows} szerepel)`, spacing: { after: 200 } }),
        new Table({ rows: tableRows }),
      ],
    }],
  });
  const buffer = await Packer.toBuffer(doc);
  await fs.writeFile(docxPath, buffer);
}

export async function mergeAndExportDocuments(structured: StructuredDocument[]): Promise<void> {
  if (!structured.length) return;
  const merge = mergeStructuredDocuments(structured);
  const outputDir = deriveOutputDir(structured);
  await exportMergedOutputs(merge, { outputDir, baseName: 'Output.core' });
}
