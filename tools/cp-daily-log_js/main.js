CP.render = function () {
  const e = CP.state.entries;
  document.getElementById("entries").innerHTML = (e.length ? '<h3 class="sec-title">Problems solved</h3>' : "") + e.map((x, i) => CP.entries.html(x, i)).join("");
  document.getElementById("chart").innerHTML = CP.chart(e);
  CP.report.update();
};
(function () {
  CP.theme.init(); CP.report.init();
  [["pName", "name"], ["pCf", "cf"], ["pLc", "lc"]].forEach(([id, k]) => {
    const el = document.getElementById(id); el.value = CP.state.profile[k] || "";
    el.oninput = () => { CP.state.profile[k] = el.value.trim(); CP.save(); CP.report.update(); CP.platforms.onProfile(k) };
  });
  document.getElementById("clearBtn").onclick = () => {
    if (confirm("Clear all entries and start a new day? Print your report first.")) { CP.state.entries = []; CP.state.active = null; CP.save(); CP.timer.render(); CP.render() }
  };
  CP.render(); CP.timer.render(); CP.platforms.init();
  if (CP.state.active && CP.state.active.stop) CP.entries.openModal();
})();