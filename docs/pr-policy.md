# PR Policy (Enforced One-Path)

Ez a repo **kötelező, egyetlen útvonalú** commit/push/PR/deploy policyt követ.

## Kötelező útvonal (minden munka)

1. Új klón vagy új worktree után futtasd:
   - `bash scripts/install-hooks-all.sh`
2. Új fejlesztés csak `origin/main` alapról indulhat:
   - `bash scripts/start-feature-worktree.sh <feature-branch>`
   - automatikusan fut: `memory:pre-task` + branch context pack (`.codex/context/<branch>.md`)
3. Módosítás után kötelező helyi állapotellenőrzés:
   - `bash scripts/git-health-check.sh`
4. Push csak feature/worktree ágról mehet, `main/master` közvetlen push tiltott.
5. PR nyitás javasolt parancsa:
   - `npm run pr:create-with-memory -- --fill` (PR + auto memory capture)
6. PR csak kötelező checklist blokkal nyitható (`PR-EXIT-CHECKLIST.md`).
7. Napi zárás ajánlott:
   - `npm run memory:digest` (digest markdown, opcionális email)
8. Deploy csak guardolt útvonalon mehet, és csak merge-elt főágból.

## Hard enforce (technikailag beállítva)

- `pre-commit` hook: blokkolja a commitot `main/master` ágon.
- `commit-msg` hook: automatikusan hozzáadja a `Memory-ID: none` sort, ha hiányzik.
- `pre-push` hook: blokkolja a közvetlen `main/master` push-t.
- `pre-push` hook: kötelező policy fájlok meglétét ellenőrzi.
- `pre-push` hook: `safe-repo-audit.sh --strict --mode push` futtatása kötelező.
- `pre-push` hook: memory gate (`memory:gate`) kötelező.
- `pre-push` hook: PR auto-memory sync (`memory:sync-pr`) fail-open módban.
- `post-commit` hook: automatikusan memóriába rögzíti a commit kontextust (fail-open).
- `post-merge` + `post-checkout` hook: automatikus memóriafrissítés throttlinggal (fail-open).
- CI: PR Checklist Guard kötelező PR body ellenőrzéssel.

## Workflow kiegészítők (dev-memory)

- `memory:pre-task`: task-indítási brief mentése `tmp/state/dev-memory/last-brief.json`-ba.
- `memory:context-pack`: branch-specifikus `.codex/context/<branch>.md` generálás.
- `memory:incident`: gyors incident capture + rollback checklist.
- `memory:digest`: napi markdown digest (`tmp/state/dev-memory/daily/`).
- `memory:install-digest-cron`: napi digest cron telepítés.
- `memory:install-copilot-cron`: Copilot chat ingest napi cron telepítés.

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
