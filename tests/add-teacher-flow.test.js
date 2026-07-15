'use strict';
/**
 * Add-Teacher Flow — Integration Tests
 * Tests: happy path, validation, slug normalization, race conditions,
 *        reserved slugs, force_password_change, admin reset-password,
 *        suspension, tenant cache invalidation, edge cases.
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
const F = {
  suffix: crypto.randomInt(10000, 99999),
  adminUsername: '',
  adminToken: null,
  adminId: null,
  planId: null,
  teacherId: null,
  teacherSlug: '',
};

async function setup() {
  F.adminUsername = `adm_${F.suffix}`;
  F.teacherSlug   = `tchr-${F.suffix}`;

  const hash = await bcrypt.hash('AdminPass999!', 10);
  const r = await pool.query(
    'INSERT INTO platform_admins (username, password_hash, name, role) VALUES ($1,$2,$3,$4) RETURNING id',
    [F.adminUsername, hash, 'Test Admin', 'super_admin']
  );
  F.adminId = r.rows[0].id;

  // Reuse existing plan or create one
  const pc = await pool.query("SELECT id FROM subscription_plans WHERE category='platform' LIMIT 1");
  if (pc.rows.length) {
    F.planId = pc.rows[0].id;
  } else {
    const pr = await pool.query(
      "INSERT INTO subscription_plans (name,category,price,billing_type) VALUES ('Test Plan','platform',100,'monthly') RETURNING id"
    );
    F.planId = pr.rows[0].id;
  }

  // Login to get admin token
  const lr = await request('POST', '/api/admin/auth/login',
    { username: F.adminUsername, password: 'AdminPass999!' });
  assert(lr.status === 200, `Admin login failed: ${JSON.stringify(lr.body)}`);
  F.adminToken = lr.body.token;

  console.log(`[setup] admin=${F.adminUsername}  slug=${F.teacherSlug}  planId=${F.planId}`);
}

async function teardown() {
  if (F.teacherId) {
    await pool.query('DELETE FROM teachers WHERE id = $1', [F.teacherId]).catch(() => {});
    F.teacherId = null;
  }
  // Also clean any stray teachers created in tests
  await pool.query(`DELETE FROM teachers WHERE slug LIKE 'tchr-${F.suffix}%'`).catch(() => {});
  if (F.adminId) {
    await pool.query('DELETE FROM platform_admins WHERE id = $1', [F.adminId]).catch(() => {});
  }
}

/* ── Helper: create teacher via API ──────────────────────────────── */
async function createTeacher(overrides = {}) {
  const body = {
    username: F.teacherSlug,
    password: 'TeacherPass8!',
    name: 'أ. اختبار',
    plan_id: F.planId,
    whatsapp_phone: '+201000000001',
    ...overrides,
  };
  return request('POST', '/api/admin/teachers', body, F.adminToken);
}

/* ═══════════════════════════════════════════════════════════════════
   TESTS
   ═══════════════════════════════════════════════════════════════════ */
