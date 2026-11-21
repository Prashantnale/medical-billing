'use strict';

/**
 * CSRF protection without extra dependencies.
 * Sessions use SameSite=Lax cookies, which already block cross-site POSTs;
 * as defense-in-depth we additionally require that any state-changing
 * request carrying an Origin/Referer header declares our own origin.
 */
function sameOriginGuard(req, res, next) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

  const origin = req.headers.origin || req.headers.referer;
  if (!origin) return next(); // non-browser clients (curl, tests, PDF fetch) - session cookie still required

  let host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host) return next();

  try {
    const originHost = new URL(origin).host;
    // Accept exact host match (proxy chains may append values - compare first entry)
    const firstHost = String(host).split(',')[0].trim();
    if (originHost === firstHost) return next();
  } catch {
    /* fall through */
  }
  return res.status(403).json({ error: 'Cross-origin request blocked' });
}

module.exports = { sameOriginGuard };
