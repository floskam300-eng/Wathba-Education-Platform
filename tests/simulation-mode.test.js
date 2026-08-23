/**
 * Student Simulation Mode Comprehensive Verification & Data Isolation Test Suite
 */
'use strict';
require('dotenv').config();
const assert = require('assert');
const EventEmitter = require('events');
const pool = require('../server/db/connection');
const { generateToken } = require('../server/middleware/auth');
const simulationRoutes = require('../server/routes/simulation');
const coursesRoutes = require('../server/routes/courses');
const examsRoutes = require('../server/routes/exams');
const recitationsRoutes = require('../server/routes/recitations');
const teachersRoutes = require('../server/routes/teachers');
const whatsappRoutes = require('../server/routes/whatsapp');
const notificationsRoutes = require('../server/routes/notifications');
const authRoutes = require('../server/routes/auth');
const eventsRoutes = require('../server/routes/events');

// Helper to execute route handler in isolation
async function mockRequest(routeStack, method, path, reqObj) {
  let resData = null;
  let resStatusCode = 200;
  const resHeaders = {};
  
  const res = new EventEmitter();
  res.statusCode = 200;
  res.setHeader = (name, val) => { resHeaders[name.toLowerCase()] = val; };
  res.getHeader = (name) => resHeaders[name.toLowerCase()];
  res.status = function(code) {
    resStatusCode = code;
    this.statusCode = code;
    return this;
  };
  res.json = function(d) {
    resData = (typeof d === 'object' && d !== null) ? (Array.isArray(d) ? [...d] : { ...d }) : d;
    this.emit('finish');
    return this;
  };
  res.send = function(d) {
    resData = d;
    this.emit('finish');
    return this;
  };

  const req = {
    headers: {},
    get: function(h) { return this.headers[h.toLowerCase()] || ''; },
    header: function(h) { return this.headers[h.toLowerCase()] || ''; },
    app: { get: () => false },
    ip: '127.0.0.1',
    query: {},
    params: {},
    body: {},
    ...reqObj,
  };

  const matching = routeStack.find(
    s => s.route && s.route.path === path && s.route.methods[method.toLowerCase()]
  );
  if (!matching) throw new Error(`Route handler not found for ${method.toUpperCase()} ${path}`);

  // Execute middleware chain
  for (const layer of matching.route.stack) {
    let nextCalled = false;
    await layer.handle(req, res, (err) => {
      if (err) throw err;
      nextCalled = true;
    });
    if (!nextCalled && resData !== null) break;
  }

  return { data: resData, status: resStatusCode };
}

