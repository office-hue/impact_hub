import test from 'node:test';
import assert from 'node:assert/strict';
import type { RecommendationOffer } from '@apps/ai-agent-core/src/impi/recommend.js';
import { extractOfferContextMetadata, formatOfferMetadataLines } from '../apps/api-gateway/src/services/offer-metadata.js';

test('extractOfferContextMetadata visszaadja a kulcs metaadatokat', () => {
  const offers: RecommendationOffer[] = [
    {
      source: 'playwright',
      source_variant: 'arukereso',
      shop_slug: 'delonghi',
      shop_name: 'DeLonghi',
      type: 'sale_event',
      discount_score: 20,
      donation_rate: 0.04,
      estimated_donation_huf: 800,
      donation_per_1000_huf: 40,
      donation_mode: 'rising',
      donation_mode_label: 'Rising Mode',
      reliability: 0.92,
      reliability_label: 'super',
      reliability_score: 0.92,
      impact_score: 130,
      keyword_score: 5,
      scraped_at: '2025-12-05T07:00:00Z',
      merchant_priority: 10,
    },
  ];

  const metadata = extractOfferContextMetadata(offers, 1);
  assert.equal(metadata.length, 1);
  assert.equal(metadata[0].shop_slug, 'delonghi');
  assert.equal(metadata[0].source_variant, 'arukereso');
  assert.equal(metadata[0].merchant_priority, 10);
  assert.equal(metadata[0].reliability_score, 0.92);

  const lines = formatOfferMetadataLines(metadata);
  assert.ok(lines[0].includes('delonghi'), 'A metaadat sor tartalmazza a shop slugot');
  assert.ok(lines[0].includes('arukereso'), 'A metaadat sor tartalmazza a forrást');
});
