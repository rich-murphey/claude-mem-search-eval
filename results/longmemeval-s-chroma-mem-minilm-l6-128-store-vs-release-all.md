# longmemeval-s, vector only (exact, and minilm-l6-store, minilm-l6-128-store)

LongMemEval-S cleaned (xiaowu0162/longmemeval-cleaned @ 98d7416c, MIT). 470 queries; each searches its own haystack; a document scores as its best part; 95% intervals from 2000 bootstrap resamples over queries. The chroma-mem rows search every document of the dataset in one Chroma collection, with no filter (store mode), asking for 200 parts; minilm-l6 is the exact scoped run. minilm-l6-store is the release minilm-l6 vectors; minilm-l6-128-store embeds every row and query in chroma-mem.

LongMemEval answers whether a model change costs English memory search accuracy.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| minilm-l6 | 0.346 (0.331–0.362) | 0.934 (0.917–0.951) | 0.484 (0.469–0.500) | 0.970 (0.958–0.981) | 0.808 (0.778–0.838) | 0.912 (0.892–0.933) | 0.908 (0.890–0.925) |
| minilm-l6-store | 0.083 (0.073–0.093) | 0.280 (0.245–0.315) | 0.124 (0.109–0.139) | 0.363 (0.325–0.400) | 0.148 (0.120–0.176) | 0.264 (0.230–0.298) | 0.259 (0.229–0.290) |
| minilm-l6-128-store | 0.085 (0.074–0.095) | 0.285 (0.250–0.320) | 0.127 (0.112–0.142) | 0.364 (0.326–0.401) | 0.155 (0.127–0.185) | 0.270 (0.235–0.305) | 0.263 (0.232–0.293) |

## R@5 / F1@5 by query type

| Run | knowledge-update (72) | multi-session (121) | single-session-assistant (56) | single-session-preference (30) | single-session-user (64) | temporal-reasoning (127) |
|---|---|---|---|---|---|---|
| minilm-l6 | 0.979 / 0.560 | 0.907 / 0.601 | 1.000 / 0.333 | 0.967 / 0.322 | 0.969 / 0.323 | 0.881 / 0.516 |
| minilm-l6-store | 0.354 / 0.202 | 0.151 / 0.092 | 0.982 / 0.327 | 0.167 / 0.056 | 0.219 / 0.073 | 0.109 / 0.061 |
| minilm-l6-128-store | 0.382 / 0.218 | 0.152 / 0.092 | 0.982 / 0.327 | 0.100 / 0.033 | 0.250 / 0.083 | 0.112 / 0.063 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| minilm-l6-store − minilm-l6 | -0.263 (-0.282–-0.247) | -0.654 (-0.690–-0.619) | -0.360 (-0.382–-0.339) | -0.607 (-0.644–-0.570) | -0.661 (-0.696–-0.623) | -0.648 (-0.683–-0.614) | -0.649 (-0.678–-0.620) |
| minilm-l6-128-store − minilm-l6 | -0.261 (-0.280–-0.244) | -0.649 (-0.685–-0.614) | -0.357 (-0.379–-0.337) | -0.606 (-0.643–-0.569) | -0.653 (-0.687–-0.618) | -0.643 (-0.679–-0.610) | -0.645 (-0.675–-0.617) |
| minilm-l6-128-store − minilm-l6-store | +0.002 (-0.003–0.008) | +0.005 (-0.013–0.024) | +0.003 (-0.005–0.012) | +0.001 (-0.018–0.020) | +0.008 (-0.009–0.024) | +0.006 (-0.010–0.022) | +0.003 (-0.009–0.016) |
