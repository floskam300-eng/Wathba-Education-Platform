/**
 * pg returns TIMESTAMP WITHOUT TIME ZONE columns as strings without a timezone
 * suffix (e.g. "2026-07-08T17:57:00.000" instead of "2026-07-08T17:57:00.000Z").
 * When the browser parses a date-time string with no offset it treats it as
 * LOCAL time, so dates stored as UTC would be shifted by the user's UTC offset.
 *
 * toUTCDate() normalises the string before constructing a Date so that the
 * value is always interpreted as UTC, regardless of whether the Z suffix is
 * present.
 *
 * NOTE: Do NOT use this for Recitations dates — those are stored as local time
 * (no UTC conversion on submit) so the browser-as-local interpretation is correct.
 */
export function toUTCDate(iso) {
  if (!iso) return null;
  const s = String(iso).replace(' ', 'T');
  // Already has timezone info → use as-is
  const withZ = s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s) ? s : s + 'Z';
  const d = new Date(withZ);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formats a UTC timestamp (from the API) as a local datetime-local input value
 * (YYYY-MM-DDTHH:MM) using the browser's local timezone.
 */
export function fmtDateLocal(iso) {
  const d = toUTCDate(iso);
  if (!d) return '';
  // 'sv' locale gives "YYYY-MM-DD HH:MM:SS" in local time — ideal for datetime-local inputs
  return d.toLocaleString('sv').replace(' ', 'T').slice(0, 16);
}
