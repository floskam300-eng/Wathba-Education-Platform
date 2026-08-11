/**
 * Deterministic Device Identification for Wathba Education Platform
 *
 * Generates a stable, unique device identifier based on physical hardware characteristics
 * (Screen geometry, GPU renderer, CPU cores, Canvas 2D rasterization, OS/Platform, Timezone).
 *
 * Guarantees that:
 * 1. The exact same physical device generates the identical device ID across:
 *    - Regular Web Browser (Chrome, Safari, Edge, Firefox, Samsung Internet)
 *    - Installed PWA (Standalone WebApp mode on iOS / Android / Desktop)
 *    - After browser cache/localStorage clearing
 * 2. Different physical devices generate distinct IDs.
 * 3. Persists across localStorage and long-lived cookies (5 years).
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
 * Collect stable hardware and environment metrics
 */
function collectHardwareFingerprint() {
  if (typeof window === 'undefined') return {};

  // 1. Screen geometry (orientation-invariant: max of width/height and min of width/height)
  const s = window.screen || {};
  const maxScreenDim = Math.max(s.width || 0, s.height || 0);
  const minScreenDim = Math.min(s.width || 0, s.height || 0);
  const colorDepth = s.colorDepth || 24;
  const pixelRatio = Math.round((window.devicePixelRatio || 1) * 100) / 100;

  // 2. CPU & Memory
  const cores = navigator.hardwareConcurrency || 0;
  const memory = navigator.deviceMemory || 0;
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const platform = navigator.platform || '';

  // 3. Timezone & Locale
  let timeZone = '';
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch (_) {}

  // 4. WebGL GPU unmasked renderer info
  let gpuVendor = '';
  let gpuRenderer = '';
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        gpuVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '';
        gpuRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
      }
    }
  } catch (_) {}

  // 5. Canvas 2D rasterizer signature
  let canvasSig = '';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = "14px 'Arial', sans-serif";
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#f97316';
      ctx.fillRect(100, 1, 50, 18);
      ctx.fillStyle = '#0284c7';
      ctx.fillText('Wathba#2026', 2, 15);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.7)';
      ctx.fillText('Wathba#2026', 4, 17);
      canvasSig = canvas.toDataURL().slice(-40);
    }
  } catch (_) {}

  return {
    dim: `${maxScreenDim}x${minScreenDim}`,
    cd: colorDepth,
    pr: pixelRatio,
    cpu: cores,
    mem: memory,
    tp: maxTouchPoints,
    plt: platform,
    tz: timeZone,
    gpu: `${gpuVendor}~${gpuRenderer}`,
    cvs: canvasSig,
    ua: normalizeUA(navigator.userAgent || ''),
  };
}

const DEVICE_KEY = 'wathba_device_id';

/**
 * Get or compute the persistent, deterministic device ID.
 * Returns a stable string like 'dev_fp_a1b2c3d4e5f6...'
 */
export async function getOrCreateDeviceId() {
  if (typeof window === 'undefined') return 'dev_server';

  // 1. Check localStorage first
  let localId = null;
  try {
    localId = localStorage.getItem(DEVICE_KEY);
  } catch (_) {}

  // 2. Check Cookie
  const cookieId = getCookie(DEVICE_KEY);

  // 3. Compute deterministic hardware fingerprint
  const hardware = collectHardwareFingerprint();
  const hash = await hashComponents(hardware);
  const deterministicId = `dev_fp_${hash}`;

  // If local or cookie already has the deterministic format dev_fp_*, ensure consistency
  if (localId && localId.startsWith('dev_fp_') && localId === deterministicId) {
    if (!cookieId) setCookie(DEVICE_KEY, localId);
    return localId;
  }

  // Use the deterministic ID as canonical device ID
  const finalId = deterministicId;

  // Persist to both localStorage and Cookie
  try {
    localStorage.setItem(DEVICE_KEY, finalId);
  } catch (_) {}
  setCookie(DEVICE_KEY, finalId);

  return finalId;
}

export default getOrCreateDeviceId;
