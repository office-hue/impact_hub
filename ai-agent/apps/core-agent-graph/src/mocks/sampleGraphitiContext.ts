import type { MemoryContextResponse } from '@apps/api-gateway/src/services/memory-context.js';

type BuildOptions = {
  topic?: string;
  userMessage?: string;
};

const BASE_STUB_NODES = [
  {
    id: 'ngo:bator-tabor',
    labels: ['NGO', 'MemoryNode'],
    properties: {
      slug: 'bator-tabor-alapitvany',
      title: 'Bátor Tábor élményterápia',
      summary: 'Élményterápiás programok krónikus beteg gyerekeknek.',
      category: 'charity',
    },
    score: 0.9,
  },
  {
    id: 'promotion:vision-express',
    labels: ['Promotion', 'Offer'],
    properties: {
      shop: 'Vision Express',
      discount_percent: 25,
      description: '25% kedvezmény keret nélküli szemüvegekre decemberig.',
      url: 'https://visionexpress.hu/ajanlat/25-kedvezmeny',
    },
    score: 0.75,
  },
  {
    id: 'promotion:arukereso-blackfriday',
    labels: ['Promotion', 'Offer'],
    properties: {
      shop: 'Árukereső',
      discount_percent: 35,
      description: 'Black Friday ajánlatok, extra kuponokkal párosítva.',
      url: 'https://arukereso.hu/ajanlatok/black-friday',
    },
    score: 0.82,
  },
];

const BASE_STUB_RELATIONSHIPS = [
  {
    id: 'rel:ngo-promo-1',
    type: 'SUPPORTS',
    source: 'ngo:bator-tabor',
    target: 'promotion:vision-express',
    properties: {
      weight: 0.82,
    },
  },
  {
    id: 'rel:ngo-promo-2',
    type: 'SUPPORTS',
    source: 'ngo:bator-tabor',
    target: 'promotion:arukereso-blackfriday',
    properties: {
      weight: 0.77,
    },
  },
];

export function buildSampleGraphitiContext(options: BuildOptions = {}): MemoryContextResponse {
  const topicNote = options.topic?.trim() || options.userMessage?.trim();
  const now = new Date().toISOString();
  const nodes = BASE_STUB_NODES.map(node => ({
    ...node,
    properties: {
      ...node.properties,
      topic_hint: topicNote ?? undefined,
      generated_at: now,
    },
  }));
  return {
    nodes,
    relationships: BASE_STUB_RELATIONSHIPS,
    generated_at: now,
  };
}
