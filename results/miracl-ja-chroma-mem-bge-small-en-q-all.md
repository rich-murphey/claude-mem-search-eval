# miracl-ja, vector only (exact, and minilm-l6-split, bge-small-en-q)

MIRACL ja dev, human-judged, pooled corpus (mteb/MIRACLRetrievalHardNegatives @ 332a9acb, CC-BY-SA-4.0). 860 queries; each searches its project; a document scores as its best part; 95% intervals from 2000 bootstrap resamples over queries. The chroma-mem rows search Chroma 1.4.4 through chroma-mem's bench, each query filtered to its scope by a where, asking for 200 parts and keeping each document's best. minilm-l6-split is the release minilm-l6 vectors with rows over 254 word pieces replaced by chroma-mem's pieces of them; bge-small-en-q embeds every row and query in chroma-mem (bench load --embed, bench query --embed), split at its piece budget.

MIRACL answers "how accurate is it, measured properly": human-judged relevance with explicit non-relevant judgments, two to three relevant passages per query, so P@5, R@5 and F1@5 are meaningful; J@5 bounds the unjudged share of each top 5.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| minilm-l6 | 0.004 (0.002–0.006) | 0.010 (0.005–0.016) | 0.005 (0.003–0.008) | 0.016 (0.010–0.024) | 0.007 (0.003–0.011) | 0.014 (0.008–0.020) | 0.011 (0.006–0.016) | 0.010 (0.007–0.013) |
| minilm-l6-split | 0.004 (0.002–0.006) | 0.010 (0.005–0.016) | 0.005 (0.003–0.008) | 0.015 (0.008–0.022) | 0.006 (0.002–0.010) | 0.012 (0.007–0.018) | 0.010 (0.005–0.015) | 0.013 (0.010–0.016) |
| bge-small-en-q | 0.026 (0.021–0.032) | 0.066 (0.052–0.080) | 0.034 (0.028–0.041) | 0.117 (0.098–0.135) | 0.033 (0.023–0.043) | 0.074 (0.061–0.090) | 0.071 (0.059–0.084) | 0.072 (0.063–0.081) |

## R@5 / F1@5 by query type

| Run | ja (860) |
|---|---|
| minilm-l6 | 0.010 / 0.005 |
| minilm-l6-split | 0.010 / 0.005 |
| bge-small-en-q | 0.066 / 0.034 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| minilm-l6-split − minilm-l6 | +0.000 (-0.001–0.001) | +0.000 (-0.001–0.001) | +0.000 (-0.001–0.001) | -0.002 (-0.005–0.001) | -0.001 (-0.002–0.001) | -0.002 (-0.004–0.000) | -0.001 (-0.002–0.000) | +0.003 (0.001–0.006) |
| bge-small-en-q − minilm-l6 | +0.022 (0.017–0.027) | +0.056 (0.042–0.070) | +0.029 (0.023–0.036) | +0.100 (0.082–0.118) | +0.026 (0.017–0.035) | +0.061 (0.048–0.074) | +0.060 (0.049–0.072) | +0.062 (0.053–0.071) |
| bge-small-en-q − minilm-l6-split | +0.022 (0.017–0.027) | +0.056 (0.042–0.070) | +0.029 (0.023–0.036) | +0.102 (0.083–0.120) | +0.027 (0.018–0.036) | +0.063 (0.050–0.076) | +0.061 (0.049–0.073) | +0.059 (0.050–0.068) |
