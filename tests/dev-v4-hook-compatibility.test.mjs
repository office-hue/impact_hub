import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { renderHookImages } from '../scripts/dev-v4-target-hooks.mjs';

const origin = 'https://github.com/office-hue/impact_hub.git';
const zero = '0'.repeat(40);
const nativeNode = '/usr/local/libexec/ai-agent-shared-node/node/bin/node';
// Outer-hook fixtures substitute ONLY the embedded dispatcher adapter; real
// adapter identity/engine checks have their own isolated suite, not a host call.
const syntheticAdapter = `import fs from 'node:fs'; import path from 'node:path';
export function run(argv) {
 const root = argv[argv.indexOf('--repo')+1], mode=argv[argv.indexOf('--mode')+1];
 const s=JSON.parse(fs.readFileSync(path.join(root,'.git/dev-v4-lifecycle/state.json')));
 if(s.allowed!==true) throw new Error('fixture denial');
 fs.writeFileSync(path.join(root,'.git/fixture-continuity-mode'),mode);
 return 0;
}`;

function legacyAuditSource() {
  // Reconstruct the exact historical source from the tracked range successor;
  // the digest assertion prevents this fixture from silently becoming a stub.
  let raw = fs.readFileSync(new URL('../scripts/safe-repo-audit.sh', import.meta.url), 'utf8');
  // Reconstruct the historical buggy parser too; keep the original hash check.
  raw = raw.replace(/if \[\[ "\$MODE" == "push" \]\]; then[\s\S]*?  PUSH_RANGE="\$\{PUSH_BASE\}\.\.HEAD"/, `if [[ "$MODE" == "push" ]]; then
  upstream_ref="\${SAFE_REPO_AUDIT_UPSTREAM:-@{upstream}}"
  if git rev-parse --verify "$upstream_ref" >/dev/null 2>&1; then
    PUSH_BASE="$(git merge-base HEAD "$upstream_ref")"
  else
    PUSH_BASE="$(git hash-object -t tree /dev/null)"
  fi
  PUSH_RANGE="\${PUSH_BASE}..HEAD"`);
  raw = raw.replace('RANGE_BASE=""\nRANGE_HEAD=""\n', '')
    .replace('[--mode local|push|range] [--base <sha> --head <sha>]', '[--mode local|push]')
    .replace('  --base <sha>    Exact base commit for range mode\n  --head <sha>    Exact head commit for range mode\n', '')
    .replace('    --base)\n      RANGE_BASE="${2:-}"\n      shift 2\n      ;;\n    --head)\n      RANGE_HEAD="${2:-}"\n      shift 2\n      ;;\n', '')
    .replace(' && "$MODE" != "range"', '')
    .replace("'local', 'push' or 'range'", "'local' or 'push'")
    .replace(/elif \[\[ "\$MODE" == "range" \]\]; then[\s\S]*?PUSH_RANGE="\$\{PUSH_BASE\}\.\.\$\{RANGE_HEAD\}"\n/, '')
    .replaceAll('[[ "$MODE" != "local" ]]', '[[ "$MODE" == "push" ]]')
    .replace('      if [[ "$MODE" == "push" ]]; then\n        git diff -U0 --no-color "$PUSH_RANGE" -- "$file"\n      else\n        git diff -U0 --no-color -- "$file"\n        git diff --cached -U0 --no-color -- "$file"\n      fi', '      git diff -U0 --no-color -- "$file"\n      git diff --cached -U0 --no-color -- "$file"');
  assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), '579cad7c22cf952c712f14e7d2a4b1c57d964ba4425b95a4c79e2222083b842d');
  return raw;
}

