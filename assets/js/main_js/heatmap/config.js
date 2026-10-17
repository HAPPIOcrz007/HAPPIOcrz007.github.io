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
 * Theme-aware cell palettes.
 * Opacity-based greens wash out on light and disappear on very dark backgrounds
 * — so we use solid hex stops tuned per theme instead.
 *
 * Dark  : empty cell is a visible orange-tinted slate; oranges step muted → vivid.
 * Light : empty cell is soft peach; oranges are deep enough to read on white.
 */
const PALETTES = {
  dark: [
    'transparent', // 0 — empty : invisible, blends into dark bg
    '#7a2a0a',   // 1 — low   : deep rust
    '#a83a0d',   // 2 — mid
    '#e8510f',   // 3 — high  : theme accent
    '#ff6b35',   // 4 — peak  : bright vivid orange
  ],
  light: [
    'transparent', // 0 — empty : invisible, blends into light bg
    '#e8834f',   // 1 — low   : soft orange
    '#d1611f',   // 2 — mid
    '#b0430a',   // 3 — high
    '#7a2a05',   // 4 — peak  : deep burnt orange, max contrast on light bg
  ],
};

export function getLevels() {
  const theme = document.documentElement.dataset.theme || 'dark';
  return PALETTES[theme] || PALETTES.dark;
}
