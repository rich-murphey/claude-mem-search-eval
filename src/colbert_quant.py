# Does int8 (or int4) storage of answerai-colbert-small's document token
# vectors lose ColBERT rerank quality against the fp16 of release v5?
#
#   uv run --python 3.12 --with pylate==1.6.0 --with threadpoolctl python src/colbert_quant.py \
#       --dataset longmemeval-s --mode store --depth 20 [--data ../colbert/out]
#   uv run --python 3.12 --with pylate==1.6.0 --with threadpoolctl python src/colbert_quant.py --report
#
# Offline: reuses the fp16 token vectors and the pools of src/colbert_rerank.py
# (read from --data), reorders each pool by MaxSim over quantised vectors, and
# scores with colbert_rerank.metrics. The fp16 variant must reproduce the
# published rerank-<mode>-<depth>.json per query. Quantisation is what a Rust
# kernel would store and compute:
#   tok8   per token symmetric int8: s = max|x|/127, q = round(x * (127/max|x|)),
#          round half away from zero (Rust f32::round); s kept as f32, or f16
#          (tok8h, re-quantised against the f16 s).
#   dim8   per dimension int8, s_d = max over the dataset's tokens of |x_d| / 127
#          (or over --dim-scales-from's datasets, clipping to ±127).
#   tok4   per token symmetric int4 (±7), s = max|x|/7.
# Query side: "qf" keeps the fp32 query and dequantises the document (for dim8,
# the query is pre-multiplied by s_d); "qi" also quantises each query token per
# token (int8, after the s_d fold for dim8), so a token pair scores
# (Σ q_i·d_i in int32) · s_q · s_d. The int dot is exact in fp32 (|sum| ≤ 96·127²
# < 2^24). "+fp<m>": the tok8/qi order, then its top m re-scored with fp16.
# Writes <out>/<dataset>/colbert/quant-<mode>-<depth>.json (per variant, per
# query: metrics and top 10) and prints the per-token cosine of dequantised
# against fp16 over every token in the dataset. --report prints the tables of
# results/colbert-int8.md from those files: differences against fp16 paired per
# query, intervals as src/colbert_report.py (2,000 resamples, seed 0).
import argparse
import json
import os

import numpy as np

from colbert_rerank import DIM, KEY, QLEN, metrics
from colbert_report import ci, fmt

CHUNK = 1 << 20  # tokens per pass over the whole file
RUNS = [('memsearch-en', 'store', 50, '', 'ms-en store'), ('longmemeval-s', 'store', 20, '', 'LME store'),
        ('longmemeval-s', 'store', 50, '', 'LME store'), ('miracl-en', 'scoped', 50, '', 'M-en scoped'),
        ('memsearch-en', 'store', 50, '-dimfrom-longmemeval-s+miracl-en', 'ms-en store, dim8 scales of LME+M-en')]


def rnd(x):
    return np.sign(x) * np.floor(np.abs(x) + 0.5)


def quant_tok(x, levels, f16_scale=False):
    """Per-row symmetric quantisation of fp32 rows: (int values as fp32, scale per row)."""
    m = np.abs(x).max(1)
    s = (m / levels).astype(np.float32)
    if f16_scale:
        s = s.astype(np.float16).astype(np.float32)
        q = np.clip(rnd(x / s[:, None]), -levels, levels)
    else:
        q = rnd(x * (levels / m)[:, None].astype(np.float32))
    return q.astype(np.float32), s


def cosine(a, b):
    return (a * b).sum(1) / np.linalg.norm(a, axis=1) / np.linalg.norm(b, axis=1)


