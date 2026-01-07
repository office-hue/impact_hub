import type { CoreAgentState } from '../state.js';
import { incrementCapabilityStats } from '../utils/capabilityStats.js';
import { storeInteractionInGraphiti } from '../utils/graphitiInteraction.js';

export async function memoryUpdateNode(state: CoreAgentState): Promise<Partial<CoreAgentState>> {
  const logs = [...(state.logs ?? [])];

  if (!state.executionTrace?.length) {
    logs.push('memoryUpdate: skip (nincs execution trace)');
    return { logs };
  }

  const last = state.executionTrace[state.executionTrace.length - 1];

  try {
    await incrementCapabilityStats(last.capability, last.status === 'success');
    logs.push(`memoryUpdate: stats updated (${last.capability}, ${last.status})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ismeretlen hiba';
    logs.push(`memoryUpdate: stats update failed – ${message}`);
  }

  try {
    await storeInteractionInGraphiti({
      sessionId: state.sessionId,
      userId: state.memoryRequest?.userId,
      userMessage: state.userMessage,
      capability: last.capability,
      success: last.status === 'success',
      timestamp: last.timestamp,
    });
    logs.push('memoryUpdate: graphiti interaction stored');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ismeretlen hiba';
    logs.push(`memoryUpdate: graphiti store failed – ${message}`);
  }

  return { logs };
}
