#!/usr/bin/env tsx
import fs from 'fs/promises';
import path from 'path';
import { KNOWLEDGE_DIR_PATH } from '../../apps/api-gateway/src/services/knowledge-config.js';

interface CatalogEntry {
  relativePath: string;
  displayName: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: string;
  topLevelFolder: string;
  keywords: string[];
}

interface CatalogSummary {
  root: string;
  generatedAt: string;
  totalFiles: number;
  entries: CatalogEntry[];
}

const OUTPUT_JSON = path.resolve(process.cwd(), 'tools', 'out', 'drive-catalog.json');
const OUTPUT_MARKDOWN = path.join(KNOWLEDGE_DIR_PATH, 'drive-katalogus.md');
const EXCLUDED_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);
const MAX_KEYWORDS = 8;

async function ensureDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

async function walkDirectory(dir: string, root: string, entries: CatalogEntry[]): Promise<void> {
  const dirItems = await fs.readdir(dir, { withFileTypes: true });
  for (const item of dirItems) {
    if (EXCLUDED_NAMES.has(item.name)) {
      continue;
    }
    const absolutePath = path.join(dir, item.name);
    if (item.isDirectory()) {
      await walkDirectory(absolutePath, root, entries);
      continue;
    }
    try {
      const stats = await fs.stat(absolutePath);
      const relativePath = path.relative(root, absolutePath).replace(/\\/g, '/');
      const extension = path.extname(item.name).replace('.', '').toLowerCase() || 'unknown';
      const topLevelFolder = relativePath.includes('/') ? relativePath.split('/')[0] : '(gyökér)';
      entries.push({
        relativePath,
        displayName: item.name,
        extension,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        topLevelFolder,
        keywords: deriveKeywords(relativePath),
      });
    } catch (error) {
      console.warn(`⚠️  Nem sikerült feldolgozni: ${absolutePath}`, error);
    }
  }
}

function deriveKeywords(relativePath: string): string[] {
  const tokens = relativePath
    .replace(/[_-]/g, ' ')
    .replace(/\.[^/.]+$/, '')
    .split(/[\/]/)
    .flatMap(part => part.split(/\s+/))
    .map(token => normalizeToken(token))
    .filter(token => token.length >= 3);
  const unique: string[] = [];
  for (const token of tokens) {
    if (token && !unique.includes(token)) {
      unique.push(token);
    }
  }
  return unique.slice(0, MAX_KEYWORDS);
}

function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function formatBytes(size: number): string {
  if (size === 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const base = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)));
  const value = size / Math.pow(1024, base);
  return `${value.toFixed(value >= 10 || base === 0 ? 0 : 1)} ${units[base]}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('hu-HU');
}

function renderMarkdown(summary: CatalogSummary): string {
  const headerLines = [
    '# Drive katalógus (automatikusan generálva)',
    '',
    `- Gyökér könyvtár: ${summary.root}`,
    `- Frissítve: ${formatDate(summary.generatedAt)}`,
    `- Összes fájl: ${summary.totalFiles}`,
    '',
  ];
  const bodyLines: string[] = [];
  summary.entries.forEach(entry => {
    bodyLines.push(`## ${entry.relativePath}`);
    bodyLines.push(`- **Fájl**: ${entry.displayName}`);
    bodyLines.push(`- **Mappa**: ${entry.topLevelFolder}`);
    bodyLines.push(`- **Típus**: ${entry.extension}`);
    bodyLines.push(`- **Méret**: ${formatBytes(entry.sizeBytes)}`);
    bodyLines.push(`- **Módosítva**: ${formatDate(entry.modifiedAt)}`);
    if (entry.keywords.length) {
      bodyLines.push(`- **Kulcsszavak**: ${entry.keywords.join(', ')}`);
    }
    bodyLines.push('');
  });
  return [...headerLines, ...bodyLines].join('\n');
}

async function main(): Promise<void> {
  const root = KNOWLEDGE_DIR_PATH;
  const stats = await fs.stat(root);
  if (!stats.isDirectory()) {
    throw new Error(`A knowledge könyvtár nem létezik vagy nem könyvtár: ${root}`);
  }
  const entries: CatalogEntry[] = [];
  await walkDirectory(root, root, entries);
  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const summary: CatalogSummary = {
    root,
    generatedAt: new Date().toISOString(),
    totalFiles: entries.length,
    entries,
  };
  await ensureDir(OUTPUT_JSON);
  await fs.writeFile(OUTPUT_JSON, JSON.stringify(summary, null, 2), 'utf8');
  await fs.writeFile(OUTPUT_MARKDOWN, renderMarkdown(summary), 'utf8');
  console.log(`📚 Drive katalógus elkészült ${entries.length} fájlra.`);
  console.log(`   JSON: ${OUTPUT_JSON}`);
  console.log(`   Markdown: ${OUTPUT_MARKDOWN}`);
}

main().catch(error => {
  console.error('❌ Nem sikerült a Drive katalógus generálása:', error);
  process.exitCode = 1;
});
