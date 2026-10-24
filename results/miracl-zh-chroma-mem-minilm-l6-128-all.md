# miracl-zh, vector only (exact, and minilm-l6-split, minilm-l6-128)

MIRACL zh dev, human-judged, pooled corpus (mteb/MIRACLRetrievalHardNegatives @ 332a9acb, CC-BY-SA-4.0). 393 queries; each searches its project; a document scores as its best part; 95% intervals from 2000 bootstrap resamples over queries. The chroma-mem rows search Chroma 1.4.4 through chroma-mem's bench, each query filtered to its scope by a where, asking for 200 parts and keeping each document's best. minilm-l6-split is the release minilm-l6 vectors with rows over 254 word pieces replaced by chroma-mem's pieces of them; minilm-l6-128 embeds every row and query in chroma-mem (bench load --embed, bench query --embed), split at its piece budget.

MIRACL answers "how accurate is it, measured properly": human-judged relevance with explicit non-relevant judgments, two to three relevant passages per query, so P@5, R@5 and F1@5 are meaningful; J@5 bounds the unjudged share of each top 5.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| minilm-l6 | 0.001 (0.000–0.003) | 0.003 (0.000–0.009) | 0.001 (0.000–0.004) | 0.008 (0.001–0.017) | 0.000 (0.000–0.001) | 0.002 (0.000–0.005) | 0.003 (0.001–0.007) | 0.015 (0.009–0.022) |
| minilm-l6-split | 0.002 (0.000–0.004) | 0.004 (0.000–0.010) | 0.002 (0.000–0.004) | 0.006 (0.001–0.014) | 0.000 (0.000–0.001) | 0.002 (0.001–0.005) | 0.003 (0.001–0.006) | 0.017 (0.011–0.024) |
| minilm-l6-128 | 0.004 (0.002–0.007) | 0.011 (0.003–0.021) | 0.005 (0.002–0.010) | 0.015 (0.006–0.027) | 0.006 (0.001–0.013) | 0.014 (0.005–0.026) | 0.011 (0.004–0.019) | 0.021 (0.014–0.028) |

## R@5 / F1@5 by query type

| Run | zh (393) |
|---|---|
| minilm-l6 | 0.003 / 0.001 |
| minilm-l6-split | 0.004 / 0.002 |
| minilm-l6-128 | 0.011 / 0.005 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| minilm-l6-split − minilm-l6 | +0.001 (0.000–0.002) | +0.001 (0.000–0.003) | +0.001 (0.000–0.002) | -0.002 (-0.008–0.003) | +0.000 (0.000–0.000) | -0.000 (-0.002–0.001) | -0.000 (-0.003–0.001) | +0.002 (-0.001–0.005) |
| minilm-l6-128 − minilm-l6 | +0.003 (0.001–0.006) | +0.008 (0.001–0.017) | +0.004 (0.001–0.008) | +0.007 (-0.004–0.019) | +0.006 (0.001–0.012) | +0.012 (0.003–0.024) | +0.007 (0.001–0.015) | +0.006 (-0.000–0.011) |
| minilm-l6-128 − minilm-l6-split | +0.003 (0.000–0.005) | +0.007 (0.001–0.016) | +0.003 (0.000–0.007) | +0.009 (-0.000–0.020) | +0.006 (0.001–0.012) | +0.012 (0.003–0.023) | +0.008 (0.002–0.016) | +0.004 (-0.002–0.010) |
