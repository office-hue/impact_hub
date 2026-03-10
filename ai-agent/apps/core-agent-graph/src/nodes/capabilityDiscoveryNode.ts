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
      : selected.id === 'legal-legislation-lookup' || selected.id === 'tax-checklist-hu'
      ? { id: selected.id, query: state.userMessage, reference_date: undefined }
      : selected.id === 'financial-chart-builder'
      ? { id: selected.id, query: state.userMessage, documents: state.structuredDocuments }
      : { id: selected.id, query: state.userMessage };

  const heuristic = capabilityInput.id === 'merge-tables'
    ? 'merge'
    : capabilityInput.id.startsWith('legal-') || capabilityInput.id.startsWith('tax-')
    ? 'legal'
    : capabilityInput.id === 'financial-chart-builder'
    ? 'financial-chart'
    : 'default';
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
  const wantsAds =
    lower.includes('hirdetés') ||
    lower.includes('hirdetes') ||
    lower.includes('ads') ||
    lower.includes('kampány') ||
    lower.includes('kampany') ||
    lower.includes('target') ||
    lower.includes('targetál') ||
    lower.includes('targetal') ||
    lower.includes('remarketing') ||
    lower.includes('konverzió') ||
    lower.includes('konverzio') ||
    lower.includes('capi') ||
    lower.includes('google ads') ||
    lower.includes('facebook') ||
    lower.includes('tiktok') ||
    lower.includes('youtube');
  const wantsFinancialChart =
    lower.includes('chart') ||
    lower.includes('grafikon') ||
    lower.includes('diagram') ||
    lower.includes('kimutatás') ||
    lower.includes('trend') ||
    lower.includes('bevétel') ||
    lower.includes('bevetel') ||
    lower.includes('költség') ||
    lower.includes('koltseg') ||
    lower.includes('forgalom') ||
    lower.includes('profit') ||
    lower.includes('pénzügyi') ||
    lower.includes('penzugyi') ||
    lower.includes('cashflow');

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

  if (wantsAds) {
    const ingestCap = candidates.find(c => c.id === 'ads-event-ingest');
    const decisionCap = candidates.find(c => c.id === 'ads-decision');
    const executeCap = candidates.find(c => c.id === 'ads-execute');
    if (ingestCap && decisionCap && executeCap) {
      return { selected: ingestCap, chain: [ingestCap.id, decisionCap.id, executeCap.id] };
    }
    if (decisionCap && executeCap) {
      return { selected: decisionCap, chain: [decisionCap.id, executeCap.id] };
    }
    if (decisionCap) return { selected: decisionCap };
    if (executeCap) return { selected: executeCap };
  }
  if (wantsFinancialChart) {
    const chartCap = candidates.find(c => c.id === 'financial-chart-builder');
    if (chartCap) return { selected: chartCap };
  }

  // Jogi / jogszabály jellegű kérések
  const wantsLegal =
    lower.includes('jogszabály') ||
    lower.includes('jogszabaly') ||
    lower.includes('törvény') ||
    lower.includes('torveny') ||
    lower.includes('rendelet') ||
    lower.includes('hatályos') ||
    lower.includes('hatalyos') ||
    lower.includes('ptk') ||
    lower.includes('btk') ||
    lower.includes('jogi') ||
    lower.includes('szerződés') ||
    lower.includes('szerzodes') ||
    lower.includes('felelősség') ||
    lower.includes('fellebbez') ||
    lower.includes('jogorvoslat') ||
    lower.includes('§') ||
    lower.includes('njt') ||
    lower.includes('jogtar');

  const wantsTax =
    lower.includes('adó') ||
    lower.includes('ado') ||
    lower.includes('áfa') ||
    lower.includes('afa') ||
    lower.includes('szja') ||
    lower.includes('tao') ||
    lower.includes('kata') ||
    lower.includes('kiva') ||
    lower.includes('szocho') ||
    lower.includes('járulék') ||
    lower.includes('jarulek') ||
    lower.includes('bevallás') ||
    lower.includes('bevallas') ||
    lower.includes('illeték') ||
    lower.includes('illetek') ||
    lower.includes('helyi adó') ||
    lower.includes('helyi ado') ||
    lower.includes('számvitel') ||
    lower.includes('szamvitel') ||
    lower.includes('könyvelés') ||
    lower.includes('konyveles');

  if (wantsTax) {
    const taxCap = candidates.find(c => c.id === 'tax-checklist-hu');
    const legalCap = candidates.find(c => c.id === 'legal-legislation-lookup');
    // Ha adó + jogi is kell → chain: tax → legal (jogszabályellenőrzés)
    if (taxCap && legalCap && wantsLegal) {
      return { selected: taxCap, chain: [taxCap.id, legalCap.id] };
    }
    if (taxCap) return { selected: taxCap };
  }

  if (wantsLegal) {
    const legalCap = candidates.find(c => c.id === 'legal-legislation-lookup');
    if (legalCap) return { selected: legalCap };
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
