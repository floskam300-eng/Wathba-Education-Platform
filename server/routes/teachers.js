const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { getPermissions } = require('../lib/permissionsCache');

const router = express.Router();
router.use(authenticate);

const { getCached, setCache, invalidateCache } = require('../lib/analyticsCache');
const { invalidateCache: invalidateTenantCache } = require('../middleware/subdomainTenant');

// BUG-13 FIX: Reserved platform slugs that teachers must not claim.
// These could conflict with DNS infrastructure, platform routes, or facilitate social engineering.
const RESERVED_SLUGS = new Set([
  'api', 'www', 'admin', 'login', 'register', 'logout', 'app', 'dashboard',
  'static', 'mail', 'smtp', 'ftp', 'ns1', 'ns2', 'support', 'help', 'docs',
  'blog', 'store', 'shop', 'dev', 'staging', 'test', 'stage', 'demo', 'cdn',
  'media', 'assets', 'images', 'uploads', 'auth', 'oauth', 'signup', 'signin',
  'account', 'profile', 'settings', 'terms', 'privacy', 'status', 'health',
]);

router.get('/dashboard', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  try {
    const [students, courses, exams, assistants, payments, pendingRequests, pendingPayments, retryRequests] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM students WHERE teacher_id = $1 AND deleted_at IS NULL', [teacherId]),
      pool.query('SELECT COUNT(*) FROM courses WHERE teacher_id = $1', [teacherId]),
      pool.query('SELECT COUNT(*) FROM exams WHERE teacher_id = $1', [teacherId]),
      pool.query('SELECT COUNT(*) FROM assistants WHERE teacher_id = $1', [teacherId]),
      pool.query("SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status='verified' AND student_id IN (SELECT id FROM students WHERE teacher_id=$1 AND deleted_at IS NULL)", [teacherId]),
      pool.query(
        `SELECT COUNT(*) FROM course_enrollment_requests cer
         JOIN courses c ON c.id = cer.course_id
         WHERE c.teacher_id = $1 AND cer.status = 'pending'`,
        [teacherId]
      ),
      pool.query(
        `SELECT COUNT(*) FROM payments p
         JOIN students s ON s.id = p.student_id
         WHERE s.teacher_id = $1 AND p.status = 'pending' AND s.deleted_at IS NULL`,
        [teacherId]
      ),
      pool.query(
        `SELECT COUNT(*) FROM exam_retry_requests err
         JOIN exams e ON e.id = err.exam_id
         WHERE e.teacher_id = $1 AND err.status = 'pending'`,
        [teacherId]
      ),
    ]);
    res.json({
      totalStudents:    parseInt(students.rows[0].count),
      totalCourses:     parseInt(courses.rows[0].count),
      totalExams:       parseInt(exams.rows[0].count),
      totalAssistants:  parseInt(assistants.rows[0].count),
      totalRevenue:     parseFloat(payments.rows[0].total),
      pendingRequests:  parseInt(pendingRequests.rows[0].count),
      pendingPayments:  parseInt(pendingPayments.rows[0].count),
      pendingRetries:   parseInt(retryRequests.rows[0].count),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/profile', requireRole('teacher'), async (req, res) => {
  const { name, bio, classification, logo_url, photo_url, whatsapp_phone, platform_name, slug } = req.body;
  try {
    // Validate slug format if provided
    if (slug !== undefined && slug !== null && slug !== '') {
      if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug)) {
        return res.status(400).json({ error: 'الـ slug يجب أن يحتوي على حروف إنجليزية صغيرة وأرقام وشرطات فقط (3-50 حرف)' });
      }
      // BUG-13 FIX: Reject platform-reserved slug names
      if (RESERVED_SLUGS.has(slug)) {
        return res.status(400).json({ error: 'هذا الاسم محجوز للمنصة، اختر رابطاً مختلفاً' });
      }
      // Check uniqueness (DB also enforces UNIQUE — see BUG-14 catch below)
      const existing = await pool.query('SELECT id FROM teachers WHERE slug = $1 AND id != $2', [slug, req.user.id]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'هذا الـ slug مستخدم بالفعل، اختر رابطاً مختلفاً' });
      }
    }

    // Fetch old slug before update — needed to invalidate subdomainTenant cache
    const oldRow = await pool.query('SELECT slug FROM teachers WHERE id=$1', [req.user.id]);
    const oldSlug = oldRow.rows[0]?.slug || null;

    const result = await pool.query(
      `UPDATE teachers
          SET name=$1, bio=$2, classification=$3, logo_url=$4, photo_url=$5,
              whatsapp_phone=$6, platform_name=$7,
              slug = COALESCE(NULLIF($8,''), slug)
        WHERE id=$9
        RETURNING *`,
      [name, bio, classification, logo_url, photo_url, whatsapp_phone,
       platform_name || null, slug || null, req.user.id]
    );
    const { password: _, plain_password: __, ...safe } = result.rows[0];
    safe.teacher_slug = safe.slug;

    // Invalidate subdomainTenant cache for old slug so the new slug takes effect immediately.
    // BUG-15 FIX: also clear any stale null-cache entry for the NEW slug — without this,
    // a prior failed lookup of the new slug would be cached as "not found" for up to 5 min.
    if (oldSlug && slug && oldSlug !== slug) {
      invalidateTenantCache(oldSlug);
      invalidateTenantCache(slug);
    }

    res.json(safe);
  } catch (err) {
    // BUG-14 FIX: two concurrent profile saves can both pass the app-level uniqueness check
    // but the DB UNIQUE constraint on slug will fire for the second one → surface as 409.
    if (err.code === '23505' && err.constraint && err.constraint.includes('slug')) {
      return res.status(409).json({ error: 'هذا الـ slug مستخدم بالفعل، اختر رابطاً مختلفاً' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// [M-15] FIX: Teacher password change endpoint (was missing entirely)
// Requires current password verification before accepting new password.
router.put('/profile/password', requireRole('teacher'), async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'كلمة المرور الحالية والجديدة مطلوبتان' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل' });
  }
  if (new_password === current_password) {
    return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تختلف عن الحالية' });
  }
  try {
    const result = await pool.query('SELECT password FROM teachers WHERE id=$1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'المعلم غير موجود' });
    const valid = await bcrypt.compare(current_password, result.rows[0].password);
    if (!valid) return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    const hashed = await bcrypt.hash(new_password, 12);
    await pool.query(
      'UPDATE teachers SET password=$1, force_password_change=false WHERE id=$2',
      [hashed, req.user.id]
    );
    res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/at-risk-students', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const cacheKey = `t${teacherId}_at_risk`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);
  try {
    const result = await pool.query(`
      WITH exam_stats AS (
        SELECT er.student_id,
          COUNT(er.id)::int AS exams_taken,
          ROUND(AVG(er.score::numeric / NULLIF(e.total_score, 0) * 100), 1) AS avg_exam_pct,
          MAX(er.created_at) AS last_exam_at
        FROM exam_results er
        JOIN exams e ON er.exam_id = e.id
        WHERE e.teacher_id = $1 AND er.is_latest = true
        GROUP BY er.student_id
      ),
      -- Count total videos in enrolled courses vs actually watched (any progress)
      -- to get a true engagement ratio, not just avg of watched-only records
      video_stats AS (
        SELECT
          sce.student_id,
          COUNT(DISTINCT v.id)::int AS total_videos,
          COUNT(DISTINCT vp.video_id) FILTER (WHERE COALESCE(vp.progress_percentage,0) > 0)::int AS watched_videos,
          CASE WHEN COUNT(DISTINCT v.id) > 0
            THEN ROUND(
              COUNT(DISTINCT vp.video_id) FILTER (WHERE COALESCE(vp.progress_percentage,0) > 0)::numeric
              / COUNT(DISTINCT v.id) * 100, 1)
            ELSE 0
          END AS avg_video_pct,
          MAX(vp.last_watched_at) AS last_video_at,
          MIN(sce.enrollment_date) AS first_enrolled_at
        FROM student_course_enrollment sce
        JOIN courses c ON sce.course_id = c.id
        LEFT JOIN sections sec ON sec.course_id = c.id
        LEFT JOIN videos v ON v.course_id = c.id
        LEFT JOIN video_progress vp ON vp.video_id = v.id AND vp.student_id = sce.student_id
        WHERE c.teacher_id = $1 AND sce.status = 'active'
        GROUP BY sce.student_id
      ),
      enrollment_stats AS (
        SELECT sce.student_id,
          COUNT(sce.course_id)::int AS enrolled_courses,
          MIN(sce.enrollment_date) AS first_enrolled_at
        FROM student_course_enrollment sce
        JOIN courses c ON sce.course_id = c.id
        WHERE c.teacher_id = $1 AND sce.status = 'active'
        GROUP BY sce.student_id
      )
      SELECT
        s.id, s.name, s.username, s.academic_stage,
        COALESCE(es.exams_taken, 0)      AS exams_taken,
        es.avg_exam_pct,
        COALESCE(vs.avg_video_pct, 0)    AS avg_video_pct,
        COALESCE(vs.total_videos, 0)     AS total_videos,
        COALESCE(vs.watched_videos, 0)   AS watched_videos,
        COALESCE(en.enrolled_courses, 0) AS enrolled_courses,
        GREATEST(es.last_exam_at, vs.last_video_at) AS last_activity,
        (es.avg_exam_pct IS NOT NULL AND es.avg_exam_pct < 60)
          AS exam_risk,
        (COALESCE(vs.avg_video_pct, 0) < 30 AND COALESCE(en.enrolled_courses, 0) > 0)
          AS video_risk,
        -- Only flag inactive if enrolled >7 days ago (avoids false alarm for new students)
        (
          GREATEST(es.last_exam_at, vs.last_video_at) < NOW() - INTERVAL '14 days'
          OR (
            GREATEST(es.last_exam_at, vs.last_video_at) IS NULL
            AND COALESCE(en.first_enrolled_at, NOW()) < NOW() - INTERVAL '7 days'
          )
        ) AS inactive_risk
      FROM students s
      LEFT JOIN exam_stats    es ON s.id = es.student_id
      LEFT JOIN video_stats   vs ON s.id = vs.student_id
      LEFT JOIN enrollment_stats en ON s.id = en.student_id
      WHERE s.teacher_id = $1 AND s.deleted_at IS NULL
        AND (
          (es.avg_exam_pct IS NOT NULL AND es.avg_exam_pct < 60)
          OR
          (COALESCE(vs.avg_video_pct, 0) < 30 AND COALESCE(en.enrolled_courses, 0) > 0)
          OR
          -- BUG-6 FIX: include students who are only inactive (no exam/video risk)
          -- but haven't been active for 14 days and are actually enrolled
          (
            COALESCE(en.enrolled_courses, 0) > 0
            AND (
              GREATEST(es.last_exam_at, vs.last_video_at) < NOW() - INTERVAL '14 days'
              OR (
                GREATEST(es.last_exam_at, vs.last_video_at) IS NULL
                AND COALESCE(en.first_enrolled_at, NOW()) < NOW() - INTERVAL '7 days'
              )
            )
          )
        )
      ORDER BY es.avg_exam_pct ASC NULLS LAST, vs.avg_video_pct ASC
      LIMIT 20
    `, [teacherId]);

    const data = result.rows;
    setCache(cacheKey, data);
    res.json(data);
  } catch (err) {
    console.error('at-risk-students error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/analytics', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const cacheKey = `t${teacherId}_analytics`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);
  try {
    const examResults = await pool.query(`
      SELECT e.id, e.title, e.total_score, e.pass_score,
             ROUND(AVG(er.score::numeric / NULLIF(e.total_score,0) * 100), 1) AS avg_pct,
             ROUND(MAX(er.score::numeric / NULLIF(e.total_score,0) * 100), 1) AS max_pct,
             ROUND(MIN(er.score::numeric / NULLIF(e.total_score,0) * 100), 1) AS min_pct,
             AVG(er.score) as avg_score, MAX(er.score) as max_score, MIN(er.score) as min_score,
             COUNT(er.id) as attempt_count
      FROM exam_results er
      JOIN exams e ON er.exam_id = e.id
      WHERE e.teacher_id = $1
      GROUP BY e.id, e.title, e.total_score, e.pass_score
      ORDER BY attempt_count DESC LIMIT 10
    `, [teacherId]);

    const [topStudents, recentResults, totalStudentsRes] = await Promise.all([
      pool.query(`
        SELECT s.id, s.name, s.username, s.points, s.academic_stage, s.gender,
               COUNT(er.id) as exams_taken,
               COALESCE(ROUND(AVG(er.score::numeric / NULLIF(e.total_score,0) * 100), 1), 0) as avg_score
        FROM students s
        LEFT JOIN exam_results er ON s.id = er.student_id AND er.is_latest = true
        LEFT JOIN exams e ON er.exam_id = e.id
        WHERE s.teacher_id = $1 AND s.deleted_at IS NULL
        GROUP BY s.id, s.name, s.username, s.points, s.academic_stage, s.gender
        ORDER BY s.points DESC LIMIT 50
      `, [teacherId]),
      pool.query(`
        SELECT er.id, er.student_id, er.score, er.correct_count, er.wrong_count,
               er.unanswered_count, er.created_at,
               s.name as student_name, s.academic_stage,
               e.title as exam_title, e.total_score, e.pass_score
        FROM exam_results er
        JOIN students s ON er.student_id = s.id
        JOIN exams e ON er.exam_id = e.id
        WHERE e.teacher_id = $1 AND er.is_latest = true
        ORDER BY er.created_at DESC LIMIT 100
      `, [teacherId]),
      pool.query(
        `SELECT COUNT(*)::int AS count FROM students WHERE teacher_id = $1 AND deleted_at IS NULL`,
        [teacherId]
      ),
    ]);

    const result = {
      examResults: examResults.rows,
      topStudents: topStudents.rows,
      recentResults: recentResults.rows,
      totalStudents: totalStudentsRes.rows[0].count,
    };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// M-5 fix: assistants need can_view_analytics — this endpoint exposes correct_answer_letter
router.get('/analytics/wrong-questions', requireRole('teacher', 'assistant'), async (req, res) => {
  if (req.user.role === 'assistant') {
    try {
      const perms = await getPermissions(req.user.id, pool);
      if (!perms?.can_view_analytics)
        return res.status(403).json({ error: 'Access denied: missing permission (can_view_analytics)' });
    } catch { return res.status(500).json({ error: 'Server error' }); }
  }
  const teacherId = req.user.role === 'teacher' ? req.user.id : req.user.teacher_id;
  const full = req.query.full === 'true';
  const cacheKey = `t${teacherId}_wrong_questions_${full}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);
  try {
    // [BUG-FIX] Use COALESCE to handle both manual questions and bank_questions.
    // For manual exams, JOIN against questions table (q.*).
    // For bank exams, JOIN against bank_questions (bq.*).
    // A question_id present in exam_results.answers may come from either table.
    const result = await pool.query(`
      SELECT
        e.id   AS exam_id,
        e.title AS exam_title,
        COALESCE(q.id, bq.id) AS question_id,
        COALESCE(q.question_text, bq.question_text) AS question_text,
        COALESCE(q.option_a, bq.option_a) AS option_a,
        COALESCE(q.option_b, bq.option_b) AS option_b,
        COALESCE(q.option_c, bq.option_c) AS option_c,
        COALESCE(q.option_d, bq.option_d) AS option_d,
        COALESCE(q.correct_answer_letter, bq.correct_answer_letter) AS correct_answer_letter,
        COUNT(*)::int AS total_attempts,
        COUNT(*) FILTER (
          WHERE (ans->>'is_correct')::boolean = false
            AND ans->>'student_answer' IS NOT NULL
            AND ans->>'student_answer' != 'null'
        )::int AS wrong_count,
        ROUND(
          COUNT(*) FILTER (
            WHERE (ans->>'is_correct')::boolean = false
              AND ans->>'student_answer' IS NOT NULL
              AND ans->>'student_answer' != 'null'
          )::numeric / NULLIF(COUNT(*),0) * 100, 1
        ) AS wrong_pct
      FROM exam_results er
      JOIN exams e ON er.exam_id = e.id
      JOIN LATERAL jsonb_array_elements(er.answers) AS ans ON true
      LEFT JOIN questions q ON q.id = (ans->>'question_id')::integer AND e.question_source != 'bank'
      LEFT JOIN bank_questions bq ON bq.id = (ans->>'question_id')::integer AND e.question_source = 'bank'
      WHERE e.teacher_id = $1
        AND (ans->>'question_type' = 'mcq' OR ans->>'question_type' IS NULL OR ans->>'question_type' = '')
        AND ans->>'is_correct' IS NOT NULL
        AND (q.id IS NOT NULL OR bq.id IS NOT NULL)
      GROUP BY e.id, e.title, q.id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer_letter, bq.id, bq.question_text, bq.option_a, bq.option_b, bq.option_c, bq.option_d, bq.correct_answer_letter
      HAVING COUNT(*) > 0
      ORDER BY e.id, wrong_pct DESC, wrong_count DESC
    `, [teacherId]);

    const limit = full ? Infinity : 5;
    const byExam = {};
    for (const row of result.rows) {
      if (!byExam[row.exam_id]) {
        byExam[row.exam_id] = { exam_id: row.exam_id, exam_title: row.exam_title, questions: [] };
      }
      if (byExam[row.exam_id].questions.length < limit) {
        byExam[row.exam_id].questions.push(row);
      }
    }
    const output = Object.values(byExam);
    setCache(cacheKey, output);
    res.json(output);
  } catch (err) {
    console.error('wrong-questions error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/analytics/trend', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const rawMonths = parseInt(req.query.months);
  const months = (!isNaN(rawMonths) && rawMonths > 0) ? Math.min(rawMonths, 36) : 6;
  const cacheKey = `t${teacherId}_trend_${months}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);
  try {
    const intervalClause = months > 0
      ? `AND er.created_at >= NOW() - $2::interval`
      : '';
    const params = months > 0 ? [teacherId, `${months} months`] : [teacherId];
    const result = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', er.created_at), 'YYYY-MM') AS month,
        TO_CHAR(DATE_TRUNC('month', er.created_at), 'Mon YY')  AS label,
        ROUND(AVG(er.score::numeric / NULLIF(e.total_score,0) * 100), 1) AS avg_pct,
        COUNT(er.id)::int                                        AS exam_count,
        COUNT(DISTINCT er.student_id)::int                       AS student_count,
        COUNT(CASE WHEN er.score >= e.pass_score THEN 1 END)::int AS pass_count
      FROM exam_results er
      JOIN exams e ON er.exam_id = e.id
      WHERE e.teacher_id = $1 AND er.is_latest = true
        ${intervalClause}
      GROUP BY DATE_TRUNC('month', er.created_at)
      ORDER BY DATE_TRUNC('month', er.created_at) ASC
    `, params);
    setCache(cacheKey, result.rows);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/course-stats', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const cacheKey = `t${teacherId}_coursestats`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);
  try {
    const result = await pool.query(`
      SELECT c.id, c.name, c.target_stage,
             COUNT(DISTINCT sce.student_id)::int AS enrolled_count,
             COUNT(DISTINCT v.id)::int            AS total_videos,
             -- BUG-4/5 FIX: restrict vp to enrolled students only; compute true engagement
             -- (sum of all student-video progress / total possible combinations)
             -- so students who never watched count as 0%, not excluded from AVG
             CASE
               WHEN COUNT(DISTINCT sce.student_id) > 0 AND COUNT(DISTINCT v.id) > 0
               THEN ROUND(
                 SUM(COALESCE(vp.progress_percentage, 0))::numeric
                 / (COUNT(DISTINCT sce.student_id)::numeric * COUNT(DISTINCT v.id)::numeric)
               , 0)::int
               ELSE 0
             END AS avg_progress,
             COUNT(DISTINCT CASE WHEN vp.progress_percentage >= 80 THEN vp.student_id END)::int AS active_students
      FROM courses c
      LEFT JOIN student_course_enrollment sce ON c.id = sce.course_id AND sce.status = 'active'
      LEFT JOIN videos v  ON v.course_id = c.id
      LEFT JOIN video_progress vp ON v.id = vp.video_id AND vp.student_id = sce.student_id
      WHERE c.teacher_id = $1
      GROUP BY c.id, c.name, c.target_stage
      ORDER BY enrolled_count DESC
    `, [teacherId]);
    setCache(cacheKey, result.rows);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Full data export ──
router.get('/export', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  try {
    const [teacher, students, courses, sections, videos, pdfs, exams, questions, results, payments, enrollments, videoProgress] = await Promise.all([
      pool.query('SELECT id,username,name,bio,classification,logo_url,photo_url,whatsapp_phone,created_at FROM teachers WHERE id=$1', [teacherId]),
      pool.query('SELECT id,username,name,phone,parent_phone,academic_stage,gender,points,created_at FROM students WHERE teacher_id=$1 AND deleted_at IS NULL ORDER BY name', [teacherId]),
      pool.query('SELECT * FROM courses WHERE teacher_id=$1 ORDER BY created_at', [teacherId]),
      pool.query('SELECT s.* FROM sections s JOIN courses c ON s.course_id=c.id WHERE c.teacher_id=$1 ORDER BY s.course_id, s.sort_order', [teacherId]),
      pool.query('SELECT v.* FROM videos v JOIN courses c ON v.course_id=c.id WHERE c.teacher_id=$1 ORDER BY v.course_id, v.sort_order, v.id', [teacherId]),
      pool.query('SELECT p.* FROM pdf_files p JOIN courses c ON p.course_id=c.id WHERE c.teacher_id=$1 ORDER BY p.course_id, p.id', [teacherId]),
      pool.query('SELECT * FROM exams WHERE teacher_id=$1 ORDER BY created_at', [teacherId]),
      pool.query('SELECT q.* FROM questions q JOIN exams e ON q.exam_id=e.id WHERE e.teacher_id=$1 ORDER BY q.exam_id, q.id', [teacherId]),
      pool.query(`SELECT er.id, er.student_id, er.exam_id, er.score, er.correct_count, er.wrong_count,
                         er.unanswered_count, er.points_earned, er.start_time, er.end_time, er.answers, er.created_at,
                         e.total_score
                  FROM exam_results er
                  JOIN students s ON er.student_id=s.id
                  JOIN exams e ON er.exam_id=e.id
                  WHERE e.teacher_id=$1 AND s.deleted_at IS NULL ORDER BY er.created_at DESC`, [teacherId]),
      pool.query(`SELECT p.id, p.student_id, p.course_id, p.amount, p.method, p.payment_date, p.status, p.reference_number, p.notes
                  FROM payments p
                  JOIN students s ON p.student_id=s.id
                  WHERE s.teacher_id=$1 AND s.deleted_at IS NULL ORDER BY p.payment_date DESC`, [teacherId]),
      pool.query(`SELECT sce.student_id, sce.course_id, sce.enrollment_date, sce.status
                  FROM student_course_enrollment sce
                  JOIN students s ON sce.student_id=s.id
                  WHERE s.teacher_id=$1 AND s.deleted_at IS NULL`, [teacherId]),
      pool.query(`SELECT vp.student_id, vp.video_id, vp.watch_count, vp.watched_minutes, vp.progress_percentage, vp.last_watched_at
                  FROM video_progress vp
                  JOIN students s ON vp.student_id=s.id
                  WHERE s.teacher_id=$1 AND s.deleted_at IS NULL`, [teacherId]),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      version: '2',
      teacher: teacher.rows[0],
      students: students.rows,
      courses: courses.rows,
      sections: sections.rows,
      videos: videos.rows,
      pdfs: pdfs.rows,
      exams: exams.rows,
      questions: questions.rows,
      exam_results: results.rows,
      payments: payments.rows,
      enrollments: enrollments.rows,
      video_progress: videoProgress.rows,
      summary: {
        total_students: students.rows.length,
        total_courses: courses.rows.length,
        total_exams: exams.rows.length,
        total_questions: questions.rows.length,
        total_results: results.rows.length,
        total_payments: payments.rows.length,
        total_videos: videos.rows.length,
        total_pdfs: pdfs.rows.length,
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="wathba-backup-${new Date().toISOString().slice(0,10)}.json"`);
    res.json(exportData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Full data import (restore from JSON backup) ──
router.post('/import', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const data = req.body;

  if (!data || !data.exported_at) {
    return res.status(400).json({ error: 'ملف النسخة الاحتياطية غير صالح — تأكد أنه ملف JSON صادر من وثبة' });
  }

  // Guard against oversized import payloads that would cause excessive DB queries
  const IMPORT_LIMITS = {
    courses: 500, sections: 2000, videos: 5000, pdfs: 2000,
    exams: 1000, questions: 50000, students: 5000,
    exam_results: 100000, payments: 20000, enrollments: 20000,
  };
  for (const [key, limit] of Object.entries(IMPORT_LIMITS)) {
    const arr = data[key === 'exam_results' ? 'exam_results' : key];
    if (Array.isArray(arr) && arr.length > limit) {
      return res.status(400).json({ error: `عدد ${key} تجاوز الحد المسموح (${limit})` });
    }
  }

  const stats = {
    courses: 0, sections: 0, videos: 0, pdfs: 0,
    exams: 0, questions: 0, students: 0,
    enrollments: 0, payments: 0, results: 0,
    skipped_students: 0, errors: []
  };

  // ID maps: old_id → new_id
  const courseMap = {};
  const sectionMap = {};
  const examMap = {};
  const studentMap = {};

  // Wrap entire import in a single transaction with per-item savepoints
  // so partial failures are logged but don't leave the DB in a half-imported state
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Import courses
    for (const c of (data.courses || [])) {
      await client.query('SAVEPOINT sp');
      try {
        const r = await client.query(
          `INSERT INTO courses (name,description,price,thumbnail_url,teacher_id,target_stage,is_free,is_published,points_on_complete,created_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [c.name, c.description || null, c.price || 0, c.thumbnail_url || null, teacherId,
           c.target_stage || null, c.is_free || false, c.is_published || false,
           c.points_on_complete || 0, c.created_at || new Date()]
        );
        courseMap[c.id] = r.rows[0].id;
        stats.courses++;
        await client.query('RELEASE SAVEPOINT sp');
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT sp');
        stats.errors.push(`كورس "${c.name}": ${e.message}`);
      }
    }

    // 2. Import sections
    for (const s of (data.sections || [])) {
      const newCourseId = courseMap[s.course_id];
      if (!newCourseId) continue;
      await client.query('SAVEPOINT sp');
      try {
        const r = await client.query(
          `INSERT INTO sections (course_id,title,sort_order,created_at) VALUES($1,$2,$3,$4) RETURNING id`,
          [newCourseId, s.title, s.sort_order || 0, s.created_at || new Date()]
        );
        sectionMap[s.id] = r.rows[0].id;
        stats.sections++;
        await client.query('RELEASE SAVEPOINT sp');
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT sp');
        stats.errors.push(`قسم "${s.title}": ${e.message}`);
      }
    }

    // 3. Import videos
    for (const v of (data.videos || [])) {
      const newCourseId = courseMap[v.course_id];
      if (!newCourseId) continue;
      await client.query('SAVEPOINT sp');
      try {
        await client.query(
          `INSERT INTO videos (title,file_path_or_url,duration_minutes,course_id,sort_order,section_id,url_480,url_720,url_1080,created_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [v.title, v.file_path_or_url || null, v.duration_minutes || 0, newCourseId,
           v.sort_order || 0, v.section_id ? (sectionMap[v.section_id] || null) : null,
           v.url_480 || null, v.url_720 || null, v.url_1080 || null, v.created_at || new Date()]
        );
        stats.videos++;
        await client.query('RELEASE SAVEPOINT sp');
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT sp');
        stats.errors.push(`فيديو "${v.title}": ${e.message}`);
      }
    }

    // 4. Import PDFs
    for (const p of (data.pdfs || [])) {
      const newCourseId = courseMap[p.course_id];
      if (!newCourseId) continue;
      await client.query('SAVEPOINT sp');
      try {
        await client.query(
          `INSERT INTO pdf_files (title,file_url,course_id,section_id,created_at) VALUES($1,$2,$3,$4,$5)`,
          [p.title, p.file_url || null, newCourseId,
           p.section_id ? (sectionMap[p.section_id] || null) : null, p.created_at || new Date()]
        );
        stats.pdfs++;
        await client.query('RELEASE SAVEPOINT sp');
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT sp');
        stats.errors.push(`PDF "${p.title}": ${e.message}`);
      }
    }

    // 5. Import exams
    for (const e of (data.exams || [])) {
      await client.query('SAVEPOINT sp');
      try {
        const newCourseId = e.course_id ? (courseMap[e.course_id] || null) : null;
        const r = await client.query(
          `INSERT INTO exams (title,duration_minutes,total_score,course_id,teacher_id,pass_score,badge_name,badge_color,
             start_date,end_date,is_published,shuffle_questions,shuffle_options,points_on_attempt,points_on_pass,created_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
          [e.title, e.duration_minutes || 60, e.total_score || 100, newCourseId, teacherId,
           e.pass_score ?? 50, e.badge_name || null, e.badge_color || '#FF8C00',
           e.start_date || null, e.end_date || null,
           e.is_published || false, e.shuffle_questions || false, e.shuffle_options || false,
           e.points_on_attempt || 0, e.points_on_pass || 0, e.created_at || new Date()]
        );
        examMap[e.id] = r.rows[0].id;
        stats.exams++;
        await client.query('RELEASE SAVEPOINT sp');
      } catch (e2) {
        await client.query('ROLLBACK TO SAVEPOINT sp');
        stats.errors.push(`اختبار "${e.title}": ${e2.message}`);
      }
    }

    // 6. Import questions
    for (const q of (data.questions || [])) {
      const newExamId = examMap[q.exam_id];
      if (!newExamId) continue;
      await client.query('SAVEPOINT sp');
      try {
        await client.query(
          `INSERT INTO questions (question_text,question_image_url,option_a,option_b,option_c,option_d,
             correct_answer_letter,points,exam_id,question_type)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [q.question_text, q.question_image_url || null, q.option_a || '-', q.option_b || '-',
           q.option_c || null, q.option_d || null, q.correct_answer_letter || 'A',
           q.points || 1, newExamId, q.question_type || 'mcq']
        );
        stats.questions++;
        await client.query('RELEASE SAVEPOINT sp');
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT sp');
        stats.errors.push(`سؤال في اختبار "${q.exam_id}": ${e.message}`);
      }
    }

    // 7. Import students — collect generated passwords so they can be returned to the teacher
    const generatedPasswords = []; // {username, password}
    for (const s of (data.students || [])) {
      await client.query('SAVEPOINT sp');
      try {
        const existing = await client.query(
          'SELECT id FROM students WHERE username=$1 AND teacher_id=$2 AND deleted_at IS NULL',
          [s.username, teacherId]
        );
        if (existing.rows.length > 0) {
          studentMap[s.id] = existing.rows[0].id;
          stats.skipped_students++;
          await client.query('RELEASE SAVEPOINT sp');
          continue;
        }
        const plainPwd = s.plain_password || crypto.randomInt(100000, 1000000).toString();
        const hashed = await bcrypt.hash(plainPwd, 10);
        const r = await client.query(
          `INSERT INTO students (username,password,name,phone,parent_phone,academic_stage,gender,
             teacher_id,points,created_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [s.username, hashed, s.name, s.phone || null, s.parent_phone || null,
           s.academic_stage || null, s.gender || null, teacherId,
           s.points || 0, s.created_at || new Date()]
        );
        studentMap[s.id] = r.rows[0].id;
        stats.students++;
        if (!s.plain_password) {
          generatedPasswords.push({ username: s.username, name: s.name, generated_password: plainPwd });
        }
        await client.query('RELEASE SAVEPOINT sp');
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT sp');
        stats.errors.push(`طالب "${s.name}": ${e.message}`);
      }
    }

    // 8. Import enrollments
    for (const e of (data.enrollments || [])) {
      const newStudentId = studentMap[e.student_id];
      const newCourseId  = courseMap[e.course_id];
      if (!newStudentId || !newCourseId) continue;
      await client.query('SAVEPOINT sp');
      try {
        await client.query(
          `INSERT INTO student_course_enrollment (student_id,course_id,enrollment_date,status)
           VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [newStudentId, newCourseId, e.enrollment_date || new Date(), e.status || 'active']
        );
        stats.enrollments++;
        await client.query('RELEASE SAVEPOINT sp');
      } catch (e2) { await client.query('ROLLBACK TO SAVEPOINT sp'); }
    }

    // 9. Import payments
    const VALID_PAYMENT_STATUSES = new Set(['pending', 'verified', 'rejected']);
    for (const p of (data.payments || [])) {
      const newStudentId = studentMap[p.student_id];
      if (!newStudentId) continue;
      await client.query('SAVEPOINT sp');
      try {
        // Normalize status: 'confirmed' → 'verified', anything unknown → 'pending'
        const safeStatus = VALID_PAYMENT_STATUSES.has(p.status)
          ? p.status
          : (p.status === 'confirmed' ? 'verified' : 'pending');
        await client.query(
          `INSERT INTO payments (student_id,course_id,amount,method,payment_date,status,reference_number,notes)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [newStudentId, p.course_id ? (courseMap[p.course_id] || null) : null,
           p.amount, p.method || '', p.payment_date || new Date(),
           safeStatus, p.reference_number || null, p.notes || null]
        );
        stats.payments++;
        await client.query('RELEASE SAVEPOINT sp');
      } catch (e) { await client.query('ROLLBACK TO SAVEPOINT sp'); }
    }

    // 10. Import exam results
    // Insert all with is_latest=false first to avoid the partial-unique-index conflict
    // (uidx_exam_results_latest only allows one is_latest=true per student+exam).
    // After all inserts, promote the most-recent result per (student_id, exam_id) to is_latest=true.
    const insertedResults = []; // { id, student_id, exam_id, created_at }
    for (const r of (data.exam_results || [])) {
      const newStudentId = studentMap[r.student_id];
      const newExamId    = examMap[r.exam_id];
      if (!newStudentId || !newExamId) continue;
      await client.query('SAVEPOINT sp');
      try {
        const ins = await client.query(
          `INSERT INTO exam_results (student_id,exam_id,score,correct_count,wrong_count,
             unanswered_count,start_time,end_time,answers,points_earned,created_at,is_latest)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false) RETURNING id,student_id,exam_id,created_at`,
          [newStudentId, newExamId, r.score || 0, r.correct_count || 0,
           r.wrong_count || 0, r.unanswered_count || 0,
           r.start_time || null, r.end_time || null,
           r.answers ? JSON.stringify(r.answers) : null,
           r.points_earned || 0, r.created_at || new Date()]
        );
        insertedResults.push(ins.rows[0]);
        stats.results++;
        await client.query('RELEASE SAVEPOINT sp');
      } catch (e) { await client.query('ROLLBACK TO SAVEPOINT sp'); }
    }

    // Promote the most-recent inserted result per (student_id, exam_id) to is_latest=true.
    // First reset any existing is_latest=true rows for those pairs, then set the new latest.
    if (insertedResults.length > 0) {
      const latestMap = {};
      for (const row of insertedResults) {
        const key = `${row.student_id}_${row.exam_id}`;
        if (!latestMap[key] || new Date(row.created_at) > new Date(latestMap[key].created_at)) {
          latestMap[key] = row;
        }
      }
      for (const row of Object.values(latestMap)) {
        // Reset all existing is_latest=true for this pair (could conflict with older data)
        await client.query(
          'UPDATE exam_results SET is_latest=false WHERE student_id=$1 AND exam_id=$2 AND is_latest=true',
          [row.student_id, row.exam_id]
        );
        // Mark the newly imported latest result
        await client.query(
          'UPDATE exam_results SET is_latest=true WHERE id=$1',
          [row.id]
        );
      }
    }

    await client.query('COMMIT');
    invalidateCache(teacherId);
    res.json({ success: true, stats, generated_passwords: generatedPasswords });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Import error:', err);
    res.status(500).json({ error: 'حدث خطأ أثناء الاستيراد', details: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
