# ImpactShop System Recovery & Backup Handbook

> Updated: 2025-11-08 12:29 CET – source of truth for rebuilding the full ImpactShop WordPress stack after any data loss.

## 1. Snapshot & Health
- **Repo path:** `/Users/bujdosoarnold/Documents/GitHub`
- **Git:** `main @ 3443089` (40 modified files in working tree)
- **Baselines:** `impactshop-baseline-2025-11-02.md` (primary), `system-status-snapshot.md` (rolling log)
- **Guards:** `~/bin/impactall` (13/13 PASS) with alerts flowing to Discord webhook defined in `.codex/.env.guard`
- **WP REST:** `https://www.sharity.hu/impactshop-staging/wp-json/` → HTTP 200 (redirects to prod host intentionally); Production `https://app.sharity.hu/wp-json/` → HTTP 200
- **Secrets:** `.codex/.env` exports `GITHUB_TOKEN` (classic PAT – renewal required before manual expiry) and alert recipients

## 2. Environment Map

| Path / Group | Purpose | Notes & Key Files |
| --- | --- | --- |
| `.codex/` | Guardrails, cron jobs, reports | `.codex/.env`, `.codex/.env.guard`, `.codex/logs`, `.codex/reports`, `.codex/scripts`, `.codex/cron`, `.codex/tasks`, `.codex/sprint-tasks` |
| `.codex/cron/` | Guard executables (bash) | `workspace-backup.sh`, `secret-expiry-check.sh`, `ngo-card-prewarm.sh`, `impact-social-ledger-sync.sh`, `impactshop-snippet-refresh.sh`, `red-flag-alert.sh`, `gmail-password-check.sh`, `monthly-close.sh` |
| `.codex/scripts/` | Automation/QA scripts | `scaffold-openapi.sh`, `openapi-validate.sh`, `doc-lint*.sh`, `doc-link-check.sh`, `impact-social-ledger-sync.php`, `cron-health-dashboard.sh`, `sprint-preflight.sh`, `stub-inventory-sync.sh`, `tradetracker-scope-check.sh`, `validate-url-whitelist.sh`, `p0-stub-decision.sh`, `env-(en|de)crypt.sh` |
| `bin/` | Local entrypoints | `preflight-check.sh` (runs `~/bin/impactall` plus spot checks) |
| `docs/` | Product & ops documentation | `bastion-guard-status.md`, `impactshop-badge-system.md`, `impactshop-ngo-card-*`, `impactshop-ngo-card-acceptance.md`, `impactshop-ngo-card-brief.md`, `impactshop-ngo-card-release-phase1.md` |
| `impactshop-notes/` | High-level specs | `impact-hub-system-v1.3.md`, `Impact Hub 1_4.md`, `Impact Hub Portál TERV.ini.md`, `SORA integráció TERV.ini.md`, sprint logs under `chatgpt-history/`, QA scripts under `impactshop-notes/bin/` |
| `scripts/` | Deployment + tooling | `workspace-backup.sh`, `shortcode_sync/`, `wallet/`, `bastion-*`, `bluegreen-flip.sh`, `impactshop_restore_shortcode_pack.sh`, `impactshop-ngo-card-restore.sh` |
| `wp-content/mu-plugins/` | MU plug-ins powering ImpactShop | Full list in §4 |
| `logs/`, `status/`, `status_snapshots/` | Operational output | Keep to inspect drift (not part of git history) |
| `tests/` | Postman suites, unit tests | `tests/api/ngo-card.postman_collection.json`, wallet diagnostics, CLI tests |
| `wallet-diagnostics-*` | Collected device telemetry | Each folder includes per-run JSON and screenshots |
| `Impactshop Wallet Key*.p12/.cer`, `pass.cer`, `wallet-pass/` | Wallet provisioning secrets | Store offline; required for Apple Wallet updates |

