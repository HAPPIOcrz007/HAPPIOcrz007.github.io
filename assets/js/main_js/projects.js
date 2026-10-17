/* projects.js — project cards + modal opening (data/projects.js). */

import { attachCardEvents } from './cards.js';
import { renderInlineMarkdown, renderMarkdown, stripMarkdown } from './markdown.js';
import { modal } from './modal.js';
import { initProjectsScroller } from './projects-scroller.js';
import { $, escapeHtml, fetchText } from './utils.js';

export function renderProjects(projects) {
  const root = $('#projectsGrid');
  if (!root) return;
  if (!projects?.length) { root.innerHTML = '<div class="loading">No projects</div>'; return; }

  root.innerHTML = projects.map((p, i) => {
    const thumb = (p.images?.[0]) || `content/projects/${p.id}/images/01.png`;
    return `
      <div class="project-card reveal" data-id="${escapeHtml(p.id)}"
           style="transition-delay:${Math.min(i * 50, 400)}ms" role="button" tabindex="0">
        <div class="project-thumb">
          <img src="${escapeHtml(thumb)}" alt="${escapeHtml(stripMarkdown(p.title))}" loading="lazy"
               onerror="this.parentElement.innerHTML='&lt;div class=&quot;project-thumb-empty&quot;&gt;// no preview&lt;/div&gt;'" />
        </div>
        <div class="project-body">
          <div class="project-date">${renderInlineMarkdown(p.date || '')}</div>
          <div class="project-title">${renderInlineMarkdown(p.title)}</div>
          <div class="project-desc">${renderInlineMarkdown(p.shortDesc || '')}</div>
          <div class="tech-tags">
            ${(p.tech || []).map(t => `<span class="tech-tag">${renderInlineMarkdown(t)}</span>`).join('')}
          </div>
        </div>
      </div>`;
  }).join('');

  // Event delegation: one listener for the whole grid instead of one per card
  const projectMap = new Map(projects.map(p => [p.id, p]));
  attachCardEvents(root, '.project-card', (card) => async () => {
    const p = projectMap.get(card.dataset.id);
    if (!p) return;
    const md = await fetchText(`content/projects/${p.id}/index.md`);
    const images = p.images?.length ? p.images : [`content/projects/${p.id}/images/01.png`];
    modal.open(p.title, images, renderMarkdown(md || ''));
  });

  // Cards just replaced the DOM — resync the arrow buttons / drag-scroll
  initProjectsScroller();
}
