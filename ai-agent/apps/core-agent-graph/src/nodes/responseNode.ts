import type { CoreAgentState } from '../state.js';

export async function responseNode(state: CoreAgentState): Promise<Partial<CoreAgentState>> {
  const logs = [...(state.logs ?? [])];
  if (state.finalResponse && state.finalResponse.trim()) {
    logs.push('response: skip (előre kitöltve)');
    return { logs };
  }
  const summary = state.recommendations?.summary;
  if (!summary) {
    logs.push('response: nincs ajánlat, fallback üzenet');
    return {
      finalResponse: 'Most nem tudok releváns ajánlatot mutatni, de jelezd újra és vadászok friss lehetőségeket.',
      logs,
    };
  }
  logs.push('response: összefoglaló kész');
  return {
    finalResponse: summary,
    logs,
  };
}
