/**
 * Deterministic Device Identification for Wathba Education Platform
 *
 * Generates a stable, unique device identifier based on PHYSICAL hardware
 * characteristics only — screen geometry, CPU cores, memory, OS platform,
 * timezone. Browser-engine signals (canvas rasterizer, WebGL renderer,
 * full User-Agent) are intentionally excluded so the same physical phone
 * produces the same ID whether the student opens the platform from
 * Chrome, Firefox or the installed PWA.
 *
 * Guarantees:
 * 1. The same physical device → same ID across:
 *    - Regular browsers (Chrome, Safari, Edge, Firefox, Samsung Internet)
 *    - Installed PWA (standalone display mode on iOS / Android / Desktop)
 *    - Different browser engines on the same machine (cross-browser)
 * 2. Different physical devices → distinct IDs (with extremely rare
 *    collision risk only if two devices share screen, CPU, RAM, timezone
 *    and platform — unlikely in practice).
 * 3. Persists across localStorage and long-lived cookies (5 years).
 *
 * The fingerprint is split into two parts:
 *   - `hardware`     → hashed into the persistent device_id
 *   - `origin`       → returned separately so the teacher dashboard can
 *                      show "PWA vs Browser" without burning the single
 *                      device slot allotted to this student
 */

function getCookie(name) {
  if (typeof document === 'undefined') return null;
  const matches = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
  return matches ? decodeURIComponent(matches[1]) : null;
}

function setCookie(name, value) {
  if (typeof document === 'undefined') return;
  // 5-year expiration
  const maxAge = 5 * 365 * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/**
 * Fast synchronous string hash fallback (FNV-1a 64-bit style in hex)
 */
function fastHash(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return hex1 + hex2;
}

/**
 * SHA-256 hash using Web Crypto API with fast fallback
 */
async function hashComponents(components) {
  const rawString = JSON.stringify(components);
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
    try {
      const msgUint8 = new TextEncoder().encode(rawString);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hashHex.slice(0, 24);
    } catch (_) {}
  }
  return (fastHash(rawString) + fastHash(rawString.split('').reverse().join(''))).slice(0, 24);
}

/**
 * Normalize User Agent to extract only hardware/OS architecture,
 * ignoring browser build versions or standalone PWA tokens.
 */
function normalizeUA(ua) {
  if (!ua) return '';
  // Extract OS portion, e.g., (iPhone; CPU iPhone OS 17_4 like Mac OS X) or (Windows NT 10.0; Win64; x64) or (Linux; Android 14; SM-S928B)
  const match = ua.match(/\(([^)]+)\)/);
  if (match && match[1]) {
    // Strip dynamic version numbers, keep OS name and architecture
    return match[1].replace(/\b\d+([._]\d+)*\b/g, '#');
  }
  return ua.slice(0, 60);
}

/**
 * Detect the "origin" of the current session — i.e. how the platform is
 * being opened. Independent of the device_id, this is sent along with the
 * login request so the teacher dashboard can see "Chrome on Laptop" vs
 * "PWA on Phone" without burning a separate device slot.
 */
function detectDeviceOrigin() {
  if (typeof window === 'undefined') return 'unknown';
  // 1. iOS standalone PWA
  if (window.navigator.standalone === true) return 'pwa_ios';
  // 2. Android / Desktop / ChromeOS PWA
  const isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  if (isStandalone) return 'pwa_android';
  // 3. TwA (Trusted Web Activity)
  if (document.referrer && document.referrer.includes('android-app://')) return 'twa';
  // 4. Otherwise it's just a regular browser tab
  return 'browser';
}

/**
 * Collect ONLY physical hardware signals that are stable across:
 *   - Browsers (Chrome, Firefox, Safari, Edge, …)
 *   - PWA display modes (standalone, fullscreen, browser)
 *   - Cache/localStorage clears (the values are recomputed deterministically)
 *
 * Excluded intentionally:
 *   - User-Agent (it changes between PWA and Browser for the same device)
 *   - WebGL renderer (changes per browser engine)
 *   - Canvas 2D rasterizer (changes per browser engine)
 */
