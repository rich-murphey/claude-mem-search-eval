#!/usr/bin/env bash
# Start (or stop) a bench trove instance for one arm (trove#52).
#
#   bench/memory/cmr-up.sh up|down|reset B|C|D
#
# Never the live server: its own port (B 37897, C 37898, D 37899), its own
# SQLite under ~/.cache/memory-bench/cmr-<arm>/, the binary built from
# CMR_TREE (default ~/wt/trove/cc-memory-bench) at its HEAD, run as the
# transient user service bench-cmr-<arm> pinned to CPUS (default 8-15).
# Retrieval settings are the live server's (~/.config/trove/live.env,
# 2026-11-06); the features that need Rich's repos or post to other services
# (work view, decisions, claims, handoffs, cards, titles, transcripts,
# label-by-work) are off. Model calls go to the usage proxy on 37902.
set -euo pipefail
CMD=${1:?up|down|reset}
ARM=${2:?arm B, C or D}
TREE=${CMR_TREE:-$HOME/wt/trove/cc-memory-bench}
CPUS=${CPUS:-8-15}
DIR=$HOME/.cache/memory-bench/cmr-$ARM
UNIT=bench-cmr-$ARM
case "$ARM" in B) PORT=37897 ;; C) PORT=37898 ;; D) PORT=37899 ;; *) echo "arm must be B, C or D" >&2; exit 2 ;; esac

stop() { systemctl --user stop "$UNIT.service" 2>/dev/null || true; systemctl --user reset-failed "$UNIT.service" 2>/dev/null || true; }
case "$CMD" in
down) stop; exit 0 ;;
reset) stop; rm -rf "$DIR"; exit 0 ;;
up) ;;
*) echo "usage: $0 up|down|reset B|C|D" >&2; exit 2 ;;
esac

mkdir -p "$DIR"
# No built tree: keep the binary installed earlier (and its recorded commit).
if [ -x "$TREE/target/release/trove" ]; then
  install -m 0755 "$TREE/target/release/trove" "$DIR/trove"
  git -C "$TREE" rev-parse HEAD > "$DIR/commit"
fi

common=(
  -E TROVE_DB="$DIR/claude-mem.sqlite"
  -E TROVE_LISTEN="127.0.0.1:$PORT"
  -E RUST_LOG=warn
  # live.env retrieval settings, 2026-11-06
  -E TROVE_RERANK=colbert -E TROVE_RERANK_DEPTH=20
  -E TROVE_CUTOFF=ratio -E TROVE_CUTOFF_RATIO=0.5 -E TROVE_CUTOFF_COSINE_AT=after -E TROVE_CUTOFF_COSINE=0.15
  # the API cross-encoder calls OpenRouter's rerank, off by Rich's ruling of 2026-11-06 (trove#52)
  -E TROVE_CROSS_ENCODER=off -E TROVE_CROSS_ENCODER_TOP=20
  -E TROVE_RERANK_API_MODEL=mongodb/rerank-3-lite -E TROVE_RERANK_API_FALLBACK_MODEL=cohere/rerank-5-fast
  -E TROVE_INJECT_PARTS_MARGIN=0.25 -E TROVE_INJECT_VECTOR_CHUNKS=8 -E TROVE_INJECT_VECTOR_FUSION=rrf
  -E TROVE_SUMMARY_PROMPT=knowledge
  # every benchmark question is a memory query: the coding-prompt gate is off
  -E TROVE_INJECT_GATE=off
  -E TROVE_GENERATION_WORKERS=16
  -E CLAUDE_MEM_SUMMARY_INPUT_BUDGET_BYTES=280000
  -E CLAUDE_MEM_SERVER_MAX_OUTPUT_TOKENS=8192
  -E ANTHROPIC_API_KEY=proxy
)
case "$ARM" in
B) arm=(-E CLAUDE_MEM_SERVER_MODEL=claude-haiku-5-5 -E TROVE_SUMMARY_MODEL=claude-haiku-5-5
        -E CLAUDE_MEM_OBSERVER_THINKING=adaptive -E CLAUDE_MEM_ANTHROPIC_BASE_URL=http://127.0.0.1:37902/B.observer) ;;
C) arm=(-E CLAUDE_MEM_SERVER_MODEL=gemini-2.5-flash-lite -E TROVE_SUMMARY_MODEL=gemini-2.5-flash-lite
        -E CLAUDE_MEM_OBSERVER_THINKING=enabled:1024 -E CLAUDE_MEM_ANTHROPIC_BASE_URL=http://127.0.0.1:37902/C.observer) ;;
D) arm=(-E CLAUDE_MEM_GENERATION_DISABLED=1 -E CLAUDE_MEM_SERVER_MODEL=none -E CLAUDE_MEM_ANTHROPIC_BASE_URL=http://127.0.0.1:37902/D.none) ;;
esac

stop
systemd-run --user --unit "$UNIT" --collect --working-directory "$DIR" \
  -p "Description=bench trove arm $ARM (trove#52)" \
  -E HOME="$HOME" -E PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin" "${common[@]}" "${arm[@]}" \
  /usr/bin/taskset -c "$CPUS" "$DIR/trove" serve
for _ in $(seq 120); do
  curl -sf "http://127.0.0.1:$PORT/healthz" >/dev/null && { echo "trove $ARM up: http://127.0.0.1:$PORT"; exit 0; }
  sleep 1
done
echo "bench-cmr-$ARM did not come up; journalctl --user -u $UNIT" >&2
exit 1
