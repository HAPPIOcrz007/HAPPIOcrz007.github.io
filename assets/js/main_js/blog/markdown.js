/* blog/markdown.js — renderBlogMarkdown(): the full blog markdown engine. */

import { BLOG_DIR } from './config.js';
import { codeBlockHtml } from './highlight.js';
import { stripMarkdown } from '../markdown.js';
import { escapeHtml } from '../utils.js';

export function renderBlogMarkdown(md, blogId) {
  if (!md) return '';

  const stash = [];
  const keep = (html) => `\u0000${stash.push(html) - 1}\u0000`;
  const restore = (s) => {
    let prev;
    do { prev = s; s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[i]); } while (s !== prev);
    return s;
  };

  // Image sources: "img:2" -> <id>_2.png, "pdf:2" -> <id>_2.pdf, bare filename -> content/blogs/<name>,
  // full URLs and site paths (content/…, assets/…, /…) pass through untouched.
  const resolveSrc = (u) => {
    u = u.trim();
    const short = /^img:(\d+)$/i.exec(u);
    if (short) return `${BLOG_DIR}${blogId}_${short[1]}.png`;
    const pdfShort = /^pdf:(\d+)$/i.exec(u);
    if (pdfShort) return `${BLOG_DIR}${blogId}_${pdfShort[1]}.pdf`;
    if (/^(https?:)?\/\//i.test(u) || /^(content|assets)\//.test(u) || u.startsWith('/')) return u;
    return BLOG_DIR + u.replace(/^\.\//, '');
  };
  const unsafeUrl = (u) => /^\s*(javascript|data|vbscript):/i.test(u.replace(/&#?\w+;/g, ''));

  // Trailing "{key=val, key2=val2, flag}" after an image/embed target, e.g.
  // {width=200} {height=40,width=auto} {embed=true} {page=3} {float=left}. A bare
  // word ("embed", "float") is shorthand for flag=true.
  const parseAttrs = (str) => {
    const o = {};
    if (!str) return o;
    str.split(',').forEach((part) => {
      const m = /^\s*([a-zA-Z]+)\s*(?:=\s*(.+?))?\s*$/.exec(part);
      if (m) o[m[1].toLowerCase()] = m[2] !== undefined ? m[2].trim() : 'true';
    });
    return o;
  };
  // width/height: a bare number is read as px; "50%", "10rem" etc pass through as-is.
  // Given only one of the two, the other is "auto" so the image keeps its aspect ratio.
  const cssLen = (v) => (/^\d+$/.test(v) ? `${v}px` : v);
  const sizeStyle = (attrs) => {
    const w = attrs.width, h = attrs.height;
    if (!w && !h) return '';
    return ` style="width:${w ? cssLen(w) : 'auto'};height:${h ? cssLen(h) : 'auto'};max-width:100%;"`;
  };

  // alt/src arrive already HTML-escaped (block path escapes them explicitly)
  const imgTag = (alt, src, cls, styleAttr = '') =>
    `<img class="${cls}" src="${resolveSrc(src)}" alt="${alt}" loading="lazy"${styleAttr} />`;
  const isPdf = (src) => /\.pdf(?:[?#].*)?$/i.test(resolveSrc(src));
  const pdfFigure = (altHtml, altPlain, src, attrs = {}) => {
    const url = resolveSrc(src);
    const page = /^\d+$/.test(attrs.page || '') ? parseInt(attrs.page, 10) : 1;
    const href = page > 1 ? `${url}#page=${page}` : url;
    const openLabel = page > 1 ? ` at page ${page}` : '';
    return `<figure class="blog-pdf blog-figure" data-pdf="${url}" data-pdf-page="${page}">` +
      `<a class="blog-pdf-link" href="${href}" target="_blank" rel="noopener noreferrer" ` +
      `aria-label="Open PDF${openLabel} in a new tab${altPlain ? ': ' + altPlain : ''}">` +
      `<canvas></canvas>` +
      `<span class="blog-pdf-badge">📄 <span class="blog-pdf-pages"></span>click to open` +
      `${page > 1 ? ` page ${page} of` : ''} the full PDF ↗</span></a>` +
      `${altHtml ? `<figcaption>${altHtml}</figcaption>` : ''}</figure>`;
  };

  /* ── embeds: clickable link card, NOT an iframe ──
     {embed=true} on an image-style line now renders a preview card the reader
     clicks to open the target in a new tab. Looks like an embedded tile but
     never actually loads the third-party page into the post. */
  const embedCard = (altHtml, altPlain, url) => {
    let host = '';
    try { host = new URL(resolveSrc(url)).hostname.replace(/^www\./, ''); } catch { host = resolveSrc(url); }
    const title = altPlain || host;
    return `<figure class="blog-embed-figure blog-figure">` +
      `<a class="blog-embed blog-embed--card" href="${resolveSrc(url)}" target="_blank" rel="noopener noreferrer" ` +
      `aria-label="Open ${escapeHtml(title)} in a new tab">` +
      `<span class="blog-embed-icon" aria-hidden="true">↗</span>` +
      `<span class="blog-embed-text">` +
      `<span class="blog-embed-title">${altHtml || escapeHtml(host)}</span>` +
      `<span class="blog-embed-host">${escapeHtml(host)} · opens in a new tab</span>` +
      `</span>` +
      `</a></figure>`;
  };

  function inline(text) {
    let h = escapeHtml(text);                     // everything below sees escaped text
    h = h.replace(/`([^`]+?)`/g, (_, c) => keep(`<code>${c}</code>`));
    h = h.replace(/=\(#([A-Fa-f0-9]{6})\)(.*?)=/gs,
      (_, hex, c) => `${keep(`<span style="color:#${hex}">`)}${c}${keep('</span>')}`);
    h = h.replace(/!\[([^\]]*)\]\(([^)\s]+)\)(?:\{([^}]*)\})?/g,
      (_, alt, src, attrStr) => {
        if (unsafeUrl(src)) return '';
        const attrs = parseAttrs(attrStr);
        if (attrs.embed === 'true') {
          return keep(`<a class="blog-embed blog-embed--inline" href="${resolveSrc(src)}" ` +
            `target="_blank" rel="noopener noreferrer">` +
            `<span class="blog-embed-icon" aria-hidden="true">↗</span>` +
            `<span class="blog-embed-title">${alt || escapeHtml(resolveSrc(src))}</span></a>`);
        }
        if (isPdf(src)) return keep(`<a href="${resolveSrc(src)}" target="_blank" rel="noopener noreferrer">📄 ${alt || 'PDF'}</a>`);
        return keep(imgTag(alt, src, 'blog-inline-img', sizeStyle(attrs)));
      });
    h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
      if (unsafeUrl(url)) return label;
      const ext = /^(https?:)?\/\//i.test(url) || url.startsWith('mailto:');
      const attrs = ext ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `${keep(`<a class="md-link" href="${url}"${attrs}>`)}${label}${keep('</a>')}`;
    });
    h = h.replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>')
         .replace(/~~(.+?)~~/gs, '<del>$1</del>')
         .replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>');
    return h;
  }

  const isRule = (l) => /^\s*([-*_])(\s*\1){2,}\s*$/.test(l);
  const isHeading = (l) => /^#{1,6}\s+/.test(l);
  const isQuote = (l) => /^\s*>/.test(l);
  const isFence = (l) => /^\u0000\d+\u0000$/.test(l.trim());
  const imgLineRe = /^\s*!\[([^\]]*)\]\(([^)\s]+)\)(?:\{([^}]*)\})?\s*$/;
  const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes('-');
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

  /* ── typed + recursively-nested lists ──
     Each list marker is matched with its indent depth; the marker type is
     detected from the first item at each depth so `1.` → decimal, `a.` →
     lower-alpha, `A.` → upper-alpha, `i.` → lower-roman, `I.` → upper-roman,
     `- * +` → bullet. Sub-lists are produced by recursing on the collected
     children, so any depth is fine. A list block ends when a line is
     non-indented and no longer matches a marker. */
  const LIST_MARKER = /^(\s*)([-*+]|\d+[.)]|[a-zA-Z][.)]|[ivxlcdmIVXLCDM]+[.)])\s+(.*)$/;
  const markerType = (marker) => {
    if (/^[-*+]$/.test(marker)) return 'ul';
    if (/^\d/.test(marker)) return 'ol-1';
    if (/^[a-z]/.test(marker)) return 'ol-a';
    if (/^[A-Z]/.test(marker)) return 'ol-A';
    if (/^[ivxlcdm]+[.)]$/.test(marker)) return 'ol-i';
    if (/^[IVXLCDM]+[.)]$/.test(marker)) return 'ol-I';
    return 'ul';
  };
  const OL_TAG = {
    'ol-1': '<ol>',
    'ol-a': '<ol type="a">',
    'ol-A': '<ol type="A">',
    'ol-i': '<ol type="i">',
    'ol-I': '<ol type="I">',
  };

  function parseList(lines, startIdx) {
    const first = LIST_MARKER.exec(lines[startIdx]);
    if (!first) return { html: '', next: startIdx };
    const baseIndent = first[1].length;
    const type = markerType(first[2]);
    const isOrdered = type !== 'ul';
    const tag = isOrdered ? OL_TAG[type] || '<ol>' : '<ul>';

    const items = [];
    let i = startIdx;

    while (i < lines.length) {
      const m = LIST_MARKER.exec(lines[i]);
      if (!m) {
        // Blank line inside a list — look ahead for a continuation at the same depth.
        if (lines[i].trim() === '' && i + 1 < lines.length) {
          const nm = LIST_MARKER.exec(lines[i + 1]);
          if (nm && nm[1].length === baseIndent) { i++; continue; }
        }
        break;
      }
      const indent = m[1].length;
      if (indent < baseIndent) break;
      if (indent > baseIndent) {
        // Deeper marker — collected as a child of the last item.
        const sub = parseList(lines, i);
        if (items.length && sub.html) items[items.length - 1].children.push(sub.html);
        i = sub.next;
        continue;
      }
      items.push({ text: m[3], children: [] });
      i++;
    }

    const html = tag + items.map(it =>
      `<li>${inline(it.text)}${it.children.join('')}</li>`
    ).join('') + tag.replace('<', '</');

    return { html, next: i };
  }

  const startsBlock = (l, next) =>
    isHeading(l) || isRule(l) || isQuote(l) || LIST_MARKER.test(l) || isFence(l) ||
    imgLineRe.test(l) || /^\s*:::/.test(l) ||
    (l.includes('|') && next !== undefined && isTableSep(next));

  /* ── Wiki-style side-by-side container ──
     :::float left
     ![alt](img:1)
     :::
     …paragraph text that wraps around the floated image…
     The opening fence may be `left` or `right`; anything else defaults to right. */
  function parseFloatContainer(lines, startIdx) {
    const open = /^\s*:::float\s+(left|right)\s*$/i.exec(lines[startIdx]);
    if (!open) return { html: '', next: startIdx + 1 };
    const side = open[1].toLowerCase();
    const body = [];
    let i = startIdx + 1;
    while (i < lines.length && !/^\s*:::\s*$/.test(lines[i])) { body.push(lines[i]); i++; }
    if (i < lines.length) i++;  // consume the closing :::
    const inner = parseBlocks(body).join('\n');
    return { html: `<div class="blog-float blog-float--${side}">${inner}</div>`, next: i };
  }

  function parseBlocks(lines) {
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }

      if (isFence(line)) { out.push(line.trim()); i++; continue; }

      if (/^\s*:::float\s+(left|right)\s*$/i.test(line)) {
        const { html, next } = parseFloatContainer(lines, i);
        out.push(html);
        i = next;
        continue;
      }

      if (isRule(line)) { out.push('<hr>'); i++; continue; }

      let m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if (m) {                                    // # and ## -> <h2> (the post title is the page's <h1>)
        const lvl = Math.max(2, m[1].length);
        out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`);
        i++; continue;
      }

      m = imgLineRe.exec(line);
      if (m) {
        const alt = m[1];
        const srcEsc = escapeHtml(m[2]);
        const attrs = parseAttrs(m[3]);
        const captionHtml = alt ? inline(alt) : '';
        const captionPlain = escapeHtml(stripMarkdown(alt));
        const floatSide = (attrs.float || '').toLowerCase();

        if (unsafeUrl(m[2])) out.push('');
        else if (attrs.embed === 'true') out.push(embedCard(captionHtml, captionPlain, srcEsc));
        else if (isPdf(srcEsc)) out.push(pdfFigure(captionHtml, captionPlain, srcEsc, attrs));
        else {
          const figure = `<figure class="blog-figure">${imgTag(escapeHtml(alt), srcEsc, 'blog-img', sizeStyle(attrs))}` +
            `${captionHtml ? `<figcaption>${captionHtml}</figcaption>` : ''}</figure>`;
          if (floatSide === 'left' || floatSide === 'right') {
            out.push(`<div class="blog-float blog-float--${floatSide}">${figure}</div>`);
          } else {
            out.push(figure);
          }
        }
        i++; continue;
      }

      if (isQuote(line)) {
        const q = [];
        while (i < lines.length && isQuote(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        out.push(`<blockquote>${parseBlocks(q).join('\n')}</blockquote>`);
        continue;
      }

      if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        const head = cells(line);
        const aligns = cells(lines[i + 1]).map(c =>
          /^:-+:$/.test(c) ? 'center' : /^-+:$/.test(c) ? 'right' : '');
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].includes('|')) { rows.push(cells(lines[i])); i++; }
        const td = (tag, c, k) => `<${tag}${aligns[k] ? ` style="text-align:${aligns[k]}"` : ''}>${inline(c)}</${tag}>`;
        out.push(`<div class="blog-table-wrap"><table><thead><tr>${head.map((c, k) => td('th', c, k)).join('')}</tr></thead>` +
          `<tbody>${rows.map(r => `<tr>${head.map((_, k) => td('td', r[k] || '', k)).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }

      if (LIST_MARKER.test(line)) {
        const { html, next } = parseList(lines, i);
        out.push(html);
        i = next;
        continue;
      }

      // paragraph — runs until a blank line or the start of another block
      const para = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !startsBlock(lines[i], lines[i + 1])) { para.push(lines[i]); i++; }
      out.push(`<p>${inline(para.join('\n')).replace(/\n/g, '<br>')}</p>`);
    }
    return out;
  }

  let src = String(md).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
  src = src.replace(/^```([^\n]*)\n([\s\S]*?)^```[ \t]*$/gm,
    (_, info, code) => `\n${keep(codeBlockHtml(info, code.replace(/\n$/, '')))}\n`);

  return restore(parseBlocks(src.split('\n')).join('\n'));
}
