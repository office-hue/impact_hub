#!/usr/bin/env tsx
import fs from 'fs/promises';
import path from 'path';
import { google, gmail_v1 } from 'googleapis';
import { loadShopRegistry, resolveDefaultNgoSlug } from '../ingest/shops-registry.js';
import type { NormalizedCoupon } from '../ingest/normalizer.js';

const DEFAULT_OUTPUT = path.join(process.cwd(), 'tmp', 'ingest', 'raw', 'gmail-promotions.json');
const DEFAULT_NORMALIZED_OUTPUT = path.join(process.cwd(), 'tmp', 'ingest', 'gmail.json');
const SHARED_SECRETS_HOME = process.env.GMAIL_SECRET_HOME
  || path.join(process.env.HOME || '', '.impact-secrets', 'secrets');
const DEFAULT_SECRETS_DIR = path.join(process.cwd(), 'tools', 'secrets', 'gmail');
const DEFAULT_CREDENTIALS = process.env.GMAIL_CREDENTIALS
  || path.join(SHARED_SECRETS_HOME, 'gmail-promotions-credentials.json')
  || path.join(DEFAULT_SECRETS_DIR, 'promotions-credentials.json');
const DEFAULT_TOKEN = process.env.GMAIL_TOKEN
  || path.join(SHARED_SECRETS_HOME, 'gmail-promotions-token.json');
const DEFAULT_QUERY = '(kupon OR coupon OR kedvezmény) newer_than:14d';
const DEFAULT_LABELS = ['INBOX', 'CATEGORY_PROMOTIONS'];
const MAX_RESULTS = Number(process.env.GMAIL_MAX_RESULTS || 50);
const PERSONAL_RECIPIENTS = (process.env.GMAIL_PERSONAL_RECIPIENTS || '')
  .split(',')
  .map(address => address.trim().toLowerCase())
  .filter(Boolean);

interface GmailToken {
  access_token?: string;
  refresh_token?: string;
  expiry_date?: number;
  scope?: string;
  token_type?: string;
}

interface GmailPromotionRecord {
  id: string;
  thread_id?: string;
  history_id?: string;
  internal_date?: string;
  subject?: string;
  from?: string;
  to?: string;
  snippet?: string;
  codes: string[];
  urls: string[];
  shop_domain?: string;
  shop_slug?: string;
  ngo_slug?: string;
  scraped_at: string;
}

function sanitizeSlug(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || undefined;
}

function buildReliabilitySeed(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join('|');
}

function decodeBase64(data?: string): string {
  if (!data) {
    return '';
  }
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  const buff = Buffer.from(normalized, 'base64');
  return buff.toString('utf8');
}

function flattenParts(parts?: gmail_v1.Schema$MessagePart[]): string {
  if (!parts) {
    return '';
  }
  const chunks: string[] = [];
  for (const part of parts) {
    if (part.parts?.length) {
      chunks.push(flattenParts(part.parts));
    } else if (part.body?.data) {
      chunks.push(decodeBase64(part.body.data));
    }
  }
  return chunks.join('\n');
}

function extractText(message: gmail_v1.Schema$Message): string {
  const payload = message.payload;
  if (!payload) {
    return '';
  }
  if (payload.mimeType?.includes('text/plain') && payload.body?.data) {
    return decodeBase64(payload.body.data);
  }
  if (payload.mimeType?.includes('text/html') && payload.body?.data) {
    return decodeBase64(payload.body.data);
  }
  if (payload.parts) {
    return flattenParts(payload.parts);
  }
  return '';
}

function extractCodes(text: string): string[] {
  const matches = text.match(/(?<![A-Z0-9])[A-Z0-9]{5,10}(?![A-Z0-9])/g);
  if (!matches) {
    return [];
  }
  const seen = new Set<string>();
  return matches.filter(code => {
    const upper = code.toUpperCase();
    if (seen.has(upper)) {
      return false;
    }
    seen.add(upper);
    return true;
  });
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s"<>]+/gi);
  if (!matches) {
    return [];
  }
  const seen = new Set<string>();
  return matches.filter(url => {
    if (seen.has(url)) {
      return false;
    }
    seen.add(url);
    return true;
  });
}

