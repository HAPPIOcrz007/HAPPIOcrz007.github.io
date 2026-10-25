(function () {
  const $ = s => document.querySelector(s);
  const WIN = [['all', 'All'], ['d30', '30 Days'], ['m3', '3 Months'], ['m6', '6 Months'], ['m6p', '> 6 Months']];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let mode = 'solved', cur = null, win = 'all', rows = [], sort = { k: 'freq', dir: -1 };

  function solvedN(c) {
    const sl = DSA.slugs();
    return (c.s || []).reduce((n, i) => n + (Solved.has(sl[i]) ? 1 : 0), 0);
  }

  function cards() {
    const terms = $('#q').value.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
    const min = parseFloat($('#acc').value) || 0;
    const list = DSA.companies().filter(c =>
      (!terms.length || terms.some(t => c.n.toLowerCase().includes(t))) && c.a >= min)
      .map(c => ({ c, k: solvedN(c) }));
    list.sort((a, b) => (mode === 'solved' ? b.k - a.k : (b.c.t - b.k) - (a.c.t - a.k)) || a.c.n.localeCompare(b.c.n));
    $('#count').textContent = list.length + ' companies';
    $('#cards').innerHTML = list.map(({ c, k }) =>
      `<button class="card${k ? ' done' : ''}" data-d="${esc(c.d)}"><h3>${esc(c.n)}</h3>
       <span class="muted">${c.t} questions${k ? ', ' + k + ' solved' : ''}</span>
       <div class="split"><i class="e" style="flex:${c.e}"></i><i class="m" style="flex:${c.m}"></i><i class="h" style="flex:${c.h}"></i></div>
       <span class="muted">Easy ${c.e}, Medium ${c.m}, Hard ${c.h}</span></button>`).join('')
      || '<p class="muted">No companies match. Clear the search or lower the acceptance filter.</p>';
  }

  function tabs() {
    $('#tabs').innerHTML = WIN.map(([k, l]) => `<button data-w="${k}" class="${k === win ? 'on' : ''}">${l}</button>`).join('');
  }

  async function load() {
    $('#tbody').innerHTML = '<tr><td colspan="7">Loading...</td></tr>';
    try { rows = await DSA.load(cur, win); }
    catch (e) { $('#tbody').innerHTML = `<tr><td colspan="7">Could not load this list (${esc(e.message)}). Check the source copy under data/leetcode_source.</td></tr>`; return; }
    table();
  }

  function table() {
    const { k, dir } = sort, ord = { EASY: 1, MEDIUM: 2, HARD: 3 };
    const v = r => k === 'difficulty' ? ord[r.difficulty] || 0 : k === 'solved' ? +Solved.has(r.slug) : r[k];
    const s = [...rows].sort((a, b) => { const x = v(a), y = v(b); return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir; });
    document.querySelectorAll('th[data-k]').forEach(th => {
      th.classList.toggle('s', th.dataset.k === k);
      th.dataset.d = th.dataset.k === k ? (dir > 0 ? ' ▲' : ' ▼') : '';
    });
    $('#tbody').innerHTML = s.map(r => {
      const on = Solved.has(r.slug);
      return `<tr><td><span class="pill ${r.difficulty.toLowerCase()}">${esc(r.difficulty)}</span></td><td>${esc(r.title)}</td>
      <td>${r.freq}</td><td>${r.acc.toFixed(4)}</td><td><a href="${esc(r.link)}" target="_blank" rel="noopener">Open</a></td>
      <td>${esc(r.topics)}</td><td><button class="chk ${on ? 'on' : ''}" data-s="${esc(r.slug)}" aria-pressed="${on}">${on ? '✓' : '○'}</button></td></tr>`;
    }).join('') || '<tr><td colspan="7">No questions in this window.</td></tr>';
  }

  function init() {
    cards();
    $('#q').addEventListener('input', cards);
    $('#acc').addEventListener('input', cards);
    $('#sortBtn').addEventListener('click', () => {
      mode = mode === 'solved' ? 'unsolved' : 'solved';
      $('#sortBtn').textContent = mode === 'solved' ? 'Most solved first' : 'Most unsolved first';
      cards();
    });
    $('#cards').addEventListener('click', e => {
      const b = e.target.closest('.card'); if (!b) return;
      cur = DSA.companies().find(c => c.d === b.dataset.d); win = 'all';
      $('#coName').textContent = cur.n; $('#listView').hidden = true; $('#tableView').hidden = false;
      tabs(); load();
    });
    $('#backBtn').addEventListener('click', () => { cards(); $('#tableView').hidden = true; $('#listView').hidden = false; });
    $('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-w]'); if (b) { win = b.dataset.w; tabs(); load(); } });
    document.querySelector('thead').addEventListener('click', e => {
      const th = e.target.closest('th[data-k]'); if (!th) return;
      sort = { k: th.dataset.k, dir: sort.k === th.dataset.k ? -sort.dir : 1 }; table();
    });
    $('#tbody').addEventListener('click', e => { const b = e.target.closest('.chk'); if (b) { Solved.toggle(b.dataset.s); table(); } });
  }
  window.UI = { init, table, cards };
})();