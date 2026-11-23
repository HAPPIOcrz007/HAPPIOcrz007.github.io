module.exports = async (req, res) => {
  const handle = process.env.CF_HANDLE;
  if (!handle) {
    return res.status(500).json({ error: 'CF_HANDLE not set' });
  }

  const h = encodeURIComponent(handle);
  try {
    const [infoRes, statusRes] = await Promise.all([
      fetch(`https://codeforces.com/api/user.info?handles=${h}`),
      fetch(`https://codeforces.com/api/user.status?handle=${h}&from=1&count=10000`),
    ]);

    const status = await statusRes.json();
    if (status.status !== 'OK') {
      return res.status(502).json({ error: 'Codeforces API error' });
    }

    // Rating is a bonus: if this call fails, still return the submissions
    let rating = 0;
    try {
      const info = await infoRes.json();
      if (info.status === 'OK' && info.result.length > 0) {
        rating = info.result[0].rating || 0;
      }
    } catch (_) {}

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    return res.status(200).json({
      rating,
      times: status.result.map((s) => s.creationTimeSeconds),
    });
  } catch (e) {
    return res.status(502).json({ error: 'fetch failed' });
  }
};
