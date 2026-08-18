/**
 * Format a duration for display in the archive UI.
 *
 * Behavior:
 *  - If the attempt is incomplete (no end_time / no time_minutes) → "لم يكتمل"
 *  - If both start and end are provided and the duration is < 1 minute → seconds
 *  - Otherwise → decimal minutes (e.g. "12.5 دقيقة"), rounded to 1 decimal place
 *
 * @param {object|null|undefined} row The result row that may carry start_time, end_time, time_minutes
 * @returns {string} A localized, ready-to-display duration string in Arabic
 */
export function formatDuration(row) {
  if (!row) return '—';
  if (!row.end_time) return 'لم يكتمل';

  if (row.time_minutes !== undefined && row.time_minutes !== null) {
    const m = Number(row.time_minutes);
    if (isNaN(m)) return 'لم يكتمل';
    if (m > 0 && m < 1) {
      const seconds = Math.round(m * 60);
      return `${seconds} ثانية`;
    }
    return `${m.toFixed(1)} دقيقة`;
  }

  if (!row.start_time) return 'لم يكتمل';
  const start = new Date(row.start_time).getTime();
  const end = new Date(row.end_time).getTime();
  if (isNaN(start) || isNaN(end) || end <= start) return 'لم يكتمل';
  const totalSeconds = Math.round((end - start) / 1000);
  if (totalSeconds < 60) return `${totalSeconds} ثانية`;
  const minutes = Math.round((totalSeconds / 60) * 10) / 10;
  return `${minutes.toFixed(1)} دقيقة`;
}