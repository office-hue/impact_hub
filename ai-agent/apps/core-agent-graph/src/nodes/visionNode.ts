import type { CoreAgentState } from '../state.js';
import { analyzeBannerImage } from '@apps/api-gateway/src/services/vision-client.js';

export async function visionNode(state: CoreAgentState): Promise<Partial<CoreAgentState>> {
  const logs = [...(state.logs ?? [])];
  const targetUrl = state.bannerImageUrl?.trim();
  if (!targetUrl) {
    logs.push('vision: kihagyva (nincs bannerImageUrl)');
    return { logs };
  }

  try {
    const insights = await analyzeBannerImage({ imageUrl: targetUrl });
    const preview = insights.textBlocks.slice(0, 2).join(' | ') || 'nincs szöveg';
    logs.push(`vision (${insights.provider}): sikeres detektálás (${preview})`);
    return {
      visionInsights: insights,
      logs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ismeretlen hiba';
    logs.push(`vision: hiba – ${message}`);
    return { logs };
  }
}
