#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const home = process.env.HOME || process.env.USERPROFILE || process.cwd();
const repoDir = path.join(home, 'ai-agent');
const dataDir = path.join(home, 'ai-agent-data');

try {
  process.chdir(repoDir);
} catch (err) {
  // ignore
}

console.log('[ai-agent] repoDir =', repoDir);

function normalizeForMatch(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function resolveFirstExisting(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function findDirFuzzy(baseDir, needle) {
  const target = normalizeForMatch(needle);
  try {
    for (const entry of fs.readdirSync(baseDir)) {
      if (normalizeForMatch(entry).includes(target)) {
        const candidate = path.join(baseDir, entry);
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }
  } catch (err) {
    // ignore
  }
  return undefined;
}

const knowledgeDirCandidates = [
  process.env.IMPI_KNOWLEDGE_DIR,
  path.join(repoDir, 'Impi Tudásbázis'),
  path.join(repoDir, 'Impi Tudásbázis'),
  path.join(repoDir, 'dist', 'Impi Tudásbázis'),
  path.join(repoDir, 'dist', 'Impi Tudásbázis'),
].filter(Boolean);
const resolvedKnowledgeDir = resolveFirstExisting(knowledgeDirCandidates);
if (resolvedKnowledgeDir && !process.env.IMPI_KNOWLEDGE_DIR) {
  process.env.IMPI_KNOWLEDGE_DIR = resolvedKnowledgeDir;
}

const knowledgeFileCandidates = [
  process.env.IMPI_KNOWLEDGE_FILE,
  path.join(repoDir, 'tools', 'Tudásbázis-imői.md'),
  resolvedKnowledgeDir ? path.join(resolvedKnowledgeDir, 'Tudásbázis-imői.md') : undefined,
  path.join(repoDir, 'dist', 'Impi Tudásbázis', 'Tudásbázis-imői.md'),
  path.join(repoDir, 'dist', 'Impi Tudásbázis', 'Tudásbázis-imői.md'),
].filter(Boolean);
const resolvedKnowledgeFile = resolveFirstExisting(knowledgeFileCandidates);
if (resolvedKnowledgeFile && !process.env.IMPI_KNOWLEDGE_FILE) {
  process.env.IMPI_KNOWLEDGE_FILE = resolvedKnowledgeFile;
}

const knowledgeAliasCandidates = [
  process.env.IMPI_KNOWLEDGE_ALIAS_FILE,
  resolvedKnowledgeDir ? path.join(resolvedKnowledgeDir, 'knowledge-aliases.json') : undefined,
  path.join(repoDir, 'dist', 'Impi Tudásbázis', 'knowledge-aliases.json'),
  path.join(repoDir, 'dist', 'Impi Tudásbázis', 'knowledge-aliases.json'),
].filter(Boolean);
const resolvedAliasFile = resolveFirstExisting(knowledgeAliasCandidates);
if (resolvedAliasFile && !process.env.IMPI_KNOWLEDGE_ALIAS_FILE) {
  process.env.IMPI_KNOWLEDGE_ALIAS_FILE = resolvedAliasFile;
}

const conversationMapCandidates = [
  process.env.IMPI_CONVERSATION_MAP,
  resolvedKnowledgeDir ? path.join(resolvedKnowledgeDir, 'Impi beszélgetés térkép.json') : undefined,
  path.join(repoDir, 'Impi Tudásbázis', 'Impi beszélgetés térkép.json'),
  path.join(repoDir, 'Impi Tudásbázis', 'Impi beszélgetés térkép.json'),
  path.join(repoDir, 'dist', 'Impi Tudásbázis', 'Impi beszélgetés térkép.json'),
  path.join(repoDir, 'dist', 'Impi Tudásbázis', 'Impi beszélgetés térkép.json'),
].filter(Boolean);
const resolvedConversationMap = resolveFirstExisting(conversationMapCandidates);
if (resolvedConversationMap && !process.env.IMPI_CONVERSATION_MAP) {
  process.env.IMPI_CONVERSATION_MAP = resolvedConversationMap;
}

process.env.MANUAL_COUPONS_JSON = process.env.MANUAL_COUPONS_JSON || path.join(dataDir, 'manual-coupons.json');
process.env.ARUKERESO_COUPONS_JSON = process.env.ARUKERESO_COUPONS_JSON || path.join(dataDir, 'arukereso.json');
process.env.MANUAL_COUPONS_STATS = process.env.MANUAL_COUPONS_STATS || path.join(dataDir, 'manual_coupons_stats.json');
process.env.IMPI_CHAT_LOG = process.env.IMPI_CHAT_LOG || path.join(repoDir, 'tmp', 'logs', 'impi-chat.log');
process.env.AI_AGENT_OPTIONAL_FEATURES = process.env.AI_AGENT_OPTIONAL_FEATURES || 'playwright,openai_bridge';

const entryPoint = path.join(repoDir, 'dist', 'apps', 'api-gateway', 'src', 'index.js');

(async () => {
  try {
    await import(pathToFileURL(entryPoint).href);
  } catch (err) {
    console.error('Failed to start AI Agent service', err);
    process.exit(1);
  }
})();
