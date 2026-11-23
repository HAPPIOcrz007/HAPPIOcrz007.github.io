const crypto = require('crypto');

function clientIp(req) {
  const h = req.headers;
  const raw = h['x-vercel-forwarded-for'] || h['x-forwarded-for'] || h['x-real-ip'] || '';
  return String(raw).split(',')[0].trim() || 'unknown';
}

// Optional: set LOG_SALT in Vercel to log a hashed visitor id instead of the raw IP
function ipValue(ip) {
  const salt = process.env.LOG_SALT;
  if (!salt) return ip;
  return crypto.createHash('sha256').update(salt + ip).digest('hex').slice(0, 12);
}

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

function withLog(name, handler) {
  return async (req, res) => {
    const t0 = Date.now();
    res.on('finish', () => {
      console.log(JSON.stringify({
        evt: 'api',
        route: name,
        method: req.method,
        status: res.statusCode,
        ms: Date.now() - t0,
        ip: ipValue(clientIp(req)),
        country: req.headers['x-vercel-ip-country'] || null,
        city: safeDecode(req.headers['x-vercel-ip-city'] || '') || null,
        page: req.query && req.query.p ? String(req.query.p).slice(0, 200) : undefined,
        ref: req.headers.referer || null,
        ua: req.headers['user-agent'] || null,
      }));
    });
    return handler(req, res);
  };
}

module.exports = { withLog };
