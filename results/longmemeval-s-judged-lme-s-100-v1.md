# LongMemEval judged precision

LongMemEval-S cleaned (xiaowu0162/longmemeval-cleaned @ 98d7416c, MIT). 100 queries from manifests/lme-s-100-v1.txt; each searches its own haystack. Every top-5 session not labelled relevant was judged by openai/gpt-4o-2024-08-06 (src/judge.ts; verdicts in results/judge/verdicts.tsv). Judged P@5 counts a session relevant when it is labelled or the judge finds evidence in it. 95% intervals from 2000 bootstrap resamples over queries.

| Run | Label P@5 | Judged P@5 | Unlabelled top-5 | Judged relevant |
|---|---|---|---|---|
| minilm-l6 vector | 0.354 (0.320–0.390) | 0.356 (0.322–0.392) | 323 | 1 |
| server hybrid, minilm-l6 | 0.354 (0.320–0.390) | 0.356 (0.322–0.392) | 323 | 1 |

Judge spend: $2.94 over 434 verdicts, as OpenRouter reported it.
