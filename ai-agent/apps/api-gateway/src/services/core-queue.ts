import { Queue } from 'bullmq';
import { normalizeJobType, type CoreJobType } from '@apps/core-worker/src/job-types.js';

const connectionUrl = process.env.CORE_QUEUE_REDIS_URL || process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const queueName = process.env.CORE_QUEUE_NAME || 'core_tasks';

let queue: Queue | null = null;

function getQueue(): Queue {
  if (!queue) {
    queue = new Queue(queueName, { connection: { url: connectionUrl } });
  }
  return queue;
}

export interface QueuePayload {
  taskId: string;
  workspaceId: string;
  templateId?: string;
  driveFileId?: string;
  createdBy: string;
  jobType?: CoreJobType | string | null;
  params?: Record<string, unknown> | null;
}

export async function enqueueCoreTask(payload: QueuePayload): Promise<void> {
  const q = getQueue();
  const normalizedJobType = normalizeJobType(payload.jobType ?? undefined);
  await q.add('core-task', { ...payload, jobType: normalizedJobType }, {
    attempts: 3,
    removeOnComplete: true,
    removeOnFail: false,
  });
}
