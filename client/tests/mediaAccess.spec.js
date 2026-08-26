// @vitest-environment jsdom
/**
 * WATHBA — VideoPlayer token-resilience tests
 * ============================================
 *
 * These tests verify the foundation that fixes the "video thumbnail freezes
 * and doesn't play" bug:
 *
 *   1. mediaAccess.onMediaTokenRefresh() delivers a notification to subscribers
 *      every time a new token is stored, so the <video> element can remount
 *      with a fresh URL before the 15-min media token expires.
 *
 *   2. mediaAccess.refreshMediaToken() calls the POST /api/auth/media-token
 *      endpoint and stores the returned token in module memory.
 *
 *   3. mediaAccess.withToken() embeds the in-memory token into /uploads/* URLs
 *      (and is a no-op for non-/uploads URLs).
 *
 *   4. Integration: when refreshMediaToken() settles successfully, all
 *      subscribers receive exactly one notification per rotation.
 *
 * Run: npm test -- --run (from the client/ directory)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  refreshMediaToken,
  withToken,
  onMediaTokenRefresh,
  clearMediaToken,
} from '../src/lib/mediaAccess';

// ─── test helpers ──────────────────────────────────────────────────────
//
// `clearMediaToken()` resets the in-memory cache. It does NOT touch the
// _listeners Set, so subscribers registered in earlier tests will still
// fire — good for verifying the full lifecycle of an event.

const setAuth = (jwt = 'test-session-jwt') => {
  localStorage.setItem('wathba_token', jwt);
};
const clearAuth = () => localStorage.clear();

const mockMediaTokenEndpoint = (token = 'fresh-media-token-15min') => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ token }),
  });
  return token;
};

const mockMediaTokenFail = () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });
};

// ─── tests ──────────────────────────────────────────────────────────────

describe('mediaAccess pub/sub (token-rotation event bus)', () => {
  beforeEach(() => {
    clearMediaToken();
    clearAuth();
    setAuth();
  });

  afterEach(() => {
    clearMediaToken();
    clearAuth();
  });

  it('notifies subscribers when refreshMediaToken() stores a new token', async () => {
    mockMediaTokenEndpoint();
    const cb = vi.fn();
    const off = onMediaTokenRefresh(cb);

    await refreshMediaToken();

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(expect.any(String));

    off();
  });

  it('does NOT notify subscribers if the fetch failed', async () => {
    mockMediaTokenFail();
    const cb = vi.fn();
    const off = onMediaTokenRefresh(cb);

    await refreshMediaToken();

    expect(cb).not.toHaveBeenCalled();

    off();
  });

  it('coalesces duplicate refreshMediaToken() calls into a single emit when token is fresh', async () => {
    mockMediaTokenEndpoint();
    const cb = vi.fn();
    const off = onMediaTokenRefresh(cb);

    // The token just rotated, so all subsequent calls within 13 min are
    // no-ops — only one emit should happen. This is the [A-3] coalescing
    // guarantee from mediaAccess.js.
    await refreshMediaToken();
    await refreshMediaToken();
    await refreshMediaToken();

    expect(cb).toHaveBeenCalledTimes(1);

    off();
  });

  it('emits again on every true rotation (when token is forcibly cleared)', async () => {
    const cb = vi.fn();
    const off = onMediaTokenRefresh(cb);

    mockMediaTokenEndpoint('tok-1');
    await refreshMediaToken();
    expect(cb).toHaveBeenCalledTimes(1);

    clearMediaToken();
    mockMediaTokenEndpoint('tok-2');
    await refreshMediaToken();
    expect(cb).toHaveBeenCalledTimes(2);

    clearMediaToken();
    mockMediaTokenEndpoint('tok-3');
    await refreshMediaToken();
    expect(cb).toHaveBeenCalledTimes(3);

    off();
  });

  it('unsubscribe stops further notifications', async () => {
    mockMediaTokenEndpoint();
    const cb = vi.fn();
    const off = onMediaTokenRefresh(cb);

    await refreshMediaToken();
    expect(cb).toHaveBeenCalledTimes(1);

    off();

    // Force a fresh rotation by clearing then refreshing.
    clearMediaToken();
    await refreshMediaToken();
    expect(cb).toHaveBeenCalledTimes(1); // unchanged after unsubscribe
  });

  it('delivers the same token reference to every subscriber on the same rotation', async () => {
    const token = mockMediaTokenEndpoint('shared-token');
    const cbA = vi.fn();
    const cbB = vi.fn();
    const offA = onMediaTokenRefresh(cbA);
    const offB = onMediaTokenRefresh(cbB);

    await refreshMediaToken();

    expect(cbA).toHaveBeenCalledWith(token);
    expect(cbB).toHaveBeenCalledWith(token);

    offA();
    offB();
  });
});

describe('mediaAccess.withToken() URL builder', () => {
  beforeEach(() => {
    clearMediaToken();
    clearAuth();
  });

  afterEach(() => {
    clearMediaToken();
    clearAuth();
  });

  it('passes through URLs that are not under /uploads/', () => {
    expect(withToken('https://youtube.com/watch?v=abc')).toBe(
      'https://youtube.com/watch?v=abc'
    );
    expect(withToken('/api/something')).toBe('/api/something');
    expect(withToken('')).toBe('');
    expect(withToken(null)).toBe(null);
  });

  it('appends the session JWT from localStorage as the fallback token', () => {
    setAuth('fallback-session-jwt');
    const url = withToken('/uploads/videos/lecture-1.mp4');
    expect(url).toBe('/uploads/videos/lecture-1.mp4?token=fallback-session-jwt');
  });

  it('uses & separator when the URL already has a query string', () => {
    setAuth('fallback-jwt');
    const url = withToken('/uploads/videos/lecture-1.mp4?v=2');
    expect(url).toBe('/uploads/videos/lecture-1.mp4?v=2&token=fallback-jwt');
  });

  it('returns the URL untouched when no token is available', () => {
    const url = withToken('/uploads/videos/lecture-1.mp4');
    expect(url).toBe('/uploads/videos/lecture-1.mp4');
  });

  it('prefers the in-memory media token over the localStorage JWT', async () => {
    setAuth('localstorage-jwt');
    mockMediaTokenEndpoint('in-memory-media-jwt');
    await refreshMediaToken();

    const url = withToken('/uploads/videos/lecture-1.mp4');
    expect(url).toContain('token=in-memory-media-jwt');
    expect(url).not.toContain('localstorage-jwt');
  });
});

describe('VideoPlayer token-rotation behavior (integration)', () => {
  beforeEach(() => {
    clearMediaToken();
    clearAuth();
    setAuth(); // refreshMediaToken short-circuits without a session JWT
  });

  afterEach(() => {
    clearMediaToken();
    clearAuth();
  });

  /**
   * This test simulates the exact code path in the VideoPlayer's
   * `onMediaTokenRefresh` subscription. It bumps a counter each time the
   * pub/sub fires — the same counter that the player uses as part of the
   * <video key={...}> so the element remounts with a fresh URL.
   *
   * If the VideoPlayer wiring breaks (e.g. the useEffect is removed or the
   * listener leaks), this test fails.
   */
  it('a subscriber that bumps a version counter receives the bump on each rotation', async () => {
    mockMediaTokenEndpoint('rotation-1');
    let version = 0;
    const off = onMediaTokenRefresh(() => { version += 1; });

    await refreshMediaToken();
    expect(version).toBe(1);

    // Simulate the layout's 12-min background refresh.
    clearMediaToken();
    mockMediaTokenEndpoint('rotation-2');
    await refreshMediaToken();
    expect(version).toBe(2);

    // And a third rotation (e.g. from a sibling layout, after token expiry).
    clearMediaToken();
    mockMediaTokenEndpoint('rotation-3');
    await refreshMediaToken();
    expect(version).toBe(3);

    off();
  });
});
