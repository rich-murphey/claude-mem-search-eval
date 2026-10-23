# miracl-ko, vector only (exact, and chroma-mem, chroma-mem-n1000, chroma-mem-split, chroma-mem-split-n1000)

MIRACL ko dev, human-judged, pooled corpus (mteb/MIRACLRetrievalHardNegatives @ 332a9acb, CC-BY-SA-4.0). 213 queries; each searches its project; a document scores as its best part; 95% intervals from 2000 bootstrap resamples over queries. The chroma-mem rows search the release vectors in Chroma 1.4.4 through chroma-mem's bench, each query filtered to its scope by a where, asking for 200 parts (n1000: 1,000) and keeping each document's best; split replaces rows over 254 word pieces with chroma-mem's pieces of them, embedded by chroma-mem.

MIRACL answers "how accurate is it, measured properly": human-judged relevance with explicit non-relevant judgments, two to three relevant passages per query, so P@5, R@5 and F1@5 are meaningful; J@5 bounds the unjudged share of each top 5.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| minilm-l6 | 0.008 (0.002–0.015) | 0.023 (0.007–0.045) | 0.011 (0.003–0.021) | 0.031 (0.012–0.054) | 0.013 (0.002–0.027) | 0.020 (0.007–0.037) | 0.021 (0.007–0.038) | 0.016 (0.007–0.028) |
| chroma-mem | 0.006 (0.001–0.013) | 0.014 (0.002–0.031) | 0.008 (0.001–0.018) | 0.021 (0.007–0.042) | 0.008 (0.000–0.018) | 0.013 (0.003–0.026) | 0.014 (0.004–0.027) | 0.014 (0.005–0.025) |
| chroma-mem-n1000 | 0.006 (0.001–0.013) | 0.014 (0.002–0.031) | 0.008 (0.001–0.018) | 0.021 (0.007–0.042) | 0.008 (0.000–0.018) | 0.013 (0.003–0.026) | 0.014 (0.004–0.027) | 0.014 (0.005–0.025) |
| chroma-mem-split | 0.005 (0.000–0.011) | 0.009 (0.000–0.021) | 0.006 (0.000–0.015) | 0.014 (0.002–0.031) | 0.007 (0.000–0.019) | 0.011 (0.000–0.026) | 0.010 (0.001–0.023) | 0.014 (0.006–0.025) |
| chroma-mem-split-n1000 | 0.005 (0.000–0.011) | 0.009 (0.000–0.021) | 0.006 (0.000–0.015) | 0.014 (0.002–0.031) | 0.007 (0.000–0.019) | 0.011 (0.000–0.026) | 0.010 (0.001–0.023) | 0.015 (0.006–0.027) |

## R@5 / F1@5 by query type

| Run | ko (213) |
|---|---|
| minilm-l6 | 0.023 / 0.011 |
| chroma-mem | 0.014 / 0.008 |
| chroma-mem-n1000 | 0.014 / 0.008 |
| chroma-mem-split | 0.009 / 0.006 |
| chroma-mem-split-n1000 | 0.009 / 0.006 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| chroma-mem − minilm-l6 | -0.002 (-0.005–0.000) | -0.009 (-0.023–0.000) | -0.003 (-0.008–0.000) | -0.009 (-0.023–0.000) | -0.005 (-0.014–0.000) | -0.007 (-0.019–0.000) | -0.008 (-0.020–0.000) | -0.002 (-0.005–0.000) |
| chroma-mem-n1000 − minilm-l6 | -0.002 (-0.005–0.000) | -0.009 (-0.023–0.000) | -0.003 (-0.008–0.000) | -0.009 (-0.023–0.000) | -0.005 (-0.014–0.000) | -0.007 (-0.019–0.000) | -0.008 (-0.020–0.000) | -0.002 (-0.005–0.000) |
| chroma-mem-split − minilm-l6 | -0.003 (-0.007–0.001) | -0.014 (-0.033–0.000) | -0.005 (-0.011–0.001) | -0.016 (-0.038–0.002) | -0.005 (-0.020–0.005) | -0.009 (-0.024–0.005) | -0.011 (-0.026–0.001) | -0.002 (-0.009–0.006) |
| chroma-mem-split-n1000 − minilm-l6 | -0.003 (-0.007–0.001) | -0.014 (-0.033–0.000) | -0.005 (-0.011–0.001) | -0.016 (-0.038–0.002) | -0.005 (-0.020–0.005) | -0.009 (-0.024–0.005) | -0.011 (-0.026–0.001) | -0.001 (-0.008–0.006) |
| chroma-mem-n1000 − chroma-mem | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) |
| chroma-mem-split − chroma-mem | -0.001 (-0.004–0.002) | -0.005 (-0.016–0.005) | -0.002 (-0.006–0.003) | -0.007 (-0.026–0.009) | -0.001 (-0.010–0.008) | -0.002 (-0.012–0.010) | -0.003 (-0.012–0.005) | -0.000 (-0.007–0.007) |
| chroma-mem-split-n1000 − chroma-mem | -0.001 (-0.004–0.002) | -0.005 (-0.016–0.005) | -0.002 (-0.006–0.003) | -0.007 (-0.026–0.009) | -0.001 (-0.010–0.008) | -0.002 (-0.012–0.010) | -0.003 (-0.012–0.005) | +0.001 (-0.006–0.008) |
