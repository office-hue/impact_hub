import { google, gmail_v1 } from 'googleapis';
import { logger } from '@libs/logger';
import { getOAuthClient } from '@libs/integrations/google-auth';

let gmailClient: gmail_v1.Gmail | null = null;

interface FetchEmailOptions {
  maxResults?: number;
  labelIds?: string[];
  query?: string;
}

export interface GmailMessageSummary {
  id: string;
  threadId?: string | null;
  snippet?: string | null;
  subject?: string;
  from?: string;
  date?: string;
  labels?: string[];
}

function ensureClient(): gmail_v1.Gmail {
  if (gmailClient) {
    return gmailClient;
  }
  const auth = getOAuthClient(['GMAIL']);
  gmailClient = google.gmail({ version: 'v1', auth });
  return gmailClient;
}

// Test helper: külső kliens injektálása
export function __setGmailClient(client: gmail_v1.Gmail | null) {
  gmailClient = client;
}

export async function fetchRecentEmails(options: FetchEmailOptions = {}): Promise<GmailMessageSummary[]> {
  try {
    const gmail = ensureClient();
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      maxResults: options.maxResults ?? 5,
      labelIds: options.labelIds,
      q: options.query
    });

    const messages = listResponse.data.messages ?? [];
    const details = await Promise.all(
      messages.map(async (msg) => {
        if (!msg.id) return null;
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date']
        });
        return mapMessage(detail.data);
      })
    );

    return details.filter(Boolean) as GmailMessageSummary[];
  } catch (error) {
    logger.error({ error }, 'Gmail fetch failed');
    throw error;
  }
}

function mapMessage(message?: gmail_v1.Schema$Message): GmailMessageSummary | null {
  if (!message || !message.id) {
    return null;
  }

  const headers = new Map<string, string>();
  message.payload?.headers?.forEach((header) => {
    if (header.name && header.value) {
      headers.set(header.name.toLowerCase(), header.value);
    }
  });

  return {
    id: message.id,
    threadId: message.threadId,
    snippet: message.snippet,
    subject: headers.get('subject') ?? undefined,
    from: headers.get('from') ?? undefined,
    date: headers.get('date') ?? undefined,
    labels: message.labelIds ?? []
  };
}
