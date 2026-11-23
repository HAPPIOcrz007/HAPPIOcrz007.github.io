const { withLog } = require('./_lib/log');

module.exports = withLog('ping', async (req, res) => {
  res.status(200).json({ ok: true, time: new Date().toISOString() });
});
