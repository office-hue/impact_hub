import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { findKnowledgeTopic, getFlowSynonyms, type KnowledgeMatch } from './knowledge-index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_MAP_FILE = process.env.IMPI_CONVERSATION_MAP
  || path.resolve(__dirname, '../../../../Impi Tudásbázis/Impi beszélgetés térkép.json');
const MAP_RELOAD_INTERVAL_MS = Number(process.env.IMPI_CONVERSATION_MAP_RELOAD_MS || 5 * 60 * 1000);
const OPTION_LIMIT = Number(process.env.IMPI_CONVERSATION_OPTION_LIMIT || 4);

type ConversationOption = {
  label?: string;
  next?: string;
};

type ConversationFlow = {
  id: string;
  group?: string;
  bot: string;
  options?: ConversationOption[];
  next?: string;
};

type ConversationMap = {
  flows: ConversationFlow[];
};

export interface ConversationSnippet {
  nodeId: string;
  group?: string;
  bot: string;
  options: string[];
  next?: string;
  text: string;
  knowledge?: KnowledgeMatch;
}

let cachedMap: ConversationMap | null = null;
let lastLoadedAt = 0;
let lastErrorAt = 0;

async function readConversationMap(filePath: string): Promise<ConversationMap> {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.flows)) {
    throw new Error('Érvénytelen beszélgetés-térkép JSON: hiányzik a flows tömb.');
  }
  return parsed as ConversationMap;
}

async function loadMapIfStale(): Promise<ConversationMap | null> {
  const now = Date.now();
  const pathToUse = DEFAULT_MAP_FILE;
  if (!cachedMap || now - lastLoadedAt > MAP_RELOAD_INTERVAL_MS) {
    try {
      cachedMap = await readConversationMap(pathToUse);
      lastLoadedAt = now;
    } catch (err) {
      if (now - lastErrorAt > 60_000) {
        console.warn('Impi beszélgetés térkép betöltése nem sikerült:', err);
        lastErrorAt = now;
      }
    }
  }
  return cachedMap;
}

function normaliseMessage(message: string): string {
  return message
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();
}

const BASE_FLOW_KEYWORDS: Record<string, string[]> = {
  video_donation_start: ['video', 'videot', 'videoval', 'reklam', 'penz nelkul', 'videostamogatas'],
  check_donation_history: ['statisztika', 'osszesen', 'mennyi', 'mennyi gyult', 'sajat statisztika'],
  show_leaderboard: ['leaderboard', 'ranglista', 'verseny', 'toplista', 'top 3', 'top100'],
  show_impact: ['impact', 'kimutatas', 'osszegzes', 'sts', 'atlathatosag', 'transzparencia', 'hol megy a penz'],
  invite_friend: ['meghiv', 'referral', 'ajanlo', 'meghivas'],
  ask_feedback: ['feedback', 'ertekeles', 'visszajelzes', 'panasz'],
  ask_product_intent: ['vasar', 'bolt', 'termek', 'kupon', 'shop'],
  ask_preference: ['tamogatott ugy', 'ngo', 'civil szervezet', 'allatvedelem', 'gyerek', 'kornyezet'],
  show_browse_info: ['kampanylista', 'bongeszes', 'fillout', 'nezelodom', 'csak inspiracio'],
  handle_free_text: ['nem akarok vasarolni', 'csak info', 'nincs shop'],
};

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function normaliseKeyword(keyword: string): string {
  return keyword
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();
}

function computeFlowScore(normalised: string, tokens: string[], rawKeywords: string[]): number {
  if (!rawKeywords.length) {
    return 0;
  }
  let score = 0;
  const keywords = rawKeywords.map(normaliseKeyword).filter(Boolean);
  for (const keyword of keywords) {
    if (!keyword) {
      continue;
    }
    if (keyword.includes(' ')) {
      if (normalised.includes(keyword)) {
        score += keyword.length * 2;
      }
    } else if (tokens.includes(keyword)) {
      score += keyword.length * 3;
    }
  }
  return score;
}

async function detectFlowId(message: string | undefined, flows: ConversationFlow[]): Promise<string> {
  if (!message) {
    return 'welcome';
  }
  const simplified = normaliseMessage(message);
  if (!simplified) {
    return 'welcome';
  }
  const tokens = tokenize(simplified);
  const flowSynonyms = await getFlowSynonyms();
  const candidateIds = new Set<string>();
  flows.forEach(flow => candidateIds.add(flow.id));
  Object.keys(flowSynonyms).forEach(id => candidateIds.add(id));
  Object.keys(BASE_FLOW_KEYWORDS).forEach(id => candidateIds.add(id));

  let bestId = 'welcome';
  let bestScore = 0;
  candidateIds.forEach(id => {
    const keywords = [
      ...(flowSynonyms[id] || []),
      ...(BASE_FLOW_KEYWORDS[id] || []),
    ];
    const score = computeFlowScore(simplified, tokens, keywords);
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  });

  if (bestScore === 0) {
    if (tokens.some(token => token.includes('hiba'))) {
      return 'handle_free_text';
    }
    if (simplified.includes('video')) {
      return 'video_donation_start';
    }
    return 'welcome';
  }
  return bestId;
}

function formatOptions(options?: ConversationOption[]): string[] {
  if (!options?.length) {
    return [];
  }
  return options
    .filter(option => option?.label)
    .slice(0, OPTION_LIMIT)
    .map(option => {
      const next = option.next ? ` → ${option.next}` : '';
      return `${option.label}${next}`;
    });
}

function buildSnippet(node: ConversationFlow): ConversationSnippet {
  const optionLines = formatOptions(node.options);
  const lines = [node.bot];
  if (optionLines.length) {
    lines.push('Ajánlott válaszok:');
    optionLines.forEach(line => lines.push(`- ${line}`));
  } else if (node.next) {
    lines.push(`Következő lépés: ${node.next}`);
  }
  return {
    nodeId: node.id,
    group: node.group,
    bot: node.bot,
    options: optionLines,
    next: node.next,
    text: lines.join('\n'),
  };
}

export async function getConversationSnippet(message?: string): Promise<ConversationSnippet | null> {
  const map = await loadMapIfStale();
  if (!map?.flows?.length) {
    return null;
  }
  const flows = map.flows;
  const desiredId = await detectFlowId(message, flows);
  const fallbackNode = flows.find(flow => flow.id === 'welcome') || flows[0];
  const node = flows.find(flow => flow.id === desiredId) || fallbackNode;
  if (!node) {
    return null;
  }
  const snippet = buildSnippet(node);
  const knowledge = await findKnowledgeTopic(message);
  if (knowledge) {
    snippet.knowledge = knowledge;
    snippet.text = `${snippet.text}\n\nKapcsolódó tudásbázis (${knowledge.title}):\n${knowledge.summary}`;
  }
  return snippet;
}
