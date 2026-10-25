#!/usr/bin/env python3
"""Run from repo root: python3 scripts/build_company_index.py
Reads the local copy of leetcode-company-wise-problems and writes data/company_dsa_questions.js (index only)."""
import csv, json, os, datetime
SRC = 'data/leetcode_source'
ROOT = os.path.join(SRC, 'companies') if os.path.isdir(os.path.join(SRC, 'companies')) else SRC

def key(fn):
    f = fn.lower()
    if not f.endswith('.csv'): return None
    if 'thirty' in f: return 'd30'
    if 'three' in f: return 'm3'
    if 'more' in f: return 'm6p'
    if 'six' in f: return 'm6'
    if f.endswith('all.csv'): return 'all'

out = []
slugs, pos = [], {}

def slug(link):
    return ((link or '').split('/problems/')[1:] or [''])[0].split('/')[0].split('?')[0]
for d in sorted(os.listdir(ROOT)):
    p = os.path.join(ROOT, d)
    if not os.path.isdir(p) or d.startswith('.'): continue
    f = {k: fn for fn in os.listdir(p) if (k := key(fn))}
    if 'all' not in f: continue
    with open(os.path.join(p, f['all']), encoding='utf-8-sig', newline='') as fh:
        rows = list(csv.DictReader(fh))
    c = {'EASY': 0, 'MEDIUM': 0, 'HARD': 0}
    acc, ids = [], set()
    for r in rows:
        c[(r.get('Difficulty') or '').upper()] = c.get((r.get('Difficulty') or '').upper(), 0) + 1
        sl = slug(r.get('Link'))
        if sl:
            if sl not in pos: pos[sl] = len(slugs); slugs.append(sl)
            ids.add(pos[sl])
        try: acc.append(float(r.get('Acceptance Rate')))
        except (TypeError, ValueError): pass
    name = d.replace('-', ' ').replace('_', ' ')
    out.append({'n': name.title() if name.islower() else name, 'd': d, 't': len(rows),
                'e': c['EASY'], 'm': c['MEDIUM'], 'h': c['HARD'],
                'a': round(sum(acc) / len(acc), 6) if acc else 0, 's': sorted(ids), 'f': f})

idx = {'base': ROOT.replace(os.sep, '/'), 'generated': datetime.date.today().isoformat(), 'slugs': slugs, 'companies': out}
with open('data/company_dsa_questions.js', 'w', encoding='utf-8') as fh:
    fh.write('window.COMPANY_DSA_INDEX=' + json.dumps(idx, separators=(',', ':')) + ';\n')
print(len(out), 'companies indexed')