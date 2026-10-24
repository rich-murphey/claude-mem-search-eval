# longmemeval-s, vector only (exact)

LongMemEval-S cleaned (xiaowu0162/longmemeval-cleaned @ 98d7416c, MIT). 470 queries; each searches its own haystack; a document scores as its best part; 95% intervals from 2000 bootstrap resamples over queries.

LongMemEval answers whether a model change costs English memory search accuracy.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| minilm-l6 | 0.346 (0.331–0.362) | 0.934 (0.917–0.951) | 0.484 (0.469–0.500) | 0.970 (0.958–0.981) | 0.808 (0.778–0.838) | 0.912 (0.892–0.933) | 0.908 (0.890–0.925) |
| multilingual-e5-small | 0.354 (0.339–0.370) | 0.948 (0.931–0.964) | 0.494 (0.479–0.510) | 0.981 (0.970–0.991) | 0.861 (0.834–0.887) | 0.937 (0.918–0.954) | 0.935 (0.919–0.950) |
| bge-small-en | 0.357 (0.343–0.373) | 0.958 (0.944–0.972) | 0.499 (0.484–0.514) | 0.977 (0.964–0.989) | 0.853 (0.824–0.879) | 0.927 (0.907–0.946) | 0.930 (0.912–0.945) |

## R@5 / F1@5 by query type

| Run | knowledge-update (72) | multi-session (121) | single-session-assistant (56) | single-session-preference (30) | single-session-user (64) | temporal-reasoning (127) |
|---|---|---|---|---|---|---|
| minilm-l6 | 0.979 / 0.560 | 0.907 / 0.601 | 1.000 / 0.333 | 0.967 / 0.322 | 0.969 / 0.323 | 0.881 / 0.516 |
| multilingual-e5-small | 1.000 / 0.571 | 0.945 / 0.630 | 1.000 / 0.333 | 0.900 / 0.300 | 1.000 / 0.333 | 0.885 / 0.518 |
| bge-small-en | 0.993 / 0.567 | 0.955 / 0.635 | 1.000 / 0.333 | 0.967 / 0.322 | 0.984 / 0.328 | 0.908 / 0.530 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| multilingual-e5-small − minilm-l6 | +0.008 (0.001–0.015) | +0.014 (-0.002–0.030) | +0.010 (0.001–0.019) | +0.011 (-0.000–0.023) | +0.053 (0.026–0.078) | +0.025 (0.006–0.041) | +0.027 (0.013–0.040) |
| bge-small-en − minilm-l6 | +0.011 (0.006–0.017) | +0.024 (0.012–0.036) | +0.014 (0.007–0.022) | +0.007 (-0.003–0.018) | +0.045 (0.020–0.067) | +0.015 (-0.001–0.030) | +0.022 (0.010–0.033) |
| bge-small-en − multilingual-e5-small | +0.003 (-0.003–0.009) | +0.010 (-0.003–0.023) | +0.005 (-0.002–0.012) | -0.004 (-0.013–0.003) | -0.008 (-0.031–0.016) | -0.010 (-0.027–0.007) | -0.005 (-0.017–0.007) |
