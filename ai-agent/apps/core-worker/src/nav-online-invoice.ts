import crypto from 'crypto';
import fetch from 'node-fetch';

export type NavInvoiceDirection = 'INBOUND' | 'OUTBOUND';

export type NavOnlineInvoiceQuery = {
  direction: NavInvoiceDirection;
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: number;
  dateType: 'issue' | 'ins';
};

type NavSoftwareConfig = {
  softwareId: string;
  softwareName: string;
  softwareOperation: string;
  softwareMainVersion: string;
  softwareDevName: string;
  softwareDevContact: string;
  softwareDevCountryCode: string;
  softwareDevTaxNumber?: string;
};

type NavOnlineInvoiceConfig = {
  baseUrl: string;
  login: string;
  password: string;
  signKey: string;
  exchangeKey: string;
  taxNumber?: string;
  software: NavSoftwareConfig;
};

const DEFAULT_BASE_URL = 'https://api.onlineszamla.nav.gov.hu/invoiceService/v3';

let tokenCache: { value: string; expiresAt: number } | null = null;

function resolveConfig(): NavOnlineInvoiceConfig {
  const login = process.env.NAV_ONLINE_INVOICE_USER || process.env.NAV_ONLINE_INVOICE_LOGIN || '';
  const password = process.env.NAV_ONLINE_INVOICE_PASSWORD || '';
  const signKey = process.env.NAV_ONLINE_INVOICE_SIGN_KEY || '';
  const exchangeKey = process.env.NAV_ONLINE_INVOICE_EXCHANGE_KEY || '';
  if (!login || !password || !signKey || !exchangeKey) {
    throw new Error('NAV Online Invoice: hiányzó login/password/sign/exchange key.');
  }
  const softwareId = resolveSoftwareId(
    process.env.NAV_ONLINE_INVOICE_SOFTWARE_ID,
    process.env.NAV_ONLINE_INVOICE_TAX_NUMBER || process.env.NAV_TAX_NUMBER,
  );
  return {
    baseUrl: (process.env.NAV_ONLINE_INVOICE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ''),
    login,
    password,
    signKey,
    exchangeKey,
    taxNumber: process.env.NAV_ONLINE_INVOICE_TAX_NUMBER || process.env.NAV_TAX_NUMBER,
    software: {
      softwareId,
      softwareName: process.env.NAV_ONLINE_INVOICE_SOFTWARE_NAME || 'Impact Hub AI Agent',
      softwareOperation: process.env.NAV_ONLINE_INVOICE_SOFTWARE_OPERATION || 'ONLINE_SERVICE',
      softwareMainVersion: process.env.NAV_ONLINE_INVOICE_SOFTWARE_VERSION || '1.0.0',
      softwareDevName: process.env.NAV_ONLINE_INVOICE_SOFTWARE_DEV_NAME || 'Impact Hub',
      softwareDevContact: process.env.NAV_ONLINE_INVOICE_SOFTWARE_DEV_CONTACT || 'support@impacthub.local',
      softwareDevCountryCode: process.env.NAV_ONLINE_INVOICE_SOFTWARE_DEV_COUNTRY || 'HU',
      softwareDevTaxNumber: normalizeTaxNumber(
        process.env.NAV_ONLINE_INVOICE_SOFTWARE_DEV_TAX_NUMBER
          || process.env.NAV_SOFTWARE_DEV_TAX_NUMBER
          || process.env.NAV_ONLINE_INVOICE_TAX_NUMBER
          || process.env.NAV_TAX_NUMBER,
      ),
    },
  };
}

function sha512Hex(value: string): string {
  return crypto.createHash('sha512').update(value, 'utf8').digest('hex').toUpperCase();
}

function sha3_512Hex(value: string): string {
  return crypto.createHash('sha3-512').update(value, 'utf8').digest('hex').toUpperCase();
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildRequestSignature(secret: string, requestId: string, timestamp: string): string {
  const maskedTimestamp = timestamp.replace(/[-:T.Z]/g, '').slice(0, 14);
  return sha3_512Hex(`${requestId}${maskedTimestamp}${secret}`);
}

function generateRequestId(): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const rand = Math.floor(Math.random() * 1e13).toString().padStart(13, '0');
  return `RID${stamp}${rand}`.slice(0, 30);
}

function normalizeTaxNumber(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const digits = value.replace(/\D/g, '');
  return digits.length >= 8 ? digits.slice(0, 8) : digits;
}

function buildFallbackSoftwareId(taxNumber?: string): string {
  const taxCore = normalizeTaxNumber(taxNumber) || '00000000';
  return `HU${taxCore}AIA00001`;
}

function resolveSoftwareId(rawId: string | undefined, taxNumber?: string): string {
  const normalized = rawId?.trim().toUpperCase() || '';
  const valid = /^[A-Z0-9-]{18}$/.test(normalized);
  return valid ? normalized : buildFallbackSoftwareId(taxNumber);
}

