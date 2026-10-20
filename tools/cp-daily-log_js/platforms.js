/* Codeforces + LeetCode stat cards (fetched in the browser, cached so printing works offline) */
CP.platforms = {
  T: {},
  RK: { newbie: "#808080", pupil: "#008000", specialist: "#03a89e", expert: "#0000ff", "candidate master": "#aa00aa", master: "#ff8c00", "international master": "#ff8c00", grandmaster: "#ff0000", "international grandmaster": "#ff0000", "legendary grandmaster": "#cc0000" },
  NAME: { cf: "Codeforces", lc: "LeetCode" },
  url(k, id) { return k === "cf" ? "https://codeforces.com/profile/" + encodeURIComponent(id) : "https://leetcode.com/u/" + encodeURIComponent(id) + "/" },
  init() { ["cf", "lc"].forEach(k => this.load(k)) },
  onProfile(k) { clearTimeout(this.T[k]); this.T[k] = setTimeout(() => this.load(k, true), 900) },
  async load(k, force) {
    const id = CP.state.profile[k], c = CP.state.stats[k];
    if (!id) return this.draw(k);
    if (c && c.id === id && !force) { this.draw(k); if (Date.now() - c.ts < 216e5) return }
    this.draw(k, "loading");
    try { CP.state.stats[k] = { id, ts: Date.now(), data: await this[k + "Fetch"](id) }; CP.save(); this.draw(k) }
    catch (e) { CP.state.stats[k] = c; this.draw(k, "error", e.message || "Request failed") }
  },
  async cfFetch(id) {
    const b = "https://codeforces.com/api/", h = encodeURIComponent(id);
    const [i, s] = await Promise.all([fetch(b + "user.info?handles=" + h).then(r => r.json()), fetch(b + "user.status?handle=" + h).then(r => r.json())]);
    if (i.status !== "OK") throw new Error(i.comment || "Codeforces user not found");
    const u = i.result[0], all = new Set(), today = new Set(), t0 = new Date().setHours(0, 0, 0, 0) / 1000;
    if (s.status === "OK") s.result.forEach(x => {
      if (x.verdict !== "OK") return;
      const key = (x.problem.contestId || "g") + x.problem.index + x.problem.name; all.add(key); if (x.creationTimeSeconds >= t0) today.add(key)
    });
    return { handle: u.handle, rating: u.rating, max: u.maxRating, rank: u.rank, maxRank: u.maxRank, solved: s.status === "OK" ? all.size : null, today: today.size };
  },
  async lcFetch(id) {
    const e = encodeURIComponent(id), j = u => fetch(u).then(r => { if (!r.ok) throw 0; return r.json() }); let o;
    try {
      const d = await j("https://leetcode-stats-api.herokuapp.com/" + e); if (d.status !== "success") throw 0;
      o = { total: d.totalSolved, easy: d.easySolved, medium: d.mediumSolved, hard: d.hardSolved, te: d.totalEasy, tm: d.totalMedium, th: d.totalHard, rank: d.ranking }
    }
    catch (_) {
      const d = await j("https://alfa-leetcode-api.onrender.com/" + e + "/solved");
      o = { total: d.solvedProblem, easy: d.easySolved, medium: d.mediumSolved, hard: d.hardSolved }
    }
    try { const c = await j("https://alfa-leetcode-api.onrender.com/" + e + "/contest"); if (c.contestRating) o.rating = Math.round(c.contestRating) } catch (_) { }
    return o;
  },
  cfBody(d) {
    return `<div class="big">${d.rating ?? "—"}<small>${CP.esc(d.rank || "unrated")}</small></div>
    <div class="mini"><div><b>${d.max ?? "—"}</b><span>Max rating${d.maxRank ? " · " + CP.esc(d.maxRank) : ""}</span></div>
    <div><b>${d.solved ?? "—"}</b><span>Problems solved</span></div><div><b>${d.today}</b><span>Solved today</span></div></div>`
  },
  lcBody(d) {
    const bar = (n, v, t, c) => `<div class="bar"><span>${n}</span><i><u style="width:${t ? Math.min(100, v / t * 100) : Math.min(100, v / 5)}%;background:var(--${c})"></u></i><em>${v}${t ? " / " + t : ""}</em></div>`;
    return `<div class="big">${d.total}<small>solved</small></div>${bar("Easy", d.easy, d.te, "easy")}${bar("Medium", d.medium, d.tm, "medium")}${bar("Hard", d.hard, d.th, "hard")}
    <div class="mini two"><div><b>${d.rating ?? "—"}</b><span>Contest rating</span></div><div><b>${d.rank ? "#" + Number(d.rank).toLocaleString() : "—"}</b><span>Global ranking</span></div></div>`
  },
  draw(k, st, msg) {
    const el = document.getElementById("plat-" + k), id = CP.state.profile[k], c = CP.state.stats[k], ok = c && c.id === id, n = this.NAME[k];
    if (!id) { el.className = "card plat empty"; el.innerHTML = `<span class="label">${n}</span><p class="foot">Add your ${n} ID above to show your stats here.</p>`; return }
    const d = ok ? c.data : null;
    el.className = "card plat";
    el.style.setProperty("--rk", k === "cf" ? (this.RK[(d && d.rank) || ""] || "#6e7781") : "#ffa116");
    let body = d ? this[k + "Body"](d) : st === "loading" ? `<p class="foot">Loading…</p>` : `<p class="err">${CP.esc(msg || "Could not load stats.")}</p>`;
    let foot = ok ? `Updated ${new Date(c.ts).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}${d.manual ? " (manual)" : ""}${st === "error" ? " · refresh failed, showing saved data" : ""}` : "";
    el.innerHTML = `<header><span class="label">${n}</span><span class="who"><a href="${this.url(k, id)}" target="_blank" rel="noopener">${CP.esc(id)}</a></span></header>${body}
      <div class="foot"><span>${foot}</span><span class="noprint"><button class="btn mini-btn" data-r="${k}">Refresh</button>${k === "lc" ? ' <button class="btn mini-btn" data-m="lc">Enter manually</button>' : ""}</span></div>`;
    el.querySelector("[data-r]").onclick = () => this.load(k, true);
    const m = el.querySelector("[data-m]");
    if (m) m.onclick = () => {
      const v = prompt("Enter: easy, medium, hard, contest rating (rating optional)", "0,0,0"); if (!v) return;
      const [e, md, h, r] = v.split(",").map(x => parseInt(x, 10)); if ([e, md, h].some(isNaN)) return;
      CP.state.stats.lc = { id, ts: Date.now(), data: { easy: e, medium: md, hard: h, total: e + md + h, rating: isNaN(r) ? undefined : r, manual: true } }; CP.save(); this.draw("lc")
    };
  }
};
