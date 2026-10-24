# miracl-en, vector only (exact)

MIRACL en dev, human-judged, pooled corpus (mteb/MIRACLRetrievalHardNegatives @ 332a9acb, CC-BY-SA-4.0). 799 queries; each searches its project; a document scores as its best part; 95% intervals from 2000 bootstrap resamples over queries.

MIRACL answers "how accurate is it, measured properly": human-judged relevance with explicit non-relevant judgments, two to three relevant passages per query, so P@5, R@5 and F1@5 are meaningful; J@5 bounds the unjudged share of each top 5.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| minilm-l6 | 0.159 (0.148–0.170) | 0.331 (0.306–0.356) | 0.195 (0.182–0.207) | 0.455 (0.427–0.482) | 0.205 (0.186–0.224) | 0.396 (0.369–0.423) | 0.336 (0.315–0.357) | 0.296 (0.280–0.313) |
| multilingual-e5-small | 0.230 (0.218–0.244) | 0.478 (0.453–0.505) | 0.282 (0.268–0.296) | 0.603 (0.579–0.629) | 0.340 (0.317–0.364) | 0.581 (0.554–0.609) | 0.493 (0.472–0.517) | 0.394 (0.377–0.411) |
| bge-small-en | 0.229 (0.216–0.242) | 0.478 (0.452–0.505) | 0.281 (0.266–0.295) | 0.591 (0.565–0.617) | 0.326 (0.302–0.349) | 0.560 (0.531–0.587) | 0.479 (0.457–0.502) | 0.393 (0.376–0.410) |

## R@5 / F1@5 by query type

| Run | en (799) |
|---|---|
| minilm-l6 | 0.331 / 0.195 |
| multilingual-e5-small | 0.478 / 0.282 |
| bge-small-en | 0.478 / 0.281 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| multilingual-e5-small − minilm-l6 | +0.072 (0.061–0.083) | +0.147 (0.121–0.176) | +0.087 (0.074–0.102) | +0.149 (0.123–0.175) | +0.135 (0.109–0.160) | +0.185 (0.156–0.214) | +0.157 (0.136–0.179) | +0.098 (0.082–0.114) |
| bge-small-en − minilm-l6 | +0.070 (0.059–0.082) | +0.147 (0.123–0.174) | +0.086 (0.073–0.100) | +0.136 (0.112–0.163) | +0.120 (0.098–0.143) | +0.164 (0.137–0.189) | +0.143 (0.125–0.161) | +0.097 (0.081–0.113) |
| bge-small-en − multilingual-e5-small | -0.002 (-0.012–0.009) | +0.000 (-0.023–0.023) | -0.001 (-0.014–0.012) | -0.013 (-0.035–0.009) | -0.014 (-0.037–0.009) | -0.022 (-0.047–0.004) | -0.014 (-0.033–0.004) | -0.001 (-0.015–0.014) |
