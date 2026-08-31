'use strict';

/**
 * Wathba Platform — Egypt Timezone (Africa/Cairo) Utilities
 * Handles Egypt Daylight Saving Time (DST, UTC+3) and Standard Time (UTC+2) seamlessly.
 */

function formatEgyptDateTime(dateInput, options = {}) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return null;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...options
  });

  const parts = formatter.formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = +map.hour === 24 ? '00' : map.hour;
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}`;
}

function parseEgyptDateTimeToUTC(egyptStr) {
  if (!egyptStr) return null;
  // If already an ISO string with Z or offset, parse directly
  if (typeof egyptStr === 'string' && (egyptStr.endsWith('Z') || egyptStr.includes('+') || (egyptStr.lastIndexOf('-') > 10))) {
    const d = new Date(egyptStr);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  const clean = String(egyptStr).trim().replace(' ', 'T');
  const [datePart, timePart = '00:00:00'] = clean.split('T');
  if (!datePart) return null;
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh = 0, mm = 0, ss = 0] = timePart.split(':').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d) || isNaN(hh) || isNaN(mm)) return null;

  let utcGuess = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
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
    const targetDate = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
    const diffMs = targetDate.getTime() - cairoDate.getTime();
    if (diffMs === 0) break;
    utcGuess = new Date(utcGuess.getTime() + diffMs);
  }
  return utcGuess.toISOString();
}

/**
 * Returns UTC Date object corresponding to 00:00:00.000 Cairo time of the day of `date`.
 */
function getCairoStartOfDay(dateInput = new Date()) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const cairoDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(date);
  const utcIso = parseEgyptDateTimeToUTC(`${cairoDateStr}T00:00:00`);
  return new Date(utcIso);
}

/**
 * Returns UTC Date object corresponding to Monday 00:00:00.000 Cairo time of the week of `date`.
 */
function getCairoStartOfWeek(dateInput = new Date()) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const cairoDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(date);
  const [y, m, d] = cairoDateStr.split('-').map(Number);
  const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  // Monday is 1, Sunday is 0. If Sunday, go back 6 days. Else go back (dayOfWeek - 1) days.
  const diffDays = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const mondayDate = new Date(Date.UTC(y, m - 1, d + diffDays));
  const mondayStr = mondayDate.toISOString().slice(0, 10);
  const utcIso = parseEgyptDateTimeToUTC(`${mondayStr}T00:00:00`);
  return new Date(utcIso);
}

/**
 * Returns UTC Date object corresponding to 1st day 00:00:00.000 Cairo time of the month of `date`.
 */
function getCairoStartOfMonth(dateInput = new Date()) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const cairoDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(date);
  const [y, m] = cairoDateStr.split('-').map(Number);
  const mStr = String(m).padStart(2, '0');
  const utcIso = parseEgyptDateTimeToUTC(`${y}-${mStr}-01T00:00:00`);
  return new Date(utcIso);
}

/**
 * Returns the exact UTC Date reset boundary for a given reset frequency.
 */
function getPeriodStart(freq, now = new Date()) {
  if (freq === 'unlimited' || freq === 'none') {
    return new Date(0); // Epoch 1970
  }
  if (freq === 'daily') {
    return getCairoStartOfDay(now);
  }
  if (freq === 'monthly') {
    return getCairoStartOfMonth(now);
  }
  // Default: weekly
  return getCairoStartOfWeek(now);
}

module.exports = {
  formatEgyptDateTime,
  parseEgyptDateTimeToUTC,
  getCairoStartOfDay,
  getCairoStartOfWeek,
  getCairoStartOfMonth,
  getPeriodStart
};
