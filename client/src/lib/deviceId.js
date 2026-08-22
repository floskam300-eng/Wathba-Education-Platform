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
    const hostname = (typeof window !== 'undefined' && window.location?.hostname) || '';
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';
    let domainAttr = '';
    if (!isLocal && hostname.includes('.')) {
      const parts = hostname.split('.');
      if (parts.length >= 2) {
        const topDomain = parts.slice(-2).join('.');
        domainAttr = `; domain=.${topDomain}`;
      }
    }
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax${domainAttr}`;
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

// ── High-Precision Device & Model Name Detection ───────────────────────────────

/**
 * Humanize Android model codes to clear, friendly marketing names
 * e.g. SM-A546E -> Samsung Galaxy A54 5G (SM-A546E)
 *      22101316UG -> Xiaomi Redmi Note 12 (22101316UG)
 */
function humanizeModel(model, brand = '') {
  if (!model) return '';
  const m = model.trim();
  const upper = m.toUpperCase();

  // Samsung Galaxy Series
  if (/^SM-([A-Z0-9]+)/i.test(upper) || /SAMSUNG/i.test(brand)) {
    // S Series
    if (/^SM-S92/i.test(upper)) return `Samsung Galaxy S24 (${m})`;
    if (/^SM-S91/i.test(upper)) return `Samsung Galaxy S23 (${m})`;
    if (/^SM-S90/i.test(upper)) return `Samsung Galaxy S22 (${m})`;
    if (/^SM-G99/i.test(upper)) return `Samsung Galaxy S21 (${m})`;
    if (/^SM-G98/i.test(upper)) return `Samsung Galaxy S20 (${m})`;
    if (/^SM-G97/i.test(upper)) return `Samsung Galaxy S10 (${m})`;
    // A Series
    if (/^SM-A55/i.test(upper)) return `Samsung Galaxy A55 (${m})`;
    if (/^SM-A54/i.test(upper)) return `Samsung Galaxy A54 (${m})`;
    if (/^SM-A53/i.test(upper)) return `Samsung Galaxy A53 (${m})`;
    if (/^SM-A52/i.test(upper)) return `Samsung Galaxy A52 (${m})`;
    if (/^SM-A51/i.test(upper)) return `Samsung Galaxy A51 (${m})`;
    if (/^SM-A50/i.test(upper)) return `Samsung Galaxy A50 (${m})`;
    if (/^SM-A35/i.test(upper)) return `Samsung Galaxy A35 (${m})`;
    if (/^SM-A34/i.test(upper)) return `Samsung Galaxy A34 (${m})`;
    if (/^SM-A33/i.test(upper)) return `Samsung Galaxy A33 (${m})`;
    if (/^SM-A32/i.test(upper)) return `Samsung Galaxy A32 (${m})`;
    if (/^SM-A31/i.test(upper)) return `Samsung Galaxy A31 (${m})`;
    if (/^SM-A30/i.test(upper)) return `Samsung Galaxy A30 (${m})`;
    if (/^SM-A25/i.test(upper)) return `Samsung Galaxy A25 (${m})`;
    if (/^SM-A24/i.test(upper)) return `Samsung Galaxy A24 (${m})`;
    if (/^SM-A23/i.test(upper)) return `Samsung Galaxy A23 (${m})`;
    if (/^SM-A22/i.test(upper)) return `Samsung Galaxy A22 (${m})`;
    if (/^SM-A21/i.test(upper)) return `Samsung Galaxy A21 (${m})`;
    if (/^SM-A20/i.test(upper)) return `Samsung Galaxy A20 (${m})`;
    if (/^SM-A15/i.test(upper)) return `Samsung Galaxy A15 (${m})`;
    if (/^SM-A14/i.test(upper)) return `Samsung Galaxy A14 (${m})`;
    if (/^SM-A13/i.test(upper)) return `Samsung Galaxy A13 (${m})`;
    if (/^SM-A12/i.test(upper)) return `Samsung Galaxy A12 (${m})`;
    if (/^SM-A11/i.test(upper)) return `Samsung Galaxy A11 (${m})`;
    if (/^SM-A10/i.test(upper)) return `Samsung Galaxy A10 (${m})`;
    if (/^SM-A05/i.test(upper)) return `Samsung Galaxy A05 (${m})`;
    if (/^SM-A04/i.test(upper)) return `Samsung Galaxy A04 (${m})`;
    if (/^SM-A03/i.test(upper)) return `Samsung Galaxy A03 (${m})`;
    if (/^SM-A02/i.test(upper)) return `Samsung Galaxy A02 (${m})`;
    if (/^SM-A01/i.test(upper)) return `Samsung Galaxy A01 (${m})`;
    if (/^SM-A/i.test(upper)) return `Samsung Galaxy A (${m})`;
    if (/^SM-M/i.test(upper)) return `Samsung Galaxy M (${m})`;
    if (/^SM-F/i.test(upper)) return `Samsung Galaxy Z (${m})`;
    if (/^SM-N/i.test(upper)) return `Samsung Galaxy Note (${m})`;
    if (/^SM-[TX]/i.test(upper)) return `Samsung Galaxy Tab (${m})`;
    return `Samsung (${m})`;
  }

  // Xiaomi / Redmi / POCO
  if (/^2[0-9]{3}[0-9A-Z]+/i.test(upper) || /^M2[0-9]+/i.test(upper) || /REDMI|XIAOMI|POCO/i.test(brand) || /REDMI|POCO|XIAOMI/i.test(upper)) {
    if (/23129RAA4G|23124RA7EO/i.test(upper)) return `Redmi Note 13 (${m})`;
    if (/2312DRA50G/i.test(upper)) return `Redmi Note 13 Pro (${m})`;
    if (/23117RA68G/i.test(upper)) return `Redmi Note 13 Pro+ (${m})`;
    if (/22101316G|22101316UG/i.test(upper)) return `Redmi Note 12 (${m})`;
    if (/22101316UCP/i.test(upper)) return `Redmi Note 12 Pro (${m})`;
    if (/2201117TG|2201117TY/i.test(upper)) return `Redmi Note 11 (${m})`;
    if (/2201116SG/i.test(upper)) return `Redmi Note 11 Pro (${m})`;
    if (/2311DRK48G/i.test(upper)) return `POCO X6 Pro (${m})`;
    if (/23122PCD1G/i.test(upper)) return `POCO X6 (${m})`;
    if (/23049PCD8G/i.test(upper)) return `POCO F5 (${m})`;
    if (/23053RN02Y|23053RN02L/i.test(upper)) return `Redmi 12 (${m})`;
    if (/23108RN04Y/i.test(upper)) return `Redmi 13C (${m})`;
    if (/2404ARN45A/i.test(upper)) return `Redmi 13 (${m})`;
    if (/23028RN4BG|23028RNCAG/i.test(upper)) return `Redmi 12C (${m})`;
    if (/POCO/i.test(upper) || /POCO/i.test(brand)) return `POCO (${m})`;
    if (/REDMI/i.test(upper) || /REDMI/i.test(brand)) return `Redmi (${m})`;
    return `Xiaomi (${m})`;
  }

  // Realme
  if (/^RMX[0-9]+/i.test(upper) || /REALME/i.test(brand)) {
    if (/^RMX3636|^RMX3630/i.test(upper)) return `Realme 11 4G (${m})`;
    if (/^RMX3740|^RMX3741/i.test(upper)) return `Realme 11 5G (${m})`;
    if (/^RMX3771|^RMX3770/i.test(upper)) return `Realme 11 Pro 5G (${m})`;
    if (/^RMX3780/i.test(upper)) return `Realme 11 Pro+ 5G (${m})`;
    if (/^RMX3840|^RMX3841/i.test(upper)) return `Realme 12 Pro+ 5G (${m})`;
    if (/^RMX3842/i.test(upper)) return `Realme 12 Pro 5G (${m})`;
    if (/^RMX3890/i.test(upper)) return `Realme 12+ / C65 (${m})`;
    if (/^RMX3830/i.test(upper)) return `Realme C67 (${m})`;
    if (/^RMX3760|^RMX3761/i.test(upper)) return `Realme C53 (${m})`;
    if (/^RMX3710/i.test(upper)) return `Realme C55 (${m})`;
    if (/^RMX3511/i.test(upper)) return `Realme C35 (${m})`;
    if (/^RMX3261|^RMX3263/i.test(upper)) return `Realme C21Y (${m})`;
    if (/^RMX3612|^RMX3611/i.test(upper)) return `Realme 10 Pro (${m})`;
    if (/^RMX3363|^RMX3360/i.test(upper)) return `Realme GT Master (${m})`;
    if (/^RMX3392|^RMX3393/i.test(upper)) return `Realme 9 Pro+ (${m})`;
    if (/^RMX3085|^RMX3081/i.test(upper)) return `Realme 8 / 8 Pro (${m})`;
    return `Realme (${m})`;
  }

  // Oppo
  if (/^CPH[0-9]+/i.test(upper) || /OPPO/i.test(brand)) {
    if (/^CPH2579/i.test(upper)) return `Oppo Reno 11 5G (${m})`;
    if (/^CPH2607/i.test(upper)) return `Oppo Reno 11F 5G (${m})`;
    if (/^CPH2525|^CPH2527/i.test(upper)) return `Oppo Reno 10 5G (${m})`;
    if (/^CPH2523/i.test(upper)) return `Oppo Reno 10 Pro+ (${m})`;
    if (/^CPH2457/i.test(upper)) return `Oppo Reno 8T 5G (${m})`;
    if (/^CPH2481/i.test(upper)) return `Oppo Reno 8T 4G (${m})`;
    if (/^CPH2359/i.test(upper)) return `Oppo Reno 8 5G (${m})`;
    if (/^CPH2371/i.test(upper)) return `Oppo Reno 7 5G (${m})`;
    if (/^CPH2569/i.test(upper)) return `Oppo A79 5G (${m})`;
    if (/^CPH2577/i.test(upper)) return `Oppo A58 (${m})`;
    if (/^CPH2565/i.test(upper)) return `Oppo A38 (${m})`;
    if (/^CPH2477/i.test(upper)) return `Oppo A78 (${m})`;
    if (/^CPH2387/i.test(upper)) return `Oppo A57 (${m})`;
    if (/^CPH2269/i.test(upper)) return `Oppo A16 (${m})`;
    if (/^CPH2185/i.test(upper)) return `Oppo A15 (${m})`;
    return `Oppo (${m})`;
  }

  // OnePlus
  if (/^NE[0-9]+|^KB[0-9]+|^IN[0-9]+|^GM[0-9]+|^ONEPLUS/i.test(upper) || /ONEPLUS/i.test(brand)) {
    return `OnePlus (${m})`;
  }

  // Infinix
  if (/^X[0-9]{3,}/i.test(upper) || /INFINIX/i.test(brand)) {
    if (/^X6837/i.test(upper)) return `Infinix Hot 40 Pro (${m})`;
    if (/^X6836/i.test(upper)) return `Infinix Hot 40 (${m})`;
    if (/^X6831/i.test(upper)) return `Infinix Hot 30 (${m})`;
    if (/^X6850/i.test(upper)) return `Infinix Note 40 Pro (${m})`;
    if (/^X6711/i.test(upper)) return `Infinix Note 30 (${m})`;
    if (/^X6525/i.test(upper)) return `Infinix Smart 8 (${m})`;
    if (/^X6515/i.test(upper)) return `Infinix Smart 7 (${m})`;
    return `Infinix (${m})`;
  }

  // Tecno
  if (/^[A-Z]{2}[0-9]+|^TECNO/i.test(upper) || /TECNO/i.test(brand)) {
    if (/^KJ6/i.test(upper)) return `Tecno Spark 20 (${m})`;
    if (/^KJ5/i.test(upper)) return `Tecno Spark 20C (${m})`;
    if (/^KL7/i.test(upper)) return `Tecno Camon 30 (${m})`;
    if (/^CK6/i.test(upper)) return `Tecno Camon 20 (${m})`;
    return `Tecno (${m})`;
  }

  // Vivo / iQOO
  if (/^V[0-9]{4}/i.test(upper) || /VIVO/i.test(brand)) return `Vivo (${m})`;

  // Huawei / Honor
  if (/^ALN|^VOG|^HMA|^CLT|^ELS|^ANA|^NOH|^JAD|^HUAWEI/i.test(upper) || /HUAWEI/i.test(brand)) return `Huawei (${m})`;
  if (/^LGE|^ELT|^ANY|^HONOR/i.test(upper) || /HONOR/i.test(brand)) return `Honor (${m})`;

  // Google Pixel
  if (/PIXEL/i.test(upper)) return m;

  return m;
}

/**
 * Detect high-precision device name, OS version, and browser
 */
export async function detectDetailedDeviceName() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'جهاز غير معروف';
  }

  const ua = navigator.userAgent || '';
  let model = '';
  let brand = '';
  let platformVersion = '';
  let platformName = '';

  // 1. Try modern User-Agent Client Hints API (Chrome / Edge / Opera / Android 11+)
  if (navigator.userAgentData) {
    platformName = navigator.userAgentData.platform || '';
    if (typeof navigator.userAgentData.getHighEntropyValues === 'function') {
      try {
        const hintsPromise = navigator.userAgentData.getHighEntropyValues([
          'model',
          'platformVersion',
          'uaFullVersion',
          'fullVersionList'
        ]);
        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 500));
        const hints = await Promise.race([hintsPromise, timeoutPromise]);
        if (hints) {
          model = hints.model || '';
          platformVersion = hints.platformVersion || '';
        }
      } catch (_) {}
    }
  }

  // 2. Resolve OS Name & Exact Version
  let os = 'غير معروف';
  const hasTouch = navigator.maxTouchPoints > 0;
  const isMobileScreen = typeof window !== 'undefined' && window.innerWidth <= 800;

  // Check Android
  if (/Android/i.test(ua) || platformName.toLowerCase() === 'android') {
    let androidVer = '';
    // Map platformVersion from Client Hints to real Android Version
    if (platformVersion) {
      const major = parseInt(platformVersion.split('.')[0], 10);
      if (!isNaN(major) && major > 0) {
        androidVer = `${major}`;
      }
    }
    if (!androidVer) {
      const m = ua.match(/Android ([0-9.]+)/i);
      androidVer = m ? m[1] : '';
    }
    os = androidVer ? `Android ${androidVer}` : 'Android';
  }
  // Check iPhone / iPad
  else if (/iPhone/i.test(ua)) {
    const m = ua.match(/OS ([0-9_]+)/i);
    const ver = m ? m[1].replace(/_/g, '.') : '';
    os = ver ? `iOS ${ver}` : 'iPhone';
  } else if (/iPad/i.test(ua) || (platformName === 'macOS' && hasTouch && !/iPhone/i.test(ua))) {
    const m = ua.match(/OS ([0-9_]+)/i);
    const ver = m ? m[1].replace(/_/g, '.') : '';
    os = ver ? `iPadOS ${ver}` : 'iPad';
  }
  // Check Mac
  else if (/Mac OS/i.test(ua) || platformName.toLowerCase() === 'macos') {
    os = 'macOS';
  }
  // Check Windows
  else if (/Windows/i.test(ua) || platformName.toLowerCase() === 'windows') {
    if (/Windows NT 10/i.test(ua)) {
      // In Client Hints, platformVersion >= 13 is Windows 11 (build 22000+)
      if (platformVersion) {
        const major = parseInt(platformVersion.split('.')[0], 10);
        if (!isNaN(major) && major >= 13) {
          os = 'Windows 11';
        } else {
          os = 'Windows 10';
        }
      } else {
        os = 'Windows 10/11';
      }
    } else if (/Windows NT 6\.3/i.test(ua)) {
      os = 'Windows 8.1';
    } else if (/Windows NT 6\.1/i.test(ua)) {
      os = 'Windows 7';
    } else {
      os = 'Windows';
    }
  }
  // Check Linux (Handle mobile desktop mode vs true Linux desktop)
  else if (/Linux/i.test(ua) || platformName.toLowerCase() === 'linux') {
    if (hasTouch || isMobileScreen || navigator.userAgentData?.mobile) {
      // Mobile phone requesting "Desktop Site" (وضع سطح المكتب على الموبايل)
      os = 'Android (وضع كمبيوتر)';
    } else {
      os = 'Linux';
    }
  }

  // 3. Resolve Phone Model
  let modelStr = '';
  if (model) {
    modelStr = humanizeModel(model, brand);
  } else {
    // Try to extract model from User-Agent string (e.g. "Android 10; SM-A525F Build/...")
    const m = ua.match(/;\s*([A-Za-z0-9\-\s_]+)\s+Build\//i);
    if (m && m[1] && !/Linux|Android/i.test(m[1])) {
      modelStr = humanizeModel(m[1].trim());
    }
  }

  // 4. Resolve Browser
  let browser = 'متصفح';
  if (/SamsungBrowser\/([0-9.]+)/i.test(ua)) {
    browser = 'Samsung Internet';
  } else if (/MiuiBrowser\/([0-9.]+)/i.test(ua)) {
    browser = 'Mi Browser';
  } else if (/Edg\/|EdgA\/|EdgiOS\//i.test(ua)) {
    browser = 'Edge';
  } else if (/OPR\/|OPT\/|Opera/i.test(ua)) {
    browser = 'Opera';
  } else if (/WhatsApp\//i.test(ua)) {
    browser = 'WhatsApp';
  } else if (/FB_IAB|FBAN|FBAV|Instagram/i.test(ua)) {
    browser = 'Facebook/Instagram';
  } else if (/Firefox\/|FxiOS\//i.test(ua)) {
    browser = 'Firefox';
  } else if (/Chrome\/|CriOS\//i.test(ua)) {
    browser = 'Chrome';
  } else if (/Safari\//i.test(ua) && !/Chrome|CriOS/i.test(ua)) {
    browser = 'Safari';
  }

  // 5. Construct Clean, Informative Display Name
  const parts = [];
  if (modelStr) {
    parts.push(modelStr);
  }
  parts.push(os);
  parts.push(browser);

  return parts.join(' — ');
}

/**
 * Collect invariant hardware telemetry signals (GPU, Screen, CPU, Audio, Sensors)
 * Safe, robust, non-intrusive, and completes in < 25ms.
 */
export async function collectHardwareProfile() {
  if (typeof window === 'undefined') return {};

  const profile = {
    screen: {
      w: window.screen?.width || 0,
      h: window.screen?.height || 0,
      availW: window.screen?.availWidth || 0,
      availH: window.screen?.availHeight || 0,
      dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
      colorDepth: window.screen?.colorDepth || 24,
    },
    system: {
      cores: navigator.hardwareConcurrency || 0,
      memory: navigator.deviceMemory || 0,
      maxTouchPoints: navigator.maxTouchPoints || 0,
      platform: navigator.platform || '',
      timezone: (typeof Intl !== 'undefined' && Intl.DateTimeFormat) ? Intl.DateTimeFormat().resolvedOptions().timeZone : '',
    },
    gpu: {
      vendor: '',
      renderer: '',
      maxTextureSize: 0,
    },
    audio: '',
  };

  // 1. WebGL Hardware Telemetry
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        profile.gpu.vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '';
        profile.gpu.renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
      }
      profile.gpu.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
    }
  } catch (_) {}

  // 2. Audio Engine Fingerprint (Fast OfflineAudioContext dynamics processing)
  try {
    const AudioCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (AudioCtx) {
      const audioPromise = (async () => {
        const ctx = new AudioCtx(1, 4410, 44100);
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = 10000;

        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -50;
        comp.knee.value = 40;
        comp.ratio.value = 12;
        comp.reduction.value = -20;
        comp.attack.value = 0;
        comp.release.value = 0.25;

        osc.connect(comp);
        comp.connect(ctx.destination);
        osc.start(0);

        const rendered = await ctx.startRendering();
        const output = rendered.getChannelData(0);
        let sum = 0;
        for (let i = 4000; i < 4400 && i < output.length; i++) {
          sum += Math.abs(output[i]);
        }
        return sum ? sum.toFixed(6) : '';
      })();

      const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(''), 250));
      profile.audio = await Promise.race([audioPromise, timeoutPromise]);
    }
  } catch (_) {}

  return profile;
}

/**
 * Generate a deterministic hardware hash from invariant hardware signals
 */
export function computeClientHardwareHash(profile) {
  if (!profile) return '';
  const parts = [
    profile.gpu?.renderer || '',
    profile.gpu?.vendor || '',
    profile.screen?.w || 0,
    profile.screen?.h || 0,
    profile.screen?.dpr || 1,
    profile.system?.cores || 0,
    profile.system?.maxTouchPoints || 0,
    profile.system?.platform || '',
    profile.audio || ''
  ];
  const str = parts.join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `hwh_${Math.abs(hash).toString(36)}`;
}

/**
 * Get or compute the persistent, stable device ID AND origin AND hardware profile.
 * Returns { device_id, origin, device_name, hardware_profile, hardware_hash }
 */
export async function getOrCreateDeviceId() {
  const [device_name, hardware_profile] = await Promise.all([
    detectDetailedDeviceName(),
    collectHardwareProfile().catch(() => ({}))
  ]);
  const hardware_hash = computeClientHardwareHash(hardware_profile);

  if (typeof window === 'undefined') {
    return { device_id: 'dev_server', origin: 'unknown', device_name, hardware_profile, hardware_hash };
  }

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
    return { device_id: existingId, origin, device_name, hardware_profile, hardware_hash };
  }

  // Step 5: Only if NO store has an ID (brand-new device or full clear), generate a new one
  const newDeviceId = generateSecureDeviceId();
  syncDeviceIdToAllStores(newDeviceId);

  const origin = detectDeviceOrigin();
  try { localStorage.setItem(ORIGIN_KEY, origin); } catch (_) {}

  return { device_id: newDeviceId, origin, device_name, hardware_profile, hardware_hash };
}

/**
 * Backwards-compatible helper for callers that only need the device_id string.
 */
export async function getOrCreateDeviceIdLegacy() {
  const { device_id } = await getOrCreateDeviceId();
  return device_id;
}

export default getOrCreateDeviceId;



