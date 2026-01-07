import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveKnowledgeDir(): string {
  if (process.env.IMPI_KNOWLEDGE_DIR) {
    return process.env.IMPI_KNOWLEDGE_DIR;
  }
  const fallbackCandidates = [
    path.resolve(__dirname, '../../../../Impi Tudásbázis'),
    path.resolve(__dirname, '../../../../Impi Tudásbázis'),
    path.resolve(process.cwd(), 'Impi Tudásbázis'),
    path.resolve(process.cwd(), 'Impi Tudásbázis'),
    process.env.HOME ? path.resolve(process.env.HOME, 'ai-agent', 'Impi Tudásbázis') : undefined,
    process.env.HOME ? path.resolve(process.env.HOME, 'ai-agent', 'Impi Tudásbázis') : undefined,
  ].filter(Boolean) as string[];
  for (const candidate of fallbackCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return fallbackCandidates[0];
}

export const KNOWLEDGE_DIR_PATH = resolveKnowledgeDir();

function resolveKnowledgeFile(): string {
  if (process.env.IMPI_KNOWLEDGE_FILE) {
    return process.env.IMPI_KNOWLEDGE_FILE;
  }
  const primary = path.join(KNOWLEDGE_DIR_PATH, 'Tudásbázis-imői.md');
  if (fs.existsSync(primary)) {
    return primary;
  }
  const toolsCandidates = [
    path.resolve(__dirname, '../../../../tools/Tudásbázis-imői.md'),
    path.resolve(process.cwd(), 'tools', 'Tudásbázis-imői.md'),
    process.env.HOME ? path.resolve(process.env.HOME, 'ai-agent', 'tools', 'Tudásbázis-imői.md') : undefined,
  ].filter(Boolean) as string[];
  for (const candidate of toolsCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return primary;
}

export const KNOWLEDGE_FILE_PATH = resolveKnowledgeFile();

export const KNOWLEDGE_ALIAS_FILE = process.env.IMPI_KNOWLEDGE_ALIAS_FILE
  || path.join(KNOWLEDGE_DIR_PATH, 'knowledge-aliases.json');
