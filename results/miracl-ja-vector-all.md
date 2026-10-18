# miracl-ja, vector only (exact)

MIRACL ja dev, human-judged, pooled corpus (mteb/MIRACLRetrievalHardNegatives @ 332a9acb, CC-BY-SA-4.0). 860 queries; each searches its project; a document scores as its best part; 95% intervals from 2000 bootstrap resamples over queries.

MIRACL answers "how accurate is it, measured properly": human-judged relevance with explicit non-relevant judgments, two to three relevant passages per query, so P@5, R@5 and F1@5 are meaningful; J@5 bounds the unjudged share of each top 5.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| minilm-l6 | 0.004 (0.002–0.006) | 0.010 (0.005–0.016) | 0.005 (0.003–0.008) | 0.016 (0.010–0.024) | 0.007 (0.003–0.011) | 0.014 (0.008–0.020) | 0.011 (0.006–0.016) | 0.010 (0.007–0.013) |
| multilingual-minilm-l12 | 0.081 (0.072–0.091) | 0.201 (0.179–0.226) | 0.106 (0.095–0.118) | 0.268 (0.243–0.295) | 0.115 (0.099–0.132) | 0.215 (0.192–0.239) | 0.192 (0.173–0.212) | 0.182 (0.167–0.197) |
| multilingual-e5-small | 0.240 (0.230–0.251) | 0.682 (0.657–0.707) | 0.329 (0.317–0.342) | 0.771 (0.748–0.793) | 0.455 (0.428–0.483) | 0.678 (0.654–0.703) | 0.639 (0.618–0.660) | 0.526 (0.510–0.543) |

## R@5 / F1@5 by query type

| Run | ja (860) |
|---|---|
| minilm-l6 | 0.010 / 0.005 |
| multilingual-minilm-l12 | 0.201 / 0.106 |
| multilingual-e5-small | 0.682 / 0.329 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| multilingual-minilm-l12 − minilm-l6 | +0.077 (0.068–0.087) | +0.192 (0.169–0.216) | +0.101 (0.090–0.112) | +0.251 (0.227–0.279) | +0.109 (0.093–0.126) | +0.201 (0.179–0.226) | +0.181 (0.162–0.201) | +0.172 (0.158–0.188) |
| multilingual-e5-small − minilm-l6 | +0.236 (0.226–0.247) | +0.672 (0.647–0.698) | +0.324 (0.312–0.337) | +0.754 (0.731–0.777) | +0.449 (0.421–0.477) | +0.664 (0.639–0.690) | +0.628 (0.606–0.649) | +0.517 (0.500–0.533) |
