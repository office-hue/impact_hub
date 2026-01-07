import fetch from 'node-fetch';
import { buildGraphitiAuthHeaders } from '@apps/shared/graphitiAuth.js';

const GRAPHITI_API_URL = process.env.GRAPHITI_API_URL ?? 'http://localhost:8083';

export interface NgoPromotionAggregation {
  ngo_slug: string;
  promotion_count: number;
  avg_discount_percent?: number | null;
  last_scraped_at?: string | null;
}

interface AggregationResponse {
  data: NgoPromotionAggregation[];
  meta?: Record<string, unknown>;
}

export async function fetchTopNgoPromotions(limit = 5): Promise<NgoPromotionAggregation[]> {
  try {
    const url = new URL('/aggregations/ngo-promotions', GRAPHITI_API_URL);
    url.searchParams.set('limit', String(limit));
    const response = await fetch(url.toString(), {
      headers: buildGraphitiAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Graphiti aggregáció hiba: ${response.status}`);
    }
    const payload = (await response.json()) as AggregationResponse;
    return Array.isArray(payload.data) ? payload.data : [];
  } catch (error) {
    console.warn('Graphiti aggregáció nem elérhető', error);
    return [];
  }
}
