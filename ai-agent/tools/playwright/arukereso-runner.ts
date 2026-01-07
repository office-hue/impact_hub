import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PageConfig {
  slug: string;
  url: string;
}

interface ConfigFile {
  pages: PageConfig[];
}

interface PromotionRecord {
  slug: string;
  url: string;
  title: string;
  headline: string;
  discountPercent?: number;
  validFrom?: string;
  validUntil?: string;
  scrapedAt: string;
}

const CONFIG_PATH = process.env.ARUKERESO_CONFIG || path.join(__dirname, 'arukereso-config.json');
const OUTPUT_PATH = process.env.ARUKERESO_OUTPUT || path.join(process.cwd(), 'tools/out/arukereso-promotions.json');

function loadConfig(): ConfigFile {
  const fallback = path.join(__dirname, 'arukereso-config.sample.json');
  const filePath = fs.existsSync(CONFIG_PATH) ? CONFIG_PATH : fallback;
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function parsePercent(text: string): number | undefined {
  const match = text.match(/(\d+)(?:%| százalék)/i);
  return match ? Number(match[1]) : undefined;
}

type NextProduct = {
  name?: string;
  priceDropPercentage?: number;
  currentPrice?: string;
  productUrl?: string;
};

type NextBlock = {
  slug?: string;
  id?: string;
  name?: string;
  link?: string;
  products?: NextProduct[];
};

interface ProductBoxData {
  productId?: string | null;
  title?: string | null;
  url?: string | null;
  discountText?: string | null;
  priceText?: string | null;
  offerCount?: string | null;
}

function getPageProps(nextData: any): any | undefined {
  if (!nextData) {
    return undefined;
  }
  if (nextData.props?.pageProps) {
    return nextData.props.pageProps;
  }
  return nextData.pageProps ?? nextData;
}

function extractFromNextData(slug: string, fallbackUrl: string, nextData: any): PromotionRecord[] {
  const records: PromotionRecord[] = [];
  const pageProps = getPageProps(nextData);
  const data = pageProps?.data;
  if (!data) {
    return records;
  }
  const header = data.header || {};
  const duration = header.duration || {};
  const blocks = data.blocks || [];
  const validFrom: string | undefined = duration.from || duration.fromDate || duration.start || duration.startDate;
  const validUntil: string | undefined = duration.to || duration.toDate || duration.end || duration.endDate;

  for (const block of blocks as NextBlock[]) {
    const products: NextProduct[] = Array.isArray(block?.products)
      ? (block.products as NextProduct[])
      : [];
    const topProducts = products.slice(0, 3);
    const discountPercent = topProducts.reduce<number | undefined>((max: number | undefined, product: NextProduct) => {
      const pct = typeof product?.priceDropPercentage === 'number'
        ? product.priceDropPercentage
        : undefined;
      if (typeof pct === 'number') {
        return typeof max === 'number' ? Math.max(max, pct) : pct;
      }
      return max;
    }, undefined);

    const summary = topProducts
      .map(product => {
        const pct = product?.priceDropPercentage;
        const price = product?.currentPrice;
        return [product?.name, typeof pct === 'number' ? `-${pct}%` : null, price ? `${price} Ft` : null]
          .filter(Boolean)
          .join(' ');
      })
      .filter(Boolean)
      .join(' | ');

    records.push({
      slug: `${slug}-${block?.slug ?? block?.id ?? 'promo'}`,
      url: block?.link || fallbackUrl,
      title: block?.name || header?.title || `Árukereső promóció – ${slug}`,
      headline: summary || header?.subtitle || 'Árukereső promóciós ajánlatok',
      discountPercent,
      validFrom,
      validUntil,
      scrapedAt: new Date().toISOString(),
    });
  }

  return records;
}

async function extractFromProductBoxes(page: import('playwright').Page, slug: string): Promise<PromotionRecord[]> {
  const rawProducts: ProductBoxData[] = await page.$$eval('.product-box', boxes => {
    return boxes.map(box => {
      const productId = box.getAttribute('data-akpid');
      const nameAnchor = box.querySelector('.name a');
      const discount = box.querySelector('.pricedrop-badge');
      const price = box.querySelector('.price-only');
      const offer = box.querySelector('.offer-count');
      return {
        productId,
        title: nameAnchor?.textContent?.trim() || null,
        url: (nameAnchor as any)?.href || nameAnchor?.getAttribute?.('href') || null,
        discountText: discount?.textContent?.trim() || null,
        priceText: price?.textContent?.trim() || null,
        offerCount: offer?.textContent?.trim() || null,
      };
    }).filter(item => item.title && item.url);
  });

  const now = new Date().toISOString();
  return rawProducts.map((raw, index) => {
    const suffix = raw.productId?.replace(/^p/i, '') || String(index + 1);
    const headlineParts: string[] = [];
    if (raw.discountText) {
      headlineParts.push(raw.discountText);
    }
    if (raw.priceText) {
      const price = raw.priceText.replace(/\s+/g, ' ').trim();
      if (price) {
        headlineParts.push(`${price} Ft`);
      }
    }
    if (raw.offerCount) {
      headlineParts.push(raw.offerCount);
    }
    return {
      slug: `${slug}-${suffix}`,
      url: raw.url as string,
      title: raw.title as string,
      headline: headlineParts.join(' | ') || (raw.title as string),
      discountPercent: parsePercent(raw.discountText || ''),
      scrapedAt: now,
    };
  });
}

async function fetchNextDataFromManifest(page: import('playwright').Page): Promise<any | null> {
  return page.evaluate(async () => {
    const manifest = document.querySelector('script[src*="_buildManifest.js"]');
    const src = manifest?.getAttribute('src');
    const match = src?.match(/_next\/static\/([^/]+)\//);
    const buildId = match?.[1];
    if (!buildId) {
      return null;
    }
    let pathname = window.location.pathname || '/';
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    if (!pathname) {
      pathname = '/';
    }
    const dataPath = pathname === '/' ? '/index' : pathname;
    const dataUrl = `${window.location.origin}/_next/data/${buildId}${dataPath}.json`;
    try {
      const response = await fetch(dataUrl, { credentials: 'omit' });
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (err) {
      console.warn('  ! Next.js data fetch failed:', err);
      return null;
    }
  });
}

async function scrapePage(page: import('playwright').Page, slug: string, url: string): Promise<PromotionRecord[]> {
  const records: PromotionRecord[] = [];

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });

  try {
    let nextData = await page.evaluate(() => (window as any).__NEXT_DATA__);
    if (!nextData) {
      nextData = await fetchNextDataFromManifest(page);
    }
    if (nextData) {
      const fromNext = extractFromNextData(slug, url, nextData);
      if (fromNext.length > 0) {
        records.push(...fromNext);
      }
    }
  } catch (err) {
    console.warn(`  ! Next.js data parse failed for ${slug}:`, err);
  }

  if (records.length === 0) {
    const fromBoxes = await extractFromProductBoxes(page, slug);
    if (fromBoxes.length > 0) {
      records.push(...fromBoxes);
    }
  }

  if (records.length === 0) {
    const cards = await page.$$('[data-testid="promo-card"], article, .promotion-card');
    for (const card of cards) {
      try {
        const titleHandle = await card.$('h1, h2, h3, .promo-title');
        const descHandle = await card.$('p, .promo-description');
        const title = titleHandle ? (await titleHandle.innerText()).trim() : '';
        if (!title) {
          continue;
        }
        const headline = descHandle ? (await descHandle.innerText()).trim() : '';
        records.push({
          slug,
          url,
          title,
          headline,
          discountPercent: parsePercent(`${title} ${headline}`),
          scrapedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.warn(`  ! DOM parse failed on ${slug}:`, err);
      }
    }
  }

  return records;
}

async function run(): Promise<void> {
  const config = loadConfig();
  const all: PromotionRecord[] = [];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    for (const pageConfig of config.pages) {
      console.log(`Scraping ${pageConfig.slug} (${pageConfig.url})`);
      const promos = await scrapePage(page, pageConfig.slug, pageConfig.url);
      console.log(`  → ${promos.length} records`);
      all.push(...promos);
    }
  } finally {
    await page.close();
    await browser.close();
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(all, null, 2));
  console.log(`Saved ${all.length} promotions to ${OUTPUT_PATH}`);
}

run().catch(err => {
  console.error('Playwright run failed:', err);
  process.exit(1);
});
