#!/usr/bin/env bash
# Embed a dataset's queries and document parts with one model, in parallel
# shards, then merge the shards:
#   scripts/embed-model.sh <dataset> <model> [shards] [threads]
set -euo pipefail
dataset=$1 model=$2 shards=${3:-4} threads=${4:-8}
cd "$(dirname "$0")/.."
mkdir -p out/logs
start=$(date +%s)
node src/embed.ts --dataset "$dataset" --model "$model" --queries 2> "out/logs/$dataset.$model.queries.log"
pids=()
for ((i = 0; i < shards; i++)); do
  node src/embed.ts --dataset "$dataset" --model "$model" --shard "$i/$shards" --threads "$threads" 2> "out/logs/$dataset.$model.$i.log" &
  pids+=($!)
done
for pid in "${pids[@]}"; do wait "$pid"; done
node src/merge.ts --dataset "$dataset" --model "$model" --shards "$shards"
echo "$dataset $model: $shards shards x $threads threads, $(( $(date +%s) - start ))s wall" | tee -a out/logs/timing.log
