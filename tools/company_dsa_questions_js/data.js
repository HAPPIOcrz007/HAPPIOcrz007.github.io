/* Loads company CSVs from the local copy of the source repo (path comes from the generated index). */
(function () {
  const idx = window.COMPANY_DSA_INDEX || { companies: [] };
  const cache = {};
  async function load(co, win) {
    const file = co.f[win];
    if (!file) return [];
    const url = '../' + idx.base + '/' + encodeURIComponent(co.d) + '/' + encodeURIComponent(file);
    if (cache[url]) return cache[url];
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = CSV.parse(await res.text()).map(r => ({
      difficulty: (r.Difficulty || '').toUpperCase(),
      title: r.Title || '',
      freq: parseFloat(r.Frequency) || 0,
      acc: parseFloat(r['Acceptance Rate']) || 0,
      link: r.Link || '',
      topics: r.Topics || '',
      slug: ((r.Link || '').split('/problems/')[1] || '').split(/[/?#]/)[0]
    }));
    return (cache[url] = rows);
  }
  window.DSA = { load, companies: () => idx.companies, slugs: () => idx.slugs || [], generated: idx.generated };
})();