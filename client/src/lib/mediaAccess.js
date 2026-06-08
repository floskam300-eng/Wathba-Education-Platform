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
 */
export async function refreshMediaToken() {
  const now = Date.now();
  if (_mediaToken && now < _tokenExpiry - REFRESH_AHEAD_MS) return _mediaToken;
  const token = await _fetchMediaToken();
  if (token) {
    _mediaToken = token;
    _tokenExpiry = now + TOKEN_LIFETIME_MS;
  }
  return _mediaToken;
}

/**
 * Clear the media token (call on logout).
 */
export function clearMediaToken() {
  _mediaToken = null;
  _tokenExpiry = 0;
}

/**
 * Append a short-lived media access token to an /uploads/* URL.
 * Falls back to the full session JWT if no media token has been fetched yet
 * (e.g., first render before initMediaToken completes).
 */
export function withToken(url) {
  if (!url || !url.startsWith('/uploads/')) return url;
  const token = _mediaToken || localStorage.getItem('wathba_token') || '';
  if (!token) return url;
  return `${url}?token=${encodeURIComponent(token)}`;
}
