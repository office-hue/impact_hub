import fetch from 'node-fetch';

export type BillingoEndpointResult = {
  endpoint: string;
  count: number;
  items: unknown[];
};

type BillingoConfig = {
  baseUrl: string;
  apiKey: string;
  companyId?: string;
  endpoints: string[];
  pageParam: string;
  limitParam: string;
  pageSize: number;
  maxPages: number;
};

function resolveConfig(): BillingoConfig | null {
  const apiKey = process.env.BILLINGO_API_KEY || process.env.BILLINGO_TOKEN || '';
  if (!apiKey) {
    return null;
  }
  const baseUrl = (process.env.BILLINGO_API_BASE_URL || 'https://api.billingo.hu/v3').replace(/\/$/, '');
  const endpoints = (process.env.BILLINGO_SYNC_ENDPOINTS || 'documents,partners,products')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return {
    baseUrl,
    apiKey,
    companyId: process.env.BILLINGO_COMPANY_ID,
    endpoints,
    pageParam: process.env.BILLINGO_PAGE_PARAM || 'page',
    limitParam: process.env.BILLINGO_LIMIT_PARAM || 'limit',
    pageSize: Number(process.env.BILLINGO_PAGE_SIZE || 50),
    maxPages: Number(process.env.BILLINGO_MAX_PAGES || 10),
  };
}

function extractItems(payload: any): unknown[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

async function fetchEndpoint(cfg: BillingoConfig, endpoint: string): Promise<BillingoEndpointResult> {
  const headers = {
    'Accept': 'application/json',
    'X-API-KEY': cfg.apiKey,
  };
  const items: unknown[] = [];
  for (let page = 1; page <= cfg.maxPages; page += 1) {
    const url = new URL(`${cfg.baseUrl}/${endpoint.replace(/^\//, '')}`);
    url.searchParams.set(cfg.pageParam, String(page));
    url.searchParams.set(cfg.limitParam, String(cfg.pageSize));
    if (cfg.companyId) {
      url.searchParams.set('company_id', cfg.companyId);
    }
    const response = await fetch(url.toString(), { headers });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Billingo ${endpoint} hiba: ${response.status} ${text}`);
    }
    const payload = await response.json();
    const pageItems = extractItems(payload);
    if (!pageItems.length) {
      break;
    }
    items.push(...pageItems);
    if (pageItems.length < cfg.pageSize) {
      break;
    }
  }
  return { endpoint, count: items.length, items };
}

export async function fetchBillingoSnapshot(): Promise<{ results: BillingoEndpointResult[]; config: BillingoConfig }> {
  const cfg = resolveConfig();
  if (!cfg) {
    throw new Error('Billingo API key hiányzik (BILLINGO_API_KEY).');
  }
  const results: BillingoEndpointResult[] = [];
  for (const endpoint of cfg.endpoints) {
    results.push(await fetchEndpoint(cfg, endpoint));
  }
  return { results, config: cfg };
}