> Sprint feladat jelölések: `S*.md` fájlban a `**Status:** ✅ DONE / CLOSED` fejléccel ellátott sprintet a red-flag guard automatikusan kihagyja, az `- [~]` teendők pedig descoped státuszt jelentenek (nem számítanak bele a készültségbe).

### 2.1 GitHub Repository Controls
- **Branch protection (`main`)** – PR approval + signed commits + required CI (`parity-check.yml`). Direct pushes are restricted to bot accounts.
- **Force push alert** – `.github/workflows/force-push-alert.yml` watches `github.event.forced`; on true it posts to Discord (`secrets.DISCORD_WEBHOOK_URL`) so bundle restore indulhat.
- **Restore path** – Git history elvesztése esetén klónozd a legutóbbi `~/.workspace_backups/*/repo.bundle` állományt (heti restore-test bizonyítja, hogy működik).

### 2.2 Hosting constraints (cp40.ezit.hu shared hosting)
- **Access scope:** a szolgáltató 2025-11-11-én megerősítette, hogy a cp40-es osztott tárhelyhez nincs és nem is lesz root/WHM hozzáférés. Csak a `sharityh` userhez kapcsolódó SSH, SFTP, WP-CLI és cPanel funkciók állnak rendelkezésre.
- **Tiltott/missing műveletek:** nem telepíthetünk új rendszer-csomagokat, nem módosíthatunk tűzfal/IPTABLES szabályt, nem indíthatunk/leállíthatunk szolgáltatásokat (httpd, php-fpm, cron), nem futtathatunk hosszú életű demonokat, és nem készíthetünk közvetlen szerver snapshotot vagy LVM mentést.
- **Recovery hatás:** minden védelem (rate limit, monitoring) csak WordPress MU plugin, WP-CLI vagy user-level Cron eszközökkel építhető; hálózati szintű hardeninghez Cloudflare/WAF szabályt kell használni; host-szintű változtatást ticketben kell kérni, és a kérést dokumentálni kell (`.codex/tasks/guard-actions.md`).
- **Operatív irányelv:** incidensek és új funkciók tervezésekor automatikusan vizsgáld meg, hogy megoldható-e WP/Cloudflare eszközzel; ha nem, kommunikáld, hogy hosting limitation miatt késleltetve lesz (vagy alternatív infrastruktúrát igényel). Őrizd meg a `impactshop-status.md` és `system-status-snapshot.md` fájlokban, mikor kellett support ticketet nyitni.

## 3. Critical File Manifest

