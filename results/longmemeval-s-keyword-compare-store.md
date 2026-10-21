# longmemeval-s: server keyword search before and after, keyword only, no vectors (store)

LongMemEval-S cleaned (xiaowu0162/longmemeval-cleaned @ 98d7416c, MIT). 470 queries; every document in one claude-mem project, searched by every query; a document is one observation; top 10; no vectors. Runs are described at the top of src/keyword-compare.ts.

LongMemEval answers whether a model change costs English memory search accuracy.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| before | 0.044 (0.036–0.052) | 0.135 (0.109–0.161) | 0.065 (0.053–0.077) | 0.174 (0.145–0.204) | 0.084 (0.064–0.104) | 0.143 (0.115–0.169) | 0.129 (0.106–0.152) |
| widened, ts_rank | 0.079 (0.069–0.089) | 0.264 (0.230–0.298) | 0.118 (0.104–0.133) | 0.327 (0.290–0.364) | 0.153 (0.126–0.182) | 0.249 (0.216–0.282) | 0.240 (0.211–0.269) |
| after, ts_rank | 0.086 (0.076–0.097) | 0.283 (0.246–0.318) | 0.129 (0.113–0.145) | 0.360 (0.322–0.398) | 0.149 (0.123–0.177) | 0.253 (0.221–0.284) | 0.252 (0.224–0.282) |
| after, pg_textsearch | 0.107 (0.095–0.118) | 0.350 (0.311–0.387) | 0.159 (0.142–0.176) | 0.424 (0.384–0.462) | 0.218 (0.184–0.251) | 0.326 (0.290–0.361) | 0.320 (0.287–0.352) |
| bare pg_textsearch | 0.107 (0.095–0.118) | 0.350 (0.311–0.387) | 0.159 (0.142–0.176) | 0.424 (0.384–0.462) | 0.218 (0.184–0.251) | 0.326 (0.290–0.361) | 0.320 (0.287–0.352) |

## R@5 / F1@5 by query type

| Run | knowledge-update (72) | multi-session (121) | single-session-assistant (56) | single-session-preference (30) | single-session-user (64) | temporal-reasoning (127) |
|---|---|---|---|---|---|---|
| before | 0.299 / 0.171 | 0.061 / 0.036 | 0.036 / 0.012 | 0.033 / 0.011 | 0.328 / 0.109 | 0.083 / 0.047 |
| widened, ts_rank | 0.382 / 0.218 | 0.108 / 0.066 | 0.589 / 0.196 | 0.033 / 0.011 | 0.391 / 0.130 | 0.192 / 0.096 |
| after, ts_rank | 0.417 / 0.238 | 0.156 / 0.093 | 0.589 / 0.196 | 0.033 / 0.011 | 0.406 / 0.135 | 0.191 / 0.096 |
| after, pg_textsearch | 0.479 / 0.274 | 0.192 / 0.117 | 0.946 / 0.315 | 0.067 / 0.022 | 0.344 / 0.115 | 0.234 / 0.121 |
| bare pg_textsearch | 0.479 / 0.274 | 0.192 / 0.117 | 0.946 / 0.315 | 0.067 / 0.022 | 0.344 / 0.115 | 0.234 / 0.121 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| widened, ts_rank − before | +0.034 (0.028–0.042) | +0.129 (0.103–0.157) | +0.053 (0.043–0.065) | +0.152 (0.124–0.183) | +0.070 (0.049–0.092) | +0.107 (0.083–0.132) | +0.110 (0.088–0.135) |
| after, ts_rank − before | +0.042 (0.033–0.051) | +0.148 (0.115–0.180) | +0.064 (0.049–0.077) | +0.186 (0.151–0.222) | +0.065 (0.038–0.092) | +0.110 (0.080–0.140) | +0.123 (0.096–0.150) |
| after, pg_textsearch − before | +0.063 (0.051–0.074) | +0.215 (0.176–0.257) | +0.094 (0.077–0.112) | +0.249 (0.208–0.292) | +0.134 (0.098–0.171) | +0.183 (0.144–0.223) | +0.191 (0.155–0.227) |
| bare pg_textsearch − before | +0.063 (0.051–0.074) | +0.215 (0.176–0.257) | +0.094 (0.077–0.112) | +0.249 (0.208–0.292) | +0.134 (0.098–0.171) | +0.183 (0.144–0.223) | +0.191 (0.155–0.227) |

## Timing

- load and index 129s
- before: 470 searches 79.7s, 169.6 ms per query
- widened, ts_rank: 470 searches 173.8s, 369.8 ms per query
- after, ts_rank: 470 searches 168.7s, 358.9 ms per query
- after, pg_textsearch: 470 searches 2.8s, 5.9 ms per query
- bare pg_textsearch: 470 searches 1.5s, 3.2 ms per query
