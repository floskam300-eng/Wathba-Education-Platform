/**
 * Student Academic Stage Transfer & Content Scoping Verification Test
 */
'use strict';
require('dotenv').config();
const assert = require('assert');
const pool = require('../server/db/connection');
const bcrypt = require('bcryptjs');

async function runTest() {
  console.log('══════════════════════════════════════════════════════════');
  console.log('  Testing Student Academic Stage Transfer & Isolation');
  console.log('══════════════════════════════════════════════════════════\n');

  const testSuffix = Date.now().toString().slice(-6);
  const teacherUsername = `t_stage_${testSuffix}`;
  const studentUsername = `s_stage_${testSuffix}`;
  const stage1 = 'الصف الأول الثانوي عام';
  const stage2 = 'الصف الثاني الثانوي عام';

  let teacherId, studentId, course1Id, course2Id, exam1Id, exam2Id, rec1Id, rec2Id;

  try {
    // 1. Create test teacher
    const hashedPassword = await bcrypt.hash('password123', 10);
    const teacherRes = await pool.query(
      `INSERT INTO teachers (username, password, name, slug)
       VALUES ($1, $2, 'أستاذ التجربة', $3)
       RETURNING id`,
      [teacherUsername, hashedPassword, teacherUsername]
    );
    teacherId = teacherRes.rows[0].id;
    console.log(`✅ Created test teacher (ID: ${teacherId})`);

    // 2. Create courses for stage1 and stage2
    const c1Res = await pool.query(
      `INSERT INTO courses (name, teacher_id, target_stage, is_free, is_published)
       VALUES ('كورس فيزياء أولى ثانوي', $1, $2, true, true)
       RETURNING id`,
      [teacherId, stage1]
    );
    course1Id = c1Res.rows[0].id;

    const c2Res = await pool.query(
      `INSERT INTO courses (name, teacher_id, target_stage, is_free, is_published)
       VALUES ('كورس فيزياء ثانية ثانوي', $1, $2, true, true)
       RETURNING id`,
      [teacherId, stage2]
    );
    course2Id = c2Res.rows[0].id;
    console.log(`✅ Created courses: C1 (Stage 1: ${course1Id}), C2 (Stage 2: ${course2Id})`);

    // 3. Create exams for each course
    const e1Res = await pool.query(
      `INSERT INTO exams (title, course_id, teacher_id, is_published)
       VALUES ('امتحان أولى ثانوي', $1, $2, true)
       RETURNING id`,
      [course1Id, teacherId]
    );
    exam1Id = e1Res.rows[0].id;

    const e2Res = await pool.query(
      `INSERT INTO exams (title, course_id, teacher_id, is_published)
       VALUES ('امتحان ثانية ثانوي', $1, $2, true)
       RETURNING id`,
      [course2Id, teacherId]
    );
    exam2Id = e2Res.rows[0].id;
    console.log(`✅ Created exams: E1 (Course 1: ${exam1Id}), E2 (Course 2: ${exam2Id})`);

    // 4. Create recitations for each stage/course
    const r1Res = await pool.query(
      `INSERT INTO recitations (title, course_id, teacher_id, academic_stage, is_published)
       VALUES ('تسميع أولى ثانوي', $1, $2, $3, true)
       RETURNING id`,
      [course1Id, teacherId, stage1]
    );
    rec1Id = r1Res.rows[0].id;

    const r2Res = await pool.query(
      `INSERT INTO recitations (title, course_id, teacher_id, academic_stage, is_published)
       VALUES ('تسميع ثانية ثانوي', $1, $2, $3, true)
       RETURNING id`,
      [course2Id, teacherId, stage2]
    );
    rec2Id = r2Res.rows[0].id;
    console.log(`✅ Created recitations: R1 (Stage 1: ${rec1Id}), R2 (Stage 2: ${rec2Id})`);

    // 5. Create student in Stage 1
    const stRes = await pool.query(
      `INSERT INTO students (username, password, name, teacher_id, academic_stage, gender)
       VALUES ($1, $2, 'طالب منقول', $3, $4, 'ذكر')
       RETURNING id`,
      [studentUsername, hashedPassword, teacherId, stage1]
    );
    studentId = stRes.rows[0].id;
    console.log(`✅ Created student in ${stage1} (ID: ${studentId})`);

    // Auto-enroll in Stage 1 free course
    await pool.query(
      `INSERT INTO student_course_enrollment (student_id, course_id, status)
       SELECT $1, c.id, 'active' FROM courses c
       WHERE c.teacher_id = $2 AND c.is_free = true AND c.is_published = true
         AND (c.target_stage IS NULL OR c.target_stage = '' OR c.target_stage = $3)
       ON CONFLICT (student_id, course_id) DO UPDATE SET status = 'active'`,
      [studentId, teacherId, stage1]
    );

    // Verify initial state (in Stage 1)
    const initialCourses = await pool.query(
      `SELECT c.id FROM courses c
       JOIN student_course_enrollment sce ON c.id = sce.course_id
       JOIN students st ON st.id = $1 AND st.teacher_id = c.teacher_id
       WHERE sce.student_id = $1
         AND sce.status = 'active'
         AND c.is_published = true
         AND (c.target_stage IS NULL OR c.target_stage = '' OR c.target_stage = st.academic_stage)`,
      [studentId]
    );
    assert.strictEqual(initialCourses.rows.length, 1);
    assert.strictEqual(initialCourses.rows[0].id, course1Id);
    console.log('✅ Stage 1 student correctly sees only Course 1');

    const initialExams = await pool.query(
      `SELECT e.id FROM exams e
       JOIN students st ON st.id = $1 AND st.teacher_id = e.teacher_id
       LEFT JOIN courses c ON e.course_id = c.id
       LEFT JOIN student_course_enrollment sce ON e.course_id = sce.course_id AND sce.student_id = $1 AND sce.status = 'active'
       WHERE e.teacher_id = st.teacher_id
         AND e.is_published = true
         AND e.deleted_at IS NULL
         AND (
           (e.course_id IS NOT NULL AND sce.status = 'active' AND (c.target_stage IS NULL OR c.target_stage = '' OR c.target_stage = st.academic_stage))
           OR
           (e.course_id IS NULL)
         )`,
      [studentId]
    );
    assert.strictEqual(initialExams.rows.length, 1);
    assert.strictEqual(initialExams.rows[0].id, exam1Id);
    console.log('✅ Stage 1 student correctly sees only Exam 1');

    const initialRecs = await pool.query(
      `SELECT r.id FROM recitations r
       WHERE r.teacher_id=$2
         AND r.is_published=true
         AND r.deleted_at IS NULL
         AND (r.academic_stage IS NULL OR r.academic_stage = '' OR r.academic_stage=$3)
         AND (
           r.course_id IS NULL
           OR EXISTS (
             SELECT 1 FROM student_course_enrollment sce
             JOIN courses c ON c.id = sce.course_id
             WHERE sce.student_id=$1 AND sce.course_id=r.course_id AND sce.status='active'
               AND (c.target_stage IS NULL OR c.target_stage = '' OR c.target_stage = $3)
           )
         )`,
      [studentId, teacherId, stage1]
    );
    assert.strictEqual(initialRecs.rows.length, 1);
    assert.strictEqual(initialRecs.rows[0].id, rec1Id);
    console.log('✅ Stage 1 student correctly sees only Recitation 1');

    // 6. SIMULATE TRANSFER: Update student from Stage 1 to Stage 2
    console.log(`\n🔄 Transferring student from ${stage1} to ${stage2}...`);

    // Execute student update logic
    await pool.query(
      'UPDATE students SET academic_stage=$1 WHERE id=$2 AND teacher_id=$3',
      [stage2, studentId, teacherId]
    );

    // Deactivate old enrollments
    await pool.query(
      `UPDATE student_course_enrollment
       SET status = 'inactive'
       WHERE student_id = $1
         AND course_id IN (
           SELECT id FROM courses
           WHERE teacher_id = $2
             AND target_stage IS NOT NULL
             AND target_stage != ''
             AND target_stage != $3
         )`,
      [studentId, teacherId, stage2]
    );

    // Auto-enroll in new stage free courses
    await pool.query(
      `INSERT INTO student_course_enrollment (student_id, course_id, status)
       SELECT $1, c.id, 'active'
       FROM courses c
       WHERE c.teacher_id = $2 AND c.is_free = true AND c.is_published = true
         AND (c.target_stage IS NULL OR c.target_stage = '' OR c.target_stage = $3)
       ON CONFLICT (student_id, course_id) DO UPDATE SET status = 'active'`,
      [studentId, teacherId, stage2]
    );

    // 7. Verify post-transfer state (in Stage 2)
    const afterCourses = await pool.query(
      `SELECT c.id FROM courses c
       JOIN student_course_enrollment sce ON c.id = sce.course_id
       JOIN students st ON st.id = $1 AND st.teacher_id = c.teacher_id
       WHERE sce.student_id = $1
         AND sce.status = 'active'
         AND c.is_published = true
         AND (c.target_stage IS NULL OR c.target_stage = '' OR c.target_stage = st.academic_stage)`,
      [studentId]
    );
    assert.strictEqual(afterCourses.rows.length, 1);
    assert.strictEqual(afterCourses.rows[0].id, course2Id);
    console.log('✅ After transfer: student sees only Course 2 (Course 1 is gone)');

    const afterExams = await pool.query(
      `SELECT e.id FROM exams e
       JOIN students st ON st.id = $1 AND st.teacher_id = e.teacher_id
       LEFT JOIN courses c ON e.course_id = c.id
       LEFT JOIN student_course_enrollment sce ON e.course_id = sce.course_id AND sce.student_id = $1 AND sce.status = 'active'
       WHERE e.teacher_id = st.teacher_id
         AND e.is_published = true
         AND e.deleted_at IS NULL
         AND (
           (e.course_id IS NOT NULL AND sce.status = 'active' AND (c.target_stage IS NULL OR c.target_stage = '' OR c.target_stage = st.academic_stage))
           OR
           (e.course_id IS NULL)
         )`,
      [studentId]
    );
    assert.strictEqual(afterExams.rows.length, 1);
    assert.strictEqual(afterExams.rows[0].id, exam2Id);
    console.log('✅ After transfer: student sees only Exam 2 (Exam 1 is gone)');

    const afterRecs = await pool.query(
      `SELECT r.id FROM recitations r
       WHERE r.teacher_id=$2
         AND r.is_published=true
         AND r.deleted_at IS NULL
         AND (r.academic_stage IS NULL OR r.academic_stage = '' OR r.academic_stage=$3)
         AND (
           r.course_id IS NULL
           OR EXISTS (
             SELECT 1 FROM student_course_enrollment sce
             JOIN courses c ON c.id = sce.course_id
             WHERE sce.student_id=$1 AND sce.course_id=r.course_id AND sce.status='active'
               AND (c.target_stage IS NULL OR c.target_stage = '' OR c.target_stage = $3)
           )
         )`,
      [studentId, teacherId, stage2]
    );
    assert.strictEqual(afterRecs.rows.length, 1);
    assert.strictEqual(afterRecs.rows[0].id, rec2Id);
    console.log('✅ After transfer: student sees only Recitation 2 (Recitation 1 is gone)');

    // 8. Verify old course content access rejection
    const oldCourseContentCheck = await pool.query(
      `SELECT sce.id FROM student_course_enrollment sce
       JOIN courses c ON c.id = sce.course_id
       JOIN students s ON s.id = sce.student_id
       WHERE sce.student_id=$1 AND sce.course_id=$2 AND sce.status='active'
         AND c.teacher_id = s.teacher_id
         AND c.is_published = true
         AND (c.target_stage IS NULL OR c.target_stage = '' OR c.target_stage = s.academic_stage)`,
      [studentId, course1Id]
    );
    assert.strictEqual(oldCourseContentCheck.rows.length, 0);
    console.log('✅ Old course content access correctly blocked (0 rows)');

    // 9. Verify new course content access granted
    const newCourseContentCheck = await pool.query(
      `SELECT sce.id FROM student_course_enrollment sce
       JOIN courses c ON c.id = sce.course_id
       JOIN students s ON s.id = sce.student_id
       WHERE sce.student_id=$1 AND sce.course_id=$2 AND sce.status='active'
         AND c.teacher_id = s.teacher_id
         AND c.is_published = true
         AND (c.target_stage IS NULL OR c.target_stage = '' OR c.target_stage = s.academic_stage)`,
      [studentId, course2Id]
    );
    assert.strictEqual(newCourseContentCheck.rows.length, 1);
    console.log('✅ New course content access correctly allowed (1 row)');

    console.log('\n══════════════════════════════════════════════════════════');
    console.log('🎉 ALL STAGE TRANSFER & CONTENT ISOLATION TESTS PASSED!');
    console.log('══════════════════════════════════════════════════════════');
  } finally {
    // Cleanup
    if (teacherId) {
      await pool.query('DELETE FROM teachers WHERE id = $1', [teacherId]).catch(() => {});
    }
    await pool.end();
  }
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
