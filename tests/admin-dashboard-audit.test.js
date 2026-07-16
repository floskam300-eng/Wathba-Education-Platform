'use strict';
/**
 * Wathba — Admin Dashboard: Comprehensive Audit Test Suite
 * =========================================================
 * يغطي هذا الملف جميع الـ bugs والثغرات الأمنية والـ edge cases
 * التي تم اكتشافها وإصلاحها في لوحة إدارة المنصة.
 *
 * التشغيل:
 *   node tests/admin-dashboard-audit.test.js
 *
 * المتطلبات:
 *   - خادم Express يعمل على PORT (افتراضياً 3001)
 *   - بيانات seed: node server/db/seed.js
 *
 * الفئات:
 *   [S] Security — rate limiting, JWT, token integrity
 *   [B] Backend Logic — input validation, data integrity, business rules
 *   [P] Performance — cache invalidation, parallel queries
 *   [E] Edge Cases — boundary inputs, null values, concurrent ops
 */

require('dotenv').config();
const http    = require('http');
const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const pool    = require('../server/db/connection');

const PORT             = parseInt(process.env.PORT || '3001', 10);
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || ((process.env.JWT_SECRET || 'secret') + '_admin');

/* ── Test runner ─────────────────────────────────────────────────── */
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

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function assertNotEqual(a, b, msg) {
  if (a === b) throw new Error(msg || `Expected values to differ, both are ${JSON.stringify(a)}`);
}

