# ImpactShop Badge System — Concept & Specification (v0.1)

## 1. Purpose & Positioning
- **Mission**: turn the invisible “adomány-ráta” (30 / 50 / 70 %) logika into an easy-to-read, motivating signal for NGOs and donors without felfedni a belső jutalék számításait.
- **Audience**: ImpactShop-partner NGO-k (belső dashboard + weboldal beágyazás), kereskedő partnerek (Legend-jelvény mint bizalmi jel), valamint a támogatók (jelzés, hogy az adott NGO aktív).
- **North star**: dinamikus, gamifikált, de stabil rendszer, ami lépésről lépésre jutalmazza a mobilizációt, és azonnal reagál az aktivitásra.

## 2. Market Intelligence (Why the Mode System Works)
| Szereplő            | Mit csinál                                  | Mit tanulunk belőle                                      |
|---------------------|---------------------------------------------|----------------------------------------------------------|
| GlobalGiving        | 3 szint (Partner/Leader/Superstar) éves pont | A többfokozatú státusz érthető, de túl lassú a reakció.  |
| Charity Navigator   | Statikus 0–4 csillag badge                  | Bizalmi jel növeli a konverziót, de ritkán frissül.      |
| Benevity/YourCause  | Belső státuszok, vállalati integráció       | A transzparens profil + státusz combos B2B-ben.          |
| Shields.io          | Dinamikus SVG badge                         | Technikai mintát ad: cache-elhető, no-JS opció.          |
| Gamifikációs best practice | Világos cél + hysteresis (anti-flapping) | Kell egy stabil logika, hogy a badge ne ugráljon naponta. |

**Következtetés**: a háromsávos, Mode-nyelvű rendszer piackompatibilis, ha gyorsan reagál, relatív mérést használ, és a külső kommunikációt erősíti (nem pedig bonyolítja).

## 3. Status Taxonomy & Copy
| Badge Mode     | Marketing tagline                                | Narratíva (külső)                                                                                   |
|----------------|--------------------------------------------------|------------------------------------------------------------------------------------------------------|
| **Spark Mode** | „Indul a pulzus”                                 | Friss lendület, most pörögnek az első vásárlások. Mindenki innen startol, a jelzés motivál a lépésre. |
| **Momentum Mode** | „Folyamatos tolóerő”                         | Stabil heti aktivitás, a közösség reagál. Mutatja, hogy a kampányod fenntarthatóan hozza az eredményt. |
| **Legend Mode** | „Ikonfokozat”                                   | Példaértékű mozgósítás, a kereskedők prémium jutalékot nyitnak. A státusz ritka és kiemelt figyelmet kap. |

**Kommunikációs alapelv**: soha nem írjuk ki, hogy a háttérben ez 30 / 50 / 70 % kifizetési sávról szól; kifelé csak az aktivitási mód látszik.

## 4. Scoring Model (Belső = 30 / 50 / 70)
### 4.1 Időablakok
1. **Volume (V)**: utolsó 30 nap, A+P státuszú, `data1`-es Dognet-rendelések (rejected kizárva, duplum deduplikálva).
2. **Momentum (G)**: utolsó 7 nap vs. megelőző 7 nap (bevétel + rendelés darabszám).
3. **Recency (R)**: hány nap telt el az utolsó A/P konverzió óta.

### 4.2 Volume Index
```
E (baseline) = max(
    cohort_baseline(sector, visitor_tier),   # új belépőknél
    median(last_three_30d_windows),          # ≥90 napos NGO-knál
    150 €                                     # alsó korlát, hogy ne legyen nulla
)
V = min(70, 70 * (actual_30d / E))
```
*Cohort példák*: egészségügy + <1k havi látogató → €200, oktatás + 5k látogató → €800. Így a kicsik nem indulnak hátrányból.

### 4.3 Momentum Bonus
```
growth = (current_7d - previous_7d) / max(previous_7d, 1)
if growth ≥ +50%: base = 20
elif growth ≥ +20%: base = 10
else: base = 0
confidence = min(1, order_count_7d / 5)   # kis minta → kisebb súly
G = base * confidence
```

### 4.4 Recency Bonus
```
if last_order_days <= 7:   R = 10
elif last_order_days <=14: R = 5
else:                      R = 0
```

