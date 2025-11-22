import { logger } from '@libs/logger';

type SearchResult = {
  title: string;
  link: string;
  snippet?: string;
};

type SearchOptions = {
  num?: number;
  lang?: string;
};

const CSE_KEY = process.env.GOOGLE_SEARCH_API_KEY || '';
const CSE_CX = process.env.GOOGLE_SEARCH_CX || '';

/**
 * Google Custom Search JSON API wrapper.
 * Visszaadja a találatok metaadatát (title, link, snippet).
 */
export async function searchCSE(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
  if (!CSE_KEY || !CSE_CX) {
    logger.warn('CSE search skipped: GOOGLE_SEARCH_API_KEY / GOOGLE_SEARCH_CX hiányzik');
    return [];
  }

  const num = Math.min(Math.max(opts.num ?? 3, 1), 10);
  const lang = opts.lang ?? 'lang_hu';
  const url =
    `https://customsearch.googleapis.com/customsearch/v1?key=${encodeURIComponent(CSE_KEY)}` +
    `&cx=${encodeURIComponent(CSE_CX)}&q=${encodeURIComponent(query)}&num=${num}&lr=${encodeURIComponent(lang)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      logger.warn({ status: res.status, query }, 'CSE search HTTP hiba');
      return [];
    }
    const data = (await res.json()) as any;
    const items = Array.isArray(data.items) ? data.items : [];
    return items
      .map((i) => ({
        title: String(i.title ?? ''),
        link: String(i.link ?? ''),
        snippet: i.snippet ? String(i.snippet) : undefined,
      }))
      .filter((i) => i.link);
  } catch (error) {
    logger.error({ error, query }, 'CSE search futási hiba');
    return [];
  }
}

/**
 * Segédfüggvény partner kupon/akció kereséshez.
 */
export async function searchCouponsForDomain(domain: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
  const q = `${domain} (kupon OR kuponkód OR kedvezmény OR akció OR coupon OR sale)`;
  return searchCSE(q, opts);
}
