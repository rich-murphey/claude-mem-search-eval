# ColBERT token vectors at int8

Revised 2026-11-02. Can claude-mem-rs's `part_colbert` table store
answerai-colbert-small's document token vectors as int8 instead of fp16
without losing rerank quality? Offline: the fp16 vectors of release v5 and
the pools of results/colbert-rerank.md, re-scored with quantised copies.

**Answer: yes, at int8 with one scale per dimension.** It halves storage (96
bytes a token, 1.44 GB for a 15M-token store, against 2.88 GB) and moves no
R@5 measurably on any of the four runs (−0.001 to +0.015; no interval
excludes zero), with the query quantised too. Per-token scales do almost as
well but lose a small, significant R@5 on MIRACL en (−0.007, −0.014…−0.001).
Int4 per token does not hold (R@5 −0.065 memsearch en, −0.101 MIRACL en).
Speed is not the reason to switch: on `dv`'s Zen 1 cores the int8 AVX2 kernel
is 1.3× the fp16 F16C+FMA kernel, single thread.

## Method

- **Same pools, queries and depths** as results/colbert-rerank.md: memsearch
  en store depth 50 (2,172 queries), LongMemEval store depths 20 and 50
  (`lme-s-100-v1`, 100 queries), MIRACL en scoped depth 50 (799). The fp16
  variant reproduces the published `rerank-<mode>-<depth>.json` metrics per
  query (asserted); every other variant only changes the vectors MaxSim reads.
  `src/colbert_quant.py`; scoring and metrics are `src/colbert_rerank.py`'s,
  intervals `src/colbert_report.py`'s (paired per query against fp16, 2,000
  resamples, seed 0).
- **Variants**, each what a Rust kernel would store and compute:
  - `tok8`: per token symmetric int8, scale s = max|x| / 127 stored as f32;
    q = round(x · 127 / max|x|), half away from zero (`f32::round`).
    `tok8h`: the same with s stored as f16 and q taken against it.
  - `dim8`: per dimension int8, s_d = max over the dataset's tokens of
    |x_d| / 127, one 96-entry table per dataset; the query is pre-multiplied
    by s_d, so the document side needs no per-token scale. Also run on
    memsearch en with the table of LongMemEval + MIRACL en (50M tokens), clipped
    at ±127, as a live store would use a fixed table.
  - `tok4`: per token symmetric int4 (±7), f32 scale.
  - `/qf`: fp32 query × dequantised document. `/qi`: the query also int8 per
    token (after the s_d fold for `dim8`), so a pair scores
    (Σ q_i·d_i in int32) · s_q · s_d; the integer dot is exact.
  - `tok8/qi+fp<m>`: the `tok8/qi` order, then its top m re-scored with fp16
    (reorders the top m only).
- **Top-5 order changed**: share of queries whose ranked top 5 differs from
  fp16's; **set changed**: the top-5 set differs. Order changes are frequent
  because fp16 scores within a top 6 are close: on memsearch en the smallest
  gap among the top six is under 0.01 (scores are ~20–30) for 1,406 of 2,172
  queries (median 0.0065), and int8 noise is that size.

## Accuracy against fp16

