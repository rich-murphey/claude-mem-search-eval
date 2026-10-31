# Model-agnostic ways to improve search by meaning

Revised 2026-10-31. What can be done on top of whatever vectors claude-mem
already stores, without changing the embedding model or calling an LLM:
measured offline on the release vectors for all-MiniLM-L6-v2 (claude-mem's
default, the model Rich chose to keep) and multilingual-e5-small (to show a
gain is not MiniLM's alone), on all seven datasets, against claude-mem's
current server hybrid search.

**Answer.** One change is free, safe and model-independent: **RRF k = 5
instead of 60.** Chosen independently by cross-validation on both models,
it raises store-mode R@5 by +0.014 (+0.009…+0.019) macro on MiniLM-L6 and
+0.038 (+0.030…+0.046) on e5-small, and hurts no dataset. A **convex
combination of normalised scores** gains more (MiniLM +0.023, e5 +0.056
R@5) but its weight is model-specific (α 0.3–0.4 for MiniLM, 0.6–0.7 for
e5; the wrong one loses up to 0.05), and it needs pg_textsearch's bm25 scores,
which cost 20–400 ms a query to read. Embedding post-processing
(centring, all-but-the-top, whitening) is not model-agnostic: small gains on
MiniLM, losses on e5. Part aggregation other than max, MMR, and vector PRF
from the vector leg alone gain nothing. A small cross-encoder over the
hybrid top 50 is the largest lever measured (MIRACL en R@5 +0.135), but it
is a model and costs seconds a query on `dv`'s CPU.

## Method

- **Baseline is claude-mem's current hybrid search**
  (`PostgresObservationRepository.searchHybrid` in
  `src/storage/postgres/observations.ts`, as in the claude-mem tree
  `dv:~/wt/claude-mem/docs-semantic-inject`, branch
  `int/docs-semantic-inject` at 325afb601, the one whose hybrid has the bm25
  leg): a vector
  leg ranking observations by their nearest part, 100 deep; a pg_textsearch
  bm25 leg over any query term, 100 deep; RRF with k = 60. Offline, the
  vector leg is exact (the server reads the HNSW index's 400 nearest parts,
  widened ×4, which the README shows equals exact to the third decimal), and
  the bm25 leg is dumped from a throwaway Postgres 17 + pg_textsearch 1.5.1
  with the server's own query and index (`src/keyword-legs.ts`). Checked
  against the server's own rankings (`--rankings-out`, memsearch en,
  scoped): vector top 10 identical on 2,172 of 2,172 queries; bm25 2,115;
  hybrid 1,907, with the same top-5 set on 2,105 (RRF ties, which Postgres
  orders by `updated_at` and this code by id).
- **Store mode** is every document in one project (LongMemEval's 19,195
  sessions, memsearch's 955 chunks); MIRACL has one project per language, so
  its scoped and store modes are the same thing. The store-mode set is
  LongMemEval store, memsearch zh and en store, and MIRACL en, zh, ko, ja.
- **Nothing is tuned on the queries it is scored on.** Queries split in two
  folds by sha256(dataset/query id). For each technique the setting with the
  best macro-mean nDCG@10 over all seven datasets' fold-A queries is scored
  on fold B, and the reverse; one setting serves all datasets at once, as a
  constant in claude-mem would. Whitening and all-but-the-top are fitted on
  corpus vectors only (a deterministic sample of up to 50,000 parts), never on
  queries or labels.
- **Differences are paired per query** against the baseline, averaged per
  dataset; "macro" averages the seven datasets, its 95% interval from 2,000
  bootstrap resamples drawn within each dataset. "Helps" and "hurts" list
  datasets whose own R@5 interval excludes zero.
- Metrics: hit@5 (any relevant in the top 5), R@5, MRR@10, nDCG@10. k = 5 is
  claude-mem's injection limit.

Code: `src/keyword-legs.ts` (bm25 legs and their score cost),
`src/model-agnostic.ts` (every configuration, per query),
`src/model-agnostic-report.ts` (cross-validation and the tables below),
`src/rerank.ts` (cross-encoder). Rerun:

```sh
node src/keyword-legs.ts --db postgres://… --dataset longmemeval-s --mode store
node src/model-agnostic.ts --dataset longmemeval-s --model minilm-l6 --mode store
node src/model-agnostic-report.ts > /tmp/report.md
node src/rerank.ts --dataset miracl-en --mode scoped
```

## Ranked: store mode, MiniLM-L6, against the current hybrid

Gain in R@5, macro over the seven datasets (LongMemEval store, memsearch zh
and en store, MIRACL en, zh, ko, ja), cross-validated as in Method; the
e5-small column is the same technique tuned on e5-small; "MiniLM's setting
on e5" applies the setting chosen on MiniLM to e5, which is what one shipped
constant would do. LME is LongMemEval store alone, the closest to the live
store (multi-part observations, one project). Full tables, scoped mode and
the other metrics follow under "All results".

| # | Technique | Setting chosen | ΔR@5 MiniLM (95%) | ΔnDCG@10 MiniLM | LME ΔR@5 | Helps / hurts (MiniLM, per-dataset 95%) | ΔR@5 e5-small | MiniLM's setting on e5 | Cost | claude-mem | Rust / xerj |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Convex combination, min-max normalised scores | α_vec 0.3–0.4 | +0.023 (+0.017…+0.029) | +0.031 | +0.011 | helps ms-zh, ms-en, M-ko, M-ja; hurts M-en −0.024 | +0.048 (α 0.7) | −0.049 (−0.058…−0.041) | bm25 scores must be read: LME store p50 6 → 413 ms, ms-en 3 → 37, M-en 5 → 23 (pg_textsearch 1.5.1, `src/keyword-legs.ts`) | `searchHybrid`: name the bm25 score and `embedding <=>` distance in the `keyword` and `semantic` CTEs; replace `fused`'s `sum(1/(RRF_K+rank))` | exists: `FusionStrategy::Linear` → `fuse_linear` (min-max, per-leg weight), `xerj-engine/src/index.rs` |
| 2 | Convex combination, z-score | α_vec 0.3–0.4 | +0.022 (+0.017…+0.028) | +0.031 | +0.016 | same as 1; hurts M-en −0.026 | +0.056 (α 0.6) | −0.009 (best-transferring convex form) | as 1 | as 1 | new normaliser beside `fuse_linear` |
| 3 | Vector PRF fed by the hybrid top k, then convex fusion | k 5, α_q 0.5–0.85, α_vec 0.5 | +0.015 (+0.010…+0.019) | +0.018 | +0.006 | helps ms-zh, ms-en | +0.052 | −0.040 | as 1, plus a second vector query | second `searchHybrid` pass with the Rocchio vector | second kNN sub-query |
| 4 | **RRF k = 5** | k 5 (both folds, both models) | **+0.014 (+0.009…+0.019)** | +0.012 | −0.005 | helps ms-zh, ms-en, M-ko, M-ja; hurts none | **+0.038 (+0.030…+0.046)** | **+0.038** (same k) | none | `const RRF_K = 60` → 5 in `observations.ts` | `FusionStrategy::Rrf { k }` default 60 → 5 (`xerj-query/src/ast.rs`); `fuse_rrf` unchanged |
| 5 | Weighted RRF, k 60 | w_vec 0.3 | +0.011 (+0.006…+0.016) | +0.016 | −0.011 | helps 4; hurts M-en −0.032 | +0.018 (w 0.7) | −0.047 | none | weight the two terms in `fused` | per-leg weight in `fuse_rrf` |
| 6 | All-but-the-top (remove mean and top D PCs) | D 8 | +0.006 (+0.001…+0.011) | +0.009 | −0.005 | helps ms-zh, M-zh, M-ko, M-ja; hurts ms-en −0.028 | −0.019 | −0.001 | rewrite every stored vector and rebuild HNSW (no re-embedding); refit as the store drifts | a projection at embed time (`LocalEmbedder`) and a migration of `observation_embeddings` | at ingest and query |
| 7 | Whitening (Su et al.) | k 128 | +0.005 (+0.001…+0.010) | +0.005 | −0.006 | helps ms-zh, M-ja; hurts ms-en −0.023 | −0.038 | +0.005 | as 6, and a `vector(128)` column | as 6 | as 6 |
| 8 | Vector PRF from the vector leg alone (Rocchio) | k 3, α_q 0.7–0.85 | +0.002 (−0.001…+0.005) | +0.001 | +0.002 | — | +0.003 | −0.002 | a second vector query | — | — |
| 9 | MMR over fused top 50 | λ 0.95 | +0.000 (−0.001…+0.002) | +0.000 | −0.000 | — | +0.000 | +0.000 | one top-50 pairwise pass | — | — |
| 10 | Part aggregation (top-2/3 mean, soft max τ 0.01–0.1) | max (unchanged) | +0.000 | +0.000 | +0.000 | max wins in both folds; LME vector-only R@5: max 0.289, top-2 0.293, top-3 0.276, soft max τ 0.1 0.262 | +0.000 | +0.000 | — | keep `min(nearest.distance)` | — |
| 11 | Mean-centring | — | −0.004 (−0.008…−0.001) | −0.004 | −0.006 | hurts ms-en −0.017 | −0.010 | −0.004 | as 6 | — | — |
| — | Best of all (space × aggregation × fusion) | ABTT-8 + convex min-max 0.3–0.4 | +0.027 (+0.021…+0.033) | +0.035 | +0.011 | hurts M-en −0.023 | +0.056 (convex z 0.6 alone) | −0.009 | as 1 + 6 | | |
| — | Vector only (drop keyword leg) | — | −0.098 (−0.108…−0.089) | −0.088 | −0.064 | hurts 6 of 7 | +0.018 | — | — | — | — |

Read with the per-dataset columns in "All results": for MiniLM on MIRACL
zh the baseline is R@5 0.003, so nothing moves it, and the macro mean is
diluted by it.

### What this means for claude-mem

- **Ship RRF k = 5.** It is the only change that is free, needs no model
  knowledge, picks the same constant on both models and both folds, and
  hurts no dataset. Its LongMemEval store change is −0.005 (within noise).
  Why it works: with k = 60, 1/(60+r) barely separates rank 1 from rank 20,
  so a document either leg ranks moderately beats one the other leg ranks
  first; k = 5 lets a leg's top hits through, which is what a weak leg in
  either direction (MiniLM's vectors, Postgres's CJK keywords) needs.
  Bruch et al. report RRF's sensitivity to k; 60 is Cormack et al.'s 2009
  value, carried by Elasticsearch, OpenSearch and xerj as the default.
- **A convex combination is better only if its weight follows the model**,
  and claude-mem lets the user pick the model. A per-model α in
  `models.ts` (0.3 for MiniLM-L6, 0.6 for e5-small, measured here) would
  carry it; until then RRF's rank-only form is the robust choice. Reading
  bm25 scores from pg_textsearch costs up to 0.4 s a query in store mode,
  which also argues for rank fusion on Postgres; xerj already has scores.
- **Do not transform stored vectors.** All-but-the-top and whitening help
  MiniLM a little and only where MiniLM is weakest (Chinese, Korean,
  Japanese), cost English (memsearch en −0.023 to −0.028; MIRACL en −0.003 to −0.010),
  and hurt e5-small everywhere (−0.019, −0.038). Anisotropy correction is a
  property of a model's geometry, not a model-agnostic fix.
- **Keep max over parts.** A session's best turn is the right score; top-k
  means and soft max dilute it.
- **Vector PRF needs a better first ranking than MiniLM's vector leg gives
  it.** Fed from the vector leg it does nothing; fed from the hybrid top 3
  it lifts the vector leg alone by +0.046 R@5 (MiniLM) but adds nothing
  once fused again, because the keyword evidence it carries is already in
  the fusion.

## Needs a model: cross-encoder rerank

Not model-agnostic in the sense above (it is a second model, about 90 MB of
ONNX), but it works on top of any embedding and no LLM. Xenova's ONNX export
of `cross-encoder/ms-marco-MiniLM-L6-v2` (transformers.js 4.3.1, fp32, 8
intra-op threads) scores each part of each of the current hybrid's top 50
observations against the query; an observation scores as its best part, and
the top 50 are reordered by it (`src/rerank.ts`). Latency is the reranking
alone, per query, on `dv`'s EPYC 7351P while the host ran other work (load
average 25–40), so it is an upper bound; the model card's 1,800 docs/s is
on a GPU. memsearch en is a fixed sample of 400 queries (smallest sha256 of
the id); LongMemEval is the 100-question manifest `lme-s-100-v1`.

