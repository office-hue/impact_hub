## 2026-10-23 — T2 policy forrása és független review kész

Pontos végső SHA-256:

- lifecycle: 0126b530ca9809d0cdb134c603a4b62633bcdcfabc0a1188b1071e4a107cc2f6
- graded: d41b747774e5ba8232282d3bde4c5158937d3616b91ea44f985640df370fb520
- delivery: 6bd1a0ce12dc395d57fe5134e5d16bb1e57259d03c2049da1d90380db4afa3f1
- adapter-test: 7ccf5f2965b07135639eb13f1030cb21c9468ef114e6db4aa470354385be4647

Végrehajtó /root/t2_policy_final_review külön implementation-szeletben;
független reviewer /root/target_entrypoint_review, nem saját source review.
Mappinghiba: az új policycheck tévesen hub-check-map alá került az importáló
hub-stage-b-test-entrypoint helyett. Egy javítás, célzott2/2 recheck55ms.
Régi osztályok/profile, provider-mutáció tiltás, evidence TTL és Hub-specifikus
mezők változatlanok. A policy-tesztek külön mintát kapnak, a Stage B importált
suite-okat nem futtatja ismét. Régi taskok régi policyCommit alapján működnek.

Rollback: saját source-delta/guarded revert; csomag/pin törlése nincs.
Éles hook rollback csak tranzakciós saját postimage-CAS alapján. A mainen
lévő központi policy4099c5a4 nem cserélhető össze a motorfcd987b5 commitjával.

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


Renderer SHA256: 735c5e41ceee91c92bc95ef80c883d6e5506bff06246acd90a003fc3d02f030a;
hookteszt SHA256: 3366df3714c6db8692a91afccf20caceedefdec003776aa61ddd9a2feed2c976.
Failure ID-k: hub.render.adapter-source-boundary, hub.hook.scripts-parent-symlink.
Mindkettő előre diagnosztizált, egyszer reprodukált, egy javítással lezárt.
A 14-es futás nem ismételte meg a nem érintett push-wrapper/audit teszteket;
azok korábbi változatlan tartalmi eredménye külön evidence marad.

## 2026-10-21 — Hub renderer célzott biztonsági javítás

Forrásdiagnózis: a pre-push csak a guard végső fájlját ellenőrzi symlinkre;
symlinkelt scripts könyvtáron át idegen auditot futtathat. A frozen adapter
heredoc-validálása csak belső delimiter-sort tilt, első/utolsó sort és NUL-t nem.
Javítás kizárólag scripts/dev-v4-target-hooks.mjs-ben és a meglévő
tests/dev-v4-hook-compatibility.test.mjs-ben: a pre-push közvetlenül végrehajtás
előtt valódi scripts könyvtárat követel; a renderinput teljes delimiter-sort és
NUL-t minden pozícióban elutasít. A fix hashű audit-utód tartalma változatlan.
Sem alapértelmezett fallback, sem idegen symlinkcél olvasása/futtatása nem kell.

Két negatív fixture előbb reprodukálja az eredeti hibát, majd ugyanazon bemeneten
ellenőrzi a javítást. A saját temp-fixture-ben idegen audit-sentinel nem jöhet
létre; a scripts könyvtárat nem használó legacy pre-commit továbbra is működjön.
Utána csak az érintett rendered-hook ágak és új mapping-szűrőpartíció futnak;
független 6.1 Sol/high review zárja a javítást. Nincs live hiba vagy hooktelepítés.
Kockázat/rollback: csak saját renderer-delta, sem guardhash-/pin-/hostátírás;
éles visszaállítás továbbra a külön eredeti hooktranzakció része. UI nincs.

## 2026-10-21 — T2 célzott check mapping: helyi source-ready

Öt additív tesztcsoport került a tényleges delivery-policy véges path-táblájába.
Két új contract fixture PASS (36.482 ms), valódi motor-resolver 18 eset PASS;
a Stage B importjai nem okoznak duplikált csoportfutást. Kért független
6.1 Sol/high review: nincs konkrét P1/P2. Régi baseline és taskpinek változatlanok.
Valós Stage B readback továbbra protected/hiányzó legacy marker, nem PASS;
maximumBastion: bastion-pass-unverified, authoritative:false, ready:false.
Ez nem publikálás, telepítés vagy aktiválás. Secretary tool továbbra unavailable;
korábbi read-only packet-absent megfigyelés történeti, új receipt nincs.

Binding: policy f75ff97d86479ecb4004127f53d63c5e94d681c2c7c1a3b7eb30699a7c8d440b;
teszt a68a7c93c50633008cc5472ca97edb54b2fdec4101d2cf1e8389133260273d50.
A két új Node-teszt csak az exact policy/argv/dependency és a top-level címek
szűrőpartíciójának bizonyítéka. A 18 külön eset a tényleges központi
recipe._path_checks függvényt használta; idegen termék/suffix/rename-old-side
is lefedett. Változatlan korábbi funkcionális teszteket nem futtattunk újra.
A valós Stage B exit2 oka a saját worktree worktree-active.json hiánya;
kézi marker, context override, native-hook átírás vagy újrafuttatás nem történt.
Az új mapping nem írja felül e readbacket és nem ad normál publication PASS-t.
Nincs új javítási hiba ebben a szeletben. Következő: tényleges végleges motorhoz
kötött T2 policy, source publication és Air/Mini tranzakciók/canaryk. A központi
15-fájlos fagyasztott candidate változatlan; nyugalmi ablakot nem tartunk ehhez.


