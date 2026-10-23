# miracl-en, vector only (exact, and chroma-mem, chroma-mem-n1000, chroma-mem-split, chroma-mem-split-n1000)

MIRACL en dev, human-judged, pooled corpus (mteb/MIRACLRetrievalHardNegatives @ 332a9acb, CC-BY-SA-4.0). 799 queries; each searches its project; a document scores as its best part; 95% intervals from 2000 bootstrap resamples over queries. The chroma-mem rows search the release vectors in Chroma 1.4.4 through chroma-mem's bench, each query filtered to its scope by a where, asking for 200 parts (n1000: 1,000) and keeping each document's best; split replaces rows over 254 word pieces with chroma-mem's pieces of them, embedded by chroma-mem.

MIRACL answers "how accurate is it, measured properly": human-judged relevance with explicit non-relevant judgments, two to three relevant passages per query, so P@5, R@5 and F1@5 are meaningful; J@5 bounds the unjudged share of each top 5.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| minilm-l6 | 0.159 (0.148–0.170) | 0.331 (0.306–0.356) | 0.195 (0.182–0.207) | 0.455 (0.427–0.482) | 0.205 (0.186–0.224) | 0.396 (0.369–0.423) | 0.336 (0.315–0.357) | 0.296 (0.280–0.313) |
| chroma-mem | 0.159 (0.148–0.170) | 0.331 (0.306–0.356) | 0.195 (0.182–0.207) | 0.455 (0.427–0.482) | 0.205 (0.186–0.224) | 0.396 (0.369–0.423) | 0.336 (0.315–0.357) | 0.296 (0.280–0.313) |
| chroma-mem-n1000 | 0.159 (0.148–0.170) | 0.331 (0.306–0.356) | 0.195 (0.182–0.207) | 0.455 (0.427–0.482) | 0.205 (0.186–0.224) | 0.396 (0.369–0.423) | 0.336 (0.315–0.357) | 0.296 (0.280–0.313) |
| chroma-mem-split | 0.159 (0.148–0.171) | 0.332 (0.307–0.358) | 0.196 (0.183–0.208) | 0.457 (0.430–0.485) | 0.209 (0.190–0.228) | 0.399 (0.373–0.426) | 0.339 (0.318–0.359) | 0.297 (0.280–0.313) |
| chroma-mem-split-n1000 | 0.159 (0.148–0.171) | 0.332 (0.307–0.358) | 0.196 (0.183–0.208) | 0.457 (0.430–0.485) | 0.209 (0.190–0.228) | 0.399 (0.373–0.426) | 0.339 (0.318–0.359) | 0.297 (0.280–0.313) |

## R@5 / F1@5 by query type

| Run | en (799) |
|---|---|
| minilm-l6 | 0.331 / 0.195 |
| chroma-mem | 0.331 / 0.195 |
| chroma-mem-n1000 | 0.331 / 0.195 |
| chroma-mem-split | 0.332 / 0.196 |
| chroma-mem-split-n1000 | 0.332 / 0.196 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| chroma-mem − minilm-l6 | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) |
| chroma-mem-n1000 − minilm-l6 | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) |
| chroma-mem-split − minilm-l6 | +0.001 (-0.001–0.003) | +0.001 (-0.004–0.006) | +0.001 (-0.002–0.004) | +0.003 (-0.002–0.008) | +0.003 (0.000–0.007) | +0.003 (-0.000–0.008) | +0.003 (-0.000–0.006) | +0.000 (-0.002–0.003) |
| chroma-mem-split-n1000 − minilm-l6 | +0.001 (-0.001–0.003) | +0.001 (-0.004–0.006) | +0.001 (-0.002–0.004) | +0.003 (-0.002–0.008) | +0.003 (0.000–0.007) | +0.003 (-0.000–0.008) | +0.003 (-0.000–0.006) | +0.000 (-0.002–0.003) |
| chroma-mem-n1000 − chroma-mem | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) |
| chroma-mem-split − chroma-mem | +0.001 (-0.001–0.003) | +0.001 (-0.004–0.006) | +0.001 (-0.002–0.004) | +0.003 (-0.002–0.008) | +0.003 (0.000–0.007) | +0.003 (-0.000–0.008) | +0.003 (-0.000–0.006) | +0.000 (-0.002–0.003) |
| chroma-mem-split-n1000 − chroma-mem | +0.001 (-0.001–0.003) | +0.001 (-0.004–0.006) | +0.001 (-0.002–0.004) | +0.003 (-0.002–0.008) | +0.003 (0.000–0.007) | +0.003 (-0.000–0.008) | +0.003 (-0.000–0.006) | +0.000 (-0.002–0.003) |
