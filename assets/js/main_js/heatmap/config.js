/* heatmap/config.js — usernames override, grid size, theme-aware colour palettes. */

/* ── CONFIG ─────────────────────────────────────────────────── */
// Usernames are read from data-* attrs on #activityHeatmap.
// Override here if you prefer:
export const OVERRIDE = {
  github: null,
  codeforces: null,
  leetcode: null,
  atcoder: null,   // leave null/empty to skip
};

export const WEEKS_TO_SHOW = 53;  // ~1 year
export const CELL_SIZE = 11;
export const CELL_GAP = 3;
export const CELL_STEP = CELL_SIZE + CELL_GAP;

/*
 * Theme-aware cell palettes (indigo accent).
 * Solid hex stops tuned per theme.
 *
 * Dark  : indigo steps from muted -> vivid; empty cells blend into the bg.
 * Light : indigo steps from soft -> deep so they read on the off-white bg.
 */
const PALETTES = {
  dark: [
    'transparent', // 0 — empty : invisible, blends into dark bg
    '#3a2f8a',   // 1 — low   : deep indigo
    '#5b44d6',   // 2 — mid
    '#7c5cff',   // 3 — high  : theme accent
    '#a99bff',   // 4 — peak  : bright lavender
  ],
  light: [
    'transparent', // 0 — empty : invisible, blends into light bg
    '#bdb2ff',   // 1 — low   : soft indigo
    '#8f7bfb',   // 2 — mid
    '#5b3df5',   // 3 — high  : theme accent
    '#33199e',   // 4 — peak  : deep indigo, max contrast on light bg
  ],
};

export function getLevels() {
  const theme = document.documentElement.dataset.theme || 'dark';
  return PALETTES[theme] || PALETTES.dark;
}