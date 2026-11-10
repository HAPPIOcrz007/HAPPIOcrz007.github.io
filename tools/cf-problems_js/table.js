/* table.js — stat tiles, rating histogram, filters and the problem table. */
function renderStats() {
  const sv = rows.filter(r => r.solved);
  const cnt = k => sv.filter(k).length;
  $("stats").innerHTML = [
    [sv.length, "solved"], [rows.length - sv.length, "attempted only"],
    [cnt(r => r.type === "Contest"), "solved in contests"], [cnt(r => r.type === "Gym"), "solved in gyms"]
  ].map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join("");
  const by = {};
  sv.forEach(r => { const k = r.rating ?? "?"; by[k] = (by[k] || 0) + 1 });
  const keys = Object.keys(by).sort((a, b) => (a === "?") - (b === "?") || a - b);
  const max = Math.max(...Object.values(by), 1);
  $("hist").innerHTML = keys.map(k => `<button class="col${ratingSel === k ? " on" : ""}" data-r="${k}" title="${by[k]} solved at ${k === "?" ? "no rating" : k}"><em>${by[k]}</em><i style="height:${by[k] / max * 70}px"></i>${k === "?" ? "n/a" : k}</button>`).join("");
  $("hist").querySelectorAll(".col").forEach(b => b.onclick = () => {
    ratingSel = ratingSel === b.dataset.r ? null : b.dataset.r;
    $("fs").value = ratingSel ? "Solved" : $("fs").value;
    renderStats(); render();
  });
}

function render() {
  const q = $("q").value.toLowerCase(), fs = $("fs").value, ft = $("ft").value, fd = $("fd").value, fg = $("fg").value;
  const mn = $("rmin").value === "" ? null : +$("rmin").value, mx = $("rmax").value === "" ? null : +$("rmax").value;
  let dn = $("dmin").value, dx = $("dmax").value; if (dn && dx && dn > dx) [dn, dx] = [dx, dn];
  let out = rows.filter(r => {
    if (fs && r.status !== fs) return false;
    if (ft && r.type !== ft) return false;
    if (fd && r.div !== fd) return false;
    if (fg && !r.tags.includes(fg)) return false;
    if (mn !== null && (r.rating === null || r.rating < mn)) return false;
    if (mx !== null && (r.rating === null || r.rating > mx)) return false;
    if (dn || dx) { const k = dayOf(r.solved ? r.solvedAt : r.time); if (dn && k < dn) return false; if (dx && k > dx) return false }
    if (ratingSel && String(r.rating ?? "?") !== ratingSel) return false;
    if (q && !(r.name + " " + r.contestName + " " + r.tags.join(" ") + " " + r.id + r.index).toLowerCase().includes(q)) return false;
    return true;
  });
  const val = r => sortKey === "tags" ? r.tags.join(",") : sortKey === "div" && r.type === "Gym" ? "~" + r.stars : r[sortKey];
  out.sort((a, b) => {
    let x = val(a), y = val(b);
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    return (x > y ? 1 : x < y ? -1 : 0) * sortDir;
  });
  const ds = $("ds"), D = v => fmt(new Date(v + "T00:00:00"));
  if (dn || dx) {
    ds.hidden = false;
    ds.innerHTML = `<span class="sec-label">Solved in range</span><b>${out.filter(r => r.solved).length}</b><span>${dn && dx ? "from " + D(dn) + " to " + D(dx) : dn ? "from " + D(dn) : "up to " + D(dx)}</span><span class="cn">both dates inclusive · respects the other filters</span>`;
  } else ds.hidden = true;
  $("count").textContent = `Showing ${out.length} of ${rows.length} problems`;
  $("th").innerHTML = cols.map(([k, l]) => `<th data-k="${k}" class="${k === sortKey ? "s" + (sortDir < 0 ? " d" : "") : ""}">${l}</th>`).join("");
  $("th").querySelectorAll("th").forEach(t => t.onclick = () => {
    const k = t.dataset.k;
    if (k === sortKey) sortDir *= -1; else { sortKey = k; sortDir = 1 }
    render();
  });
  $("tb").innerHTML = out.map(r => {
    const base = r.type === "Gym" ? "gym" : "contest";
    const link = `https://codeforces.com/${base}/${r.id}/problem/${r.index}`;
    return `<tr>
<td><span class="pill ${r.solved ? "ok" : "try"}">${r.status}</span></td>
<td><a href="${link}" target="_blank" rel="noopener">${r.id}${esc(r.index)} · ${esc(r.name)}</a></td>
<td>${r.rating ?? '<span class="cn">not given</span>'}</td>
<td>${r.tags.length ? r.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("") : '<span class="cn">none</span>'}</td>
<td><a href="https://codeforces.com/${base}/${r.id}" target="_blank" rel="noopener">${esc(r.contestName)}</a><div class="cn">ID ${r.id}</div></td>
<td><span class="pill ${r.type === "Gym" ? "gym" : "ct"}">${r.type}</span></td>
<td>${esc(r.div)}</td>
<td>${r.tries}</td>
<td>${r.solvedAt ? new Date(r.solvedAt * 1000).toLocaleDateString() : '<span class="cn">—</span>'}</td>
<td>${new Date(r.time * 1000).toLocaleDateString()}</td></tr>`;
  }).join("");
}
["q", "fs", "ft", "fd", "fg", "rmin", "rmax", "dmin", "dmax"].forEach(i => $(i).addEventListener("input", render));
