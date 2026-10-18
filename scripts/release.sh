#!/usr/bin/env bash
# Publish merged vectors and indexes as a GitHub release:
#   scripts/release.sh <tag> <dataset>...
# Each dataset contributes <dataset>.rows.tsv, <dataset>.queries.tsv and, per
# model, <dataset>.<model>.rows.f16.bin and <dataset>.<model>.queries.f16.bin.
set -euo pipefail
tag=$1; shift
cd "$(dirname "$0")/.."
stage=$(mktemp -d)
for dataset in "$@"; do
  cp "out/$dataset/rows.tsv" "$stage/$dataset.rows.tsv"
  cp "out/$dataset/queries.tsv" "$stage/$dataset.queries.tsv"
  for dir in "out/$dataset"/*/; do
    model=$(basename "$dir")
    cp "$dir/rows.f16.bin" "$stage/$dataset.$model.rows.f16.bin"
    cp "$dir/queries.f16.bin" "$stage/$dataset.$model.queries.f16.bin"
  done
done
(cd "$stage" && sha256sum -- * > SHA256SUMS)
gh release create "$tag" --title "$tag" --notes-file results/release-notes.md "$stage"/*
rm -r "$stage"
