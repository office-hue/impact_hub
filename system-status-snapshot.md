## 2026-10-23 — T2 policy forrása és független review kész

A Hub új feladatpolicyja egyetlen PR1708 motort fogad el: fcd987b5 /
4252eacf, engineContractVersion1, capsuleSchemaVersion3. Explicit v2 routing,
6/6.1 modellek, műveletenkénti risk/advisory szabályok; jogosultságot nem ad.
A meglévő T2-WIP érintetlenül megmaradt, négy policy/tesztfájl egészült ki.
A teljes adapterteszt első futása98/99; egy téves mapping-elhelyezést
diagnosztizáltunk és javítottunk, utána csak a mapping2/2 sikeres. Ez nem új
teljes-suite PASS. Független /root/target_entrypoint_review, explicit
6.1 Sol/high, öt tengely: nincs konkrét P1/P2.
Valódi Secretary context --render: writes:false, verified régi8487bcc2 motor,
implementation-ready saját task, packet absent advisory. Régi policyCommit
15d8c1a3 és taskpin változatlan. Nincs commit/push/PR/host/hook-aktiválás.
Következő: natív Stage B/Bástya és exact candidate-kiadás, majd Air/Mini
hooktranzakciók és új/régi task-canary. Teljes elfogadás még hátravan.

## 2026-10-21 — Renderer két negatívja javítva, source-only

A heredoc-határ/NUL és a köztes scripts-symlink negatívja régi kóddal 0/2,
a tervezett javítás után az érintett hookágak + mapping együtt 14/14 PASS
(2.876s). Független kért 6.1 Sol/high review: nincs nyitott P1/P2.
A legacy pre-commit működik; az idegen audit-sentinel nem jön létre.
Fix audit-kötés, taskpin és élő hook változatlan; nincs telepítés vagy teljes-suite PASS.

Részletek/hash: docs/dev-plans/dev-risk-scoped-hub-2026-10-20.md.

## 2026-10-21 — T2 célzott check mapping: helyi source-ready

Öt additív tesztcsoport került a tényleges delivery-policy véges path-táblájába.
Két új contract fixture PASS (36.482 ms), valódi motor-resolver 18 eset PASS;
a Stage B importjai nem okoznak duplikált csoportfutást. Kért független
6.1 Sol/high review: nincs konkrét P1/P2. Régi baseline és taskpinek változatlanok.
Valós Stage B readback továbbra protected/hiányzó legacy marker, nem PASS;
maximumBastion: bastion-pass-unverified, authoritative:false, ready:false.
Ez nem publikálás, telepítés vagy aktiválás. Secretary tool továbbra unavailable;
korábbi read-only packet-absent megfigyelés történeti, új receipt nincs.
Részletek: docs/dev-plans/dev-risk-scoped-hub-2026-10-20.md.


## 2026-10-21 — T2 saját hook-telepítőbelépő: helyi forrás

A három repóba író régi installer helyett kizárólag saját fizikai repo-roothoz és
literal impact_hub targethez kötött wrapper készült. A natív fix loader pontos
bájtjai külön jóváhagyott digesttel, izolált Pythonnal futnak; nincs default
fallback, önengedélyezés vagy Git-config írás. Két célzott teszt PASS, bennük
9 Python-negatív/dispatch fixture és valódi shell help. Független kért 6.1
Sol/high forrásreview nem talált P1/P2-t. Éles telepítés nem történt; a már
meglévő hook-renderer és a régi task-/motorpinek nem változtak.
T2 policy/check mapping, publikálás és Air/Mini host-canary még hátravan.
Secretary advisory megmarad, nincs új receipt vagy Bástya/aktiválási PASS.

## 2026-10-21 — T1 forrásmerge igazolva, T2 még nem aktív

