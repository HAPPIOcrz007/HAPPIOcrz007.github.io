/* util.js — API call, division parsing, date helpers, streak calculation. */
async function call(m, p) {
  const r = await fetch(API + m + "?" + new URLSearchParams(p));
  const j = await r.json();
  if (j.status !== "OK") throw new Error(j.comment || "API error");
  return j.result;
}

function division(name, type) {
  const n = name || "";
  if (/div\.?\s*1\s*\+\s*div\.?\s*2/i.test(n)) return "Div. 1 + 2";
  const m = n.match(/div(?:ision|\.)?\s*([1-4])/i);
  if (m) return "Div. " + m[1];
  if (/educational/i.test(n)) return "Educational";
  if (/global round/i.test(n)) return "Global Round";
  if (/(codeforces round|round)/i.test(n)) return "Round (no div)";
  return type && type !== "CF" ? type : "Other";
}

const dkey = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const dayOf = t => dkey(new Date(t * 1000));
const fmt = d => d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const rng = b => fmt(b.s) + " – " + fmt(b.e);

/* longest run of consecutive active days between s and e (inclusive) */
function streaks(map, s, e) {
  let best = { n: 0 }, cur = null;
  for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    if (map.get(dkey(d))) { if (!cur) cur = { n: 0, s: new Date(d) }; cur.n++; cur.e = new Date(d); if (cur.n > best.n) best = { ...cur } }
    else cur = null;
  }
  return best;
}
