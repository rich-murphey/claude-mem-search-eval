# miracl-zh, vector only (exact)

MIRACL zh dev, human-judged, pooled corpus (mteb/MIRACLRetrievalHardNegatives @ 332a9acb, CC-BY-SA-4.0). 393 queries; each searches its project; a document scores as its best part; 95% intervals from 2000 bootstrap resamples over queries.

MIRACL answers "how accurate is it, measured properly": human-judged relevance with explicit non-relevant judgments, two to three relevant passages per query, so P@5, R@5 and F1@5 are meaningful; J@5 bounds the unjudged share of each top 5.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| minilm-l6 | 0.001 (0.000–0.003) | 0.003 (0.000–0.009) | 0.001 (0.000–0.004) | 0.008 (0.001–0.017) | 0.000 (0.000–0.001) | 0.002 (0.000–0.005) | 0.003 (0.001–0.007) | 0.015 (0.009–0.022) |
| multilingual-minilm-l12 | 0.132 (0.114–0.150) | 0.281 (0.243–0.319) | 0.164 (0.143–0.186) | 0.400 (0.359–0.441) | 0.175 (0.147–0.204) | 0.300 (0.263–0.338) | 0.283 (0.251–0.316) | 0.282 (0.256–0.306) |
| multilingual-e5-small | 0.208 (0.190–0.225) | 0.481 (0.442–0.520) | 0.267 (0.246–0.288) | 0.625 (0.586–0.663) | 0.326 (0.290–0.360) | 0.532 (0.491–0.572) | 0.484 (0.451–0.514) | 0.479 (0.454–0.505) |

## R@5 / F1@5 by query type

| Run | zh (393) |
|---|---|
| minilm-l6 | 0.003 / 0.001 |
| multilingual-minilm-l12 | 0.281 / 0.164 |
| multilingual-e5-small | 0.481 / 0.267 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| multilingual-minilm-l12 − minilm-l6 | +0.131 (0.113–0.149) | +0.279 (0.239–0.316) | +0.163 (0.142–0.185) | +0.392 (0.349–0.433) | +0.175 (0.147–0.204) | +0.297 (0.260–0.336) | +0.279 (0.247–0.313) | +0.267 (0.241–0.291) |
| multilingual-e5-small − minilm-l6 | +0.207 (0.189–0.225) | +0.478 (0.439–0.517) | +0.266 (0.245–0.287) | +0.617 (0.579–0.655) | +0.326 (0.290–0.360) | +0.530 (0.489–0.568) | +0.480 (0.447–0.511) | +0.464 (0.439–0.490) |
