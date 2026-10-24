Precomputed embeddings of BAAI/bge-small-en-v1.5 in fp32, through this repo's own pipeline (transformers.js 4.3.1, onnxruntime-node 1.21.0, CPU), as claude-mem's `LocalEmbedder` would embed them: every document part and query of four datasets, 384-dimensional, for comparison with v2's `minilm-l6` and `multilingual-e5-small`.

| Dataset | Rows | Queries | Source |
|---|---|---|---|
| `longmemeval-s` | 199,509 | 470 answerable | LongMemEval-S cleaned (MIT) |
| `memsearch-zh`, `memsearch-en` | 955 each | 2,172 each | memsearch-memory-retrieval (MIT) |
| `miracl-en` | 178,768 | 799 | MIRACL dev via mteb/MIRACLRetrievalHardNegatives (CC-BY-SA-4.0) |

Model: `bge-small-en` (`Xenova/bge-small-en-v1.5`, `onnx/model.onnx`, fp32): `[CLS]` pooling, L2-normalised, 512 tokens with the closing `[SEP]` restored on truncation, as its sentence-transformers config sets; queries carry the model card's retrieval instruction `Represent this sentence for searching relevant passages: `, passages none. These are not v3's `bge-small-en-q-split510` (Qdrant's static int8 export, split rather than truncated). MIRACL zh, ko and ja were not embedded: bge-small-en is English-only, and memsearch zh already shows the cost.

Against sentence-transformers on `BAAI/bge-small-en-v1.5` (revision `5c38ec7c`), 100 memsearch-en rows and 100 queries match at worst cosine 0.9999999, and 20 texts of 694–919 tokens, truncated, at 1.0000000. `verify.ts` re-embeds 200 rows per dataset: all four at cosine 1.0000000.

Files, per dataset: `<dataset>.rows.tsv` and `<dataset>.queries.tsv` (ids, text hashes and the relevant documents; no text; byte-identical to v2's), `<dataset>.bge-small-en.rows.f16.bin` and `<dataset>.bge-small-en.queries.f16.bin` (little-endian fp16, 384 values per row, one row per TSV line). `SHA256SUMS` covers them all. 16 files and `SHA256SUMS`, 309 MB. No dataset text is redistributed; `src/datasets.ts` downloads each dataset from Hugging Face at a pinned revision. The vectors are under the same licence as the dataset each came from.

```sh
scripts/fetch.sh v2 memsearch-en   # minilm-l6, multilingual-e5-small and the rest
scripts/fetch.sh v4 memsearch-en   # adds out/memsearch-en/bge-small-en/
node src/verify.ts --dataset memsearch-en --model bge-small-en
node src/eval.ts --dataset memsearch-en --models minilm-l6,multilingual-e5-small,bge-small-en
```

Results (`results/*-vector-bge-small-en-*.md`), timing and caveats are in the README; results are best treated as relative accuracy between models.
