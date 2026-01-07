import type {
  OfferContextMetadata,
  RecommendationOffer,
} from '@apps/ai-agent-core/src/impi/recommend.js';

const DEFAULT_LIMIT = 3;

export function extractOfferContextMetadata(
  offers: RecommendationOffer[],
  limit: number = DEFAULT_LIMIT,
): OfferContextMetadata[] {
  return offers.slice(0, limit).map(offer => ({
    shop_slug: offer.shop_slug,
    source_variant: offer.source_variant,
    scraped_at: offer.scraped_at,
    merchant_priority: offer.merchant_priority,
    reliability_score: offer.reliability_score ?? offer.reliability,
  }));
}

export function formatOfferMetadataLines(metadata: OfferContextMetadata[]): string[] {
  return metadata.map(meta => {
    const source = meta.source_variant ? `Forrás: ${meta.source_variant}` : 'Forrás: ismeretlen';
    const scraped = meta.scraped_at ? `, scraped: ${meta.scraped_at}` : '';
    const reliability = typeof meta.reliability_score === 'number'
      ? `, megbízhatóság: ${(meta.reliability_score * 100).toFixed(0)}%`
      : '';
    const priority = typeof meta.merchant_priority === 'number'
      ? `, prioritás: ${meta.merchant_priority}`
      : '';
    return `- ${meta.shop_slug}: ${source}${scraped}${reliability}${priority}`;
  });
}
