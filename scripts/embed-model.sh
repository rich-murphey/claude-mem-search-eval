#!/usr/bin/env bash
# Embed LongMemEval-S questions and turns with one model, in parallel shards,
# then merge the shards: scripts/embed-model.sh <model> [shards] [threads]
set -euo pipefail
model=$1 shards=${2:-4} threads=${3:-8}
cd "$(dirname "$0")/.."
mkdir -p out/logs
start=$(date +%s)
node src/embed.ts --model "$model" --queries 2> "out/logs/$model.queries.log"
pids=()
for ((i = 0; i < shards; i++)); do
  node src/embed.ts --model "$model" --shard "$i/$shards" --threads "$threads" 2> "out/logs/$model.$i.log" &
  pids+=($!)
done
for pid in "${pids[@]}"; do wait "$pid"; done
node src/merge.ts --model "$model" --shards "$shards"
echo "$model: $shards shards x $threads threads, $(( $(date +%s) - start ))s wall" | tee -a out/logs/timing.log
