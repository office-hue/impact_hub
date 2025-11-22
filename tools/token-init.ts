/**
 * Gmail OAuth token init helper (installed app).
 * - Használat: GMAIL_CREDENTIALS=credentials.json GMAIL_TOKEN=token.json ts-node tools/token-init.ts
 * - Megjeleníti a consent URL-t, majd kér egy auth kódot, cserébe elmenti a token.json-t.
 */
import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';
import {google} from 'googleapis';

const CRED_PATH = process.env.GMAIL_CREDENTIALS || '';
const TOKEN_PATH = process.env.GMAIL_TOKEN || 'token.json';

async function main() {
  if (!CRED_PATH) throw new Error('GMAIL_CREDENTIALS hiányzik');
  const creds = JSON.parse(await fs.readFile(path.resolve(CRED_PATH), 'utf8'));
  const {client_secret, client_id, redirect_uris} = creds.installed || creds.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
  });
  console.log('Nyisd meg ezt az URL-t, és add meg a kódot:\n', authUrl);

  const rl = readline.createInterface({input: process.stdin, output: process.stdout});
  const code: string = await new Promise(resolve => rl.question('Auth kód: ', resolve));
  rl.close();

  const {tokens} = await oAuth2Client.getToken(code.trim());
  oAuth2Client.setCredentials(tokens);
  await fs.writeFile(path.resolve(TOKEN_PATH), JSON.stringify(tokens, null, 2), 'utf8');
  console.log('Token elmentve:', TOKEN_PATH);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