## 2026-10-21 — T2 tényleges check mapping: szűk implementáció

A root delivery-policy üres path/command tábláját additív, véges kapcsolások
egészítik ki. Öt elkülönített csoport: installed adapter, hook/push kompatibilitás,
installer-belépő, natív Stage B regressziók és mapping-contract. A Stage B
tesztfájl importálja a másik kettőt; az explicit névszűrés megelőzi ugyanazon
esetek többszöri futását. A teszt-entrypoint módosítása mindhárom fájl csoportjait
kiválasztja; idegen termékfájlok és suffix-egyezések nem választják a DEV-suite-ot.

Fájlok: config/dev-delivery-v2-policy.json és a meglévő
tests/dev-v4-installed-controller-adapter.test.mjs; saját DOCSYNC változik.
A régi class/profile/permission/plan baseline és a natív adapter kódja változatlan.
Nincs új platform, külső parancs vagy policy/motor/task-pin aktiválás.
Kockázat: kihagyott dependency vagy túl széles tesztválasztás; exact táblateszt,
fixture-title/szűrő-partíció és a valódi motor resolverének pozitív/negatív
esetei ellenőrzik. Kért 6.1 Sol/high független delta-review szükséges.
Rollback: csak e saját mapping-delta visszavonása; nincs élő állapot.
UI/adat/provider/cron nem érintett; a natív Stage B/Bástya kiadási readbackje
külön marad, a fixture nem gyárt forrás- vagy live-jogosultságot.

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

Forrás-SHA256: wrapper ee57e35582ad28c4c11920ad2f9a81ca0752a33de3a4bf0811ad30e7213e99f6;
fixture-fájl b25e34e64a769c343b848a0540f86b4f90e4ff3a50dd5dae38bbbfb6caafc891.
Review kizárólag az új entrypoint-blokkokra és wrapperre vonatkozik.

## 2026-10-21 — T2 saját telepítőbelépő: végrehajtási szerződés

A jóváhagyott különutas scope-ban a `scripts/install-hooks-all.sh` régi
közvetlen íróját repo-only wrapper váltja. Nem telepít magától, nem keres
sibling repót, nem módosít Git-konfigurációt vagy aliasokat. Saját fizikai
script-root és literal `impact_hub` cél kerül az ellenőrzött loaderhez.
A natív account fix loaderét izolált stdlib Python olvassa: pontos argv,
symlinkmentes ancestorok, stabil FD-bájtok, owner/mode és külön jóváhagyott
`--expected-launcher-digest` szükséges. Ez binding, nem engedély.
A wrapperflag nem jut tovább; az eredeti bootstrap/transaction/grant út marad.
Hiba dispatch után nem jelenthető igazolt writes:false-ként.

Érintett funkció: kizárólag installer belépés; nincs termék-UI vagy adatírás.
Backup: saját T1 HEAD-beli scriptblob; rollback forráskiadás előtt célzott
patch-visszavonás, utána guarded revert. Ez nem von vissza élő hooktranzakciót.
Fixture: `tests/dev-v4-hook-compatibility.test.mjs`; segítség és hibás argv valós shellből,
fagyasztott loaderbetöltés/páros target/idegen cwd/home/mód/hash/symlink
negatívok kizárólag disposable környezetben, nincs CLI/env tesztbypass.
Független 6.1 Sol/high architecture sanity-check ezt a szűk utat megfelelőnek
találta; implementációreview és pontos teszteredmény később kerül ide.
A render/paritás és régi worktree-kompatibilitás kiadás előtti külön feltétel;
az új entrypoint önmagában nem jelent kész telepítést. Kézi UI checklist: N/A;
valós CLI/hook-canary csak a későbbi jóváhagyott host-aktiválás része.

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

# Hub DEV T1 — exact source plan and native recovery boundary

## 2026-10-21 — T1 published; bounded T2 selector source preparation

Bounded independent requested 6.1 Sol/high review found no concrete P1/P2 in
selector f12a21263ecdbd1afaecdb7b78af3b60dd2e82fc8756369aadcf3342f404e08b
and test434d5e85569de663c2fa8a20fc1d8d23481ea3ba1bd738028f29b30b79783e6b.
This is source review, not full bind/install acceptance. The installer needs a
fixed independently authenticated installed launcher for the existing frozen
target-hook closure; no caller-selected executor/runtime or render-only PASS.
Such a launcher is not yet implemented or verified installed.

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

## 2026-10-21 — Product-facing push repair, not a permanent exception

