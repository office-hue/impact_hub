import type { TaskRecord } from '@libs/types';
import { logger } from '@libs/logger';
import { runCompletion } from '@libs/openai/client';
import { buildDecision } from '@libs/decision';

async function handleFinancialReport(task: TaskRecord) {
  const prompt = `Készíts rövid pénzügyi összefoglalót a következő adatok alapján: ${JSON.stringify(task.payload)}`;
  const output = await runCompletion(prompt);
  logger.info({ taskId: task.id, output }, 'Financial report generated');
}

async function handleEmailProcessing(task: TaskRecord) {
  const prompt = `Fogalmazz udvarias ügyfélválaszt a következő üzenetre: ${task.payload.content}`;
  const output = await runCompletion(prompt);
  logger.info({ taskId: task.id, output }, 'Email processed');
}

export async function handleTask(task: TaskRecord) {
  // Döntési előszűrés: kockázat/tier/human approval jelzés
  const decision = buildDecision({
    risk: task.payload.riskLevel ?? 'medium',
    confidence: task.payload.confidence,
    expectedTokens: task.payload.expectedTokens,
    maxTokenBudget: task.payload.maxTokenBudget,
    requireHumanForHighRisk: true
  });

  logger.info(
    {
      taskId: task.id,
      type: task.type,
      tier: decision.tier,
      humanApprovalRequired: decision.humanApprovalRequired,
      degradedForBudget: decision.degradedForBudget
    },
    'Handling task with decision plan'
  );

  if (decision.humanApprovalRequired) {
    logger.warn({ taskId: task.id, risk: task.payload.riskLevel ?? 'medium' }, 'Human approval recommended before execution');
    // A tényleges jóváhagyási workflow később illeszthető; itt csak logolunk.
  }

  switch (task.type) {
    case 'financial_report':
      await handleFinancialReport(task);
      break;
    case 'email_processing':
      await handleEmailProcessing(task);
      break;
    default:
      logger.info({ taskId: task.id }, 'No-op handler for task type');
  }
}
