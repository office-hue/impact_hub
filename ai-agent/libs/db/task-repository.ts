import { randomUUID } from 'node:crypto';
import { getPool } from '@libs/db/pool';
import { eventBus } from '@libs/events/bus';
import type { TaskPayload, TaskRecord, TaskStatus, TaskType } from '@libs/types';
import { logger } from '@libs/logger';

const memoryStore = new Map<string, TaskRecord>();

function getMemoryTasks() {
  return Array.from(memoryStore.values());
}

interface CreateTaskInput {
  userId: string;
  type: TaskType;
  payload: TaskPayload;
  priority?: number;
}

export async function getTaskById(taskId: string): Promise<TaskRecord | null> {
  const pool = getPool();
  if (!pool) {
    return memoryStore.get(taskId) ?? null;
  }
  const res = await pool.query(`SELECT * FROM tasks WHERE id = $1 LIMIT 1`, [taskId]);
  if (!res.rows?.length) return null;
  return mapRow(res.rows[0]);
}

export async function createTask(input: CreateTaskInput): Promise<TaskRecord> {
  const task: TaskRecord = {
    id: randomUUID(),
    type: input.type,
    payload: input.payload,
    priority: input.priority ?? 5,
    status: 'pending',
    userId: input.userId,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const pool = getPool();
  if (!pool) {
    memoryStore.set(task.id, task);
  } else {
    await pool.query(
      `INSERT INTO tasks (id, user_id, type, status, payload, priority, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [task.id, task.userId, task.type, task.status, task.payload, task.priority, task.createdAt, task.updatedAt]
    );
  }
  eventBus.emit('task.created', task);
  logger.info({ taskId: task.id }, 'Task created');
  return task;
}

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<TaskRecord | null> {
  const pool = getPool();
  if (!pool) {
    const task = memoryStore.get(taskId);
    if (!task) return null;
    const updated: TaskRecord = { ...task, status, updatedAt: new Date() };
    memoryStore.set(taskId, updated);
    eventBus.emit('task.updated', updated);
    return updated;
  }
  const result = await pool.query(
    `UPDATE tasks SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [taskId, status]
  );
  const updated = mapRow(result.rows[0]);
  if (updated) {
    eventBus.emit('task.updated', updated);
  }
  return updated;
}

export async function getPendingTasks(limit = 10): Promise<TaskRecord[]> {
  const pool = getPool();
  if (!pool) {
    return getMemoryTasks().filter((task) => task.status === 'pending').slice(0, limit);
  }
  const result = await pool.query(
    `SELECT * FROM tasks WHERE status = 'pending' ORDER BY priority DESC, created_at ASC LIMIT $1`,
    [limit]
  );
  return result.rows.map(mapRow).filter(Boolean) as TaskRecord[];
}

export async function listTasks(status?: TaskStatus): Promise<TaskRecord[]> {
  const pool = getPool();
  if (!pool) {
    return getMemoryTasks().filter((task) => (status ? task.status === status : true));
  }
  const whereClause = status ? `WHERE status = $1` : '';
  const params = status ? [status] : [];
  const result = await pool.query(
    `SELECT * FROM tasks ${whereClause} ORDER BY created_at DESC LIMIT 50`,
    params
  );
  return result.rows.map(mapRow).filter(Boolean) as TaskRecord[];
}

function mapRow(row?: Record<string, unknown>): TaskRecord | null {
  if (!row) return null;
  return {
    id: row.id as string,
    type: row.type as TaskType,
    status: row.status as TaskStatus,
    payload: row.payload as TaskPayload,
    priority: Number(row.priority ?? 5),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    userId: row.user_id as string
  };
}
