import { searchCSE } from '@libs/search/cse';
import { createNewTask, listOpenTasks } from '@libs/task/task-adapter';
import type { TaskStatus, TaskType } from '@libs/types';

type CommandContext = {
  userId: string;
};

type CommandHandler = (args: string, ctx: CommandContext) => Promise<string>;

const registry = new Map<string, CommandHandler>();

export function registerCommand(name: string, handler: CommandHandler) {
  registry.set(name.toLowerCase(), handler);
}

export async function handleCommand(input: string, ctx: CommandContext): Promise<string> {
  const [cmd, ...rest] = input.trim().split(/\s+/);
  const handler = registry.get(cmd.toLowerCase());
  if (!handler) return 'Ismeretlen parancs';
  return handler(rest.join(' '), ctx);
}

// Alap parancsok
registerCommand('/keres', async (args, _ctx) => {
  if (!args) return 'Adj meg keresőkifejezést: /keres <szöveg>';
  const results = await searchCSE(args, { num: 3 });
  if (!results.length) return 'Nincs találat.';
  return results.map((r, idx) => `${idx + 1}. ${r.title} – ${r.link}`).join('\n');
});

registerCommand('/task-new', async (args, ctx) => {
  if (!args) return 'Használat: /task-new <task_type> <leírás>';
  const [type, ...payloadParts] = args.split(' ');
  const payload = { description: payloadParts.join(' ') };
  const task = await createNewTask({
    userId: ctx.userId,
    type: type as TaskType,
    payload,
  });
  return `Feladat létrehozva: #${task.id}`;
});

registerCommand('/task-list', async (args, _ctx) => {
  const status = (args as TaskStatus) || undefined;
  const tasks = await listOpenTasks(status);
  if (!tasks.length) return 'Nincs feladat.';
  return tasks
    .map((t) => `#${t.id} [${t.status}] ${t.type} – ${t.payload?.description ?? ''}`)
    .join('\n');
});
