# ColBERT late-interaction rerank

Revised 2026-10-31. Does a ColBERT reranker, with document token vectors
precomputed and MaxSim at query time, give most of the cross-encoder's gain
(results/model-agnostic.md, "Needs a model") for a fraction of its latency?
MiniLM-L6 stays the first-stage embedder (Rich's ruling); ColBERT only
reorders claude-mem's current hybrid top N.

**Answer: yes, most to all of it, at 1/70th to 1/400th of the latency.** On the same
candidate pools, `answerdotai/answerai-colbert-small-v1` matches the
cross-encoder's R@5 gain on MIRACL en (+0.138 against +0.135; difference
+0.003, −0.016…+0.022) and on memsearch en gets 86% of it (−0.010,
−0.034…+0.012, not significant), and on LongMemEval store, the closest to the live store, 68% (+0.096 against +0.142 on the cross-encoder's 40 queries at depth 20; R@5 difference −0.046, −0.108…+0.000, and nDCG@10 −0.041, −0.079…−0.007, the one place the cross-encoder is measurably better). On the full 100-query sample ColBERT lifts LongMemEval store R@5 by +0.103 (+0.037…+0.169) at depth 50. A query costs
30–35 ms p50 on short passages (memsearch, MIRACL), 25 ms of it encoding
the query, and 55–85 ms on LongMemEval's ten-turn sessions, where fetching
40–100k candidate tokens dominates; MaxSim itself is 2–9 ms. The
cross-encoder takes 2.3–4.1 s on the same short-passage pools and 24 s on
LongMemEval's. The price is
storage: 96 fp16 values (192 B) per document token, about 3.1 GB for the
live store's 16.3M tokens (1.6 GB at int8).

## Method

- **Same baseline and pools as the cross-encoder.** `src/colbert-pools.ts`
  rebuilds `src/rerank.ts`'s hybrid unchanged (claude-mem's
  `searchHybrid`: MiniLM-L6 vector leg, exact, by nearest part, 100 deep;
  pg_textsearch bm25 leg from `out/<dataset>/keyword-<mode>.jsonl`; RRF
  k = 60) and dumps its top 50 per query; `src/colbert_rerank.py` asserts
  its baseline metrics equal the dump's, and `src/colbert_report.py` asserts
  they equal the cross-encoder run's per query before comparing.
