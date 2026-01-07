import type { CoreAgentState } from '../state.js';

export interface CapabilityManifest<Input = unknown, Output = unknown> {
  id: string;
  version?: string;
  rolloutPercentage?: number;
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  invoke: (input: Input, context: CoreAgentState) => Promise<Output>;
  tags?: string[];
  priority?: number;
}
