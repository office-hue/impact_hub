## Summary
- What changed?
- Why was it needed?

## Scope Boundaries
- In scope:
- Explicitly out of scope:

## Risk Level
- [ ] Low
- [ ] Medium
- [ ] High
- Risk notes:

## Test Evidence
- Commands run:
  - `npm run lint`
  - `npm run test:smoke`
- Result summary:

## Guard Evidence
- [ ] Safe audit strict passed (`scripts/safe-repo-audit.sh --repo <repo> --strict --mode push`)
- [ ] Branch protection checks considered (`lint-smoke`)
- Additional guard notes:

## Rollback Plan
- Revert strategy:
- Data/ops impact during rollback:

## Docs
- [ ] Docs updated
- [ ] Docs not needed (reason):

## Docs-only Exception
- [ ] This is docs-only (no runtime/code path changes)
- If checked: list touched paths and why tests/guards were minimized.

## PR Exit Checklist (Required)
- [ ] 1. Work was done on dedicated branch/worktree (not `main`)
- [ ] 2. Relevant build/tests ran and are green
- [ ] 3. `safe-repo-audit.sh --strict --mode push` is green
- [ ] 4. `system-status-snapshot.md` updated for module change
- [ ] 5. At least one `docs/*.md` updated for module change
- [ ] 6. `notes.md` or `conversation-summaries/*` updated (notes-context repos)
- [ ] 7. `docs/bastion-guard-status.md` updated when new module file was added
- [ ] 8. Deploy guard + smoke checks are logged (if deploy happened)
- [ ] 9. Backup/rollback path is recorded
- [ ] 10. PR description includes scope, risk, validation, deploy/rollback notes
