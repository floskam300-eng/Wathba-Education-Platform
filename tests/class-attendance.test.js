/**
 * Wathba — Class Attendance (الحضور والغياب اليومي): E2E Test Suite
 * ==================================================================
 * يغطي هذا الملف منظومة الحضور والغياب اليومي بالكامل:
 *   - إدارة المواد الدراسية (إضافة / تعديل / حذف مع cascade)
 *   - تسجيل الحضور اليومي + الدرجات (bulk upsert)
 *   - التحقق من صحة المدخلات (تاريخ مستقبلي، درجة أكبر من الكلية، صيغ خاطئة)
 *   - عزل الصلاحيات (401 بدون توكن، 403 لمادة معلم آخر)
 *   - التحليلات والتقويم
 *   - ظهور البيانات في بوابة ولي الأمر (parent-lookup)
 *
 * التشغيل:
 *   npm run test:attendance        (أو: node tests/class-attendance.test.js)
 *
 * المتطلبات:
 *   1. خادم Express يعمل على PORT (افتراضياً 3001)
 *   2. حساب معلم صالح — افتراضياً admin/admin123 (seed.js)
 *      متغيرات البيئة الاختيارية:
 *        TEACHER_USER, TEACHER_PASS, TENANT_SLUG, WILDCARD_DOMAIN
 *
 * ملاحظة تنظيف: الاختبارات تنشئ مادة اختبار مؤقتة وتحذفها في النهاية؛
 * سجلات الحضور المرتبطة بها تُحذف تلقائياً عبر ON DELETE CASCADE.
 */

'use strict';

const http = require('http');

/* ══════════════════════════════════════════════════════════════════
   CONFIGURATION
══════════════════════════════════════════════════════════════════ */
const PORT            = parseInt(process.env.PORT || '3001', 10);
const HOSTNAME        = process.env.TEST_HOST || 'localhost';
const TEACHER_USER    = process.env.TEACHER_USER || 'admin';
const TEACHER_PASS    = process.env.TEACHER_PASS || 'admin123';
const TENANT_SLUG     = process.env.TENANT_SLUG  || 'demo';
const WILDCARD_DOMAIN = process.env.WILDCARD_DOMAIN || 'wathba.site';
const TIMEOUT         = 8000;

let passed  = 0;
let failed  = 0;
let skipped = 0;
const failures = [];

/* ══════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════ */
function assert(condition, label, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    failures.push({ label, detail });
    console.error(`  ❌ ${label}${detail ? ': ' + detail : ''}`);
  }
}

function skip(label) {
  skipped++;
  console.log(`  ⏭️  [SKIP] ${label}`);
}

/** Today's date in Africa/Cairo as YYYY-MM-DD (mirrors server validation). */
function cairoDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d);
}

/**
 * API request against the local server.
 * `hostHeader` overrides the Host header — needed for tenant subdomain
 * resolution (parent-lookup) since NODE_ENV=production ignores X-Tenant-Slug.
 */
