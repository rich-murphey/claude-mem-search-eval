Split-piece embeddings from [chroma-mem](https://github.com/rich-murphey/chroma-mem)'s vector cache, for measuring claude-mem's search by meaning with long rows split instead of truncated, and with four cheaper or more accurate models than v2's: the seven datasets of v1 and v2, embedded by fastembed 7.5.0 (ONNX Runtime 1.31.0, CPU) in five 384-dimensional configurations.

| Config | Model | Quantization | Tokens | Piece budget | Covers |
|---|---|---|---|---|---|
| `minilm-l6-split254` | all-MiniLM-L6-v2 | fp32 | 256 | 254 | only rows over 254 word pieces; the rest are v2's `minilm-l6` rows |
| `minilm-l6-128-split126` | all-MiniLM-L6-v2 (Qdrant ONNX) | fp32 | 128 | 126 | every row, and the queries |
| `multilingual-minilm-l12-q-split126` | paraphrase-multilingual-MiniLM-L12-v2 (Qdrant ONNX) | int8, static | 128 | 126 | every row, and the queries |
| `bge-small-en-q-split510` | bge-small-en-v1.5 (Qdrant ONNX), the card's query instruction | int8, static | 512 | 510 | every row, and the queries |
| `multilingual-e5-small-split508` (memsearch-zh only) | multilingual-e5-small | fp32 | 512 | 508 | the 2 rows over 508 word pieces |

Datasets and licences as in v1 and v2: LongMemEval-S cleaned (MIT), memsearch-memory-retrieval (MIT), MIRACL dev via mteb/MIRACLRetrievalHardNegatives (CC-BY-SA-4.0); these derived vectors are under the same terms as the dataset each came from. No dataset text is redistributed.

Files, per dataset and config: `<dataset>.<config>.pieces.tsv` (doc id, release part, piece index, first 16 hex of the sha256 of the piece text; one line per distinct piece text), `<dataset>.<config>.pieces.f16.bin` (little-endian fp16, 384 values per line, L2-normalised), `<dataset>.<config>.config.json` (model, embedder, limits, prefixes, pooling, splitter commit, counts) and, for configs with their own queries, `<dataset>.<config>.queries.tsv` (query id, hash of the unprefixed text; one line per distinct query text) and `.queries.f16.bin`. `SHA256SUMS` covers them all. 129 files and SHA256SUMS, 2.95 GB.

`chroma-mem bench verify-cache` re-embeds 200 pieces spaced through a cache, and 200 queries where it has them, and fails below cosine 0.9999. The three whole-dataset configs pass on all seven datasets, pieces and queries (42 checks, worst cosine 0.99999883, bge-small-en-q queries on memsearch zh); `minilm-l6-split254` passes on LongMemEval-S, memsearch zh and MIRACL ko (worst 0.99999997), and `multilingual-e5-small-split508` on both its pieces (0.99999998).

```sh
scripts/fetch.sh v3 memsearch-zh   # out/memsearch-zh/<config>/, laid out as ~/.cache/chroma-mem/vectors/<dataset>/<config>/
```

Results from these vectors are the README's chroma-mem tables and `results/*-chroma-mem-*.md`; results are best treated as relative accuracy between models.
