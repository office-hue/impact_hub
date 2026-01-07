import fs from 'fs/promises';
import path from 'path';
import { KNOWLEDGE_FILE_PATH, KNOWLEDGE_DIR_PATH, KNOWLEDGE_ALIAS_FILE } from './knowledge-config.js';

const TOPIC_RELOAD_INTERVAL_MS = Number(process.env.IMPI_KNOWLEDGE_TOPIC_RELOAD_MS || 5 * 60 * 1000);
const SUMMARY_MAX_CHARS = Number(process.env.IMPI_KNOWLEDGE_TOPIC_SUMMARY_MAX || 600);
const STOP_WORDS = new Set(['az', 'ez', 'egy', 'egyik', 'ami', 'hogy', 'vagy', 'van', 'lesz', 'nem', 'itt', 'arra', 'mert', 'mint', 'kell']);
const ALIAS_RELOAD_INTERVAL_MS = Number(process.env.IMPI_KNOWLEDGE_ALIAS_RELOAD_MS || 60 * 1000);

interface KnowledgeAliasConfig {
  knowledge_files?: string[];
  topic_synonyms?: Record<string, string[]>;
  flow_synonyms?: Record<string, string[]>;
}

export interface KnowledgeTopic {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
}

interface KnowledgeFile {
  filePath: string;
  fileSlug: string;
}

const DEFAULT_ALIAS_CONFIG: KnowledgeAliasConfig = {
  knowledge_files: undefined,
  topic_synonyms: {},
  flow_synonyms: {},
};

let cachedAliasConfig: KnowledgeAliasConfig = DEFAULT_ALIAS_CONFIG;
let aliasLoadedAt = 0;
let aliasVersion = 0;
let lastAliasSignature = '';

let cachedTopics: KnowledgeTopic[] = [];
let topicsLoadedAt = 0;
let topicsAliasVersion = -1;

function sanitizeSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function extractKeywords(title: string): string[] {
  return normalizeKeyword(title)
    .split(/\s+/)
    .filter(token => token.length >= 4 && !STOP_WORDS.has(token));
}

function normalizeKeyword(keyword: string): string {
  return keyword
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();
}

function summarizeContent(lines: string[]): string {
  const content = lines
    .map(line => line.trim())
    .filter(Boolean)
    .join(' ');
  if (!content) {
    return '';
  }
  if (content.length <= SUMMARY_MAX_CHARS) {
    return content;
  }
  return content.slice(0, SUMMARY_MAX_CHARS).trim() + '…';
}

function normalizeAliasConfig(raw: unknown): KnowledgeAliasConfig {
  const config = typeof raw === 'object' && raw ? raw as KnowledgeAliasConfig : DEFAULT_ALIAS_CONFIG;
  return {
    knowledge_files: Array.isArray(config.knowledge_files) ? config.knowledge_files.filter(Boolean) : undefined,
    topic_synonyms: config.topic_synonyms || {},
    flow_synonyms: config.flow_synonyms || {},
  };
}

async function loadAliasConfig(): Promise<{ config: KnowledgeAliasConfig; version: number }> {
  const now = Date.now();
  if (!aliasLoadedAt || now - aliasLoadedAt > ALIAS_RELOAD_INTERVAL_MS) {
    let signature = 'missing';
    let parsed: KnowledgeAliasConfig = DEFAULT_ALIAS_CONFIG;
    try {
      const raw = await fs.readFile(KNOWLEDGE_ALIAS_FILE, 'utf8');
      signature = raw;
      parsed = normalizeAliasConfig(JSON.parse(raw));
    } catch (err) {
      if (lastAliasSignature && signature !== lastAliasSignature) {
        console.warn('Impi knowledge alias file nem olvasható, alapértelmezett konfiguráció használatban.', err);
      }
    }
    if (signature !== lastAliasSignature) {
      cachedAliasConfig = parsed;
      aliasVersion += 1;
      lastAliasSignature = signature;
    }
    aliasLoadedAt = now;
  }
  return { config: cachedAliasConfig, version: aliasVersion };
}

