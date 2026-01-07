import assert from 'node:assert/strict';
import { discoverCapabilities, getCapability, listCapabilities } from '../apps/core-agent-graph/src/capabilities/registry.js';
import '../apps/core-agent-graph/src/capabilities/index.js';
import { capabilityDiscoveryNode } from '../apps/core-agent-graph/src/nodes/capabilityDiscoveryNode.js';
import { capabilityExecutionNode } from '../apps/core-agent-graph/src/nodes/capabilityExecutionNode.js';
import { responseAssemblyNode } from '../apps/core-agent-graph/src/nodes/responseAssemblyNode.js';

async function run() {
  process.env.CORE_CAPABILITY_ROUTING = '1';
  const caps = listCapabilities();
  assert.ok(caps.length >= 2, 'registry should contain default capabilities');
  assert.ok(getCapability('impi-coupon-search'), 'impi capability registered');
  assert.ok(getCapability('merge-tables'), 'merge-tables capability registered');

  const baseState = { userMessage: 'teszt', logs: [] as string[] };
  const discovery = await capabilityDiscoveryNode(baseState as any);
  assert.ok(Array.isArray(discovery.logs), 'discovery should return logs');
  assert.ok(discovery.logs?.some(line => line.includes('capabilityDiscovery')), 'discovery logs shadow message');
  assert.ok(discovery.capabilityInput?.id, 'discovery should set capabilityInput when routing enabled');

  const execution = await capabilityExecutionNode({
    ...baseState,
    capabilityInput: { id: 'impi-coupon-search', query: baseState.userMessage },
  } as any);
  assert.ok(execution.logs?.some(line => line.includes('capabilityExecution')), 'execution logs shadow message');

  const assembly = await responseAssemblyNode({
    ...baseState,
    capabilityOutput: { ok: true },
  } as any);
  assert.ok(assembly.logs?.some(line => line.includes('responseAssembly')), 'response assembly logs message');
  assert.ok(
    assembly.finalResponse === undefined || typeof assembly.finalResponse === 'string',
    'response assembly returns string when routing enabled, undefined otherwise',
  );

  // Ha skip státusz, ne írja felül a finalResponse-t
  const skipAssembly = await responseAssemblyNode({
    ...baseState,
    finalResponse: 'keep-original',
    capabilityOutput: { status: 'skipped' },
  } as any);
  assert.equal(skipAssembly.finalResponse, 'keep-original', 'skip status should not override finalResponse');

  // Heurisztika: merge kulcsszóra a merge-tables legyen az elsődleges választás
  const mergePick = await capabilityDiscoveryNode({ userMessage: 'hrsz excel merge', logs: [] } as any);
  assert.ok(mergePick.capabilityInput?.id === 'merge-tables', `merge heuristic should select merge-tables, got: ${mergePick.capabilityInput?.id}`);

  console.log('core-capabilities.test.ts: OK');
}

run();