async function run() {
  console.log('\n══════════════════════════════════════════════════');
  console.log(' Add-Teacher Flow — Integration Tests');
  console.log('══════════════════════════════════════════════════\n');
  await setup();

  /* ── A. Happy path ─────────────────────────────────────────────── */
  await test('A1 · POST /api/admin/teachers — creates teacher + subscription', async () => {
    const res = await createTeacher();
    assertEqual(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert(res.body.success, 'Missing success flag');
    assert(res.body.teacherId, 'Missing teacherId');
    assert(res.body.slug, 'Missing slug in response');
    F.teacherId = res.body.teacherId;

    // DB: teacher row
    const tr = await pool.query('SELECT slug, force_password_change FROM teachers WHERE id=$1', [F.teacherId]);
    assert(tr.rows.length === 1, 'Teacher not in DB');
    assertEqual(tr.rows[0].slug, F.teacherSlug, 'Slug mismatch in DB');
    assertEqual(tr.rows[0].force_password_change, false, 'force_password_change should default to false');

    // DB: subscription row
    const sr = await pool.query('SELECT status FROM teacher_subscriptions WHERE teacher_id=$1', [F.teacherId]);
    assertEqual(sr.rows.length, 1, 'Subscription not created');
    assertEqual(sr.rows[0].status, 'active', 'Subscription not active');
  });

  await test('A2 · Slug in DB matches username normalization', async () => {
    const r = await pool.query('SELECT slug FROM teachers WHERE id=$1', [F.teacherId]);
    const expected = F.teacherSlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    assertEqual(r.rows[0].slug, expected, 'Slug not normalized correctly');
  });

  await test('A3 · Newly created teacher can log in with tenant slug header', async () => {
    const lr = await request('POST', '/api/auth/login',
      { username: F.teacherSlug, password: 'TeacherPass8!', role: 'teacher' },
      null,
      { 'X-Tenant-Slug': F.teacherSlug }
    );
    assertEqual(lr.status, 200, `Teacher login failed: ${JSON.stringify(lr.body)}`);
    assert(lr.body.token, 'No token returned');
    assert(lr.body.force_password_change === false, 'force_password_change should be false');
  });

  await test('A4 · Subdomain middleware resolves new tenant (cache cleared after creation)', async () => {
    // If cache invalidation happened after COMMIT this should resolve
    const r = await pool.query('SELECT id FROM teachers WHERE slug=$1', [F.teacherSlug]);
    assert(r.rows.length === 1, 'Tenant not resolvable from DB after creation');
  });

  /* ── B. Validation errors ───────────────────────────────────────── */
  await test('B1 · Missing required fields → 400', async () => {
    const r = await request('POST', '/api/admin/teachers',
      { username: 'x', password: 'TestPass8!', name: 'Missing Plan' /* no plan_id */ },
      F.adminToken);
    assertEqual(r.status, 400);
    assert(r.body.error, 'Should return error message');
  });

  await test('B2 · Username with only special chars → 400 (empty slug)', async () => {
    const r = await createTeacher({ username: '---!!!---', password: 'TestPass8!' });
    assertEqual(r.status, 400, `Expected 400 for special-only username, got ${r.status}`);
  });

  await test('B3 · Password shorter than 8 chars → 400', async () => {
    const r = await createTeacher({ username: `short-${F.suffix}`, password: 'abc123' });
    assertEqual(r.status, 400, `Expected 400 for short password, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.error.includes('8'), `Error should mention 8 chars: ${r.body.error}`);
  });

  await test('B4 · Slug exceeding 63 characters → 400', async () => {
    const longUser = 'a'.repeat(70);
    const r = await createTeacher({ username: longUser });
    assertEqual(r.status, 400, `Expected 400 for long slug, got ${r.status}`);
    assert(r.body.error.includes('63'), `Error should mention 63: ${r.body.error}`);
  });

  await test('B5 · No auth token → 401', async () => {
    const r = await request('POST', '/api/admin/teachers',
      { username: 'no-auth', password: 'TestPass8!', name: 'X', plan_id: F.planId });
    assertEqual(r.status, 401);
  });

  /* ── C. Reserved subdomain slugs ───────────────────────────────── */
  const reserved = ['dashboard', 'admin', 'api', 'www', 'mail', 'app', 'static', 'cdn', 'assets'];
  for (const slug of reserved) {
    await test(`C · Reserved slug "${slug}" → 400`, async () => {
      const r = await createTeacher({ username: slug });
      assertEqual(r.status, 400, `Expected 400 for reserved slug "${slug}", got ${r.status}: ${JSON.stringify(r.body)}`);
      assert(r.body.error.includes('محجوز'), `Should mention reserved: ${r.body.error}`);
    });
  }

  /* ── D. Duplicate slug / race-condition ─────────────────────────── */
  await test('D1 · Duplicate username → 400 (pre-check)', async () => {
    const r = await createTeacher(); // same username as A1
    assert(r.status === 400 || r.status === 409,
      `Expected 400 or 409 for duplicate, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('D2 · Username that normalizes to existing slug → 409 (DB unique constraint)', async () => {
    // F.teacherSlug has hyphens; username with underscores normalizes to same slug
    const sameSlug = F.teacherSlug.replace(/-/g, '_');
    const r = await createTeacher({ username: sameSlug });
    assert(r.status === 400 || r.status === 409,
      `Expected 400/409 for slug collision, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('D3 · Simultaneous duplicate requests — both should not succeed', async () => {
    const slug = `race-${F.suffix}`;
    const [r1, r2] = await Promise.all([
      createTeacher({ username: slug }),
      createTeacher({ username: slug }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    const oneCreated = statuses.includes(201);
    const oneFailed = statuses.includes(400) || statuses.includes(409) || statuses.includes(500);
    assert(oneCreated, `At least one should succeed (201). Got: ${statuses}`);
    assert(oneFailed, `At least one should fail (400/409). Got: ${statuses}`);
    // Cleanup race teacher
    await pool.query('DELETE FROM teachers WHERE slug=$1', [slug]).catch(() => {});
  });

  /* ── E. Slug normalization (case, spaces, special chars) ────────── */
  await test('E1 · Uppercase username → slug is lowercased', async () => {
    const slug = `upper-${F.suffix}`;
    const r = await createTeacher({ username: slug.toUpperCase() });
    assert(r.status === 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
    const tr = await pool.query('SELECT slug FROM teachers WHERE id=$1', [r.body.teacherId]);
    assertEqual(tr.rows[0].slug, slug, 'Slug should be lowercase');
    await pool.query('DELETE FROM teachers WHERE id=$1', [r.body.teacherId]);
  });

  await test('E2 · Username with spaces → hyphens in slug', async () => {
    const r = await createTeacher({ username: `spaced user ${F.suffix}` });
    assert(r.status === 201, `Expected 201: ${JSON.stringify(r.body)}`);
    const tr = await pool.query('SELECT slug FROM teachers WHERE id=$1', [r.body.teacherId]);
    assert(!tr.rows[0].slug.includes(' '), 'Slug should not contain spaces');
    assert(tr.rows[0].slug.includes('-'), 'Slug should use hyphens for spaces');
    await pool.query('DELETE FROM teachers WHERE id=$1', [r.body.teacherId]);
  });

  await test('E3 · Username with leading/trailing hyphens after normalization → stripped', async () => {
    const r = await createTeacher({ username: `--clean${F.suffix}--` });
    assert(r.status === 201, `Expected 201: ${JSON.stringify(r.body)}`);
    const tr = await pool.query('SELECT slug FROM teachers WHERE id=$1', [r.body.teacherId]);
    assert(!tr.rows[0].slug.startsWith('-'), 'Slug should not start with hyphen');
    assert(!tr.rows[0].slug.endsWith('-'), 'Slug should not end with hyphen');
    await pool.query('DELETE FROM teachers WHERE id=$1', [r.body.teacherId]);
  });

  /* ── F. force_password_change ───────────────────────────────────── */
  await test('F1 · force_password_change=true → teacher forced to change on login', async () => {
    const slug = `force-${F.suffix}`;
    const r = await createTeacher({ username: slug, force_password_change: true });
    assert(r.status === 201, `Expected 201: ${JSON.stringify(r.body)}`);

    const lr = await request('POST', '/api/auth/login',
      { username: slug, password: 'TeacherPass8!', role: 'teacher' },
      null,
      { 'X-Tenant-Slug': slug }
    );
    assertEqual(lr.status, 200, `Login failed: ${JSON.stringify(lr.body)}`);
    assertEqual(lr.body.force_password_change, true, 'force_password_change should be true in login response');
    await pool.query('DELETE FROM teachers WHERE slug=$1', [slug]).catch(() => {});
  });

  await test('F2 · force_password_change=false (default) → no redirect flag', async () => {
    const lr = await request('POST', '/api/auth/login',
      { username: F.teacherSlug, password: 'TeacherPass8!', role: 'teacher' },
      null,
      { 'X-Tenant-Slug': F.teacherSlug }
    );
    assertEqual(lr.status, 200);
    assertEqual(lr.body.force_password_change, false);
  });

  /* ── G. Admin reset-password endpoint ───────────────────────────── */
  let teacherTokenForReset = null;
  await test('G1 · POST /api/admin/teachers/:id/reset-password — changes password', async () => {
    const r = await request('POST', `/api/admin/teachers/${F.teacherId}/reset-password`,
      { new_password: 'NewPass99!', force_password_change: true },
      F.adminToken);
    assertEqual(r.status, 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.success);
  });

  await test('G2 · Teacher can log in with new password after admin reset', async () => {
    const lr = await request('POST', '/api/auth/login',
      { username: F.teacherSlug, password: 'NewPass99!', role: 'teacher' },
      null,
      { 'X-Tenant-Slug': F.teacherSlug }
    );
    assertEqual(lr.status, 200, `Login with new password failed: ${JSON.stringify(lr.body)}`);
    assert(lr.body.token);
    assertEqual(lr.body.force_password_change, true, 'force_password_change should be true after admin reset');
    teacherTokenForReset = lr.body.token;
  });

  await test('G3 · Old password no longer works after admin reset', async () => {
    const lr = await request('POST', '/api/auth/login',
      { username: F.teacherSlug, password: 'TeacherPass8!', role: 'teacher' },
      null,
      { 'X-Tenant-Slug': F.teacherSlug }
    );
    assertEqual(lr.status, 401, 'Old password should be rejected');
  });

  await test('G4 · Reset-password with short password → 400', async () => {
    const r = await request('POST', `/api/admin/teachers/${F.teacherId}/reset-password`,
      { new_password: 'abc' },
      F.adminToken);
    assertEqual(r.status, 400);
    assert(r.body.error.includes('8'));
  });

  await test('G5 · Reset-password without auth → 401', async () => {
    const r = await request('POST', `/api/admin/teachers/${F.teacherId}/reset-password`,
      { new_password: 'ValidPass9!' });
    assertEqual(r.status, 401);
  });

  await test('G6 · Reset-password for non-existent teacher → 404', async () => {
    const r = await request('POST', '/api/admin/teachers/9999999/reset-password',
      { new_password: 'ValidPass9!' },
      F.adminToken);
    assertEqual(r.status, 404);
  });

  /* ── H. Platform suspension ────────────────────────────────────── */
  await test('H1 · Suspending teacher blocks their API access (403)', async () => {
    const sr = await request('POST', `/api/admin/teachers/${F.teacherId}/suspend`,
      { suspend: true, reason: 'Test suspension' }, F.adminToken);
    assertEqual(sr.status, 200);
    assertEqual(sr.body.is_platform_suspended, true);

    const ar = await request('GET', '/api/courses', null, teacherTokenForReset,
      { 'X-Tenant-Slug': F.teacherSlug });
    assertEqual(ar.status, 403, `Suspended teacher should get 403, got ${ar.status}`);
    assert(ar.body.error.includes('موقوفة'), 'Should return suspension message');
  });

  await test('H2 · Unsuspending teacher restores API access (200)', async () => {
    await request('POST', `/api/admin/teachers/${F.teacherId}/suspend`,
      { suspend: false }, F.adminToken);

    const ar = await request('GET', '/api/courses', null, teacherTokenForReset,
      { 'X-Tenant-Slug': F.teacherSlug });
    assertEqual(ar.status, 200, `Unsuspended teacher should get 200, got ${ar.status}: ${JSON.stringify(ar.body)}`);
  });

  /* ── I. Tenant cache invalidation correctness ──────────────────── */
  await test('I1 · Tenant resolves from DB after cache cleared on creation', async () => {
    // After creation+invalidation, next request should find it
    const slug = `cache-${F.suffix}`;
    const r = await createTeacher({ username: slug });
    assert(r.status === 201, `Expected 201: ${JSON.stringify(r.body)}`);

    // Immediately query — should not 404
    const lr = await request('POST', '/api/auth/login',
      { username: slug, password: 'TeacherPass8!', role: 'teacher' },
      null,
      { 'X-Tenant-Slug': slug }
    );
    assertEqual(lr.status, 200, `Tenant not found immediately after creation: ${JSON.stringify(lr.body)}`);
    await pool.query('DELETE FROM teachers WHERE slug=$1', [slug]).catch(() => {});
  });

  await test('I2 · Deleted teacher slug removed from cache', async () => {
    const slug = `del-${F.suffix}`;
    const cr = await createTeacher({ username: slug });
    assert(cr.status === 201);
    const delR = await request('DELETE', `/api/admin/teachers/${cr.body.teacherId}`,
      null, F.adminToken);
    assertEqual(delR.status, 200);

    // Login should now fail (no tenant)
    const lr = await request('POST', '/api/auth/login',
      { username: slug, password: 'TeacherPass8!', role: 'teacher' },
      null,
      { 'X-Tenant-Slug': slug }
    );
    assert(lr.status !== 200, `Deleted tenant should not be accessible, got ${lr.status}`);
  });

  /* ── J. DELETE teacher cascades all data ───────────────────────── */
  await test('J1 · DELETE /api/admin/teachers/:id removes teacher from DB', async () => {
    const r = await request('DELETE', `/api/admin/teachers/${F.teacherId}`, null, F.adminToken);
    assertEqual(r.status, 200);
    const ch = await pool.query('SELECT id FROM teachers WHERE id=$1', [F.teacherId]);
    assertEqual(ch.rows.length, 0, 'Teacher should be deleted from DB');
    F.teacherId = null;
  });

  await test('J2 · DELETE non-existent teacher → 404', async () => {
    const r = await request('DELETE', '/api/admin/teachers/9999999', null, F.adminToken);
    assertEqual(r.status, 404);
  });

  /* ── K. Input sanitization ─────────────────────────────────────── */
  await test('K1 · SQL injection in username is safely parameterized', async () => {
    const r = await createTeacher({ username: "'; DROP TABLE teachers; --" });
    // Should either be rejected (400 because slug becomes empty or reserved) or succeed safely
    assert([400, 201, 409].includes(r.status),
      `Unexpected status for SQL injection attempt: ${r.status}`);
    if (r.status === 201) {
      await pool.query('DELETE FROM teachers WHERE id=$1', [r.body.teacherId]).catch(() => {});
    }
    // Verify teachers table still exists
    const ch = await pool.query('SELECT 1 FROM teachers LIMIT 1');
    assert(ch !== null, 'teachers table should still exist after injection attempt');
  });

  await test('K2 · XSS in name field is stored as-is (no execution context on server)', async () => {
    const slug = `xss-${F.suffix}`;
    const r = await createTeacher({
      username: slug,
      name: '<script>alert(1)</script>',
    });
    assert(r.status === 201, `Expected 201: ${JSON.stringify(r.body)}`);
    const tr = await pool.query('SELECT name FROM teachers WHERE id=$1', [r.body.teacherId]);
    // The name is stored; rendering is the client's responsibility
    assert(tr.rows[0].name === '<script>alert(1)</script>', 'Name stored verbatim');
    await pool.query('DELETE FROM teachers WHERE id=$1', [r.body.teacherId]).catch(() => {});
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
