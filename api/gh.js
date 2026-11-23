const QUERY = `
  query($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          weeks { contributionDays { date contributionCount } }
        }
      }
    }
  }`;

async function viaGitHub(login, token) {
  const to = new Date();
  const from = new Date(to.getTime() - 365 * 24 * 3600 * 1000);
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'portfolio-heatmap',
    },
    body: JSON.stringify({
      query: QUERY,
      variables: { login, from: from.toISOString(), to: to.toISOString() },
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(r.status);
  const json = await r.json();
  const weeks =
    json?.data?.user?.contributionsCollection?.contributionCalendar?.weeks;
  if (!weeks) throw new Error('no calendar in response');
  return weeks
    .flatMap((w) => w.contributionDays)
    .map((d) => ({ date: d.date, count: d.contributionCount }));
}

async function viaProxy(login) {
  const r = await fetch(
    `https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(login)}?y=last`,
    { signal: AbortSignal.timeout(8000) }
  );
  if (!r.ok) throw new Error(r.status);
  const json = await r.json();
  return (json.contributions || []).map((c) => ({ date: c.date, count: c.count }));
}

module.exports = async (req, res) => {
  const login = process.env.GH_USERNAME;
  if (!login) {
    return res.status(500).json({ error: 'GH_USERNAME not set' });
  }
  const token = process.env.GH_TOKEN;

  let days;
  try {
    if (!token) throw new Error('no token');
    days = await viaGitHub(login, token);
  } catch (e1) {
    try {
      days = await viaProxy(login);
    } catch (e2) {
      return res.status(502).json({ error: 'GitHub fetch failed' });
    }
  }

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).json({ days: days.filter((d) => d.count > 0) });
};
