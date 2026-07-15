'use strict';
/**
 * Assistant Permissions — Full Audit Test Suite
 *
 * Verifies that every permission a teacher can grant an assistant
 * (can_add_students, can_edit_students, can_delete_students, can_manage_exams,
 * can_manage_recitations, can_view_analytics, can_manage_payments,
 * can_manage_courses, can_send_notifications) is enforced consistently by the
 * backend — not just hidden in the frontend — and that teachers always bypass
 * these checks, assistants can never escalate their own permissions, and
 * cross-tenant access is blocked.
 *
 * Covers the fixes made during the 2026-07 assistant-permissions audit:
 *  - students.js  GET /            → now any-of(can_view_analytics, can_add_students,
 *                                     can_edit_students, can_delete_students)
 *  - teachers.js  GET /at-risk-students → now requires can_view_analytics
 *  - notifications.js GET /students, GET /log → now requires can_send_notifications
 *  - courses.js   GET /:id/content → now requires can_manage_courses for assistants
 */
require('dotenv').config();
const pool = require('../server/db/connection');
const bcrypt = require('bcryptjs');
const http = require('http');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '3001', 10);

let passed = 0, failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌  ${name}\n       ${e.message}`);
    failures.push({ name, err: e });
    failed++;
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function request(method, urlPath, body, token, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: PORT, path: urlPath, method,
      headers: {
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extraHeaders,
      },
    };
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/* ── Fixtures ───────────────────────────────────────────────────── */
const suffix = crypto.randomInt(100000, 999999);
const F = {
  teacherA: { id: null, slug: `pa-a-${suffix}`, username: `pa_teacher_a_${suffix}`, token: null },
  teacherB: { id: null, slug: `pa-b-${suffix}`, username: `pa_teacher_b_${suffix}`, token: null },
  courseA: { id: null },
  assistants: {}, // key -> { id, username, token }
};

const ASSISTANT_DEFS = {
  // zero permissions at all — the negative-control baseline
  zeroPerms: {
    can_add_students: false, can_edit_students: false, can_delete_students: false,
    can_manage_exams: false, can_view_analytics: false, can_manage_payments: false,
    can_manage_courses: false, can_send_notifications: false, can_manage_recitations: false,
  },
  // full permissions — the positive-control baseline
  fullPerms: {
    can_add_students: true, can_edit_students: true, can_delete_students: true,
    can_manage_exams: true, can_view_analytics: true, can_manage_payments: true,
    can_manage_courses: true, can_send_notifications: true, can_manage_recitations: true,
  },
  // realistic narrow grant: can add students, nothing else (regression case for the
  // students.js GET / fix — must still be able to see the roster)
  addOnly: {
    can_add_students: true, can_edit_students: false, can_delete_students: false,
    can_manage_exams: false, can_view_analytics: false, can_manage_payments: false,
    can_manage_courses: false, can_send_notifications: false, can_manage_recitations: false,
  },
  // analytics only — should unlock student list + at-risk, nothing else
  analyticsOnly: {
    can_add_students: false, can_edit_students: false, can_delete_students: false,
    can_manage_exams: false, can_view_analytics: true, can_manage_payments: false,
    can_manage_courses: false, can_send_notifications: false, can_manage_recitations: false,
  },
  // notifications only
  notifOnly: {
    can_add_students: false, can_edit_students: false, can_delete_students: false,
    can_manage_exams: false, can_view_analytics: false, can_manage_payments: false,
    can_manage_courses: false, can_send_notifications: true, can_manage_recitations: false,
  },
  // courses only
  coursesOnly: {
    can_add_students: false, can_edit_students: false, can_delete_students: false,
    can_manage_exams: false, can_view_analytics: false, can_manage_payments: false,
    can_manage_courses: true, can_send_notifications: false, can_manage_recitations: false,
  },
};

async function createTeacher(t) {
  const hashed = await bcrypt.hash('TeacherPass8!', 10);
  const r = await pool.query(
    `INSERT INTO teachers (username, password, name, slug) VALUES ($1,$2,$3,$4) RETURNING id`,
    [t.username, hashed, 'Test Teacher', t.slug]
  );
  t.id = r.rows[0].id;
  const lr = await request('POST', '/api/auth/login',
    { username: t.username, password: 'TeacherPass8!', role: 'teacher' },
    null, { 'X-Tenant-Slug': t.slug });
  assert(lr.status === 200, `Teacher login failed: ${JSON.stringify(lr.body)}`);
  t.token = lr.body.token;
}

async function createAssistant(key, teacher, permOverrides) {
  const hashed = await bcrypt.hash('AsstPass8!', 10);
  const username = `pa_${key}_${suffix}`;
  const p = permOverrides;
  const r = await pool.query(
    `INSERT INTO assistants
       (username,password,name,teacher_id,can_add_students,can_edit_students,can_delete_students,
        can_manage_exams,can_view_analytics,can_manage_payments,can_manage_courses,
        can_send_notifications,can_manage_recitations)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [username, hashed, `Assistant ${key}`, teacher.id,
     p.can_add_students, p.can_edit_students, p.can_delete_students, p.can_manage_exams,
     p.can_view_analytics, p.can_manage_payments, p.can_manage_courses,
     p.can_send_notifications, p.can_manage_recitations]
  );
  const id = r.rows[0].id;
  const lr = await request('POST', '/api/auth/login',
    { username, password: 'AsstPass8!', role: 'assistant' },
    null, { 'X-Tenant-Slug': teacher.slug });
  assert(lr.status === 200, `Assistant login failed for ${key}: ${JSON.stringify(lr.body)}`);
  F.assistants[key] = { id, username, token: lr.body.token };
}

