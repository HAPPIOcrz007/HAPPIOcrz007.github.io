(function () {
  if (!DSA.companies().length) {
    document.getElementById('cards').innerHTML =
      '<p class="muted">No company index found. Add the source remote and run scripts/build_company_index.py.</p>';
    return;
  }
  if (DSA.generated) document.getElementById('gen').textContent = 'Index built ' + DSA.generated + '.';
  UI.init();
  const user = document.getElementById('lcUser'), st = document.getElementById('lcStatus');
  user.value = Solved.user();
  document.getElementById('profile').addEventListener('submit', async e => {
    e.preventDefault();
    const u = user.value.trim(); if (!u) return;
    st.textContent = 'Fetching...';
    try { const n = await Solved.fetchUser(u); st.textContent = n + ' accepted submissions found. Open a company to see them.'; UI.table(); UI.cards(); }
    catch (err) { st.textContent = 'Could not fetch (' + err.message + '). You can still tick problems manually.'; }
  });
})();