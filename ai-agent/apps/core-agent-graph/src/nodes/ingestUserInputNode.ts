import { randomUUID } from 'node:crypto';
import type { CoreAgentState } from '../state.js';

export async function ingestUserInputNode(state: CoreAgentState): Promise<Partial<CoreAgentState>> {
  const logs = [...(state.logs ?? []), 'ingest: feldolgozom a felhasználói üzenetet'];
  const sessionId = state.sessionId ?? randomUUID();
  const normalizedTopic = state.topicHint || state.userMessage.slice(0, 80).toLowerCase();

  return {
    sessionId,
    memoryRequest: {
      userId: sessionId,
      topic: normalizedTopic,
    },
    logs,
  };
}
