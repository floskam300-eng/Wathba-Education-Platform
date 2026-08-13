/**
 * Persistent Device Identification for Wathba Education Platform
 *
 * Guarantees:
 * 1. Extreme persistence across sessions, browser restarts, and PWA vs browser:
 *    - Primary: localStorage ('wathba_device_id')
 *    - Redundancy 1: Long-lived Cookie (10 years, SameSite=Lax, path=/)
 *    - Redundancy 2: sessionStorage
 *    - Redundancy 3: IndexedDB
 * 2. Invariance: Once a device ID is assigned or loaded from any store, it is
 *    NEVER recalculated or overwritten. This prevents volatile browser signals
 *    (screen size shifts from virtual keyboards/address bars, deviceMemory hints,
 *    zoom level / devicePixelRatio, language changes) from generating false "new device"
 *    alerts that block legitimate students.
 * 3. Cross-storage self-healing: If one store is cleared (e.g., cookies cleared
 *    or localStorage cleared), the ID is automatically restored from the surviving stores.
 * 4. Backward compatibility: Existing valid IDs (e.g. 'dev_fp_...') already stored
 *    are preserved so existing registered devices in the database continue to match.
 */

const DEVICE_KEY = 'wathba_device_id';
const ORIGIN_KEY = 'wathba_device_origin';

// ── Cookie Helpers ─────────────────────────────────────────────────────────────
function getCookie(name) {
  if (typeof document === 'undefined') return null;
  try {
    const matches = document.cookie.match(
      new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)')
    );
    return matches ? decodeURIComponent(matches[1]) : null;
  } catch (_) {
    return null;
  }
}

function setCookie(name, value) {
  if (typeof document === 'undefined') return;
  try {
    // 10-year expiration
    const maxAge = 10 * 365 * 24 * 60 * 60;
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch (_) {}
}

// ── IndexedDB Redundancy ────────────────────────────────────────────────────────
const DB_NAME = 'wathba_device_meta';
const DB_STORE = 'device_store';

function getIndexedDBDeviceId() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE);
        }
      };
      request.onsuccess = (e) => {
        try {
          const db = e.target.result;
          const tx = db.transaction(DB_STORE, 'readonly');
          const store = tx.objectStore(DB_STORE);
          const getReq = store.get(DEVICE_KEY);
          getReq.onsuccess = () => resolve(getReq.result || null);
          getReq.onerror = () => resolve(null);
        } catch (_) {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
}

function setIndexedDBDeviceId(value) {
  if (typeof window === 'undefined' || !window.indexedDB || !value) return;
  try {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    request.onsuccess = (e) => {
      try {
        const db = e.target.result;
        const tx = db.transaction(DB_STORE, 'readwrite');
        const store = tx.objectStore(DB_STORE);
        store.put(value, DEVICE_KEY);
      } catch (_) {}
    };
  } catch (_) {}
}

// ── Strong Random UUID Generator ───────────────────────────────────────────────
function generateSecureDeviceId() {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      try {
        return `dev_${crypto.randomUUID().replace(/-/g, '')}`;
      } catch (_) {}
    }
    if (crypto.getRandomValues) {
      try {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        return `dev_${hex}`;
      } catch (_) {}
    }
  }
  // Fallback if crypto API is unavailable
  const ts = Date.now().toString(36);
  const r1 = Math.random().toString(36).slice(2, 10);
  const r2 = Math.random().toString(36).slice(2, 10);
  return `dev_${ts}_${r1}${r2}`;
}

// ── Detect Origin (Browser vs PWA vs TwA) ───────────────────────────────────────
export function detectDeviceOrigin() {
  if (typeof window === 'undefined') return 'unknown';
  // 1. iOS standalone PWA
  if (window.navigator?.standalone === true) return 'pwa_ios';
  // 2. Android / Desktop PWA
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
      return 'pwa_android';
    }
  } catch (_) {}
  // 3. TwA (Trusted Web Activity)
  try {
    if (document.referrer && document.referrer.includes('android-app://')) {
      return 'twa';
    }
  } catch (_) {}
  // 4. Regular browser tab
  return 'browser';
}

