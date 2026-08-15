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
 * Formats a UTC timestamp as a local datetime-local input value (YYYY-MM-DDTHH:MM)
 * specifically in Egypt timezone (Africa/Cairo), regardless of device timezone.
 */
export function fmtDateLocal(iso) {
  const d = toUTCDate(iso);
  if (!d) return '';
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

export const fmtEgyptDateTimeLocal = fmtDateLocal;

/**
 * Parses a YYYY-MM-DDTHH:MM datetime-local string (entered by user in Egypt timezone)
 * into an absolute UTC ISO string (e.g. 2026-08-15T15:00:00.000Z).
 */
export function parseEgyptDateTimeToUTC(egyptStr) {
  if (!egyptStr) return null;
  const clean = String(egyptStr).trim().replace(' ', 'T');
  const [datePart, timePart] = clean.split('T');
  if (!datePart || !timePart) return null;
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d) || isNaN(hh) || isNaN(mm)) return null;

  let utcGuess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  for (let i = 0; i < 3; i++) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(utcGuess);
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    const hourVal = +map.hour === 24 ? 0 : +map.hour;
    const cairoDate = new Date(Date.UTC(+map.year, +map.month - 1, +map.day, hourVal, +map.minute, +map.second));
    const targetDate = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
    const diffMs = targetDate.getTime() - cairoDate.getTime();
    if (diffMs === 0) break;
    utcGuess = new Date(utcGuess.getTime() + diffMs);
  }
  return utcGuess.toISOString();
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