function buildSoftwareBlock(cfg: NavSoftwareConfig): string {
  return `
  <software>
    <softwareId>${xmlEscape(cfg.softwareId)}</softwareId>
    <softwareName>${xmlEscape(cfg.softwareName)}</softwareName>
    <softwareOperation>${xmlEscape(cfg.softwareOperation)}</softwareOperation>
    <softwareMainVersion>${xmlEscape(cfg.softwareMainVersion)}</softwareMainVersion>
    <softwareDevName>${xmlEscape(cfg.softwareDevName)}</softwareDevName>
    <softwareDevContact>${xmlEscape(cfg.softwareDevContact)}</softwareDevContact>
    <softwareDevCountryCode>${xmlEscape(cfg.softwareDevCountryCode)}</softwareDevCountryCode>
    ${cfg.softwareDevTaxNumber ? `<softwareDevTaxNumber>${xmlEscape(cfg.softwareDevTaxNumber)}</softwareDevTaxNumber>` : ''}
  </software>`.trim();
}

function buildUserBlock(cfg: NavOnlineInvoiceConfig, signature: string, token?: string): string {
  const passwordHash = sha512Hex(cfg.password);
  const tokenBlock = token ? `<common:exchangeToken>${xmlEscape(token)}</common:exchangeToken>` : '';
  const normalizedTax = normalizeTaxNumber(cfg.taxNumber);
  const taxBlock = normalizedTax ? `<common:taxNumber>${xmlEscape(normalizedTax)}</common:taxNumber>` : '';
  return `
  <common:user>
    <common:login>${xmlEscape(cfg.login)}</common:login>
    <common:passwordHash cryptoType="SHA-512">${passwordHash}</common:passwordHash>
    ${tokenBlock}
    ${taxBlock}
    <common:requestSignature cryptoType="SHA3-512">${xmlEscape(signature)}</common:requestSignature>
  </common:user>`.trim();
}

function buildHeaderBlock(requestId: string, timestamp: string, signature: string): string {
  return `
  <common:header>
    <common:requestId>${xmlEscape(requestId)}</common:requestId>
    <common:timestamp>${xmlEscape(timestamp)}</common:timestamp>
    <common:requestVersion>3.0</common:requestVersion>
    <common:headerVersion>1.0</common:headerVersion>
  </common:header>`.trim();
}

function buildTokenExchangeRequest(cfg: NavOnlineInvoiceConfig, requestId: string, timestamp: string): string {
  const signature = buildRequestSignature(cfg.signKey, requestId, timestamp);
  return `<?xml version="1.0" encoding="UTF-8"?>
<TokenExchangeRequest xmlns="http://schemas.nav.gov.hu/OSA/3.0/api" xmlns:common="http://schemas.nav.gov.hu/NTCA/1.0/common">
${buildHeaderBlock(requestId, timestamp, signature)}
${buildUserBlock(cfg, signature)}
${buildSoftwareBlock(cfg.software)}
</TokenExchangeRequest>`;
}

function resolveDateTag(dateType: 'issue' | 'ins'): string {
  return dateType === 'ins' ? 'insDate' : 'invoiceIssueDate';
}

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map((part) => Number(part));
  if (!year || !month || !day) {
    throw new Error(`NAV Online Invoice: ervenytelen datum: ${value}`);
  }
  return new Date(Date.UTC(year, month - 1, day));
}

function formatIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildDateBatches(dateFrom: string, dateTo: string, maxDaysInclusive = 35): Array<{
  from: string;
  to: string;
}> {
  if (maxDaysInclusive < 1) {
    throw new Error('NAV Online Invoice: maxDaysInclusive minimum 1.');
  }
  const start = parseIsoDate(dateFrom);
  const end = parseIsoDate(dateTo);
  if (start > end) {
    throw new Error('NAV Online Invoice: dateFrom nem lehet dateTo utan.');
  }
  const batches: Array<{ from: string; to: string }> = [];
  const maxSpanDays = maxDaysInclusive - 1;
  let cursor = start;
  while (cursor <= end) {
    const batchStart = cursor;
    const batchEnd = new Date(Date.UTC(
      batchStart.getUTCFullYear(),
      batchStart.getUTCMonth(),
      batchStart.getUTCDate() + maxSpanDays,
    ));
    if (batchEnd > end) {
      batches.push({ from: formatIsoDate(batchStart), to: formatIsoDate(end) });
      break;
    }
    batches.push({ from: formatIsoDate(batchStart), to: formatIsoDate(batchEnd) });
    cursor = new Date(Date.UTC(
      batchEnd.getUTCFullYear(),
      batchEnd.getUTCMonth(),
      batchEnd.getUTCDate() + 1,
    ));
  }
  return batches;
}

