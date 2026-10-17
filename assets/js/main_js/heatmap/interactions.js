/* heatmap/interactions.js — hover tooltips (via GlobalTip) and the platform badge filter. */

import { getLevels } from './config.js';

/* ── TOOLTIP ─────────────────────────────────────────────────── */
// Hover info for heatmap cells is rendered by the shared
// GlobalTip (top-centre, under the nav) rather than a tooltip
// node floating next to the cursor.
export function attachTooltip(root) {
  root.querySelectorAll('.ahm-cell').forEach(cell => {
    window.GlobalTip.bind(cell, (el) => {
      const parts = (el.dataset.tip || '').split('|');
      return parts.map((p, i) =>
        i === 0 ? `<strong>${p}</strong>` : `<span>${p}</span>`
      ).join('');
    });
  });
}

/* ── BADGE FILTER ───────────────────────────────────────────── */
/*
 * Single-click  → filter to that platform (toggle on).
 * Click again   → clear filter, show all.
 * Only one platform active at a time.
 *
 * Works purely on already-rendered rects — no re-render.
 * Reads data-gh / data-cf / data-lc / data-ac set on each rect.
 */
export function attachBadgeFilter(root, maxCount) {
  const badges = root.querySelectorAll('.ahm-badge[data-platform]');
  const cells = root.querySelectorAll('.ahm-cell');
  let active = null;   // currently filtered platform key, or null = all

  function applyFilter(platform) {
    const levels = getLevels();
    cells.forEach(cell => {
      const count = platform
        ? parseInt(cell.dataset[platform] || '0', 10)
        : parseInt(cell.dataset.count || '0', 10);

      // recolour
      const pct = maxCount > 0 ? count / maxCount : 0;
      const lvl = count === 0 ? 0 : pct < .15 ? 1 : pct < .35 ? 2 : pct < .65 ? 3 : 4;
      cell.setAttribute('fill', levels[lvl]);

      // fade cells that have zero count for this platform
      cell.style.opacity = (platform && count === 0) ? '0.18' : '1';
    });
  }

  badges.forEach(badge => {
    badge.style.cursor = 'pointer';
    badge.setAttribute('role', 'button');
    badge.setAttribute('tabindex', '0');
    // Hover hint goes through the shared GlobalTip (top-centre,
    // under the nav) rather than the browser's native title
    // bubble, so every hover on the page reads the same way.
    const label = (badge.textContent || '').trim().replace(/\s+/g, ' ');
    window.GlobalTip.bind(badge, () =>
      `<strong>${label}</strong><span>click to filter · click again to clear</span>`
    );

    const activate = () => {
      const key = badge.dataset.platform;   // 'gh' | 'cf' | 'lc' | 'ac'

      if (active === key) {
        // toggle off → show all
        active = null;
        badges.forEach(b => b.classList.remove('ahm-badge--active'));
        applyFilter(null);
      } else {
        active = key;
        badges.forEach(b => b.classList.toggle('ahm-badge--active', b === badge));
        applyFilter(key);
      }
    };

    badge.addEventListener('click', activate);
    badge.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
  });
}