| Dataset | Depth | Queries | Variant | R@5 | ΔR@5 (95%) | ΔnDCG@10 (95%) | Δhit@5 (95%) | Top-5 order changed | Top-5 set changed |
|---|---|---|---|---|---|---|---|---|---|
| ms-en store | 50 | 2172 | fp16 | 0.855 | — | — | — | 0.0% | 0.0% |
| ms-en store | 50 | 2172 | tok8/qf | 0.855 | -0.001 (-0.005…+0.003) | -0.001 (-0.003…+0.002) | +0.000 (-0.005…+0.004) | 36.0% | 16.3% |
| ms-en store | 50 | 2172 | tok8/qi | 0.854 | -0.001 (-0.005…+0.003) | -0.001 (-0.003…+0.002) | -0.000 (-0.005…+0.004) | 35.9% | 16.3% |
| ms-en store | 50 | 2172 | tok8h/qi | 0.855 | -0.001 (-0.005…+0.004) | -0.001 (-0.003…+0.001) | +0.000 (-0.005…+0.005) | 35.5% | 15.7% |
| ms-en store | 50 | 2172 | dim8/qf | 0.857 | +0.002 (-0.002…+0.006) | -0.002 (-0.004…+0.001) | +0.002 (-0.002…+0.006) | 43.0% | 19.6% |
| ms-en store | 50 | 2172 | dim8/qi | 0.857 | +0.002 (-0.002…+0.006) | -0.002 (-0.004…+0.001) | +0.002 (-0.002…+0.006) | 42.9% | 20.1% |
| ms-en store | 50 | 2172 | tok4/qf | 0.790 | -0.065 (-0.078…-0.052) | -0.066 (-0.075…-0.057) | -0.063 (-0.076…-0.050) | 97.0% | 84.8% |
| ms-en store | 50 | 2172 | tok8/qi+fp5 | 0.854 | -0.001 (-0.005…+0.003) | -0.000 (-0.001…+0.001) | -0.000 (-0.005…+0.004) | 16.3% | 16.3% |
| ms-en store | 50 | 2172 | tok8/qi+fp10 | 0.855 | +0.000 (+0.000…+0.000) | -0.000 (-0.001…+0.001) | +0.000 (+0.000…+0.000) | 0.1% | 0.0% |
| LME store | 20 | 100 | fp16 | 0.438 | — | — | — | 0.0% | 0.0% |
| LME store | 20 | 100 | tok8/qf | 0.438 | +0.000 (+0.000…+0.000) | -0.007 (-0.017…+0.000) | +0.000 (+0.000…+0.000) | 35.0% | 17.0% |
| LME store | 20 | 100 | tok8/qi | 0.438 | +0.000 (+0.000…+0.000) | -0.007 (-0.017…+0.000) | +0.000 (+0.000…+0.000) | 36.0% | 18.0% |
| LME store | 20 | 100 | tok8h/qi | 0.438 | +0.000 (+0.000…+0.000) | -0.006 (-0.017…+0.000) | +0.000 (+0.000…+0.000) | 38.0% | 19.0% |
| LME store | 20 | 100 | dim8/qf | 0.443 | +0.005 (+0.000…+0.015) | -0.004 (-0.012…+0.001) | +0.010 (+0.000…+0.030) | 51.0% | 26.0% |
| LME store | 20 | 100 | dim8/qi | 0.443 | +0.005 (+0.000…+0.015) | -0.003 (-0.012…+0.001) | +0.010 (+0.000…+0.030) | 50.0% | 25.0% |
| LME store | 20 | 100 | tok4/qf | 0.423 | -0.015 (-0.060…+0.025) | -0.021 (-0.048…+0.007) | -0.030 (-0.090…+0.030) | 98.0% | 90.0% |
| LME store | 20 | 100 | tok8/qi+fp5 | 0.438 | +0.000 (+0.000…+0.000) | -0.003 (-0.009…+0.000) | +0.000 (+0.000…+0.000) | 18.0% | 18.0% |
| LME store | 20 | 100 | tok8/qi+fp10 | 0.438 | +0.000 (+0.000…+0.000) | -0.003 (-0.009…+0.000) | +0.000 (+0.000…+0.000) | 0.0% | 0.0% |
| LME store | 50 | 100 | fp16 | 0.453 | — | — | — | 0.0% | 0.0% |
| LME store | 50 | 100 | tok8/qf | 0.453 | +0.000 (+0.000…+0.000) | -0.004 (-0.011…+0.000) | +0.000 (+0.000…+0.000) | 39.0% | 22.0% |
| LME store | 50 | 100 | tok8/qi | 0.453 | +0.000 (+0.000…+0.000) | -0.004 (-0.012…+0.000) | +0.000 (+0.000…+0.000) | 41.0% | 23.0% |
| LME store | 50 | 100 | tok8h/qi | 0.453 | +0.000 (+0.000…+0.000) | -0.004 (-0.012…+0.000) | +0.000 (+0.000…+0.000) | 41.0% | 23.0% |
| LME store | 50 | 100 | dim8/qf | 0.468 | +0.015 (+0.000…+0.040) | +0.000 (-0.011…+0.011) | +0.020 (+0.000…+0.050) | 53.0% | 29.0% |
| LME store | 50 | 100 | dim8/qi | 0.468 | +0.015 (+0.000…+0.040) | +0.000 (-0.011…+0.011) | +0.020 (+0.000…+0.050) | 53.0% | 29.0% |
| LME store | 50 | 100 | tok4/qf | 0.448 | -0.005 (-0.045…+0.040) | -0.019 (-0.051…+0.013) | +0.000 (-0.060…+0.060) | 97.0% | 91.0% |
| LME store | 50 | 100 | tok8/qi+fp5 | 0.453 | +0.000 (+0.000…+0.000) | -0.000 (-0.000…+0.000) | +0.000 (+0.000…+0.000) | 23.0% | 23.0% |
| LME store | 50 | 100 | tok8/qi+fp10 | 0.453 | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | +0.000 (+0.000…+0.000) | 0.0% | 0.0% |
| M-en scoped | 50 | 799 | fp16 | 0.542 | — | — | — | 0.0% | 0.0% |
| M-en scoped | 50 | 799 | tok8/qf | 0.534 | -0.008 (-0.015…-0.001) | +0.000 (-0.003…+0.004) | -0.006 (-0.014…+0.001) | 57.6% | 27.2% |
| M-en scoped | 50 | 799 | tok8/qi | 0.535 | -0.007 (-0.014…-0.001) | -0.000 (-0.004…+0.003) | -0.006 (-0.014…+0.001) | 56.8% | 26.7% |
| M-en scoped | 50 | 799 | tok8h/qi | 0.536 | -0.006 (-0.012…-0.000) | +0.001 (-0.003…+0.005) | -0.006 (-0.015…+0.001) | 58.3% | 26.8% |
| M-en scoped | 50 | 799 | dim8/qf | 0.541 | -0.001 (-0.008…+0.006) | -0.001 (-0.006…+0.004) | -0.001 (-0.010…+0.008) | 68.0% | 32.0% |
| M-en scoped | 50 | 799 | dim8/qi | 0.541 | -0.001 (-0.008…+0.006) | -0.001 (-0.006…+0.004) | +0.000 (-0.009…+0.010) | 68.6% | 32.2% |
| M-en scoped | 50 | 799 | tok4/qf | 0.441 | -0.101 (-0.122…-0.081) | -0.111 (-0.124…-0.096) | -0.094 (-0.120…-0.070) | 99.7% | 96.4% |
| M-en scoped | 50 | 799 | tok8/qi+fp5 | 0.535 | -0.007 (-0.014…-0.001) | +0.001 (-0.001…+0.003) | -0.006 (-0.014…+0.001) | 26.7% | 26.7% |
| M-en scoped | 50 | 799 | tok8/qi+fp10 | 0.542 | +0.000 (+0.000…+0.001) | +0.001 (-0.001…+0.003) | +0.000 (+0.000…+0.000) | 0.5% | 0.5% |
| ms-en store, dim8 scales of LME+M-en | 50 | 2172 | dim8/qf | 0.854 | -0.001 (-0.006…+0.003) | -0.003 (-0.007…-0.001) | -0.001 (-0.006…+0.004) | 45.9% | 21.7% |
| ms-en store, dim8 scales of LME+M-en | 50 | 2172 | dim8/qi | 0.854 | -0.001 (-0.005…+0.003) | -0.004 (-0.007…-0.001) | -0.001 (-0.006…+0.004) | 46.1% | 21.8% | 

