# PR Exit Checklist

1. A munka dedikált branch/worktree alatt készült, nem `main`-en.
2. A releváns build/teszt parancsok lefutottak és zöldek.
3. `safe-repo-audit.sh --strict --mode push` lokálisan zöld.
4. Modulmódosításnál frissült a `system-status-snapshot.md`.
5. Modulmódosításnál frissült legalább egy `docs/*.md`.
6. Notes kontextusnál frissült a `notes.md` vagy `conversation-summaries/*`.
7. Új modulfájl esetén frissült a `docs/bastion-guard-status.md` evidencia.
8. Deploy előtt/után kötelező guard és smoke ellenőrzések dokumentálva vannak.
9. Rollback útvonal (backup + visszaállítási lépés) rögzítve van a változáshoz.
10. PR leírás tartalmazza: scope, kockázat, ellenőrzés, deploy/rollback jegyzet.
