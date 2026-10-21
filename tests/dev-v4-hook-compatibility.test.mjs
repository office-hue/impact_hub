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
  return {tmp,repo,git,base,head,marker,hooks,invoke,row,push,v3};
}

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
