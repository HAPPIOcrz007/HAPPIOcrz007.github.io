/* heatmap/render.js — builds the heatmap SVG/DOM (render, loading and error states). */

import { CELL_GAP, CELL_SIZE, CELL_STEP, WEEKS_TO_SHOW, getLevels } from './config.js';
import { addDays, toISO, weekStart } from './helpers.js';
import { attachBadgeFilter, attachTooltip } from './interactions.js';
import { countToLevel } from './stats.js';

/* ── RENDER ──────────────────────────────────────────────────── */
export function render(root, data, stats, usernames) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Grid starts WEEKS_TO_SHOW weeks ago, on a Sunday
  const gridStart = weekStart(addDays(today, -(WEEKS_TO_SHOW - 1) * 7));

  // Build week columns: array of 7-day arrays
  const weeks = [];
  for (let w = 0; w < WEEKS_TO_SHOW; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(gridStart, w * 7 + d);
      if (date > today) { week.push(null); continue; }
      const iso = toISO(date);
      week.push({ date, iso, day: data[iso] || null });
    }
    weeks.push(week);
  }

  // Max count for level scaling
  const maxCount = Math.max(1, ...Object.values(data).map(d => d.total));

  // SVG dimensions
  const svgW = WEEKS_TO_SHOW * CELL_STEP - CELL_GAP + 32; // +32 for day labels
  const svgH = 7 * CELL_STEP - CELL_GAP + 28;             // +28 for month labels

  // Month label positions
  const monthLabels = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const firstDay = week.find(d => d !== null);
    if (!firstDay) return;
    const m = firstDay.date.getMonth();
    if (m !== lastMonth) {
      monthLabels.push({ x: 32 + wi * CELL_STEP, label: firstDay.date.toLocaleString('default', { month: 'short' }) });
      lastMonth = m;
    }
  });

  // Day labels (S M T W T F S)
  const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  // ═══ NEW: Generate last updated timestamp ═══
  const now = new Date();
  const utcString = now.toUTCString(); // "Wed, 03 Jul 2026 15:30:00 GMT"
  // For a cleaner format:
  const formattedDate = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  root.innerHTML = `
      <div class="ahm-wrap">

        <!-- Stats bar -->
        <div class="ahm-stats">
          <div class="ahm-stat">
            <span class="ahm-stat-value">${stats.total.toLocaleString()}</span>
            <span class="ahm-stat-label">total submissions</span>
          </div>
          <div class="ahm-stat">
            <span class="ahm-stat-value">${stats.activeDays}</span>
            <span class="ahm-stat-label">active days</span>
          </div>
          <div class="ahm-stat">
            <span class="ahm-stat-value">${stats.streak}</span>
            <span class="ahm-stat-label">current streak</span>
          </div>
          <div class="ahm-stat">
            <span class="ahm-stat-value">${stats.longest}</span>
            <span class="ahm-stat-label">longest streak</span>
          </div>
          <div class="ahm-platform-badges">
            ${usernames.github ? `<span class="ahm-badge" data-platform="gh">⬡ GitHub <em>${stats.githubTotal.toLocaleString()}</em></span>` : ''}
            ${usernames.codeforces ? `<span class="ahm-badge" data-platform="cf">● CF <em>${stats.cfTotal.toLocaleString()}</em></span>` : ''}
            ${usernames.leetcode ? `<span class="ahm-badge" data-platform="lc">◆ LC <em>${stats.lcTotal.toLocaleString()}</em></span>` : ''}
            ${usernames.atcoder ? `<span class="ahm-badge" data-platform="ac">▲ AC <em>${stats.acTotal.toLocaleString()}</em></span>` : ''}
          </div>
        </div>

        <!-- Last Updated Timestamp -->
        <div class="ahm-last-updated">
          <span class="ahm-updated-icon">🔄</span>
          Last updated: <time datetime="${now.toISOString()}">${formattedDate}</time>
        </div>

        <!-- Heatmap grid -->
        <div class="ahm-grid-wrap">
          <svg class="ahm-svg" viewBox="0 0 ${svgW} ${svgH}"
               role="img" aria-label="Coding activity heatmap for the past year">

            <!-- Month labels -->
            ${monthLabels.map(({ x, label }) =>
    `<text x="${x}" y="10" class="ahm-month">${label}</text>`
  ).join('')}

            <!-- Day labels -->
            ${dayNames.map((name, i) =>
    (i % 2 === 1)   // only M W F for density
      ? `<text x="14" y="${18 + i * CELL_STEP + CELL_SIZE * 0.75}" class="ahm-day">${name}</text>`
      : ''
  ).join('')}

            <!-- Cells -->
            ${weeks.map((week, wi) =>
    week.map((cell, di) => {
      if (!cell) return '';
      const x = 32 + wi * CELL_STEP;
      const y = 18 + di * CELL_STEP;
      const count = cell.day?.total || 0;
      const level = countToLevel(count, maxCount);
      const fill = getLevels()[level];

      // Tooltip data
      const iso = cell.iso;
      const d = cell.day;
      const tip = count === 0
        ? `No activity · ${iso}`
        : [
          `${count} submission${count > 1 ? 's' : ''} · ${iso}`,
          d?.gh ? `GitHub: ${d.gh}` : '',
          d?.cf ? `Codeforces: ${d.cf}` : '',
          d?.lc ? `LeetCode: ${d.lc}` : '',
          d?.ac ? `AtCoder: ${d.ac}` : '',
        ].filter(Boolean).join('|');

      return `<rect
                  x="${x}" y="${y}"
                  width="${CELL_SIZE}" height="${CELL_SIZE}"
                  rx="2" ry="2"
                  fill="${fill}"
                  class="ahm-cell${level > 0 ? ' ahm-cell--active' : ''}"
                  data-date="${iso}"
                  data-count="${count}"
                  data-gh="${d?.gh || 0}"
                  data-cf="${d?.cf || 0}"
                  data-lc="${d?.lc || 0}"
                  data-ac="${d?.ac || 0}"
                  data-tip="${tip}"
                />`;
    }).join('')
  ).join('')}

          </svg>

          <!-- Legend -->
          <div class="ahm-legend" aria-hidden="true">
            <span>less</span>
            ${getLevels().map((c) => `<span class="ahm-legend-cell" style="background:${c}"></span>`).join('')}
            <span>more</span>
          </div>
        </div>

        <!-- Hover info renders in the shared #globalTip (top-centre,
             under the nav) — no per-component tooltip node needed. -->
      </div>
    `;

  attachTooltip(root);
  attachBadgeFilter(root, maxCount);
}

export function renderLoading(root) {
  root.innerHTML = `
      <div class="ahm-wrap ahm-loading">
        <div class="ahm-skeleton-stats">
          ${[...Array(4)].map(() => `<div class="ahm-skeleton ahm-skeleton-stat"></div>`).join('')}
        </div>
        <div class="ahm-skeleton ahm-skeleton-grid"></div>
        <p class="ahm-loading-text">Fetching activity data…</p>
      </div>`;
}

export function renderError(root, msg) {
  root.innerHTML = `
      <div class="ahm-wrap ahm-error">
        <p class="ahm-error-msg">⚠ ${msg}</p>
      </div>`;
}
