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
  if (!slug) {
    // M-7 fix: X-Tenant-Slug header can be spoofed by any HTTP client.
    // In production the tenant MUST come from the subdomain.
    // Only fall back to the header in non-production environments (dev/test).
    const isProduction = (process.env.NODE_ENV || 'development') === 'production';
    if (!isProduction) slug = req.headers['x-tenant-slug'] || null;

    // Fallback for .replit.app / direct-IP deployments that have no real subdomain:
    // Use DEFAULT_TENANT_SLUG env var as the configured single-tenant identity.
    // This env var is set once at deployment time and is not user-controlled,
    // so it does NOT reintroduce the M-7 spoof vector.
    if (!slug && process.env.DEFAULT_TENANT_SLUG) {
      slug = process.env.DEFAULT_TENANT_SLUG;
    }
  }
  if (slug) {
    // Always record that a slug was attempted — even if the teacher wasn't found.
    // Routes can use req.tenantSlugAttempted to detect "wrong tenant" vs "no tenant".
    req.tenantSlugAttempted = slug;
    const tenant = await resolveTenant(slug);
    if (tenant) {
      req.tenantSlug = tenant.slug;
      req.tenantTeacherId = tenant.id;
    }
  }
  next();
};

module.exports.invalidateCache = (slug) => { if (slug) cache.delete(slug); };