### 3.1 Configuration & Secrets
- `.codex/.env` – alert recipients + `GITHUB_TOKEN` used by guards (current PAT expires 2026-02-06 08:04:16 +0100; guard warns 90 napnál).
- `.codex/.env.guard` – Discord webhook + channel (legacy “Slack” vars) controlling guard notifications.
- `.codex/.env.backup` – `WORKSPACE_BACKUP_REMOTE` / `WORKSPACE_BACKUP_RCLONE_OPTS` konfiguráció (automatikus rclone sync).
- `.codex/dns-guard-hosts.txt` – kanonikus `host=ip` lista a DNS / SSL guardhoz; jelenleg `app.sharity.hu=185.111.89.170`, `www.sharity.hu=167.172.43.175` – frissítsd, ha a cPanel zóna változik.
- `.codex/guards/mu-plugins-{presence,parity}-guard.sh` – SSH-n keresztül ellenőrzik, hogy a kritikus MU pluginek mindkét env-ben megvannak és a staging ↔ production SHA lista egyezik.
- `.codex/guards/go-routing-guard.sh` – 30 percenként HTTP smoke `/go` variációkra (cURL) → 5xx soha nem megengedett.
- `.codex/guards/wallet-apns-guard.sh` – Wallet P12 tanúsítvány lejárati figyelő + APNs reachability (`IMPACT_WALLET_KEYCHAIN_ACCOUNT=office@sharity.hu` rekordot használ a Keychainben).
- `.staging_env`, `.production_env`, `.deploy.production.env`, `.deploy.staging.env` (if present) – remote SSH + WP paths used by deploy scripts.
- `.production_env.bak-*` – dated backups; keep last known-good copy offline.
- `.codex/codex-version.lock` – pinned Codex CLI/TUI versions (format: `codex-cli=…`, `codex-tui=…`, currently `0.44.0` / `0.30.1`) enforced by `.codex/guards/codex-version-guard.sh`.
- `wp-config.php` (under `impactshop-notes/wp-content/`) – WordPress DB credentials and salts for reference; actual live file resides on hosting env.
- `percy.config.yml` – Percy visual regression credentials.
- `Impactshop Wallet Key*.p12/.cer`, `pass.cer`, `wallet-pass/manifest.json` – Apple Wallet signing assets.
- **Gmail Keychain entry:** Keychain Access → login → `msmtp-gmail` (service) / `bujdoso.arnold@bujdosoiroda.com` (account). `security find-generic-password -s msmtp-gmail -a bujdoso.arnold@bujdosoiroda.com` shows `mdat=20251020141203Z`, amelyet a guard használ; biztonsági másolat a `.codex/reports/gmail-keychain-meta.env` fájlban készül minden sikeres futáskor (fallback, ha a Keychain metadata olvashatatlan).
- `~/.config/Code/User/globalStorage/github.copilot/` – captured via `.codex/scripts/copilot-context-snapshot.sh` into each workspace backup for Copilot parity.

### 3.2 VSCode / Editor artifacts
- `.vscode/extensions.json` – curated extension allowlist (auto-update disabled in VSCode settings).
- `.vscode/extensions.lock` – SHA256 hashes exported by `scripts/lock-vscode-extensions.sh` to detect drift.
- `scripts/lock-vscode-extensions.sh` – run after any extension update to refresh the lockfile.
- `.codex/scripts/vscode-prelaunch-snapshot.sh` – captures Copilot/config/extension list; install `~/Library/LaunchAgents/hu.sharity.vscode-snapshot.plist` from `.codex/templates/launchd/` so minden VSCode indítás előtt snapshot készül (`launchctl load`).

### 3.3 MU Plug-ins (WordPress runtime)
```
wp-content/mu-plugins/
├── 000-impactshop-core.php
├── impact-deals-empty-fallback.php
├── impact-deals-rest-api.php
├── impact-mini-helpers.php
├── impact-shortcode-guard.php
├── impact-social-mvp-flag.php
├── impact-social-mvp.php
├── impact-social-shortcode-guard.php
├── impact-sum-sticky-ui.php
├── impactshop-activity-style.php
├── impactshop-analytics-events.php
├── impactshop-boot.php
├── impactshop-donation-rates.php
├── impactshop-embed-tool.php
├── impactshop-fillout-compat.php
├── impactshop-mail-router.php
├── impactshop-metrics-ngo.php
├── impactshop-netflix-shortcodes.php
├── impactshop-ngo-card-assets/
├── impactshop-ngo-card-cli.php
├── impactshop-ngo-card.js
├── impactshop-ngo-card.php
├── impactshop-rest-totals.php
├── impactshop-sticky-sum.php
├── impactshop-strict-pack.php
├── impactshop-wallet-direct.php
├── impactshop-wallet.php
└── sharity-impact-banners-deals.php
```

