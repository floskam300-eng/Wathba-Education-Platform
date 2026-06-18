/**
 * H-8: Short-lived media access token module.
 *
 * Instead of appending the long-lived session JWT (7-day) to every /uploads/*
 * URL, we use a short-lived token (15 min) issued by POST /api/auth/media-token.
 * This token lives in memory only — never in localStorage — so it cannot be
 * read by XSS payloads that target localStorage.
 *
 * Usage:
 *   import { withToken } from '../../lib/mediaAccess';
 *   <img src={withToken(url)} />
 *
 * Layouts call initMediaToken() on mount to prime the cache.
 * On logout call clearMediaToken().
 */

import { getTenantSlug } from './tenant';

let _mediaToken = null;
let _tokenExpiry = 0; // Unix ms timestamp when the token expires

// [A-3 fix] Coalesce concurrent refreshMediaToken() calls.
// Without this, two components that both call refreshMediaToken() before the
// first resolves will fire two POST /api/auth/media-token requests.  The
// second request's result simply overwrites the first — wasteful but also
// causes a brief window where each caller holds a *different* token reference,
// which can confuse downstream caches.
let _pendingFetch = null;

const TOKEN_LIFETIME_MS = 15 * 60 * 1000; // 15 min (matches server-side expiresIn: '15m')
const REFRESH_AHEAD_MS  =  2 * 60 * 1000; // Refresh 2 min before expiry

async function _fetchMediaToken() {
  const jwt = localStorage.getItem('wathba_token');
  if (!jwt) return null;
  try {
    // [M-18 fix: include X-Tenant-Slug so multi-tenant media token endpoint
    // resolves the correct tenant. Without this, the server rejects the request
    // if the tenant cannot be inferred from the (absent) subdomain.]
    const slug = getTenantSlug();
    const headers = { 'Authorization': `Bearer ${jwt}` };
    if (slug) headers['X-Tenant-Slug'] = slug;
    const res = await fetch('/api/auth/media-token', {
      method: 'POST',
      headers,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.token || null;
  } catch {
    return null;
  }
}

/**
 * Ensure the in-memory media token is fresh.
 * Call this from layout useEffect hooks.
 *
 * [A-3 fix] Concurrent calls share a single in-flight Promise so only one
 * HTTP request is ever outstanding at a time.
 */
export async function refreshMediaToken() {
  const now = Date.now();
  if (_mediaToken && now < _tokenExpiry - REFRESH_AHEAD_MS) return _mediaToken;

  // If a fetch is already in flight, return the same Promise instead of
  // starting a second request.
  if (!_pendingFetch) {
    _pendingFetch = _fetchMediaToken()
      .then((token) => {
        if (token) {
          _mediaToken = token;
          _tokenExpiry = Date.now() + TOKEN_LIFETIME_MS;
        }
        return _mediaToken;
      })
      .catch(() => _mediaToken)
      .finally(() => { _pendingFetch = null; });
  }

  return _pendingFetch;
}

/**
 * Clear the media token (call on logout).
 */
export function clearMediaToken() {
  _mediaToken = null;
  _tokenExpiry = 0;
  // Do NOT null-out _pendingFetch — any in-flight request will still settle and
  // harmlessly overwrite _mediaToken (which will be re-cleared by the next
  // logout call if the race resolves after logout).
}

/**
 * Append a short-lived media access token to an /uploads/* URL.
 * Falls back to the full session JWT if no media token has been fetched yet
 * (e.g., first render before initMediaToken completes).
 *
 * [A-2 fix] Use '&' as separator when the URL already contains a '?' so we
 * produce valid query strings instead of malformed ones like
 * "/uploads/file.pdf?foo=bar?token=X".
 */
export function withToken(url) {
  if (!url || !url.startsWith('/uploads/')) return url;
  const token = _mediaToken || localStorage.getItem('wathba_token') || '';
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}
