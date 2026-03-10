import type { CapabilityManifest } from './types.js';
import { registerCapability } from './registry.js';
import type { CoreAgentState, StructuredDocument } from '../state.js';

type FinancialChartInput = {
  query?: string;
  chartType?: 'line' | 'bar' | 'pie' | 'doughnut';
  title?: string;
  labels?: Array<string | number>;
  values?: Array<string | number>;
};

type FinancialChartOutput = {
  kind: 'financial-chart';
  status: 'ok' | 'skipped' | 'error';
  summary: string;
  reason?: string;
  chart?: {
    engine: 'chartjs';
    spec: {
      type: 'line' | 'bar' | 'pie' | 'doughnut';
      data: {
        labels: string[];
        datasets: Array<{
          label: string;
          data: number[];
        }>;
      };
      options: {
        responsive: boolean;
        maintainAspectRatio: boolean;
      };
    };
    quickChartUrl: string;
  };
  source?: {
    mode: 'input' | 'document';
    documentName?: string;
    sheetName?: string;
    labelColumn?: string;
    valueColumn?: string;
    points: number;
  };
};

type ExtractedSeries = {
  labels: string[];
  values: number[];
  source: FinancialChartOutput['source'];
};

function normalizeType(value?: string): 'line' | 'bar' | 'pie' | 'doughnut' {
  const v = (value || '').toLowerCase();
  if (v === 'bar' || v === 'pie' || v === 'doughnut') return v;
  return 'line';
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/\s+/g, '').replace(/,/g, '.').replace(/[^0-9.-]/g, '');
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractFromInput(input: FinancialChartInput): ExtractedSeries | undefined {
  if (!Array.isArray(input.labels) || !Array.isArray(input.values)) return undefined;
  const size = Math.min(input.labels.length, input.values.length, 20);
  if (size < 2) return undefined;

  const labels: string[] = [];
  const values: number[] = [];
  for (let i = 0; i < size; i += 1) {
    const parsed = toNumber(input.values[i]);
    if (parsed === undefined) continue;
    labels.push(String(input.labels[i] ?? `${i + 1}`));
    values.push(parsed);
  }
  if (labels.length < 2) return undefined;

  return {
    labels,
    values,
    source: {
      mode: 'input',
      points: labels.length,
    },
  };
}

function chooseColumns(rows: unknown[][]): { labelIdx: number; valueIdx: number; headerRow: string[] } | undefined {
  if (!rows.length) return undefined;
  const maxCols = Math.max(...rows.map(r => r.length), 0);
  if (!maxCols) return undefined;

  const headerRaw = rows[0] ?? [];
  const dataRows = rows.slice(1);
  if (!dataRows.length) return undefined;

  let bestValueIdx = -1;
  let bestScore = -1;
  for (let c = 0; c < maxCols; c += 1) {
    let score = 0;
    for (const row of dataRows) {
      if (toNumber(row[c]) !== undefined) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestValueIdx = c;
    }
  }
  if (bestValueIdx < 0 || bestScore < 2) return undefined;

  let labelIdx = -1;
  for (let c = 0; c < maxCols; c += 1) {
    if (c === bestValueIdx) continue;
    const first = dataRows[0]?.[c];
    if (typeof first === 'string' && first.trim()) {
      labelIdx = c;
      break;
    }
  }
  if (labelIdx < 0) labelIdx = 0;

  const headerRow = Array.from({ length: maxCols }, (_, idx) => {
    const hv = headerRaw[idx];
    return typeof hv === 'string' && hv.trim() ? hv.trim() : `column_${idx + 1}`;
  });
  return { labelIdx, valueIdx: bestValueIdx, headerRow };
}

function extractFromDocuments(state: CoreAgentState): ExtractedSeries | undefined {
  const docs = state.structuredDocuments ?? [];
  for (const doc of docs) {
    const sheets = doc.sheets ?? [];
    for (const sheet of sheets) {
      const rows = (sheet.data?.length ? sheet.data : sheet.sampleRows) ?? [];
      const picked = chooseColumns(rows);
      if (!picked) continue;

      const labels: string[] = [];
      const values: number[] = [];
      const dataRows = rows.slice(1);
      for (let i = 0; i < dataRows.length && labels.length < 20; i += 1) {
        const row = dataRows[i] ?? [];
        const value = toNumber(row[picked.valueIdx]);
        if (value === undefined) continue;
        const labelCell = row[picked.labelIdx];
        const label = labelCell === undefined || labelCell === null || labelCell === ''
          ? `#${labels.length + 1}`
          : String(labelCell);
        labels.push(label);
        values.push(value);
      }
      if (labels.length < 2) continue;

      return {
        labels,
        values,
        source: {
          mode: 'document',
          documentName: doc.attachment?.name,
          sheetName: sheet.name,
          labelColumn: picked.headerRow[picked.labelIdx],
          valueColumn: picked.headerRow[picked.valueIdx],
          points: labels.length,
        },
      };
    }
  }
  return undefined;
}

function buildSpec(
  title: string,
  type: 'line' | 'bar' | 'pie' | 'doughnut',
  labels: string[],
  values: number[],
): FinancialChartOutput['chart'] {
  const spec = {
    type,
    data: {
      labels,
      datasets: [
        {
          label: title,
          data: values,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
    },
  };
  const encoded = encodeURIComponent(JSON.stringify(spec));
  return {
    engine: 'chartjs',
    spec,
    quickChartUrl: `https://quickchart.io/chart?c=${encoded}`,
  };
}

async function invokeFinancialChartBuilder(
  input: FinancialChartInput,
  context: CoreAgentState,
): Promise<FinancialChartOutput> {
  const fromInput = extractFromInput(input);
  const extracted = fromInput ?? extractFromDocuments(context);
  if (!extracted) {
    return {
      kind: 'financial-chart',
      status: 'skipped',
      reason: 'no_chart_data',
      summary:
        'Nem találtam chartolható pénzügyi adatsort. Adj meg labels+values tömböt vagy tölts fel táblázatot szám oszloppal.',
    };
  }

  const title = input.title || 'Pénzügyi trend';
  const type = normalizeType(input.chartType);
  const chart = buildSpec(title, type, extracted.labels, extracted.values);

  const sourceText =
    extracted.source?.mode === 'document'
      ? `forrás: ${extracted.source.documentName || 'dokumentum'} / ${extracted.source.sheetName || 'sheet'}`
      : 'forrás: direkt input';
  return {
    kind: 'financial-chart',
    status: 'ok',
    summary: `Chart elkészült (${type}, ${extracted.labels.length} pont, ${sourceText}).`,
    chart,
    source: extracted.source,
  };
}

export const financialChartBuilderCapability: CapabilityManifest<FinancialChartInput, FinancialChartOutput> = {
  id: 'financial-chart-builder',
  name: 'Financial Chart Builder',
  description: 'Pénzügyi adatokból Chart.js kompatibilis chart specifikáció és quickchart preview URL készítése.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      chartType: { type: 'string', enum: ['line', 'bar', 'pie', 'doughnut'] },
      title: { type: 'string' },
      labels: { type: 'array' },
      values: { type: 'array' },
    },
  },
  invoke: invokeFinancialChartBuilder,
  tags: ['finance', 'financial', 'chart', 'analytics'],
  priority: 7,
};

registerCapability(financialChartBuilderCapability);
