(function () {
  const $ = s => document.querySelector(s);
  if (!window.DSA_SET) { $('#view').innerHTML = '<p class="muted">Data file missing. Run scripts/build_dsa_problem_set.py.</p>'; return; }
  UI.init();

  async function syncCF(h) {
    const r = await fetch('https://codeforces.com/api/user.status?handle=' + encodeURIComponent(h));
    const j = await r.json();
    if (j.status !== 'OK') throw new Error(j.comment || 'request failed');
    let n = 0;
    j.result.forEach(s => { if (s.verdict === 'OK' && s.problem.contestId && Store.mark('cf:' + s.problem.contestId + '/' + s.problem.index)) n++; });
    return n;
  }
  async function syncLC(h) {
    const r = await fetch('https://alfa-leetcode-api.onrender.com/' + encodeURIComponent(h) + '/acSubmission?limit=500');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    let n = 0;
    ((await r.json()).submission || []).forEach(s => { if (s.titleSlug && Store.mark('lc:' + s.titleSlug)) n++; });
    return n;
  }

  const cf = $('#cfUser'), lc = $('#lcUser'), st = $('#status');
  cf.value = Store.user('cf'); lc.value = Store.user('lc');
  $('#sync').addEventListener('submit', async e => {
    e.preventDefault();
    const out = [];
    st.textContent = 'Syncing...';
    for (const [name, v, fn] of [['Codeforces', cf.value.trim(), syncCF], ['LeetCode', lc.value.trim(), syncLC]]) {
      if (!v) continue;
      try { out.push(name + ': ' + await fn(v) + ' new'); Store.user(name === 'Codeforces' ? 'cf' : 'lc', v); }
      catch (err) { out.push(name + ' failed (' + err.message + ')'); }
    }
    Store.flush();
    st.textContent = out.join(' · ') || 'Enter a handle first';
    UI.render();
  });

  $('#exp').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([Store.exportJSON()], { type: 'application/json' }));
    a.download = 'dsa-problem-set-progress.json';
    a.click(); URL.revokeObjectURL(a.href);
  });
  $('#imp').addEventListener('click', () => $('#file').click());
  $('#file').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try { Store.importJSON(await f.text()); st.textContent = 'Progress imported'; UI.render(); }
    catch (err) { st.textContent = 'Import failed (' + err.message + ')'; }
    e.target.value = '';
  });
})();
