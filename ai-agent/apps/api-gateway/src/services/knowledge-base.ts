import fs from 'fs/promises';
import { KNOWLEDGE_FILE_PATH } from './knowledge-config.js';
const DEFAULT_MAX_CHARS = Number(process.env.IMPI_KNOWLEDGE_MAX_CHARS || 6000);
const RELOAD_INTERVAL_MS = Number(process.env.IMPI_KNOWLEDGE_RELOAD_MS || 5 * 60 * 1000);

let cachedText = '';
let lastLoadedAt = 0;
let lastErrorAt = 0;

async function readKnowledgeFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8');
}

export async function getKnowledgeBaseSnippet(maxChars = DEFAULT_MAX_CHARS): Promise<string> {
  const now = Date.now();
  const pathToUse = KNOWLEDGE_FILE_PATH;

  if (!cachedText || now - lastLoadedAt > RELOAD_INTERVAL_MS) {
    try {
      cachedText = await readKnowledgeFile(pathToUse);
      lastLoadedAt = now;
    } catch (err) {
      if (!cachedText && now - lastErrorAt > 60_000) {
        console.warn('Impi knowledge base betöltése nem sikerült:', err);
        lastErrorAt = now;
      }
    }
  }

  if (!cachedText) {
    return '';
  }

  if (maxChars > 0 && cachedText.length > maxChars) {
    return cachedText.slice(0, maxChars);
  }
  return cachedText;
}
