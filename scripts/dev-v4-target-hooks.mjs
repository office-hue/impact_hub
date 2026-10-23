/** Deterministic Hub-only hook images. This renderer never installs or grants authority. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const node = '/usr/local/libexec/ai-agent-shared-node/node/bin/node';
const header = `#!/bin/bash
set -euo pipefail
PATH=/usr/local/libexec/ai-agent-shared-node/node/bin:/usr/bin:/bin:/usr/sbin:/sbin
export PATH GIT_NO_REPLACE_OBJECTS=1 GIT_OPTIONAL_LOCKS=0
unset NODE_OPTIONS NODE_PATH OFFICE_DEV_CONTROLLER OFFICE_DEV_ENGINE_DESCRIPTOR
git_read() { /usr/bin/git -c core.fsmonitor=false "$@"; }
deny() { echo "[hub-hook] $1" >&2; exit 1; }
REPO_ROOT="$(git_read rev-parse --show-toplevel)"
cd "$REPO_ROOT"
BRANCH="$(git_read branch --show-current)"
`;
const legacy = `legacy_identity() {
  local marker
  marker="$(git_read rev-parse --git-path worktree-active.json)"
  [[ -f "$marker" && ! -L "$marker" ]] || return 1
  "${node}" --input-type=module - "$marker" "$REPO_ROOT" "$BRANCH" <<'HUB_LEGACY_IDENTITY'
import fs from 'node:fs';
try {
  const [file, root, branch] = process.argv.slice(2), marker = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!branch || marker.branch !== branch || (marker.path !== undefined && marker.path !== root)) process.exit(1);
} catch { process.exit(1); }
HUB_LEGACY_IDENTITY
}
`;

// Injection is an in-process fixture seam, never a CLI/env-selected executable.
// The real renderer always reads its fixed sibling; frozen output is independently reviewed.
export function renderHookImages(adapterSource = fs.readFileSync(new URL('./dev-v4-installed-controller-adapter.mjs', import.meta.url), 'utf8')) {
  if (typeof adapterSource !== 'string' || adapterSource.includes('\0')
    || /^HUB_FROZEN_ADAPTER\r?$/m.test(adapterSource)) throw new Error('adapter_source_invalid');
  // Four existing registered checkouts have precisely this pre-range audit.
  // The successor preserves strict checks and adds exact-range plumbing,
  // committed env-diff inspection and explicit push-base resolution. Freeze
  // that reviewed successor rather than modifying
  // old worktree source or silently auditing a different upstream range.
  const legacyAuditDigest = '579cad7c22cf952c712f14e7d2a4b1c57d964ba4425b95a4c79e2222083b842d';
  const auditSource = fs.readFileSync(new URL('./safe-repo-audit.sh', import.meta.url));
  if (crypto.createHash('sha256').update(auditSource).digest('hex') !== 'd2597be9e71d723271f270a3ff9de667cc039a14825b0db9b2cb4232c8b33f96') throw new Error('audit_render_source_changed');
  const context = `${legacy}
continuity() {
  local namespace
  namespace="$(git_read rev-parse --git-path dev-v4-lifecycle)"
  if [[ -e "$namespace" || -L "$namespace" ]]; then
    "${node}" --input-type=module - "$REPO_ROOT" "$1" <<'HUB_FROZEN_ADAPTER'
${adapterSource}
try { process.exitCode = run(['continuity', '--repo', process.argv[2], '--mode', process.argv[3]]); }
catch { process.stderr.write('[hub-hook] v3-continuity-unverified\\n'); process.exitCode = 1; }
HUB_FROZEN_ADAPTER
  else
    legacy_identity
  fi
}
`;
  const preCommit = `${header}${context}
[[ -n "$BRANCH" && "$BRANCH" != main && "$BRANCH" != master ]] || deny protected-or-detached-branch
continuity local
`;
  const prePush = `${header}${context}
[[ -n "$BRANCH" && "$BRANCH" != main && "$BRANCH" != master ]] || deny protected-or-detached-branch
[[ "${'${1:-}'}" == origin && "${'${2:-}'}" == https://github.com/office-hue/impact_hub.git ]] || deny transport-mismatch
[[ "$(git_read config --local --get-all remote.origin.url)" == https://github.com/office-hue/impact_hub.git ]] || deny origin-mismatch
[[ -z "$(git_read status --porcelain --untracked-files=all)" ]] || deny dirty-push
[[ -d "$REPO_ROOT/scripts" && ! -L "$REPO_ROOT/scripts" ]] || deny unsafe-scripts-directory
for rel in scripts/start-feature-worktree.sh scripts/git-health-check.sh docs/pr-policy.md .github/pull_request_template.md PR-EXIT-CHECKLIST.md scripts/safe-repo-audit.sh; do
  [[ -f "$REPO_ROOT/$rel" && ! -L "$REPO_ROOT/$rel" ]] || deny missing-or-unsafe-policy-file
done
row_count=0
push_row=''
while IFS= read -r row; do
  if [[ -n "$row" ]]; then row_count=$((row_count + 1)); push_row="$row"; fi
done
[[ "$row_count" -eq 1 ]] || deny unsupported-push-ref-count
read -r local_ref local_sha remote_ref remote_sha extra <<< "$push_row"
[[ -z "${'${extra:-}'}" && "$local_ref" == "refs/heads/$BRANCH" && "$remote_ref" == "refs/heads/$BRANCH" ]] || deny unsupported-push-ref
[[ "$local_sha" =~ ^[0-9a-f]{40}$ && "$remote_sha" =~ ^[0-9a-f]{40}$ ]] || deny malformed-push-sha
[[ "$local_sha" == "$(git_read rev-parse HEAD)" ]] || deny pushed-head-mismatch
zero=0000000000000000000000000000000000000000
if [[ "$remote_sha" == "$zero" ]]; then
  base="$(git_read merge-base "$local_sha" refs/remotes/origin/main)" || deny missing-source-base
else
  git_read cat-file -e "$remote_sha^{commit}" || deny missing-remote-base
  git_read merge-base --is-ancestor "$remote_sha" "$local_sha" || deny non-fast-forward
  base="$remote_sha"
fi
continuity push
audit_digest="$("${node}" --input-type=module - "$REPO_ROOT/scripts/safe-repo-audit.sh" <<'HUB_AUDIT_DIGEST'
import fs from 'node:fs'; import crypto from 'node:crypto';
process.stdout.write(crypto.createHash('sha256').update(fs.readFileSync(process.argv[2])).digest('hex'));
HUB_AUDIT_DIGEST
)"
if [[ "$audit_digest" == ${legacyAuditDigest} ]]; then
  echo '[hub-hook] known legacy audit: frozen exact-range compatibility reader' >&2
  /bin/bash -s -- --repo "$REPO_ROOT" --strict --mode range --base "$base" --head "$local_sha" <<'HUB_FROZEN_AUDIT'
${auditSource.toString('utf8')}
HUB_FROZEN_AUDIT
else
  /bin/bash "$REPO_ROOT/scripts/safe-repo-audit.sh" --repo "$REPO_ROOT" --strict --mode range --base "$base" --head "$local_sha"
fi
# Optional Secretary context is advisory; no foreign memory command is invoked.
`;
  const postCommit = `${header}
printf '%s\n' '[hub-hook] commit recorded; no automatic memory write'
`;
  const postMerge = `${header}
printf '%s\n' '[hub-hook] merge recorded; lifecycle reconciliation remains explicit'
`;
  const postCheckout = `${header}
[[ "${'${3:-1}'}" == 1 && -n "$BRANCH" ]] || exit 0
marker="$(git_read rev-parse --git-path worktree-active.json)"
if [[ -e "$marker" || -L "$marker" ]]; then
  ${legacy}
  if ! legacy_identity; then echo '[hub-hook] WARNING checkout completed with marker mismatch; stop before protected work' >&2; fi
fi
`;
  const scripts = { 'pre-commit': preCommit, 'pre-push': prePush, 'post-commit': postCommit, 'post-merge': postMerge, 'post-checkout': postCheckout };
  return { changes: Object.fromEntries(Object.entries(scripts).map(([name, text]) => {
    const raw = Buffer.from(text);
    if (raw.length > 65536) throw new Error('hook_image_too_large');
    return [name, { state: 'file', bytes: raw.toString('base64'), mode: 0o755, sha256: crypto.createHash('sha256').update(raw).digest('hex') }];
  })) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== '--render') {
    process.stderr.write('Usage: node scripts/dev-v4-target-hooks.mjs --render (no installation)\n'); process.exitCode = 1;
  } else process.stdout.write(JSON.stringify(renderHookImages()) + '\n');
}
