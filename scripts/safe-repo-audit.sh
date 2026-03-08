#!/usr/bin/env bash
set -euo pipefail

# Safe pre-push audit: read-only checks for potentially sensitive changes.
# Default behavior: warn only (exit 0). Use --strict to fail on findings.

STRICT=0
TARGET_PATH="."
MODE="local"
PUSH_BASE=""
PUSH_RANGE=""

usage() {
  cat <<'EOF'
Usage:
  safe-repo-audit.sh [--repo <path>] [--strict] [--mode local|push]

Options:
  --repo <path>   Target git repository path (default: current directory)
  --strict        Exit non-zero when warnings are found
  --mode <mode>   Scan mode: local (working tree) or push (committed range to upstream)
  -h, --help      Show this help

Examples:
  ./scripts/safe-repo-audit.sh --repo /Users/.../impact_hub
  ./scripts/safe-repo-audit.sh --repo /Users/.../impactshop-notes --strict
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      TARGET_PATH="${2:-}"
      shift 2
      ;;
    --strict)
      STRICT=1
      shift
      ;;
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if ! REPO_ROOT="$(git -C "$TARGET_PATH" rev-parse --show-toplevel 2>/dev/null)"; then
  echo "ERROR: not a git repository: $TARGET_PATH" >&2
  exit 1
fi

if [[ "$MODE" != "local" && "$MODE" != "push" ]]; then
  echo "ERROR: --mode must be 'local' or 'push' (got: $MODE)" >&2
  exit 1
fi

cd "$REPO_ROOT"

BRANCH="$(git branch --show-current 2>/dev/null || echo detached)"
HEAD_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

CHANGED_LIST="$TMP_DIR/changed-files.txt"
FILTERED_CHANGED_LIST="$TMP_DIR/changed-files.filtered.txt"
ADDED_LINES="$TMP_DIR/added-lines.txt"
RISKY_NAME_HITS="$TMP_DIR/risky-name-hits.txt"
ENV_KEY_HITS="$TMP_DIR/env-key-hits.txt"
ENV_KEY_WARN_HITS="$TMP_DIR/env-key-warn-hits.txt"
ENV_KEY_INFO_HITS="$TMP_DIR/env-key-info-hits.txt"
CONTENT_HITS="$TMP_DIR/content-hits.txt"
TRACKED_SENSITIVE="$TMP_DIR/tracked-sensitive.txt"
MODULE_CHANGE_HITS="$TMP_DIR/module-change-hits.txt"
DOCS_MD_HITS="$TMP_DIR/docs-md-hits.txt"
SNAPSHOT_HITS="$TMP_DIR/snapshot-hits.txt"
NOTES_OR_CONV_HITS="$TMP_DIR/notes-or-conv-hits.txt"
NEW_MODULE_FILES="$TMP_DIR/new-module-files.txt"
BASTION_GUARD_HITS="$TMP_DIR/bastion-guard-hits.txt"

if [[ "$MODE" == "push" ]]; then
  upstream_ref="${SAFE_REPO_AUDIT_UPSTREAM:-@{upstream}}"
  if git rev-parse --verify "$upstream_ref" >/dev/null 2>&1; then
    PUSH_BASE="$(git merge-base HEAD "$upstream_ref")"
  else
    PUSH_BASE="$(git hash-object -t tree /dev/null)"
  fi
  PUSH_RANGE="${PUSH_BASE}..HEAD"
fi

{
  if [[ "$MODE" == "push" ]]; then
    git diff --name-only "$PUSH_RANGE"
  else
    git diff --name-only
    git diff --cached --name-only
    git ls-files --others --exclude-standard
  fi
} | sed '/^$/d' | sort -u > "$CHANGED_LIST"

# Filter out noisy dependency/artifact paths for path-based checks.
grep -Eiv \
  '(^|/)(vendor|node_modules|\.venv[^/]*|wallet-diagnostics-[^/]+|status_snapshots|\.backups|\.git)(/|$)' \
  "$CHANGED_LIST" > "$FILTERED_CHANGED_LIST" || true

{
  if [[ "$MODE" == "push" ]]; then
    git diff -U0 --no-color "$PUSH_RANGE"
  else
    git diff -U0 --no-color
    git diff --cached -U0 --no-color
  fi
} | awk '/^\+[^+]/ {print substr($0,2)}' > "$ADDED_LINES"

echo "== Safe Repo Audit =="
echo "Repo:    $REPO_ROOT"
echo "Branch:  $BRANCH"
echo "HEAD:    $HEAD_SHA"
echo "Mode:    $MODE"
if [[ "$MODE" == "push" ]]; then
  echo "Range:   ${PUSH_RANGE}"
fi
echo "Changed: $(wc -l < "$CHANGED_LIST" | tr -d ' ') files"
echo "Scan set (noise-filtered): $(wc -l < "$FILTERED_CHANGED_LIST" | tr -d ' ') files"
echo

