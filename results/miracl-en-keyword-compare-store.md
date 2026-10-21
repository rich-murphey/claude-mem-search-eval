# miracl-en: server keyword search before and after, keyword only, no vectors (store)

MIRACL en dev, human-judged, pooled corpus (mteb/MIRACLRetrievalHardNegatives @ 332a9acb, CC-BY-SA-4.0). 799 queries; every document in one claude-mem project, searched by every query; a document is one observation; top 10; no vectors. Runs are described at the top of src/keyword-compare.ts.

MIRACL answers "how accurate is it, measured properly": human-judged relevance with explicit non-relevant judgments, two to three relevant passages per query, so P@5, R@5 and F1@5 are meaningful; J@5 bounds the unjudged share of each top 5.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| before | 0.125 (0.113–0.138) | 0.218 (0.197–0.241) | 0.144 (0.130–0.158) | 0.275 (0.251–0.299) | 0.161 (0.143–0.180) | 0.297 (0.269–0.325) | 0.231 (0.210–0.251) | 0.264 (0.245–0.283) |
| widened, ts_rank | 0.148 (0.136–0.161) | 0.270 (0.247–0.293) | 0.172 (0.159–0.186) | 0.344 (0.318–0.370) | 0.194 (0.174–0.215) | 0.357 (0.329–0.385) | 0.283 (0.261–0.304) | 0.326 (0.307–0.344) |
| after, ts_rank | 0.152 (0.141–0.165) | 0.285 (0.262–0.309) | 0.179 (0.166–0.192) | 0.393 (0.367–0.419) | 0.195 (0.175–0.215) | 0.352 (0.325–0.379) | 0.299 (0.278–0.319) | 0.363 (0.345–0.381) |
| after, pg_textsearch | 0.152 (0.140–0.165) | 0.284 (0.260–0.309) | 0.178 (0.165–0.192) | 0.389 (0.362–0.416) | 0.196 (0.176–0.217) | 0.348 (0.320–0.376) | 0.300 (0.277–0.321) | 0.367 (0.348–0.388) |
| bare pg_textsearch | 0.152 (0.140–0.165) | 0.284 (0.260–0.309) | 0.178 (0.165–0.192) | 0.389 (0.362–0.416) | 0.196 (0.176–0.217) | 0.348 (0.320–0.376) | 0.300 (0.277–0.321) | 0.367 (0.348–0.388) |

## R@5 / F1@5 by query type

| Run | en (799) |
|---|---|
| before | 0.218 / 0.144 |
| widened, ts_rank | 0.270 / 0.172 |
| after, ts_rank | 0.285 / 0.179 |
| after, pg_textsearch | 0.284 / 0.178 |
| bare pg_textsearch | 0.284 / 0.178 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| widened, ts_rank − before | +0.023 (0.017–0.029) | +0.051 (0.038–0.065) | +0.029 (0.022–0.036) | +0.069 (0.054–0.085) | +0.033 (0.023–0.044) | +0.059 (0.044–0.075) | +0.052 (0.040–0.064) | +0.062 (0.050–0.074) |
| after, ts_rank − before | +0.027 (0.016–0.038) | +0.067 (0.046–0.088) | +0.035 (0.022–0.047) | +0.118 (0.096–0.141) | +0.033 (0.015–0.051) | +0.055 (0.031–0.080) | +0.068 (0.051–0.086) | +0.099 (0.081–0.117) |
| after, pg_textsearch − before | +0.027 (0.014–0.040) | +0.065 (0.038–0.092) | +0.034 (0.019–0.050) | +0.115 (0.086–0.144) | +0.035 (0.014–0.056) | +0.051 (0.021–0.081) | +0.069 (0.046–0.092) | +0.103 (0.081–0.127) |
| bare pg_textsearch − before | +0.027 (0.014–0.040) | +0.065 (0.038–0.092) | +0.034 (0.019–0.050) | +0.115 (0.086–0.144) | +0.035 (0.014–0.056) | +0.051 (0.021–0.081) | +0.069 (0.046–0.092) | +0.103 (0.081–0.127) |

## Timing

- load and index 96s
- before: 799 searches 3.5s, 4.4 ms per query
- widened, ts_rank: 799 searches 20.6s, 25.8 ms per query
- after, ts_rank: 799 searches 104.6s, 130.9 ms per query
- after, pg_textsearch: 799 searches 3.0s, 3.8 ms per query
- bare pg_textsearch: 799 searches 2.1s, 2.6 ms per query
