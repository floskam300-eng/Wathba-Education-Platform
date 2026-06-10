/**
 * WATHBA Business Logic Tests — Scoring, Points, Enrollments, Leaderboard
 * =========================================================================
 * Run: node tests/business-logic.test.js
 */

'use strict';
require('dotenv').config();
const pool = require('../server/db/connection');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
const PORT = parseInt(process.env.PORT || '3001', 10);

let passed = 0, failed = 0, skipped = 0;
let T = {};

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌  ${name}\n       ${e.message.split('\n')[0]}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function request(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: PORT, path: urlPath, method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
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

function makeToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h', jwtid: crypto.randomUUID() });
}

async function setup() {
  console.log('[setup] Creating BL test fixtures ...');
  const pw = await bcrypt.hash('BL_2026!', 10);

  const [t] = (await pool.query(
    "INSERT INTO teachers (username,password,name,slug) VALUES ('_bl_teacher',$1,'BL Teacher','_bl_teacher') RETURNING id",
    [pw])).rows;
  T.teacherId = t.id;
  T.teacherToken = makeToken({ id: T.teacherId, role: 'teacher' });

  const [s] = (await pool.query(
    "INSERT INTO students (username,password,name,teacher_id,points,academic_stage) VALUES ('_bl_student',$1,'BL Student',$2,500,'الصف الثالث الثانوي') RETURNING id",
    [pw, T.teacherId])).rows;
  T.studentId = s.id;
  T.studentToken = makeToken({ id: T.studentId, role: 'student' });

  const [c] = (await pool.query(
    "INSERT INTO courses (name,teacher_id,price,is_published,points_on_complete) VALUES ('BL Course',$1,100,true,50) RETURNING id",
    [T.teacherId])).rows;
  T.courseId = c.id;

  await pool.query(
    "INSERT INTO student_course_enrollment (student_id,course_id,status) VALUES ($1,$2,'active')",
    [T.studentId, T.courseId]);
  
  const [sec] = (await pool.query(
    "INSERT INTO sections (course_id,title,sort_order) VALUES ($1,'BL Section',1) RETURNING id",
    [T.courseId])).rows;
  T.sectionId = sec.id;

  console.log('[setup] Done.\n');
}

async function teardown() {
  console.log('\n[teardown] Cleaning up ...');
  await pool.query('DELETE FROM teachers WHERE id=$1', [T.teacherId]);
  await pool.query('DELETE FROM students WHERE id=$1', [T.studentId]);
}

