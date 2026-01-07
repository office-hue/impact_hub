#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${HOME}/ai-agent"
NODE_BIN="${HOME}/node-v20/bin/node"
SERVICE_SCRIPT="${APP_DIR}/scripts/ai-agent-service.cjs"
LOG_FILE="${APP_DIR}/ai-agent.log"
LOCK_FILE="${APP_DIR}/tmp/state/ai-agent-keepalive.lock"
GRAPHITI_SCRIPT="${APP_DIR}/graphiti-stub.cjs"
GRAPHITI_LOG="${APP_DIR}/graphiti.log"
AGENT_HEALTH_URL="${AI_AGENT_HEALTH_URL:-http://127.0.0.1:4000/healthz}"
GRAPHITI_HEALTH_URL="${AI_AGENT_GRAPHITI_HEALTH_URL:-http://127.0.0.1:8083/healthz}"

mkdir -p "${APP_DIR}/tmp/state"
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  exit 0
fi

if [ -f "${GRAPHITI_SCRIPT}" ]; then
  if ! curl -fsS --max-time 3 "${GRAPHITI_HEALTH_URL}" >/dev/null 2>&1; then
    pkill -f "graphiti-stub.cjs" >/dev/null 2>&1 || true
    nohup env PATH="${HOME}/node-v20/bin:${PATH}" "${NODE_BIN}" "${GRAPHITI_SCRIPT}" >>"${GRAPHITI_LOG}" 2>&1 &
  fi
fi

if pgrep -a node | grep -q "scripts/ai-agent-service.cjs"; then
  if curl -fsS --max-time 3 "${AGENT_HEALTH_URL}" >/dev/null 2>&1; then
    exit 0
  fi
  pkill -f "scripts/ai-agent-service.cjs" >/dev/null 2>&1 || true
  sleep 1
fi

cd "${APP_DIR}"
nohup env PATH="${HOME}/node-v20/bin:${PATH}" "${NODE_BIN}" "${SERVICE_SCRIPT}" >>"${LOG_FILE}" 2>&1 &
