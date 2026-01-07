import fetch from 'node-fetch';
import { parse } from 'csv-parse/sync';
import type { SourceSnapshot } from './types.js';

const SHOPS_CSV_URL =
  process.env.IMPACTSHOP_SHOPS_CSV ||
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vR8ASri56jQ1h7yzeb1lWqOvvOY3Kli7x8WxdkLwlet6I7QnBoOg2oiaNEcxdjSp3UbV8kjhMKWzXPz/pub?gid=0&single=true&output=csv';

type ShopRow = {
  name?: string;
  nev?: string;
  shop_slug?: string;
  slug?: string;
  go_slug?: string;
  default_d1?: string;
  ngo_slug?: string;
  ngo?: string;
  default_ngo?: string;
  dognet_base?: string;
  pdognet_deeplink_param?: string;
  dognet_deeplink_param?: string;
  homepage?: string;
  product_url?: string;
};

function slugify(value: string | undefined): string {
  return (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function getImpactShopsSnapshot(): Promise<SourceSnapshot> {
  const resp = await fetch(SHOPS_CSV_URL);
  if (!resp.ok) {
    throw new Error(`ImpactShops CSV fetch failed: ${resp.status}`);
  }
  const text = await resp.text();
  const records = parse(text, { columns: true, skip_empty_lines: true }) as ShopRow[];

  const coupons = records
    .map(record => {
      const slug =
        record.shop_slug ||
        record.slug ||
        record.go_slug ||
        '';
      const shopSlug = slugify(slug);
      const shopName = record.name || record.nev || shopSlug;
      if (!shopSlug) {
        return null;
      }
      const defaultNgo =
        record.default_d1 ||
        record.ngo_slug ||
        record.ngo ||
        record.default_ngo ||
        '';
      const deeplinkParam = record.pdognet_deeplink_param || record.dognet_deeplink_param || 'url';
      return {
        source: 'impact_shops',
        shop_slug: shopSlug,
        shop_name: shopName,
        title: 'ImpactShop partner ajánlat',
        description: record.homepage || record.product_url || '',
        cta_url: `https://app.sharity.hu/go?shop=${shopSlug}`,
        raw: {
          default_d1: defaultNgo,
          dognet_base: record.dognet_base || '',
          deeplink_param: deeplinkParam,
        },
      };
    })
    .filter(Boolean);

  const typed = coupons as any[];
  return {
    id: 'impact_shops',
    feature: 'impact_shops',
    count: typed.length,
    records: typed,
  };
}