def dataset_pass(vec, scale_from=()):
    """Per-dimension max |x| over all tokens (of scale_from's files instead, if given), then per-token cosine of each scheme's dequantised vectors."""
    n = vec.shape[0]
    mx = np.zeros(DIM, dtype=np.float32)
    for v in scale_from or (vec,):
        for c in range(0, v.shape[0], CHUNK):
            mx = np.maximum(mx, np.abs(v[c:c + CHUNK].astype(np.float32)).max(0))
    sdim = mx / 127
    cos = {k: [] for k in ('tok8', 'tok8h', 'dim8', 'tok4')}
    for c in range(0, n, CHUNK):
        x = vec[c:c + CHUNK].astype(np.float32)
        for k, (lv, h) in {'tok8': (127, False), 'tok8h': (127, True), 'tok4': (7, False)}.items():
            q, s = quant_tok(x, lv, h)
            cos[k].append(cosine(x, q * s[:, None]))
        cos['dim8'].append(cosine(x, np.clip(rnd(x / sdim), -127, 127) * sdim))
    stats = {}
    for k, v in cos.items():
        v = np.concatenate(v)
        stats[k] = {'min': float(v.min()), 'p0.1': float(np.percentile(v, 0.1)), 'median': float(np.median(v))}
    return sdim.astype(np.float32), stats


