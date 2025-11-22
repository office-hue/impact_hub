import { createTask, listTasks, updateTaskStatus, getTaskById } from '@libs/db/task-repository';
import type { Task, TaskStatus, TaskType } from '@libs/types';
import { eventBus } from '@libs/events/bus';

export type NewTaskInput = {
  userId: string;
  type: TaskType;
  payload: Record<string, unknown>;
  priority?: number;
};

export async function createNewTask(input: NewTaskInput): Promise<Task> {
  const task = await createTask({
    userId: input.userId,
    type: input.type,
    payload: input.payload,
    priority: input.priority,
  });
  // manuális emit, ha szükséges
  eventBus.emit('task.created', task);
  return task;
}

export async function listOpenTasks(status?: TaskStatus): Promise<Task[]> {
  return listTasks(status);
}

export async function markTaskStatus(id: string, status: TaskStatus): Promise<void> {
  await updateTaskStatus(id, status);
}

export async function getTask(id: string): Promise<Task | null> {
  return getTaskById(id);
}