### 3.4 Guard & Automation Scripts
```
.codex/cron/
  production-health-check.sh
  gmail-password-check.sh
  impact-social-ledger-sync.sh
  impactshop-snippet-refresh.sh
  meta-insights.sh
  monthly-close.sh
  ngo-card-prewarm.sh
  red-flag-alert.sh
  secret-expiry-check.sh
  cron-heartbeat-guard.sh
  workspace-backup.sh

.codex/scripts/
  cron-health-dashboard.sh
  vscode-prelaunch-snapshot.sh
  go-routing-guard.sh
  mu-plugins-parity-guard.sh
  mu-plugins-presence-guard.sh
  offsite-backup-validator.sh
  doc-{lint|link-check|missing-refs-inventory}.sh
  impact-social-ledger-sync.php
  msmtp-test.sh
  openapi-validate.sh
  scaffold-openapi.sh
  sprint-{health,preflight}.sh
  stub-inventory-sync.sh
  wallet-apns-guard.sh
  wp-plugin-version-guard.sh
  tradetracker-scope-check.sh
  validate-url-whitelist.sh
  ... (see directory listing for complete inventory)
```

## 4. Rebuild Procedure (Disaster Recovery)
1. **Provision workstation/server**
   - macOS or Linux host with: Git, PHP 8.x, Composer, Node 18+, npm, bash, jq, curl, WP-CLI (`wp-cli.phar` stored in repo), msmtp.
   - Install required PHP extensions (`curl`, `intl`, `mbstring`, `zip`).
2. **Clone repository**
   ```bash
   git clone git@github.com:impactshop/impactshop.git
   cd impactshop
   ```
3. **Restore secrets & env files**
   - Copy saved `.codex/.env`, `.codex/.env.guard`, `.staging_env`, `.production_env`, `.deploy.*.env`, wallet certificates, Percy config, Apple Wallet assets.
   - Review `.codex/.env.guard` webhook URLs (Discord) and `.codex/.env` tokens.
4. **Install Composer dependencies (if vendor missing)**
   ```bash
   composer install --no-dev
   ```
5. **Install Node tooling**
   ```bash
   npm install
   ```
6. **Verify Codex CLI & VSCode state**
   ```bash
   bash .codex/guards/codex-version-guard.sh
   bash scripts/lock-vscode-extensions.sh   # ensures locked extensions are installed
   ```
7. **Provision WordPress MU plug-ins**
   - Sync `wp-content/mu-plugins/` to hosting environment via deploy scripts (`scripts/hotfix-sync.sh` / `scripts/shortcode_sync/`).
   - Run `bin/preflight-check.sh` locally to ensure PHP syntax + linters are clean.
7.5 **Validate remote PHP version before deploy**
   ```bash
   scripts/hotfix-sync.sh wp-content/mu-plugins/impactshop-boot.php --dry-run
   # vagy:
   ssh "$PROD_USER@$PROD_HOST" "php -v"
   ```
   - A `hotfix-sync` script automatikusan összeveti a remote és lokális PHP verziót; mismatch → interaktív megerősítés (vagy `HOTFIX_ALLOW_PHP_MISMATCH=1`).
8. **Restore database / baseline**
   - Use `impactshop-baseline-2025-11-02.md` as reference for WP settings, slugs, and data seeds.
   - Apply ledger / NGO data by running `.codex/cron/impact-social-ledger-sync.sh --env=production`.
   - **If the ticker cache is stale (>90 perc):** a guard mostantól automatikusan snapshotolja a bizonyítékot a `status_snapshots/ledger-sync/<timestamp>-<env>/` mappába (cron log + guard-events tail), ezért mielőtt újrafuttatnád a szkriptet, nézd meg az adott könyvtárat és csatold a riportokhoz.
9. **Rehydrate caches & assets**
   - Execute `bash .codex/cron/ngo-card-prewarm.sh production` and `staging`.
   - Run `bash .codex/scripts/stub-inventory-sync.sh`.
10. **Restore Copilot context**
    ```bash
    rsync -a ~/.workspace_backups/latest/copilot-context/ ~/.config/Code/User/globalStorage/github.copilot/
    ```
    - Opcionális: telepítsd a LaunchAgent sablont `cp .codex/templates/launchd/hu.sharity.vscode-snapshot.plist ~/Library/LaunchAgents/` és futtasd `launchctl load ~/Library/LaunchAgents/hu.sharity.vscode-snapshot.plist`, így minden VSCode indítás előtt automatikus snapshot készül.
