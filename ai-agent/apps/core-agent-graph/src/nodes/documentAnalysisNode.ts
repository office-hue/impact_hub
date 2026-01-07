import type { CoreAgentState, StructuredDocument } from '../state.js';
import { syncDocumentInsightsToGraphiti } from '../utils/documentInsightSync.js';

export async function documentAnalysisNode(state: CoreAgentState): Promise<Partial<CoreAgentState>> {
  const logs = [...(state.logs ?? [])];
  if (!state.structuredDocuments || state.structuredDocuments.length === 0) {
    logs.push('documentAnalysis: kihagyva (nincs strukturált dokumentum)');
    return { logs };
  }

  const insights = state.structuredDocuments.map(doc => analyseDocument(doc));
  logs.push(`documentAnalysis: ${insights.length} dokumentum összefoglalva.`);
  try {
    await syncDocumentInsightsToGraphiti({
      sessionId: state.sessionId,
      userId: state.memoryRequest?.userId,
      insights,
    });
    logs.push('documentAnalysis: Graphiti dokumentum insight szinkron kész.');
  } catch (error) {
    logs.push(`documentAnalysis: Graphiti sync hiba – ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    documentInsights: insights,
    logs,
  };
}

function analyseDocument(doc: StructuredDocument): { summary: string; references?: string[] } {
  const parts: string[] = [];
  const references: string[] = [];
  const sheets = doc.sheets ?? [];
  if (sheets.length) {
    const sheetDescriptions = sheets.map(sheet => {
      references.push(sheet.name);
      const numericStats = computeNumericStats(sheet.sampleRows ?? []);
      const metrics: string[] = [];
      if (numericStats.count) {
        metrics.push(`összeg ${numericStats.sum}`);
        metrics.push(`átlag ${numericStats.avg}`);
        metrics.push(`min ${numericStats.min}`);
        metrics.push(`max ${numericStats.max}`);
      }
      return `${sheet.name}: ${sheet.rows} sor × ${sheet.columns} oszlop${metrics.length ? ` (${metrics.join(', ')})` : ''}`;
    });
    parts.push(`Munkalapok: ${sheetDescriptions.join('; ')}.`);
    const firstSample = sheets[0]?.sampleRows?.[0];
    if (firstSample) {
      parts.push(`Mintasor: ${firstSample.map(value => String(value ?? '')).join(' | ')}`);
    }
  }
  const tables = doc.tables ?? [];
  if (tables.length) {
    const tableDescriptions = tables.map(table => `${table.id}: ${table.rows} sor (${table.columns} oszlop)`).join(', ');
    parts.push(`Felismerett táblák: ${tableDescriptions}.`);
    references.push(...tables.map(table => table.id));
  }
  if (doc.textPreview?.length) {
    parts.push(`Szöveg előnézet: ${doc.textPreview.slice(0, 3).join(' / ')}`);
  }
  if (doc.warnings?.length) {
    parts.push(`Figyelmeztetések: ${doc.warnings.join('; ')}`);
  }
  return {
    summary: parts.join(' '),
    references: references.length ? references : undefined,
  };
}

function computeNumericStats(sampleRows: unknown[][]): { count: number; sum: number; avg: number; min: number; max: number } {
  const values: number[] = [];
  sampleRows.forEach(row => {
    row.forEach(cell => {
      if (typeof cell === 'number') {
        values.push(cell);
      } else if (typeof cell === 'string') {
        const parsed = Number(cell.replace(/[^0-9.-]+/g, ''));
        if (!Number.isNaN(parsed)) {
          values.push(parsed);
        }
      }
    });
  });
  if (!values.length) {
    return { count: 0, sum: 0, avg: 0, min: 0, max: 0 };
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return {
    count: values.length,
    sum,
    avg: Number((sum / values.length).toFixed(2)),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}
