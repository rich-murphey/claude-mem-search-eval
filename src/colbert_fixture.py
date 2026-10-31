# Parity fixture for a Rust (candle or ort) port of the answerai-colbert-small
# encoder: fixtures/colbert-parity.jsonl, from PyLate 1.6.0 on CPU, fp32.
#
#   uv run --python 3.12 --with pylate==1.6.0 python src/colbert_fixture.py
#
# Texts are written here (no dataset text). One JSON line each:
#   {"kind": "query"|"doc", "id", "text",
#    "input_ids": the ids fed to BERT (with [CLS], marker, [SEP], and a
#                 query's [MASK] padding to 32; a doc truncated to 512),
#    "attention_mask": 0 on a query's [MASK] padding (not attended, still output),
#    "kept": indices into input_ids whose vectors are output (a doc drops
#            PyLate's punctuation skiplist; a query keeps all 32),
#    "positions": indices into the output vectors listed in "vectors", to keep
#                 the file under 1 MB: a query's real tokens plus its first 4
#                 and last 2 [MASK] positions; a doc's all, or for one over 32
#                 vectors the first 8 and last 4,
#    "vectors": fp32 L2-normalised 96-d vectors at those positions, 6 decimals}
# and a last line {"kind": "scores", "query_ids", "doc_ids", "maxsim": [[...]]},
# MaxSim of each query over each doc's full output.
import json
import os

import numpy as np
import torch

from colbert_encode import DOC_LEN, MODEL, QUERY_LEN, REVISION

QUERIES = [
    'how did we fix the postgres connection leak',
    'which port does the worker listen on?',
    'RRF k constant in hybrid search',
    'Why was MiniLM kept as the embedder?',
    'cloudflare deploy credentials',
    'what broke the nightly repo-status run',
    'pgvector HNSW ef_search default',
    'tokio vs async-std runtime mix',
    'résumé café naïve',
    'emoji 🚀 in commit titles',
    '中文 search quality',
    'fn main() { println!("hi"); }',
    'when is the next dentist appointment',
    'bm25 leg latency in store mode',
    'git worktree is already checked out',
    '',
    'a',
    'UPPER CASE QUERY ABOUT THE LINTER',
    'numbers 3.14159 and 2026-10-31 and 0x7fff',
    'what does claude-mem inject per prompt, and how many observations? ' * 3,
]
DOCS = [
    'The connection leak was fixed by closing the pool in the shutdown hook.',
    'Worker listens on port 37777.',
    'RRF uses k = 60 by default; k = 5 measured better.',
    'Rich ruled that MiniLM-L6 stays the first-stage embedder.',
    'Deploys source ~/.config/cloudflare.env before wrangler deploy.',
    'The nightly repo-status run failed: the GitHub token expired.',
    'hnsw.ef_search defaults to 40 in pgvector 0.8.0.',
    'Generated code mixed tokio and async-std and compiled under neither.',
    'Café résumé naïve façade — Unicode accents.',
    'Commit titles must not contain emoji 🚀🔥.',
    '中文检索质量很差。',
    'fn main() { println!("hello, world"); }',
    'Dentist appointment moved to Tuesday 3 pm.',
    'Reading bm25 scores costs 20–400 ms a query in store mode.',
    "git says the branch 'int/x' is already checked out at '/home/rich/wt/x'.",
    '',
    '...!!!???,,,;;;:::',
    'ALL CAPS DOCUMENT ABOUT ESLINT AND PRETTIER.',
    'Pi is 3.14159; the date is 2026-10-31; the mask is 0x7fff.',
    'claude-mem injects five observations per prompt.',
    'Parts are short: mean 54 tokens, median 39, p90 113.',
    'Facts are about 37 tokens each.',
    'The eval repo publishes vectors as GitHub release assets.',
    'SHA256SUMS covers every asset in the release.',
    'Rows and queries TSVs carry ids and hashes, not text.',
    'A cross-encoder reranks the hybrid top 50 at 2–4 s a query.',
    'ColBERT stores one 96-d vector per token.',
    'MaxSim sums, over query tokens, the best document token match.',
    'Query augmentation pads queries with [MASK] to 32 tokens.',
    'The skiplist drops punctuation tokens from documents.',
    'Postgres 17 with pg_textsearch 1.5.1 runs the bm25 leg.',
    'The HNSW index reads 400 nearest parts, widened four times.',
    'Load average on dv was 25–40 during the cross-encoder run.',
    'Use uv run, never bare pip install.',
    'Node is npm, not bun.',
    'Each session works in its own worktree under ~/wt/.',
    'Commit messages: type(scope): title, then bullets.',
    'The homepage links to status block anchors.',
    'Todoist holds personal tasks; GitHub issues hold repo work.',
    'The docs repo holds no deployed code and no media.',
    'Late interaction keeps token-level matching but precomputes documents.',
    'Cross-encoders see query and document together and cannot precompute.',
    'int8 quantisation halves storage again relative to fp16.',
    'A residual compression codebook is what PLAID uses.',
    'The live store has 302k parts and about 16.3M tokens.',
    'Store mode searches every document in one project.',
    'Scoped mode searches one haystack or project.',
    'Bootstrap intervals use 2,000 resamples.',
    ('The session summary records what was done, what was learned, and what is next. ' * 40).strip(),
    ('Observation narrative: the worker restarted, the queue drained, and the embedder caught up; ' * 40).strip(),
]


