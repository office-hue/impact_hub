# Impact Hub Env/Auth/Runtime Guard Adapter

Datum: 2026-06-17
Statusz: local adapter minimum
Scope: a kanonikus env/auth/runtime guard helyi, `impact_hub` recovery/deploy/guard lane-jeire konkretizalt adaptere

## Cel

Ez a dokumentum nem uj globalis guardot vezet be.

A celja az, hogy az `impact_hub` sajat recovery, deploy es guard lane-jeire konkretizalja a kozos guard minimumot:

1. local inventory scope
2. local managed env/auth target
3. host-config restore minimum
4. runtime contract checklist
5. release-gate wrapper sorrend
6. local continuity anchor

## Local Inventory Scope

Az adapter a kovetkezo helyi truthra es lane-ekre epul:

1. `docs/system-recovery-map.md`
2. `docs/pr-policy.md`
3. `scripts/git-health-check.sh`
4. `system-status-snapshot.md`
5. `notes.md`

Kulonosen erintett lane-ek:

1. guard/recovery workflow
2. deploy-referenced runtime perimeter
3. `.codex`-alapu local ops evidence, ahol a repo erre hivatkozik

Allowed repo scope:

- `impact_hub`

Blocked scope:

- mas repo guard env-jere vagy secret store-jara mutatas
- recovery truth modsitas rollback/restore ut nelkul
- olyan runtime claim, amelyhez nincs helyi recovery vagy guard referencia

## Managed Env/Auth Target

Az `impact_hub` adapterben a managed target:

1. a helyi operatori shell/env, amelyre a `docs/system-recovery-map.md` hivatkozik
2. a repo altal dokumentalt guard/alert auth lane
3. az external `~/bin/impactall` operatori belépőpont, ahol a helyi recovery map erre tamaszkodik

Kovetkezmeny:

- repo-tracked secret bevezetes -> `blocked`
- nem dokumentalt auth target -> `blocked`
- recovery map altal nem fedett runtime auth claim -> `degraded` vagy `blocked`

## Host-Config Restore Minimum

A helyi restore truth minimuma:

1. `docs/system-recovery-map.md`
2. a dokumentumban hivatkozott backup/recovery anchorok
3. a valos `system-status-snapshot.md` continuity nyom

Minimum restore-evidence:

1. melyik guard/deploy/recovery lane serult
2. melyik recovery-map szekcio a known-good referencia
3. milyen restore vagy verify parancsot hasznalunk
4. mi a post-restore egeszsegjelzes

## Runtime Contract Checklist

Guard vagy recovery-erinto lane csak akkor lehet `allowed`, ha:

1. a valtozasnak van egyertelmu hivatkozasa a `docs/system-recovery-map.md`-ben vagy a `docs/pr-policy.md`-ban
2. a `scripts/git-health-check.sh` nem jelez policy- vagy lane-hibat
3. a continuity nyom frissult
4. a helyi verify ut egyertelmu

Helyi verify minimum:

```bash
bash scripts/git-health-check.sh
```

Operativ health truth:

```bash
~/bin/impactall
```

## Release-Gate Wrapper Sorrend

A helyi minimum sorrend:

1. feature/worktree fegyelem
2. recovery/guard anchor beazonositas
3. git health
4. operatori health truth vagy explicit no-runtime-change dontes
5. continuity visszairas

Precedencia:

- `blocked`: nincs recovery truth, nincs verify ut, nincs continuity
- `degraded`: van helyi referencia, de az operatori runtime evidence reszleges
- `allowed`: recovery anchor + health path + continuity koherens

## Continuity Anchor

A helyi continuity minimum:

1. `docs/impact-hub-governance-system-plan-2026-06-16.md`
2. `docs/impact-hub-env-auth-runtime-guard-adapter-2026-06-17.md`
3. `system-status-snapshot.md`
4. `notes.md`

## Focused Validation

Positive:

```bash
test -f docs/impact-hub-env-auth-runtime-guard-adapter-2026-06-17.md
test -f docs/system-recovery-map.md
test -f docs/pr-policy.md
test -f scripts/git-health-check.sh
```

Negative:

```bash
test ! -f .env.production
test ! -f .env.staging
```

Az adapter itt is azt erositi, hogy a repo nem secret tarolo, hanem recovery/guard truth anchor.
