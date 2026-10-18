# longmemeval-s through claude-mem's server search (store)

LongMemEval-S cleaned (xiaowu0162/longmemeval-cleaned @ 98d7416c, MIT). 470 queries; every document in one claude-mem project, searched by every query; a document is one observation and each part one embedding part; top 10 from PostgresObservationRepository.search; 95% intervals from 2000 bootstrap resamples over queries.

LongMemEval answers whether a model change costs English memory search accuracy.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| keyword only | 0.079 (0.069–0.089) | 0.264 (0.230–0.298) | 0.118 (0.104–0.133) | 0.327 (0.290–0.364) | 0.153 (0.126–0.182) | 0.249 (0.216–0.282) | 0.240 (0.211–0.269) |
| minilm-l6 vector | 0.086 (0.075–0.096) | 0.289 (0.253–0.324) | 0.128 (0.113–0.143) | 0.373 (0.333–0.409) | 0.172 (0.142–0.202) | 0.282 (0.247–0.318) | 0.275 (0.244–0.307) |
| minilm-l6 hybrid | 0.101 (0.091–0.112) | 0.331 (0.294–0.366) | 0.151 (0.135–0.166) | 0.413 (0.375–0.450) | 0.218 (0.187–0.250) | 0.334 (0.298–0.370) | 0.316 (0.284–0.348) |
| multilingual-minilm-l12 vector | 0.077 (0.067–0.086) | 0.263 (0.227–0.298) | 0.115 (0.101–0.130) | 0.344 (0.306–0.382) | 0.163 (0.135–0.192) | 0.257 (0.224–0.292) | 0.251 (0.221–0.282) |
| multilingual-minilm-l12 hybrid | 0.097 (0.087–0.109) | 0.321 (0.286–0.358) | 0.145 (0.130–0.162) | 0.403 (0.366–0.441) | 0.202 (0.172–0.235) | 0.310 (0.277–0.348) | 0.301 (0.271–0.334) |
| multilingual-e5-small vector | 0.111 (0.098–0.123) | 0.355 (0.317–0.392) | 0.164 (0.146–0.181) | 0.433 (0.396–0.470) | 0.211 (0.180–0.243) | 0.341 (0.304–0.378) | 0.328 (0.296–0.360) |
| multilingual-e5-small hybrid | 0.122 (0.110–0.134) | 0.387 (0.350–0.425) | 0.180 (0.163–0.198) | 0.471 (0.431–0.510) | 0.225 (0.193–0.257) | 0.356 (0.319–0.392) | 0.352 (0.319–0.384) |

## R@5 / F1@5 by query type

