#!/usr/bin/env bash
# Publish merged vectors and indexes as a GitHub release:
#   scripts/release.sh <tag> <model>...
set -euo pipefail
tag=$1; shift
cd "$(dirname "$0")/.."
stage=$(mktemp -d)
cp out/turns.tsv out/questions.tsv "$stage/"
for model in "$@"; do
  cp "out/$model/turns.f16.bin" "$stage/$model.turns.f16.bin"
  cp "out/$model/queries.f16.bin" "$stage/$model.queries.f16.bin"
done
(cd "$stage" && sha256sum -- * > SHA256SUMS)
gh release create "$tag" --title "$tag" --notes-file results/release-notes.md "$stage"/*
rm -r "$stage"