def main():
    torch.set_num_threads(4)
    from pylate import models
    m = models.ColBERT(MODEL, revision=REVISION, device='cpu', document_length=DOC_LEN, query_length=QUERY_LEN)
    skip = set(m.skiplist)
    lines, qv, dv = [], [], []
    for kind, texts in (('query', QUERIES), ('doc', DOCS)):
        is_query = kind == 'query'
        vecs = m.encode(texts, is_query=is_query, batch_size=8, show_progress_bar=False)
        for i, (t, v) in enumerate(zip(texts, vecs)):
            tk = m.tokenize([t], is_query=is_query)
            ids, mask = tk['input_ids'][0].tolist(), tk['attention_mask'][0].tolist()
            kept = list(range(len(ids))) if is_query else [j for j, x in enumerate(ids) if x not in skip]
            v = np.asarray(v, dtype=np.float32)
            assert len(kept) == v.shape[0], (kind, i, len(kept), v.shape)
            if is_query:  # real tokens, then the first 4 and last 2 [MASK] positions
                n = sum(mask)
                pos = sorted(set(range(min(n + 4, QUERY_LEN))) | {QUERY_LEN - 2, QUERY_LEN - 1})
            else:
                pos = list(range(v.shape[0])) if v.shape[0] <= 32 else list(range(8)) + list(range(v.shape[0] - 4, v.shape[0]))
            lines.append({'kind': kind, 'id': f'{kind[0]}{i}', 'text': t, 'input_ids': ids, 'attention_mask': mask, 'kept': kept,
                          'positions': pos, 'vectors': [[round(float(x), 6) for x in v[p]] for p in pos]})
            (qv if is_query else dv).append(v)
    scores = [[round(float((q @ d.T).max(1).sum()), 5) for d in dv] for q in qv]
    lines.append({'kind': 'scores', 'query_ids': [f'q{i}' for i in range(len(qv))],
                  'doc_ids': [f'd{i}' for i in range(len(dv))], 'maxsim': scores})
    os.makedirs('fixtures', exist_ok=True)
    with open('fixtures/colbert-parity.jsonl', 'w') as f:
        for line in lines:
            f.write(json.dumps(line, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(sorted(skip), m.tokenizer.convert_ids_to_tokens(sorted(skip)))
    print(f'{len(QUERIES)} queries, {len(DOCS)} docs, {os.path.getsize("fixtures/colbert-parity.jsonl")} bytes; '
          f'skiplist {len(skip)} ids')


if __name__ == '__main__':
    main()
