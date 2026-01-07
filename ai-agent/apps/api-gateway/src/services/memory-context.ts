import fetch from 'node-fetch';
import { buildGraphitiAuthHeaders } from '@apps/shared/graphitiAuth.js';

const GRAPHITI_API_URL = process.env.GRAPHITI_API_URL ?? 'http://localhost:8083';

export interface MemoryContextNode {
  id: string;
  labels?: string[];
  properties?: Record<string, unknown>;
  score?: number;
  score_details?: Record<string, unknown>;
}

export interface MemoryContextRelationship {
  id: string;
  type: string;
  source: string;
  target: string;
  properties?: Record<string, unknown>;
}

export interface MemoryContextRequest {
  userId?: string;
  topic?: string;
  labels?: string[];
  minScore?: number;
}

export interface MemoryContextResponse {
  nodes: MemoryContextNode[];
  relationships: MemoryContextRelationship[];
  generated_at: string;
}

export async function fetchMemoryContext(
  params: MemoryContextRequest,
): Promise<MemoryContextResponse> {
  const response = await fetch(`${GRAPHITI_API_URL}/query`, {
    method: 'POST',
    headers: buildGraphitiAuthHeaders({
      extraHeaders: {
        'Content-Type': 'application/json',
      },
    }),
    body: JSON.stringify({
      graph: 'impactshop_memory',
      query: {
        type: 'hybrid',
        text: params.topic ?? '',
        filters: params.userId
          ? [
              { field: 'user_id', value: params.userId },
              { field: 'session_id', value: params.userId },
              { field: 'conversation_id', value: params.userId },
            ]
          : [],
        labels: params.labels ?? [],
        min_score: params.minScore,
        limit: 60,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Graphiti query failed: ${response.status} ${response.statusText}`);
  }
  const payload: any = await response.json();
  return {
    nodes: payload.nodes ?? [],
    relationships: payload.relationships ?? [],
    generated_at: new Date().toISOString(),
  };
}
