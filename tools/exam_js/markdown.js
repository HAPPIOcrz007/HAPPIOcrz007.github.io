/* exam_js/markdown.js — markdown → HTML for questions, options and answers.

   Everything the site's own renderer does (**bold**, *italic*, `code`, [links](url),
   =(accent)colour= / =(#hex)colour=) plus:
     <u>underline</u>   ~~strike~~   headings   lists (nested)   > quotes   ---   GFM tables
     ```python fenced code``` (highlighted with the site's blog/highlight.js)

   BLOCKS WITH AN ID AND A NAME (what the /table and /callout slash commands insert):
     :::table{id=t1 name="Scores"}            ::::callout{id=c1 name="Hint" color=info}
     | A | B |                                 Any markdown here, even a :::table inside.
     | - | - |                                 ::::
     | 1 | 2 |
     :::
   A block closes on a line holding exactly the same number of colons it opened with, so a
   callout (4 colons) can hold a table (3 colons).

   IMAGES: ![alt](img:i1) uses an image the setter uploaded (pass `assets: paper.assets`);
   ![alt|60%](img:i1) / ![alt|320](img:i1) set the width. https images also work.

   SAFETY: all text is HTML-escaped first. Links are limited to http(s)/mailto/#. Images are
   off unless `{ images: true }` (use that for setter content only — student answers must not
   be able to load remote images into the setter's browser). */

import { escapeHtml } from '../../assets/js/main_js/utils.js';
import { codeBlockHtml } from '../../assets/js/main_js/blog/highlight.js';
import { CALLOUT_COLORS } from './format.js';

export const COLOR_NAMES = ['accent', 'ok', 'warn', 'info', 'cyan', 'danger', 'muted', 'dim'];

/* Names map to CSS tokens, so a retheme in tokens/colors.css recolours content too. */
function tokenColor(c) {
  if (c[0] === '#') return c;
  const map = { accent: '--green', muted: '--text-muted', dim: '--text-dim' };
  return `var(${map[c] || '--' + c})`;
}
const q = (s) => String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const COLOR_RE = new RegExp(`=\\(((?:#[A-Fa-f0-9]{6})|${COLOR_NAMES.join('|')})\\)([\\s\\S]*?)=`, 'g');

