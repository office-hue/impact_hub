import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'node:fs';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { loadSourceSnapshots, recommendCoupons, loadManualCoupons, loadGmailPromotions } from '../../ai-agent-core/src/index.js';
import { getReliabilityFeatureStatus } from '../../ai-agent-core/src/services/reliability.js';
import type { SourceSnapshot } from '../../ai-agent-core/src/sources/types.js';
import type { RecommendationOffer, RecommendationResponse } from '../../ai-agent-core/src/impi/recommend.js';
import multer from 'multer';
import { spawn } from 'child_process';
import { generateImpiSummary } from './services/impi-openai.js';
import { runCriticReview, type CriticReport } from './services/impi-critic.js';
import { fetchMemoryContext, type MemoryContextRequest } from './services/memory-context.js';
import { getProfilePreference } from './services/profile-cache.js';
import { extractOfferContextMetadata } from './services/offer-metadata.js';
import { analyzeBannerImage } from './services/vision-client.js';
import {
  attachIncidentPostmortem,
  getPilotMetrics,
  insertMemoryItem,
  isAiMemoryPhase0Enabled,
  retrieveMemory,
  submitMemoryFeedback,
  type MemoryEnvironment,
  type MemoryScope,
  type MemorySeverity,
} from './services/ai-memory-phase0.js';
import { getCoreWorkspaces, findWorkspaceById } from './services/core-workspaces.js';
import type { CoreWorkspace } from './services/core-workspaces.js';
import { createCoreTask, listCoreTasks, type AttachmentRef } from './services/core-tasks.js';
import { enqueueCoreTask } from './services/core-queue.js';
import { normalizeJobType, type CoreJobType } from '@apps/core-worker/src/job-types.js';
import { runBillingoCron } from '@apps/core-worker/src/billingo-cron.js';
import { detectDocumentKind, ingestExcelFile, ingestPdfFile } from '@apps/document-ingest/src/index.js';
import { runCoreAgentPrototype } from '@apps/core-agent-graph/src/index.js';
import { getCapabilityMetrics, getCapabilityMetricsWithDerived, renderMetricsPrometheus } from '@apps/core-agent-graph/src/utils/metrics.js';
import { getCapabilityStats } from '@apps/core-agent-graph/src/utils/capabilityStats.js';
import type { CoreAgentState, DocumentAttachment, StructuredDocument } from '@apps/core-agent-graph/src/state.js';
import { trackLangfuseEvent, isLangfuseEnabled } from './services/langfuse-client.js';
import { structuredLog } from './utils/logger.js';
import rateLimit from 'express-rate-limit';
import { cleanupOldStatsInit } from '@apps/core-agent-graph/src/utils/capabilityStats.js';

async function fetchMemoryContextWithTimeout(
  request: MemoryContextRequest,
  timeoutMs = 2000,
): Promise<Awaited<ReturnType<typeof fetchMemoryContext>> | null> {
  const timeoutPromise = new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs));
  return Promise.race([fetchMemoryContext(request), timeoutPromise]);
}

function getCriticThreshold(intent?: string): number {
  if (!intent || intent === 'coupon_only' || intent === 'high_impact') {
    return 2;
  }
  if (['feedback', 'transparency', 'wrong_expectation', 'no_shop', 'impact_data'].includes(intent)) {
    return 4;
  }
  return 3;
}

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});
const PORT = Number(process.env.PORT || 4000);
const API_KEY = process.env.AI_AGENT_API_KEY;
const ROLE_SIGNATURE_SECRET = process.env.IMPACT_ROLE_SECRET || process.env.ROLE_SECRET;
const ALLOW_UNVERIFIED_ROLES =
  process.env.IMPACT_ALLOW_UNVERIFIED_ROLES === '1' && process.env.NODE_ENV !== 'production';
const ALLOW_QUERY_API_KEY = process.env.AI_AGENT_ALLOW_QUERY_API_KEY === '1';
const ALLOW_BODY_API_KEY = process.env.AI_AGENT_ALLOW_BODY_API_KEY === '1';
const LOG_PATH = process.env.IMPI_CHAT_LOG || path.join(process.cwd(), 'tmp', 'logs', 'impi-chat.log');
const OPENAI_ENABLED = Boolean(process.env.OPENAI_API_KEY);
const BILLINGO_CRON_ENABLED = process.env.CORE_BILLINGO_CRON_ENABLED === '1';
const BILLINGO_CRON_INTERVAL_MS = Number(process.env.CORE_BILLINGO_CRON_INTERVAL_MS || 24 * 60 * 60 * 1000);
const BILLINGO_CRON_INITIAL_DELAY_MS = Number(process.env.CORE_BILLINGO_CRON_INITIAL_DELAY_MS || 5 * 60 * 1000);
const DEFAULT_FILLOUT_URL = process.env.IMPACTSHOP_IMPI_FILLOUT_URL || 'https://form.fillout.com/t/eM61RLkz6jus';
const DOCUMENT_OUTPUT_DIR = process.env.CORE_DOCUMENT_OUTPUT_DIR
  ? path.resolve(process.env.CORE_DOCUMENT_OUTPUT_DIR)
  : path.resolve(process.cwd(), 'tmp', 'state', 'documents');
const IMPACT_NOTES_DIR = process.env.IMPACT_NOTES_DIR
  ? path.resolve(process.env.IMPACT_NOTES_DIR)
  : path.resolve(process.cwd(), '..', 'impactshop-notes');
const GREETING_KEYWORDS = ['szia', 'hello', 'helló', 'üdv', 'udv', 'üdvözlet', 'ki vagy', 'segits', 'segítenél', 'segíts'];
const TRANSPARENCY_INTENT_KEYWORDS = ['nem akarok vasarolni', 'nem akarok vásárolni', 'csak atlathatosag', 'átláthatóság erdekel', 'hol megy a pénz', 'csak informacio', 'nincs shop', 'rest', 'rest api'];
const IMPACT_REPORT_URL = process.env.IMPACTSHOP_IMPI_IMPACT_URL || 'https://app.sharity.hu/impactshop/leaderboard';
const IMPACT_REPORT_API = process.env.IMPACTSHOP_IMPI_IMPACT_API || 'https://app.sharity.hu/wp-json/impactshop/v1/leaderboard';
const SESSION_TTL_MS = Number(process.env.AI_AGENT_SESSION_TTL_MS || 15 * 60 * 1000);
const AI_MEMORY_PHASE0_FEATURE = isAiMemoryPhase0Enabled();
const DOCUMENT_UPLOAD_DIR = process.env.DOCUMENT_UPLOAD_DIR || path.join(process.cwd(), 'tmp', 'document-uploads');
const DOCUMENT_INGEST_LOG_PATH = process.env.DOCUMENT_INGEST_LOG_PATH
  ? path.resolve(process.env.DOCUMENT_INGEST_LOG_PATH)
  : path.resolve(process.cwd(), '..', 'impactshop-notes', '.codex', 'logs', 'document-ingest.log');
const PREVIOUS_REQUEST_KEYWORDS = [
  'elozo ajanlat',
  'előző ajánlat',
  'elozo valasz',
  'mit ajanlottal',
  'amit az elobb mondtal',
  'folytassuk',
  'folytassuk az előzőt',
  'folytathatjuk',
];

const MERGE_DOWNLOAD_ROOTS = [
  DOCUMENT_OUTPUT_DIR,
  DOCUMENT_UPLOAD_DIR,
  ...(process.env.CORE_MERGE_DOWNLOAD_ROOTS
    ? process.env.CORE_MERGE_DOWNLOAD_ROOTS.split(',').map(item => item.trim()).filter(Boolean)
    : []),
].map(root => path.resolve(root));

const MERGE_DOWNLOAD_MIME: Record<string, string> = {
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const EMPATHY_KEYWORDS = [
  'rossz napom',
  'kimerult',
  'kimerült',
  'nincs kedvem',
  'nincs energiám',
  'nincs energiam',
  'nem tudom mit szeretnék',
  'nem tudom mit szeretnek',
  'bizonytalan vagyok',
  'elbizonytalanodtam',
  'fáradt vagyok',
  'faradt vagyok',
  'le vagyok égve',
  'kiégtem',
  'kiegtem',
  'szomorú vagyok',
  'szomoru vagyok',
  'stresszes vagyok'
];

const LOW_EFFORT_TEMPLATE =
  'Ha most kevesebb energiád van: videós támogatás (1–2 perc), egy kis összegű vásárlás, vagy egy gyors NGO‑választás is sokat számít. Ha írsz pár szót, igazítom a javaslatot. 🙌';

const CONFIDENCE_TEMPLATE =
  'ℹ️ Ha nem pont erre gondoltál, jelezd bátran a fókuszt (pl. konkrét termék, összeg vagy kampány), és pontosítok a következő körben.';

const SHOPPING_FOLLOWUP_KEYWORDS = [
  'webshop',
  'link',
  'deeplink',
  'bolt',
  'termek',
  'termék',
  'ajanlat',
  'ajánlat',
  'ajanlatot',
  'ajándék',
  'cip',
  'mutass',
  'mutasd',
  'konkret',
  'konkrét',
  'ft',
  'forint',
  'ar',
  'ár',
];

type SessionMemory = {
  preferredNgoSlug?: string;
  preferredCategory?: string;
  lastSummary?: string;
  lastOfferLabels?: string[];
  lastFaultCode?: string;
  lastStoryEvent?: string;
  lastOffersDetailed?: Array<{
    shop?: string;
    ngo?: string;
    cta_url?: string;
    preferred_ngo_slug?: string;
  }>;
  restSummary?: string;
  restEndpoint?: string;
  faultHistory?: string[];
};

type SessionSnapshot = {
  offers: RecommendationOffer[];
  summary: string;
  preferredNgoSlug?: string;
  intent?: string;
  memory: SessionMemory;
  updatedAt: number;
};

const sessionStore = new Map<string, SessionSnapshot>();
const SUMMARY_LOCKED_INTENTS = new Set(['transparency', 'no_shop', 'impact_data', 'wrong_expectation', 'unsafe_request', 'video_support']);

function isGreetingMessage(message: string): boolean {
  const simplified = message.toLowerCase();
  return GREETING_KEYWORDS.some(keyword => simplified.includes(keyword));
}

function buildWelcomeSummary(): string {
  return [
    'Szia! Impi vagyok, a Sharity AI szurikátád – segítek, hogy könnyen tudj jót tenni. 😊',
    '',
    'Válassz egy irányt:',
    '• **Vásárlással adományoznék** – írd meg, milyen bolt vagy árkategória érdekel, és hozok hozzá NGO-t.',
    '• **Videós támogatás / kihívás** – pénz nélkül is segíthetsz rövid kampányvideókkal.',
    '• **Csak nézelődöm / átláthatóság** – mutatok Impact riportot vagy toplistát.',
    '',
    'Mondd el, melyik opció szimpatikus, és lépésről lépésre végigvezetlek. A linkjeimet használva rögzül az adomány a kiválasztott ügyhöz!'
  ].join('\n');
}

function isTransparencyIntent(message: string): boolean {
  const simplified = message.toLowerCase();
  return TRANSPARENCY_INTENT_KEYWORDS.some(keyword => simplified.includes(keyword));
}

function buildTransparencySummary(): string {
  return [
    'Értem, hogy most átláthatóságra vágysz – ez az egyik legfontosabb Sharity-érték. 🤝',
    '',
    `• Nézd meg az Impact riportot / toplistát itt: ${IMPACT_REPORT_URL}`,
    '• Ha konkrét ügyet mondasz, ajánlok hozzá NGO-t és linket.',
    '',
    'Innen pontosan látod, mennyi jut a szervezetekhez, és bármikor visszanézheted a saját statjaidat is. Ha szeretnéd, segítek konkrét NGO-t választani vagy riportot kérni!'
  ].join('\n');
}

app.use(express.json({ limit: '1mb' }));

const metricsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'too_many_requests' },
});

// Startup cleanup (best-effort)
cleanupOldStatsInit().catch(console.warn);

// Napi stat cleanup (24h)
setInterval(() => cleanupOldStatsInit().catch(console.warn), 24 * 60 * 60 * 1000);

app.get('/core/metrics', metricsLimiter, (req, res) => {
  if (!hasValidApiKey(req)) {
    return res.status(401).json({ error: 'invalid_api_key' });
  }
  const format = String(req.query.format || '');
  if (format === 'prometheus') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(renderMetricsPrometheus());
  }
  const metrics = getCapabilityMetricsWithDerived();
  getCapabilityStats()
    .then(stats => res.json({ metrics, stats }))
    .catch(err => {
      console.warn('capability stats read error', err);
      res.json({ metrics, stats: {} });
    });
});

