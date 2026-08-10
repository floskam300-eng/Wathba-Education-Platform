/**
 * Verification test script for Recitations Schedule & Date Validation Fixes
 */
const assert = require('assert');

// 1. Test date validation helper logic
function validateDates(startDateStr, endDateStr, scheduleType, scheduleDay) {
  let sDate = null;
  let eDate = null;

  if (startDateStr) {
    sDate = new Date(startDateStr);
    if (isNaN(sDate.getTime())) {
      return { valid: false, error: 'تاريخ البداية غير صالح' };
    }
  }

  if (endDateStr) {
    eDate = new Date(endDateStr);
    if (isNaN(eDate.getTime())) {
      return { valid: false, error: 'تاريخ الانتهاء غير صالح' };
    }
    if (eDate.getTime() <= Date.now()) {
      return { valid: false, error: 'تاريخ الانتهاء يجب أن يكون في المستقبل ولا يمكن تحديد موعد قد فات' };
    }
  }

  if (sDate && eDate && eDate <= sDate) {
    return { valid: false, error: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية' };
  }

  const validScheduleTypes = ['once', 'daily', 'weekly'];
  const st = scheduleType || 'once';
  if (!validScheduleTypes.includes(st)) {
    return { valid: false, error: 'نوع الجدولة غير صالح' };
  }

  if (st === 'weekly') {
    const sDay = parseInt(scheduleDay, 10);
    if (isNaN(sDay) || sDay < 0 || sDay > 6) {
      return { valid: false, error: 'يوم الجدولة الأسبوعي غير صالح (يجب أن يكون بين 0 و 6)' };
    }
  }

  return { valid: true };
}

// 2. Test recurring advancement calculation logic
function advanceRecurringWindow(rec, now) {
  const dur = (rec.start_date && rec.end_date)
    ? (new Date(rec.end_date) - new Date(rec.start_date))
    : (rec.schedule_type === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000);
  const stepMs = rec.schedule_type === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  let nextEnd = new Date(rec.end_date);

  while (nextEnd <= now) {
    nextEnd = new Date(nextEnd.getTime() + stepMs);
  }
  const newEnd = nextEnd;
  const newStart = new Date(newEnd.getTime() - dur);
  return { newStart, newEnd };
}

// 3. Test timezone independent UTC parser
function toUTCDate(iso) {
  if (!iso) return null;
  const s = String(iso).trim();
  const d = new Date(s.endsWith('Z') || /[+-]\d{2}(:\d{2})?$/.test(s) ? s : s + 'Z');
  return isNaN(d.getTime()) ? null : d;
}

function runTests() {
  console.log('--- Starting Recitations Date Validation & Schedule Tests ---');

  // Test 1: Past end_date rejection
  const pastDate = new Date(Date.now() - 3600000).toISOString();
  const futureDate = new Date(Date.now() + 86400000).toISOString();
  const futureDateLater = new Date(Date.now() + 172800000).toISOString();

  const r1 = validateDates(null, pastDate, 'once', 0);
  assert.strictEqual(r1.valid, false, 'Should reject past end_date');
  assert.ok(r1.error.includes('في المستقبل'), 'Error should mention future requirement');
  console.log('✔ Test 1 passed: Past end_date is rejected.');

  // Test 2: end_date <= start_date rejection
  const r2 = validateDates(futureDateLater, futureDate, 'once', 0);
  assert.strictEqual(r2.valid, false, 'Should reject end_date <= start_date');
  assert.ok(r2.error.includes('بعد تاريخ البداية'), 'Error should mention end after start');
  console.log('✔ Test 2 passed: end_date <= start_date is rejected.');

  // Test 3: Invalid schedule type and weekly day
  const r3 = validateDates(futureDate, futureDateLater, 'invalid_type', 0);
  assert.strictEqual(r3.valid, false, 'Should reject invalid schedule_type');

  const r4 = validateDates(futureDate, futureDateLater, 'weekly', 9);
  assert.strictEqual(r4.valid, false, 'Should reject weekly schedule_day > 6');
  console.log('✔ Test 3 passed: Invalid schedule_type and schedule_day are rejected.');

  // Test 4: Valid future dates pass
  const r5 = validateDates(futureDate, futureDateLater, 'weekly', 3);
  assert.strictEqual(r5.valid, true, 'Valid schedule config should pass');
  console.log('✔ Test 4 passed: Valid dates and schedule configuration are accepted.');

  // Test 5: Recurring window advancement
  const now = new Date();
  const oldEnd = new Date(now.getTime() - 48 * 3600000); // 2 days ago
  const oldStart = new Date(oldEnd.getTime() - 2 * 3600000); // 2 hours window
  const recDaily = {
    schedule_type: 'daily',
    start_date: oldStart.toISOString(),
    end_date: oldEnd.toISOString()
  };
  const { newStart, newEnd } = advanceRecurringWindow(recDaily, now);
  assert.ok(newEnd > now, 'New end date must be in the future');
  assert.strictEqual(newEnd - newStart, 2 * 3600000, 'Window duration must be preserved');
  console.log('✔ Test 5 passed: Recurring window cleanly advances to future and preserves duration.');

  // Test 6: UTC date parsing without offset shift
  const postgresTzString = '2026-08-15 14:30:00+00';
  const parsed = toUTCDate(postgresTzString);
  assert.strictEqual(parsed.getUTCFullYear(), 2026);
  assert.strictEqual(parsed.getUTCMonth(), 7); // 0-indexed August
  assert.strictEqual(parsed.getUTCDate(), 15);
  assert.strictEqual(parsed.getUTCHours(), 14);
  assert.strictEqual(parsed.getUTCMinutes(), 30);
  console.log('✔ Test 6 passed: toUTCDate parses PostgreSQL timestamptz accurately.');

  console.log('\nAll 6 verification tests passed successfully! 🚀');
}

runTests();