Arnold explicitly requests fixing or replacing accidental DEV blockers for
future product developers. This supersedes the pending proposal to leave the
old push-audit checklist unchecked. Source scope adds exactly
`scripts/safe-repo-audit.sh` and `scripts/guarded-push.sh` to the existing T1
candidate; the matching central finite-scope amendment must be published before
it is used as scope evidence. This paragraph is not a lifecycle permit.

The base-owned Hub selector currently permits `scripts/dev-v4-`, not these
generic shell paths. Publishing a central allowlist alone cannot authorize
normal bind/publication under that immutable pin. Use the approved separate
source-release route with independent exact-candidate evidence; do not force
a normal PASS, edit a historical task pin or blindly retry bind. T2 must cover
these exact maintained entrypoints in its actual selector before new task
activation. This remaining publication dependency does not invalidate the
isolated repair tests and does not authorize shared host writes.

Diagnosis: Bash `${SAFE_REPO_AUDIT_UPSTREAM:-@{upstream}}` appends `}` to an
explicit SHA. Without upstream the audit also scanned empty-tree..HEAD, causing
unrelated historical-file warnings. The wrapper duplicated base resolution,
searched other worktrees for memory writers and skipped non-executable guards.
It also selected the old marker-based guard for v3 tasks.

Repair: one audit resolver; validate explicit commit without silent fallback;
otherwise use existing upstream or known local main reference. No fetch or
HEAD^ shortcut. Missing/unrelated base stops with a concrete repair instruction,
not a misleading full-repo scan. Wrapper uses the existing installed-controller
adapter for v3 (including orphan namespace, never fallback after denial), legacy
guard otherwise, then strict audit and ordinary Git push. No foreign memory
writer is executed; optional Secretary absence grants no publication authority.
Native exact-range/ref/origin/fast-forward/dirty/secret checks remain.

Changed audit source legitimately changes its renderer pin; legacy source hash
579cad7c remains unchanged and tested. Previously installed shared hooks are
not replaced by a source edit. The first fixture run stopped at the old
audit-render source pin, before behavioral cases ran; diagnosed, matching new
source pin updated, affected hook/wrapper suite then passed 36/36. No claim of
fresh complete CI or live activation. Independent `hub_product_push_repair_review`
invoked with 6.1 Sol/high found no concrete new P1/P2 in the four-file delta;
this is invocation evidence, not independent runtime attestation. T2 installation
must verify real product entrypoints, not only canaries
that call a different hook path. No active main window or remote mutation.

Additional final checks: local strict audit, Bash syntax and diff hygiene PASS;
central scope tests 4/4 PASS. One selected Stage B negative-identity assertion
PASS is not a Stage B admission claim. Secretary context render: retained
engine verified, writes:false, packet absent advisory. The repo's committed
inspect report still describes 71e8699e, not the uncommitted repair candidate.

## Aktuális forráskiadási előfeltételek — 2026-10-21

A `705e6b2736ae6bb7eeb806313109cc30f3b9bc6a` DOCSYNC checkpoint után a natív
CI-diff/strict audit ismét PASS, supported bind revision6. A regisztrált
`git-diff-check` indítását viszont `plan_change_impact_underclassified` állította
meg még a check végrehajtása előtt. Első diagnózis: a terv gépi deklarációja
governance-only volt; a repo-natív CI protected felületet lát. Javítás: kizárólag
a terv `changeImpact` mezője protected, a high kockázat és pontos fájlkör marad.
Nincs gate/policy módosítás vagy átminősített PASS. Ellenőrzési sorrend: helyi
plan-validate, natív docs commit, supported bind, regisztrált check és requirements
visszaolvasás; a későbbi review-jogosultság ettől nem teljesül automatikusan.

A protected deklaráció commitja `473d60575c0afa26f0674fb79262ceb990841649`,
supported bind revision7. A regisztrált check indítása ugyanazzal az előfeltétel-
hibával megállt, maga a check továbbra sem futott. Pontosított diagnózis:
a retained `15d8c1a3:config/dev-delivery-v2-policy.json` nem tartalmaz
`changeImpact` osztályozási térképet, és üres a `requiredChecksByProfile` illetve
`registeredCommands`. A telepített recipe ezért unknown osztályt lát; egy
unknown deklaráció csak elfedné az első hibát, a hiányzó checktáblákat nem pótolná.
Ez nem ugyanaz az adapter, mint a valóban sikeres repo-natív ci-validate.
A protected deklaráció marad a valós CI-hatásnak megfelelően. Nincs további
vak rerun, kitalált check/review receipt, korai policy-migráció vagy root-policy
írás. A policytáblák javítása az eredeti T2-csomag része; T1 kiadásához a Hub
saját, pontosan jóváhagyott különutas publikálási döntése szükséges. A már
meglévő v1 modellrouting emellett 5.6 review-t vár; annak hiánya sem lesz PASS.

