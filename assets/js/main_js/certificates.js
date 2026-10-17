/* certificates.js — certificate cards + modal opening (data/certificates.js). */

import { attachCardEvents } from './cards.js';
import { renderInlineMarkdown, renderMarkdown } from './markdown.js';
import { modal } from './modal.js';
import { $, escapeHtml, fetchText } from './utils.js';

export function renderCertificates(certs) {
  const root = $('#certificatesContainer');
  if (!root) return;
  if (!certs?.length) { root.innerHTML = '<div class="loading">No certificates</div>'; return; }

  root.innerHTML = certs.map((c, i) => `
    <div class="cert-card reveal" data-id="${escapeHtml(c.id)}"
         style="transition-delay:${Math.min(i * 40, 350)}ms" role="button" tabindex="0">
      <div class="cert-issuer">${renderInlineMarkdown(c.issuer || 'Certificate')}</div>
      <div class="cert-title">${renderInlineMarkdown(c.title)}</div>
      <div class="cert-date">${renderInlineMarkdown(c.date || '')}</div>
    </div>
  `).join('');

  const certMap = new Map(certs.map(c => [c.id, c]));
  attachCardEvents(root, '.cert-card', (card) => async () => {
    const c = certMap.get(card.dataset.id);
    if (!c) return;
    const md = await fetchText(`content/certificates/${c.id}/index.md`);
    const img = `content/certificates/${c.id}/01.png`;
    modal.open(c.title, [img], renderMarkdown(md || c.description || ''));
  });
}
