import { google, drive_v3 } from 'googleapis';
import path from 'path';
import fs from 'fs/promises';

interface DriveCredentials {
  client_email: string;
  private_key: string;
}

const DRIVE_CREDENTIALS_PATH = process.env.CORE_DRIVE_SERVICE_ACCOUNT || path.resolve(process.cwd(), 'config', 'drive-service-account.json');
let cachedDrive: drive_v3.Drive | null = null;

async function loadCredentials(): Promise<DriveCredentials> {
  try {
    const raw = await fs.readFile(DRIVE_CREDENTIALS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error('drive credentials missing fields');
    }
    return parsed as DriveCredentials;
  } catch (error) {
    throw new Error(`Drive credentials betöltése sikertelen: ${String(error)}`);
  }
}

async function getDriveClient(): Promise<drive_v3.Drive> {
  if (cachedDrive) {
    return cachedDrive;
  }
  const creds = await loadCredentials();
  const jwt = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  cachedDrive = google.drive({ version: 'v3', auth: jwt });
  return cachedDrive;
}

function splitPathSegments(fullPath: string): string[] {
  return fullPath
    .split('/')
    .map(segment => segment.trim())
    .filter(Boolean);
}

async function findOrCreateFolder(parentId: string | undefined, name: string): Promise<string> {
  const drive = await getDriveClient();
  const qParts = [`mimeType='application/vnd.google-apps.folder'`, `name='${name.replace(/'/g, "\\'")}'`, 'trashed=false'];
  if (parentId) {
    qParts.push(`'${parentId}' in parents`);
  }
  const search = await drive.files.list({
    q: qParts.join(' and '),
    fields: 'files(id, name)'
  });
  const existing = search.data.files?.[0]?.id;
  if (existing) {
    return existing;
  }
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    },
    fields: 'id'
  });
  if (!created.data.id) {
    throw new Error('Drive folder létrehozás sikertelen');
  }
  return created.data.id;
}

export interface DriveFileSuggestion {
  fullPath: string;
  folderId: string;
  fileName: string;
}

export async function ensureDrivePath(fullPath: string): Promise<DriveFileSuggestion> {
  const segments = splitPathSegments(fullPath);
  if (!segments.length) {
    throw new Error('drive path empty');
  }
  let parentId: string | undefined = undefined;
  for (let i = 0; i < segments.length - 1; i++) {
    parentId = await findOrCreateFolder(parentId, segments[i]);
  }
  const folderId = parentId ?? await findOrCreateFolder(undefined, segments[0]);
  return {
    fullPath,
    folderId,
    fileName: segments[segments.length - 1],
  };
}

export async function createDriveFile(suggestion: DriveFileSuggestion, mimeType: string): Promise<{ fileId: string; webViewLink?: string }> {
  const drive = await getDriveClient();
  const existing = await drive.files.list({
    q: ['trashed=false', `name='${suggestion.fileName.replace(/'/g, "\\'")}'`, `'${suggestion.folderId}' in parents`].join(' and '),
    fields: 'files(id, webViewLink)'
  });
  if (existing.data.files?.length) {
    const file = existing.data.files[0];
    return { fileId: file.id!, webViewLink: file.webViewLink ?? undefined };
  }
  const created = await drive.files.create({
    requestBody: {
      name: suggestion.fileName,
      mimeType,
      parents: [suggestion.folderId],
    },
    fields: 'id, webViewLink'
  });
  if (!created.data.id) {
    throw new Error('Drive file létrehozás sikertelen');
  }
  return { fileId: created.data.id, webViewLink: created.data.webViewLink ?? undefined };
}

export async function applyDrivePermissions(fileId: string, readers: string[] = [], writers: string[] = []): Promise<void> {
  const drive = await getDriveClient();
  const promises: Array<Promise<unknown>> = [];
  for (const emailAddress of readers) {
    promises.push(drive.permissions.create({
      fileId,
      requestBody: { type: 'user', role: 'reader', emailAddress },
      sendNotificationEmail: false,
    }));
  }
  for (const emailAddress of writers) {
    promises.push(drive.permissions.create({
      fileId,
      requestBody: { type: 'user', role: 'writer', emailAddress },
      sendNotificationEmail: false,
    }));
  }
  await Promise.allSettled(promises);
}
