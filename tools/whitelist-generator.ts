/**
 * Whitelist generator: Dognet/CJ CSV-ből slug/domain táblázatot készít.
 * CSV mezők (Dognet export): product_url, name, shop_slug, ..., site, ..., program_id, program_name
 * Kimenet: JSON a coupon-harvester confighoz.
 */
import fs from 'fs/promises';
import path from 'path';
import {parse} from 'csv-parse/sync';

type Row = {
  product_url?: string;
  name?: string;
  shop_slug?: string;
  site?: string;
  program_id?: string;
  program_name?: string;
};
type Out = { slug: string; domain: string; program_id?: string };

function slugify(name: string) {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function hostnameFrom(url?: string) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase();
  } catch {
    // lehet, hogy sima domain (schema nélkül)
    return url.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
  }
}

async function main() {
  const input = process.env.WHITELIST_SRC || 'dognet_programs.csv';
  const outFile = process.env.WHITELIST_OUT || 'shops_registry.json';
  const raw = await fs.readFile(path.resolve(input), 'utf8');
  const rows = parse(raw, {columns: true, skip_empty_lines: true}) as Row[];
  const mapped: Out[] = rows
    .map(r => {
      const domain = hostnameFrom(r.product_url) || hostnameFrom(r.site);
      const slugSource = r.shop_slug || r.program_name || r.name || domain;
      const slug = slugSource ? slugify(slugSource) : '';
      if (!slug || !domain) return null;
      return {slug, domain, program_id: r.program_id};
    })
    .filter(Boolean) as Out[];
  await fs.writeFile(outFile, JSON.stringify(mapped, null, 2), 'utf8');
  console.log(`Írva: ${outFile} (${mapped.length} sor)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
