# longmemeval-s through claude-mem's worker search (scoped)

LongMemEval-S cleaned (xiaowu0162/longmemeval-cleaned @ 98d7416c, MIT). 100 queries from manifests/lme-s-100-v1.txt; each query is its own claude-mem project holding its own haystack; a document is one observation whose facts are its parts; top 10 from SearchManager.search; 95% intervals from 2000 bootstrap resamples over queries.

LongMemEval answers whether a model change costs English memory search accuracy.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| worker keyword | 0.332 (0.296–0.368) | 0.884 (0.831–0.931) | 0.459 (0.421–0.496) | 0.936 (0.901–0.966) | 0.836 (0.777–0.885) | 0.926 (0.879–0.964) | 0.900 (0.859–0.933) |
| worker search | 0.354 (0.320–0.390) | 0.937 (0.901–0.967) | 0.489 (0.455–0.524) | 0.969 (0.939–0.991) | 0.789 (0.728–0.844) | 0.918 (0.874–0.957) | 0.903 (0.867–0.933) |

## R@5 / F1@5 by query type

| Run | knowledge-update (15) | multi-session (26) | single-session-assistant (12) | single-session-preference (6) | single-session-user (14) | temporal-reasoning (27) |
|---|---|---|---|---|---|---|
| worker keyword | 0.900 / 0.514 | 0.759 / 0.516 | 1.000 / 0.333 | 0.667 / 0.222 | 1.000 / 0.333 | 0.932 / 0.549 |
| worker search | 0.967 / 0.552 | 0.901 / 0.612 | 1.000 / 0.333 | 1.000 / 0.333 | 1.000 / 0.333 | 0.881 / 0.519 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| worker search − worker keyword | +0.022 (0.000–0.046) | +0.053 (0.006–0.105) | +0.029 (0.002–0.059) | +0.033 (0.000–0.067) | -0.048 (-0.113–0.018) | -0.007 (-0.058–0.042) | +0.004 (-0.036–0.043) |

## Timing

- seed SQLite 7s
- 100 worker keyword searches 14s
- Chroma backfill (embedding by chroma-mcp) 3157s
- 100 worker search searches 95s
