# miracl-en through claude-mem's server search (scoped)

MIRACL en dev, human-judged, pooled corpus (mteb/MIRACLRetrievalHardNegatives @ 332a9acb, CC-BY-SA-4.0). 799 queries; each query searches its claude-mem project; a document is one observation and each part one embedding part; top 10 from PostgresObservationRepository.search; 95% intervals from 2000 bootstrap resamples over queries.

MIRACL answers "how accurate is it, measured properly": human-judged relevance with explicit non-relevant judgments, two to three relevant passages per query, so P@5, R@5 and F1@5 are meaningful; J@5 bounds the unjudged share of each top 5.

Best treated as a measurement of relative accuracy between models, given the label errors discussed in the README ("Caveat on absolute accuracy").

| Run | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| keyword only | 0.148 (0.136–0.161) | 0.270 (0.247–0.293) | 0.172 (0.159–0.186) | 0.344 (0.318–0.370) | 0.194 (0.174–0.215) | 0.357 (0.329–0.385) | 0.283 (0.261–0.304) | 0.326 (0.307–0.344) |
| minilm-l6 vector | 0.159 (0.148–0.170) | 0.331 (0.306–0.356) | 0.195 (0.182–0.208) | 0.455 (0.427–0.482) | 0.206 (0.187–0.225) | 0.396 (0.369–0.423) | 0.336 (0.315–0.357) | 0.297 (0.281–0.313) |
| minilm-l6 hybrid | 0.215 (0.200–0.229) | 0.409 (0.383–0.436) | 0.255 (0.240–0.270) | 0.550 (0.524–0.575) | 0.292 (0.268–0.316) | 0.500 (0.470–0.529) | 0.435 (0.412–0.457) | 0.460 (0.441–0.480) |
| multilingual-minilm-l12 vector | 0.181 (0.169–0.194) | 0.355 (0.331–0.381) | 0.218 (0.204–0.231) | 0.474 (0.448–0.501) | 0.252 (0.233–0.274) | 0.464 (0.436–0.493) | 0.380 (0.358–0.402) | 0.340 (0.324–0.358) |
| multilingual-minilm-l12 hybrid | 0.218 (0.205–0.231) | 0.422 (0.396–0.448) | 0.260 (0.246–0.275) | 0.562 (0.537–0.589) | 0.291 (0.268–0.313) | 0.518 (0.489–0.546) | 0.446 (0.424–0.468) | 0.479 (0.460–0.498) |
| multilingual-e5-small vector | 0.230 (0.217–0.242) | 0.477 (0.451–0.504) | 0.281 (0.267–0.295) | 0.602 (0.577–0.628) | 0.339 (0.315–0.363) | 0.579 (0.551–0.606) | 0.492 (0.470–0.515) | 0.392 (0.375–0.409) |
| multilingual-e5-small hybrid | 0.238 (0.225–0.253) | 0.466 (0.440–0.491) | 0.285 (0.271–0.301) | 0.620 (0.594–0.646) | 0.329 (0.305–0.352) | 0.544 (0.515–0.572) | 0.489 (0.467–0.511) | 0.494 (0.475–0.513) |

## R@5 / F1@5 by query type

| Run | en (799) |
|---|---|
| keyword only | 0.270 / 0.172 |
| minilm-l6 vector | 0.331 / 0.195 |
| minilm-l6 hybrid | 0.409 / 0.255 |
| multilingual-minilm-l12 vector | 0.355 / 0.218 |
| multilingual-minilm-l12 hybrid | 0.422 / 0.260 |
| multilingual-e5-small vector | 0.477 / 0.281 |
| multilingual-e5-small hybrid | 0.466 / 0.285 |

## Paired differences

Per-question difference, then the mean and its 95% interval.

