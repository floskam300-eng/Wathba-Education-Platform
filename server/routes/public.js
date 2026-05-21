const express = require('express');
const pool = require('../db/connection');
const { resolveTenant } = require('../middleware/tenant');
const router = express.Router();

router.use(resolveTenant);

// ── GET /api/public/tenant — returns tenant branding info for the frontend
router.get('/tenant', async (req, res) => {
  if (!req.tenant) return res.json({ tenant: null });
  const { id, name, bio, classification, logo_url, photo_url, whatsapp_phone, platform_name, primary_color, subdomain } = req.tenant;
  res.json({ tenant: { id, name, bio, classification, logo_url, photo_url, whatsapp_phone, platform_name, primary_color, subdomain } });
});

// ── GET /api/public/info — landing page data scoped to tenant
router.get('/info', async (req, res) => {
  try {
    let teacher;
    if (req.tenant) {
      teacher = req.tenant;
    } else {
      const r = await pool.query(
        'SELECT id, name, bio, classification, logo_url, photo_url, whatsapp_phone, platform_name, primary_color, subdomain, created_at FROM teachers ORDER BY id ASC LIMIT 1'
      );
      teacher = r.rows[0] || null;
    }

    if (!teacher) return res.json({ teacher: null, stats: {}, courses: [] });

    const teacherId = teacher.id;

    const [stats, courses] = await Promise.all([
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM students WHERE teacher_id=$1 AND deleted_at IS NULL) AS total_students,
          (SELECT COUNT(*) FROM courses   WHERE teacher_id=$1 AND is_published = true) AS total_courses,
          (SELECT COUNT(*) FROM exams     WHERE teacher_id=$1 AND is_published = true) AS total_exams,
          (SELECT COUNT(*) FROM exam_results er JOIN exams e ON er.exam_id=e.id WHERE e.teacher_id=$1) AS total_results
      `, [teacherId]),
      pool.query(
        `SELECT id, name, description, price, thumbnail_url, target_stage, created_at
         FROM courses WHERE teacher_id=$1 AND is_published = true AND price > 0
         ORDER BY price DESC LIMIT 3`,
        [teacherId]
      ),
    ]);

    res.json({
      teacher,
      stats: stats.rows[0],
      courses: courses.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/public/parent-lookup — scoped to tenant
router.get('/parent-lookup', async (req, res) => {
  const { phone } = req.query;
  if (!phone || phone.trim().length < 7) {
    return res.status(400).json({ error: 'رقم الهاتف غير صحيح' });
  }

  // Subdomain was in URL but not found in DB → no results possible
  if (req.subdomainNotFound) {
    return res.status(404).json({ error: 'لم يتم العثور على طالب مرتبط بهذا الرقم' });
  }

  try {
    let teacherFilter = '';
    const params = [phone.trim()];

    if (req.tenant) {
      teacherFilter = 'AND teacher_id = $2';
      params.push(req.tenant.id);
    }

    const studentRes = await pool.query(
      `SELECT id, name, phone, parent_phone, academic_stage, gender, points, created_at
       FROM students
       WHERE parent_phone = $1 AND deleted_at IS NULL ${teacherFilter}`,
      params
    );

    if (studentRes.rows.length === 0) {
      return res.status(404).json({ error: 'لم يتم العثور على طالب مرتبط بهذا الرقم' });
    }

    const student = studentRes.rows[0];
    const sid = student.id;

    const [coursesRes, examsRes, videoProgressRes, rankRes] = await Promise.all([
      pool.query(
        `SELECT c.id, c.name, c.description, c.thumbnail_url, c.target_stage, sce.enrollment_date, sce.status
         FROM student_course_enrollment sce
         JOIN courses c ON c.id = sce.course_id
         WHERE sce.student_id = $1 ORDER BY sce.enrollment_date DESC`,
        [sid]
      ),
      pool.query(
        `SELECT er.id, er.score, er.correct_count, er.wrong_count, er.unanswered_count,
                er.created_at, e.title AS exam_title, e.total_score, e.pass_score,
                c.name AS course_name
         FROM exam_results er
         JOIN exams e ON e.id = er.exam_id
         LEFT JOIN courses c ON c.id = e.course_id
         WHERE er.student_id = $1 ORDER BY er.created_at DESC`,
        [sid]
      ),
      pool.query(
        `SELECT COUNT(DISTINCT vp.video_id) AS videos_started,
                COALESCE(SUM(vp.watched_minutes), 0) AS total_watched_minutes,
                COALESCE(AVG(vp.progress_percentage), 0) AS avg_progress
         FROM video_progress vp WHERE vp.student_id = $1`,
        [sid]
      ),
      pool.query(
        req.tenant
          ? `SELECT COUNT(*) + 1 AS rank FROM students WHERE points > $1 AND deleted_at IS NULL AND teacher_id = $2`
          : `SELECT COUNT(*) + 1 AS rank FROM students WHERE points > $1 AND deleted_at IS NULL`,
        req.tenant ? [student.points, req.tenant.id] : [student.points]
      ),
    ]);

    res.json({
      student: {
        name: student.name,
        academic_stage: student.academic_stage,
        gender: student.gender,
        points: student.points,
        created_at: student.created_at,
        rank: parseInt(rankRes.rows[0].rank),
      },
      courses: coursesRes.rows,
      exam_results: examsRes.rows,
      video_progress: videoProgressRes.rows[0],
    });
  } catch (err) {
    console.error('Parent lookup error:', err);
    res.status(500).json({ error: 'حدث خطأ في الخادم' });
  }
});

module.exports = router;
