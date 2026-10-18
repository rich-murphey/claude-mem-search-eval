# claude-mem-search-eval

How accurately does [claude-mem](https://github.com/thedotmack/claude-mem)'s
search by meaning find the right memory? This repo measures precision, recall
and F1 of that search on public data, with the embeddings precomputed so a
result can be checked in minutes rather than recomputed in hours.

The first question it answers is which embedding model claude-mem should use.
all-MiniLM-L6-v2, the default, is English-only;
[thedotmack/claude-mem#3422](https://github.com/thedotmack/claude-mem/pull/3422)
measured Korean recall tripling under a multilingual model, and a multilingual
model is planned as a setting for the in-worker embedder
([#3694](https://github.com/thedotmack/claude-mem/pull/3694)). Before that
choice is made for everyone, it should be shown that English recall does not
fall.

## Data

[LongMemEval](https://github.com/xiaowu0162/LongMemEval), cleaned
(`xiaowu0162/longmemeval-cleaned`, MIT, Wu et al.), the `_s` file: 500
questions, each over its own haystack of about 47 chat sessions, each labelled
with the sessions that hold its answer. The file is downloaded from Hugging
Face at a pinned revision and checked against its sha256
(`src/longmemeval.ts`); it is not redistributed here.

- 470 questions have answers; the 30 abstention questions (`*_abs`) have no
  relevant session and are left out.
- 300 of the 470 have two to six relevant sessions, so precision and F1 are
  not just recall divided by k.
- 19,195 distinct sessions, 199,509 turns, 198 million characters.

### Label quality

Checked in this repo's preparation (2026-10-18):

- Every non-answer session is free of `has_answer` turns: no session outside
  `answer_session_ids` is marked as holding the answer.
- 45 of 890 answer sessions have no turn marked `has_answer`, so turn-level
  labels are incomplete; scoring is by session.
- A literal search for each short answer string in non-answer sessions hit
  64 of 298 questions; a sample of 12 hits were all coincidences ("two",
  "Tom", "$300" in unrelated text), none an unlabelled answer. The cleaned
  release exists to remove sessions that interfered with answers.
- **Caveat: precision measured against these labels is a lower bound.** Some
  sessions that hold an answer may be unlabelled, in paraphrase that a
  literal search cannot find, and a retrieved unlabelled answer counts as a
  miss. Bounding this takes judging (plan step 5).
- The text is native English, not translated, but much of it is
  machine-generated: UltraChat dialogues, ShareGPT chats and LLM-simulated
  evidence sessions.

## Models

| Key | Model | Tokens | Prefixes |
|---|---|---|---|
| `minilm-l6` | `Xenova/all-MiniLM-L6-v2` (claude-mem's and Chroma's default) | 256 | none |
| `multilingual-minilm-l12` | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (the #3422 model) | 128 | none |
| `multilingual-e5-small` | `Xenova/multilingual-e5-small` | 512 | `query: ` / `passage: ` |

All three produce 384-dimensional vectors, so any of them fits claude-mem's
existing `vector(384)` column.

Each turn is one vector, as claude-mem embeds each part of an observation:
transformers.js 4.3.1 with onnxruntime-node 1.21.0, fp32, mean pooling, L2
normalised, truncated at the model's trained length with the closing
`[SEP]`/`</s>` restored (`src/encoder.ts` says why), stored as fp16.

## Metrics

Each question searches its own haystack. A session scores as its best turn,
as claude-mem scores an observation by its nearest part. k = 5 is claude-mem's
per-prompt injection limit.

| Metric | Meaning |
|---|---|
| P@5 | Share of the top 5 sessions that are relevant |
| R@5 | Share of relevant sessions in the top 5 |
| F1@5 | Harmonic mean of P@5 and R@5 |
| R@10 | Share of relevant sessions in the top 10 |
| R-prec | Precision at k = the number of relevant sessions; fair to questions with one relevant session, where P@5 cannot exceed 0.2 |
| MRR | 1 / rank of the first relevant session |
| nDCG@10 | Rank-discounted gain over the top 10 |

Intervals are 95%, from 2,000 bootstrap resamples over questions with a fixed
seed; model differences are paired over the same questions.

## Reproducing

```sh
npm install
# Tier 0, about a minute: download the release vectors into out/, then
node src/verify.ts --model minilm-l6   # re-embeds 200 rows; fails below cosine 0.9999
node src/eval.ts                       # recomputes every metric from the vectors
# Tier 1: re-embed and evaluate a 100-question sample
node src/eval.ts --manifest manifests/lme-s-100-v1.txt
# Tier 2: re-embed everything (minutes to hours per model on a CPU)
scripts/embed-model.sh minilm-l6 4 8
```

`manifests/lme-s-100-v1.txt` and `-v2.txt` are stratified 100-question
samples (`src/manifest.ts`): proportional by question type, chosen by
sha256(seed + question_id), so any language reproduces them from the seed.

### Release files

Vectors are release assets, not git objects. Per model,
`<model>.turns.f16.bin` holds one little-endian fp16 row of 384 values per
line of `turns.tsv`, and `<model>.queries.f16.bin` one row per question in
`questions.tsv` order (all 500, abstention questions included). `turns.tsv`
carries each row's session id, turn index, role, `has_answer` and the first 16
hex digits of its content's sha256, which `verify.ts` checks against the
dataset. `SHA256SUMS` covers every file.

## Plan

1. **Vector-only accuracy** (this release): the three models above on all 470
   answerable questions, from the precomputed vectors.
2. **Through claude-mem's server search**: load each question's haystack as its
   own claude-mem project in a throwaway pgvector Postgres and run the server's
   query three ways (keyword only, vector only, and the shipped hybrid with
   reciprocal rank fusion), reusing these vectors, to show what vectors add.
3. **memsearch** (`zc277584121/memsearch-memory-retrieval`, MIT): Claude Code
   developer memory in Chinese and machine-translated English, for the
   multilingual comparison.
4. **One store per user**: all sessions of a manifest in one project rather
   than one haystack per question, which is closer to how claude-mem searches
   and harder than the benchmark.
5. **Judged precision**: an LLM pass with a hand-checked sample over top-5
   results that are not labelled relevant, to bound the unlabelled answers.