A forrás már commitolt: `9c6da42aee72c50e47804a33bf17e547c0136e9e`, tree
`bb510c73068b46c1fb0db996ce44a23ed030aaf9`; a támogatott feladatkötés revision5,
eredeti base/policy `15d8c1a380401a167c0f3e13e54b9b8ad5f21078`, változatlan
retained motor. Az előellenőrzéskor a munkapéldány tiszta. A régebbi
„uncommitted”, „not installed” és „shared hooks unchanged” állítások történeti
adatok, nem az aktuális állapot. Az öt jóváhagyott hook helyi telepítése lezárt;
forráspublikálás, új motor és T2 aktiválás még nincs igazolva.

A pontos 12 fájlos base/head deltán a natív `ci-classify`: `protected`,
`operator-review`, `fullValidationRequired=true`, `expensiveStepsRequired=true`.
A natív `ci-validate` PASS: pontos diff, Bástya és négy continuity-fájl.
Ez nem teljes CI-, Jest-, Stage B- vagy publikálási PASS.

A tényleges PR-workflow sorrendje: eseményhez kötött base/head; osztályozás;
context guard; Node22 és `npm ci --ignore-scripts` a CI runneren; teljes Jest;
Stage B `--ci` és Stage A/B Node-tesztek; policy-negatívteszt és dedikált offline
fixture; natív `ci-validate`, exact-range strict audit és diff-check; saját
tízpontos PR checklist. A forrásváltozás nem minősíthető docs-onlynak e lépések
megkerülésére. A korábbi 126 sikeres eset és a javított 1/1 eredménye az eredeti,
változatlan kódhoz kötött helyi evidencia, nem új teljes futás.

A saját worktree-ben sem root, sem tools Jest-függőségkészlet nincs. Nem történt
helyi install, shared-cache javítás vagy vak teljes tesztfuttatás; a teljes Jest
CI-eredmény még szükséges. A heti/manuális coupon-harvest nem push/PR triggerű;
e DEV-kiadáshoz nem indítjuk. A workflow-leltár nem provider-kapcsolati bizonyíték.

Publikálás előtt: végleges tiszta candidate, támogatott same-task bind, valós
natív ellenőrzések és review, pontos remote/branch/PR és külső automatikus hatások
visszaolvasása, a Notes-tól és központtól külön Hub műveleti jogosultság.
A v1 régi modellkövetelményét nem helyettesíti hamis 5.6 receipt; csak tényleges
6/6.1 review használható a külön jóváhagyott úton. A generic `guarded-push.sh`
és `install-hooks-all.sh` T2-only; nem fut. Merge előtt tényleges teljes CI és
friss, szűk main-ablak kell. Nincs aktív ablak vagy új provider/megosztott írás.

## Latest live boundary — five shared Hub hooks applied and verified

2026-10-21: exact operator approval, matching native prepare, one apply for
transaction d6083b61-89a2-4b5d-996e-282713f4f178; all five exactpost/verified,
terminal applied. Independent routing/config/source/executor/host readback
matched across ten worktrees; commit-msg unchanged. Installed own pre-commit
allowed with state bytes unchanged, dirty push rejected, three post-events
exit0 without foreign memory writes. Private packet83Y0tM/CLOSURE.md owns the
receipts/preimages/grant. Window released and work stops at the approved bound.
This is local Hub hook activation only; no source commit/publication, engine,
T2 or product deployment. Earlier source/installation forecasts are historical.
These closure notes are uncommitted DOCSYNC, outside the earlier frozen stage.

## Current implementation checkpoint — approved bootstrap, not installed

Approved docs-only anchor `641b665cede097c5c30f98b8152a37e37364504e`, tree
`23384467c916cc4aa3f629d2a3445076792b2a07`; supported bind revision4 retains
original base/policy and engine. This context exception is consumed.
Actual uncommitted T1 source: existing adapter/test, new
`scripts/dev-v4-target-hooks.mjs`, `tests/dev-v4-hook-compatibility.test.mjs`
and Stage B registration. Generic shell helpers remain T2-only.

Frozen hooks embed the adapter, so older worktrees need no new local adapter.
Continuity requires exact installed-status/state/Git agreement and ready policy,
allows dirty local work but not dirty push, and grants no publication authority.
Matched historical selectors are preserved without widening new-task start.
Real own CLI local-continuity was allowed/writes:false at the above anchor.

Independent five-axis review identified selector and Linux fixture portability
defects; both are corrected. Only disposable fixtures substitute their Node
runtime; real images retain the fixed Mac runtime. Reviewer runtime model and
reasoning are not independently observable, so no model receipt is asserted.
Review also exposed four older audits among ten registered Hub checkouts.
Only exact old audit hash
`579cad7c22cf952c712f14e7d2a4b1c57d964ba4425b95a4c79e2222083b842d`
selects frozen range successor
`1cf208707753cb6fbfae93af37a0b21ce3c5b5de5639de676693bc47ae6d9d9f`.
The diff adds exact-range plumbing and committed env-diff inspection, not rule
removal. Other versions execute their local exact-range audit without retry or
fallback. No foreign source modification. The reviewer separately accepted
this bounded compatibility design; fixtures exercise real audit allow/denial.

