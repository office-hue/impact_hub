import crypto from 'node:crypto';
import type { CapabilityManifest } from './types.js';
import { registerCapability } from './registry.js';
import type { CoreAgentState } from '../state.js';

type AdsPlatform = 'meta' | 'googleads' | 'tiktok' | 'ga4' | 'youtube';

type AdsEvent = {
  platform: AdsPlatform;
  eventName?: string;
  eventId?: string;
  eventTime?: number;
  actionSource?: string;
  eventSourceUrl?: string;
  value?: number;
  currency?: string;
  gclid?: string;
  dclid?: string;
  fbp?: string;
  fbc?: string;
  payload?: Record<string, unknown>;
};

type AdsEventIngestInput = {
  events?: AdsEvent[];
  dryRun?: boolean;
};

type AdsEventIngestOutput = {
  kind: 'ads';
  status: 'ok' | 'skipped' | 'error';
  ingested: number;
  events?: AdsEvent[];
  results: Array<{
    platform: AdsPlatform;
    status: 'ok' | 'error';
    httpStatus?: number;
    response?: unknown;
    error?: string;
  }>;
  summary: string;
};

type AdsDecisionInput = {
  events?: AdsEvent[];
  budgetMonthlyHuf?: number;
  landingUrl?: string;
  language?: string;
  country?: string;
  platforms?: AdsPlatform[];
  executeMode?: 'dry-run' | 'live';
};

type AdsDecisionOutput = {
  kind: 'ads';
  status: 'ok';
  decision: {
    budgetMonthlyHuf: number;
    perPlatformBudgetHuf: number;
    landingUrl: string;
    language: string;
    country: string;
    platforms: AdsPlatform[];
    executeMode: 'dry-run' | 'live';
  };
  summary: string;
};

type AdsExecuteInput = {
  decision?: AdsDecisionOutput['decision'];
  executeMode?: 'dry-run' | 'live';
};

type AdsExecuteOutput = {
  kind: 'ads';
  status: 'ok' | 'skipped' | 'error';
  mode: 'dry-run' | 'live';
  summary: string;
  actions?: Array<{ platform: AdsPlatform; status: 'ok' | 'error'; detail?: string }>;
  reason?: string;
};

const PLATFORM_ENDPOINTS: Record<AdsPlatform, string> = {
  meta: '/event/meta',
  googleads: '/event/googleads',
  tiktok: '/event/tiktok',
  ga4: '/event/ga4',
  youtube: '/event/youtube',
};

function pickBaseUrl(): string | undefined {
  return process.env.ADS_CAPI_BASE_URL || process.env.CAPI_PROXY_URL || process.env.CAPI_BASE_URL;
}

function pickSharedSecret(): string | undefined {
  return process.env.ADS_CAPI_SHARED_SECRET || process.env.CAPI_SHARED_SECRET;
}

function normalizeEvent(event: AdsEvent, state: CoreAgentState): Record<string, unknown> {
  const eventId = event.eventId || crypto.randomUUID();
  const eventTime = event.eventTime || Math.floor(Date.now() / 1000);
  const actionSource = event.actionSource || 'website';
  const eventSourceUrl = event.eventSourceUrl || state.userMessage || '';
  const payload = event.payload ? { ...event.payload } : {};
  return {
    event_id: eventId,
    event_name: event.eventName || payload.event_name || 'Purchase',
    event_time: eventTime,
    action_source: actionSource,
    event_source_url: eventSourceUrl,
    value: event.value ?? payload.value,
    currency: event.currency ?? payload.currency,
    gclid: event.gclid ?? payload.gclid,
    dclid: event.dclid ?? payload.dclid,
    fbp: event.fbp ?? payload.fbp,
    fbc: event.fbc ?? payload.fbc,
    ...payload,
  };
}

