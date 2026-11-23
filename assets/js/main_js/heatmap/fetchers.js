/* heatmap/fetchers.js — data fetchers for GitHub / Codeforces / LeetCode / AtCoder. */

import { toISO } from './helpers.js';

/* ── DATA FETCHERS ───────────────────────────────────────────── */

/**
 * GitHub: contributions via the public contributions endpoint.
 * Uses the undocumented but stable ?from=&to= calendar endpoint
 * (same one the profile page uses).  Falls back gracefully.
 */
export async function fetchGitHub(username) {
  if (!username) return {};
  const map = {};
  try {
    const r = await fetch('/api/gh', { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(r.status);
    const { days } = await r.json();
    for (const { date, count } of days) {
      map[date] = (map[date] || 0) + count;
    }
  } catch (e) {
    console.warn('[heatmap] GitHub fetch failed:', e.message);
  }
  return map;
}

/**
 * Codeforces: /user.status returns all submissions AND rating.
 * Returns { submissions: {}, rating: 0 }
 */
export async function fetchCodeforces(handle) {
  if (!handle) return { submissions: {}, rating: 0 };
  const map = {};
  let rating = 0;
  try {
    const r = await fetch(`/api/cf?handle=${encodeURIComponent(handle)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(r.status);
    const json = await r.json();
    rating = json.rating || 0;
    for (const t of json.times) {
      const date = toISO(new Date(t * 1000));
      map[date] = (map[date] || 0) + 1;
    }
  } catch (e) {
    console.warn('[heatmap] Codeforces fetch failed:', e.message);
  }
  return { submissions: map, rating };
}

/**
 * LeetCode: public GraphQL API.
 * submissionCalendar is a JSON-encoded map of Unix timestamps → count.
 */
export async function fetchLeetCode(username) {
  if (!username) return {};
  const map = {};
  try {
    const r = await fetch('/api/lc', { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(r.status);
    const json = await r.json();
    const raw = json?.submissionCalendar;
    if (!raw) throw new Error('empty response');
    const cal = typeof raw === 'string' ? JSON.parse(raw) : raw;
    for (const [ts, count] of Object.entries(cal)) {
      const date = toISO(new Date(Number(ts) * 1000));
      map[date] = (map[date] || 0) + count;
    }
  } catch (e) {
    console.warn('[heatmap] LeetCode fetch failed:', e.message);
  }
  return map;
}

/**
 * AtCoder: uses the unofficial kenkoooo contest results API.
 * Returns one entry per accepted submission.
 */
export async function fetchAtCoder(username) {
  if (!username) return {};
  const map = {};
  try {
    const r = await fetch('/api/atc', { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error(r.status);
    const { times } = await r.json();
    for (const t of times) {
      const date = toISO(new Date(t * 1000));
      map[date] = (map[date] || 0) + 1;
    }
  } catch (e) {
    console.warn('[heatmap] AtCoder fetch failed:', e.message);
  }
  return map;
}

export async function fetchCodeChef(username) {
  if (!username) return {};
  const map = {};
  try {
    const r = await fetch('/api/cc', { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error(r.status);
    const { days } = await r.json();
    for (const { date, count } of days) {
      if (count > 0) map[date] = (map[date] || 0) + count;
    }
  } catch (e) {
    console.warn('[heatmap] CodeChef fetch failed:', e.message);
  }
  return map;
}