async function setup() {
  await createTeacher(F.teacherA);
  await createTeacher(F.teacherB);

  for (const [key, perms] of Object.entries(ASSISTANT_DEFS)) {
    await createAssistant(key, F.teacherA, perms);
  }
  // one assistant under teacher B with full perms, for cross-tenant isolation checks
  await createAssistant('crossTenantFull', F.teacherB, ASSISTANT_DEFS.fullPerms);

  const cr = await pool.query(
    `INSERT INTO courses (name, teacher_id) VALUES ($1,$2) RETURNING id`,
    ['Test Course', F.teacherA.id]
  );
  F.courseA.id = cr.rows[0].id;
}

async function teardown() {
  await pool.query(`DELETE FROM teachers WHERE slug IN ($1,$2)`, [F.teacherA.slug, F.teacherB.slug]).catch(() => {});
  // assistants/courses cascade-delete via FK ON DELETE CASCADE
}

/* ═══════════════════════════════════════════════════════════════════
   TESTS
   ═══════════════════════════════════════════════════════════════════ */
async function run() {
  console.log('\n══════════════════════════════════════════════════');
  console.log(' Assistant Permissions — Full Audit Test Suite');
  console.log('══════════════════════════════════════════════════\n');
  await setup();

  /* ── A. students.js GET / (roster) ───────────────────────────────── */
  await test('A1 · Teacher always sees student roster regardless of any permission flags', async () => {
    const r = await request('GET', '/api/students', null, F.teacherA.token);
    assertEqual(r.status, 200, JSON.stringify(r.body));
  });

  await test('A2 · Assistant with zero permissions is blocked from the roster', async () => {
    const r = await request('GET', '/api/students', null, F.assistants.zeroPerms.token);
    assertEqual(r.status, 403);
  });

  await test('A3 · [FIX] Assistant granted ONLY can_add_students can still view the roster', async () => {
    const r = await request('GET', '/api/students', null, F.assistants.addOnly.token);
    assertEqual(r.status, 200, `Expected 200 so add-only assistants can operate the Students page: ${JSON.stringify(r.body)}`);
    assert(Array.isArray(r.body), 'Expected an array of students');
  });

  await test('A4 · Assistant with can_view_analytics can view the roster', async () => {
    const r = await request('GET', '/api/students', null, F.assistants.analyticsOnly.token);
    assertEqual(r.status, 200);
  });

  await test('A5 · Assistant with only unrelated permissions (courses) is still blocked from the roster', async () => {
    const r = await request('GET', '/api/students', null, F.assistants.coursesOnly.token);
    assertEqual(r.status, 403);
  });

  /* ── B. teachers.js GET /at-risk-students ────────────────────────── */
  await test('B1 · Teacher can access at-risk-students', async () => {
    const r = await request('GET', '/api/teachers/at-risk-students', null, F.teacherA.token);
    assertEqual(r.status, 200, JSON.stringify(r.body));
  });

  await test('B2 · [FIX] Assistant with zero permissions is now blocked from at-risk-students', async () => {
    const r = await request('GET', '/api/teachers/at-risk-students', null, F.assistants.zeroPerms.token);
    assertEqual(r.status, 403, 'at-risk-students was previously reachable with NO permission check at all');
  });

  await test('B3 · Assistant with can_view_analytics can access at-risk-students', async () => {
    const r = await request('GET', '/api/teachers/at-risk-students', null, F.assistants.analyticsOnly.token);
    assertEqual(r.status, 200, JSON.stringify(r.body));
  });

  await test('B4 · Assistant with can_add_students only (no analytics) is blocked from at-risk-students', async () => {
    const r = await request('GET', '/api/teachers/at-risk-students', null, F.assistants.addOnly.token);
    assertEqual(r.status, 403);
  });

  /* ── C. notifications.js GET /students and GET /log ──────────────── */
  await test('C1 · Teacher can list notification-recipient students', async () => {
    const r = await request('GET', '/api/notifications/students', null, F.teacherA.token);
    assertEqual(r.status, 200, JSON.stringify(r.body));
  });

  await test('C2 · [FIX] Assistant with zero permissions is now blocked from notifications/students (PII)', async () => {
    const r = await request('GET', '/api/notifications/students', null, F.assistants.zeroPerms.token);
    assertEqual(r.status, 403, 'notifications/students previously exposed phone/parent_phone PII with no permission check');
  });

  await test('C3 · Assistant with can_send_notifications can list notification recipients', async () => {
    const r = await request('GET', '/api/notifications/students', null, F.assistants.notifOnly.token);
    assertEqual(r.status, 200, JSON.stringify(r.body));
  });

  await test('C4 · Assistant with can_view_analytics only (no can_send_notifications) is blocked', async () => {
    const r = await request('GET', '/api/notifications/students', null, F.assistants.analyticsOnly.token);
    assertEqual(r.status, 403);
  });

  await test('C5 · [FIX] Assistant with zero permissions is now blocked from notification history log', async () => {
    const r = await request('GET', '/api/notifications/log', null, F.assistants.zeroPerms.token);
    assertEqual(r.status, 403);
  });

  await test('C6 · Assistant with can_send_notifications can read the notification history log', async () => {
    const r = await request('GET', '/api/notifications/log', null, F.assistants.notifOnly.token);
    assertEqual(r.status, 200, JSON.stringify(r.body));
  });

  /* ── D. courses.js GET /:id/content ───────────────────────────────── */
  await test('D1 · Teacher (owner) can fetch course content', async () => {
    const r = await request('GET', `/api/courses/${F.courseA.id}/content`, null, F.teacherA.token);
    assertEqual(r.status, 200, JSON.stringify(r.body));
  });

  await test('D2 · [FIX] Assistant with zero permissions is now blocked from course content', async () => {
    const r = await request('GET', `/api/courses/${F.courseA.id}/content`, null, F.assistants.zeroPerms.token);
    assertEqual(r.status, 403, 'GET /:id/content previously had NO permission gate at all for assistants');
  });

  await test('D3 · Assistant with can_manage_courses can fetch course content', async () => {
    const r = await request('GET', `/api/courses/${F.courseA.id}/content`, null, F.assistants.coursesOnly.token);
    assertEqual(r.status, 200, JSON.stringify(r.body));
  });

  await test('D4 · Assistant with unrelated permission (add-students) is blocked from course content', async () => {
    const r = await request('GET', `/api/courses/${F.courseA.id}/content`, null, F.assistants.addOnly.token);
    assertEqual(r.status, 403);
  });

  /* ── E. Cross-tenant isolation ─────────────────────────────────────── */
  await test('E1 · An assistant with full permissions cannot access another teacher\'s course content', async () => {
    const r = await request('GET', `/api/courses/${F.courseA.id}/content`, null, F.assistants.crossTenantFull.token);
    assertEqual(r.status, 403, 'Cross-tenant assistant should be blocked by ownership check even with can_manage_courses');
  });

  await test('E2 · An assistant with full permissions cannot list another teacher\'s students', async () => {
    const r = await request('GET', '/api/students', null, F.assistants.crossTenantFull.token);
    assertEqual(r.status, 200, JSON.stringify(r.body));
    // Teacher B has no students created; verify the list is scoped to teacher B, not A
    const ids = (r.body || []).map(s => s.id);
    const aStudents = await pool.query('SELECT id FROM students WHERE teacher_id=$1', [F.teacherA.id]);
    for (const s of aStudents.rows) {
      assert(!ids.includes(s.id), 'Cross-tenant student leaked into another tenant\'s roster');
    }
  });

  /* ── F. Escalation resistance ─────────────────────────────────────── */
  await test('F1 · Assistant cannot call the permissions-edit endpoint at all (teacher-only route)', async () => {
    const r = await request('PUT', `/api/assistants/${F.assistants.zeroPerms.id}/permissions`,
      { can_view_analytics: true, can_manage_courses: true, can_manage_payments: true },
      F.assistants.zeroPerms.token);
    assertEqual(r.status, 403, 'requireRole(teacher) should reject assistants outright');
  });

  await test('F2 · Assistant cannot create a new assistant (privilege escalation via assistant creation)', async () => {
    const r = await request('POST', '/api/assistants',
      { username: `escalate_${suffix}`, password: 'Whatever8!', name: 'x', can_manage_payments: true },
      F.assistants.zeroPerms.token);
    assertEqual(r.status, 403);
  });

  await test('F3 · A teacher cannot edit permissions of another teacher\'s assistant (cross-tenant)', async () => {
    const r = await request('PUT', `/api/assistants/${F.assistants.crossTenantFull.id}/permissions`,
      { can_view_analytics: false, can_manage_courses: false, can_manage_payments: false,
        can_add_students: false, can_edit_students: false, can_delete_students: false,
        can_manage_exams: false, can_send_notifications: false, can_manage_recitations: false },
      F.teacherA.token);
    assertEqual(r.status, 404, 'teacher_id-scoped UPDATE should not find a row belonging to a different teacher');
    // Verify teacher B's assistant permissions were untouched
    const check = await pool.query('SELECT can_manage_courses FROM assistants WHERE id=$1', [F.assistants.crossTenantFull.id]);
    assertEqual(check.rows[0].can_manage_courses, true, 'Cross-tenant permission edit must not have applied');
  });

  /* ── G. Permission cache invalidation ─────────────────────────────── */
  await test('G1 · Revoking can_view_analytics takes effect immediately (cache invalidated)', async () => {
    // Baseline: analyticsOnly assistant currently has can_view_analytics=true
    const before = await request('GET', '/api/students', null, F.assistants.analyticsOnly.token);
    assertEqual(before.status, 200);

    const upd = await request('PUT', `/api/assistants/${F.assistants.analyticsOnly.id}/permissions`,
      { can_view_analytics: false, can_add_students: false, can_edit_students: false,
        can_delete_students: false, can_manage_exams: false, can_manage_payments: false,
        can_manage_courses: false, can_send_notifications: false, can_manage_recitations: false },
      F.teacherA.token);
    assertEqual(upd.status, 200, JSON.stringify(upd.body));

    const after = await request('GET', '/api/students', null, F.assistants.analyticsOnly.token);
    assertEqual(after.status, 403, 'Permission revocation must be reflected immediately, not after a cache TTL delay');

    // Restore for any subsequent tests / re-runs
    await request('PUT', `/api/assistants/${F.assistants.analyticsOnly.id}/permissions`,
      { ...ASSISTANT_DEFS.analyticsOnly }, F.teacherA.token);
  });

  await test('G2 · Granting can_manage_courses takes effect immediately (cache invalidated)', async () => {
    const before = await request('GET', `/api/courses/${F.courseA.id}/content`, null, F.assistants.zeroPerms.token);
    assertEqual(before.status, 403);

    const upd = await request('PUT', `/api/assistants/${F.assistants.zeroPerms.id}/permissions`,
      { ...ASSISTANT_DEFS.zeroPerms, can_manage_courses: true }, F.teacherA.token);
    assertEqual(upd.status, 200, JSON.stringify(upd.body));

    const after = await request('GET', `/api/courses/${F.courseA.id}/content`, null, F.assistants.zeroPerms.token);
    assertEqual(after.status, 200, 'Permission grant must be reflected immediately, not after a cache TTL delay');

    // Restore
    await request('PUT', `/api/assistants/${F.assistants.zeroPerms.id}/permissions`,
      { ...ASSISTANT_DEFS.zeroPerms }, F.teacherA.token);
  });

  /* ── H. Deleted / non-existent assistant ──────────────────────────── */
  await test('H1 · Deleting an assistant invalidates its auth+permission cache (token stops working)', async () => {
    // Create a throwaway assistant, log in, delete it, then confirm the old token
    // (a valid JWT for a now-deleted id) is rejected by authenticate()'s DB re-check.
    await createAssistant('throwaway', F.teacherA, ASSISTANT_DEFS.fullPerms);
    const asst = F.assistants.throwaway;
    const del = await request('DELETE', `/api/assistants/${asst.id}`, null, F.teacherA.token);
    assertEqual(del.status, 200, JSON.stringify(del.body));

    const r = await request('GET', '/api/students', null, asst.token);
    assert([401, 403].includes(r.status), `Expected the deleted assistant's token to be rejected, got ${r.status}`);
  });

  /* ── Finish ─────────────────────────────────────────────────────── */
  await teardown();

  const total = passed + failed;
  console.log(`\n══════════════════════════════════════════════════`);
  console.log(` Results: ${passed}/${total} passed  (${failed} failed)`);
  console.log(`══════════════════════════════════════════════════`);

  if (failures.length) {
    console.error('\nFailures:');
    failures.forEach(f => console.error(`  • ${f.name}\n    ${f.err.message}`));
    process.exit(1);
  } else {
    console.log('\nAll tests passed! 🎉');
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
