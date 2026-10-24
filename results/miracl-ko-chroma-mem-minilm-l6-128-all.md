# miracl-ko, vector only (exact, and minilm-l6-split, minilm-l6-128)

MIRACL ko dev, human-judged, pooled corpus (mteb/MIRACLRetrievalHardNegatives @ 332a9acb, CC-BY-SA-4.0). 213 queries; each searches its project; a document scores as its best part; 95% intervals from 2000 bootstrap resamples over queries. The chroma-mem rows search Chroma 1.4.4 through chroma-mem's bench, each query filtered to its scope by a where, asking for 200 parts and keeping each document's best. minilm-l6-split is the release minilm-l6 vectors with rows over 254 word pieces replaced by chroma-mem's pieces of them; minilm-l6-128 embeds every row and query in chroma-mem (bench load --embed, bench query --embed), split at its piece budget.

MIRACL answers "how accurate is it, measured properly": human-judged relevance with explicit non-relevant judgments, two to three relevant passages per query, so P@5, R@5 and F1@5 are meaningful; J@5 bounds the unjudged share of each top 5.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| minilm-l6 | 0.008 (0.002–0.015) | 0.023 (0.007–0.045) | 0.011 (0.003–0.021) | 0.031 (0.012–0.054) | 0.013 (0.002–0.027) | 0.020 (0.007–0.037) | 0.021 (0.007–0.038) | 0.016 (0.007–0.028) |
| minilm-l6-split | 0.005 (0.000–0.011) | 0.009 (0.000–0.021) | 0.006 (0.000–0.015) | 0.009 (0.000–0.021) | 0.007 (0.000–0.019) | 0.011 (0.000–0.025) | 0.009 (0.000–0.021) | 0.014 (0.005–0.026) |
| minilm-l6-128 | 0.013 (0.007–0.022) | 0.055 (0.027–0.086) | 0.021 (0.010–0.033) | 0.059 (0.031–0.092) | 0.041 (0.017–0.069) | 0.049 (0.024–0.079) | 0.051 (0.025–0.080) | 0.025 (0.014–0.038) |

## R@5 / F1@5 by query type

| Run | ko (213) |
|---|---|
| minilm-l6 | 0.023 / 0.011 |
| minilm-l6-split | 0.009 / 0.006 |
| minilm-l6-128 | 0.055 / 0.021 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| minilm-l6-split − minilm-l6 | -0.003 (-0.007–0.001) | -0.014 (-0.033–0.000) | -0.005 (-0.011–0.001) | -0.021 (-0.042–-0.005) | -0.005 (-0.020–0.005) | -0.009 (-0.025–0.005) | -0.012 (-0.027–-0.000) | -0.002 (-0.009–0.006) |
| minilm-l6-128 − minilm-l6 | +0.006 (0.000–0.012) | +0.031 (0.008–0.059) | +0.010 (0.001–0.020) | +0.029 (0.002–0.058) | +0.028 (0.005–0.056) | +0.029 (0.009–0.054) | +0.030 (0.008–0.055) | +0.009 (0.002–0.018) |
| minilm-l6-128 − minilm-l6-split | +0.008 (0.003–0.015) | +0.045 (0.019–0.075) | +0.014 (0.005–0.025) | +0.050 (0.022–0.081) | +0.034 (0.009–0.061) | +0.038 (0.013–0.066) | +0.042 (0.017–0.070) | +0.011 (0.002–0.022) |
