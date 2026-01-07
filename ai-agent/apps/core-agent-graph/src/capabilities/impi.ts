import { recommendCoupons } from '@apps/ai-agent-core/src/impi/recommend.js';
import type { CapabilityManifest } from './types.js';
import { registerCapability } from './registry.js';
import type { CoreAgentState } from '../state.js';

type ImpiCapabilityInput = {
  query?: string;
  ngo_preference?: string;
  limit?: number;
  skip_category_match?: boolean;
};

type ImpiCapabilityOutput = unknown;

const inputSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    ngo_preference: { type: 'string' },
    limit: { type: 'number' },
    skip_category_match: { type: 'boolean' },
  },
};

const outputSchema: Record<string, unknown> = { type: 'object' };

async function invokeImpi(input: ImpiCapabilityInput, context: CoreAgentState): Promise<ImpiCapabilityOutput> {
  const payload = {
    query: input.query?.trim() || context.userMessage,
    limit: input.limit ?? 3,
    ngo_preference: input.ngo_preference,
    skip_category_match: input.skip_category_match ?? false,
  } as any;

  return recommendCoupons(payload);
}

export const impiCapabilityV1: CapabilityManifest<ImpiCapabilityInput, ImpiCapabilityOutput> = {
  id: 'impi-coupon-search',
  version: '1.0',
  rolloutPercentage: 100,
  name: 'Impi kupon ajánló',
  description: 'ImpactShop kupon és akció keresés NGO támogatással.',
  inputSchema,
  outputSchema,
  invoke: invokeImpi,
  tags: ['shopping', 'coupons', 'ngo', 'impact'],
  priority: 10,
};

// Placeholder v2 (azonos implementációval, rollout 20%)
export const impiCapabilityV2: CapabilityManifest<ImpiCapabilityInput, ImpiCapabilityOutput> = {
  id: 'impi-coupon-search',
  version: '2.0',
  rolloutPercentage: 20,
  name: 'Impi kupon ajánló v2',
  description: 'ImpactShop kupon és akció keresés (v2 rollout).',
  inputSchema,
  outputSchema,
  invoke: invokeImpi,
  tags: ['shopping', 'coupons', 'ngo', 'impact'],
  priority: 10,
};

registerCapability(impiCapabilityV1);
registerCapability(impiCapabilityV2);
