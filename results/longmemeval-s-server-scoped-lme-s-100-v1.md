# longmemeval-s through claude-mem's server search (scoped)

LongMemEval-S cleaned (xiaowu0162/longmemeval-cleaned @ 98d7416c, MIT). 100 queries from manifests/lme-s-100-v1.txt; each query is its own claude-mem project holding its own haystack; a document is one observation and each part one embedding part; top 10 from PostgresObservationRepository.search; 95% intervals from 2000 bootstrap resamples over queries.

LongMemEval answers whether a model change costs English memory search accuracy.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| keyword only | 0.284 (0.252–0.318) | 0.774 (0.709–0.835) | 0.396 (0.360–0.433) | 0.854 (0.795–0.908) | 0.702 (0.634–0.768) | 0.854 (0.793–0.912) | 0.797 (0.740–0.851) |
| minilm-l6 vector | 0.354 (0.320–0.390) | 0.937 (0.901–0.967) | 0.489 (0.455–0.524) | 0.969 (0.939–0.991) | 0.789 (0.728–0.844) | 0.918 (0.874–0.957) | 0.903 (0.867–0.933) |
| minilm-l6 hybrid | 0.354 (0.320–0.390) | 0.934 (0.894–0.966) | 0.489 (0.455–0.524) | 0.971 (0.946–0.990) | 0.823 (0.760–0.882) | 0.914 (0.869–0.957) | 0.911 (0.873–0.945) |
| multilingual-minilm-l12 vector | 0.366 (0.330–0.404) | 0.952 (0.920–0.980) | 0.503 (0.469–0.538) | 0.978 (0.952–0.997) | 0.831 (0.773–0.881) | 0.925 (0.882–0.960) | 0.923 (0.889–0.953) |
| multilingual-minilm-l12 hybrid | 0.356 (0.322–0.394) | 0.938 (0.899–0.969) | 0.491 (0.459–0.526) | 0.980 (0.957–0.997) | 0.819 (0.758–0.876) | 0.923 (0.880–0.963) | 0.918 (0.883–0.949) |
| multilingual-e5-small vector | 0.362 (0.328–0.400) | 0.954 (0.925–0.979) | 0.499 (0.466–0.534) | 0.988 (0.973–1.000) | 0.860 (0.806–0.907) | 0.948 (0.909–0.978) | 0.940 (0.912–0.965) |
| multilingual-e5-small hybrid | 0.360 (0.324–0.398) | 0.952 (0.917–0.980) | 0.497 (0.462–0.533) | 0.983 (0.960–1.000) | 0.835 (0.775–0.890) | 0.938 (0.894–0.975) | 0.931 (0.896–0.961) |

## R@5 / F1@5 by query type