Evidence: initial hook21/21 and targeted continuity34/34. Combined final-source
entrypoint ran127 cases:126 PASS, one fixture asserted an error on stdout though
the real audit emits it on stderr. Diagnosed assertion-only correction passed
its focused1/1 rerun; unchanged126 results are reused, not called a fresh full
127-case PASS. The same failing assertion appeared in an already-started full
run; no further whole-suite rerun. An atomic DOCSYNC patch matched a partial
notes line and was rejected without writes; repair uses complete known headings.

Shared hooks/commit-msg/config/pins remain unchanged. Before apply: freeze exact
source/images/executor/native prestate, independent approval, fresh one-use
grant and short common-dir Git/hook/config writer window. Canary/rollback must
precede native HEAD advancement. No current quiet window, new source commit,
push, PR, merge, host install or T2 activation.

Final independent delta review closed the findings with no remaining concrete
P1/P2. Native strict local audit of the exact12 staged paths PASS. The actual
rendered pre-commit was run as a read-only candidate canary in the own worktree:
exit0/allowed/writes:false/publicationAuthorized:false, state SHA unchanged.
This did not install or invoke any old shared hook. Images: pre-commit22612,
pre-push37526 bytes; all five below65536. Exact image/source/executor bindings
are kept in the private next-operation approval packet, not self-issued grants.

## 2026-10-21 — Approved pre-T1 bootstrap amendment

Arnold's explicit "jóváhagyom" approves the requested one docs-anchor native
context exception and Hub-only five-hook transactional repair. This is scope/
order approval, not a fabricated machine grant or proof of installed bytes.
Current base-selector readback is narrower than the initial proposal below:
dev-governance-source owns scripts/dev-v4-* and tests/dev-v4-*, NOT the three
generic shell helpers. The bounded implementation therefore adds
scripts/dev-v4-target-hooks.mjs and tests/dev-v4-hook-compatibility.test.mjs,
and extends the existing installed-controller adapter/test. No generic shell
helper is edited in T1; native Git invokes the reviewed installed hooks.
Their legacy wrapper/installer corrections remain T2 with its actual policy
admission. This supersedes only the earlier proposed T1 four-path expansion.
No alias/config write or unchecked old guarded-push/install-hooks-all execution.

The new renderer emits only the five hook images as data; no shared hook or
Git-config write. The merged central transaction executor remains the sole
writer. Its images call the existing adapter for v3, retain embedded native
legacy identity checks without depending on an absent v3 adapter, and preserve
ref/origin/exact-range/audit requirements. Post-event images perform only local
observation and preserve checkout mismatch warning; no npm or foreign writer.

The existing two local-commit exceptions are consumed and are not reused.
The following observations are retained as the pre-implementation baseline.
Current clean source was verified at
`4a4aa16bea7be13da7ffb3000ac8ecf1616623ab`, tree
`ff2f4e245477e79f40080c351a1d2347307e9d9f`; real v3 state remains revision3,
implementation-ready, original codeBase/policyCommit
`15d8c1a380401a167c0f3e13e54b9b8ad5f21078` and plan anchor
`b598b0007775491ac3e6f42906a9c743afefc593`.

### Complete installed-hook boundary

The native common-dir pre-commit/pre-push reject missing legacy markers before
repo-local code. Pre-push also calls a fixed foreign ai-agent memory script.
The initial two-hook proposal was incomplete: post-commit starts foreign npm
memory capture/sync; post-merge and post-checkout run workspace-wide refresh,
with post-merge also saving a session. The latter two write a global refresh
timestamp. These paths were read, NOT executed. Ten registered Hub checkouts
share the common repository; this is not an own-worktree-only live mutation.

Proposed live write set is FIVE existing common-dir hook files only:
pre-commit, pre-push, post-commit, post-merge, post-checkout. commit-msg remains
byte-unchanged. No Git aliases/config, installed defaults, task state, foreign
worktree source, Notes or central hook is a target.

Observed mode is0755 for all; exact preimage SHA-256:

| Hook | Preimage |
| --- | --- |
| pre-commit | `6ba6e2a3054b888446032068a6b55db89f18933f13d9f56f7670c5347dff80a5` |
| pre-push | `b2bff3fc858b5a02a2a2356e9cb9d7944a269f01f4550ff8d9e212dc20ba826d` |
| post-commit | `9f133032a05f0cd57719747a0bcedd51ce2c36a5665db8f10828a9f138b55417` |
| post-merge | `83566d97ab9561fcb262a6d9694a76fde3487796e8a4ffb5701b4820aa0f2d4b` |
| post-checkout | `590f0a4e51af51b963ba2673eb11401c7d17598afeb90bd85d0633b12c2f18f2` |
| unchanged commit-msg | `0da0638f6a72f4b38edea28cfc36ebc60cb21bfd1a675e9dced7a8b9c1722494` |

The read-only central hook matrix observed no dependent-activation routing
block, writes:false and authorityGranted:false. It is a routing observation,
not trusted hook contents, freshness at apply, a lease or activation permission.

