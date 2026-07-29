/**
 * Shared in-memory cache for tenant branding data (platform_name, pwa_name, logo).
 * Kept in a separate module so both server/index.js (manifest endpoint) and
 * server/routes/admin.js (create/edit teacher) can read and invalidate it
 * without circular dependencies.
 *
 * TTL: 5 minutes per slug.
 */

const BRANDING_CACHE_TTL_MS = 5 * 60_000;

/** @type {Map<string, { data: object, ts: number }>} */
const _cache = new Map();

/**
 * Get cached branding for a slug, or null if missing / expired.
 * @param {string} slug
 * @returns {{ appName: string, shortName: string, logoUrl: string|null }|null}
 */
function getBrandingCache(slug) {
  if (!slug) return null;
  const entry = _cache.get(slug);
  if (!entry) return null;
  if (Date.now() - entry.ts > BRANDING_CACHE_TTL_MS) {
    _cache.delete(slug);
    return null;
  }
  return entry.data;
}

/**
 * Store branding data for a slug.
 * @param {string} slug
 * @param {{ appName: string, shortName: string, logoUrl: string|null }} data
 */
function setBrandingCache(slug, data) {
  if (!slug) return;
  _cache.set(slug, { data, ts: Date.now() });
}

/**
 * Remove the cached entry for a slug immediately.
 * Call this after creating or updating a teacher's branding fields so the
 * next manifest request queries the DB for fresh data.
 * @param {string} slug
 */
function invalidateBrandingCache(slug) {
  if (slug) _cache.delete(slug);
}

module.exports = { getBrandingCache, setBrandingCache, invalidateBrandingCache };