10.5 **Activate VSCode snapshot LaunchAgent**
    ```bash
    cp .codex/templates/launchd/hu.sharity.vscode-snapshot.plist ~/Library/LaunchAgents/
    launchctl unload ~/Library/LaunchAgents/hu.sharity.vscode-snapshot.plist 2>/dev/null || true
    launchctl load ~/Library/LaunchAgents/hu.sharity.vscode-snapshot.plist
    ```
11. **Re-enable guards**
   - `bash scripts/install-guard-cron.sh` → installs the full `# >>> ImpactShop Guards >>>` block into `crontab`.
   - Verify Full Disk Access (macOS) for `cron` + Terminal.
12. **Verification**
    - `~/bin/impactall`
    - `bash .codex/guards/codex-version-guard.sh`
    - `bash .codex/scripts/openapi-validate.sh`
    - `bash .codex/scripts/doc-link-check.sh impactshop-notes/impact-hub-system-v1.3.md`
    - Inspect `.codex/logs/guard-events.log` for all guard names showing `result=OK` or expected WARN (e.g., sprint completion).

## 5. Backup Strategy

### 5.1 Existing Mechanisms
- `scripts/workspace-backup.sh` – bundles repo (+ selected secrets) into `~/.workspace_backups/<timestamp>/impactshop.bundle` plus tarball copies.
- `.codex/cron/workspace-backup.sh` – guard wrapper invoked via cron to run the script daily.
- `system-status-snapshot.md` – append-only operational log (auto-updated by `impactall`).

### 5.2 Operational Runbook
1. **Manual backup**
   ```bash
   cd ~/Documents/GitHub
   bash scripts/workspace-backup.sh --full     # creates tarball + git bundle
   ls ~/.workspace_backups/latest              # verify artifacts
   ```
2. **Scheduled backup & monitoring**
   - Ensure `crontab -l` contains the block from `.codex/cron/guards.crontab` (installed via `scripts/install-guard-cron.sh`):
     ```
     # >>> ImpactShop Guards >>>
     0 2 * * * bash -lc 'cd "$HOME/Documents/GitHub" && .codex/cron/workspace-backup.sh'
     30 3 * * 0 bash -lc 'cd "$HOME/Documents/GitHub" && scripts/backup-restore-test.sh'
     0 4 * * * bash -lc 'cd "$HOME/Documents/GitHub" && .codex/guards/codex-version-guard.sh'
     15 */6 * * * bash -lc 'cd "$HOME/Documents/GitHub" && .codex/guards/cron-heartbeat-guard.sh'
     */5 * * * * bash -lc 'cd "$HOME/Documents/GitHub" && .codex/cron/production-health-check.sh'
     */15 * * * * bash -lc 'cd "$HOME/Documents/GitHub" && .codex/cron/ngo-card-prewarm.sh production'
     7-59/15 * * * * bash -lc 'cd "$HOME/Documents/GitHub" && .codex/cron/ngo-card-prewarm.sh staging'
     # <<< ImpactShop Guards <<<
     ```
   - Logs: `~/.codex/logs/workspace-backup.cron.log`, `~/.codex/logs/restore-test.cron.log`, `~/.codex/logs/codex-cli.cron.log`, `~/.codex/logs/cron-heartbeat.cron.log`, `~/.codex/logs/production-health.cron.log`