| Dataset | Queries | R@5 (Δ, 95%) | nDCG@10 (Δ, 95%) | hit@5 (Δ, 95%) | Pairs/query | ms p50 / p95 |
|---|---|---|---|---|---|---|
| ms-en store | 400 | 0.799 → 0.872, +0.073 (+0.040…+0.109) | 0.700 → 0.797, +0.097 (+0.068…+0.127) | 0.835 → 0.910, +0.075 (+0.040…+0.110) | 50 | 4126 / 5888 |
| M-en scoped | 799 | 0.403 → 0.538, +0.135 (+0.111…+0.160) | 0.425 → 0.559, +0.134 (+0.112…+0.154) | 0.680 → 0.796, +0.116 (+0.085…+0.148) | 50 | 2330 / 4734 |

- **The largest gain measured here**, on both English datasets where it
  ran, and on top of the current hybrid rather than instead of it.
- **Too slow for claude-mem's per-prompt injection on this CPU:** seconds a
  query against the server's tens of milliseconds. It fits an explicit
  search (the `search` tool, a user waiting on results), a smaller depth
  (top 20), or a GPU. English only: the MS MARCO model has an English
  vocabulary; a multilingual reranker would be its own measurement.
- Where it would go: claude-mem after `searchHybrid` returns, in the
  server's search route (a rerank stage over the returned rows' parts);
  xerj already has the stage, `xerj-rerank` (`engine/crates/xerj-rerank`),
  which today calls out over the network.

## Not measured here, and why

- **Recency and metadata priors.** None of the seven datasets carries a
  timestamp a query could use without leaking its answer (LongMemEval's
  session dates sit beside a question date that dates the answer). claude-mem
  already filters by project, folder, platform and subagent before the
  nearest-parts cutoff (`searchHybrid`, the `narrowed` branch). A recency
  prior is a ranking policy to test on Rich's own store with judged queries,
  not on these.
- **HNSW recall settings.** Every number here is exact search. The server
  already raises `hnsw.ef_search` to its 400-part cutoff and uses pgvector
  0.8's iterative scan for project-filtered queries; the README shows the
  pgvector path equal to exact to the third decimal, scoped, and Chroma's
  hnswlib losing 0.011 R@5 on LongMemEval store until asked for 1,000
  parts. Nothing to gain from model-agnostic tuning here beyond keeping
  those settings.
- **Query-side rewriting** (dropping question words, lower-casing) changes
  the text and so needs the query re-embedded; cheap (one query), but it is
  a model call and was left out.
- **Chunking long parts instead of truncating at 256 tokens** needs the
  split pieces embedded: the README's chroma-mem table measures it (same
  model, release v3): LongMemEval nDCG@10 +0.007 (0.001–0.014), memsearch zh
  −0.031, en −0.008. On the live store about 300k parts exist for 43k
  observations, mostly short facts; re-embedding only the parts over 254
  word pieces is the cost (~20 parts/s on `dv` for the Rust embedder).
