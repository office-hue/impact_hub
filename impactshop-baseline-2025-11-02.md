# ImpactShop – Projekt státusz (Baseline – nem felülírható)

*Generálva:* 2025-11-02 14:53:47 +0100 (Bujdoso-Mac-mini)  
*Megőrzési szint:* **ETALON** – ez a fallback kiindulópont minden jövőbeli módosításhoz, automatikus eszköz nem írhatja felül.

## Meta
- Gyökér: /Users/bujdosoarnold/Documents/GitHub
- Környezet: local
- SSH_HOST: nincs megadva
- Git ág: main
- Git hash: 6b3df54
- Módosított fájlok száma: 13

## REST healthcheck
- Staging: HTTP 200 (1.18 s, ok – végső URL: https://app.sharity.hu/impactshop-staging/wp-json/, elvárt redirect) – https://sharity.hu/impactshop-staging/wp-json/
- Production: HTTP 200 (0.90 s, ok) – https://app.sharity.hu/wp-json/

## Megjegyzések
- A staging környezet szándékosan átirányítja a forgalmat az app.sharity.hu hostra; ezt az impactall futások ne tekintsék hibának.
