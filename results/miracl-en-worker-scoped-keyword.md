# miracl-en through claude-mem's worker search (scoped)

MIRACL en dev, human-judged, pooled corpus (mteb/MIRACLRetrievalHardNegatives @ 332a9acb, CC-BY-SA-4.0). 799 queries; each query searches its claude-mem project; a document is one observation whose facts are its parts; top 10 from SearchManager.search; 95% intervals from 2000 bootstrap resamples over queries.

MIRACL answers "how accurate is it, measured properly": human-judged relevance with explicit non-relevant judgments, two to three relevant passages per query, so P@5, R@5 and F1@5 are meaningful; J@5 bounds the unjudged share of each top 5.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| worker keyword | 0.108 (0.098–0.119) | 0.214 (0.191–0.237) | 0.129 (0.118–0.141) | 0.283 (0.257–0.308) | 0.149 (0.131–0.168) | 0.284 (0.257–0.312) | 0.226 (0.205–0.247) | 0.277 (0.258–0.296) |

## R@5 / F1@5 by query type

| Run | en (799) |
|---|---|
| worker keyword | 0.214 / 0.129 |

## Timing

- seed SQLite 135s
- 799 worker keyword searches 371s
