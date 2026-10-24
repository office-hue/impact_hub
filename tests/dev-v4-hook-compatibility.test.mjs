import assert from 'node:assert/strict';
import test from 'node:test';
import { renderHookImages } from '../scripts/dev-v4-target-hooks.mjs';
test('optional hook rendering removes procedural hooks and embeds no controller', () => {
  const result = renderHookImages('untrusted old adapter text');
  assert.equal(result.status, 'rendered');
  assert.equal(result.authorityGranted, false);
  for (const name of ['post-checkout', 'post-merge', 'post-commit', 'commit-msg']) assert.equal(result.changes[name].state, 'absent');
  for (const name of ['pre-commit', 'pre-push']) {
    const image = Buffer.from(result.changes[name].bytes, 'base64').toString();
    assert.match(image, /optional/);
    assert.doesNotMatch(image, /installed-controller|worktree-active|memory:gate|untrusted old adapter text/);
  }
});
