export type CouponType = 'coupon_code' | 'sale_event';

export interface NormalizedCoupon {
  source: string;
  shop_slug: string;
  shop_name: string;
  type: CouponType;
  coupon_code?: string;
  discount_label?: string;
  title?: string;
  description?: string;
  cta_url?: string;
  fillout_url?: string;
  price_huf?: number;
  starts_at?: string;
  expires_at?: string;
  scraped_at?: string;
  source_variant?: string;
  discovered_at?: string;
  validated_at?: string;
  validation_status?: string;
  validation_method?: string;
  reliability_seed?: string;
  merchant_priority?: number;
  category?: string;
  raw?: Record<string, unknown>;
}

export interface SourceSnapshot {
  id: string;
  feature: 'harvester_bridge' | 'playwright' | 'gmail' | 'impact_shops';
  count: number;
  lastUpdated?: string;
  records: NormalizedCoupon[];
}
