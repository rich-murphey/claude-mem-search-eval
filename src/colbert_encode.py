# Token vectors of answerdotai/answerai-colbert-small-v1 for every row (or
# query) of a dataset, through PyLate, for the ColBERT rerank and release v5.
#
#   uv run --python 3.12 --with pylate==1.6.0 python src/colbert_encode.py \
#       --dataset memsearch-en --which rows [--limit 2000] [--threads 16]
#
# Reads out/<dataset>/rows.jsonl or scope.jsonl (src/export-rows.ts), in the
# order of rows.tsv / queries.tsv. Writes out/<dataset>/answerai-colbert-small/
# <which>.f16.bin (every row's token vectors concatenated, 96 little-endian
# fp16 values each, L2-normalised) and <which>.offsets.u64.bin (n+1
# little-endian u64 token offsets), and <which>.stats.json (throughput, token
# counts). Documents: "[CLS] [unused1] text [SEP]", 512 tokens at most,
# punctuation (PyLate's skiplist) and padding dropped. Queries: "[CLS]
# [unused0] text [SEP]" padded with [MASK] to exactly 32 tokens, every
# position kept. With --limit, encodes a seeded sample of N rows into a
# scratch file (throughput only). --shard k/n encodes the k-th of n contiguous
# ranges (run n processes at once); --merge n joins the shards.
import argparse
import json
import os
import time

import numpy as np
import torch

MODEL = 'answerdotai/answerai-colbert-small-v1'
REVISION = '934fa8bb4ce2284f4c2baa232d81aca4d076fa5e'
KEY = 'answerai-colbert-small'
DOC_LEN, QUERY_LEN, DIM = 512, 32, 96
CHUNK = 8192


def load(threads, query_length=QUERY_LEN):
    torch.set_num_threads(threads)
    from pylate import models
    return models.ColBERT(MODEL, revision=REVISION, device='cpu', document_length=DOC_LEN, query_length=query_length)


def texts_of(dataset, which):
    name = 'rows.jsonl' if which == 'rows' else 'scope.jsonl'
    with open(f'out/{dataset}/{name}') as f:
        return [json.loads(line)['text'] for line in f]