### 4.5 Összpont & Küszöbök
```
S = V + G + R    # 0–100

Legend Mode:   enter if S ≥ 70 AND (orders_30d ≥ 5 AND merchants_30d ≥ 3)
               drop  if S < 55 OR 14 nap inaktivitás

Momentum Mode: enter if S ≥ 40
               drop  if S < 25 OR 21 nap inaktivitás

Spark Mode:    minden más helyzet vagy 30 nap tétlenség
```
**Hysteresis**: a belépési küszöb magasabb, mint a kiesési → nem “villog” a jelvény.

### 4.6 Anti-gaming
- Minimum 3 rendelés / 30 nap bármely szinthez (különben Spark).
- Merchant-diverzitás: Legendhez legalább 3 különböző kereskedő.
- Velocity guard: ha 24 órán belül ≥40 rendelés érkezik ugyanazon IP-csoportból, ideiglenes vizsgálat → badge befagyasztása.
- Extrém jutalékú partnereket capeljük, hogy ne torzítsák a V értéket.
- Új belépő 14 napos „Spark grace” — nem csúszik le nullára, miközben még tanulja a rendszert.

## 5. NGO Experience
### 5.1 Dashboard Widget (belső)
```
[Legend Mode]   Score: 72/100   (V: 52, G: 10, R: 10)
Stability bar:  ├────────────72%────────────┤   Drop threshold: 55%
Tip: „Ha 7 napig nincs rendelés, -10 pontot buksz. Indíts hírlevelet most!”
Road to Legend: „Ha Momentum vagy: 24 pont hiányzik, kb. 5 rendelés.”
```
Plusz: heti e-mail riasztás, ha S < (küszöb + 10), subject „Legend Mode veszélyben”.

### 5.2 Külső kommunikáció
- Rövid magyarázó panel: „A Badge jelzi, mennyire aktív a közösséged ezen a héten. Spark → Momentum → Legend.”
- Marketing copy ötletek:
  - „Kapcsolj Momentum Mode-ba — a közösséged ritmusa tart életben.”
  - „Legend Mode = prémium jutalék + kiemelt láthatóság a kereskedőknél.”
  - „A badge élő: amint új kampányt indítasz, a státusz is reagál.”

## 6. Embed Options (NGO Website)
```html
<!-- A) SVG badge (nulla JS) -->
<a class="impactshop-badge-link"
   href="https://app.sharity.hu/impactshop?ngo=bator-tabor"
   rel="noopener">
  <img
    src="https://app.sharity.hu/impact/embed/badge.svg?ngo=bator-tabor&theme=auto"
    alt="ImpactShop státusz: Momentum Mode"
    loading="lazy"
    referrerpolicy="no-referrer"
    style="max-width:100%;height:auto;border:0" />
</a>

<!-- B) Mini widget (progress + CTA) -->
<div id="impactshop-badge"
     data-ngo="bator-tabor"
     data-theme="auto"
     data-show-progress="true"
     data-cta="https://app.sharity.hu/impactshop?ngo=bator-tabor"></div>
<script async src="https://app.sharity.hu/impact/embed/badge.js"></script>

<noscript>
  <a href="https://app.sharity.hu/impactshop?ngo=bator-tabor">
    <img src="https://app.sharity.hu/impact/embed/badge.svg?ngo=bator-tabor" alt="ImpactShop Badge" />
  </a>
</noscript>
```
- **SVG badge**: szerveroldali render (`badge.svg`), 3 vizuális téma (Spark neon, Momentum dinamika, Legend glint), Accept-Language alapján HU/EN copy, CDN cache 1 óra.
- **badge.js**: ~6 KB, cookie-mentes; `GET /wp-json/impact/v1/ngo/{slug}/badge` endpointot hívja, és DOM-ba rajzolja a státuszt + progress infot.

## 7. Technical Architecture
1. **API** — `GET /wp-json/impact/v1/ngo/{slug}/badge`
   ```json
   {
     "status": "legend",
     "label": "Legend Mode",
     "score": 72,
     "components": {"V": 52, "G": 10, "R": 10},
     "nextLevel": {"label": "Maintain Legend", "gapPoints": 0},
     "topMerchants": [
       {"name": "eDigital", "logo": "https://cdn.../edigital.svg", "share": 0.45},
       {"name": "Extreme Digital", "logo": "https://cdn.../extreme.svg", "share": 0.30}
     ],
     "updatedAt": "2025-11-03T12:00:00Z"
   }
   ```
   - Cache: WP Transients (15 perc) + Cloudflare edge (max-age 300) az embed endpointnál.
