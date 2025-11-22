import { google, drive_v3 } from 'googleapis';
import { logger } from '@libs/logger';
import { getOAuthClient } from '@libs/integrations/google-auth';

let driveClient: drive_v3.Drive | null = null;

interface ListFilesOptions {
  folderId?: string;
  mimeType?: string;
  pageSize?: number;
}

export interface DriveFileSummary {
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
  modifiedTime?: string | null;
  webViewLink?: string | null;
}

function ensureClient(): drive_v3.Drive {
  if (driveClient) {
    return driveClient;
  }
  const auth = getOAuthClient(['GDRIVE']);
  driveClient = google.drive({ version: 'v3', auth });
  return driveClient;
}

export async function listDriveFiles(options: ListFilesOptions = {}): Promise<DriveFileSummary[]> {
  try {
    const drive = ensureClient();
    const { folderId, mimeType, pageSize } = options;

    const queryParts: string[] = [];
    if (folderId) {
      queryParts.push(`'${folderId}' in parents`);
    }
    if (mimeType) {
      queryParts.push(`mimeType = '${mimeType}'`);
    }
    queryParts.push("trashed = false");

    const response = await drive.files.list({
      q: queryParts.join(' and '),
      fields: 'files(id,name,mimeType,modifiedTime,webViewLink)',
      pageSize: pageSize ?? 10,
      orderBy: 'modifiedTime desc'
    });

    return response.data.files ?? [];
  } catch (error) {
    logger.error({ error }, 'Drive list failed');
    throw error;
  }
}