| Run − baseline | P@5 | R@5 | F1@5 | R@10 | R-prec | MRR@10 | nDCG@10 | J@5 |
|---|---|---|---|---|---|---|---|---|
| minilm-l6 hybrid − minilm-l6 vector | +0.056 (0.042–0.069) | +0.078 (0.049–0.105) | +0.060 (0.044–0.076) | +0.095 (0.066–0.122) | +0.087 (0.062–0.112) | +0.104 (0.073–0.134) | +0.099 (0.077–0.121) | +0.164 (0.145–0.183) |
| minilm-l6 hybrid − keyword only | +0.067 (0.056–0.077) | +0.140 (0.118–0.162) | +0.082 (0.071–0.095) | +0.206 (0.182–0.229) | +0.098 (0.079–0.117) | +0.143 (0.120–0.167) | +0.152 (0.136–0.168) | +0.135 (0.119–0.151) |
| multilingual-minilm-l12 hybrid − multilingual-minilm-l12 vector | +0.037 (0.024–0.049) | +0.067 (0.041–0.094) | +0.042 (0.028–0.057) | +0.088 (0.063–0.116) | +0.038 (0.014–0.062) | +0.053 (0.024–0.082) | +0.065 (0.044–0.088) | +0.139 (0.121–0.158) |
| multilingual-minilm-l12 hybrid − keyword only | +0.070 (0.059–0.080) | +0.152 (0.130–0.176) | +0.087 (0.075–0.100) | +0.219 (0.194–0.244) | +0.096 (0.076–0.115) | +0.161 (0.139–0.185) | +0.163 (0.147–0.181) | +0.153 (0.138–0.170) |
| multilingual-e5-small hybrid − multilingual-e5-small vector | +0.009 (-0.004–0.021) | -0.011 (-0.038–0.016) | +0.004 (-0.011–0.019) | +0.018 (-0.006–0.042) | -0.010 (-0.037–0.017) | -0.035 (-0.064–-0.005) | -0.003 (-0.026–0.019) | +0.101 (0.084–0.119) |
| multilingual-e5-small hybrid − keyword only | +0.090 (0.080–0.101) | +0.196 (0.173–0.219) | +0.113 (0.101–0.125) | +0.276 (0.251–0.303) | +0.134 (0.115–0.155) | +0.187 (0.166–0.210) | +0.206 (0.189–0.223) | +0.168 (0.152–0.184) |
| multilingual-minilm-l12 vector − minilm-l6 vector | +0.022 (0.011–0.034) | +0.024 (-0.000–0.051) | +0.023 (0.010–0.037) | +0.020 (-0.008–0.049) | +0.047 (0.023–0.070) | +0.069 (0.040–0.097) | +0.044 (0.023–0.066) | +0.043 (0.027–0.060) |
| multilingual-minilm-l12 hybrid − minilm-l6 hybrid | +0.003 (-0.006–0.013) | +0.013 (-0.008–0.035) | +0.005 (-0.006–0.016) | +0.013 (-0.010–0.038) | -0.002 (-0.021–0.016) | +0.018 (-0.004–0.039) | +0.011 (-0.005–0.028) | +0.019 (0.006–0.033) |
| multilingual-e5-small vector − minilm-l6 vector | +0.071 (0.060–0.082) | +0.146 (0.120–0.174) | +0.086 (0.072–0.101) | +0.148 (0.122–0.174) | +0.133 (0.108–0.159) | +0.183 (0.154–0.212) | +0.156 (0.135–0.177) | +0.096 (0.080–0.112) |
| multilingual-e5-small hybrid − minilm-l6 hybrid | +0.024 (0.015–0.033) | +0.056 (0.035–0.078) | +0.031 (0.019–0.042) | +0.070 (0.050–0.092) | +0.036 (0.018–0.055) | +0.044 (0.024–0.064) | +0.054 (0.039–0.069) | +0.033 (0.021–0.046) |

## Timing

- minilm-l6: load and index 593s, 2397 searches 57s
- multilingual-minilm-l12: load and index 602s, 1598 searches 41s
- multilingual-e5-small: load and index 607s, 1598 searches 44s
