# Graph Memory Stack (Graphiti + Neo4j)

Ez a szolgáltatás a Graphiti API-t és a Neo4j adatbázist futtatja docker-compose-szal, amelyre a Core agent hosszú távú memóriája épül.

## Követelmények
- Docker + Docker Compose
- `.env` fájl a Graphiti/Neo4j jelszavaival

Példa `.env`:
```
NEO4J_USER=neo4j
NEO4J_PASSWORD=impactshop-local
GRAPHITI_API_KEY=local-dev-key
```

## Futtatás
```
cd services/graph-memory
docker compose up -d
```
- Neo4j Browser: http://localhost:7474
- Graphiti API: http://localhost:8083 (health: `/healthz`)

## Következő lépések
1. Töltsd be az ingest jobot (lásd `apps/memory-ingest`).
2. A `.codex/cron/graphiti-ingest.sh` script futtassa óránként az ingestet.
