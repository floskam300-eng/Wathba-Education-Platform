const http = require('http');
const pool = require('../db/connection');

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ ${label} ${detail ? ' -> ' + detail : ''}`);
  }
}

async function apiPost(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost',
      port: 3001,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers
      }
    }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let json = {};
        try { json = JSON.parse(raw); } catch (_) {}
        resolve({ status: res.statusCode, data: json });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runIntegration() {
  console.log('\n--- 3. Running End-to-End Auth & Hardware Identity Tests ---');

  // Find a test teacher or create temporary test student
  const teacherRes = await pool.query('SELECT id, slug FROM teachers LIMIT 1');
  if (!teacherRes.rows.length) {
    console.log('No teacher found in database, skipping e2e');
    return;
  }
  const teacher = teacherRes.rows[0];

  const bcrypt = require('bcryptjs');
  const hashedPass = await bcrypt.hash('TestPass123', 10);
  const testUsername = 'HWI_TEST_STD_01';

  // Clean up existing test data
  await pool.query('DELETE FROM students WHERE username = $1', [testUsername]);

  const insertRes = await pool.query(
    `INSERT INTO students (username, password, name, teacher_id)
     VALUES ($1, $2, 'Hardware Test Student', $3)
     RETURNING id`,
    [testUsername, hashedPass, teacher.id]
  );
  const studentId = insertRes.rows[0].id;

  const tenantHeader = { 'Host': `${teacher.slug}.wathba.site` };

  // Test 1: Case-insensitive login (using lowercase 'hwi_test_std_01')
  const login1 = await apiPost('/api/auth/login', {
    username: testUsername.toLowerCase(),
    password: 'TestPass123',
    device_id: 'dev_hwi_test_initial_01',
    device_origin: 'browser',
    device_name: 'iPhone 15 Pro — iOS 18.7 — Safari',
    hardware_profile: {
      gpu: { vendor: 'Apple', renderer: 'Apple GPU' },
      screen: { w: 393, h: 852, dpr: 3, colorDepth: 30 },
      system: { cores: 6, maxTouchPoints: 5, memory: 0, platform: 'iPhone' },
      audio: '124.551200'
    }
  }, tenantHeader);

  assert('Case-insensitive login succeeds with lowercase username', login1.status === 200, `status: ${login1.status}`);
  assert('First login marks is_new_device=true', login1.data.is_new_device === true);

  // Verify device registered in DB with hardware profile
  const dbDev1 = await pool.query('SELECT * FROM student_devices WHERE student_id = $1', [studentId]);
  assert('First device registered in student_devices', dbDev1.rows.length === 1);
  assert('First device stored hardware_profile', dbDev1.rows[0]?.hardware_profile?.gpu?.renderer === 'Apple GPU');

  // Test 2: Second login from PWA on SAME phone (brand new device_id, but identical hardware)
  const login2Pwa = await apiPost('/api/auth/login', {
    username: testUsername,
    password: 'TestPass123',
    device_id: 'dev_hwi_test_pwa_generated_02', // completely different ID!
    device_origin: 'pwa_ios',
    device_name: 'iPhone 15 Pro — iOS 18.7 — Safari',
    hardware_profile: {
      gpu: { vendor: 'Apple', renderer: 'Apple GPU' },
      screen: { w: 393, h: 852, dpr: 3, colorDepth: 30 },
      system: { cores: 6, maxTouchPoints: 5, memory: 0, platform: 'iPhone' },
      audio: '124.551200'
    }
  }, tenantHeader);

  assert('Self-healing allows PWA login with new device_id (status 200)', login2Pwa.status === 200, `status: ${login2Pwa.status}, error: ${login2Pwa.data?.error}`);
  assert('PWA does not trigger new device warning popup', login2Pwa.data.is_new_device === false);

  // Verify device_id was self-healed in DB to the new PWA ID
  const dbDev2 = await pool.query('SELECT * FROM student_devices WHERE student_id = $1', [studentId]);
  assert('Still exactly 1 device registered (no duplicate burn of slot)', dbDev2.rows.length === 1);
  assert('Device ID self-healed to PWA ID', dbDev2.rows[0]?.device_id === 'dev_hwi_test_pwa_generated_02');

  // Verify NO device alerts were created for this legitimate student
  const alerts1 = await pool.query('SELECT * FROM device_alerts WHERE student_id = $1', [studentId]);
  assert('Zero alerts created for legitimate PWA login', alerts1.rows.length === 0);

  // Test 3: Foreign login from a friend's Android tablet (different hardware)
  const login3Foreign = await apiPost('/api/auth/login', {
    username: testUsername,
    password: 'TestPass123',
    device_id: 'dev_hwi_foreign_android_tab_03',
    device_origin: 'browser',
    device_name: 'Samsung Galaxy Tab (SM-X216B) — Android 16 — Chrome',
    hardware_profile: {
      gpu: { vendor: 'ARM', renderer: 'Mali-G57 MC2' },
      screen: { w: 800, h: 1280, dpr: 1.5, colorDepth: 24 },
      system: { cores: 8, maxTouchPoints: 5, memory: 4, platform: 'Linux aarch64' },
      audio: '88.331200'
    }
  }, tenantHeader);

  assert('Foreign device attempt is blocked (status 403)', login3Foreign.status === 403, `status: ${login3Foreign.status}`);
  assert('Foreign device error code is NEW_DEVICE_BLOCKED', login3Foreign.data?.code === 'NEW_DEVICE_BLOCKED');

  // Verify device alert was created with similarity score
  const alerts2 = await pool.query('SELECT * FROM device_alerts WHERE student_id = $1', [studentId]);
  assert('Alert created for foreign device', alerts2.rows.length === 1);
  assert('Alert contains low similarity score (< 50%)', alerts2.rows[0]?.similarity_score < 50, `similarity: ${alerts2.rows[0]?.similarity_score}%`);

  // Clean up test student
  await pool.query('DELETE FROM device_alerts WHERE student_id = $1', [studentId]);
  await pool.query('DELETE FROM student_devices WHERE student_id = $1', [studentId]);
  await pool.query('DELETE FROM students WHERE id = $1', [studentId]);

  console.log(`\n========================================`);
  console.log(`E2E Integration Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runIntegration()
  .then(() => pool.end())
  .catch(err => {
    console.error('Integration test failed with error:', err);
    pool.end();
    process.exit(1);
  });
