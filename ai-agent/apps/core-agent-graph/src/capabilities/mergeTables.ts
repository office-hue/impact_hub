import { mergeAndExportDocuments } from '@apps/core-worker/src/merge-tables.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StructuredDocument } from '../state.js';
import type { CapabilityManifest } from './types.js';
import { registerCapability } from './registry.js';
import type { CoreAgentState } from '../state.js';

type MergeTablesInput = {
  documents?: StructuredDocument[];
};

type MergeTablesOutput = {
  status: 'ok' | 'skipped' | 'error';
  reason?: string;
  outputFiles?: string[];
};

const inputSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    documents: { type: 'array' },
  },
};

const outputSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    status: { type: 'string' },
    reason: { type: 'string' },
    outputFiles: { type: 'array' },
  },
};

function deriveOutputDir(structured: StructuredDocument[]): string {
  for (const doc of structured) {
    const candidate = doc.attachment.ingestPath || doc.attachment.url;
    if (candidate) {
      const resolved = candidate.startsWith('file://') ? fileURLToPath(candidate) : candidate;
      if (path.isAbsolute(resolved)) {
        return path.dirname(resolved);
      }
    }
  }
  return process.cwd();
}

async function invokeMergeTables(input: MergeTablesInput, context: CoreAgentState): Promise<MergeTablesOutput> {
  const structured = Array.isArray(input.documents) ? input.documents : context.structuredDocuments ?? [];
  if (!structured.length) {
    return { status: 'skipped', reason: 'no_structured_documents' };
  }
  await mergeAndExportDocuments(structured);
  const outputDir = deriveOutputDir(structured);
  const baseName = 'Output.core';
  const potentialFiles = ['.xlsx', '.csv', '.json', '.pdf', '.docx'].map(ext => path.join(outputDir, `${baseName}${ext}`));
  const outputFiles: string[] = [];
  for (const file of potentialFiles) {
    try {
      await fs.access(file);
      outputFiles.push(file);
    } catch {
      // File didn't get generated, skip it.
    }
  }
  if (!outputFiles.length) {
    return { status: 'error', reason: 'no_output_files_generated' };
  }
  return { status: 'ok', outputFiles };
}

export const mergeTablesCapability: CapabilityManifest<MergeTablesInput, MergeTablesOutput> = {
  id: 'merge-tables',
  name: 'Táblázat merge (HRSZ)',
  description: 'Excel/CSV táblázatok összefésülése és exportja (core-worker).',
  inputSchema,
  outputSchema,
  invoke: invokeMergeTables,
  tags: ['excel', 'merge', 'documents'],
  priority: 8,
};

registerCapability(mergeTablesCapability);
