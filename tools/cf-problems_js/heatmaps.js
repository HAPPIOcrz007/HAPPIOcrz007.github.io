/* heatmaps.js — 1. activity heatmap, 2. rating x month heatmap. */

/* ---------- 1. activity heatmap ---------- */
function renderAct() {
  const yv = $("ay").value, unit = $("am").value === "solved" ? "solved" : "submissions";
  const map = unit === "solved" ? solvedDay : subDay;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let s, e;
  if (yv === "last") { e = new Date(today); s = new Date(today); s.setDate(s.getDate() - 364) }
  else { s = new Date(+yv, 0, 1); e = new Date(+yv, 11, 31); if (e > today) e = new Date(today) }
  const st = new Date(s); st.setDate(st.getDate() - st.getDay());
  const days = []; for (let d = new Date(st); d <= e; d.setDate(d.getDate() + 1))days.push(new Date(d));
  let max = 1, total = 0, active = 0;
  for (const d of days) { if (d < s) continue; const v = map.get(dkey(d)) || 0; max = Math.max(max, v); total += v; if (v) active++ }
  const bs = streaks(map, s, e), sk = new Set();
  if (bs.n) for (const d = new Date(bs.s); d <= bs.e; d.setDate(d.getDate() + 1))sk.add(dkey(d));
  const ks = [...map.keys()].sort(), at = ks.length ? streaks(map, new Date(ks[0] + "T00:00:00"), today) : { n: 0 };
  $("sk").innerHTML = `<span class="sec-label">Longest streak</span><b>${at.n} day${at.n === 1 ? "" : "s"}</b>${at.n ? `<span>${rng(at)}</span>` : ""}<span class="cn">all time · days with ${unit === "solved" ? "a solved problem" : "a submission"}</span>`;
  const P = 15, L = 30, T = 18, weeks = Math.ceil(days.length / 7);
  let cells = "", labels = "", lastX = -99;
  days.forEach((d, i) => {
    if (d < s) return;
    const w = Math.floor(i / 7), x = L + w * P, y = T + d.getDay() * P, v = map.get(dkey(d)) || 0;
    const lv = v ? Math.max(1, Math.ceil(v / max * 4)) : 0;
    cells += `<rect class="c l${lv}${sk.has(dkey(d)) ? " st" : ""}" x="${x}" y="${y}" width="12" height="12" rx="2"><title>${v} ${unit} · ${d.toDateString()}${sk.has(dkey(d)) ? " · longest streak" : ""}</title></rect>`;
    if ((d.getDate() === 1 || d.getTime() === s.getTime()) && x - lastX >= 32) { labels += `<text x="${x}" y="10">${MON[d.getMonth()]}</text>`; lastX = x }
  });
  const wd = ["", "Mon", "", "Wed", "", "Fri", ""].map((n, i) => n ? `<text x="0" y="${T + i * P + 10}">${n}</text>` : "").join("");
  $("ah").innerHTML = `<svg width="${L + weeks * P}" height="${T + 7 * P}" viewBox="0 0 ${L + weeks * P} ${T + 7 * P}" role="img" aria-label="Activity heatmap">${labels}${wd}${cells}</svg>`;
  $("as").innerHTML = `<span><b>${total}</b> ${unit}</span><span><b>${active}</b> active days</span><span>${yv === "last" ? "last 12 months" : yv}</span><span class="stkl"><i></i>longest streak <b>${bs.n}</b> days${bs.n ? " (" + rng(bs) + ")" : ""}</span><span class="legend" style="margin-left:auto">Less <i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i> More</span>`;
}
["am", "ay"].forEach(i => $(i).addEventListener("change", renderAct));

/* ---------- 2. rating x month heatmap ---------- */
function renderRH() {
  const sv = rows.filter(r => r.solved && r.rating && r.solvedAt);
  const box = $("rh");
  if (!sv.length) { box.innerHTML = '<p class="cn">No rated solves yet.</p>'; return }
  const mk = t => { const d = new Date(t * 1000); return d.getFullYear() * 12 + d.getMonth() };
  let lo = 1e9, hi = -1, rmin = 1e9, rmax = 0; const g = new Map();
  sv.forEach(r => {
    const k = mk(r.solvedAt); lo = Math.min(lo, k); hi = Math.max(hi, k); rmin = Math.min(rmin, r.rating); rmax = Math.max(rmax, r.rating);
    const key = r.rating + "|" + k; g.set(key, (g.get(key) || 0) + 1)
  });
  const max = Math.max(...g.values());
  const W = 42, H = 24, L = 44, T = 20, n = hi - lo + 1, rr = [];
  for (let r = rmax; r >= rmin; r -= 100)rr.push(r);
  let out = "";
  for (let c = 0; c < n; c++) {
    const k = lo + c, y = Math.floor(k / 12);
    out += `<text x="${L + c * (W + 3) + W / 2}" y="12" text-anchor="middle">${MON[k % 12]}${k % 12 === 0 || c === 0 ? " ’" + String(y).slice(2) : ""}</text>`
  }
  rr.forEach((r, i) => {
    const y = T + i * (H + 3);
    out += `<text x="${L - 8}" y="${y + H / 2 + 3}" text-anchor="end">${r}</text>`;
    for (let c = 0; c < n; c++) {
      const v = g.get(r + "|" + (lo + c)) || 0, lv = v ? Math.max(1, Math.ceil(v / max * 4)) : 0, x = L + c * (W + 3);
      const mo = MON[(lo + c) % 12] + " " + Math.floor((lo + c) / 12);
      out += `<rect class="c l${lv}" x="${x}" y="${y}" width="${W}" height="${H}" rx="3" ${v ? `data-r="${r}"` : ""}><title>${v} solved · rating ${r} · ${mo}</title></rect>`;
      if (v) out += `<text class="v${lv >= 3 ? " hi" : ""}" x="${x + W / 2}" y="${y + H / 2 + 3}" text-anchor="middle">${v}</text>`;
    }
  });
  box.innerHTML = `<svg width="${L + n * (W + 3)}" height="${T + rr.length * (H + 3)}" viewBox="0 0 ${L + n * (W + 3)} ${T + rr.length * (H + 3)}" role="img" aria-label="Rating heatmap">${out}</svg>`;
  box.scrollLeft = box.scrollWidth;
}
$("rh").addEventListener("click", e => {
  const c = e.target.closest("rect[data-r]"); if (!c) return;
  ratingSel = null; $("fs").value = "Solved"; $("rmin").value = $("rmax").value = c.dataset.r;
  renderStats(); render(); $("tbl").scrollIntoView({ behavior: "smooth" });
});