async function runTests() {
  console.log('🚀 Starting Student Simulation Mode & Deep Isolation Tests...\n');

  // 1. Setup a test teacher and courses
  const teacherUsername = `test_sim_teacher_${Date.now()}`;
  const teacherRes = await pool.query(
    `INSERT INTO teachers (username, password, name, bio, classification, whatsapp_phone, slug)
     VALUES ($1, 'hash123', 'أستاذ المحاكاة', 'Bio', 'معلم رياضيات', '+201011112222', $1)
     RETURNING id, username, slug`,
    [teacherUsername]
  );
  const teacher = teacherRes.rows[0];
  const teacherId = teacher.id;
  const teacherToken = generateToken({ id: teacherId, role: 'teacher', username: teacher.username, slug: teacher.slug });

  // Create two courses for different stages
  const courseStage1Res = await pool.query(
    `INSERT INTO courses (name, description, price, teacher_id, target_stage, is_published)
     VALUES ('كورس أولى ثانوي', 'شرح أولى', 150, $1, 'الصف الأول الثانوي عام', true)
     RETURNING id`,
    [teacherId]
  );
  const courseStage1Id = courseStage1Res.rows[0].id;

  const courseStage2Res = await pool.query(
    `INSERT INTO courses (name, description, price, teacher_id, target_stage, is_published)
     VALUES ('كورس تالتة ثانوي', 'شرح تالتة', 200, $1, 'الصف الثالث الثانوي', true)
     RETURNING id`,
    [teacherId]
  );
  const courseStage2Id = courseStage2Res.rows[0].id;

  console.log('  ✅ Created test teacher and sample courses for multiple stages');

  // 2. Test GET /stages
  {
    const req = { user: { id: teacherId, role: 'teacher' } };
    const { data: resData } = await mockRequest(simulationRoutes.stack, 'GET', '/stages', req);

    assert(resData, 'GET /stages should return data');
    assert(Array.isArray(resData.teacherStages), 'teacherStages must be an array');
    assert(resData.teacherStages.includes('الصف الأول الثانوي عام'), 'teacherStages should include 1st sec course stage');
    assert(resData.teacherStages.includes('الصف الثالث الثانوي'), 'teacherStages should include 3rd sec course stage');
    assert(Array.isArray(resData.allStages), 'allStages must be an array');
    console.log('  ✅ GET /stages returns active teacher stages & complete system stages');
  }

  // 3. Test POST /start (Start simulation for 1st secondary)
  let simToken = null;
  let simStudent = null;
  {
    const req = {
      user: { id: teacherId, role: 'teacher' },
      body: {
        academic_stage: 'الصف الأول الثانوي عام',
        auto_enroll: true,
        reset_data: true,
        destination: '/student/courses',
      },
      ip: '127.0.0.1',
    };
    const { data: resData } = await mockRequest(simulationRoutes.stack, 'POST', '/start', req);

    assert(resData && resData.success, 'POST /start must succeed');
    assert(resData.token, 'POST /start must return a simulation JWT');
    assert(resData.user.is_simulation === true, 'user.is_simulation must be true');
    assert.strictEqual(resData.user.academic_stage, 'الصف الأول الثانوي عام');

    simToken = resData.token;
    simStudent = resData.user;

    // Verify simulation student in DB
    const dbSim = await pool.query('SELECT * FROM students WHERE id = $1', [simStudent.id]);
    assert.strictEqual(dbSim.rows[0].is_simulation, true, 'is_simulation must be true in DB');
    assert.strictEqual(dbSim.rows[0].academic_stage, 'الصف الأول الثانوي عام');

    // Verify auto-enrollment in stage 1 course
    const enrollments = await pool.query(
      'SELECT course_id FROM student_course_enrollment WHERE student_id = $1 AND status = $2',
      [simStudent.id, 'active']
    );
    const enrolledIds = enrollments.rows.map(r => r.course_id);
    assert(enrolledIds.includes(courseStage1Id), 'Simulation student should be auto-enrolled in 1st sec course');
    console.log('  ✅ POST /start creates sandbox student, sets is_simulation=true, and auto-enrolls in stage courses');
  }

  // 4. Test POST /switch-stage (Switch to 3rd secondary)
  {
    const req = {
      user: { id: simStudent.id, role: 'student', is_simulation: true, teacher_id: teacherId },
      body: {
        academic_stage: 'الصف الثالث الثانوي',
        auto_enroll: true,
      },
    };
    const { data: resData } = await mockRequest(simulationRoutes.stack, 'POST', '/switch-stage', req);

    assert(resData && resData.success, 'POST /switch-stage must succeed');
    assert.strictEqual(resData.user.academic_stage, 'الصف الثالث الثانوي');

    // Verify updated enrollment in stage 2 course
    const enrollments = await pool.query(
      'SELECT course_id FROM student_course_enrollment WHERE student_id = $1 AND status = $2',
      [simStudent.id, 'active']
    );
    const enrolledIds = enrollments.rows.map(r => r.course_id);
    assert(enrolledIds.includes(courseStage2Id), 'Simulation student should be enrolled in 3rd sec course after switch');
    console.log('  ✅ POST /switch-stage dynamically updates stage and enrolls in new stage courses');
  }

  // 5. Test Live Exam & Recitation Activity inside Sandbox
  const examRes = await pool.query(
    `INSERT INTO exams (title, duration_minutes, total_score, teacher_id, pass_score, is_published)
     VALUES ('اختبار فيزياء تجريبي', 30, 100, $1, 50, true) RETURNING id`,
    [teacherId]
  );
  const examId = examRes.rows[0].id;

  await pool.query(
    `INSERT INTO exam_results (student_id, exam_id, score, correct_count, wrong_count, points_earned, is_latest, is_absent, answers)
     VALUES ($1, $2, 40, 4, 6, 20, true, false, '[{"question_id": 1, "is_correct": false, "student_answer": "B"}]'::jsonb)`,
    [simStudent.id, examId]
  );

  const recRes = await pool.query(
    `INSERT INTO recitations (title, duration_minutes, total_score, teacher_id, pass_score, is_published)
     VALUES ('تسميع كيمياء تجريبي', 15, 20, $1, 10, true) RETURNING id`,
    [teacherId]
  );
  const recId = recRes.rows[0].id;

  await pool.query(
    `INSERT INTO recitation_results (student_id, recitation_id, score, correct_count, wrong_count, passed, is_absent)
     VALUES ($1, $2, 18, 9, 1, true, false)`,
    [simStudent.id, recId]
  );

  console.log('  ✅ Simulated exam attempt & recitation submission recorded for simulation student');

  // 6. Deep Data Isolation Assertions
  console.log('\n🔒 Verifying Deep Sandbox Isolation Across All Endpoints:');

  // A. Direct Student Credential Login Security
  {
    const req = {
      body: {
        username: simStudent.username,
        password: 'anyPassword123',
        role: 'student',
      },
    };
    const { status } = await mockRequest(authRoutes.stack, 'POST', '/login', req);
    assert.strictEqual(status, 401, 'Direct credential login for simulation student MUST return 401 Unauthorized');
    console.log('  🔒 1. Direct login to simulation student account strictly blocked (401 Unauthorized)');
  }

  // B. GET /courses enrolled_count isolation
  {
    const req = { user: { id: teacherId, role: 'teacher' } };
    const { data: coursesList } = await mockRequest(coursesRoutes.stack, 'GET', '/', req);
    assert(Array.isArray(coursesList), 'Courses response must be an array');
    const course1 = coursesList.find(c => c.id === courseStage1Id);
    const course2 = coursesList.find(c => c.id === courseStage2Id);
    assert.strictEqual(course1?.enrolled_count, 0, 'Course 1 enrolled_count must be 0 (simulation excluded)');
    assert.strictEqual(course2?.enrolled_count, 0, 'Course 2 enrolled_count must be 0 (simulation excluded)');
    console.log('  🔒 2. Courses list enrolled_count is 0 (simulation enrollment excluded)');
  }

  // C. GET /exams attempt_count isolation
  {
    const req = { user: { id: teacherId, role: 'teacher' } };
    const { data: examsList } = await mockRequest(examsRoutes.stack, 'GET', '/', req);
    assert(Array.isArray(examsList), 'Exams response must be an array');
    const testExam = examsList.find(e => e.id === examId);
    assert.strictEqual(testExam?.attempt_count, 0, 'Exam attempt_count must be 0 (simulation attempt excluded)');
    console.log('  🔒 3. Exams list attempt_count is 0 (simulation attempts excluded)');
  }

  // D. GET /recitations result_count isolation
  {
    const req = { user: { id: teacherId, role: 'teacher' } };
    const { data: recList } = await mockRequest(recitationsRoutes.stack, 'GET', '/', req);
    assert(Array.isArray(recList), 'Recitations response must be an array');
    const testRec = recList.find(r => r.id === recId);
    assert.strictEqual(Number(testRec?.result_count), 0, 'Recitation result_count must be 0 (simulation result excluded)');
    console.log('  🔒 4. Recitations list result_count is 0 (simulation results excluded)');
  }

  // E. GET /teachers/at-risk-students isolation
  {
    const req = { user: { id: teacherId, role: 'teacher' }, query: {} };
    const { data: atRisk } = await mockRequest(teachersRoutes.stack, 'GET', '/at-risk-students', req);
    assert(Array.isArray(atRisk), 'At-risk response must be an array');
    assert.strictEqual(atRisk.length, 0, 'At-risk students list must be empty (simulation student excluded)');
    console.log('  🔒 5. At-risk students report is empty (simulation low score excluded)');
  }

  // F. GET /whatsapp/students recipient picker isolation
  {
    const req = { user: { id: teacherId, role: 'teacher' } };
    const { data: waStudents } = await mockRequest(whatsappRoutes.stack, 'GET', '/students', req);
    assert(Array.isArray(waStudents), 'WhatsApp students response must be an array');
    assert.strictEqual(waStudents.length, 0, 'WhatsApp student picker must be empty (simulation excluded)');
    console.log('  🔒 6. WhatsApp broadcast recipient picker is empty (simulation excluded)');
  }

  // G. GET /notifications/students recipient picker isolation
  {
    const req = { user: { id: teacherId, role: 'teacher' } };
    const { data: notifStudents } = await mockRequest(notificationsRoutes.stack, 'GET', '/students', req);
    assert(Array.isArray(notifStudents), 'Notifications students response must be an array');
    assert.strictEqual(notifStudents.length, 0, 'Notification student picker must be empty (simulation excluded)');
    console.log('  🔒 7. Platform notification student picker is empty (simulation excluded)');
  }

  // H. POST /events/capture-attempt suppression
  {
    const req = {
      user: { id: simStudent.id, role: 'student', is_simulation: true, teacher_id: teacherId, name: 'Simulated', username: simStudent.username },
      body: { type: 'print_screen' },
      ip: '127.0.0.1',
    };
    const { data: captureRes } = await mockRequest(eventsRoutes.stack, 'POST', '/capture-attempt', req);
    assert.strictEqual(captureRes.logged, false, 'Capture attempt during simulation must return logged: false');
    assert.strictEqual(captureRes.reason, 'simulation', 'Capture attempt reason must be simulation');

    // Verify 0 records in device_alerts
    const alertCount = await pool.query('SELECT COUNT(*)::int AS cnt FROM device_alerts WHERE teacher_id = $1', [teacherId]);
    assert.strictEqual(alertCount.rows[0].cnt, 0, 'No device alert should be recorded for simulation student');
    console.log('  🔒 8. Anti-cheat capture events suppressed during simulation (no fake alerts created)');
  }

  // 7. Test POST /reset
  {
    const req = {
      user: { id: simStudent.id, role: 'student', is_simulation: true, teacher_id: teacherId },
    };
    const { data: resData } = await mockRequest(simulationRoutes.stack, 'POST', '/reset', req);

    assert(resData && resData.success, 'POST /reset must succeed');

    // Check that exam and recitation results were wiped
    const examResultsCheck = await pool.query('SELECT COUNT(*)::int AS count FROM exam_results WHERE student_id = $1', [simStudent.id]);
    assert.strictEqual(examResultsCheck.rows[0].count, 0, 'Exam results must be wiped for simulation student on reset');
    const recResultsCheck = await pool.query('SELECT COUNT(*)::int AS count FROM recitation_results WHERE student_id = $1', [simStudent.id]);
    assert.strictEqual(recResultsCheck.rows[0].count, 0, 'Recitation results must be wiped for simulation student on reset');
    console.log('  ✅ POST /reset completely wipes simulation student progress and attempts');
  }

  // Cleanup test teacher and all cascaded dummy records
  await pool.query('DELETE FROM teachers WHERE id = $1', [teacherId]);

  console.log('\n================================================================');
  console.log('🎉 ALL STUDENT SIMULATION & ZERO-LEAKAGE TESTS PASSED! 🚀');
  console.log('================================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
