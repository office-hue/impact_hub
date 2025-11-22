# Coupon Harvester – Rövid útmutató

Sandbox használatra, éles feedet nem ír.

## Futtatás
1) Whitelist generálás (opcionális, Dognet/CJ CSV-ből):
```bash
WHITELIST_SRC=dognet_programs.csv WHITELIST_OUT=shops_registry.json ts-node tools/whitelist-generator.ts
```

2) Gmail token (installed app):
```bash
GMAIL_CREDENTIALS=credentials.json GMAIL_TOKEN=token.json ts-node tools/token-init.ts
```

3) Harvester futtatás:
```bash
# DRY run (nem ír fájlt)
DRY_RUN=1 GMAIL_CREDENTIALS=credentials.json GMAIL_TOKEN=token.json ts-node tools/coupon-harvester.ts

# Normál run (draft CSV az out/sandbox-ba)
GMAIL_CREDENTIALS=credentials.json GMAIL_TOKEN=token.json ts-node tools/coupon-harvester.ts
```

4) Fixture alapú smoke (példa):
- Gmail mock helyett állítsd `GMAIL_DISABLED=1`, és csak a scrape fut.
- Használhatsz lokális HTML-t (pl. fixtures/html/decathlon-coupon.html) mock fetch-csel, vagy készíts egy rövid unit tesztet a regex extract-ra.
- DRY_RUN=1 mellett nem ír fájlt, csak logol.

## Rövid config minta (coupon-harvester.config.json)
```json
{
  "outDir": "out/sandbox",
  "newerThanDays": 14,
  "whitelist": [
    { "slug": "decathlon", "domain": "decathlon.hu" },
    { "slug": "yves_rocher", "domain": "yves-rocher.hu" }
  ],
  "gmail": {
    "labels": ["Promotions", "Updates"],
    "query": "(subject:kupon OR subject:coupon OR \"kuponkód\" OR \"kedvezmény\")"
  },
  "scrape": [
    { "slug": "decathlon", "url": "https://www.decathlon.hu/kupon" }
  ]
}
```

## Unit teszt skeleton (jest/ts-jest példa)
```ts
// tools/__tests__/extract.test.ts
import {readFileSync} from 'fs';
import {parse} from 'node-html-parser';
import {describe, it, expect} from '@jest/globals';
import {/* extractFromHtml */} from '../coupon-harvester'; // exportold a függvényt, ha teszteled

describe('extractFromHtml', () => {
  it('kupon kinyerése HTML-ből', () => {
    const html = readFileSync(__dirname + '/../fixtures/html/decathlon-coupon.html', 'utf8');
    const coupon = /* extractFromHtml */(html, 'Tárgy', 'promo@decathlon.hu', [
      {slug: 'decathlon', domain: 'decathlon.hu'}
    ]);
    expect(coupon?.coupon_code).toBe('SPORT20');
    expect(coupon?.discount_label).toMatch(/20%/);
  });
});
```
Futtatás (példa): `npx jest tools/__tests__/extract.test.ts`

## Fájlok
- `coupon-harvester.ts` – fő futtatható váz (Gmail + whitelistelt scrape, draft CSV).
- `coupon-harvester.config.json` – config (OUT_DIR, newerThanDays, whitelist, optional registry=shops_registry.json, Gmail query, scrape target).
- `gmail-auth.ts` – OAuth/Service Account helper.
- `token-init.ts` – OAuth token kinyerés (installed app).
- `whitelist-generator.ts` – Dognet/CJ CSV → slug/domain JSON.
- `fixtures/` – minta Gmail/HTML források teszthez.

## Megjegyzés
- Scope: `gmail.readonly`.
- Whitelist-only, no-login scrape. Draft CSV: `manual_coupons_draft-YYYY-MM-DD.csv` + `*-latest.csv` az OUT_DIR-ben.
- Éles TablePress/Sheets feedbe csak manuális review után másolj. 
