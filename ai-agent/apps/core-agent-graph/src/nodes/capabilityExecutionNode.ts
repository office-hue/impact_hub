import type { CoreAgentState } from '../state.js';
import { getCapability, resolveCapability } from '../capabilities/registry.js';
import { recordCapabilityMetric } from '../utils/metrics.js';

export async function capabilityExecutionNode(state: CoreAgentState): Promise<Partial<CoreAgentState>> {
  const logs = [...(state.logs ?? [])];
  const routingEnabled = process.env.CORE_CAPABILITY_ROUTING === '1';

  if (!routingEnabled) {
    logs.push('capabilityExecution: routing disabled');
    return { logs };
  }

  if (!state.capabilityInput || typeof state.capabilityInput !== 'object') {
    logs.push('capabilityExecution: skip (nincs capabilityInput)');
    return { logs };
  }

  const capabilityId = (state.capabilityInput as any).id;
  if (!capabilityId || typeof capabilityId !== 'string') {
    logs.push('capabilityExecution: skip (hiányzó id)');
    return { logs };
  }

  const chain = state.capabilityChain;
  const startIndex = state.chainIndex ?? 0;

  function adaptChainInput(prevOutput: unknown, nextCapId: string, originalState: CoreAgentState): unknown {
    if (nextCapId.startsWith('impi-') && prevOutput && typeof prevOutput === 'object') {
      return {
        id: nextCapId,
        query: originalState.userMessage,
      };
    }
    if (nextCapId.startsWith('ads-') && prevOutput && typeof prevOutput === 'object') {
      return {
        id: nextCapId,
        ...(prevOutput as Record<string, unknown>),
      };
    }
    if (prevOutput && typeof prevOutput === 'object' && (prevOutput as any).id) {
      return prevOutput;
    }
    return { id: nextCapId, input: prevOutput };
  }

  // Helper: futtat egy capability-t adott inputtal és contexttel
  async function runOnce(capId: string, input: unknown): Promise<{ output?: unknown; trace: any }> {
    const cap = resolveCapability(capId, state.sessionId) ?? getCapability(capId);
    if (!cap) {
      logs.push(`capabilityExecution: capability nem található (${capId})`);
      return { trace: null };
    }
    const capTimeout = Number(process.env.CORE_CAPABILITY_TIMEOUT_MS || 15000);
    const startedInner = Date.now();
    try {
      const output = await Promise.race([
        cap.invoke(input as any, state),
        new Promise((_, reject) => setTimeout(() => reject(new Error('capability_timeout')), capTimeout)),
      ]);
      logs.push(`capabilityExecution: ${capId} success`);
      recordCapabilityMetric(capId, 'success', Date.now() - startedInner);
      return {
        output,
        trace: {
          capability: capId,
          input,
          output,
          status: 'success' as const,
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ismeretlen hiba';
      recordCapabilityMetric(capId, 'error', Date.now() - startedInner);
      logs.push(`capabilityExecution: ${capId} error – ${message}`);
      return {
        trace: {
          capability: capId,
          input,
          status: 'error' as const,
          errorMessage: message,
          timestamp: Date.now(),
        },
      };
    }
  }

  // Chain végrehajtás
  if (Array.isArray(chain) && chain.length) {
    let currentOutput: unknown = state.capabilityOutput;
    const newTrace = [...(state.executionTrace ?? [])];
    let idx = startIndex;
    while (idx < chain.length) {
      const currentId = chain[idx];
      const currentInput = idx === startIndex ? state.capabilityInput : adaptChainInput(currentOutput, currentId, state);
      const result = await runOnce(currentId, currentInput);
      if (result.trace) {
        newTrace.push(result.trace);
      }
      currentOutput = result.output;
      idx += 1;
    }
    return {
      logs,
      capabilityOutput: currentOutput,
      executionTrace: newTrace,
      chainIndex: idx,
    };
  }
  const result = await runOnce(capabilityId, state.capabilityInput);
  if (!result.trace) {
    return { logs };
  }
  const trace = [...(state.executionTrace ?? []), result.trace];
  return { logs, capabilityOutput: result.output, executionTrace: trace };
}
