import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import type { CoreWorkspace, CoreTemplate } from './core-workspaces.js';
import { ensureDrivePath, createDriveFile, applyDrivePermissions } from './drive-client.js';

export type CoreTaskStatus = 'queued' | 'running' | 'done' | 'error';

export interface AttachmentRef {
  name: string;
  driveFileId?: string;
  mimeType?: string;
  sizeBytes?: number;
  ingestPath?: string;
  url?: string;
  kind?: 'excel' | 'pdf' | 'unknown';
}

export interface CreateCoreTaskInput {
  workspace: CoreWorkspace;
  templateId?: string;
  title: string;
  description?: string;
  createdBy: string;
  priority?: 'low' | 'normal' | 'high';
  attachments?: AttachmentRef[];
}

export interface CoreTaskRecord {
  id: string;
  workspaceId: string;
  templateId?: string;
  title: string;
  description?: string;
  createdBy: string;
  priority: 'low' | 'normal' | 'high';
  status: CoreTaskStatus;
  suggestedDrivePath: string;
  suggestedOutputName: string;
  driveFileId?: string;
  driveFileLink?: string;
  attachments: AttachmentRef[];
  createdAt: string;
  updatedAt: string;
  logs: string[];
}

const TASK_STORE_FILE = process.env.CORE_TASK_STORE_FILE
  ? path.resolve(process.env.CORE_TASK_STORE_FILE)
  : path.resolve(process.cwd(), 'tmp', 'state', 'core-tasks.json');
const DRIVE_READER_LIST = (process.env.CORE_DRIVE_READERS || '').split(',').map(item => item.trim()).filter(Boolean);
const DRIVE_WRITER_LIST = (process.env.CORE_DRIVE_WRITERS || '').split(',').map(item => item.trim()).filter(Boolean);

function resolveMimeType(template?: CoreTemplate): string {
  const type = template?.outputTypes?.[0];
  switch (type) {
    case 'sheet':
      return 'application/vnd.google-apps.spreadsheet';
    case 'folder':
      return 'application/vnd.google-apps.folder';
    case 'json':
    case 'gmail':
    case 'gdoc':
    default:
      return 'application/vnd.google-apps.document';
  }
}

let cacheLoaded = false;
let records: CoreTaskRecord[] = [];

async function ensureStore(): Promise<void> {
  if (cacheLoaded) {
    return;
  }
  try {
    const raw = await fs.readFile(TASK_STORE_FILE, 'utf8');
    records = JSON.parse(raw) as CoreTaskRecord[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('Core task store betöltése sikertelen, új fájl készül.', error);
    }
    records = [];
    await fs.mkdir(path.dirname(TASK_STORE_FILE), { recursive: true });
    await fs.writeFile(TASK_STORE_FILE, '[]', 'utf8');
  }
  cacheLoaded = true;
}

async function persistStore(): Promise<void> {
  await fs.mkdir(path.dirname(TASK_STORE_FILE), { recursive: true });
  await fs.writeFile(TASK_STORE_FILE, JSON.stringify(records, null, 2), 'utf8');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'task';
}

function buildDriveSuggestion(workspace: CoreWorkspace, title: string): { path: string; name: string } {
  const date = new Date();
  const folder = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const safeTitle = slugify(title);
  const filename = `${date.toISOString().slice(0, 10)}-${safeTitle}`;
  const drivePath = [workspace.driveRoot.replace(/\/$/, ''), folder, filename].join('/');
  return { path: drivePath, name: filename }; // a tényleges Drive művelet később kerül beillesztésre
}

export async function createCoreTask(input: CreateCoreTaskInput): Promise<CoreTaskRecord> {
  await ensureStore();
  const suggestion = buildDriveSuggestion(input.workspace, input.title);
  const now = new Date().toISOString();
  let driveFileId: string | undefined;
  let driveFileLink: string | undefined;
  const skipDrivePlaceholder = input.templateId === 'billingo-sync';
  if (!skipDrivePlaceholder) {
    try {
      const template = input.workspace.templates.find(template => template.id === input.templateId);
      const provision = await ensureDrivePath(suggestion.path);
      const file = await createDriveFile(provision, resolveMimeType(template));
      driveFileId = file.fileId;
      driveFileLink = file.webViewLink;
      if (driveFileId) {
        await applyDrivePermissions(driveFileId, DRIVE_READER_LIST, DRIVE_WRITER_LIST);
      }
    } catch (error) {
      console.warn('Drive provisioning skipped / failed', error);
    }
  }
  const record: CoreTaskRecord = {
    id: randomUUID(),
    workspaceId: input.workspace.id,
    templateId: input.templateId,
    title: input.title,
    description: input.description,
    createdBy: input.createdBy,
    priority: input.priority || 'normal',
    status: 'queued',
    suggestedDrivePath: suggestion.path,
    suggestedOutputName: suggestion.name,
    driveFileId,
    driveFileLink,
    attachments: input.attachments || [],
    createdAt: now,
    updatedAt: now,
    logs: [
      'Task létrehozva, Drive placeholder lefoglalva.',
      skipDrivePlaceholder
        ? 'Drive placeholder kihagyva (billingo-sync).'
        : (driveFileId ? `Drive file: ${driveFileId}` : 'Drive művelet kihagyva vagy sikertelen'),
    ],
  };
  records.push(record);
  await persistStore();
  return record;
}

export async function listCoreTasks(limit = 50): Promise<CoreTaskRecord[]> {
  await ensureStore();
  return records
    .slice(-limit)
    .reverse();
}

export async function updateCoreTaskStatus(id: string, status: CoreTaskStatus, logEntry?: string): Promise<CoreTaskRecord | undefined> {
  await ensureStore();
  const target = records.find(record => record.id === id);
  if (!target) {
    return undefined;
  }
  target.status = status;
  target.updatedAt = new Date().toISOString();
  if (logEntry) {
    target.logs.push(logEntry);
  }
  await persistStore();
  return target;
}
