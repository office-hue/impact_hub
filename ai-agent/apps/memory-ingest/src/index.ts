#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import { loadShopRegistry, resolveDefaultNgoSlug } from '../../../tools/ingest/shops-registry.js';
import type { ShopRegistry } from '../../../tools/ingest/shops-registry.js';
import { getAllKnowledgeTopics, type KnowledgeTopic } from '../../api-gateway/src/services/knowledge-index.js';
import { buildGraphitiAuthHeaders } from '@apps/shared/graphitiAuth.js';

const GRAPHITI_API_URL = process.env.GRAPHITI_API_URL ?? 'http://localhost:8083';

interface ConversationTurn {
  conversation_id: string;
  turn_index: number;
  speaker: 'user' | 'impi';
  content: string;
  timestamp: string;
  ngo_slug?: string;
}

interface PromotionRecord {
  id: string;
  shop_slug?: string;
  ngo_slug?: string;
  discount_percent?: number;
  scraped_at: string;
  expires_at?: string;
  title?: string;
  url?: string;
  headline?: string;
  source?: string;
}

interface AresetPromotionRecord {
  slug: string;
  url: string;
  title: string;
  headline?: string;
  discountPercent?: number;
  scrapedAt?: string;
}

interface ReliabilityScoreboardEntry {
  slug: string;
  manual_total?: number;
  manual_success?: number;
  manual_success_rate?: number;
  ai_total?: number;
  ai_success?: number;
  ai_success_rate?: number;
  last_manual_verified?: string;
  last_ai_verified?: string;
}

interface ReliabilityScoreboard {
  generated_at?: string;
  entries?: ReliabilityScoreboardEntry[];
}

async function readJson<T>(filePath: string): Promise<T[]> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(`⚠️  Nem sikerült beolvasni: ${filePath}`, error);
    return [];
  }
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`⚠️  Nem sikerült beolvasni: ${filePath}`, error);
    }
    return null;
  }
}

async function loadConversationTurns(): Promise<ConversationTurn[]> {
  const file = path.resolve(process.cwd(), 'tmp', 'logs', 'impi-chat.log.json');
  return readJson<ConversationTurn>(file);
}

async function loadGmailPromotions(): Promise<PromotionRecord[]> {
  const file = path.resolve(process.cwd(), 'tmp', 'ingest', 'raw', 'gmail-promotions.json');
  return readJson<PromotionRecord>(file);
}

async function loadAresetPromotions(): Promise<PromotionRecord[]> {
  const file = path.resolve(process.cwd(), 'tools', 'out', 'arukereso-promotions.json');
  const rows = await readJson<AresetPromotionRecord>(file);
  if (!rows.length) {
    return [];
  }
  return rows.map(row => ({
    id: row.slug || row.url,
    shop_slug: 'arukereso',
    ngo_slug: undefined,
    discount_percent: typeof row.discountPercent === 'number' ? row.discountPercent : undefined,
    scraped_at: row.scrapedAt || new Date().toISOString(),
    title: row.title,
    url: row.url,
    headline: row.headline,
    source: 'arukereso_playwright',
  }));
}

async function loadReliabilityScoreboard(): Promise<ReliabilityScoreboard | null> {
  const file = path.resolve(process.cwd(), 'tmp', 'ingest', 'reliability-scoreboard.json');
  return readJsonFile<ReliabilityScoreboard>(file);
}

async function upsertFacts(facts: unknown[]): Promise<void> {
  if (facts.length === 0) {
    console.log('ℹ️  Nincs felküldendő fact.');
    return;
  }
  const response = await fetch(`${GRAPHITI_API_URL}/facts`, {
    method: 'POST',
    headers: buildGraphitiAuthHeaders({
      extraHeaders: {
        'Content-Type': 'application/json',
      },
    }),
    body: JSON.stringify({ facts }),
  });
  if (!response.ok) {
    throw new Error(`Graphiti válasz: ${response.status} ${response.statusText}`);
  }
  console.log(`✅ ${facts.length} fact felküldve Graphiti-ra.`);
}

