# longmemeval-s through claude-mem's server search (scoped)

LongMemEval-S cleaned (xiaowu0162/longmemeval-cleaned @ 98d7416c, MIT). 470 queries; each query is its own claude-mem project holding its own haystack; a document is one observation and each part one embedding part; top 10 from PostgresObservationRepository.search; 95% intervals from 2000 bootstrap resamples over queries.

LongMemEval answers whether a model change costs English memory search accuracy.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| keyword only | 0.287 (0.273–0.302) | 0.793 (0.763–0.822) | 0.405 (0.388–0.422) | 0.850 (0.825–0.875) | 0.700 (0.667–0.734) | 0.863 (0.835–0.891) | 0.803 (0.776–0.828) |
| minilm-l6 vector | 0.346 (0.331–0.362) | 0.934 (0.917–0.951) | 0.484 (0.469–0.500) | 0.970 (0.958–0.981) | 0.808 (0.778–0.838) | 0.912 (0.892–0.933) | 0.908 (0.890–0.925) |
| minilm-l6 hybrid | 0.345 (0.331–0.360) | 0.935 (0.919–0.951) | 0.483 (0.469–0.499) | 0.971 (0.959–0.983) | 0.820 (0.791–0.848) | 0.915 (0.893–0.936) | 0.912 (0.894–0.929) |
| multilingual-minilm-l12 vector | 0.347 (0.331–0.364) | 0.931 (0.911–0.949) | 0.484 (0.469–0.502) | 0.972 (0.959–0.983) | 0.819 (0.791–0.847) | 0.904 (0.882–0.926) | 0.906 (0.888–0.924) |
| multilingual-minilm-l12 hybrid | 0.346 (0.331–0.363) | 0.934 (0.915–0.952) | 0.485 (0.469–0.501) | 0.972 (0.958–0.984) | 0.813 (0.784–0.843) | 0.907 (0.884–0.929) | 0.909 (0.891–0.927) |
| multilingual-e5-small vector | 0.354 (0.339–0.370) | 0.948 (0.931–0.964) | 0.494 (0.479–0.510) | 0.981 (0.970–0.991) | 0.861 (0.834–0.887) | 0.937 (0.918–0.954) | 0.935 (0.919–0.950) |
| multilingual-e5-small hybrid | 0.349 (0.335–0.365) | 0.942 (0.925–0.958) | 0.489 (0.474–0.505) | 0.977 (0.965–0.988) | 0.836 (0.806–0.865) | 0.925 (0.904–0.945) | 0.923 (0.905–0.940) |

## R@5 / F1@5 by query type

