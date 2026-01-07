#!/usr/bin/env tsx
import fs from 'fs/promises';
import path from 'path';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { google } from 'googleapis';

const SHARED_SECRETS_HOME = process.env.GMAIL_SECRET_HOME
  || path.join(process.env.HOME || '', '.impact-secrets', 'secrets');
const DEFAULT_SECRETS_DIR = path.join(process.cwd(), 'tools', 'secrets', 'gmail');
const DEFAULT_CREDENTIALS_PATH = process.env.GMAIL_CREDENTIALS
  || path.join(SHARED_SECRETS_HOME, 'gmail-promotions-credentials.json')
  || path.join(DEFAULT_SECRETS_DIR, 'promotions-credentials.json');
const DEFAULT_TOKEN_PATH = process.env.GMAIL_TOKEN_PATH || process.env.GMAIL_TOKEN
  || path.join(SHARED_SECRETS_HOME, 'gmail-promotions-token.json');
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

interface GoogleCredentials {
  installed?: { client_id: string; client_secret: string; redirect_uris?: string[] };
  web?: { client_id: string; client_secret: string; redirect_uris?: string[] };
}

function extractClientConfig(credentials: GoogleCredentials) {
  const cfg = credentials.installed || credentials.web;
  if (!cfg) {
    throw new Error('A credentials.json nem tartalmaz "installed" vagy "web" blokkot.');
  }
  return cfg;
}

async function authorize(credentialsPath: string, tokenPath: string) {
  const raw = await fs.readFile(credentialsPath, 'utf8');
  const credentials = JSON.parse(raw) as GoogleCredentials;
  const cfg = extractClientConfig(credentials);
  const redirectUri = cfg.redirect_uris?.[0];
  const oAuth2Client = new google.auth.OAuth2(cfg.client_id, cfg.client_secret, redirectUri);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
  console.log('Nyisd meg a következő URL-t a böngészőben és engedélyezd a Gmail hozzáférést:');
  console.log(authUrl);
  const rl = readline.createInterface({ input, output });
  try {
    const code = (await rl.question('\nIlleszd be az engedélyezési kódot: ')).trim();
    if (!code) {
      throw new Error('Nem kaptam engedélyezési kódot.');
    }
    const { tokens } = await oAuth2Client.getToken(code);
    await fs.mkdir(path.dirname(tokenPath), { recursive: true });
    await fs.writeFile(tokenPath, JSON.stringify(tokens, null, 2), 'utf8');
    console.log(`✅ Token elmentve: ${tokenPath}`);
  } finally {
    rl.close();
  }
}

async function main() {
  const credentialsPath = process.argv[2] || DEFAULT_CREDENTIALS_PATH;
  const tokenPath = process.argv[3] || DEFAULT_TOKEN_PATH;
  await authorize(credentialsPath, tokenPath);
}

main().catch(err => {
  console.error('Gmail auth hiba:', err);
  process.exit(1);
});
