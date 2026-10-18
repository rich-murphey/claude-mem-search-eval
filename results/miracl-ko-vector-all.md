# miracl-ko, vector only (exact)

MIRACL ko dev, human-judged, pooled corpus (mteb/MIRACLRetrievalHardNegatives @ 332a9acb, CC-BY-SA-4.0). 213 queries; each searches its project; a document scores as its best part; 95% intervals from 2000 bootstrap resamples over queries.

MIRACL answers "how accurate is it, measured properly": human-judged relevance with explicit non-relevant judgments, two to three relevant passages per query, so P@5, R@5 and F1@5 are meaningful; J@5 bounds the unjudged share of each top 5.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| minilm-l6 | 0.008 (0.002–0.015) | 0.023 (0.007–0.045) | 0.011 (0.003–0.021) | 0.031 (0.012–0.054) | 0.013 (0.002–0.027) | 0.020 (0.007–0.037) | 0.021 (0.007–0.038) | 0.016 (0.007–0.028) |
| multilingual-minilm-l12 | 0.144 (0.121–0.167) | 0.319 (0.267–0.370) | 0.174 (0.149–0.200) | 0.375 (0.321–0.428) | 0.231 (0.186–0.280) | 0.358 (0.305–0.413) | 0.308 (0.262–0.355) | 0.284 (0.250–0.321) |
| multilingual-e5-small | 0.241 (0.219–0.267) | 0.611 (0.558–0.662) | 0.308 (0.285–0.333) | 0.717 (0.668–0.762) | 0.476 (0.421–0.530) | 0.706 (0.654–0.756) | 0.620 (0.574–0.663) | 0.568 (0.535–0.602) |

## R@5 / F1@5 by query type

| Run | ko (213) |
|---|---|
| minilm-l6 | 0.023 / 0.011 |
| multilingual-minilm-l12 | 0.319 / 0.174 |
| multilingual-e5-small | 0.611 / 0.308 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| multilingual-minilm-l12 − minilm-l6 | +0.136 (0.115–0.160) | +0.296 (0.248–0.346) | +0.163 (0.140–0.188) | +0.344 (0.292–0.398) | +0.219 (0.175–0.265) | +0.338 (0.286–0.390) | +0.287 (0.244–0.331) | +0.268 (0.234–0.304) |
| multilingual-e5-small − minilm-l6 | +0.234 (0.211–0.259) | +0.588 (0.534–0.639) | +0.298 (0.274–0.322) | +0.687 (0.637–0.734) | +0.463 (0.406–0.516) | +0.686 (0.633–0.737) | +0.599 (0.553–0.642) | +0.552 (0.520–0.586) |
