/* exam_js/charts.js — small dependency-free charts for the dashboard.
   Colours come from the theme tokens (classes ok / bad / warn / accent / info / muted), so they follow
   light/dark mode. Every chart carries text for screen readers (aria-label + <title>/title tooltips). */

import { el } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  kids.flat().forEach((c) => c != null && n.append(c));
  return n;
};
const TOKEN = { ok: '--ok', bad: '--danger', warn: '--warn', accent: '--green', info: '--info', cyan: '--cyan', muted: '--text-muted', dim: '--border2' };
const color = (cls) => `var(${TOKEN[cls] || TOKEN.accent})`;

/** Horizontal bars: rows = [{ label, value (0..1), text, cls, title, onclick }] */
export function barList(rows) {
  return el('div', { class: 'ex-barlist' }, rows.map((r) => el('div', { class: `ex-barrow${r.onclick ? ' clickable' : ''}`, title: r.title || '', onclick: r.onclick },
    el('span', { class: 'ex-barlabel', text: r.label }),
    el('div', { class: `ex-bar ${r.cls || ''}`, role: 'img', 'aria-label': `${r.label}: ${r.text}` }, el('i', { style: `width:${Math.round(Math.max(0, Math.min(1, r.value || 0)) * 100)}%` })),
    el('span', { class: 'ex-barval', text: r.text }))));
}

/** Vertical columns: cols = [{ label, value, title, cls }], markers = [{ at (0..100 along the axis), label, cls }] */
export function columns(cols, { height = 150, markers = [] } = {}) {
  const max = Math.max(1, ...cols.map((c) => c.value));
  return el('div', { class: 'ex-columns', style: `--h:${height}px` },
    el('div', { class: 'ex-colplot' },
      ...cols.map((c) => el('div', { class: 'ex-col', title: c.title || '' },
        el('span', { class: 'ex-histn', text: c.value || '' }),
        el('i', { class: c.cls || '', style: `height:${Math.round((c.value / max) * (height - 22))}px` }),
        el('span', { class: 'ex-histl', text: c.label }))),
      ...markers.map((m, i) => el('div', { class: `ex-marker ${m.cls || ''}`, style: `left:${Math.max(0, Math.min(100, m.at))}%`, title: m.label },
        el('span', { class: 'ex-markerl', style: `top:${i % 2 ? 14 : -2}px`, text: m.label })))));
}

/** Scatter: points = [{ x, y, cls, title, onclick }] */
export function scatter(points, { width = 560, height = 300, xLabel = '', yLabel = '', xMax, yMax = 100, lines = [], xFmt = (v) => v, yFmt = (v) => v } = {}) {
  const m = { l: 46, r: 14, t: 12, b: 40 };
  const pw = width - m.l - m.r, ph = height - m.t - m.b;
  const xm = xMax || Math.max(1, ...points.map((p) => p.x)) * 1.05;
  const X = (v) => m.l + (v / xm) * pw, Y = (v) => m.t + ph - (v / yMax) * ph;
  const ticks = (max, n) => Array.from({ length: n + 1 }, (_, i) => (max / n) * i);
  const g = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'ex-svg', role: 'img', 'aria-label': `${yLabel} against ${xLabel}, ${points.length} students` });
  for (const t of ticks(yMax, 4)) g.append(svg('line', { x1: m.l, x2: width - m.r, y1: Y(t), y2: Y(t), style: 'stroke:var(--border);stroke-width:1' }),
    svg('text', { x: m.l - 6, y: Y(t) + 4, 'text-anchor': 'end', class: 'ex-svgt' }, document.createTextNode(yFmt(Math.round(t)))));
  for (const t of ticks(xm, 5)) g.append(svg('text', { x: X(t), y: height - m.b + 16, 'text-anchor': 'middle', class: 'ex-svgt' }, document.createTextNode(xFmt(Math.round(t)))));
  g.append(svg('text', { x: m.l + pw / 2, y: height - 4, 'text-anchor': 'middle', class: 'ex-svgt strong' }, document.createTextNode(xLabel)),
    svg('text', { x: 12, y: m.t + ph / 2, 'text-anchor': 'middle', transform: `rotate(-90 12 ${m.t + ph / 2})`, class: 'ex-svgt strong' }, document.createTextNode(yLabel)));
  for (const l of lines) g.append(svg('line', { x1: m.l, x2: width - m.r, y1: Y(l.y), y2: Y(l.y), style: `stroke:${color(l.cls || 'warn')};stroke-width:1.5;stroke-dasharray:5 4` }),
    svg('text', { x: width - m.r - 2, y: Y(l.y) - 4, 'text-anchor': 'end', class: 'ex-svgt', style: `fill:${color(l.cls || 'warn')}` }, document.createTextNode(l.label)));
  for (const p of points) {
    const c = svg('circle', { cx: X(p.x), cy: Y(p.y), r: 6, class: `ex-dot${p.onclick ? ' clickable' : ''}`, style: `fill:${color(p.cls || 'accent')}`, tabindex: p.onclick ? '0' : null },
      svg('title', {}, document.createTextNode(p.title || '')));
    if (p.onclick) { c.addEventListener('click', p.onclick); c.addEventListener('keydown', (e) => { if (e.key === 'Enter') p.onclick(); }); }
    g.append(c);
  }
  return el('div', { class: 'ex-scatter' }, g);
}

/** Donut: slices = [{ label, value, cls }], center = text in the middle. */
export function donut(slices, { size = 150, center = '', sub = '' } = {}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = 40, c = 2 * Math.PI * r;
  const g = svg('svg', { viewBox: '0 0 100 100', class: 'ex-donut', role: 'img', 'aria-label': slices.map((s) => `${s.label}: ${s.value}`).join(', ') });
  g.append(svg('circle', { cx: 50, cy: 50, r, fill: 'none', style: 'stroke:var(--bg3);stroke-width:14' }));
  let acc = 0;
  if (total > 0) {
    for (const s of slices) {
      if (!s.value) continue;
      const len = (s.value / total) * c;
      g.append(svg('circle', {
        cx: 50, cy: 50, r, fill: 'none', transform: 'rotate(-90 50 50)',
        'stroke-dasharray': `${Math.max(0, len - 0.6)} ${c - Math.max(0, len - 0.6)}`, 'stroke-dashoffset': -acc,
        style: `stroke:${color(s.cls)};stroke-width:14`,
      }, svg('title', {}, document.createTextNode(`${s.label}: ${s.value}`))));
      acc += len;
    }
  }
  g.append(svg('text', { x: 50, y: sub ? 49 : 54, 'text-anchor': 'middle', class: 'ex-donutc' }, document.createTextNode(center)));
  if (sub) g.append(svg('text', { x: 50, y: 62, 'text-anchor': 'middle', class: 'ex-svgt' }, document.createTextNode(sub)));
  return el('div', { class: 'ex-donutwrap', style: `--s:${size}px` }, g,
    el('ul', { class: 'ex-legend' }, slices.map((s) => el('li', {}, el('i', { style: `background:${color(s.cls)}` }), el('span', { text: `${s.label} — ${s.value}` })))));
}

/** A titled chart card; `how` is one line explaining how to read it. */
export function chartCard(title, how, body, wide = false) {
  return el('section', { class: `ex-chartcard${wide ? ' wide' : ''}` }, el('h3', { text: title }), how ? el('p', { class: 'ex-muted', text: how }) : null, body);
}
