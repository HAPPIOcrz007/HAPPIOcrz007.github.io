/* cses/render.js — solved-set lookup, collapse state (localStorage), grid render, tooltips. */

import { CSES_PROBLEMSET } from './problemset.js';

/* ── HELPERS ─────────────────────────────────────────────────── */
export function getSolvedSet() {
  const list = Array.isArray(window.DATA_CSES_SOLVED) ? window.DATA_CSES_SOLVED : [];
  return new Set(list.map(Number));
}

/* ── COLLAPSE STATE (persisted per-browser via localStorage) ──── */
const OPEN_STATE_KEY = 'cses-grid-open';

function isGridOpen() {
  try {
    return localStorage.getItem(OPEN_STATE_KEY) === '1';
  } catch (e) {
    return false;
  }
}

function saveGridOpen(open) {
  try {
    localStorage.setItem(OPEN_STATE_KEY, open ? '1' : '0');
  } catch (e) { /* storage unavailable — collapse state just won't persist */ }
}

/* ── RENDER ──────────────────────────────────────────────────── */
export function render(root, solvedSet, userId) {
  // Flatten the 18 categories into one plain list — the expanded
  // view is a single cell matrix, not grouped by category.
  const allProblems = CSES_PROBLEMSET.flatMap(c => c.problems);
  const totalAll = allProblems.length;
  const solvedAll = allProblems.filter(([id]) => solvedSet.has(id)).length;
  const pct = totalAll ? Math.round((solvedAll / totalAll) * 100) : 0;
  const isOpen = isGridOpen();

  root.innerHTML = `
      <div class="cses-wrap">
        <div class="cses-stats">
          <div class="cses-stat">
            <span class="cses-stat-value">${solvedAll} / ${totalAll}</span>
            <span class="cses-stat-label">tasks solved</span>
          </div>
          <div class="cses-stat">
            <span class="cses-stat-value">${pct}%</span>
            <span class="cses-stat-label">problem set complete</span>
          </div>
          <div class="cses-platform-badges">
            <button type="button" class="cses-toggle-all-btn" data-action="expand">Expand all</button>
            <button type="button" class="cses-toggle-all-btn" data-action="collapse">Collapse all</button>
            ${userId ? `
            <a class="ahm-badge cses-badge" data-platform="cses"
               href="https://cses.fi/problemset/user/${encodeURIComponent(userId)}"
               target="_blank" rel="noopener noreferrer">◇ CSES <em>${solvedAll}</em></a>` : ''}
          </div>
        </div>

        <div class="cses-grid-wrap${isOpen ? ' cses-grid-wrap--open' : ''}" id="csesGridWrap">
          <div class="cses-grid-inner">
            <div class="cses-grid">
              ${allProblems.map(([id, name]) => {
              const isSolved = solvedSet.has(id);
              return `<a
                  class="cses-box${isSolved ? ' cses-box--solved' : ''}"
                  href="https://cses.fi/problemset/task/${id}"
                  target="_blank" rel="noopener noreferrer"
                  data-tip="${name.replace(/"/g, '&quot;')}"
                >${isSolved ? '✓' : ''}</a>`;
            }).join('')}
            </div>
          </div>
        </div>

        <!-- Hover info renders in the shared #globalTip (top-centre,
             under the nav) — no per-component tooltip node needed. -->
      </div>
    `;

  attachTooltip(root);
  attachCollapse(root);
}

/* ── COLLAPSE INTERACTIONS ──────────────────────────────────── */
function attachCollapse(root) {
  const wrap = root.querySelector('#csesGridWrap');
  if (!wrap) return;

  function setOpen(open) {
    wrap.classList.toggle('cses-grid-wrap--open', open);
    saveGridOpen(open);
  }

  root.querySelectorAll('.cses-toggle-all-btn').forEach(btn => {
    btn.addEventListener('click', () => setOpen(btn.dataset.action === 'expand'));
  });
}

// Hover info for CSES cells goes through the shared GlobalTip
// (top-centre, under the nav) instead of a cursor-following node.
function attachTooltip(root) {
  root.querySelectorAll('.cses-box').forEach(box => {
    window.GlobalTip.bind(box, (el) => {
      const solved = el.classList.contains('cses-box--solved');
      return `<strong>${el.dataset.tip || ''}</strong>` +
             `<span>${solved ? 'solved' : 'not solved'}</span>`;
    });
  });
}