function buildQueryDigestRequest(
  cfg: NavOnlineInvoiceConfig,
  requestId: string,
  timestamp: string,
  query: NavOnlineInvoiceQuery,
): string {
  const signature = buildRequestSignature(cfg.signKey, requestId, timestamp);
  const dateTag = resolveDateTag(query.dateType);
  return `<?xml version="1.0" encoding="UTF-8"?>
<QueryInvoiceDigestRequest xmlns="http://schemas.nav.gov.hu/OSA/3.0/api" xmlns:common="http://schemas.nav.gov.hu/NTCA/1.0/common">
${buildHeaderBlock(requestId, timestamp, signature)}
${buildUserBlock(cfg, signature)}
${buildSoftwareBlock(cfg.software)}
  <page>${query.page}</page>
  <invoiceDirection>${query.direction}</invoiceDirection>
  <invoiceQueryParams>
    <mandatoryQueryParams>
      <${dateTag}>
        <dateFrom>${xmlEscape(query.dateFrom)}</dateFrom>
        <dateTo>${xmlEscape(query.dateTo)}</dateTo>
      </${dateTag}>
    </mandatoryQueryParams>
  </invoiceQueryParams>
</QueryInvoiceDigestRequest>`;
}

function extractToken(xml: string): { token?: string; validitySeconds?: number } {
  const tokenMatch = xml.match(/<encodedExchangeToken>([^<]+)<\/encodedExchangeToken>/i)
    || xml.match(/<exchangeToken>([^<]+)<\/exchangeToken>/i)
    || xml.match(/<token>([^<]+)<\/token>/i);
  const validityMatch = xml.match(/<tokenValidity>(\d+)<\/tokenValidity>/i)
    || xml.match(/<validity>(\d+)<\/validity>/i);
  return {
    token: tokenMatch?.[1],
    validitySeconds: validityMatch ? Number(validityMatch[1]) : undefined,
  };
}

function countInvoiceDigest(xml: string): number {
  const matches = xml.match(/<invoiceDigest\b/gi);
  return matches ? matches.length : 0;
}

async function exchangeToken(cfg: NavOnlineInvoiceConfig): Promise<string> {
  const now = new Date().toISOString();
  const requestId = generateRequestId();
  const requestXml = buildTokenExchangeRequest(cfg, requestId, now);
  const response = await fetch(`${cfg.baseUrl}/tokenExchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml', 'Accept': 'application/xml' },
    body: requestXml,
  });
  const responseXml = await response.text();
  if (!response.ok) {
    throw new Error(`NAV tokenExchange hiba: ${response.status} ${responseXml.slice(0, 500)}`);
  }
  const { token, validitySeconds } = extractToken(responseXml);
  if (!token) {
    throw new Error('NAV tokenExchange: nem sikerult tokent kiolvasni a valaszbol.');
  }
  const ttlMs = Math.max(60, validitySeconds || 300) * 1000;
  tokenCache = { value: token, expiresAt: Date.now() + ttlMs };
  return token;
}

async function getExchangeToken(cfg: NavOnlineInvoiceConfig): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 10_000) {
    return tokenCache.value;
  }
  return exchangeToken(cfg);
}

export async function fetchNavOnlineInvoiceDigest(query: NavOnlineInvoiceQuery): Promise<{
  count: number;
  requestMeta: Record<string, unknown>;
  responseXml: string;
}> {
  const cfg = resolveConfig();
  const timestamp = new Date().toISOString();
  const requestId = generateRequestId();
  const requestXml = buildQueryDigestRequest(cfg, requestId, timestamp, query);
  const response = await fetch(`${cfg.baseUrl}/queryInvoiceDigest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml', 'Accept': 'application/xml' },
    body: requestXml,
  });
  const responseXml = await response.text();
  if (!response.ok) {
    throw new Error(`NAV queryInvoiceDigest hiba: ${response.status} ${responseXml.slice(0, 500)}`);
  }
  const count = countInvoiceDigest(responseXml);
  return {
    count,
    requestMeta: {
      requestId,
      timestamp,
      direction: query.direction,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      page: query.page,
      pageSize: query.pageSize,
      dateType: query.dateType,
      softwareId: cfg.software.softwareId,
      baseUrl: cfg.baseUrl,
    },
    responseXml,
  };
}

export async function fetchNavOnlineInvoiceDigestBatched(
  query: NavOnlineInvoiceQuery,
  maxDaysInclusive = 35,
): Promise<{
  totalCount: number;
  batches: Array<{ from: string; to: string; count: number }>;
}> {
  const batches = buildDateBatches(query.dateFrom, query.dateTo, maxDaysInclusive);
  let totalCount = 0;
  const results: Array<{ from: string; to: string; count: number }> = [];
  for (const batch of batches) {
    const res = await fetchNavOnlineInvoiceDigest({
      ...query,
      dateFrom: batch.from,
      dateTo: batch.to,
    });
    totalCount += res.count;
    results.push({ from: batch.from, to: batch.to, count: res.count });
  }
  return { totalCount, batches: results };
}
