'use strict';
require('dotenv').config();
const pool = require('../server/db/connection');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET;
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
      ...(body && typeof body !== 'string' ? { 'Content-Type': 'application/json' } : {}),
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

// Multipart helper for file upload tests
function uploadFileRequest(urlPath, filename, fileContent, mimeType, token) {
  return new Promise((resolve, reject) => {
    const boundary = `----TestBoundary${crypto.randomBytes(8).toString('hex')}`;
    const head = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="image"; filename="${filename}"`,
      `Content-Type: ${mimeType}`,
      '',
      '',
    ].join('\r\n');
    const tail = `\r\n--${boundary}--\r\n`;

    const payload = Buffer.concat([
      Buffer.from(head, 'utf8'),
      Buffer.from(fileContent),
      Buffer.from(tail, 'utf8'),
    ]);

    const headers = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': payload.length,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const opts = {
      hostname: 'localhost', port: PORT, path: urlPath, method: 'POST', headers,
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
    req.write(payload);
    req.end();
  });
}

// Global fixtures
const Fixtures = {
  adminUsername: `tch_f_${crypto.randomInt(1000, 9999)}`,
  adminPassword: 'AuditPassword123!',
  adminId: null,
  adminToken: null,
  teacherId: null,
  teacherSlug: `test-tch-audit-${crypto.randomInt(1000, 9999)}`,
  planId: null,
  teacherToken: null,
};

async function setup() {
  console.log('[setup] Initializing test fixtures ...');
  
  // Insert test admin
  const pwHash = await bcrypt.hash(Fixtures.adminPassword, 10);
  const adminRes = await pool.query(
    'INSERT INTO platform_admins (username, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id',
    [Fixtures.adminUsername, pwHash, 'Audit System Admin', 'super_admin']
  );
  Fixtures.adminId = adminRes.rows[0].id;

  // Insert a custom small plan for testing limits (max_students = 1)
  const planRes = await pool.query(
    `INSERT INTO subscription_plans (name, category, price, max_students, billing_type)
     VALUES ('Audit Test Cap Plan', 'platform', 199.00, 1, 'monthly') RETURNING id`
  );
  Fixtures.planId = planRes.rows[0].id;
}

async function teardown() {
  console.log('[teardown] Cleaning up test fixtures ...');
  if (Fixtures.teacherId) {
    await pool.query('DELETE FROM students WHERE teacher_id = $1', [Fixtures.teacherId]);
    await pool.query('DELETE FROM teacher_subscriptions WHERE teacher_id = $1', [Fixtures.teacherId]);
    await pool.query('DELETE FROM teachers WHERE id = $1', [Fixtures.teacherId]);
  }
  if (Fixtures.planId) {
    await pool.query('DELETE FROM subscription_plans WHERE id = $1', [Fixtures.planId]);
  }
  if (Fixtures.adminId) {
    await pool.query('DELETE FROM platform_admins WHERE id = $1', [Fixtures.adminId]);
  }
}

async function runTests() {
  console.log('\n--- Running Audit & Optimization Fixes Integration Tests ---\n');

  await test('Admin Dashboard Authentication (Login & Profile)', async () => {
    const res = await request('POST', '/api/admin/auth/login', {
      username: Fixtures.adminUsername,
      password: Fixtures.adminPassword,
    });
    assertEqual(res.status, 200, 'Login should succeed');
    assert(res.body.token, 'Token should be returned');
    Fixtures.adminToken = res.body.token;

    const meRes = await request('GET', '/api/admin/auth/me', null, Fixtures.adminToken);
    assertEqual(meRes.status, 200, 'Profile check should pass');
    assertEqual(meRes.body.admin.username, Fixtures.adminUsername, 'Correct admin payload');
  });

  await test('Security: Block Spoofed Image Uploads (Magic-Bytes)', async () => {
    // 1. Spoofed payload (mime is image/png but content is a PHP script)
    const phpScript = '<?php phpinfo(); ?>';
    const uploadRes = await uploadFileRequest(
      '/api/admin/upload/image',
      'exploit.png',
      phpScript,
      'image/png',
      Fixtures.adminToken
    );
    assertEqual(phpScript, phpScript); // dummy
    assertEqual(uploadRes.status, 400, 'Should reject spoofed headers');
    assert(uploadRes.body.error, 'Should return error body');
    assert(uploadRes.raw.includes('غير صالح أو تالف'), 'Should return correct Arabic validation message');

    // 2. Valid PNG payload (magic bytes: 89 50 4E 47 ...)
    const pngBytes = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52]);
    const validUpload = await uploadFileRequest(
      '/api/admin/upload/image',
      'valid.png',
      pngBytes,
      'image/png',
      Fixtures.adminToken
    );
    assertEqual(validUpload.status, 200, 'Should allow valid magic-byte PNG file');
    assert(validUpload.body.url, 'Should return uploaded file URL');

    // Clean up valid upload from disk if possible
    if (validUpload.body.url) {
      const p = path.join(__dirname, '../', validUpload.body.url);
      try { fs.unlinkSync(p); } catch {}
    }
  });

  await test('Business Logic: Enforce Subscription Student Limit (max_students)', async () => {
    // 1. Create teacher linked to our test plan (limit = 1)
    const tchUsername = `t-limit-${crypto.randomInt(1000, 9999)}`;
    Fixtures.teacherSlug = tchUsername;
    const createRes = await request('POST', '/api/admin/teachers', {
      username: tchUsername,
      password: 'TeacherPassword123!',
      name: 'Test Limit Teacher',
      plan_id: Fixtures.planId,
    }, Fixtures.adminToken);
    assertEqual(createRes.status, 201, 'Should create teacher');
    Fixtures.teacherId = createRes.body.teacherId;

    // Login as the teacher to generate credentials for student creation
    const authRes = await request('POST', '/api/auth/login', {
      username: tchUsername,
      password: 'TeacherPassword123!',
    });
    assertEqual(authRes.status, 200, 'Teacher login should succeed');
    Fixtures.teacherToken = authRes.body.token;

    // 2. Create first student (should succeed, count = 1)
    const st1 = await request('POST', '/api/students', {
      name: 'First Student',
      academic_stage: 'الصف الأول الثانوي عام',
      gender: 'ذكر',
    }, Fixtures.teacherToken, { 'x-tenant-slug': Fixtures.teacherSlug });
    if (st1.status !== 201) {
      console.log('st1 failed response:', st1.status, st1.body);
    }
    assertEqual(st1.status, 201, 'Should allow first student creation');

    // 3. Create second student (should fail with 403 Forbidden because limit is 1)
    const st2 = await request('POST', '/api/students', {
      name: 'Second Student',
      academic_stage: 'الصف الأول الثانوي عام',
      gender: 'ذكر',
    }, Fixtures.teacherToken, { 'x-tenant-slug': Fixtures.teacherSlug });
    assertEqual(st2.status, 403, 'Should reject student creation over subscription limit');
    assert(st2.body.error && st2.body.error.includes('الحد الأقصى'), 'Should tell user about limit');
  });

  await test('Centralized Platform Suspension Guard for Public Routes', async () => {
    // 1. Landing page before suspension (should work)
    const publicInfo = await request('GET', '/api/public/info', null, null, { 'x-tenant-slug': Fixtures.teacherSlug });
    if (publicInfo.status !== 200) {
      console.log('publicInfo failed response:', publicInfo.status, publicInfo.body);
    }
    assertEqual(publicInfo.status, 200, 'Should allow public access to landing page');

    // 2. Suspend teacher
    const suspRes = await request('POST', `/api/admin/teachers/${Fixtures.teacherId}/suspend`, {
      suspend: true,
      reason: 'فواتير غير مدفوعة',
    }, Fixtures.adminToken);
    assertEqual(suspRes.status, 200, 'Should suspend teacher');

    // 3. Request landing page after suspension (should fail with 403 Forbidden)
    const publicInfoSusp = await request('GET', '/api/public/info', null, null, { 'x-tenant-slug': Fixtures.teacherSlug });
    assertEqual(publicInfoSusp.status, 403, 'Should block public access to suspended platform');
    assert(publicInfoSusp.body.error, 'Should return error body');
    assertEqual(publicInfoSusp.body.reason, 'فواتير غير مدفوعة', 'Should return suspension reason');

    // 4. Request parent portal lookup (should fail with 403)
    const parentLookup = await request('GET', `/api/public/parent-lookup?phone=01000000000`, null, null, { 'x-tenant-slug': Fixtures.teacherSlug });
    assertEqual(parentLookup.status, 403, 'Should block parent portal on suspended platform');

    // 5. Unsuspend teacher
    await request('POST', `/api/admin/teachers/${Fixtures.teacherId}/suspend`, {
      suspend: false,
    }, Fixtures.adminToken);
  });

  await test('Performance: Consolidated Platform Stats and optimized listings', async () => {
    // Verify optimized stats page works
    const statsRes = await request('GET', '/api/admin/stats', null, Fixtures.adminToken);
    assertEqual(statsRes.status, 200, 'Stats endpoint should return success');
    assert(statsRes.body.stats.teachers.total >= 1, 'Should return stats totals');
    assert(statsRes.body.stats.students, 'Should contain students stats');
    assert(statsRes.body.stats.payments, 'Should contain payments stats');

    // Verify optimized teachers list works and includes count statistics
    const listRes = await request('GET', '/api/admin/teachers', null, Fixtures.adminToken);
    assertEqual(listRes.status, 200, 'Teachers listing should return success');
    const match = listRes.body.teachers.find(t => t.id === Fixtures.teacherId);
    assert(match, 'Test teacher should be returned in list');
    assertEqual(match.stats.total_students, 1, 'Correct student count');
    assertEqual(match.stats.storage_bytes, 0, 'Storage size skipped on list view');
  });

  console.log(`\nTests finished: ${passed} passed, ${failed} failed.\n`);
  
  if (failed > 0) {
    console.error('Some tests failed!');
    process.exit(1);
  }
}

async function main() {
  try {
    await setup();
    await runTests();
  } catch (err) {
    console.error('Test run crashed:', err);
    process.exit(1);
  } finally {
    await teardown();
    pool.end();
  }
}

main();