function request({ method = 'GET', path, body, token, hostHeader }) {
  return new Promise((resolve, reject) => {
    const strBody = body ? JSON.stringify(body) : null;
    const opts = {
      hostname : HOSTNAME,
      port     : PORT,
      path,
      method,
      headers  : {
        'Content-Type': 'application/json',
        ...(hostHeader ? { Host: hostHeader } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    if (strBody) opts.headers['Content-Length'] = Buffer.byteLength(strBody);
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    const timer = setTimeout(() => { req.destroy(); reject(new Error('Timeout')); }, TIMEOUT);
    req.on('close', () => clearTimeout(timer));
    if (strBody) req.write(strBody);
    req.end();
  });
}

/* ══════════════════════════════════════════════════════════════════
   TEST SECTIONS
══════════════════════════════════════════════════════════════════ */

async function loginTeacher() {
  console.log('\n── [0] Teacher Login ─────────────────────────────────────────');
  const r = await request({
    method: 'POST',
    path  : '/api/auth/login',
    body  : { username: TEACHER_USER, password: TEACHER_PASS },
  });
  assert(r.status === 200 && r.body.token, 'teacher login succeeds');
  if (r.status !== 200) throw new Error(`Login failed (${r.status}): ${JSON.stringify(r.body)}`);
  assert(r.body.user?.role === 'teacher', 'login role is teacher');
  return r.body.token;
}

async function testAuthGuards() {
  console.log('\n── [A] Auth Guards ───────────────────────────────────────────');
  const r1 = await request({ path: '/api/attendance/subjects' });
  assert(r1.status === 401, 'GET /subjects without token → 401', `got ${r1.status}`);
  const r2 = await request({
    method: 'POST',
    path  : '/api/attendance/records/bulk',
    body  : { date: cairoDate(), subject_id: 1, records: [] },
  });
  assert(r2.status === 401, 'POST /records/bulk without token → 401', `got ${r2.status}`);
}

async function testSubjectCrud(token) {
  console.log('\n── [B] Subject CRUD ──────────────────────────────────────────');
  const uniq = Date.now();
  const name = `مادة اختبار آلي ${uniq}`;

  // Empty name rejected
  const bad = await request({
    method: 'POST',
    path  : '/api/attendance/subjects',
    token,
    body  : { name: '   ' },
  });
  assert(bad.status === 400, 'create subject with empty name → 400', `got ${bad.status}`);

  // Create
  const created = await request({
    method: 'POST',
    path  : '/api/attendance/subjects',
    token,
    body  : { name, academic_stage: null },
  });
  assert(created.status === 201 && created.body.id, 'create subject → 201 with id', `got ${created.status}`);
  const subjectId = created.body.id;

  // Listed
  const list = await request({ path: '/api/attendance/subjects', token });
  assert(
    Array.isArray(list.body) && list.body.some((s) => s.id === subjectId),
    'created subject appears in list'
  );

  // Rename + set stage
  const renamed = await request({
    method: 'PUT',
    path  : `/api/attendance/subjects/${subjectId}`,
    token,
    body  : { name: `${name} معدلة`, academic_stage: null },
  });
  assert(renamed.status === 200 && renamed.body.name.endsWith('معدلة'), 'rename subject succeeds');

  // Foreign/nonexistent subject → 404
  const nf = await request({
    method: 'PUT',
    path  : '/api/attendance/subjects/999999999',
    token,
    body  : { name: 'x' },
  });
  assert(nf.status === 404, 'update nonexistent subject → 404', `got ${nf.status}`);

  return { subjectId, name: `${name} معدلة` };
}

async function testValidation(token, subjectId, students) {
  console.log('\n── [C] Validation ────────────────────────────────────────────');
  const sid = students[0].id;
  const cases = [
    ['missing fields',        { subject_id: subjectId }, 400],
    ['bad date format',       { date: '23/08/2026', subject_id: subjectId, records: [{ student_id: sid, status: 'present' }] }, 400],
    ['future date',           { date: cairoDate(+2), subject_id: subjectId, records: [{ student_id: sid, status: 'present' }] }, 400],
    ['grade > total',         { date: cairoDate(), subject_id: subjectId, exam_total: 10, records: [{ student_id: sid, status: 'present', exam_score: 15 }] }, 400],
    ['negative grade',        { date: cairoDate(), subject_id: subjectId, records: [{ student_id: sid, status: 'present', exam_score: -3 }] }, 400],
    ['negative decimal grade',{ date: cairoDate(), subject_id: subjectId, records: [{ student_id: sid, status: 'present', exam_score: -3.5 }] }, 400],
    ['invalid student id',    { date: cairoDate(), subject_id: subjectId, records: [{ student_id: 999999999, status: 'present' }] }, 400],
    ['duplicate student ids', { date: cairoDate(), subject_id: subjectId, records: [{ student_id: sid, status: 'present' }, { student_id: sid, status: 'absent' }] }, 400],
  ];
  for (const [label, body, expect] of cases) {
    const r = await request({ method: 'POST', path: '/api/attendance/records/bulk', token, body });
    assert(r.status === expect, `${label} → ${expect}`, `got ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
  }

  // Day-sheet requires params
  const r = await request({ path: '/api/attendance/records', token });
  assert(r.status === 400, 'GET /records without params → 400', `got ${r.status}`);
  const r2 = await request({ path: `/api/attendance/records?date=${cairoDate()}&subject_id=999999999`, token });
  assert(r2.status === 404, 'GET /records foreign subject → 404', `got ${r2.status}`);
}

async function testBulkSaveAndUpsert(token, subjectId, students) {
  console.log('\n── [D] Bulk Save & Upsert ────────────────────────────────────');
  const today = cairoDate();
  const [a, b] = students;

  // Initial save: a present 8/10, b absent
  const save1 = await request({
    method: 'POST',
    path  : '/api/attendance/records/bulk',
    token,
    body  : {
      date: today,
      subject_id: subjectId,
      exam_total: 10,
      records: [
        { student_id: a.id, status: 'present', exam_score: '8' },
        { student_id: b.id, status: 'absent',  exam_score: null },
      ],
    },
  });
  assert(save1.status === 200 && save1.body.saved === 2, 'bulk save returns saved=2');

  let day = await request({ path: `/api/attendance/records?date=${today}&subject_id=${subjectId}`, token });
  const rowA = day.body.students.find((s) => s.id === a.id);
  const rowB = day.body.students.find((s) => s.id === b.id);
  assert(day.body.exam_total === 10, 'exam_total persisted as 10');
  assert(rowA.status === 'present' && Number(rowA.exam_score) === 8, 'student A present with grade 8');
  assert(rowB.status === 'absent' && (rowB.exam_score === null || rowB.exam_score === undefined), 'student B absent without grade');

  // Edit: flip both — use decimal grades to cover NUMERIC(6,2) support
  const save2 = await request({
    method: 'POST',
    path  : '/api/attendance/records/bulk',
    token,
    body  : {
      date: today,
      subject_id: subjectId,
      exam_total: 20,
      records: [
        { student_id: a.id, status: 'absent',   exam_score: null },
        { student_id: b.id, status: 'present', exam_score: '13.75' },
      ],
    },
  });
  assert(save2.status === 200 && save2.body.saved === 2, 'second save (edit) succeeds');

  day = await request({ path: `/api/attendance/records?date=${today}&subject_id=${subjectId}`, token });
  const updA = day.body.students.find((s) => s.id === a.id);
  const updB = day.body.students.find((s) => s.id === b.id);
  assert(updA.status === 'absent', 'student A updated to absent (upsert)');
  assert(updB.status === 'present' && Number(updB.exam_score) === 13.75, 'student B decimal grade 13.75 persisted (upsert)', `got ${updB.exam_score}`);
  const idCounts = {};
  for (const s of day.body.students) idCounts[s.id] = (idCounts[s.id] || 0) + 1;
  assert(
    (idCounts[a.id] || 0) === 1 && (idCounts[b.id] || 0) === 1,
    'each saved student appears exactly once (no duplicates)'
  );

  return { today, grades: { [a.id]: [8, null], [b.id]: [null, 13.75] } };
}

async function testCalendarAnalytics(token, subjectId, students, ctx) {
  console.log('\n── [E] Calendar & Analytics ──────────────────────────────────');
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;

  const cal = await request({ path: `/api/attendance/calendar?subject_id=${subjectId}&year=${y}&month=${m}`, token });
  assert(cal.status === 200 && Array.isArray(cal.body) && cal.body.includes(ctx.today), 'calendar marks saved date', JSON.stringify(cal.body));

  const badCal = await request({ path: `/api/attendance/calendar?subject_id=${subjectId}&year=${y}&month=13`, token });
  assert(badCal.status === 400, 'calendar invalid month → 400', `got ${badCal.status}`);

  const analytics = await request({ path: `/api/attendance/analytics?subject_id=${subjectId}`, token });
  assert(analytics.status === 200 && Array.isArray(analytics.body), 'analytics returns rows');
  const [a, b] = students;
  const rowA = analytics.body.find((r) => r.id === a.id);
  const rowB = analytics.body.find((r) => r.id === b.id);
  if (rowA && rowB) {
    assert(parseInt(rowA.total_sessions) >= 1 && parseInt(rowA.present_count) + parseInt(rowA.absent_count) === parseInt(rowA.total_sessions), 'analytics A: present+absent = total');
    assert(parseInt(rowB.present_count) >= 1 && parseFloat(rowB.avg_exam_score) === 13.75, 'analytics B avg score = 13.75', `got ${rowB.avg_exam_score}`);
  } else {
    skip('analytics rows for test students not found');
  }
}

async function testParentPortal(subjectName) {
  console.log('\n── [F] Parent Portal (parent-lookup) ─────────────────────────');
  // Find a student whose parent_phone is known & has a record under subject 1 (demo sample data).
  const info = await request({
    path  : '/api/public/info',
    hostHeader: `${TENANT_SLUG}.${WILDCARD_DOMAIN}`,
  });
  assert(info.status === 200 && info.body.teacher?.id, 'public info resolves tenant via Host header', `got ${info.status}`);

  // Use the demo sample-data phone (seeded demo students std_hana/std_hassan parents).
  const phone = process.env.TEST_PARENT_PHONE || '+201200000034'; // parent of student 86 (هناء)
  const lookup = await request({
    path  : `/api/public/parent-lookup?phone=${encodeURIComponent(phone)}`,
    hostHeader: `${TENANT_SLUG}.${WILDCARD_DOMAIN}`,
  });

  if (lookup.status === 404) {
    skip(`parent-lookup: no student for phone ${phone} (run seed.js)`);
    return;
  }
  assert(lookup.status === 200, 'parent-lookup by phone → 200', `got ${lookup.status} ${JSON.stringify(lookup.body).slice(0, 80)}`);
  assert(lookup.body.attendance_enabled === true, 'attendance_enabled true on demo tenant');
  assert(Array.isArray(lookup.body.class_attendance), 'class_attendance array present');

  const rec = lookup.body.class_attendance?.[0];
  if (rec) {
    assert(typeof rec.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rec.date), 'record has YYYY-MM-DD date');
    assert(['present', 'absent'].includes(rec.status), 'record status valid');
    assert(typeof rec.subject_name === 'string' && rec.subject_name.length > 0, 'record has subject name');
    const graded = lookup.body.class_attendance.filter((x) => x.exam_score !== null && x.exam_score !== undefined);
    if (graded.length > 0) {
      assert(graded.every((x) => x.exam_total === null || Number(x.exam_score) <= x.exam_total), 'grades never exceed totals');
    } else {
      skip('no graded attendance records yet for this student');
    }
  } else {
    skip('no class_attendance rows yet for this student');
  }

  // Unknown phone → 404
  const miss = await request({
    path  : '/api/public/parent-lookup?phone=%2B2999999999999',
    hostHeader: `${TENANT_SLUG}.${WILDCARD_DOMAIN}`,
  });
  assert(miss.status === 404, 'parent-lookup unknown phone → 404', `got ${miss.status}`);
}

async function testCascadeDelete(token, subjectId) {
  console.log('\n── [G] Cascade Delete ────────────────────────────────────────');
  const del = await request({
    method: 'DELETE',
    path  : `/api/attendance/subjects/${subjectId}`,
    token,
  });
  assert(del.status === 200, 'delete subject → 200');

  const list = await request({ path: '/api/attendance/subjects', token });
  assert(!list.body.some((s) => s.id === subjectId), 'deleted subject gone from list');

  // Its day sheet should now 404 (subject no longer belongs to teacher)
  const sheet = await request({ path: `/api/attendance/records?date=${cairoDate()}&subject_id=${subjectId}`, token });
  assert(sheet.status === 404, 'day sheet of deleted subject → 404 (cascade)', `got ${sheet.status}`);

  const delAgain = await request({
    method: 'DELETE',
    path  : `/api/attendance/subjects/${subjectId}`,
    token,
  });
  assert(delAgain.status === 404, 're-delete same subject → 404');
}

async function testDateEditAndCleanup(token) {
  console.log('\n── [H] Date Move & Delete Day ────────────────────────────────');
  const uniq = Date.now();

  // Dedicated throwaway subject — cascade-deleted at the end
  const created = await request({
    method: 'POST',
    path  : '/api/attendance/subjects',
    token,
    body  : { name: `اختبار نقل التاريخ ${uniq}`, academic_stage: null },
  });
  assert(created.status === 201 && created.body.id, '[H] create throwaway subject');
  const subjectId = created.body.id;

  const roster = await request({ path: `/api/attendance/records?date=${cairoDate()}&subject_id=${subjectId}`, token });
  if (roster.status !== 200 || !roster.body.students || roster.body.students.length < 2) {
    skip('[H] needs ≥2 active students');
    return;
  }
  const [a] = roster.body.students.slice(0, 2);
  const D1 = cairoDate(-3);
  const D2 = cairoDate(-2);

  // Seed a submitted day on D1
  const save = await request({
    method: 'POST',
    path  : '/api/attendance/records/bulk',
    token,
    body  : {
      date: D1,
      subject_id: subjectId,
      exam_total: 10,
      records: [{ student_id: a.id, status: 'present', exam_score: '7.5' }],
    },
  });
  assert(save.status === 200, '[H] seed records on source date');

  // ── Validation rejections ──
  const sameDate = await request({
    method: 'POST', path: '/api/attendance/records/move', token,
    body: { subject_id: subjectId, from_date: D1, to_date: D1 },
  });
  assert(sameDate.status === 400, '[H] move to same date → 400', `got ${sameDate.status}`);

  const future = await request({
    method: 'POST', path: '/api/attendance/records/move', token,
    body: { subject_id: subjectId, from_date: D1, to_date: cairoDate(+2) },
  });
  assert(future.status === 400, '[H] move to future date → 400 (Egypt calendar)', `got ${future.status}`);

  const badFmt = await request({
    method: 'POST', path: '/api/attendance/records/move', token,
    body: { subject_id: subjectId, from_date: D1, to_date: '2026/08/01' },
  });
  assert(badFmt.status === 400, '[H] move with bad date format → 400', `got ${badFmt.status}`);

  const noSrc = await request({
    method: 'POST', path: '/api/attendance/records/move', token,
    body: { subject_id: subjectId, from_date: cairoDate(-1), to_date: cairoDate(-2) },
  });
  assert(noSrc.status === 404, '[H] move from empty date → 404', `got ${noSrc.status}`);

  const foreign = await request({
    method: 'POST', path: '/api/attendance/records/move', token,
    body: { subject_id: 999999999, from_date: D1, to_date: D2 },
  });
  assert(foreign.status === 403, '[H] move foreign subject → 403', `got ${foreign.status}`);

  // ── Successful move ──
  const move = await request({
    method: 'POST', path: '/api/attendance/records/move', token,
    body: { subject_id: subjectId, from_date: D1, to_date: D2 },
  });
  assert(move.status === 200 && move.body.moved >= 1, `[H] move ${D1} → ${D2} succeeds`, JSON.stringify(move.body));

  let d1 = await request({ path: `/api/attendance/records?date=${D1}&subject_id=${subjectId}`, token });
  let d2 = await request({ path: `/api/attendance/records?date=${D2}&subject_id=${subjectId}`, token });
  const srcRow = d1.body.students.find((s) => s.id === a.id);
  const dstRow = d2.body.students.find((s) => s.id === a.id);
  assert(srcRow.status === null, '[H] source date empty after move');
  assert(dstRow.status === 'present' && Number(dstRow.exam_score) === 7.5 && d2.body.exam_total === 10, '[H] grades/status traveled intact');

  // ── Conflict handling: re-seed D1 then attempt occupied-target move ──
  await request({
    method: 'POST', path: '/api/attendance/records/bulk', token,
    body: { date: D1, subject_id: subjectId, records: [{ student_id: a.id, status: 'absent' }] },
  });

  const conflict = await request({
    method: 'POST', path: '/api/attendance/records/move', token,
    body: { subject_id: subjectId, from_date: D1, to_date: D2 },
  });
  assert(conflict.status === 409 && conflict.body.conflict === true, '[H] move onto occupied date without overwrite → 409', `got ${conflict.status}`);

  // Target must be untouched after the rejected move
  d2 = await request({ path: `/api/attendance/records?date=${D2}&subject_id=${subjectId}`, token });
  const dstAfterConflict = d2.body.students.find((s) => s.id === a.id);
  assert(dstAfterConflict.status === 'present' && Number(dstAfterConflict.exam_score) === 7.5, '[H] rejected move left target intact');

  const overwrite = await request({
    method: 'POST', path: '/api/attendance/records/move', token,
    body: { subject_id: subjectId, from_date: D1, to_date: D2, overwrite: true },
  });
  assert(overwrite.status === 200 && overwrite.body.overwritten >= 1, '[H] move with overwrite=true replaces target', JSON.stringify(overwrite.body));

  d2 = await request({ path: `/api/attendance/records?date=${D2}&subject_id=${subjectId}`, token });
  const dstOverwritten = d2.body.students.find((s) => s.id === a.id);
  assert(dstOverwritten.status === 'absent', '[H] target now holds the moved (overwriting) record');

  // ── Delete day ──
  const delDay = await request({ method: 'DELETE', path: `/api/attendance/records/day?subject_id=${subjectId}&date=${D2}`, token });
  assert(delDay.status === 200 && delDay.body.deleted >= 1, '[H] delete submitted day → 200');

  const delAgain = await request({ method: 'DELETE', path: `/api/attendance/records/day?subject_id=${subjectId}&date=${D2}`, token });
  assert(delAgain.status === 404, '[H] re-delete empty day → 404');

  d2 = await request({ path: `/api/attendance/records?date=${D2}&subject_id=${subjectId}`, token });
  const afterDel = d2.body.students.find((s) => s.id === a.id);
  assert(afterDel.status === null, '[H] day sheet blank after delete');

  // Cleanup
  await request({ method: 'DELETE', path: `/api/attendance/subjects/${subjectId}`, token });
}

/* ══════════════════════════════════════════════════════════════════
   MAIN
══════════════════════════════════════════════════════════════════ */
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   WATHBA — Class Attendance E2E Tests (الحضور والغياب)      ║');
  console.log(`║   Target: http://${HOSTNAME}:${PORT}  tenant=${TENANT_SLUG}`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const token = await loginTeacher();
  await testAuthGuards();

  const { subjectId } = await testSubjectCrud(token);

  // Day sheet for the fresh throwaway subject lists all active non-simulation students
  const roster = await request({ path: `/api/attendance/records?date=${cairoDate()}&subject_id=${subjectId}`, token });
  if (roster.status !== 200 || !roster.body.students || roster.body.students.length < 2) {
    skip('need ≥2 active students to run record tests — create students first');
  } else {
    const students = roster.body.students.slice(0, 2);
    await testValidation(token, subjectId, students);
    const ctx = await testBulkSaveAndUpsert(token, subjectId, students);
    await testCalendarAnalytics(token, subjectId, students, ctx);
  }

  await testParentPortal();

  // Cascade delete cleans up everything this suite created
  await testCascadeDelete(token, subjectId);

  // Date-move + delete-day (self-contained subject, cascade-cleaned)
  await testDateEditAndCleanup(token);

  // ── Summary ───────────────────────────────────────────────────
  const total = passed + failed + skipped;
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log(`║  RESULTS  ✅ ${passed} passed  ❌ ${failed} failed  ⏭️  ${skipped} skipped  [${total} total]`);
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  if (failures.length > 0) {
    console.log('\n❌ Failed tests:');
    failures.forEach(({ label, detail }) => {
      console.log(`  • ${label}`);
      if (detail) console.log(`    └─ ${detail}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\n💥 Test runner crashed:', err.message);
  process.exit(1);
});
