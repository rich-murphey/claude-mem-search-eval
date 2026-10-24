# longmemeval-s, vector only (exact, and minilm-l6-store, bge-small-en-q-store)

LongMemEval-S cleaned (xiaowu0162/longmemeval-cleaned @ 98d7416c, MIT). 470 queries; each searches its own haystack; a document scores as its best part; 95% intervals from 2000 bootstrap resamples over queries. The chroma-mem rows search every document of the dataset in one Chroma collection, with no filter (store mode), asking for 200 parts; minilm-l6 is the exact scoped run. minilm-l6-store is the release minilm-l6 vectors; bge-small-en-q-store embeds every row and query in chroma-mem.

LongMemEval answers whether a model change costs English memory search accuracy.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| minilm-l6 | 0.346 (0.331–0.362) | 0.934 (0.917–0.951) | 0.484 (0.469–0.500) | 0.970 (0.958–0.981) | 0.808 (0.778–0.838) | 0.912 (0.892–0.933) | 0.908 (0.890–0.925) |
| minilm-l6-store | 0.083 (0.073–0.093) | 0.280 (0.245–0.315) | 0.124 (0.109–0.139) | 0.363 (0.325–0.400) | 0.148 (0.120–0.176) | 0.264 (0.230–0.298) | 0.259 (0.229–0.290) |
| bge-small-en-q-store | 0.101 (0.090–0.113) | 0.327 (0.290–0.364) | 0.150 (0.133–0.168) | 0.410 (0.370–0.449) | 0.173 (0.143–0.202) | 0.301 (0.267–0.337) | 0.297 (0.265–0.328) |

## R@5 / F1@5 by query type

| Run | knowledge-update (72) | multi-session (121) | single-session-assistant (56) | single-session-preference (30) | single-session-user (64) | temporal-reasoning (127) |
|---|---|---|---|---|---|---|
| minilm-l6 | 0.979 / 0.560 | 0.907 / 0.601 | 1.000 / 0.333 | 0.967 / 0.322 | 0.969 / 0.323 | 0.881 / 0.516 |
| minilm-l6-store | 0.354 / 0.202 | 0.151 / 0.092 | 0.982 / 0.327 | 0.167 / 0.056 | 0.219 / 0.073 | 0.109 / 0.061 |
| bge-small-en-q-store | 0.396 / 0.226 | 0.230 / 0.139 | 0.946 / 0.315 | 0.133 / 0.044 | 0.281 / 0.094 | 0.176 / 0.099 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| minilm-l6-store − minilm-l6 | -0.263 (-0.282–-0.247) | -0.654 (-0.690–-0.619) | -0.360 (-0.382–-0.339) | -0.607 (-0.644–-0.570) | -0.661 (-0.696–-0.623) | -0.648 (-0.683–-0.614) | -0.649 (-0.678–-0.620) |
| bge-small-en-q-store − minilm-l6 | -0.245 (-0.263–-0.227) | -0.607 (-0.643–-0.571) | -0.334 (-0.356–-0.312) | -0.560 (-0.598–-0.520) | -0.636 (-0.672–-0.601) | -0.611 (-0.647–-0.578) | -0.612 (-0.640–-0.583) |
| bge-small-en-q-store − minilm-l6-store | +0.019 (0.010–0.028) | +0.047 (0.021–0.072) | +0.026 (0.014–0.039) | +0.047 (0.021–0.074) | +0.025 (0.004–0.046) | +0.037 (0.013–0.061) | +0.037 (0.019–0.055) |
