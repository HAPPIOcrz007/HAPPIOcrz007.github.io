const { withLog } = require('./_lib/log');

const QUERY = `
  query($username: String!, $year: Int) {
    matchedUser(username: $username) {
      userCalendar(year: $year) { submissionCalendar }
    }
  }`;

async function viaGraphQL(username, year) {
  const r = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Referer: 'https://leetcode.com',
    },
    body: JSON.stringify({ query: QUERY, variables: { username, year } }),
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error(r.status);
  const json = await r.json();
  const raw = json?.data?.matchedUser?.userCalendar?.submissionCalendar;
  if (!raw) throw new Error('empty response');
  return raw;
}

async function viaProxy(username, year) {
  const r = await fetch(
    `https://alfa-leetcode-api.onrender.com/${encodeURIComponent(username)}/calendar?year=${year}`,
    { signal: AbortSignal.timeout(6000) }
  );
  if (!r.ok) throw new Error(r.status);
  const json = await r.json();
  if (!json?.submissionCalendar) throw new Error('empty response');
  return json.submissionCalendar;
}

module.exports = withLog('lc', async (req, res) => {
  const username = process.env.LC_USERNAME;
  if (!username) {
    return res.status(500).json({ error: 'LC_USERNAME not set' });
  }
  const year = new Date().getFullYear();

  let raw;
  try {
    raw = await viaGraphQL(username, year);
  } catch (e1) {
    try {
      raw = await viaProxy(username, year);
    } catch (e2) {
      return res.status(502).json({ error: 'LeetCode fetch failed' });
    }
  }

  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
  return res.status(200).json({ submissionCalendar: raw });
});
