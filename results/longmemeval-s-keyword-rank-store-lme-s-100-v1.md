# longmemeval-s: server keyword ranking, ts_rank and bm25 (store)

LongMemEval-S cleaned (xiaowu0162/longmemeval-cleaned @ 98d7416c, MIT). 100 queries from manifests/lme-s-100-v1.txt; every document in one claude-mem project, searched by every query; a document is one observation; top 10; no vectors. Runs and the bm25 formula are described at the top of src/keyword-rank.ts.

LongMemEval answers whether a model change costs English memory search accuracy.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| ts_rank | 0.108 (0.084–0.132) | 0.369 (0.284–0.453) | 0.162 (0.126–0.199) | 0.437 (0.354–0.522) | 0.299 (0.220–0.377) | 0.394 (0.310–0.480) | 0.367 (0.292–0.443) |
| bm25 | 0.132 (0.108–0.156) | 0.438 (0.357–0.522) | 0.197 (0.161–0.233) | 0.474 (0.387–0.557) | 0.290 (0.212–0.366) | 0.418 (0.334–0.500) | 0.394 (0.320–0.469) |
| ts_rank, any term | 0.132 (0.106–0.158) | 0.429 (0.345–0.515) | 0.196 (0.159–0.234) | 0.524 (0.438–0.613) | 0.294 (0.221–0.373) | 0.387 (0.312–0.470) | 0.396 (0.325–0.473) |
| bm25, any term | 0.160 (0.132–0.190) | 0.495 (0.410–0.583) | 0.234 (0.194–0.276) | 0.613 (0.523–0.698) | 0.318 (0.240–0.396) | 0.455 (0.373–0.541) | 0.468 (0.392–0.542) |
| pg_textsearch | 0.160 (0.132–0.190) | 0.495 (0.410–0.583) | 0.234 (0.194–0.276) | 0.614 (0.526–0.700) | 0.313 (0.235–0.396) | 0.448 (0.366–0.533) | 0.465 (0.389–0.540) |

**Note.** pg_textsearch reaches the same F1@5 as bm25 computed in SQL over the same any-term matches (0.234 both) at about 2,600 times lower latency: 2 ms a query against 5.2 s. The SQL version counts term frequencies across the whole project on every query; pg_textsearch reads them from its index.

## R@5 / F1@5 by query type

| Run | knowledge-update (15) | multi-session (26) | single-session-assistant (12) | single-session-preference (6) | single-session-user (14) | temporal-reasoning (27) |
|---|---|---|---|---|---|---|
| ts_rank | 0.533 / 0.305 | 0.181 / 0.107 | 0.750 / 0.250 | 0.167 / 0.056 | 0.643 / 0.214 | 0.191 / 0.095 |
| bm25 | 0.500 / 0.286 | 0.210 / 0.126 | 0.917 / 0.306 | 0.167 / 0.056 | 0.643 / 0.214 | 0.364 / 0.189 |
| ts_rank, any term | 0.700 / 0.400 | 0.246 / 0.147 | 0.750 / 0.250 | 0.167 / 0.056 | 0.714 / 0.238 | 0.222 / 0.115 |
| bm25, any term | 0.733 / 0.419 | 0.302 / 0.185 | 0.917 / 0.306 | 0.167 / 0.056 | 0.571 / 0.190 | 0.395 / 0.209 |
| pg_textsearch | 0.733 / 0.419 | 0.302 / 0.185 | 0.917 / 0.306 | 0.167 / 0.056 | 0.571 / 0.190 | 0.395 / 0.209 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| bm25 − ts_rank | +0.024 (0.010–0.040) | +0.069 (0.025–0.117) | +0.034 (0.014–0.058) | +0.037 (0.000–0.080) | -0.008 (-0.075–0.057) | +0.023 (-0.027–0.071) | +0.027 (-0.014–0.068) |
| ts_rank, any term − ts_rank | +0.024 (0.008–0.042) | +0.060 (0.019–0.108) | +0.034 (0.011–0.060) | +0.087 (0.048–0.132) | -0.005 (-0.045–0.034) | -0.007 (-0.044–0.026) | +0.029 (-0.003–0.063) |
| bm25, any term − ts_rank | +0.052 (0.028–0.076) | +0.127 (0.064–0.196) | +0.072 (0.038–0.107) | +0.176 (0.111–0.245) | +0.019 (-0.056–0.094) | +0.061 (-0.007–0.133) | +0.100 (0.045–0.160) |
| pg_textsearch − ts_rank | +0.052 (0.028–0.076) | +0.127 (0.064–0.196) | +0.072 (0.038–0.107) | +0.177 (0.112–0.247) | +0.014 (-0.063–0.091) | +0.054 (-0.015–0.126) | +0.098 (0.041–0.159) |
| bm25, any term − ts_rank, any term | +0.028 (0.010–0.046) | +0.066 (0.012–0.123) | +0.038 (0.013–0.065) | +0.088 (0.035–0.143) | +0.024 (-0.041–0.089) | +0.068 (0.014–0.125) | +0.072 (0.029–0.115) |

## Timing

- load and index 28s
- ts_rank: 100 searches 2.7s
- bm25: 100 searches 92.3s
- ts_rank, any term: 100 searches 4.0s
- bm25, any term: 100 searches 517.5s
- pg_textsearch: 100 searches 0.2s