- **CJK tokenisation for the keyword leg** (pg_bigm, PGroonga) is a hybrid
  lever, not a vector one. Postgres's `english` text config returns nothing
  useful for CJK queries (README). xerj's phase-0 run
  ([research/claude-mem/phase0-results.md](https://github.com/rich-murphey/xerj/blob/main/research/claude-mem/phase0-results.md);
  its bm25's Unicode tokenizer splits ideographs) found memsearch zh hit@5
  0.767 against pg keyword 0.434, and MIRACL zh 0.379 against 0.003: the largest single gain on the table for Chinese, but it
  changes the keyword index, not the vectors.

## Literature

Every entry fetched 2026-10-31 (arXiv API, Crossref, GitHub, Hugging Face,
postgresql.org).

| Technique | Source | What it claims |
|---|---|---|
| All-but-the-top | Mu, Bhat, Viswanath, "All-but-the-Top: Simple and Effective Postprocessing for Word Representations", [arXiv 1702.01417](https://arxiv.org/abs/1702.01417) (ICLR 2018 per common citation; the arXiv record names no venue) | Removing the mean and a few top principal directions improves word and sentence embeddings (STS, classification) |
| Whitening | Su et al., "Whitening Sentence Representations for Better Semantics and Faster Retrieval", [arXiv 2103.15316](https://arxiv.org/abs/2103.15316) (2021) | Whitening makes sentence embeddings isotropic and can cut dimensions; STS, not passage retrieval |
| Whitening | Huang et al., "WhiteningBERT", [arXiv 2104.01767](https://arxiv.org/abs/2104.01767) (2021) | Whitening consistently helps across 4 models and 7 STS datasets |
| Whitening for dense retrieval | Jung et al., "Isotropic Representation Can Improve Dense Retrieval", [arXiv 2209.00218](https://arxiv.org/abs/2209.00218) (2022) | Whitening or flows raise reranking nDCG@10 5–23% for ColBERT and RepBERT, up to 25% out of domain |
| Anisotropy | Ethayarajh, "How Contextual are Contextualized Word Representations?", [arXiv 1909.00512](https://arxiv.org/abs/1909.00512) (EMNLP 2019) | Contextual representations are anisotropic in every layer |
| Fusion functions | Bruch, Gai, Ingber, "An Analysis of Fusion Functions for Hybrid Retrieval", [arXiv 2210.11934](https://arxiv.org/abs/2210.11934), ACM TOIS 2023, [doi:10.1145/3596512](https://doi.org/10.1145/3596512) | A convex combination of normalised scores beats RRF in and out of domain, is largely indifferent to the normalisation, and tunes from few examples; RRF is sensitive to k |
| RRF | Cormack, Clarke, Büttcher, SIGIR 2009, [doi:10.1145/1571941.1572114](https://doi.org/10.1145/1571941.1572114) | Rank-only fusion that needs no score calibration |
| MaxP / passage aggregation | Dai & Callan, "Deeper Text Understanding for IR with Contextual Neural Language Modeling", [arXiv 1905.09217](https://arxiv.org/abs/1905.09217) (SIGIR 2019) | Document score from passage scores (FirstP, MaxP, SumP in the paper body; the abstract names none) |
| Vector PRF | Li et al., "Pseudo Relevance Feedback with Deep Language Models and Dense Retrievers: Successes and Pitfalls", [arXiv 2108.11044](https://arxiv.org/abs/2108.11044), TOIS 2023, [doi:10.1145/3570724](https://doi.org/10.1145/3570724) | Rocchio averaging in embedding space helps dense retrievers, best with the query keeping at least half the weight and few feedback passages |
| ANCE-PRF | Yu et al., [arXiv 2108.13454](https://arxiv.org/abs/2108.13454) (CIKM 2021); reproduction Li et al., [arXiv 2112.06400](https://arxiv.org/abs/2112.06400) (ECIR 2022) | A trained PRF query encoder; not model-agnostic (needs training), listed for contrast |
| Rocchio | Rocchio, "Relevance feedback in information retrieval", in Salton (ed.), *The SMART Retrieval System*, Prentice-Hall, 1971 (book chapter; pages not checked) | Origin of query-vector feedback |
| MMR | Carbonell & Goldstein, SIGIR 1998, [doi:10.1145/290941.291025](https://doi.org/10.1145/290941.291025) | Rerank trading relevance against redundancy |
| HNSW | Malkov & Yashunin, [arXiv 1603.09320](https://arxiv.org/abs/1603.09320), IEEE TPAMI 2020 | The index pgvector and Chroma use |
| pgvector 0.8.0 | [CHANGELOG](https://github.com/pgvector/pgvector/blob/master/CHANGELOG.md) (2024-10-30), [release news](https://www.postgresql.org/about/news/pgvector-080-released-2952/) | Iterative index scans: `hnsw.iterative_scan` (`strict_order`/`relaxed_order`), `hnsw.max_scan_tuples` (default 20,000); `hnsw.ef_search` default 40 |
| Cross-encoder | Nogueira & Cho, "Passage Re-ranking with BERT", [arXiv 1901.04085](https://arxiv.org/abs/1901.04085); model card [cross-encoder/ms-marco-MiniLM-L6-v2](https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2) (renamed from `-L-6-`) | Card: nDCG@10 74.30 TREC DL 2019, MRR@10 39.01 MS MARCO dev, 1,800 docs/s on its GPU |
| CJK keyword search | [pg_bigm](https://github.com/pgbigm/pg_bigm), [PGroonga](https://pgroonga.github.io/) | Bigram full-text indexes; Groonga-backed full-text search for all languages, Japanese and Chinese included |
| Background | Reimers & Gurevych, "Sentence-BERT", [arXiv 1908.10084](https://arxiv.org/abs/1908.10084) (EMNLP 2019) | Bi-encoder embeddings compared by cosine |

## All results

Generated by `node src/model-agnostic-report.ts`. Settings: `space agg prf fusion mmr` with `base`, `max` and `-` left out; `cc-mm0.3` is a convex combination, min-max, α_vec 0.3; `prf-h3-0.7` is PRF from the hybrid top 3 with the query keeping weight 0.7; `abtt8` removes the mean and 8 principal directions; `whiten128` whitens to 128 dimensions.

### minilm-l6, store mode (LME, ms-zh, ms-en, M-en, M-zh, M-ko, M-ja)

Baseline (current hybrid; vector only) per dataset, R@5 / nDCG@10: LME 0.352/0.318; 0.289/0.267 · ms-zh 0.321/0.273; 0.178/0.149 · ms-en 0.776/0.689; 0.615/0.543 · M-en 0.403/0.425; 0.331/0.336 · M-zh 0.003/0.004; 0.003/0.003 · M-ko 0.236/0.199; 0.023/0.021 · M-ja 0.046/0.041; 0.010/0.011

#### Against the current hybrid (RRF 60)

| Technique | Setting chosen (fold A; fold B) | ΔR@5 macro (95%) | ΔnDCG@10 macro | Δhit@5 macro | ΔR@5 LME / ms-zh / ms-en / M-en / M-zh / M-ko / M-ja | Helps (R@5, 95% > 0) | Hurts (R@5, 95% < 0) | ΔR@5 macro, setting chosen on multilingual-e5-small |
|---|---|---|---|---|---|---|---|---|
| space × aggregation × fusion, best of all | abtt8 cc-mm0.4; abtt8 cc-mm0.3 | +0.027 (+0.021…+0.033) | +0.035 (+0.031…+0.040) | +0.035 (+0.026…+0.043) | +0.011 / +0.085 / +0.050 / −0.023 / +0.008 / +0.037 / +0.024 | ms-zh +0.085, ms-en +0.050, M-ko +0.037, M-ja +0.024 | M-en −0.023 | −0.009 (−0.015…−0.003) |
| convex combination, min-max (α 0-1) | cc-mm0.4; cc-mm0.3 | +0.023 (+0.017…+0.029) | +0.031 (+0.026…+0.035) | +0.027 (+0.019…+0.035) | +0.011 / +0.068 / +0.054 / −0.024 / +0.001 / +0.037 / +0.015 | ms-zh +0.068, ms-en +0.054, M-ko +0.037, M-ja +0.015 | M-en −0.024 | −0.049 (−0.058…−0.041) |
| any fusion above | cc-mm0.4; cc-mm0.3 | +0.023 (+0.017…+0.029) | +0.031 (+0.026…+0.035) | +0.027 (+0.019…+0.035) | +0.011 / +0.068 / +0.054 / −0.024 / +0.001 / +0.037 / +0.015 | ms-zh +0.068, ms-en +0.054, M-ko +0.037, M-ja +0.015 | M-en −0.024 | −0.009 (−0.015…−0.003) |
| convex combination, z-score (α 0-1) | cc-z0.4; cc-z0.3 | +0.022 (+0.017…+0.028) | +0.031 (+0.027…+0.035) | +0.026 (+0.019…+0.034) | +0.016 / +0.063 / +0.054 / −0.026 / +0.000 / +0.039 / +0.010 | ms-zh +0.063, ms-en +0.054, M-ko +0.039, M-ja +0.010 | M-en −0.026 | −0.009 (−0.015…−0.003) |
| convex combination, theoretical-min (α 0-1) | cc-tmm0.2 | +0.019 (+0.013…+0.025) | +0.025 (+0.020…+0.030) | +0.022 (+0.014…+0.030) | +0.009 / +0.077 / +0.050 / −0.064 / −0.003 / +0.045 / +0.016 | ms-zh +0.077, ms-en +0.050, M-ko +0.045, M-ja +0.016 | M-en −0.064 | −0.098 (−0.108…−0.089) |
| vector PRF + any fusion | prf-h5-0.85 cc-mm0.5; prf-h5-0.5 cc-mm0.5 | +0.015 (+0.010…+0.019) | +0.018 (+0.015…+0.021) | +0.021 (+0.014…+0.027) | +0.006 / +0.044 / +0.031 / +0.005 / +0.000 / +0.011 / +0.005 | ms-zh +0.044, ms-en +0.031 | — | −0.040 (−0.049…−0.032) |
| RRF k (1-120) | rrf5 | +0.014 (+0.009…+0.019) | +0.012 (+0.009…+0.015) | +0.017 (+0.010…+0.024) | −0.005 / +0.044 / +0.034 / −0.013 / +0.000 / +0.025 / +0.009 | ms-zh +0.044, ms-en +0.034, M-ko +0.025, M-ja +0.009 | — | +0.014 (+0.009…+0.019) |
| weighted RRF, k = 60 (w_vec 0.3-0.7) | wrrf0.3 | +0.011 (+0.006…+0.016) | +0.016 (+0.013…+0.019) | +0.015 (+0.008…+0.022) | −0.011 / +0.035 / +0.023 / −0.032 / +0.000 / +0.040 / +0.019 | ms-zh +0.035, ms-en +0.023, M-ko +0.040, M-ja +0.019 | M-en −0.032 | −0.047 (−0.055…−0.039) |
| all-but-the-top, D = 1-8 | abtt8 rrf60 | +0.006 (+0.001…+0.011) | +0.009 (+0.005…+0.012) | +0.011 (+0.004…+0.018) | −0.005 / +0.036 / −0.028 / −0.003 / +0.012 / +0.014 / +0.016 | ms-zh +0.036, M-zh +0.012, M-ko +0.014, M-ja +0.016 | ms-en −0.028 | −0.001 (−0.004…+0.003) |
| whitening, k = 384/256/128 | whiten128 rrf60 | +0.005 (+0.001…+0.010) | +0.005 (+0.001…+0.009) | +0.006 (−0.000…+0.012) | −0.006 / +0.048 / −0.023 / −0.010 / +0.009 / +0.007 / +0.011 | ms-zh +0.048, M-ja +0.011 | ms-en −0.023 | +0.005 (+0.001…+0.010) |
| vector PRF (Rocchio), RRF 60 | prf-h3-0.7 rrf60; prf-h3-0.85 rrf60 | +0.002 (−0.001…+0.005) | +0.001 (−0.001…+0.003) | −0.001 (−0.006…+0.003) | +0.002 / +0.004 / +0.004 / +0.006 / +0.000 / −0.005 / −0.000 | — | — | −0.002 (−0.004…+0.001) |
| MMR over fused top 50 (λ 0.5-0.95) | rrf60 mmr0.95 | +0.000 (−0.001…+0.002) | +0.000 (−0.000…+0.001) | +0.002 (−0.001…+0.005) | −0.000 / −0.002 / −0.002 / −0.003 / +0.000 / +0.007 / +0.001 | — | ms-en −0.002 | +0.000 (+0.000…+0.000) |
| part aggregation (top-2/3 mean, soft max) | rrf60 | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 / +0.000 / +0.000 / +0.000 / +0.000 / +0.000 / +0.000 | — | — | +0.000 (+0.000…+0.000) |
| mean-centring | center rrf60 | −0.004 (−0.008…−0.001) | −0.004 (−0.006…−0.001) | −0.005 (−0.011…−0.000) | −0.006 / −0.008 / −0.017 / +0.000 / +0.001 / −0.003 / +0.002 | — | ms-en −0.017 | −0.004 (−0.008…−0.001) |
| vector only (drop keyword leg) | vec | −0.098 (−0.108…−0.089) | −0.088 (−0.096…−0.082) | −0.115 (−0.127…−0.104) | −0.064 / −0.142 / −0.161 / −0.072 / +0.000 / −0.213 / −0.036 | — | LME −0.064, ms-zh −0.142, ms-en −0.161, M-en −0.072, M-ko −0.213, M-ja −0.036 | −0.098 (−0.108…−0.089) |

#### Vector leg alone, against vector only

| Technique | Setting chosen (fold A; fold B) | ΔR@5 macro (95%) | ΔnDCG@10 macro | Δhit@5 macro | ΔR@5 LME / ms-zh / ms-en / M-en / M-zh / M-ko / M-ja | Helps (R@5, 95% > 0) | Hurts (R@5, 95% < 0) | ΔR@5 macro, setting chosen on multilingual-e5-small |
|---|---|---|---|---|---|---|---|---|
| vector PRF from hybrid top k | prf-h3-0.5 vec | +0.046 (+0.041…+0.051) | +0.036 (+0.033…+0.040) | +0.051 (+0.044…+0.058) | +0.043 / +0.086 / +0.112 / +0.061 / +0.000 / +0.015 / +0.004 | LME +0.043, ms-zh +0.086, ms-en +0.112, M-en +0.061, M-ko +0.015 | — | +0.029 (+0.025…+0.034) |
| all-but-the-top, D = 1-8 | abtt8 vec | +0.013 (+0.008…+0.019) | +0.013 (+0.010…+0.017) | +0.016 (+0.009…+0.023) | +0.014 / +0.061 / −0.017 / −0.011 / +0.008 / +0.019 / +0.019 | ms-zh +0.061, M-ko +0.019, M-ja +0.019 | ms-en −0.017 | −0.001 (−0.005…+0.003) |
| whitening, k = 384/256/128 | whiten256 vec; whiten128 vec | +0.010 (+0.004…+0.016) | +0.010 (+0.006…+0.014) | +0.012 (+0.004…+0.019) | +0.001 / +0.076 / −0.020 / −0.024 / +0.006 / +0.014 / +0.016 | ms-zh +0.076, M-ja +0.016 | ms-en −0.020, M-en −0.024 | +0.010 (+0.005…+0.016) |
| part aggregation | vec | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 / +0.000 / +0.000 / +0.000 / +0.000 / +0.000 / +0.000 | — | — | +0.000 (+0.000…+0.000) |
| MMR over top 50 | vec mmr0.95 | −0.000 (−0.001…+0.001) | +0.000 (−0.000…+0.001) | −0.000 (−0.002…+0.001) | +0.000 / +0.001 / +0.000 / −0.001 / +0.000 / +0.000 / +0.000 | — | — | −0.000 (−0.001…+0.000) |
| vector PRF from vector top k | prf-v3-0.85 vec | −0.001 (−0.003…+0.002) | +0.001 (−0.001…+0.002) | −0.002 (−0.006…+0.002) | +0.000 / −0.003 / −0.002 / −0.003 / +0.000 / +0.002 / +0.000 | — | — | −0.001 (−0.003…+0.002) |
| mean-centring | center vec | −0.009 (−0.012…−0.006) | −0.008 (−0.010…−0.006) | −0.010 (−0.014…−0.006) | −0.010 / −0.034 / −0.020 / +0.005 / −0.001 / −0.002 / −0.001 | — | ms-zh −0.034, ms-en −0.020 | −0.009 (−0.012…−0.006) |


### minilm-l6, scoped mode (LME, ms-zh, ms-en, M-en, M-zh, M-ko, M-ja)

Baseline (current hybrid; vector only) per dataset, R@5 / nDCG@10: LME 0.944/0.933; 0.934/0.908 · ms-zh 0.427/0.363; 0.272/0.236 · ms-en 0.811/0.737; 0.688/0.603 · M-en 0.403/0.425; 0.331/0.336 · M-zh 0.003/0.004; 0.003/0.003 · M-ko 0.236/0.199; 0.023/0.021 · M-ja 0.046/0.041; 0.010/0.011

#### Against the current hybrid (RRF 60)

| Technique | Setting chosen (fold A; fold B) | ΔR@5 macro (95%) | ΔnDCG@10 macro | Δhit@5 macro | ΔR@5 LME / ms-zh / ms-en / M-en / M-zh / M-ko / M-ja | Helps (R@5, 95% > 0) | Hurts (R@5, 95% < 0) | ΔR@5 macro, setting chosen on multilingual-e5-small |
|---|---|---|---|---|---|---|---|---|
| space × aggregation × fusion, best of all | abtt8 cc-mm0.4; abtt8 cc-mm0.3 | +0.025 (+0.020…+0.030) | +0.031 (+0.027…+0.036) | +0.032 (+0.024…+0.039) | +0.003 / +0.074 / +0.052 / −0.023 / +0.008 / +0.037 / +0.024 | ms-zh +0.074, ms-en +0.052, M-ko +0.037, M-ja +0.024 | M-en −0.023 | −0.031 (−0.039…−0.024) |
| convex combination, min-max (α 0-1) | cc-mm0.4; cc-mm0.3 | +0.020 (+0.015…+0.025) | +0.026 (+0.022…+0.030) | +0.024 (+0.017…+0.032) | −0.000 / +0.055 / +0.054 / −0.024 / +0.001 / +0.037 / +0.015 | ms-zh +0.055, ms-en +0.054, M-ko +0.037, M-ja +0.015 | M-en −0.024 | −0.040 (−0.049…−0.032) |
| any fusion above | cc-mm0.4; cc-mm0.3 | +0.020 (+0.015…+0.025) | +0.026 (+0.022…+0.030) | +0.024 (+0.017…+0.032) | −0.000 / +0.055 / +0.054 / −0.024 / +0.001 / +0.037 / +0.015 | ms-zh +0.055, ms-en +0.054, M-ko +0.037, M-ja +0.015 | M-en −0.024 | −0.031 (−0.039…−0.024) |
| convex combination, z-score (α 0-1) | cc-z0.4; cc-z0.3 | +0.018 (+0.014…+0.023) | +0.026 (+0.022…+0.030) | +0.022 (+0.015…+0.028) | +0.003 / +0.047 / +0.052 / −0.026 / +0.000 / +0.039 / +0.010 | ms-zh +0.047, ms-en +0.052, M-ko +0.039, M-ja +0.010 | M-en −0.026 | −0.031 (−0.039…−0.024) |
| vector PRF + any fusion | prf-h10-0.85 cc-mm0.5; prf-h3-0.7 cc-mm0.5 | +0.014 (+0.010…+0.019) | +0.016 (+0.013…+0.019) | +0.017 (+0.011…+0.023) | +0.006 / +0.034 / +0.039 / +0.009 / −0.000 / +0.007 / +0.004 | ms-zh +0.034, ms-en +0.039 | — | −0.041 (−0.050…−0.033) |
| convex combination, theoretical-min (α 0-1) | cc-tmm0.2 | +0.014 (+0.009…+0.019) | +0.019 (+0.015…+0.024) | +0.016 (+0.009…+0.024) | −0.003 / +0.056 / +0.051 / −0.064 / −0.003 / +0.045 / +0.016 | ms-zh +0.056, ms-en +0.051, M-ko +0.045, M-ja +0.016 | M-en −0.064 | −0.087 (−0.097…−0.078) |
| RRF k (1-120) | rrf5; rrf10 | +0.012 (+0.008…+0.016) | +0.008 (+0.005…+0.010) | +0.015 (+0.009…+0.022) | +0.005 / +0.027 / +0.030 / −0.009 / +0.000 / +0.024 / +0.009 | ms-zh +0.027, ms-en +0.030, M-ko +0.024, M-ja +0.009 | — | +0.013 (+0.009…+0.017) |
| weighted RRF, k = 60 (w_vec 0.3-0.7) | wrrf0.3 | +0.012 (+0.007…+0.016) | +0.012 (+0.009…+0.015) | +0.016 (+0.009…+0.022) | −0.001 / +0.021 / +0.034 / −0.032 / +0.000 / +0.040 / +0.019 | ms-zh +0.021, ms-en +0.034, M-ko +0.040, M-ja +0.019 | M-en −0.032 | −0.042 (−0.050…−0.035) |
| whitening, k = 384/256/128 | whiten128 rrf60 | +0.010 (+0.006…+0.015) | +0.006 (+0.003…+0.010) | +0.010 (+0.004…+0.016) | +0.005 / +0.052 / −0.004 / −0.010 / +0.009 / +0.007 / +0.011 | ms-zh +0.052, M-ja +0.011 | — | +0.010 (+0.006…+0.015) |
| all-but-the-top, D = 1-8 | abtt8 rrf60 | +0.009 (+0.005…+0.013) | +0.008 (+0.005…+0.012) | +0.013 (+0.007…+0.019) | +0.005 / +0.032 / −0.012 / −0.003 / +0.012 / +0.014 / +0.016 | ms-zh +0.032, M-zh +0.012, M-ko +0.014, M-ja +0.016 | ms-en −0.012 | +0.003 (+0.000…+0.007) |
| vector PRF (Rocchio), RRF 60 | prf-h3-0.7 rrf60; prf-h3-0.85 rrf60 | +0.002 (−0.001…+0.004) | −0.000 (−0.002…+0.001) | −0.000 (−0.004…+0.003) | +0.002 / −0.001 / +0.011 / +0.006 / +0.000 / −0.005 / −0.000 | ms-en +0.011 | — | +0.000 (−0.002…+0.002) |
| part aggregation (top-2/3 mean, soft max) | rrf60 | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 / +0.000 / +0.000 / +0.000 / +0.000 / +0.000 / +0.000 | — | — | +0.000 (+0.000…+0.000) |
| MMR over fused top 50 (λ 0.5-0.95) | rrf60 | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 / +0.000 / +0.000 / +0.000 / +0.000 / +0.000 / +0.000 | — | — | +0.000 (+0.000…+0.000) |
| mean-centring | center rrf60 | −0.001 (−0.004…+0.002) | −0.002 (−0.005…−0.000) | −0.001 (−0.007…+0.004) | −0.002 / +0.004 / −0.008 / +0.000 / +0.001 / −0.003 / +0.002 | — | — | −0.001 (−0.004…+0.002) |
| vector only (drop keyword leg) | vec | −0.087 (−0.097…−0.078) | −0.083 (−0.090…−0.077) | −0.101 (−0.112…−0.090) | −0.009 / −0.155 / −0.123 / −0.072 / +0.000 / −0.213 / −0.036 | — | ms-zh −0.155, ms-en −0.123, M-en −0.072, M-ko −0.213, M-ja −0.036 | −0.087 (−0.097…−0.078) |

#### Vector leg alone, against vector only

| Technique | Setting chosen (fold A; fold B) | ΔR@5 macro (95%) | ΔnDCG@10 macro | Δhit@5 macro | ΔR@5 LME / ms-zh / ms-en / M-en / M-zh / M-ko / M-ja | Helps (R@5, 95% > 0) | Hurts (R@5, 95% < 0) | ΔR@5 macro, setting chosen on multilingual-e5-small |
|---|---|---|---|---|---|---|---|---|
| vector PRF from hybrid top k | prf-h3-0.5 vec | +0.039 (+0.035…+0.044) | +0.031 (+0.028…+0.034) | +0.041 (+0.035…+0.047) | +0.019 / +0.093 / +0.081 / +0.061 / +0.000 / +0.015 / +0.004 | LME +0.019, ms-zh +0.093, ms-en +0.081, M-en +0.061, M-ko +0.015 | — | +0.023 (+0.020…+0.027) |
| all-but-the-top, D = 1-8 | abtt8 vec | +0.012 (+0.007…+0.018) | +0.014 (+0.011…+0.018) | +0.016 (+0.010…+0.022) | −0.002 / +0.071 / −0.018 / −0.011 / +0.008 / +0.019 / +0.019 | ms-zh +0.071, M-ko +0.019, M-ja +0.019 | ms-en −0.018 | −0.001 (−0.005…+0.003) |
| whitening, k = 384/256/128 | whiten128 vec | +0.011 (+0.006…+0.017) | +0.011 (+0.008…+0.015) | +0.015 (+0.009…+0.021) | −0.017 / +0.082 / +0.002 / −0.021 / +0.006 / +0.014 / +0.013 | ms-zh +0.082, M-ja +0.013 | LME −0.017, M-en −0.021 | +0.011 (+0.006…+0.017) |
| part aggregation | vec | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 / +0.000 / +0.000 / +0.000 / +0.000 / +0.000 / +0.000 | — | — | +0.000 (+0.000…+0.000) |
| MMR over top 50 | vec | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 / +0.000 / +0.000 / +0.000 / +0.000 / +0.000 / +0.000 | — | — | +0.000 (−0.000…+0.001) |
| vector PRF from vector top k | prf-v5-0.7 vec; prf-v3-0.85 vec | −0.000 (−0.002…+0.002) | +0.001 (−0.001…+0.002) | −0.002 (−0.004…+0.001) | +0.003 / −0.005 / −0.004 / +0.001 / +0.000 / +0.002 / +0.000 | — | — | −0.001 (−0.002…+0.001) |
| mean-centring | center vec | −0.008 (−0.011…−0.005) | −0.006 (−0.008…−0.005) | −0.007 (−0.010…−0.004) | −0.018 / −0.025 / −0.014 / +0.005 / −0.001 / −0.002 / −0.001 | — | LME −0.018, ms-zh −0.025, ms-en −0.014 | −0.008 (−0.011…−0.005) |


### multilingual-e5-small, store mode (LME, ms-zh, ms-en, M-en, M-zh, M-ko, M-ja)

Baseline (current hybrid; vector only) per dataset, R@5 / nDCG@10: LME 0.389/0.365; 0.355/0.322 · ms-zh 0.592/0.523; 0.605/0.543 · ms-en 0.803/0.726; 0.700/0.620 · M-en 0.478/0.490; 0.478/0.493 · M-zh 0.475/0.483; 0.481/0.484 · M-ko 0.463/0.473; 0.611/0.620 · M-ja 0.586/0.557; 0.682/0.639

#### Against the current hybrid (RRF 60)

| Technique | Setting chosen (fold A; fold B) | ΔR@5 macro (95%) | ΔnDCG@10 macro | Δhit@5 macro | ΔR@5 LME / ms-zh / ms-en / M-en / M-zh / M-ko / M-ja | Helps (R@5, 95% > 0) | Hurts (R@5, 95% < 0) | ΔR@5 macro, setting chosen on minilm-l6 |
|---|---|---|---|---|---|---|---|---|
| convex combination, z-score (α 0-1) | cc-z0.6 | +0.056 (+0.048…+0.064) | +0.050 (+0.044…+0.056) | +0.055 (+0.045…+0.066) | +0.016 / +0.064 / +0.016 / +0.055 / +0.007 / +0.155 / +0.077 | ms-zh +0.064, ms-en +0.016, M-en +0.055, M-zh +0.007, M-ko +0.155, M-ja +0.077 | — | −0.004 (−0.010…+0.002) |
| any fusion above | cc-z0.6 | +0.056 (+0.048…+0.064) | +0.050 (+0.044…+0.056) | +0.055 (+0.045…+0.066) | +0.016 / +0.064 / +0.016 / +0.055 / +0.007 / +0.155 / +0.077 | ms-zh +0.064, ms-en +0.016, M-en +0.055, M-zh +0.007, M-ko +0.155, M-ja +0.077 | — | −0.015 (−0.022…−0.010) |
| space × aggregation × fusion, best of all | cc-z0.6 | +0.056 (+0.048…+0.064) | +0.050 (+0.044…+0.056) | +0.055 (+0.045…+0.066) | +0.016 / +0.064 / +0.016 / +0.055 / +0.007 / +0.155 / +0.077 | ms-zh +0.064, ms-en +0.016, M-en +0.055, M-zh +0.007, M-ko +0.155, M-ja +0.077 | — | −0.043 (−0.051…−0.035) |
| vector PRF + any fusion | prf-h5-0.85 cc-mm0.7 | +0.052 (+0.045…+0.061) | +0.050 (+0.044…+0.056) | +0.050 (+0.040…+0.060) | +0.014 / +0.051 / +0.001 / +0.052 / +0.004 / +0.165 / +0.079 | LME +0.014, ms-zh +0.051, M-en +0.052, M-ko +0.165, M-ja +0.079 | — | +0.020 (+0.015…+0.026) |
| convex combination, min-max (α 0-1) | cc-mm0.7 | +0.048 (+0.040…+0.057) | +0.046 (+0.040…+0.053) | +0.049 (+0.038…+0.060) | +0.006 / +0.051 / −0.017 / +0.049 / +0.006 / +0.158 / +0.085 | ms-zh +0.051, M-en +0.049, M-ko +0.158, M-ja +0.085 | ms-en −0.017 | −0.015 (−0.022…−0.010) |
| RRF k (1-120) | rrf5 | +0.038 (+0.030…+0.046) | +0.025 (+0.020…+0.030) | +0.039 (+0.029…+0.050) | +0.004 / +0.055 / +0.025 / +0.009 / −0.001 / +0.106 / +0.066 | ms-zh +0.055, ms-en +0.025, M-ko +0.106, M-ja +0.066 | — | +0.038 (+0.030…+0.046) |
| weighted RRF, k = 60 (w_vec 0.3-0.7) | wrrf0.7 | +0.024 (+0.018…+0.031) | +0.021 (+0.018…+0.025) | +0.025 (+0.016…+0.033) | +0.005 / +0.024 / −0.021 / +0.032 / +0.008 / +0.073 / +0.049 | ms-zh +0.024, M-en +0.032, M-zh +0.008, M-ko +0.073, M-ja +0.049 | ms-en −0.021 | −0.028 (−0.034…−0.023) |
| convex combination, theoretical-min (α 0-1) | vec | +0.018 (+0.008…+0.028) | +0.015 (+0.007…+0.023) | +0.021 (+0.009…+0.034) | −0.034 / +0.013 / −0.103 / +0.000 / +0.006 / +0.148 / +0.096 | M-ko +0.148, M-ja +0.096 | LME −0.034, ms-en −0.103 | −0.053 (−0.060…−0.045) |
| vector only (drop keyword leg) | vec | +0.018 (+0.008…+0.028) | +0.015 (+0.007…+0.023) | +0.021 (+0.009…+0.034) | −0.034 / +0.013 / −0.103 / +0.000 / +0.006 / +0.148 / +0.096 | M-ko +0.148, M-ja +0.096 | LME −0.034, ms-en −0.103 | +0.018 (+0.008…+0.028) |
| vector PRF (Rocchio), RRF 60 | prf-v3-0.85 rrf60; prf-v5-0.85 rrf60 | +0.003 (+0.000…+0.007) | +0.002 (−0.000…+0.004) | +0.001 (−0.003…+0.005) | +0.009 / −0.005 / +0.004 / +0.006 / +0.011 / −0.002 / +0.001 | M-zh +0.011 | — | +0.002 (−0.002…+0.007) |
| part aggregation (top-2/3 mean, soft max) | rrf60 | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 / +0.000 / +0.000 / +0.000 / +0.000 / +0.000 / +0.000 | — | — | +0.000 (+0.000…+0.000) |
| MMR over fused top 50 (λ 0.5-0.95) | rrf60 | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 / +0.000 / +0.000 / +0.000 / +0.000 / +0.000 / +0.000 | — | — | −0.001 (−0.001…−0.000) |
| mean-centring | center rrf60 | −0.010 (−0.015…−0.004) | −0.013 (−0.017…−0.010) | −0.010 (−0.017…−0.003) | −0.011 / +0.013 / −0.005 / +0.000 / −0.017 / −0.018 / −0.031 | — | M-ko −0.018, M-ja −0.031 | −0.010 (−0.015…−0.004) |
| all-but-the-top, D = 1-8 | abtt1 rrf60 | −0.019 (−0.025…−0.012) | −0.021 (−0.025…−0.017) | −0.016 (−0.024…−0.009) | −0.009 / +0.021 / −0.009 / −0.015 / −0.039 / −0.015 / −0.065 | ms-zh +0.021 | M-en −0.015, M-zh −0.039, M-ko −0.015, M-ja −0.065 | −0.034 (−0.041…−0.027) |
| whitening, k = 384/256/128 | whiten128 rrf60 | −0.038 (−0.046…−0.030) | −0.040 (−0.046…−0.035) | −0.038 (−0.047…−0.029) | −0.022 / +0.033 / −0.028 / −0.035 / −0.073 / −0.028 / −0.111 | ms-zh +0.033 | ms-en −0.028, M-en −0.035, M-zh −0.073, M-ko −0.028, M-ja −0.111 | −0.038 (−0.046…−0.030) |

#### Vector leg alone, against vector only

| Technique | Setting chosen (fold A; fold B) | ΔR@5 macro (95%) | ΔnDCG@10 macro | Δhit@5 macro | ΔR@5 LME / ms-zh / ms-en / M-en / M-zh / M-ko / M-ja | Helps (R@5, 95% > 0) | Hurts (R@5, 95% < 0) | ΔR@5 macro, setting chosen on minilm-l6 |
|---|---|---|---|---|---|---|---|---|
| vector PRF from hybrid top k | prf-h5-0.7 vec | +0.023 (+0.017…+0.029) | +0.020 (+0.015…+0.024) | +0.019 (+0.012…+0.027) | +0.030 / +0.024 / +0.062 / +0.044 / −0.001 / +0.009 / −0.008 | LME +0.030, ms-zh +0.024, ms-en +0.062, M-en +0.044 | M-ja −0.008 | +0.010 (+0.002…+0.018) |
| vector PRF from vector top k | prf-v3-0.85 vec | +0.003 (−0.002…+0.007) | +0.004 (+0.001…+0.006) | −0.001 (−0.006…+0.004) | −0.004 / +0.005 / +0.003 / +0.004 / +0.019 / −0.004 / −0.004 | M-zh +0.019 | — | +0.003 (−0.002…+0.007) |
| part aggregation | vec | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 / +0.000 / +0.000 / +0.000 / +0.000 / +0.000 / +0.000 | — | — | +0.000 (+0.000…+0.000) |
| MMR over top 50 | vec; vec mmr0.95 | −0.000 (−0.001…+0.000) | −0.000 (−0.000…+0.000) | −0.000 (−0.001…+0.000) | −0.001 / +0.000 / −0.000 / +0.000 / +0.000 / +0.000 / −0.000 | — | — | −0.001 (−0.001…−0.000) |
| mean-centring | center vec | −0.022 (−0.030…−0.016) | −0.025 (−0.029…−0.021) | −0.024 (−0.032…−0.015) | −0.039 / −0.012 / −0.040 / +0.007 / −0.020 / −0.024 / −0.029 | — | LME −0.039, ms-en −0.040, M-ja −0.029 | −0.022 (−0.030…−0.016) |
| all-but-the-top, D = 1-8 | abtt1 vec; abtt2 vec | −0.034 (−0.042…−0.026) | −0.033 (−0.038…−0.028) | −0.034 (−0.043…−0.024) | −0.012 / +0.006 / −0.046 / −0.012 / −0.057 / −0.043 / −0.071 | — | ms-en −0.046, M-zh −0.057, M-ko −0.043, M-ja −0.071 | −0.046 (−0.055…−0.038) |
| whitening, k = 384/256/128 | whiten128 vec | −0.074 (−0.084…−0.064) | −0.067 (−0.074…−0.062) | −0.078 (−0.090…−0.066) | −0.071 / −0.009 / −0.080 / −0.086 / −0.077 / −0.068 / −0.125 | — | LME −0.071, ms-en −0.080, M-en −0.086, M-zh −0.077, M-ko −0.068, M-ja −0.125 | −0.073 (−0.082…−0.064) |


### multilingual-e5-small, scoped mode (LME, ms-zh, ms-en, M-en, M-zh, M-ko, M-ja)

Baseline (current hybrid; vector only) per dataset, R@5 / nDCG@10: LME 0.953/0.949; 0.948/0.935 · ms-zh 0.673/0.597; 0.673/0.606 · ms-en 0.850/0.768; 0.767/0.679 · M-en 0.478/0.490; 0.478/0.493 · M-zh 0.475/0.483; 0.481/0.484 · M-ko 0.463/0.473; 0.611/0.620 · M-ja 0.586/0.557; 0.682/0.639

#### Against the current hybrid (RRF 60)

| Technique | Setting chosen (fold A; fold B) | ΔR@5 macro (95%) | ΔnDCG@10 macro | Δhit@5 macro | ΔR@5 LME / ms-zh / ms-en / M-en / M-zh / M-ko / M-ja | Helps (R@5, 95% > 0) | Hurts (R@5, 95% < 0) | ΔR@5 macro, setting chosen on minilm-l6 |
|---|---|---|---|---|---|---|---|---|
| convex combination, z-score (α 0-1) | cc-z0.7 | +0.049 (+0.041…+0.058) | +0.048 (+0.042…+0.054) | +0.048 (+0.038…+0.058) | +0.010 / +0.039 / −0.009 / +0.052 / +0.007 / +0.155 / +0.090 | LME +0.010, ms-zh +0.039, M-en +0.052, M-zh +0.007, M-ko +0.155, M-ja +0.090 | ms-en −0.009 | −0.006 (−0.012…−0.000) |
| any fusion above | cc-z0.7 | +0.049 (+0.041…+0.058) | +0.048 (+0.042…+0.054) | +0.048 (+0.038…+0.058) | +0.010 / +0.039 / −0.009 / +0.052 / +0.007 / +0.155 / +0.090 | LME +0.010, ms-zh +0.039, M-en +0.052, M-zh +0.007, M-ko +0.155, M-ja +0.090 | ms-en −0.009 | −0.016 (−0.022…−0.010) |
| space × aggregation × fusion, best of all | cc-z0.7 | +0.049 (+0.041…+0.058) | +0.048 (+0.042…+0.054) | +0.048 (+0.038…+0.058) | +0.010 / +0.039 / −0.009 / +0.052 / +0.007 / +0.155 / +0.090 | LME +0.010, ms-zh +0.039, M-en +0.052, M-zh +0.007, M-ko +0.155, M-ja +0.090 | ms-en −0.009 | −0.042 (−0.050…−0.035) |
| vector PRF + any fusion | prf-h10-0.85 cc-mm0.7; prf-v5-0.85 cc-mm0.7 | +0.049 (+0.040…+0.057) | +0.046 (+0.040…+0.053) | +0.046 (+0.036…+0.056) | +0.008 / +0.033 / −0.010 / +0.049 / +0.010 / +0.166 / +0.084 | LME +0.008, ms-zh +0.033, M-en +0.049, M-zh +0.010, M-ko +0.166, M-ja +0.084 | ms-en −0.010 | +0.023 (+0.017…+0.030) |
| convex combination, min-max (α 0-1) | cc-mm0.7 | +0.047 (+0.038…+0.055) | +0.047 (+0.041…+0.053) | +0.046 (+0.036…+0.057) | +0.006 / +0.037 / −0.015 / +0.049 / +0.006 / +0.158 / +0.085 | LME +0.006, ms-zh +0.037, M-en +0.049, M-ko +0.158, M-ja +0.085 | ms-en −0.015 | −0.016 (−0.022…−0.010) |
| RRF k (1-120) | rrf5 | +0.034 (+0.026…+0.042) | +0.023 (+0.018…+0.028) | +0.036 (+0.027…+0.046) | +0.004 / +0.039 / +0.011 / +0.009 / −0.001 / +0.106 / +0.066 | ms-zh +0.039, ms-en +0.011, M-ko +0.106, M-ja +0.066 | — | +0.030 (+0.023…+0.038) |
| convex combination, theoretical-min (α 0-1) | vec | +0.023 (+0.014…+0.033) | +0.020 (+0.013…+0.028) | +0.026 (+0.014…+0.037) | −0.005 / +0.000 / −0.083 / +0.000 / +0.006 / +0.148 / +0.096 | M-ko +0.148, M-ja +0.096 | ms-en −0.083 | −0.056 (−0.064…−0.050) |
| vector only (drop keyword leg) | vec | +0.023 (+0.014…+0.033) | +0.020 (+0.013…+0.028) | +0.026 (+0.014…+0.037) | −0.005 / +0.000 / −0.083 / +0.000 / +0.006 / +0.148 / +0.096 | M-ko +0.148, M-ja +0.096 | ms-en −0.083 | +0.023 (+0.014…+0.033) |
| weighted RRF, k = 60 (w_vec 0.3-0.7) | wrrf0.7 | +0.023 (+0.017…+0.029) | +0.022 (+0.019…+0.025) | +0.022 (+0.014…+0.030) | +0.008 / +0.018 / −0.027 / +0.032 / +0.008 / +0.073 / +0.049 | LME +0.008, ms-zh +0.018, M-en +0.032, M-zh +0.008, M-ko +0.073, M-ja +0.049 | ms-en −0.027 | −0.029 (−0.034…−0.024) |
| vector PRF (Rocchio), RRF 60 | prf-v3-0.85 rrf60; prf-v5-0.85 rrf60 | +0.002 (−0.001…+0.005) | +0.001 (−0.001…+0.003) | −0.000 (−0.004…+0.003) | +0.004 / −0.005 / +0.002 / +0.006 / +0.011 / −0.002 / +0.001 | M-zh +0.011 | — | +0.002 (−0.003…+0.006) |
| part aggregation (top-2/3 mean, soft max) | rrf60 | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 / +0.000 / +0.000 / +0.000 / +0.000 / +0.000 / +0.000 | — | — | +0.000 (+0.000…+0.000) |
| MMR over fused top 50 (λ 0.5-0.95) | rrf60 | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 / +0.000 / +0.000 / +0.000 / +0.000 / +0.000 / +0.000 | — | — | +0.000 (+0.000…+0.000) |
| mean-centring | center rrf60 | −0.008 (−0.013…−0.003) | −0.012 (−0.015…−0.008) | −0.007 (−0.013…−0.001) | −0.005 / +0.025 / −0.009 / +0.000 / −0.017 / −0.018 / −0.031 | ms-zh +0.025 | M-ko −0.018, M-ja −0.031 | −0.008 (−0.013…−0.003) |
| all-but-the-top, D = 1-8 | abtt1 rrf60 | −0.019 (−0.025…−0.013) | −0.020 (−0.023…−0.016) | −0.015 (−0.022…−0.009) | −0.009 / +0.026 / −0.017 / −0.015 / −0.039 / −0.015 / −0.065 | ms-zh +0.026 | LME −0.009, ms-en −0.017, M-en −0.015, M-zh −0.039, M-ko −0.015, M-ja −0.065 | −0.031 (−0.037…−0.025) |
| whitening, k = 384/256/128 | whiten128 rrf60 | −0.033 (−0.040…−0.026) | −0.037 (−0.042…−0.032) | −0.033 (−0.042…−0.025) | +0.007 / +0.034 / −0.023 / −0.035 / −0.073 / −0.028 / −0.111 | ms-zh +0.034 | ms-en −0.023, M-en −0.035, M-zh −0.073, M-ko −0.028, M-ja −0.111 | −0.033 (−0.040…−0.026) |

#### Vector leg alone, against vector only

| Technique | Setting chosen (fold A; fold B) | ΔR@5 macro (95%) | ΔnDCG@10 macro | Δhit@5 macro | ΔR@5 LME / ms-zh / ms-en / M-en / M-zh / M-ko / M-ja | Helps (R@5, 95% > 0) | Hurts (R@5, 95% < 0) | ΔR@5 macro, setting chosen on minilm-l6 |
|---|---|---|---|---|---|---|---|---|
| vector PRF from hybrid top k | prf-h3-0.7 vec; prf-h3-0.85 vec | +0.018 (+0.013…+0.023) | +0.014 (+0.010…+0.017) | +0.013 (+0.007…+0.019) | +0.014 / +0.023 / +0.048 / +0.028 / +0.018 / +0.006 / −0.011 | LME +0.014, ms-zh +0.023, ms-en +0.048, M-en +0.028, M-zh +0.018 | M-ja −0.011 | +0.006 (−0.002…+0.014) |
| vector PRF from vector top k | prf-v3-0.85 vec; prf-v5-0.85 vec | +0.003 (−0.000…+0.005) | +0.002 (−0.000…+0.005) | +0.002 (−0.001…+0.005) | +0.002 / +0.004 / +0.005 / +0.002 / +0.008 / −0.006 / +0.003 | — | — | +0.003 (−0.001…+0.006) |
| part aggregation | vec | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 / +0.000 / +0.000 / +0.000 / +0.000 / +0.000 / +0.000 | — | — | +0.000 (+0.000…+0.000) |
| MMR over top 50 | vec; vec mmr0.95 | −0.000 (−0.000…+0.000) | −0.000 (−0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 / −0.000 / +0.000 / +0.000 / +0.000 / +0.000 / −0.000 | — | — | +0.000 (+0.000…+0.000) |
| mean-centring | center vec | −0.017 (−0.025…−0.011) | −0.021 (−0.026…−0.017) | −0.015 (−0.022…−0.007) | −0.024 / +0.006 / −0.037 / +0.007 / −0.020 / −0.024 / −0.029 | — | LME −0.024, ms-en −0.037, M-ja −0.029 | −0.017 (−0.025…−0.011) |
| all-but-the-top, D = 1-8 | abtt1 vec; abtt2 vec | −0.031 (−0.038…−0.023) | −0.031 (−0.036…−0.026) | −0.028 (−0.036…−0.019) | −0.010 / +0.020 / −0.041 / −0.012 / −0.057 / −0.043 / −0.071 | ms-zh +0.020 | ms-en −0.041, M-zh −0.057, M-ko −0.043, M-ja −0.071 | −0.045 (−0.054…−0.037) |
| whitening, k = 384/256/128 | whiten128 vec | −0.061 (−0.071…−0.052) | −0.060 (−0.066…−0.054) | −0.061 (−0.071…−0.050) | −0.024 / +0.007 / −0.055 / −0.086 / −0.077 / −0.068 / −0.125 | — | LME −0.024, ms-en −0.055, M-en −0.086, M-zh −0.077, M-ko −0.068, M-ja −0.125 | −0.061 (−0.071…−0.052) |
