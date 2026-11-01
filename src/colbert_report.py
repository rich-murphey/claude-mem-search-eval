# Tables for results/colbert-rerank.md from src/colbert_rerank.py's runs and
# src/rerank.ts's cross-encoder runs (read from --ce, default
# ../model-agnostic/out, where they were made).
#
#   python3 src/colbert_report.py [--ce ../model-agnostic/out]
#
# Differences are paired per query; 95% intervals from 2,000 bootstrap
# resamples of queries (seed 0), as src/metrics.ts's BOOTSTRAP.
import argparse
import json
import os

import numpy as np

RUNS = [  # dataset, mode, depth, label
    ('longmemeval-s', 'store', 20, 'LME store'),
    ('longmemeval-s', 'store', 50, 'LME store'),
    ('longmemeval-s', 'scoped', 20, 'LME scoped'),
    ('longmemeval-s', 'scoped', 50, 'LME scoped'),
    ('memsearch-en', 'store', 20, 'ms-en store'),
    ('memsearch-en', 'store', 50, 'ms-en store'),
    ('miracl-en', 'scoped', 20, 'M-en scoped'),
    ('miracl-en', 'scoped', 50, 'M-en scoped'),
]
NAMES = ['hit@5', 'R@5', 'MRR@10', 'nDCG@10']


def ci(diff, rng):
    idx = rng.integers(0, len(diff), (2000, len(diff)))
    b = diff[idx].mean(1)
    return diff.mean(), np.percentile(b, 2.5), np.percentile(b, 97.5)


def fmt(m, lo, hi):
    return f'{m:+.3f} ({lo:+.3f}…{hi:+.3f})'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ce', default='../model-agnostic/out')
    a = ap.parse_args()
    acc = ['| Dataset | Depth | Queries | R@5 base → ColBERT (Δ, 95%) | nDCG@10 (Δ, 95%) | hit@5 (Δ, 95%) | Rows/query | Tokens/query |',
           '|---|---|---|---|---|---|---|---|']
    vs = ['| Dataset | Depth | Queries | Cross-encoder ΔR@5 | ColBERT ΔR@5 | ColBERT − CE: R@5 | nDCG@10 | hit@5 | Share of CE\'s R@5 gain |',
          '|---|---|---|---|---|---|---|---|---|']
    lat = ['| Dataset | Depth | Query encode p50 / p95 | Gather p50 | MaxSim p50 / p95 (8 thr) | MaxSim p50 (1 thr) | Total p50 / p95 | Cross-encoder p50 / p95 |',
           '|---|---|---|---|---|---|---|---|']
    for ds, mode, depth, label in RUNS:
        path = f'out/{ds}/colbert/rerank-{mode}-{depth}.json'
        if not os.path.exists(path):
            continue
        run = json.load(open(path))
        res = run['results']
        base = np.array([r['base'] for r in res]); cb = np.array([r['rerank'] for r in res])
        rng = np.random.default_rng(0)
        cells = []
        for k in (1, 3, 0):
            m, lo, hi = ci(cb[:, k] - base[:, k], rng)
            cells.append(f'{base[:, k].mean():.3f} → {cb[:, k].mean():.3f}, {fmt(m, lo, hi)}')
        acc.append(f'| {label} | {depth} | {len(res)} | ' + ' | '.join(cells) +
                   f" | {np.mean([r['pairs'] for r in res]):.0f} | {np.mean([r['tokens'] for r in res]):.0f} |")
        enc = np.array(run['encode_ms']); g = np.array([r['gather_ms'] for r in res])
        ms = np.array([r['maxsim_ms'] for r in res]); ms1 = np.array([r['maxsim_1t_ms'] for r in res])
        tot = np.median(enc) + g + ms
        p = lambda x, q: np.percentile(x, q)
        ce_lat = '—'
        ce_path = f'{a.ce}/{ds}/ma/rerank-{mode}-{depth}.json'
        if os.path.exists(ce_path):
            ce = json.load(open(ce_path))
            by = {r['q']: r for r in ce['results']}
            common = [i for i, r in enumerate(res) if r['q'] in by]
            ceb = np.array([by[res[i]['q']]['base'] for i in common])
            assert np.allclose(ceb, base[common]), 'baselines differ'
            cer = np.array([by[res[i]['q']]['rerank'] for i in common]); cbc = cb[common]
            rng = np.random.default_rng(0)
            d_ce = ci(cer[:, 1] - ceb[:, 1], rng); d_cb = ci(cbc[:, 1] - ceb[:, 1], rng)
            row = [fmt(*d_ce), fmt(*d_cb)] + [fmt(*ci(cbc[:, k] - cer[:, k], rng)) for k in (1, 3, 0)]
            share = d_cb[0] / d_ce[0] if d_ce[0] else float('nan')
            vs.append(f'| {label} | {depth} | {len(common)} | ' + ' | '.join(row) + f' | {share:.0%} |')
            cms = np.array([r['ms'] for r in ce['results']])
            ce_lat = f'{p(cms, 50):.0f} / {p(cms, 95):.0f}'
        lat.append(f'| {label} | {depth} | {p(enc, 50):.1f} / {p(enc, 95):.1f} | {p(g, 50):.2f} | {p(ms, 50):.2f} / {p(ms, 95):.2f} | '
                   f'{p(ms1, 50):.2f} | {p(tot, 50):.1f} / {p(tot, 95):.1f} | {ce_lat} |')
    print('\n'.join(acc), '\n\n' + '\n'.join(vs), '\n\n' + '\n'.join(lat))


if __name__ == '__main__':
    main()
