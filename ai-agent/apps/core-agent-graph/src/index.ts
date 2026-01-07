import { randomUUID } from 'node:crypto';
import { Annotation, StateGraph, END, START, MemorySaver } from '@langchain/langgraph';
import type { CoreAgentState } from './state.js';
import { ingestUserInputNode } from './nodes/ingestUserInputNode.js';
import { visionNode } from './nodes/visionNode.js';
import { graphitiContextNode } from './nodes/graphitiContextNode.js';
import { recommendationNode } from './nodes/recommendationNode.js';
import { responseNode } from './nodes/responseNode.js';
import { fallbackResponseNode } from './nodes/fallbackResponseNode.js';
import { logNode } from './nodes/logNode.js';
import { documentLoaderNode } from './nodes/documentLoaderNode.js';
import { documentAnalysisNode } from './nodes/documentAnalysisNode.js';
import { capabilityDiscoveryNode } from './nodes/capabilityDiscoveryNode.js';
import { capabilityExecutionNode } from './nodes/capabilityExecutionNode.js';
import { responseAssemblyNode } from './nodes/responseAssemblyNode.js';
import { memoryUpdateNode } from './nodes/memoryUpdateNode.js';
import './capabilities/index.js';

const CoreAgentAnnotation = Annotation.Root({
  sessionId: Annotation<string | undefined>(),
  userMessage: Annotation<string>(),
  topicHint: Annotation<string | undefined>(),
  bannerImageUrl: Annotation<string | undefined>(),
  visionInsights: Annotation<CoreAgentState['visionInsights']>(),
  attachments: Annotation<CoreAgentState['attachments']>(),
  structuredDocuments: Annotation<CoreAgentState['structuredDocuments']>(),
  documentInsights: Annotation<CoreAgentState['documentInsights']>(),
  ingestWarnings: Annotation<CoreAgentState['ingestWarnings']>(),
  memoryRequest: Annotation<CoreAgentState['memoryRequest']>(),
  graphitiContext: Annotation<CoreAgentState['graphitiContext']>(),
  contextSource: Annotation<CoreAgentState['contextSource']>(),
  recommendations: Annotation<CoreAgentState['recommendations']>(),
  contextMetadata: Annotation<CoreAgentState['contextMetadata']>(),
  finalResponse: Annotation<CoreAgentState['finalResponse']>(),
  fallbackReason: Annotation<CoreAgentState['fallbackReason']>(),
  logs: Annotation<string[] | undefined>({
    value: (_prev, next) => next,
    default: () => [],
  }),
  capabilityInput: Annotation<CoreAgentState['capabilityInput']>(),
  capabilityOutput: Annotation<CoreAgentState['capabilityOutput']>(),
  executionTrace: Annotation<CoreAgentState['executionTrace']>({
    value: (_prev, next) => next,
    default: () => [],
  }),
  capabilityChain: Annotation<CoreAgentState['capabilityChain']>(),
  chainIndex: Annotation<CoreAgentState['chainIndex']>(),
  artifacts: Annotation<CoreAgentState['artifacts']>({
    value: (prev, next) => [...(prev ?? []), ...(next ?? [])],
    default: () => [],
  }),
});

const checkpointer = new MemorySaver();

const builder = new StateGraph(CoreAgentAnnotation)
  .addNode('ingest', ingestUserInputNode)
  .addNode('documentLoader', documentLoaderNode)
  .addNode('documentAnalysis', documentAnalysisNode)
  .addNode('vision', visionNode)
  .addNode('graphiti', graphitiContextNode)
  .addNode('capabilityDiscovery', capabilityDiscoveryNode)
  .addNode('capabilityExecution', capabilityExecutionNode)
  .addNode('responseAssembly', responseAssemblyNode)
  .addNode('memoryUpdate', memoryUpdateNode)
  .addNode('recommend', recommendationNode)
  .addNode('response', responseNode)
  .addNode('fallback', fallbackResponseNode)
  .addNode('log', logNode)
  .addEdge(START, 'ingest')
  .addEdge('ingest', 'documentLoader')
  .addEdge('documentLoader', 'documentAnalysis')
  .addEdge('documentAnalysis', 'vision')
  .addEdge('vision', 'graphiti')
  .addConditionalEdges(
    'graphiti',
    (state: CoreAgentState) => (process.env.CORE_CAPABILITY_ROUTING === '1' ? 'capability' : 'legacy'),
    {
      capability: 'capabilityDiscovery',
      legacy: 'recommend',
    },
  )
  .addEdge('capabilityDiscovery', 'capabilityExecution')
  .addConditionalEdges(
    'capabilityExecution',
    (state: CoreAgentState) => {
      const chain = state.capabilityChain;
      const idx = state.chainIndex ?? 0;
      const maxIterations = Number(process.env.CORE_CHAIN_MAX_ITERATIONS || 10);
      if (idx >= maxIterations) {
        return 'done';
      }
      if (Array.isArray(chain) && idx < chain.length) {
        return 'continue';
      }
      return 'done';
    },
    {
      continue: 'capabilityExecution',
      done: 'responseAssembly',
    },
  )
  .addEdge('responseAssembly', 'memoryUpdate')
  .addEdge('memoryUpdate', 'response')
  .addEdge('recommend', 'response')
  .addEdge('response', 'fallback')
  .addEdge('fallback', 'log')
  .addEdge('log', END);

const compiledGraph = builder.compile({ checkpointer });

export async function runCoreAgentPrototype(initialState: CoreAgentState, options?: { threadId?: string }) {
  const seed: CoreAgentState = {
    ...initialState,
    logs: initialState.logs ?? [],
  };
  const threadId = options?.threadId ?? initialState.sessionId ?? randomUUID();
  return compiledGraph.invoke(seed, { configurable: { thread_id: threadId } });
}

export const coreAgentGraph = compiledGraph;
export const coreAgentCheckpointer = checkpointer;
