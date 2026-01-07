# Capability shadow log (CORE_CAPABILITY_ROUTING)

- Log helye: `.codex/logs/core-capability-shadow.log` (alapértelmezett), testreszabható `CORE_CAPABILITY_LOG_DIR` env-vel.
- Formátum: JSON soronként, max 1 KB/entry. A fájl mérete ~512 KB felett csonkolódik (utolsó 256 KB marad).
- Tartalom: discovery jelöltek, routing enabled flag, kiválasztott capability, heurisztika. PII nincs benne (csak `message` nyers szövege).
- Shadow log akkor is ír, ha a routing flag=0 (csak a döntési kontextus), így sandboxban és prodban is visszakereshető.

Használat:
1. Opcionális: `CORE_CAPABILITY_LOG_DIR=/custom/path`.
2. Sandbox próba: `CORE_CAPABILITY_ROUTING=1 node --import tsx apps/core-agent-graph/src/index.ts ...`
3. Log megtekintés: `tail -n 20 .codex/logs/core-capability-shadow.log`

## Env rövid lista
- `ARTIFACTS_MODE=dual|legacy|artifacts` (alap: `dual`) – artifacts + legacy mezők együtt/ külön.
- `CORE_CAPABILITY_ROUTING=1` – capability útvonal engedélyezése.
- `CORE_CAPABILITY_TIMEOUT_MS=15000` – capability timeout (ms).
- `CORE_MERGE_DOWNLOAD_ROOTS=/abs/path1,/abs/path2` – extra engedélyezett letöltési gyökerek a merge fájlokhoz.
