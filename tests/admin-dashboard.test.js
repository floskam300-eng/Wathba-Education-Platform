'use strict';
require('dotenv').config();
const pool = require('../server/db/connection');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || (JWT_SECRET + '_admin');
const PORT = parseInt(process.env.PORT || '3001', 10);

let passed = 0, failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌  ${name}\n       ${e.stack}`);
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

function request(method, urlPath, body, token, extraHeaders) {
  return new Promise((resolve, reject) => {
    const data = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const headers = {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      ...(extraHeaders || {}),
    };
    const opts = {
      hostname: 'localhost', port: PORT, path: urlPath, method, headers,
    };
    const req = http.request(opts, (res) => {
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

// Global fixtures
const Fixtures = {
  adminUsername: `t_admin_${crypto.randomInt(1000, 9999)}`,
  adminPassword: 'SuperAdminPassword123!',
  adminId: null,
  adminToken: null,
  teacherId: null,
  teacherSlug: `test-tch-${crypto.randomInt(1000, 9999)}`,
  planId: null,
};

async function setup() {
  console.log('[setup] Preparing admin dashboard test fixtures ...');
  
  // Insert test admin
  const pwHash = await bcrypt.hash(Fixtures.adminPassword, 10);
  const adminRes = await pool.query(
    'INSERT INTO platform_admins (username, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id',
    [Fixtures.adminUsername, pwHash, 'Test System Admin', 'super_admin']
  );
  Fixtures.adminId = adminRes.rows[0].id;

  // Insert standard plan if none exists
  const planCheck = await pool.query('SELECT id FROM subscription_plans WHERE category = \'platform\' LIMIT 1');
  if (planCheck.rows.length > 0) {
    Fixtures.planId = planCheck.rows[0].id;
  } else {
    const planRes = await pool.query(
      `INSERT INTO subscription_plans (name, category, price, billing_type)
       VALUES ('Test Basic Plan', 'platform', 500.00, 'monthly') RETURNING id`
    );
    Fixtures.planId = planRes.rows[0].id;
  }
}

async function teardown() {
  console.log('[teardown] Cleaning up test fixtures ...');
  if (Fixtures.teacherId) {
    await pool.query('DELETE FROM teachers WHERE id = $1', [Fixtures.teacherId]);
  }
  if (Fixtures.adminId) {
    await pool.query('DELETE FROM platform_admins WHERE id = $1', [Fixtures.adminId]);
  }
}

async function run() {
  console.log('Starting Admin Dashboard Integration Tests...\n');
  await setup();

  // Test 1: Admin Login success and failure
  await test('POST /api/admin/auth/login - should fail with wrong credentials', async () => {
    const res = await request('POST', '/api/admin/auth/login', {
      username: Fixtures.adminUsername,
      password: 'WrongPassword!',
    });
    assertEqual(res.status, 401, 'Wrong credentials should return 401');
    assert(res.body.error, 'Should contain error message');
  });

  await test('POST /api/admin/auth/login - should succeed and return JWT', async () => {
    const res = await request('POST', '/api/admin/auth/login', {
      username: Fixtures.adminUsername,
      password: Fixtures.adminPassword,
    });
    assertEqual(res.status, 200, 'Correct credentials should return 200');
    assert(res.body.token, 'Should return a token');
    assertEqual(res.body.admin.username, Fixtures.adminUsername);
    Fixtures.adminToken = res.body.token;
  });

  // Test 2: JWT and role validation
  await test('GET /api/admin/auth/me - should reject request without token', async () => {
    const res = await request('GET', '/api/admin/auth/me');
    assertEqual(res.status, 401, 'Request without token should return 401');
  });

  await test('GET /api/admin/auth/me - should succeed with valid admin token', async () => {
    const res = await request('GET', '/api/admin/auth/me', null, Fixtures.adminToken);
    assertEqual(res.status, 200);
    assertEqual(res.body.admin.id, Fixtures.adminId);
  });

  // Test 3: Get Platform overall stats
  await test('GET /api/admin/stats - should return platform summary stats', async () => {
    const res = await request('GET', '/api/admin/stats', null, Fixtures.adminToken);
    assertEqual(res.status, 200);
    assert(res.body.stats, 'Should contain stats field');
    assert(typeof res.body.stats.teachers.total === 'number');
    assert(typeof res.body.stats.students.total === 'number');
    assert(typeof res.body.stats.sse_connections === 'number');
  });

  // Test 4: Create new Teacher (tenant)
  await test('POST /api/admin/teachers - should create a new teacher tenant', async () => {
    const teacherData = {
      username: Fixtures.teacherSlug,
      password: 'TeacherPassword123!',
      name: 'Dr. Test Teacher',
      classification: 'Physics Teacher',
      whatsapp_phone: '+201122334455',
      bio: 'Professional Physics Tutor',
      plan_id: Fixtures.planId,
    };
    const res = await request('POST', '/api/admin/teachers', teacherData, Fixtures.adminToken);
    assertEqual(res.status, 201, 'Successful creation should return 201');
    assert(res.body.success, 'Success flag should be true');
    assert(res.body.teacherId, 'Should return created teacher ID');
    Fixtures.teacherId = res.body.teacherId;

    // Check in database that subscription is active
    const subCheck = await pool.query('SELECT status FROM teacher_subscriptions WHERE teacher_id = $1', [Fixtures.teacherId]);
    assertEqual(subCheck.rows.length, 1, 'Should create exactly one subscription');
    assertEqual(subCheck.rows[0].status, 'active', 'Subscription status should be active');
  });

  // Test 5: Verify new teacher can log in and access courses (tenant check)
  let teacherJwtToken = null;
  await test('POST /api/auth/login - newly created teacher should be able to log in', async () => {
    const loginRes = await request('POST', '/api/auth/login', {
      username: Fixtures.teacherSlug,
      password: 'TeacherPassword123!',
      role: 'teacher',
    }, null, { 'X-Tenant-Slug': Fixtures.teacherSlug });
    assertEqual(loginRes.status, 200);
    assert(loginRes.body.token, 'Should return JWT token for teacher');
    teacherJwtToken = loginRes.body.token;
  });

  // Test 6: Toggle Platform Suspension
  await test('POST /api/admin/teachers/:id/suspend - should deactivate platform', async () => {
    // Suspend
    const suspendRes = await request('POST', `/api/admin/teachers/${Fixtures.teacherId}/suspend`, {
      suspend: true,
      reason: 'عدم سداد الفواتير الشهرية للمنصة',
    }, Fixtures.adminToken);
    assertEqual(suspendRes.status, 200);
    assertEqual(suspendRes.body.is_platform_suspended, true);

    // Try to access teacher's courses endpoint with the teacher's token -> should be blocked with 403
    const apiRes = await request('GET', '/api/courses', null, teacherJwtToken, { 'X-Tenant-Slug': Fixtures.teacherSlug });
    assertEqual(apiRes.status, 403, `Suspended platform should block API access with 403. Got status: ${apiRes.status}, body: ${JSON.stringify(apiRes.body)}`);
    assertEqual(apiRes.body.error, 'هذه المنصة موقوفة مؤقتاً', 'Should return suspended error message');
  });

  await test('POST /api/admin/teachers/:id/suspend - should reactivate platform', async () => {
    // Unsuspend
    const unsuspendRes = await request('POST', `/api/admin/teachers/${Fixtures.teacherId}/suspend`, {
      suspend: false,
    }, Fixtures.adminToken);
    assertEqual(unsuspendRes.status, 200);
    assertEqual(unsuspendRes.body.is_platform_suspended, false);

    // Try to access teacher's courses endpoint again -> should succeed with 200
    const apiRes = await request('GET', '/api/courses', null, teacherJwtToken, { 'X-Tenant-Slug': Fixtures.teacherSlug });
    assertEqual(apiRes.status, 200, `Reactivated platform should allow API access. Got status: ${apiRes.status}, body: ${JSON.stringify(apiRes.body)}`);
  });

  // Test 7: Verify feature flag constraints (live streaming, events)
  await test('PUT /api/admin/teachers/:id/features - toggle stickman run feature off', async () => {
    // Disable events feature
    const res = await request('PUT', `/api/admin/teachers/${Fixtures.teacherId}/features`, {
      live_streaming: true,
      stickman_run: false,
    }, Fixtures.adminToken);
    assertEqual(res.status, 200);
    assertEqual(res.body.features.stickman_run, false);

    // Call events status endpoint -> should return 403
    const eventsRes = await request('GET', '/api/events/weekly-run/status', null, teacherJwtToken, { 'X-Tenant-Slug': Fixtures.teacherSlug });
    assertEqual(eventsRes.status, 403, `Disabled stickman run feature should block access with 403. Got status: ${eventsRes.status}, body: ${JSON.stringify(eventsRes.body)}`);
    assertEqual(eventsRes.body.error, 'خاصية الفعاليات غير مفعلة لهذه المنصة');
  });

  // Test 8: Delete teacher tenant
  await test('DELETE /api/admin/teachers/:id - should delete teacher and cascade all data', async () => {
    const res = await request('DELETE', `/api/admin/teachers/${Fixtures.teacherId}`, null, Fixtures.adminToken);
    assertEqual(res.status, 200);
    
    // Check database
    const dbCheck = await pool.query('SELECT id FROM teachers WHERE id = $1', [Fixtures.teacherId]);
    assertEqual(dbCheck.rows.length, 0, 'Teacher should be deleted from DB');
    Fixtures.teacherId = null; // Prevent double delete in teardown
  });

  await teardown();
  console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
  if (failures.length > 0) {
    console.error('\nTest Failures:');
    failures.forEach((f) => console.error(`  - ${f.name}: ${f.err.message}`));
    process.exit(1);
  } else {
    console.log('\nAll tests passed successfully! 🎉');
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
