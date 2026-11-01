# Check published answerai-colbert-small token vectors (release v5): the
# offsets line up with rows.tsv / queries.tsv, then a seeded sample of rows
# and queries is re-encoded and compared token by token.
#
#   node src/export-rows.ts --dataset memsearch-en      # texts, from the pinned dataset
#   uv run --python 3.12 --with pylate==1.6.0 python src/colbert_verify.py --dataset memsearch-en [--n 200]
#
# Fails if any sampled row's token count differs or any token's cosine is
# below 0.999 (the vectors are fp16).
import argparse
import hashlib
import json
import sys

import numpy as np
import torch

from colbert_encode import DIM, DOC_LEN, KEY, MODEL, QUERY_LEN, REVISION

MIN_COSINE = 0.999


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dataset', required=True)
    ap.add_argument('--n', type=int, default=200)
    ap.add_argument('--threads', type=int, default=8)
    a = ap.parse_args()
    torch.set_num_threads(a.threads)
    from pylate import models
    model = models.ColBERT(MODEL, revision=REVISION, device='cpu', document_length=DOC_LEN, query_length=QUERY_LEN)
    d = f'out/{a.dataset}'
    ok = True
    for which, jsonl, tsv in (('rows', 'rows.jsonl', 'rows.tsv'), ('queries', 'scope.jsonl', 'queries.tsv')):
        texts = [json.loads(line)['text'] for line in open(f'{d}/{jsonl}')]
        n_tsv = sum(1 for _ in open(f'{d}/{tsv}')) - 1
        off = np.fromfile(f'{d}/{KEY}/{which}.offsets.u64.bin', dtype='<u8').astype(np.int64)
        vec = np.memmap(f'{d}/{KEY}/{which}.f16.bin', dtype='<f2', mode='r').reshape(-1, DIM)
        if not (len(texts) == n_tsv == len(off) - 1 and off[-1] == vec.shape[0]):
            sys.exit(f'{which}: {len(texts)} texts, {n_tsv} TSV lines, {len(off) - 1} offsets, {vec.shape[0]} vectors')
        key = lambda i: hashlib.sha256(f'verify:{i}'.encode()).hexdigest()
        sample = sorted(range(len(texts)), key=key)[:a.n]
        fresh = model.encode([texts[i] for i in sample], is_query=which == 'queries', batch_size=16, show_progress_bar=False)
        worst, bad_len = 1.0, 0
        for i, f in zip(sample, fresh):
            p = vec[off[i]:off[i + 1]].astype(np.float32)
            if p.shape[0] != f.shape[0]:
                bad_len += 1
                continue
            cos = (p * f).sum(1) / np.linalg.norm(p, axis=1) / np.linalg.norm(f, axis=1)
            worst = min(worst, float(cos.min()))
        print(f'{a.dataset} {which}: {len(sample)} re-encoded, {bad_len} token-count mismatches, worst token cosine {worst:.7f}')
        ok &= bad_len == 0 and worst >= MIN_COSINE
    if not ok:
        sys.exit(f'below {MIN_COSINE} or a token count differs')


if __name__ == '__main__':
    main()