### Historical proposal — superseded by the current checkpoint above

1. Existing installed-controller adapter/test: add a bounded v3 continuity read
   of installed status, exact original task/base/policy/engine/current Git pins,
   ready policy, safe state files and stable before/after reads. Neither HOME,
   PATH nor other caller overrides may select the production trusted controller.
   Validated local dirty source is allowed for a commit; clean exact HEAD is
   required for push. No state/marker synthesis or publication permission.
2. Add `scripts/worktree-continuity-guard.sh` to bound scope: v3-only dispatch
   without fallback on unsafe/orphan state; unchanged legacy identity path when
   no v3 namespace exists. Missing adapter on v3 blocks, never downgrades.
3. Move `scripts/guarded-push.sh` and `scripts/install-hooks-all.sh` from T2-only
   to T1 as well. Remove sibling discovery/commands; the latter becomes a
   current-repo-only deterministic render/transaction interface, not a loop over
   repos or an alias/config writer. No direct overwrite fallback.
4. Five rendered hooks must retain main/master and ref protection, origin and
   actual transport checks, exact per-ref source range, required repo-local
   policy/audit checks, legacy identity behavior and checkout mismatch warning.
   The old pre-push exports range variables which this repo's audit does not
   consume: use its existing `--mode range --base <sha> --head <sha>` interface
   for each accepted push row. Reject unsupported/unknown input before effects.
   Post-event hooks retain local observation only, without background jobs,
   npm, shared-memory timestamp or sibling writes. commit-msg is not regenerated.
5. Add `tests/dev-v4-hook-compatibility.test.mjs` to T1. Private fixtures cover
   v3 valid/blocked/stale/recovery/pin mismatch, no-v3 legacy, missing adapter,
   dirty push, main/ref/origin/transport/actual-range errors, unknown refs,
   all five event paths, foreign sentinel unchanged, no network/background
   execution, alternate hook config, render determinism and postimage parity.
   Use existing Stage B entrypoint for registration; Stage A verifier, immutable
   snapshots and active root v1 policies remain unchanged. No test is yet run.
6. Central exact target phases add the four new Hub source paths above;
   existing adapter/tests already fit. DOCSYNC uses the current six allowed
   target documents. No broad script prefix or provider permission expansion.

### Non-circular bootstrap and recovery sequence

Existing merged central executor `dev-v4-target-hook-install.py` and its two
fixed siblings are sufficient; do not invent another installer. Its prepare
does not require a merged or clean Hub candidate: it binds truthful committed
HEAD/tree and exact approved hook bytes. It does NOT bind the uncommitted
scripts called by those hooks. Independent review/frozen source hashes and
staged tree comparison therefore cover those dependencies before every apply.
Do not claim candidate hashes are a self-issued authority.

Order: authorize this bounded amendment including the single initial docs-only
checkpoint exception below → commit/bind the expanded plan → reviewed private source/hook images
and dependency freeze → exact native host/common-dir/routing/preimages plus
independent executor/runtime/source approval → explicit short Git/hook/config
writer quiescence across this Hub common-dir → prepare/freeze manifest →
fresh single-use grant/lease → apply five files with durable per-file journal →
postimage/native/old-worktree fixture readback → finish any necessary rollback
BEFORE native HEAD advances → native commit/bind/push under their own gates.

The first plan anchor is a NEW explicitly approved docs-only native commit:
verified own current v3 identity, exact staged plan/continuity and expanded
finite file list, native main/integrity/commit-msg checks retained, supported
per-command context exception only, system tools plus existing rg with npm
absent to prevent the unchanged post-commit foreign-memory writer. Freeze and
read back exact staged/commit tree; then supported same-task bind. It is not
either consumed exception and permits no push, host apply or later commit
bypass. Without approval, even this preparatory commit does not run.
The manifest cannot be expanded/bound through a fabricated legacy marker.
No hook-image, approved manifest, grant or lease currently exists.

After commit changes HEAD/tree, the original transaction cannot restore hooks.
Any later restore requires a separately approved fresh transaction bound to the
new HEAD with preserved original preimages, journals and nonces. No manual
restore or claim of unconditional rollback. Multi-file apply is not atomic.
Uncertain mutation permits status/readback only, not replay.

Final acceptance still requires native Hub T1 publication, central finite scope,
all four merge witnesses, Air/Mini dual-reader stage, T2 policy rollout and
both hosts' new/old-task checks. This amendment activates no root v2 policy.
No main fetch, provider call, source commit, shared-hook mutation or new agent
was performed for this diagnostic addendum. No quiet window is held.

Status: reviewed local source candidate; native recovery explicitly approved
by Arnold on 2026-10-21, limited to the two local commits described below.

