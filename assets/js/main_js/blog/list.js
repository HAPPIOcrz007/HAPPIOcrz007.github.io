/* blog/list.js — blog card grid (data/blogs.js) + click → history entry. */

import { BLOG_DIR } from './config.js';
import { blogReader } from './reader.js';
import { renderInlineMarkdown, stripMarkdown } from '../markdown.js';
import { $, escapeHtml } from '../utils.js';

export function renderBlogs(blogs) {
  const root = $('#blogsGrid');
  if (!root) return;
  blogs = (blogs || []).filter((b) => !b.hidden);   // hidden posts skip the grid, but their
                                                      // #post-<id> link still opens directly —
                                                      // so you can preview a draft before flipping hidden to false
  if (!blogs.length) { root.innerHTML = '<div class="loading">No blogs yet</div>'; return; }

  root.innerHTML = blogs.map((b, i) => `
    <a class="project-card blog-card reveal" href="#post-${escapeHtml(b.id)}" data-id="${escapeHtml(b.id)}"
       style="transition-delay:${Math.min(i * 50, 400)}ms">
      <div class="project-thumb">
        <img src="${BLOG_DIR}${escapeHtml(b.id)}.png" alt="${escapeHtml(stripMarkdown(b.title))}" loading="lazy"
             onerror="this.parentElement.innerHTML='&lt;div class=&quot;project-thumb-empty&quot;&gt;// no cover&lt;/div&gt;'" />
      </div>
      <div class="project-body">
        <div class="project-date">${renderInlineMarkdown(b.date || '')}</div>
        <div class="project-title">${renderInlineMarkdown(b.title)}</div>
        <div class="project-desc">${renderInlineMarkdown(b.shortDesc || '')}</div>
        <div class="tech-tags">
          ${(b.tags || []).map(t => `<span class="tech-tag">${renderInlineMarkdown(t)}</span>`).join('')}
        </div>
      </div>
    </a>`).join('');
  // Cards are plain #post-<id> links (middle-click / copy-link work). A normal
  // click is intercepted so we push a history entry we own — that lets the
  // reader's Back button and the browser Back button behave identically.
  if (!root._blogBound) {
    root._blogBound = true;
    root.addEventListener('click', (e) => {
      const card = e.target.closest('.blog-card');
      if (!card || e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      history.pushState({ blogNav: true }, '', `#post-${card.dataset.id}`);
      blogReader.show(card.dataset.id);
    });
  }
}
