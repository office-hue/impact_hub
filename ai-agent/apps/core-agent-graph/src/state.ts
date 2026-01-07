import type { MemoryContextResponse } from '@apps/api-gateway/src/services/memory-context.js';
import type { VisionInsights } from '@apps/api-gateway/src/services/vision-client.js';
import type { OfferContextMetadata, RecommendationResponse } from '@apps/ai-agent-core/src/impi/recommend.js';

export interface DocumentAttachment {
  url?: string;
  mimeType?: string;
  name?: string;
  size?: number;
  checksum?: string;
  ingestPath?: string;
  kind?: 'excel' | 'pdf' | 'unknown';
}

export interface StructuredDocument {
  attachment: DocumentAttachment;
  sheets?: Array<{
    name: string;
    rows: number;
    columns: number;
    sampleRows?: unknown[][];
    data?: unknown[][]; // teljes táblázat a későbbi merge/export lépésekhez
  }>;
  tables?: Array<{ id: string; rows: number; columns: number; previewRows?: string[][] }>;
  textPreview?: string[];
  warnings?: string[];
}

export interface DocumentInsight {
  summary: string;
  references?: string[];
}

export interface Artifact {
  type: 'text' | 'image' | 'file' | 'link' | 'data' | 'structured';
  url?: string;
  label?: string;
  mimeType?: string;
  filename?: string;
  downloadUrl?: string;
  content?: unknown;
  metadata?: Record<string, unknown>;
}

export interface ExecutionStep {
  capability: string;
  input: unknown;
  output?: unknown;
  status: 'success' | 'error';
  errorMessage?: string;
  timestamp: number;
}

export interface CoreAgentState {
  sessionId?: string;
  userMessage: string;
  topicHint?: string;
  bannerImageUrl?: string;
  visionInsights?: VisionInsights | null;
  attachments?: DocumentAttachment[];
  structuredDocuments?: StructuredDocument[];
  documentInsights?: DocumentInsight[];
  ingestWarnings?: string[];
  memoryRequest?: {
    userId?: string;
    topic?: string;
  };
  graphitiContext?: MemoryContextResponse | null;
  contextSource?: 'live' | 'stub';
  /** @deprecated Use artifacts instead. Planned removal: 2026-Q2. */
  recommendations?: RecommendationResponse | null;
  /** @deprecated Use artifacts instead. Planned removal: 2026-Q2. */
  contextMetadata?: OfferContextMetadata[] | null;
  finalResponse?: string | null;
  fallbackReason?: string | null;
  logs?: string[];
  capabilityInput?: unknown;
  capabilityOutput?: unknown;
  executionTrace?: ExecutionStep[];
  capabilityChain?: string[];
  chainIndex?: number;
  artifacts?: Artifact[];
  observability?: {
    source?: string;
    startedAt?: number;
    extra?: Record<string, unknown>;
  };
}