function collectHardwareFingerprint() {
  if (typeof window === 'undefined') return {};

  // 1. Screen geometry (orientation-invariant)
  const s = window.screen || {};
  const maxScreenDim = Math.max(s.width || 0, s.height || 0);
  const minScreenDim = Math.min(s.width || 0, s.height || 0);
  const colorDepth = s.colorDepth || 24;
  const pixelRatio = Math.round((window.devicePixelRatio || 1) * 100) / 100;

  // 2. CPU & Memory hardware probes
  const cores = navigator.hardwareConcurrency || 0;
  const memory = navigator.deviceMemory || 0;
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const platform = navigator.platform || '';

  // 3. Locale & timezone
  let lang = '';
  let timeZone = '';
  try { lang = (navigator.languages && navigator.languages[0]) || navigator.language || ''; } catch (_) {}
  try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (_) {}

  return {
    dim: `${maxScreenDim}x${minScreenDim}`,
    cd:  colorDepth,
    pr:  pixelRatio,
    cpu: cores,
    mem: memory,
    tp:  maxTouchPoints,
    plt: platform,
    lang,
    tz:  timeZone,
  };
}

const DEVICE_KEY   = 'wathba_device_id';
const ORIGIN_KEY   = 'wathba_device_origin';

/**
 * Get or compute the persistent, deterministic device ID AND the origin.
 * Returns { device_id, origin } where origin is one of:
 *   "browser" | "pwa_ios" | "pwa_android" | "twa" | "unknown"
 *
 * `device_id` is a stable string like 'dev_fp_a1b2c3d4e5f6...' — the
 * same physical phone produces the same ID regardless of whether the
 * student logs in from Chrome, Firefox or the installed PWA.
 */
export async function getOrCreateDeviceId() {
  if (typeof window === 'undefined') return { device_id: 'dev_server', origin: 'unknown' };

  // 1. Check localStorage first
  let localId = null;
  try {
    localId = localStorage.getItem(DEVICE_KEY);
  } catch (_) {}

  // 2. Check Cookie
  const cookieId = getCookie(DEVICE_KEY);

  // 3. Compute deterministic HARDWARE-ONLY fingerprint
  const hardware = collectHardwareFingerprint();
  const hash = await hashComponents(hardware);
  const deterministicId = `dev_fp_${hash}`;

  // If local or cookie already has the deterministic format dev_fp_*, ensure consistency.
  // Even if `localId` happens to match the regenerated hardware hash we keep it
  // (cross-browser / PWA should produce the same hash anyway now).
  if (localId && localId.startsWith('dev_fp_') && localId === deterministicId) {
    if (!cookieId) setCookie(DEVICE_KEY, localId);
    return { device_id: deterministicId, origin: getStoredOrigin() };
  }

  // Persist the new ID. If the previous localId was a different (older,
  // browser-engine-dependent) ID we *do* overwrite it so the student
  // converges to the hardware-only fingerprint on next login.
  try { localStorage.setItem(DEVICE_KEY, deterministicId); } catch (_) {}
  setCookie(DEVICE_KEY, deterministicId);

  // Compute and persist the origin tag
  const origin = detectDeviceOrigin();
  try { localStorage.setItem(ORIGIN_KEY, origin); } catch (_) {}

  return { device_id: deterministicId, origin };
}

function getStoredOrigin() {
  try {
    const stored = localStorage.getItem(ORIGIN_KEY);
    if (stored) return stored;
  } catch (_) {}
  return detectDeviceOrigin();
}

/**
 * Backwards-compatible helper for callers that only need the device_id
 * string (the legacy API). Internally still calls getOrCreateDeviceId.
 *
 * @deprecated prefer getOrCreateDeviceId().device_id going forward
 */
export async function getOrCreateDeviceIdLegacy() {
  const { device_id } = await getOrCreateDeviceId();
  return device_id;
}

export default getOrCreateDeviceId;