- `tok8/qi+fp5` cannot move R@5 or hit@5 (it reorders inside the top 5);
  `+fp10` recovers fp16's R@5 everywhere, but needs the fp16 copy kept, so it
  is not a storage saving.
- LongMemEval's 100 queries cannot resolve differences below about ±0.02 R@5;
  memsearch en (2,172) and MIRACL en (799) carry the comparison.
- `dim8` with a borrowed table (LME + MIRACL, whose per-dimension maxima run
  1.0–1.8× memsearch's own, so coarser steps there) costs nDCG@10 −0.003 to
  −0.004 on memsearch en (significant, small) and R@5 −0.001 (not).
- Query quantisation is free: `/qi` and `/qf` agree within 0.001 everywhere.

**Per-token cosine, dequantised against fp16, over every token of each dataset:**

| Dataset | Tokens | tok8 min / p0.1 / median | tok8h min / p0.1 / median | dim8 min / p0.1 / median | tok4 min / p0.1 / median |
|---|---|---|---|---|---|
| memsearch-en | 165,951 | 0.99995 / 0.99997 / 0.999983 | 0.99995 / 0.99997 / 0.999983 | 0.99997 / 0.99997 / 0.999980 | 0.98418 / 0.98883 / 0.994506 |
| longmemeval-s | 32,191,687 | 0.99993 / 0.99997 / 0.999983 | 0.99993 / 0.99997 / 0.999983 | 0.99995 / 0.99996 / 0.999968 | 0.97934 / 0.98869 / 0.994334 |
| miracl-en | 17,991,409 | 0.99993 / 0.99996 / 0.999983 | 0.99993 / 0.99996 / 0.999983 | 0.99995 / 0.99996 / 0.999968 | 0.97858 / 0.98842 / 0.994485 |

## Storage

| Variant | Bytes per token | Live store at 15M tokens |
|---|---|---|
| fp16 | 192 | 2.88 GB |
| int8, per-token f32 scale (`tok8`) | 100 | 1.50 GB |
| int8, per-token f16 scale (`tok8h`) | 98 | 1.47 GB |
| int8, per-dimension (`dim8`) | 96, plus one 384-byte table | 1.44 GB |
| int4, per-token f32 scale (`tok4`) | 52 | 0.78 GB |

Per-part offsets (8 bytes a part) are the same for every variant. The store
estimate is results/colbert-rerank.md's 14–16M tokens.

## Kernel speed

Rust 1.98.0, `std::arch` intrinsics, `-C opt-level=3 -C target-cpu=native`,
LTO, single thread on `dv` (AMD EPYC 7351P, Zen 1: 256-bit AVX2 ops issue as
two 128-bit halves). Pinned with `taskset` to CPU 14, whose SMT sibling 30 was
≥95% idle (CPU 14 96.3%, CPU 30 95.7% over 3 s before the run; load average
5.2), no compiler or other release binary running, under
`flock /tmp/claude-1000/dv-bench.lock`. 32 query tokens × 96 dimensions
against 50 candidates; random unit vectors; 20,000 timed repetitions at 54
tokens, 1,000 at 1,000 tokens; medians. Every kernel's scores were checked
against an f64 (float paths) or exact-integer (int8 × int8 paths) reference.
Candidates are padded to a multiple of 8 tokens by repeating the last token
(54 → 56), which leaves the max unchanged.

| Kernel | 50 × 54 tokens: µs/query (ns/token) | 50 × 1,000 tokens: µs/query (ns/token) | Preemptions (54 / 1,000) |
|---|---|---|---|
| fp16, token-major: `_mm256_cvtph_ps` 8-token block → f32, FMA, hadd tree | 652 (242) | 11,672 (233) | 33 / 68 |
| int8 doc × f32 query: `_mm256_cvtepi8_epi32` + `cvtepi32_ps`, FMA, × scale | 660 (244) | 11,734 (235) | 44 / 61 |
| int8 × int8, token-major: `_mm256_cvtepi8_epi16`, `_mm256_madd_epi16` | 496 (184) | 8,747 (175) | 33 / 40 |
| int8 × int8, token-major: `_mm256_sign_epi8` + `_mm256_maddubs_epi16` + `madd_epi16`(1) | 495 (183) | 8,786 (176) | 25 / 46 |
| fp16, token-lane: 8-token block stored dimension-major, broadcast query, FMA | 533 (197) | 9,610 (192) | 29 / 60 |
| int8 × int8, token-lane: dimension pairs × 8 tokens, `_mm256_madd_epi16` | 408 (151) | 7,332 (147) | 22 / 45 |

- **Int8 is 1.25–1.31× fp16** for the same loop structure. Zen 1 splits both
  `vfmadd` and `vpmaddwd` on ymm into two 128-bit µops, so the integer path
  gains only its halved loads and conversions; a core with AVX-512 VNNI
  (`vpdpbusd`, Zen 4 / Ice Lake on) should gain more, not measured here.
- **Layout matters as much as type**: storing each 8-token block
  dimension-major ("token-lane") removes the horizontal sums and is worth
  1.2× for either type. `maddubs` buys nothing over `madd_epi16` here.
- `dim8` needs no per-token scale in the kernel (the scale is folded into the
  query), so its kernel is the int8 × int8 one without the per-lane multiply.
- 54 tokens × 50 candidates, about the live store's case, costs 0.4–0.65 ms a
  query on one core either way, against ~25 ms to encode the query; the
  stored bytes per query (0.5 MB fp16, 0.26 MB int8) matter more for where
  the vectors live than for the arithmetic.
- The benchmark source is not in this repo (scratchpad on `dv`); the kernels
  are as the table describes.

## For claude-mem-rs

- **Store `part_colbert` as int8 with one scale per dimension**: 96 bytes a
  token, a fixed 96-entry f32 table per model computed once over a large
  corpus and clipped at ±127, and quantise the query (after multiplying by
  the table) to int8 per token. No R@5 loss is measurable on any dataset
  (memsearch en −0.001 with a borrowed table, MIRACL en −0.001, LongMemEval
  +0.005 / +0.015), against −0.007 (significant) on MIRACL en for per-token
  scales.
- If a per-model table is unwelcome (a model change needs a new one, and it
  is fitted to a corpus), per-token int8 with an f16 scale (98 bytes) is the
  fallback; its MIRACL loss is small (R@5 −0.006, −0.012…−0.000).
- Not int4 per token, and not an fp16 re-score stage: it needs the fp16 copy
  that int8 was meant to replace.
- Kernel: int8 × int8 with `_mm256_madd_epi16` over dimension-major 8-token
  blocks.

Code: `src/colbert_quant.py`. Rerun (vectors and pools as results/colbert-rerank.md):

```sh
uv run --python 3.12 --with pylate==1.6.0 --with threadpoolctl python src/colbert_quant.py --dataset miracl-en --mode scoped --depth 50
uv run --python 3.12 --with pylate==1.6.0 --with threadpoolctl python src/colbert_quant.py --dataset memsearch-en --mode store --depth 50 --dim-scales-from longmemeval-s,miracl-en
uv run --python 3.12 --with pylate==1.6.0 --with threadpoolctl python src/colbert_quant.py --report
```
