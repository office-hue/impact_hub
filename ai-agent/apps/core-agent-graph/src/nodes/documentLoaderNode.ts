import path from 'path';
import fs from 'fs/promises';
import type { CoreAgentState, DocumentAttachment, StructuredDocument } from '../state.js';
import { detectDocumentKind, ingestExcelFile, ingestPdfFile, loadStructuredDocumentFromDir, resolveLocalPathFromAttachment } from '@apps/document-ingest/src/index.js';

export async function documentLoaderNode(state: CoreAgentState): Promise<Partial<CoreAgentState>> {
  const logs = [...(state.logs ?? [])];
  const attachments = state.attachments || [];
  const structuredDocuments: StructuredDocument[] = [];
  const warnings: string[] = [...(state.ingestWarnings ?? [])];

  for (const attachment of attachments) {
    try {
      const structured = await loadDocument(attachment);
      if (structured) {
        structuredDocuments.push(structured);
        if (structured.warnings?.length) {
          warnings.push(...structured.warnings);
        }
        continue;
      }
      warnings.push(`documentLoader: ${attachment.name ?? attachment.url} → nincs támogatott ingest útvonal.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ismeretlen hiba';
      warnings.push(`documentLoader: ${attachment.name ?? attachment.url} hiba – ${message}`);
    }
  }

  const workerSnapshots = await loadWorkerSnapshots();
  if (workerSnapshots.length) {
    structuredDocuments.push(...workerSnapshots);
    logs.push(`documentLoader: ${workerSnapshots.length} worker snapshot betöltve.`);
  }

  if (!structuredDocuments.length) {
    logs.push('documentLoader: nincs feldolgozható dokumentum.');
    return { logs, ingestWarnings: warnings.length ? warnings : undefined };
  }

  logs.push(`documentLoader: ${structuredDocuments.length} dokumentum feldolgozva.`);
  return {
    structuredDocuments,
    ingestWarnings: warnings.length ? warnings : undefined,
    logs,
  };
}

async function loadDocument(attachment: DocumentAttachment): Promise<StructuredDocument | undefined> {
  if (attachment.ingestPath) {
    const fromDir = await loadStructuredDocumentFromDir(attachment.ingestPath, attachment);
    if (fromDir) {
      return fromDir;
    }
  }
  const localPath = resolveLocalPathFromAttachment(attachment);
  if (!localPath) {
    return undefined;
  }
  const ext = path.extname(localPath).toLowerCase();
  const kind = detectDocumentKind(attachment);
  if (kind === 'excel' || EXCEL_EXTENSIONS.has(ext)) {
    return ingestExcelFile(localPath, attachment);
  }
  if (kind === 'pdf' || ext === '.pdf') {
    return ingestPdfFile(localPath, attachment);
  }
  if (attachment.ingestPath) {
    const fromDir = await loadStructuredDocumentFromDir(attachment.ingestPath, attachment);
    if (fromDir) {
      return fromDir;
    }
  }
  return undefined;
}

const EXCEL_EXTENSIONS = new Set(['.xls', '.xlsx', '.xlsm']);

const WORKER_SNAPSHOT_DIR = process.env.CORE_DOCUMENT_OUTPUT_DIR
  ? path.resolve(process.env.CORE_DOCUMENT_OUTPUT_DIR)
  : path.resolve(process.cwd(), '..', 'tmp', 'state', 'documents');

async function loadWorkerSnapshots(): Promise<StructuredDocument[]> {
  try {
    const entries = await fs.readdir(WORKER_SNAPSHOT_DIR, { withFileTypes: true });
    const snapshots: StructuredDocument[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue;
      }
      const fullPath = path.join(WORKER_SNAPSHOT_DIR, entry.name);
      try {
        const raw = await fs.readFile(fullPath, 'utf8');
        const parsed = JSON.parse(raw) as StructuredDocument;
        if (parsed && parsed.attachment) {
          snapshots.push(parsed);
        }
      } catch (error) {
        console.warn('documentLoader: worker snapshot betöltés hiba', fullPath, error);
      }
    }
    return snapshots;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('documentLoader: worker snapshot könyvtár nem olvasható', error);
    }
    return [];
  }
}
