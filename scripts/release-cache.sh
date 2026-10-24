#!/usr/bin/env bash
# Publish chroma-mem's vector cache (~/.cache/chroma-mem/vectors, or $CACHE)
# as a GitHub release, with results/release-notes.md as its notes:
#   scripts/release-cache.sh <tag> <dataset>...
# Each <dataset>/<config>/ contributes <dataset>.<config>.pieces.tsv,
# .pieces.f16.bin, .config.json and, where the config has its own queries,
# .queries.tsv and .queries.f16.bin. Timing by-products (*-timing-*) are left
# out. Run it again to upload any asset a failed run left missing or short.
set -euo pipefail
tag=$1; shift
cd "$(dirname "$0")/.."
cache=${CACHE:-$HOME/.cache/chroma-mem/vectors}
stage=$(mktemp -d)
for dataset in "$@"; do
  for dir in "$cache/$dataset"/*/; do
    config=$(basename "$dir")
    case $config in *-timing-*) continue ;; esac
    for file in "$dir"*; do
      ln "$file" "$stage/$dataset.$config.$(basename "$file")" 2>/dev/null ||
        cp "$file" "$stage/$dataset.$config.$(basename "$file")"
    done
  done
done
(cd "$stage" && sha256sum -- * > SHA256SUMS)
gh release view "$tag" > /dev/null 2>&1 ||
  gh release create "$tag" --title "$tag" --notes-file results/release-notes.md --target "$(git rev-parse HEAD)"
declare -A have
while read -r name size; do have[$name]=$size; done < <(
  gh release view "$tag" --json assets -q '.assets[] | "\(.name) \(.size)"')
for file in "$stage"/*; do
  name=$(basename "$file")
  [[ ${have[$name]:-} == "$(stat -c %s "$file")" ]] && continue
  gh release upload "$tag" --clobber "$file"
done
rm -r "$stage"
