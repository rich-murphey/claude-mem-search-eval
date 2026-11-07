#!/usr/bin/env bash
# Start (or stop) a bench model runner for arm B's observer (trove#52).
#
#   bench/memory/runner-up.sh up|down
#
# The live trove runner (127.0.0.1:37901) gives every haiku request
# the observer's qmd tool over Rich's own corpus (TROVE_OBSERVER_SEARCH=qmd),
# which would put private data into a public-data benchmark, and its haiku
# pool has 4 slots shared with the live observer. This is the same runner
# binary on the subscription, haiku pool only, with no observer tools, its own
# port (37903), state and per-call log under ~/.cache/memory-bench/runner/,
# alerts kept in its log. HAIKU_CONCURRENCY sets the pool (default 12).
set -euo pipefail
DIR=$HOME/.cache/memory-bench/runner
BIN=${RUNNER_BIN:-$HOME/opt/trove/bin/trove-runner}
UNIT=bench-runner
systemctl --user stop "$UNIT.service" 2>/dev/null || true
systemctl --user reset-failed "$UNIT.service" 2>/dev/null || true
case "${1:-up}" in
down) exit 0 ;;
up) ;;
*) echo "usage: $0 up|down" >&2; exit 2 ;;
esac
mkdir -p "$DIR"
sha256sum "$BIN" | cut -d' ' -f1 > "$DIR/binary.sha256"
systemd-run --user --unit "$UNIT" --collect --working-directory "$DIR" \
  -p "Description=bench model runner, haiku only, no observer tools (trove#52)" \
  -E HOME="$HOME" -E PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin" \
  -E TROVE_EMBEDDER=none -E RUST_LOG=info -E TROVE_RUNNER_ALERTS=off \
  -E TROVE_RUNNER_HAIKU_CONCURRENCY="${HAIKU_CONCURRENCY:-12}" \
  "$BIN" runner --listen 127.0.0.1:37903 --cwd "$DIR/cwd" --agent-dir "$DIR" --log "$DIR/calls.jsonl" --pools haiku
for _ in $(seq 60); do
  curl -sf http://127.0.0.1:37903/v1/status >/dev/null && { echo "bench runner up: http://127.0.0.1:37903"; exit 0; }
  sleep 1
done
echo "bench runner did not come up; journalctl --user -u $UNIT" >&2
exit 1
