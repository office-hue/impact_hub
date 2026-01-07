import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { loadArukeresoPromotions } from '../apps/ai-agent-core/src/sources/arukereso.js';

const tmpDir = path.join(process.cwd(), 'tmp');
const samplePath = path.join(tmpDir, 'arukereso-sample.json');

await fs.mkdir(tmpDir, { recursive: true });

test('loadArukeresoPromotions normalizes Playwright JSON', async () => {
  const sample = [
    {
      slug: 'aresett-termekek-123',
      url: 'https://karacsonyfa-izzo.arukereso.hu/sample/p123/',
      title: 'Teszt termék',
      headline: '-10% | 5 000 Ft',
      discountPercent: 10,
      scrapedAt: '2025-12-04T20:00:00Z',
    },
  ];
  await fs.writeFile(samplePath, JSON.stringify(sample, null, 2), 'utf8');
  const promos = await loadArukeresoPromotions(samplePath);
  assert.equal(promos.length, 1);
  const promo = promos[0];
  assert.equal(promo.source, 'arukereso_playwright');
  assert.equal(promo.shop_slug, 'aresett-termekek-123');
  assert.equal(promo.title, 'Teszt termék');
  assert.equal(promo.cta_url, 'https://karacsonyfa-izzo.arukereso.hu/sample/p123/');
  await fs.unlink(samplePath).catch(() => {});
});
