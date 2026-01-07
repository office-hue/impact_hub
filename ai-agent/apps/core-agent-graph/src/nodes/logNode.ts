import type { CoreAgentState } from '../state.js';
import { logGraphRun } from '../telemetry.js';

export async function logNode(state: CoreAgentState): Promise<Partial<CoreAgentState>> {
  const logs = [...(state.logs ?? []), 'log: telemetry mentése'];
  const startedAt = state.observability?.startedAt;
  const durationMs = typeof startedAt === 'number' ? Date.now() - startedAt : undefined;
  await logGraphRun(
    { ...state, logs },
    {
      source: state.observability?.source,
      duration_ms: durationMs,
      extra: state.observability?.extra,
    },
  );
  return { logs };
}
