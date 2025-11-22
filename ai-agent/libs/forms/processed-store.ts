import fs from 'node:fs';
import path from 'node:path';
import { logger } from '@libs/logger';

const STORE_DIR = process.env.FORMS_RESPONSE_STORE_DIR ?? path.join(process.cwd(), 'tmp');
const STORE_FILE = process.env.FORMS_RESPONSE_STORE_FILE ?? path.join(STORE_DIR, 'forms-response-store.json');
const TTL_MS = Number(process.env.FORMS_RESPONSE_TTL_MS ?? 7 * 24 * 60 * 60 * 1000); // default 7 nap
const MAX_ENTRIES = Number(process.env.FORMS_RESPONSE_MAX_ENTRIES ?? 5000);

interface StoredResponse {
  formId: string;
  responseId: string;
  processedAt: string;
}

interface PersistedState {
  responses: StoredResponse[];
}

let state: PersistedState = { responses: [] };
const processedSet = new Set<string>();

function ensureDir() {
  fs.mkdirSync(STORE_DIR, { recursive: true });
}

function getKey(formId: string, responseId: string) {
  return `${formId}::${responseId}`;
}

function loadState() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      state = JSON.parse(raw) as PersistedState;
      const now = Date.now();
      state.responses = state.responses.filter((entry) => now - new Date(entry.processedAt).getTime() < TTL_MS);
      state.responses.forEach((entry) => processedSet.add(getKey(entry.formId, entry.responseId)));
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to load Forms response store, starting fresh');
    state = { responses: [] };
    processedSet.clear();
  }
}

function persistState() {
  try {
    ensureDir();
    fs.writeFileSync(STORE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    logger.error({ error }, 'Failed to persist Forms response store');
  }
}

function prune() {
  const now = Date.now();
  state.responses = state.responses.filter((entry) => {
    const keep = now - new Date(entry.processedAt).getTime() < TTL_MS;
    if (!keep) {
      processedSet.delete(getKey(entry.formId, entry.responseId));
    }
    return keep;
  });
  if (state.responses.length > MAX_ENTRIES) {
    const removeCount = state.responses.length - MAX_ENTRIES;
    const removed = state.responses.splice(0, removeCount);
    removed.forEach((entry) => processedSet.delete(getKey(entry.formId, entry.responseId)));
  }
}

loadState();

export function hasProcessedResponse(formId: string, responseId: string): boolean {
  if (!formId || !responseId) {
    return false;
  }
  return processedSet.has(getKey(formId, responseId));
}

export function markResponseProcessed(formId: string, responseId: string) {
  if (!formId || !responseId) {
    return;
  }
  const key = getKey(formId, responseId);
  if (processedSet.has(key)) {
    return;
  }
  processedSet.add(key);
  state.responses.push({
    formId,
    responseId,
    processedAt: new Date().toISOString()
  });
  prune();
  persistState();
}
