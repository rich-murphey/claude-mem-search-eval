# longmemeval-s through claude-mem's worker search (scoped)

LongMemEval-S cleaned (xiaowu0162/longmemeval-cleaned @ 98d7416c, MIT). 14 queries with at least 5 relevant documents; each query is its own claude-mem project holding its own haystack; a document is one observation whose facts are its parts; top 10 from SearchManager.search; 95% intervals from 2000 bootstrap resamples over queries.

LongMemEval answers whether a model change costs English memory search accuracy.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| worker keyword | 0.743 (0.629–0.857) | 0.712 (0.602–0.817) | 0.726 (0.614–0.831) | 0.857 (0.757–0.943) | 0.724 (0.610–0.836) | 1.000 (1.000–1.000) | 0.869 (0.797–0.932) |
| worker search | 0.829 (0.729–0.914) | 0.798 (0.695–0.888) | 0.812 (0.710–0.901) | 0.945 (0.876–1.000) | 0.810 (0.702–0.902) | 0.964 (0.893–1.000) | 0.924 (0.866–0.971) |

## R@5 / F1@5 by query type

| Run | multi-session (6) | temporal-reasoning (8) |
|---|---|---|
| worker keyword | 0.733 / 0.733 | 0.696 / 0.720 |
| worker search | 0.733 / 0.733 | 0.846 / 0.870 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| worker search − worker keyword | +0.086 (-0.057–0.214) | +0.086 (-0.057–0.214) | +0.086 (-0.057–0.214) | +0.088 (-0.021–0.202) | +0.086 (-0.057–0.214) | -0.036 (-0.107–0.000) | +0.055 (-0.038–0.151) |

## Timing

- seed SQLite 1s
- 14 worker keyword searches 0s
- Chroma backfill (embedding by chroma-mcp) 464s
- 14 worker search searches 12s
