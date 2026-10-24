# longmemeval-s, vector only (exact, and minilm-l6-split-store, multilingual-minilm-l12-q-store)

LongMemEval-S cleaned (xiaowu0162/longmemeval-cleaned @ 98d7416c, MIT). 470 queries; each searches its own haystack; a document scores as its best part; 95% intervals from 2000 bootstrap resamples over queries. The chroma-mem rows search every document of the dataset in one Chroma collection, with no filter (store mode), asking for 200 parts; minilm-l6 is the exact scoped run. minilm-l6-split-store is the release minilm-l6 vectors with rows over 254 word pieces replaced by chroma-mem's pieces of them; multilingual-minilm-l12-q-store embeds every row and query in chroma-mem.

LongMemEval answers whether a model change costs English memory search accuracy.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| minilm-l6 | 0.346 (0.331–0.362) | 0.934 (0.917–0.951) | 0.484 (0.469–0.500) | 0.970 (0.958–0.981) | 0.808 (0.778–0.838) | 0.912 (0.892–0.933) | 0.908 (0.890–0.925) |
| minilm-l6-split-store | 0.083 (0.073–0.094) | 0.281 (0.246–0.318) | 0.125 (0.110–0.140) | 0.362 (0.323–0.398) | 0.151 (0.124–0.180) | 0.265 (0.231–0.299) | 0.259 (0.229–0.290) |
| multilingual-minilm-l12-q-store | 0.076 (0.066–0.086) | 0.262 (0.227–0.297) | 0.114 (0.100–0.129) | 0.333 (0.297–0.370) | 0.137 (0.111–0.165) | 0.239 (0.207–0.271) | 0.238 (0.209–0.267) |

## R@5 / F1@5 by query type

| Run | knowledge-update (72) | multi-session (121) | single-session-assistant (56) | single-session-preference (30) | single-session-user (64) | temporal-reasoning (127) |
|---|---|---|---|---|---|---|
| minilm-l6 | 0.979 / 0.560 | 0.907 / 0.601 | 1.000 / 0.333 | 0.967 / 0.322 | 0.969 / 0.323 | 0.881 / 0.516 |
| minilm-l6-split-store | 0.354 / 0.202 | 0.154 / 0.094 | 0.964 / 0.321 | 0.133 / 0.044 | 0.234 / 0.078 | 0.120 / 0.066 |
| multilingual-minilm-l12-q-store | 0.340 / 0.194 | 0.146 / 0.087 | 0.875 / 0.292 | 0.200 / 0.067 | 0.234 / 0.078 | 0.088 / 0.047 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| minilm-l6-split-store − minilm-l6 | -0.263 (-0.281–-0.246) | -0.653 (-0.690–-0.618) | -0.359 (-0.381–-0.339) | -0.608 (-0.646–-0.573) | -0.657 (-0.692–-0.621) | -0.648 (-0.683–-0.614) | -0.649 (-0.679–-0.620) |
| multilingual-minilm-l12-q-store − minilm-l6 | -0.270 (-0.289–-0.253) | -0.672 (-0.707–-0.636) | -0.370 (-0.392–-0.349) | -0.637 (-0.674–-0.600) | -0.671 (-0.707–-0.636) | -0.674 (-0.707–-0.641) | -0.670 (-0.700–-0.642) |
| multilingual-minilm-l12-q-store − minilm-l6-split-store | -0.008 (-0.017–0.001) | -0.019 (-0.048–0.007) | -0.010 (-0.024–0.002) | -0.029 (-0.056–-0.001) | -0.014 (-0.036–0.007) | -0.026 (-0.052–-0.001) | -0.022 (-0.042–-0.002) |