/* ================= inline ================= */
function inl(h, o) {
  const st = [];
  const put = (x) => `\u0000${st.push(x) - 1}\u0000`;

  h = h.replace(/`([^`\n]+?)`/g, (_, c) => put(`<code>${c}</code>`));
  h = h.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, rawAlt, url) => {
    const wm = rawAlt.match(/^(.*?)(?:\|(\d{1,4})(%|px)?)?$/);          // alt text, optional |60% or |320 width
    const alt = wm[1], width = wm[2] ? wm[2] + (wm[3] || 'px') : '';
    let src = '';
    if (o.images) {
      src = url.startsWith('img:') ? ((o.assets || {})[url.slice(4)] || '') : url;
      if (!/^(https:\/\/|data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$)/i.test(src)) src = '';
    }
    if (!src) return put(`<span class="md-img-off">[image${alt ? ': ' + alt : ''} not shown]</span>`);
    return put(`<img src="${q(src)}" alt="${q(alt)}" loading="lazy" class="md-img"${width ? ` style="width:${width}"` : ''}>`);
  });
  h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) => {
    if (!/^(https?:\/\/|mailto:|#)/i.test(url)) return put(inl(text, o));
    return put(`<a href="${q(url)}" class="md-link" target="_blank" rel="noopener noreferrer">${inl(text, o)}</a>`);
  });

  h = h.replace(COLOR_RE, (_, c, t) => `<span style="color:${tokenColor(c)}">${t}</span>`);
  h = h.replace(/\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\w)__(?=\S)([\s\S]+?)(?<=\S)__(?!\w)/g, '<strong>$1</strong>')
    .replace(/&lt;u&gt;([\s\S]+?)&lt;\/u&gt;/g, '<u>$1</u>')
    .replace(/~~(?=\S)([\s\S]+?)(?<=\S)~~/g, '<s>$1</s>')
    .replace(/(?<![\w*])\*(?=[^\s*])([^*\n]+?)(?<=[^\s*])\*(?![\w*])/g, '<em>$1</em>')
    .replace(/(?<![\w])_(?=[^\s_])([^_\n]+?)(?<=[^\s_])_(?![\w])/g, '<em>$1</em>');

  while (/\u0000\d+\u0000/.test(h)) h = h.replace(/\u0000(\d+)\u0000/g, (_, n) => st[n]);
  return h;
}
const inline = (raw, o) => inl(escapeHtml(String(raw).replace(/\u0000/g, '')), o);

/** Ids of uploaded images referenced in a markdown text: ![..](img:i1) → ['i1']. */
export function collectImageIds(md) {
  return [...String(md ?? '').matchAll(/!\[[^\]]*\]\(img:([\w-]+)\)/g)].map((m) => m[1]);
}

/** Inline-only (no block tags) — safe inside a button, label or table cell. */
export function renderInlineMarkdown(md, opts = {}) {
  if (md == null || md === '') return '';
  return `<span class="md-inline">${inline(md, opts)}</span>`;
}

/* ================= blocks ================= */
const CONTAINER = /^(:{3,})\s*(callout|table)\b\s*(?:\{(.*)\})?\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

function parseAttrs(s = '') {
  const a = {};
  for (const m of s.matchAll(/(\w+)=(?:"([^"]*)"|(\S+))/g)) a[m[1]] = m[2] !== undefined ? m[2] : m[3];
  return a;
}
function splitRow(l) {
  let s = l.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|'));
}
const depthOf = (ws) => ws.replace(/\t/g, '    ').length;

function listHtml(items, o) {
  let idx = 0;
  const build = () => {
    const base = items[idx].depth, tag = items[idx].ordered ? 'ol' : 'ul';
    let html = `<${tag}>`;
    while (idx < items.length && items[idx].depth >= base) {
      let li = `<li>${inline(items[idx].text, o)}`;
      idx++;
      while (idx < items.length && items[idx].depth > base) li += build();
      html += li + '</li>';
    }
    return html + `</${tag}>`;
  };
  let out = '';
  while (idx < items.length) out += build();
  return out;
}

function containerHtml(kind, a, inner) {
  const id = /^[\w-]+$/.test(a.id || '') ? a.id : '';
  const name = escapeHtml(a.name || '');
  const tag = id ? `<span class="md-tag">${kind === 'table' ? 'Table' : 'Callout'} · ${escapeHtml(id)}</span>` : '';
  if (kind === 'table') {
    return `<figure class="md-table-fig"${id ? ` data-table-id="${q(id)}"` : ''}>` +
      `<figcaption>${tag}<span class="md-fig-name">${name}</span></figcaption>${inner}</figure>`;
  }
  const color = CALLOUT_COLORS.find((c) => c.id === a.color) || CALLOUT_COLORS[0];
  return `<aside class="md-callout" style="--co:${tokenColor(color.id)}" data-color="${color.id}"` +
    `${id ? ` data-callout-id="${q(id)}"` : ''}>` +
    `<div class="md-callout-head"><strong>${name || 'Note'}</strong>${tag}</div>` +
    `<div class="md-callout-body">${inner}</div></aside>`;
}

function blocks(src, o) {
  const lines = src.split('\n');
  const out = [], para = [];
  let i = 0;
  const flush = () => {
    if (para.length) { out.push(`<p>${para.map((l) => inline(l, o)).join('<br>')}</p>`); para.length = 0; }
  };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { flush(); i++; continue; }
    let m;

    if ((m = line.match(/^\s*(`{3,})\s*([^`\s]*)[^`]*$/))) {                       // fenced code
      flush();
      const closer = new RegExp('^\\s*`{' + m[1].length + ',}\\s*$');
      const code = [];
      i++;
      while (i < lines.length && !closer.test(lines[i])) code.push(lines[i++]);
      i++;
      out.push(codeBlockHtml(m[2], code.join('\n')));
      continue;
    }
    if ((m = line.match(CONTAINER))) {                                              // :::table / ::::callout
      flush();
      const inner = [];
      i++;
      while (i < lines.length && lines[i].trim() !== m[1]) inner.push(lines[i++]);
      i++;
      out.push(containerHtml(m[2], parseAttrs(m[3]), blocks(inner.join('\n'), o)));
      continue;
    }
    if ((m = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/))) {                    // heading
      flush(); out.push(`<h${m[1].length}>${inline(m[2], o)}</h${m[1].length}>`); i++; continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push('<hr>'); i++; continue; }

    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) &&
        (lines[i + 1].includes('|') || lines[i + 1].includes(':'))) {               // GFM table
      flush();
      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((c) => {
        c = c.trim();
        return c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : '';
      });
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(splitRow(lines[i++]));
      const cell = (tag, t, k) => `<${tag}${aligns[k] ? ` style="text-align:${aligns[k]}"` : ''}>${inline(t.trim(), o)}</${tag}>`;
      out.push(`<div class="md-table-wrap"><table><thead><tr>${head.map((t, k) => cell('th', t, k)).join('')}</tr></thead>` +
        `<tbody>${rows.map((r) => `<tr>${head.map((_, k) => cell('td', r[k] ?? '', k)).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^\s*>/.test(line)) {                                                       // blockquote
      flush();
      const qs = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) qs.push(lines[i++].replace(/^\s*> ?/, ''));
      out.push(`<blockquote>${blocks(qs.join('\n'), o)}</blockquote>`);
      continue;
    }
    if ((m = line.match(LIST_ITEM))) {                                              // lists
      flush();
      const items = [];
      while (i < lines.length && lines[i].trim()) {
        const lm = lines[i].match(LIST_ITEM);
        if (lm) items.push({ depth: depthOf(lm[1]), ordered: /\d/.test(lm[2]), text: lm[3] });
        else if (/^\s{2,}\S/.test(lines[i]) && items.length) items[items.length - 1].text += ' ' + lines[i].trim();
        else break;
        i++;
      }
      out.push(listHtml(items, o));
      continue;
    }
    para.push(line);
    i++;
  }
  flush();
  return out.join('\n');
}