function detectShop(
  domainHint: string | undefined,
  urls: string[],
  domainSlugMap: Map<string, string>,
): { slug?: string; domain?: string } {
  if (domainHint) {
    const normalized = domainHint.replace(/"|<|>/g, '').trim().toLowerCase();
    const match = lookupDomainSlug(domainSlugMap, normalized);
    if (match.slug) {
      return match;
    }
  }
  for (const link of urls) {
    try {
      const domain = new URL(link).hostname.toLowerCase();
      const match = lookupDomainSlug(domainSlugMap, domain);
      if (match.slug) {
        return match;
      }
    } catch {
      // ignore malformed url
    }
  }
  return {};
}

function lookupDomainSlug(domainSlugMap: Map<string, string>, rawDomain?: string) {
  if (!rawDomain) {
    return {};
  }
  const cleaned = rawDomain.replace(/^https?:\/\//, '').replace(/^www\./, '');
  const directSlug = domainSlugMap.get(cleaned);
  if (directSlug) {
    return { slug: directSlug, domain: cleaned };
  }
  const parts = cleaned.split('.');
  while (parts.length > 2) {
    parts.shift();
    const candidate = parts.join('.');
    const candidateSlug = domainSlugMap.get(candidate);
    if (candidateSlug) {
      return { slug: candidateSlug, domain: candidate };
    }
  }
  return {};
}

async function authorize(credentialsPath: string, tokenPath: string) {
  const credentialRaw = await fs.readFile(credentialsPath, 'utf8');
  const credentials = JSON.parse(credentialRaw);
  const cfg = credentials.installed || credentials.web;
  if (!cfg) {
    throw new Error('Érvénytelen Gmail credentials formátum.');
  }
  const oAuth2Client = new google.auth.OAuth2(cfg.client_id, cfg.client_secret, cfg.redirect_uris?.[0]);
  const tokenRaw = await fs.readFile(tokenPath, 'utf8');
  const token = JSON.parse(tokenRaw) as GmailToken;
  oAuth2Client.setCredentials(token);
  return oAuth2Client;
}

async function fetchMessages(gmail: gmail_v1.Gmail, query: string, labelIds: string[], maxResults: number) {
  const list = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    labelIds,
    maxResults,
  });
  return list.data.messages ?? [];
}

function buildDomainSlugMap(registry: Awaited<ReturnType<typeof loadShopRegistry>>) {
  const domainSlugMap = new Map<string, string>();
  registry.entries.forEach(entry => {
    const domain = entry.domain?.toLowerCase().replace(/^www\./, '');
    if (domain) {
      domainSlugMap.set(domain, entry.slug.toLowerCase());
    }
  });
  return domainSlugMap;
}

function extractEmails(headerValue?: string): string[] {
  if (!headerValue) {
    return [];
  }
  return headerValue
    .split(/[,;]/)
    .map(part => part.trim().toLowerCase())
    .map(part => part.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i)?.[1])
    .filter((value): value is string => Boolean(value));
}

function isPersonalCoupon(headers: gmail_v1.Schema$MessagePartHeader[] | undefined): boolean {
  if (!headers || PERSONAL_RECIPIENTS.length === 0) {
    return false;
  }
  const relevantHeaderNames = ['to', 'delivered-to'];
  const seen = new Set<string>();
  for (const { name, value } of headers) {
    if (!name || !value) {
      continue;
    }
    if (relevantHeaderNames.includes(name.toLowerCase())) {
      for (const email of extractEmails(value)) {
        if (!seen.has(email)) {
          seen.add(email);
        }
        if (PERSONAL_RECIPIENTS.includes(email)) {
          return true;
        }
      }
    }
  }
  return false;
}

