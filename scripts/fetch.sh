#!/usr/bin/env bash
# Download a release's vectors and indexes into out/, as embed-model.sh
# leaves them, and check them against SHA256SUMS:
#   scripts/fetch.sh <tag> <dataset>...
# v1, v2 and v4 give out/<dataset>/{rows,queries}.tsv and
# out/<dataset>/<model>/{rows,queries}.f16.bin; v3 gives each chroma-mem
# config as out/<dataset>/<config>/, laid out as chroma-mem's vector cache;
# v5 adds out/<dataset>/answerai-colbert-small/{rows,queries}.offsets.u64.bin
# beside the token vectors, whose files over 2 GiB ship as .partNN pieces
# joined here in order.
set -euo pipefail
shopt -s nullglob
tag=$1; shift
cd "$(dirname "$0")/.."
stage=$(mktemp -d)
patterns=(-p SHA256SUMS)
for dataset in "$@"; do patterns+=(-p "$dataset.*"); done
gh release download "$tag" -R rich-murphey/claude-mem-search-eval -D "$stage" "${patterns[@]}"
(cd "$stage" && sha256sum --check --ignore-missing --quiet SHA256SUMS)
for first in "$stage"/*.part00; do
  whole=${first%.part00}
  cat "$whole".part?? > "$whole"
  rm "$whole".part??
  (cd "$stage" && awk -v f="${whole##*/}" '$2 == f' SHA256SUMS | sha256sum --check --quiet)
done
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
    for index in rows queries; do
      if [[ -e $stage/$dataset.$model.$index.offsets.u64.bin ]]; then
        mv "$stage/$dataset.$model.$index.offsets.u64.bin" "out/$dataset/$model/$index.offsets.u64.bin"
      fi
    done
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