/** Block markdown → HTML. Wrap the result in an element with class "exam-md". */
export function renderMarkdown(md, opts = {}) {
  if (!md) return '';
  return blocks(String(md).replace(/\r\n?/g, '\n').replace(/\u0000/g, ''), { images: !!opts.images, assets: opts.assets || {} });
}

/* ================= helpers ================= */

/** Plain text for list rows, search and exports. */
export function stripMarkdown(md) {
  return String(md ?? '')
    .replace(/^:{3,}\s*(?:callout|table).*$/gm, '').replace(/^:{3,}\s*$/gm, '')
    .replace(/```[\s\S]*?```/g, ' [code] ')
    .replace(/=\([^)]*\)([\s\S]*?)=/g, '$1')
    .replace(/<\/?u>/g, '').replace(/\*\*|__|~~/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[#>\s-]+/gm, '').replace(/[*_`|]/g, '')
    .replace(/\s+/g, ' ').trim();
}

/** Every :::table / ::::callout in a text → [{ kind, id, name, color }] (for unique-id checks). */
export function collectBlockIds(md) {
  const res = [];
  for (const line of String(md ?? '').split('\n')) {
    const m = line.match(CONTAINER);
    if (!m) continue;
    const a = parseAttrs(m[3]);
    res.push({ kind: m[2], id: a.id || '', name: a.name || '', color: a.color || '' });
  }
  return res;
}

/** A finished highlighted code block (label + Copy button) for a student's code answer. `lang` = highlighter key. */
export function renderCode(code, lang) { return codeBlockHtml(lang || '', String(code ?? '')); }

/** Highlighted, escaped inner HTML of a code block — for code editors that overlay a <pre>.
    Reuses the site's highlighter through codeBlockHtml (no change to your existing files). */
export function highlightInner(code, lang) {
  const m = codeBlockHtml(lang || '', code).match(/<pre><code[^>]*>([\s\S]*)<\/code><\/pre>/);
  return m ? m[1] : escapeHtml(code);
}

/** Make the "Copy" buttons inside rendered code blocks work (call once per container). */
export function enhanceCodeBlocks(root) {
  if (root.__mdCopy) return;
  root.__mdCopy = true;
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('.blog-code-copy');
    if (!btn) return;
    const code = btn.closest('.blog-code')?.querySelector('code')?.textContent ?? '';
    try { await navigator.clipboard.writeText(code); btn.textContent = 'Copied'; }
    catch { btn.textContent = 'Press Ctrl+C'; }
    setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
  });
}