function fixture(t, adapter = syntheticAdapter, auditSource = null) {
  const tmp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'hub-hook-fixture-')));
  t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
  const repo=path.join(tmp,'repo'), empty=path.join(tmp,'empty-hooks');
  fs.mkdirSync(repo);fs.mkdirSync(empty);
  const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('GIT_'))),
    GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TEMPLATE_DIR:'',HOME:tmp};
  const git=(...args)=>{const r=spawnSync('/usr/bin/git',['-C',repo,...args],{env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
  git('init','-b','main');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');git('config','core.hooksPath',empty);git('remote','add','origin',origin);
  for(const file of ['scripts/start-feature-worktree.sh','scripts/git-health-check.sh','docs/pr-policy.md','.github/pull_request_template.md','PR-EXIT-CHECKLIST.md']) {
    fs.mkdirSync(path.dirname(path.join(repo,file)),{recursive:true});fs.writeFileSync(path.join(repo,file),'fixture\n');
  }
  const audit=path.join(repo,'scripts/safe-repo-audit.sh');
  fs.writeFileSync(audit,`#!/bin/bash\nexec '${process.execPath}' --input-type=module - "$@" <<'FIXTURE_AUDIT'\nimport fs from 'node:fs';fs.writeFileSync('${repo}/.git/audit-args.json',JSON.stringify(process.argv.slice(2)));\nFIXTURE_AUDIT\n`);
  if (auditSource !== null) fs.writeFileSync(audit, auditSource);
  git('add','.');git('commit','-m','fixture base');const base=git('rev-parse','HEAD');git('update-ref','refs/remotes/origin/main',base);git('checkout','-b','dev/fixture');
  fs.writeFileSync(path.join(repo,'delta.txt'),'delta');git('add','.');git('commit','-m','fixture task');const head=git('rev-parse','HEAD');
  const marker=path.join(repo,'.git/worktree-active.json');fs.writeFileSync(marker,JSON.stringify({branch:'dev/fixture',path:repo}));
  const rendered=renderHookImages(adapter), hooks=path.join(repo,'.git/frozen-hooks');fs.mkdirSync(hooks);
  // Linux CI runs disposable fixture images with its current Node. The real
  // emitted images remain byte-bound to the separately admitted Mac runtime.
  for(const [name,img] of Object.entries(rendered.changes))fs.writeFileSync(path.join(hooks,name),Buffer.from(img.bytes,'base64').toString('utf8').replaceAll(nativeNode,process.execPath),{mode:img.mode});
  const invoke=(name,args=[],input='')=>spawnSync('/bin/bash',[path.join(hooks,name),...args],{cwd:repo,env,encoding:'utf8',input,timeout:7000});
  const row=(local=head,remote=zero,remoteRef='refs/heads/dev/fixture')=>`refs/heads/dev/fixture ${local} ${remoteRef} ${remote}\n`;
  const push=(input=row(),args=['origin',origin])=>invoke('pre-push',args,input);
  const v3=(allowed=true)=>{fs.mkdirSync(path.join(repo,'.git/dev-v4-lifecycle'),{mode:0o700});fs.writeFileSync(path.join(repo,'.git/dev-v4-lifecycle/state.json'),JSON.stringify({allowed}));};
  return {tmp,repo,git,base,head,marker,hooks,invoke,row,push,v3,env};
}

const currentAudit = () => fs.readFileSync(new URL('../scripts/safe-repo-audit.sh', import.meta.url), 'utf8');
function auditPush(f, extra = {}) {
  return spawnSync('/bin/bash', [path.join(f.repo,'scripts/safe-repo-audit.sh'),'--strict','--mode','push'],
    {cwd:f.repo, env:{...f.env, SAFE_REPO_AUDIT_UPSTREAM:'', ...extra}, encoding:'utf8', timeout:7000});
}
test('push audit accepts an explicit commit without appending a brace', t => {
  const f=fixture(t,syntheticAdapter,currentAudit()),r=auditPush(f,{SAFE_REPO_AUDIT_UPSTREAM:f.base});
  assert.equal(r.status,0,r.stderr+r.stdout);assert.ok(r.stdout.includes(`Range:   ${f.base}..HEAD`));
});
test('first push without upstream uses known main, not historic files', t => {
  const f=fixture(t,syntheticAdapter,currentAudit()),r=auditPush(f);
  assert.equal(r.status,0,r.stderr+r.stdout);assert.match(r.stdout,/Changed: 1 files/);
  assert.ok(r.stdout.includes(`Range:   ${f.base}..HEAD`));
});
test('existing upstream remains the preferred push audit base', t => {
  const f=fixture(t,syntheticAdapter,currentAudit());
  f.git('update-ref','refs/remotes/origin/fixture',f.head);
  f.git('config','branch.dev/fixture.remote','origin');f.git('config','branch.dev/fixture.merge','refs/heads/fixture');
  const r=auditPush(f);assert.equal(r.status,0,r.stderr+r.stdout);
  assert.ok(r.stdout.includes(`Range:   ${f.head}..HEAD`));
});
test('invalid explicit base never silently falls back', t => {
  const f=fixture(t,syntheticAdapter,currentAudit());
  for(const base of ['missing-reference','--help',f.base+'}']) {
    const r=auditPush(f,{SAFE_REPO_AUDIT_UPSTREAM:base});
    assert.notEqual(r.status,0);assert.match(r.stderr,/audit base unavailable/);assert.doesNotMatch(r.stdout,/RESULT: PASS/);
  }
});
test('unknown first-push base returns actionable integrity error, not broad scan', t => {
  const f=fixture(t,syntheticAdapter,currentAudit());f.git('update-ref','-d','refs/remotes/origin/main');f.git('branch','-D','main');
  const r=auditPush(f);assert.notEqual(r.status,0);assert.match(r.stderr,/supply SAFE_REPO_AUDIT_UPSTREAM/);assert.doesNotMatch(r.stdout,/Range:/);
});
test('disconnected explicit base is rejected rather than replaced', t => {
  const f=fixture(t,syntheticAdapter,currentAudit());
  const tree=f.git('rev-parse','HEAD^{tree}'), orphan=f.git('commit-tree',tree,'-m','disconnected fixture');
  const r=auditPush(f,{SAFE_REPO_AUDIT_UPSTREAM:orphan});
  assert.notEqual(r.status,0);assert.match(r.stderr,/no common history/);
});
test('push and exact-range audits reject newly introduced secret-like content', t => {
  const f=fixture(t,syntheticAdapter,currentAudit());
  // Recognized synthetic header, never a credential.
  fs.writeFileSync(path.join(f.repo,'delta.txt'),['-----BEGIN','RSA','PRIVATE KEY-----'].join(' ')+'\n');
  f.git('add','.');f.git('commit','-m','synthetic negative fixture');
  const r=auditPush(f,{SAFE_REPO_AUDIT_UPSTREAM:f.base});assert.notEqual(r.status,0);assert.match(r.stdout,/secret-like values detected/);
  const native=f.push(f.row(f.git('rev-parse','HEAD')));assert.notEqual(native.status,0);assert.match(native.stdout,/secret-like values detected/);
});

function guardedPushFixture(t) {
  const f=fixture(t,syntheticAdapter,currentAudit()), bin=path.join(f.tmp,'bin');fs.mkdirSync(bin);
  const wrapper=path.join(f.repo,'scripts/guarded-push.sh');
  fs.writeFileSync(wrapper,fs.readFileSync(new URL('../scripts/guarded-push.sh',import.meta.url),'utf8').replaceAll(nativeNode,process.execPath));
  const guard=path.join(f.repo,'scripts/worktree-continuity-guard.sh');
  fs.writeFileSync(guard,'#!/bin/bash\nexit "${FIXTURE_CONTINUITY_STATUS:-0}"\n',{mode:0o644});
  fs.writeFileSync(path.join(bin,'git'),`#!/bin/bash
for arg in "$@"; do
  if [[ "$arg" == push ]]; then
    printf '%s\\n' "$@" > '${f.tmp}/push-argv'
    exit 0
  fi
done
exec /usr/bin/git "$@"
`,{mode:0o755});
  fs.writeFileSync(path.join(bin,'npm'),`#!/bin/bash\ntouch '${f.tmp}/foreign-memory-called'\nexit 77\n`,{mode:0o755});
  fs.mkdirSync(path.join(f.repo,'ai-agent/scripts'),{recursive:true});fs.writeFileSync(path.join(f.repo,'ai-agent/scripts/dev-memory.ts'),'fixture');
  const run=(extra={})=>spawnSync('/bin/bash',[wrapper,'origin','dev/fixture:dev/fixture'],{
    cwd:f.repo,env:{...f.env,PATH:bin+':'+process.env.PATH,SAFE_REPO_AUDIT_UPSTREAM:f.base,...extra},encoding:'utf8',timeout:7000});
  return {...f,run,guard};
}
test('guarded-push checks 0644 local guards and never invokes foreign memory', t => {
  const f=guardedPushFixture(t),r=f.run();assert.equal(r.status,0,r.stderr+r.stdout);
  assert.equal(fs.existsSync(path.join(f.tmp,'foreign-memory-called')),false);
  assert.deepEqual(fs.readFileSync(path.join(f.tmp,'push-argv'),'utf8').trim().split('\n'),['-C',f.repo,'push','origin','dev/fixture:dev/fixture']);
});
test('guarded-push preserves continuity denial before publishing', t => {
  const f=guardedPushFixture(t),r=f.run({FIXTURE_CONTINUITY_STATUS:'23'});
  assert.equal(r.status,23);assert.equal(fs.existsSync(path.join(f.tmp,'push-argv')),false);
});
test('guarded-push selects v3 once, without falling back after failure or orphan state', t => {
  const f=guardedPushFixture(t);f.v3();
  const adapter=path.join(f.repo,'scripts/dev-v4-installed-controller-adapter.mjs');
  fs.writeFileSync(adapter,`import fs from 'node:fs';
fs.writeFileSync('${f.tmp}/v3-argv',JSON.stringify(process.argv.slice(2)));
process.exit(Number(process.env.FIXTURE_CONTINUITY_STATUS || 0));\n`);
  const allowed=f.run();assert.equal(allowed.status,0,allowed.stderr+allowed.stdout);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.tmp,'v3-argv'))),['continuity','--repo',f.repo,'--mode','push']);
  fs.unlinkSync(path.join(f.tmp,'push-argv'));
  assert.equal(f.run({FIXTURE_CONTINUITY_STATUS:'23'}).status,23);
  assert.equal(fs.existsSync(path.join(f.tmp,'push-argv')),false);
  fs.unlinkSync(adapter);assert.notEqual(f.run().status,0);
  assert.equal(fs.existsSync(path.join(f.tmp,'push-argv')),false);
});
test('guarded-push preserves invalid-base audit denial before publishing', t => {
  const f=guardedPushFixture(t),r=f.run({SAFE_REPO_AUDIT_UPSTREAM:'missing-reference'});
  assert.notEqual(r.status,0);assert.match(r.stderr,/audit base unavailable/);assert.equal(fs.existsSync(path.join(f.tmp,'push-argv')),false);
});
test('guarded-push does not skip missing or symlinked required guards', t => {
  const f=guardedPushFixture(t);fs.unlinkSync(f.guard);
  assert.notEqual(f.run().status,0);fs.symlinkSync('/dev/null',f.guard);assert.notEqual(f.run().status,0);
  assert.equal(fs.existsSync(path.join(f.tmp,'push-argv')),false);
});