| Run | knowledge-update (15) | multi-session (26) | single-session-assistant (12) | single-session-preference (6) | single-session-user (14) | temporal-reasoning (27) |
|---|---|---|---|---|---|---|
| keyword only | 0.800 / 0.457 | 0.687 / 0.456 | 0.917 / 0.306 | 0.500 / 0.167 | 0.929 / 0.310 | 0.763 / 0.442 |
| minilm-l6 vector | 0.967 / 0.552 | 0.901 / 0.612 | 1.000 / 0.333 | 1.000 / 0.333 | 1.000 / 0.333 | 0.881 / 0.519 |
| minilm-l6 hybrid | 0.967 / 0.552 | 0.863 / 0.584 | 1.000 / 0.333 | 1.000 / 0.333 | 0.929 / 0.310 | 0.944 / 0.558 |
| multilingual-minilm-l12 vector | 1.000 / 0.571 | 0.931 / 0.638 | 1.000 / 0.333 | 1.000 / 0.333 | 1.000 / 0.333 | 0.889 / 0.535 |
| multilingual-minilm-l12 hybrid | 0.967 / 0.552 | 0.890 / 0.603 | 1.000 / 0.333 | 1.000 / 0.333 | 0.929 / 0.310 | 0.932 / 0.549 |
| multilingual-e5-small vector | 1.000 / 0.571 | 0.911 / 0.621 | 1.000 / 0.333 | 1.000 / 0.333 | 1.000 / 0.333 | 0.914 / 0.539 |
| multilingual-e5-small hybrid | 0.967 / 0.552 | 0.904 / 0.613 | 1.000 / 0.333 | 1.000 / 0.333 | 1.000 / 0.333 | 0.932 / 0.549 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| minilm-l6 hybrid − minilm-l6 vector | -0.000 (-0.014–0.014) | -0.003 (-0.037–0.030) | -0.000 (-0.019–0.019) | +0.002 (-0.018–0.027) | +0.035 (-0.028–0.099) | -0.004 (-0.048–0.039) | +0.008 (-0.025–0.038) |
| minilm-l6 hybrid − keyword only | +0.070 (0.048–0.094) | +0.160 (0.109–0.217) | +0.093 (0.064–0.124) | +0.116 (0.069–0.167) | +0.121 (0.072–0.172) | +0.060 (0.015–0.105) | +0.114 (0.076–0.153) |
| multilingual-minilm-l12 hybrid − multilingual-minilm-l12 vector | -0.010 (-0.030–0.006) | -0.014 (-0.055–0.026) | -0.012 (-0.036–0.010) | +0.002 (-0.025–0.030) | -0.012 (-0.071–0.048) | -0.002 (-0.048–0.042) | -0.004 (-0.039–0.027) |
| multilingual-minilm-l12 hybrid − keyword only | +0.072 (0.050–0.098) | +0.164 (0.111–0.220) | +0.095 (0.066–0.126) | +0.126 (0.077–0.182) | +0.117 (0.063–0.171) | +0.069 (0.023–0.114) | +0.121 (0.081–0.160) |
| multilingual-e5-small hybrid − multilingual-e5-small vector | -0.002 (-0.020–0.012) | -0.002 (-0.032–0.026) | -0.002 (-0.024–0.016) | -0.005 (-0.020–0.007) | -0.025 (-0.085–0.035) | -0.010 (-0.056–0.037) | -0.009 (-0.042–0.025) |
| multilingual-e5-small hybrid − keyword only | +0.076 (0.052–0.100) | +0.177 (0.122–0.237) | +0.101 (0.071–0.133) | +0.129 (0.080–0.185) | +0.133 (0.090–0.177) | +0.084 (0.047–0.123) | +0.134 (0.099–0.171) |
| multilingual-minilm-l12 vector − minilm-l6 vector | +0.012 (-0.002–0.026) | +0.015 (-0.019–0.048) | +0.014 (-0.004–0.033) | +0.009 (-0.022–0.044) | +0.042 (-0.006–0.090) | +0.007 (-0.028–0.043) | +0.019 (-0.009–0.049) |
| multilingual-minilm-l12 hybrid − minilm-l6 hybrid | +0.002 (-0.004–0.010) | +0.004 (-0.008–0.017) | +0.002 (-0.005–0.011) | +0.009 (0.000–0.022) | -0.005 (-0.035–0.022) | +0.008 (-0.019–0.037) | +0.007 (-0.012–0.024) |
| multilingual-e5-small vector − minilm-l6 vector | +0.008 (-0.008–0.024) | +0.016 (-0.015–0.051) | +0.010 (-0.010–0.032) | +0.019 (-0.001–0.048) | +0.071 (0.015–0.131) | +0.030 (-0.005–0.068) | +0.037 (0.012–0.067) |
| multilingual-e5-small hybrid − minilm-l6 hybrid | +0.006 (-0.006–0.018) | +0.018 (-0.006–0.047) | +0.008 (-0.006–0.024) | +0.013 (0.002–0.027) | +0.012 (-0.024–0.046) | +0.024 (-0.002–0.054) | +0.020 (0.003–0.039) |

## Timing

- minilm-l6: load and index 559s, 300 searches 2s
- multilingual-minilm-l12: load and index 546s, 200 searches 2s
- multilingual-e5-small: load and index 540s, 200 searches 2s