function buildConversationFacts(turns: ConversationTurn[]): unknown[] {
  return turns.map(turn => ({
    type: 'ConversationTurn',
    identity: {
      conversation_id: turn.conversation_id,
      turn_index: turn.turn_index,
    },
    properties: {
      speaker: turn.speaker,
      content: turn.content,
      ngo_slug: turn.ngo_slug,
      timestamp: turn.timestamp,
    },
    relations: turn.ngo_slug
      ? [
          {
            type: 'MENTIONED_NGO',
            target: { type: 'NGO', identity: { slug: turn.ngo_slug } },
          },
        ]
      : [],
  }));
}

function buildPromotionFacts(promos: PromotionRecord[]): unknown[] {
  return promos.map(promo => ({
    type: 'Promotion',
    identity: { promotion_id: promo.id },
    properties: {
      shop_slug: promo.shop_slug,
      ngo_slug: promo.ngo_slug,
      discount_percent: promo.discount_percent,
      scraped_at: promo.scraped_at,
      expires_at: promo.expires_at,
      title: promo.title,
      url: promo.url,
      headline: promo.headline,
      source: promo.source,
    },
    relations: [
      promo.shop_slug
        ? {
            type: 'BELONGS_TO_SHOP',
            target: { type: 'Shop', identity: { slug: promo.shop_slug } },
          }
        : null,
      promo.ngo_slug
        ? {
            type: 'BENEFITS_NGO',
            target: { type: 'NGO', identity: { slug: promo.ngo_slug } },
          }
        : null,
    ].filter(Boolean),
  }));
}

function buildNgoFacts(promos: PromotionRecord[]): unknown[] {
  const grouped = new Map<string, PromotionRecord[]>();
  promos.forEach(promo => {
    if (!promo.ngo_slug) {
      return;
    }
    const slug = promo.ngo_slug;
    if (!grouped.has(slug)) {
      grouped.set(slug, []);
    }
    grouped.get(slug)!.push(promo);
  });
  return Array.from(grouped.entries()).map(([slug, relatedPromos]) => ({
    type: 'NGO',
    identity: { slug },
    properties: {
      slug,
    },
    relations: relatedPromos.map(promo => ({
      type: 'BENEFITS_NGO',
      target: {
        type: 'Promotion',
        identity: { promotion_id: promo.id },
      },
      properties: {
        shop_slug: promo.shop_slug,
        discount_percent: promo.discount_percent,
      },
    })),
  }));
}

function buildReliabilityFacts(
  scoreboard: ReliabilityScoreboard | null,
  registry?: ShopRegistry,
): unknown[] {
  if (!scoreboard?.entries?.length) {
    return [];
  }
  return scoreboard.entries
    .filter(entry => entry.slug && entry.slug.toLowerCase() !== 'unknown')
    .map(entry => {
      const slug = entry.slug.toLowerCase();
      const ngoSlug = registry ? resolveDefaultNgoSlug(registry, slug) : undefined;
      const properties = {
        shop_slug: slug,
        ngo_slug: ngoSlug,
        source: 'reliability-scoreboard',
        generated_at: scoreboard.generated_at ?? new Date().toISOString(),
        manual_total: entry.manual_total ?? 0,
        manual_success: entry.manual_success ?? 0,
        manual_success_rate: entry.manual_success_rate,
        ai_total: entry.ai_total ?? 0,
        ai_success: entry.ai_success ?? 0,
        ai_success_rate: entry.ai_success_rate,
        last_manual_verified: entry.last_manual_verified,
        last_ai_verified: entry.last_ai_verified,
      };
      const relations = [
        {
          type: 'HAS_RELIABILITY',
          target: { type: 'Shop', identity: { slug } },
        },
      ];
      if (ngoSlug) {
        relations.push({
          type: 'SUPPORTS_NGO',
          target: { type: 'NGO', identity: { slug: ngoSlug } },
        });
      }
      return {
        type: 'ShopReliability',
        identity: { shop_slug: slug },
        properties,
        relations,
      };
    });
}

