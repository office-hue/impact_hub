#!/usr/bin/env tsx
import 'dotenv/config';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { Worker } from 'bullmq';
import { updateCoreTaskStatus } from '@apps/api-gateway/src/services/core-tasks.js';
import { findWorkspaceById } from '@apps/api-gateway/src/services/core-workspaces.js';
import { ensureDrivePath, createDriveFile, applyDrivePermissions } from '@apps/api-gateway/src/services/drive-client.js';
import { writeSheetValues } from '@apps/api-gateway/src/services/sheets-client.js';
import { detectDocumentKind, ingestExcelFile, ingestPdfFile } from '@apps/document-ingest/src/index.js';
import type { DocumentAttachment } from '@apps/core-agent-graph/src/state.js';
import { fetchMemoryContext, type MemoryContextRequest } from '@apps/api-gateway/src/services/memory-context.js';
import { buildGraphitiAuthHeaders } from '@apps/shared/graphitiAuth.js';
import { normalizeJobType, type CoreJobPayload, type CoreJobType } from './job-types.js';
import { mergeAndExportDocuments } from './merge-tables.js';
import { fetchBillingoSnapshot } from './billingo.js';

const connectionUrl = process.env.CORE_QUEUE_REDIS_URL || process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const queueName = process.env.CORE_QUEUE_NAME || 'core_tasks';
const DOCUMENT_OUTPUT_DIR = process.env.CORE_DOCUMENT_OUTPUT_DIR
  ? path.resolve(process.env.CORE_DOCUMENT_OUTPUT_DIR)
  : path.resolve(process.cwd(), 'tmp', 'state', 'documents');
const MEMORY_OUTPUT_DIR = process.env.CORE_MEMORY_OUTPUT_DIR
  ? path.resolve(process.env.CORE_MEMORY_OUTPUT_DIR)
  : path.resolve(process.cwd(), 'tmp', 'state', 'memory');
const BILLINGO_OUTPUT_DIR = process.env.CORE_BILLINGO_OUTPUT_DIR
  ? path.resolve(process.env.CORE_BILLINGO_OUTPUT_DIR)
  : path.resolve(process.cwd(), 'tmp', 'state', 'billingo');
const DRIVE_READERS = (process.env.CORE_DRIVE_READERS || '').split(',').map(item => item.trim()).filter(Boolean);
const DRIVE_WRITERS = (process.env.CORE_DRIVE_WRITERS || '').split(',').map(item => item.trim()).filter(Boolean);

function buildBillingoDrivePath(root: string, taskId: string): { path: string; name: string } {
  const date = new Date();
  const folder = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const filename = `${date.toISOString().slice(0, 10)}-billingo-sync-${taskId.slice(0, 8)}`;
  const drivePath = [root.replace(/\/$/, ''), folder, filename].join('/');
  return { path: drivePath, name: filename };
}

async function writeBillingoSummarySheet(
  workspaceDriveRoot: string,
  taskId: string,
  summary: Array<{ endpoint: string; count: number }>,
): Promise<{ fileId?: string; link?: string } | null> {
  try {
    const suggestion = buildBillingoDrivePath(workspaceDriveRoot, taskId);
    const provision = await ensureDrivePath(suggestion.path);
    const created = await createDriveFile(provision, 'application/vnd.google-apps.spreadsheet');
    if (created.fileId) {
      await applyDrivePermissions(created.fileId, DRIVE_READERS, DRIVE_WRITERS);
      const values = [
        ['endpoint', 'count'],
        ...summary.map(item => [item.endpoint, item.count]),
      ];
      await writeSheetValues(created.fileId, 'A1', values);
    }
    return { fileId: created.fileId, link: created.webViewLink };
  } catch (error) {
    console.warn('Billingo sheet írás sikertelen', error);
    return null;
  }
}

