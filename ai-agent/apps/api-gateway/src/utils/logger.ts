export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: 'impi-ai-agent';
  event: string;
  [key: string]: unknown;
}

export function structuredLog(level: LogLevel, event: string, data?: Record<string, unknown>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    service: 'impi-ai-agent',
    event,
    ...data,
  };
  const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  logFn(JSON.stringify(entry));
}
