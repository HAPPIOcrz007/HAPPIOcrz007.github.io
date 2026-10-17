/* heatmap/index.js — boot + state for the activity heatmap (fetch once, re-render on theme change).
   Fetches: GitHub · Codeforces · LeetCode · AtCoder (optional). Usernames come from
   data-* attributes on #activityHeatmap. Called from main.js: initHeatmap(). */

import { OVERRIDE } from './config.js';
import { fetchAtCoder, fetchCodeforces, fetchGitHub, fetchLeetCode } from './fetchers.js';
import { render, renderError, renderLoading } from './render.js';
import { computeStats, merge } from './stats.js';
import { injectStyles } from './styles.js';
import { updateHeroStatsFromHeatmap } from '../hero-stats.js';

/* ── BOOT ────────────────────────────────────────────────────── */

// Cached data so theme-toggle re-renders don't refetch
let _cachedMerged = null;
let _cachedStats = null;
let _cachedUsernames = null;
let _cachedCfRating = 0;

async function init() {
  const root = document.getElementById('activityHeatmap');
  if (!root) return;

  const usernames = {
    github: OVERRIDE.github ?? root.dataset.github ?? '',
    codeforces: OVERRIDE.codeforces ?? root.dataset.codeforces ?? '',
    leetcode: OVERRIDE.leetcode ?? root.dataset.leetcode ?? '',
    atcoder: OVERRIDE.atcoder ?? root.dataset.atcoder ?? '',
  };
  _cachedUsernames = usernames;

  injectStyles();
  renderLoading(root);

  try {
    const [gh, cf, lc, ac] = await Promise.all([
      fetchGitHub(usernames.github),
      fetchCodeforces(usernames.codeforces),
      fetchLeetCode(usernames.leetcode),
      fetchAtCoder(usernames.atcoder),
    ]);

    // Extract submissions and rating from CF response
    const cfSubmissions = cf.submissions || {};
    _cachedCfRating = cf.rating || 0;

    _cachedMerged = merge(gh, cfSubmissions, lc, ac);
    _cachedStats = computeStats(_cachedMerged);

    // Add CF rating to stats
    _cachedStats.cfRating = _cachedCfRating;

    render(root, _cachedMerged, _cachedStats, _cachedUsernames);

    // Update hero stats with real data
    updateHeroStatsFromHeatmap(_cachedStats);

  } catch (err) {
    console.error('[heatmap] Fatal error:', err);
    renderError(root, 'Could not load activity data. Check console for details.');
  }
}

/* Entry point. The old IIFE started itself (readyState check); now main.js calls this
   once during boot, so the hero stat boxes it updates already exist. */
export function initHeatmap() {
  // Re-render cells when the portfolio theme toggle fires — no refetch needed
  document.addEventListener('themeChange', () => {
    const root = document.getElementById('activityHeatmap');
    if (!root || !_cachedMerged) return;
    render(root, _cachedMerged, _cachedStats, _cachedUsernames);
    // Update hero stats on theme change too
    updateHeroStatsFromHeatmap(_cachedStats);
  });

  init();
}