async function recordBillingoGraphiti(taskId: string, createdBy: string, summary: string): Promise<void> {
  const graphitiUrl = process.env.GRAPHITI_API_URL;
  if (!graphitiUrl) {
    return;
  }
  const headers = buildGraphitiAuthHeaders({
    extraHeaders: { 'Content-Type': 'application/json' },
  });
  const payload = {
    graph: 'impactshop_memory',
    interactions: [
      {
        type: 'capability_interaction',
        session_id: taskId,
        user_id: createdBy,
        user_message: summary,
        capability: 'billingo_sync',
        success: true,
        timestamp: Date.now(),
      },
    ],
  };
  try {
    await fetch(`${graphitiUrl.replace(/\/$/, '')}/ingest/capability-interaction`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn('Graphiti Billingo ingest sikertelen', error);
  }
}

async function runGenericTask(payload: CoreJobPayload): Promise<void> {
  const workspace = await findWorkspaceById(payload.workspaceId);
  if (!workspace) {
    await updateCoreTaskStatus(payload.taskId, 'error', 'Ismeretlen workspace azonosító.');
    return;
  }
  await updateCoreTaskStatus(payload.taskId, 'running', 'Core worker feldolgozás elkezdve.');
  console.log(`Core task fut: ${payload.taskId} → workspace=${workspace.id}`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  await updateCoreTaskStatus(payload.taskId, 'done', 'Core worker befejezve (generic).');
}

function resolveAttachmentPath(attachment: DocumentAttachment): string | null {
  if (attachment.ingestPath) {
    return path.isAbsolute(attachment.ingestPath)
      ? attachment.ingestPath
      : path.resolve(attachment.ingestPath);
  }
  if (attachment.url) {
    try {
      if (attachment.url.startsWith('file://')) {
        return fileURLToPath(attachment.url);
      }
      if (path.isAbsolute(attachment.url)) {
        return attachment.url;
      }
    } catch (error) {
      console.warn('Dokumentum útvonal nem értelmezhető', error);
    }
  }
  return null;
}

function isDocumentAttachmentList(value: unknown): DocumentAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(item => item && typeof item === 'object') as DocumentAttachment[];
}

async function handleDocumentIngestJob(payload: CoreJobPayload): Promise<void> {
  const attachments = isDocumentAttachmentList(payload.params?.attachments);
  if (!attachments.length) {
    await updateCoreTaskStatus(payload.taskId, 'error', 'Document ingest: hiányzó csatolmány lista.');
    return;
  }
  await updateCoreTaskStatus(payload.taskId, 'running', `Document ingest elindult (${attachments.length} csatolmány).`);
  await fs.mkdir(DOCUMENT_OUTPUT_DIR, { recursive: true });
  const outputs: string[] = [];
  const structuredDocuments: Array<Awaited<ReturnType<typeof ingestExcelFile>>> = [];

  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index];
    const sourcePath = resolveAttachmentPath(attachment);
    if (!sourcePath) {
      console.warn('Document ingest: hiányzó fájlútvonal', attachment);
      continue;
    }
    const enrichedAttachment: DocumentAttachment = {
      ...attachment,
      url: sourcePath,
    };
    const kind = attachment.kind || detectDocumentKind(enrichedAttachment);
    try {
      const structured = kind === 'pdf'
        ? await ingestPdfFile(sourcePath, { ...enrichedAttachment, kind: 'pdf' })
        : kind === 'excel'
          ? await ingestExcelFile(sourcePath, { ...enrichedAttachment, kind: 'excel' })
          : null;
      if (!structured) {
        console.warn(`Document ingest: ismeretlen fájltípus (${attachment.name || 'névtelen'})`);
        continue;
      }
      structuredDocuments.push(structured);
      const outputName = `${payload.taskId}-${index + 1}.json`;
      const outputPath = path.join(DOCUMENT_OUTPUT_DIR, outputName);
      await fs.writeFile(outputPath, JSON.stringify(structured, null, 2), 'utf8');
      outputs.push(outputPath);
      console.log(`[core-worker] document saved → ${outputPath}`);
    } catch (error) {
      console.error('Document ingest feldolgozási hiba', error);
    }
  }

  if (!outputs.length) {
    await updateCoreTaskStatus(payload.taskId, 'error', 'Document ingest: nem sikerült egyetlen csatolmány feldolgozása sem.');
    return;
  }
  try {
    await mergeAndExportDocuments(structuredDocuments);
    outputs.push('merge/export → Output.core.*');
  } catch (error) {
    console.error('Merge/export hiba', error);
  }
  await updateCoreTaskStatus(
    payload.taskId,
    'done',
    `Document ingest kész (${outputs.length}) – ${outputs.join(', ')}`,
  );
}

