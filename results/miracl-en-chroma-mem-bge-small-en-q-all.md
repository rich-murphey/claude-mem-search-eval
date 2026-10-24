# miracl-en, vector only (exact, and minilm-l6-split, bge-small-en-q)

MIRACL en dev, human-judged, pooled corpus (mteb/MIRACLRetrievalHardNegatives @ 332a9acb, CC-BY-SA-4.0). 799 queries; each searches its project; a document scores as its best part; 95% intervals from 2000 bootstrap resamples over queries. The chroma-mem rows search Chroma 1.4.4 through chroma-mem's bench, each query filtered to its scope by a where, asking for 200 parts and keeping each document's best. minilm-l6-split is the release minilm-l6 vectors with rows over 254 word pieces replaced by chroma-mem's pieces of them; bge-small-en-q embeds every row and query in chroma-mem (bench load --embed, bench query --embed), split at its piece budget.

MIRACL answers "how accurate is it, measured properly": human-judged relevance with explicit non-relevant judgments, two to three relevant passages per query, so P@5, R@5 and F1@5 are meaningful; J@5 bounds the unjudged share of each top 5.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| minilm-l6 | 0.159 (0.148–0.170) | 0.331 (0.306–0.356) | 0.195 (0.182–0.207) | 0.455 (0.427–0.482) | 0.205 (0.186–0.224) | 0.396 (0.369–0.423) | 0.336 (0.315–0.357) | 0.296 (0.280–0.313) |
| minilm-l6-split | 0.160 (0.148–0.171) | 0.333 (0.308–0.358) | 0.196 (0.183–0.209) | 0.457 (0.430–0.485) | 0.209 (0.190–0.228) | 0.399 (0.373–0.426) | 0.339 (0.318–0.359) | 0.297 (0.280–0.313) |
| bge-small-en-q | 0.229 (0.216–0.242) | 0.479 (0.452–0.506) | 0.281 (0.267–0.295) | 0.592 (0.566–0.618) | 0.326 (0.302–0.349) | 0.560 (0.531–0.587) | 0.480 (0.458–0.502) | 0.393 (0.376–0.410) |

## R@5 / F1@5 by query type

| Run | en (799) |
|---|---|
| minilm-l6 | 0.331 / 0.195 |
| minilm-l6-split | 0.333 / 0.196 |
| bge-small-en-q | 0.479 / 0.281 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| minilm-l6-split − minilm-l6 | +0.001 (-0.001–0.003) | +0.002 (-0.003–0.007) | +0.001 (-0.001–0.004) | +0.003 (-0.002–0.008) | +0.003 (0.000–0.007) | +0.003 (-0.000–0.008) | +0.003 (-0.000–0.006) | +0.000 (-0.002–0.003) |
| bge-small-en-q − minilm-l6 | +0.070 (0.059–0.082) | +0.148 (0.123–0.175) | +0.086 (0.073–0.101) | +0.137 (0.113–0.164) | +0.120 (0.098–0.143) | +0.164 (0.137–0.189) | +0.144 (0.125–0.162) | +0.096 (0.081–0.113) |
| bge-small-en-q − minilm-l6-split | +0.069 (0.058–0.081) | +0.146 (0.121–0.173) | +0.085 (0.072–0.099) | +0.134 (0.111–0.161) | +0.117 (0.095–0.141) | +0.160 (0.133–0.187) | +0.141 (0.122–0.160) | +0.096 (0.080–0.113) |
