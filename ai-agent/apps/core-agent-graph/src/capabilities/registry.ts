import type { CoreAgentState } from '../state.js';
import type { CapabilityManifest } from './types.js';
import { getCapabilityStats } from '../utils/capabilityStats.js';

const registry = new Map<string, CapabilityManifest<any, any>>();

function hashSession(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export function registerCapability(manifest: CapabilityManifest<any, any>): void {
  const baseId = manifest.id;
  if (manifest.version) {
    registry.set(`${baseId}@${manifest.version}`, manifest);
    // Ha nincs default alias, tegyük be
    if (!registry.has(baseId) || manifest.rolloutPercentage === 100) {
      registry.set(baseId, manifest);
    }
  } else {
    registry.set(baseId, manifest);
  }
}

export function getCapability(id: string): CapabilityManifest<any, any> | undefined {
  return registry.get(id);
}

export function listCapabilities(): CapabilityManifest<any, any>[] {
  return Array.from(registry.values());
}

export function discoverCapabilities(query: string, context: CoreAgentState): CapabilityManifest<any, any>[] {
  const all = listCapabilities();
  const q = (query || '').toLowerCase();

  // Query-based gyors szűrés (legkisebb költség)
  const wantsMerge =
    q.includes('excel') || q.includes('xlsx') || q.includes('csv') || q.includes('táblázat') || q.includes('merge');
  const wantsCoupon = q.includes('kupon') || q.includes('coupon') || q.includes('shop') || q.includes('bolt');

  if (wantsMerge) {
    const mergeCaps = all.filter(cap => cap.id === 'merge-tables' || cap.tags?.includes('merge'));
    if (mergeCaps.length) return mergeCaps;
  }
  if (wantsCoupon) {
    const couponCaps = all.filter(cap => cap.id.startsWith('impi-') || cap.tags?.includes('coupons'));
    if (couponCaps.length) return couponCaps;
  }

  // Attachment-based filtering: ha van strukturált doksi, prefer merge/document tag.
  if (Array.isArray(context.structuredDocuments) && context.structuredDocuments.length) {
    const docCaps = all.filter(cap => cap.tags?.includes('documents') || cap.tags?.includes('merge'));
    if (docCaps.length) return docCaps;
  }

  // Graphiti context-alapú preference (capability_preference node/property)
  if (context.graphitiContext?.nodes?.length) {
    const preferredIds = new Set<string>();
    for (const node of context.graphitiContext.nodes) {
      const labels = (node as any).labels || [];
      const props = (node as any).properties || {};
      if (labels.includes('capability_preference') && typeof props.capability_id === 'string') {
        preferredIds.add(props.capability_id);
      }
      if (labels.includes('Capability') && typeof props.id === 'string' && props.preferred === true) {
        preferredIds.add(props.id);
      }
    }
    if (preferredIds.size) {
      const preferred = all.filter(cap => preferredIds.has(cap.id));
      if (preferred.length) return preferred;
    }
  }

  // Fallback: minden capability
  return all;
}

export async function getEffectivePriority(capabilityId: string, basePriority = 5): Promise<number> {
  try {
    const stats: any = await getCapabilityStats(capabilityId);
    if (!stats || !stats.invocations) return basePriority;
    const successRate = stats.success ? stats.success / stats.invocations : 0;
    const boost = Math.floor(Math.min(Math.max(successRate, 0), 1) * 3); // 0-3 pont boost
    return basePriority + boost;
  } catch {
    return basePriority;
  }
}

export function resolveCapability(id: string, sessionId?: string): CapabilityManifest<any, any> | undefined {
  // Rollout: ha létezik verziózott változat rolloutPercenttel, használjuk session hash-et a bucketeléshez.
  const versioned = Array.from(registry.entries()).filter(([key]) => key.startsWith(`${id}@`));
  if (versioned.length && sessionId) {
    const bucket = Math.abs(hashSession(sessionId)) % 100;
    const selected = versioned.find(([_, manifest]) => manifest.rolloutPercentage && bucket < manifest.rolloutPercentage);
    if (selected) return selected[1];
  }
  return registry.get(id);
}
