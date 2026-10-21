# miracl-ko: server keyword search before and after, keyword only, no vectors (store)

MIRACL ko dev, human-judged, pooled corpus (mteb/MIRACLRetrievalHardNegatives @ 332a9acb, CC-BY-SA-4.0). 213 queries; every document in one claude-mem project, searched by every query; a document is one observation; top 10; no vectors. Runs are described at the top of src/keyword-compare.ts.

MIRACL answers "how accurate is it, measured properly": human-judged relevance with explicit non-relevant judgments, two to three relevant passages per query, so P@5, R@5 and F1@5 are meaningful; J@5 bounds the unjudged share of each top 5.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| before | 0.001 (0.000–0.003) | 0.001 (0.000–0.004) | 0.001 (0.000–0.003) | 0.001 (0.000–0.004) | 0.001 (0.000–0.004) | 0.005 (0.000–0.014) | 0.002 (0.000–0.005) | 0.005 (0.000–0.011) |
| widened, ts_rank | 0.096 (0.079–0.114) | 0.295 (0.242–0.354) | 0.132 (0.110–0.157) | 0.334 (0.281–0.397) | 0.230 (0.180–0.282) | 0.326 (0.268–0.386) | 0.290 (0.240–0.342) | 0.270 (0.237–0.309) |
| after, ts_rank | 0.096 (0.079–0.114) | 0.295 (0.242–0.354) | 0.132 (0.110–0.157) | 0.334 (0.281–0.397) | 0.230 (0.180–0.282) | 0.326 (0.268–0.386) | 0.290 (0.240–0.342) | 0.272 (0.238–0.310) |
| after, pg_textsearch | 0.092 (0.075–0.109) | 0.289 (0.234–0.348) | 0.128 (0.105–0.152) | 0.332 (0.277–0.392) | 0.243 (0.190–0.297) | 0.328 (0.270–0.386) | 0.293 (0.240–0.348) | 0.260 (0.225–0.300) |
| bare pg_textsearch | 0.092 (0.075–0.109) | 0.289 (0.234–0.348) | 0.128 (0.105–0.152) | 0.332 (0.277–0.392) | 0.243 (0.190–0.297) | 0.328 (0.270–0.386) | 0.293 (0.240–0.348) | 0.260 (0.225–0.300) |

## R@5 / F1@5 by query type

| Run | ko (213) |
|---|---|
| before | 0.001 / 0.001 |
| widened, ts_rank | 0.295 / 0.132 |
| after, ts_rank | 0.295 / 0.132 |
| after, pg_textsearch | 0.289 / 0.128 |
| bare pg_textsearch | 0.289 / 0.128 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| widened, ts_rank − before | +0.095 (0.079–0.113) | +0.294 (0.241–0.353) | +0.131 (0.109–0.156) | +0.333 (0.280–0.396) | +0.228 (0.178–0.281) | +0.322 (0.264–0.381) | +0.288 (0.238–0.341) | +0.266 (0.231–0.304) |
| after, ts_rank − before | +0.095 (0.079–0.113) | +0.294 (0.241–0.353) | +0.131 (0.109–0.156) | +0.333 (0.280–0.396) | +0.228 (0.178–0.281) | +0.322 (0.264–0.381) | +0.288 (0.238–0.341) | +0.268 (0.233–0.306) |
| after, pg_textsearch − before | +0.091 (0.074–0.108) | +0.287 (0.232–0.346) | +0.127 (0.104–0.151) | +0.331 (0.275–0.390) | +0.241 (0.188–0.296) | +0.323 (0.261–0.383) | +0.291 (0.238–0.346) | +0.255 (0.219–0.296) |
| bare pg_textsearch − before | +0.091 (0.074–0.108) | +0.287 (0.232–0.346) | +0.127 (0.104–0.151) | +0.331 (0.275–0.390) | +0.241 (0.188–0.296) | +0.323 (0.261–0.383) | +0.291 (0.238–0.346) | +0.255 (0.219–0.296) |

## Timing

- load and index 34s
- before: 213 searches 1.1s, 5.4 ms per query
- widened, ts_rank: 213 searches 5.4s, 25.5 ms per query
- after, ts_rank: 213 searches 4.2s, 19.7 ms per query
- after, pg_textsearch: 213 searches 0.5s, 2.3 ms per query
- bare pg_textsearch: 213 searches 0.2s, 1.2 ms per query
