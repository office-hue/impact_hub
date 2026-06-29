# Worktree Coordination Sync

Datum: 2026-06-29
Statusz: merged runtime minimum
Scope: helyi `impact_hub` worktree starter koordinacios snapshot minimum.

## Cel

Ez a helper a helyi `worktree-task-start` lane utan frissiti a workspace-szintu koordinacios snapshotot ugy, hogy:

1. legyen egy reviewer-visible aktiv write target;
2. latszodjanak az osszes helyi worktree dirty/clean allapotai;
3. a stale vagy prunable worktree-k ne boritsak fel a teljes starter bootstrapot.

## Kanonikus fajlok

- `scripts/worktree-coordination-sync.sh`
- `scripts/worktree-task-start.sh`
- `scripts/worktree-readiness-check.sh`

## Kimenetek

A helper a kozos `.worktrees/` teruletre ir:

- `.worktrees/ACTIVE_WORKTREE.md`
- `.worktrees/ACTIVE_WORKTREES.md`

## Runtime szabaly

Az `impact_hub` helyi starter lane-ben a koordinacios snapshot a marker bootstrap utan kotelezo lepes.

Jelenlegi fail-closed/fail-open hatar:

1. a marker bootstrap hiba: `blocked`
2. a koordinacios helper hiba: `blocked`
3. egy stale/prunable sibling worktree: nem blocker, hanem snapshot-szintu jelzes

## Prunable tolerancia

Ha a `git worktree list` matrixban marad egy nem letezo vagy prunable worktree:

1. a snapshot nem all meg;
2. az adott sor `invalid_worktree: yes` jelzest kap;
3. az aggregate output `summary_invalid_worktrees` mezoben osszesiti ezt.

Ezzel a fresh worktree inditas nem bukik el egy regi, mar nem letezo sibling path miatt.
