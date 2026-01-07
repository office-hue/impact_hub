import test from 'node:test';
import assert from 'node:assert/strict';
import { generateImpiSummary } from '../apps/api-gateway/src/services/impi-openai.js';
import type { RecommendationResponse } from '@apps/ai-agent-core/src/impi/recommend.js';
import type { NgoPromotionAggregation } from '../apps/api-gateway/src/services/graphiti-aggregations.js';

const baseRecommendation: RecommendationResponse = {
  persona: 'Impi',
  summary: 'nincs adat',
  offers: [],
  query: 'keresek valamit',
};

const mockAggregations: NgoPromotionAggregation[] = [
  {
    ngo_slug: 'bator-tabor',
    promotion_count: 3,
    avg_discount_percent: 18,
    last_scraped_at: '2025-12-04T20:00:00Z',
  },
  {
    ngo_slug: 'noah-allatotthon',
    promotion_count: 2,
    avg_discount_percent: 12,
    last_scraped_at: '2025-12-04T18:00:00Z',
  },
];

test('generateImpiSummary fallback említi a Graphiti NGO listát kuponhiány esetén', async () => {
  const result = await generateImpiSummary(
    {
      userMessage: 'van valami generalis ajanlat? nincs kupon',
      recommendation: baseRecommendation,
      empathyCue: null,
    },
    {
      fetchNgoAggregations: async () => mockAggregations,
    },
  );
  assert.ok(result, 'Eredménynek léteznie kell');
  assert.ok(
    result?.text?.includes('bator-tabor') && result.text.includes('CTA'),
    'A fallback szövegnek tartalmaznia kell a Graphiti NGO slugot és CTA-t',
  );
});
