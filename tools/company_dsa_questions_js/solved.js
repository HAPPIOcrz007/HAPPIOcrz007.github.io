/* Solved state: fetched from a public LeetCode proxy API (recent accepted submissions only) + manual toggles, kept in localStorage. */
(function () {
  const K = 'cdq_solved', U = 'cdq_user';
  const API = 'https://alfa-leetcode-api.onrender.com/'; // third-party proxy; swap here if it changes
  const set = new Set(JSON.parse(localStorage.getItem(K) || '[]'));
  const save = () => localStorage.setItem(K, JSON.stringify([...set]));
  async function fetchUser(u) {
    const r = await fetch(API + encodeURIComponent(u) + '/acSubmission?limit=500');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const list = (await r.json()).submission || [];
    list.forEach(s => s.titleSlug && set.add(s.titleSlug));
    localStorage.setItem(U, u); save();
    return list.length;
  }
  window.Solved = {
    has: s => set.has(s),
    toggle: s => { set.has(s) ? set.delete(s) : set.add(s); save(); },
    fetchUser, user: () => localStorage.getItem(U) || ''
  };
})();
