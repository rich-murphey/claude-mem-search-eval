# miracl-ko, vector only (exact, and minilm-l6-split, multilingual-minilm-l12-q)

MIRACL ko dev, human-judged, pooled corpus (mteb/MIRACLRetrievalHardNegatives @ 332a9acb, CC-BY-SA-4.0). 213 queries; each searches its project; a document scores as its best part; 95% intervals from 2000 bootstrap resamples over queries. The chroma-mem rows search Chroma 1.4.4 through chroma-mem's bench, each query filtered to its scope by a where, asking for 200 parts and keeping each document's best. minilm-l6-split is the release minilm-l6 vectors with rows over 254 word pieces replaced by chroma-mem's pieces of them; multilingual-minilm-l12-q embeds every row and query in chroma-mem (bench load --embed, bench query --embed), split at its piece budget.

MIRACL answers "how accurate is it, measured properly": human-judged relevance with explicit non-relevant judgments, two to three relevant passages per query, so P@5, R@5 and F1@5 are meaningful; J@5 bounds the unjudged share of each top 5.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| minilm-l6 | 0.008 (0.002–0.015) | 0.023 (0.007–0.045) | 0.011 (0.003–0.021) | 0.031 (0.012–0.054) | 0.013 (0.002–0.027) | 0.020 (0.007–0.037) | 0.021 (0.007–0.038) | 0.016 (0.007–0.028) |
| minilm-l6-split | 0.005 (0.000–0.011) | 0.009 (0.000–0.021) | 0.006 (0.000–0.015) | 0.009 (0.000–0.021) | 0.007 (0.000–0.019) | 0.011 (0.000–0.025) | 0.009 (0.000–0.021) | 0.014 (0.005–0.026) |
| multilingual-minilm-l12-q | 0.140 (0.117–0.164) | 0.311 (0.260–0.362) | 0.169 (0.144–0.195) | 0.365 (0.312–0.418) | 0.219 (0.174–0.267) | 0.341 (0.289–0.394) | 0.296 (0.252–0.341) | 0.278 (0.245–0.314) |

## R@5 / F1@5 by query type

| Run | ko (213) |
|---|---|
| minilm-l6 | 0.023 / 0.011 |
| minilm-l6-split | 0.009 / 0.006 |
| multilingual-minilm-l12-q | 0.311 / 0.169 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| minilm-l6-split − minilm-l6 | -0.003 (-0.007–0.001) | -0.014 (-0.033–0.000) | -0.005 (-0.011–0.001) | -0.021 (-0.042–-0.005) | -0.005 (-0.020–0.005) | -0.009 (-0.025–0.005) | -0.012 (-0.027–-0.000) | -0.002 (-0.009–0.006) |
| multilingual-minilm-l12-q − minilm-l6 | +0.132 (0.111–0.156) | +0.287 (0.237–0.339) | +0.158 (0.134–0.184) | +0.334 (0.282–0.387) | +0.207 (0.161–0.255) | +0.321 (0.270–0.376) | +0.275 (0.232–0.319) | +0.262 (0.228–0.299) |
| multilingual-minilm-l12-q − minilm-l6-split | +0.135 (0.114–0.159) | +0.301 (0.250–0.353) | +0.162 (0.139–0.187) | +0.355 (0.302–0.408) | +0.212 (0.169–0.259) | +0.330 (0.278–0.385) | +0.287 (0.243–0.332) | +0.264 (0.229–0.300) |
