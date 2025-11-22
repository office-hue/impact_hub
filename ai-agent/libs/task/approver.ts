import { getTaskById, updateTaskStatus } from '@libs/db/task-repository';
import { handleTask } from '@libs/task/handlers';
import { logger } from '@libs/logger';

/**
 * Jóváhagyja a pending_review státuszú feladatot és lefuttatja a handlert.
 * Visszatér: true ha sikerült, false ha nem volt pending_review vagy nem létezett.
 */
export async function approveTask(taskId: string): Promise<boolean> {
  const task = await getTaskById(taskId);
  if (!task) {
    return false;
  }
  if (task.status !== 'pending_review') {
    return false;
  }

  await updateTaskStatus(taskId, 'in_progress');
  try {
    await handleTask(task);
    await updateTaskStatus(taskId, 'completed');
    return true;
  } catch (error) {
    logger.error({ error, taskId }, 'Approved task failed during processing');
    await updateTaskStatus(taskId, 'failed');
    return false;
  }
}
