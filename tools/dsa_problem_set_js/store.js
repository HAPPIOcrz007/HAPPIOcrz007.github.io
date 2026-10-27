/* Progress lives in this browser only (localStorage). Problems are keyed by normalized URL so a problem
   listed in several places is one problem. */
(function () {
  const K = 'dps_state_v1';
  const s = { solved: {}, star: {} };
  try { const o = JSON.parse(localStorage.getItem(K) || '{}'); s.solved = o.solved || {}; s.star = o.star || {}; } catch (e) { }
  const save = () => { try { localStorage.setItem(K, JSON.stringify(s)); } catch (e) { } };
  const NAMES = { 'codeforces.com': 'Codeforces', 'leetcode.com': 'LeetCode', 'atcoder.jp': 'AtCoder', 'cses.fi': 'CSES', 'spoj.com': 'SPOJ', 'codechef.com': 'CodeChef', 'hackerearth.com': 'HackerEarth', 'hackerrank.com': 'HackerRank', 'onlinejudge.org': 'UVa' };
  function key(u) {
    let m = u.match(/codeforces\.com\/(?:problemset\/problem|contest)\/(\d+)\/(?:problem\/)?([A-Za-z0-9]+)/i);
    if (m) return 'cf:' + m[1] + '/' + m[2].toUpperCase();
    m = u.match(/leetcode\.com\/problems\/([^/?#]+)/i);
    if (m) return 'lc:' + m[1];
    return u.replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  }
  function platform(u) {
    try { const h = new URL(u).hostname.replace(/^www\./, ''); return NAMES[h] || h; } catch (e) { return 'Other'; }
  }
  window.Store = {
    key, platform, flush: save,
    has: k => !!s.solved[k], starred: k => !!s.star[k],
    toggle(k) { if (s.solved[k]) delete s.solved[k]; else s.solved[k] = 1; save(); },
    toggleStar(k) { if (s.star[k]) delete s.star[k]; else s.star[k] = 1; save(); },
    mark(k) { if (s.solved[k]) return false; s.solved[k] = 1; return true; },
    starCount: () => Object.keys(s.star).length,
    user(n, v) {
      try { if (v === undefined) return localStorage.getItem('dps_user_' + n) || ''; localStorage.setItem('dps_user_' + n, v); } catch (e) { return ''; }
    },
    exportJSON: () => JSON.stringify({ app: 'dsa-problem-set', v: 1, solved: s.solved, star: s.star }),
    importJSON(t) {
      const o = JSON.parse(t);
      if (!o || (!o.solved && !o.star)) throw new Error('Not a progress file');
      Object.assign(s.solved, o.solved || {}); Object.assign(s.star, o.star || {}); save();
    }
  };
})();
