import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

const DEFAULT_REDIRECT_URI = 'https://developers.google.com/oauthplayground';

type Prefix =
  | 'GDOCS'
  | 'GSHEETS'
  | 'GSLIDES'
  | 'GFORMS'
  | 'GCAL'
  | 'GDRIVE'
  | 'GMAIL';

function readCredentials(prefix: Prefix) {
  return {
    clientId: process.env[`${prefix}_CLIENT_ID`],
    clientSecret: process.env[`${prefix}_CLIENT_SECRET`],
    refreshToken: process.env[`${prefix}_REFRESH_TOKEN`],
    redirectUri: process.env[`${prefix}_REDIRECT_URI`]
  };
}

export function getOAuthClient(preferredPrefixes: Prefix[] = []): OAuth2Client {
  const prefixes: Prefix[] = [...preferredPrefixes, 'GCAL', 'GDRIVE', 'GMAIL'];

  for (const prefix of prefixes) {
    const creds = readCredentials(prefix);
    if (creds.clientId && creds.clientSecret && creds.refreshToken) {
      const redirectUri = creds.redirectUri ?? DEFAULT_REDIRECT_URI;
      const client = new google.auth.OAuth2(creds.clientId, creds.clientSecret, redirectUri);
      client.setCredentials({ refresh_token: creds.refreshToken });
      return client;
    }
  }

  throw new Error('Google OAuth2 környezeti változók hiányoznak – töltsd ki a GMAIL_/GDRIVE_ mezőket.');
}
