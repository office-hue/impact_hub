import type { CoreAgentState } from '../state.js';
import { discoverCapabilities } from '../capabilities/registry.js';
import { scoreCapabilitiesByMessage, selectCapabilityWithPrompt } from '../capabilities/decision.js';
import { logShadow } from '../utils/shadowLogger.js';
import { getEffectivePriority } from '../capabilities/registry.js';
import '../capabilities/index.js';

export async function capabilityDiscoveryNode(state: CoreAgentState): Promise<Partial<CoreAgentState>> {
  const logs = [...(state.logs ?? [])];
  const routingEnabled = process.env.CORE_CAPABILITY_ROUTING === '1';

  if (!routingEnabled) {
    logs.push('capabilityDiscovery(shadow): routing disabled');
    return { logs };
  }

  const candidates = discoverCapabilities(state.userMessage ?? '', state);
  const names = candidates.map(cap => cap.id).join(', ') || 'nincs';
  logs.push(`capabilityDiscovery(shadow): ${candidates.length} jelölt (${names})`);
  logShadow({ stage: 'discovery', routingEnabled, message: state.userMessage, candidates });

  const { selected, chain } = await pickCapability(candidates, state.userMessage ?? '', state);
  if (!selected) {
    logs.push('capabilityDiscovery: nincs választható capability');
    logShadow({ stage: 'discovery', selected: null });
    return { logs };
  }

  const capabilityInput =
    selected.id === 'merge-tables'
      ? { id: selected.id, documents: state.structuredDocuments }
      : { id: selected.id, query: state.userMessage };

  const heuristic = capabilityInput.id === 'merge-tables' ? 'merge' : 'default';
  logs.push(
    `capabilityDiscovery: ${selected.id} kiválasztva (heuristic: ${heuristic}${chain ? ', chain' : ''})`,
  );
  logShadow({ stage: 'discovery', selected: selected.id, heuristic, chain });

  return { logs, capabilityInput, capabilityChain: chain ?? undefined, chainIndex: chain ? 0 : undefined };
}

async function pickCapability(
  candidates: ReturnType<typeof discoverCapabilities>,
  message: string,
  state: CoreAgentState,
) : Promise<{ selected?: typeof candidates[number]; chain?: string[] }> {
  if (!candidates.length) return {};

  // Priority boost stats alapján
  const candidatesWithPriority = await Promise.all(
    candidates.map(async c => ({
      capability: c,
      effectivePriority: await getEffectivePriority(c.id, c.priority ?? 5),
    })),
  );
  candidatesWithPriority.sort((a, b) => b.effectivePriority - a.effectivePriority);
  candidates = candidatesWithPriority.map(item => item.capability);

  const scores = scoreCapabilitiesByMessage(message);
  // Próbáljuk a legmagasabb pontszámút választani az ismert ID-k közül.
  let best: { id: string; score: number } | undefined;
  for (const [id, score] of Object.entries(scores)) {
    if (!score) continue;
    if (candidates.some(c => c.id === id)) {
      if (!best || score > best.score) {
        best = { id, score };
      }
    }
  }
  if (best) {
    const hit = candidates.find(c => c.id === best.id);
    if (hit) return { selected: hit };
  }

  const lower = message.toLowerCase();
  const hasStructured = Array.isArray(state.structuredDocuments) && state.structuredDocuments.length > 0;
  const wantsMerge =
    lower.includes('excel') ||
    lower.includes('xlsx') ||
    lower.includes('táblázat') ||
    lower.includes('hrsz') ||
    lower.includes('merge') ||
    lower.includes('összefésül');
  const wantsCoupon = lower.includes('kupon') || lower.includes('coupon') || lower.includes('shop') || lower.includes('bolt');

  if ((wantsMerge || hasStructured) && wantsCoupon) {
    const mergeCap = candidates.find(c => c.id === 'merge-tables');
    const impiCap = candidates.find(c => c.id.startsWith('impi-'));
    if (mergeCap && impiCap) {
      return { selected: mergeCap, chain: ['merge-tables', impiCap.id] };
    }
  }
  if (wantsMerge || hasStructured) {
    const mergeCap = candidates.find(c => c.id === 'merge-tables');
    if (mergeCap) return { selected: mergeCap };
  }
  const impiCap = candidates.find(c => c.id.startsWith('impi-'));
  const heuristicPick = impiCap ?? candidates[0];

  // Ha több jelölt van, próbáljunk prompt alapú tie-breaket (ha engedélyezett)
  if (candidates.length > 1) {
    const promptPick = await selectCapabilityWithPrompt(candidates, state);
    if (promptPick) {
      const hit = candidates.find(c => c.id === promptPick);
      if (hit) return { selected: hit };
    }
  }

  return { selected: heuristicPick };
}
