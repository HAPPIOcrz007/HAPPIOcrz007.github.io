module.exports = async (req, res) => {
  const username = process.env.ATC_USERNAME;
  if (!username) {
    return res.status(500).json({ error: 'ATC_USERNAME not set' });
  }

  try {
    const r = await fetch(
      `https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user=${encodeURIComponent(username)}&from_second=0`,
      { signal: AbortSignal.timeout(9000) }
    );
    if (!r.ok) throw new Error(r.status);
    const subs = await r.json();

    // Only accepted submissions, as raw timestamps (the browser does the date bucketing)
    const times = subs
      .filter((s) => s.result === 'AC')
      .map((s) => s.epoch_second);

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=7200');
    return res.status(200).json({ times });
  } catch (e) {
    return res.status(502).json({ error: 'AtCoder fetch failed' });
  }
};
