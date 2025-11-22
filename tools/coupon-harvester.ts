/**
 * Coupon Harvester (sandbox) – Gmail + whitelistelt kuponoldalak
 * - Nem ír éles feedbe, csak draft CSV-kbe.
 * - Whitelist-only, no-login scrape.
 */
import {promises as fs} from 'fs';
import * as path from 'path';
import {parse} from 'node-html-parser';
import {stringify} from 'csv-stringify/sync';
import {google} from 'googleapis';
import {getGmailAuth, GmailAuthConfig} from './gmail-auth';
// Playwright csak akkor töltődik be, ha PLAYWRIGHT=1 – így a fetch fallback marad az alap.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let playwright: any = null;
const USE_PLAYWRIGHT = process.env.PLAYWRIGHT === '1';

type WhitelistItem = { slug: string; domain: string };
type ScrapeTarget = { slug: string; url: string };
type Config = {
  outDir: string;
  newerThanDays: number;
  whitelist: WhitelistItem[];
  registry?: string; // optional shops_registry.json generated from Dognet/CJ
  gmail: { labels?: string[]; query?: string };
  scrape?: ScrapeTarget[];
};

type Coupon = {
  shop_slug: string;
  shop_name: string;
  logo_url?: string;
  coupon_code: string;
  discount_label: string;
  title?: string;
  cta_url?: string;
  starts_at?: string;
  expires_at?: string;
  coupon_type?: string;
  priority?: number;
  source_type?: 'gmail' | 'web';
  source_ref?: string;
  expiry_unknown?: boolean;
};

const BASE_DIR = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
const CONFIG_PATH = process.env.COUPON_CONFIG || path.join(BASE_DIR, 'coupon-harvester.config.json');
const DRY_RUN = process.env.DRY_RUN === '1';

async function loadConfig(): Promise<Config> {
  const raw = await fs.readFile(CONFIG_PATH, 'utf8');
  const cfg = JSON.parse(raw);
  const base: Config = {
    outDir: cfg.outDir ?? 'out/sandbox',
    newerThanDays: cfg.newerThanDays ?? 14,
    whitelist: cfg.whitelist ?? [],
    registry: cfg.registry,
    gmail: cfg.gmail ?? {},
    scrape: cfg.scrape ?? [],
  };
  // Ha van registry (shops_registry.json), olvassuk be és egészítsük ki a whitelistet
  if (base.registry) {
    try {
      const regRaw = await fs.readFile(path.resolve(base.registry), 'utf8');
      const reg = JSON.parse(regRaw) as WhitelistItem[];
      // Előnyben a config whitelist, registry csak kiegészít
      const merged = [...base.whitelist];
      for (const r of reg) {
        if (!merged.find(w => w.domain === r.domain)) merged.push(r);
      }
      base.whitelist = merged;
    } catch (err) {
      console.warn(`Registry betöltés hiba (${base.registry}):`, (err as Error).message);
    }
  }

  // Ha nincs explicit scrape lista, generáljunk a whitelist alapján (HTTPS root).
  if (!base.scrape || base.scrape.length === 0) {
    const seen = new Set<string>();
    base.scrape = base.whitelist
      .map(w => w.domain)
      .filter(Boolean)
      .map(d => d.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase())
      .filter(d => {
        if (seen.has(d)) return false;
        seen.add(d);
        return true;
      })
      .map(domain => ({slug: domain.replace(/^www\./, '').replace(/[^a-z0-9_-]/g, ''), url: `https://${domain}`}));
  }
  return base;
}

function mapDomainToShop(domain: string, whitelist: WhitelistItem[]) {
  const cleaned = domain
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[>\s].*$/, '')
    .replace(/^mailto:/, '')
    .replace(/^.*@/, '')
    .replace(/^mail[.-]/, '')
    .replace(/^newsletter[.-]/, '')
    .replace(/^news[.-]/, '')
    .replace(/^akcio[.-]/, '')
    .replace(/^info[.-]/, '')
    .replace(/^m[.-]/, '')
    .replace(/^hirlevel[.-]/, '')
    .replace(/^mailer[.-]/, '');

  const parts = cleaned.split('.');
  const base =
    parts.length >= 2 ? parts.slice(parts.length - 2).join('.') : cleaned;

  const hit = whitelist.find(
    w => cleaned.endsWith(w.domain) || base.endsWith(w.domain),
  );
  if (hit) return {slug: hit.slug, name: hit.slug.replace(/_/g, ' ')};
  return {slug: 'NEEDS_MAPPING', name: domain};
}

