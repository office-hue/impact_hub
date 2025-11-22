import { EventEmitter } from 'node:events';
import type { TaskRecord } from '@libs/types';

export type TaskEvents = {
  'task.created': (task: TaskRecord) => void;
  'task.updated': (task: TaskRecord) => void;
};

class TypedEventBus extends EventEmitter {
  emit<EventKey extends keyof TaskEvents>(event: EventKey, payload: Parameters<TaskEvents[EventKey]>[0]): boolean {
    return super.emit(event, payload);
  }

  on<EventKey extends keyof TaskEvents>(event: EventKey, listener: TaskEvents[EventKey]): this {
    return super.on(event, listener);
  }
}

export const eventBus = new TypedEventBus();
