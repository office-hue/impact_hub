# PR Policy (Standard)

Ez a repo a közös PR és hook policyt követi.

## Kötelező PR szabályok

- Új fejlesztői ág indítása mindig `origin/main` alapról történjen.
- Kötelező PR template használat checkboxokkal.
- A `PR-EXIT-CHECKLIST.md` pontjai legyenek maradéktalanul kipipálva.
- Push előtt a `pre-push` hook kötelezően fusson `--strict --mode push` módban.

## Ajánlott napi/heti rutin

- Új klón vagy új worktree után futtasd: `bash scripts/install-hooks.sh`
- Új munkaág indítása: `bash scripts/start-feature-worktree.sh <feature-branch>`
- Állapotellenőrzés: `bash scripts/git-health-check.sh`

## Cél

A policy célja, hogy csökkentse a hamis blokkolást, és egységes, auditálható PR/deploy folyamatot adjon mindhárom aktív repóban.