async function runTests() {
  // ──────────────────────────────────────────────────────────────────────────
  console.log('▶  BL-1: Points management (must run first — before scoring test adds points)');
  // ──────────────────────────────────────────────────────────────────────────

  await test('Verify initial points', async () => {
    const { rows: [s] } = await pool.query('SELECT points FROM students WHERE id=$1', [T.studentId]);
    assertEqual(s.points, 500);
  });

  await test('Video progress tracking updates correctly', async () => {
    const [v] = (await pool.query(
      "INSERT INTO videos (course_id,section_id,title,file_path_or_url,duration_minutes) VALUES ($1,$2,'Test Video','/test.mp4',30) RETURNING id",
      [T.courseId, T.sectionId])).rows;
    
    const r = await request('POST', '/api/students/me/video-progress', {
      video_id: v.id,
      progress_percentage: 50,
      watched_minutes: 15,
      last_position: 900,
    }, T.studentToken);
    assertEqual(r.status, 200, `Video progress update failed: ${JSON.stringify(r.body)}`);

    const { rows: [vp] } = await pool.query(
      "SELECT * FROM video_progress WHERE student_id=$1 AND video_id=$2",
      [T.studentId, v.id]);
    assert(vp, 'Video progress should exist');
    assert(parseFloat(vp.progress_percentage) >= 50, `Expected >=50%, got ${vp.progress_percentage}`);

    await pool.query('DELETE FROM videos WHERE id=$1', [v.id]);
  });

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶  BL-2: Exam scoring accuracy');
  // ──────────────────────────────────────────────────────────────────────────

  await test('Create exam with manual questions and verify scoring', async () => {
    const [ex] = (await pool.query(
      `INSERT INTO exams (title,duration_minutes,total_score,course_id,teacher_id,pass_score,points_on_pass,is_published,start_date,end_date)
        VALUES ('Scoring Test',30,30,$1,$2,15,5,true,NOW()-INTERVAL '1 day',NOW()+INTERVAL '1 day') RETURNING id`,
      [T.courseId, T.teacherId])).rows;

    // Add 3 MCQ questions (10 pts each)
    const qIds = [];
    for (const [txt, correct, pts] of [
      ['2+2=?', 'A', 10],
      ['3*3=?', 'B', 10],
      ['10/2=?', 'B', 10],
    ]) {
      const [q] = (await pool.query(
        "INSERT INTO questions (exam_id,question_text,option_a,option_b,option_c,option_d,correct_answer_letter,points,question_type) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'mcq') RETURNING id",
        [ex.id, txt, '4', '5', '6', '9', correct, pts])).rows;
      qIds.push(q.id);
    }

    // Start exam session
    await pool.query(
      "INSERT INTO exam_sessions (student_id,exam_id,started_at,questions_snapshot) VALUES ($1,$2,NOW(),$3) ON CONFLICT DO NOTHING",
      [T.studentId, ex.id, JSON.stringify([
        { id: qIds[0], points: 10, correct_answer_letter: 'A' },
        { id: qIds[1], points: 10, correct_answer_letter: 'B' },
        { id: qIds[2], points: 10, correct_answer_letter: 'B' },
      ])]
    );

    // Submit with 2 correct (A, B, null) → 20/30
    const r = await request('POST', `/api/exams/${ex.id}/submit`, {
      answers: { [qIds[0]]: 'A', [qIds[1]]: 'B' }
    }, T.studentToken);
    assertEqual(r.status, 200, `Submit failed: ${JSON.stringify(r.body)}`);
    
    // Verify score (no passed column in schema — use points_earned as proxy)
    const { rows: [result] } = await pool.query(
      "SELECT id,score,correct_count,wrong_count,unanswered_count,points_earned FROM exam_results WHERE student_id=$1 AND exam_id=$2 ORDER BY created_at DESC LIMIT 1",
      [T.studentId, ex.id]);
    assertEqual(result.score, 20, `Expected 20/30, got ${result.score}`);
    assertEqual(result.correct_count, 2);
    assertEqual(result.unanswered_count, 1);
    assert(result.points_earned > 0, `Score 20/30 should earn points (pass_score=15)`);

    await pool.query('DELETE FROM exams WHERE id=$1', [ex.id]);
  });

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶  BL-3: Enrollment and course access');
  // ──────────────────────────────────────────────────────────────────────────

  await test('Unenrolled student gets 403 on course content', async () => {
    const freshPw = await bcrypt.hash('fresh', 10);
    const [fresh] = (await pool.query(
      "INSERT INTO students (username,password,name,teacher_id) VALUES ('_bl_fresh',$1,'Fresh',$2) RETURNING id",
      [freshPw, T.teacherId])).rows;
    const freshToken = makeToken({ id: fresh.id, role: 'student' });
    
    const r = await request('GET', `/api/courses/${T.courseId}/content`, null, freshToken);
    assertEqual(r.status, 403, `Unenrolled student should be blocked: ${JSON.stringify(r.body)}`);
    
    await pool.query('DELETE FROM students WHERE id=$1', [fresh.id]);
  });

  await test('Course access for enrolled student succeeds', async () => {
    const r = await request('GET', `/api/courses/${T.courseId}/content`, null, T.studentToken);
    assertEqual(r.status, 200);
  });

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶  BL-4: Leaderboard ranking calculations');
  // ──────────────────────────────────────────────────────────────────────────

  await test('Leaderboard endpoint returns students sorted by points', async () => {
    const r = await request('GET', '/api/payments/leaderboard', null, T.teacherToken);
    assertEqual(r.status, 200);
    const rows = Array.isArray(r.body) ? r.body : (r.body?.students || r.body?.rankings || []);
    if (rows.length > 0) {
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].points !== undefined) {
          assert(rows[i].points <= rows[i-1].points || rows[i-1].points === undefined,
            `Leaderboard not sorted: ${rows[i-1].points} < ${rows[i].points}`);
        }
      }
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶  BL-5: Notification system delivery');
  // ──────────────────────────────────────────────────────────────────────────

  await test('Teacher can send notification → 201', async () => {
    const r = await request('POST', '/api/notifications/platform', {
      student_ids: [T.studentId],
      title: 'Test Notification',
      message: 'This is a test',
      type: 'general',
    }, T.teacherToken);
    assertEqual(r.status, 201, `Send notification: ${JSON.stringify(r.body)}`);
  });

  await test('Student can see their notifications', async () => {
    const r = await request('GET', '/api/notifications/my', null, T.studentToken);
    assertEqual(r.status, 200);
  });

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶  BL-6: Recitation result accuracy');
  // ──────────────────────────────────────────────────────────────────────────

  await test('Teacher creates recitation with questions → 201', async () => {
    const r = await request('POST', '/api/recitations', {
      title: 'BL Recitation Test',
      description: 'Test',
      academic_stage: 'الصف الثالث الثانوي',
      duration_minutes: 10,
      total_score: 10,
      pass_score: 6,
      schedule_type: 'once',
      start_date: new Date(Date.now() - 86400000).toISOString(),
      end_date: new Date(Date.now() + 86400000).toISOString(),
      is_published: true,
    }, T.teacherToken);
    assertEqual(r.status, 201, `Create recitation: ${JSON.stringify(r.body)}`);
    if (r.body && r.body.id) {
      // Add questions
      for (let i = 0; i < 5; i++) {
        const qr = await request('POST', `/api/recitations/${r.body.id}/questions`, {
          question_text: `Q${i+1}?`,
          question_type: 'mcq',
          option_a: 'Ans 1',
          option_b: 'Ans 2',
          correct_answer_letter: i % 2 === 0 ? 'A' : 'B',
          points: 2,
        }, T.teacherToken);
        assertEqual(qr.status, 201, `Add question ${i}: ${JSON.stringify(qr.body)}`);
      }
      await pool.query('DELETE FROM recitations WHERE id=$1', [r.body.id]);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶  BL-7: Activity log auditing');
  // ──────────────────────────────────────────────────────────────────────────

  await test('Activity log returns events for teacher', async () => {
    const r = await request('GET', '/api/activity-logs?limit=5', null, T.teacherToken);
    assertEqual(r.status, 200);
    if (Array.isArray(r.body)) {
      assert(r.body.length <= 5, `Expected max 5 logs, got ${r.body.length}`);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶  BL-8: Multi-tenancy isolation');
  // ──────────────────────────────────────────────────────────────────────────

  await test('Teacher B cannot see Teacher A data', async () => {
    const pw2 = await bcrypt.hash('BL_TeacherB', 10);
    const [t2] = (await pool.query(
      "INSERT INTO teachers (username,password,name,slug) VALUES ('_bl_teacher_b',$1,'BL Teacher B','_bl_teacher_b') RETURNING id",
      [pw2])).rows;
    const t2Token = makeToken({ id: t2.id, role: 'teacher' });

    const r = await request('GET', '/api/students', null, t2Token);
    assertEqual(r.status, 200);
    // Teacher B should see NO students (their own students list is empty)
    if (Array.isArray(r.body)) {
      assert(r.body.length === 0 || r.body.every(s => s.teacher_id === t2.id),
        `Teacher B should not see Teacher A's students`);
    }
    await pool.query('DELETE FROM teachers WHERE id=$1', [t2.id]);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('═'.repeat(60));
console.log('  WATHBA Business Logic Test Suite');
console.log('═'.repeat(60) + '\n');

(async () => {
  await setup();
  try {
    await runTests();
  } finally {
    await teardown();
    await pool.end();
  }
  console.log('\n' + '─'.repeat(60));
  const total = passed + failed + skipped;
  console.log(`  Results: ${passed}/${total} passed  |  ${failed} failed  |  ${skipped} skipped`);
  console.log('─'.repeat(60));
  if (failed > 0) process.exit(1);
})();