async function main() {
  const credentialsPath = process.env.GMAIL_CREDENTIALS || process.argv[2]
    || DEFAULT_CREDENTIALS;
  const tokenPath = process.env.GMAIL_TOKEN_PATH || process.env.GMAIL_TOKEN
    || process.argv[3] || DEFAULT_TOKEN;
  const outputPath = process.env.GMAIL_OUTPUT || process.argv[4] || DEFAULT_OUTPUT;
  const normalizedOutputPath = process.env.GMAIL_NORMALIZED_OUTPUT || DEFAULT_NORMALIZED_OUTPUT;
  const query = process.env.GMAIL_QUERY || DEFAULT_QUERY;
  const labelIds = (process.env.GMAIL_LABELS || '').split(',').filter(Boolean);
  const activeLabels = labelIds.length ? labelIds : DEFAULT_LABELS;

  const auth = await authorize(credentialsPath, tokenPath);
  const gmail = google.gmail({ version: 'v1', auth });
  const registry = await loadShopRegistry();
  const domainSlugMap = buildDomainSlugMap(registry);

  const messages = await fetchMessages(gmail, query, activeLabels, MAX_RESULTS);
  const records: GmailPromotionRecord[] = [];
  let skippedPersonal = 0;

  for (const messageMeta of messages) {
    if (!messageMeta.id) {
      continue;
    }
    try {
      const message = await gmail.users.messages.get({ userId: 'me', id: messageMeta.id, format: 'full' });
      const data = message.data;
      const text = extractText(data);
      const codes = extractCodes(text);
      const urls = extractUrls(text);
      const headers = data.payload?.headers || [];
      const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value;
      const from = headers.find(h => h.name?.toLowerCase() === 'from')?.value;
      const to = headers.find(h => h.name?.toLowerCase() === 'to')?.value;
      const internalDate = data.internalDate ? new Date(Number(data.internalDate)).toISOString() : undefined;
      const domainHintFromHeader = from?.match(/@([^>]+)>?$/)?.[1]?.toLowerCase();
      const { slug, domain } = detectShop(domainHintFromHeader, urls, domainSlugMap);
      if (isPersonalCoupon(headers)) {
        skippedPersonal += 1;
        console.log(`🔒 Személyes kupon kihagyva: ${subject || data.id}`);
        continue;
      }

      const ngoSlug = resolveDefaultNgoSlug(registry, slug, domain);

      records.push({
        id: data.id!,
        thread_id: data.threadId ?? undefined,
        history_id: data.historyId ?? undefined,
        internal_date: internalDate,
        subject: subject || undefined,
        from: from || undefined,
        to: to || undefined,
        snippet: data.snippet || undefined,
        codes,
        urls,
        shop_domain: domain,
        shop_slug: slug,
        ngo_slug: ngoSlug,
        scraped_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn(`Gmail message feldolgozás sikertelen (${messageMeta.id}):`, err);
    }
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(records, null, 2), 'utf8');
  console.log(`📥 Gmail rekordok mentve: ${records.length} → ${outputPath}`);
  if (skippedPersonal > 0) {
    console.log(`🔕 ${skippedPersonal} személyes kupon kihagyva (GMAIL_PERSONAL_RECIPIENTS szűrő).`);
  }

  const normalized = normalizeForCoupons(records, registry);
  await fs.mkdir(path.dirname(normalizedOutputPath), { recursive: true });
  await fs.writeFile(normalizedOutputPath, JSON.stringify(normalized, null, 2), 'utf8');
  console.log(`📦 Normalizált Gmail kuponok: ${normalized.length} → ${normalizedOutputPath}`);
}

main().catch(err => {
  console.error('Gmail promotions futás hiba:', err);
  process.exit(1);
});

function normalizeForCoupons(
  records: GmailPromotionRecord[],
  registry: Awaited<ReturnType<typeof loadShopRegistry>>,
): NormalizedCoupon[] {
  const normalized: NormalizedCoupon[] = [];
  const dedupe = new Set<string>();
  for (const record of records) {
    const slug = sanitizeSlug(record.shop_slug) || 'unknown';
    const entry = registry.bySlug?.get(slug) || registry.entries.find(e => e.slug === slug);
    const couponCode = record.codes[0];
    const reliabilitySeed = buildReliabilitySeed([slug, couponCode || record.subject, record.scraped_at]);
    if (dedupe.has(reliabilitySeed)) {
      continue;
    }
    dedupe.add(reliabilitySeed);
    const ctaUrl = record.urls[0];
    normalized.push({
      source: 'gmail_structured',
      shop_slug: slug,
      shop_name: entry?.name || slug,
      type: couponCode ? 'coupon_code' : 'sale_event',
      coupon_code: couponCode,
      discount_label: record.subject,
      title: record.subject,
      description: record.snippet,
      cta_url: ctaUrl,
      fillout_url: entry?.fillout_url,
      starts_at: record.internal_date,
      scraped_at: record.scraped_at,
      discovered_at: record.scraped_at,
      validated_at: record.scraped_at,
      validation_status: 'untested',
      validation_method: 'gmail_ingest',
      reliability_seed: reliabilitySeed,
      raw: record as unknown as Record<string, unknown>,
    });
  }
  return normalized;
}
