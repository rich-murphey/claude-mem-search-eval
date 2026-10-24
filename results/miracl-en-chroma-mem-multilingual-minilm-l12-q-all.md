# miracl-en, vector only (exact, and minilm-l6-split, multilingual-minilm-l12-q)

MIRACL en dev, human-judged, pooled corpus (mteb/MIRACLRetrievalHardNegatives @ 332a9acb, CC-BY-SA-4.0). 799 queries; each searches its project; a document scores as its best part; 95% intervals from 2000 bootstrap resamples over queries. The chroma-mem rows search Chroma 1.4.4 through chroma-mem's bench, each query filtered to its scope by a where, asking for 200 parts and keeping each document's best. minilm-l6-split is the release minilm-l6 vectors with rows over 254 word pieces replaced by chroma-mem's pieces of them; multilingual-minilm-l12-q embeds every row and query in chroma-mem (bench load --embed, bench query --embed), split at its piece budget.

MIRACL answers "how accurate is it, measured properly": human-judged relevance with explicit non-relevant judgments, two to three relevant passages per query, so P@5, R@5 and F1@5 are meaningful; J@5 bounds the unjudged share of each top 5.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| minilm-l6 | 0.159 (0.148–0.170) | 0.331 (0.306–0.356) | 0.195 (0.182–0.207) | 0.455 (0.427–0.482) | 0.205 (0.186–0.224) | 0.396 (0.369–0.423) | 0.336 (0.315–0.357) | 0.296 (0.280–0.313) |
| minilm-l6-split | 0.160 (0.148–0.171) | 0.333 (0.308–0.358) | 0.196 (0.183–0.209) | 0.457 (0.430–0.485) | 0.209 (0.190–0.228) | 0.399 (0.373–0.426) | 0.339 (0.318–0.359) | 0.297 (0.280–0.313) |
| multilingual-minilm-l12-q | 0.177 (0.165–0.190) | 0.348 (0.324–0.374) | 0.213 (0.200–0.227) | 0.468 (0.442–0.496) | 0.247 (0.227–0.269) | 0.449 (0.420–0.477) | 0.372 (0.351–0.395) | 0.331 (0.314–0.348) |

## R@5 / F1@5 by query type

| Run | en (799) |
|---|---|
| minilm-l6 | 0.331 / 0.195 |
| minilm-l6-split | 0.333 / 0.196 |
| multilingual-minilm-l12-q | 0.348 / 0.213 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| minilm-l6-split − minilm-l6 | +0.001 (-0.001–0.003) | +0.002 (-0.003–0.007) | +0.001 (-0.001–0.004) | +0.003 (-0.002–0.008) | +0.003 (0.000–0.007) | +0.003 (-0.000–0.008) | +0.003 (-0.000–0.006) | +0.000 (-0.002–0.003) |
| multilingual-minilm-l12-q − minilm-l6 | +0.018 (0.007–0.029) | +0.017 (-0.008–0.043) | +0.019 (0.005–0.033) | +0.014 (-0.013–0.041) | +0.041 (0.019–0.064) | +0.053 (0.024–0.081) | +0.036 (0.016–0.056) | +0.035 (0.018–0.052) |
| multilingual-minilm-l12-q − minilm-l6-split | +0.017 (0.006–0.028) | +0.015 (-0.010–0.042) | +0.017 (0.003–0.031) | +0.011 (-0.016–0.038) | +0.038 (0.015–0.060) | +0.050 (0.020–0.077) | +0.033 (0.013–0.054) | +0.034 (0.018–0.052) |