| Run | knowledge-update (72) | multi-session (121) | single-session-assistant (56) | single-session-preference (30) | single-session-user (64) | temporal-reasoning (127) |
|---|---|---|---|---|---|---|
| keyword only | 0.799 / 0.456 | 0.754 / 0.493 | 0.964 / 0.321 | 0.500 / 0.167 | 0.938 / 0.312 | 0.747 / 0.430 |
| minilm-l6 vector | 0.979 / 0.560 | 0.907 / 0.601 | 1.000 / 0.333 | 0.967 / 0.322 | 0.969 / 0.323 | 0.881 / 0.516 |
| minilm-l6 hybrid | 0.965 / 0.552 | 0.899 / 0.593 | 1.000 / 0.333 | 0.933 / 0.311 | 0.984 / 0.328 | 0.900 / 0.524 |
| multilingual-minilm-l12 vector | 0.993 / 0.567 | 0.912 / 0.607 | 1.000 / 0.333 | 0.900 / 0.300 | 0.984 / 0.328 | 0.862 / 0.509 |
| multilingual-minilm-l12 hybrid | 0.972 / 0.556 | 0.910 / 0.602 | 1.000 / 0.333 | 0.867 / 0.289 | 0.984 / 0.328 | 0.895 / 0.524 |
| multilingual-e5-small vector | 1.000 / 0.571 | 0.945 / 0.630 | 1.000 / 0.333 | 0.900 / 0.300 | 1.000 / 0.333 | 0.885 / 0.518 |
| multilingual-e5-small hybrid | 0.972 / 0.556 | 0.929 / 0.615 | 1.000 / 0.333 | 0.900 / 0.300 | 1.000 / 0.333 | 0.894 / 0.522 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| minilm-l6 hybrid − minilm-l6 vector | -0.001 (-0.008–0.006) | +0.001 (-0.014–0.016) | -0.001 (-0.010–0.008) | +0.001 (-0.009–0.012) | +0.012 (-0.017–0.041) | +0.002 (-0.019–0.023) | +0.004 (-0.011–0.018) |
| minilm-l6 hybrid − keyword only | +0.057 (0.048–0.068) | +0.142 (0.119–0.167) | +0.079 (0.066–0.092) | +0.121 (0.099–0.144) | +0.120 (0.096–0.145) | +0.051 (0.034–0.069) | +0.109 (0.092–0.126) |
| multilingual-minilm-l12 hybrid − multilingual-minilm-l12 vector | -0.000 (-0.008–0.007) | +0.003 (-0.013–0.019) | +0.000 (-0.009–0.010) | +0.000 (-0.012–0.012) | -0.006 (-0.034–0.021) | +0.003 (-0.017–0.022) | +0.003 (-0.012–0.018) |
| multilingual-minilm-l12 hybrid − keyword only | +0.059 (0.049–0.070) | +0.141 (0.117–0.166) | +0.080 (0.066–0.094) | +0.121 (0.099–0.145) | +0.113 (0.088–0.138) | +0.043 (0.027–0.061) | +0.106 (0.090–0.123) |
| multilingual-e5-small hybrid − multilingual-e5-small vector | -0.005 (-0.011–0.001) | -0.006 (-0.021–0.009) | -0.005 (-0.014–0.003) | -0.004 (-0.013–0.005) | -0.025 (-0.050–0.003) | -0.012 (-0.031–0.007) | -0.012 (-0.026–0.002) |
| multilingual-e5-small hybrid − keyword only | +0.062 (0.052–0.072) | +0.150 (0.125–0.175) | +0.084 (0.071–0.098) | +0.127 (0.105–0.150) | +0.136 (0.113–0.160) | +0.061 (0.046–0.077) | +0.120 (0.105–0.136) |
| multilingual-minilm-l12 vector − minilm-l6 vector | +0.001 (-0.006–0.007) | -0.004 (-0.018–0.011) | +0.000 (-0.008–0.008) | +0.002 (-0.012–0.015) | +0.011 (-0.013–0.034) | -0.008 (-0.025–0.009) | -0.002 (-0.015–0.012) |
| multilingual-minilm-l12 hybrid − minilm-l6 hybrid | +0.002 (-0.002–0.006) | -0.002 (-0.013–0.008) | +0.001 (-0.004–0.007) | +0.000 (-0.009–0.009) | -0.007 (-0.026–0.011) | -0.008 (-0.020–0.004) | -0.002 (-0.012–0.007) |
| multilingual-e5-small vector − minilm-l6 vector | +0.008 (0.001–0.015) | +0.014 (-0.002–0.030) | +0.010 (0.001–0.019) | +0.011 (-0.000–0.023) | +0.053 (0.026–0.078) | +0.025 (0.006–0.041) | +0.027 (0.013–0.040) |
| multilingual-e5-small hybrid − minilm-l6 hybrid | +0.005 (-0.000–0.009) | +0.007 (-0.004–0.018) | +0.006 (-0.001–0.012) | +0.006 (-0.002–0.014) | +0.016 (-0.003–0.036) | +0.010 (-0.003–0.024) | +0.011 (0.002–0.021) |

## Timing

- minilm-l6: load and index 225s, 1410 searches 13s
- multilingual-minilm-l12: load and index 227s, 940 searches 10s
- multilingual-e5-small: load and index 218s, 940 searches 9s