function normalizeMemoryRequest(input: unknown): MemoryContextRequest | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const data = input as Record<string, unknown>;
  const labels = Array.isArray(data.labels) ? data.labels.filter(item => typeof item === 'string') as string[] : undefined;
  return {
    userId: typeof data.userId === 'string' ? data.userId : undefined,
    topic: typeof data.topic === 'string' ? data.topic : undefined,
    labels,
    minScore: typeof data.minScore === 'number' ? data.minScore : undefined,
  };
}

async function handleMemorySyncJob(payload: CoreJobPayload): Promise<void> {
  const request = normalizeMemoryRequest(payload.params?.memoryRequest || payload.params?.memory) || {};
  await updateCoreTaskStatus(payload.taskId, 'running', 'Memory sync inicializálva.');
  await fs.mkdir(MEMORY_OUTPUT_DIR, { recursive: true });
  const snapshot = await fetchMemoryContext(request);
  const outputPath = path.join(MEMORY_OUTPUT_DIR, `${payload.taskId}-memory.json`);
  await fs.writeFile(outputPath, JSON.stringify({ request, snapshot }, null, 2), 'utf8');
  await updateCoreTaskStatus(
    payload.taskId,
    'done',
    `Memory sync kész (${snapshot.nodes.length} csomópont) → ${outputPath}`,
  );
}

async function handleBillingoSyncJob(payload: CoreJobPayload): Promise<void> {
  const workspace = await findWorkspaceById(payload.workspaceId);
  if (!workspace) {
    await updateCoreTaskStatus(payload.taskId, 'error', 'Billingo sync: ismeretlen workspace.');
    return;
  }
  await updateCoreTaskStatus(payload.taskId, 'running', 'Billingo sync elindult.');
  await fs.mkdir(BILLINGO_OUTPUT_DIR, { recursive: true });
  const { results } = await fetchBillingoSnapshot();
  const outputs: string[] = [];
  for (const result of results) {
    const outputPath = path.join(BILLINGO_OUTPUT_DIR, `${payload.taskId}-${result.endpoint}.json`);
    await fs.writeFile(outputPath, JSON.stringify(result.items, null, 2), 'utf8');
    outputs.push(outputPath);
  }
  const summary = results.map(item => ({ endpoint: item.endpoint, count: item.count }));
  const sheet = await writeBillingoSummarySheet(workspace.driveRoot, payload.taskId, summary);
  const summaryText = `Billingo sync kész (${summary.map(item => `${item.endpoint}:${item.count}`).join(', ')})`;
  if (sheet?.link) {
    await updateCoreTaskStatus(payload.taskId, 'done', `${summaryText} → Sheet: ${sheet.link}`);
  } else {
    await updateCoreTaskStatus(payload.taskId, 'done', `${summaryText} → ${outputs.join(', ')}`);
  }
  await recordBillingoGraphiti(payload.taskId, payload.createdBy, summaryText);
}

const handlers: Record<CoreJobType, (payload: CoreJobPayload) => Promise<void>> = {
  generic: runGenericTask,
  document_ingest: handleDocumentIngestJob,
  memory_sync: handleMemorySyncJob,
  billingo_sync: handleBillingoSyncJob,
};

const worker = new Worker(queueName, async job => {
  const data = job.data as CoreJobPayload;
  const jobType = normalizeJobType(data.jobType);
  const handler = handlers[jobType] || runGenericTask;
  try {
    await handler(data);
  } catch (error) {
    console.error('Core worker hiba', error);
    await updateCoreTaskStatus(data.taskId, 'error', `Worker hiba: ${String(error)}`);
    throw error;
  }
}, {
  connection: { url: connectionUrl },
});

worker.on('ready', () => {
  console.log(`[core-worker] listening on queue ${queueName}`);
});

worker.on('failed', (job, err) => {
  console.error(`[core-worker] job ${job?.id} failed`, err);
});