<!-- DEV-DELIVERY-V2-MANIFEST
{
  "schemaVersion": 3, "contractId": "dev-v4.plan",
  "planId": "dev-risk-scoped-hub-20261020", "repo": "impact_hub",
  "selectorId": "dev-governance-source",
  "identity": {
    "taskId": "dev-risk-scoped-hub-20261020", "branch": "dev/risk-scoped-hub-20261020",
    "codeBase": "15d8c1a380401a167c0f3e13e54b9b8ad5f21078",
    "policyCommit": "15d8c1a380401a167c0f3e13e54b9b8ad5f21078"
  },
  "decision": {"state": "approved", "summary": "Existing separate central DEV task: bounded Hub adapter source, not native-context override, publication or live authority."},
  "authorization": {"source": "task-request", "taskRequestDigest": "9eb6138c61619c713347eec89de66d36ddb8113c28757b2470cf62dda6d4548a"},
  "scope": {
    "changeImpact": "protected", "riskTier": "high", "releaseProfile": "source-only",
    "changeAllowlist": [
      "config/dev-delivery-v2-policy.json",
      "config/dev-v4/graded-delivery.v1.json",
      "config/dev-v4/lifecycle-contract.v1.json",
      "config/dev-v4/task-selectors.v1.json",
      "scripts/install-hooks-all.sh",
      "scripts/safe-repo-audit.sh",
      "scripts/guarded-push.sh",
      "scripts/dev-v4-installed-controller-adapter.mjs",
      "scripts/dev-v4-target-hooks.mjs",
      "tests/dev-v4-installed-controller-adapter.test.mjs",
      "tests/dev-v4-hook-compatibility.test.mjs",
      "tests/dev-v4-stage-b.test.mjs",
      "docs/dev-plans/dev-risk-scoped-hub-2026-10-20.md",
      "docs/continuity/dev/2026-10-20-dev-risk-scoped-hub.md",
      "docs/impact-hub-governance-system-plan-2026-06-16.md",
      "docs/impact-hub-doc-sync-map-2026-06-23.md",
      "docs/bastion-guard-status.md", "notes.md", "system-status-snapshot.md"
    ],
    "documentationTargets": [
      "docs/continuity/dev/2026-10-20-dev-risk-scoped-hub.md",
      "docs/impact-hub-governance-system-plan-2026-06-16.md",
      "docs/impact-hub-doc-sync-map-2026-06-23.md",
      "docs/bastion-guard-status.md", "notes.md", "system-status-snapshot.md"
    ]
  },
  "validation": {"profileId": "affected", "recipePolicyCommit": "15d8c1a380401a167c0f3e13e54b9b8ad5f21078"}
}
DEV-DELIVERY-V2-MANIFEST -->

## Goal, scope and acceptance

