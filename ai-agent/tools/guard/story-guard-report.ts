import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import readline from 'readline';

const DEFAULT_LOG_PATH = process.env.IMPI_CHAT_LOG || path.join(process.cwd(), 'tmp', 'logs', 'impi-chat.log');
const DEFAULT_OUTPUT_PATH = process.env.STORY_GUARD_LOG || path.join(process.cwd(), '..', '.codex', 'logs', 'story-guard.log');
const WINDOW_HOURS = Number(process.env.STORY_GUARD_WINDOW_HOURS || 24);

const EXPECTED_EVENTS = [
  'story_shopping_step1',
  'story_shopping_step2',
  'story_transparency_step1',
  'story_transparency_step2',
  'story_transparency_step3',
] as const;

type StoryEvent = typeof EXPECTED_EVENTS[number];

type EventStat = {
  count: number;
  lastTimestamp?: string;
  sessions: Set<string>;
};

type ReportLine = {
  timestamp: string;
  event: StoryEvent;
  session_id?: string;
  intent?: string;
};

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectEvents(
  logPath: string,
  windowHours: number,
): Promise<{ stats: Map<StoryEvent, EventStat>; lines: ReportLine[]; total: number }> {
  const stats = new Map<StoryEvent, EventStat>();
  const lines: ReportLine[] = [];
  const cutoff = Date.now() - windowHours * 60 * 60 * 1000;
  EXPECTED_EVENTS.forEach(event => {
    stats.set(event, { count: 0, sessions: new Set() });
  });
  if (!(await fileExists(logPath))) {
    return { stats, lines, total: 0 };
  }
  const stream = fs.createReadStream(logPath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let total = 0;
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx === -1) {
      continue;
    }
    const timestampStr = trimmed.slice(0, spaceIdx);
    const epochMs = Date.parse(timestampStr);
    if (Number.isNaN(epochMs) || epochMs < cutoff) {
      continue;
    }
    const payloadRaw = trimmed.slice(spaceIdx + 1);
    try {
      const payload = JSON.parse(payloadRaw);
      const event = payload.story_event as StoryEvent | undefined;
      if (event && stats.has(event)) {
        total += 1;
        const stat = stats.get(event)!;
        stat.count += 1;
        stat.lastTimestamp = new Date(epochMs).toISOString();
        if (payload.session_id) {
          stat.sessions.add(String(payload.session_id));
        }
        lines.push({
          timestamp: new Date(epochMs).toISOString(),
          event,
          session_id: payload.session_id ? String(payload.session_id) : undefined,
          intent: payload.intent ? String(payload.intent) : undefined,
        });
      }
    } catch (err) {
      console.warn('story-guard: JSON parse hiba', err);
    }
  }
  return { stats, lines, total };
}

function formatReport(stats: Map<StoryEvent, EventStat>, total: number, windowHours: number): string {
  const timestamp = new Date().toISOString();
  const header = [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '📖 STORY GUARD REPORT',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `Készült: ${timestamp}`,
    `Időablak: utolsó ${windowHours} óra`,
    `Összes story event: ${total}`,
  ];
  const detailLines = EXPECTED_EVENTS.map(event => {
    const stat = stats.get(event)!;
    const status = stat.count > 0 ? 'OK' : 'HIÁNYZIK';
    const last = stat.lastTimestamp ? stat.lastTimestamp : 'nincs';
    const sessionInfo = stat.sessions.size ? `sessions: ${Array.from(stat.sessions).slice(-3).join(', ')}` : 'sessions: -';
    return `- ${event}: ${stat.count} találat (${status}, utolsó: ${last}, ${sessionInfo})`;
  });
  const missing = EXPECTED_EVENTS.filter(event => (stats.get(event)?.count ?? 0) === 0);
  const footer = missing.length
    ? [`⚠️  FIGYELEM: hiányzó események → ${missing.join(', ')}`]
    : ['✅ STORY GUARD: minden lépés lefedve az időablakban.'];
  return [...header, '', ...detailLines, '', ...footer, ''].join('\n');
}

async function writeReport(outputPath: string, content: string, lines: ReportLine[]): Promise<void> {
  const dir = path.dirname(outputPath);
  await fsPromises.mkdir(dir, { recursive: true });
  await fsPromises.writeFile(outputPath, content, 'utf8');
  const recentJsonPath = outputPath.replace(/\.log$/, '.json');
  await fsPromises.writeFile(
    recentJsonPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), events: lines }, null, 2),
    'utf8',
  );
}

(async () => {
  const logPath = path.resolve(DEFAULT_LOG_PATH);
  const outputPath = path.resolve(DEFAULT_OUTPUT_PATH);
  const { stats, total, lines } = await collectEvents(logPath, WINDOW_HOURS);
  const content = formatReport(stats, total, WINDOW_HOURS);
  await writeReport(outputPath, content, lines);
  console.log(`Story guard riport elkészült → ${outputPath}`);
})();
