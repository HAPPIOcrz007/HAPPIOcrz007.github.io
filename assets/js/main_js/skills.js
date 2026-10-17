/* skills.js — skills grid (data/skills.js). */

import { renderInlineMarkdown } from './markdown.js';
import { $ } from './utils.js';

export function renderSkills(skills) {
  const container = $('#skillsContainer');
  if (!container) return;
  if (!skills?.length) { container.innerHTML = '<div class="loading">No skills data</div>'; return; }

  container.innerHTML = skills.map(s => `
    <div class="skill-card reveal">
      <div class="skill-cat">${renderInlineMarkdown(s.category)}</div>
      <div class="skill-items">
        ${(s.items || []).map(i => `<span class="skill-pill">${renderInlineMarkdown(i)}</span>`).join('')}
      </div>
    </div>
  `).join('');
}