export function extractFromHtml(html: string, subject: string, from: string, whitelist: WhitelistItem[]): Coupon | null {
  const root = parse(html);
  const text = root.text;
  // Kulcsszó-közeli kódkeresés
  const contextRegex = /(kuponkód|kedvezménykód|coupon|promo)[^A-Z0-9]{0,40}([A-Z0-9-]{4,16})/i;
  const ctx = text.match(contextRegex);
  const code = ctx?.[2] || (text.match(/\b[A-Z0-9-]{4,16}\b/) || [])[0];
  const badCodes = new Set(['DOCTYPE', 'BACKGROUND-IMAGE', 'DATA', '2025', '2026']);
  const discount = (text.match(/(-\s?\d{1,2}%|\d{3,5}\s?ft|\d{1,2}\s?eur|ingyenes szállítás)/i) || [])[1] || '';
  const expiry = (text.match(/(20\d{2}[.\-]\d{2}[.\-]\d{2}|\d{2}[.\-]\d{2}[.\-]20\d{2}|érvényes\s+[^\n]+ig)/i) || [])[1] || '';
  if (!code || !discount || badCodes.has(code.toUpperCase())) return null;
  const domain = (from.match(/@([^> ]+)/) || [])[1] || '';
  const shop = mapDomainToShop(domain, whitelist);
  if (shop.slug === 'NEEDS_MAPPING') return null;
  return {
    shop_slug: shop.slug,
    shop_name: shop.name,
    coupon_code: code.toUpperCase(),
    discount_label: discount.replace(/\s+/g, ''),
    title: subject.slice(0, 120),
    expires_at: expiry.includes('érvényes') ? '' : expiry,
    expiry_unknown: expiry === '',
    source_type: 'gmail',
    source_ref: domain,
  };
}

async function fetchGmailCoupons(cfg: Config): Promise<Coupon[]> {
  // Gmail auth itt csak váz (OAuth/Service Account beépítendő)
  if (process.env.GMAIL_DISABLED === '1') return [];
  const authConfig: GmailAuthConfig = {
    credentialsPath: process.env.GMAIL_CREDENTIALS || '',
    tokenPath: process.env.GMAIL_TOKEN || '',
    delegatedUser: process.env.GMAIL_USER || 'me',
  };
  const auth = await getGmailAuth(authConfig);
  const gmail = google.gmail({version: 'v1', auth: auth.client});
  const query = `${cfg.gmail.query || ''} newer_than:${cfg.newerThanDays}d`.trim();
  const res = await gmail.users.messages.list({
    userId: auth.user,
    q: query,
    maxResults: 50,
    labelIds: cfg.gmail.labels,
  });
  const msgs = res.data.messages || [];
  const out: Coupon[] = [];
  for (const m of msgs) {
    const full = await gmail.users.messages.get({userId: auth.user, id: m.id!, format: 'full'});
    const headers = Object.fromEntries((full.data.payload?.headers || []).map(h => [h.name, h.value]));
    const from = headers['From'] || '';
    const subject = headers['Subject'] || '';
    const htmlPart = (full.data.payload?.parts || []).find(p => p.mimeType === 'text/html');
    const body = htmlPart?.body?.data ? Buffer.from(htmlPart.body.data, 'base64').toString('utf8') : '';
    const coupon = extractFromHtml(body, subject, from, cfg.whitelist);
    if (coupon) out.push(coupon);
  }
  return out;
}