function buildReliabilityPromotionFallback(
  scoreboard: ReliabilityScoreboard | null,
  registry?: ShopRegistry,
): unknown[] {
  if (!scoreboard?.entries?.length) {
    return [];
  }
  const generatedAt = scoreboard.generated_at ?? new Date().toISOString();
  return scoreboard.entries
    .filter(entry => entry.slug && entry.slug.toLowerCase() !== 'unknown')
    .map(entry => {
      const slug = entry.slug.toLowerCase();
      const ngoSlug = registry ? resolveDefaultNgoSlug(registry, slug) : undefined;
      const successRate = entry.ai_success_rate ?? entry.manual_success_rate ?? 0;
      const discountPercent = typeof successRate === 'number' ? Math.round(successRate * 100) : undefined;
      return {
        type: 'Promotion',
        identity: { promotion_id: `reliability-${slug}` },
        properties: {
          shop_slug: slug,
          ngo_slug: ngoSlug,
          discount_percent: discountPercent,
          scraped_at: generatedAt,
          title: `Reliability fallback – ${slug}`,
          headline: `AI success ${(entry.ai_success_rate ?? 0) * 100}% | Manual ${(entry.manual_success_rate ?? 0) * 100}%`,
          source: 'reliability_fallback',
        },
        relations: [
          {
            type: 'BELONGS_TO_SHOP',
            target: { type: 'Shop', identity: { slug } },
          },
          ngoSlug
            ? {
                type: 'BENEFITS_NGO',
                target: { type: 'NGO', identity: { slug: ngoSlug } },
              }
            : null,
        ].filter(Boolean),
      };
    });
}

function buildKnowledgeFacts(topics: KnowledgeTopic[]): unknown[] {
  return topics.map(topic => ({
    type: 'KnowledgeTopic',
    identity: { topic_id: topic.id },
    properties: {
      title: topic.title,
      summary: topic.summary,
      keywords: topic.keywords,
    },
  }));
}

async function run(): Promise<void> {
  const [turns, gmailPromos, aresettPromos, knowledgeTopics, registry, reliabilityScoreboard] = await Promise.all([
    loadConversationTurns(),
    loadGmailPromotions(),
    loadAresetPromotions(),
    getAllKnowledgeTopics().catch(() => [] as KnowledgeTopic[]),
    loadShopRegistry().catch(() => undefined),
    loadReliabilityScoreboard(),
  ]);
  const promos = [...gmailPromos, ...aresettPromos];
  if ((turns.length === 0) && (promos.length === 0)) {
    console.warn('⚠️  Nincs felküldhető adat (se Impi log, se Gmail promó).');
    return;
  }
  const enrichedPromos = registry
    ? promos.map(promo => {
        if (promo.ngo_slug || !promo.shop_slug) {
          return promo;
        }
        let domain: string | undefined;
        if (promo.url) {
          try {
            domain = new URL(promo.url).hostname;
          } catch (_) {
            domain = undefined;
          }
        }
        const fallbackNgo = resolveDefaultNgoSlug(registry, promo.shop_slug, domain);
        if (!fallbackNgo) {
          return promo;
        }
        return { ...promo, ngo_slug: fallbackNgo };
      })
    : promos;
  const facts = [
    ...buildConversationFacts(turns),
    ...buildPromotionFacts(enrichedPromos),
    ...buildNgoFacts(enrichedPromos),
    ...buildKnowledgeFacts(knowledgeTopics),
    ...buildReliabilityFacts(reliabilityScoreboard, registry),
    ...buildReliabilityPromotionFallback(reliabilityScoreboard, registry),
  ];
  await upsertFacts(facts);
}

run().catch(error => {
  console.error('❌ Graph memory ingest hiba:', error);
  process.exitCode = 1;
});
