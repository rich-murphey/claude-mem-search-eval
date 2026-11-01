# ColBERT late-interaction rerank of claude-mem's hybrid top N, with latency.
#
#   uv run --python 3.12 --with pylate==1.6.0 --with threadpoolctl python src/colbert_rerank.py \
#       --dataset miracl-en --mode scoped [--depth 50] [--threads 8]
#
# Reorders exactly the pools src/colbert-pools.ts dumps (src/rerank.ts's
# hybrid: minilm-l6 vector leg, bm25 leg, RRF k = 60) by MaxSim over the
# precomputed answerai-colbert-small token vectors (src/colbert_encode.py):
# a row (part) scores sum over the 32 query tokens of the max dot product with
# its document tokens; an observation scores as its best part, as the
# cross-encoder does. Writes out/<dataset>/colbert/rerank-<mode>-<depth>.json
# in src/rerank.ts's shape (per query: base and rerank [hit@5, R@5, MRR@10,
# nDCG@10]) plus the latency split: query encode (one live query at a time),
# gather (fp16 rows from the page-cached file, widened to fp32), MaxSim with
# the BLAS pool at --threads, and MaxSim on one thread.
import argparse
import json
import math
import time

import numpy as np
import torch
from threadpoolctl import threadpool_limits

KEY, DIM, QLEN = 'answerai-colbert-small', 96, 32


def metrics(ids, relevant):
    ids = ids[:10]
    h5 = sum(1 for s in ids[:5] if s in relevant)
    dcg = sum(1 / math.log2(i + 2) for i, s in enumerate(ids) if s in relevant)
    idcg = sum(1 / math.log2(i + 2) for i in range(min(len(relevant), 10)))
    first = next((i for i, s in enumerate(ids) if s in relevant), -1)
    return [1 if h5 > 0 else 0, h5 / len(relevant), 0 if first < 0 else 1 / (first + 1), dcg / idcg]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dataset', required=True)
    ap.add_argument('--mode', required=True)
    ap.add_argument('--depth', type=int, default=50)
    ap.add_argument('--threads', type=int, default=8)
    ap.add_argument('--encode-sample', type=int, default=100)
    a = ap.parse_args()
    d = f'out/{a.dataset}'
    # Row ranges per doc, from rows.tsv (rows of a doc are contiguous, in part order).
    doc_rows = {}
    with open(f'{d}/rows.tsv') as f:
        next(f)
        for i, line in enumerate(f):
            doc_rows.setdefault(line.split('\t', 1)[0], []).append(i)
    off = np.fromfile(f'{d}/{KEY}/rows.offsets.u64.bin', dtype='<u8').astype(np.int64)
    vec = np.memmap(f'{d}/{KEY}/rows.f16.bin', dtype='<f2', mode='r').reshape(-1, DIM)
    assert len(off) - 1 == sum(len(v) for v in doc_rows.values()) and off[-1] == vec.shape[0]
    qids = [line.split('\t', 1)[0] for line in open(f'{d}/queries.tsv').read().strip().split('\n')[1:]]
    qvec = np.fromfile(f'{d}/{KEY}/queries.f16.bin', dtype='<f2').reshape(len(qids), QLEN, DIM)
    qindex = {q: i for i, q in enumerate(qids)}
    pool = [json.loads(line) for line in open(f'{d}/colbert/pool-{a.mode}.jsonl')]

    results = []
    for p in pool:
        rel = set(p['relevant'])
        base = metrics(p['top'], rel)
        assert all(abs(x - y) < 1e-9 for x, y in zip(base, p['base'])), p['q']
        top = p['top'][:a.depth]
        q = qvec[qindex[p['q']]].astype(np.float32)
        t0 = time.perf_counter()
        rows = [r for doc in top for r in doc_rows[doc]]
        owner = np.repeat(np.arange(len(top)), [len(doc_rows[doc]) for doc in top])
        D = np.concatenate([vec[off[r]:off[r + 1]] for r in rows]).astype(np.float32)
        starts = np.concatenate([[0], np.cumsum([off[r + 1] - off[r] for r in rows])[:-1]])
        t1 = time.perf_counter()

        def maxsim():
            S = q @ D.T                                        # 32 x tokens
            row = np.maximum.reduceat(S, starts, axis=1).sum(0)  # per row (part)
            best = np.full(len(top), -np.inf, dtype=np.float32)
            np.maximum.at(best, owner, row)
            return best
        with threadpool_limits(a.threads):
            best = maxsim()
        t2 = time.perf_counter()
        with threadpool_limits(1):
            best1 = maxsim()
        t3 = time.perf_counter()
        assert np.allclose(best, best1, atol=1e-3)
        order = sorted(range(len(top)), key=lambda j: (-best[j], j))
        reranked = [top[j] for j in order] + p['top'][a.depth:]
        results.append({'q': p['q'], 'base': base, 'rerank': metrics(reranked, rel), 'pairs': len(rows),
                        'tokens': int(D.shape[0]), 'gather_ms': (t1 - t0) * 1e3, 'maxsim_ms': (t2 - t1) * 1e3,
                        'maxsim_1t_ms': (t3 - t2) * 1e3})

    # Query encode latency: one query at a time, as a search would, on --threads.
    torch.set_num_threads(a.threads)
    from pylate import models
    from colbert_encode import MODEL, REVISION, DOC_LEN, QUERY_LEN
    model = models.ColBERT(MODEL, revision=REVISION, device='cpu', document_length=DOC_LEN, query_length=QUERY_LEN)
    texts = [p['text'] for p in pool[:a.encode_sample]]
    model.encode(texts[:2], is_query=True, show_progress_bar=False)  # warm-up
    enc = []
    for i, t in enumerate(texts):
        t0 = time.perf_counter()
        with torch.inference_mode():
            v = model.encode([t], is_query=True, show_progress_bar=False)[0]
        enc.append((time.perf_counter() - t0) * 1e3)
        if i < 5:  # the stored query vectors are what a live encode gives
            stored = qvec[qindex[pool[i]['q']]].astype(np.float32)
            assert (np.sum(stored * v, 1) / np.linalg.norm(stored, axis=1)).min() > 0.999
    out = {'dataset': a.dataset, 'mode': a.mode, 'depth': a.depth, 'model': MODEL, 'revision': REVISION,
           'threads': a.threads, 'metrics': ['hit@5', 'R@5', 'MRR@10', 'nDCG@10'], 'encode_ms': enc, 'results': results}
    with open(f'{d}/colbert/rerank-{a.mode}-{a.depth}.json', 'w') as f:
        json.dump(out, f)
    mean = lambda k, i: np.mean([r[k][i] for r in results])
    pct = lambda xs, p: float(np.percentile(xs, p))
    print(f"{a.dataset} {a.mode} depth {a.depth}, {len(results)} q: R@5 {mean('base', 1):.3f} -> {mean('rerank', 1):.3f}, "
          f"nDCG@10 {mean('base', 3):.3f} -> {mean('rerank', 3):.3f}; tokens/q {np.mean([r['tokens'] for r in results]):.0f}; "
          f"encode p50 {pct(enc, 50):.1f} ms, gather p50 {pct([r['gather_ms'] for r in results], 50):.2f}, "
          f"maxsim p50 {pct([r['maxsim_ms'] for r in results], 50):.2f} / 1t {pct([r['maxsim_1t_ms'] for r in results], 50):.2f} ms")


if __name__ == '__main__':
    main()
