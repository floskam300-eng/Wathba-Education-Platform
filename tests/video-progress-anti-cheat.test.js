/**
 * WATHBA Platform — Video Progress Anti-Cheat Test Suite
 * =======================================================
 * Run: node tests/video-progress-anti-cheat.test.js
 *
 * Requires: DATABASE_URL + JWT_SECRET env vars, server running on port 3001.
 *
 * Verifies the server-authoritative video-progress contract:
 *   • A forged single request cannot grant meaningful watch credit
 *     (wall-clock cap: elapsed × 2.5 + grace; first update gets fixed grant).
 *   • Rapid-fire updates are clamped to the same wall-clock rule.
 *   • Honest paced updates accumulate correctly up to the real duration.
 *   • watched_minutes / progress_percentage are SERVER-derived
 *     (client values ignored), true watch-time semantics.
 *   • last_position is clamped to the video duration.
 *   • Measured durations are adopted once for duration-less URL videos.
 *   • Per-student rate limiting kicks in on abuse.
 */

require('dotenv').config();
const pool   = require('../server/db/connection');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt    = require('jsonwebtoken');
const http   = require('http');
const fs     = require('fs');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error('JWT_SECRET missing'); process.exit(1); }

let passed = 0, failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌ ${name}\n     ${e.message}`);
    failed++;
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function request(method, path, body, token) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 3001, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data  ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch (_) { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    if (data) req.write(data);
    req.end();
  });
}

function makeToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h', jwtid: crypto.randomUUID() });
}

const SUF = crypto.randomBytes(3).toString('hex');
const T = {};

async function setup() {
  const pw = await bcrypt.hash(`VPA_${SUF}!`, 10);

  const [t] = (await pool.query(
    "INSERT INTO teachers (username,password,name,slug) VALUES ($1,$2,'VP AntiCheat Teacher',$3) RETURNING id",
    [`_vpac_teacher_${SUF}`, pw, `_vpac_${SUF}`])).rows;
  T.teacherId = t.id;

  const [s] = (await pool.query(
    "INSERT INTO students (username,password,name,teacher_id) VALUES ($1,$2,'VP Student A',$3) RETURNING id",
    [`_vpac_sa_${SUF}`, pw, T.teacherId])).rows;
  T.studentA = s.id;
  T.tokenA = makeToken({ id: T.studentA, role: 'student' });

  const [s2] = (await pool.query(
    "INSERT INTO students (username,password,name,teacher_id) VALUES ($1,$2,'VP Student B',$3) RETURNING id",
    [`_vpac_sb_${SUF}`, pw, T.teacherId])).rows;
  T.studentB = s2.id;
  T.tokenB = makeToken({ id: T.studentB, role: 'student' });

  const [c] = (await pool.query(
    "INSERT INTO courses (name,teacher_id,price,is_published) VALUES ('VPAC Course',$1,0,true) RETURNING id",
    [T.teacherId])).rows;
  T.courseId = c.id;

  await pool.query(
    "INSERT INTO student_course_enrollment (student_id,course_id,status) VALUES ($1,$2,'active')",
    [T.studentA, T.courseId]);
  await pool.query(
    "INSERT INTO student_course_enrollment (student_id,course_id,status) VALUES ($1,$2,'active')",
    [T.studentB, T.courseId]);

  // 10-minute uploaded-style video
  const [v1] = (await pool.query(
    "INSERT INTO videos (course_id,title,file_path_or_url,duration_minutes,sort_order) VALUES ($1,'VPAC Vid10','/uploads/videos/vpac.mp4',10,1) RETURNING id",
    [T.courseId])).rows;
  T.v10 = v1.id;

  // URL video with unknown duration
  const [v2] = (await pool.query(
    "INSERT INTO videos (course_id,title,file_path_or_url,duration_minutes,sort_order) VALUES ($1,'VPAC VidURL','https://youtube.com/watch?v=abc',0,2) RETURNING id",
    [T.courseId])).rows;
  T.vUnknown = v2.id;
}

async function teardown() {
  await pool.query('DELETE FROM teachers WHERE id=$1', [T.teacherId]);
  await pool.query('DELETE FROM students WHERE id IN ($1,$2)', [T.studentA, T.studentB]);
}

async function getRow(studentId, videoId) {
  const { rows } = await pool.query(
    'SELECT * FROM video_progress WHERE student_id=$1 AND video_id=$2',
    [studentId, videoId]);
  return rows[0] || null;
}

async function runSourceChecks() {
  console.log('\n▶ Static source checks');

  await test('Server enforces wall-clock anti-cheat constants', async () => {
    const src = fs.readFileSync('server/routes/students.js', 'utf8');
    assert(/VIDEO_MAX_SPEED_FACTOR\s*=\s*2\.5/.test(src), 'speed factor constant missing');
    assert(/VIDEO_GRACE_SECONDS\s*=\s*30/.test(src), 'grace constant missing');
    assert(/FIRST_UPDATE_GRACE_SECONDS\s*=\s*45/.test(src), 'first-update grant missing');
    assert(src.includes('videoProgressLimiter'), 'rate limiter not attached');
    // Legacy patterns still required by security-and-fixes.test.js
    assert(/maxWatchedSeconds/.test(src), 'maxWatchedSeconds variable kept');
    assert(/durationMinutes \* 60/.test(src), 'durationMinutes * 60 pattern kept');
  });

  await test('HTML5 player reports per-tick deltas (no cumulative sends)', async () => {
    const src = fs.readFileSync('client/src/pages/student/CourseView.jsx', 'utf8');
    assert(!/actualWatched\.current \+= elapsed/.test(src),
      'interval must NOT accumulate into actualWatched before sending');
    assert(/false, ct, elapsed,/.test(src),
      'HTML5 interval must send the tick delta (elapsed)');
    assert((src.match(/postProgressKeepalive/g) || []).length >= 3,
      'keepalive flush helper must be wired into both players + handleProgressUpdate');
    // Send-and-reset semantics everywhere a remainder is flushed
    const resets = (src.match(/actualWatched\.current = 0;/g) || []).length;
    assert(resets >= 6, `expected send-and-reset in all flush paths, found ${resets} resets`);
  });
}

async function runApiTests() {
  console.log('\n▶ Forgery & accumulation behaviour');

  await test('Forged single request grants at most first-update grace seconds', async () => {
    const r = await request('POST', '/api/students/me/video-progress', {
      video_id: T.v10,
      actual_watched_seconds: 3600000,        // claims 1000 hours
      watched_minutes: 60000,
      progress_percentage: 100,
      last_position: 999999,
    }, T.tokenA);
    assertEqual(r.status, 200, `POST failed: ${JSON.stringify(r.body)}`);

    const vp = await getRow(T.studentA, T.v10);
    assert(vp, 'progress row should exist');
    assert(vp.actual_watched_seconds <= 45,
      `forged seconds must be clamped to ≤45, got ${vp.actual_watched_seconds}`);
    const expectedPct = Math.min(100, (vp.actual_watched_seconds / 600) * 100);
    assert(Math.abs(parseFloat(vp.progress_percentage) - expectedPct) < 0.01,
      `pct must be derived from clamped seconds (${expectedPct}), got ${vp.progress_percentage}`);
    assert(vp.watched_minutes <= Math.floor(45 / 60),
      `watched_minutes must be derived server-side, got ${vp.watched_minutes}`);
    assert(parseInt(vp.last_position) <= 600,
      `last_position must be clamped to duration×60, got ${vp.last_position}`);
  });

  await test('Rapid-fire second request adds at most grace seconds', async () => {
    const r = await request('POST', '/api/students/me/video-progress', {
      video_id: T.v10,
      actual_watched_seconds: 7200,           // claims 2 more hours instantly
      progress_percentage: 100,
    }, T.tokenA);
    assertEqual(r.status, 200);

    const vp = await getRow(T.studentA, T.v10);
    assert(vp.actual_watched_seconds <= 45 + 35,
      `rapid-fire credit must stay tiny (≤80), got ${vp.actual_watched_seconds}`);
    assert(parseFloat(vp.progress_percentage) < 15,
      `pct must remain far from 100, got ${vp.progress_percentage}`);
  });

  await test('Client-supplied watched_minutes is ignored', async () => {
    await request('POST', '/api/students/me/video-progress', {
      video_id: T.v10,
      watched_minutes: 9999,
      actual_watched_seconds: 1,
    }, T.tokenA);
    const vp = await getRow(T.studentA, T.v10);
    assertEqual(vp.watched_minutes, Math.floor(vp.actual_watched_seconds / 60),
      'watched_minutes must equal floor(actual/60)');
  });

  await test('Honest paced watching accumulates up to the real duration', async () => {
    // Simulate wall-clock passage between heartbeats by rewinding
    // last_watched_at instead of sleeping through the test.
    let prevTotal = (await getRow(T.studentA, T.v10)).actual_watched_seconds;
    for (let i = 0; i < 6 && prevTotal < 600; i++) {
      await pool.query(
        "UPDATE video_progress SET last_watched_at = NOW() - INTERVAL '61 seconds' WHERE student_id=$1 AND video_id=$2",
        [T.studentA, T.v10]);
      const r = await request('POST', '/api/students/me/video-progress', {
        video_id: T.v10,
        actual_watched_seconds: 120,          // 2 min of real playback @1x… generous ticks
        progress_percentage: 20,
      }, T.tokenA);
      assertEqual(r.status, 200);
      const vp = await getRow(T.studentA, T.v10);
      const expected = Math.min(prevTotal + 120, 600);
      assertEqual(vp.actual_watched_seconds, expected,
        `tick ${i}: server must accept the honest delta (elapsed 61s ⇒ allowance ≈182s)`);
      prevTotal = vp.actual_watched_seconds;
    }
    assertEqual(prevTotal, 600, 'full honest watching must reach exactly duration×60');
    const vp = await getRow(T.studentA, T.v10);
    assert(parseFloat(vp.progress_percentage) === 100,
      `completed watching must show 100%, got ${vp.progress_percentage}`);
    assertEqual(vp.watched_minutes, 10);
  });

  await test('Duration adoption: measured duration persisted once for URL videos', async () => {
    const r1 = await request('POST', '/api/students/me/video-progress', {
      video_id: T.vUnknown,
      actual_watched_seconds: 10,
      progress_percentage: 100,               // forged pct must be ignored once duration exists
      measured_duration_seconds: 300,         // player measured 5 minutes
    }, T.tokenA);
    assertEqual(r1.status, 200);

    const v = (await pool.query('SELECT duration_minutes FROM videos WHERE id=$1', [T.vUnknown])).rows[0];
    assertEqual(v.duration_minutes, 5, 'measured duration (ceil 300s→5m) must be adopted');

    let vp = await getRow(T.studentA, T.vUnknown);
    const expectedPct = Math.min(100, (vp.actual_watched_seconds / 300) * 100);
    assert(Math.abs(parseFloat(vp.progress_percentage) - expectedPct) < 0.01,
      `pct must use adopted duration (${expectedPct}), got ${vp.progress_percentage}`);

    // Second, absurd measurement must NOT overwrite the adopted duration.
    await request('POST', '/api/students/me/video-progress', {
      video_id: T.vUnknown,
      actual_watched_seconds: 1,
      measured_duration_seconds: 86400,
    }, T.tokenA);
    const v2 = (await pool.query('SELECT duration_minutes FROM videos WHERE id=$1', [T.vUnknown])).rows[0];
    assertEqual(v2.duration_minutes, 5, 'adopted duration must never be overwritten');
  });

  await test('Truly unknown duration still accepts capped client percentage', async () => {
    const [v] = (await pool.query(
      "INSERT INTO videos (course_id,title,file_path_or_url,duration_minutes,sort_order) VALUES ($1,'VPAC NoDur','https://cdn.example.com/x.m3u8',0,3) RETURNING id",
      [T.courseId])).rows;
    const r = await request('POST', '/api/students/me/video-progress', {
      video_id: v.id,
      progress_percentage: 42,
      actual_watched_seconds: 5,
    }, T.tokenA);
    assertEqual(r.status, 200);
    const row = await getRow(T.studentA, v.id);
    assert(row, 'row must exist');
    assert(Math.abs(parseFloat(row.progress_percentage) - 42) < 0.01,
      `fallback pct should be the capped client value, got ${row.progress_percentage}`);
    await pool.query('DELETE FROM videos WHERE id=$1', [v.id]);
  });

  console.log('\n▶ Rate limiting');

  await test('Video-progress endpoint rate-limits abusive clients (per student)', async () => {
    let saw429 = false;
    for (let i = 0; i < 25; i++) {
      const r = await request('POST', '/api/students/me/video-progress', {
        video_id: T.v10,
        actual_watched_seconds: 1,
      }, T.tokenB);
      if (r.status === 429) { saw429 = true; break; }
    }
    assert(saw429, 'expected a 429 within 25 rapid requests (limit 20/min)');
  });
}

async function main() {
  console.log('\n═══ Wathba — Video Progress Anti-Cheat Suite ═══\n');
  await setup();
  await runSourceChecks();
  await runApiTests();
  await teardown();
  console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error('Fatal:', e);
  try { await teardown(); } catch (_) {}
  process.exit(1);
});
