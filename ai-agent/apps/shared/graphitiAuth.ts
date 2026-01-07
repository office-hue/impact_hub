import { Buffer } from 'node:buffer';

interface HeaderOptions {
  extraHeaders?: Record<string, string>;
}

function encodeBasicAuth(user: string, password: string): string {
  const token = Buffer.from(`${user}:${password}`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

export function buildGraphitiAuthHeaders(options: HeaderOptions = {}): Record<string, string> {
  const headers: Record<string, string> = { ...(options.extraHeaders ?? {}) };

  const basicUser = process.env.GRAPHITI_BASIC_AUTH_USER ?? process.env.GRAPHITI_AUTH_USERNAME;
  const basicPassword = process.env.GRAPHITI_BASIC_AUTH_PASSWORD ?? process.env.GRAPHITI_AUTH_PASSWORD;
  const bearerToken = process.env.GRAPHITI_BEARER_TOKEN ?? process.env.GRAPHITI_JWT;
  const legacyApiKey = process.env.GRAPHITI_API_KEY;

  if (basicUser && basicPassword) {
    headers.Authorization = encodeBasicAuth(basicUser, basicPassword);
    return headers;
  }

  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
    return headers;
  }

  if (legacyApiKey) {
    headers['X-Graphiti-Api-Key'] = legacyApiKey;
  }

  return headers;
}
