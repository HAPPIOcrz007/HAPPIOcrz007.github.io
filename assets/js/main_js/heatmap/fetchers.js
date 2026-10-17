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
    // GitHub's contributions calendar is only exposed via HTML scraping
    // or the GraphQL API (needs token).  We use the public
    // contributions-collection via the v4 API without a token by
    // hitting the public JSON that the contribution graph uses.
    // As a reliable no-token alternative we use ghchart.rshah.org.
    const url = `https://github-contributions-api.jogruber.de/v4/${username}?y=last`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(r.status);
    const json = await r.json();
    // Response: { contributions: [{date:'YYYY-MM-DD', count:N}, ...] }
    for (const { date, count } of (json.contributions || [])) {
      if (count > 0) map[date] = (map[date] || 0) + count;
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
    // Get user info for rating
    const userUrl = `https://codeforces.com/api/user.info?handles=${handle}`;
    const userRes = await fetch(userUrl, { signal: AbortSignal.timeout(5000) });
    if (userRes.ok) {
      const userJson = await userRes.json();
      if (userJson.status === 'OK' && userJson.result.length > 0) {
        rating = userJson.result[0].rating || 0;
      }
    }

    // Get submissions
    const url = `https://codeforces.com/api/user.status?handle=${handle}&from=1&count=10000`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(r.status);
    const json = await r.json();
    if (json.status !== 'OK') throw new Error(json.comment);
    for (const sub of json.result) {
      const date = toISO(new Date(sub.creationTimeSeconds * 1000));
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

  // leetcode.com/graphql blocks CORS from browsers.
  // alfa-leetcode-api is a free public CORS proxy that mirrors the same data.
  // Endpoint is path-param style: /:username/calendar?year=YYYY
  // (the old ?username=&year= query-string route is retired and 404s).
  const url = `https://alfa-leetcode-api.onrender.com/${encodeURIComponent(username)}/calendar?year=${new Date().getFullYear()}`;

  // The free Render instance sleeps when idle and can take 20-50s to cold-start
  // on the first request. One retry with a longer timeout covers that case
  // instead of giving up after a single 12s attempt.
  const attempts = [12000, 25000];

  for (let i = 0; i < attempts.length; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(attempts[i]) });
      if (!r.ok) throw new Error(r.status);
      const json = await r.json();
      // Response: { submissionCalendar: '{"timestamp": count, ...}' }
      const raw = json?.submissionCalendar;
      if (!raw) throw new Error('empty response');
      const cal = typeof raw === 'string' ? JSON.parse(raw) : raw;
      for (const [ts, count] of Object.entries(cal)) {
        const date = toISO(new Date(Number(ts) * 1000));
        map[date] = (map[date] || 0) + count;
      }
      return map; // success
    } catch (e) {
      console.warn(`[heatmap] LeetCode fetch attempt ${i + 1} failed:`, e.message);
    }
  }
  return map; // both attempts failed — heatmap still renders other platforms
}

/**
 * AtCoder: uses the unofficial kenkoooo contest results API.
 * Returns one entry per accepted submission.
 */
export async function fetchAtCoder(username) {
  if (!username) return {};
  const map = {};
  try {
    const url = `https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user=${username}&from_second=0`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(r.status);
    const json = await r.json();
    for (const sub of json) {
      if (sub.result !== 'AC') continue;
      const date = toISO(new Date(sub.epoch_second * 1000));
      map[date] = (map[date] || 0) + 1;
    }
  } catch (e) {
    console.warn('[heatmap] AtCoder fetch failed:', e.message);
  }
  return map;
}