WARNINGS=0
DOC_GUARD_BYPASS="${SAFE_REPO_AUDIT_ALLOW_DOC_GAP:-0}"

if [[ ! -s "$CHANGED_LIST" ]]; then
  echo "OK: no local changes detected."
  exit 0
fi

register_warning() {
  local message="$1"
  if [[ "$DOC_GUARD_BYPASS" == "1" ]]; then
    echo "BYPASS: $message"
    echo "BYPASS: SAFE_REPO_AUDIT_ALLOW_DOC_GAP=1 miatt dokumentációs gate nem blokkol."
    echo
    return 0
  fi
  WARNINGS=$((WARNINGS + 1))
  echo "WARN: $message"
  echo
}

# 1) Risky file name patterns in changed/untracked files.
grep -Ein -- \
  '(^|/)\.env($|\.|/)|\.pem$|\.p12$|\.pfx$|\.key$|(^|/)id_rsa($|\.|/)|(^|/)(secrets?|credentials?)(/|$)|password|passwd' \
  "$FILTERED_CHANGED_LIST" > "$RISKY_NAME_HITS" || true

if [[ -s "$RISKY_NAME_HITS" ]]; then
  WARNINGS=$((WARNINGS + 1))
  echo "WARN: potentially sensitive changed file paths:"
  sed -E 's/^[0-9]+://' "$RISKY_NAME_HITS" | sed -n '1,80p'
  echo
fi

# 2) Secret-like strings in added lines (staged + unstaged diffs).
grep -Ein -- \
  '-----BEGIN (RSA|EC|OPENSSH|DSA|PGP) PRIVATE KEY-----|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{80,}|xox[baprs]-[A-Za-z0-9-]{10,}|(api[_-]?key|secret|token|password|passwd|client_secret)[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"']{12,}["'"'"']' \
  "$ADDED_LINES" > "$CONTENT_HITS" || true

if [[ -s "$CONTENT_HITS" ]]; then
  WARNINGS=$((WARNINGS + 1))
  echo "WARN: secret-like values detected in added lines (first 40):"
  sed -n '1,40p' "$CONTENT_HITS"
  echo
fi

# 3) Extra check for env/deploy files: show only key names, never values.
while IFS= read -r file; do
  [[ -n "$file" ]] || continue
  if [[ "$file" =~ (^|/)\.env($|\.|/) || "$file" =~ (^|/)\.deploy\.(production|staging)\.env$ ]]; then
    {
      git diff -U0 --no-color -- "$file"
      git diff --cached -U0 --no-color -- "$file"
    } | awk '/^\+[^+]/ {print substr($0,2)}' \
      | grep -E '^[A-Za-z_][A-Za-z0-9_]*=' \
      | awk -F= '
          {
            key=$1
            val=substr($0, index($0, "=") + 1)
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", key)
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", val)
            gsub(/^["'"'"']|["'"'"']$/, "", val)
            low=tolower(val)
            if (val == "") next
            if (low ~ /^(example|sample|dummy|changeme|change_me|todo)$/) next
            if (low ~ /^your_[a-z0-9_]+$/) next
            if (val ~ /^<.*>$/) next
            print key
          }
        ' \
      | sort -u \
      | while IFS= read -r key; do
          [[ -n "$key" ]] && echo "$file :: $key"
        done >> "$ENV_KEY_HITS" || true
  fi
done < "$FILTERED_CHANGED_LIST"

if [[ -s "$ENV_KEY_HITS" ]]; then
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    key="${line##*:: }"
    key_up="$(printf '%s' "$key" | tr '[:lower:]' '[:upper:]')"
    if printf '%s' "$key_up" | grep -Eq '(^|_)(SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|CLIENT_SECRET|ACCESS_KEY|API_KEY|AUTH|CREDENTIAL|CERT|PEM|P12)(_|$)|(^|_)KEY($|_)'; then
      echo "$line" >> "$ENV_KEY_WARN_HITS"
    else
      echo "$line" >> "$ENV_KEY_INFO_HITS"
    fi
  done < "$ENV_KEY_HITS"
fi

if [[ -s "$ENV_KEY_WARN_HITS" ]]; then
  WARNINGS=$((WARNINGS + 1))
  echo "WARN: sensitive-looking env keys modified (values hidden):"
  sed -n '1,80p' "$ENV_KEY_WARN_HITS"
  echo
fi

if [[ -s "$ENV_KEY_INFO_HITS" ]]; then
  echo "INFO: non-sensitive env keys modified (values hidden):"
  sed -n '1,80p' "$ENV_KEY_INFO_HITS"
  echo
fi

