import { URLSearchParams } from 'url';

const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
const cx = process.env.GOOGLE_SEARCH_CX;
const ENABLED = process.env.ENABLE_WEB_FALLBACK === '1';

export type WebSearchResult = { title: string; link: string; snippet: string };

export async function fetchWebSearchResults(query: string, limit = 3): Promise<WebSearchResult[]> {
  if (!ENABLED || !apiKey || !cx || !query.trim()) return [];
  try {
    const params = new URLSearchParams({
      key: apiKey,
      cx,
      q: query,
      num: String(Math.min(Math.max(limit, 1), 5)),
      hl: 'hu',
    });
    const resp = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`);
    if (!resp.ok) return [];
    const json = (await resp.json()) as { items?: Array<{ title?: string; link?: string; snippet?: string }> };
    return (json.items || [])
      .filter(item => item.title && item.link)
      .slice(0, limit)
      .map(item => ({
        title: item.title || '',
        link: item.link || '',
        snippet: item.snippet || '',
      }));
  } catch (err) {
    console.warn('Web search failed', err);
    return [];
  }
}
