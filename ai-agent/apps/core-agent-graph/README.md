# Core Agent LangGraph orchestrator

Ez a modul felügyeli az Impi/Core agent workflow-ját LangGraph StateGraph segítségével (soros topológiában: ingest → Graphiti → recommendation → response → fallback → log).

## Struktúra
- `src/index.ts`: LangGraph StateGraph inicializálása (`Annotation.Root` + node → edge definíciók) + `MemorySaver` checkpointer, `runCoreAgentPrototype()` wrapper thread_id átadással.
- `src/state.ts`: központi állapot (sessionId, userMessage, Graphiti context, ajánlatok, logok).
- `src/nodes/`
  - `ingestUserInputNode.ts`: session/id + memoryRequest előkészítése.
  - `graphitiContextNode.ts`: Graphiti `/query` futtatása, fallback kezelése.
  - `recommendationNode.ts`: meglévő `recommendCoupons()` hívása.
  - `responseNode.ts`: egyszerű válaszüzenet generálása (placeholder az LLM-hez).
- `src/mocks/sampleGraphitiContext.ts`: stub Graphiti context, amit a node automatikusan használ, ha a lokális Graphiti API hibát dob.
- `src/telemetry.ts`: minden futásról JSON sort ír a `../impactshop-notes/.codex/logs/langgraph-run.log` fájlba (session, contextSource, fallback ok, ajánlat darabszám, utolsó logok, forrás, duration), így guard/observability sablonok használhatók lesznek.

## Hibatűrés + stub környezet
- `GRAPHITI_STUB_ON_ERROR` környezeti változóval (alapértelmezés: engedélyezve) a `graphitiContextNode` Graphiti-hiba esetén a `sampleGraphitiContext` adatát tölti be (`contextSource = 'stub'`), így az `impactall`/`langgraph-guard` futások továbbra is PASS státuszban maradnak.
- `GRAPHITI_ENABLE_TEXT_SEARCH=1` esetén a Graphiti lekérdezés felhasználói témát is küld (alapértelmezésben a text keresés ki van kapcsolva, hogy a lokális Neo4j list property-k ne okozzanak hibát).
- A `.codex/guards/langgraph-guard.sh` a `contextSource` mezőt is rögzíti (WARN nélküli, de `graphiti_stub` megjegyzéssel), így látható, mikor fut fallbackből.

## Függőségek
- `@langchain/langgraph`
- meglévő modulok: Graphiti client (`apps/api-gateway/src/services/memory-context.ts`), ajánlómotor (`apps/ai-agent-core/src/impi/recommend.ts`).

## Következő lépések
1. Állapot + node-ok bővítése részletes mezőkkel (LLM prompt, fallback logika, CTA-k) + checkpointer.
2. Observability bővítése (`langgraph-run.log` → Langfuse / guard scoreboard) és Graphiti élő endpoint monitorozása.
3. LangGraph futtatása a jelenlegi Impi API-ból/CLI-ból (feature flaggel), majd CrewAI/Autogen bővítési pontok hozzáadása.
