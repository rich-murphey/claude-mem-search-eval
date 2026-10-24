#!/usr/bin/env bash
# Download a release's vectors and indexes into out/, as embed-model.sh
# leaves them, and check them against SHA256SUMS:
#   scripts/fetch.sh <tag> <dataset>...
# v1 and v2 give out/<dataset>/{rows,queries}.tsv and
# out/<dataset>/<model>/{rows,queries}.f16.bin; v3 gives each chroma-mem
# config as out/<dataset>/<config>/, laid out as chroma-mem's vector cache.
set -euo pipefail
shopt -s nullglob
tag=$1; shift
cd "$(dirname "$0")/.."
stage=$(mktemp -d)
patterns=(-p SHA256SUMS)
for dataset in "$@"; do patterns+=(-p "$dataset.*"); done
gh release download "$tag" -R rich-murphey/claude-mem-search-eval -D "$stage" "${patterns[@]}"
(cd "$stage" && sha256sum --check --ignore-missing --quiet SHA256SUMS)
for dataset in "$@"; do
  mkdir -p "out/$dataset"
  for index in rows queries; do
    if [[ -e $stage/$dataset.$index.tsv ]]; then
      mv "$stage/$dataset.$index.tsv" "out/$dataset/$index.tsv"
    fi
  done
  for file in "$stage/$dataset".*.rows.f16.bin; do
    model=${file#"$stage/$dataset."}; model=${model%.rows.f16.bin}
    mkdir -p "out/$dataset/$model"
    mv "$file" "out/$dataset/$model/rows.f16.bin"
    mv "$stage/$dataset.$model.queries.f16.bin" "out/$dataset/$model/queries.f16.bin"
  done
  for file in "$stage/$dataset".*.pieces.tsv; do
    config=${file#"$stage/$dataset."}; config=${config%.pieces.tsv}
    mkdir -p "out/$dataset/$config"
    for part in "$stage/$dataset.$config".*; do
      mv "$part" "out/$dataset/$config/${part#"$stage/$dataset.$config."}"
    done
  done
done
rm -r "$stage"