async function scrapePublicCoupons(target: ScrapeTarget): Promise<Coupon[]> {
  if (!target.url) return [];
  let html = '';

  if (USE_PLAYWRIGHT) {
    try {
      if (!playwright) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        playwright = require('playwright');
      }
      const browser = await playwright.chromium.launch({headless: true});
      const page = await browser.newPage({viewport: {width: 1280, height: 720}});
      await page.goto(target.url, {waitUntil: 'networkidle', timeout: 30000});
      // Próbáljuk meg kinyitni a kupon/„mutasd a kódot” gombokat.
      const clickSelectors = [
        'text=/kupon/i',
        'text=/coupon/i',
        'text=/kód/i',
        '.coupon-code',
        '.show-code',
        'button:has-text("kupon")',
        'button:has-text("coupon")',
        'button:has-text("kód")',
      ];
      for (const sel of clickSelectors) {
        try {
          const loc = page.locator(sel).first();
          if (await loc.count()) {
            await loc.click({timeout: 1000});
            await page.waitForTimeout(500);
          }
        } catch {
          // ha nincs, megyünk tovább
        }
      }
      await page.waitForTimeout(1500);
      html = await page.content();
      await browser.close();
    } catch (err) {
      console.warn(`Playwright scrape hiba ${target.url}:`, (err as Error).message);
    }
  }

  if (!html) {
    const res = await fetch(target.url, {redirect: 'follow'});
    html = await res.text();
  }

  const root = parse(html);
  const text = root.text;
  const codes = [...text.matchAll(/kuponkód[:\s]+([A-Z0-9-]{4,16})/gi)];
  const discount = (text.match(/(-\s?\d{1,2}%|\d{3,5}\s?ft|\d{1,2}\s?eur)/i) || [])[1] || '';
  return codes.map(m => ({
    shop_slug: target.slug,
    shop_name: target.slug,
    coupon_code: m[1].toUpperCase(),
    discount_label: discount,
    source_type: 'web',
    source_ref: target.url,
  }));
}

function dedup(list: Coupon[]): Coupon[] {
  const seen = new Set<string>();
  return list.filter(c => {
    const key = `${c.shop_slug}|${c.coupon_code}|${c.expires_at || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function writeCsv(coupons: Coupon[], outDir: string) {
  await fs.mkdir(outDir, {recursive: true});
  const csv = stringify(coupons, {
    header: true,
    columns: [
      'shop_slug','shop_name','logo_url','coupon_code','discount_label','title',
      'cta_url','starts_at','expires_at','coupon_type','priority',
      'source_type','source_ref','expiry_unknown'
    ]
  });
  const ts = new Date().toISOString().slice(0,10);
  const file = path.join(outDir, `manual_coupons_draft-${ts}.csv`);
  if (DRY_RUN) {
    console.log(`[DRY_RUN] ${coupons.length} sor, nem írok fájlt: ${file}`);
    return;
  }
  await fs.writeFile(file, csv, 'utf8');
  const latest = path.join(outDir, `manual_coupons_draft-latest.csv`);
  await fs.writeFile(latest, csv, 'utf8');
  console.log(`Írva: ${file} (${coupons.length} sor)`);
}

async function main() {
  const cfg = await loadConfig();
  const gmailCoupons = await fetchGmailCoupons(cfg);
  const scraped: Coupon[] = [];
  if (cfg.scrape) {
    for (const t of cfg.scrape) {
      try {
        scraped.push(...await scrapePublicCoupons(t));
      } catch (err) {
        console.warn(`Scrape hiba ${t.url}:`, (err as Error).message);
      }
    }
  }
  const all = dedup([...gmailCoupons, ...scraped]);
  await writeCsv(all, cfg.outDir);
  console.log(JSON.stringify({
    total_emails_checked: gmailCoupons.length, // egyszerűsítve: egy találat=egy email
    total_coupons_written: all.length,
    source_counts: {gmail: gmailCoupons.length, web: scraped.length},
    dry_run: DRY_RUN,
  }, null, 2));
}

if (require.main === module) {
  main().catch(err => {
    console.error('Futáshiba:', err);
    process.exit(1);
  });
}
