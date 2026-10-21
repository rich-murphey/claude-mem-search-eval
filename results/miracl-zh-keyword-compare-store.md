# miracl-zh: server keyword search before and after, keyword only, no vectors (store)

MIRACL zh dev, human-judged, pooled corpus (mteb/MIRACLRetrievalHardNegatives @ 332a9acb, CC-BY-SA-4.0). 393 queries; every document in one claude-mem project, searched by every query; a document is one observation; top 10; no vectors. Runs are described at the top of src/keyword-compare.ts.

MIRACL answers "how accurate is it, measured properly": human-judged relevance with explicit non-relevant judgments, two to three relevant passages per query, so P@5, R@5 and F1@5 are meaningful; J@5 bounds the unjudged share of each top 5.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| before | 0.000 (0.000–0.000) | 0.000 (0.000–0.000) | 0.000 (0.000–0.000) | 0.000 (0.000–0.000) | 0.000 (0.000–0.000) | 0.000 (0.000–0.000) | 0.000 (0.000–0.000) | 0.000 (0.000–0.000) |
| widened, ts_rank | 0.000 (0.000–0.000) | 0.000 (0.000–0.000) | 0.000 (0.000–0.000) | 0.000 (0.000–0.000) | 0.000 (0.000–0.000) | 0.000 (0.000–0.000) | 0.000 (0.000–0.000) | 0.000 (0.000–0.000) |
| after, ts_rank | 0.002 (0.000–0.004) | 0.003 (0.000–0.007) | 0.002 (0.000–0.004) | 0.007 (0.001–0.016) | 0.001 (0.000–0.002) | 0.002 (0.000–0.005) | 0.003 (0.001–0.007) | 0.005 (0.001–0.009) |
| after, pg_textsearch | 0.001 (0.000–0.002) | 0.001 (0.000–0.004) | 0.001 (0.000–0.002) | 0.003 (0.000–0.006) | 0.000 (0.000–0.000) | 0.001 (0.000–0.002) | 0.001 (0.000–0.003) | 0.004 (0.001–0.008) |
| bare pg_textsearch | 0.001 (0.000–0.002) | 0.001 (0.000–0.004) | 0.001 (0.000–0.002) | 0.003 (0.000–0.006) | 0.000 (0.000–0.000) | 0.001 (0.000–0.002) | 0.001 (0.000–0.003) | 0.004 (0.001–0.008) |

## R@5 / F1@5 by query type

| Run | zh (393) |
|---|---|
| before | 0.000 / 0.000 |
| widened, ts_rank | 0.000 / 0.000 |
| after, ts_rank | 0.003 / 0.002 |
| after, pg_textsearch | 0.001 / 0.001 |
| bare pg_textsearch | 0.001 / 0.001 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| widened, ts_rank − before | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) | +0.000 (0.000–0.000) |
| after, ts_rank − before | +0.002 (0.000–0.004) | +0.003 (0.000–0.007) | +0.002 (0.000–0.004) | +0.007 (0.001–0.016) | +0.001 (0.000–0.002) | +0.002 (0.000–0.005) | +0.003 (0.001–0.007) | +0.005 (0.001–0.009) |
| after, pg_textsearch − before | +0.001 (0.000–0.002) | +0.001 (0.000–0.004) | +0.001 (0.000–0.002) | +0.003 (0.000–0.006) | +0.000 (0.000–0.000) | +0.001 (0.000–0.002) | +0.001 (0.000–0.003) | +0.004 (0.001–0.008) |
| bare pg_textsearch − before | +0.001 (0.000–0.002) | +0.001 (0.000–0.004) | +0.001 (0.000–0.002) | +0.003 (0.000–0.006) | +0.000 (0.000–0.000) | +0.001 (0.000–0.002) | +0.001 (0.000–0.003) | +0.004 (0.001–0.008) |

## Timing

- load and index 29s
- before: 393 searches 0.6s, 1.5 ms per query
- widened, ts_rank: 393 searches 0.7s, 1.9 ms per query
- after, ts_rank: 393 searches 0.7s, 1.7 ms per query
- after, pg_textsearch: 393 searches 0.4s, 1.0 ms per query
- bare pg_textsearch: 393 searches 0.2s, 0.5 ms per query
