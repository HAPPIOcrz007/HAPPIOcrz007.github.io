/* achievements.js — achievements list (data/achievements.js). */

import { renderInlineMarkdown } from './markdown.js';
import { $ } from './utils.js';

export function renderAchievements(items) {
  const container = $('#achievementsContainer');
  if (!container) return;
  if (!items?.length) { container.innerHTML = '<div class="loading">No achievements</div>'; return; }

  container.innerHTML = items.map((a, i) => `
    <div class="ach-item reveal" style="transition-delay:${Math.min(i * 30, 300)}ms">
      <div class="ach-rank">${renderInlineMarkdown(a.rank)}</div>
      <div>
        <div class="ach-title">${renderInlineMarkdown(a.title)}</div>
        <div class="ach-desc">${renderInlineMarkdown(a.desc)}</div>
      </div>
    </div>
  `).join('');
}
