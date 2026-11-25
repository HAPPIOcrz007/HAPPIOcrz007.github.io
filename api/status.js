const { withLog } = require('./_lib/log');

const TZ = process.env.STATUS_TZ || 'Asia/Kolkata';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }); // YYYY-MM-DD
const localDay = (ms) => dayFmt.format(new Date(ms));

const ALIAS = {
  cf: 'cf', codeforces: 'cf',
  cc: 'cc', codechef: 'cc',
  gh: 'gh', git: 'gh', github: 'gh',
  lc: 'lc', leetcode: 'lc',
  atc: 'atc', ac: 'atc', atcoder: 'atc',
};
const NAME = { cf: 'Codeforces', cc: 'CodeChef', gh: 'GitHub', lc: 'LeetCode', atc: 'AtCoder' };

function rankOf(r) {
  if (!r) return 'unrated';
  if (r < 1200) return 'newbie';
  if (r < 1400) return 'pupil';
  if (r < 1600) return 'specialist';
  if (r < 1900) return 'expert';
  if (r < 2100) return 'candidate master';
  if (r < 2300) return 'master';
  if (r < 2400) return 'international master';
  if (r < 2600) return 'grandmaster';
  if (r < 3000) return 'international grandmaster';
  return 'legendary grandmaster';
}

async function getJson(base, path) {
  const r = await fetch(base + path, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

// Turn one route's response into { 'YYYY-MM-DD': count }
function toDayMap(key, data) {
  const map = {};
  const add = (d, n) => { map[d] = (map[d] || 0) + n; };
  if (!data) return map;
  if (key === 'cf' || key === 'atc') {
    (data.times || []).forEach((t) => add(localDay(t * 1000), 1));
  } else if (key === 'lc') {
    try {
      const raw = data.submissionCalendar;
      const cal = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
      // LeetCode's keys are UTC-midnight days
      for (const [ts, n] of Object.entries(cal)) {
        add(new Date(Number(ts) * 1000).toISOString().slice(0, 10), n);
      }
    } catch (_) {}
  } else {
    for (const d of data.days || []) if (d.count > 0) add(d.date, d.count);
  }
  return map;
}

// dayAt(0) = today in your timezone, dayAt(1) = yesterday, ...
function makeDayAt() {
  const noon = new Date(localDay(Date.now()) + 'T12:00:00Z').getTime();
  return (i) => new Date(noon - i * 86400000).toISOString().slice(0, 10);
}

// If today has no activity yet, count from yesterday so mornings don't show 0
function streakOf(map, dayAt) {
  let i = map[dayAt(0)] > 0 ? 0 : 1;
  let streak = 0;
  while (map[dayAt(i)] > 0) { streak++; i++; }
  return streak;
}

function totalOf(map, dayAt) {
  const cutoff = dayAt(364);
  let sum = 0;
  for (const [d, n] of Object.entries(map)) if (d >= cutoff) sum += n;
  return sum;
}

module.exports = withLog('status', async (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  const q = String(req.query.s || '').toLowerCase().trim();
  const wanted = q ? ALIAS[q] : null;
  if (q && !wanted) {
    return res.status(400).send(`unknown platform "${q.slice(0, 20)}" - use cf, cc, gh, lc or atc\n`);
  }

  const base = `https://${req.headers.host}`;
  const keys = wanted ? [wanted] : ['cf', 'atc', 'lc', 'gh', 'cc'];
  const results = await Promise.allSettled(keys.map((k) => getJson(base, `/api/${k}`)));
  const data = {};
  keys.forEach((k, i) => { data[k] = results[i].status === 'fulfilled' ? results[i].value : null; });

  const dayAt = makeDayAt();
  let line;

  if (wanted) {
    const d = data[wanted];
    if (!d) return res.status(502).send(`${NAME[wanted]} unavailable\n`);
    const map = toDayMap(wanted, d);
    const head = wanted === 'cf' ? `${d.rating} ${rankOf(d.rating)}` : NAME[wanted];
    line = `${head} --- ${streakOf(map, dayAt)} day streak, ${totalOf(map, dayAt)} submissions in the last year`;
  } else {
    // Combined: every platform's days merged
    const all = {};
    for (const k of keys) {
      for (const [d, n] of Object.entries(toDayMap(k, data[k]))) all[d] = (all[d] || 0) + n;
    }
    const prefix = data.cf ? `${data.cf.rating} ${rankOf(data.cf.rating)} --- ` : '';
    line = `${prefix}${streakOf(all, dayAt)} day streak`;
  }

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(line + '\n');
});