- **Reranker**: `answerdotai/answerai-colbert-small-v1` (revision
  `934fa8bb`, Apache-2.0, 33M parameters, 96-d), through PyLate 1.6.0
  (sentence-transformers 5.3.0, transformers 5.3.0, torch 2.11.0, CPU,
  fp32). A part scores Σ over the 32 query tokens of the max dot product
  with its document tokens; an observation scores as its best part (as the
  cross-encoder); the top N are reordered by it, ties by hybrid rank.
  Documents are cut at 512 tokens (the model trained at 300; 512 matches
  the cross-encoder's cut).
- **Queries**: MIRACL en all 799 (scoped = store); memsearch en store all
  2,172, compared with the cross-encoder on its 400-query sample (smallest
  sha256 of the id); LongMemEval the 100 queries of `lme-s-100-v1`, store
  and scoped, compared with the cross-encoder on its 40 (store, depth 20).
- Differences are paired per query, 95% intervals from 2,000 bootstrap
  resamples (seed 0). Metrics as `src/rerank.ts`: hit@5, R@5, MRR@10,
  nDCG@10.
- **Latency** is per query on `dv` (AMD EPYC 7351P, 16 cores / 32 threads),
  measured after the corpus encodes finished (load average 6–12, other
  services running); the cross-encoder's ran at load 25–40, so its numbers
  are somewhat inflated relative to these.
  Query encode: one live query at a time through PyLate on 8 threads.
  Gather: slicing the candidates' fp16 rows out of the page-cached file and
  widening to fp32. MaxSim: numpy 2.5.4 (OpenBLAS) on 8 threads, and again
  on 1.

## Accuracy against the current hybrid

| Dataset | Depth | Queries | R@5 base → ColBERT (Δ, 95%) | nDCG@10 (Δ, 95%) | hit@5 (Δ, 95%) | Rows/query | Tokens/query |
|---|---|---|---|---|---|---|---|
| LME store | 20 | 100 | 0.350 → 0.438, +0.088 (+0.028…+0.158) | 0.308 → 0.387, +0.079 (+0.039…+0.122) | 0.470 → 0.560, +0.090 (+0.020…+0.170) | 237 | 40854 |
| LME store | 50 | 100 | 0.350 → 0.453, +0.103 (+0.037…+0.169) | 0.308 → 0.404, +0.095 (+0.053…+0.142) | 0.470 → 0.550, +0.080 (+0.010…+0.150) | 590 | 101404 |
| LME scoped | 20 | 100 | 0.952 → 0.975, +0.023 (+0.004…+0.046) | 0.938 → 0.961, +0.022 (-0.001…+0.047) | 1.000 → 1.000, +0.000 (+0.000…+0.000) | 230 | 38964 |
| LME scoped | 50 | 100 | 0.952 → 0.975, +0.023 (+0.004…+0.046) | 0.938 → 0.962, +0.024 (+0.000…+0.049) | 1.000 → 1.000, +0.000 (+0.000…+0.000) | 490 | 79036 |
| ms-en store | 20 | 2172 | 0.776 → 0.830, +0.055 (+0.041…+0.068) | 0.689 → 0.760, +0.071 (+0.060…+0.082) | 0.810 → 0.866, +0.056 (+0.042…+0.069) | 20 | 3653 |
| ms-en store | 50 | 2172 | 0.776 → 0.855, +0.080 (+0.065…+0.095) | 0.689 → 0.778, +0.089 (+0.077…+0.101) | 0.810 → 0.891, +0.081 (+0.066…+0.097) | 50 | 9134 |
| M-en scoped | 20 | 799 | 0.403 → 0.527, +0.123 (+0.102…+0.146) | 0.425 → 0.553, +0.128 (+0.109…+0.148) | 0.680 → 0.785, +0.105 (+0.078…+0.131) | 20 | 1768 |
| M-en scoped | 50 | 799 | 0.403 → 0.542, +0.138 (+0.114…+0.163) | 0.425 → 0.559, +0.134 (+0.113…+0.156) | 0.680 → 0.802, +0.123 (+0.093…+0.154) | 50 | 4702 |
| ms-zh store | 50 | 2172 | 0.321 → 0.459, +0.138 (+0.121…+0.156) | 0.273 → 0.400, +0.126 (+0.113…+0.140) | 0.350 → 0.493, +0.143 (+0.124…+0.162) | 50 | 9033 |

## Against the cross-encoder, same queries

| Dataset | Depth | Queries | Cross-encoder ΔR@5 | ColBERT ΔR@5 | ColBERT − CE: R@5 | nDCG@10 | hit@5 | Share of CE's R@5 gain |
|---|---|---|---|---|---|---|---|---|
| LME store | 20 | 40 | +0.142 (+0.050…+0.250) | +0.096 (+0.013…+0.200) | -0.046 (-0.108…+0.000) | -0.041 (-0.079…-0.007) | -0.075 (-0.175…+0.000) | 68% |
| ms-en store | 50 | 400 | +0.073 (+0.040…+0.109) | +0.063 (+0.029…+0.097) | -0.010 (-0.034…+0.012) | -0.006 (-0.026…+0.015) | -0.007 (-0.030…+0.015) | 86% |
| M-en scoped | 50 | 799 | +0.135 (+0.110…+0.160) | +0.138 (+0.114…+0.162) | +0.003 (-0.016…+0.022) | +0.001 (-0.014…+0.015) | +0.006 (-0.016…+0.029) | 103% |

- Depth 50 for MIRACL and memsearch; LongMemEval at depth 20, the depth
  the cross-encoder ran at there.
- **Query length.** 663 of memsearch en's 2,172 queries exceed the model's
  32 query tokens and are cut (61 of 470 LongMemEval, 0 of MIRACL's).
  Encoding them at 64 tokens instead did not help: memsearch en R@5 0.845
  against 0.855 at 32 (depth 50), so the model's own 32 stays.

## Latency, ms per query

| Dataset | Depth | Query encode p50 / p95 | Gather p50 | MaxSim p50 / p95 (8 thr) | MaxSim p50 (1 thr) | Total p50 / p95 | Cross-encoder p50 / p95 |
|---|---|---|---|---|---|---|---|
| LME store | 20 | 27.8 / 32.2 | 21.42 | 4.86 / 5.40 | 14.67 | 54.1 / 60.2 | 23778 / 26364 |
| LME store | 50 | 25.3 / 32.7 | 52.19 | 8.61 / 10.42 | 33.86 | 85.8 / 104.0 | — |
| LME scoped | 20 | 26.3 / 33.1 | 30.60 | 4.98 / 7.04 | 15.43 | 61.8 / 75.1 | — |
| LME scoped | 50 | 25.0 / 30.5 | 40.41 | 6.99 / 7.52 | 24.62 | 72.3 / 83.5 | — |
| ms-en store | 20 | 24.9 / 32.8 | 1.99 | 2.32 / 2.51 | 3.03 | 29.3 / 30.1 | — |
| ms-en store | 50 | 25.0 / 28.5 | 5.16 | 2.92 / 3.17 | 4.61 | 33.1 / 36.3 | 4120 / 5857 |
| M-en scoped | 20 | 27.5 / 32.4 | 0.93 | 2.17 / 2.31 | 2.51 | 30.6 / 31.6 | — |
| M-en scoped | 50 | 26.4 / 34.4 | 2.85 | 2.51 / 2.86 | 3.42 | 31.7 / 35.1 | 2330 / 4731 |
| ms-zh store | 50 | 25.9 / 33.6 | 6.17 | 3.03 / 3.41 | 4.95 | 35.1 / 41.1 | — |

- Total is the query encode p50 plus that query's gather and MaxSim (8
  threads). The cross-encoder column is `src/rerank.ts`'s reranking time,
  same pools, 8 intra-op threads.
- **Query encode is 25 ms** p50 whatever the corpus: 32 tokens through a
  12-layer, 384-wide BERT on 8 threads (80–100 ms when measured during the
  corpus encodes).
- **Gather is the LongMemEval cost**: 21–52 ms to slice 237–590 rows
  (40–100k tokens) out of a memory-mapped file in Python and widen them to
  fp32. It is a cost of this harness's per-row Python slicing, not of the
  arithmetic; a native implementation reading contiguous per-observation
  blobs would be bounded by memory bandwidth (8–20 MB per query).
- **MaxSim is cheap**: microbenchmark on 1M random fp16 tokens (numpy
  2.5.4, `dv`): 0.29 µs a token single-threaded for the 32×96 by 96×T GEMM
  (21 GFLOP/s), plus 0.27 µs to widen fp16 to fp32 in numpy (no F16C
  path; a native implementation does this in the kernel), 0.04 µs for the
  segmented max. 8 threads bring the GEMM to 0.07 µs a token.

## Storage and encode throughput

| Dataset | Rows | Tokens per row, raw: mean / median / p90 | Over 512 | Kept per row (no punctuation): mean | Kept tokens | fp16 bytes | Encode rows/s, tokens/s |
|---|---|---|---|---|---|---|---|
| memsearch en | 955 | 232 / 229 / 341 | 0% | 174 | 165,951 | 32 MB | 2.3, 534 (2 threads, busy host) |
| MIRACL en | 178,768 | 117 / 102 / 225 | 0.4% | 101 | 17,991,409 | 3.45 GB | 6.7, 780 per process |
| LongMemEval | 199,509 | 224 / 97 / 594 | 16.5% | 161 | 32,191,687 | 6.18 GB | 4.9, 980 per process |
| Queries (all three) | 3,441 | 12–26 mean | 0 over 512; 724 over 32 | 32 (fixed) | 110,112 | 21 MB | 22 queries/s on 2 threads |

- **Encode**: PyLate fp32 on CPU. 4 processes × 4 threads per dataset,
  both datasets at once (32 threads in all): about 6.7 rows/s and 780
  tokens/s per process on MIRACL; 4.9 rows/s and 980 tokens/s per process on LongMemEval, whose 2.9 h wall time was the longest. Alone on 16 threads, a
  2,000-row sample ran at 3,100–3,200 tokens/s. That is the cost of adding
  vectors at ingest: a 37-token fact about 12 ms of 16-thread CPU.
- **Bytes per token**: 192 (96 × fp16); 96 at int8 plus a scale per token
  or per dimension. Offsets add 8 bytes per row.
- **Live store** (302k parts, 16.3M MiniLM tokens; same uncased BERT
  vocabulary, so the counts carry over, plus one marker token per part and
  minus punctuation, which dropped 13–25% here): about 14–16M tokens, so
  2.7–3.1 GB fp16, 1.4–1.6 GB int8. ColBERT's PLAID residual compression
  (2 bits a dimension) would take it to about 0.4 GB, not measured here.
- **Rerank cost on the live store** scales with the candidates' tokens:
  50 observations × p parts × ~50 kept tokens. At p = 6 that is 15k tokens:
  about 4 ms GEMM on one thread, 1 ms on 8, plus reading 2.9 MB of fp16
  from wherever the vectors live (Postgres `bytea`, a side file, or xerj's
  store). A full scan of all 16.3M tokens would be about 4.7 s on one
  thread, which is why ColBERT stays a reranker here.

## Out of scope: non-English

`answerai-colbert-small-v1` is English (its card); its BERT uncased vocabulary
maps most CJK characters to `[UNK]`. A sanity run on memsearch zh (store, depth
50, 2,172 queries) still gains R@5 +0.138 (+0.121…+0.156), from 0.321 to
0.459, but not by reading Chinese: 62% of its query tokens and 37% of its
document tokens are `[UNK]`, and what matches is the English inside them
(Git, master, Claude Code, tmux-worktree-orchestration, file names). That is
the live store's situation too (Chinese or Japanese prose about English code),
but a pure-Chinese set (MIRACL zh, ko, ja) was not run and would need a
multilingual late-interaction model (e.g. jina-colbert-v2, not measured).

## What this means for claude-mem

- **A ColBERT rerank stage is the first reranker cheap enough for
  per-prompt injection.** It keeps all of the cross-encoder's gain on short passages and about
  two-thirds on multi-turn sessions, and costs one
  32-token BERT pass per query (tens of ms) plus milliseconds of MaxSim,
  instead of 50–500 cross-encoder passes.
- **It costs ingest work and storage**: one encoder pass per part at write
  time (about 12 ms of 16-thread CPU for a 37-token fact at batch
  throughput) and ~3 GB fp16 for today's
  store, against 0.46 GB for the MiniLM vectors (302k × 384 fp32 in
  pgvector).
- Where it would go: after `searchHybrid` returns, in the server's search
  route, reading the candidates' token vectors and scoring them; in xerj, a
  local implementation of the `xerj-rerank` stage (today a network call).
  Rust needs: below.

## Porting to Rust

What a port (candle 0.9 as in xerj's `xerj-cmem-embed`, or `ort`) has to
reproduce; `fixtures/colbert-parity.jsonl` checks it.

- **Weights**: `answerdotai/answerai-colbert-small-v1` revision
  `934fa8bb4ce2284f4c2baa232d81aca4d076fa5e`, `model.safetensors` (fp32):
  the BERT weights plus `linear.weight` [96, 384], no bias. The repo also
  ships ONNX exports (`onnx/model.onnx`, fp16, int8, q4); whether they
  include the projection was not checked; the fixture decides.
- **Encoder**: BERT (`config.json`, `model_type: bert`, base
  `bclavie/mini-base`): 12 layers, hidden 384, 12 heads (32 per head),
  intermediate 1536, `hidden_act: gelu` (erf form), `layer_norm_eps`
  1e-12, absolute positions up to 512, `type_vocab_size` 2 (all
  `token_type_ids` 0), vocabulary 30,522. Output: last hidden state per
  token, no pooling.
- **Head**: `linear` 384 → 96 without bias, then L2-normalise each token
  vector. MaxSim is then a dot product.
- **Tokenizer**: `tokenizer.json` (WordPiece, `BertTokenizer`,
  `do_lower_case` true, `strip_accents` unset so lowercasing strips
  accents, `tokenize_chinese_chars` true). Special ids: `[PAD]` 0, `[UNK]`
  100, `[CLS]` 101, `[SEP]` 102, `[MASK]` 103.
- **Markers**: query `[Q]` = `[unused0]` id 1, document `[D]` =
  `[unused1]` id 2, inserted at position 1, after `[CLS]`. The text is
  tokenised with `max_length` one less than the target (31 for queries,
  511 for documents) with `[CLS]` … `[SEP]`, then the marker is inserted,
  so a truncated input still ends in `[SEP]`.
- **Queries**: exactly 32 ids: `[CLS] [Q] text… [SEP]` padded with
  `[MASK]` (103; PyLate sets the pad id to the mask id). Attention mask 1
  on the real tokens, **0 on the `[MASK]` padding** (the checkpoint's
  `attend_to_mask_tokens: false`), but all 32 positions are output and all
  32 enter MaxSim: the masks are the query augmentation.
- **Documents**: `[CLS] [D] text… [SEP]`, at most 512 ids (training used
  300; this repo uses 512, and a port must pick the same), no padding in
  the output. Batched documents pad with 103 under attention mask 0; those
  positions are dropped.
- **Skiplist**: document tokens whose id is one of Python's
  `string.punctuation`, 32 ids, `!"#$%&'()*+,-./:;<=>?@[\]^_`{|}~` =
  999–1013, 1024–1036, 1063–1066, are run through the encoder (they are
  attended) and then dropped from the output. Queries keep every token.
- **Fixture**: `fixtures/colbert-parity.jsonl` (1.0 MB, from
  `src/colbert_fixture.py`): 20 queries and 50 documents written for it
  (no dataset text), covering empty input, punctuation only, accents,
  emoji, Chinese, code, numbers, upper case, a query over 32 tokens and
  two documents over 512. Per line: `input_ids`, `attention_mask`, `kept`
  (input positions that are output), and fp32 vectors to 6 decimals at
  `positions` (all for short documents; a query's real tokens plus its
  first four and last two `[MASK]`s; the first 8 and last 4 of long
  documents). A last line holds the 20 × 50 MaxSim matrix over full
  outputs. PyLate re-encoding the release samples agrees at worst token
  cosine 0.9999998, so a port should reach 0.9999 per token.

## Release v5

The token vectors of every row and query of memsearch en, MIRACL en and
LongMemEval are release v5 (`scripts/fetch.sh v5 <dataset>`, then
`src/colbert_verify.py`); format and checks in its notes and the README.

Code: `src/colbert-pools.ts`, `src/colbert_encode.py`,
`src/colbert_rerank.py`, `src/colbert_report.py`, `src/colbert_verify.py`,
`src/colbert_fixture.py`. Rerun:

```sh
node src/export-rows.ts --dataset miracl-en
node src/colbert-pools.ts --dataset miracl-en --mode scoped --in ../model-agnostic/out
uv run --python 3.12 --with pylate==1.6.0 python src/colbert_encode.py --dataset miracl-en --which queries
uv run --python 3.12 --with pylate==1.6.0 python src/colbert_encode.py --dataset miracl-en --which rows   # or scripts/fetch.sh v5 miracl-en
uv run --python 3.12 --with pylate==1.6.0 --with threadpoolctl python src/colbert_rerank.py --dataset miracl-en --mode scoped --depth 50
uv run --with numpy python src/colbert_report.py
```

## Sources

| Item | Source | Used for |
|---|---|---|
| ColBERT | Khattab & Zaharia, [arXiv 2004.12832](https://arxiv.org/abs/2004.12832) (SIGIR 2020) | Late interaction, MaxSim, query `[MASK]` augmentation |
| ColBERTv2 / PLAID | Santhanam et al., [arXiv 2112.01488](https://arxiv.org/abs/2112.01488) (NAACL 2022); [arXiv 2205.09707](https://arxiv.org/abs/2205.09707) (CIKM 2022) | Residual compression, 2-bit storage |
| answerai-colbert-small-v1 | [model card](https://huggingface.co/answerdotai/answerai-colbert-small-v1), `artifact.metadata` at `934fa8bb`; [JaColBERTv2.5](https://arxiv.org/abs/2407.20750) recipe | 96-d, query 32, doc 300 in training, markers, `attend_to_mask_tokens: false` |
| PyLate 1.6.0 | [lightonai/pylate](https://github.com/lightonai/pylate), `pylate/models/colbert.py` | Tokenisation, marker insert, skiplist (`string.punctuation`), pad = `[MASK]` |
