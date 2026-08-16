const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('Full Platform Timezone & Recitation Audit Suite', () => {

  it('Recitation elapsed time calculation handles UTC and ISO strings without skew', () => {
    const serverNow = new Date('2026-08-16T02:00:00.000Z');
    
    // Simulate DB returning started_at as ISO string with Z
    const startedAtIso = '2026-08-16T01:55:00.000Z'; // 5 minutes ago
    const startedAtStr = typeof startedAtIso === 'string'
      ? (startedAtIso.endsWith('Z') || startedAtIso.includes('+') ? startedAtIso : `${startedAtIso.replace(' ', 'T')}Z`)
      : new Date(startedAtIso).toISOString();
    const sessStartedAt = new Date(startedAtStr).getTime();
    const elapsedMs = Math.max(0, serverNow.getTime() - sessStartedAt);
    
    assert.strictEqual(elapsedMs, 5 * 60 * 1000); // exactly 5 minutes
    
    const durationMinutes = 10;
    const remainingSeconds = Math.max(0, Math.floor(((durationMinutes * 60 * 1000) - elapsedMs) / 1000));
    assert.strictEqual(remainingSeconds, 300); // 5 minutes remaining
  });

  it('Recitation elapsed time safely handles legacy DB string without trailing Z', () => {
    const serverNow = new Date('2026-08-16T02:00:00.000Z');
    
    // Simulate legacy DB driver returning started_at without Z e.g. "2026-08-16 01:55:00"
    const legacyStr = '2026-08-16 01:55:00';
    const startedAtStr = typeof legacyStr === 'string'
      ? (legacyStr.endsWith('Z') || legacyStr.includes('+') ? legacyStr : `${legacyStr.replace(' ', 'T')}Z`)
      : new Date(legacyStr).toISOString();
    const sessStartedAt = new Date(startedAtStr).getTime();
    const elapsedMs = Math.max(0, serverNow.getTime() - sessStartedAt);
    
    assert.strictEqual(elapsedMs, 5 * 60 * 1000); // 5 minutes elapsed
  });

  it('Attendance validation compares against Egypt calendar date (Africa/Cairo)', () => {
    // Current UTC time 2026-08-15 22:30:00 UTC = 2026-08-16 01:30:00 Egypt time (UTC+3)
    const testNow = new Date('2026-08-15T22:30:00.000Z');
    
    const nowEgyptStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(testNow);
    assert.strictEqual(nowEgyptStr, '2026-08-16');

    // Teacher submitting attendance on 2026-08-16 at 1:30 AM should be VALID
    const dateInput = '2026-08-16';
    const isFuture = dateInput > nowEgyptStr;
    assert.strictEqual(isFuture, false); // Not future!

    // Teacher submitting for tomorrow (2026-08-17) should be REJECTED
    const tomorrowInput = '2026-08-17';
    const isTomorrowFuture = tomorrowInput > nowEgyptStr;
    assert.strictEqual(isTomorrowFuture, true); // Rejected!
  });

  it('Weekly run getWeekStart accurately computes Monday 00:00:00 Cairo time', () => {
    const getWeekStart = (testDate) => {
      const now = testDate || new Date();
      const cairoDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(now);
      const [y, m, d] = cairoDateStr.split('-').map(Number);

      const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      const diffDays = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

      const targetMondayDate = new Date(Date.UTC(y, m - 1, d + diffDays));
      const mondayY = targetMondayDate.getUTCFullYear();
      const mondayM = targetMondayDate.getUTCMonth();
      const mondayD = targetMondayDate.getUTCDate();

      let utcGuess = new Date(Date.UTC(mondayY, mondayM, mondayD, 0, 0, 0));
      for (let i = 0; i < 3; i++) {
        const formatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Africa/Cairo',
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: false,
        });
        const parts = formatter.formatToParts(utcGuess);
        const map = {};
        for (const p of parts) map[p.type] = p.value;
        const hourVal = +map.hour === 24 ? 0 : +map.hour;
        const cairoDate = new Date(Date.UTC(+map.year, +map.month - 1, +map.day, hourVal, +map.minute, +map.second));
        const targetDate = new Date(Date.UTC(mondayY, mondayM, mondayD, 0, 0, 0));
        const diffMs = targetDate.getTime() - cairoDate.getTime();
        if (diffMs === 0) break;
        utcGuess = new Date(utcGuess.getTime() + diffMs);
      }
      return utcGuess;
    };

    // If student plays on Monday August 17, 2026 at 01:00 AM Cairo (Sunday August 16, 22:00 UTC):
    const mondayNightCairo = new Date('2026-08-16T22:00:00.000Z');
    const weekStart = getWeekStart(mondayNightCairo);

    // Cairo week start for Monday August 17 is Sunday August 16, 21:00 UTC (since Cairo is UTC+3)
    assert.strictEqual(weekStart.toISOString(), '2026-08-16T21:00:00.000Z');
    // And student's play time (22:00 UTC) is >= weekStart (21:00 UTC)!
    assert.ok(mondayNightCairo.getTime() >= weekStart.getTime());
  });

});
