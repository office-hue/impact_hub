import fetch from 'node-fetch';

const SERVER_URL = process.env.LANGFUSE_SERVER_URL;
const SERVER_API_KEY = process.env.LANGFUSE_SERVER_API_KEY;
const PUBLIC_API_KEY = process.env.LANGFUSE_PUBLIC_API_KEY;

export interface LangfuseEvent {
  name: string;
  sessionId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export function isLangfuseEnabled(): boolean {
  return Boolean(SERVER_URL && SERVER_API_KEY);
}

export async function trackLangfuseEvent(event: LangfuseEvent): Promise<void> {
  if (!isLangfuseEnabled()) {
    return;
  }
  try {
    const url = new URL('/api/public/track', SERVER_URL!).toString();
    const payload = {
      event_name: event.name,
      session_id: event.sessionId,
      user_id: event.userId,
      metadata: event.metadata ?? {},
      public_key: PUBLIC_API_KEY,
      timestamp: new Date().toISOString(),
    };
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVER_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn('Langfuse event küldési hiba', error);
  }
}
