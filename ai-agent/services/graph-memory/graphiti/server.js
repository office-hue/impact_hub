const express = require('express');
const neo4j = require('neo4j-driver');

const PORT = parseInt(process.env.GRAPHITI_SERVER_PORT || '8083', 10);
const API_KEY = process.env.GRAPHITI_API_KEY || 'local-dev-key';
const DEFAULT_GRAPH = process.env.GRAPHITI_DEFAULT_GRAPH || 'impactshop_memory';
const NEO4J_URL = process.env.GRAPHITI_NEO4J_URL || 'bolt://neo4j:7687';
const NEO4J_USER = process.env.GRAPHITI_NEO4J_USER || process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.GRAPHITI_NEO4J_PASSWORD || process.env.NEO4J_PASSWORD || 'impactshop-local';

const driver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
const app = express();
const MAX_FETCH_LIMIT = 400;

app.use(express.json({ limit: '5mb' }));

app.use((req, res, next) => {
  if (!API_KEY) {
    return next();
  }
  const header = req.header('X-Graphiti-Api-Key');
  if (header && header === API_KEY) {
    return next();
  }
  return res.status(401).json({ error: 'Missing or invalid API key' });
});

app.get('/healthz', async (req, res) => {
  try {
    await driver.verifyConnectivity();
    res.json({ status: 'ok', neo4j: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

app.get('/aggregations/ngo-promotions', async (req, res) => {
  if (API_KEY && req.get('X-Graphiti-Api-Key') !== API_KEY) {
    return res.status(401).json({ error: 'Missing or invalid API key' });
  }
  const limitRaw = Number.parseInt(String(req.query.limit ?? ''), 10);
  const limit = Math.max(1, Math.min(Number.isNaN(limitRaw) ? 20 : limitRaw, 200));
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (ngo:NGO)-[rel:BENEFITS_NGO|SUPPORTS_NGO]->(node)
       WHERE node:Promotion OR node:ShopReliability
       WITH ngo,
            node,
            CASE
              WHEN 'Promotion' IN labels(node) THEN node.discount_percent
              ELSE node.manual_success_rate * 100
            END AS normalized_discount,
            CASE
              WHEN node.scraped_at IS NOT NULL THEN node.scraped_at
              WHEN node.generated_at IS NOT NULL THEN node.generated_at
              WHEN node.updated_at IS NOT NULL THEN node.updated_at
              ELSE NULL
            END AS reference_time
       RETURN ngo.slug AS ngo_slug,
              count(node) AS promotion_count,
              round(avg(normalized_discount), 2) AS avg_discount_percent,
              max(reference_time) AS last_scraped_at
       ORDER BY promotion_count DESC
       LIMIT $limit`,
      { limit: neo4j.int(limit) },
    );
    const rows = result.records.map((record) => ({
      ngo_slug: record.get('ngo_slug') || 'unknown',
      promotion_count: record.get('promotion_count')?.toNumber?.() ?? record.get('promotion_count'),
      avg_discount_percent: record.get('avg_discount_percent') ?? null,
      last_scraped_at: record.get('last_scraped_at'),
    }));
    res.json({ data: rows, meta: { limit } });
  } catch (error) {
    console.error('Graphiti aggregation error', error);
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

app.post('/facts', async (req, res) => {
  const { facts } = req.body || {};
  if (!Array.isArray(facts) || facts.length === 0) {
    return res.status(400).json({ error: 'facts array is required' });
  }
  const session = driver.session();
  try {
    for (const fact of facts) {
      await upsertFact(session, fact || {});
    }
    res.json({ inserted: facts.length });
  } catch (error) {
    console.error('Graphiti ingest error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

app.post('/query', async (req, res) => {
  const graph = req.body?.graph || DEFAULT_GRAPH;
  const query = req.body?.query || {};
  const text = (query.text || '').toString();
  const normalizedText = text.trim().toLowerCase();
  const limit = Math.max(1, Math.min(parseInt(query.limit, 10) || 50, 200));
  const filters = Array.isArray(query.filters) ? query.filters : [];
  const userFilter = filters.find((filter) => ['user_id', 'session_id', 'conversation_id'].includes((filter.field || '').toLowerCase()));
  const userId = userFilter?.value ? String(userFilter.value) : undefined;
  const labelFilters = Array.isArray(query.labels) ? query.labels.map((label) => String(label)) : [];
  const minScore = typeof query.min_score === 'number' ? Number(query.min_score) : undefined;
  const fetchLimit = Math.min(limit * 4, MAX_FETCH_LIMIT);

  const session = driver.session();
  try {
    const nodeResult = await session.run(
      `MATCH (n)
       WHERE ($graph IS NULL OR n.graph = $graph)
         AND ($labelsSize = 0 OR any(label IN labels(n) WHERE label IN $labels))
       RETURN n, elementId(n) AS id
       LIMIT toInteger($fetchLimit)`,
      {
        graph,
        labels: labelFilters,
        labelsSize: labelFilters.length,
        text: normalizedText,
        fetchLimit,
      },
    );

    const now = Date.now();
    const scoredNodes = nodeResult.records
      .map((record) => serializeNode(record))
      .map((node) => {
        const scoring = calculateHybridScore(node, normalizedText, userId, now);
        return {
          ...node,
          score: scoring.total,
          score_details: scoring.breakdown,
        };
      });

    const filteredNodes = normalizedText
      ? scoredNodes.filter(node => nodeMatchesSearch(node, normalizedText))
      : scoredNodes;

    const nodes = filteredNodes
      .filter((node) => (minScore === undefined ? true : (node.score ?? 0) >= minScore))
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, limit);
    const nodeIds = nodes.map((node) => node.id);

    let relationships = [];
    if (nodeIds.length > 0) {
      const relResult = await session.run(
        `MATCH (a)-[r]->(b)
         WHERE elementId(a) IN $ids AND elementId(b) IN $ids
         RETURN elementId(a) AS sourceId, elementId(b) AS targetId, type(r) AS type, elementId(r) AS relId, r`,
        { ids: nodeIds },
      );
      relationships = relResult.records.map((record) => serializeRelationship(record));
    }

    res.json({
      nodes,
      relationships,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Graphiti query error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

function sanitizeLabel(value, fallback) {
  const raw = (value || fallback || 'Node').toString();
  const cleaned = raw.replace(/[^A-Za-z0-9_]/g, '_');
  if (/^[A-Za-z_]/.test(cleaned)) {
    return cleaned;
  }
  return `N_${cleaned}`;
}

function buildIdentityClause(prefix, identity = {}) {
  const entries = Object.entries(identity).filter(([_, value]) => value !== undefined && value !== null);
  if (entries.length === 0) {
    throw new Error('Identity is required to upsert facts');
  }
  const clauseParts = [];
  const params = {};
  entries.forEach(([key, value], index) => {
    const paramName = `${prefix}_${index}`;
    clauseParts.push(`${key}: $${paramName}`);
    params[paramName] = value;
  });
  return { clause: `{ ${clauseParts.join(', ')} }`, params };
}

function cleanProperties(properties = {}) {
  return Object.entries(properties).reduce((acc, [key, value]) => {
    if (value === undefined || value === null) {
      return acc;
    }
    acc[key] = value;
    return acc;
  }, {});
}

async function upsertFact(session, fact) {
  const label = sanitizeLabel(fact.type, 'Fact');
  const identityData = buildIdentityClause('src', fact.identity || {});
  const props = {
    ...cleanProperties(fact.properties || {}),
    graph: fact.graph || DEFAULT_GRAPH,
    updated_at: new Date().toISOString(),
  };

  const mergeQuery = `MERGE (node:${label} ${identityData.clause}) SET node += $props RETURN elementId(node) AS id`;
  await session.run(mergeQuery, { ...identityData.params, props });

  if (Array.isArray(fact.relations)) {
    for (const relation of fact.relations) {
      await upsertRelation(session, label, identityData, relation);
    }
  }
}

async function upsertRelation(session, sourceLabel, sourceIdentity, relation) {
  if (!relation || !relation.target) {
    return;
  }
  const targetLabel = sanitizeLabel(relation.target.type, 'Target');
  const relationType = sanitizeLabel(relation.type, 'RELATED_TO');
  const targetIdentity = buildIdentityClause('tgt', relation.target.identity || {});
  const relProps = cleanProperties(relation.properties || {});

  const relationQuery = `
    MATCH (source:${sourceLabel} ${sourceIdentity.clause})
    MERGE (target:${targetLabel} ${targetIdentity.clause})
    MERGE (source)-[rel:${relationType}]->(target)
    SET rel += $relProps
    RETURN count(rel) AS total
  `;

  await session.run(relationQuery, {
    ...sourceIdentity.params,
    ...targetIdentity.params,
    relProps,
  });
}

function toNative(value) {
  if (neo4j.isInt(value)) {
    return value.toNumber();
  }
  if (Array.isArray(value)) {
    return value.map((item) => toNative(item));
  }
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, toNative(val)]));
  }
  return value;
}

function nodeMatchesSearch(node, text) {
  if (!node || !node.properties) {
    return false;
  }
  const needle = text.toLowerCase();
  return Object.values(node.properties).some((value) => normalizePropertyValue(value).includes(needle));
}

function normalizePropertyValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizePropertyValue(entry)).join(' ');
  }
  return String(value).toLowerCase();
}

function serializeNode(record) {
  const node = record.get('n');
  const id = record.get('id');
  return {
    id,
    labels: node.labels,
    properties: toNative(node.properties),
  };
}

function serializeRelationship(record) {
  const rel = record.get('r');
  return {
    id: record.get('relId'),
    type: record.get('type'),
    source: record.get('sourceId'),
    target: record.get('targetId'),
    properties: toNative(rel.properties),
  };
}

function shutdown() {
  driver
    .close()
    .catch((error) => {
      console.error('Failed to close Neo4j driver', error);
    })
    .finally(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

app.listen(PORT, () => {
  console.log(`Graph memory API listening on port ${PORT}`);
});

function calculateHybridScore(node, text, userId, now) {
  const labels = node.labels || [];
  const props = node.properties || {};
  const isPromotion = labels.includes('Promotion');
  const isConversation = labels.includes('ConversationTurn');
  const keywords = text ? text.split(/\s+/).filter(Boolean) : [];
  let score = 0;
  const breakdown = {
    user_match: 0,
    keyword_hits: [],
    keyword_score: 0,
    recency_boost: 0,
    type_boost: 0,
    penalties: 0,
  };
  if (userId) {
    const userMatches = ['user_id', 'userId', 'session_id', 'sessionId', 'conversation_id', 'conversationId'].some((key) => {
      const value = props[key];
      return value && String(value) === userId;
    });
    if (userMatches) {
      score += 40;
      breakdown.user_match = 40;
    } else {
      score -= 5;
      breakdown.penalties -= 5;
    }
  }
  if (keywords.length > 0) {
    const textBlob = extractTextBlob(props).toLowerCase();
    for (const keyword of keywords) {
      if (textBlob.includes(keyword)) {
        score += 10;
        breakdown.keyword_hits.push(keyword);
        breakdown.keyword_score += 10;
      }
    }
  }
  const recencyField = props.timestamp || props.scraped_at || props.updated_at;
  if (recencyField) {
    const recency = Date.parse(recencyField);
    if (!Number.isNaN(recency)) {
      const ageHours = Math.max(0, (now - recency) / 3_600_000);
      const boost = Math.max(0, 40 - ageHours);
      score += boost;
      breakdown.recency_boost = boost;
    }
  }
  if (isPromotion) {
    score += 5;
    breakdown.type_boost += 5;
  }
  if (isConversation) {
    score += 3;
    breakdown.type_boost += 3;
  }
  return { total: score, breakdown };
}

function extractTextBlob(props = {}) {
  const values = Object.entries(props)
    .filter(([, value]) => typeof value === 'string')
    .map(([, value]) => value);
  return values.join(' ').slice(0, 2000);
}