# 4) Documentation continuity checks for module-level changes.
grep -E -- \
  '^(apps/|src/|wp-content/mu-plugins/|wp-content/plugins/|mu-plugins/|scripts/|bin/|services/|config/|types/|packages/|lib/|tools/)' \
  "$FILTERED_CHANGED_LIST" \
  | grep -Eiv -- \
    '(^|/)(docs/|conversation-summaries/|chatgpt-history/|\.codex/|vendor/|node_modules/|status_snapshots/)' \
  > "$MODULE_CHANGE_HITS" || true

if [[ -s "$MODULE_CHANGE_HITS" ]]; then
  echo "INFO: module-level changes detected:"
  sed -n '1,60p' "$MODULE_CHANGE_HITS"
  echo

  grep -E -- '^docs/[^[:space:]]+\.(md|mdx)$' "$FILTERED_CHANGED_LIST" > "$DOCS_MD_HITS" || true
  grep -E -- '^system-status-snapshot\.md$' "$FILTERED_CHANGED_LIST" > "$SNAPSHOT_HITS" || true

  if [[ -f "$REPO_ROOT/notes.md" || -d "$REPO_ROOT/conversation-summaries" ]]; then
    grep -E -- '^(notes\.md|conversation-summaries/[^[:space:]]+\.md)$' "$FILTERED_CHANGED_LIST" > "$NOTES_OR_CONV_HITS" || true
  fi

  if [[ ! -s "$DOCS_MD_HITS" ]]; then
    register_warning "module change without docs/*.md update (minimum 1 docs markdown frissítés kötelező)."
  fi

  if [[ ! -s "$SNAPSHOT_HITS" ]]; then
    register_warning "module change without system-status-snapshot.md update (impactall/snapshot folytonosság sérül)."
  fi

  if [[ -f "$REPO_ROOT/notes.md" || -d "$REPO_ROOT/conversation-summaries" ]]; then
    if [[ ! -s "$NOTES_OR_CONV_HITS" ]]; then
      register_warning "module change without notes.md vagy conversation-summaries/* frissítés."
    fi
  fi
fi

# 5) New module files must extend bastion/guard documentation.
{
  if [[ "$MODE" == "push" ]]; then
    git diff --name-only --diff-filter=A "$PUSH_RANGE"
  else
    git diff --name-only --diff-filter=A
    git diff --cached --name-only --diff-filter=A
    git ls-files --others --exclude-standard
  fi
} | sed '/^$/d' | sort -u > "$NEW_MODULE_FILES"

grep -E -- \
  '^(apps/|src/|wp-content/mu-plugins/|wp-content/plugins/|mu-plugins/|services/|types/|packages/|lib/)' \
  "$NEW_MODULE_FILES" \
  | grep -Eiv -- \
    '(^|/)(docs/|conversation-summaries/|chatgpt-history/|\.codex/|vendor/|node_modules/|__tests__/|tests?/)' \
  > "$NEW_MODULE_FILES.filtered" || true

if [[ -s "$NEW_MODULE_FILES.filtered" ]]; then
  grep -E -- \
    '(^|/)(docs/bastion-guard-status\.md|docs/.*(bastion|guard).*\.(md|mdx|json|ya?ml)|scripts/.*guard.*\.(sh|ts|js|mjs|py)|\.codex/guards/)' \
    "$FILTERED_CHANGED_LIST" > "$BASTION_GUARD_HITS" || true

  if [[ ! -s "$BASTION_GUARD_HITS" ]]; then
    echo "INFO: new module files detected (first 40):"
    sed -n '1,40p' "$NEW_MODULE_FILES.filtered"
    echo
    register_warning "new module without bastion/guard extension update (pl. docs/bastion-guard-status.md)."
  fi
fi

# 6) Informational: tracked sensitive files already inside repository.
git ls-files | grep -Ei -- \
  '(^|/)\.env($|\.|/)|\.pem$|\.p12$|\.pfx$|\.key$|(^|/)id_rsa($|\.|/)|(^|/)(secrets?|credentials?)(/|$)|master\.key$|credentials\.yml\.enc$' \
  > "$TRACKED_SENSITIVE" || true

if [[ -s "$TRACKED_SENSITIVE" ]]; then
  echo "INFO: tracked sensitive-looking files in repo: $(wc -l < "$TRACKED_SENSITIVE" | tr -d ' ')"
  sed -n '1,40p' "$TRACKED_SENSITIVE"
  echo
fi

if [[ "$WARNINGS" -eq 0 ]]; then
  echo "RESULT: PASS (no new obvious secret leak signal in local changes)"
  exit 0
fi

echo "RESULT: WARN ($WARNINGS categories triggered)"
if [[ "$STRICT" -eq 1 ]]; then
  echo "STRICT MODE: failing due to warnings."
  exit 2
fi

echo "Non-strict mode: exit 0 (warnings only)."
exit 0
