/* pie.js — 3. solved-problems-by-tag pie chart. Slice colors: --chart-* tokens via chartColors() in state.js. */
function renderPie() {
  const PIE = chartColors();
  const cnt = {};
  rows.filter(r => r.solved).forEach(r => r.tags.forEach(t => cnt[t] = (cnt[t] || 0) + 1));
  const all = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
  const box = $("pie");
  if (!all.length) { box.innerHTML = '<p class="cn">No solved problems with tags yet.</p>'; return }
  const top = all.slice(0, 8), rest = all.slice(8).reduce((s, x) => s + x[1], 0);
  const parts = top.map((x, i) => ({ tag: x[0], n: x[1], col: PIE[i] }));
  if (rest) parts.push({ tag: "other (" + (all.length - 8) + " tags)", n: rest, col: PIE[8], other: true });
  const tot = parts.reduce((s, p) => s + p.n, 0), R = 100, C = 110;
  let a = -Math.PI / 2, shapes = "";
  parts.forEach(p => {
    const f = p.n / tot, b = a + f * 2 * Math.PI;
    const tip = `<title>${esc(p.tag)}: ${p.n} (${(f * 100).toFixed(1)}%)</title>`, at = p.other ? "" : ` data-t="${esc(p.tag)}"`;
    if (f > .9999) shapes += `<circle cx="${C}" cy="${C}" r="${R}" fill="${p.col}"${at}>${tip}</circle>`;
    else {
      const x1 = C + R * Math.cos(a), y1 = C + R * Math.sin(a), x2 = C + R * Math.cos(b), y2 = C + R * Math.sin(b);
      shapes += `<path d="M${C} ${C}L${x1.toFixed(2)} ${y1.toFixed(2)}A${R} ${R} 0 ${f > .5 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}Z" fill="${p.col}"${at}>${tip}</path>`
    }
    a = b;
  });
  box.innerHTML = `<svg viewBox="0 0 220 220" role="img" aria-label="Solved problems by tag">${shapes}</svg>
  <div class="pl">${parts.map(p => `<button type="button" ${p.other ? "disabled" : `data-t="${esc(p.tag)}"`}><i style="background:${p.col}"></i>${esc(p.tag)}<em>${p.n} · ${(p.n / tot * 100).toFixed(1)}%</em></button>`).join("")}</div>`;
}
$("pie").addEventListener("click", e => {
  const el = e.target.closest("[data-t]"); if (!el) return;
  $("fg").value = el.dataset.t; $("fs").value = "Solved";
  render(); $("tbl").scrollIntoView({ behavior: "smooth" });
});
