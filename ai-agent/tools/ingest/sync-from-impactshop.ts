import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { runNormalization } from './normalizer.js';

interface SyncOptions {
  notesRoot?: string;
  repoRoot?: string;
  ingestDir?: string;
}

const DEFAULT_NOTES_ROOT = path.resolve(process.cwd(), '..', 'impactshop-notes');
const DEFAULT_REPO_ROOT = path.resolve(process.cwd(), '..', 'impactshop');
const DEFAULT_INGEST_DIR = path.join(process.cwd(), 'tmp', 'ingest');

const MANUAL_REGEX = /manual_coupons_draft.*\.csv$/i;
const ARUKERESO_REGEX = /arukereso.*promotions.*\.json$/i;

const DIR_BLOCKLIST = new Set(['.git', 'node_modules', '.idea', '.vscode', '.next']);

function safeStat(p: string): fs.Stats | undefined {
  try {
    return fs.statSync(p);
  } catch (err) {
    return undefined;
  }
}

function findLatestFile(searchRoots: string[], matcher: RegExp, maxDepth = 4): string | undefined {
  let latestPath: string | undefined;
  let latestMtime = 0;

  const visit = (dir: string, depth: number) => {
    if (depth > maxDepth) {
      return;
    }
    const stat = safeStat(dir);
    if (!stat || !stat.isDirectory()) {
      return;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (DIR_BLOCKLIST.has(entry.name)) {
          continue;
        }
        visit(path.join(dir, entry.name), depth + 1);
      } else if (entry.isFile()) {
        if (!matcher.test(entry.name)) {
          continue;
        }
        const filePath = path.join(dir, entry.name);
        const fileStat = safeStat(filePath);
        if (!fileStat) {
          continue;
        }
        if (fileStat.mtimeMs >= latestMtime) {
          latestMtime = fileStat.mtimeMs;
          latestPath = filePath;
        }
      }
    }
  };

  searchRoots.filter(Boolean).forEach(root => visit(root, 0));
  return latestPath;
}

async function copyIfAvailable(src: string | undefined, dest: string): Promise<void> {
  if (!src) {
    console.warn(`Forrás fájl nem található ehhez: ${dest}`);
    return;
  }
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.copyFile(src, dest);
  console.log(`Átmásolva → ${dest}`);
}

export async function runSync(options: SyncOptions = {}): Promise<void> {
  const notesRoot = options.notesRoot || process.env.IMPACTSHOP_NOTES_ROOT || DEFAULT_NOTES_ROOT;
  const repoRoot = options.repoRoot || process.env.IMPACTSHOP_REPO_ROOT || DEFAULT_REPO_ROOT;
  const ingestDir = options.ingestDir || DEFAULT_INGEST_DIR;
  const rawDir = path.join(ingestDir, 'raw');

  await fsp.mkdir(rawDir, { recursive: true });

  const searchRoots = [
    notesRoot,
    path.join(notesRoot, 'out'),
    path.join(notesRoot, 'tmp'),
    path.join(notesRoot, '.codex'),
    repoRoot,
    path.join(repoRoot, 'wallet-pass-downloads'),
    path.join(repoRoot, 'ai-agent', 'tools', 'out'),
  ].filter(root => safeStat(root));

  const manualSource = findLatestFile(searchRoots as string[], MANUAL_REGEX, 4);
  const arukeresoSource = findLatestFile(searchRoots as string[], ARUKERESO_REGEX, 4);

  const manualDest = path.join(rawDir, 'manual_coupons.csv');
  const arukeresoDest = path.join(rawDir, 'arukereso-promotions.json');

  await Promise.all([
    copyIfAvailable(manualSource, manualDest),
    copyIfAvailable(arukeresoSource, arukeresoDest),
  ]);

  await runNormalization({
    manualCsvPath: manualDest,
    arukeresoPath: arukeresoDest,
    outputDir: ingestDir,
  });
}

const directRun = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (directRun) {
  runSync().catch(err => {
    console.error('ImpactShop sync failed:', err);
    process.exit(1);
  });
}