3. **Off-site copy (mandatory)**
   - **REQUIRED:** set `WORKSPACE_BACKUP_REMOTE` (and optional `WORKSPACE_BACKUP_RCLONE_OPTS`) in `.codex/.env.backup`. `scripts/workspace-backup.sh` így automatikusan `rclone sync`-eli a friss backupot (pl. `r2:impactshop-backups`).
   - `.codex/guards/offsite-backup-validator.sh` minden nap 06:05-kor fut; FAIL ha a remote nem elérhető vagy a legfrissebb mappa >2 napos.
   - Manuális vészmegoldás: `rclone copy ~/.workspace_backups/latest remote:impactshop-backups/$(date +%F)`.
   - Wallet cert-ek + `.codex/.env*` mindig offline jelszó-vaultban (Bitwarden/1Password) is tárolandók.
4. **Verification cadence**
   - Weekly: restore the latest bundle into `/tmp/impactshop-restore-test`, run `git fsck`, `composer validate`, and `~/bin/impactall`.
   - Document results in `status_snapshots/backup-YYYYMMDD.md`.
5. **Retention & disk guard**
   - `scripts/workspace-backup.sh` ellenőrzi, hogy legalább 1 GB szabad hely maradjon (`WORKSPACE_BACKUP_MIN_FREE_KB`), különben FAIL + Discord alert.
   - Automatikusan csak a legfrissebb 45 backup marad meg (`WORKSPACE_BACKUP_RETAIN_COUNT`); a többit törli, így nem telik be a lemez.

### 5.3 What to Capture
- Git bundle (`git bundle create impactshop.bundle main` inside backup script)
- `wp-content/mu-plugins/`, `scripts/`, `.codex/`, `impactshop-notes/`, `docs/`, `tests/`, wallet assets, `.staging_env`/`.production_env`, `.codex/.env*`, `.codex/codex-version.lock`, `.vscode/`, Copilot snapshot, `impactshop-baseline-*`, `system-status-snapshot.md`, `impactshop-status.md`

### 5.4 Off-site remote configuration playbook
1. **Rclone remote létrehozása** – egyszeri parancs (példa Google Drive-ra):
   ```bash
   rclone config create impactshop-drive drive scope=drive.file root_folder_id= impact=full_access
   rclone mkdir impactshop-drive:impactshop-workspace-backup
   ```
2. **.codex/.env.backup frissítése**:
   ```bash
   export WORKSPACE_BACKUP_REMOTE="impactshop-drive:impactshop-workspace-backup"
   export WORKSPACE_BACKUP_RCLONE_OPTS="--fast-list --copy-links --transfers=4"
   ```
   (A repo-ban példaként szereplő `:local:` remote csak átmeneti megoldás; igazi off-site helyre cseréld, majd `source .codex/.env.backup`.)
3. **Gyors verifikáció**:
   ```bash
   bash scripts/workspace-backup.sh
   rclone ls impactshop-drive:impactshop-workspace-backup | tail
   ```
   Siker esetén létrejön az új timestamp mappa (pl. `2025-11-11_174500/`).
4. **Guard visszajelzés** – a következő `offsite-backup-validator` futás OK státuszt ad; ha WARN/FAIL marad, ellenőrizd a `~/.codex/logs/offsite-backup.cron.log` állományt és a Discord riasztást.

## 6. Disaster Recovery Map
1. **Pick backup set** (bundle timestamp + external secrets)
2. **Restore repo** – `git clone` or `git clone impactshop.bundle impactshop`
3. **Overlay secrets** – copy `.codex/.env*`, wallet assets, env files
4. **Install dependencies** – Composer + npm
5. **Replay automation** – `bash scripts/workspace-backup.sh --verify-only` (to ensure script works), `bash .codex/scripts/cron-health-dashboard.sh`
6. **Reseed WP** – use baseline doc, ledger sync, NGO prewarm, Percy config
7. **Re-enable guard crons** – run `scripts/install-guard-cron.sh`
8. **Confirm alerts** – monitor Discord channel for guard events; ensure `secret-expiry`, `red-flag-alert`, `ngo-prewarm` produce expected statuses
9. **Sign-off checklist**
   - `~/bin/impactall` success
   - `impactshop-status.md` timestamp updated
   - `.codex/logs/guard-events.log` contains current ISO timestamps with `result=OK/WARN`
   - Off-site backup schedule verified (`ls ~/.workspace_backups` + remote location)