test('renderer is deterministic data-only, owns exactly five hooks and respects image limits',()=>{
  const a=renderHookImages(),b=renderHookImages();assert.deepEqual(a,b);
  assert.deepEqual(Object.keys(a.changes),['pre-commit','pre-push','post-commit','post-merge','post-checkout']);
  assert.ok(Buffer.from(a.changes['pre-commit'].bytes,'base64').toString('utf8').includes(nativeNode));
  for(const img of Object.values(a.changes)){const raw=Buffer.from(img.bytes,'base64');assert.equal(img.mode,0o755);assert.ok(raw.length<=65536);assert.equal(img.sha256,crypto.createHash('sha256').update(raw).digest('hex'));assert.equal(spawnSync('/bin/bash',['-n'],{input:raw}).status,0);}
});
test('legacy worktree without new adapter passes native feature commit and exact-range push',t=>{
  const f=fixture(t);assert.equal(f.invoke('pre-commit').status,0);const r=f.push();assert.equal(r.status,0,r.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.repo,'.git/audit-args.json'))),['--repo',f.repo,'--strict','--mode','range','--base',f.base,'--head',f.head]);
});
test('existing remote branch audits its actual remote commit not stale upstream',t=>{
  const f=fixture(t);assert.equal(f.push(f.row(f.head,f.base)).status,0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.repo,'.git/audit-args.json'))).at(-3),f.base);
});
test('known historical audit uses frozen exact range without changing old source',t=>{
  const legacy=legacyAuditSource(),f=fixture(t,syntheticAdapter,legacy),r=f.push();
  assert.equal(r.status,0,r.stderr+r.stdout);
  assert.match(r.stderr,/known legacy audit/);assert.ok(r.stdout.includes(`Range:   ${f.base}..${f.head}`));
  assert.equal(fs.readFileSync(path.join(f.repo,'scripts/safe-repo-audit.sh'),'utf8'),legacy);
});
test('known legacy compatibility preserves real strict audit denial',t=>{
  const f=fixture(t,syntheticAdapter,legacyAuditSource());
  fs.mkdirSync(path.join(f.repo,'src'));fs.writeFileSync(path.join(f.repo,'src/new-module.js'),'export const value = 1;\n');
  f.git('add','.');f.git('commit','-m','fixture missing required documentation');
  const r=f.push(f.row(f.git('rev-parse','HEAD')));
  assert.notEqual(r.status,0);assert.match(r.stderr,/known legacy audit/);assert.match(r.stdout,/STRICT MODE: failing/);
});
test('unknown legacy audit is not upgraded or retried after denial',t=>{
  const f=fixture(t,syntheticAdapter,legacyAuditSource()+'\n# unknown variant\n'),r=f.push();
  assert.notEqual(r.status,0);assert.doesNotMatch(r.stderr,/known legacy audit/);assert.match(r.stderr,/Unknown option: --base/);
});
test('v3 uses embedded reader without local adapter, dirty commit allowed, push clean',t=>{
  const f=fixture(t);fs.unlinkSync(f.marker);f.v3();assert.equal(f.invoke('pre-commit').status,0);
  assert.equal(fs.readFileSync(path.join(f.repo,'.git/fixture-continuity-mode'),'utf8'),'local');
  assert.equal(f.push().status,0);assert.equal(fs.readFileSync(path.join(f.repo,'.git/fixture-continuity-mode'),'utf8'),'push');
  fs.writeFileSync(path.join(f.repo,'untracked'),'dirty');assert.equal(f.invoke('pre-commit').status,0);assert.notEqual(f.push().status,0);
});
test('v3 denial or orphan cannot fall back to valid legacy marker',t=>{
  const f=fixture(t);f.v3(false);assert.notEqual(f.invoke('pre-commit').status,0);assert.notEqual(f.push().status,0);
  fs.unlinkSync(path.join(f.repo,'.git/dev-v4-lifecycle/state.json'));assert.notEqual(f.invoke('pre-commit').status,0);
});
for(const [name,change] of [
  ['missing marker',f=>fs.unlinkSync(f.marker)],
  ['mismatched marker',f=>fs.writeFileSync(f.marker,JSON.stringify({branch:'foreign',path:f.repo}))],
  ['symlink marker',f=>{fs.renameSync(f.marker,f.marker+'.old');fs.symlinkSync(f.marker+'.old',f.marker);}],
  ['malformed marker',f=>fs.writeFileSync(f.marker,'{')],
  ['foreign origin',f=>f.git('config','remote.origin.url','https://example.invalid/repo.git')],
  ['missing policy',f=>{fs.unlinkSync(path.join(f.repo,'docs/pr-policy.md'));f.git('add','.');f.git('commit','-m','missing fixture policy');}],
]) test(`native push rejects ${name} before audit`,t=>{const f=fixture(t);change(f);assert.notEqual(f.push().status,0);assert.equal(fs.existsSync(path.join(f.repo,'.git/audit-args.json')),false);});
for(const name of ['empty','multiple','main','tag','foreign head','malformed sha','missing remote base','transport'])test(`native push rejects ${name}`,t=>{
  const f=fixture(t);let input=f.row(),args=['origin',origin];
  if(name==='empty')input='';if(name==='multiple')input+=input;if(name==='main')input=f.row(f.head,zero,'refs/heads/main');if(name==='tag')input=f.row(f.head,zero,'refs/tags/test');
  if(name==='foreign head')input=f.row(f.base);if(name==='malformed sha')input=f.row('bad');if(name==='missing remote base')input=f.row(f.head,'a'.repeat(40));if(name==='transport')args=['origin','https://example.invalid/repo.git'];
  assert.notEqual(f.push(input,args).status,0);assert.equal(fs.existsSync(path.join(f.repo,'.git/audit-args.json')),false);
});
test('main and detached commit remain blocked',t=>{const f=fixture(t);f.git('checkout','main');assert.notEqual(f.invoke('pre-commit').status,0);f.git('checkout','--detach',f.head);assert.notEqual(f.invoke('pre-commit').status,0);});
test('post events never launch foreign memory or mutate source; checkout warning remains observational',t=>{
  const f=fixture(t),sentinel=path.join(f.tmp,'foreign-sentinel');fs.writeFileSync(sentinel,'unchanged');
  fs.writeFileSync(f.marker,JSON.stringify({branch:'foreign',path:f.repo}));
  const before=f.git('status','--porcelain');
  for(const event of ['post-commit','post-merge','post-checkout']){
    const r=f.invoke(event,[f.base,f.head,'1']);assert.equal(r.status,0,r.stderr);
    if(event==='post-checkout')assert.match(r.stderr,/WARNING checkout completed/);
    const raw=fs.readFileSync(path.join(f.hooks,event),'utf8');assert.doesNotMatch(raw,/npm|memory:|resolve_ai_agent_repo|\)\s*&/);
  }
  assert.equal(f.git('status','--porcelain'),before);assert.equal(fs.readFileSync(sentinel,'utf8'),'unchanged');
  assert.equal(fs.existsSync(path.join(f.tmp,'.local/state/ai-agent/hooks')),false);
});