def report(out):
    acc = ['| Dataset | Depth | Queries | Variant | R@5 | ΔR@5 (95%) | ΔnDCG@10 (95%) | Δhit@5 (95%) | Top-5 order changed | Top-5 set changed |',
           '|---|---|---|---|---|---|---|---|---|---|']
    cos = ['| Dataset | Tokens | ' + ' | '.join(f'{k} min / p0.1 / median' for k in ('tok8', 'tok8h', 'dim8', 'tok4')) + ' |',
           '|---|---|---|---|---|---|']
    seen = set()
    for ds, mode, depth, tag, label in RUNS:
        path = f'{out}/{ds}/colbert/quant-{mode}-{depth}{tag}.json'
        if not os.path.exists(path):
            continue
        run = json.load(open(path))
        if ds not in seen and not tag:
            seen.add(ds)
            cos.append(f"| {ds} | {run['tokens']:,} | " + ' | '.join(
                f"{v['min']:.5f} / {v['p0.1']:.5f} / {v['median']:.6f}" for v in run['cosine'].values()) + ' |')
        fp = run['runs']['fp16']
        base = np.array([r['m'] for r in fp])
        for k, rs in run['runs'].items():
            if tag and not k.startswith('dim8'):
                continue
            m = np.array([r['m'] for r in rs])
            if k == 'fp16':
                cells = ['—'] * 3
            else:
                rng = np.random.default_rng(0)
                cells = [fmt(*ci(m[:, i] - base[:, i], rng)) for i in (1, 3, 0)]
            order = np.mean([a['top10'][:5] != b['top10'][:5] for a, b in zip(rs, fp)])
            sets = np.mean([set(a['top10'][:5]) != set(b['top10'][:5]) for a, b in zip(rs, fp)])
            acc.append(f'| {label} | {depth} | {len(rs)} | {k} | {m[:, 1].mean():.3f} | ' + ' | '.join(cells) +
                       f' | {order:.1%} | {sets:.1%} |')
    print('\n'.join(acc), '\n\n' + '\n'.join(cos))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dataset')
    ap.add_argument('--mode')
    ap.add_argument('--depth', type=int, default=50)
    ap.add_argument('--report', action='store_true')
    ap.add_argument('--data', default='out', help='tree holding the vectors, pools and published reranks')
    ap.add_argument('--out', default='out')
    ap.add_argument('--dim-scales-from', help='comma-separated datasets whose tokens set dim8 scales (values beyond clip)')
    a = ap.parse_args()
    if a.report:
        return report(a.out)
    d = f'{a.data}/{a.dataset}'
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
    published = {r['q']: r['rerank'] for r in json.load(open(f'{d}/colbert/rerank-{a.mode}-{a.depth}.json'))['results']}

    other = [np.memmap(f'{a.data}/{o}/{KEY}/rows.f16.bin', dtype='<f2', mode='r').reshape(-1, DIM)
             for o in a.dim_scales_from.split(',')] if a.dim_scales_from else ()
    sdim, cos = dataset_pass(vec, other)
    print(f'{a.dataset}: {vec.shape[0]} tokens; per-token cosine vs fp16 ' +
          ', '.join(f"{k} min {v['min']:.5f} p0.1 {v['p0.1']:.5f} median {v['median']:.6f}" for k, v in cos.items()))

    names = ['fp16', 'tok8/qf', 'tok8/qi', 'tok8h/qi', 'dim8/qf', 'dim8/qi', 'tok4/qf', 'tok8/qi+fp5', 'tok8/qi+fp10']
    runs = {k: [] for k in names}
    for p in pool:
        rel = set(p['relevant'])
        top = p['top'][:a.depth]
        q = qvec[qindex[p['q']]].astype(np.float32)
        rows = [r for doc in top for r in doc_rows[doc]]
        owner = np.repeat(np.arange(len(top)), [len(doc_rows[doc]) for doc in top])
        D = np.concatenate([vec[off[r]:off[r + 1]] for r in rows]).astype(np.float32)
        starts = np.concatenate([[0], np.cumsum([off[r + 1] - off[r] for r in rows])[:-1]])

        def score(S, qscale=None):
            """S: 32 x tokens pair scores; max per part and query token, sum over query tokens, best part per doc."""
            m = np.maximum.reduceat(S, starts, axis=1)
            if qscale is not None:
                m = m * qscale[:, None]
            row = m.sum(0)
            best = np.full(len(top), -np.inf, dtype=np.float32)
            np.maximum.at(best, owner, row)
            return best

        t8, s8 = quant_tok(D, 127)
        t8h, s8h = quant_tok(D, 127, True)
        t4, s4 = quant_tok(D, 7)
        d8 = np.clip(rnd(D / sdim), -127, 127)
        qi8, qs8 = quant_tok(q, 127)
        qd = q * sdim
        qdi, qds = quant_tok(qd, 127)
        best = {
            'fp16': score(q @ D.T),
            'tok8/qf': score(q @ (t8 * s8[:, None]).T),
            'tok8/qi': score((qi8 @ t8.T) * s8[None, :], qs8),
            'tok8h/qi': score((qi8 @ t8h.T) * s8h[None, :], qs8),
            'dim8/qf': score(qd @ d8.T),
            'dim8/qi': score(qdi @ d8.T, qds),
            'tok4/qf': score(q @ (t4 * s4[:, None]).T),
        }
        order = {k: sorted(range(len(top)), key=lambda j: (-b[j], j)) for k, b in best.items()}
        for m in (5, 10):
            o = order['tok8/qi']
            head = sorted(o[:m], key=lambda j: (-best['fp16'][j], o.index(j)))
            order[f'tok8/qi+fp{m}'] = head + o[m:]
        for k in names:
            reranked = [top[j] for j in order[k]] + p['top'][a.depth:]
            runs[k].append({'q': p['q'], 'm': metrics(reranked, rel), 'top10': reranked[:10]})
        assert runs['fp16'][-1]['m'] == published[p['q']], p['q']

    out = {'dataset': a.dataset, 'mode': a.mode, 'depth': a.depth, 'tokens': int(vec.shape[0]), 'cosine': cos,
           'metrics': ['hit@5', 'R@5', 'MRR@10', 'nDCG@10'], 'runs': runs}
    os.makedirs(f'{a.out}/{a.dataset}/colbert', exist_ok=True)
    tag = '-dimfrom-' + a.dim_scales_from.replace(',', '+') if a.dim_scales_from else ''
    out['dim_scales_from'] = a.dim_scales_from
    with open(f'{a.out}/{a.dataset}/colbert/quant-{a.mode}-{a.depth}{tag}.json', 'w') as f:
        json.dump(out, f)
    for k in names:
        print(f"{k:13s} R@5 {np.mean([r['m'][1] for r in runs[k]]):.4f} nDCG@10 {np.mean([r['m'][3] for r in runs[k]]):.4f}")


if __name__ == '__main__':
    main()
