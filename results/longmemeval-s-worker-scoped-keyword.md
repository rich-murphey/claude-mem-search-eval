# longmemeval-s through claude-mem's worker search (scoped)

LongMemEval-S cleaned (xiaowu0162/longmemeval-cleaned @ 98d7416c, MIT). 470 queries; each query is its own claude-mem project holding its own haystack; a document is one observation whose facts are its parts; top 10 from SearchManager.search; 95% intervals from 2000 bootstrap resamples over queries.

LongMemEval answers whether a model change costs English memory search accuracy.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| worker keyword | 0.324 (0.310–0.339) | 0.890 (0.867–0.910) | 0.456 (0.440–0.472) | 0.932 (0.914–0.948) | 0.823 (0.793–0.850) | 0.920 (0.898–0.942) | 0.894 (0.874–0.913) |

## R@5 / F1@5 by query type

| Run | knowledge-update (72) | multi-session (121) | single-session-assistant (56) | single-session-preference (30) | single-session-user (64) | temporal-reasoning (127) |
|---|---|---|---|---|---|---|
| worker keyword | 0.882 / 0.504 | 0.833 / 0.549 | 1.000 / 0.333 | 0.800 / 0.267 | 1.000 / 0.333 | 0.866 / 0.501 |

## Timing

- seed SQLite 34s
- 470 worker keyword searches 311s
