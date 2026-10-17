/* markdown.js — renderMarkdown (blocks), renderInlineMarkdown (inline-only),
   stripMarkdown. Blog posts use the richer renderer in blog/markdown.js. */

import { escapeHtml } from './utils.js';

/* ===== Markdown renderer ===== */
function applyColorCodes(html) {
  return html.replace(/=\(#([A-Fa-f0-9]{6})\)(.*?)=/gs,
    (_, hex, content) => `<span style="color:#${hex}">${content}</span>`);
}

export function renderMarkdown(md) {
  if (!md) return '';

  let h = escapeHtml(md);
  h = applyColorCodes(h);
  h = h.replace(/```([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`);
  h = h.replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+?)`/g, '<code>$1</code>');
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  h = h.replace(/(^|\n)((?:[-*] .+\n?)+)/g, (_, pre, block) => {
    const items = block.trim().split('\n')
      .map(l => `<li>${l.replace(/^[-*] /, '').trim()}</li>`).join('');
    return `${pre}<ul>${items}</ul>`;
  });
  h = h.split(/\n{2,}/).map(chunk => {
    const t = chunk.trim();
    if (!t) return '';
    if (/^\s*<(h\d|ul|ol|pre|blockquote|table)/.test(t)) return t;
    return `<p>${t.replace(/\n/g, '<br>')}</p>`;
  }).filter(Boolean).join('\n');

  return h;
}

/* ===== Inline markdown renderer =====
   For single-line / short data-driven text (titles, labels, pills, tags,
   contact rows, notifications, hero copy, etc). Supports the same
   **bold**, *italic*, `code`, [text](url) links and =(#hex)...= color-code
   syntax as renderMarkdown() above, but never emits block-level tags
   (no <p>, <h#>, <ul>, code fences) so it's safe to drop into any inline
   container (a span, a pill, a title) without breaking its layout. */
export function renderInlineMarkdown(md) {
  if (md == null || md === '') return '';

  let h = escapeHtml(String(md));
  h = applyColorCodes(h);
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+?)`/g, '<code>$1</code>');
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="md-link" target="_blank" rel="noopener noreferrer">$1</a>');

  return `<span class="md-inline">${h}</span>`;
}

/* Strip markdown syntax down to plain text — for places that can't hold
   HTML (e.g. an alt attribute) so formatting characters don't show up
   literally when the underlying field uses markdown. */
export function stripMarkdown(md) {
  if (md == null) return '';
  return String(md)
    .replace(/=\(#[A-Fa-f0-9]{6}\)(.*?)=/gs, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+?)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .trim();
}
