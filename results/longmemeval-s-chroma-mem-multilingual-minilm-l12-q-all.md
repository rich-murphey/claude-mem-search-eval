# longmemeval-s, vector only (exact, and minilm-l6-split, multilingual-minilm-l12-q)

LongMemEval-S cleaned (xiaowu0162/longmemeval-cleaned @ 98d7416c, MIT). 470 queries; each searches its own haystack; a document scores as its best part; 95% intervals from 2000 bootstrap resamples over queries. The chroma-mem rows search Chroma 1.4.4 through chroma-mem's bench, each query filtered to its scope by a where, asking for 200 parts and keeping each document's best. minilm-l6-split is the release minilm-l6 vectors with rows over 254 word pieces replaced by chroma-mem's pieces of them; multilingual-minilm-l12-q embeds every row and query in chroma-mem (bench load --embed, bench query --embed), split at its piece budget.

LongMemEval answers whether a model change costs English memory search accuracy.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| minilm-l6 | 0.346 (0.331–0.362) | 0.934 (0.917–0.951) | 0.484 (0.469–0.500) | 0.970 (0.958–0.981) | 0.808 (0.778–0.838) | 0.912 (0.892–0.933) | 0.908 (0.890–0.925) |
| minilm-l6-split | 0.345 (0.331–0.361) | 0.931 (0.914–0.949) | 0.483 (0.468–0.499) | 0.971 (0.958–0.982) | 0.821 (0.792–0.850) | 0.924 (0.904–0.944) | 0.915 (0.899–0.932) |
| multilingual-minilm-l12-q | 0.348 (0.333–0.364) | 0.933 (0.915–0.950) | 0.486 (0.471–0.502) | 0.974 (0.961–0.984) | 0.818 (0.790–0.846) | 0.911 (0.890–0.932) | 0.910 (0.892–0.927) |

## R@5 / F1@5 by query type

| Run | knowledge-update (72) | multi-session (121) | single-session-assistant (56) | single-session-preference (30) | single-session-user (64) | temporal-reasoning (127) |
|---|---|---|---|---|---|---|
| minilm-l6 | 0.979 / 0.560 | 0.907 / 0.601 | 1.000 / 0.333 | 0.967 / 0.322 | 0.969 / 0.323 | 0.881 / 0.516 |
| minilm-l6-split | 0.979 / 0.560 | 0.907 / 0.602 | 1.000 / 0.333 | 0.967 / 0.322 | 0.953 / 0.318 | 0.878 / 0.513 |
| multilingual-minilm-l12-q | 1.000 / 0.571 | 0.933 / 0.619 | 1.000 / 0.333 | 0.933 / 0.311 | 0.953 / 0.318 | 0.856 / 0.503 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| minilm-l6-split − minilm-l6 | -0.001 (-0.005–0.003) | -0.003 (-0.011–0.005) | -0.001 (-0.006–0.004) | +0.001 (-0.006–0.007) | +0.013 (-0.000–0.027) | +0.012 (0.003–0.021) | +0.007 (0.001–0.014) |
| multilingual-minilm-l12-q − minilm-l6 | +0.002 (-0.005–0.008) | -0.001 (-0.018–0.015) | +0.002 (-0.008–0.010) | +0.004 (-0.010–0.017) | +0.009 (-0.014–0.034) | -0.001 (-0.020–0.018) | +0.002 (-0.013–0.016) |
| multilingual-minilm-l12-q − minilm-l6-split | +0.003 (-0.004–0.009) | +0.002 (-0.015–0.017) | +0.003 (-0.006–0.011) | +0.003 (-0.010–0.015) | -0.003 (-0.028–0.020) | -0.013 (-0.030–0.005) | -0.005 (-0.020–0.008) |