2. **Batch számítás** — óránkénti cron (`impactshop_badge_recalc`):
   - Lekéri az utolsó 30/7/1 nap Dognet-adatát.
   - Számolja V, G, R pontokat, frissíti `ngo_badge_state` táblát (status, score, thresholds).
   - Ha threshold közelébe ér, event queue-be teszi az e-mail értesítést.
3. **Hiszterézis tárolása** — `ngo_badge_state` oszlopok: `current_status`, `score`, `last_status_change`, `inactivity_days`, `cooldown_until`.
4. **Embed szolgáltatás** — `/impact/embed/badge.svg` PHP controller:
   - Meghívja a badge API-t (`?cacheBust={etag}`).
   - Szerveroldali SVG template-be injektálja a labelt, ikon színkódot, Score tooltipet.
   - Támogat `theme=light|dark|auto`.

## 8. Implementation Roadmap
| Fázis | Időtartam | Scope                                                                                     |
|-------|-----------|-------------------------------------------------------------------------------------------|
| **Phase 1 — MVP** | 2–3 hét | Scoring engine (V/G/R), API endpoint, SVG badge render, NGO admin widget (score + komponensek). |
| **Phase 2 — UX polish** | 1–2 hét | Early warning bar, „Road to Legend” progress, heti e-mail alert, Accept-Language auto-copy. |
| **Phase 3 — Enhancements** | 2–3 hét | Top merchant chip, velocity guard, webhook/Slack alert Legend veszély esetén, public case study. |

## 9. Review Hooks & Open Questions
- **Naming**: 2025 Q4-től egységesen **Base / Rising / Legend** módokat kommunikálunk (Spark ➝ Base, Momentum ➝ Rising). Ajánlott A/B tesztelni a magyar copyt („Alap szint / Felfutó szint / Legend szint”).
- **Donation tiers**: Legend (1–5. hely) 65 %, Rising (6–15.) 55 %, Base (16.+) 45 % adományrátát kap. A rank snapshotot az NGO card dataset szolgáltatja, minden shortcode és REST aggregáció automatikusan ezt alkalmazza.
- **Baseline cohort adatok**: szükséges egy első körös táblázat a fő NGO-szegmensekre (szektor × látogatószám) → marketing + adatelemző input.
- **Merchant logos**: logóhasználati engedélyek? Kell egy fallback (monokróm chip), ha nincs logó.
- **Public transparency**: szükséges-e nyilvános leírás a scoringról, vagy elég a marketing copy? (jelenleg “magunknak” részletes, kifelé high-level.)

## 10. Review Log (Sonnet 4.5 – 2025-11-03)
- **Forrás**: Claude Sonnet 4.5 „ImpactShop Complete Ecosystem – Comprehensive Strategic Review” (2025-11-03 03:00). Összpont: 91 %, fő erősségek: ökoszisztéma-szemlélet, Apple Wallet retention, pszichológiára épülő scoring, erős diagnosztika, bizalomépítő UX.
- **Javaslat státusz táblázat** – minden tételnél rögzítjük az állapotot, így a következő review nem ismétli feleslegesen ugyanazt.

| # | Javaslat | Forrás | Státusz | Jegyzet |
|---|----------|--------|---------|---------|
| 1 | Wallet ↔ Badge szinkron (badge státusz a pass-ban + webServiceURL frissítés) | Sonnet 4.5 | **Backlog (P1)** | Pass generátor + Wallet API bővítés, ticket előkészítés alatt. |
| 2 | Early warning dashboard (stability bar + e-mail alert) | Sonnet 4.5 | **Backlog (P1)** | NGO admin modul része, UX-draft szükséges. |
| 3 | Cohort baseline táblák (szektor × visitor tier) | Sonnet 4.5 | **Backlog (P1)** | Új `impactshop_badge_cohorts` SQL tábla + negyedéves recalculáció. |
| 4 | Road to Legend progress bar + estimated actions | Sonnet 4.5 | **Backlog (P1)** | Badge API `nextLevel` mező + widget UI frissítés. |
| 5 | Top merchants chip (badge API + widget) | Sonnet 4.5 | **Backlog (P1)** | Dognet aggregáció + CDN-es logók, marketing copy egyeztetéssel. |

---
**Állapot**: kész véleményezhető koncepció. Következő lépés: stakeholder review (NGO success, marketing, engineering), majd Phase 1 feladatlista priorizálása.
