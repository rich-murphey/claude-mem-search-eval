# miracl-ko, vector only (exact)

MIRACL ko dev, human-judged, pooled corpus (mteb/MIRACLRetrievalHardNegatives @ 332a9acb, CC-BY-SA-4.0). 213 queries; each searches its project; a document scores as its best part; 95% intervals from 2000 bootstrap resamples over queries.

MIRACL answers "how accurate is it, measured properly": human-judged relevance with explicit non-relevant judgments, two to three relevant passages per query, so P@5, R@5 and F1@5 are meaningful; J@5 bounds the unjudged share of each top 5.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| minilm-l6 | 0.008 (0.002–0.015) | 0.023 (0.007–0.045) | 0.011 (0.003–0.021) | 0.031 (0.012–0.054) | 0.013 (0.002–0.027) | 0.020 (0.007–0.037) | 0.021 (0.007–0.038) | 0.016 (0.007–0.028) |
| multilingual-minilm-l12 | 0.144 (0.121–0.167) | 0.319 (0.267–0.370) | 0.174 (0.149–0.200) | 0.375 (0.321–0.428) | 0.231 (0.186–0.280) | 0.358 (0.305–0.413) | 0.308 (0.262–0.355) | 0.284 (0.250–0.321) |
| multilingual-e5-small | 0.241 (0.219–0.267) | 0.611 (0.558–0.662) | 0.308 (0.285–0.333) | 0.717 (0.668–0.762) | 0.476 (0.421–0.530) | 0.706 (0.654–0.756) | 0.620 (0.574–0.663) | 0.568 (0.535–0.602) |
| granite-97m-r2 | 0.228 (0.204–0.254) | 0.550 (0.496–0.603) | 0.287 (0.261–0.313) | 0.655 (0.603–0.703) | 0.409 (0.356–0.460) | 0.627 (0.571–0.681) | 0.552 (0.503–0.597) | 0.546 (0.512–0.583) |
| granite-97m-r2-512 | 0.230 (0.205–0.256) | 0.557 (0.501–0.608) | 0.290 (0.263–0.316) | 0.656 (0.605–0.704) | 0.415 (0.362–0.466) | 0.625 (0.570–0.680) | 0.553 (0.505–0.599) | 0.548 (0.513–0.585) |

## R@5 / F1@5 by query type

| Run | ko (213) |
|---|---|
| minilm-l6 | 0.023 / 0.011 |
| multilingual-minilm-l12 | 0.319 / 0.174 |
| multilingual-e5-small | 0.611 / 0.308 |
| granite-97m-r2 | 0.550 / 0.287 |
| granite-97m-r2-512 | 0.557 / 0.290 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| multilingual-minilm-l12 − minilm-l6 | +0.136 (0.115–0.160) | +0.296 (0.248–0.346) | +0.163 (0.140–0.188) | +0.344 (0.292–0.398) | +0.219 (0.175–0.265) | +0.338 (0.286–0.390) | +0.287 (0.244–0.331) | +0.268 (0.234–0.304) |
| multilingual-e5-small − minilm-l6 | +0.234 (0.211–0.259) | +0.588 (0.534–0.639) | +0.298 (0.274–0.322) | +0.687 (0.637–0.734) | +0.463 (0.406–0.516) | +0.686 (0.633–0.737) | +0.599 (0.553–0.642) | +0.552 (0.520–0.586) |
| granite-97m-r2 − minilm-l6 | +0.221 (0.195–0.247) | +0.527 (0.471–0.579) | +0.276 (0.249–0.301) | +0.624 (0.571–0.672) | +0.396 (0.343–0.448) | +0.607 (0.551–0.661) | +0.530 (0.483–0.574) | +0.531 (0.495–0.568) |
| granite-97m-r2-512 − minilm-l6 | +0.223 (0.197–0.249) | +0.533 (0.478–0.584) | +0.279 (0.252–0.305) | +0.626 (0.572–0.674) | +0.403 (0.347–0.455) | +0.605 (0.550–0.658) | +0.532 (0.485–0.576) | +0.532 (0.497–0.570) |
