(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const groups = window.DSA_SET.groups, pages = [], uniq = new Map();
  groups.forEach(g => g.pages.forEach(p => {
    pages.push(p);
    p.sections.forEach(sc => {
      sc.i = sc.i.map(([t, d, u]) => ({ t, d, u, k: Store.key(u), p: Store.platform(u) }));
      sc.i.forEach(x => uniq.set(x.k, x));
    });
  }));

  function stat(p) {
    let t = 0, s = 0;
    p.sections.forEach(sc => sc.i.forEach(x => { t++; if (Store.has(x.k)) s++; }));
    return { t, s, pct: !s ? 0 : s === t ? 100 : Math.min(99, Math.max(1, Math.round(s / t * 100))) };
  }
  const F = () => ({ q: $('#q').value.trim().toLowerCase(), plat: $('#plat').value, diff: $('#diff').value, stat: $('#stat').value });
  const active = f => f.q || f.plat || f.diff || f.stat;
  const ok = (x, f) => (!f.q || x.t.toLowerCase().includes(f.q)) && (!f.plat || x.p === f.plat) && (!f.diff || x.d === f.diff) &&
    (!f.stat || (f.stat === 'solved' ? Store.has(x.k) : f.stat === 'unsolved' ? !Store.has(x.k) : Store.starred(x.k)));

  function row(x, first) {
    const on = Store.has(x.k), st = Store.starred(x.k);
    return `<tr><td>${esc(first)}</td><td><span class="pill ${x.d.toLowerCase()}">${x.d}</span></td>
      <td><a href="${esc(x.u)}" target="_blank" rel="noopener">${esc(x.t)}</a></td><td>${esc(x.p)}</td>
      <td><button class="chk${on ? ' on' : ''}" data-k="${esc(x.k)}" aria-pressed="${on}" aria-label="Mark solved">${on ? '✓' : '○'}</button></td>
      <td><button class="chk star${st ? ' on' : ''}" data-s="${esc(x.k)}" aria-pressed="${st}" aria-label="Revise later">${st ? '★' : '☆'}</button></td></tr>`;
  }
  const head = f => `<div class="wrap"><table><thead><tr><th>${f}</th><th>Difficulty</th><th>Problem</th><th>Platform</th><th>Solved</th><th>Revise</th></tr></thead><tbody>`;

  function home() {
    return groups.map(g => `<h2 class="gh">${esc(g.name)}</h2><div class="cards">` + g.pages.map(p => {
      const s = stat(p);
      return `<a class="card${s.pct === 100 ? ' done' : ''}" href="#/${p.id}"><div class="ch"><h3>${esc(p.name)}</h3>
        <div class="ring" style="--p:${s.pct}" role="img" aria-label="${s.s} of ${s.t} solved" title="${s.s} of ${s.t} solved"><span>${s.pct}%</span></div></div>
        <span class="muted">${s.t} problems</span></a>`;
    }).join('') + '</div>').join('');
  }

  function found(f) {
    const seen = new Set(), out = [];
    pages.forEach(p => p.sections.forEach(sc => sc.i.forEach(x => { if (ok(x, f) && !seen.has(x.k)) { seen.add(x.k); out.push([x, p.name]); } })));
    if (!out.length) return '<p class="muted">No problems match these filters.</p>';
    return `<p class="muted">${out.length} problems${out.length > 300 ? ', showing the first 300' : ''}</p>` + head('Track') +
      out.slice(0, 300).map(([x, n]) => row(x, n)).join('') + '</tbody></table></div>';
  }

  function topic(p, f) {
    const s = stat(p);
    let h = `<div class="head"><a class="back" href="#/">All tracks</a><h2>${esc(p.name)}</h2><span class="muted">${s.s} / ${s.t} solved</span></div>`, any = false;
    p.sections.forEach(sc => {
      const rows = sc.i.map((x, n) => [x, n + 1]).filter(([x]) => ok(x, f));
      if (!rows.length) return;
      any = true;
      const sd = sc.i.filter(x => Store.has(x.k)).length;
      h += (p.sections.length > 1 ? `<h3 class="sh">${esc(sc.n)} <span class="muted">${sd}/${sc.i.length}</span></h3>` : '') +
        head('#') + rows.map(([x, n]) => row(x, n)).join('') + '</tbody></table></div>';
    });
    return h + (any ? '' : '<p class="muted">No problems match these filters.</p>');
  }

  function render() {
    const f = F(), id = location.hash.replace(/^#\/?/, ''), p = pages.find(x => x.id === id);
    let solved = 0;
    uniq.forEach((x, k) => { if (Store.has(k)) solved++; });
    $('#stats').innerHTML = `<div class="mc">Solved<b>${solved} / ${uniq.size}</b></div><div class="mc">To revise<b>${Store.starCount()}</b></div>`;
    $('#view').innerHTML = p ? topic(p, f) : active(f) ? found(f) : home();
  }

  function init() {
    const pl = [...new Set([...uniq.values()].map(x => x.p))].sort();
    $('#plat').innerHTML = '<option value="">All platforms</option>' + pl.map(x => `<option>${esc(x)}</option>`).join('');
    ['#q', '#plat', '#diff', '#stat'].forEach(s => $(s).addEventListener('input', render));
    addEventListener('hashchange', () => { scrollTo(0, 0); render(); });
    $('#view').addEventListener('click', e => {
      const a = e.target.closest('[data-k]'), b = e.target.closest('[data-s]');
      if (a) { Store.toggle(a.dataset.k); render(); } else if (b) { Store.toggleStar(b.dataset.s); render(); }
    });
    render();
  }
  window.UI = { init, render };
})();
