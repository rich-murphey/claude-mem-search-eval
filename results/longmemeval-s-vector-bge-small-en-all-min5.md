# longmemeval-s, vector only (exact)

LongMemEval-S cleaned (xiaowu0162/longmemeval-cleaned @ 98d7416c, MIT). 14 queries with at least 5 relevant documents; each searches its own haystack; a document scores as its best part; 95% intervals from 2000 bootstrap resamples over queries.

LongMemEval answers whether a model change costs English memory search accuracy.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| minilm-l6 | 0.829 (0.729–0.914) | 0.798 (0.695–0.888) | 0.812 (0.710–0.901) | 0.945 (0.876–1.000) | 0.810 (0.702–0.902) | 0.964 (0.893–1.000) | 0.924 (0.866–0.971) |
| multilingual-e5-small | 0.914 (0.843–0.971) | 0.883 (0.805–0.960) | 0.897 (0.826–0.965) | 1.000 (1.000–1.000) | 0.907 (0.833–0.974) | 1.000 (1.000–1.000) | 0.986 (0.973–0.997) |
| bge-small-en | 0.886 (0.814–0.943) | 0.852 (0.786–0.919) | 0.868 (0.803–0.931) | 0.974 (0.933–1.000) | 0.864 (0.793–0.931) | 0.964 (0.893–1.000) | 0.938 (0.877–0.981) |

## R@5 / F1@5 by query type

| Run | multi-session (6) | temporal-reasoning (8) |
|---|---|---|
| minilm-l6 | 0.733 / 0.733 | 0.846 / 0.870 |
| multilingual-e5-small | 0.933 / 0.933 | 0.846 / 0.870 |
| bge-small-en | 0.833 / 0.833 | 0.867 / 0.893 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| multilingual-e5-small − minilm-l6 | +0.086 (-0.014–0.200) | +0.086 (-0.019–0.202) | +0.086 (-0.017–0.203) | +0.055 (0.000–0.124) | +0.098 (-0.000–0.212) | +0.036 (0.000–0.107) | +0.062 (0.015–0.120) |
| bge-small-en − minilm-l6 | +0.057 (0.000–0.114) | +0.055 (-0.002–0.114) | +0.056 (-0.001–0.114) | +0.029 (0.000–0.071) | +0.055 (-0.002–0.114) | +0.000 (-0.107–0.107) | +0.014 (-0.010–0.041) |
| bge-small-en − multilingual-e5-small | -0.029 (-0.114–0.057) | -0.031 (-0.117–0.052) | -0.030 (-0.116–0.055) | -0.026 (-0.067–0.000) | -0.043 (-0.129–0.043) | -0.036 (-0.107–0.000) | -0.048 (-0.107–-0.009) |
