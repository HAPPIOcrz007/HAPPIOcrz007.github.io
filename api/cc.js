const { withLog } = require('./_lib/log');

module.exports = withLog('cc', async (req, res) => {
  const username = process.env.CC_USERNAME;
  if (!username) {
    return res.status(500).json({ error: 'CC_USERNAME not set' });
  }

  try {
    const r = await fetch(
      `https://www.codechef.com/users/${encodeURIComponent(username)}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (portfolio heatmap)' },
        signal: AbortSignal.timeout(9000),
      }
    );
    if (!r.ok) throw new Error(r.status);
    const html = await r.text();

    // The profile page embeds the heatmap data as a JS variable
    const m = html.match(/userDailySubmissionsStats\s*=\s*(\[[\s\S]*?\])\s*;/);
    if (!m) throw new Error('heatmap data not found in page');

    const days = JSON.parse(m[1]).map((d) => {
      // normalise "2026-1-5" to "2026-01-05"
      const [y, mo, da] = String(d.date).split('-');
      return {
        date: `${y}-${mo.padStart(2, '0')}-${da.padStart(2, '0')}`,
        count: Number(d.value) || 0,
      };
    });

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ days });
  } catch (e) {
    return res.status(502).json({ error: 'CodeChef fetch failed' });
  }
});