app.get('/metrics', metricsLimiter, async (req, res) => {
  const allowed = (process.env.PROMETHEUS_ALLOWED_IPS || '127.0.0.1,::1').split(',').map(item => item.trim());
  const ip = req.ip || req.connection.remoteAddress || '';
  if (!allowed.includes(ip)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  if (process.env.PROMETHEUS_BASIC_AUTH) {
    const expected = process.env.PROMETHEUS_BASIC_AUTH;
    const header = req.get('authorization') || '';
    const token = header.startsWith('Basic ') ? header.slice('Basic '.length) : '';
    if (token !== expected) {
      res.setHeader('WWW-Authenticate', 'Basic realm="metrics"');
      return res.status(401).json({ error: 'unauthorized' });
    }
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(renderMetricsPrometheus());
});

// Alias a Prometheus endpointhoz
app.get('/metrics/core', metricsLimiter, async (req, res) => {
  const allowed = (process.env.PROMETHEUS_ALLOWED_IPS || '127.0.0.1,::1').split(',').map(item => item.trim());
  const ip = req.ip || req.connection.remoteAddress || '';
  if (!allowed.includes(ip)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  if (process.env.PROMETHEUS_BASIC_AUTH) {
    const expected = process.env.PROMETHEUS_BASIC_AUTH;
    const header = req.get('authorization') || '';
    const token = header.startsWith('Basic ') ? header.slice('Basic '.length) : '';
    if (token !== expected) {
      res.setHeader('WWW-Authenticate', 'Basic realm="metrics"');
      return res.status(401).json({ error: 'unauthorized' });
    }
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(renderMetricsPrometheus());
});

async function logImpiEvent(payload: Record<string, unknown>): Promise<void> {
  try {
    await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
    await fs.appendFile(LOG_PATH, `${new Date().toISOString()} ${JSON.stringify(payload)}\n`, 'utf8');
  } catch (err) {
    console.warn('Impi log írás hiba', err);
  }
}

type MulterRequest = express.Request & { file?: Express.Multer.File };

function normalizeTaskAttachments(raw: unknown): AttachmentRef[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map(item => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const data = item as Record<string, unknown>;
      const name = typeof data.name === 'string' ? data.name : undefined;
      if (!name) {
        return null;
      }
      const ingestPath = typeof (data.ingestPath ?? data.ingest_path) === 'string'
        ? (data.ingestPath ?? data.ingest_path) as string
        : undefined;
      const sourceUrl = typeof data.url === 'string' ? data.url : undefined;
      return {
        name,
        driveFileId: typeof data.driveFileId === 'string' ? data.driveFileId : undefined,
        mimeType: typeof data.mimeType === 'string' ? data.mimeType : undefined,
        sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : undefined,
        ingestPath,
        url: sourceUrl,
        kind: typeof data.kind === 'string'
          ? (data.kind as AttachmentRef['kind'])
          : undefined,
      } satisfies AttachmentRef;
    })
    .filter(Boolean) as AttachmentRef[];
}

const DOCUMENT_EXTENSIONS = ['.pdf', '.xls', '.xlsx', '.xlsm'];
const DOCUMENT_MIME_KEYWORDS = ['pdf', 'excel', 'sheet'];
const DOCUMENT_TEMPLATE_TAGS = new Set(['ocr', 'document']);
const BILLINGO_TEMPLATE_TAGS = new Set(['billingo']);
const MEMORY_TEMPLATE_TAGS = new Set(['email', 'assistant']);

type JobDescriptor = {
  jobType: CoreJobType;
  params?: Record<string, unknown>;
};

interface DetermineJobOptions {
  workspace: CoreWorkspace;
  templateId?: string;
  attachments?: AttachmentRef[];
  overrideType?: string;
  overrideParams?: Record<string, unknown>;
  memoryInput?: unknown;
  fallbackTopic: string;
}

function templateHasCategory(template: CoreWorkspace['templates'][number] | undefined, categorySet: Set<string>): boolean {
  if (!template?.categories?.length) {
    return false;
  }
  return template.categories.some(category => categorySet.has(category));
}

function isDocumentLikeAttachment(attachment: AttachmentRef): boolean {
  const mime = attachment.mimeType?.toLowerCase() || '';
  if (DOCUMENT_MIME_KEYWORDS.some(keyword => mime.includes(keyword))) {
    return true;
  }
  const lowerName = attachment.name?.toLowerCase() || '';
  return DOCUMENT_EXTENSIONS.some(ext => lowerName.endsWith(ext));
}

function normalizeMemoryInput(raw: unknown): MemoryContextRequest | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const data = raw as Record<string, unknown>;
  const labels = Array.isArray(data.labels)
    ? data.labels.filter((label): label is string => typeof label === 'string')
    : undefined;
  return {
    userId: typeof data.userId === 'string' ? data.userId : undefined,
    topic: typeof data.topic === 'string' ? data.topic : undefined,
    labels,
    minScore: typeof data.minScore === 'number' ? data.minScore : undefined,
  };
}

function normalizeMemoryScope(raw: unknown): MemoryScope | undefined {
  if (raw !== 'session' && raw !== 'project' && raw !== 'org') {
    return undefined;
  }
  return raw;
}

function normalizeMemoryEnvironment(raw: unknown): MemoryEnvironment | undefined {
  if (raw !== 'dev' && raw !== 'staging' && raw !== 'prod') {
    return undefined;
  }
  return raw;
}

function normalizeMemorySeverity(raw: unknown): MemorySeverity | undefined {
  if (raw !== 'low' && raw !== 'medium' && raw !== 'high' && raw !== 'critical') {
    return undefined;
  }
  return raw;
}

function parseTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function determineJobDescriptor(options: DetermineJobOptions): JobDescriptor {
  if (options.overrideType) {
    const enforcedType = normalizeJobType(options.overrideType);
    let normalizedParams: Record<string, unknown> | undefined = options.overrideParams;
    if (!normalizedParams && options.memoryInput && typeof options.memoryInput === 'object') {
      normalizedParams = options.memoryInput as Record<string, unknown>;
    }
    return { jobType: enforcedType, params: normalizedParams };
  }

  const attachments = options.attachments || [];
  const template = options.workspace.templates.find(item => item.id === options.templateId);

  const requiresDocumentJob = attachments.some(isDocumentLikeAttachment)
    || templateHasCategory(template, DOCUMENT_TEMPLATE_TAGS);
  if (requiresDocumentJob && attachments.length) {
    return { jobType: 'document_ingest', params: { attachments } };
  }

  const requiresBillingo = templateHasCategory(template, BILLINGO_TEMPLATE_TAGS);
  if (requiresBillingo) {
    return { jobType: 'billingo_sync' };
  }

  const normalizedMemory = normalizeMemoryInput(options.memoryInput);
  const shouldRunMemory = Boolean(normalizedMemory)
    || templateHasCategory(template, MEMORY_TEMPLATE_TAGS);
  if (shouldRunMemory) {
    const payload = normalizedMemory || { topic: options.fallbackTopic };
    return { jobType: 'memory_sync', params: { memoryRequest: payload } };
  }

  return { jobType: 'generic' };
}

function parseUserRoles(rawValue?: string | null): string[] {
  if (!rawValue) {
    return [];
  }
  const unique = new Set(
    rawValue
      .split(',')
      .map(item => item.trim())
      .filter(Boolean),
  );
  return Array.from(unique);
}

function verifyRoleSignature(rawRoles: string, providedSignature: string): boolean {
  if (!ROLE_SIGNATURE_SECRET) {
    return false;
  }
  const normalizedSignature = providedSignature.trim().toLowerCase();
  const expectedSignature = createHmac('sha256', ROLE_SIGNATURE_SECRET).update(rawRoles).digest('hex');
  try {
    const left = Buffer.from(normalizedSignature, 'hex');
    const right = Buffer.from(expectedSignature, 'hex');
    if (left.length === 0 || left.length !== right.length) {
      return false;
    }
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function resolveUserRoles(req: express.Request): string[] {
  const rawHeaderRoles = req.get('x-user-roles') || req.get('x-user-role') || '';
  const parsedRoles = parseUserRoles(rawHeaderRoles);
  if (parsedRoles.length) {
    const signature = req.get('x-user-roles-signature') || req.get('x-user-roles-sig') || '';
    if (ROLE_SIGNATURE_SECRET) {
      if (signature && verifyRoleSignature(rawHeaderRoles, signature)) {
        return parsedRoles;
      }
      structuredLog('warn', 'auth.roles.signature_invalid', {
        path: req.path,
        has_signature: Boolean(signature),
      });
    } else if (ALLOW_UNVERIFIED_ROLES) {
      structuredLog('warn', 'auth.roles.unverified_allowed', {
        path: req.path,
      });
      return parsedRoles;
    } else {
      structuredLog('warn', 'auth.roles.unverified_rejected', {
        path: req.path,
      });
    }
  }
  const defaultRole = process.env.CORE_DEFAULT_ROLE;
  return defaultRole ? [defaultRole] : [];
}

function userHasWorkspaceAccess(workspaceRoles: string[] | undefined, userRoles: string[]): boolean {
  if (!workspaceRoles || !workspaceRoles.length) {
    return true;
  }
  if (!userRoles.length) {
    return false;
  }
  return workspaceRoles.some(role => userRoles.includes(role));
}

function hasValidApiKey(
  req: express.Request,
  options: { allowQuery?: boolean; allowBody?: boolean } = {},
): boolean {
  if (!API_KEY) {
    return false;
  }
  const headerKey = req.get('x-api-key');
  if (headerKey === API_KEY) {
    return true;
  }
  const queryAllowed = options.allowQuery || ALLOW_QUERY_API_KEY;
  if (queryAllowed) {
    const queryKey = typeof req.query.key === 'string' ? req.query.key : undefined;
    if (queryKey === API_KEY) {
      return true;
    }
  }
  const bodyAllowed = options.allowBody || ALLOW_BODY_API_KEY;
  if (bodyAllowed) {
    const bodyKey = typeof req.body?.api_key === 'string' ? req.body.api_key : undefined;
    if (bodyKey === API_KEY) {
      return true;
    }
  }
  return false;
}

app.get('/core/workspaces', async (req, res) => {
  if (!hasValidApiKey(req)) {
    return res.status(401).json({ error: 'invalid_api_key' });
  }
  const userRoles = resolveUserRoles(req);
  const workspaces = await getCoreWorkspaces();
  const filtered = workspaces.filter(workspace => userHasWorkspaceAccess(workspace.allowedRoles, userRoles));
  return res.json({ workspaces: filtered });
});

app.get('/core/tasks', async (req, res) => {
  if (!hasValidApiKey(req)) {
    return res.status(401).json({ error: 'invalid_api_key' });
  }
  const limit = Number(req.query.limit) || 50;
  const userRoles = resolveUserRoles(req);
  const tasks = await listCoreTasks(Math.min(Math.max(limit, 1), 200));
  const workspaces = await getCoreWorkspaces();
  const filtered = tasks.filter(task => {
    const workspace = workspaces.find(item => item.id === task.workspaceId);
    return userHasWorkspaceAccess(workspace?.allowedRoles, userRoles);
  });
  return res.json({ tasks: filtered });
});

app.post('/core/tasks', async (req, res) => {
  if (!hasValidApiKey(req)) {
    return res.status(401).json({ error: 'invalid_api_key' });
  }
  const { workspaceId, templateId, title, description, priority } = req.body || {};
  if (typeof workspaceId !== 'string' || !workspaceId.trim()) {
    return res.status(400).json({ error: 'workspace_id_required' });
  }
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title_required' });
  }
  const workspace = await findWorkspaceById(workspaceId);
  if (!workspace) {
    return res.status(404).json({ error: 'workspace_not_found' });
  }
  const userRoles = resolveUserRoles(req);
  if (!userHasWorkspaceAccess(workspace.allowedRoles, userRoles)) {
    return res.status(403).json({ error: 'forbidden_workspace' });
  }
  const createdBy = req.get('x-user-email')
    || (typeof req.body?.createdBy === 'string' ? req.body.createdBy : 'unknown');
  const attachments = normalizeTaskAttachments(req.body?.attachments);
  const overrideJobType = typeof req.body?.jobType === 'string' ? req.body.jobType : undefined;
  const overrideJobParams = req.body?.jobParams && typeof req.body.jobParams === 'object'
    ? (req.body.jobParams as Record<string, unknown>)
    : undefined;
  const jobDescriptor = determineJobDescriptor({
    workspace,
    templateId: typeof templateId === 'string' ? templateId : undefined,
    attachments,
    overrideType: overrideJobType,
    overrideParams: overrideJobParams,
    memoryInput: req.body?.memoryRequest ?? req.body?.memory,
    fallbackTopic: title.trim(),
  });
  try {
    const task = await createCoreTask({
      workspace,
      templateId: typeof templateId === 'string' ? templateId : undefined,
      title: title.trim(),
      description: typeof description === 'string' ? description : undefined,
      createdBy,
      priority: priority === 'high' || priority === 'low' ? priority : 'normal',
      attachments,
    });
    await enqueueCoreTask({
      taskId: task.id,
      workspaceId: task.workspaceId,
      templateId: task.templateId,
      driveFileId: task.driveFileId,
      createdBy,
      jobType: jobDescriptor.jobType,
      params: jobDescriptor.params,
    });
    trackLangfuseEvent({
      name: 'core_task_created',
      userId: createdBy,
      metadata: {
        workspaceId: task.workspaceId,
        jobType: jobDescriptor.jobType,
        hasAttachments: Boolean(attachments.length),
      },
    });
    return res.status(201).json({ task });
  } catch (error) {
    console.error('Core task létrehozása sikertelen', error);
    return res.status(500).json({ error: 'core_task_create_failed' });
  }
});

function resolveAdminPageKey(req: express.Request): string | undefined {
  if (!API_KEY) {
    return undefined;
  }
  return typeof req.query.key === 'string' && req.query.key === API_KEY ? req.query.key : undefined;
}

function normalizeBannerImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function renderBannerAnalysisPage(pageKey?: string): string {
  const analyzeUrl = '/api/v1/vision/analyze';
  return `<!DOCTYPE html>
  <html lang="hu">
    <head>
      <meta charset="utf-8" />
      <title>Banner elemzés – Impact Shop admin</title>
      <style>
        body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
        main { max-width: 720px; margin: 0 auto; padding: 32px; }
        h1 { margin-top: 0; }
        form { background: #fff; padding: 24px; border-radius: 12px; box-shadow: 0 4px 24px rgba(15, 23, 42, 0.1); }
        label { display: block; margin-bottom: 16px; font-weight: 600; }
        input, select { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #d0d7de; margin-top: 8px; font-size: 14px; box-sizing: border-box; }
        button { margin-top: 8px; padding: 12px 18px; border-radius: 8px; border: none; background: #f97316; color: #fff; font-weight: 600; cursor: pointer; }
        button:disabled { opacity: 0.6; cursor: not-allowed; }
        pre { background: #0f172a; color: #e2e8f0; padding: 16px; border-radius: 12px; margin-top: 24px; overflow-x: auto; }
        .hint { color: #475569; font-size: 14px; margin-bottom: 16px; }
      </style>
    </head>
    <body>
      <main>
        <h1>Banner elemzés</h1>
        <p class="hint">Adj meg egy publikus banner URL-t vagy tölts fel egy képet, majd válaszd ki a Vision szolgáltatót.</p>
        <form id="analysisForm">
          <label>
            Banner kép URL-je
            <input id="imageUrlInput" type="url" name="image_url" placeholder="https://..." autocomplete="off" />
          </label>
          <label>
            Vagy tölts fel egy fájlt
            <input id="imageInput" type="file" name="image" accept="image/*" />
          </label>
          <label>
            Vision szolgáltató
            <select name="provider">
              <option value="google">Google Vision</option>
              <option value="azure">Azure Computer Vision</option>
            </select>
          </label>
          <button type="submit">Elemzés indítása</button>
        </form>
        <pre id="analysisOutput">Kimenet itt jelenik meg...</pre>
        <h2>Dokumentum OCR</h2>
        <p class="hint">Excel vagy PDF feltöltésével táblázatokat és kulcsértékeket nyerhetsz ki.</p>
        <form id="documentForm">
          <label>
            Válassz dokumentumot
            <input id="documentInput" type="file" name="document" accept=".xlsx,.xls,.xlsm,.pdf" />
          </label>
          <button type="submit">Dokumentum elemzése</button>
        </form>
        <div id="dropzone" class="hint" style="border:2px dashed #94a3b8; padding:16px; border-radius:12px; text-align:center; margin-top:12px;">Húzd ide a dokumentumot feltöltéshez</div>
        <div id="documentProgress" class="hint"></div>
        <pre id="documentOutput">Dokumentum OCR kimenete...</pre>
        <div id="attachmentForwarder" class="hint" style="margin-top:16px;">
          <label>
            Impi kérdés csatolással
            <textarea id="attachmentMessage" rows="3" placeholder="Pl. Foglald össze a most feltöltött dokumentum alapján…" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid #d0d7de;box-sizing:border-box;"></textarea>
          </label>
          <button type="button" id="sendAttachmentBtn" disabled>Küldés Impinek csatolva</button>
          <div id="attachmentStatus" class="hint"></div>
        </div>
      </main>
      <script>
        const ANALYZE_URL = ${JSON.stringify(analyzeUrl)};
        const DOCUMENT_URL = '/api/v1/vision/document-ocr';
        const CHAT_URL = '/api/v1/chat/impi';
        const PAGE_KEY = ${pageKey ? JSON.stringify(pageKey) : 'null'};
        const form = document.getElementById('analysisForm');
        const urlInput = document.getElementById('imageUrlInput');
        const fileInput = document.getElementById('imageInput');
        const output = document.getElementById('analysisOutput');
        const documentForm = document.getElementById('documentForm');
        const documentInput = document.getElementById('documentInput');
        const documentOutput = document.getElementById('documentOutput');
        const dropzone = document.getElementById('dropzone');
        const progressLabel = document.getElementById('documentProgress');
        const attachmentMessage = document.getElementById('attachmentMessage');
        const sendAttachmentBtn = document.getElementById('sendAttachmentBtn');
        const attachmentStatus = document.getElementById('attachmentStatus');
        let lastAttachment = null;
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const hasUrl = urlInput.value.trim().length > 0;
          const hasFile = fileInput.files.length > 0;
          if (!hasUrl && !hasFile) {
            output.textContent = 'Adj meg egy URL-t vagy tölts fel egy fájlt az elemzéshez.';
            return;
          }
          output.textContent = 'Elemzés folyamatban...';
          const formData = new FormData(form);
          if (!hasUrl) {
            formData.delete('image_url');
          }
          if (!hasFile) {
            formData.delete('image');
          }
          try {
            const headers = {};
            if (PAGE_KEY) {
              headers['x-api-key'] = PAGE_KEY;
            }
            const response = await fetch(ANALYZE_URL, { method: 'POST', headers, body: formData });
            const payload = await response.json();
            if (!response.ok || payload.status !== 'ok') {
              throw new Error(payload.message || 'Vision API hiba');
            }
            output.textContent = JSON.stringify(payload.data, null, 2);
          } catch (error) {
            output.textContent = 'Hiba: ' + (error instanceof Error ? error.message : String(error));
          }
        });
        function uploadDocument(file) {
          return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', DOCUMENT_URL);
            if (PAGE_KEY) {
              xhr.setRequestHeader('x-api-key', PAGE_KEY);
            }
            xhr.onload = () => {
              try {
                const payload = JSON.parse(xhr.responseText);
                if (xhr.status >= 200 && xhr.status < 300 && payload.status === 'ok') {
                  resolve(payload);
                } else {
                  reject(new Error(payload.message || 'Document OCR hiba'));
                }
              } catch (error) {
                reject(error);
              }
            };
            xhr.onerror = () => reject(new Error('Hálózati hiba a dokumentum feltöltésénél.'));
            xhr.upload.onprogress = event => {
              if (event.lengthComputable) {
                const percent = Math.round((event.loaded / event.total) * 100);
                progressLabel.textContent = \`Feltöltés: \${percent}%\`;
              }
            };
            const formData = new FormData();
            formData.append('document', file);
            xhr.send(formData);
          });
        }

        function handleDocument(file) {
          documentOutput.textContent = 'OCR folyamatban...';
          uploadDocument(file)
            .then(payload => {
              documentOutput.textContent = JSON.stringify(payload.data, null, 2);
              progressLabel.textContent = '';
              lastAttachment = payload.attachment || null;
              if (sendAttachmentBtn) {
                sendAttachmentBtn.disabled = !lastAttachment;
              }
              if (attachmentStatus) {
                attachmentStatus.textContent = lastAttachment ? 'A dokumentum csatolható az Impi kéréshez.' : 'Nincs csatolható dokumentum.';
              }
            })
            .catch(error => {
              documentOutput.textContent = 'Hiba: ' + (error instanceof Error ? error.message : String(error));
              progressLabel.textContent = '';
              lastAttachment = null;
              if (sendAttachmentBtn) {
                sendAttachmentBtn.disabled = true;
              }
            });
        }

        async function sendAttachmentToImpi() {
          if (!lastAttachment) {
            attachmentStatus.textContent = 'Előbb tölts fel egy dokumentumot.';
            return;
          }
          const messageValue = (attachmentMessage.value || '').trim();
          if (!messageValue) {
            attachmentStatus.textContent = 'Írd be, mit kérdeznél Impitől.';
            return;
          }
          sendAttachmentBtn.disabled = true;
          attachmentStatus.textContent = 'Kérés küldése…';
          const headers = { 'Content-Type': 'application/json' };
          if (PAGE_KEY) {
            headers['x-api-key'] = PAGE_KEY;
          }
          const attachmentPayload = {
            url: lastAttachment.url,
            ingest_path: lastAttachment.url,
            name: lastAttachment.name,
            mime_type: lastAttachment.mimeType,
            size: lastAttachment.size,
            kind: lastAttachment.kind,
          };
          try {
            const resp = await fetch(CHAT_URL, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                message: messageValue,
                attachments: [attachmentPayload],
                limit: 3,
              }),
            });
            const payload = await resp.json();
            if (!resp.ok || !payload || payload.status !== 'ok') {
              throw new Error(payload && payload.message ? payload.message : 'Impi API hiba');
            }
            if (payload.impi && payload.impi.summary) {
              attachmentStatus.textContent = 'Impi válasza: ' + payload.impi.summary;
            } else {
              attachmentStatus.textContent = 'Impi feldolgozta a kérést.';
            }
          } catch (error) {
            attachmentStatus.textContent = 'Hiba a kérésnél: ' + (error instanceof Error ? error.message : String(error));
          } finally {
            sendAttachmentBtn.disabled = !lastAttachment;
          }
        }

        documentForm.addEventListener('submit', event => {
          event.preventDefault();
          if (!documentInput.files.length) {
            documentOutput.textContent = 'Tölts fel egy dokumentumot.';
            return;
          }
          handleDocument(documentInput.files[0]);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
          dropzone.addEventListener(eventName, event => {
            event.preventDefault();
            dropzone.style.background = '#e2e8f0';
          });
        });
        ['dragleave', 'drop'].forEach(eventName => {
          dropzone.addEventListener(eventName, event => {
            event.preventDefault();
            dropzone.style.background = 'transparent';
          });
        });
        dropzone.addEventListener('drop', event => {
          const file = event.dataTransfer?.files?.[0];
          if (file) {
            documentInput.files = event.dataTransfer.files;
            handleDocument(file);
          }
        });

        if (sendAttachmentBtn) {
          sendAttachmentBtn.addEventListener('click', sendAttachmentToImpi);
        }
      </script>
    </body>
  </html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type GuardStatus = {
  timestamp: string;
  status: 'OK' | 'WARN' | 'FAIL';
  message: string;
};

function renderCoreConsolePage(payload: {
  workspaces: Awaited<ReturnType<typeof getCoreWorkspaces>>;
  tasks: Awaited<ReturnType<typeof listCoreTasks>>;
  ingestStatus?: GuardStatus | null;
  featureStatus?: Record<FeatureName, FeatureStatusInfo>;
  structuredDocuments?: StructuredDocumentSummary[];
}): string {
  const workspaceOptions = payload.workspaces
    .map(ws => `<option value="${escapeHtml(ws.id)}">${escapeHtml(ws.label)}</option>`)
    .join('');
  const statusCards = [
    renderIngestStatusCard(payload.ingestStatus),
    renderFeatureStatusCards(payload.featureStatus),
  ].join('');
  const taskRows = payload.tasks
    .map(task => {
      const logs = task.logs.slice(-3).map(entry => `<div class="log-entry">${escapeHtml(entry)}</div>`).join('');
      return `<tr>
        <td>${escapeHtml(task.title)}</td>
        <td>${escapeHtml(task.workspaceId)}</td>
        <td>${escapeHtml(task.status)}</td>
        <td>${task.driveFileLink ? `<a href="${escapeHtml(task.driveFileLink)}" target="_blank">link</a>` : '—'}</td>
        <td>${escapeHtml(task.updatedAt)}</td>
        <td>${logs || '—'}</td>
      </tr>`;
    })
    .join('');
  return `<!DOCTYPE html>
  <html lang="hu">
    <head>
      <meta charset="utf-8" />
      <title>Core Console</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #f8fafc; margin: 0; padding: 0; }
        main { max-width: 1024px; margin: 0 auto; padding: 32px; }
        h1 { margin-top: 0; }
        .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-bottom: 24px; }
        .status-card { padding: 16px; border-radius: 12px; color: #1e293b; box-shadow: 0 6px 24px rgba(15, 23, 42, 0.08); background: #fff; border-left: 6px solid #38bdf8; }
        .status-card.warn { border-left-color: #f97316; }
        .status-card.fail { border-left-color: #ef4444; }
        .status-card h2 { margin: 0 0 8px; font-size: 18px; }
        .status-card .timestamp { font-size: 13px; color: #64748b; }
        form { background: #fff; padding: 16px; border-radius: 12px; box-shadow: 0 4px 24px rgba(15, 23, 42, 0.05); margin-bottom: 32px; }
        label { display: block; margin-top: 12px; font-weight: 600; }
        input, select, textarea { width: 100%; padding: 8px; margin-top: 4px; border-radius: 6px; border: 1px solid #cbd5f5; }
        button { margin-top: 16px; padding: 10px 18px; border: none; border-radius: 8px; background: #2563eb; color: #fff; font-weight: 600; cursor: pointer; }
        table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(15, 23, 42, 0.05); }
        th, td { padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; }
        tr:hover { background: #f1f5f9; }
        .log-entry { font-size: 12px; color: #475569; }
        .documents { background: #fff; border-radius: 16px; padding: 20px; box-shadow: 0 6px 24px rgba(15, 23, 42, 0.08); margin-bottom: 32px; }
        .documents-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
        .documents-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-top: 16px; }
        .doc-card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; background: #f8fafc; }
        .doc-card h3 { margin: 0 0 6px; font-size: 16px; }
        .doc-card .timestamp { font-size: 12px; color: #64748b; }
        .doc-card .meta { font-size: 13px; color: #475569; margin-top: 4px; }
        .doc-card a { display: inline-block; margin-top: 8px; font-size: 13px; color: #2563eb; }
        .warnings { margin-top: 8px; }
        .warning { display: inline-block; background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 9999px; font-size: 11px; margin-right: 4px; }
        .guard-controls { display: flex; align-items: center; gap: 8px; }
        .guard-controls button { margin-top: 0; }
        .hint { color: #64748b; font-size: 13px; }
      </style>
      <script>
        const CORE_API_KEY = new URLSearchParams(window.location.search).get('key');
        async function submitCoreTask(event) {
          event.preventDefault();
          const form = event.currentTarget;
          const payload = {
            workspaceId: form.workspace.value,
            title: form.title.value,
            description: form.description.value,
            jobType: form.jobType.value || undefined,
            jobParams: form.jobParams.value ? JSON.parse(form.jobParams.value) : undefined,
          };
          const headers = { 'Content-Type': 'application/json' };
          if (CORE_API_KEY) {
            headers['x-api-key'] = CORE_API_KEY;
          }
          const response = await fetch('/core/tasks', {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
          });
          if (response.ok) {
            location.reload();
          } else {
            const error = await response.json().catch(() => ({}));
            alert('Hiba: ' + (error.error || response.status));
          }
        }

        async function rerunDocumentGuard(event) {
          if (event) {
            event.preventDefault();
          }
          const button = document.getElementById('rerunGuardBtn');
          const statusLabel = document.getElementById('guardRunStatus');
          if (!button || !statusLabel) {
            return;
          }
          button.disabled = true;
          statusLabel.textContent = 'Guard fut…';
          const headers = { 'Content-Type': 'application/json' };
          if (CORE_API_KEY) {
            headers['x-api-key'] = CORE_API_KEY;
          }
          try {
            const resp = await fetch('/core/guard/document-ingest', { method: 'POST', headers });
            const payload = await resp.json().catch(() => ({}));
            if (!resp.ok || payload.status !== 'ok') {
              throw new Error(payload.error || payload.error || 'guard_error');
            }
            statusLabel.textContent = payload.output || 'Guard lefutott.';
            setTimeout(() => location.reload(), 1500);
          } catch (error) {
            statusLabel.textContent = 'Guard hiba: ' + (error instanceof Error ? error.message : String(error));
            button.disabled = false;
          }
        }

        window.addEventListener('DOMContentLoaded', () => {
          const button = document.getElementById('rerunGuardBtn');
          if (button) {
            button.addEventListener('click', rerunDocumentGuard);
          }
        });
      </script>
    </head>
    <body>
      <main>
        <h1>Core Console</h1>
        <section class="status-grid">
          ${statusCards}
        </section>
        ${renderStructuredDocumentsSection(payload.structuredDocuments)}
        <form onsubmit="submitCoreTask(event)">
          <label>Workspace
            <select name="workspace" required>${workspaceOptions}</select>
          </label>
          <label>Cím
            <input name="title" required placeholder="Pl. Dokumentum kitöltés" />
          </label>
          <label>Leírás
            <textarea name="description" rows="3" placeholder="Rövid leírás"></textarea>
          </label>
          <label>Job típus (opcionális)
            <select name="jobType">
              <option value="">Automatikus</option>
              <option value="document_ingest">Document ingest</option>
              <option value="memory_sync">Memory sync</option>
            </select>
          </label>
          <label>Job params (JSON)
            <textarea name="jobParams" rows="4" placeholder='{"attachments":[{"name":"doc.xlsx","ingestPath":"/tmp/state/documents/123"}]}'></textarea>
          </label>
          <button type="submit">Feladat létrehozása</button>
        </form>
        <table>
          <thead>
            <tr>
              <th>Cím</th>
              <th>Workspace</th>
              <th>Státusz</th>
              <th>Drive</th>
              <th>Frissítve</th>
              <th>Log</th>
            </tr>
          </thead>
          <tbody>${taskRows || '<tr><td colspan="6">Nincs feladat</td></tr>'}</tbody>
        </table>
      </main>
    </body>
  </html>`;
}

function renderIngestStatusCard(status?: GuardStatus | null): string {
  if (!status) {
    return `<article class="status-card warn">
      <h2>Dokumentum ingest</h2>
      <p>Nincs guard log. Futtasd a .codex/guards/document-ingest.sh scriptet, hogy létrejöjjön az első mérés.</p>
    </article>`;
  }
  const cardClass = status.status === 'OK' ? 'status-card' : status.status === 'FAIL' ? 'status-card fail' : 'status-card warn';
  return `<article class="${cardClass}">
    <h2>Dokumentum ingest</h2>
    <div class="timestamp">Utolsó futás: ${escapeHtml(status.timestamp)}</div>
    <p><strong>Státusz:</strong> ${escapeHtml(status.status)} – ${escapeHtml(status.message)}</p>
  </article>`;
}

function renderFeatureStatusCards(featureStatus?: Record<FeatureName, FeatureStatusInfo>): string {
  if (!featureStatus) {
    return '';
  }
  const definitions: Array<{ id: FeatureName; label: string; description: string }> = [
    { id: 'playwright', label: 'Playwright scraper', description: 'Árukereső kampányok / cron' },
    { id: 'gmail', label: 'Gmail Promotions', description: 'Strukturált Gmail feed' },
    { id: 'reliability', label: 'Reliability score', description: 'AI kupon scoring' },
    { id: 'harvester_bridge', label: 'Manual harvester', description: 'Manual CSV / Shops pipeline' },
    { id: 'openai_bridge', label: 'OpenAI bridge', description: 'Impi GPT válasz generálás' },
    { id: 'memory_sync', label: 'Memory sync', description: 'Graphiti kontextus frissítés' },
  ];
  return definitions
    .map(def => {
      const info = featureStatus[def.id];
      if (!info) {
        return '';
      }
      const severity = determineFeatureSeverity(info);
      const className = severity === 'OK' ? 'status-card' : severity === 'FAIL' ? 'status-card fail' : 'status-card warn';
      const rows: string[] = [];
      rows.push(`<p>${escapeHtml(def.description)}</p>`);
      if (typeof info.count === 'number') {
        rows.push(`<p><strong>Rekordok:</strong> ${info.count}</p>`);
      }
      if (typeof info.average === 'number') {
        const avg = info.average.toFixed(2);
        rows.push(`<p><strong>Átlag pont:</strong> ${avg}${info.risky ? ` • Kockázatos: ${info.risky}` : ''}</p>`);
      }
      if (info.last_run) {
        rows.push(`<p class="timestamp">Utolsó futás: ${escapeHtml(info.last_run)}</p>`);
      }
      if (info.stale) {
        rows.push('<p><strong>Figyelem:</strong> adat 24 óránál régebbi.</p>');
      }
      return `<article class="${className}">
        <h2>${escapeHtml(def.label)}</h2>
        ${rows.join('\n')}
      </article>`;
    })
    .join('');
}

function determineFeatureSeverity(info: FeatureStatusInfo): 'OK' | 'WARN' | 'FAIL' {
  if (!info.enabled) {
    return 'FAIL';
  }
  if (info.stale) {
    return 'WARN';
  }
  return 'OK';
}

function renderStructuredDocumentsSection(documents?: StructuredDocumentSummary[]): string {
  const docs = documents && documents.length ? documents : null;
  const cards = docs
    ? docs
        .map(doc => {
          const warningBlock = doc.warnings?.length
            ? `<div class="warnings">${doc.warnings
                .map(w => `<span class="warning">${escapeHtml(w)}</span>`)
                .join('')}</div>`
            : '';
          return `<article class="doc-card">
            <h3>${escapeHtml(doc.attachmentName)}</h3>
            <p>${escapeHtml(doc.summary)}</p>
            <div class="timestamp">Frissítve: ${escapeHtml(new Date(doc.updatedAt).toLocaleString('hu-HU'))}</div>
            <div class="meta">Munkalapok: ${doc.sheetCount} • Táblák: ${doc.tableCount}</div>
            ${warningBlock}
            <a href="/core/documents/${encodeURIComponent(doc.file)}" target="_blank">JSON megnyitása</a>
          </article>`;
        })
        .join('')
    : '<p class="hint">Még nincs feldolgozott dokumentum snapshot.</p>';
  return `<section class="documents">
    <div class="documents-header">
      <div>
        <h2>Dokumentum ingest snapshotok</h2>
        <p class="hint">Legutóbbi ${docs ? docs.length : 0} feldolgozott fájl előnézete</p>
      </div>
      <div class="guard-controls">
        <button type="button" id="rerunGuardBtn">Guard újrafuttatása</button>
        <span id="guardRunStatus" class="hint"></span>
      </div>
    </div>
    <div class="documents-grid">
      ${cards}
    </div>
  </section>`;
}

async function persistUploadedDocument(file: Express.Multer.File): Promise<string> {
  await fs.mkdir(DOCUMENT_UPLOAD_DIR, { recursive: true });
  const storedName = buildStoredFileName(file.originalname);
  const storedPath = path.join(DOCUMENT_UPLOAD_DIR, storedName);
  await fs.writeFile(storedPath, file.buffer);
  return storedPath;
}

async function loadDocumentIngestStatus(): Promise<GuardStatus | null> {
  try {
    const content = await fs.readFile(DOCUMENT_INGEST_LOG_PATH, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    const lastLine = lines.length ? lines[lines.length - 1] : undefined;
    if (!lastLine) {
      return null;
    }
    const segments = lastLine.split('|').map(segment => segment.trim());
    if (segments.length < 4) {
      return null;
    }
    const [timestamp, guardName, statusRaw, message] = segments;
    if (guardName !== 'document-ingest') {
      return null;
    }
    const normalizedStatus = statusRaw === 'OK' || statusRaw === 'FAIL' || statusRaw === 'WARN' ? statusRaw : 'WARN';
    return {
      timestamp,
      status: normalizedStatus,
      message: message || 'nincs részletes üzenet',
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    console.warn('document ingest log olvasási hiba', error);
    return null;
  }
}

interface StructuredDocumentSummary {
  file: string;
  attachmentName: string;
  sheetCount: number;
  tableCount: number;
  warnings?: string[];
  summary: string;
  updatedAt: string;
}

async function loadStructuredDocumentSnapshots(limit = 5): Promise<StructuredDocumentSummary[]> {
  const summaries: StructuredDocumentSummary[] = [];
  try {
    const entries = await fs.readdir(DOCUMENT_OUTPUT_DIR, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
        .map(async entry => {
          const fullPath = path.join(DOCUMENT_OUTPUT_DIR, entry.name);
          try {
            const stat = await fs.stat(fullPath);
            return { name: entry.name, fullPath, mtime: stat.mtimeMs };
          } catch {
            return null;
          }
        }),
    );
    const valid = files.filter((item): item is { name: string; fullPath: string; mtime: number } => Boolean(item));
    valid.sort((a, b) => b.mtime - a.mtime);
    const selected = valid.slice(0, limit);
    for (const file of selected) {
      try {
        const raw = await fs.readFile(file.fullPath, 'utf8');
        const data = JSON.parse(raw) as StructuredDocument;
        const attachmentName = data.attachment?.name || data.attachment?.url || file.name;
        const sheets = data.sheets ?? [];
        const tables = data.tables ?? [];
        const sheetCount = sheets.length;
        const tableCount = tables.length;
        const summaryParts: string[] = [];
        if (sheetCount) {
          const sheetNames = sheets.slice(0, 3).map(sheet => sheet.name).join(', ');
          summaryParts.push(`Munkalapok: ${sheetCount} (${sheetNames}${sheetCount > 3 ? '…' : ''})`);
        }
        if (tableCount) {
          summaryParts.push(`Táblák: ${tableCount}`);
        }
        if (data.textPreview?.length) {
          summaryParts.push(`Szövegrészlet: ${data.textPreview.slice(0, 2).join(' / ')}`);
        }
        summaries.push({
          file: file.name,
          attachmentName,
          sheetCount,
          tableCount,
          warnings: data.warnings,
          summary: summaryParts.join(' | ') || 'Nincs részletes összefoglaló.',
          updatedAt: new Date(file.mtime).toISOString(),
        });
      } catch (error) {
        console.warn('structured document snapshot parse error', file.name, error);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('structured document snapshot read error', error);
    }
  }
  return summaries;
}

async function deleteStoredDocument(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('document upload cleanup error', error);
    }
  }
}

function buildStoredFileName(originalName?: string): string {
  const baseName = (originalName || 'document').split(/[/\\]/).pop() || 'document';
  const safeBase = baseName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 40) || 'document';
  const ext = path.extname(safeBase);
  const trimmed = ext ? safeBase.slice(0, -ext.length) : safeBase;
  const uniqueSegment = randomUUID().slice(0, 8);
  return `${trimmed || 'document'}-${Date.now()}-${uniqueSegment}${ext || ''}`;
}

function normalizeAttachmentsPayload(input: unknown): DocumentAttachment[] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }
  const attachments: DocumentAttachment[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const candidate = item as Record<string, unknown>;
    const urlValue = typeof candidate.url === 'string' ? candidate.url.trim() : undefined;
    const ingestPath =
      typeof candidate.ingest_path === 'string'
        ? candidate.ingest_path
        : typeof candidate.ingestPath === 'string'
          ? (candidate.ingestPath as string)
          : undefined;
    if (!urlValue && !ingestPath) {
      continue;
    }
    attachments.push({
      url: urlValue,
      mimeType:
        typeof candidate.mime_type === 'string'
          ? candidate.mime_type
          : typeof candidate.mimeType === 'string'
            ? (candidate.mimeType as string)
            : undefined,
      name: typeof candidate.name === 'string' ? candidate.name : undefined,
      size: typeof candidate.size === 'number' ? candidate.size : undefined,
      checksum: typeof candidate.checksum === 'string' ? candidate.checksum : undefined,
      ingestPath,
      kind:
        typeof candidate.kind === 'string'
          ? (candidate.kind as DocumentAttachment['kind'])
          : undefined,
    });
  }
  return attachments.length ? attachments : undefined;
}

function normaliseText(text?: string): string {
  if (!text) {
    return '';
  }
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();
}

function getSessionKey(req: express.Request): string {
  return String(req.body?.session_id || req.headers['x-impi-session'] || req.ip || 'anon');
}

function pruneSessions(): void {
  const now = Date.now();
  sessionStore.forEach((snapshot, key) => {
    if (now - snapshot.updatedAt > SESSION_TTL_MS) {
      sessionStore.delete(key);
    }
  });
}

function getSessionSnapshot(key: string): SessionSnapshot | null {
  pruneSessions();
  const snapshot = sessionStore.get(key);
  if (!snapshot) {
    return null;
  }
  if (Date.now() - snapshot.updatedAt > SESSION_TTL_MS) {
    sessionStore.delete(key);
    return null;
  }
  if (!snapshot.memory) {
    snapshot.memory = {};
  }
  return snapshot;
}

function saveSessionSnapshot(key: string, payload: SessionSnapshot): void {
  sessionStore.set(key, { ...payload, memory: payload.memory || {}, updatedAt: Date.now() });
}

function isPreviousOfferRequest(message: string): boolean {
  const simplified = normaliseText(message);
  if (!simplified) {
    return false;
  }
  return PREVIOUS_REQUEST_KEYWORDS.some(keyword => simplified.includes(normaliseText(keyword)));
}

function buildPreviousSummary(snapshot: SessionSnapshot): string {
  const names = snapshot.memory.lastOfferLabels?.slice(0, 2).join(', ');
  const stageText = describeStoryEvent(snapshot.memory.lastStoryEvent);
  const stagePrefix = stageText ? `${stageText}\n` : '';
  const detailedOffers = snapshot.memory.lastOffersDetailed;
  const faultHint = snapshot.memory.faultHistory?.slice(-1)[0];
  if (detailedOffers && detailedOffers.length) {
    const lines = detailedOffers.map((offer, index) => {
      const ngoText = offer.ngo ? ` → ${offer.ngo}` : '';
      const slugText = offer.preferred_ngo_slug ? ` (slug: ${offer.preferred_ngo_slug})` : '';
      const ctaText = offer.cta_url ? ` – CTA: ${offer.cta_url}` : '';
      return `${index + 1}. ${offer.shop || 'Ajánlat'}${ngoText}${slugText}${ctaText}`;
    });
    const footer = snapshot.memory.preferredCategory
      ? `Maradunk a(z) ${snapshot.memory.preferredCategory} témánál, vagy nézzünk mást?`
      : 'Jelezd, ha ezek közül valamelyiket szeretnéd folytatni, és küldöm ugyanazt a linket.';
    return `${stagePrefix}Az előző ajánlatok:\n${lines.join('\n')}\n${footer}`;
  }
  if (names) {
    const suffix = snapshot.memory.preferredCategory ? ` (${snapshot.memory.preferredCategory})` : '';
    const faultText = faultHint ? ` Előző hiba: ${faultHint}.` : '';
    return `${stagePrefix}Az előző ajánlatok: ${names}${suffix}.${faultText} Jelezd, ha maradnál ennél, és küldöm újra a linket.`;
  }
  if (snapshot.memory.restSummary) {
    const restLine = snapshot.memory.restEndpoint ? `REST: ${snapshot.memory.restEndpoint}` : '';
    return `${stagePrefix}${snapshot.memory.restSummary}${restLine ? `\n${restLine}` : ''}`;
  }
  if (snapshot.memory.lastSummary) {
    const faultText = faultHint ? ` (Utolsó hiba: ${faultHint})` : '';
    return `${stagePrefix}Legutóbb ezt beszéltük: ${snapshot.memory.lastSummary}${faultText}. Folytassuk innen, vagy nézzünk új lehetőségeket?`;
  }
  return `${stagePrefix}Az előző ajánlataim már kész vannak, jelezd bátran, melyik irányba lépnél tovább.`;
}

function describeStoryEvent(event?: string): string {
  switch (event) {
    case 'story_shopping_step1':
      return 'Ott tartottunk, hogy felírtuk a termék szándékot.';
    case 'story_shopping_step2':
      return 'Ott tartottunk, hogy a kategóriát/ügyet választottuk ki a shopping flow-ban.';
    case 'story_transparency_step1':
      return 'Ott tartottunk, hogy Impact riportot kezdtünk nézni.';
    case 'story_transparency_step2':
      return 'Ott tartottunk, hogy REST/CSV részletekről beszéltünk.';
    case 'story_transparency_step3':
      return 'Ott tartottunk, hogy Impact riportot/toplistát ajánlottam.';
    default:
      return '';
  }
}

function detectEmpathyCue(message: string): string | null {
  const simplified = normaliseText(message);
  if (!simplified) {
    return null;
  }
  if (EMPATHY_KEYWORDS.some(keyword => simplified.includes(normaliseText(keyword)))) {
    return 'a felhasználó bizonytalan / nehezebb napja van';
  }
  return null;
}

function appendLowEffortGuidance(summary: string): string {
  if (summary.includes('kevesebb energiád')) {
    return summary;
  }
  return `${summary} ${LOW_EFFORT_TEMPLATE}`.trim();
}

function shouldAddConfidenceDisclaimer(recommendation: RecommendationResponse): boolean {
  if (recommendation.intent && SUMMARY_LOCKED_INTENTS.has(recommendation.intent)) {
    return false;
  }
  if (!recommendation.offers || recommendation.offers.length === 0) {
    return true;
  }
  if (!recommendation.intent && recommendation.offers.length <= 1) {
    return true;
  }
  return false;
}

function appendConfidenceDisclaimer(summary: string): string {
  if (summary.includes('ℹ️ Ha nem pont erre gondoltál')) {
    return summary;
  }
  return `${summary} ${CONFIDENCE_TEMPLATE}`.trim();
}

function autolinkText(text: string): string {
  return text;
}

function ensurePerThousandText(text: string, offers: RecommendationOffer[] = []): string {
  if (!text) return text;
  const alreadyExplained =
    /1000\s*Ft/.test(text) ||
    /1\s?000/.test(text) ||
    /1\.000/.test(text) ||
    /per\s*1000/i.test(text);
  const perValues = offers
    .map(o => {
      if (typeof o.donation_per_1000_huf === 'number' && o.donation_per_1000_huf > 0) {
        return { label: o.shop_name || o.shop_slug, value: o.donation_per_1000_huf };
      }
      if (typeof o.donation_rate === 'number' && o.donation_rate > 0) {
        return { label: o.shop_name || o.shop_slug, value: o.donation_rate * 1000 };
      }
      return null;
    })
    .filter((v): v is { label: string; value: number } => Boolean(v));

  if (!perValues.length || alreadyExplained) {
    return text;
  }

  const uniqueValues = Array.from(new Map(perValues.map(v => [Math.round(v.value), v])).values());

  if (uniqueValues.length === 1) {
    const rounded = Math.round(uniqueValues[0].value);
    return `${text} Minden 1 000 Ft költés után kb. ${rounded.toLocaleString('hu-HU')} Ft adomány rögzül.`.trim();
  }

  return `${text} Minden 1 000 Ft költés után az adott ajánlatnál megadott összeg rögzül.`.trim();
}

function computeStoryEvent(prev: string | undefined, opts: { transparencyOnly: boolean; recommendationIntent?: string; shoppingFollowUp: boolean }): string | undefined {
  if (opts.transparencyOnly) {
    return 'story_transparency_step1';
  }
  const intent = opts.recommendationIntent;
  if (intent === 'transparency') {
    if (prev === 'story_transparency_step1') {
      return 'story_transparency_step2';
    }
    if (prev === 'story_transparency_step2') {
      return 'story_transparency_step3';
    }
    return 'story_transparency_step2';
  }
  if (intent === 'category') {
    if (opts.shoppingFollowUp) {
      return 'story_shopping_step2';
    }
    if (!prev) {
      return 'story_shopping_step1';
    }
  }
  return undefined;
}

function isShoppingFollowUp(message: string): boolean {
  const simplified = normaliseText(message);
  if (!simplified) {
    return false;
  }
  const priceMention = /\b\d{4,}\s*(?:ft|forint|huf)\b/i.test(message);
  if (priceMention) {
    return true;
  }
  return SHOPPING_FOLLOWUP_KEYWORDS.some(keyword => simplified.includes(normaliseText(keyword)));
}

const CATEGORY_HINTS: Record<string, string[]> = {
  'állatvédelem': ['allat', 'állat', 'allatvedelem', 'állatvédelem', 'menhely'],
  'gyermekvédelem': ['gyerek', 'gyermek', 'tabor', 'tábor', 'iskola', 'ovoda', 'óvoda'],
  'környezetvédelem': ['kornyezet', 'környezet', 'zold', 'zöld', 'tisza', 'faültetés', 'faültetes'],
  'egészségügy': ['egeszseg', 'egészség', 'rehabilitacio', 'rehabilitáció', 'fogyatekkal', 'mozgas'],
  'szociális segítség': ['szocialis', 'szociális', 'csalad', 'család', 'felzarkozas', 'felzárkózás', 'hajlektalan'],
};

function detectCategoryPreference(message: string): string | undefined {
  const simplified = normaliseText(message);
  if (!simplified) {
    return undefined;
  }
  for (const [category, keywords] of Object.entries(CATEGORY_HINTS)) {
    if (keywords.some(keyword => simplified.includes(keyword))) {
      return category;
    }
  }
  return undefined;
}

type ApiRecommendation = RecommendationResponse & { model?: string; critic?: CriticReport | null };

function featureFlagEnabled(name: string, fallback: boolean): boolean {
  const envKey = `AI_AGENT_FEATURE_${name.toUpperCase()}`;
  const raw = process.env[envKey];
  if (!raw) {
    return fallback;
  }
  const normalized = raw.toLowerCase();
  if (['1', 'true', 'on', 'enabled'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'off', 'disabled'].includes(normalized)) {
    return false;
  }
  return fallback;
}

type FeatureName = 'playwright' | 'gmail' | 'harvester_bridge' | 'openai_bridge' | 'reliability' | 'document_ingest' | 'memory_sync';
type FeatureStatusInfo = {
  enabled: boolean;
  count?: number;
  average?: number;
  risky?: number;
  last_run?: string;
  last_message?: string;
  log_path?: string;
  stale?: boolean;
};

interface GuardEventSnapshot {
  name: string;
  last_run?: string;
  status?: string;
  message?: string;
  log_path?: string;
}

const GUARD_LOG_PATH = process.env.GUARD_EVENTS_PATH
  || path.resolve(process.cwd(), '..', '.codex', 'logs', 'guard-events.log');
const CRON_LOG_DIR = process.env.AI_AGENT_CRON_LOG_DIR
  || path.resolve(process.cwd(), '..', 'impactshop-notes', '.codex', 'logs');
const FEATURE_LOG_PATHS: Partial<Record<FeatureName, string>> = {
  playwright: path.join(CRON_LOG_DIR, 'arukereso-playwright.cron.log'),
  gmail: path.join(CRON_LOG_DIR, 'gmail-promotions.cron.log'),
  reliability: path.join(CRON_LOG_DIR, 'reliability-score.cron.log'),
  document_ingest: path.join(CRON_LOG_DIR, 'document-ingest.log'),
  harvester_bridge: path.join(CRON_LOG_DIR, 'coupon-harvester-smoke.log'),
  openai_bridge: path.join(process.cwd(), 'tmp', 'logs', 'impi-chat.log'),
  memory_sync: path.join(CRON_LOG_DIR, 'graphiti-ingest.cron.log'),
};
const FEATURE_STALE_THRESHOLD_MS = Number(process.env.AI_AGENT_FEATURE_STALE_MS || 24 * 60 * 60 * 1000);

const BASE_REQUIRED_FEATURES: FeatureName[] = ['playwright', 'gmail', 'harvester_bridge', 'openai_bridge'];
const DEFAULT_OPTIONAL_FEATURES: FeatureName[] = ['playwright', 'openai_bridge', 'document_ingest', 'memory_sync'];
const OPTIONAL_FEATURE_SET = new Set<FeatureName>([
  ...DEFAULT_OPTIONAL_FEATURES,
  ...(process.env.AI_AGENT_OPTIONAL_FEATURES || '')
    .split(',')
    .map(value => value.trim())
    .filter((value): value is FeatureName => (['playwright', 'gmail', 'harvester_bridge', 'openai_bridge', 'reliability'] as string[]).includes(value)),
]);
const REQUIRED_FEATURES: FeatureName[] = BASE_REQUIRED_FEATURES.filter(name => !OPTIONAL_FEATURE_SET.has(name));

const FEATURE_GUARDS: Partial<Record<FeatureName, string>> = {
  gmail: 'gmail-ingest',
  playwright: 'arukereso-playwright',
  reliability: 'reliability-report',
  document_ingest: 'document-ingest',
};

async function loadGuardSnapshots(guards: string[]): Promise<Record<string, GuardEventSnapshot>> {
  const result: Record<string, GuardEventSnapshot> = {};
  if (!guards.length) {
    return result;
  }
  let raw: string;
  try {
    raw = await fs.readFile(GUARD_LOG_PATH, 'utf8');
  } catch (err) {
    return result;
  }
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const targets = new Set(guards);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const parts = lines[i].split('|');
    if (parts.length < 4) {
      continue;
    }
    const timestamp = parts[0].trim();
    const guardName = parts[1].trim();
    const status = parts[2].trim();
    const message = parts.slice(3).join('|').trim();
    if (!targets.has(guardName) || result[guardName]) {
      continue;
    }
    result[guardName] = {
      name: guardName,
      last_run: timestamp,
      status,
      message,
      log_path: GUARD_LOG_PATH,
    };
    if (Object.keys(result).length === targets.size) {
      break;
    }
  }
  return result;
}

async function getLogTimestamp(logPath: string | undefined): Promise<string | undefined> {
  if (!logPath) {
    return undefined;
  }
  try {
    const stat = await fs.stat(logPath);
    return stat.mtime.toISOString();
  } catch {
    return undefined;
  }
}

async function buildFeatureSnapshot(
  snapshots: SourceSnapshot[],
  documentStatus?: GuardStatus | null,
): Promise<{
  features: string[];
  active: string[];
  missing: string[];
  status: Record<FeatureName, FeatureStatusInfo>;
  guard_events: GuardEventSnapshot[];
}> {
  const manual = snapshots.find(s => s.feature === 'harvester_bridge');
  const arukereso = snapshots.find(s => s.feature === 'playwright');
  const gmailSnapshot = snapshots.find(s => s.feature === 'gmail');
  const manualCount = manual?.count ?? 0;
  const arukeresoCount = arukereso?.count ?? 0;
  const gmailCount = gmailSnapshot?.count ?? 0;
  const reliabilityStatus = await getReliabilityFeatureStatus();
  const featureStatus: Record<FeatureName, FeatureStatusInfo> = {
    playwright: { enabled: featureFlagEnabled('playwright', arukeresoCount > 0), count: arukeresoCount },
    gmail: { enabled: featureFlagEnabled('gmail', gmailCount > 0), count: gmailCount },
    harvester_bridge: { enabled: featureFlagEnabled('harvester_bridge', manualCount > 0), count: manualCount },
    openai_bridge: { enabled: featureFlagEnabled('openai_bridge', OPENAI_ENABLED), count: OPENAI_ENABLED ? 1 : 0 },
    reliability: {
      enabled: featureFlagEnabled('reliability', reliabilityStatus.enabled),
      count: reliabilityStatus.count,
      average: reliabilityStatus.average,
      risky: reliabilityStatus.risky,
      last_run: reliabilityStatus.last_run,
    },
    document_ingest: {
      enabled: featureFlagEnabled('document_ingest', (documentStatus?.status ?? 'FAIL') === 'OK'),
      last_run: documentStatus?.timestamp,
      last_message: documentStatus?.message,
      stale: documentStatus ? documentStatus.status !== 'OK' : true,
    },
    memory_sync: {
      enabled: featureFlagEnabled('memory_sync', true),
    },
  };

  await Promise.all(
    Object.entries(FEATURE_LOG_PATHS).map(async ([feature, logPath]) => {
      const info = featureStatus[feature as FeatureName];
      if (!info) {
        return;
      }
      const timestamp = await getLogTimestamp(logPath);
      if (timestamp && !info.last_run) {
        info.last_run = timestamp;
      }
      if (timestamp) {
        const age = Date.now() - Date.parse(timestamp);
        if (age > FEATURE_STALE_THRESHOLD_MS) {
          info.stale = true;
        }
      }
    }),
  );

  const active: string[] = [];
  Object.entries(featureStatus).forEach(([name, info]) => {
    if (info.enabled) {
      active.push(name);
    }
  });

  const features = Array.from(new Set([...BASE_REQUIRED_FEATURES, ...active]));
  const missing = REQUIRED_FEATURES.filter(flag => !active.includes(flag));

  const guardNames = Array.from(new Set([
    ...Object.values(FEATURE_GUARDS).filter(Boolean) as string[],
    'gmail-verify',
    'ai-agent',
  ]));
  const guardSnapshots = await loadGuardSnapshots(guardNames);
  Object.entries(FEATURE_GUARDS).forEach(([feature, guardName]) => {
    if (!guardName) {
      return;
    }
    const snapshot = guardSnapshots[guardName];
    if (snapshot) {
      const info = featureStatus[feature as FeatureName];
      if (info) {
        info.last_run = snapshot.last_run;
        info.last_message = snapshot.message;
        info.log_path = snapshot.log_path;
      }
    }
  });

  const guardEvents: GuardEventSnapshot[] = guardNames.map(name => ({
    name,
    last_run: guardSnapshots[name]?.last_run,
    status: guardSnapshots[name]?.status,
    message: guardSnapshots[name]?.message,
    log_path: guardSnapshots[name]?.log_path,
  }));

  return { features, active, missing, status: featureStatus, guard_events: guardEvents };
}

app.post('/api/v1/vision/analyze', upload.single('image'), async (req, res) => {
  if (!hasValidApiKey(req, { allowQuery: true })) {
    return res.status(401).json({ status: 'error', message: 'API kulcs szükséges' });
  }
  const provider = typeof req.body?.provider === 'string' ? req.body.provider : undefined;
  const imageUrlRaw =
    typeof req.body?.image_url === 'string'
      ? req.body.image_url
      : typeof req.body?.imageUrl === 'string'
        ? req.body.imageUrl
        : undefined;
  const imageUrl = normalizeBannerImageUrl(imageUrlRaw);
  const imageBuffer = (req as MulterRequest).file?.buffer;
  if (!imageUrl && !imageBuffer) {
    return res.status(400).json({ status: 'error', message: 'Adj meg URL-t vagy tölts fel képet.' });
  }
  try {
    const insights = await analyzeBannerImage({ imageUrl, imageBuffer, provider: provider as any });
    res.json({ status: 'ok', data: insights });
  } catch (error: unknown) {
    console.error('Vision analyze error', error);
    res.status(502).json({ status: 'error', message: error instanceof Error ? error.message : 'vision_error' });
  }
});

app.post('/api/v1/vision/document-ocr', upload.single('document'), async (req, res) => {
  if (!hasValidApiKey(req, { allowQuery: true })) {
    return res.status(401).json({ status: 'error', message: 'API kulcs szükséges' });
  }
  if (!req.file) {
    return res.status(400).json({ status: 'error', message: 'Tölts fel egy Excel vagy PDF fájlt.' });
  }
  let storedPath: string | null = null;
  try {
    storedPath = await persistUploadedDocument(req.file);
    const attachment = {
      url: storedPath,
      name: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    } satisfies DocumentAttachment;
    const kind = detectDocumentKind(attachment);
    let structured;
    if (kind === 'pdf') {
      structured = await ingestPdfFile(storedPath, { ...attachment, kind });
    } else if (kind === 'excel') {
      structured = await ingestExcelFile(storedPath, { ...attachment, kind });
    } else {
      return res.status(400).json({ status: 'error', message: 'Csak Excel vagy PDF dokumentum támogatott.' });
    }
    res.json({ status: 'ok', data: structured, attachment });
  } catch (error) {
    console.error('document OCR error', error);
    if (storedPath) {
      await deleteStoredDocument(storedPath);
    }
    res.status(502).json({ status: 'error', message: error instanceof Error ? error.message : 'document_ocr_error' });
  }
});

app.get('/admin/banner-analysis', (req, res) => {
  const pageKey = resolveAdminPageKey(req);
  if (!pageKey) {
    res.status(401).send('API kulcs szükséges. Add meg a ?key=<API_KEY> paramétert.');
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderBannerAnalysisPage(pageKey));
});

app.get('/admin/core-console', async (req, res) => {
  if (!hasValidApiKey(req, { allowQuery: true })) {
    res.status(401).send('API kulcs szükséges. Add meg a ?key=<API_KEY> paramétert.');
    return;
  }
  try {
    const workspaces = await getCoreWorkspaces();
    const tasks = await listCoreTasks(50);
    const ingestStatus = await loadDocumentIngestStatus();
    const snapshots = await loadSourceSnapshots();
    const structuredDocs = await loadStructuredDocumentSnapshots();
    const featureSnapshot = await buildFeatureSnapshot(snapshots, ingestStatus);
    const html = renderCoreConsolePage({
      workspaces,
      tasks,
      ingestStatus,
      featureStatus: featureSnapshot.status,
      structuredDocuments: structuredDocs,
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('core-console render error', error);
    res.status(500).send('Core Console nem elérhető.');
  }
});

app.get('/healthz', async (_req, res) => {
  try {
    const snapshots = await loadSourceSnapshots();
    const { features, missing, status: featureStatus, guard_events } = await buildFeatureSnapshot(snapshots);
    res.json({
      status: missing.length ? 'degraded' : 'ok',
      timestamp: new Date().toISOString(),
      features,
      missing_features: missing,
      feature_status: featureStatus,
      guard_events,
      sources: snapshots.map(s => ({
        id: s.id,
        feature: s.feature,
        count: s.count,
        lastUpdated: s.lastUpdated,
      })),
    });
  } catch (err) {
    console.error('healthz error', err);
    res.status(500).json({
      status: 'error',
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
});

app.get('/core/documents/:file', async (req, res) => {
  if (!hasValidApiKey(req)) {
    return res.status(401).json({ error: 'invalid_api_key' });
  }
  const requested = String(req.params.file || '');
  if (!/^[A-Za-z0-9._-]+$/.test(requested)) {
    return res.status(400).json({ error: 'invalid_file' });
  }
  const filePath = path.join(DOCUMENT_OUTPUT_DIR, requested);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return res.status(404).json({ error: 'not_found' });
    }
    console.error('core document fetch error', error);
    res.status(500).json({ error: 'document_read_error' });
  }
});

app.get('/core/merge-download', async (req, res) => {
  if (!hasValidApiKey(req)) {
    return res.status(401).json({ error: 'invalid_api_key' });
  }
  const raw = String(req.query.file || '');
  if (!raw) {
    return res.status(400).json({ error: 'missing_file' });
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return res.status(400).json({ error: 'invalid_file' });
  }
  const resolved = path.resolve(decoded);
  const allowed = MERGE_DOWNLOAD_ROOTS.some(root => resolved === root || resolved.startsWith(`${root}${path.sep}`));
  if (!allowed) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const ext = path.extname(resolved).toLowerCase();
  if (!MERGE_DOWNLOAD_MIME[ext]) {
    return res.status(400).json({ error: 'unsupported_type' });
  }
  try {
    await fs.access(resolved);
    res.setHeader('Content-Type', MERGE_DOWNLOAD_MIME[ext]);
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(resolved)}"`);
    fsSync.createReadStream(resolved).pipe(res);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return res.status(404).json({ error: 'not_found' });
    }
    console.error('merge download error', error);
    res.status(500).json({ error: 'download_error' });
  }
});

app.post('/core/guard/document-ingest', async (req, res) => {
  if (!hasValidApiKey(req)) {
    return res.status(401).json({ error: 'invalid_api_key' });
  }
  const scriptPath = path.join(IMPACT_NOTES_DIR, '.codex', 'guards', 'document-ingest.sh');
  try {
    await fs.access(scriptPath, fs.constants.X_OK);
  } catch {
    return res.status(500).json({ error: 'guard_script_missing' });
  }
  const guardCmd = `cd ${IMPACT_NOTES_DIR.replace(/"/g, '\\"')} && ./.codex/guards/document-ingest.sh`;
  const child = spawn('bash', ['-lc', guardCmd], {
    env: process.env,
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', chunk => {
    stderr += chunk.toString();
  });
  child.on('close', code => {
    res.json({
      status: code === 0 ? 'ok' : 'error',
      exitCode: code,
      output: stdout.trim(),
      error: stderr.trim(),
    });
  });
});

app.get('/api/v1/coupons', async (_req, res) => {
  try {
    const snapshots = await loadSourceSnapshots();
    const payload = snapshots.flatMap(snapshot => snapshot.records.map(record => ({
      ...record,
      source: record.source || snapshot.id,
    })));
    res.json({
      data: payload,
      meta: {
        total: payload.length,
        sources: snapshots.map(s => ({ id: s.id, count: s.count })),
      },
    });
  } catch (err) {
    console.error('coupon api error', err);
    res.status(500).json({
      status: 'error',
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
});

app.get('/gmail/promotions', async (req, res) => {
  if (!hasValidApiKey(req)) {
    return res.status(401).json({ status: 'error', message: 'API kulcs szükséges' });
  }
  try {
    const limit = Number(req.query.limit) || 200;
    const records = await loadGmailPromotions();
    const sliced = records.slice(0, limit);
    res.json({
      data: sliced,
      meta: {
        total: records.length,
        limit,
      },
    });
  } catch (err) {
    console.error('/gmail/promotions error', err);
    res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : 'unknown' });
  }
});

app.get('/api/v1/context/memory', async (req, res) => {
  if (!hasValidApiKey(req)) {
    return res.status(401).json({ status: 'error', message: 'API kulcs szükséges' });
  }
  try {
    const userId = typeof req.query.user_id === 'string' ? req.query.user_id : undefined;
    const topic = typeof req.query.topic === 'string' ? req.query.topic : undefined;
    const context = await fetchMemoryContext({ userId, topic });
    res.json(context);
  } catch (err) {
    console.error('/api/v1/context/memory error', err);
    res.status(502).json({ status: 'error', message: err instanceof Error ? err.message : 'graphiti_unavailable' });
  }
});

app.get('/api/v1/memory/retrieve', async (req, res) => {
  if (!hasValidApiKey(req)) {
    return res.status(401).json({ status: 'error', message: 'API kulcs szükséges' });
  }
  if (!AI_MEMORY_PHASE0_FEATURE) {
    return res.status(404).json({ status: 'error', message: 'ai_memory_phase0_disabled' });
  }
  const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
  if (!query) {
    return res.status(400).json({ status: 'error', message: 'query_required' });
  }
  const scope = normalizeMemoryScope(req.query.scope);
  const environment = normalizeMemoryEnvironment(req.query.environment);
  const projectKey = typeof req.query.project_key === 'string' ? req.query.project_key.trim() : undefined;
  const topK = Number(req.query.top_k);
  try {
    const items = await retrieveMemory({
      query,
      scope,
      projectKey: projectKey || undefined,
      environment,
      topK: Number.isFinite(topK) ? topK : undefined,
    });
    return res.json({
      status: 'ok',
      data: items,
      meta: {
        total: items.length,
        scope: scope || 'any',
        project_key: projectKey || null,
        environment: environment || null,
      },
    });
  } catch (err) {
    structuredLog('error', 'ai_memory.retrieve_failed', { error: err instanceof Error ? err.message : String(err) });
    return res.status(503).json({ status: 'error', message: 'ai_memory_unavailable' });
  }
});

app.post('/api/v1/memory/decision', async (req, res) => {
  if (!hasValidApiKey(req)) {
    return res.status(401).json({ status: 'error', message: 'API kulcs szükséges' });
  }
  if (!AI_MEMORY_PHASE0_FEATURE) {
    return res.status(404).json({ status: 'error', message: 'ai_memory_phase0_disabled' });
  }
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!title || !body) {
    return res.status(400).json({ status: 'error', message: 'title_and_body_required' });
  }
  const scope = normalizeMemoryScope(req.body?.scope) || 'project';
  const environment = normalizeMemoryEnvironment(req.body?.environment);
  const severity = normalizeMemorySeverity(req.body?.severity);
  const tags = parseTags(req.body?.tags);
  const createdBy = req.get('x-user-email') || (typeof req.body?.created_by === 'string' ? req.body.created_by : undefined);
  try {
    const memoryId = await insertMemoryItem({
      scope,
      itemType: 'decision',
      title,
      body,
      projectKey: typeof req.body?.project_key === 'string' ? req.body.project_key.trim() : undefined,
      environment,
      severity,
      sourceKind: typeof req.body?.source_kind === 'string' ? req.body.source_kind : 'manual',
      sourceRef: typeof req.body?.source_ref === 'string' ? req.body.source_ref : undefined,
      tags,
      createdBy,
      piiLevel: req.body?.pii_level === 'restricted' ? 'restricted' : req.body?.pii_level === 'low' ? 'low' : 'none',
    });
    return res.status(201).json({ status: 'ok', memory_id: memoryId });
  } catch (err) {
    structuredLog('error', 'ai_memory.decision_insert_failed', { error: err instanceof Error ? err.message : String(err) });
    return res.status(503).json({ status: 'error', message: 'ai_memory_unavailable' });
  }
});

app.post('/api/v1/memory/incident', async (req, res) => {
  if (!hasValidApiKey(req)) {
    return res.status(401).json({ status: 'error', message: 'API kulcs szükséges' });
  }
  if (!AI_MEMORY_PHASE0_FEATURE) {
    return res.status(404).json({ status: 'error', message: 'ai_memory_phase0_disabled' });
  }
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!title || !body) {
    return res.status(400).json({ status: 'error', message: 'title_and_body_required' });
  }

  const symptom = typeof req.body?.symptom === 'string' ? req.body.symptom.trim() : '';
  const rootCause = typeof req.body?.root_cause === 'string' ? req.body.root_cause.trim() : '';
  const detectionMethod = typeof req.body?.detection_method === 'string' ? req.body.detection_method.trim() : '';
  const fixSummary = typeof req.body?.fix_summary === 'string' ? req.body.fix_summary.trim() : '';
  const preventionGuard = typeof req.body?.prevention_guard === 'string' ? req.body.prevention_guard.trim() : '';
  if (!symptom || !rootCause || !detectionMethod || !fixSummary || !preventionGuard) {
    return res.status(400).json({ status: 'error', message: 'postmortem_fields_required' });
  }

  const scope = normalizeMemoryScope(req.body?.scope) || 'project';
  const environment = normalizeMemoryEnvironment(req.body?.environment);
  const severity = normalizeMemorySeverity(req.body?.severity) || 'high';
  const tags = parseTags(req.body?.tags);
  const createdBy = req.get('x-user-email') || (typeof req.body?.created_by === 'string' ? req.body.created_by : undefined);
  try {
    const memoryId = await insertMemoryItem({
      scope,
      itemType: 'incident',
      title,
      body,
      projectKey: typeof req.body?.project_key === 'string' ? req.body.project_key.trim() : undefined,
      environment,
      severity,
      sourceKind: typeof req.body?.source_kind === 'string' ? req.body.source_kind : 'manual',
      sourceRef: typeof req.body?.source_ref === 'string' ? req.body.source_ref : undefined,
      tags,
      createdBy,
      piiLevel: req.body?.pii_level === 'restricted' ? 'restricted' : req.body?.pii_level === 'low' ? 'low' : 'none',
    });
    await attachIncidentPostmortem(memoryId, {
      symptom,
      rootCause,
      detectionMethod,
      fixSummary,
      preventionGuard,
      regressionTestRef: typeof req.body?.regression_test_ref === 'string' ? req.body.regression_test_ref : undefined,
      checklistRef: typeof req.body?.checklist_ref === 'string' ? req.body.checklist_ref : undefined,
      owner: typeof req.body?.owner === 'string' ? req.body.owner : createdBy,
    });
    return res.status(201).json({ status: 'ok', memory_id: memoryId });
  } catch (err) {
    structuredLog('error', 'ai_memory.incident_insert_failed', { error: err instanceof Error ? err.message : String(err) });
    return res.status(503).json({ status: 'error', message: 'ai_memory_unavailable' });
  }
});

app.post('/api/v1/memory/feedback', async (req, res) => {
  if (!hasValidApiKey(req)) {
    return res.status(401).json({ status: 'error', message: 'API kulcs szükséges' });
  }
  if (!AI_MEMORY_PHASE0_FEATURE) {
    return res.status(404).json({ status: 'error', message: 'ai_memory_phase0_disabled' });
  }
  const memoryId = typeof req.body?.memory_id === 'string' ? req.body.memory_id.trim() : '';
  if (!memoryId) {
    return res.status(400).json({ status: 'error', message: 'memory_id_required' });
  }
  const createdBy = req.get('x-user-email') || (typeof req.body?.created_by === 'string' ? req.body.created_by : undefined);
  try {
    await submitMemoryFeedback({
      memoryId,
      useful: typeof req.body?.useful === 'boolean' ? req.body.useful : undefined,
      score: typeof req.body?.score === 'number' ? req.body.score : undefined,
      note: typeof req.body?.note === 'string' ? req.body.note : undefined,
      createdBy,
    });
    return res.status(201).json({ status: 'ok' });
  } catch (err) {
    structuredLog('error', 'ai_memory.feedback_failed', { error: err instanceof Error ? err.message : String(err) });
    return res.status(503).json({ status: 'error', message: 'ai_memory_unavailable' });
  }
});

app.get('/api/v1/memory/pilot-metrics', async (req, res) => {
  if (!hasValidApiKey(req)) {
    return res.status(401).json({ status: 'error', message: 'API kulcs szükséges' });
  }
  if (!AI_MEMORY_PHASE0_FEATURE) {
    return res.status(404).json({ status: 'error', message: 'ai_memory_phase0_disabled' });
  }
  try {
    const metrics = await getPilotMetrics();
    return res.json({ status: 'ok', data: metrics });
  } catch (err) {
    structuredLog('error', 'ai_memory.metrics_failed', { error: err instanceof Error ? err.message : String(err) });
    return res.status(503).json({ status: 'error', message: 'ai_memory_unavailable' });
  }
});

app.post('/api/v1/chat/impi', async (req, res) => {
  if (!hasValidApiKey(req)) {
    return res.status(401).json({ status: 'error', message: 'API kulcs szükséges' });
  }
  const message = String(req.body?.message ?? '').trim();
  if (!message) {
    return res.status(400).json({ status: 'error', message: 'Adj meg egy kérdést Impinek.' });
  }
  const limit = Number(req.body?.limit) || 3;
  const budget = req.body?.budget_huf ? Number(req.body?.budget_huf) : undefined;
  const ngo = req.body?.ngo_preference ? String(req.body?.ngo_preference) : undefined;
  const bannerImageUrl = normalizeBannerImageUrl(
    typeof req.body?.banner_image_url === 'string' ? req.body.banner_image_url : req.body?.bannerImageUrl,
  );
  const attachments = normalizeAttachmentsPayload(req.body?.attachments);
  const sessionKey = getSessionKey(req);
  const previousSession = getSessionSnapshot(sessionKey);
  const previousStoryEvent = previousSession?.memory?.lastStoryEvent;
  const categoryHint = detectCategoryPreference(message);
  const empathyCue = detectEmpathyCue(message);
  const profileUserId =
    (typeof req.body?.user_id === 'string' ? req.body.user_id : undefined)
    || (typeof req.headers['x-impactshop-user'] === 'string' ? (req.headers['x-impactshop-user'] as string) : undefined);
  const profilePreference = await getProfilePreference(profileUserId ?? null);
  const requestStartedAt = Date.now();
  const isFollowUpShopping = Boolean(previousSession?.memory?.preferredCategory && isShoppingFollowUp(message));
  let effectiveNgo = ngo;
  if (!effectiveNgo && previousSession?.memory?.preferredNgoSlug) {
    effectiveNgo = previousSession.memory.preferredNgoSlug;
  }
  let effectiveMessage = message;
  const suppressCategoryAppend = /kupon|akció|akcio|kedvezm|notino|parfums|kifli|szupermarket|sportcip|sportcipo|decathlon|parf[uü]m/i.test(
    message,
  );
  if (!categoryHint && previousSession?.memory?.preferredCategory && !suppressCategoryAppend) {
    effectiveMessage = `${message} ${previousSession.memory.preferredCategory}`;
  }
  try {
    if (previousSession && isPreviousOfferRequest(message)) {
      const payload: ApiRecommendation = {
        persona: 'Impi',
        summary: buildPreviousSummary(previousSession),
        offers: previousSession.offers,
        query: message,
        preferred_ngo_slug: previousSession.preferredNgoSlug,
        intent: 'session_recall',
        category_id: undefined,
        model: 'session-recall',
        critic: null,
      };
      await logImpiEvent({
        session_id: sessionKey,
        message,
        note: 'session_recall',
      });
      return res.json({ status: 'ok', impi: payload });
    }
    const greeting = isGreetingMessage(message);
    const transparencyOnly = !greeting && isTransparencyIntent(message);
    if (greeting || (transparencyOnly && !previousStoryEvent)) {
      const summary = greeting ? buildWelcomeSummary() : buildTransparencySummary();
      const storyEvent = transparencyOnly ? 'story_transparency_step1' : undefined;
      const payload: RecommendationResponse = {
        persona: 'Impi',
        summary,
        offers: [],
        query: message,
      };
      if (transparencyOnly) {
        saveSessionSnapshot(sessionKey, {
          offers: [],
          summary,
          preferredNgoSlug: previousSession?.preferredNgoSlug,
          intent: 'transparency',
          memory: {
            preferredNgoSlug: previousSession?.memory?.preferredNgoSlug,
            preferredCategory: previousSession?.memory?.preferredCategory,
            lastSummary: summary,
            lastOfferLabels: [],
            lastStoryEvent: storyEvent,
            restSummary: `Impact riport: ${IMPACT_REPORT_URL}`,
            restEndpoint: IMPACT_REPORT_API,
          },
          updatedAt: Date.now(),
        });
      }
      await logImpiEvent({
        message,
        note: greeting ? 'welcome_intent' : 'transparency_intent',
        session_id: sessionKey,
        empathy_hint: empathyCue || undefined,
        story_event: storyEvent,
      });
      return res.json({ status: 'ok', impi: { ...payload, model: 'system-template' } });
    }
    const recommendation: RecommendationResponse = await recommendCoupons({
      query: effectiveMessage,
      limit,
      budget_huf: budget,
      ngo_preference: effectiveNgo,
      skip_category_match: isFollowUpShopping,
      profile_preference: profilePreference || undefined,
    });
    const normalizedIntent =
      recommendation.intent || (isFollowUpShopping && previousSession?.memory?.preferredCategory ? 'category' : undefined);
    let narrative = recommendation.summary;
    let modelUsed: string | undefined;
    let openaiResult: Awaited<ReturnType<typeof generateImpiSummary>> | null = null;
    let graphMemoryContext: Awaited<ReturnType<typeof fetchMemoryContext>> | null = null;
    const memoryUserId = profileUserId ?? sessionKey;
    try {
      graphMemoryContext = await fetchMemoryContextWithTimeout({ userId: memoryUserId, topic: message }, 2000);
    } catch (error) {
      structuredLog('warn', 'graph_memory_unavailable', { error: String(error), userId: memoryUserId });
    }
    if (recommendation.intent === 'video_support') {
      const first = recommendation.offers[0];
      const cta = first?.cta_url || process.env.IMPACTSHOP_VIDEO_SUPPORT_URL || 'https://adomany.sharity.hu/about-us';
      const ngoSlug = first?.preferred_ngo_slug || process.env.IMPACTSHOP_VIDEO_NGO_SLUG || 'bator-tabor';
      narrative = [
        'Nézz meg egy kampányvideót, és a lejátszás rögzíti az adományt a választott ügynek.',
        `Link: ${cta}`,
        `A támogatás a(z) ${ngoSlug} javára könyvelődik, amint elindítod a videót.`
      ].join('\n');
      modelUsed = 'fixed-video-support';
    } else if (!recommendation.intent || !SUMMARY_LOCKED_INTENTS.has(recommendation.intent)) {
      openaiResult = await generateImpiSummary({
        userMessage: message,
        recommendation,
        empathyCue,
        memoryContext: graphMemoryContext || undefined,
        profile: profilePreference || undefined,
      });
      if (openaiResult?.text) {
        narrative = openaiResult.text;
        modelUsed = openaiResult.model;
      }
    }
    const shouldRunCritic = !recommendation.intent || (!SUMMARY_LOCKED_INTENTS.has(recommendation.intent) && recommendation.intent !== 'video_support');
    const critic = shouldRunCritic ? await runCriticReview(message, narrative) : null;
    let faultCode: string | undefined;
    if (shouldRunCritic && critic?.score && critic.score <= getCriticThreshold(recommendation.intent) && critic.rewrite) {
      narrative = critic.rewrite;
      faultCode = 'critic_rewrite';
    }
    if (empathyCue) {
      narrative = appendLowEffortGuidance(narrative);
    }
    if (shouldAddConfidenceDisclaimer(recommendation)) {
      narrative = appendConfidenceDisclaimer(narrative);
    }
    narrative = ensurePerThousandText(narrative, recommendation.offers || []);
    narrative = autolinkText(narrative);
    const storyEvent = computeStoryEvent(previousStoryEvent, {
      transparencyOnly: false,
      recommendationIntent: normalizedIntent,
      shoppingFollowUp: isFollowUpShopping,
    });
    const responsePayload: ApiRecommendation = {
      ...recommendation,
      summary: narrative,
      model: modelUsed,
      critic,
    };
    if (normalizedIntent === 'video_support') {
      responsePayload.summary = narrative;
    }
    const sanitizeOffer = (offer: RecommendationOffer): RecommendationOffer => {
      const { fillout_url, ...rest } = offer as RecommendationOffer & { fillout_url?: string };
      return rest;
    };
    responsePayload.offers = (responsePayload.offers || []).map(sanitizeOffer);
    responsePayload.intent = normalizedIntent;
    const graphRunSeed: CoreAgentState = {
      userMessage: message,
      sessionId: sessionKey,
      topicHint: categoryHint,
      recommendations: recommendation,
      contextMetadata: extractOfferContextMetadata(recommendation.offers, 5),
      artifacts: recommendation.offers?.map(offer => ({
        type: 'link' as const,
        url: offer.cta_url,
        label: offer.shop_name || offer.shop_slug,
        metadata: {
          shop_slug: offer.shop_slug,
          donation_rate: offer.donation_rate,
          donation_per_1000_huf: offer.donation_per_1000_huf,
        },
      })),
      finalResponse: narrative,
      graphitiContext: graphMemoryContext ?? undefined,
      contextSource: graphMemoryContext ? 'live' : undefined,
      logs: ['impi-rest'],
      bannerImageUrl,
      attachments,
      memoryRequest: {
        userId: sessionKey,
        topic: message,
      },
      observability: {
        source: 'impi_rest',
        startedAt: requestStartedAt,
        extra: {
          intent: normalizedIntent ?? null,
          fault_code: faultCode ?? null,
          empathy: empathyCue ?? null,
        },
      },
    };
    void runCoreAgentPrototype(graphRunSeed, { threadId: sessionKey }).catch((error: unknown) => {
      console.warn('LangGraph observability error', error);
    });
    const detailedOffers = recommendation.offers.slice(0, 3).map(offer => ({
      shop: offer.shop_name || offer.shop_slug,
      ngo: offer.ngo,
      cta_url: offer.cta_url,
      preferred_ngo_slug: offer.preferred_ngo_slug,
    }));
    const faultHistory = [...(previousSession?.memory?.faultHistory || [])];
    if (faultCode) {
      faultHistory.push(faultCode);
    }
    const memory: SessionMemory = {
      preferredNgoSlug: recommendation.preferred_ngo_slug || previousSession?.memory?.preferredNgoSlug,
      preferredCategory: categoryHint || previousSession?.memory?.preferredCategory,
      lastSummary: narrative,
      lastOfferLabels: recommendation.offers.slice(0, 3).map(o => o.shop_name || o.shop_slug).filter(Boolean) as string[],
      lastFaultCode: faultCode || previousSession?.memory?.lastFaultCode,
      lastStoryEvent: storyEvent || previousSession?.memory?.lastStoryEvent,
      lastOffersDetailed: detailedOffers,
      faultHistory: faultHistory.slice(-5),
      restSummary:
        recommendation.intent === 'transparency'
          ? `Impact riport: ${IMPACT_REPORT_URL}`
          : previousSession?.memory?.restSummary,
      restEndpoint: recommendation.intent === 'transparency' ? IMPACT_REPORT_API : previousSession?.memory?.restEndpoint,
    };
    saveSessionSnapshot(sessionKey, {
      offers: recommendation.offers,
      summary: narrative,
      preferredNgoSlug: recommendation.preferred_ngo_slug,
      intent: normalizedIntent,
      memory,
      updatedAt: Date.now(),
    });
    await logImpiEvent({
      message,
      offers: recommendation.offers.map(o => ({
        shop: o.shop_slug,
        score: o.impact_score,
        cta_url: o.cta_url,
        coupon_code: o.coupon_code,
      })),
      model: modelUsed || 'local',
      intent: normalizedIntent,
      session_id: sessionKey,
      critic,
      fault_code: faultCode,
      empathy_hint: empathyCue || undefined,
      story_event: storyEvent,
    });
    trackLangfuseEvent({
      name: 'impi_chat_response',
      sessionId: sessionKey,
      userId: profileUserId ?? undefined,
      metadata: {
        intent: normalizedIntent ?? 'generic',
        offers_returned: recommendation.offers.length,
        openai_model: modelUsed ?? 'local',
        processing_ms: Date.now() - requestStartedAt,
      },
    });
    res.json({ status: 'ok', impi: responsePayload });
  } catch (err) {
    console.error('Impi chat error', err);
    await logImpiEvent({ message, session_id: sessionKey, error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ status: 'error', message: 'Impi most nem érhető el, próbáld újra.' });
  }
});

app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'AI Agent API ready', timestamp: new Date().toISOString() });
});

if (BILLINGO_CRON_ENABLED) {
  let billingoRunning = false;
  const runOnce = async () => {
    if (billingoRunning) {
      console.warn('[billingo-cron] skip: már fut');
      return;
    }
    billingoRunning = true;
    try {
      await runBillingoCron();
      console.log('[billingo-cron] done');
    } catch (error) {
      console.error('[billingo-cron] error', error);
    } finally {
      billingoRunning = false;
    }
  };
  setTimeout(runOnce, BILLINGO_CRON_INITIAL_DELAY_MS);
  setInterval(runOnce, BILLINGO_CRON_INTERVAL_MS);
  console.log(`[billingo-cron] enabled interval=${BILLINGO_CRON_INTERVAL_MS}ms`);
}

app.listen(PORT, () => {
  console.log(`AI Agent API listening on http://127.0.0.1:${PORT}`);
});
