import { google, sheets_v4 } from 'googleapis';
import { logger } from '@libs/logger';
import { getOAuthClient } from '@libs/integrations/google-auth';

let sheetsClient: sheets_v4.Sheets | null = null;
const METADATA_CACHE_TTL_MS = Number(process.env.GSHEETS_METADATA_CACHE_TTL_MS ?? 2 * 60 * 1000);

interface MetadataCacheEntry {
  data: CachedMetadata;
  expiresAt: number;
}

const metadataCache = new Map<string, MetadataCacheEntry>();
const inflightMetadataFetch = new Map<string, Promise<CachedMetadata>>();

export interface SheetMetadata {
  sheetId?: number | null;
  title?: string | null;
  index?: number | null;
  rowCount?: number | null;
  columnCount?: number | null;
  hidden?: boolean | null;
}

export interface SheetValuesResult {
  spreadsheetId: string;
  spreadsheetTitle?: string | null;
  range: string;
  majorDimension?: string | null;
  values: (string | null)[][];
  metadata?: SheetMetadata[];
}

interface FetchSheetValuesInput {
  spreadsheetId: string;
  range: string;
  majorDimension?: sheets_v4.Params$Resource$Spreadsheets$Values$Get['majorDimension'];
  includeMetadata?: boolean;
  metadataRefresh?: boolean;
  metadataLimit?: number;
}

function ensureSheetsClient(): sheets_v4.Sheets {
  if (sheetsClient) {
    return sheetsClient;
  }
  const auth = getOAuthClient(['GSHEETS', 'GDRIVE']);
  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

function mapMetadata(sheets?: sheets_v4.Schema$Sheet[]): SheetMetadata[] | undefined {
  if (!sheets) {
    return undefined;
  }
  return sheets.map((sheet) => ({
    sheetId: sheet.properties?.sheetId,
    title: sheet.properties?.title,
    index: sheet.properties?.index,
    rowCount: sheet.properties?.gridProperties?.rowCount,
    columnCount: sheet.properties?.gridProperties?.columnCount,
    hidden: sheet.properties?.hidden
  }));
}

interface CachedMetadata {
  spreadsheetTitle?: string | null;
  metadata?: SheetMetadata[];
}

function getCachedMetadata(spreadsheetId: string): CachedMetadata | undefined {
  const entry = metadataCache.get(spreadsheetId);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.data;
  }
  if (entry) {
    metadataCache.delete(spreadsheetId);
  }
  return undefined;
}

function setCachedMetadata(spreadsheetId: string, data: CachedMetadata) {
  metadataCache.set(spreadsheetId, {
    data,
    expiresAt: Date.now() + METADATA_CACHE_TTL_MS
  });
}

async function fetchMetadata(spreadsheetId: string, metadataLimit?: number): Promise<CachedMetadata> {
  const sheets = ensureSheetsClient();
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'spreadsheetId,properties/title,sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount),hidden))'
  });
  const mapped = mapMetadata(response.data.sheets);
  const limited = typeof metadataLimit === 'number' && metadataLimit > 0 ? mapped?.slice(0, metadataLimit) : mapped;
  return {
    spreadsheetTitle: response.data.properties?.title,
    metadata: limited
  };
}

async function getMetadata(
  spreadsheetId: string,
  options: { forceRefresh?: boolean; metadataLimit?: number }
): Promise<CachedMetadata> {
  if (!options.forceRefresh) {
    const cached = getCachedMetadata(spreadsheetId);
    if (cached) {
      return cached;
    }
  }

  const inflight = inflightMetadataFetch.get(spreadsheetId);
  if (inflight) {
    return inflight;
  }

  const promise = fetchMetadata(spreadsheetId, options.metadataLimit)
    .then((data) => {
      setCachedMetadata(spreadsheetId, data);
      inflightMetadataFetch.delete(spreadsheetId);
      return data;
    })
    .catch((error) => {
      inflightMetadataFetch.delete(spreadsheetId);
      throw error;
    });

  inflightMetadataFetch.set(spreadsheetId, promise);
  return promise;
}

export async function fetchSheetValues(input: FetchSheetValuesInput): Promise<SheetValuesResult> {
  if (!input.spreadsheetId) {
    throw new Error('spreadsheetId is required');
  }
  if (!input.range) {
    throw new Error('range is required');
  }

  try {
    const sheets = ensureSheetsClient();

    const valuesResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: input.spreadsheetId,
      range: input.range,
      majorDimension: input.majorDimension
    });

    let metadataData: CachedMetadata | undefined;
    if (input.includeMetadata) {
      metadataData = await getMetadata(input.spreadsheetId, {
        forceRefresh: Boolean(input.metadataRefresh),
        metadataLimit: input.metadataLimit
      });
    }

    return {
      spreadsheetId: input.spreadsheetId,
      spreadsheetTitle: metadataData?.spreadsheetTitle,
      range: valuesResponse.data.range ?? input.range,
      majorDimension: valuesResponse.data.majorDimension,
      values: (valuesResponse.data.values as (string | null)[][]) ?? [],
      metadata: metadataData?.metadata
    };
  } catch (error) {
    logger.error({ error, spreadsheetId: input.spreadsheetId }, 'Google Sheets fetch failed');
    throw error;
  }
}

export interface CreateFormSheetInput {
  title: string;
  formId: string;
  responseId: string;
  answerDetails?: { questionId: string; question?: string; answer?: string }[];
  respondentEmail?: string | null;
  submittedAt?: string | null;
}

export interface CreatedSheetInfo {
  spreadsheetId?: string | null;
  spreadsheetUrl?: string | null;
  title?: string | null;
  range?: string;
}

export async function createSheetFromFormResponse(input: CreateFormSheetInput): Promise<CreatedSheetInfo> {
  const sheets = ensureSheetsClient();
  const createResponse = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: input.title
      }
    },
    fields: 'spreadsheetId,spreadsheetUrl,properties/title'
  });

  const spreadsheetId = createResponse.data.spreadsheetId;
  if (!spreadsheetId) {
    throw new Error('Failed to create spreadsheet');
  }

  const values: (string | null)[][] = [
    ['Field', 'Value'],
    ['Form ID', input.formId],
    ['Response ID', input.responseId]
  ];
  if (input.respondentEmail) {
    values.push(['Respondent', input.respondentEmail]);
  }
  if (input.submittedAt) {
    values.push(['Submitted at', input.submittedAt]);
  }
  values.push([]);
  values.push(['Question', 'Answer']);
  (input.answerDetails ?? []).forEach((detail) => {
    values.push([detail.question ?? detail.questionId, detail.answer ?? '—']);
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'A1',
    valueInputOption: 'RAW',
    requestBody: {
      values
    }
  });

  return {
    spreadsheetId,
    spreadsheetUrl: createResponse.data.spreadsheetUrl,
    title: createResponse.data.properties?.title,
    range: `A1:B${values.length}`
  };
}