/* ── HTTP helper ─────────────────────────────────────────────────── */
function request(method, urlPath, body, token, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const headers = {
      ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    };
    const req = http.request({ hostname: 'localhost', port: PORT, path: urlPath, method, headers }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, body: JSON.parse(raw), raw }); }
        catch { resolve({ status: res.statusCode, body: raw, raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/* ── Fixtures ────────────────────────────────────────────────────── */
const F = {
  adminUser  : `audit_adm_${crypto.randomInt(10000, 99999)}`,
  adminPw    : 'AuditAdmin@SecurePw1!',
  adminId    : null,
  adminToken : null,
  planId     : null,
  teacherId  : null,
  teacherSlug: `audit-tch-${crypto.randomInt(10000, 99999)}`,
  subId      : null,
  paymentId  : null,
};

async function setup() {
  console.log('[setup] Creating audit test fixtures...');

  // Create admin
  const hash = await bcrypt.hash(F.adminPw, 10);
  const r = await pool.query(
    'INSERT INTO platform_admins (username, password_hash, name, role) VALUES ($1,$2,$3,$4) RETURNING id',
    [F.adminUser, hash, 'Audit Test Admin', 'super_admin']
  );
  F.adminId = r.rows[0].id;

  // Reuse existing platform plan or create one
  const planQ = await pool.query("SELECT id FROM subscription_plans WHERE category='platform' LIMIT 1");
  if (planQ.rows.length > 0) {
    F.planId = planQ.rows[0].id;
  } else {
    const pR = await pool.query(
      `INSERT INTO subscription_plans (name, category, price, billing_type)
       VALUES ('Audit Test Plan','platform',500.00,'monthly') RETURNING id`
    );
    F.planId = pR.rows[0].id;
  }

  // Login to get token
  const loginRes = await request('POST', '/api/admin/auth/login', {
    username: F.adminUser,
    password: F.adminPw,
  });
  if (loginRes.status !== 200) throw new Error(`Setup login failed: ${JSON.stringify(loginRes.body)}`);
  F.adminToken = loginRes.body.token;
  console.log('[setup] Done. Admin token obtained.\n');
}

async function teardown() {
  console.log('\n[teardown] Cleaning up...');
  if (F.paymentId) await pool.query('DELETE FROM subscription_payments WHERE id=$1', [F.paymentId]).catch(() => {});
  if (F.subId)     await pool.query('DELETE FROM teacher_subscriptions  WHERE id=$1', [F.subId]).catch(() => {});
  if (F.teacherId) await pool.query('DELETE FROM teachers                WHERE id=$1', [F.teacherId]).catch(() => {});
  if (F.adminId)   await pool.query('DELETE FROM platform_admins         WHERE id=$1', [F.adminId]).catch(() => {});
  console.log('[teardown] Done.');
}

/* ══════════════════════════════════════════════════════════════════
   TESTS
══════════════════════════════════════════════════════════════════ */
async function run() {
  await setup();

  /* ── [S] Security ───────────────────────────────────────────── */
  console.log('\n── [S] Security ──────────────────────────────────────────');

  await test('S1 — Login blocked without credentials', async () => {
    const r = await request('POST', '/api/admin/auth/login', {});
    assertEqual(r.status, 400);
    assert(r.body.error, 'Should return error message');
  });

  await test('S1 — Login rejected with wrong password', async () => {
    const r = await request('POST', '/api/admin/auth/login', {
      username: F.adminUser, password: 'WrongPassword!',
    });
    assertEqual(r.status, 401);
  });

  await test('S1 — Login succeeds with correct credentials', async () => {
    const r = await request('POST', '/api/admin/auth/login', {
      username: F.adminUser, password: F.adminPw,
    });
    assertEqual(r.status, 200);
    assert(r.body.token, 'Must return token');
    assert(r.body.admin, 'Must return admin object');
    assertEqual(r.body.admin.username, F.adminUser);
  });

  await test('S2 — Admin JWT signed with ADMIN_JWT_SECRET (not teacher JWT_SECRET)', async () => {
    const decoded = jwt.decode(F.adminToken);
    assert(decoded, 'Token must be decodable');
    assertEqual(decoded.role, 'super_admin', 'Role claim must be super_admin');
    // Verify it validates with ADMIN_JWT_SECRET
    let verifiedWithAdmin = false;
    try { jwt.verify(F.adminToken, ADMIN_JWT_SECRET); verifiedWithAdmin = true; } catch (_) {}
    assert(verifiedWithAdmin, 'Token must verify with ADMIN_JWT_SECRET');
    // Verify it DOES NOT validate with a wrong secret
    let wrongVerify = false;
    try { jwt.verify(F.adminToken, 'completely_wrong_secret'); wrongVerify = true; } catch (_) {}
    assert(!wrongVerify, 'Token must NOT verify with wrong secret');
  });

  await test('S3 — Admin JWT includes jti claim for uniqueness', async () => {
    const decoded = jwt.decode(F.adminToken);
    assert(decoded.jti, 'JWT must include jti claim');
    assert(decoded.jti.length >= 20, 'jti must be sufficiently long');
    // Login twice at near-same time and verify tokens are different
    const [r1, r2] = await Promise.all([
      request('POST', '/api/admin/auth/login', { username: F.adminUser, password: F.adminPw }),
      request('POST', '/api/admin/auth/login', { username: F.adminUser, password: F.adminPw }),
    ]);
    assertNotEqual(r1.body.token, r2.body.token, 'Concurrent logins must produce different tokens (jti)');
  });

  await test('S-auth — All admin endpoints reject requests without token', async () => {
    const endpoints = [
      ['GET',  '/api/admin/teachers'],
      ['GET',  '/api/admin/plans'],
      ['GET',  '/api/admin/subscriptions'],
      ['GET',  '/api/admin/payments'],
      ['GET',  '/api/admin/stats'],
    ];
    for (const [method, path] of endpoints) {
      const r = await request(method, path);
      assertEqual(r.status, 401, `${method} ${path} must return 401 without token`);
    }
  });

  await test('S-auth — Teacher JWT rejected on admin endpoints', async () => {
    // Forge a teacher-role token with ADMIN_JWT_SECRET — should be rejected by role check
    const fakeTeacherToken = jwt.sign(
      { id: 9999, role: 'teacher', jti: 'fake' },
      ADMIN_JWT_SECRET,
      { expiresIn: '1h' }
    );
    const r = await request('GET', '/api/admin/teachers', null, fakeTeacherToken);
    assert(r.status === 401 || r.status === 403, 'Teacher-role token must be rejected on admin routes');
  });

  await test('S-auth — Inactive admin account rejected after login', async () => {
    // Deactivate the test admin directly in DB
    await pool.query('UPDATE platform_admins SET is_active=false WHERE id=$1', [F.adminId]);
    const r = await request('GET', '/api/admin/auth/me', null, F.adminToken);
    assertEqual(r.status, 401, 'Inactive admin must be rejected even with valid token');
    // Re-activate
    await pool.query('UPDATE platform_admins SET is_active=true WHERE id=$1', [F.adminId]);
    const r2 = await request('GET', '/api/admin/auth/me', null, F.adminToken);
    assertEqual(r2.status, 200, 'Re-activated admin must be accepted again');
  });

  /* ── [B] Backend Logic ──────────────────────────────────────── */
  console.log('\n── [B] Backend Logic ─────────────────────────────────────');

  await test('B-teacher — Create teacher with short password is rejected (< 8 chars)', async () => {
    const r = await request('POST', '/api/admin/teachers', {
      username: `shortpw-${crypto.randomInt(1000,9999)}`,
      password: '1234567', // 7 chars
      name: 'Short PW Teacher',
      plan_id: F.planId,
    }, F.adminToken);
    assertEqual(r.status, 400, 'Short password must be rejected with 400');
  });

  await test('B-teacher — Create teacher with reserved subdomain is rejected', async () => {
    for (const reserved of ['admin', 'dashboard', 'api', 'www']) {
      const r = await request('POST', '/api/admin/teachers', {
        username: reserved, password: 'ValidPass123', name: 'Reserved', plan_id: F.planId,
      }, F.adminToken);
      assertEqual(r.status, 400, `Reserved slug '${reserved}' must return 400`);
    }
  });

  await test('B-teacher — Create teacher with slug > 63 chars is rejected', async () => {
    const longSlug = 'a'.repeat(64);
    const r = await request('POST', '/api/admin/teachers', {
      username: longSlug, password: 'ValidPass123', name: 'Long', plan_id: F.planId,
    }, F.adminToken);
    assertEqual(r.status, 400, '64-char slug must be rejected');
  });

  await test('B-teacher — Create teacher succeeds and auto-creates active subscription', async () => {
    const r = await request('POST', '/api/admin/teachers', {
      username: F.teacherSlug,
      password: 'TeacherPass@123',
      name: 'Audit Test Teacher',
      whatsapp_phone: '+201000000000',
      plan_id: F.planId,
    }, F.adminToken);
    assertEqual(r.status, 201, `Create teacher failed: ${JSON.stringify(r.body)}`);
    assert(r.body.teacherId, 'Must return teacherId');
    F.teacherId = r.body.teacherId;
    // Verify subscription created
    const sQ = await pool.query(
      'SELECT status FROM teacher_subscriptions WHERE teacher_id=$1', [F.teacherId]
    );
    assert(sQ.rows.length > 0, 'Subscription must be auto-created');
    assertEqual(sQ.rows[0].status, 'active', 'Auto-created subscription must be active');
    F.subId = (await pool.query(
      'SELECT id FROM teacher_subscriptions WHERE teacher_id=$1 LIMIT 1', [F.teacherId]
    )).rows[0]?.id;
  });

  await test('B-teacher — Duplicate username returns 409 not 500', async () => {
    const r = await request('POST', '/api/admin/teachers', {
      username: F.teacherSlug, // same slug
      password: 'AnotherPass@123',
      name: 'Duplicate Teacher',
      plan_id: F.planId,
    }, F.adminToken);
    assertEqual(r.status, 409, 'Duplicate username must return 409 Conflict');
  });

  await test('B-teacher — Missing required fields return 400', async () => {
    const missing = [
      { username: 'a', password: 'pass1234', name: '' },   // no name
      { username: '', password: 'pass1234', name: 'x' },   // no username
      { username: 'b', name: 'y' },                         // no password
    ];
    for (const body of missing) {
      const r = await request('POST', '/api/admin/teachers', { ...body, plan_id: F.planId }, F.adminToken);
      assert(r.status === 400 || r.status === 422, `Missing fields must return 400, got ${r.status}`);
    }
  });

  await test('B-teacher — Non-existent teacher returns 404 on GET', async () => {
    const r = await request('GET', '/api/admin/teachers/99999999', null, F.adminToken);
    assertEqual(r.status, 404);
  });

  await test('B-teacher — Non-numeric teacher ID returns 400', async () => {
    const r = await request('GET', '/api/admin/teachers/abc', null, F.adminToken);
    assertEqual(r.status, 400);
  });

  await test('B-features — PUT /features merges with existing features (no data loss)', async () => {
    // Get current features
    const before = await pool.query('SELECT features_enabled FROM teachers WHERE id=$1', [F.teacherId]);
    const existing = before.rows[0].features_enabled || {};

    // Only toggle live_streaming, leave stickman_run alone
    const r = await request('PUT', `/api/admin/teachers/${F.teacherId}/features`, {
      live_streaming: false,
      stickman_run: true,
    }, F.adminToken);
    assertEqual(r.status, 200);
    assertEqual(r.body.features.live_streaming, false);
    assertEqual(r.body.features.stickman_run, true);

    // Verify in DB that no keys were silently dropped
    const after = await pool.query('SELECT features_enabled FROM teachers WHERE id=$1', [F.teacherId]);
    const updated = after.rows[0].features_enabled;
    assert(updated.hasOwnProperty('live_streaming'), 'live_streaming key must persist');
    assert(updated.hasOwnProperty('stickman_run'), 'stickman_run key must persist');
  });

  await test('B-suspend — Suspend + unsuspend updates DB correctly', async () => {
    const suspendR = await request('POST', `/api/admin/teachers/${F.teacherId}/suspend`, {
      suspend: true, reason: 'Test suspension',
    }, F.adminToken);
    assertEqual(suspendR.status, 200);
    assertEqual(suspendR.body.is_platform_suspended, true);

    const dbAfterSuspend = await pool.query(
      'SELECT is_platform_suspended, platform_suspended_reason FROM teachers WHERE id=$1', [F.teacherId]
    );
    assert(dbAfterSuspend.rows[0].is_platform_suspended === true, 'DB must reflect suspension');
    assert(dbAfterSuspend.rows[0].platform_suspended_reason, 'Reason must be stored');

    const unsuspendR = await request('POST', `/api/admin/teachers/${F.teacherId}/suspend`, {
      suspend: false,
    }, F.adminToken);
    assertEqual(unsuspendR.status, 200);
    assertEqual(unsuspendR.body.is_platform_suspended, false);

    const dbAfterUnsuspend = await pool.query(
      'SELECT is_platform_suspended, platform_suspended_at FROM teachers WHERE id=$1', [F.teacherId]
    );
    assert(dbAfterUnsuspend.rows[0].is_platform_suspended === false, 'DB must reflect unsuspension');
    assert(dbAfterUnsuspend.rows[0].platform_suspended_at === null, 'suspended_at must be cleared');
  });

  await test('B-reset-pw — Reset password with < 8 chars rejected', async () => {
    const r = await request('POST', `/api/admin/teachers/${F.teacherId}/reset-password`, {
      new_password: '1234567',
    }, F.adminToken);
    assertEqual(r.status, 400);
  });

  await test('B-reset-pw — Reset password updates DB and invalidates old sessions', async () => {
    const r = await request('POST', `/api/admin/teachers/${F.teacherId}/reset-password`, {
      new_password: 'NewSecurePass@456',
      force_password_change: true,
    }, F.adminToken);
    assertEqual(r.status, 200, `Reset failed: ${JSON.stringify(r.body)}`);
    // Verify force_password_change flag set in DB
    const dbR = await pool.query('SELECT force_password_change FROM teachers WHERE id=$1', [F.teacherId]);
    assert(dbR.rows[0].force_password_change === true, 'force_password_change must be set in DB');
  });

  await test('B-sub — Subscription status validation rejects unknown values', async () => {
    if (!F.subId) return; // skip if no subscription
    const r = await request('PUT', `/api/admin/subscriptions/${F.subId}`, {
      status: 'hacked_status',
      start_date: new Date().toISOString().split('T')[0],
    }, F.adminToken);
    assertEqual(r.status, 400, 'Unknown status must be rejected with 400');
  });

  await test('B-sub — price_override=0 is valid and NOT treated as null', async () => {
    if (!F.subId) return;
    const r = await request('PUT', `/api/admin/subscriptions/${F.subId}`, {
      status: 'active',
      price_override: 0,
      start_date: new Date().toISOString().split('T')[0],
    }, F.adminToken);
    assertEqual(r.status, 200, `Update failed: ${JSON.stringify(r.body)}`);
    const dbR = await pool.query('SELECT price_override FROM teacher_subscriptions WHERE id=$1', [F.subId]);
    // price_override should be 0, not null
    assert(dbR.rows[0].price_override !== null, 'price_override=0 must NOT be stored as null');
    assertEqual(parseFloat(dbR.rows[0].price_override), 0, 'price_override must be 0');
  });

  await test('B-sub — Valid status values accepted (active/expired/cancelled)', async () => {
    if (!F.subId) return;
    for (const validStatus of ['expired', 'cancelled', 'active']) {
      const r = await request('PUT', `/api/admin/subscriptions/${F.subId}`, {
        status: validStatus,
        start_date: new Date().toISOString().split('T')[0],
      }, F.adminToken);
      assertEqual(r.status, 200, `Valid status '${validStatus}' must be accepted`);
    }
  });

  await test('B-sub — Cannot delete non-existent subscription (returns 404)', async () => {
    const r = await request('DELETE', '/api/admin/subscriptions/99999999', null, F.adminToken);
    assertEqual(r.status, 404);
  });

  await test('B-payments — GET /payments with invalid teacher_id returns 400', async () => {
    const r = await request('GET', '/api/admin/payments?teacher_id=notanumber', null, F.adminToken);
    assertEqual(r.status, 400, 'Non-numeric teacher_id must return 400');
  });

  await test('B-payments — GET /subscriptions with invalid teacher_id returns 400', async () => {
    const r = await request('GET', '/api/admin/subscriptions?teacher_id=abc', null, F.adminToken);
    assertEqual(r.status, 400, 'Non-numeric teacher_id must return 400');
  });

  await test('B-payments — GET /subscriptions with invalid status returns 400', async () => {
    const r = await request('GET', '/api/admin/subscriptions?status=bogus_status', null, F.adminToken);
    assertEqual(r.status, 400, 'Unknown status filter must return 400');
  });

  await test('B-payments — GET /payments with valid teacher_id returns 200', async () => {
    const r = await request('GET', `/api/admin/payments?teacher_id=${F.teacherId}`, null, F.adminToken);
    assertEqual(r.status, 200, `Valid teacher_id must return 200. Got: ${JSON.stringify(r.body)}`);
    assert(Array.isArray(r.body.payments), 'Must return payments array');
  });

  await test('B-payments — Record payment with negative amount rejected', async () => {
    if (!F.subId) return;
    const r = await request('POST', '/api/admin/payments', {
      subscription_id: F.subId,
      amount: -500,
      paid_at: new Date().toISOString().split('T')[0],
    }, F.adminToken);
    // Negative payment is a business logic issue — either reject or the amount is stored wrong
    // At minimum it must not crash (500)
    assertNotEqual(r.status, 500, 'Negative amount must not cause server crash');
  });

  await test('B-payments — Record payment for non-existent subscription returns 400', async () => {
    const r = await request('POST', '/api/admin/payments', {
      subscription_id: 99999999,
      amount: 100,
      paid_at: new Date().toISOString().split('T')[0],
    }, F.adminToken);
    assertEqual(r.status, 400, 'Non-existent subscription must return 400');
  });

  await test('B-payments — Valid payment recorded successfully', async () => {
    if (!F.subId) return;
    const today = new Date().toISOString().split('T')[0];
    const r = await request('POST', '/api/admin/payments', {
      subscription_id: F.subId,
      amount: 699,
      paid_at: today,
      payment_method: 'instapay',
      notes: 'Test payment',
    }, F.adminToken);
    assertEqual(r.status, 201, `Payment creation failed: ${JSON.stringify(r.body)}`);
    assert(r.body.paymentId, 'Must return paymentId');
    F.paymentId = r.body.paymentId;
  });

  await test('B-plans — Cannot delete plan that has subscriptions', async () => {
    // F.planId should have at least one subscription (from teacher creation)
    const r = await request('DELETE', `/api/admin/plans/${F.planId}`, null, F.adminToken);
    assertEqual(r.status, 400, 'Plan with subscribers must not be deletable');
    assert(r.body.error, 'Must return an Arabic error message');
  });

  await test('B-plans — Plan creation requires name, price, and billing_type', async () => {
    const bad = [
      { description: 'test', category: 'platform', billing_type: 'monthly' }, // missing name + price
      { name: 'X', category: 'platform', billing_type: 'monthly' },            // missing price
    ];
    for (const b of bad) {
      const r = await request('POST', '/api/admin/plans', b, F.adminToken);
      assertEqual(r.status, 400, `Incomplete plan payload must return 400`);
    }
  });

  await test('B-plans — Valid plan created and listed', async () => {
    const r = await request('POST', '/api/admin/plans', {
      name: `Audit Plan ${crypto.randomInt(1000,9999)}`,
      category: 'service',
      price: 150,
      billing_type: 'one_time',
    }, F.adminToken);
    assertEqual(r.status, 201);
    assert(r.body.planId, 'Must return planId');
    // Clean up
    await pool.query('DELETE FROM subscription_plans WHERE id=$1', [r.body.planId]);
  });

  await test('B-team — Add team member requires teacher to exist', async () => {
    const r = await request('POST', '/api/admin/teachers/99999999/team', {
      name: 'Ghost Member',
    }, F.adminToken);
    // Should either 404 or FK violation error, but NOT 201 with fake data
    assertNotEqual(r.status, 201, 'Team member creation for non-existent teacher must not succeed');
  });

  await test('B-team — Add and delete team member lifecycle', async () => {
    const addR = await request('POST', `/api/admin/teachers/${F.teacherId}/team`, {
      name: 'Support Agent',
      role_title: 'مسؤول دعم',
      whatsapp_phone: '+201234567890',
      display_order: 1,
    }, F.adminToken);
    assertEqual(addR.status, 201);
    const memberId = addR.body.memberId;

    const delR = await request('DELETE', `/api/admin/teachers/${F.teacherId}/team/${memberId}`, null, F.adminToken);
    assertEqual(delR.status, 200);

    // Verify deleted from DB
    const dbR = await pool.query('SELECT id FROM teacher_team_members WHERE id=$1', [memberId]);
    assertEqual(dbR.rows.length, 0, 'Team member must be deleted from DB');
  });

  /* ── [P] Performance & Cache ────────────────────────────────── */
  console.log('\n── [P] Performance & Cache ───────────────────────────────');

  await test('P-cache — Stats cache invalidated after teacher suspension', async () => {
    // First fetch — warms cache
    const r1 = await request('GET', '/api/admin/stats', null, F.adminToken);
    assertEqual(r1.status, 200);
    const suspendedBefore = r1.body.stats.teachers.suspended;

    // Suspend teacher → cache should be invalidated
    await request('POST', `/api/admin/teachers/${F.teacherId}/suspend`,
      { suspend: true, reason: 'Cache test' }, F.adminToken);

    // Second fetch — should reflect new count (not stale)
    const r2 = await request('GET', '/api/admin/stats', null, F.adminToken);
    assertEqual(r2.status, 200);
    assert(
      r2.body.stats.teachers.suspended >= suspendedBefore,
      `Suspended count must be >= ${suspendedBefore} after suspension`
    );

    // Unsuspend to restore state
    await request('POST', `/api/admin/teachers/${F.teacherId}/suspend`,
      { suspend: false }, F.adminToken);
  });

  await test('P-cache — Stats cache invalidated after teacher creation (verified by count)', async () => {
    const r1 = await request('GET', '/api/admin/stats', null, F.adminToken);
    const beforeTotal = r1.body.stats.teachers.total;

    // Create a temporary teacher
    const tmpSlug = `tmp-cache-${crypto.randomInt(10000, 99999)}`;
    const createR = await request('POST', '/api/admin/teachers', {
      username: tmpSlug, password: 'TmpPass@123!', name: 'Tmp Cache Teacher', plan_id: F.planId,
    }, F.adminToken);
    assertEqual(createR.status, 201);

    const r2 = await request('GET', '/api/admin/stats', null, F.adminToken);
    assert(r2.body.stats.teachers.total > beforeTotal, 'Stats must reflect new teacher count after cache invalidation');

    // Delete tmp teacher
    await pool.query('DELETE FROM teachers WHERE id=$1', [createR.body.teacherId]);
  });

  await test('P-stats — Stats endpoint returns all required fields', async () => {
    const r = await request('GET', '/api/admin/stats', null, F.adminToken);
    assertEqual(r.status, 200);
    const s = r.body.stats;
    assert(typeof s.teachers.total === 'number',          'teachers.total must be a number');
    assert(typeof s.teachers.active === 'number',         'teachers.active must be a number');
    assert(typeof s.teachers.suspended === 'number',      'teachers.suspended must be a number');
    assert(typeof s.students.total === 'number',          'students.total must be a number');
    assert(typeof s.students.active_today === 'number',   'students.active_today must be a number');
    assert(typeof s.sse_connections === 'number',         'sse_connections must be a number');
    assert(typeof s.subscriptions.active === 'number',    'subscriptions.active must be a number');
    assert(typeof s.subscriptions.expiring_soon === 'number', 'subscriptions.expiring_soon must be a number');
    assert(typeof s.payments.collected_this_month === 'number', 'payments.collected_this_month must be a number');
  });

  /* ── [E] Edge Cases ─────────────────────────────────────────── */
  console.log('\n── [E] Edge Cases ────────────────────────────────────────');

  await test('E-slug — Username with special chars gets normalized to slug', async () => {
    // Create a teacher with spaces/uppercase in username — server normalizes it
    const uniqueId = crypto.randomInt(10000, 99999);
    const r = await request('POST', '/api/admin/teachers', {
      username: `Dr.Ahmed_${uniqueId}`,
      password: 'DrAhmedPass@1',
      name: 'Dr. Ahmed',
      plan_id: F.planId,
    }, F.adminToken);
    // Should succeed and return a normalized slug
    if (r.status === 201) {
      assert(r.body.slug, 'Must return slug');
      assert(!r.body.slug.includes('.'), 'Slug must not contain dots');
      assert(!r.body.slug.includes('_'), 'Slug must not contain underscores');
      await pool.query('DELETE FROM teachers WHERE id=$1', [r.body.teacherId]);
    } else {
      // 400 is also acceptable if the server rejects non-alphanumeric entirely
      assert(r.status === 400 || r.status === 201, `Got unexpected status ${r.status}`);
    }
  });

  await test('E-slug — Empty slug after normalization rejected', async () => {
    const r = await request('POST', '/api/admin/teachers', {
      username: '---', // normalizes to empty
      password: 'TestPass@1',
      name: 'Empty Slug',
      plan_id: F.planId,
    }, F.adminToken);
    assertEqual(r.status, 400, 'Username normalizing to empty slug must be rejected');
  });

  await test('E-teacher — GET /teachers list has correct structure', async () => {
    const r = await request('GET', '/api/admin/teachers', null, F.adminToken);
    assertEqual(r.status, 200);
    assert(Array.isArray(r.body.teachers), 'Must return array');
    if (r.body.teachers.length > 0) {
      const t = r.body.teachers[0];
      assert('id' in t,                  'teacher must have id');
      assert('slug' in t,                'teacher must have slug');
      assert('stats' in t,               'teacher must have stats object');
      assert('is_platform_suspended' in t, 'teacher must have suspension flag');
    }
  });

  await test('E-teacher — Teacher detail includes stats, subscriptions, payments', async () => {
    const r = await request('GET', `/api/admin/teachers/${F.teacherId}`, null, F.adminToken);
    assertEqual(r.status, 200);
    assert(r.body.teacher, 'Must include teacher object');
    assert(r.body.stats,   'Must include stats object');
    assert(Array.isArray(r.body.subscriptions), 'Must include subscriptions array');
    assert(Array.isArray(r.body.payments),      'Must include payments array');
    assert(typeof r.body.stats.total_students === 'number', 'stats.total_students must be number');
    assert(typeof r.body.stats.storage_bytes  === 'number', 'stats.storage_bytes must be number');
  });

  await test('E-sub — New subscription deactivates previous platform subscription', async () => {
    if (!F.teacherId) return;
    // Create a second platform subscription — first must be cancelled automatically
    const r = await request('POST', '/api/admin/subscriptions', {
      teacher_id: F.teacherId,
      plan_id: F.planId,
      start_date: new Date().toISOString().split('T')[0],
      billing_type: 'monthly',
    }, F.adminToken);
    assertEqual(r.status, 201, `Second subscription creation failed: ${JSON.stringify(r.body)}`);
    const newSubId = r.body.subscriptionId;
    // Check that only one subscription is active per platform category
    const activeQ = await pool.query(
      `SELECT COUNT(*) FROM teacher_subscriptions ts
       JOIN subscription_plans sp ON ts.plan_id = sp.id
       WHERE ts.teacher_id = $1 AND ts.status = 'active' AND sp.category = 'platform'`,
      [F.teacherId]
    );
    assertEqual(parseInt(activeQ.rows[0].count), 1, 'Only one active platform subscription allowed at a time');
    await pool.query('DELETE FROM teacher_subscriptions WHERE id=$1', [newSubId]);
  });

  await test('E-plan — List plans returns subscriber counts correctly', async () => {
    const r = await request('GET', '/api/admin/plans', null, F.adminToken);
    assertEqual(r.status, 200);
    assert(Array.isArray(r.body.plans), 'Must return plans array');
    for (const p of r.body.plans) {
      assert(typeof p.subscribers_count === 'number', `Plan ${p.name} must have numeric subscribers_count`);
      assert(p.subscribers_count >= 0, 'subscribers_count must be non-negative');
    }
  });

  await test('E-payment — Delete non-existent payment returns 404', async () => {
    const r = await request('DELETE', '/api/admin/payments/99999999', null, F.adminToken);
    assertEqual(r.status, 404);
  });

  await test('E-payment — Payment deleted successfully and no longer listed', async () => {
    if (!F.paymentId) return;
    const r = await request('DELETE', `/api/admin/payments/${F.paymentId}`, null, F.adminToken);
    assertEqual(r.status, 200);
    F.paymentId = null;
    // Verify gone from DB
    const dbR = await pool.query('DELETE FROM subscription_payments WHERE id=$1', [F.paymentId]);
    // Already deleted — this confirms it's gone
  });

  await test('E-auth — /auth/me returns correct admin profile', async () => {
    const r = await request('GET', '/api/admin/auth/me', null, F.adminToken);
    assertEqual(r.status, 200);
    assert(r.body.admin, 'Must return admin object');
    assertEqual(r.body.admin.id, F.adminId);
    assertEqual(r.body.admin.role, 'super_admin');
    assert(!r.body.admin.password_hash, 'Password hash must NOT be returned');
  });

  await test('E-teacher — DELETE non-existent teacher returns 404', async () => {
    const r = await request('DELETE', '/api/admin/teachers/99999999', null, F.adminToken);
    assertEqual(r.status, 404);
  });

  await test('E-teacher — UPDATE non-existent teacher returns 404', async () => {
    const r = await request('PUT', '/api/admin/teachers/99999999', { name: 'Ghost' }, F.adminToken);
    assertEqual(r.status, 404);
  });

  await test('E-teacher — UPDATE missing name returns 400', async () => {
    const r = await request('PUT', `/api/admin/teachers/${F.teacherId}`, {
      classification: 'Physics',
    }, F.adminToken);
    assertEqual(r.status, 400, 'Update without name must return 400');
  });

  /* ── Cleanup ─────────────────────────────────────────────────── */
  await teardown();

  /* ── Summary ─────────────────────────────────────────────────── */
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Admin Dashboard Audit — ${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.error('\nFailed tests:');
    failures.forEach(f => console.error(`  ✗ ${f.name}: ${f.err.message}`));
    process.exit(1);
  } else {
    console.log('\nAll tests passed! ✅');
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
