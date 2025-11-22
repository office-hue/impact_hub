import {promises as fs} from 'fs';
import * as path from 'path';
import {google} from 'googleapis';

export type GmailAuthConfig = {
  credentialsPath: string;
  tokenPath: string;
  delegatedUser?: string; // service account esetén
};

export type GmailAuthResult = {
  client: any;
  user: string;
};

/**
 * Gmail auth helper – támogatja az OAuth “installed app” és a service account use-case-et.
 * - creds JSON és token JSON útvonalai env-ben: GMAIL_CREDENTIALS, GMAIL_TOKEN.
 * - Service account: ha a creds tartalmaz "type": "service_account".
 */
export async function getGmailAuth(cfg: GmailAuthConfig): Promise<GmailAuthResult> {
  const credPath = path.resolve(cfg.credentialsPath);
  const tokenPath = path.resolve(cfg.tokenPath);
  const credsRaw = await fs.readFile(credPath, 'utf8');
  const creds = JSON.parse(credsRaw);

  // Service Account
  if (creds.type === 'service_account') {
    const scopes = ['https://www.googleapis.com/auth/gmail.readonly'];
    const client = new google.auth.JWT(
      creds.client_email,
      undefined,
      creds.private_key,
      scopes,
      cfg.delegatedUser || undefined
    );
    return {client, user: cfg.delegatedUser || 'me'};
  }

  // Installed app OAuth
  const {client_secret, client_id, redirect_uris} = creds.installed || creds.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  const tokenRaw = await fs.readFile(tokenPath, 'utf8');
  const token = JSON.parse(tokenRaw);
  oAuth2Client.setCredentials(token);
  return {client: oAuth2Client, user: 'me'};
}
