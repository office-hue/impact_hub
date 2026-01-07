#!/usr/bin/env tsx
import path from 'path';
import { existsSync } from 'fs';
import { promises as fs } from 'fs';
import { ingestPdfFile } from '@apps/document-ingest/src/index.js';

function parseArgs(): { file: string } {
  const args: Record<string, string> = {};
  for (const token of process.argv.slice(2)) {
    const [key, value] = token.split('=');
    if (key.startsWith('--')) {
      args[key.replace(/^--/, '')] = value ?? '';
    }
  }
  if (!args.file) {
    throw new Error('Használat: tsx tools/pdf/table-ocr.ts --file=path/to.pdf');
  }
  return { file: args.file };
}

async function main(): Promise<void> {
  const { file } = parseArgs();
  if (!existsSync(file)) {
    throw new Error(`A fájl nem található: ${file}`);
  }
  const doc = await ingestPdfFile(path.resolve(file), { url: file, name: path.basename(file), mimeType: 'application/pdf' });
  console.log(JSON.stringify(doc, null, 2));
}

main().catch(error => {
  console.error('PDF OCR hiba:', error instanceof Error ? error.message : error);
  process.exit(1);
});
