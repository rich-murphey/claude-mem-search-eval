Precomputed embeddings for measuring claude-mem's search by meaning: every document part and query of seven datasets, embedded by five 384-dimensional model configurations, as claude-mem's `LocalEmbedder` embeds them.

| Dataset | Rows | Queries | Source |
|---|---|---|---|
| `longmemeval-s` | 199,509 | 470 answerable | LongMemEval-S cleaned (MIT) |
| `memsearch-zh`, `memsearch-en` | 955 each | 2,172 each | memsearch-memory-retrieval (MIT) |
| `miracl-en`, `-zh`, `-ko`, `-ja` | 178,768 / 81,309 / 43,293 / 185,319 | 799 / 393 / 213 / 860 | MIRACL dev via mteb/MIRACLRetrievalHardNegatives (CC-BY-SA-4.0) |

Models: `minilm-l6` (Xenova/all-MiniLM-L6-v2, claude-mem's and Chroma's default), `multilingual-minilm-l12` (Xenova/paraphrase-multilingual-MiniLM-L12-v2), `multilingual-e5-small` (Xenova/multilingual-e5-small), and IBM's granite-embedding-97m-multilingual-r2 (onnx-community/granite-embedding-97m-multilingual-r2-ONNX, `[CLS]` pooling) twice: `granite-97m-r2-512`, cut at 512 tokens as claude-mem's models table carries it, and `granite-97m-r2` at its trained 8,192. The two granite cuts score identically on five datasets and within 0.007 on MIRACL ko and ja.

v2 adds the granite vectors; the other three models' files are byte-identical to v1's.

Files, per dataset: `<dataset>.rows.tsv` and `<dataset>.queries.tsv` (ids, text hashes and the relevant documents; no text), and per model `<dataset>.<model>.rows.f16.bin` and `<dataset>.<model>.queries.f16.bin` (little-endian fp16, 384 values per row, one row per TSV line). `SHA256SUMS` covers them all. No dataset text is redistributed; `src/datasets.ts` downloads each dataset from Hugging Face at a pinned revision.

```sh
scripts/fetch.sh v2 longmemeval-s
node src/verify.ts --dataset longmemeval-s --model minilm-l6
node src/eval.ts --dataset longmemeval-s
```

Results, timing and caveats are in the README; results are best treated as relative accuracy between models.
