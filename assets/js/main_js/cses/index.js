/* ================================================================
   cses/index.js — CSES Problem Set progress (boxed table, below the
   multi-platform activity heatmap).

   Fully manual/static — CSES has no public API and no public
   per-user "which tasks are solved" data, so nothing here is
   fetched over the network:
     - The full 400-problem set below is bundled statically
       (CSES_PROBLEMSET), grouped into its 18 official categories.
     - Which boxes are highlighted "solved" comes from
       window.DATA_CSES_SOLVED (data/cses.js) — a flat list of task
       IDs you maintain by hand. See data/cses.js for details.
     - data-cses-id on #csesHeatmap is just used to build the link
       in the header badge (cses.fi/problemset/user/<id>) — it does
       not trigger any fetch.
   ================================================================ */

import { getSolvedSet, render } from './render.js';
import { injectStyles } from './styles.js';

/* ── BOOT ────────────────────────────────────────────────────── */
// Everything here is local/static — reading window.DATA_CSES_SOLVED
// and a bundled problem list — so init is synchronous, no fetch,
// no loading state needed.
let _cachedSolved = null;
let _cachedUserId = null;

function init() {
  const root = document.getElementById('csesHeatmap');
  if (!root) return;

  // data-cses-id on #csesHeatmap is only used to build the header
  // badge's link (cses.fi/problemset/user/<id>) — it doesn't fetch
  // anything.
  _cachedUserId = root.dataset.csesId || '';

  injectStyles();

  _cachedSolved = getSolvedSet();
  render(root, _cachedSolved, _cachedUserId);
}

/* Entry point (the old IIFE self-started). Called once from main.js boot. */
export function initCses() {
  // Re-render on theme change and whenever data/cses.js's list could
  // have changed — purely local, no refetch.
  document.addEventListener('themeChange', () => {
    const root = document.getElementById('csesHeatmap');
    if (!root || !_cachedSolved) return;
    render(root, _cachedSolved, _cachedUserId);
  });

  init();
}
