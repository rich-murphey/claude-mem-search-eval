# miracl-ja, vector only (exact, and chroma-mem, chroma-mem-n1000, chroma-mem-split, chroma-mem-split-n1000)

MIRACL ja dev, human-judged, pooled corpus (mteb/MIRACLRetrievalHardNegatives @ 332a9acb, CC-BY-SA-4.0). 860 queries; each searches its project; a document scores as its best part; 95% intervals from 2000 bootstrap resamples over queries. The chroma-mem rows search the release vectors in Chroma 1.4.4 through chroma-mem's bench, each query filtered to its scope by a where, asking for 200 parts (n1000: 1,000) and keeping each document's best; split replaces rows over 254 word pieces with chroma-mem's pieces of them, embedded by chroma-mem.

MIRACL answers "how accurate is it, measured properly": human-judged relevance with explicit non-relevant judgments, two to three relevant passages per query, so P@5, R@5 and F1@5 are meaningful; J@5 bounds the unjudged share of each top 5.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| minilm-l6 | 0.004 (0.002–0.006) | 0.010 (0.005–0.016) | 0.005 (0.003–0.008) | 0.016 (0.010–0.024) | 0.007 (0.003–0.011) | 0.014 (0.008–0.020) | 0.011 (0.006–0.016) | 0.010 (0.007–0.013) |
| chroma-mem | 0.004 (0.002–0.006) | 0.010 (0.005–0.016) | 0.005 (0.003–0.008) | 0.016 (0.010–0.024) | 0.007 (0.003–0.011) | 0.014 (0.008–0.020) | 0.011 (0.006–0.016) | 0.010 (0.007–0.013) |
| chroma-mem-n1000 | 0.004 (0.002–0.006) | 0.010 (0.005–0.016) | 0.005 (0.003–0.008) | 0.016 (0.010–0.024) | 0.007 (0.003–0.011) | 0.014 (0.008–0.020) | 0.011 (0.006–0.016) | 0.010 (0.007–0.013) |
| chroma-mem-split | 0.004 (0.002–0.006) | 0.010 (0.005–0.016) | 0.005 (0.003–0.008) | 0.014 (0.008–0.022) | 0.006 (0.002–0.010) | 0.012 (0.006–0.018) | 0.010 (0.005–0.014) | 0.013 (0.010–0.016) |
| chroma-mem-split-n1000 | 0.004 (0.002–0.006) | 0.010 (0.005–0.016) | 0.005 (0.003–0.008) | 0.014 (0.008–0.022) | 0.006 (0.002–0.010) | 0.012 (0.006–0.018) | 0.010 (0.005–0.014) | 0.013 (0.010–0.017) |

## R@5 / F1@5 by query type

| Run | ja (860) |
|---|---|
| minilm-l6 | 0.010 / 0.005 |
| chroma-mem | 0.010 / 0.005 |
| chroma-mem-n1000 | 0.010 / 0.005 |
| chroma-mem-split | 0.010 / 0.005 |
| chroma-mem-split-n1000 | 0.010 / 0.005 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| chroma-mem − minilm-l6 | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) |
| chroma-mem-n1000 − minilm-l6 | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) |
| chroma-mem-split − minilm-l6 | +0.000 (-0.001–0.001) | +0.000 (-0.001–0.001) | +0.000 (-0.001–0.001) | -0.002 (-0.005–0.000) | -0.001 (-0.002–0.001) | -0.002 (-0.004–-0.000) | -0.001 (-0.003–-0.000) | +0.003 (0.001–0.006) |
| chroma-mem-split-n1000 − minilm-l6 | +0.000 (-0.001–0.001) | +0.000 (-0.001–0.001) | +0.000 (-0.001–0.001) | -0.002 (-0.005–0.000) | -0.001 (-0.002–0.001) | -0.002 (-0.004–-0.000) | -0.001 (-0.003–-0.000) | +0.003 (0.001–0.006) |
| chroma-mem-n1000 − chroma-mem | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) |
| chroma-mem-split − chroma-mem | +0.000 (-0.001–0.001) | +0.000 (-0.001–0.001) | +0.000 (-0.001–0.001) | -0.002 (-0.005–0.000) | -0.001 (-0.002–0.001) | -0.002 (-0.004–-0.000) | -0.001 (-0.003–-0.000) | +0.003 (0.001–0.006) |
| chroma-mem-split-n1000 − chroma-mem | +0.000 (-0.001–0.001) | +0.000 (-0.001–0.001) | +0.000 (-0.001–0.001) | -0.002 (-0.005–0.000) | -0.001 (-0.002–0.001) | -0.002 (-0.004–-0.000) | -0.001 (-0.003–-0.000) | +0.003 (0.001–0.006) |
