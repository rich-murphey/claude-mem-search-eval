# longmemeval-s, vector only (exact)

LongMemEval-S cleaned (xiaowu0162/longmemeval-cleaned @ 98d7416c, MIT). 14 queries with at least 5 relevant documents; each searches its own haystack; a document scores as its best part; 95% intervals from 2000 bootstrap resamples over queries.

LongMemEval answers whether a model change costs English memory search accuracy.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| minilm-l6 | 0.829 (0.729–0.914) | 0.798 (0.695–0.888) | 0.812 (0.710–0.901) | 0.945 (0.876–1.000) | 0.810 (0.702–0.902) | 0.964 (0.893–1.000) | 0.924 (0.866–0.971) |
| multilingual-minilm-l12 | 0.857 (0.771–0.929) | 0.826 (0.745–0.902) | 0.840 (0.760–0.913) | 0.962 (0.900–1.000) | 0.850 (0.757–0.929) | 1.000 (1.000–1.000) | 0.959 (0.907–0.994) |
| multilingual-e5-small | 0.914 (0.843–0.971) | 0.883 (0.805–0.960) | 0.897 (0.826–0.965) | 1.000 (1.000–1.000) | 0.907 (0.833–0.974) | 1.000 (1.000–1.000) | 0.986 (0.973–0.997) |
| granite-97m-r2 | 0.814 (0.700–0.900) | 0.781 (0.679–0.862) | 0.796 (0.688–0.875) | 0.890 (0.800–0.962) | 0.793 (0.686–0.876) | 1.000 (1.000–1.000) | 0.907 (0.826–0.966) |
| granite-97m-r2-512 | 0.814 (0.700–0.900) | 0.781 (0.679–0.862) | 0.796 (0.688–0.875) | 0.890 (0.800–0.962) | 0.793 (0.686–0.876) | 1.000 (1.000–1.000) | 0.906 (0.822–0.966) |

## R@5 / F1@5 by query type

| Run | multi-session (6) | temporal-reasoning (8) |
|---|---|---|
| minilm-l6 | 0.733 / 0.733 | 0.846 / 0.870 |
| multilingual-minilm-l12 | 0.800 / 0.800 | 0.846 / 0.870 |
| multilingual-e5-small | 0.933 / 0.933 | 0.846 / 0.870 |
| granite-97m-r2 | 0.733 / 0.733 | 0.817 / 0.843 |
| granite-97m-r2-512 | 0.733 / 0.733 | 0.817 / 0.843 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| multilingual-minilm-l12 − minilm-l6 | +0.029 (-0.029–0.086) | +0.029 (-0.029–0.086) | +0.029 (-0.029–0.086) | +0.017 (-0.024–0.060) | +0.040 (-0.017–0.098) | +0.036 (0.000–0.107) | +0.035 (-0.002–0.078) |
| multilingual-e5-small − minilm-l6 | +0.086 (-0.014–0.200) | +0.086 (-0.019–0.202) | +0.086 (-0.017–0.203) | +0.055 (0.000–0.124) | +0.098 (-0.000–0.212) | +0.036 (0.000–0.107) | +0.062 (0.015–0.120) |
| granite-97m-r2 − minilm-l6 | -0.014 (-0.143–0.114) | -0.017 (-0.145–0.114) | -0.016 (-0.144–0.114) | -0.055 (-0.171–0.060) | -0.017 (-0.160–0.124) | +0.036 (0.000–0.107) | -0.017 (-0.091–0.061) |
| granite-97m-r2-512 − minilm-l6 | -0.014 (-0.143–0.114) | -0.017 (-0.145–0.114) | -0.016 (-0.144–0.114) | -0.055 (-0.171–0.060) | -0.017 (-0.160–0.124) | +0.036 (0.000–0.107) | -0.018 (-0.093–0.061) |
