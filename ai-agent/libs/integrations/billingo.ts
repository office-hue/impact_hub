import { logger } from '@libs/logger';

const BILLINGO_BASE = 'https://api.billingo.hu/v3';

type BillingoListParams = {
  page?: number;
  perPage?: number;
};

async function billingoFetch<T>(path: string, params?: BillingoListParams): Promise<T> {
  const apiKey = process.env.BILLINGO_API_KEY;
  if (!apiKey) {
    throw new Error('BILLINGO_API_KEY hiányzik a környezetből');
  }

  const url = new URL(path, BILLINGO_BASE);
  if (params?.page) url.searchParams.set('page', String(params.page));
  if (params?.perPage) url.searchParams.set('per_page', String(params.perPage));

  const fetchRuntime: any = (globalThis as any).fetch;
  if (!fetchRuntime) {
    throw new Error('Global fetch nem elérhető (Node 18+ szükséges)');
  }

  const resp = await fetchRuntime(url, {
    headers: { 'X-API-KEY': apiKey, 'Accept': 'application/json' }
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    logger.warn({ status: resp.status, body }, 'Billingo API hívás sikertelen');
    throw new Error(`Billingo API hiba (${resp.status}).`);
  }
  return await resp.json() as T;
}

// --- Public API ---

export async function listBillingoInvoices(params?: BillingoListParams) {
  return billingoFetch<unknown>('/invoices', params);
}

export async function listBillingoPartners(params?: BillingoListParams) {
  return billingoFetch<unknown>('/partners', params);
}

export async function listBillingoProducts(params?: BillingoListParams) {
  return billingoFetch<unknown>('/products', params);
}