def encode(model, texts, is_query, batch):
    """Token vectors per text, in input order; batches are length-sorted to cut padding."""
    out = [None] * len(texts)
    order = sorted(range(len(texts)), key=lambda i: len(texts[i]))
    for s in range(0, len(order), batch):
        idx = order[s:s + batch]
        with torch.inference_mode():
            vecs = model.encode([texts[i] for i in idx], is_query=is_query, batch_size=batch,
                                show_progress_bar=False, convert_to_numpy=True)
        for i, v in zip(idx, vecs):
            out[i] = np.asarray(v, dtype=np.float32)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dataset', required=True)
    ap.add_argument('--which', choices=['rows', 'queries'], default='rows')
    ap.add_argument('--limit', type=int)
    ap.add_argument('--threads', type=int, default=16)
    ap.add_argument('--batch', type=int, default=32)
    ap.add_argument('--shard')
    ap.add_argument('--merge', type=int)
    ap.add_argument('--query-length', type=int, default=QUERY_LEN, help='other than 32: writes queries-q<N>.*')
    a = ap.parse_args()
    if a.merge:
        return merge(a.dataset, a.which, a.merge)
    model = load(a.threads, a.query_length)
    texts = texts_of(a.dataset, a.which)
    if a.limit:
        # A seeded sample spread over the file, not its head (LongMemEval's head is one haystack).
        rng = np.random.default_rng(0)
        texts = [texts[i] for i in sorted(rng.choice(len(texts), min(a.limit, len(texts)), replace=False))]
    is_query = a.which == 'queries'
    d = f'out/{a.dataset}/{KEY}'
    os.makedirs(d, exist_ok=True)
    stem = f'{d}/{a.which}' + (f'-q{a.query_length}' if a.query_length != QUERY_LEN else '') + ('.sample' if a.limit else '')
    if a.shard:
        k, n = map(int, a.shard.split('/'))
        lo, hi = len(texts) * k // n, len(texts) * (k + 1) // n
        texts = texts[lo:hi]
        stem += f'.shard{k}of{n}'
    tok = model.tokenizer
    # Untruncated length with [CLS], marker and [SEP], for the doc-length stats.
    raw = np.array([len(ids) + 1 for ids in tok(texts, add_special_tokens=True, truncation=False)['input_ids']])
    offsets = [0]
    t0 = time.perf_counter()
    with open(f'{stem}.f16.bin', 'wb') as f:
        for c in range(0, len(texts), CHUNK):
            for v in encode(model, texts[c:c + CHUNK], is_query, a.batch):
                assert v.shape[1] == DIM
                f.write(v.astype('<f2').tobytes())
                offsets.append(offsets[-1] + v.shape[0])
            el = time.perf_counter() - t0
            print(f'{a.dataset} {a.which}: {min(c + CHUNK, len(texts))}/{len(texts)} in {el:.0f} s', flush=True)
    secs = time.perf_counter() - t0
    np.array(offsets, dtype='<u8').tofile(f'{stem}.offsets.u64.bin')
    kept = np.diff(offsets)
    stats = {
        'dataset': a.dataset, 'which': a.which, 'model': MODEL, 'revision': REVISION, 'threads': a.threads,
        'n': len(texts), 'seconds': secs, 'per_s': len(texts) / secs,
        'tokens_in': int(np.minimum(raw, DOC_LEN if not is_query else a.query_length).sum()), 'tokens_kept': int(kept.sum()),
        'tokens_in_per_s': float(np.minimum(raw, DOC_LEN).sum() / secs),
        'raw_tokens': {'mean': float(raw.mean()), 'median': float(np.median(raw)), 'p90': float(np.percentile(raw, 90)),
                       'max': int(raw.max()), 'over_512': float((raw > DOC_LEN).mean()), 'over_300': float((raw > 300).mean())},
        'kept_tokens': {'mean': float(kept.mean()), 'median': float(np.median(kept)), 'p90': float(np.percentile(kept, 90))},
        'bytes': int(kept.sum()) * DIM * 2,
    }
    with open(f'{stem}.stats.json', 'w') as f:
        json.dump(stats, f, indent=1)
    print(json.dumps(stats))


def merge(dataset, which, n):
    stem = f'out/{dataset}/{KEY}/{which}'
    offsets, stats = [np.zeros(1, dtype='<u8')], []
    with open(f'{stem}.f16.bin', 'wb') as f:
        for k in range(n):
            part = f'{stem}.shard{k}of{n}'
            with open(f'{part}.f16.bin', 'rb') as g:
                while chunk := g.read(1 << 26):
                    f.write(chunk)
            o = np.fromfile(f'{part}.offsets.u64.bin', dtype='<u8')
            offsets.append(o[1:] + offsets[-1][-1])
            with open(f'{part}.stats.json') as g:
                stats.append(json.load(g))
    off = np.concatenate(offsets)
    assert os.path.getsize(f'{stem}.f16.bin') == int(off[-1]) * DIM * 2
    off.tofile(f'{stem}.offsets.u64.bin')
    with open(f'{stem}.stats.json', 'w') as f:
        json.dump({'shards': stats, 'n': sum(s['n'] for s in stats), 'tokens_kept': int(off[-1]),
                   'seconds_wall': max(s['seconds'] for s in stats), 'bytes': int(off[-1]) * DIM * 2}, f, indent=1)
    for k in range(n):
        for ext in ('f16.bin', 'offsets.u64.bin', 'stats.json'):
            os.remove(f'{stem}.shard{k}of{n}.{ext}')
    print(f'{dataset} {which}: {len(off) - 1} rows, {int(off[-1])} tokens')


if __name__ == '__main__':
    main()
