/* SVG chart: area = problems finished per hour (0-24h), line = difficulty over time */
CP.chart = function (entries) {
  const W = 760, H = 270, L = 40, R = 56, T = 14, B = 30, pw = W - L - R, ph = H - T - B;
  const x = h => L + h / 24 * pw;
  const hr = t => { const d = new Date(t); return d.getHours() + d.getMinutes() / 60 };
  const counts = Array(24).fill(0); entries.forEach(en => counts[Math.floor(hr(en.end))]++);
  const max = Math.max(2, ...counts), yc = c => T + ph - c / max * ph, yd = d => T + ph - (d - .5) / 3 * ph;
  let g = "";
  for (let h = 0; h <= 24; h += 3)g += `<line x1="${x(h)}" x2="${x(h)}" y1="${T}" y2="${T + ph}" stroke="var(--line)"/><text x="${x(h)}" y="${H - 10}" text-anchor="middle">${String(h).padStart(2, "0")}:00</text>`;
  for (let c = 0; c <= max; c++)g += `<text x="${L - 8}" y="${yc(c) + 4}" text-anchor="end">${c}</text>`;
  [["Easy", 1, "easy"], ["Med", 2, "medium"], ["Hard", 3, "hard"]].forEach(([n, d, k]) => g += `<text x="${W - R + 8}" y="${yd(d) + 4}" style="fill:var(--${k})">${n}</text>`);
  const pts = counts.map((c, h) => [x(h + .5), yc(c)]);
  const area = `M${x(0)},${yc(0)} L${pts.map(p => p.join(",")).join(" L")} L${x(24)},${yc(0)} Z`;
  const sorted = [...entries].sort((a, b) => a.end - b.end);
  const dl = sorted.map(en => `${x(hr(en.end))},${yd(CP.DIFF[en.diff])}`);
  const dots = sorted.map(en => `<circle cx="${x(hr(en.end))}" cy="${yd(CP.DIFF[en.diff])}" r="4.5" style="fill:var(--${en.diff})"/>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Day chart">${g}
  <path d="${area}" fill="var(--accent)" fill-opacity=".3" stroke="var(--accent)"/>
  ${dl.length > 1 ? `<polyline points="${dl.join(" ")}" fill="none" stroke="var(--muted)" stroke-width="2"/>` : ""}${dots}
  <text x="${L}" y="10">problems / hour</text></svg>`;
};
