import { eventBus } from '@libs/events/bus';
import { handleTask } from '@libs/task/handlers';
import { updateTaskStatus } from '@libs/db/task-repository';
import { logger } from '@libs/logger';
import { buildDecision } from '@libs/decision';

export function startTaskDispatcher() {
  eventBus.on('task.created', async (task) => {
    logger.info({ taskId: task.id }, 'Dispatcher received task');

    const decision = buildDecision({
      risk: task.payload.riskLevel ?? 'medium',
      confidence: task.payload.confidence,
      expectedTokens: task.payload.expectedTokens,
      maxTokenBudget: task.payload.maxTokenBudget,
      requireHumanForHighRisk: true
    });

    if (decision.humanApprovalRequired) {
      await updateTaskStatus(task.id, 'pending_review');
      logger.warn({ taskId: task.id, risk: task.payload.riskLevel ?? 'medium' }, 'Task set to pending_review – human approval required');
      return;
    }

    await updateTaskStatus(task.id, 'in_progress');
    try {
      await handleTask(task);
      await updateTaskStatus(task.id, 'completed');
    } catch (error) {
      logger.error({ error, taskId: task.id }, 'Task processing failed');
      await updateTaskStatus(task.id, 'failed');
    }
  });
}