async function resolveKnowledgeFiles(config: KnowledgeAliasConfig): Promise<KnowledgeFile[]> {
  const candidates: string[] = [];
  if (config.knowledge_files?.length) {
    candidates.push(...config.knowledge_files);
  } else {
    try {
      const entries = await fs.readdir(KNOWLEDGE_DIR_PATH);
      candidates.push(...entries.filter(entry => entry.toLowerCase().endsWith('.md')));
    } catch (err) {
      console.warn('Impi knowledge könyvtár lista nem sikerült, fallback a default fájlra.', err);
    }
    if (!candidates.length) {
      candidates.push(KNOWLEDGE_FILE_PATH);
    }
  }
  const seen = new Set<string>();
  const files: KnowledgeFile[] = [];
  for (const name of candidates) {
    const absolute = path.isAbsolute(name) ? name : path.join(KNOWLEDGE_DIR_PATH, name);
    if (seen.has(absolute)) {
      continue;
    }
    seen.add(absolute);
    const fileSlug = sanitizeSlug(path.basename(absolute, path.extname(absolute))) || 'knowledge';
    files.push({ filePath: absolute, fileSlug });
  }
  return files;
}

function isTopicHeading(line: string): boolean {
  return /^##+\s+/.test(line.trim());
}

function parseTopics(markdown: string, fileSlug: string, aliasConfig: KnowledgeAliasConfig): KnowledgeTopic[] {
  const lines = markdown.split(/\r?\n/);
  const topics: KnowledgeTopic[] = [];
  let currentTitle: string | null = null;
  let buffer: string[] = [];

  const pushTopic = () => {
    if (!currentTitle) {
      return;
    }
    const summary = summarizeContent(buffer);
    if (!summary) {
      return;
    }
    const titleSlug = sanitizeSlug(currentTitle);
    const id = `${fileSlug}-${titleSlug}`;
    const baseKeywords = extractKeywords(currentTitle);
    const aliasSynonyms = aliasConfig.topic_synonyms?.[id]
      || aliasConfig.topic_synonyms?.[titleSlug]
      || [];
    const keywords = [...new Set([
      ...baseKeywords,
      ...aliasSynonyms.map(normalizeKeyword),
    ])].filter(Boolean);
    topics.push({
      id,
      title: currentTitle,
      summary,
      keywords,
    });
  };

  for (const line of lines) {
    if (isTopicHeading(line)) {
      pushTopic();
      currentTitle = line.replace(/^##+\s+/, '').trim();
      buffer = [];
    } else if (currentTitle) {
      buffer.push(line);
    }
  }
  pushTopic();
  return topics;
}

async function loadTopicsIfNeeded(): Promise<KnowledgeTopic[]> {
  const now = Date.now();
  const { config, version } = await loadAliasConfig();
  const needsReload = !cachedTopics.length
    || now - topicsLoadedAt > TOPIC_RELOAD_INTERVAL_MS
    || version !== topicsAliasVersion;
  if (!needsReload) {
    return cachedTopics;
  }
  const files = await resolveKnowledgeFiles(config);
  const aggregated: KnowledgeTopic[] = [];
  for (const file of files) {
    try {
      const raw = await fs.readFile(file.filePath, 'utf8');
      aggregated.push(...parseTopics(raw, file.fileSlug, config));
    } catch (err) {
      console.warn(`Impi knowledge fájl (${file.filePath}) beolvasása nem sikerült:`, err);
    }
  }
  cachedTopics = aggregated;
  topicsAliasVersion = version;
  topicsLoadedAt = now;
  return cachedTopics;
}
export async function getAllKnowledgeTopics(): Promise<KnowledgeTopic[]> {
  const topics = await loadTopicsIfNeeded();
  return topics.map(topic => ({ ...topic }));
}

function normalizeMessage(message: string): string {
  return message
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();
}

export interface KnowledgeMatch {
  id: string;
  title: string;
  summary: string;
}

export async function findKnowledgeTopic(message?: string): Promise<KnowledgeMatch | null> {
  if (!message) {
    return null;
  }
  const normalized = normalizeMessage(message);
  if (!normalized) {
    return null;
  }
  const topics = await loadTopicsIfNeeded();
  let best: { topic: KnowledgeTopic; score: number } | null = null;
  for (const topic of topics) {
    let score = 0;
    for (const keyword of topic.keywords) {
      if (keyword && normalized.includes(keyword)) {
        score += keyword.length;
      }
    }
    if (score === 0) {
      const slugToken = topic.id.replace(/-/g, ' ');
      if (normalized.includes(slugToken)) {
        score = slugToken.length;
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { topic, score };
    }
  }
  if (!best) {
    return null;
  }
  return {
    id: best.topic.id,
    title: best.topic.title,
    summary: best.topic.summary,
  };
}

export async function getFlowSynonyms(): Promise<Record<string, string[]>> {
  const { config } = await loadAliasConfig();
  return config.flow_synonyms || {};
}