[PR52](https://github.com/office-hue/impact_hub/pull/52) merge-elve: `a56af4a7b700d0379e64a353bfbc48e78345dfe4`,
tree `19195d52234ab90021ac38eb36305af7d7a00960`; a candidate és a squash fa egyezik.
A kötelező candidate-CI sikeres, a teljes natív main-védelem változatlan;
nem történt bypass, kézi CI-újrafuttatás vagy termékdeploy. A központi pontos
fájlkör-kiegészítés PR1703-ban szintén merge-elve. A helyi T2-forrásmunka megmaradt,
a régi task-/motor-/policypinek nem változtak. Secretary context: writes:false,
verified motor, hiányzó packet advisory; normál lifecycle-publication PASS nincs.
Az új motor telepítése, T2 policy/hook/canary és teljes Bástya-elfogadás még hátra van.
Ez a lezáró DOCSYNC-bejegyzés helyi T2-WIP, még nem publikált dokumentációfrissítés.
A korábbi nyitott PR-ra vonatkozó sorok történetiek; a main-ablak felszabadult.



## 2026-10-21 — T1 published; bounded T2 selector source preparation

T1 Hub PR52 publishes bdac2499d36a1813c46a3847313fd30339f750c1;
the real repaired guarded-push/native hooks and full required CI run39591788159
succeeded. Not merged, not engine/T2 activated. Older status entries below
remain historical. The central five-file follow-up is frozen pending exact
publication approval, not authority for this candidate.

Uncommitted T2 source adds exactly guarded-push.sh, safe-repo-audit.sh and
install-hooks-all.sh to the DEV selector's writeSurface, without a scripts/
wildcard, product-selector change, new exclusive surface or historical repin.
The real adapter fixture verifies committed-policy-only reading and retained
old-policy behavior: 1/1 PASS. The selected Stage B missing-legacy-identity
negative case also PASS, not Stage B admission or full new CI.
Secretary context render returned writes:false, verified retained engine and
packet absent advisory. The observed HEAD remains the published T1 candidate;
these working-tree changes must not be pushed into that PR.

The legacy installer still writes three repositories and must not be run.
Its replacement must use the separate independently approved target-hook
transaction, not an untrusted caller-selected executor. Renderer output alone
is not installation. Actual T2 engine binding, policy/check-table completion,
installer replacement, review and both-host canaries remain required.
## 2026-10-21 — Product-facing push repair, source only

Uncommitted Hub repair: explicit/known-main audit base, v3-aware guarded-push,
no foreign memory gate, guards checked despite mode0644. Hook/wrapper suite
36/36 passed after diagnosed renderer-pin update. Independent delta review found no new P1/P2;
71e8699e remains committed HEAD, installed hooks/task pins unchanged. No new
publication/engine/T2 activation; no quiet window held. Details in task plan.

## 2026-10-21 — Aktuális T1 forráskiadási előfeltételek

Forrás commitolt9c6da42a/bind5, eredeti policy/motor megtartva; öt jóváhagyott
hook helyi telepítése lezárt. A pontos CI-osztályozás protected/full-validation,
natív diff/Bástya/continuity PASS, nem teljes CI vagy publikálási jogosultság.
Saját Jest-függőségek hiányoznak, nincs install/CI/provider/harvester. A részletes
kiadási sorrend a saját terv aktuális elején. Publikálás, Air/Mini motor és T2
elfogadás még nincs igazolva; nincs nyugalmi ablak. A korábbi sorok történetiek.

## 2026-10-21 DEV risk-scoped bootstrap — source only

Latest superseding observation: approved five-Hub-hook transaction applied and
independently verified; own installed canaries passed, task pins/config unchanged.
Window released. Local hook activation only; source publication/engine/T2 remain
pending. Current plan/continuity and private packet83Y0tM carry exact evidence.

Approved anchor641b665/bind4; original pins retained. Five-hook renderer and
installed-v3 continuity implemented; review fixes and exact-hash old-audit
compatibility recorded in the current task plan. Combined126/127 then repaired
focused1/1; no invented whole-suite or live PASS. Shared hooks unchanged,
publication/host install/T2 pending, no quiet window held.

## 2026-09-11 DEV v4 Stage B

Repository identity correction: CI binds `office-hue/impact_hub` to numeric ID
`1080246107`; the central contract retains the distinct `ai-agent` ID.

CI correction: explicit `--ci` is a source-only, unverified self-check bound to
the exact PR event and detached head; it cannot replace local capsule admission
or grant merge, provider, runtime, host, secret, cron or watchdog authority.

Source-only, local-Node-only adapter admission is present and remains
`stage-b-admitted-unverified`; readiness and all external mutation authority
remain false. Stage B is classified as protected by the DEV v2 lane.

# 2026-09-04 DEV delivery v2 Terra QA correction

The CI checkout now binds and verifies the pull-request event base/head commits
before classification. Unsafe impact classes are blocked unless the workflow
runs the full local validation gate. Production root selection is restricted to
the invoking worktree; fixtures are explicit, separate temporary roots with
offline/no-mutation snapshot evidence. Evidence receipts execute only the
policy-owned command profiles and bind every result to the frozen candidate tree.

## 2026-06-17T12:30:00+0200 - env/auth/runtime local adapter added
- Uj helyi adapter anchor keszult: `docs/impact-hub-env-auth-runtime-guard-adapter-2026-06-17.md`.
- A dokumentum a recovery/deploy/guard lane-ek env/auth/runtime minimumat a helyi `docs/system-recovery-map.md`, `docs/pr-policy.md` es `scripts/git-health-check.sh` truthra koti.
- A local governance system plan mar erre is hivatkozik, igy a recovery vagy auth drift kulon repo-helyi entrypointot kapott.

## 2026-06-16T10:45:00+0200 - local governance hub and policy anchor added
- Uj rovid, repo-helyi governance entrypoint keszult: `docs/impact-hub-governance-system-plan-2026-06-16.md`.
- A korabbi canonical hivatkozasi rest is lezarja ez a kor: a hianyzo `docs/ai-assistant-canonical-policy.md` most mar explicit helyi policy-anchor.
- Bekotes megtortent az `AGENTS.md`, `README.md` es `docs/system-recovery-map.md` felol, igy a helyi governance lanc mar feloldhato egyetlen repo-beli belepesi pontrol.

---
2026-03-23T12:25:00Z | fix(harvester): bound coupon harvester runtime in CI — GitHub Actions harvest job timeout set to 45 minutes, `timeout 40m` wraps the runtime command, and CLI entrypoint now exits explicitly on success to reduce hung scheduled runs

---

## 🏁 Final Infrastructure Evaluation - ImpactShop Project

_Recorded: '"$TS"'_

---
_Auto update: 2025-11-19 16:14:41_

### Health check summary

```
staging: HTTP 200 (1173 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (967 ms, ok) – https://app.sharity.hu/wp-json/
```

### Guard overview
- Secret expiry guard → ✅ OK | GitHub token safe (79 days left, expires 2026-02-06 08:04:16 +0100). Source: `.codex/reports/cron-secret-expiry.log`.
- Sprint red-flag → 🚨 FAIL (17% completion). Action: owners haladjanak a `.codex/sprint-tasks/S1.md` blokkereivel (T-1.2/T-1.3/T-1.4) és update `guard-actions.md`.
- Gmail keychain guard → ✅ OK (app password 30 napos).

### Quick ops checklist
- Billingo smoke: `wp impactshop billingo ping --endpoint=clients --dump`.
- NGO card CLI monitoring: `wp impactshop ngo-card rate-limit-test` + `prewarm` (ld. `docs/impactshop-ngo-card-usage.md` 9.1 fejezet).

---
_Auto update: 2025-11-19 15:35:46_

### Health check summary

```
staging: HTTP 200 (2261 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (983 ms, ok) – https://app.sharity.hu/wp-json/
```

### Guard overview
- Secret expiry guard → ⚠️ WARN (empty log). Action: futtasd `.codex/cron/secret-expiry-guard.sh --debug` és töltsd fel a lejáró credential listát.
- Sprint red-flag → 🚨 FAIL (17% completion). Action: frissítsd a `.codex/sprint-tasks/S1.md` státuszát és jegyezd a blokkereket (`guard-actions.md`).
- Gmail keychain guard → ✅ OK (app password 30 napos).

### Quick ops checklist
- `wp impactshop billingo ping` (staging/prod) → sandbox Billingo kulcs ellenőrzése (`--endpoint=invoices` opció támogatott).
- NGO card CLI futtatás: `wp impactshop ngo-card rate-limit-test` + `prewarm` dokumentálva (`docs/impactshop-ngo-card-usage.md`).

### ✅ Implementation Excellence: 10/10
Your dual-bastion architecture (Repository Protection + Time Machine) has reached **enterprise-grade reliability**.

**Highlights:**
- UTF-8/quoted filename safety → zero data corruption risk  
- SHA-256 verification → cryptographic integrity  
- Automated Git hooks → snapshot before every commit  
- Mirror backup → redundant Home-level protection  
- Selective versioning → repo clean, infrastructure preserved  
- Verified TM snapshot: `$(cat .codex/tm/last 2>/dev/null || echo none)`  

**Maintenance plan summary:**
- Keep 20 snapshots (`.codex/tm/bin/tm-clean 20`)
- Regularly refresh status with `impactall`
- Periodically verify integrity:  
  ```bash
  .codex/tm/bin/tm-verify "$(cat .codex/tm/last)"
```

* Extend Time Machine to staging for full redundancy

**Final Verdict:**
The ImpactShop project now operates at Fortune-500-level resilience:
✔ Fail-closed Git repo protection
✔ Point-in-time recovery
✔ Full audit trail
✔ Multi-environment consistency
✔ Enterprise-grade automation

🎯 **Production Excellence Achieved**

---

---

---
_Auto update: 2025-10-12 16:01:15_

### Health check summary

```
(health-check.sh nem található)
```

---
_Auto update: 2025-10-12 16:01:28_

### Health check summary

```
(health-check.sh nem található)
```

---
_Auto update: 2025-10-12 16:04:10_

### Health check summary

```
production: HTTP 200 (933 ms, ok) – https://app.sharity.hu/wp-json/
```

---
_Auto update: 2025-10-12 16:06:22_

### Health check summary

```
staging: HTTP 200 (956 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (911 ms, ok) – https://app.sharity.hu/wp-json/
```

---
_Auto update: 2025-10-12 16:07:18_

### Health check summary

```
staging: HTTP 200 (904 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (927 ms, ok) – https://app.sharity.hu/wp-json/
```

---
_Auto update: 2025-10-12 23:46:59_

### Health check summary

```
staging: HTTP 200 (849 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (779 ms, ok) – https://app.sharity.hu/wp-json/
```

---
_Auto update: 2025-10-13 02:44:05_

### Health check summary

```
staging: HTTP 200 (1000 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (951 ms, ok) – https://app.sharity.hu/wp-json/
```

---
_Auto update: 2025-10-13 08:33:22_

### Health check summary

```
staging: HTTP 500 (517 ms, fail) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (884 ms, ok) – https://app.sharity.hu/wp-json/
```

---
_Auto update: 2025-10-13 10:09:55_

### Health check summary

```
staging: HTTP 500 (540 ms, fail) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (906 ms, ok) – https://app.sharity.hu/wp-json/
```

---
_Auto update: 2025-10-13 19:06:58_

### Health check summary

```
staging: HTTP 200 (926 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (897 ms, ok) – https://app.sharity.hu/wp-json/
```

---
_Auto update: 2025-10-14 15:52:26_

### Health check summary

```
staging: HTTP 200 (941 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (873 ms, ok) – https://app.sharity.hu/wp-json/
```

---
_Auto update: 2025-10-14 16:12:11_

### Health check summary

```
staging: HTTP 200 (1038 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (836 ms, ok) – https://app.sharity.hu/wp-json/
```

---
_Auto update: 2025-10-14 16:45:53_

### Health check summary

```
staging: HTTP 200 (1041 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1035 ms, ok) – https://app.sharity.hu/wp-json/
```

---
_Auto update: 2025-10-14 18:39:15_

### Health check summary

```
staging: HTTP 200 (952 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (854 ms, ok) – https://app.sharity.hu/wp-json/
```

---
_Auto update: 2025-10-14 19:51:27_

### Health check summary

```
staging: HTTP 200 (947 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (879 ms, ok) – https://app.sharity.hu/wp-json/
```

---
_Auto update: 2025-10-14 20:56:20_

### Health check summary

```
staging: HTTP 200 (920 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (824 ms, ok) – https://app.sharity.hu/wp-json/
```

---
_Auto update: 2025-10-15 07:08:10_

### Health check summary

```
staging: HTTP 200 (1101 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1092 ms, ok) – https://app.sharity.hu/wp-json/
```

---
_Auto update: 2025-10-15 15:07:01_

### Health check summary

```
staging: HTTP 200 (1148 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1092 ms, ok) – https://app.sharity.hu/wp-json/
```

---
_Auto update: 2025-10-15 15:20:22_

### Health check summary

```
staging: HTTP 200 (1137 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1107 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-16 09:53:49_

### Health check summary

```
staging: HTTP 200 (918 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (832 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-17 16:52:25_

### Health check summary

```
staging: HTTP 200 (960 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (919 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-17 17:37:18_

### Health check summary

```
staging: HTTP 200 (953 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (905 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-19 18:22:48_

### Health check summary

```
staging: HTTP 200 (946 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (869 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-19 20:26:20_

### Health check summary

```
staging: HTTP 200 (896 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (812 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-20 09:55:29_

### Health check summary

```
staging: HTTP 200 (928 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: curl error (exit=16) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-20 10:24:11_

### Health check summary

```
staging: HTTP 200 (930 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (839 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-20 11:58:12_

### Health check summary

```
staging: HTTP 200 (934 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (952 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-20 11:58:39_

### Health check summary

```
staging: HTTP 200 (911 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (942 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-20 12:00:30_

### Health check summary

```
staging: HTTP 200 (944 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (899 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-20 13:24:57_

### Health check summary

```
staging: HTTP 200 (911 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (858 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-20 13:40:05_

### Health check summary

```
staging: HTTP 200 (930 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (825 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-20 16:07:27_

### Health check summary

```
staging: HTTP 200 (926 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (859 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-20 16:18:35_

### Health check summary

```
staging: HTTP 200 (913 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (865 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-20 16:19:17_

### Health check summary

```
staging: HTTP 200 (910 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (847 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-20 16:38:46_

### Health check summary

```
staging: HTTP 200 (936 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (801 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-20 16:42:27_

### Health check summary

```
staging: HTTP 200 (879 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (882 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-20 18:10:25_

### Health check summary

```
staging: HTTP 200 (904 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (872 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-20 18:11:25_

### Health check summary

```
staging: HTTP 200 (899 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (868 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-20 18:12:08_

### Health check summary

```
staging: HTTP 200 (887 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (806 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-20 18:52:57_

### Health check summary

```
staging: HTTP 200 (937 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (876 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-20 21:26:43_

### Health check summary

```
staging: HTTP 200 (868 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (826 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-20 21:27:55_

### Health check summary

```
staging: HTTP 200 (858 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (863 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-21 08:55:23_

### Health check summary

```
staging: HTTP 200 (925 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (823 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-21 08:55:41_

### Health check summary

```
staging: HTTP 200 (920 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (910 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-21 09:00:27_

### Health check summary

```
staging: HTTP 200 (981 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (944 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-21 09:02:00_

### Health check summary

```
staging: HTTP 200 (912 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (936 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-22 17:42:23_

### Health check summary

```
staging: HTTP 200 (914 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (832 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-22 17:42:42_

### Health check summary

```
staging: HTTP 200 (974 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (893 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-27 07:57:25_

### Health check summary

```
staging: HTTP 200 (902 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (884 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-27 07:57:39_

### Health check summary

```
staging: HTTP 200 (939 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (869 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-10-27 08:28:11_

### Health check summary

```
staging: HTTP 200 (962 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (878 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-10-15.md

---
_Auto update: 2025-11-04 17:07:07_

### Health check summary

```
staging: HTTP 200 (981 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (942 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-04 17:07:24_

### Health check summary

```
staging: HTTP 200 (968 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (943 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-04 17:13:57_

### Health check summary

```
staging: HTTP 200 (1014 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (956 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-04 17:14:14_

### Health check summary

```
staging: HTTP 200 (943 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (885 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-04 17:45:58_

### Health check summary

```
staging: HTTP 200 (921 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (909 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-04 17:46:17_

### Health check summary

```
staging: HTTP 200 (925 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (867 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-07 17:25:59_

### Health check summary

```
staging: HTTP 200 (969 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (841 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-07 17:33:44_

### Health check summary

```
staging: curl error (exit=6) – https://www.sharity.hu/impactshop-staging/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-07 17:35:58_

### Health check summary

```
staging: curl error (exit=6) – https://www.sharity.hu/impactshop-staging/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-07 17:46:17_

### Health check summary

```
staging: HTTP 200 (913 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (881 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-07 18:03:16_

### Health check summary

```
staging: HTTP 200 (881 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (826 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-07 19:32:25_

### Health check summary

```
staging: HTTP 200 (878 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (813 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-07 21:05:01_

### Health check summary

```
staging: HTTP 200 (1164 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (930 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-07 22:05:00_

### Health check summary

```
staging: HTTP 200 (1143 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (912 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-07 23:05:00_

### Health check summary

```
staging: HTTP 200 (1273 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (941 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 00:05:00_

### Health check summary

```
staging: HTTP 200 (1114 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (929 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 01:05:01_

### Health check summary

```
staging: HTTP 200 (1315 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (857 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 02:05:00_

### Health check summary

```
staging: HTTP 200 (1155 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (921 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 03:05:00_

### Health check summary

```
staging: HTTP 200 (1766 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (920 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 04:05:00_

### Health check summary

```
staging: HTTP 200 (1024 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (924 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 05:05:00_

### Health check summary

```
staging: HTTP 200 (1101 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (875 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 06:05:00_

### Health check summary

```
staging: HTTP 200 (1215 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (957 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 07:05:00_

### Health check summary

```
staging: HTTP 200 (1182 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (917 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 07:35:11_

### Health check summary

```
staging: HTTP 200 (933 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (841 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 07:46:11_

### Health check summary

```
staging: HTTP 200 (882 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (797 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 08:05:00_

### Health check summary

```
staging: HTTP 200 (975 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (962 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 09:01:07_

### Health check summary

```
staging: HTTP 200 (949 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (879 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 09:05:00_

### Health check summary

```
staging: HTTP 200 (1047 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (893 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 10:00:49_

### Health check summary

```
staging: HTTP 200 (872 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (864 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 10:05:00_

### Health check summary

```
staging: HTTP 200 (949 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (908 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 10:22:09_

### Health check summary

```
staging: HTTP 200 (927 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (817 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 11:05:00_

### Health check summary

```
staging: HTTP 200 (894 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (958 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 12:05:00_

### Health check summary

```
staging: HTTP 200 (891 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (939 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 12:27:00_

### Health check summary

```
staging: HTTP 200 (899 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (886 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 12:27:16_

### Health check summary

```
staging: HTTP 200 (880 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (860 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 12:39:13_

### Health check summary

```
staging: HTTP 200 (967 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (920 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 12:47:35_

### Health check summary

```
staging: HTTP 200 (914 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (820 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 13:05:01_

### Health check summary

```
staging: HTTP 200 (1151 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (887 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 13:17:06_

### Health check summary

```
staging: HTTP 200 (874 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (837 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 14:05:01_

### Health check summary

```
staging: HTTP 200 (1314 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (909 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 15:05:00_

### Health check summary

```
staging: HTTP 200 (995 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (979 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 16:05:00_

### Health check summary

```
staging: HTTP 200 (946 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1031 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 17:05:00_

### Health check summary

```
staging: HTTP 200 (1038 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (914 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 18:05:00_

### Health check summary

```
staging: HTTP 200 (1219 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (835 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 18:06:16_

### Health check summary

```
staging: HTTP 200 (922 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (853 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 19:05:00_

### Health check summary

```
staging: HTTP 200 (1102 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (852 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 20:05:01_

### Health check summary

```
staging: HTTP 200 (981 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (902 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 20:29:55_

### Health check summary

```
staging: HTTP 200 (885 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (885 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 21:05:00_

### Health check summary

```
staging: HTTP 200 (993 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1010 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 22:05:00_

### Health check summary

```
staging: HTTP 200 (942 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (987 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-08 23:05:01_

### Health check summary

```
staging: HTTP 200 (995 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (943 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-09 00:05:01_

### Health check summary

```
staging: HTTP 200 (1117 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (969 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-09 01:05:00_

### Health check summary

```
staging: HTTP 200 (1059 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (992 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-09 02:05:00_

### Health check summary

```
staging: HTTP 200 (1482 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (918 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-09 03:05:01_

### Health check summary

```
staging: HTTP 200 (1254 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (882 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-09 04:05:00_

### Health check summary

```
staging: HTTP 200 (912 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (804 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-09 05:05:00_

### Health check summary

```
staging: HTTP 200 (918 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (872 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-09 06:05:00_

### Health check summary

```
staging: HTTP 200 (1024 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (885 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-09 07:05:01_

### Health check summary

```
staging: HTTP 200 (1000 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (878 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-09 08:05:00_

### Health check summary

```
staging: HTTP 200 (911 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (915 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-09 09:05:00_

### Health check summary

```
staging: HTTP 200 (980 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (977 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-09 10:05:00_

### Health check summary

```
staging: HTTP 200 (969 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1064 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-09 11:05:00_

### Health check summary

```
staging: HTTP 200 (905 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (931 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-09 12:05:00_

### Health check summary

```
staging: HTTP 200 (947 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (937 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-11 17:28:57_

### Health check summary

```
staging: HTTP 200 (1636 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1044 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-11 18:05:00_

### Health check summary

```
staging: HTTP 200 (1338 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1764 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-11 19:05:00_

### Health check summary

```
staging: HTTP 200 (2149 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1047 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-11 20:05:00_

### Health check summary

```
staging: HTTP 200 (1687 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: curl error (exit=18) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-11 21:05:00_

### Health check summary

```
staging: HTTP 200 (1130 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1263 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-11 22:05:00_

### Health check summary

```
staging: HTTP 200 (1341 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1050 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-12 00:05:00_

### Health check summary

```
staging: HTTP 200 (2330 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1860 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-12 01:05:00_

### Health check summary

```
staging: HTTP 200 (2128 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1178 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-12 05:05:00_

### Health check summary

```
staging: HTTP 200 (1204 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (981 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-12 06:05:00_

### Health check summary

```
staging: HTTP 200 (1225 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1122 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-12 07:05:00_

### Health check summary

```
staging: HTTP 200 (1954 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1102 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-12 09:05:00_

### Health check summary

```
staging: HTTP 200 (1283 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1169 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-12 09:43:17_

### Health check summary

```
staging: HTTP 200 (1188 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1178 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-12 10:05:00_

### Health check summary

```
staging: HTTP 200 (1202 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1160 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-12 10:31:55_

### Health check summary

```
staging: HTTP 200 (926 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (833 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-12 11:05:00_

### Health check summary

```
staging: HTTP 200 (1057 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (946 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-12 12:05:00_

### Health check summary

```
staging: HTTP 200 (943 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (6058 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-12 13:05:00_

### Health check summary

```
staging: HTTP 200 (981 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1169 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-12 14:05:00_

### Health check summary

```
staging: HTTP 200 (985 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1154 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-12 15:05:00_

### Health check summary

```
staging: HTTP 200 (1048 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (910 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-12 16:05:01_

### Health check summary

```
staging: HTTP 200 (1104 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1892 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-12 18:40:09_

### Health check summary

```
staging: HTTP 200 (1279 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1186 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-12 19:05:00_

### Health check summary

```
staging: HTTP 200 (1353 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1285 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-12 20:05:01_

### Health check summary

```
staging: HTTP 200 (1520 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1112 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-12 21:05:00_

### Health check summary

```
staging: HTTP 200 (1875 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1610 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-12 22:05:00_

### Health check summary

```
staging: HTTP 200 (1862 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1666 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-12 23:05:00_

### Health check summary

```
staging: HTTP 200 (1859 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1498 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-13 00:05:00_

### Health check summary

```
staging: HTTP 200 (2056 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1997 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-13 01:05:01_

### Health check summary

```
staging: HTTP 200 (2142 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (2017 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-13 02:05:01_

### Health check summary

```
staging: HTTP 200 (7751 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (3601 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-13 03:05:00_

### Health check summary

```
staging: HTTP 200 (1610 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1732 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-13 04:05:00_

### Health check summary

```
staging: curl error (exit=18) – https://www.sharity.hu/impactshop-staging/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-13 05:05:00_

### Health check summary

```
staging: HTTP 200 (1664 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1663 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-13 06:05:00_

### Health check summary

```
staging: HTTP 200 (1708 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1580 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-13 07:05:00_

### Health check summary

```
staging: HTTP 200 (1738 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1581 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-13 08:21:47_

### Health check summary

```
staging: HTTP 200 (875 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (832 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-13 09:05:00_

### Health check summary

```
staging: HTTP 200 (949 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (953 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-13 10:05:00_

### Health check summary

```
staging: HTTP 200 (1045 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (969 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-13 11:05:00_

### Health check summary

```
staging: HTTP 200 (1018 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1038 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-13 12:05:00_

### Health check summary

```
staging: HTTP 200 (944 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (930 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-13 14:05:00_

### Health check summary

```
staging: HTTP 200 (1220 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1263 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-13 15:05:00_

### Health check summary

```
staging: HTTP 200 (1028 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1058 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-13 16:05:00_

### Health check summary

```
staging: HTTP 200 (1054 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (937 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-13 17:05:00_

### Health check summary

```
staging: HTTP 200 (2989 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1174 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-13 18:05:00_

### Health check summary

```
staging: HTTP 200 (1845 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1582 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-13 19:05:01_

### Health check summary

```
staging: HTTP 200 (2201 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1706 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-13 20:05:00_

### Health check summary

```
staging: HTTP 200 (1786 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1704 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-13 21:05:01_

### Health check summary

```
staging: HTTP 200 (1287 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1390 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-13 22:05:00_

### Health check summary

```
staging: HTTP 200 (1148 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1094 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-13 23:05:00_

### Health check summary

```
staging: HTTP 200 (1482 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1111 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-14 00:05:00_

### Health check summary

```
staging: HTTP 200 (1107 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1273 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-14 01:11:39_

### Health check summary

```
staging: HTTP 200 (1539 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1439 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-14 03:05:00_

### Health check summary

```
staging: HTTP 200 (2090 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1072 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-14 05:05:00_

### Health check summary

```
staging: HTTP 200 (1150 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1075 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-14 06:05:00_

### Health check summary

```
staging: HTTP 200 (1122 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1224 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-14 07:05:00_

### Health check summary

```
staging: HTTP 200 (1321 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1071 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-14 07:18:13_

### Health check summary

```
staging: HTTP 200 (1098 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1026 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-14 09:05:00_

### Health check summary

```
staging: HTTP 200 (1145 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1269 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-14 10:05:00_

### Health check summary

```
staging: HTTP 200 (1278 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1129 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-14 12:41:18_

### Health check summary

```
staging: HTTP 200 (1680 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1175 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-14 12:43:10_

### Health check summary

```
staging: HTTP 200 (1732 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1257 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-14 13:05:00_

### Health check summary

```
staging: HTTP 200 (3625 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (2099 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-14 14:05:00_

### Health check summary

```
staging: HTTP 200 (1615 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1503 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-14 15:05:00_

### Health check summary

```
staging: HTTP 200 (1842 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1513 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-14 16:05:00_

### Health check summary

```
staging: HTTP 200 (3067 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1505 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-14 17:05:01_

### Health check summary

```
staging: HTTP 200 (1994 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1468 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-14 18:00:01_

### Health check summary

```
staging: HTTP 200 (1866 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1578 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-14 18:05:00_

### Health check summary

```
staging: HTTP 200 (2082 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1495 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-14 19:05:00_

### Health check summary

```
staging: HTTP 200 (1509 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1512 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-14 20:05:00_

### Health check summary

```
staging: HTTP 200 (1947 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1411 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-14 21:05:00_

### Health check summary

```
staging: HTTP 200 (1596 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1819 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-14 22:05:00_

### Health check summary

```
staging: HTTP 200 (3229 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1947 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-14 23:05:00_

### Health check summary

```
staging: HTTP 200 (1515 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1468 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 00:05:00_

### Health check summary

```
staging: HTTP 200 (1566 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1412 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 01:05:00_

### Health check summary

```
staging: HTTP 200 (1577 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1471 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 02:05:01_

### Health check summary

```
staging: HTTP 200 (1631 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1356 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 03:05:00_

### Health check summary

```
staging: HTTP 200 (1758 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1366 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 04:05:00_

### Health check summary

```
staging: HTTP 200 (1933 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1925 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 05:05:00_

### Health check summary

```
staging: HTTP 200 (1473 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1485 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 06:05:00_

### Health check summary

```
staging: HTTP 200 (6732 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (4206 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 07:05:00_

### Health check summary

```
staging: HTTP 200 (1705 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1483 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 08:05:01_

### Health check summary

```
staging: HTTP 200 (2389 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1489 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 09:05:00_

### Health check summary

```
staging: HTTP 200 (1498 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1577 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 10:05:00_

### Health check summary

```
staging: HTTP 200 (1585 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1478 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 11:05:00_

### Health check summary

```
staging: HTTP 200 (1417 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1359 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 12:05:00_

### Health check summary

```
staging: HTTP 200 (2500 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1156 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 12:26:45_

### Health check summary

```
staging: HTTP 200 (1137 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1131 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 12:27:00_

### Health check summary

```
staging: HTTP 200 (1566 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1294 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 13:05:00_

### Health check summary

```
staging: HTTP 200 (1518 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (4302 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 14:05:00_

### Health check summary

```
staging: HTTP 200 (2380 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1819 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 15:05:00_

### Health check summary

```
staging: HTTP 200 (1367 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1117 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 16:05:01_

### Health check summary

```
staging: HTTP 200 (1365 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1003 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 16:36:37_

### Health check summary

```
staging: HTTP 200 (1138 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1066 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 17:05:00_

### Health check summary

```
staging: HTTP 200 (1701 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1140 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 18:05:00_

### Health check summary

```
staging: HTTP 200 (1502 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1207 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 18:45:15_

### Health check summary

```
staging: HTTP 200 (1218 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1111 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 18:51:11_

### Health check summary

```
staging: HTTP 200 (1150 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1055 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 19:05:00_

### Health check summary

```
staging: HTTP 200 (2337 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1579 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 20:05:00_

### Health check summary

```
staging: HTTP 200 (3066 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1605 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-15 23:05:00_

### Health check summary

```
staging: HTTP 200 (1516 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1419 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-16 00:05:00_

### Health check summary

```
staging: HTTP 200 (1534 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1563 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-16 02:05:00_

### Health check summary

```
staging: HTTP 200 (1418 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1158 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-16 04:05:00_

### Health check summary

```
staging: HTTP 200 (1078 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1075 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-16 05:05:01_

### Health check summary

```
staging: HTTP 200 (1081 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1113 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-16 07:05:00_

### Health check summary

```
staging: HTTP 200 (1089 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1075 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-16 09:05:00_

### Health check summary

```
staging: HTTP 200 (1358 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1144 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-16 10:05:01_

### Health check summary

```
staging: HTTP 200 (1409 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1075 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-16 10:59:06_

### Health check summary

```
staging: HTTP 200 (2518 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1502 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-16 11:05:00_

### Health check summary

```
staging: HTTP 200 (1998 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1538 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-16 12:05:01_

### Health check summary

```
staging: HTTP 200 (1386 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1310 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-16 13:05:00_

### Health check summary

```
staging: HTTP 200 (1447 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1061 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-16 13:10:13_

### Health check summary

```
staging: HTTP 200 (1197 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1048 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-16 13:12:23_

### Health check summary

```
staging: HTTP 200 (1159 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (986 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-16 15:05:00_

### Health check summary

```
staging: HTTP 200 (1282 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1293 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-16 16:05:00_

### Health check summary

```
staging: HTTP 200 (1587 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1073 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-16 17:05:00_

### Health check summary

```
staging: HTTP 200 (1458 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1382 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-16 17:53:04_

### Health check summary

```
staging: HTTP 200 (1817 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1363 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-16 18:05:00_

### Health check summary

```
staging: HTTP 200 (2029 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1435 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-16 19:05:00_

### Health check summary

```
staging: HTTP 200 (2065 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1505 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-16 20:05:00_

### Health check summary

```
staging: HTTP 200 (1861 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1252 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-16 20:48:51_

### Health check summary

```
staging: HTTP 200 (1838 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1239 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-16 20:50:29_

### Health check summary

```
staging: HTTP 200 (2809 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1660 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-16 21:05:00_

### Health check summary

```
staging: HTTP 200 (1886 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1357 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-16 22:05:00_

### Health check summary

```
staging: HTTP 200 (2028 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1312 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-16 23:05:00_

### Health check summary

```
staging: HTTP 200 (3219 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1578 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-17 00:05:00_

### Health check summary

```
staging: HTTP 200 (1711 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (2043 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-17 01:05:00_

### Health check summary

```
staging: HTTP 200 (1631 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1421 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-17 02:05:00_

### Health check summary

```
staging: HTTP 200 (1464 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (2056 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-17 03:05:00_

### Health check summary

```
staging: HTTP 200 (2031 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1688 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-17 06:05:00_

### Health check summary

```
staging: HTTP 200 (1545 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1209 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-17 08:26:40_

### Health check summary

```
staging: HTTP 200 (905 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (824 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-17 09:05:00_

### Health check summary

```
staging: HTTP 200 (1242 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1234 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-17 10:05:01_

### Health check summary

```
staging: HTTP 200 (1070 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (904 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-17 11:05:00_

### Health check summary

```
staging: HTTP 200 (1248 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1434 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-17 11:39:26_

### Health check summary

```
staging: HTTP 200 (1150 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1129 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-17 12:05:01_

### Health check summary

```
staging: HTTP 200 (1280 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1187 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-17 14:05:00_

### Health check summary

```
staging: curl error (exit=18) – https://www.sharity.hu/impactshop-staging/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-17 15:05:00_

### Health check summary

```
staging: HTTP 200 (1136 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1048 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-17 16:05:00_

### Health check summary

```
staging: HTTP 200 (1270 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (924 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-17 17:32:04_

### Health check summary

```
staging: HTTP 200 (1300 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1215 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-17 18:05:00_

### Health check summary

```
staging: HTTP 200 (1265 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1275 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-17 19:05:00_

### Health check summary

```
staging: HTTP 200 (1600 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1156 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-17 19:33:54_

### Health check summary

```
staging: HTTP 200 (1169 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1115 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-17 19:35:20_

### Health check summary

```
staging: HTTP 200 (1204 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1046 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-17 20:05:00_

### Health check summary

```
staging: HTTP 200 (1352 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1010 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-17 21:05:00_

### Health check summary

```
staging: HTTP 200 (2950 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1089 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-18 01:05:00_

### Health check summary

```
staging: HTTP 200 (1528 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (2049 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-18 02:05:00_

### Health check summary

```
staging: HTTP 200 (1370 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1286 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-18 03:05:00_

### Health check summary

```
staging: HTTP 200 (1842 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1030 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-18 06:05:00_

### Health check summary

```
staging: HTTP 200 (1174 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1155 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-18 07:08:42_

### Health check summary

```
staging: HTTP 200 (1182 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1008 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-18 09:05:00_

### Health check summary

```
staging: HTTP 200 (1373 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1244 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-18 10:05:00_

### Health check summary

```
staging: HTTP 200 (1329 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1294 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-18 11:05:01_

### Health check summary

```
staging: HTTP 200 (1546 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1162 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-18 12:05:01_

### Health check summary

```
staging: HTTP 200 (1478 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1139 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-18 14:05:00_

### Health check summary

```
staging: HTTP 200 (1547 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1175 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-18 15:05:00_

### Health check summary

```
staging: HTTP 200 (1381 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1189 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-18 16:05:00_

### Health check summary

```
staging: HTTP 200 (1387 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1203 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-18 17:28:51_

### Health check summary

```
staging: HTTP 200 (1152 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1383 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-18 17:29:06_

### Health check summary

```
staging: HTTP 200 (2033 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1039 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-18 18:05:00_

### Health check summary

```
staging: HTTP 200 (1349 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1297 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-18 19:05:00_

### Health check summary

```
staging: HTTP 200 (1272 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1097 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-18 20:05:00_

### Health check summary

```
staging: HTTP 200 (1292 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1151 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-18 21:05:00_

### Health check summary

```
staging: HTTP 200 (1211 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1154 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-18 22:05:00_

### Health check summary

```
staging: HTTP 200 (1307 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1063 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-18 23:05:00_

### Health check summary

```
staging: HTTP 200 (1380 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1052 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-18 23:34:52_

### Health check summary

```
staging: HTTP 200 (1194 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1041 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-19 09:05:51_

### Health check summary

```
staging: HTTP 200 (1176 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1160 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-19 09:06:13_

### Health check summary

```
staging: HTTP 200 (1228 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1139 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-19 15:35:38_

### Health check summary

```
staging: HTTP 200 (963 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (918 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-19 16:08:03_

### Health check summary

```
staging: HTTP 200 (993 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (941 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-19 16:09:39_

### Health check summary

```
staging: HTTP 200 (964 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (897 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-19 16:14:35_

### Health check summary

```
staging: HTTP 200 (957 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (885 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-20 07:58:00_

### Health check summary

```
staging: HTTP 200 (915 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (974 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-20 07:58:19_

### Health check summary

```
staging: HTTP 200 (1446 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (848 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-20 10:03:04_

### Health check summary

```
staging: HTTP 200 (1170 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1243 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-20 17:51:53_

### Health check summary

```
staging: HTTP 200 (1011 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (901 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-20 21:53:02_

### Health check summary

```
staging: HTTP 200 (2223 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1710 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-21 08:18:32_

### Health check summary

```
staging: HTTP 200 (908 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (853 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-21 10:26:02_

### Health check summary

```
staging: HTTP 200 (1294 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1113 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-21 15:07:38_

### Health check summary

```
staging: HTTP 200 (1055 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1005 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-21 16:48:31_

### Health check summary

```
staging: HTTP 200 (1987 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (4511 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-21 16:50:07_

### Health check summary

```
staging: HTTP 200 (1701 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1770 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-21 19:12:57_

### Health check summary

```
staging: HTTP 200 (1468 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1453 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-21 19:22:32_

### Health check summary

```
staging: HTTP 200 (1427 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (1356 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Auto update: 2025-11-22 11:09:15_

### Health check summary

```
staging: HTTP 200 (1028 ms, ok) – https://www.sharity.hu/impactshop-staging/wp-json/ (redirected_to:app.sharity.hu)
production: HTTP 200 (980 ms, ok) – https://app.sharity.hu/wp-json/
```

**Baseline referencia:** impactshop-baseline-2025-11-02.md

---
_Manual update: 2026-03-03 09:55:29_

### Baseline pivot

- Új etalon baseline aktiválva: impactshop-baseline-2026-03-03.md

**Baseline referencia:** impactshop-baseline-2026-03-03.md

---
_Manual update: 2026-03-08 14:02:00_

### Pre-push policy update

- `scripts/safe-repo-audit.sh` támogatja a `--mode push` üzemmódot.
- Cél: a strict audit csak a pusholt commit-range-et vizsgálja, így a dirty worktree miatti false-block megszűnik.

**Baseline referencia:** impactshop-baseline-2026-03-03.md

## 2026-03-09 Workflow Infra Update
- Dev-memory workflow 1-8 aktiválva (pre-task, context-pack, memory gate, PR auto-memory, commit template/hook, incident, digest, Copilot MCP guard).
- Hookok újratelepítve; napi digest cron aktív.

## 2026-09-27 DEV v4 installed-controller adapter status

- Impact Hub target adapter source candidate is review-complete after the
  Terra/high P1 correction; the continuity wording correction is docs-only.
- Focused evidence: Stage A/B 13/13 PASS, adapter execution-path 7/7 PASS,
  installed CLI start/status/resume/context smoke PASS, `git diff --check`
  PASS, continuity guard `allowed`.
- No provider build/deploy, VPS, runtime, cron, secret, dependency or other
  live mutation occurred. Push/PR/merge remains 0/0/0.
2026-06-16T18:20:00Z | feat(dev-guard/local-governance-sync-enforcement): a local pre-push audit most mar fail-closed modon megkoveteli, hogy a guard/governance/policy lane valtozasai a helyi governance system plan frissitesevel egyutt menjenek ki. Erintett fajlok: `scripts/safe-repo-audit.sh`, `scripts/git-health-check.sh`, `AGENTS.md`, `docs/impact-hub-governance-system-plan-2026-06-16.md`.
[2026-06-23T15:55:00Z] | docs(doc-sync/local-canonical-map): az `impact_hub` repo megkapta a sajat contract-kompatibilis local canonical doc-sync mapjet (`docs/impact-hub-doc-sync-map-2026-06-23.md`). A helyi map most mar egy helyen oldja fel a governance, recovery/deploy/guard, env/auth/runtime es coupon workflow doku-truthokat, es a `README.md` valamint a helyi governance hub felol is elerheto.
## 2026-06-24T15:15:00+0200 - local worktree runtime starter minimum added
- Uj helyi runtime starter minimum kerult be a repo-ba: `scripts/worktree-task-start.sh` es `scripts/worktree-readiness-check.sh`.
- A lane a mar meglevo `scripts/start-feature-worktree.sh` belepore epul, es ehhez ad marker + readiness szerzodest a helyi governance/doc-sync/recovery truth korul.
- A helyi canonical doc-sync map (`docs/impact-hub-doc-sync-map-2026-06-23.md`) `RegistryStatus: partial` allapotra valtott, mert a runtime minimum mar bent van, de a magasabb szintu drift/coordination/reporting retegek meg nem.
## 2026-06-29T15:15:00Z - worktree coordination snapshot minimum
- A helyi `impact_hub` runtime starter lane mar nem csak marker bootstrapot, hanem kulon koordinacios snapshot frissitest is tartalmaz.
- Uj helper: `scripts/worktree-coordination-sync.sh`.
- A helper a workspace `.worktrees/ACTIVE_WORKTREE.md` es `.worktrees/ACTIVE_WORKTREES.md` snapshotot frissiti, es a stale/prunable sibling worktree-ket `invalid_worktree: yes` jelzessel skipeli ahelyett, hogy a teljes starter lane-t eldobna.
- [2026-06-29] feat(runtime/doc-sync-n2): a local worktree runtime starter lane kapott egy kulon task-start decision reteget. Uj helper: `scripts/worktree-task-start-guard.sh`; a starter lane mar automatikusan kiirja a per-worktree `worktree-task-start-decision.json` artifactot, es a readiness check explicit fuggosegkent kezeli ezt a helper minimumot. Ezzel az `impact_hub` runtime rollout mar nem csak starter/readiness/coordination minimumot, hanem reviewer-visible task-start evidence-et is tud adni.
- [2026-06-29T19:35:00Z] feat(runtime/doc-sync-n3): a koordinacios snapshot mar a task-start decision evidence-et is visszaemeli. A `scripts/worktree-task-start.sh` sorrendje ugy lett szukitve, hogy a coordination sync a guard utan fusson, a `scripts/worktree-coordination-sync.sh` pedig mar `task_start_decision_status`, `task_start_decision_value` es a kapcsolodo doc-sync scope mezoket is kirakja az `ACTIVE_WORKTREE.md` es `ACTIVE_WORKTREES.md` riportba. Ezzel a snapshot mar a valos starter-dontest tukrozi, nem csak a marker bootstrap korabbi allapotat.
- [2026-06-30T08:45:00Z] feat(runtime/doc-sync-h4): az `impact_hub` local runtime rollout megkapta a hook-szintu continuity/guard minimumot. Uj helper: `scripts/worktree-continuity-guard.sh`; uj wrapper: `scripts/guarded-push.sh`; az `install-hooks-all.sh` pre-push lane mar ezt a continuity guardot is bekoti, a `git-health-check.sh` pedig explicit FAIL feltetelnek tekinti, ha a pre-push hookbol hianyzik. A guard a `worktree-active.json`, a `worktree-task-start-decision.json`, valamint a workspace `ACTIVE_WORKTREE.md` / `ACTIVE_WORKTREES.md` snapshotok jelen branch/path parityjat ellenorzi, es `task-start-decision-blocked` eseten fail-closed modon megallitja a push-t.
# 2026-09-11 DEV v4 Impact Hub Stage A: source-only, activation pending

Dedicated clean worktree carries inert central-contract and capability
snapshots, a read-only verifier, negative fixtures and a static maximum bastion.
Result is `stage-a-valid-unverified`; `ready` is impossible and existing DEV v2
authority remains active. No provider/build/deploy/VPS/runtime/secret/cron/
watchdog/network mutation occurred.

# 2026-09-02 DEV governance adapter: source-ready; not merged or deployed.
# 2026-09-02 DEV governance: readiness/docsync/test-chain completion candidate.

# 2026-09-04 DEV delivery v2: source-ready local adapter candidate.

The repository now carries a digest-verified v2 target-contract snapshot and a
source-inert adapter. It classifies docs-only, governance-only, code-local,
protected, deploy and unknown changes fail-closed; binds freeze/closure evidence
to the current worktree Git metadata with 0700/0600 posture; and leaves provider
and product-deploy authority with the operator. The coupon harvester remains
weekly/manual only and was not invoked.

# 2026-09-04 DEV delivery v2 validation lane: corrective candidate.

The context guard now distinguishes review-required known classes from blocking
unknown input, so protected/deploy validation can actually run before closure.
The full CI lane installs exactly the tracked lockfile with dependency lifecycle
scripts disabled. Runtime/provider/deploy authority remains unchanged.

# 2026-09-04 DEV delivery v2 QA2: merge-blocker correction candidate.

The protected classifier now includes real adapter tests and all local
guard/policy/workflow self-change surfaces. GitHub PR validation is bound to the
event base/head range and no longer requires local continuity snapshots, hooks
or local working-tree audit state. Evidence execution is hardcoded and enforces
before/after repository cleanliness; fixture input is owner/mode/realpath,
symlink and size bounded. Closure records no unsupported task-wide
external-write boolean. Central contract digest remains `989dd16d...ef0194`.
# 2026-09-11 DEV v4 Stage A CI correction receipt

The existing DEV v2 classifier now classifies the Stage A correction paths as
`protected`, so the exact CI range returns `operator-review` with mandatory
full validation rather than `unknown-path-class`. No activation, authority,
provider, build, deploy, VPS, runtime, secret, cron or watchdog capability was
added.

# 2026-09-11 DEV v4 Stage B CI fixture closure

The Stage B test bootstrap no longer assumes that GitHub Actions has a
worktree-private capsule. CI identity remains bound to the authenticated PR
event tuple; local admission still requires the private capsule. The combined
Stage A/Stage B suite passes 13/13 and all provider/runtime mutation flags stay
false.

# 2026-09-17 DEV v4 local context correction candidate

Exact remote main `4cadf15a2ca694fba92a993d39a5e911994e5133` is the base.
The repo-local starter and AGENTS correction is a source candidate pending
focused validation and normal PR integration. Stage B still admits only local
Node/source work as `stage-b-admitted-unverified`; product and host activation
remain false.

The first PR #50 run passed full Jest but failed the native Stage B CI tuple
because the adapter still pinned every future PR base to the old Stage A
activation commit. The bounded CI correction binds the current PR event's
exact `main` base/head and Stage A ancestry; this is a source candidate until
the next CI readback passes. Provider/runtime authority remains false.

## 2026-10-20 — DEV T1 planning-only local WIP

Task dev-risk-scoped-hub-20261020; own separate worktree, released quiet window.
Master docs/dev-plans/dev-risk-scoped-hub-2026-10-20.md; no code/commit/bind.
SECRETARY engine verified/packet absent; native recovery unresolved, no fake PASS.

## 2026-10-21 — DEV T1 reviewed local source candidate

Task dev-risk-scoped-hub-20261020, anchor b598b000, supported bind revision2.
Adapter59/59, combined entrypoint68/68; independent architecture/five-axis review
and managed security diff complete (zero reportable findings). Actual new-adapter
SECRETARY render verified/writes:false/state unchanged, optional packet absent.
Actual legacy Stage B protected; maximum bastion pass-unverified, never ready.
Explicit two-local-commit context exception/no foreign npm writer only; no
shared hook/policy/pin/Stage A/product/provider/host/runtime change. Central
exact-path admission and publication/activation remain separate pending work.
## 2026-10-23 — Hub T2 natív forrás-checkpoint előkészítve

A saját 15 fájlos T2-delta a már jóváhagyott központi véges fájlkörön belül
marad. A hat ellenőrzött policy/renderer/teszt SHA-256 változatlanul egyezik
a fenti független review-k bizonyítékával; nincs indok változatlan tesztismétlésre.
Friss maximum Bástya: bastion-pass-unverified, authoritative:false, ready:false.
Friss Secretary: rendered, writes:false, verified régi8487bcc2 motor,
implementation-ready, packet absent advisory. A helyi Stage B korábban igazolt
hiányzó legacy markerét nem gyártjuk le; ez továbbra sem Stage B PASS.

A natív pre-commit a tényleges v3 continuityt ellenőrzi, a post-commit nem ír
idegen memóriába. A commit után a támogatott reconcile csak az új HEAD/tree-t
követheti: policyCommit15d8c1a3, engine8487bcc2 és planAnchor71e8699e megmarad.
A bővített tervmanifest nem jelent régi selector-admissiont; ismerten hibás bind
vagy normál lifecycle-publication PASS nincs. A natív exact-range audit és
ci-validate az elkészült commitra fut. Ismeretlen eltérés megállítja a műveletet.
A git-health régi memory:gate-elvárása ismert, külön advisory; nem kerül PASS-ra.

Ez a bejegyzés commit előtti forrásállapot, nem távoli kiadás vagy aktiválás.
Az exact commit/tree és natív eredmények a saját gitdir kiadási naplójába kerülnek.
Nincs hook-, konfiguráció-, taskpin-, provider- vagy más worktree-módosítás.
Rollback: saját forrás-revert; a régi motorcsomagok és taskpinek megmaradnak.
A T2 PR/merge, mindkét host hooktranzakciói és új/régi canaryk még hátravannak.

## 2026-10-23 — Risk-scoped DEV: Air és Mini aktiválva, élőben ellenőrizve

Ez új állapotbejegyzés; a fenti korábbi kiadási/engedélyezési státuszok
történeti tények maradnak. A T1/T2 forráskiadás és a kétgép-es aktiválás
lezárult; termékdeploy vagy adatbázis-migráció nem történt. A PR1708 motor
megmaradt, T2 miatt nem készült második motorcsomag.

A részletes forrás-/host-/hook-/canary-bizonyíték és a pontos indítási,
visszaállítási, illetve ismert advisory feltételek:
[központi aktiválási záróbejegyzés](https://github.com/office-hue/ai-agent/blob/main/docs/continuity/dev/2026-10-20-risk-scoped-target-bootstrap.md).
Az opcionális memóriahiány nem forrásmunka-blokk; hiányzó kötelező tény,
azonosság-, jogosultság- vagy integritáskockázat továbbra is blokkol.
Új feladat routingja v2 (explicit 6/6.1 + reasoning); régi feladatpin nem változott.
Secretary context-render mindkét hoston valós; hiányzó opcionális packet nem
PASS és nem engedély. A záró öt-tengelyű, külön kért 6.1 Sol/high review nem
talált blokkoló hibát; nem natív modell-végrehajtási vagy lifecycle receipt.

A jelen DOCSYNC csak a már ellenőrzött aktiválást rögzíti. Saját
commit/push/PR/merge állapotát a kiadási visszaolvasás igazolja, nem ez a szöveg.
