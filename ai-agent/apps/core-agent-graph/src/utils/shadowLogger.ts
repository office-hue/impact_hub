import fs from 'node:fs';
import path from 'node:path';

const LOG_DIR = process.env.CORE_CAPABILITY_LOG_DIR || path.resolve(process.cwd(), '.codex/logs');
const LOG_FILE = path.join(LOG_DIR, 'core-capability-shadow.log');
const MAX_ENTRY_LEN = 1024; // 1 KB
const MAX_FILE_SIZE = 512 * 1024; // 512 KB

function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return '[unserializable]';
  }
}

function ensureLogDir(): void {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (err) {
    // swallow
  }
}

export function logShadow(entry: Record<string, unknown>): void {
  ensureLogDir();
  const payload = {
    ts: new Date().toISOString(),
    ...entry,
  };
  let line = safeStringify(payload);
  if (line.length > MAX_ENTRY_LEN) {
    line = line.slice(0, MAX_ENTRY_LEN) + '...';
  }
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
    const stats = fs.statSync(LOG_FILE);
    if (stats.size > MAX_FILE_SIZE) {
      // truncate from start: keep last ~256 KB
      const data = fs.readFileSync(LOG_FILE, 'utf8');
      const tail = data.slice(-256 * 1024);
      fs.writeFileSync(LOG_FILE, tail);
    }
  } catch {
    // swallow logging errors
  }
}
