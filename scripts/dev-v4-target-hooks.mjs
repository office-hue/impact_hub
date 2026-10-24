/** Read-only optional hook renderer. No lifecycle admission or installation. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function renderHookImages() {
  const result = spawnSync('python3', ['-B', path.join(root, 'scripts/workspace-hooks.py'), 'install', '--repo', root], { encoding: 'utf8' });
  if (result.error || result.status) return { status: 'unavailable', advisoryOnly: true, authorityGranted: false, changes: {}, sourceChecks: 'not-evaluated' };
  const report = JSON.parse(result.stdout);
  return { status: 'rendered', authorityGranted: false, sourceChecks: 'not-evaluated', changes: Object.fromEntries(
    ['pre-commit', 'commit-msg', 'pre-push', 'post-commit', 'post-merge', 'post-checkout'].map(name => {
      const text = report.renderedHooks[name];
      if (text === undefined) return [name, { state: 'absent' }];
      const raw = Buffer.from(text);
      return [name, { state: 'file', bytes: raw.toString('base64'), mode: 0o755, sha256: crypto.createHash('sha256').update(raw).digest('hex') }];
    })) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(renderHookImages()));
