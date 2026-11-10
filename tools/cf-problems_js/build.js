/* build.js — loads a handle from the Codeforces API and builds `rows`. LOADS LAST. */
$("f").addEventListener("submit", async e => {
  e.preventDefault();
  const h = $("h").value.trim(); if (!h) return;
  const msg = $("msg"); msg.className = ""; msg.textContent = "Loading submissions and contest lists…";
  $("go").disabled = true; $("app").style.display = "none";
  try {
    const [subs, cs, gs] = await Promise.all([
      call("user.status", { handle: h }),
      call("contest.list", { gym: "false" }),
      call("contest.list", { gym: "true" }).catch(() => [])
    ]);
    curHandle = h; build(subs, cs, gs);
    msg.textContent = "";
    $("app").style.display = "block";
  } catch (err) {
    msg.className = "err";
    msg.textContent = "Could not load: " + err.message + ". Check the handle, or wait a moment if you're rate limited.";
  } finally { $("go").disabled = false }
});

function build(subs, cs, gs) {
  const cmap = new Map();
  cs.forEach(c => cmap.set(c.id, { ...c, gym: false }));
  gs.forEach(c => cmap.set(c.id, { ...c, gym: true }));
  const m = new Map();
  subDay = new Map(); solvedDay = new Map();
  for (const s of subs) {
    const p = s.problem, key = p.contestId + "-" + p.index;
    let r = m.get(key);
    if (!r) {
      const c = cmap.get(p.contestId);
      const isGym = c ? c.gym : p.contestId >= 100000;
      r = {
        key, id: p.contestId, index: p.index, name: p.name, rating: p.rating ?? null, tags: p.tags || [],
        contestName: c ? c.name : "(contest " + p.contestId + ")",
        type: isGym ? "Gym" : "Contest",
        div: isGym ? (c && c.difficulty ? "★".repeat(c.difficulty) + " (" + c.difficulty + ")" : "Stars unknown") : division(c && c.name, c && c.type),
        stars: isGym && c && c.difficulty ? c.difficulty : 0,
        solved: false, solvedAt: 0, tries: 0, time: 0
      };
      m.set(key, r);
    }
    r.tries++;
    if (s.verdict === "OK") { r.solved = true; r.solvedAt = r.solvedAt ? Math.min(r.solvedAt, s.creationTimeSeconds) : s.creationTimeSeconds }
    r.time = Math.max(r.time, s.creationTimeSeconds);
    const k = dayOf(s.creationTimeSeconds); subDay.set(k, (subDay.get(k) || 0) + 1);
  }
  rows = [...m.values()].map(r => ({ ...r, status: r.solved ? "Solved" : "Attempted" }));
  rows.forEach(r => { if (r.solved) { const k = dayOf(r.solvedAt); solvedDay.set(k, (solvedDay.get(k) || 0) + 1) } });
  const divs = [...new Set(rows.map(r => r.div))].sort();
  $("fd").innerHTML = '<option value="">Any division / stars</option>' + divs.map(d => `<option>${esc(d)}</option>`).join("");
  const tags = [...new Set(rows.flatMap(r => r.tags))].sort();
  $("fg").innerHTML = '<option value="">Any tag</option>' + tags.map(t => `<option>${esc(t)}</option>`).join("");
  const yrs = [...new Set(subs.map(s => new Date(s.creationTimeSeconds * 1000).getFullYear()))].sort((a, b) => b - a);
  $("ay").innerHTML = '<option value="last">Last 12 months</option>' + yrs.map(y => `<option>${y}</option>`).join("");
  ratingSel = null;
  ["q", "fs", "ft", "fd", "fg", "rmin", "rmax", "dmin", "dmax"].forEach(i => $(i).value = "");
  renderStats(); renderAct(); renderRH(); renderPie(); render();
}
