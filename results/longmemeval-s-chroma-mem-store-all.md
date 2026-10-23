# longmemeval-s, vector only (exact, and chroma-mem-store, chroma-mem-store-n1000)

LongMemEval-S cleaned (xiaowu0162/longmemeval-cleaned @ 98d7416c, MIT). 470 queries; each searches its own haystack; a document scores as its best part; 95% intervals from 2000 bootstrap resamples over queries. The chroma-mem rows search every document of the dataset in one Chroma collection, with no filter (store mode), asking for 200 parts (n1000: 1,000); minilm-l6 is the exact scoped run.

LongMemEval answers whether a model change costs English memory search accuracy.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| minilm-l6 | 0.346 (0.331–0.362) | 0.934 (0.917–0.951) | 0.484 (0.469–0.500) | 0.970 (0.958–0.981) | 0.808 (0.778–0.838) | 0.912 (0.892–0.933) | 0.908 (0.890–0.925) |
| chroma-mem-store | 0.082 (0.072–0.092) | 0.278 (0.243–0.313) | 0.123 (0.108–0.137) | 0.361 (0.322–0.398) | 0.148 (0.120–0.176) | 0.263 (0.229–0.297) | 0.258 (0.228–0.288) |
| chroma-mem-store-n1000 | 0.084 (0.074–0.094) | 0.284 (0.249–0.320) | 0.126 (0.111–0.141) | 0.367 (0.328–0.404) | 0.149 (0.121–0.177) | 0.267 (0.233–0.301) | 0.262 (0.233–0.292) |

## R@5 / F1@5 by query type

| Run | knowledge-update (72) | multi-session (121) | single-session-assistant (56) | single-session-preference (30) | single-session-user (64) | temporal-reasoning (127) |
|---|---|---|---|---|---|---|
| minilm-l6 | 0.979 / 0.560 | 0.907 / 0.601 | 1.000 / 0.333 | 0.967 / 0.322 | 0.969 / 0.323 | 0.881 / 0.516 |
| chroma-mem-store | 0.347 / 0.198 | 0.147 / 0.090 | 0.982 / 0.327 | 0.167 / 0.056 | 0.219 / 0.073 | 0.109 / 0.061 |
| chroma-mem-store-n1000 | 0.368 / 0.210 | 0.151 / 0.092 | 0.982 / 0.327 | 0.167 / 0.056 | 0.219 / 0.073 | 0.117 / 0.064 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| chroma-mem-store − minilm-l6 | -0.264 (-0.282–-0.247) | -0.656 (-0.692–-0.620) | -0.362 (-0.383–-0.341) | -0.609 (-0.646–-0.572) | -0.661 (-0.696–-0.623) | -0.649 (-0.684–-0.614) | -0.650 (-0.679–-0.621) |
| chroma-mem-store-n1000 − minilm-l6 | -0.262 (-0.280–-0.245) | -0.650 (-0.685–-0.615) | -0.358 (-0.380–-0.337) | -0.603 (-0.640–-0.566) | -0.660 (-0.695–-0.622) | -0.646 (-0.679–-0.610) | -0.646 (-0.676–-0.618) |
| chroma-mem-store-n1000 − chroma-mem-store | +0.002 (0.000–0.004) | +0.006 (0.001–0.013) | +0.003 (0.001–0.006) | +0.006 (0.000–0.012) | +0.001 (0.000–0.003) | +0.004 (-0.000–0.009) | +0.004 (0.000–0.009) |
