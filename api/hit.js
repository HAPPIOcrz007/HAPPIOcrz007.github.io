const { withLog } = require('./_lib/log');

module.exports = withLog('hit', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(204).end();
});
