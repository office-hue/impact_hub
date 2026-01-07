import fs from 'fs/promises';
import path from 'path';
import type { CoreAgentState } from './state.js';

const LOG_PATH = path.resolve(process.cwd(), '..', 'impactshop-notes', '.codex', 'logs', 'langgraph-run.log');

async function ensureLogDir() {
  await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
}

type LogMetadata = {
  source?: string;
  duration_ms?: number;
  extra?: Record<string, unknown> | undefined;
};

export async function logGraphRun(state: CoreAgentState, metadata: LogMetadata = {}): Promise<void> {
  const payload = {
    timestamp: new Date().toISOString(),
    sessionId: state.sessionId,
    fallbackReason: state.fallbackReason ?? null,
    hasGraphitiContext: Boolean(state.graphitiContext?.nodes?.length),
    contextSource: state.contextSource ?? 'unknown',
    offerCount: state.recommendations?.offers?.length ?? 0,
    warnings: state.recommendations?.warnings ?? [],
    logs: state.logs?.slice(-10) ?? [],
    ...metadata,
  };
  await ensureLogDir();
  await fs.appendFile(LOG_PATH, JSON.stringify(payload) + '\n', 'utf8');
}
