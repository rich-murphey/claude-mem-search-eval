# longmemeval-s: server keyword ranking, ts_rank and bm25 (scoped)

LongMemEval-S cleaned (xiaowu0162/longmemeval-cleaned @ 98d7416c, MIT). 100 queries from manifests/lme-s-100-v1.txt; each query is its own claude-mem project holding its own haystack; a document is one observation; top 10; no vectors. Runs and the bm25 formula are described at the top of src/keyword-rank.ts.

LongMemEval answers whether a model change costs English memory search accuracy.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| ts_rank | 0.284 (0.252–0.318) | 0.774 (0.709–0.835) | 0.396 (0.360–0.433) | 0.854 (0.795–0.908) | 0.702 (0.634–0.768) | 0.854 (0.793–0.912) | 0.797 (0.740–0.851) |
| bm25 | 0.312 (0.278–0.346) | 0.852 (0.799–0.901) | 0.435 (0.399–0.471) | 0.883 (0.836–0.926) | 0.766 (0.703–0.823) | 0.945 (0.904–0.980) | 0.861 (0.817–0.901) |
| ts_rank, any term | 0.324 (0.290–0.362) | 0.852 (0.792–0.905) | 0.447 (0.410–0.485) | 0.934 (0.886–0.972) | 0.765 (0.700–0.829) | 0.859 (0.800–0.917) | 0.857 (0.805–0.905) |
| bm25, any term | 0.352 (0.316–0.388) | 0.929 (0.888–0.964) | 0.486 (0.450–0.521) | 0.964 (0.935–0.987) | 0.839 (0.783–0.888) | 0.950 (0.914–0.981) | 0.923 (0.889–0.952) |
| pg_textsearch | 0.358 (0.322–0.396) | 0.943 (0.908–0.972) | 0.494 (0.459–0.529) | 0.958 (0.923–0.983) | 0.873 (0.822–0.919) | 0.960 (0.922–0.988) | 0.934 (0.899–0.962) |

## R@5 / F1@5 by query type

| Run | knowledge-update (15) | multi-session (26) | single-session-assistant (12) | single-session-preference (6) | single-session-user (14) | temporal-reasoning (27) |
|---|---|---|---|---|---|---|
| ts_rank | 0.800 / 0.457 | 0.687 / 0.456 | 0.917 / 0.306 | 0.500 / 0.167 | 0.929 / 0.310 | 0.763 / 0.442 |
| bm25 | 0.833 / 0.476 | 0.799 / 0.533 | 1.000 / 0.333 | 1.000 / 0.333 | 0.929 / 0.310 | 0.775 / 0.451 |
| ts_rank, any term | 0.933 / 0.533 | 0.792 / 0.542 | 0.917 / 0.306 | 0.500 / 0.167 | 0.929 / 0.310 | 0.874 / 0.505 |
| bm25, any term | 0.967 / 0.552 | 0.904 / 0.620 | 1.000 / 0.333 | 1.000 / 0.333 | 0.929 / 0.310 | 0.886 / 0.514 |
| pg_textsearch | 0.967 / 0.552 | 0.893 / 0.616 | 1.000 / 0.333 | 1.000 / 0.333 | 1.000 / 0.333 | 0.912 / 0.532 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| bm25 − ts_rank | +0.028 (0.012–0.044) | +0.077 (0.033–0.126) | +0.039 (0.018–0.062) | +0.028 (-0.002–0.067) | +0.064 (0.016–0.114) | +0.091 (0.046–0.139) | +0.063 (0.031–0.098) |
| ts_rank, any term − ts_rank | +0.040 (0.022–0.064) | +0.077 (0.044–0.115) | +0.051 (0.029–0.078) | +0.080 (0.046–0.119) | +0.063 (0.031–0.098) | +0.005 (0.000–0.015) | +0.060 (0.034–0.089) |
| bm25, any term − ts_rank | +0.068 (0.044–0.094) | +0.155 (0.099–0.211) | +0.090 (0.060–0.122) | +0.110 (0.061–0.164) | +0.137 (0.081–0.195) | +0.096 (0.050–0.144) | +0.126 (0.084–0.169) |
| pg_textsearch − ts_rank | +0.074 (0.050–0.102) | +0.169 (0.114–0.228) | +0.097 (0.066–0.130) | +0.103 (0.054–0.157) | +0.171 (0.118–0.225) | +0.106 (0.060–0.155) | +0.137 (0.096–0.180) |
| bm25, any term − ts_rank, any term | +0.028 (0.012–0.044) | +0.077 (0.033–0.126) | +0.039 (0.018–0.062) | +0.030 (0.000–0.068) | +0.074 (0.026–0.127) | +0.091 (0.046–0.139) | +0.066 (0.034–0.101) |

## Timing

- load and index 28s
- ts_rank: 100 searches 0.5s
- bm25: 100 searches 3.1s
- ts_rank, any term: 100 searches 0.2s
- bm25, any term: 100 searches 6.3s
- pg_textsearch: 100 searches 0.3s
