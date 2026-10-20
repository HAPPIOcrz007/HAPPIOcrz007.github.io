/* Small inline logos (simplified marks) */
CP.LOGO = {
  cf: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="9" width="6" height="13" rx="1" fill="#f5c000"/><rect x="9" y="2" width="6" height="20" rx="1" fill="#1f8acb"/><rect x="17" y="6" width="6" height="16" rx="1" fill="#d9302c"/></svg>',
  lc: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 4.5 6 14a3 3 0 0 0 0 4.2l1.3 1.3a3 3 0 0 0 4.2 0l2-2" stroke="#ffa116" stroke-width="2.4"/><path d="M9.5 9.5 12.8 6.2" stroke="#ffa116" stroke-width="2.4"/><path d="M13.5 14.5H21" stroke="#b3b3b3" stroke-width="2.4"/></svg>'
};
/* Summary stats, print header (with profile links), print button */
CP.report = {
  update() {
    const s = CP.state, e = s.entries, total = e.reduce((a, x) => a + x.dur, 0);
    const span = e.length ? Math.max(...e.map(x => x.end)) - Math.min(...e.map(x => x.start)) : 0;
    const n = d => e.filter(x => x.diff === d).length, col = d => `<span style="color:var(--${d})">${n(d)}</span>`;
    document.getElementById("stats").innerHTML = [
      [e.length, "Problems solved"], [CP.hms(total), "Time on problems"], [CP.hms(span), "Day span (first start → last finish)"],
      [e.length ? CP.hms(total / e.length) : "00:00:00", "Average per problem"],
      [`${col("easy")} · ${col("medium")} · ${col("hard")}`, "Easy · Medium · Hard"],
      [new Set(e.flatMap(x => x.tags)).size, "Distinct topics"]
    ].map(([v, k]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join("");
    const p = s.profile, link = (u, t) => `<a href="${u}">${t}</a>`;
    document.getElementById("rName").textContent = p.name || "Competitive Programmer";
    document.getElementById("rDate").textContent = new Date().toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const chip = (k, name) => p[k] ? `<span class="pl">${CP.LOGO[k]}<b>${name} :</b>${link(CP.platforms.url(k, p[k]), CP.esc(p[k]))}</span>` : "";
    document.getElementById("rLinks").innerHTML = chip("cf", "Codeforces") + chip("lc", "LeetCode");
  },
  init() { document.getElementById("printBtn").onclick = () => window.print() }
};