| Run | knowledge-update (72) | multi-session (121) | single-session-assistant (56) | single-session-preference (30) | single-session-user (64) | temporal-reasoning (127) |
|---|---|---|---|---|---|---|
| keyword only | 0.382 / 0.218 | 0.108 / 0.066 | 0.589 / 0.196 | 0.033 / 0.011 | 0.391 / 0.130 | 0.192 / 0.096 |
| minilm-l6 vector | 0.389 / 0.222 | 0.147 / 0.090 | 0.982 / 0.327 | 0.167 / 0.056 | 0.219 / 0.073 | 0.125 / 0.069 |
| minilm-l6 hybrid | 0.451 / 0.258 | 0.187 / 0.113 | 0.857 / 0.286 | 0.067 / 0.022 | 0.375 / 0.125 | 0.209 / 0.111 |
| multilingual-minilm-l12 vector | 0.368 / 0.210 | 0.131 / 0.081 | 0.911 / 0.304 | 0.200 / 0.067 | 0.203 / 0.068 | 0.087 / 0.047 |
| multilingual-minilm-l12 hybrid | 0.472 / 0.270 | 0.176 / 0.109 | 0.821 / 0.274 | 0.133 / 0.044 | 0.391 / 0.130 | 0.160 / 0.084 |
| multilingual-e5-small vector | 0.521 / 0.298 | 0.236 / 0.145 | 0.911 / 0.304 | 0.067 / 0.022 | 0.391 / 0.130 | 0.180 / 0.095 |
| multilingual-e5-small hybrid | 0.563 / 0.321 | 0.241 / 0.147 | 0.839 / 0.280 | 0.033 / 0.011 | 0.469 / 0.156 | 0.270 / 0.141 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| minilm-l6 hybrid − minilm-l6 vector | +0.016 (0.008–0.024) | +0.042 (0.016–0.069) | +0.023 (0.011–0.035) | +0.040 (0.012–0.068) | +0.046 (0.020–0.072) | +0.051 (0.023–0.080) | +0.042 (0.021–0.064) |
| minilm-l6 hybrid − keyword only | +0.023 (0.014–0.031) | +0.067 (0.041–0.094) | +0.033 (0.021–0.045) | +0.087 (0.056–0.116) | +0.065 (0.039–0.090) | +0.084 (0.058–0.111) | +0.077 (0.055–0.098) |
| multilingual-minilm-l12 hybrid − multilingual-minilm-l12 vector | +0.021 (0.013–0.029) | +0.058 (0.031–0.086) | +0.030 (0.018–0.043) | +0.059 (0.030–0.090) | +0.039 (0.013–0.065) | +0.053 (0.026–0.081) | +0.050 (0.028–0.073) |
| multilingual-minilm-l12 hybrid − keyword only | +0.019 (0.011–0.027) | +0.057 (0.030–0.087) | +0.027 (0.015–0.040) | +0.076 (0.048–0.106) | +0.049 (0.025–0.075) | +0.061 (0.037–0.087) | +0.062 (0.042–0.083) |
| multilingual-e5-small hybrid − multilingual-e5-small vector | +0.011 (0.002–0.020) | +0.032 (0.005–0.062) | +0.016 (0.003–0.030) | +0.038 (0.011–0.067) | +0.014 (-0.015–0.041) | +0.015 (-0.014–0.045) | +0.023 (0.001–0.045) |
| multilingual-e5-small hybrid − keyword only | +0.043 (0.034–0.052) | +0.124 (0.096–0.153) | +0.062 (0.050–0.076) | +0.144 (0.115–0.176) | +0.072 (0.047–0.097) | +0.107 (0.083–0.132) | +0.112 (0.093–0.133) |
| multilingual-minilm-l12 vector − minilm-l6 vector | -0.009 (-0.017–-0.000) | -0.026 (-0.052–-0.000) | -0.013 (-0.024–-0.001) | -0.029 (-0.055–-0.001) | -0.009 (-0.035–0.018) | -0.025 (-0.051–0.001) | -0.023 (-0.042–-0.003) |
| multilingual-minilm-l12 hybrid − minilm-l6 hybrid | -0.004 (-0.011–0.003) | -0.010 (-0.032–0.012) | -0.006 (-0.016–0.005) | -0.010 (-0.031–0.012) | -0.016 (-0.036–0.005) | -0.023 (-0.042–-0.003) | -0.015 (-0.031–0.001) |
| multilingual-e5-small vector − minilm-l6 vector | +0.025 (0.016–0.035) | +0.067 (0.036–0.098) | +0.036 (0.022–0.051) | +0.060 (0.030–0.091) | +0.039 (0.011–0.067) | +0.059 (0.031–0.088) | +0.054 (0.032–0.077) |
| multilingual-e5-small hybrid − minilm-l6 hybrid | +0.020 (0.012–0.029) | +0.056 (0.032–0.083) | +0.029 (0.018–0.042) | +0.058 (0.032–0.084) | +0.007 (-0.016–0.030) | +0.022 (-0.002–0.047) | +0.036 (0.017–0.055) |

## Timing

- minilm-l6: load and index 692s, 1410 searches 84s
- multilingual-minilm-l12: load and index 686s, 940 searches 50s
- multilingual-e5-small: load and index 629s, 940 searches 161s
