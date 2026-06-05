const pool = require('../db/connection');

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

async function resolveTenant(slug) {
  if (!slug) return null;
  const cached = cache.get(slug);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  try {
    const res = await pool.query('SELECT id, slug FROM teachers WHERE slug = $1', [slug]);
    if (res.rows.length === 0) {
      cache.set(slug, { data: null, ts: Date.now() });
      return null;
    }
    const data = { id: res.rows[0].id, slug: res.rows[0].slug };
    cache.set(slug, { data, ts: Date.now() });
    return data;
  } catch (_) {
    return null;
  }
}

function extractSubdomainSlug(host) {
  if (!host) return null;
  const hostname = host.split(':')[0].toLowerCase();
  const parts = hostname.split('.');
  if (parts.length < 3) return null;
  if (
    hostname.includes('localhost') ||
    hostname.includes('replit.dev') ||
    hostname.includes('replit.app') ||
    hostname.includes('repl.co')
  ) return null;
  if (parts[0] === 'www') return null;
  return parts[0];
}

module.exports = async function subdomainTenant(req, res, next) {
  let slug = extractSubdomainSlug(req.get('host') || '');
  if (!slug) slug = req.headers['x-tenant-slug'] || null;
  if (slug) {
    const tenant = await resolveTenant(slug);
    if (tenant) {
      req.tenantSlug = tenant.slug;
      req.tenantTeacherId = tenant.id;
    }
  }
  next();
};

module.exports.invalidateCache = (slug) => { if (slug) cache.delete(slug); };