async function postEvent(
  baseUrl: string,
  platform: AdsPlatform,
  payload: Record<string, unknown>,
  sharedSecret?: string,
): Promise<{ status: 'ok' | 'error'; httpStatus?: number; response?: unknown; error?: string }> {
  const url = `${baseUrl.replace(/\/$/, '')}${PLATFORM_ENDPOINTS[platform]}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sharedSecret) headers['X-Capi-Key'] = sharedSecret;
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // keep raw text
    }
    if (!res.ok) {
      return { status: 'error', httpStatus: res.status, response: parsed, error: 'http_error' };
    }
    return { status: 'ok', httpStatus: res.status, response: parsed };
  } catch (error) {
    return { status: 'error', error: error instanceof Error ? error.message : 'fetch_error' };
  }
}

async function invokeAdsEventIngest(
  input: AdsEventIngestInput,
  state: CoreAgentState,
): Promise<AdsEventIngestOutput> {
  const baseUrl = pickBaseUrl();
  if (!baseUrl) {
    return {
      kind: 'ads',
      status: 'skipped',
      ingested: 0,
      events: [],
      results: [],
      summary: 'Ads ingest skipped (missing ADS_CAPI_BASE_URL).',
    };
  }
  const events = input.events ?? [];
  if (!events.length) {
    return {
      kind: 'ads',
      status: 'skipped',
      ingested: 0,
      events: [],
      results: [],
      summary: 'Ads ingest skipped (no events).',
    };
  }

  const sharedSecret = pickSharedSecret();
  const results: AdsEventIngestOutput['results'] = [];
  for (const event of events) {
    const payload = normalizeEvent(event, state);
    if (input.dryRun) {
      results.push({ platform: event.platform, status: 'ok', response: { dryRun: true } });
      continue;
    }
    const res = await postEvent(baseUrl, event.platform, payload, sharedSecret);
    results.push({ platform: event.platform, ...res });
  }
  const ingested = results.filter(r => r.status === 'ok').length;
  const failed = results.length - ingested;
  return {
    kind: 'ads',
    status: failed ? 'error' : 'ok',
    ingested,
    events,
    results,
    summary: `Ads ingest ${failed ? 'partial' : 'ok'}: ${ingested}/${results.length} event.`,
  };
}

async function invokeAdsDecision(input: AdsDecisionInput & { input?: AdsDecisionInput }): Promise<AdsDecisionOutput> {
  const flattened = input.input && typeof input.input === 'object' ? { ...input.input, ...input } : input;
  const budgetMonthlyHuf =
    flattened.budgetMonthlyHuf ?? Number(process.env.ADS_BUDGET_MONTHLY_HUF || 50000);
  const landingUrl =
    flattened.landingUrl || process.env.ADS_DEFAULT_LANDING_URL || 'https://app.sharity.hu/impactshop/';
  const language = flattened.language || process.env.ADS_DEFAULT_LANGUAGE || 'hu';
  const country = flattened.country || process.env.ADS_DEFAULT_COUNTRY || 'HU';
  const platforms =
    flattened.platforms ??
    (process.env.ADS_DEFAULT_PLATFORMS || 'meta,googleads,tiktok,youtube')
      .split(',')
      .map(p => p.trim())
      .filter(Boolean) as AdsPlatform[];
  const perPlatformBudgetHuf = Math.max(0, Math.floor(budgetMonthlyHuf / Math.max(1, platforms.length)));
  const executeMode =
    flattened.executeMode || (process.env.ADS_EXECUTE_MODE === 'live' ? 'live' : 'dry-run');

  return {
    kind: 'ads',
    status: 'ok',
    decision: {
      budgetMonthlyHuf,
      perPlatformBudgetHuf,
      landingUrl,
      language,
      country,
      platforms,
      executeMode,
    },
    summary: `Ads decision ok: ${platforms.join(', ')} • ${perPlatformBudgetHuf} HUF / platform / hó.`,
  };
}

async function invokeAdsExecute(input: AdsExecuteInput): Promise<AdsExecuteOutput> {
  const decision = input.decision;
  if (!decision) {
    return { kind: 'ads', status: 'error', mode: 'dry-run', summary: 'Ads execute failed (missing decision).' };
  }
  const requestedMode = input.executeMode || decision.executeMode || 'dry-run';
  const allowLive = process.env.ADS_EXECUTE_MODE === 'live';
  const mode: AdsExecuteOutput['mode'] = requestedMode === 'live' && allowLive ? 'live' : 'dry-run';
  if (mode === 'dry-run') {
    return {
      kind: 'ads',
      status: 'skipped',
      mode,
      reason: 'dry_run',
      summary: 'Ads execute skipped (dry-run).',
    };
  }

  const managementUrl = process.env.ADS_MANAGEMENT_BASE_URL;
  if (!managementUrl) {
    return {
      kind: 'ads',
      status: 'error',
      mode,
      summary: 'Ads execute failed (missing ADS_MANAGEMENT_BASE_URL).',
    };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = process.env.ADS_MANAGEMENT_API_KEY;
  if (apiKey) headers['X-Api-Key'] = apiKey;
  const payload = { decision };
  const actions: AdsExecuteOutput['actions'] = [];
  try {
    const res = await fetch(`${managementUrl.replace(/\/$/, '')}/ads/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return {
        kind: 'ads',
        status: 'error',
        mode,
        summary: `Ads execute failed (http ${res.status}).`,
      };
    }
    actions.push(...decision.platforms.map(platform => ({ platform, status: 'ok' as const })));
    return {
      kind: 'ads',
      status: 'ok',
      mode,
      actions,
      summary: 'Ads execute ok (live).',
    };
  } catch (error) {
    return {
      kind: 'ads',
      status: 'error',
      mode,
      summary: error instanceof Error ? error.message : 'Ads execute failed.',
    };
  }
}

