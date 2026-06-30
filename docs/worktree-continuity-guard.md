# Worktree Continuity Guard

Datum: 2026-06-30
Statusz: runtime continuity minimum
Scope: helyi `impact_hub` continuity/guard reteg a task-start marker, a decision artifact es a koordinacios snapshot hook-szintu ervenyesitesere.

## Cel

Ez a helper azt ellenorzi, hogy a helyi runtime starter lane utan a reviewer-visible evidence ne csak letrejojjon, hanem push elott kotelezoen jelen is maradjon.

Minimum contract:

1. legyen jelen a `worktree-active.json` marker;
2. legyen jelen a `worktree-task-start-decision.json` artifact;
3. a marker es az artifact a jelenlegi branchre es worktree pathra mutasson;
4. a workspace `.worktrees/ACTIVE_WORKTREE.md` es `.worktrees/ACTIVE_WORKTREES.md` snapshotok tartalmazzak a decision evidence-et;
5. a continuity lane ne engedjen tovabb, ha a task-start decision eleve `blocked`.

## Kanonikus fajlok

- `scripts/worktree-continuity-guard.sh`
- `scripts/guarded-push.sh`
- `scripts/install-hooks-all.sh`
- `scripts/worktree-readiness-check.sh`
- `scripts/git-health-check.sh`

## Runtime szabaly

Az `impact_hub` helyi H4 szeletben a continuity guard:

1. push elott kotelezo;
2. a pre-push hook es a `git wpush` wrapper ugyanazt a guardot futtatja;
3. `blocked` allapotban fail-closed;
4. `degraded` allapotban atenged, de reviewer-visible warningot ad.

## Decision model

Lehetseges kimenetek:

1. `allowed`
2. `degraded`
3. `blocked`

Tipikus blokkolo okok:

1. hianyzo marker vagy hianyzo decision artifact
2. branch/path mismatch a markerben vagy az artifactban
3. hianyzo decision evidence a workspace snapshotban
4. `task-start-decision-blocked`

Tipikus warningok:

1. `task-start-decision-degraded`
2. hianyzo doc-sync scope metadata

## Kapcsolat a korabbi H1-H3 szeletekkel

Ez a guard nem valtja ki a H1-H3 retegeket, hanem rajuk epul:

1. `H1`: local starter + readiness
2. `H2`: task-start decision artifact
3. `H3`: coordination snapshot evidence surfacing
4. `H4`: continuity/guard hook enforcement

## Natural Next Step

Innen a kovetkezo termeszetes szelet mar a kozponti `ai-agent` writeback (`H5`), ahol a merge-elt helyi continuity truth visszakerul az all-repo rollout matrixba es activation truthba.