function getStoredOrigin() {
  try {
    const stored = localStorage.getItem(ORIGIN_KEY);
    if (stored) return stored;
  } catch (_) {}
  return detectDeviceOrigin();
}

/**
 * Validate that an ID string is non-empty, clean, and has reasonable length.
 */
function isValidDeviceId(id) {
  return typeof id === 'string' && id.trim().length >= 8 && id.trim().length <= 128;
}

/**
 * Persist the given device ID to all storage layers (self-healing / sync).
 */
function syncDeviceIdToAllStores(id) {
  if (!isValidDeviceId(id)) return;
  const cleanId = id.trim();

  // 1. localStorage
  try {
    if (localStorage.getItem(DEVICE_KEY) !== cleanId) {
      localStorage.setItem(DEVICE_KEY, cleanId);
    }
  } catch (_) {}

  // 2. sessionStorage
  try {
    if (sessionStorage.getItem(DEVICE_KEY) !== cleanId) {
      sessionStorage.setItem(DEVICE_KEY, cleanId);
    }
  } catch (_) {}

  // 3. Cookie
  try {
    if (getCookie(DEVICE_KEY) !== cleanId) {
      setCookie(DEVICE_KEY, cleanId);
    }
  } catch (_) {}

  // 4. IndexedDB
  setIndexedDBDeviceId(cleanId);
}

/**
 * Get or compute the persistent, stable device ID AND the origin.
 * Returns { device_id, origin } where origin is one of:
 *   "browser" | "pwa_ios" | "pwa_android" | "twa" | "unknown"
 *
 * CRITICAL RULE:
 * If an ID already exists in ANY store (localStorage, Cookie, sessionStorage, IndexedDB),
 * IT IS PRESERVED AND RETURNED DIRECTLY. It is NEVER overwritten by a re-calculation.
 */
export async function getOrCreateDeviceId() {
  if (typeof window === 'undefined') return { device_id: 'dev_server', origin: 'unknown' };

  // Step 1: Check localStorage (Fastest & primary)
  let existingId = null;
  try {
    const local = localStorage.getItem(DEVICE_KEY);
    if (isValidDeviceId(local)) {
      existingId = local.trim();
    }
  } catch (_) {}

  // Step 2: Check Cookie if not in localStorage
  if (!existingId) {
    const cookie = getCookie(DEVICE_KEY);
    if (isValidDeviceId(cookie)) {
      existingId = cookie.trim();
    }
  }

  // Step 3: Check sessionStorage if not found yet
  if (!existingId) {
    try {
      const session = sessionStorage.getItem(DEVICE_KEY);
      if (isValidDeviceId(session)) {
        existingId = session.trim();
      }
    } catch (_) {}
  }

  // Step 4: Check IndexedDB if still not found
  if (!existingId) {
    try {
      const idbId = await getIndexedDBDeviceId();
      if (isValidDeviceId(idbId)) {
        existingId = idbId.trim();
      }
    } catch (_) {}
  }

  // If an existing ID was found anywhere, synchronize it across all stores & return it!
  if (existingId) {
    syncDeviceIdToAllStores(existingId);
    const origin = detectDeviceOrigin();
    try { localStorage.setItem(ORIGIN_KEY, origin); } catch (_) {}
    return { device_id: existingId, origin };
  }

  // Step 5: Only if NO store has an ID (brand-new device or full clear), generate a new one
  const newDeviceId = generateSecureDeviceId();
  syncDeviceIdToAllStores(newDeviceId);

  const origin = detectDeviceOrigin();
  try { localStorage.setItem(ORIGIN_KEY, origin); } catch (_) {}

  return { device_id: newDeviceId, origin };
}

/**
 * Backwards-compatible helper for callers that only need the device_id string.
 */
export async function getOrCreateDeviceIdLegacy() {
  const { device_id } = await getOrCreateDeviceId();
  return device_id;
}

export default getOrCreateDeviceId;

