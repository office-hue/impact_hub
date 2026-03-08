## Summary

- Scope:
- Why:
- Risk:

## Validation

- [ ] Relevant build/test commands passed
- [ ] `safe-repo-audit.sh --strict --mode push` passed
- [ ] Deploy/smoke verification documented (if applicable)
- [ ] Rollback path documented

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
