#!/usr/bin/env tsx
import 'dotenv/config';
import path from 'path';
import fs from 'fs/promises';
import fetch from 'node-fetch';
import { createCoreTask, updateCoreTaskStatus } from '@apps/api-gateway/src/services/core-tasks.js';
import { findWorkspaceById } from '@apps/api-gateway/src/services/core-workspaces.js';
import { ensureDrivePath, createDriveFile, applyDrivePermissions } from '@apps/api-gateway/src/services/drive-client.js';
import { writeSheetValues } from '@apps/api-gateway/src/services/sheets-client.js';
import { buildGraphitiAuthHeaders } from '@apps/shared/graphitiAuth.js';
import { fetchBillingoSnapshot } from './billingo.js';

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

export async function runBillingoCron(): Promise<void> {
  const workspace = await findWorkspaceById('finance');
  if (!workspace) {
    throw new Error('Billingo cron: finance workspace nem található.');
  }
  const now = new Date().toISOString().slice(0, 10);
  const task = await createCoreTask({
    workspace,
    templateId: 'billingo-sync',
    title: `Billingo sync ${now}`,
    description: 'Automatikus Billingo szinkron (cron).',
    createdBy: 'billingo-cron',
    priority: 'normal',
  });
  await updateCoreTaskStatus(task.id, 'running', 'Billingo sync elindult (cron).');
  await fs.mkdir(BILLINGO_OUTPUT_DIR, { recursive: true });

  const { results } = await fetchBillingoSnapshot();
  const outputs: string[] = [];
  for (const result of results) {
    const outputPath = path.join(BILLINGO_OUTPUT_DIR, `${task.id}-${result.endpoint}.json`);
    await fs.writeFile(outputPath, JSON.stringify(result.items, null, 2), 'utf8');
    outputs.push(outputPath);
  }

  const summary = results.map(item => ({ endpoint: item.endpoint, count: item.count }));
  const sheet = await writeBillingoSummarySheet(workspace.driveRoot, task.id, summary);
  const summaryText = `Billingo sync kész (${summary.map(item => `${item.endpoint}:${item.count}`).join(', ')})`;
  if (sheet?.link) {
    await updateCoreTaskStatus(task.id, 'done', `${summaryText} → Sheet: ${sheet.link}`);
  } else {
    await updateCoreTaskStatus(task.id, 'done', `${summaryText} → ${outputs.join(', ')}`);
  }
  await recordBillingoGraphiti(task.id, task.createdBy, summaryText);
}

if (process.argv[1] && process.argv[1].includes('billingo-cron')) {
  runBillingoCron().catch(error => {
    console.error('Billingo cron hiba', error);
    process.exit(1);
  });
}
