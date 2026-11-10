/* heatmap/config.js — usernames override, grid size, theme-aware colour levels. */

import { heatLevels } from '../tokens.js';

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
 * Cell colours come from the CSS tokens --heat-0 … --heat-4
 * (assets/css/styles_css/tokens/colors.css, one set per theme).
 * Change them there — nothing to edit in this file.
 * Index 0 = empty cell, 4 = peak.
 */
export function getLevels() {
  return heatLevels();
}
