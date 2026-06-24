import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

export type MemoryScope = 'session' | 'project' | 'org';
export type MemoryEnvironment = 'dev' | 'staging' | 'prod';
export type MemorySeverity = 'low' | 'medium' | 'high' | 'critical';
export type MemoryItemType =
  | 'fact'
  | 'decision'
  | 'constraint'
  | 'known_issue'
  | 'runbook'
  | 'incident'
  | 'postmortem'
  | 'policy'
  | 'task_link'
  | 'guard_pattern';

export interface MemoryItemInput {
  scope: MemoryScope;
  itemType: MemoryItemType;
  title: string;
  body: string;
  projectKey?: string;
  environment?: MemoryEnvironment;
  severity?: MemorySeverity;
  sourceKind?: string;
  sourceRef?: string;
  tags?: string[];
  createdBy?: string;
  piiLevel?: 'none' | 'low' | 'restricted';
}

export interface MemoryQuery {
  query: string;
  scope?: MemoryScope;
  projectKey?: string;
  environment?: MemoryEnvironment;
  topK?: number;
}

export interface MemoryRecord {
  id: string;
  scope: MemoryScope;
  item_type: MemoryItemType;
  title: string;
  body: string;
  project_key: string | null;
  environment: MemoryEnvironment | null;
  severity: MemorySeverity | null;
  source_kind: string | null;
  source_ref: string | null;
  source_trust: number;
  quality_score: number;
  tags: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostmortemInput {
  symptom: string;
  rootCause: string;
  detectionMethod: string;
  fixSummary: string;
  preventionGuard: string;
  regressionTestRef?: string;
  checklistRef?: string;
  owner?: string;
}

const PHASE0_ENABLED = process.env.AI_MEMORY_PHASE0_ENABLED === '1';
const DB_URL = process.env.AI_MEMORY_DATABASE_URL;
const SCHEMA = process.env.AI_MEMORY_SCHEMA?.trim() || 'ai_memory';
const AUTO_MIGRATE = process.env.AI_MEMORY_AUTO_MIGRATE === '1';

let pool: Pool | null = null;
let schemaReady = false;

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function getSchema(): string {
  return quoteIdent(SCHEMA);
}

function getPool(): Pool {
  if (!DB_URL) {
    throw new Error('ai_memory_db_url_missing');
  }
  if (!pool) {
    pool = new Pool({ connectionString: DB_URL });
  }
  return pool;
}

async function ensureSchema(): Promise<void> {
  if (schemaReady) {
    return;
  }
  if (!AUTO_MIGRATE) {
    return;
  }

  const schema = getSchema();
  const p = getPool();
  await p.query(`CREATE SCHEMA IF NOT EXISTS ${schema};`);

  await p.query(`
    CREATE TABLE IF NOT EXISTS ${schema}.memory_items (
      id UUID PRIMARY KEY,
      scope TEXT NOT NULL CHECK (scope IN ('session','project','org')),
      item_type TEXT NOT NULL CHECK (item_type IN (
        'fact','decision','constraint','known_issue','runbook','incident','postmortem','policy','task_link','guard_pattern'
      )),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      project_key TEXT,
      environment TEXT CHECK (environment IN ('dev','staging','prod')),
      severity TEXT CHECK (severity IN ('low','medium','high','critical')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','superseded','archived')),
      source_kind TEXT,
      source_ref TEXT,
      source_trust NUMERIC(5,4) NOT NULL DEFAULT 0.5000,
      quality_score NUMERIC(5,4) NOT NULL DEFAULT 0.5000,
      tags TEXT[] NOT NULL DEFAULT '{}',
      created_by TEXT,
      updated_by TEXT,
      approved_by TEXT,
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      valid_from TIMESTAMPTZ,
      valid_to TIMESTAMPTZ,
      pii_level TEXT NOT NULL DEFAULT 'none' CHECK (pii_level IN ('none','low','restricted'))
    );
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS ${schema}.incident_postmortem (
      memory_id UUID PRIMARY KEY REFERENCES ${schema}.memory_items(id) ON DELETE CASCADE,
      symptom TEXT NOT NULL,
      root_cause TEXT NOT NULL,
      detection_method TEXT NOT NULL,
      fix_summary TEXT NOT NULL,
      prevention_guard TEXT NOT NULL,
      regression_test_ref TEXT,
      checklist_ref TEXT,
      owner TEXT,
      resolved_at TIMESTAMPTZ
    );
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS ${schema}.memory_feedback (
      id UUID PRIMARY KEY,
      memory_id UUID NOT NULL REFERENCES ${schema}.memory_items(id) ON DELETE CASCADE,
      useful BOOLEAN,
      score INT CHECK (score BETWEEN 1 AND 5),
      note TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS ${schema}.memory_retrieval_log (
      id UUID PRIMARY KEY,
      query_text TEXT,
      query_scope TEXT,
      project_key TEXT,
      top_k INT,
      selected_ids UUID[] NOT NULL DEFAULT '{}',
      accepted_ids UUID[] NOT NULL DEFAULT '{}',
      latency_ms INT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS ${schema}.memory_write_audit (
      id UUID PRIMARY KEY,
      action TEXT NOT NULL CHECK (action IN ('insert','update','delete','approve','archive')),
      memory_id UUID,
      actor TEXT,
      reason TEXT,
      payload_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await p.query(`CREATE INDEX IF NOT EXISTS idx_memory_items_scope_type ON ${schema}.memory_items(scope, item_type);`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_memory_items_project ON ${schema}.memory_items(project_key, status);`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_memory_items_updated_at ON ${schema}.memory_items(updated_at DESC);`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_memory_items_tags ON ${schema}.memory_items USING GIN(tags);`);

  schemaReady = true;
}

export function isAiMemoryPhase0Enabled(): boolean {
  return PHASE0_ENABLED;
}

export async function insertMemoryItem(input: MemoryItemInput): Promise<string> {
  if (!PHASE0_ENABLED) {
    throw new Error('ai_memory_phase0_disabled');
  }
  await ensureSchema();
  const p = getPool();
  const schema = getSchema();
  const id = randomUUID();

  await p.query(
    `
      INSERT INTO ${schema}.memory_items (
        id, scope, item_type, title, body, project_key, environment, severity,
        source_kind, source_ref, tags, created_by, updated_by, pii_level
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $12, $13
      )
    `,
    [
      id,
      input.scope,
      input.itemType,
      input.title,
      input.body,
      input.projectKey || null,
      input.environment || null,
      input.severity || null,
      input.sourceKind || null,
      input.sourceRef || null,
      input.tags || [],
      input.createdBy || null,
      input.piiLevel || 'none',
    ],
  );

  await appendWriteAudit('insert', id, input.createdBy, `item_type=${input.itemType}`);
  return id;
}

export async function attachIncidentPostmortem(memoryId: string, input: PostmortemInput): Promise<void> {
  if (!PHASE0_ENABLED) {
    throw new Error('ai_memory_phase0_disabled');
  }
  await ensureSchema();
  const p = getPool();
  const schema = getSchema();
  await p.query(
    `
      INSERT INTO ${schema}.incident_postmortem (
        memory_id, symptom, root_cause, detection_method, fix_summary, prevention_guard,
        regression_test_ref, checklist_ref, owner
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (memory_id)
      DO UPDATE SET
        symptom = EXCLUDED.symptom,
        root_cause = EXCLUDED.root_cause,
        detection_method = EXCLUDED.detection_method,
        fix_summary = EXCLUDED.fix_summary,
        prevention_guard = EXCLUDED.prevention_guard,
        regression_test_ref = EXCLUDED.regression_test_ref,
        checklist_ref = EXCLUDED.checklist_ref,
        owner = EXCLUDED.owner
    `,
    [
      memoryId,
      input.symptom,
      input.rootCause,
      input.detectionMethod,
      input.fixSummary,
      input.preventionGuard,
      input.regressionTestRef || null,
      input.checklistRef || null,
      input.owner || null,
    ],
  );
}

export async function retrieveMemory(query: MemoryQuery): Promise<MemoryRecord[]> {
  if (!PHASE0_ENABLED) {
    throw new Error('ai_memory_phase0_disabled');
  }
  await ensureSchema();
  const started = Date.now();
  const p = getPool();
  const schema = getSchema();
  const topK = Math.min(Math.max(query.topK || 5, 1), 20);

  const conditions: string[] = [`status = 'active'`];
  const values: unknown[] = [];
  let idx = 1;

  if (query.scope) {
    conditions.push(`scope = $${idx}`);
    values.push(query.scope);
    idx += 1;
  }
  if (query.projectKey) {
    conditions.push(`project_key = $${idx}`);
    values.push(query.projectKey);
    idx += 1;
  }
  if (query.environment) {
    conditions.push(`environment = $${idx}`);
    values.push(query.environment);
    idx += 1;
  }

  const likeTerm = `%${query.query}%`;
  conditions.push(`(title ILIKE $${idx} OR body ILIKE $${idx} OR EXISTS (SELECT 1 FROM unnest(tags) t WHERE t ILIKE $${idx}))`);
  values.push(likeTerm);
  idx += 1;

  values.push(topK);

  const sql = `
    SELECT
      id, scope, item_type, title, body, project_key, environment, severity,
      source_kind, source_ref, source_trust, quality_score, tags, created_by,
      created_at::text AS created_at, updated_at::text AS updated_at
    FROM ${schema}.memory_items
    WHERE ${conditions.join(' AND ')}
    ORDER BY
      CASE WHEN title ILIKE $${idx - 1} THEN 2 ELSE 0 END
      + CASE WHEN body ILIKE $${idx - 1} THEN 1 ELSE 0 END DESC,
      updated_at DESC
    LIMIT $${idx};
  `;

  const result = await p.query<MemoryRecord>(sql, values);
  const selectedIds = result.rows.map(row => row.id);

  await logRetrieval({
    queryText: query.query,
    queryScope: query.scope,
    projectKey: query.projectKey,
    topK,
    selectedIds,
    latencyMs: Date.now() - started,
  });

  return result.rows;
}

export async function submitMemoryFeedback(options: {
  memoryId: string;
  useful?: boolean;
  score?: number;
  note?: string;
  createdBy?: string;
}): Promise<void> {
  if (!PHASE0_ENABLED) {
    throw new Error('ai_memory_phase0_disabled');
  }
  await ensureSchema();
  const p = getPool();
  const schema = getSchema();
  await p.query(
    `
      INSERT INTO ${schema}.memory_feedback (
        id, memory_id, useful, score, note, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6)
    `,
    [randomUUID(), options.memoryId, options.useful ?? null, options.score ?? null, options.note || null, options.createdBy || null],
  );
}

export async function getPilotMetrics(): Promise<{
  itemCount: number;
  decisionCount: number;
  incidentCount: number;
  feedbackCount: number;
  acceptanceRate: number | null;
}> {
  if (!PHASE0_ENABLED) {
    throw new Error('ai_memory_phase0_disabled');
  }
  await ensureSchema();
  const p = getPool();
  const schema = getSchema();

  const [itemsRes, feedbackRes] = await Promise.all([
    p.query<{
      total: string;
      decisions: string;
      incidents: string;
    }>(`
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE item_type = 'decision')::text AS decisions,
        COUNT(*) FILTER (WHERE item_type IN ('incident','postmortem'))::text AS incidents
      FROM ${schema}.memory_items
      WHERE status = 'active';
    `),
    p.query<{
      total: string;
      useful: string;
    }>(`
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE useful IS TRUE)::text AS useful
      FROM ${schema}.memory_feedback;
    `),
  ]);

  const itemRow = itemsRes.rows[0];
  const feedbackRow = feedbackRes.rows[0];
  const feedbackTotal = Number(feedbackRow?.total || 0);
  const feedbackUseful = Number(feedbackRow?.useful || 0);

  return {
    itemCount: Number(itemRow?.total || 0),
    decisionCount: Number(itemRow?.decisions || 0),
    incidentCount: Number(itemRow?.incidents || 0),
    feedbackCount: feedbackTotal,
    acceptanceRate: feedbackTotal > 0 ? Number((feedbackUseful / feedbackTotal).toFixed(4)) : null,
  };
}

async function logRetrieval(entry: {
  queryText: string;
  queryScope?: string;
  projectKey?: string;
  topK: number;
  selectedIds: string[];
  latencyMs: number;
}): Promise<void> {
  await ensureSchema();
  const p = getPool();
  const schema = getSchema();
  await p.query(
    `
      INSERT INTO ${schema}.memory_retrieval_log (
        id, query_text, query_scope, project_key, top_k, selected_ids, latency_ms
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)
    `,
    [
      randomUUID(),
      entry.queryText,
      entry.queryScope || null,
      entry.projectKey || null,
      entry.topK,
      entry.selectedIds,
      entry.latencyMs,
    ],
  );
}

async function appendWriteAudit(
  action: 'insert' | 'update' | 'delete' | 'approve' | 'archive',
  memoryId: string,
  actor?: string,
  reason?: string,
): Promise<void> {
  await ensureSchema();
  const p = getPool();
  const schema = getSchema();
  await p.query(
    `
      INSERT INTO ${schema}.memory_write_audit (
        id, action, memory_id, actor, reason
      ) VALUES ($1,$2,$3,$4,$5)
    `,
    [randomUUID(), action, memoryId, actor || null, reason || null],
  );
}
