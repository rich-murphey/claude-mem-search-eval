#!/usr/bin/env bash
# Download a release's vectors and indexes into out/, as embed-model.sh
# leaves them, and check them against SHA256SUMS:
#   scripts/fetch.sh <tag> <dataset>...
set -euo pipefail
tag=$1; shift
cd "$(dirname "$0")/.."
stage=$(mktemp -d)
patterns=(-p SHA256SUMS)
for dataset in "$@"; do patterns+=(-p "$dataset.*"); done
gh release download "$tag" -R rich-murphey/claude-mem-search-eval -D "$stage" "${patterns[@]}"
(cd "$stage" && sha256sum --check --ignore-missing --quiet SHA256SUMS)
for dataset in "$@"; do
  mkdir -p "out/$dataset"
  mv "$stage/$dataset.rows.tsv" "out/$dataset/rows.tsv"
  mv "$stage/$dataset.queries.tsv" "out/$dataset/queries.tsv"
  for file in "$stage/$dataset".*.rows.f16.bin; do
    model=${file#"$stage/$dataset."}; model=${model%.rows.f16.bin}
    mkdir -p "out/$dataset/$model"
    mv "$file" "out/$dataset/$model/rows.f16.bin"
    mv "$stage/$dataset.$model.queries.f16.bin" "out/$dataset/$model/queries.f16.bin"
  done
done
rm -r "$stage"
