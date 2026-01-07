type InteractionPayload = {
  sessionId?: string;
  userId?: string;
  userMessage?: string;
  capability?: string;
  success?: boolean;
  timestamp?: number;
};

const queue: InteractionPayload[] = [];
let timer: NodeJS.Timeout | null = null;
const MAX_RETRIES = 3;
const deadLetterQueue: InteractionPayload[] = [];

async function flushBatch(retryCount = 0): Promise<void> {
  const url = process.env.GRAPHITI_API_URL;
  if (!url || !queue.length) return;
  const batch = queue.splice(0, queue.length);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.GRAPHITI_API_KEY) {
    headers['Authorization'] = `Bearer ${process.env.GRAPHITI_API_KEY}`;
  }
  const body = {
    graph: 'impactshop_memory',
    interactions: batch.map(item => ({
      type: 'capability_interaction',
      session_id: item.sessionId,
      user_id: item.userId,
      user_message: item.userMessage,
      capability: item.capability,
      success: item.success,
      timestamp: item.timestamp ?? Date.now(),
    })),
  };
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/ingest/capability-interaction`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      if (retryCount < MAX_RETRIES) {
        queue.unshift(...batch);
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        return flushBatch(retryCount + 1);
      }
      deadLetterQueue.push(...batch);
      console.warn(`[graphitiInteraction] store failed (${response.status}), moved ${batch.length} items to DLQ`);
    }
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      queue.unshift(...batch);
      await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
      return flushBatch(retryCount + 1);
    }
    deadLetterQueue.push(...batch);
    console.warn('[graphitiInteraction] store failed after retries', error);
  }
}

export async function storeInteractionInGraphiti(payload: InteractionPayload): Promise<void> {
  const url = process.env.GRAPHITI_API_URL;
  if (!url || !payload.sessionId || !payload.capability) return;

  const batchMode = process.env.GRAPHITI_BATCH_MODE === '1';
  if (!batchMode) {
    queue.push(payload);
    await flushBatch();
    return;
  }

  queue.push(payload);
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    await flushBatch();
  }, 5000);
}

export function getDeadLetterQueueSize(): number {
  return deadLetterQueue.length;
}
