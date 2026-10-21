# miracl-ja: server keyword search before and after, keyword only, no vectors (store)

MIRACL ja dev, human-judged, pooled corpus (mteb/MIRACLRetrievalHardNegatives @ 332a9acb, CC-BY-SA-4.0). 860 queries; every document in one claude-mem project, searched by every query; a document is one observation; top 10; no vectors. Runs are described at the top of src/keyword-compare.ts.

MIRACL answers "how accurate is it, measured properly": human-judged relevance with explicit non-relevant judgments, two to three relevant passages per query, so P@5, R@5 and F1@5 are meaningful; J@5 bounds the unjudged share of each top 5.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| before | 0.000 (0.000–0.001) | 0.001 (0.000–0.003) | 0.000 (0.000–0.001) | 0.001 (0.000–0.003) | 0.001 (0.000–0.003) | 0.001 (0.000–0.003) | 0.001 (0.000–0.003) | 0.000 (0.000–0.001) |
| widened, ts_rank | 0.001 (0.000–0.002) | 0.003 (0.000–0.007) | 0.001 (0.000–0.003) | 0.003 (0.000–0.007) | 0.003 (0.000–0.007) | 0.003 (0.000–0.008) | 0.003 (0.000–0.007) | 0.001 (0.000–0.003) |
| after, ts_rank | 0.026 (0.021–0.031) | 0.088 (0.071–0.106) | 0.039 (0.031–0.046) | 0.115 (0.096–0.135) | 0.051 (0.038–0.064) | 0.080 (0.064–0.096) | 0.082 (0.067–0.097) | 0.066 (0.056–0.077) |
| after, pg_textsearch | 0.018 (0.013–0.022) | 0.060 (0.046–0.074) | 0.026 (0.020–0.032) | 0.079 (0.062–0.096) | 0.037 (0.026–0.048) | 0.059 (0.044–0.073) | 0.057 (0.044–0.070) | 0.044 (0.036–0.052) |
| bare pg_textsearch | 0.018 (0.013–0.022) | 0.060 (0.046–0.074) | 0.026 (0.020–0.032) | 0.079 (0.062–0.096) | 0.037 (0.026–0.048) | 0.059 (0.044–0.073) | 0.057 (0.044–0.070) | 0.044 (0.036–0.052) |

## R@5 / F1@5 by query type

| Run | ja (860) |
|---|---|
| before | 0.001 / 0.000 |
| widened, ts_rank | 0.003 / 0.001 |
| after, ts_rank | 0.088 / 0.039 |
| after, pg_textsearch | 0.060 / 0.026 |
| bare pg_textsearch | 0.060 / 0.026 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| widened, ts_rank − before | +0.001 (0.000–0.002) | +0.002 (0.000–0.004) | +0.001 (0.000–0.002) | +0.002 (0.000–0.005) | +0.002 (0.000–0.004) | +0.002 (0.000–0.006) | +0.002 (0.000–0.005) | +0.001 (0.000–0.003) |
| after, ts_rank − before | +0.026 (0.021–0.031) | +0.087 (0.069–0.105) | +0.038 (0.031–0.046) | +0.114 (0.094–0.134) | +0.050 (0.037–0.063) | +0.078 (0.063–0.095) | +0.081 (0.066–0.096) | +0.066 (0.055–0.077) |
| after, pg_textsearch − before | +0.017 (0.013–0.022) | +0.059 (0.045–0.073) | +0.026 (0.020–0.032) | +0.078 (0.061–0.095) | +0.036 (0.025–0.047) | +0.058 (0.043–0.073) | +0.056 (0.043–0.069) | +0.044 (0.036–0.052) |
| bare pg_textsearch − before | +0.017 (0.013–0.022) | +0.059 (0.045–0.073) | +0.026 (0.020–0.032) | +0.078 (0.061–0.095) | +0.036 (0.025–0.047) | +0.058 (0.043–0.073) | +0.056 (0.043–0.069) | +0.044 (0.036–0.052) |

## Timing

- load and index 78s
- before: 860 searches 1.9s, 2.2 ms per query
- widened, ts_rank: 860 searches 2.3s, 2.7 ms per query
- after, ts_rank: 860 searches 3.3s, 3.8 ms per query
- after, pg_textsearch: 860 searches 1.3s, 1.5 ms per query
- bare pg_textsearch: 860 searches 0.7s, 0.8 ms per query
