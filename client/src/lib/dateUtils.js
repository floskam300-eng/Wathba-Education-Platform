// Global offset between client clock and server clock in milliseconds
let _serverTimeOffsetMs = 0;

/**
 * Synchronize client time with server time using the server's Date header or ISO string.
 */
export function syncServerTime(serverDate) {
  if (!serverDate) return;
  try {
    const serverTs = new Date(serverDate).getTime();
    if (!isNaN(serverTs)) {
      _serverTimeOffsetMs = serverTs - Date.now();
    }
  } catch (_) {}
}

/**
 * Returns the authoritative current Date based on the synchronized server clock.
 * Eliminates all device clock skews and wrong local time settings.
 */
export function getServerNow() {
  return new Date(Date.now() + _serverTimeOffsetMs);
}

/**
 * Returns current timestamp in ms based on synchronized server clock.
 */
export function getServerNowMs() {
  return Date.now() + _serverTimeOffsetMs;
}

/**
 * Normalises date string so that it is always interpreted as UTC.
 */
export function toUTCDate(iso) {
  if (!iso) return null;
  const s = String(iso).replace(' ', 'T');
  const withZ = s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s) ? s : s + 'Z';
  const d = new Date(withZ);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formats a UTC timestamp as a local datetime-local input value (YYYY-MM-DDTHH:MM).
 */
export function fmtDateLocal(iso) {
  const d = toUTCDate(iso);
  if (!d) return '';
  return d.toLocaleString('sv').replace(' ', 'T').slice(0, 16);
}

/**
 * Formats a UTC timestamp specifically in Egypt timezone (Africa/Cairo).
 */
export function formatEgyptDateTime(iso, options = {}) {
  const d = toUTCDate(iso);
  if (!d) return '';
  const defaultOpts = {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  };
  return d.toLocaleString('ar-EG', { ...defaultOpts, ...options });
}

