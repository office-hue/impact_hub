import fs from 'fs/promises';
import path from 'path';
import { google, sheets_v4 } from 'googleapis';

interface DriveCredentials {
  client_email: string;
  private_key: string;
}

interface OAuthClientCredentials {
  client_id: string;
  client_secret: string;
  redirect_uris?: string[];
}

interface OAuthTokenCredentials {
  refresh_token: string;
}

const SHEETS_CREDENTIALS_PATH = process.env.CORE_DRIVE_SERVICE_ACCOUNT
  || path.resolve(process.cwd(), 'config', 'drive-service-account.json');
const OAUTH_CLIENT_PATH = process.env.CORE_DRIVE_OAUTH_CLIENT
  ? path.resolve(process.env.CORE_DRIVE_OAUTH_CLIENT)
  : undefined;
const OAUTH_TOKEN_PATH = process.env.CORE_DRIVE_OAUTH_TOKEN
  ? path.resolve(process.env.CORE_DRIVE_OAUTH_TOKEN)
  : undefined;
let cachedSheets: sheets_v4.Sheets | null = null;

async function loadCredentials(): Promise<DriveCredentials> {
  try {
    const raw = await fs.readFile(SHEETS_CREDENTIALS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed?.client_email || !parsed?.private_key) {
      throw new Error('sheets credentials missing fields');
    }
    return parsed as DriveCredentials;
  } catch (error) {
    throw new Error(`Sheets credentials betöltése sikertelen: ${String(error)}`);
  }
}

async function loadOAuthClient(): Promise<OAuthClientCredentials> {
  if (!OAUTH_CLIENT_PATH) {
    throw new Error('CORE_DRIVE_OAUTH_CLIENT nincs beállítva');
  }
  const raw = await fs.readFile(OAUTH_CLIENT_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const client = parsed.installed || parsed.web || parsed;
  if (!client?.client_id || !client?.client_secret) {
    throw new Error('OAuth kliens JSON hiányos');
  }
  return client as OAuthClientCredentials;
}

async function loadOAuthToken(): Promise<OAuthTokenCredentials> {
  if (!OAUTH_TOKEN_PATH) {
    throw new Error('CORE_DRIVE_OAUTH_TOKEN nincs beállítva');
  }
  const raw = await fs.readFile(OAUTH_TOKEN_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed?.refresh_token) {
    throw new Error('OAuth token JSON hiányos (refresh_token)');
  }
  return parsed as OAuthTokenCredentials;
}

async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  if (cachedSheets) {
    return cachedSheets;
  }
  if (OAUTH_CLIENT_PATH && OAUTH_TOKEN_PATH) {
    const client = await loadOAuthClient();
    const token = await loadOAuthToken();
    const oauth = new google.auth.OAuth2(
      client.client_id,
      client.client_secret,
      client.redirect_uris?.[0],
    );
    oauth.setCredentials({ refresh_token: token.refresh_token });
    cachedSheets = google.sheets({ version: 'v4', auth: oauth });
    return cachedSheets;
  }
  const credentials = await loadCredentials();
  const jwt = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  cachedSheets = google.sheets({ version: 'v4', auth: jwt });
  return cachedSheets;
}

export async function writeSheetValues(
  spreadsheetId: string,
  range: string,
  values: Array<Array<string | number | boolean | null>>,
): Promise<void> {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: {
      values,
    },
  });
}