export const adsEventIngestCapability: CapabilityManifest<AdsEventIngestInput, AdsEventIngestOutput> = {
  id: 'ads-event-ingest',
  name: 'Ads Event Ingest',
  description: 'Bejövő Meta/Google/TikTok/GA4/YouTube események normalizálása és továbbítása a CAPI proxy felé.',
  inputSchema: {
    type: 'object',
    properties: {
      events: { type: 'array' },
      dryRun: { type: 'boolean' },
    },
  },
  invoke: invokeAdsEventIngest,
  tags: ['ads', 'capi', 'ingest', 'events'],
  priority: 7,
};

export const adsDecisionCapability: CapabilityManifest<AdsDecisionInput, AdsDecisionOutput> = {
  id: 'ads-decision',
  name: 'Ads Decision',
  description: 'Hirdetési döntés (platformok, budget, landing, nyelv) beállítása.',
  inputSchema: {
    type: 'object',
    properties: {
      budgetMonthlyHuf: { type: 'number' },
      landingUrl: { type: 'string' },
      language: { type: 'string' },
      country: { type: 'string' },
      platforms: { type: 'array' },
      executeMode: { type: 'string' },
    },
  },
  invoke: invokeAdsDecision,
  tags: ['ads', 'decision', 'targeting'],
  priority: 6,
};

export const adsExecuteCapability: CapabilityManifest<AdsExecuteInput, AdsExecuteOutput> = {
  id: 'ads-execute',
  name: 'Ads Execute',
  description: 'Hirdetések indítása (alapból dry-run, élő mód env engedéllyel).',
  inputSchema: {
    type: 'object',
    properties: {
      decision: { type: 'object' },
      executeMode: { type: 'string' },
    },
  },
  invoke: invokeAdsExecute,
  tags: ['ads', 'execute', 'campaign'],
  priority: 5,
};

registerCapability(adsEventIngestCapability);
registerCapability(adsDecisionCapability);
registerCapability(adsExecuteCapability);
