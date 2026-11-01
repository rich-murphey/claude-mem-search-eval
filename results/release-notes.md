Precomputed ColBERT token vectors of `answerdotai/answerai-colbert-small-v1` (revision `934fa8bb4ce2284f4c2baa232d81aca4d076fa5e`, Apache-2.0) through PyLate 1.6.0 (sentence-transformers 5.3.0, transformers 5.3.0, torch 2.11.0, CPU, fp32): every document part and query of three English datasets, one 96-dimensional L2-normalised vector per token, for the late-interaction rerank in `results/colbert-rerank.md`. Additive to v1–v4; nothing in them changes.

| Dataset | Rows | Row tokens | Queries | Source |
|---|---|---|---|---|
| `longmemeval-s` | 199,509 | 32,191,687 | 470 answerable | LongMemEval-S cleaned (MIT) |
| `memsearch-en` | 955 | 165,951 | 2,172 | memsearch-memory-retrieval (MIT) |
| `miracl-en` | 178,768 | 17,991,409 | 799 | MIRACL dev via mteb/MIRACLRetrievalHardNegatives (CC-BY-SA-4.0) |

Model: `answerai-colbert-small` = BERT (12 layers, hidden 384) then a 384 → 96 linear without bias, L2-normalised per token. Markers inserted after `[CLS]`: query `[Q]` = `[unused0]` (id 1), document `[D]` = `[unused1]` (id 2). Documents: `[CLS] [D] text [SEP]`, at most 512 tokens (the model trained at 300; 16.5% of LongMemEval rows, 0.4% of MIRACL's and none of memsearch's exceed 512), and the 32 punctuation tokens of Python's `string.punctuation` (ids 999–1013, 1024–1036, 1063–1066, PyLate's default skiplist) dropped from the output after encoding, so rows have variable length. Queries: fixed length 32, `[CLS] [Q] text [SEP]` padded with `[MASK]` (id 103) under attention mask 0, every position kept (query augmentation); longer queries are cut (663 of memsearch en's, 61 of LongMemEval's, none of MIRACL's). MIRACL zh, ko and ja and memsearch zh were not released: the model is English, and its vocabulary maps most CJK characters to `[UNK]` (62% of memsearch zh's query tokens).

Files, per dataset: `<dataset>.rows.tsv` and `<dataset>.queries.tsv` (ids, text hashes and the relevant documents; no text; byte-identical to v2's and v4's); `<dataset>.answerai-colbert-small.rows.f16.bin` (every row's token vectors concatenated in rows.tsv order, little-endian fp16, 96 values per token) with `<dataset>.answerai-colbert-small.rows.offsets.u64.bin` (little-endian u64, n_rows + 1 token offsets: row i is tokens offsets[i] to offsets[i+1]); the same pair for queries (every query 32 tokens, so its offsets are multiples of 32). Files over GitHub's 2 GiB asset limit ship as `.part00`, `.part01`, … of 2,000 MiB each (`longmemeval-s` rows in 3, `miracl-en` rows in 2): `cat <file>.part?? > <file>`. `SHA256SUMS` lists every piece and every whole file; `scripts/fetch.sh` checks the pieces, joins them and checks the whole. No dataset text is redistributed; `src/datasets.ts` downloads each dataset from Hugging Face at a pinned revision. The vectors are under the same licence as the dataset each came from.

Parity: `src/colbert_verify.py` re-encodes 200 seeded rows and 200 queries per dataset with PyLate and compares token by token: all three datasets match in every token count, worst token cosine 0.9999998 (rows) and 0.9999998–0.9999999 (queries). `fixtures/colbert-parity.jsonl` in the repo gives token ids, masks and fp32 vectors for 20 queries and 50 written documents, to check another implementation (a Rust port) against.

```sh
scripts/fetch.sh v5 memsearch-en      # adds out/memsearch-en/answerai-colbert-small/
node src/export-rows.ts --dataset memsearch-en
uv run --python 3.12 --with pylate==1.6.0 python src/colbert_verify.py --dataset memsearch-en
```

Encoding took 2.9 h for LongMemEval and 1.9 h for MIRACL en on `dv`'s EPYC 7351P (4 processes × 4 threads each, both at once), 6.2 GB and 3.5 GB of fp16. Results, latency and caveats are in `results/colbert-rerank.md`.
