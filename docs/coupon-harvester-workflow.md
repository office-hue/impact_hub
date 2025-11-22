# Coupon Harvester – Részletes folyamatleírás

Ez a playbook összefoglalja, hogyan fut a kupon-harvester lokálisan, szerveren és GitHub Actions-ben. Tartalmazza a szükséges inputokat, a generált outputokat és a fájlok pontos helyét.

## Kódbázis és fő fájlok
- Harvester kód: `tools/coupon-harvester.ts`
- Config: `tools/coupon-harvester.config.json`
- Whitelist/registry: `tools/shops_registry.json`
- Dognet forrás: `tools/dognet_programs.csv` (61 sor)
- CJ export: `tools/cj_shops.json` (WP-CLI `wp option get impactshop_cj_shops --format=json`) → `tools/cj_shops.csv` (slug, domain, program_id). Összevont registry: 101 sor (Dognet 61 + CJ 40).
- Playwright + runtime függőségek a workflow-ban települnek: `node-html-parser`, `csv-stringify`, `googleapis`, `playwright`, `ts-node`, `typescript`.

## Gmail input (secrets)
- `tools/secrets/gmail/credentials.json`
- `tools/secrets/gmail/token.json`
- GitHub Actions-ben titkosítva: `GMAIL_CREDENTIALS_JSON`, `GMAIL_TOKEN_JSON` (teljes JSON tartalom), a workflow írja ki fájlba:
  - `tools/secrets/gmail/credentials.json`
  - `tools/secrets/gmail/token.json`

## Whitelist/registry generálás
- Dognet CSV-ből:  
  `cd tools && WHITELIST_SRC=dognet_programs.csv WHITELIST_OUT=shops_registry.json npx ts-node whitelist-generator.ts`
- CJ export beolvasásához: szerveren `wp option get impactshop_cj_shops --format=json > tools/cj_shops.json`, majd lokálisan:  
  `python3 merge_registry.py` (vagy a beépített snippet) → `tools/cj_shops.csv` + friss `tools/shops_registry.json` (Dognet + CJ együtt, deduplikált domainnel).
- A generált `shops_registry.json` tartalmazza a partnerek slug–domain párokat; a harvester a Gmail és web scraping során ezt használja a domain→shop mappinghez.

## Futtatás lokálisan
1) Függőségek (repo gyökér): `npm install`
2) Playwright böngésző: `npx playwright install chromium`
3) Harvester:  
```
cd tools
PLAYWRIGHT=1 DRY_RUN=0 TS_NODE_TRANSPILE_ONLY=1 \
  GMAIL_CREDENTIALS=./secrets/gmail/credentials.json \
  GMAIL_TOKEN=./secrets/gmail/token.json \
  npx ts-node coupon-harvester.ts
```
- Output: `tools/out/sandbox/manual_coupons_draft-YYYY-MM-DD.csv` és `tools/out/sandbox/manual_coupons_draft-latest.csv`.

## Futtatás GitHub Actions-ben
- Workflow: `.github/workflows/coupon-harvest.yml`
- Trigger: `workflow_dispatch` (Run workflow)
- Secretek: `GMAIL_CREDENTIALS_JSON`, `GMAIL_TOKEN_JSON` → fájlba írja a `tools/secrets/gmail/` alá.
- Függőségek: a `tools` mappában telepíti a runtime csomagokat (`node-html-parser`, `csv-stringify`, `googleapis`, `playwright`, `ts-node`, `typescript`), majd `npx playwright install chromium`.
- Harvester futás: `PLAYWRIGHT=1 DRY_RUN=0 TS_NODE_TRANSPILE_ONLY=1 ... npx ts-node coupon-harvester.ts`
- Artifact: `manual_coupons_draft` (benne `manual_coupons_draft-*.csv`, `manual_coupons_draft-latest.csv`).
- Utolsó sikeres futások: pl. run ID `19595822363` (main, success). Letöltés: `gh run download <run_id> --name manual_coupons_draft -R office-hue/impact_hub`.
- Opcionális Google Custom Search (CSE): ha az alábbi env/secretek megvannak, a scraper a registry domainekre CSE találatokat is felvesz a `scrape` listába:
  - Secrets: `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_CX`
  - Env: `GOOGLE_SEARCH_ENABLED=1`, opcionális: `GOOGLE_SEARCH_RESULTS_PER_DOMAIN` (1–10, alap 3), `GOOGLE_SEARCH_MAX_DOMAINS` (alap 20)
  - Keresés: `<domain> (kupon OR kuponkód OR coupon OR akció OR sale)`, az első N találat URL-je bekerül a scrape-be (Playwright/fetch dolgozza fel).

## Futtatás szerveren (ha van sudo hiány, Playwright nem indul)
- Ha nincs sudo (cp40), Playwright nem fut, marad a fetch-alapú scrape. Gmail fut, de web 0 lehet.
- Ha van sudo/apt:  
  `sudo apt-get update && sudo apt-get install -y libatk-bridge2.0-0 libatspi2.0-0 libgbm1`
  majd a lokális futtatáshoz hasonló parancs (env path a szerverre mutat).

## Szűrés és mapping logika
- Domain normalizálás a Gmail „From” mezőn: levágja a mail/newsletter/akcio/hello/owner/marketing/sales/m/hírlevél stb. prefixeket, kipróbálja a base domaint (pl. `mail-pinkpanda.hu` → `pinkpanda.hu`).
- Noise kódok kizárása: `DOCTYPE`, `BACKGROUND-IMAGE`, `DATA`, `2025`, `2026`.
- Csak akkor kerül sor a CSV-be, ha a domain illeszkedik a `shops_registry.json`-ban lévő partnerre; különben a `NEEDS_MAPPING` sorok eldobódnak (célszerű a hiányzó partnert felvenni a registrybe).

## Kimenet
- Fájlok: `tools/out/sandbox/manual_coupons_draft-YYYY-MM-DD.csv`, `manual_coupons_draft-latest.csv`
- Artifact (CI): `manual_coupons_draft` (azonos CSV-k)

## Teendők, ha hiányzik partner (pl. Pink Panda)
- Add a megfelelő slug–domain párt a registrybe (`tools/shops_registry.json`), vagy generáld újra a registryt olyan forrásból, amely tartalmazza a partnert (Dognet/CJ export).
- Újrafuttatás után a partner kuponjai megjelennek a CSV-ben.

## Playwright működés / korlátok
- Lokálisan és Actions-ben fut (Chromium letöltés a workflow-ban). Szerveren sudo hiánya miatt a szükséges libek (`libatk-bridge2.0-0`, `libatspi2.0-0`, `libgbm1`) nélkül nem indul.
- ENV: `PLAYWRIGHT=1` kapcsolja be. Ha nem indul, fallback a sima fetch.
- Kattintási próbák: kupon/kód gombok felismerésére néhány selectorral (text kupon/coupon/kód, `.coupon-code`, `.show-code`, button:has-text).
- Webtalálat akkor várható, ha a `scrape` listában kupon/akció URL-ek vannak, vagy a root oldalon ténylegesen megjelenik kuponkód. JS-es oldalakhoz Playwright kell.
