import type { CoreAgentState } from '../state.js';
import { recommendCoupons } from '@apps/ai-agent-core/src/impi/recommend.js';

export async function recommendationNode(state: CoreAgentState): Promise<Partial<CoreAgentState>> {
  const logs = [...(state.logs ?? [])];
  if (state.recommendations) {
    logs.push('recommendation: skip (előre kitöltve)');
    return { logs };
  }
  if (!state.userMessage?.trim()) {
    logs.push('recommendation: nincs felhasználói üzenet');
    return { logs };
  }
  try {
    const response = await recommendCoupons({
      query: state.userMessage,
      limit: 3,
      ngo_preference: undefined,
      skip_category_match: false,
    } as any);
    const insightBlock = buildDocumentInsightSummary(state.documentInsights ?? []);
    if (insightBlock) {
      response.summary = response.summary ? `${response.summary}\n\n📄 Dokumentumok: ${insightBlock}` : `📄 Dokumentumok: ${insightBlock}`;
    }
    logs.push('recommendation: ajánlatlista kész');
    return { recommendations: response, logs };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ismeretlen hiba';
    logs.push(`recommendation: hiba – ${message}`);
    return { fallbackReason: 'recommendation_error', logs };
  }
}

function buildDocumentInsightSummary(insights: CoreAgentState['documentInsights']): string | undefined {
  if (!insights || !insights.length) {
    return undefined;
  }
  const parts = insights.slice(0, 3).map((insight, index) => `#${index + 1}: ${insight.summary}`);
  return parts.join(' | ');
}
