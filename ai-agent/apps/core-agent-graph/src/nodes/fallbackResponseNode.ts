import type { CoreAgentState } from '../state.js';

const DEFAULT_FALLBACK = 'Most nem tudok releváns ajánlatot mutatni, de jelzed ha konkrét terméket keresel és vadászok friss lehetőségeket.';

export async function fallbackResponseNode(state: CoreAgentState): Promise<Partial<CoreAgentState>> {
  const logs = [...(state.logs ?? [])];
  if (state.finalResponse && state.finalResponse.trim()) {
    logs.push('fallback: skip (van kész válasz)');
    return { logs };
  }
  logs.push('fallback: nincs ajánlat, alap üzenet generálva');
  return {
    finalResponse: DEFAULT_FALLBACK,
    fallbackReason: state.fallbackReason ?? 'no_offers',
    logs,
  };
}
