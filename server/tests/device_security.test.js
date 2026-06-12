/**
 * Device Security System — Comprehensive Test Suite
 *
 * Tests cover:
 *  A. Multi-tenant data isolation (teachers can't access each other's data)
 *  B. Device registration flow (1st, 2nd, 3rd device)
 *  C. Account suspension & reactivation
 *  D. JWT blocking after suspension (auth middleware)
 *  E. Permission checks for assistants
 *  F. Input validation (NaN params, invalid actions)
 *  G. Duplicate alert prevention (race condition guard)
 */

const http  = require('http');
const pool  = require('../db/connection');

const BASE = `http://localhost:${process.env.PORT || 3001}`;

// ── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const results = [];

function assert(label, cond, detail = '') {
  if (cond) {
    passed++;
    results.push(`  ✅  ${label}`);
  } else {
    failed++;
    results.push(`  ❌  ${label}${detail ? '  →  ' + detail : ''}`);
  }
}

async function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost',
      port: process.env.PORT || 3001,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const r = http.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let json;
        try { json = JSON.parse(raw); } catch { json = {}; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

// Sleep helper for cache-TTL tests
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── DB helpers ────────────────────────────────────────────────────────────────

async function cleanTestData() {
  await pool.query(`DELETE FROM device_alerts  WHERE teacher_id IN (SELECT id FROM teachers WHERE username LIKE 'test_teacher_%')`);
  await pool.query(`DELETE FROM student_devices WHERE student_id IN (SELECT id FROM students  WHERE username LIKE 'test_std_%')`);
  await pool.query(`DELETE FROM students        WHERE username LIKE 'test_std_%'`);
  await pool.query(`DELETE FROM teachers        WHERE username LIKE 'test_teacher_%'`);
}

async function createTeacher(suffix) {
  const bcrypt = require('bcryptjs');
  const hashed = await bcrypt.hash('pass123', 10);
  const { rows } = await pool.query(
    `INSERT INTO teachers (username, password, name)
     VALUES ($1, $2, $3) RETURNING id`,
    [`test_teacher_${suffix}`, hashed, `Test Teacher ${suffix}`]
  );
  return rows[0].id;
}

async function createStudent(teacherId, suffix, extraFields = {}) {
  const bcrypt = require('bcryptjs');
  const hashed = await bcrypt.hash('pass123', 10);
  const { rows } = await pool.query(
    `INSERT INTO students (username, password, name, teacher_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [`test_std_${suffix}`, hashed, `Test Student ${suffix}`, teacherId]
  );
  if (extraFields.is_suspended) {
    await pool.query('UPDATE students SET is_suspended=true WHERE id=$1', [rows[0].id]);
  }
  return rows[0].id;
}

async function createAssistant(teacherId, suffix, perms = {}) {
  const bcrypt = require('bcryptjs');
  const hashed = await bcrypt.hash('pass123', 10);
  const defaultPerms = {
    can_add_students: false, can_edit_students: false, can_delete_students: false,
    can_manage_exams: false, can_view_analytics: false, can_send_reports: false,
    can_manage_payments: false, can_manage_courses: false, can_send_notifications: false,
    ...perms,
  };
  const { rows } = await pool.query(
    `INSERT INTO assistants (username, password, name, teacher_id,
       can_add_students, can_edit_students, can_delete_students, can_manage_exams,
       can_view_analytics, can_send_reports, can_manage_payments, can_manage_courses,
       can_send_notifications)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [
      `test_asst_${suffix}`, hashed, `Test Assistant ${suffix}`, teacherId,
      defaultPerms.can_add_students, defaultPerms.can_edit_students,
      defaultPerms.can_delete_students, defaultPerms.can_manage_exams,
      defaultPerms.can_view_analytics, defaultPerms.can_send_reports,
      defaultPerms.can_manage_payments, defaultPerms.can_manage_courses,
      defaultPerms.can_send_notifications,
    ]
  );
  return rows[0].id;
}

async function loginAs(username, password, deviceId) {
  return req('POST', '/api/auth/login', {
    username, password, role: 'student',
    ...(deviceId ? { device_id: deviceId } : {}),
  });
}

async function loginAsTeacher(username) {
  return req('POST', '/api/auth/login', { username, password: 'pass123', role: 'teacher' });
}

async function loginAsAssistant(username) {
  return req('POST', '/api/auth/login', { username, password: 'pass123', role: 'assistant' });
}

// ── Test Sections ─────────────────────────────────────────────────────────────

async function testDeviceRegistration(t1Id) {
  console.log('\n[A] Device Registration Flow');

  const stdId  = await createStudent(t1Id, 'dev_reg');
  const teacher = await loginAsTeacher('test_teacher_1');
  const tToken  = teacher.body.token;

  // A1 — first device registers successfully
  const r1 = await loginAs(`test_std_dev_reg`, 'pass123', 'device-aaa');
  assert('A1: 1st device login succeeds (200)', r1.status === 200);
  assert('A1: returns token', !!r1.body.token);

  const { rows: devs1 } = await pool.query(
    'SELECT device_id FROM student_devices WHERE student_id=$1', [stdId]
  );
  assert('A1: device registered in DB', devs1.some(d => d.device_id === 'device-aaa'));

  // A2 — second device registers
  const r2 = await loginAs(`test_std_dev_reg`, 'pass123', 'device-bbb');
  assert('A2: 2nd device login succeeds (200)', r2.status === 200);

  // A3 — same device re-login updates last_seen (not a new device)
  const beforeTs = new Date();
  await sleep(50);
  const r3 = await loginAs(`test_std_dev_reg`, 'pass123', 'device-aaa');
  assert('A3: known device re-login succeeds (200)', r3.status === 200);

  const { rows: devs3 } = await pool.query(
    'SELECT device_id, last_seen FROM student_devices WHERE student_id=$1', [stdId]
  );
  assert('A3: still only 2 devices in DB', devs3.length === 2,
    `found ${devs3.length}`);

  // A4 — third DIFFERENT device → suspension
  const r4 = await loginAs(`test_std_dev_reg`, 'pass123', 'device-ccc');
  assert('A4: 3rd device returns 403', r4.status === 403,
    `got ${r4.status}`);
  assert('A4: account_suspended flag in response', !!r4.body.account_suspended);

  const { rows: [std4] } = await pool.query(
    'SELECT is_suspended FROM students WHERE id=$1', [stdId]
  );
  assert('A4: student is_suspended=true in DB', std4.is_suspended === true);

  const { rows: alerts } = await pool.query(
    'SELECT * FROM device_alerts WHERE student_id=$1', [stdId]
  );
  assert('A4: exactly 1 pending alert created', alerts.length === 1 && alerts[0].status === 'pending');

  // A5 — subsequent login from the SAME 3rd device also blocked (not doubled alert)
  const r5 = await loginAs(`test_std_dev_reg`, 'pass123', 'device-ccc');
  assert('A5: subsequent 3rd-device attempt blocked (403)', r5.status === 403);
  const { rows: alerts5 } = await pool.query(
    'SELECT * FROM device_alerts WHERE student_id=$1', [stdId]
  );
  assert('A5: still only 1 alert (no duplicate)', alerts5.length === 1);

  // A6 — login without device_id is allowed but no device is tracked
  const stdId2  = await createStudent(t1Id, 'no_dev_id');
  const r6 = await loginAs(`test_std_no_dev_id`, 'pass123', null);
  assert('A6: login without device_id succeeds', r6.status === 200);
  const { rows: devs6 } = await pool.query(
    'SELECT id FROM student_devices WHERE student_id=$1', [stdId2]
  );
  assert('A6: no device row created when device_id omitted', devs6.length === 0);
}

async function testSuspensionFlow(t1Id) {
  console.log('\n[B] Suspension & Reactivation');

  const stdId  = await createStudent(t1Id, 'susp');
  const teacher = await loginAsTeacher('test_teacher_1');
  const tToken  = teacher.body.token;

  // Register 2 devices, then trigger suspension via 3rd device
  await loginAs(`test_std_susp`, 'pass123', 'dev-s1');
  await loginAs(`test_std_susp`, 'pass123', 'dev-s2');
  await loginAs(`test_std_susp`, 'pass123', 'dev-s3');   // triggers suspension

  // B1 — suspended student can't login
  const rLogin = await loginAs(`test_std_susp`, 'pass123', 'dev-s1');
  assert('B1: suspended student login blocked (403)', rLogin.status === 403);
  assert('B1: account_suspended flag', !!rLogin.body.account_suspended);

  // B2 — suspended student's valid JWT is blocked by middleware
  // (login doesn't return a token once suspended — we need the old token)
  // Get a fresh student whose JWT we grab BEFORE suspension
  const stdId2  = await createStudent(t1Id, 'susp_jwt');
  await loginAs(`test_std_susp_jwt`, 'pass123', 'dev-j1');
  const preSuspendLogin = await loginAs(`test_std_susp_jwt`, 'pass123', 'dev-j1');
  const oldToken = preSuspendLogin.body.token;

  // Now suspend via teacher API
  await req('POST', `/api/students/${stdId2}/suspend`, { action: 'suspend' }, tToken);

  // Immediately try to use the old JWT → should be blocked (cache invalidated)
  const rOldJwt = await req('GET', '/api/students/me/dashboard', null, oldToken);
  assert('B2: suspended student\'s old JWT blocked immediately', rOldJwt.status === 401 || rOldJwt.status === 403,
    `got ${rOldJwt.status}`);

  // B3 — reactivate (keep devices)
  const alertsR = await pool.query(
    'SELECT id FROM device_alerts WHERE student_id=$1 LIMIT 1', [stdId]
  );
  if (alertsR.rows.length) {
    const alertId = alertsR.rows[0].id;
    const rReact = await req(
      'POST', `/api/students/device-alerts/${alertId}/action`,
      { action: 'reactivate' }, tToken
    );
    assert('B3: reactivate via alert action (200)', rReact.status === 200);
  }
  const rAfterReact = await loginAs(`test_std_susp`, 'pass123', 'dev-s1');
  assert('B3: student can login after reactivation (200)', rAfterReact.status === 200);

  // B4 — reactivate + reset devices
  // Re-suspend first
  await req('POST', `/api/students/${stdId}/suspend`, { action: 'suspend' }, tToken);
  const rReact2 = await req('POST', `/api/students/${stdId}/suspend`,
    { action: 'reactivate_reset_devices' }, tToken);
  assert('B4: reactivate_reset_devices returns 200', rReact2.status === 200);

  const { rows: devsAfter } = await pool.query(
    'SELECT id FROM student_devices WHERE student_id=$1', [stdId]
  );
  assert('B4: devices cleared after reset', devsAfter.length === 0,
    `found ${devsAfter.length} devices`);

  // student can now register a completely new device
  const rNew = await loginAs(`test_std_susp`, 'pass123', 'dev-fresh');
  assert('B4: can login with fresh device after reset (200)', rNew.status === 200);
}

async function testMultiTenantIsolation(t1Id, t2Id) {
  console.log('\n[C] Multi-Tenant Data Isolation');

  const std1 = await createStudent(t1Id, 'iso_t1');
  const std2 = await createStudent(t2Id, 'iso_t2');

  const t1Login = await loginAsTeacher('test_teacher_1');
  const t2Login = await loginAsTeacher('test_teacher_2');
  const t1Token = t1Login.body.token;
  const t2Token = t2Login.body.token;

  // Trigger suspension for t2's student
  await loginAs('test_std_iso_t2', 'pass123', 'dev-x1');
  await loginAs('test_std_iso_t2', 'pass123', 'dev-x2');
  await loginAs('test_std_iso_t2', 'pass123', 'dev-x3');

  // C1 — Teacher 1 sees only their own device alerts
  const r1 = await req('GET', '/api/students/device-alerts', null, t1Token);
  assert('C1: teacher 1 gets 200 for device-alerts', r1.status === 200);
  const alertIds1 = (r1.body || []).map(a => a.student_id);
  assert('C1: teacher 1 sees no alerts for teacher 2\'s student',
    !alertIds1.includes(std2), `found std2 id ${std2} in teacher1 results`);

  // C2 — Teacher 2 sees their own alerts
  const r2 = await req('GET', '/api/students/device-alerts', null, t2Token);
  assert('C2: teacher 2 gets 200 for device-alerts', r2.status === 200);
  const alertIds2 = (r2.body || []).map(a => a.student_id);
  assert('C2: teacher 2 sees alert for their student',
    alertIds2.includes(std2), `std2=${std2} not in ${JSON.stringify(alertIds2)}`);

  // C3 — Teacher 1 cannot view devices of Teacher 2's student
  const r3 = await req('GET', `/api/students/${std2}/devices`, null, t1Token);
  assert('C3: teacher 1 cannot view teacher 2\'s student devices (403)',
    r3.status === 403, `got ${r3.status}`);

  // C4 — Teacher 1 cannot suspend Teacher 2's student
  const r4 = await req('POST', `/api/students/${std2}/suspend`, { action: 'suspend' }, t1Token);
  assert('C4: teacher 1 cannot suspend teacher 2\'s student (403)',
    r4.status === 403, `got ${r4.status}`);

  // C5 — Teacher 1 cannot act on Teacher 2's device alert
  const { rows: t2Alerts } = await pool.query(
    'SELECT id FROM device_alerts WHERE student_id=$1 LIMIT 1', [std2]
  );
  if (t2Alerts.length) {
    const r5 = await req(
      'POST', `/api/students/device-alerts/${t2Alerts[0].id}/action`,
      { action: 'dismiss' }, t1Token
    );
    assert('C5: teacher 1 cannot act on teacher 2\'s alert (403)',
      r5.status === 403, `got ${r5.status}`);
  }

  // C6 — Students from different teachers are completely isolated in the students list
  const r6 = await req('GET', '/api/students', null, t1Token);
  assert('C6: GET /students returns 200', r6.status === 200);
  const t1StudentIds = (r6.body?.students || r6.body || []).map(s => s.id);
  assert('C6: teacher 1 does not see teacher 2\'s student in list',
    !t1StudentIds.includes(std2), `teacher1 can see std2 id ${std2}`);
  assert('C6: teacher 1 sees their own student', t1StudentIds.includes(std1),
    `std1 ${std1} missing from list`);
}

async function testPermissions(t1Id) {
  console.log('\n[D] Assistant Permission Checks');

  const stdId = await createStudent(t1Id, 'perm_std');

  // Assistant WITH no permissions
  await createAssistant(t1Id, 'no_perms', {});
  const aNoPerms = await loginAsAssistant('test_asst_no_perms');
  const aNoToken = aNoPerms.body.token;

  // Assistant WITH can_view_analytics + can_edit_students
  await createAssistant(t1Id, 'all_perms', {
    can_view_analytics: true, can_edit_students: true,
  });
  const aAllPerms = await loginAsAssistant('test_asst_all_perms');
  const aAllToken = aAllPerms.body.token;

  // D1 — no-perms assistant cannot view device alerts
  const d1 = await req('GET', '/api/students/device-alerts', null, aNoToken);
  assert('D1: assistant w/o can_view_analytics blocked from device-alerts (403)',
    d1.status === 403, `got ${d1.status}`);

  // D2 — full-perms assistant can view device alerts
  const d2 = await req('GET', '/api/students/device-alerts', null, aAllToken);
  assert('D2: assistant w/ can_view_analytics can view device-alerts (200)',
    d2.status === 200, `got ${d2.status}`);

  // D3 — no-perms cannot view student devices
  const d3 = await req('GET', `/api/students/${stdId}/devices`, null, aNoToken);
  assert('D3: assistant w/o can_view_analytics blocked from /:id/devices (403)',
    d3.status === 403, `got ${d3.status}`);

  // D4 — full-perms can view student devices
  const d4 = await req('GET', `/api/students/${stdId}/devices`, null, aAllToken);
  assert('D4: assistant w/ can_view_analytics can view /:id/devices (200)',
    d4.status === 200, `got ${d4.status}`);

  // D5 — no-perms cannot suspend student
  const d5 = await req('POST', `/api/students/${stdId}/suspend`,
    { action: 'suspend' }, aNoToken);
  assert('D5: assistant w/o can_edit_students cannot suspend (403)',
    d5.status === 403, `got ${d5.status}`);

  // D6 — full-perms can suspend
  const d6 = await req('POST', `/api/students/${stdId}/suspend`,
    { action: 'suspend' }, aAllToken);
  assert('D6: assistant w/ can_edit_students can suspend (200)',
    d6.status === 200, `got ${d6.status}`);

  // D7 — no-perms cannot act on alert (create one first)
  await req('POST', `/api/students/${stdId}/suspend`, { action: 'reactivate_reset_devices' }, aAllToken);
  await loginAs('test_std_perm_std', 'pass123', 'dp1');
  await loginAs('test_std_perm_std', 'pass123', 'dp2');
  await loginAs('test_std_perm_std', 'pass123', 'dp3');
  const { rows: alerts } = await pool.query(
    'SELECT id FROM device_alerts WHERE student_id=$1 AND status=\'pending\' LIMIT 1', [stdId]
  );
  if (alerts.length) {
    const alertId = alerts[0].id;
    const d7 = await req('POST', `/api/students/device-alerts/${alertId}/action`,
      { action: 'dismiss' }, aNoToken);
    assert('D7: assistant w/o can_edit_students blocked from alert action (403)',
      d7.status === 403, `got ${d7.status}`);

    const d8 = await req('POST', `/api/students/device-alerts/${alertId}/action`,
      { action: 'reactivate' }, aAllToken);
    assert('D8: assistant w/ can_edit_students can act on alert (200)',
      d8.status === 200, `got ${d8.status}`);
  }
}

async function testInputValidation(t1Id) {
  console.log('\n[E] Input Validation');

  const t1Login = await loginAsTeacher('test_teacher_1');
  const tToken  = t1Login.body.token;

  // E1 — NaN id for suspend
  const e1 = await req('POST', '/api/students/abc/suspend', { action: 'suspend' }, tToken);
  assert('E1: non-numeric student id returns 400', e1.status === 400, `got ${e1.status}`);

  // E2 — NaN alertId for action
  const e2 = await req('POST', '/api/students/device-alerts/xyz/action',
    { action: 'dismiss' }, tToken);
  assert('E2: non-numeric alertId returns 400', e2.status === 400, `got ${e2.status}`);

  // E3 — NaN id for devices
  const e3 = await req('GET', '/api/students/xyz/devices', null, tToken);
  assert('E3: non-numeric student id for devices returns 400', e3.status === 400, `got ${e3.status}`);

  // E4 — invalid action string for suspend
  const stdId = await createStudent(t1Id, 'val_std');
  const e4 = await req('POST', `/api/students/${stdId}/suspend`,
    { action: 'hack' }, tToken);
  assert('E4: invalid action for suspend returns 400', e4.status === 400, `got ${e4.status}`);

  // E5 — invalid action for alert
  const e5 = await req('POST', '/api/students/device-alerts/999/action',
    { action: 'destroy' }, tToken);
  assert('E5: invalid action for alert action returns 400', e5.status === 400, `got ${e5.status}`);

  // E6 — student cannot access teacher-only device routes
  const stdId2 = await createStudent(t1Id, 'val_std2');
  await loginAs('test_std_val_std2', 'pass123', 'vd1');
  const stdLogin = await loginAs('test_std_val_std2', 'pass123', 'vd1');
  const sToken = stdLogin.body.token;
  const e6 = await req('GET', '/api/students/device-alerts', null, sToken);
  assert('E6: student cannot access /device-alerts (403)', e6.status === 403, `got ${e6.status}`);
}

// ── Main runner ───────────────────────────────────────────────────────────────

async function run() {
  console.log('='.repeat(60));
  console.log(' Wathba — Device Security Test Suite');
  console.log('='.repeat(60));

  try {
    // Seed test teachers
    await cleanTestData();
    const t1Id = await createTeacher('1');
    const t2Id = await createTeacher('2');

    await testDeviceRegistration(t1Id);
    await testSuspensionFlow(t1Id);
    await testMultiTenantIsolation(t1Id, t2Id);
    await testPermissions(t1Id);
    await testInputValidation(t1Id);

  } catch (err) {
    console.error('\nFATAL TEST ERROR:', err.message);
    console.error(err.stack);
    failed++;
  } finally {
    await cleanTestData();
    await pool.end();
  }

  console.log('\n' + '─'.repeat(60));
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log('─'.repeat(60));
  results.forEach(r => console.log(r));
  console.log('─'.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

run();
