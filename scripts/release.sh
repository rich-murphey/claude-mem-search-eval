#!/usr/bin/env bash
# Publish merged vectors and indexes as a GitHub release:
#   [MODELS="a b"] scripts/release.sh <tag> <dataset>...
# Each dataset contributes <dataset>.rows.tsv, <dataset>.queries.tsv and, per
# model, <dataset>.<model>.rows.f16.bin and <dataset>.<model>.queries.f16.bin.
# MODELS limits the release to those models; without it, every model in out/.
# A late-interaction model (v5) adds <dataset>.<model>.{rows,queries}.offsets.u64.bin.
# A file over GitHub's 2 GiB asset limit ships as .part00, .part01, ... of
# 2,000 MiB; SHA256SUMS lists the pieces and the whole, which fetch.sh rejoins.
set -euo pipefail
tag=$1; shift
cd "$(dirname "$0")/.."
stage=$(mktemp -d)
for dataset in "$@"; do
  cp "out/$dataset/rows.tsv" "$stage/$dataset.rows.tsv"
  cp "out/$dataset/queries.tsv" "$stage/$dataset.queries.tsv"
  for dir in "out/$dataset"/*/; do
    model=$(basename "$dir")
    [[ -n ${MODELS:-} && " $MODELS " != *" $model "* ]] && continue
    cp "$dir/rows.f16.bin" "$stage/$dataset.$model.rows.f16.bin"
    cp "$dir/queries.f16.bin" "$stage/$dataset.$model.queries.f16.bin"
    for index in rows queries; do
      if [[ -e $dir/$index.offsets.u64.bin ]]; then
        cp "$dir/$index.offsets.u64.bin" "$stage/$dataset.$model.$index.offsets.u64.bin"
      fi
    done
  done
done
(cd "$stage" && sha256sum -- * > SHA256SUMS)
for file in "$stage"/*.bin; do
  if (( $(stat -c %s "$file") > 2147483648 )); then
    split -d -b 2000M "$file" "$file.part"
    rm "$file"
  fi
done
parts=("$stage"/*.part??)
if [[ -e ${parts[0]} ]]; then
  (cd "$stage" && sha256sum -- *.part?? >> SHA256SUMS)
fi
gh release create "$tag" --title "$tag" --notes-file results/release-notes.md "$stage"/*
rm -r "$stage"
