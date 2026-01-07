import fetch from 'node-fetch';
import type { DocumentInsight } from '../state.js';
import { buildGraphitiAuthHeaders } from '@apps/shared/graphitiAuth.js';

const GRAPHITI_API_URL = process.env.GRAPHITI_API_URL ?? '';

export async function syncDocumentInsightsToGraphiti(params: {
  sessionId?: string;
  userId?: string;
  insights: DocumentInsight[];
}): Promise<void> {
  if (!GRAPHITI_API_URL || !params.sessionId || params.insights.length === 0) {
    return;
  }

  try {
    await fetch(`${GRAPHITI_API_URL}/ingest/document-insights`, {
      method: 'POST',
      headers: buildGraphitiAuthHeaders({
        extraHeaders: {
          'Content-Type': 'application/json',
        },
      }),
      body: JSON.stringify({
        graph: 'impactshop_memory',
        type: 'document_insight',
        session_id: params.sessionId,
        user_id: params.userId,
        insights: params.insights,
      }),
    });
  } catch (error) {
    console.warn('Graphiti document insight sync error', error);
  }
}
