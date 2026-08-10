/**
 * Verification test script for Exams Schedule & Date Validation Fixes
 */
const assert = require('assert');

// 1. Test date validation helper logic for exams
function validateExamDates(startDateStr, endDateStr, durationMinutes) {
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

  if (sDate && eDate) {
    if (eDate <= sDate) {
      return { valid: false, error: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية' };
    }
    const diffMin = (eDate - sDate) / 60000;
    const dur = parseInt(durationMinutes || 60, 10);
    if (diffMin < dur) {
      return { valid: false, error: `الفترة بين البداية والنهاية (${Math.round(diffMin)} دقيقة) أقل من مدة الاختبار (${dur} دقيقة)` };
    }
  }

  return { valid: true };
}

// 2. Test timezone independent UTC parser
function toUTCDate(iso) {
  if (!iso) return null;
  const s = String(iso).trim();
  const d = new Date(s.endsWith('Z') || /[+-]\d{2}(:\d{2})?$/.test(s) ? s : s + 'Z');
  return isNaN(d.getTime()) ? null : d;
}

// 3. Test exam status calculation
function getExamScheduleStatus(ex, now = new Date()) {
  if (ex.start_date && toUTCDate(ex.start_date) > now) return 'upcoming';
  if (ex.end_date && toUTCDate(ex.end_date) < now) return 'expired';
  return 'open';
}

function runTests() {
  console.log('--- Starting Exams Date Validation & Schedule Tests ---');

  // Test 1: Past end_date rejection
  const pastDate = new Date(Date.now() - 3600000).toISOString();
  const futureDate = new Date(Date.now() + 3600000).toISOString();
  const futureDateLater = new Date(Date.now() + 7200000).toISOString(); // 2 hours later

  const r1 = validateExamDates(null, pastDate, 60);
  assert.strictEqual(r1.valid, false, 'Should reject past end_date');
  assert.ok(r1.error.includes('في المستقبل'), 'Error should mention future requirement');
  console.log('✔ Test 1 passed: Past end_date is rejected.');

  // Test 2: end_date <= start_date rejection
  const r2 = validateExamDates(futureDateLater, futureDate, 60);
  assert.strictEqual(r2.valid, false, 'Should reject end_date <= start_date');
  assert.ok(r2.error.includes('بعد تاريخ البداية'), 'Error should mention end after start');
  console.log('✔ Test 2 passed: end_date <= start_date is rejected.');

  // Test 3: Duration mismatch rejection
  // 30 min window with 60 min exam duration
  const shortEnd = new Date(new Date(futureDate).getTime() + 30 * 60000).toISOString();
  const r3 = validateExamDates(futureDate, shortEnd, 60);
  assert.strictEqual(r3.valid, false, 'Should reject window smaller than duration');
  assert.ok(r3.error.includes('أقل من مدة الاختبار'), 'Error should mention duration mismatch');
  console.log('✔ Test 3 passed: Window shorter than exam duration is rejected.');

  // Test 4: Valid future dates pass
  const r4 = validateExamDates(futureDate, futureDateLater, 60);
  assert.strictEqual(r4.valid, true, 'Valid dates should pass');
  console.log('✔ Test 4 passed: Valid dates with sufficient duration are accepted.');

  // Test 5: Exam status transition logic
  const now = new Date();
  const upcomingExam = { start_date: new Date(now.getTime() + 600000).toISOString(), end_date: new Date(now.getTime() + 3600000).toISOString() };
  const openExam = { start_date: new Date(now.getTime() - 600000).toISOString(), end_date: new Date(now.getTime() + 3600000).toISOString() };
  const expiredExam = { start_date: new Date(now.getTime() - 7200000).toISOString(), end_date: new Date(now.getTime() - 3600000).toISOString() };

  assert.strictEqual(getExamScheduleStatus(upcomingExam, now), 'upcoming');
  assert.strictEqual(getExamScheduleStatus(openExam, now), 'open');
  assert.strictEqual(getExamScheduleStatus(expiredExam, now), 'expired');
  console.log('✔ Test 5 passed: Exam schedule statuses (upcoming, open, expired) evaluate accurately.');

  // Test 6: UTC date parsing
  const postgresExamTz = '2026-09-01 10:00:00+00';
  const parsed = toUTCDate(postgresExamTz);
  assert.strictEqual(parsed.getUTCFullYear(), 2026);
  assert.strictEqual(parsed.getUTCMonth(), 8); // September
  assert.strictEqual(parsed.getUTCDate(), 1);
  assert.strictEqual(parsed.getUTCHours(), 10);
  console.log('✔ Test 6 passed: toUTCDate parses exam timestamps accurately.');

  console.log('\nAll 6 verification tests passed successfully! 🚀');
}

runTests();
