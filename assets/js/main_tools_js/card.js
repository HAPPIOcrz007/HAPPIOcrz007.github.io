/* card.js — builds one tool card element. */

import { esc, md } from './dom.js';

export function card(n, t) {
  const el = document.createElement(t.link ? "a" : "div");
  el.className = "project-card blog-card";
  if (t.link) { el.href = t.link; el.target = "_blank"; el.rel = "noopener noreferrer"; }
  el.innerHTML = `<div class="project-thumb"><img src="assets/images/tools_${n}.png" alt="${esc(t.title)} preview" loading="lazy" /></div>
<div class="project-body">
  <div class="project-date">${esc(t.date || "tool")}</div>
  <h3 class="project-title">${esc(t.title)}</h3>
  <p class="project-desc">${md(t.desc)}</p>
  <div class="tech-tags">${t.tags.map(x => `<span class="tech-tag">${esc(x)}</span>`).join("")}</div>
</div>`;
  el.querySelector("img").addEventListener("error", e => {
    e.target.parentNode.innerHTML = '<div class="project-thumb-empty">no preview</div>';
  });
  return el;
}
