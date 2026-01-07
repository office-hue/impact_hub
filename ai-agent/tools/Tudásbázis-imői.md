# Sharity Tudásbázis – „Impi” segéd adatmodell

## 📘 Áttekintés

**Sharity** egy digitális, átlátható adományozási platform, amely lehetővé teszi, hogy bárki — pénzzel vagy akár pénz nélkül — támogasson civil szervezeteket. A cél: hogy a jótékonyság elérhető, könnyű és biztonságos legyen.  [oai_citation:0‡Sharity](https://adomany.sharity.hu/about-us?utm_source=chatgpt.com)

- Az app elérhető iOS‑en és Androidon, van web‑felülete (böngésző) is.  [oai_citation:1‡wrd.hu](https://wrd.hu/our-work/sharity-case-study?utm_source=chatgpt.com)  
- A modell különlegessége: **nem von le jutalékot** az adományból — az adomány értéke teljes egészében a kiválasztott civil szervezethez vándorol.  [oai_citation:2‡Sharity](https://adomany.sharity.hu/about-us?utm_source=chatgpt.com)  
- A Sharity célja, hogy „sok kicsi sokra megy” elv alapján — azok is tudjanak segíteni, akiknek nincs sok pénzük, de idővel, figyelemmel, vásárlással vagy videónézéssel hozzájárulnának.  [oai_citation:3‡hellobiznisz.telekom.hu](https://hellobiznisz.telekom.hu/a-sharity-app-ujrairja-az-adomanyozasi-gyakorlatot-avagy-miert-eri-meg-egy-alapos-kutatasra-epiteni-a-vallalkozast?utm_source=chatgpt.com)  

---

## 🚶 Konkrét felhasználói útvonalak

1. **Pénz nélküli adomány** – kampány/NGO kiválasztás → 15–30 mp reklám → jutalék jóváírás → push értesítés.  
2. **Impact Shop vásárlás** – deal kiválasztása → Impi `go?shop=<slug>&d1=<ngo>` link → partner webshop → jutalék → STS jelentés.  
3. **NGO kampány** – cél (pl. 1M Ft) → közösségi megosztás → valós idejű progress bar → STS bizonylatok feltöltése → kampány zárása.  

---

## ⚙️ Hibahelyzetek & Impi válasz sablonok

| helyzet | technikai fallback | Impi üzenet |
|---|---|---|
| Deeplink 404 | CTA → Fillout | „Ez a link most lejárt 😅 Itt egy friss, vagy kattints ide és válaszd ki kézzel az ügyet.” |
| API timeout | automatic retry | „Most lassabb a hálózat, próbálom újra… ha pár perc múlva sem megy, szólj!” |
| NGO nincs listában | leaderboard refresh + Fillout CTA | „Nem találtam ezt az ügyet, írd le pontosan vagy válaszd ki a Fillout oldalon.” |
| Duplikált adomány gyanú | STS flag | „Látom többször is beküldted – a STS csapat ellenőrzi, ne aggódj!” |

---

## 🗂 NGO kategóriák & matching

- Kategóriák: állatvédelem, oktatás, környezet, egészség, szociális, kultúra.
- Javaslat: Impi a felhasználó kedvenc kategóriája alapján top 3 NGO-t ajánljon (Roadmap 2026 Q1).
- Slug felismerés: token alapú (minden szó szerepeljen); aliasokat a `ImpactShop_NGO_Card` datasetből vesszük.

---

## 📊 KPI-k & monitoring

| Dimenzió | KPI |
|---|---|
| Felhasználó | DAU/MAU, videó completion rate, átlagos adomány, conversion (visit→donation) |
| NGO | Kampány sikerességi arány, elszámolási idő, STS compliance score |
| Üzleti | Partner webshopok száma, affiliate conversion rate, CPM, CSR partner retenció |

---

## 🛡️ Biztonság & compliance (kibővítve)

- PCI DSS (bankkártyás fizetés), titkosított token tárolás, 2FA NGO adminoknak.
- GDPR: adatkezelési tájékoztató, anonymizáló/törlő scriptek, consent kezelő (GTM).  
- NAV / könyvelés: SZJA 1% kezelés, adományigazolás PDF, Big4 audit (STS).

---

## 🧭 Fejlesztési workflow & QA

1. `./impactctl refresh` – Copilot context update.  
2. Függőségek: `composer install`, `npm install`.  
3. Formázás: `vendor/bin/php-cs-fixer fix`.  
4. QA: `./bin/staging-qa-suite.sh`, `./bin/preflight-run.sh`, `.codex/scripts/sprint-preflight.sh`.  
5. Deploy: `scripts/hotfix-sync.sh` (staging→prod), `notes.md` logolás.  
6. Rollback: `scripts/rollback.sh`, `emergency-brake.sh`, `.codex/guards/*` figyelés.  

---

## 🔌 Impact Shop & technikai architektúra

### WordPress / mu-plugins
- Kötelezően betöltődő modulok (`wp-content/mu-plugins`), `.off` végződéssel ideiglenesen kikapcsolhatók.
- Kulcsfájlok: `impactshop-impi-chat.php`, `impactshop-ngo-card.php`, `impactshop-ai-agent-cli.php`, `impactshop-rest-totals.php`, `impactshop-go-routing.php`.
- Deploy: `HOTFIX_ALLOW_PHP_MISMATCH=1 scripts/hotfix-sync.sh <file...>` → staging + prod, cache flush kötelező.

### REST API referencia
```
GET /impactshop/v1/deals?shop_slug=<slug>&category=<cat>&limit=12
GET /impactshop/v1/deals_banners?ngo=<slug>&featured=1
GET /impact/v1/leaderboard?period=<month|quarter>&per_page=250
GET /impactshop/v1/ngo-card/<slug>?variant=full
POST /impactshop/v1/impi-chat { message, ngo_preference, limit, budget_huf }
```

### Deeplink / CTA logika
1. User megad slugot → `buildGoLink(shop_slug, ngo)` → `/go?shop=<slug>&d1=<ngo>&src=impi`.
2. Ha nincs slug → Fillout CTA (`https://form.fillout.com/t/eM61RLkz6jus` + query), Impi is ezt kommunikálja.
3. `/go-deal` hívásoknál `u=` paraméterben megy az eredeti shop URL; fallback: shallow URL detection, banner override.

### Affiliate & GA4
- Dognet, CJ, TradeTracker: slug formátumok (`cj-<id>`), postback / webhook integráció.
- GA4 attribútumok: `data-ga-event="click_deal"`, `data-ga-category="impactshop"`, `data-ga-label="<shop_slug>"`. Eventek: `click_deal`, `video_complete`, `donation_success`, `fillout_start`.

---

## Platform‑típusok és technikai lehetőségek

| Platform / forma | Leírás / miért jó |
|------------------|------------------|
| **Mobil alkalmazás** (iOS, Android) | Teljes funkcionalitás: kampányok böngészése, adományozás, reklámnézés, követés, értesítések.  [oai_citation:4‡wrd.hu](https://wrd.hu/our-work/sharity-case-study?utm_source=chatgpt.com) |
| **Weboldal (böngésző)** | Nincs szükség appra — böngészőn keresztül is elérhető az adományozás és kampányok böngészése.  [oai_citation:5‡Sharity](https://www.sharity.hu/?utm_source=chatgpt.com) |
| **Videós / reklámos támogatás (adomány pénz nélkül)** | A felhasználó reklámvideók, szponzorált tartalmak megtekintésével támogat civil szervezeteket — így pénz nélkül is tud segíteni.  [oai_citation:6‡Sharity](https://adomany.sharity.hu/about-us?utm_source=chatgpt.com) |
| **Vásárlásos / affiliate támogatás (Impact Shop, Sharity Kártya)** | Ha a felhasználó partner‑webshopban vásárol, vagy Sharity‑kompatibilis fizetőeszközt használ (Sharity Kártya), a vásárlás árrésének egy része jótékony célra megy — így a vásárlás nem kerül többe, mégis támogat.  [oai_citation:7‡Sharity](https://www.sharity.hu/?utm_source=chatgpt.com) |

> Megjegyzés: a „videós adományozás” és „vásárlásos / affiliate adományozás” lehetőségek révén azok is tudnak segíteni, akiknek nincs készpénzük vagy nagy összeget nem tudnak adni — de az idejükkel, figyelmükkel, vásárlásaikkal szeretnének támogatni.  [oai_citation:8‡Sharity](https://adomany.sharity.hu/tudnivalok?utm_source=chatgpt.com)

---

## Funkciók – Mit tud a Sharity (felhasználóknak, NGO-knak, cégeknek)

### 🎯 Felhasználók / támogatók részére

- Jótékony kampányok és civil szervezetek böngészése, kategóriák szerint szűrés.  [oai_citation:9‡Sharity](https://www.sharity.hu/?utm_source=chatgpt.com)  
- Kedvenc szervezetek, kampányok követése — értesítések (push / web‑értesítés), ha frissítés, eredmény vagy új tartalom van.  [oai_citation:10‡Sharity](https://adomany.sharity.hu/?utm_source=chatgpt.com)  
- Bankkártyás adomány – pénzbeli támogatás egyszerűen, biztonságosan.  [oai_citation:11‡Sharity](https://adomany.sharity.hu/tudnivalok?utm_source=chatgpt.com)  
- Pénz nélkül adományozás — reklámvideók vagy szponzorált tartalmak megtekintésével: minden megtekintés után a reklámozó vállalja, hogy támogat egy kiválasztott civil szervezetet.  [oai_citation:12‡Sharity](https://adomany.sharity.hu/about-us?utm_source=chatgpt.com)  
- Vásárlással való támogatás (affiliate / Impact Shop / Sharity Kártya), ahol a vásárlás árrésének része adományként megy tovább — a donor nem fizet többet.  [oai_citation:13‡Sharity](https://www.sharity.hu/?utm_source=chatgpt.com)  
- Nyereményjátékok, kampányok, tombolák — moderált, szervezett formában: reklámnézés + vásárlás + adomány + közösségi részvétel.  [oai_citation:14‡Sharity](https://www.sharity.hu/?utm_source=chatgpt.com)  
- Átláthatóság: minden adomány útja követhető. A Sharity évente (vagy negyedévente, kampányonként) összesítő jelentéseket készít, amelyben a civil szervezetek feltöltik a költési bizonylatokat, szerződéseket — ezek elemzésre kerülnek egy erre kialakított rendszeren keresztül.  [oai_citation:15‡Sharity](https://adomany.sharity.hu/tudnivalok?utm_source=chatgpt.com)  

### 🏢 Civil szervezetek / NGO‑k részére

- Kampányoldalak létrehozása, kampány indítása a platformon — bankkártyás adomány, reklám‑nézéses adomány, vásárlási / affiliate támogatás vagy kombinált kampány.  [oai_citation:16‡Sharity](https://app.sharity.hu/charity/?utm_source=chatgpt.com)  
- Teljes transzparencia: a beérkezett adományokról és azok felhasználásáról rendszeres (kampányonkénti) elszámolás kötelező; a számviteli bizonylatokat, szerződéseket a szervezetek feltöltik, külső szakértők (pl. Big4 könyvvizsgáló cégek) vizsgálják azokat.  [oai_citation:17‡Sharity](https://adomany.sharity.hu/tudnivalok?utm_source=chatgpt.com)  
- Megjelenési lehetőség: kampány beágyazása, kampány link megosztása, közösségi médiás megjelenés, reklám‑ és szponzorált tartalmak, „nagykövetek” részvételével.  [oai_citation:18‡Sharity](https://www.sharity.hu/?utm_source=chatgpt.com)  
- Lehetőség vállalati együttműködésre: cégek szponzorálhatnak kampányokat, reklámvideókat, tombolákat; ezzel civil + üzleti + közösségi célok egyszerre érvényesülnek.  [oai_citation:19‡VG](https://www.vg.hu/vilaggazdasag-magyar-gazdasag/2024/07/sharity-adomany-reklam?utm_source=chatgpt.com)  

### 🏢 Cégek / Szponzorok / CSR‑területen

- Reklám / partner‑marketing + CSR / jótékonyság ötvözése: a cég reklámja közvetlenül társadalmi hatást is létrehoz — a reklám eladásból származó bevétel adományként jut civil szervezetekhez.  [oai_citation:20‡Sharity](https://adomany.sharity.hu/about-us?utm_source=chatgpt.com)  
- ESG / CSR célok támogatása — a digitális adományozás + transzparens elszámolás + üzenetküldés révén a cég kommunikálhat társadalmi felelősséget, hitelességet és pozitív márkaképet.  [oai_citation:21‡WakeUp Magazin](https://wakeupmagazin.hu/sharity-adomanyozas-applikacio-penzbe-sem-kerul/?utm_source=chatgpt.com)  
- Kampányok, tombolák, közösségi kihívások támogatása — céges erőforrás + közösségi részvétel kombinálva: hatékony jótékonykodás + marketing + közösségi elköteleződés.  [oai_citation:22‡digitalhungary.hu](https://www.digitalhungary.hu/marketing/uj-tipusu-adomanyozasi-modszert-hozott-letre-a-Sharity/25046/?utm_source=chatgpt.com)  

---

## Speciális programok / mechanizmusok  

### 🎯 Adomány pénz nélkül – reklám‑ vagy videónézéssel  

A Sharity egyik legnagyobb újdonsága, hogy nem csak pénzt — hanem időt, figyelmet is értéknek tekint: felhasználók rövid reklám‑ vagy szponzorált videókat nézhetnek meg, és a videó megtekintésével támogatást generálnak egy civil szervezet számára. Így azok is tudnak segíteni, akiknek nincs pénzük, de van idejük, figyelmük.  [oai_citation:23‡Sharity](https://adomany.sharity.hu/about-us?utm_source=chatgpt.com)

Ez a modell újradefiniálja a jótékonyságot: adomány = figyelem + közösségi részvétel + reklám‑hirdetési modell.  [oai_citation:24‡hellobiznisz.telekom.hu](https://hellobiznisz.telekom.hu/a-sharity-app-ujrairja-az-adomanyozasi-gyakorlatot-avagy-miert-eri-meg-egy-alapos-kutatasra-epiteni-a-vallalkozast?utm_source=chatgpt.com)

### ♻️ Fenntarthatóság & társadalmi hatás  

A reklám‑nézésen és reklám‑hirdetésen alapuló modell lehetőséget ad kisebb cégeknek, helyi közösségeknek is, hogy részt vegyenek jótékonyságban — nem csak nagy pénzekkel, hanem kicsi, folyamatos támogatással. Ez közelebb hozza a civil társadalmat, növeli az elköteleződést.  [oai_citation:25‡hellobiznisz.telekom.hu](https://hellobiznisz.telekom.hu/a-sharity-app-ujrairja-az-adomanyozasi-gyakorlatot-avagy-miert-eri-meg-egy-alapos-kutatasra-epiteni-a-vallalkozast?utm_source=chatgpt.com)

Ezzel a modell segítségével a jótékonykodás demokratizálódik — nem csak azok segíthetnek, akik megengedhetik maguknak a nagy adományt, hanem bárki, aki időt, figyelmet, vásárlást tud hozni.  [oai_citation:26‡WakeUp Magazin](https://wakeupmagazin.hu/uj-korszakot-adomanyozas-vilagaban-sharity/?utm_source=chatgpt.com)

---

## Átláthatóság, bizalom és beszámolás

- A Sharity működése mögött álló civil szervezeteknek ki kell elégíteniük a úgynevezett Sharity Transparency Standard (STS) követelményeit: a bejövő adományokat térítésmentesen kezelik, kötelező elszámolás van, a költéseket számlákkal, szerződésekkel kell igazolni.  [oai_citation:27‡Sharity](https://adomany.sharity.hu/about-us?utm_source=chatgpt.com)  
- A felhasználók — adományozók — az alkalmazásban, kampányonkénti összesítő jelentéseken keresztül követhetik, hogy mire használták fel a támogatásokat.  [oai_citation:28‡Sharity](https://adomany.sharity.hu/tudnivalok?utm_source=chatgpt.com)  
- A szervezeteknek kötelező feltölteni a bizonylatokat, szerződéseket. Ezeket — kockázat esetén — külső, független szakértők (pl. könyvvizsgálók) is leellenőrzik.  [oai_citation:29‡Sharity](https://adomany.sharity.hu/tudnivalok?utm_source=chatgpt.com)  

---

## Miért érdemes használni a Sharity‑t?

1. **Alacsony belépési küszöb** – nem feltétel a nagy pénz, pénz nélkül is lehet segíteni: videónézéssel, idővel, vásárlással.  
2. **Teljes átláthatóság** – az adomány útja követhető, elszámolás van, civil szervezeteknek kötelező elszámolni — ez növeli a bizalmat.  
3. **Rugalmas támogatási formák** – magánszemély, civil szervezet, cég: mindenkinek van testre szabható opció.  
4. **Fenntartható közösségi modell** – kicsi, rendszeres támogatással is lehet nagy hatást elérni; ez demokratizálja a jótékonyságot.  
5. **CSR / ESG kompatibilitás cégeknek** – értékes társadalmi felelősségvállalás, hiteles, mérhető hatás, közösségi elköteleződés.  
6. **Technológiai rugalmasság** – app, web, reklám‑videók, affiliate, integráció lehetősége: modern eszközökkel könnyű bekapcsolódni.  

---

## 📚 Hivatalos források & verziózás

- **Adatkezelési tájékoztató / GDPR** – https://adomany.sharity.hu/wp-content/uploads/privacy.pdf  
- **STS transzparencia szabályzat** – belső PDF (frissítés: 2024 Q4) – civil szervezetek bizonylatfeltöltésének folyamata.  
- **Notes & runbook** – `impactshop-notes/notes.md`, `WORKFLOW.md` (minden változtatásnál frissítendő).  
- **Knowledge base mappa** – `ai-agent/Impi Tudásbázis/` (PDF-ek, kampány-esettanulmányok).  
- **Ez a dokumentum** – utolsó frissítés: 2025-11-30; kérlek jelöld a változtatások dátumát.  

---

## 🔌 Impact Shop & technikai architektúra (új)

### Impact Shop kapcsolat
- WordPress alapú affiliate hub (mu-plugins + plugins). Shoponkét slug, CTA, banner. A go-link `/go?shop=<slug>&d1=<ngo>&src=impactshop` formát követi, fallback a Fillout CTA.
- REST végpontok: `impactshop/v1/deals`, `impactshop/v1/deals_banners`, `impact/v1/leaderboard`, `impactshop/v1/ngo-card/<slug>` – ezekből építi Impi a javaslatokat.

### Backend / API réteg
- MU pluginek: `impactshop-impi-chat`, `impactshop-ngo-card`, `impactshop-ai-agent-cli` – UI, REST proxy, guardok.
- AI Agent: Node/Express gateway (`apps/api-gateway`) + `ai-agent-core`; snapshot források (`manual_csv`, `arukereso_playwright`).
- Affiliate hálózatok: Dognet, CJ, GA4 event tracking; `/go-deal` endpoint kezeli a `u=` paramétert.

### Adatkezelés & privacy
- GDPR‑kompatibilis adatkezelés, consent management, „right to be forgotten” script.
- STS audit + Big4 könyvvizsgálat; kampányonként bizonylatfeltöltés kötelező.

---

## 🚶 Konkrét felhasználói útvonalak (új)

1. **Pénz nélküli adomány** – videónézés → jutalék NGO-hoz → push értesítés.  
2. **Vásárlásos támogatás** – Impact Shop deal → go-link `d1`-gyel → vásárlás → jutalék → transzparens elszámolás.  
3. **Kampány követés** – NGO 1M Ft cél → közösség támogat → realtime progress + STS bizonylat → kampányzárás.  

---

## ⚙️ Hibahelyzetek & fallback (új)

| Helyzet | Kezelés |
|---|---|
| Deeplink nem nyílik | Fallback URL + Impi üzenet („Próbálom másik úton…”) |
| API timeout | Retry + barátságos hiba („Most lassabb a hálózat…”) |
| Lejárt deal | Fillout CTA + új ajánlat keresése |
| Dupla adomány | STS duplikáció jelzés → Impi supportot ajánl |

---

## 📊 KPI-k & mérés (új)

| Dimenzió | KPI |
|---|---|
| Felhasználó | DAU/MAU, videó completion, átlagos adomány, konverzió |
| NGO | Kampány sikeresség, elszámolási idő, STS score |
| Üzleti | Partner webshopok száma, affiliate conversion rate, CPM, CSR retenció |

---

## 🛡️ Biztonság & compliance (új)

- PCI DSS megfelelés, fraud detection, 2FA NGO adminoknak.
- GDPR audit trail, törlési kérelmek kiszolgálása, cookie consent.
- NAV/könyvelés: SZJA 1% támogatás, adományigazolás, Big4 audit.

---

## 🆚 Piaci pozícionálás & roadmap (új)

- Versenytársak: Adjukössze, Shoprenter Cashback, CSR platformok; Sharity USP: pénz nélküli adomány + 0% jutalék + STS transzparencia.
- Roadmap: 3–6 hó gamification + webwidget, 6–12 hó V4 expanzió + corporate dashboard, 12+ hó blockchain átláthatóság + AI NGO matching.

---

## 🤖 Impi személyiség (kiegészítve)

- Szurikáta jelleg: kíváncsi, csapatjátékos, optimista, transzparens.
- Kommunikációs példák: 
  - „Szia! 🌟 Három módon tudsz ma segíteni…”  
  - „Ha ezen a linken vásárolsz, a bolt fizeti a támogatást, neked nem kerül többe.”  
  - „Hoppá, ez most nem ment át – próbáljuk másik linkkel, vagy menjünk a Fillout űrlapra, ott is tudsz NGO-t választani.”

---

## 📂 Tudásbázis tárolás (új)

- Lokális források: `ai-agent/Impi Tudásbázis/` mappa.
- Ez a Markdown az AI agent gyors referenciája – minden új funkciónál frissítsd (Impact Shop, use case, fallback, KPI stb.).

## „Impi” – hangnem, viselkedés, segítőkészség  

Impi, a Sharity szurikátád, olyan segítő, aki mindig lelkes, barátságos és bátorító — még akkor is, ha valaki épp most ismerkedik meg a jótékonyság világával. Példák arra, hogyan kommunikálhat:

> „Szia! Impi vagyok — együtt keressük meg, hogyan tudsz ma jót tenni. 😊”  
> „Ha most nincs sok pénzed — semmi gond! Néhány perc videónézéssel is tudsz jót cselekedni.”  
> „Minden támogatás számít: egy kis segítség is sokat jelenthet. Sok kicsi sokra megy!”  

**Kontextusfüggő példák:**
- Lejárt link: „Fene egye meg, ez a deal tényleg lejárt 😅 Nézzük meg a frisseket, vagy kattints ide és válaszd ki a Fillout felületen!”
- Statisztika lekérdezés: „Eddig 12 450 Ft-ot gyűjtöttél – 8 200 Ft vásárlásokból, 4 250 Ft videókból. Még egy kicsi és beférsz a top 100-ba! 💪”
- NGO slug kérés: „Kit szeretnél támogatni? Írd be a kedvenc civil szervezet nevét, és én beállítom minden linkre.”

Impi hitében az áll, hogy a jótékonyság nemcsak adományról szól — hanem közösségről, reményről és hosszú távú, fenntartható hatásról.  

---

## Források / Referenciák  

- Sharity hivatalos oldal és „About us” szekció.  [oai_citation:30‡Sharity](https://adomany.sharity.hu/about-us?utm_source=chatgpt.com)  
- Sharity app / web platform leírások, „Tudnivalók” dokumentumok.  [oai_citation:31‡Sharity](https://adomany.sharity.hu/tudnivalok?utm_source=chatgpt.com)  
- Cikkek és médiamegjelenések, amelyek bemutatják, hogyan teszi lehetővé reklámnézéssel az adományt, és hogyan von be vállalatokat CSR‑hez / ESG‑hez.  [oai_citation:32‡Prim Online](https://hirek.prim.hu/cikk/2025/05/12/hirdetesekbol_jotekonysag_a_sharity_innovativ_modellje?utm_source=chatgpt.com)  
- Tanulmányok és technológiai hátterek — pl. a fejlesztést végző cég leírása (mobil app, backend, admin UI).  [oai_citation:33‡wrd.hu](https://wrd.hu/our-work/sharity-case-study?utm_source=chatgpt.com)  

---

## 💡 Javaslatok a további bővítéshez  

- Létrehozhatsz egy **„Adományigazolás & elszámolás”** szekciót: részletezni, hogyan kap adományozó és NGO igazolást, milyen formában, mikor.  
- Beilleszthetsz **aktuális civil szervezetek listáját + kategóriákat** (pl. állatvédelem, oktatás, környezet, egészség) — hogy Impi tudjon javaslatot adni, hová érdemes adni.  
- Egy **vállalati / CSR útmutató** szekció hasznos lenne — milyen lépésekkel tud egy cég bekapcsolódni, milyen előnyökkel, milyen riportolással.  
- Érdemes lehet egy **„technikai integráció / partner‑oldal embed / API”** használati útmutatót is létrehozni — hogy partnerek (webshopok, NGO‑k) könnyen integrálhassák a Sharity‑t.  

---
