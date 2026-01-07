import type { CoreAgentState } from '../state.js';
import { fetchMemoryContext } from '@apps/api-gateway/src/services/memory-context.js';
import { buildSampleGraphitiContext } from '../mocks/sampleGraphitiContext.js';

const ALLOW_GRAPHITI_STUB_ON_ERROR = process.env.GRAPHITI_STUB_ON_ERROR !== '0';

export async function graphitiContextNode(state: CoreAgentState): Promise<Partial<CoreAgentState>> {
  const logs = [...(state.logs ?? [])];
  if (!state.memoryRequest) {
    logs.push('graphiti: kihagyva (nincs memoryRequest)');
    return { logs };
  }
  if (state.graphitiContext) {
    logs.push('graphiti: skip (előre kitöltve)');
    return { logs, contextSource: state.contextSource ?? 'live' };
  }
  const skipTextSearch = process.env.GRAPHITI_ENABLE_TEXT_SEARCH === '1' ? false : true;
  const requestTopic = skipTextSearch ? '' : state.memoryRequest.topic;

  try {
    const context = await fetchMemoryContext({
      userId: state.memoryRequest.userId,
      topic: requestTopic,
    });
    logs.push('graphiti: context lekérve');
    return { graphitiContext: context, contextSource: 'live', logs };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ismeretlen hiba';
    logs.push(`graphiti: hiba – ${message}`);
    if (ALLOW_GRAPHITI_STUB_ON_ERROR) {
      const stub = buildSampleGraphitiContext({
        topic: requestTopic,
        userMessage: state.userMessage,
      });
      logs.push('graphiti: stub context felhasználva');
      return { graphitiContext: stub, contextSource: 'stub', logs };
    }
    return { fallbackReason: 'graphiti_error', logs };
  }
}
