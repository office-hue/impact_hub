# PR Policy (Enforced One-Path)

Ez a repo **kötelező, egyetlen útvonalú** commit/push/PR/deploy policyt követ.

## Kötelező útvonal (minden munka)

1. Új klón vagy új worktree után futtasd:
   - `bash scripts/install-hooks-all.sh`
2. Új fejlesztés csak `origin/main` alapról indulhat:
   - `bash scripts/start-feature-worktree.sh <feature-branch>`
3. Módosítás után kötelező helyi állapotellenőrzés:
   - `bash scripts/git-health-check.sh`
4. Push csak feature/worktree ágról mehet, `main/master` közvetlen push tiltott.
5. PR csak kötelező checklist blokkal nyitható (`PR-EXIT-CHECKLIST.md`).
6. Deploy csak guardolt útvonalon mehet, és csak merge-elt főágból.

## Hard enforce (technikailag beállítva)

- `pre-commit` hook: blokkolja a commitot `main/master` ágon.
- `pre-push` hook: blokkolja a közvetlen `main/master` push-t.
- `pre-push` hook: kötelező policy fájlok meglétét ellenőrzi.
- `pre-push` hook: `safe-repo-audit.sh --strict --mode push` futtatása kötelező.
- CI: PR Checklist Guard kötelező PR body ellenőrzéssel.

## Kötelező policy fájlok

- `docs/pr-policy.md`
- `PR-EXIT-CHECKLIST.md`
- `.github/pull_request_template.md`
- `scripts/start-feature-worktree.sh`
- `scripts/git-health-check.sh`

## Vészhelyzeti bypass (csak jóváhagyással)

- commit bypass: `IMPACT_POLICY_ALLOW_MAIN_COMMIT=1`
- push bypass: `IMPACT_POLICY_ALLOW_MAIN_PUSH=1`

A bypass használata csak ideiglenesen engedett, és PR-ben kötelező dokumentálni.
