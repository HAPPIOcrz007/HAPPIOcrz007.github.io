/* heatmap/stats.js — merge platform data, compute totals, map counts to colour levels. */

import { addDays, daysBetween, toISO } from './helpers.js';

/* ── MERGE + STATS ────────────────────────────────────────────── */
/**
 * Merge per-platform maps into { date → { total, gh, cf, lc, ac } }
 */
export function merge(gh, cf, lc, ac) {
  const all = {};
  const add = (src, key) => {
    for (const [d, n] of Object.entries(src)) {
      if (!all[d]) all[d] = { total: 0, gh: 0, cf: 0, lc: 0, ac: 0 };
      all[d][key] += n;
      all[d].total += n;
    }
  };
  add(gh, 'gh');
  add(cf, 'cf');
  add(lc, 'lc');
  add(ac, 'ac');
  return all;
}

export function computeStats(data) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Only look at the past 365 days
  const cutoff = addDays(today, -364);
  let total = 0;
  let longest = 0;
  let current = 0;
  let lastDate = null;
  let activeDays = 0;
  let githubTotal = 0;
  let cfTotal = 0;
  let lcTotal = 0;
  let acTotal = 0;

  // Walk every day in range in order
  const start = new Date(cutoff);
  for (let i = 0; i <= 364; i++) {
    const d = addDays(start, i);
    const iso = toISO(d);
    const day = data[iso];

    if (day && day.total > 0) {
      total += day.total;
      githubTotal += day.gh;
      cfTotal += day.cf;
      lcTotal += day.lc;
      acTotal += day.ac;
      activeDays++;

      if (lastDate && daysBetween(lastDate, d) === 1) {
        current++;
      } else {
        current = 1;
      }
      if (current > longest) longest = current;
      lastDate = d;
    } else {
      current = 0;
      lastDate = null;
    }
  }

  // Current streak (up to and including today)
  let streak = 0;
  for (let i = 364; i >= 0; i--) {
    const iso = toISO(addDays(start, i));
    if (data[iso]?.total > 0) streak++;
    else break;
  }

  return { total, longest, streak, activeDays, githubTotal, cfTotal, lcTotal, acTotal };
}

/* ── LEVEL MAPPING ───────────────────────────────────────────── */
export function countToLevel(count, max) {
  if (!count || count === 0) return 0;
  if (max <= 0) return 1;
  const pct = count / max;
  if (pct < 0.15) return 1;
  if (pct < 0.35) return 2;
  if (pct < 0.65) return 3;
  return 4;
}
