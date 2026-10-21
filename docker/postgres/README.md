# postgres-pgvector-textsearch

Postgres 17 with [pgvector](https://github.com/pgvector/pgvector) (vector
search) and [pg_textsearch](https://github.com/timescale/pg_textsearch) (bm25
keyword ranking), both from the PostgreSQL project's apt repository on
`postgres:17-trixie`, plus `reindex-collation` for volumes made under another C
library. Nothing in it is specific to claude-mem; claude-mem's server mode is
what it was built and measured for.

Published from rich-murphey/claude-mem-search-eval for testing until
[thedotmack/claude-mem](https://github.com/thedotmack/claude-mem) settles on an
image of its own; then this one gets a deprecation note and stops being
rebuilt.

```
ghcr.io/rich-murphey/postgres-pgvector-textsearch:17            # moving, rebuilt weekly
ghcr.io/rich-murphey/postgres-pgvector-textsearch:17-YYYYMMDD   # one per build, for pinning
```

Built for linux/amd64 and linux/arm64 by
[.github/workflows/postgres-image.yml](../../.github/workflows/postgres-image.yml).

## Why pg_textsearch

On 100 LongMemEval questions, pg_textsearch reaches the same F1@5 as bm25
computed in SQL, at 21 times lower latency scoped to one question's sessions
(3 ms against 63 ms) and about 2,600 times lower with every document in one
project (2 ms against 5.2 s). Both beat the server's `ts_rank`: store mode F1@5
0.234 against 0.162. See
[results/longmemeval-s-keyword-rank-store-lme-s-100-v1.md](../../results/longmemeval-s-keyword-rank-store-lme-s-100-v1.md)
and the scoped file beside it.

## Using it with claude-mem's compose file

Replace the postgres service's image, keep its volume, and add a one-shot
service that rebuilds text indexes when the C library changed, before the
server starts:

```yaml
# compose.override.yml beside claude-mem's docker-compose.yml
services:
  postgres:
    image: ghcr.io/rich-murphey/postgres-pgvector-textsearch:17

  postgres-collation:
    image: ghcr.io/rich-murphey/postgres-pgvector-textsearch:17
    command: ["reindex-collation"]
    restart: "no"
    environment:
      PGHOST: postgres
      POSTGRES_USER: ${POSTGRES_USER:?POSTGRES_USER is required}
      PGPASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}
    depends_on:
      postgres:
        condition: service_healthy

  claude-mem-server:
    depends_on:
      postgres-collation:
        condition: service_completed_successfully

  claude-mem-worker:
    depends_on:
      postgres-collation:
        condition: service_completed_successfully
```

The postgres service keeps its `postgres-data` volume and healthcheck. A
failing job keeps the server and worker from starting; a second start finds
nothing to do.

## Existing volumes

- **From `postgres:17-alpine` (musl):** musl and glibc sort text differently,
  and Postgres gives no warning, because musl records no collation version.
  Text indexes are out of order and lookups can miss rows that exist.
  `reindex-collation` rebuilds them (in seconds; vector and tsvector indexes
  have no collation and are left alone) and records the version.
- **From `pgvector/pgvector:pg17` (Debian bookworm, glibc 2.36):** trixie's
  glibc 2.41 makes Postgres warn of a collation version mismatch.
  `reindex-collation` rebuilds the affected indexes and refreshes the version.
- **New volumes** use Postgres's builtin `C.UTF-8` locale, which does not
  depend on the C library, so `reindex-collation` finds nothing to do.

No dump and restore: the data, vectors included, stays as it is.

Without the compose service, run it by hand before starting the server:

```sh
docker compose up -d postgres
docker compose exec postgres reindex-collation        # DRY_RUN=1 lists only
docker compose up -d
```
