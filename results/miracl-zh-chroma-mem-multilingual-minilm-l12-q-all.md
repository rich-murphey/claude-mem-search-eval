# miracl-zh, vector only (exact, and minilm-l6-split, multilingual-minilm-l12-q)

MIRACL zh dev, human-judged, pooled corpus (mteb/MIRACLRetrievalHardNegatives @ 332a9acb, CC-BY-SA-4.0). 393 queries; each searches its project; a document scores as its best part; 95% intervals from 2000 bootstrap resamples over queries. The chroma-mem rows search Chroma 1.4.4 through chroma-mem's bench, each query filtered to its scope by a where, asking for 200 parts and keeping each document's best. minilm-l6-split is the release minilm-l6 vectors with rows over 254 word pieces replaced by chroma-mem's pieces of them; multilingual-minilm-l12-q embeds every row and query in chroma-mem (bench load --embed, bench query --embed), split at its piece budget.

MIRACL answers "how accurate is it, measured properly": human-judged relevance with explicit non-relevant judgments, two to three relevant passages per query, so P@5, R@5 and F1@5 are meaningful; J@5 bounds the unjudged share of each top 5.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| minilm-l6 | 0.001 (0.000–0.003) | 0.003 (0.000–0.009) | 0.001 (0.000–0.004) | 0.008 (0.001–0.017) | 0.000 (0.000–0.001) | 0.002 (0.000–0.005) | 0.003 (0.001–0.007) | 0.015 (0.009–0.022) |
| minilm-l6-split | 0.002 (0.000–0.004) | 0.004 (0.000–0.010) | 0.002 (0.000–0.004) | 0.006 (0.001–0.014) | 0.000 (0.000–0.001) | 0.002 (0.001–0.005) | 0.003 (0.001–0.006) | 0.017 (0.011–0.024) |
| multilingual-minilm-l12-q | 0.124 (0.107–0.142) | 0.264 (0.226–0.300) | 0.154 (0.134–0.175) | 0.397 (0.355–0.439) | 0.158 (0.132–0.185) | 0.287 (0.250–0.324) | 0.272 (0.242–0.304) | 0.275 (0.251–0.299) |

## R@5 / F1@5 by query type

| Run | zh (393) |
|---|---|
| minilm-l6 | 0.003 / 0.001 |
| minilm-l6-split | 0.004 / 0.002 |
| multilingual-minilm-l12-q | 0.264 / 0.154 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| minilm-l6-split − minilm-l6 | +0.001 (0.000–0.002) | +0.001 (0.000–0.003) | +0.001 (0.000–0.002) | -0.002 (-0.008–0.003) | +0.000 (0.000–0.000) | -0.000 (-0.002–0.001) | -0.000 (-0.003–0.001) | +0.002 (-0.001–0.005) |
| multilingual-minilm-l12-q − minilm-l6 | +0.123 (0.105–0.141) | +0.261 (0.223–0.298) | +0.153 (0.133–0.174) | +0.389 (0.345–0.431) | +0.158 (0.131–0.185) | +0.284 (0.248–0.322) | +0.269 (0.238–0.301) | +0.260 (0.236–0.284) |
| multilingual-minilm-l12-q − minilm-l6-split | +0.123 (0.105–0.140) | +0.260 (0.222–0.297) | +0.153 (0.132–0.173) | +0.390 (0.347–0.433) | +0.158 (0.131–0.185) | +0.284 (0.249–0.322) | +0.270 (0.238–0.302) | +0.258 (0.234–0.281) |
