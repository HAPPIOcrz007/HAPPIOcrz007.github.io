#!/usr/bin/env python3
"""Run from the repo root: python3 scripts/build_dsa_problem_set.py path/to/sheet.xlsx
Writes data/dsa_problem_set.js. Reads only titles, difficulty and links (Status/ticks are ignored).
Keep the .xlsx itself out of the repo (add it to .gitignore); commit only the generated file."""
import sys, re, json, datetime, openpyxl

if len(sys.argv) < 2:
    sys.exit(__doc__)
wb = openpyxl.load_workbook(sys.argv[1])
DIFF = {'Novice', 'Easy', 'Medium', 'Hard', 'Extreme'}
slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

def clean(t):
    t = str(t).strip()
    return 'Problem %d' % int(float(t)) if re.fullmatch(r'\d+(\.0)?', t) else t

def blocks(ws, col):
    out, r = [], 1
    while r <= ws.max_row:
        if ws.cell(r, col).value == '#' and ws.cell(r, col + 1).value == 'Problem Name':
            name = str(ws.cell(r - 2, col).value or '').strip()
            items, q = [], r + 1
            while q <= ws.max_row and ws.cell(q, col + 1).value:
                c, d = ws.cell(q, col + 1), ws.cell(q, col + 2).value
                if c.hyperlink and c.hyperlink.target and d in DIFF:
                    items.append([clean(c.value), d, c.hyperlink.target])
                q += 1
            out.append({'n': name, 'i': items})
            r = q
        else:
            r += 1
    return out

groups = [{'name': 'LeetCode list', 'pages': []}, {'name': 'Codeforces ladder', 'pages': []}, {'name': 'Topic sheets', 'pages': []}]
for ws in wb:
    if ws.title == 'Topics':
        continue
    if ws.title == 'LC':
        for b in blocks(ws, 1):
            b['n'] = 'Arrays, intervals and stack' if b['n'] == 'STL' else b['n']
            groups[0]['pages'].append({'id': 'lc-' + slug(b['n']), 'name': b['n'], 'sections': [b]})
    elif ws.title == 'CF':
        for col, name in zip([1, 7, 13, 19], ['Div 2 A', 'Div 2 B', 'Div 2 C', 'Div 2 D']):
            groups[1]['pages'].append({'id': 'cf-' + slug(name), 'name': name, 'sections': blocks(ws, col)})
    else:
        name = str(ws['A1'].value or ws.title).strip()
        groups[2]['pages'].append({'id': slug(name), 'name': name, 'sections': blocks(ws, 1)})

data = {'generated': datetime.date.today().isoformat(), 'groups': groups}
with open('data/dsa_problem_set.js', 'w', encoding='utf-8') as fh:
    fh.write('window.DSA_SET=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(sum(len(s['i']) for g in groups for p in g['pages'] for s in p['sections']), 'problems in',
      sum(len(g['pages']) for g in groups), 'pages')
