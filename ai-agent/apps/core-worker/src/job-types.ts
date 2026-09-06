export type CoreJobType = 'generic' | 'document_ingest' | 'memory_sync' | 'billingo_sync' | 'nav_online_invoice_sync';

export interface CoreJobPayload {
  taskId: string;
  workspaceId: string;
  templateId?: string;
  driveFileId?: string;
  createdBy: string;
  jobType?: CoreJobType | string | null;
  params?: Record<string, unknown> | null;
}

const SUPPORTED: CoreJobType[] = ['generic', 'document_ingest', 'memory_sync', 'billingo_sync', 'nav_online_invoice_sync'];

export function normalizeJobType(value?: string | CoreJobType | null): CoreJobType {
  if (typeof value !== 'string') {
    return 'generic';
  }
  const lowered = value.toLowerCase();
  return (SUPPORTED as string[]).includes(lowered) ? (lowered as CoreJobType) : 'generic';
}

export function isDocumentJob(payload: CoreJobPayload): boolean {
  return normalizeJobType(payload.jobType) === 'document_ingest';
}

export function isMemoryJob(payload: CoreJobPayload): boolean {
  return normalizeJobType(payload.jobType) === 'memory_sync';
}
