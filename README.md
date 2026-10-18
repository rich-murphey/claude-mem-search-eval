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
- 12 answerable questions list one session (never an answer session) twice
  in their haystack; each session is counted once.

### Label errors

Checked in this repo's preparation (2026-10-18), over the 470 answerable
questions. The text is native English, not translated, but much of it is
machine-generated: UltraChat dialogues, ShareGPT chats and LLM-simulated
evidence sessions.

**False positives in the labels** (labelled as holding the answer, but do
not): 45 of 890 answer sessions (5.1%) have no turn marked `has_answer`. They
fall in 32 questions (22 temporal-reasoning, 8 multi-session, 2
knowledge-update); no question has only such labels, and in an affected
question they average 46% of its labels. Of three sampled, none holds the
answer: two are distractors on a nearby date (a different event "today", for a
question about "a month ago"), which help a reasoner rule out the wrong event
but do not contain the answer, and one (for a magazine-subscription count)
never mentions magazines or subscriptions. At most 45 sessions, assuming
sessions with marked turns are right; those were not checked.

**False negatives in the labels** (hold the answer, but are not labelled): a
literal search for each short answer string in unlabelled sessions hit 64 of
298 questions; a sample of 12 hits were all coincidences ("two", "Tom", "$300"
in unrelated text), none an unlabelled answer. The cleaned release exists to
remove sessions that interfered with answers, but paraphrased answers cannot
be found by literal search, so how many remain is unknown.

No session outside `answer_session_ids` has a turn marked `has_answer`.

### What label errors do to the results

| Label error | Search result | Really | Scored as | Effect |
|---|---|---|---|---|
| False positive | Retrieved | False positive | True positive | Precision too high |
| False positive | Not retrieved | True negative | False negative | Recall too low |
| False negative | Retrieved | True positive | False positive | Precision too low |
| False negative | Not retrieved | False negative | True negative (ignored) | Recall too high |

The false positives' effect is bounded: 45 sessions can fill at most 45 of the
2,350 top-5 slots, so P@5 is overstated by at most 1.9 points, and recall is
understated by at most 3.1 points if none of them is retrieved. Both
concentrate in temporal reasoning. The false negatives' effect has no bound
without judging (plan step 5).

### Caveat on absolute accuracy

Precision and recall here are measured against LongMemEval's labels, which
contain errors in both directions. About 5% of labelled answer sessions (45 of
890, mostly temporal-reasoning distractors) do not hold the answer; these can
raise P@5 by at most 1.9 points and lower recall by at most 3.1. Sessions that
hold an answer without being labelled could not be counted: a literal search
found none, but paraphrased ones cannot be ruled out, and each one retrieved
lowers measured precision while each one missed raises measured recall. The two
errors partly offset, so neither metric is a strict bound. Differences between
models on the same questions are affected far less, since both are scored
against the same labels; per-type results for temporal reasoning are the least
reliable.

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
