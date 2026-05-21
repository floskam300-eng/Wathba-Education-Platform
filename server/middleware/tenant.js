const pool = require('../db/connection');

/**
 * Resolves the current tenant (teacher) from the subdomain.
 * Subdomain format: ahmed.wathba.app  →  subdomain = "ahmed"
 *
 * Sets req.tenant = { id, name, platform_name, logo_url, primary_color, ... }
 * If no subdomain match found, req.tenant = null (public routes handle this gracefully).
 */
async function resolveTenant(req, res, next) {
  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const subdomain = extractSubdomain(host);

    if (!subdomain) {
      req.tenant = null;
      return next();
    }

    const result = await pool.query(
      `SELECT id, name, bio, classification, logo_url, photo_url,
              whatsapp_phone, platform_name, primary_color, subdomain, created_at
       FROM teachers WHERE subdomain = $1 LIMIT 1`,
      [subdomain]
    );

    req.tenant = result.rows[0] || null;
    next();
  } catch (err) {
    console.error('[resolveTenant]', err.message);
    req.tenant = null;
    next();
  }
}

/**
 * Extracts subdomain from host header.
 * Examples:
 *   ahmed.wathba.app       → "ahmed"
 *   ahmed.wathba.replit.app → "ahmed"
 *   localhost:5000          → null
 *   127.0.0.1:3001          → null
 */
function extractSubdomain(host) {
  if (!host) return null;
  const hostname = host.split(':')[0];
  const parts = hostname.split('.');
  if (parts.length < 3) return null;
  const sub = parts[0].toLowerCase();
  if (['www', 'api', 'app', 'mail', 'localhost'].includes(sub)) return null;
  return sub;
}

module.exports = { resolveTenant, extractSubdomain };
