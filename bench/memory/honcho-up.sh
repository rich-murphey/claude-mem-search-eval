#!/usr/bin/env bash
# Start (or stop) the bench Honcho stack on dv (claude-mem-rs#52).
#
#   bench/memory/honcho-up.sh up|down|reset
#
# Postgres + pgvector in Docker on 127.0.0.1:5440 (container bench-honcho-pg,
# data under ~/.cache/memory-bench/honcho-pg); the API (127.0.0.1:8010) and
# the deriver as one transient user service, bench-honcho.service, so the
# sampler reads both from one cgroup. Both pinned to CPUS (default 8-15).
# The Honcho tree is HONCHO_TREE (default ~/wt/honcho/cc-memory-bench).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
TREE=${HONCHO_TREE:-$HOME/wt/honcho/cc-memory-bench}
CPUS=${CPUS:-8-15}
DATA=$HOME/.cache/memory-bench/honcho-pg

down() {
  systemctl --user stop bench-honcho.service 2>/dev/null || true
  systemctl --user reset-failed bench-honcho.service 2>/dev/null || true
  docker rm -f bench-honcho-pg >/dev/null 2>&1 || true
}

case "${1:-up}" in
down) down; exit 0 ;;
reset) down; sudo -n rm -rf "$DATA" 2>/dev/null || docker run --rm -v "$(dirname "$DATA")":/d alpine rm -rf /d/honcho-pg; exit 0 ;;
up) ;;
*) echo "usage: $0 up|down|reset" >&2; exit 2 ;;
esac

mkdir -p "$DATA"
cp "$HERE/honcho.config.toml" "$TREE/config.toml"
if ! docker ps --format '{{.Names}}' | grep -qx bench-honcho-pg; then
  docker rm -f bench-honcho-pg >/dev/null 2>&1 || true
  docker run -d --name bench-honcho-pg --cpuset-cpus "$CPUS" \
    -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:5440:5432 \
    -v "$DATA":/var/lib/postgresql/data pgvector/pgvector:pg17 \
    -c max_connections=300 >/dev/null
fi
for _ in $(seq 60); do
  docker exec bench-honcho-pg pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec bench-honcho-pg psql -U postgres -qc 'CREATE EXTENSION IF NOT EXISTS vector' >/dev/null
(cd "$TREE" && uv run --quiet python scripts/provision_db.py)

systemctl --user stop bench-honcho.service 2>/dev/null || true
systemctl --user reset-failed bench-honcho.service 2>/dev/null || true
systemd-run --user --unit bench-honcho --collect --working-directory "$TREE" -E PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin" \
  -p "Description=bench Honcho API + deriver (claude-mem-rs#52)" \
  /usr/bin/taskset -c "$CPUS" bash -c \
  'uv run --quiet fastapi run --host 127.0.0.1 --port 8010 src/main.py & uv run --quiet python -m src.deriver & wait -n; kill 0'
for _ in $(seq 90); do
  curl -sf http://127.0.0.1:8010/health >/dev/null && { echo "honcho up: http://127.0.0.1:8010"; exit 0; }
  sleep 1
done
echo "honcho did not come up; journalctl --user -u bench-honcho" >&2
exit 1