## 7. Command Cheat Sheet
```bash
# Health
~/bin/impactall
tail -n 20 ~/.codex/logs/guard-events.log

# Backup & restore
bash scripts/workspace-backup.sh --full
tar tzf ~/.workspace_backups/latest/impactshop-files.tgz | head
bash scripts/workspace-backup.sh --verify-only
ssh sharityh@cp40.ezit.hu "bash /home/sharityh/app/scripts/impactshop-ngo-card-restore.sh"  # NGO card one-click restore

# Guard cron reinstall
bash scripts/install-guard-cron.sh
crontab -l | sed -n '/ImpactShop Guards/,+10p'

# WP MU sync (example)
bash scripts/shortcode_sync/shortcode_sync_run_REAL.sh --env=production --dry-run
```

## 8. Notes & TODOs
- Weekly restore validation is automated via `scripts/backup-restore-test.sh` (cron entry above) – review new Markdown logs under `status_snapshots/restore-test-*.md`.
- Rotate to a **fine-grained GitHub PAT** (starts with `github_pat_...`) so `secret-expiry` can flag real expiry dates: generate the token on GitHub → update `.codex/.env` → rerun `.codex/cron/secret-expiry-check.sh`.  
  - Current token alias: `github_pat_11BWXX…Voqhl0X` (expires 2026-02-06 08:04:16 +0100; guard most `OK` státuszt ír).  **A tényleges érték csak `.codex/.env`-ben és a jelszó-vaultban szerepelhet.**
  - Guard output logged to `.codex/logs/guard-events.log` és Discordra megy, amint a hátralévő idő ≤30 nap (alapértelmezett `IMPACT_SECRET_ALERT_WINDOW_DAYS`).