Fix real Hub adapter selection/recovery errors. Retain root v1, old pins,
native/Stage A protections, no product/provider/runtime/shared-hook changes.
Bootstrap was planning-only, treebc794c0bfa227f4ebdb332f028b6f3b588cdca5e.
SECRETARY actually rendered engine verified, writes:false, packet absent.
The initial projection required a committed plan. Anchor b598b0007775491ac3e6f42906a9c743afefc593
now exists; supported bind returned revision2/implementation-ready and source
requirements returned continue/missingFacts:[], memory-unavailable advisory.
The plan and continuity were explicitly staged by their two exact allowlisted
paths with staged-blob readback despite the existing /docs/* ignore rule.
No .gitignore change or broad force-add was used.
Parent: office-hue/ai-agent dev/risk-scoped-20261020 sourced329593dfd831c97dd3b505eb1d70cbae8f88df8;
master docs/dev-plans/dev-central-exclusive-write-surfaces-risk-scoped-20261020.md.
Notes7f191a4c and Factlens55f6ebd are separate role evidence, not Hub tests/grants.

## File-level implementation after native anchor and supported bind

1. scripts/dev-v4-installed-controller-adapter.mjs: preserve exported helper
   names where useful, all three canonical origin spellings and --brief FILE
   forwarding. Bound calls use the fixed dispatcher and actual own-state pin,
   never candidate policy/default or conflicting descriptor. Resolve real Git
   metadata; unsafe/orphan state is not unbound. Unbound start requires primary
   main and one local origin/main committed snapshot; choose exact accepted
   canonical descriptor, no retry/fallback. Controller fetch/revalidation is
   later, not an expected-base guarantee; a real start needs a new quiet window.
   Hub lifecycle lacks repoId/accepted capsuleVersion: validate activation
   repoId=impact_hub, exact tuple and top-level capsule3. New commands only bind
   --task-id/--plan-anchor and exact context --render. Strict duplicate-free
   argv, bounded output/time, Notes'16 safe native error codes, unknown errors
   sanitized. Scrub GIT_* then force/forward GIT_NO_REPLACE_OBJECTS=1. Remove
   arbitrary ambient executable/descriptor override semantics, no generic framework.
2. tests/dev-v4-installed-controller-adapter.test.mjs: replace real-target policy
   mutations and installed-default/host reads with private Git/argv fixtures.
   Cover bound pins, committed policy vs candidate/HEAD, replacements, exact
   descriptor, unsafe/orphan metadata, duplicate/unknown args, brief/origins,
   safe/unknown errors and read-only render. Scrub fixture GIT_*; private empty
   hooks, normal commits, pre-write metadata containment/hostile-env regression.
3. tests/dev-v4-stage-b.test.mjs: one import of the adapter test into existing
   CI Node entrypoint. This test is not immutable Stage A. No .github/ change
   (out of selector), pinned Stage A test/verifier, config, hash or hook edit.
   Baseline on the bound schema3 task was 8/9: the first test incorrectly
   assumed any protected local result meant stale legacy HEAD; the real
   result is ENOENT for absent worktree-active.json. Repair only this test:
   when either exact legacy file is actually absent outside CI, assert
   protected/authoritative:false/ready:false and that exact missing-file
   diagnostic. Do not generate markers, widen admission or call this a real
   Stage B pass. All other failures still fail; actual adapter exit is
   reported separately. Register the new suite afterward, then rerun once.
4. Six listed DocSync/continuity files: actual checks, failures, state/next and
   no false readiness. No new runtime module or UI; manual UI N/A.

## Diagnosed native hard boundary — not waived

Actual common pre-commit requires absent worktree-active.json. No safe Hub
standalone producer exists; its legacy starter writes shared coordination and
can run sibling memory writers. Actual common post-commit can asynchronously
run npm memory:capture/sync in another ai-agent worktree. Both must be resolved
before commit/bind. The approved per-command context exception resolved the
first local commit boundary without a shared-hook edit, manual capsule,
hook-path redirection, --no-verify or main override.

Explicit OPERATOR DECISION (2026-10-21: "engedélyezem, de különúton sos haladj"):
exactly two own-branch local
commits (plan anchor and reviewed source) with native context exception backed
by verified v3 identity, unchanged main/integrity checks, and isolated required-
tool execution without optional foreign npm memory writing. Implementation:
per-command IMPACT_POLICY_ALLOW_CONTEXT_MISMATCH=1, verified schema3 task
identity and fixed source pin; isolated PATH containing system tools and
only the existing rg binary, with npm verified absent. Native hooks remain
unchanged and run normally; the main guard and commit-msg check remain active.
No IMPACT_POLICY_ALLOW_MAIN_COMMIT, hook redirection or --no-verify. No push/merge,
provider/host/install grant follows either option. Do not execute the unsafe
legacy starter or fabricate Stage B capsule/decision/admission.

Local git-health-check reports WARN main behind origin/main by seven commits
and FAIL for two existing pre-push requirements (memory:gate and continuity
guard). These are not PASS and remain publication blockers. This approved
local-only recovery does not edit those shared hooks or chase main.

## Validation, operation sequence and rollback

Safe native route → docs anchor → supported same-selector bind/readback/source
requirements → code → Node22 private adapter suite and changed Stage B entrypoint,
applicable Stage B/maximum bastion, syntax/scope/diff checks and independent
five-axis review → corrected DocSync → native source checkpoint. Actual missing
legacy facts remain protected/unverified, never synthetic PASS. No unrelated
Jest/product/harvester/provider/host scan or dependency install. Available6/6.1
only; historical5.6 typed receipts are never invoked/faked. Two failed repairs
per identifier require diagnosis/short plan; original full-plan audits persist.

All three actual target path sets must be aligned ONCE in the planned protected
CENTRAL maintainer-targets declaration/parser/tests, not from this Hub lane.
Native publication still needs exact source/check/approval/CAS/provider proof;
four repo witnesses cover central S/P plus three T1 roles, not local commits.
Air engine-only stage/readback/canary+rollback, then Mini stage, precede separate
T2 root-v2/hook authority, fresh witnesses/grants and final target acceptance
Air then Mini. No old-pin migration/main chase. Rollback here: guarded source
revert only, not host/data rollback authority. Current end state: source-only.

## Source-candidate verification (2026-10-21)

Three-file implementation complete: fixed dispatcher/committed-base selection,
bound-pin delegation without candidate/default selection, normal bind and exact
read-only render, safe files/JSON/argv/Git environment and sanitized failures.
The existing Stage B test entrypoint imports the hermetic adapter suite.
Focused adapter59/59 on first run; combined entrypoint68/68 after the single
diagnosed Stage B expectation repair. Syntax and diff checks pass. Real new-
adapter SECRETARY render exited0, verified engine/writes:false/packet absent,
with lifecycle state bytes unchanged. Real Stage B remains protected; maximum
bastion is pass-unverified, never ready/provider authority.

Independent fresh-context architecture and five-axis code audit found no
confirmed functional/security defect. Managed security-diff-scan
fd3177ac-79d1-4086-ac9c-f4fab163712e completed with zero reportable findings;
its reviewed artifact hashes and limitations are in continuity. Timeout recovery
was not exercised; trusted predecessor enforcement and actual start/fetch are
not replaced by successful synthetic-dispatcher tests. Source candidate is not
published, merged, installed, activated or production-accepted. Next dependency:
protected central exact-path admission for the three target source sets.
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
