#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist');
const candidateKnowledgeDirs = [
  path.join(repoRoot, 'Impi Tudásbázis'),
  path.join(repoRoot, 'Impi Tudásbázis'),
].filter(dir => fs.existsSync(dir));

if (!candidateKnowledgeDirs.length) {
  console.warn('[knowledge-sync] Nincs Imi Tudásbázis könyvtár, kihagyva a másolást.');
  process.exit(0);
}

if (!fs.existsSync(distDir)) {
  console.warn('[knowledge-sync] A dist mappa nem létezik, futtasd előbb az npm run build-et.');
  process.exit(0);
}

const sourceDir = candidateKnowledgeDirs[0];
const sourceName = path.basename(sourceDir);
const destDir = path.join(distDir, sourceName);

fs.rmSync(destDir, { recursive: true, force: true });
fs.cpSync(sourceDir, destDir, { recursive: true });

const knowledgeFileCandidates = [
  path.join(repoRoot, 'tools', 'Tudásbázis-imői.md'),
  path.join(sourceDir, 'Tudásbázis-imői.md'),
].filter(file => fs.existsSync(file));

if (knowledgeFileCandidates.length) {
  fs.copyFileSync(knowledgeFileCandidates[0], path.join(destDir, 'Tudásbázis-imői.md'));
}

const ngoCategoryMap = path.join(repoRoot, 'data', 'ngo-category-map.json');
if (fs.existsSync(ngoCategoryMap)) {
  const distDataDir = path.join(distDir, 'data');
  fs.mkdirSync(distDataDir, { recursive: true });
  fs.copyFileSync(ngoCategoryMap, path.join(distDataDir, 'ngo-category-map.json'));
}

console.log(`[knowledge-sync] Másolva: ${sourceDir} -> ${destDir}`);