- Off-site backup validator (`.codex/guards/offsite-backup-validator.sh`) naponta fut, és FAIL/WARN-t jelez, ha nincs `WORKSPACE_BACKUP_REMOTE` vagy a remote backup >2 napos.
- WP plugin version guard (`.codex/guards/wp-plugin-version-guard.sh`) naponta WP-CLI listát készít staging/prod környezetről; drift esetén WARN + diff a `.codex/reports/wp-plugin-drift.log`-ban.
- MU plugins presence/parity guardok folyamatosan SSH-n keresztül ellenőrzik a kritikus fájlok meglétét és SHA egyezését; diff esetén `mu-plugins-parity` guard FAIL-é válik.
- Ledger sync guard kibővült STDERR parszolással és ticker frissesség mérésével (<90 perc), így a Dognet → ticker lánc nem tud hangtalanul kifutni.
- Go routing guard félóránként HTTP smoke-olja a `/go` és `/go-deal` variációkat (prod + staging); 5xx → azonnali FAIL.
- Wallet cert/APNs guard hetente ellenőrzi a P12 lejáratát (WARN<30 nap, FAIL<7 nap) és az `api.push.apple.com:443` elérhetőségét; a jelszót a Keychainben lévő `Wallet Pass Signing` bejegyzésből olvassa (`IMPACT_WALLET_KEYCHAIN_ACCOUNT=office@sharity.hu`).
- **cp40 root hozzáférés továbbra sincs:** a CloudLinux chrootban futó `sharityh` user nem rendelkezik `sudo`/`su` binárissal, így nem tudjuk futtatni a WHM-es parancsokat (`/scripts/check_cpanel_rpms --fix`, ZoneEditor modul reinstall, `/root/.ssh/authorized_keys` frissítés). 2025-11-08-on a `ssh -o BatchMode=yes root@cp40.ezit.hu exit` parancs `Permission denied (publickey,...)` hibával tért vissza (részletek: `docs/hosting/cp40-root-access.md`). Kérd a szolgáltatót, hogy vegye fel az `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAAIGJGkPZL0F/KtC0FaXKTZc5z1rifvMMhvd0QQo04CVMw impactshop-deploy-bujdosoarnold@Bujdoso-Mac-mini.local` kulcsot a root kulcstárba vagy osszon meg ideiglenes WHM/root hozzáférést, majd futtasd a runbook szerinti ellenőrzéseket.
- Cron heartbeat guard (`.codex/guards/cron-heartbeat-guard.sh`) 6 óránként ellenőrzi, hogy a kritikus guardok friss heartbeat-et hagytak-e. Ha bármelyik >25 óra óta nem futott, Discord riasztás születik.
- Production health guard (`.codex/cron/production-health-check.sh`) 5 percenként figyeli a staging/prod WordPress REST endpointokat és – ha `IMPACT_PROD_SSH_HOST` meg van adva – a PHP hibalogot is.
- **Codex CLI/TUI frissítés után** mindig frissítsd a `.codex/codex-version.lock` fájlt, majd futtasd `bash .codex/guards/codex-version-guard.sh`-t, hogy a guard-pass maradjon konszisztens (különben a nightly cron FAIL-t fog jelezni).
- Cloudflare rate-limit guard WARN-t dob, amíg nincs kitöltve a `CLOUDFLARE_ZONE_ID` + `CLOUDFLARE_API_TOKEN` és amíg nem hozod létre a “NGO Card API Protect” szabályt (30 req/perc/IP, action=block/challenge). Guard script: `.codex/guards/cloudflare-rate-limit-guard.sh`.
- Pending NGO slugokat mostantól az admin felületen vagy CLI-n keresztül lehet jóváhagyni (`wp impactshop ngo-card pending`, `wp impactshop ngo-card approve --all`). Jóváhagyás után futtasd a ledger cache purge-et (CLI parancs automatikusan meghívja), hogy azonnal visszakerüljenek a REST válaszokba.
- Keep `impactshop-baseline-YYYY-MM-DD.md` current after every major deploy; update `docs/system-recovery-map.md` when new directories or guard scripts are introduced.
- Schedule monthly verification of Discord webhook connectivity by running `bash .codex/cron/red-flag-alert.sh --dry-run`.

## 9. Change Log (2025-11-08)
- Added weekly restore validation cron (`scripts/backup-restore-test.sh`), production health check (`.codex/cron/production-health-check.sh`), and daily Codex CLI/TUI guard run (`.codex/guards/codex-version-guard.sh`), storing artifacts under `status_snapshots/restore-test-*.md`, `~/.codex/logs/production-health.cron.log`, and `~/.codex/logs/codex-cli.cron.log`.
- Introduced cron heartbeat guard (`.codex/guards/cron-heartbeat-guard.sh`) so missing guard executions azonnal látszanak.
- Added `.github/workflows/force-push-alert.yml` to ping Discord when GitHub jelzi, hogy `main` force push történt.
- `scripts/workspace-backup.sh` now copies `docs/system-recovery-map.md`, exports Copilot context via `.codex/scripts/copilot-context-snapshot.sh`, performs disk-space checks + retention cleanup, and can push timestamped backups to `WORKSPACE_BACKUP_REMOTE` via `rclone`.
- Rotated GitHub secret monitoring to the fine-grained PAT above; `secret-expiry` guard most already tests actual token liveness (HTTP 200) + expiry headers.
- Documented VSCode extension lock + Copilot restore steps; `bin/preflight-check.sh` now fails fast if Codex CLI/TUI drifts from `.codex/codex-version.lock`; launchd template + `vscode-prelaunch-snapshot` script hozzáadva.

Maintaining this handbook + automated backups ensures that a fresh macOS host with the repo + secrets can re-create the entire ImpactShop stack “down to the last screw” within hours. Store an exported copy of this Markdown file with the backup bundles so the recovery map is always accessible.
