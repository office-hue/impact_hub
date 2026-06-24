import fs from 'fs/promises';
import path from 'path';
import { google } from 'googleapis';

type OAuthClient = {
  client_id: string;
  client_secret: string;
  redirect_uris?: string[];
};

function resolvePath(value: string | undefined, fallback: string): string {
  return value ? path.resolve(value) : path.resolve(process.cwd(), fallback);
}

function parseArgs(): { code?: string } {
  const codeArg = process.argv.find(arg => arg.startsWith('--code='));
  if (codeArg) {
    return { code: codeArg.replace('--code=', '') };
  }
  return {};
}

async function loadClient(clientPath: string): Promise<OAuthClient> {
  const raw = await fs.readFile(clientPath, 'utf8');
  const parsed = JSON.parse(raw);
  const client = parsed.installed || parsed.web || parsed;
  if (!client?.client_id || !client?.client_secret) {
    throw new Error('OAuth kliens JSON hiányos');
  }
  return client as OAuthClient;
}

async function main(): Promise<void> {
  const clientPath = resolvePath(process.env.CORE_DRIVE_OAUTH_CLIENT, 'secrets/drive-oauth-client.json');
  const tokenPath = resolvePath(process.env.CORE_DRIVE_OAUTH_TOKEN, 'secrets/drive-oauth-token.json');
  const { code } = parseArgs();
  const client = await loadClient(clientPath);
  const redirectUri = client.redirect_uris?.[0] || 'urn:ietf:wg:oauth:2.0:oob';
  const oauth = new google.auth.OAuth2(client.client_id, client.client_secret, redirectUri);

  if (!code) {
    const authUrl = oauth.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets',
      ],
    });
    console.log('Nyisd meg ezt a linket, engedélyezd a hozzáférést, majd futtasd újra:');
    console.log(`node tools/drive/drive-oauth-auth.ts --code=...`);
    console.log(authUrl);
    return;
  }

  const { tokens } = await oauth.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error('A tokenben nincs refresh_token. Nyisd meg újra a linket, consent szükséges.');
  }
  await fs.mkdir(path.dirname(tokenPath), { recursive: true });
  await fs.writeFile(tokenPath, JSON.stringify(tokens, null, 2), 'utf8');
  console.log(`Token mentve ide: ${tokenPath}`);
}

main().catch(error => {
  console.error('OAuth token generálás sikertelen:', error);
  process.exit(1);
});
