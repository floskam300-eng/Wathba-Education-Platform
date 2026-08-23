const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { getPermissions } = require('../lib/permissionsCache');
const { logActivity, getActor, getIp } = require('../lib/activityLog');

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
    // R-1 OPT: cache dashboard counts for 5 min — invalidated on any mutation
    // via invalidateCache(teacherId) called by all write routes.
    const cacheKey = `t${teacherId}_dashboard_counts_v1`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const [students, courses, exams, assistants, payments, pendingRequests, pendingPayments, retryRequests] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM students WHERE teacher_id = $1 AND deleted_at IS NULL AND is_simulation IS NOT TRUE', [teacherId]),
      pool.query('SELECT COUNT(*) FROM courses WHERE teacher_id = $1', [teacherId]),
      pool.query('SELECT COUNT(*) FROM exams WHERE teacher_id = $1 AND deleted_at IS NULL', [teacherId]),
      pool.query('SELECT COUNT(*) FROM assistants WHERE teacher_id = $1', [teacherId]),
      // M-3 OPT: JOIN instead of IN (subquery) — lets PG use the composite index directly
      pool.query(
        `SELECT COALESCE(SUM(p.amount),0) AS total
         FROM payments p
         JOIN students s ON s.id = p.student_id AND s.teacher_id = $1 AND s.deleted_at IS NULL AND s.is_simulation IS NOT TRUE
         WHERE p.status = 'verified'`,
        [teacherId]
      ),
      pool.query(
        `SELECT COUNT(*) FROM course_enrollment_requests cer
         JOIN courses c ON c.id = cer.course_id
         WHERE c.teacher_id = $1 AND cer.status = 'pending'`,
        [teacherId]
      ),
      pool.query(
        `SELECT COUNT(*) FROM payments p
         JOIN students s ON s.id = p.student_id
         WHERE s.teacher_id = $1 AND p.status = 'pending' AND s.deleted_at IS NULL AND s.is_simulation IS NOT TRUE`,
        [teacherId]
      ),
      pool.query(
        `SELECT COUNT(*) FROM exam_retry_requests err
         JOIN exams e ON e.id = err.exam_id
         WHERE e.teacher_id = $1 AND err.status = 'pending' AND e.deleted_at IS NULL`,
        [teacherId]
      ),
    ]);
    const payload = {
      totalStudents:    parseInt(students.rows[0].count),
      totalCourses:     parseInt(courses.rows[0].count),
      totalExams:       parseInt(exams.rows[0].count),
      totalAssistants:  parseInt(assistants.rows[0].count),
      totalRevenue:     parseFloat(payments.rows[0].total),
      pendingRequests:  parseInt(pendingRequests.rows[0].count),
      pendingPayments:  parseInt(pendingPayments.rows[0].count),
      pendingRetries:   parseInt(retryRequests.rows[0].count),
    };
    setCache(cacheKey, payload);
    res.json(payload);
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

    logActivity({
      teacherId: req.user.id, actor: getActor(req), ip: getIp(req),
      action: 'edit_profile',
      entity: { type: 'teacher', id: req.user.id, name: safe.name },
    });

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
    logActivity({
      teacherId: req.user.id, actor: getActor(req), ip: getIp(req),
      action: 'change_password',
      entity: { type: 'teacher', id: req.user.id },
    });
    res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// [AUDIT-FIX] Was missing a permission check entirely for assistants — any assistant
// (regardless of granted permissions) could pull at-risk-student analytics, unlike the
// equivalent wrong-questions / analytics/exam/:examId endpoints which correctly require
// can_view_analytics.
router.get('/at-risk-students', requireRole('teacher', 'assistant'), async (req, res, next) => {
  if (req.user.role === 'assistant') {
    try {
      const perms = await getPermissions(req.user.id, pool);
      if (!perms?.can_view_analytics) {
        return res.status(403).json({ error: 'Access denied: missing permission (can_view_analytics)' });
      }
    } catch {
      return res.status(500).json({ error: 'Server error' });
    }
  }
  next();
}, async (req, res) => {
  const teacherId = req.user.role === 'teacher' ? req.user.id : req.user.teacher_id;
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
        JOIN students s ON er.student_id = s.id
        WHERE e.teacher_id = $1 AND er.is_latest = true AND s.deleted_at IS NULL AND (s.is_simulation IS NOT TRUE)
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
        JOIN students s ON sce.student_id = s.id
        LEFT JOIN sections sec ON sec.course_id = c.id
        LEFT JOIN videos v ON v.course_id = c.id
        LEFT JOIN video_progress vp ON vp.video_id = v.id AND vp.student_id = sce.student_id
        WHERE c.teacher_id = $1 AND sce.status = 'active' AND s.deleted_at IS NULL AND (s.is_simulation IS NOT TRUE)
        GROUP BY sce.student_id
      ),
      enrollment_stats AS (
        SELECT sce.student_id,
          COUNT(sce.course_id)::int AS enrolled_courses,
          MIN(sce.enrollment_date) AS first_enrolled_at
        FROM student_course_enrollment sce
        JOIN courses c ON sce.course_id = c.id
        JOIN students s ON sce.student_id = s.id
        WHERE c.teacher_id = $1 AND sce.status = 'active' AND s.deleted_at IS NULL AND (s.is_simulation IS NOT TRUE)
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
      WHERE s.teacher_id = $1 AND s.deleted_at IS NULL AND (s.is_simulation IS NOT TRUE)
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
      SELECT e.id, e.title, e.total_score, e.pass_score, e.created_at, e.course_id,
             c.name AS course_name, c.target_stage,
             COALESCE(sales.sales_count, 0)::int AS sales_count,
             ROUND(AVG(er.score::numeric / NULLIF(e.total_score,0) * 100) FILTER (WHERE er.is_absent = false), 1) AS avg_pct,
             ROUND(MAX(er.score::numeric / NULLIF(e.total_score,0) * 100) FILTER (WHERE er.is_absent = false), 1) AS max_pct,
             ROUND(MIN(er.score::numeric / NULLIF(e.total_score,0) * 100) FILTER (WHERE er.is_absent = false), 1) AS min_pct,
             AVG(er.score) FILTER (WHERE er.is_absent = false) as avg_score,
             MAX(er.score) FILTER (WHERE er.is_absent = false) as max_score,
             MIN(er.score) FILTER (WHERE er.is_absent = false) as min_score,
             COUNT(er.id) FILTER (WHERE er.is_absent = false) as attempt_count,
             COUNT(er.id) FILTER (WHERE er.is_absent = false AND er.score >= e.pass_score) AS pass_count,
             COUNT(er.id) FILTER (WHERE er.is_absent = false AND er.score < e.pass_score) AS fail_count,
             COUNT(er.id) FILTER (WHERE er.is_absent = true)  as absent_count
      FROM exams e
      LEFT JOIN courses c ON e.course_id = c.id
      LEFT JOIN exam_results er ON er.exam_id = e.id AND er.is_latest = true AND er.student_id IN (SELECT id FROM students WHERE teacher_id = $1 AND is_simulation IS NOT TRUE AND deleted_at IS NULL)
      LEFT JOIN (
        SELECT course_id, COUNT(*)::int AS sales_count
        FROM payments
        WHERE status = 'verified' AND course_id IS NOT NULL
        GROUP BY course_id
      ) sales ON e.course_id = sales.course_id
      WHERE e.teacher_id = $1 AND e.deleted_at IS NULL
      GROUP BY e.id, e.title, e.total_score, e.pass_score, e.created_at, e.course_id, c.name, c.target_stage, sales.sales_count
      ORDER BY e.created_at DESC
    `, [teacherId]);

    const [topStudents, recentResults, totalStudentsRes, stageDistribution, genderDistribution] = await Promise.all([
      pool.query(`
        SELECT s.id, s.name, s.username, s.points, s.academic_stage, s.gender,
               COUNT(er.id) as exams_taken,
               COALESCE(ROUND(AVG(er.score::numeric / NULLIF(e.total_score,0) * 100), 1), 0) as avg_score
        FROM students s
        LEFT JOIN exam_results er ON s.id = er.student_id AND er.is_latest = true AND er.is_absent = false
        LEFT JOIN exams e ON er.exam_id = e.id
        WHERE s.teacher_id = $1 AND s.deleted_at IS NULL AND s.is_simulation IS NOT TRUE
        GROUP BY s.id, s.name, s.username, s.points, s.academic_stage, s.gender
        ORDER BY s.points DESC LIMIT 50
      `, [teacherId]),
      pool.query(`
        SELECT er.id, er.student_id, er.score, er.correct_count, er.wrong_count,
               er.unanswered_count, er.created_at, er.is_absent,
               s.name as student_name, s.username as student_username, s.academic_stage,
               e.title as exam_title, e.total_score, e.pass_score
        FROM exam_results er
        JOIN students s ON er.student_id = s.id
        JOIN exams e ON er.exam_id = e.id
        WHERE e.teacher_id = $1 AND er.is_latest = true AND s.deleted_at IS NULL AND s.is_simulation IS NOT TRUE
        ORDER BY er.created_at DESC LIMIT 100
      `, [teacherId]),
      pool.query(
        `SELECT COUNT(*)::int AS count FROM students WHERE teacher_id = $1 AND deleted_at IS NULL AND is_simulation IS NOT TRUE`,
        [teacherId]
      ),
      // FIX-DIST-1: Compute stage distribution over ALL students (not just top-50).
      // Previously stageDistData was derived from topStudents (LIMIT 50 by points),
      // causing the "distribution by stage" chart to misrepresent actual counts.
      pool.query(`
        SELECT COALESCE(academic_stage, 'غير محدد') AS stage,
               COUNT(*)::int AS count
        FROM students
        WHERE teacher_id = $1 AND deleted_at IS NULL AND is_simulation IS NOT TRUE
        GROUP BY academic_stage
        ORDER BY count DESC
      `, [teacherId]),
      // FIX-DIST-2: Same fix for gender distribution chart.
      pool.query(`
        SELECT COALESCE(gender, 'غير محدد') AS gender,
               COUNT(*)::int AS count
        FROM students
        WHERE teacher_id = $1 AND deleted_at IS NULL AND is_simulation IS NOT TRUE
        GROUP BY gender
        ORDER BY count DESC
      `, [teacherId]),
    ]);

    const result = {
      examResults: examResults.rows,
      topStudents: topStudents.rows,
      recentResults: recentResults.rows,
      totalStudents: totalStudentsRes.rows[0].count,
      stageDistribution: stageDistribution.rows,
      genderDistribution: genderDistribution.rows,
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
      JOIN students s ON er.student_id = s.id
      JOIN LATERAL jsonb_array_elements(er.answers) AS ans ON true
      LEFT JOIN questions q ON q.id = (ans->>'question_id')::integer AND e.question_source != 'bank'
      LEFT JOIN bank_questions bq ON bq.id = (ans->>'question_id')::integer AND e.question_source = 'bank'
      WHERE e.teacher_id = $1 AND s.deleted_at IS NULL AND (s.is_simulation IS NOT TRUE)
        AND jsonb_typeof(er.answers) = 'array'
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
      JOIN students s ON er.student_id = s.id
      WHERE e.teacher_id = $1 AND er.is_latest = true AND s.deleted_at IS NULL AND (s.is_simulation IS NOT TRUE)
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

// ── Per-exam detailed analytics ──────────────────────────────────────────────
router.get('/analytics/exam/:examId', requireRole('teacher', 'assistant'), async (req, res) => {
  // Permission check for assistants
  if (req.user.role === 'assistant') {
    try {
      const perms = await getPermissions(req.user.id, pool);
      if (!perms?.can_view_analytics)
        return res.status(403).json({ error: 'Access denied: missing permission (can_view_analytics)' });
    } catch { return res.status(500).json({ error: 'Server error' }); }
  }
  const teacherId = req.user.role === 'teacher' ? req.user.id : req.user.teacher_id;
  const examId = parseInt(req.params.examId, 10);
  if (isNaN(examId) || examId <= 0) return res.status(400).json({ error: 'Invalid exam ID' });

  const cacheKey = `t${teacherId}_exam_analytics_${examId}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    // 1. Verify exam belongs to teacher
    const examRow = await pool.query(
      `SELECT id, title, total_score, pass_score, duration_minutes, created_at, question_source, bank_id
       FROM exams WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL`,
      [examId, teacherId]
    );
    if (!examRow.rows.length) return res.status(404).json({ error: 'Exam not found' });
    const exam = examRow.rows[0];

    // 2. Overview stats
    const overviewRow = await pool.query(`
      SELECT
        COUNT(DISTINCT er.student_id)::int AS total_students,
        COUNT(er.id) FILTER (WHERE er.is_absent = false)::int AS total_attempts,
        ROUND(AVG(er.score::numeric / NULLIF($2::int, 0) * 100) FILTER (WHERE er.is_absent = false), 1) AS avg_pct,
        ROUND(AVG(er.score::numeric) FILTER (WHERE er.is_absent = false), 1) AS avg_score,
        MAX(er.score) FILTER (WHERE er.is_absent = false) AS max_score,
        MIN(er.score) FILTER (WHERE er.is_absent = false) AS min_score,
        COUNT(er.id) FILTER (WHERE er.is_absent = false AND er.score >= $3::int)::int AS pass_count,
        COUNT(er.id) FILTER (WHERE er.is_absent = false AND er.score < $3::int)::int AS fail_count,
        ROUND(AVG(EXTRACT(EPOCH FROM (er.end_time - er.start_time)) / 60.0)
              FILTER (WHERE er.is_absent = false AND er.start_time IS NOT NULL AND er.end_time IS NOT NULL), 1) AS avg_time_minutes,
        ROUND(MIN(EXTRACT(EPOCH FROM (er.end_time - er.start_time)) / 60.0)
              FILTER (WHERE er.is_absent = false AND er.start_time IS NOT NULL AND er.end_time IS NOT NULL), 1) AS fastest_time_minutes,
        ROUND(MAX(EXTRACT(EPOCH FROM (er.end_time - er.start_time)) / 60.0)
              FILTER (WHERE er.is_absent = false AND er.start_time IS NOT NULL AND er.end_time IS NOT NULL), 1) AS slowest_time_minutes
      FROM exam_results er
      JOIN students s ON er.student_id = s.id
      WHERE er.exam_id = $1 AND er.is_latest = true AND s.deleted_at IS NULL AND (s.is_simulation IS NOT TRUE)
    `, [examId, exam.total_score, exam.pass_score]);
    const ov = overviewRow.rows[0];
    const totalAttempts = parseInt(ov.total_attempts) || 0;
    const overview = {
      total_students: parseInt(ov.total_students) || 0,
      total_attempts: totalAttempts,
      avg_score: parseFloat(ov.avg_score) || 0,
      avg_pct: parseFloat(ov.avg_pct) || 0,
      max_score: parseInt(ov.max_score) || 0,
      min_score: parseInt(ov.min_score) || 0,
      pass_count: parseInt(ov.pass_count) || 0,
      fail_count: parseInt(ov.fail_count) || 0,
      pass_rate: totalAttempts > 0 ? Math.round((parseInt(ov.pass_count) || 0) / totalAttempts * 100) : 0,
      avg_time_minutes: parseFloat(ov.avg_time_minutes) || null,
      fastest_time_minutes: parseFloat(ov.fastest_time_minutes) || null,
      slowest_time_minutes: parseFloat(ov.slowest_time_minutes) || null,
    };

    // 3. Score distribution
    const scoreDist = await pool.query(`
      SELECT
        CASE
          WHEN pct BETWEEN 0 AND 39 THEN '0-39'
          WHEN pct BETWEEN 40 AND 59 THEN '40-59'
          WHEN pct BETWEEN 60 AND 74 THEN '60-74'
          WHEN pct BETWEEN 75 AND 89 THEN '75-89'
          WHEN pct BETWEEN 90 AND 100 THEN '90-100'
        END AS range,
        COUNT(*)::int AS count
      FROM (
        SELECT ROUND(er.score::numeric / NULLIF($2::int, 0) * 100)::int AS pct
        FROM exam_results er
        JOIN students s ON er.student_id = s.id
        WHERE er.exam_id = $1 AND er.is_latest = true AND er.is_absent = false
          AND s.deleted_at IS NULL AND (s.is_simulation IS NOT TRUE)
      ) sub
      GROUP BY range
      ORDER BY range
    `, [examId, exam.total_score]);
    // Ensure all ranges exist
    const rangeOrder = ['0-39', '40-59', '60-74', '75-89', '90-100'];
    const distMap = {};
    scoreDist.rows.forEach(r => { distMap[r.range] = r.count; });
    const score_distribution = rangeOrder.map(r => ({ range: r, count: distMap[r] || 0 }));

    // 4. Per-question stats from exam_results.answers JSONB
    const qStats = await pool.query(`
      SELECT
        (ans->>'question_id')::int AS question_id,
        COALESCE(q.question_text, bq.question_text) AS question_text,
        COALESCE(q.question_image_url, bq.question_image_url) AS question_image_url,
        COALESCE(q.question_type, bq.question_type, 'mcq') AS question_type,
        COALESCE(q.option_a, bq.option_a) AS option_a,
        COALESCE(q.option_b, bq.option_b) AS option_b,
        COALESCE(q.option_c, bq.option_c) AS option_c,
        COALESCE(q.option_d, bq.option_d) AS option_d,
        COALESCE(q.correct_answer_letter, bq.correct_answer_letter) AS correct_answer,
        COUNT(*)::int AS total_attempts,
        COUNT(*) FILTER (WHERE (ans->>'is_correct')::boolean = true)::int AS correct_count,
        COUNT(*) FILTER (
          WHERE (ans->>'is_correct')::boolean = false
            AND ans->>'student_answer' IS NOT NULL
            AND ans->>'student_answer' != 'null'
            AND ans->>'student_answer' != ''
        )::int AS wrong_count,
        COUNT(*) FILTER (
          WHERE ans->>'student_answer' IS NULL
            OR ans->>'student_answer' = 'null'
            OR ans->>'student_answer' = ''
        )::int AS unanswered_count,
        COUNT(*) FILTER (WHERE UPPER(ans->>'student_answer') = 'A')::int AS ans_a,
        COUNT(*) FILTER (WHERE UPPER(ans->>'student_answer') = 'B')::int AS ans_b,
        COUNT(*) FILTER (WHERE UPPER(ans->>'student_answer') = 'C')::int AS ans_c,
        COUNT(*) FILTER (WHERE UPPER(ans->>'student_answer') = 'D')::int AS ans_d,
        COUNT(*) FILTER (WHERE UPPER(ans->>'student_answer') = 'T')::int AS ans_t,
        COUNT(*) FILTER (WHERE UPPER(ans->>'student_answer') = 'F')::int AS ans_f
      FROM exam_results er
      JOIN students s ON er.student_id = s.id
      JOIN LATERAL jsonb_array_elements(er.answers) AS ans ON true
      LEFT JOIN questions q ON q.id = (ans->>'question_id')::integer AND $2 != 'bank'
      LEFT JOIN bank_questions bq ON bq.id = (ans->>'question_id')::integer AND $2 = 'bank'
      WHERE er.exam_id = $1
        AND er.is_latest = true
        AND er.is_absent = false
        AND s.deleted_at IS NULL AND (s.is_simulation IS NOT TRUE)
        AND jsonb_typeof(er.answers) = 'array'
        AND ans->>'is_correct' IS NOT NULL
        AND (q.id IS NOT NULL OR bq.id IS NOT NULL)
      GROUP BY (ans->>'question_id')::int, q.question_text, bq.question_text, q.question_image_url, bq.question_image_url,
               q.question_type, bq.question_type, q.option_a, bq.option_a, q.option_b, bq.option_b,
               q.option_c, bq.option_c, q.option_d, bq.option_d,
               q.correct_answer_letter, bq.correct_answer_letter
      ORDER BY wrong_count DESC, correct_count ASC
    `, [examId, exam.question_source || 'manual']);

    const question_stats = qStats.rows.map(q => ({
      question_id: q.question_id,
      question_text: q.question_text,
      question_image_url: q.question_image_url,
      question_type: q.question_type,
      options: { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d },
      correct_answer: q.correct_answer,
      total_attempts: q.total_attempts,
      correct_count: q.correct_count,
      wrong_count: q.wrong_count,
      unanswered_count: q.unanswered_count,
      correct_pct: q.total_attempts > 0 ? Math.round(q.correct_count / q.total_attempts * 100) : 0,
      wrong_pct: q.total_attempts > 0 ? Math.round(q.wrong_count / q.total_attempts * 100) : 0,
      answer_distribution: q.question_type === 'true_false'
        ? { T: q.ans_t, F: q.ans_f }
        : { A: q.ans_a, B: q.ans_b, C: q.ans_c, D: q.ans_d },
    }));

    // 5. Student results
    const studRes = await pool.query(`
      SELECT
        er.student_id,
        s.name AS student_name,
        s.academic_stage,
        er.score,
        ROUND(er.score::numeric / NULLIF($2::int, 0) * 100)::int AS pct,
        er.correct_count,
        er.wrong_count,
        er.unanswered_count,
        ROUND(EXTRACT(EPOCH FROM (er.end_time - er.start_time)) / 60.0, 1) AS time_minutes,
        er.score >= $3::int AS passed,
        er.created_at
      FROM exam_results er
      JOIN students s ON er.student_id = s.id
      WHERE er.exam_id = $1 AND er.is_latest = true AND er.is_absent = false AND s.deleted_at IS NULL AND (s.is_simulation IS NOT TRUE)
      ORDER BY er.score DESC, er.created_at ASC
    `, [examId, exam.total_score, exam.pass_score]);

    const result = {
      exam: {
        id: exam.id,
        title: exam.title,
        total_score: exam.total_score,
        pass_score: exam.pass_score,
        duration_minutes: exam.duration_minutes,
        created_at: exam.created_at,
      },
      overview,
      score_distribution,
      question_stats,
      student_results: studRes.rows,
    };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('exam-analytics error:', err.message);
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
             COUNT(DISTINCT s.id)::int AS enrolled_count,
             COUNT(DISTINCT v.id)::int AS total_videos,
             -- BUG-4/5 FIX: restrict vp to enrolled students only; compute true engagement
             -- (sum of all student-video progress / total possible combinations)
             -- so students who never watched count as 0%, not excluded from AVG
             CASE
               WHEN COUNT(DISTINCT s.id) > 0 AND COUNT(DISTINCT v.id) > 0
               THEN ROUND(
                 SUM(COALESCE(vp.progress_percentage, 0))::numeric
                 / (COUNT(DISTINCT s.id)::numeric * COUNT(DISTINCT v.id)::numeric)
               , 0)::int
               ELSE 0
             END AS avg_progress,
             COUNT(DISTINCT CASE WHEN vp.progress_percentage >= 80 THEN vp.student_id END)::int AS active_students
      FROM courses c
      LEFT JOIN student_course_enrollment sce ON c.id = sce.course_id AND sce.status = 'active'
      LEFT JOIN students s ON sce.student_id = s.id AND s.deleted_at IS NULL AND (s.is_simulation IS NOT TRUE)
      LEFT JOIN videos v  ON v.course_id = c.id
      LEFT JOIN video_progress vp ON v.id = vp.video_id AND vp.student_id = s.id
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
    const exportQuery = (text, values) => pool.query({ text, values, query_timeout: 120_000 });
    const [
      teacher, students, courses, sections, videos, pdfs,
      exams, questions, results, payments, enrollments, videoProgress,
      questionBanks, bankQuestions,
      recitations, recitationQuestions, recitationResults,
    ] = await Promise.all([
       // teachers — include branding/appearance and landing bio columns
       exportQuery(
        `SELECT id, username, name, bio, bio_hero, bio_about, bio_card, classification,
                logo_url, logo_wide_url, photo_url, whatsapp_phone,
                platform_name, background_image_url, hero_image_url, background_color,
                created_at
           FROM teachers WHERE id=$1`, [teacherId]),

      // students — include is_suspended and plain_password (plain text password kept for teacher visibility)
      // R-10 OPT: LIMIT 10000 safety net
      exportQuery(
        `SELECT id, username, name, phone, parent_phone, academic_stage, gender,
                points, is_suspended, plain_password, created_at
           FROM students
          WHERE teacher_id=$1 AND deleted_at IS NULL AND is_simulation IS NOT TRUE
          ORDER BY name LIMIT 10000`, [teacherId]),

      exportQuery('SELECT * FROM courses WHERE teacher_id=$1 ORDER BY created_at', [teacherId]),
      exportQuery('SELECT s.* FROM sections s JOIN courses c ON s.course_id=c.id WHERE c.teacher_id=$1 ORDER BY s.course_id, s.sort_order', [teacherId]),
      exportQuery('SELECT v.* FROM videos v JOIN courses c ON v.course_id=c.id WHERE c.teacher_id=$1 ORDER BY v.course_id, v.sort_order, v.id', [teacherId]),
      exportQuery('SELECT p.* FROM pdf_files p JOIN courses c ON p.course_id=c.id WHERE c.teacher_id=$1 ORDER BY p.course_id, p.id', [teacherId]),
      exportQuery('SELECT * FROM exams WHERE teacher_id=$1 AND deleted_at IS NULL ORDER BY created_at', [teacherId]),
      exportQuery('SELECT q.* FROM questions q JOIN exams e ON q.exam_id=e.id WHERE e.teacher_id=$1 ORDER BY q.exam_id, q.id', [teacherId]),

      // exam_results — include attempt tracking and absent flag
      exportQuery(
        `SELECT er.id, er.student_id, er.exam_id, er.score, er.correct_count, er.wrong_count,
                er.unanswered_count, er.points_earned, er.start_time, er.end_time, er.answers,
                er.is_absent, er.attempt_number, er.is_latest, er.created_at, e.total_score
           FROM exam_results er
           JOIN students s ON er.student_id=s.id
           JOIN exams e ON er.exam_id=e.id
          WHERE e.teacher_id=$1 AND s.deleted_at IS NULL AND s.is_simulation IS NOT TRUE
          ORDER BY er.created_at DESC`, [teacherId]),

      // payments — include verifier info
      exportQuery(
        `SELECT p.id, p.student_id, p.course_id, p.amount, p.method, p.payment_date,
                p.status, p.reference_number, p.notes, p.verified_at, p.verified_by_name
           FROM payments p
           JOIN students s ON p.student_id=s.id
          WHERE s.teacher_id=$1 AND s.deleted_at IS NULL AND s.is_simulation IS NOT TRUE
          ORDER BY p.payment_date DESC`, [teacherId]),

      exportQuery(
        `SELECT sce.student_id, sce.course_id, sce.enrollment_date, sce.status
           FROM student_course_enrollment sce
           JOIN students s ON sce.student_id=s.id
          WHERE s.teacher_id=$1 AND s.deleted_at IS NULL AND s.is_simulation IS NOT TRUE`, [teacherId]),

      // video_progress — include resume-position columns
      exportQuery(
        `SELECT vp.student_id, vp.video_id, vp.watch_count, vp.watched_minutes,
                vp.progress_percentage, vp.last_watched_at, vp.last_position, vp.actual_watched_seconds
           FROM video_progress vp
           JOIN students s ON vp.student_id=s.id
          WHERE s.teacher_id=$1 AND s.deleted_at IS NULL AND s.is_simulation IS NOT TRUE`, [teacherId]),

      // question banks
      exportQuery('SELECT * FROM question_banks WHERE teacher_id=$1 ORDER BY created_at', [teacherId]),
      exportQuery(
        `SELECT bq.* FROM bank_questions bq
           JOIN question_banks qb ON bq.bank_id=qb.id
          WHERE qb.teacher_id=$1
          ORDER BY bq.bank_id, bq.id`, [teacherId]),

      // recitations
      exportQuery('SELECT * FROM recitations WHERE teacher_id=$1 AND deleted_at IS NULL ORDER BY created_at', [teacherId]),
      exportQuery(
        `SELECT rq.* FROM recitation_questions rq
           JOIN recitations r ON rq.recitation_id=r.id
          WHERE r.teacher_id=$1
          ORDER BY rq.recitation_id, rq.id`, [teacherId]),
      exportQuery(
        `SELECT rr.* FROM recitation_results rr
           JOIN students s ON rr.student_id=s.id
           JOIN recitations r ON rr.recitation_id=r.id
          WHERE r.teacher_id=$1 AND s.deleted_at IS NULL AND s.is_simulation IS NOT TRUE
          ORDER BY rr.created_at DESC`, [teacherId]),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      version: '3',
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
      question_banks: questionBanks.rows,
      bank_questions: bankQuestions.rows,
      recitations: recitations.rows,
      recitation_questions: recitationQuestions.rows,
      recitation_results: recitationResults.rows,
      summary: {
        total_students:             students.rows.length,
        total_courses:              courses.rows.length,
        total_exams:                exams.rows.length,
        total_questions:            questions.rows.length,
        total_results:              results.rows.length,
        total_payments:             payments.rows.length,
        total_videos:               videos.rows.length,
        total_pdfs:                 pdfs.rows.length,
        total_question_banks:       questionBanks.rows.length,
        total_bank_questions:       bankQuestions.rows.length,
        total_recitations:          recitations.rows.length,
        total_recitation_questions: recitationQuestions.rows.length,
        total_recitation_results:   recitationResults.rows.length,
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

  // Guard against oversized import payloads
  const IMPORT_LIMITS = {
    courses: 500, sections: 2000, videos: 5000, pdfs: 2000,
    exams: 1000, questions: 50000, students: 5000,
    exam_results: 100000, payments: 20000, enrollments: 20000,
    question_banks: 500, bank_questions: 50000,
    recitations: 2000, recitation_questions: 50000, recitation_results: 100000,
    video_progress: 100000,
  };
  for (const [key, limit] of Object.entries(IMPORT_LIMITS)) {
    const arr = data[key];
    if (Array.isArray(arr) && arr.length > limit) {
      return res.status(400).json({ error: `عدد ${key} تجاوز الحد المسموح (${limit})` });
    }
  }

  // Enforce student limit check (package constraints)
  if (Array.isArray(data.students) && data.students.length > 0) {
    try {
      const subRes = await pool.query(
        `SELECT sp.max_students
           FROM teacher_subscriptions ts
           JOIN subscription_plans sp ON ts.plan_id = sp.id
          WHERE ts.teacher_id = $1 AND ts.status = 'active'
          LIMIT 1`,
        [teacherId]
      );
      if (subRes.rows.length > 0) {
        const maxStudents = subRes.rows[0].max_students;
        if (maxStudents !== null) {
          const countRes = await pool.query(
            'SELECT COUNT(*)::int AS count FROM students WHERE teacher_id = $1 AND deleted_at IS NULL',
            [teacherId]
          );
          const currentCount = countRes.rows[0].count;
          if (currentCount + data.students.length > maxStudents) {
            return res.status(403).json({
              error: `الاستيراد سيتجاوز الحد الأقصى لعدد الطلاب المسموح به في باقة اشتراكك الحالية (الحد الأقصى: ${maxStudents} طالب، الحالي: ${currentCount} طالب، المطلوب استيراده: ${data.students.length} طالب). يرجى ترقية الباقة لزيادة هذا الحد.`
            });
          }
        }
      }
    } catch (limitErr) {
      console.error('[import student limit check] error:', limitErr.message);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  const stats = {
    courses: 0, sections: 0, videos: 0, pdfs: 0,
    exams: 0, questions: 0, students: 0,
    enrollments: 0, payments: 0, results: 0,
    video_progress: 0,
    question_banks: 0, bank_questions: 0,
    recitations: 0, recitation_questions: 0, recitation_results: 0,
    skipped_students: 0, errors: []
  };

  // ID maps: old_id → new_id
  const courseMap     = {};
  const sectionMap    = {};
  const videoMap      = {};
  const examMap       = {};
  const studentMap    = {};
  const bankMap       = {};
  const recitationMap = {};

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1. Courses ──────────────────────────────────────────────────────────
    for (const c of (data.courses || [])) {
      await client.query('SAVEPOINT sp');
      try {
        const r = await client.query(
          `INSERT INTO courses (name,description,price,thumbnail_url,teacher_id,target_stage,
             is_free,is_published,points_on_complete,created_at)
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

    // ── 2. Sections ─────────────────────────────────────────────────────────
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

    // ── 3. Videos — RETURNING id needed for video_progress map ──────────────
    for (const v of (data.videos || [])) {
      const newCourseId = courseMap[v.course_id];
      if (!newCourseId) continue;
      await client.query('SAVEPOINT sp');
      try {
        const r = await client.query(
          `INSERT INTO videos (title,file_path_or_url,duration_minutes,course_id,sort_order,
             section_id,url_480,url_720,url_1080,created_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [v.title, v.file_path_or_url || null, v.duration_minutes || 0, newCourseId,
           v.sort_order || 0, v.section_id ? (sectionMap[v.section_id] || null) : null,
           v.url_480 || null, v.url_720 || null, v.url_1080 || null, v.created_at || new Date()]
        );
        videoMap[v.id] = r.rows[0].id;
        stats.videos++;
        await client.query('RELEASE SAVEPOINT sp');
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT sp');
        stats.errors.push(`فيديو "${v.title}": ${e.message}`);
      }
    }

    // ── 4. PDFs ─────────────────────────────────────────────────────────────
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

    // ── 5. Exams ─────────────────────────────────────────────────────────────
    for (const e of (data.exams || [])) {
      await client.query('SAVEPOINT sp');
      try {
        const newCourseId = e.course_id ? (courseMap[e.course_id] || null) : null;
        const r = await client.query(
          `INSERT INTO exams (title,duration_minutes,total_score,course_id,teacher_id,pass_score,
             badge_name,badge_color,start_date,end_date,is_published,
             shuffle_questions,shuffle_options,points_on_attempt,points_on_pass,created_at)
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

    // ── 6. Questions — include option_labels and sub_questions (image_multi) ─
    for (const q of (data.questions || [])) {
      const newExamId = examMap[q.exam_id];
      if (!newExamId) continue;
      await client.query('SAVEPOINT sp');
      try {
        await client.query(
          `INSERT INTO questions (question_text,question_image_url,option_a,option_b,option_c,option_d,
             correct_answer_letter,points,exam_id,question_type,option_labels,sub_questions)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [q.question_text, q.question_image_url || null,
           q.option_a || '-', q.option_b || '-', q.option_c || null, q.option_d || null,
           q.correct_answer_letter || 'A', q.points || 1, newExamId, q.question_type || 'mcq',
           q.option_labels ? JSON.stringify(q.option_labels) : null,
           q.sub_questions ? JSON.stringify(q.sub_questions) : null]
        );
        stats.questions++;
        await client.query('RELEASE SAVEPOINT sp');
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT sp');
        stats.errors.push(`سؤال في اختبار "${q.exam_id}": ${e.message}`);
      }
    }

    // ── 7. Students — include is_suspended and plain_password ────────────────
    const generatedPasswords = [];
    const studentsToImport = data.students || [];
    if (studentsToImport.length > 0) {
      const usernames = studentsToImport.map(s => s.username);
      const existingRes = await client.query(
        'SELECT id, username FROM students WHERE username = ANY($1) AND teacher_id=$2 AND deleted_at IS NULL',
        [usernames, teacherId]
      );
      const existingByUsername = new Map(existingRes.rows.map(r => [r.username, r.id]));

      for (const s of studentsToImport) {
        if (existingByUsername.has(s.username)) {
          studentMap[s.id] = existingByUsername.get(s.username);
          stats.skipped_students++;
        }
      }

      const newStudents = studentsToImport.filter(s => !existingByUsername.has(s.username));

      if (newStudents.length > 0) {
        const HASH_BATCH = 10;
        const prepared = [];
        for (let i = 0; i < newStudents.length; i += HASH_BATCH) {
          const batch = newStudents.slice(i, i + HASH_BATCH);
          const hashed = await Promise.all(batch.map(s => {
            const plain = s.plain_password || crypto.randomInt(100000, 1000000).toString();
            return bcrypt.hash(plain, 10).then(h => ({ s, plain, hash: h }));
          }));
          prepared.push(...hashed);
        }

        await client.query('SAVEPOINT sp_students');
        try {
          const unames = [], pwds = [], plains = [], names = [], phones = [], parentPhones = [],
                stages = [], genders = [], points = [], suspended = [], createdAts = [];
          for (const { s, plain, hash } of prepared) {
            unames.push(s.username);
            pwds.push(hash);
            plains.push(plain);
            names.push(s.name);
            phones.push(s.phone || null);
            parentPhones.push(s.parent_phone || null);
            stages.push(s.academic_stage || null);
            genders.push(s.gender || null);
            points.push(s.points || 0);
            suspended.push(s.is_suspended || false);
            createdAts.push(s.created_at ? new Date(s.created_at) : new Date());
          }
          const insertRes = await client.query(
            `INSERT INTO students
               (username, password, plain_password, name, phone, parent_phone, academic_stage, gender,
                teacher_id, points, is_suspended, created_at)
             SELECT * FROM unnest(
               $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
               $7::text[], $8::text[], $9::int[], $10::int[], $11::boolean[], $12::timestamptz[]
             ) AS t(username,password,plain_password,name,phone,parent_phone,academic_stage,gender,
                    teacher_id,points,is_suspended,created_at)
             ON CONFLICT DO NOTHING
             RETURNING id, username`,
            [unames, pwds, plains, names, phones, parentPhones, stages, genders,
             Array(prepared.length).fill(teacherId), points, suspended, createdAts]
          );
          await client.query('RELEASE SAVEPOINT sp_students');

          const insertedByUsername = new Map(insertRes.rows.map(r => [r.username, r.id]));
          for (const { s, plain } of prepared) {
            const newId = insertedByUsername.get(s.username);
            if (newId) {
              studentMap[s.id] = newId;
              stats.students++;
              if (!s.plain_password) {
                generatedPasswords.push({ username: s.username, name: s.name, generated_password: plain });
              }
            } else {
              stats.skipped_students++;
            }
          }
        } catch (batchErr) {
          // Batch INSERT failed — fall back to row-by-row
          await client.query('ROLLBACK TO SAVEPOINT sp_students');
          await client.query('RELEASE SAVEPOINT sp_students');
          for (const { s, plain, hash } of prepared) {
            await client.query('SAVEPOINT sp');
            try {
              const r = await client.query(
                `INSERT INTO students (username,password,plain_password,name,phone,parent_phone,
                   academic_stage,gender,teacher_id,points,is_suspended,created_at)
                 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
                [s.username, hash, plain, s.name, s.phone || null, s.parent_phone || null,
                 s.academic_stage || null, s.gender || null, teacherId,
                 s.points || 0, s.is_suspended || false, s.created_at || new Date()]
              );
              studentMap[s.id] = r.rows[0].id;
              stats.students++;
              if (!s.plain_password) {
                generatedPasswords.push({ username: s.username, name: s.name, generated_password: plain });
              }
              await client.query('RELEASE SAVEPOINT sp');
            } catch (e) {
              await client.query('ROLLBACK TO SAVEPOINT sp');
              stats.errors.push(`طالب "${s.name}": ${e.message}`);
            }
          }
        }
      }
    }

    // ── 8. Enrollments ───────────────────────────────────────────────────────
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

    // ── 9. Payments — include verified_at / verified_by_name ─────────────────
    const VALID_PAYMENT_STATUSES = new Set(['pending', 'verified', 'rejected']);
    for (const p of (data.payments || [])) {
      const newStudentId = studentMap[p.student_id];
      if (!newStudentId) continue;
      await client.query('SAVEPOINT sp');
      try {
        const safeStatus = VALID_PAYMENT_STATUSES.has(p.status)
          ? p.status
          : (p.status === 'confirmed' ? 'verified' : 'pending');
        await client.query(
          `INSERT INTO payments (student_id,course_id,amount,method,payment_date,status,
             reference_number,notes,verified_at,verified_by_name)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [newStudentId, p.course_id ? (courseMap[p.course_id] || null) : null,
           p.amount, p.method || '', p.payment_date || new Date(),
           safeStatus, p.reference_number || null, p.notes || null,
           p.verified_at || null, p.verified_by_name || null]
        );
        stats.payments++;
        await client.query('RELEASE SAVEPOINT sp');
      } catch (e) { await client.query('ROLLBACK TO SAVEPOINT sp'); }
    }

    // ── 10. Exam results — include is_absent and attempt_number ─────────────
    // Insert all as is_latest=false first to avoid the partial-unique-index conflict.
    // Promote the most-recent result per (student_id, exam_id) to is_latest=true after.
    const insertedResults = [];
    for (const r of (data.exam_results || [])) {
      const newStudentId = studentMap[r.student_id];
      const newExamId    = examMap[r.exam_id];
      if (!newStudentId || !newExamId) continue;
      await client.query('SAVEPOINT sp');
      try {
        const ins = await client.query(
          `INSERT INTO exam_results (student_id,exam_id,score,correct_count,wrong_count,
             unanswered_count,start_time,end_time,answers,points_earned,
             is_absent,attempt_number,created_at,is_latest)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false)
           RETURNING id,student_id,exam_id,created_at`,
          [newStudentId, newExamId, r.score || 0, r.correct_count || 0,
           r.wrong_count || 0, r.unanswered_count || 0,
           r.start_time || null, r.end_time || null,
           r.answers ? JSON.stringify(r.answers) : null,
           r.points_earned || 0, r.is_absent || false,
           r.attempt_number || 1, r.created_at || new Date()]
        );
        insertedResults.push(ins.rows[0]);
        stats.results++;
        await client.query('RELEASE SAVEPOINT sp');
      } catch (e) { await client.query('ROLLBACK TO SAVEPOINT sp'); }
    }
    // Promote latest per (student, exam)
    if (insertedResults.length > 0) {
      const latestMap = {};
      for (const row of insertedResults) {
        const key = `${row.student_id}_${row.exam_id}`;
        if (!latestMap[key] || new Date(row.created_at) > new Date(latestMap[key].created_at)) {
          latestMap[key] = row;
        }
      }
      for (const row of Object.values(latestMap)) {
        await client.query(
          'UPDATE exam_results SET is_latest=false WHERE student_id=$1 AND exam_id=$2 AND is_latest=true',
          [row.student_id, row.exam_id]
        );
        await client.query('UPDATE exam_results SET is_latest=true WHERE id=$1', [row.id]);
      }
    }

    // ── 11. Video progress — include last_position and actual_watched_seconds ─
    for (const vp of (data.video_progress || [])) {
      const newStudentId = studentMap[vp.student_id];
      const newVideoId   = videoMap[vp.video_id];
      if (!newStudentId || !newVideoId) continue;
      await client.query('SAVEPOINT sp');
      try {
        await client.query(
          `INSERT INTO video_progress
             (student_id,video_id,watch_count,watched_minutes,progress_percentage,
              last_watched_at,last_position,actual_watched_seconds)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (student_id,video_id) DO NOTHING`,
          [newStudentId, newVideoId, vp.watch_count || 0, vp.watched_minutes || 0,
           vp.progress_percentage || 0, vp.last_watched_at || new Date(),
           vp.last_position || 0, vp.actual_watched_seconds || 0]
        );
        stats.video_progress++;
        await client.query('RELEASE SAVEPOINT sp');
      } catch (e) { await client.query('ROLLBACK TO SAVEPOINT sp'); }
    }

    // ── 12. Question banks ───────────────────────────────────────────────────
    for (const b of (data.question_banks || [])) {
      await client.query('SAVEPOINT sp');
      try {
        const newCourseId = b.course_id ? (courseMap[b.course_id] || null) : null;
        const r = await client.query(
          `INSERT INTO question_banks (name,subject,teacher_id,course_id,created_at)
           VALUES($1,$2,$3,$4,$5) RETURNING id`,
          [b.name, b.subject || null, teacherId, newCourseId, b.created_at || new Date()]
        );
        bankMap[b.id] = r.rows[0].id;
        stats.question_banks++;
        await client.query('RELEASE SAVEPOINT sp');
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT sp');
        stats.errors.push(`بنك أسئلة "${b.name}": ${e.message}`);
      }
    }

    // ── 13. Bank questions — include option_labels, sub_questions, difficulty ─
    for (const bq of (data.bank_questions || [])) {
      const newBankId = bankMap[bq.bank_id];
      if (!newBankId) continue;
      await client.query('SAVEPOINT sp');
      try {
        await client.query(
          `INSERT INTO bank_questions (bank_id,question_text,question_image_url,option_a,option_b,
             option_c,option_d,correct_answer_letter,points,question_type,
             option_labels,sub_questions,difficulty,created_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [newBankId, bq.question_text, bq.question_image_url || null,
           bq.option_a || '-', bq.option_b || '-', bq.option_c || null, bq.option_d || null,
           bq.correct_answer_letter || 'A', bq.points || 1, bq.question_type || 'mcq',
           bq.option_labels ? JSON.stringify(bq.option_labels) : null,
           bq.sub_questions ? JSON.stringify(bq.sub_questions) : null,
           bq.difficulty || 'medium', bq.created_at || new Date()]
        );
        stats.bank_questions++;
        await client.query('RELEASE SAVEPOINT sp');
      } catch (e) { await client.query('ROLLBACK TO SAVEPOINT sp'); }
    }

    // ── 14. Recitations ──────────────────────────────────────────────────────
    for (const rec of (data.recitations || [])) {
      await client.query('SAVEPOINT sp');
      try {
        const newCourseId = rec.course_id ? (courseMap[rec.course_id] || null) : null;
        const r = await client.query(
          `INSERT INTO recitations (teacher_id,title,description,academic_stage,duration_minutes,
             total_score,pass_score,points_on_attempt,points_on_pass,schedule_type,schedule_day,
             start_date,end_date,is_published,shuffle_questions,shuffle_options,
             course_id,video_ids,allow_retry,absent_marked,created_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
           RETURNING id`,
          [teacherId, rec.title, rec.description || null, rec.academic_stage || null,
           rec.duration_minutes || 10, rec.total_score || 10, rec.pass_score || 5,
           rec.points_on_attempt || 0, rec.points_on_pass || 5,
           rec.schedule_type || 'once', rec.schedule_day ?? null,
           rec.start_date || null, rec.end_date || null,
           rec.is_published || false, rec.shuffle_questions || false, rec.shuffle_options || false,
           newCourseId, rec.video_ids ? JSON.stringify(rec.video_ids) : '[]',
           rec.allow_retry !== false, rec.absent_marked || false,
           rec.created_at || new Date()]
        );
        recitationMap[rec.id] = r.rows[0].id;
        stats.recitations++;
        await client.query('RELEASE SAVEPOINT sp');
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT sp');
        stats.errors.push(`تسميع "${rec.title}": ${e.message}`);
      }
    }

    // ── 15. Recitation questions ─────────────────────────────────────────────
    for (const rq of (data.recitation_questions || [])) {
      const newRecitationId = recitationMap[rq.recitation_id];
      if (!newRecitationId) continue;
      await client.query('SAVEPOINT sp');
      try {
        await client.query(
          `INSERT INTO recitation_questions (recitation_id,question_text,question_image_url,
             question_type,option_a,option_b,option_c,option_d,correct_answer_letter,
             points,sort_order,option_labels,sub_questions)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [newRecitationId, rq.question_text, rq.question_image_url || null,
           rq.question_type || 'mcq',
           rq.option_a || null, rq.option_b || null, rq.option_c || null, rq.option_d || null,
           rq.correct_answer_letter || 'A', rq.points || 1, rq.sort_order || 0,
           rq.option_labels ? JSON.stringify(rq.option_labels) : null,
           rq.sub_questions ? JSON.stringify(rq.sub_questions) : null]
        );
        stats.recitation_questions++;
        await client.query('RELEASE SAVEPOINT sp');
      } catch (e) { await client.query('ROLLBACK TO SAVEPOINT sp'); }
    }

    // ── 16. Recitation results ───────────────────────────────────────────────
    for (const rr of (data.recitation_results || [])) {
      const newStudentId    = studentMap[rr.student_id];
      const newRecitationId = recitationMap[rr.recitation_id];
      if (!newStudentId || !newRecitationId) continue;
      await client.query('SAVEPOINT sp');
      try {
        await client.query(
          `INSERT INTO recitation_results (student_id,recitation_id,score,correct_count,wrong_count,
             unanswered_count,answers,points_earned,start_time,end_time,passed,is_absent,created_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [newStudentId, newRecitationId, rr.score || 0, rr.correct_count || 0,
           rr.wrong_count || 0, rr.unanswered_count || 0,
           rr.answers ? JSON.stringify(rr.answers) : '[]',
           rr.points_earned || 0, rr.start_time || null, rr.end_time || null,
           rr.passed || false, rr.is_absent || false, rr.created_at || new Date()]
        );
        stats.recitation_results++;
        await client.query('RELEASE SAVEPOINT sp');
      } catch (e) { await client.query('ROLLBACK TO SAVEPOINT sp'); }
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

/* ══════════════════════════════════════════════════════
   SUPPORT CONTACTS — public landing page contacts
   ══════════════════════════════════════════════════════ */

// GET all support contacts for this teacher
router.get('/support-contacts', requireRole('teacher'), async (req, res) => {
  const tid = req.user.id;
  try {
    const { rows } = await pool.query(
      'SELECT id, name, phone, photo_url, sort_order FROM teacher_support_contacts WHERE teacher_id=$1 ORDER BY sort_order, id',
      [tid]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST create a new support contact
router.post('/support-contacts', requireRole('teacher'), async (req, res) => {
  const tid = req.user.id;
  const { name, phone, photo_url, sort_order } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0)
    return res.status(400).json({ error: 'الاسم مطلوب' });
  if (name.trim().length > 100)
    return res.status(400).json({ error: 'الاسم طويل جداً (أقصى 100 حرف)' });
  if (phone && typeof phone !== 'string')
    return res.status(400).json({ error: 'رقم الهاتف غير صحيح' });
  const order = Number.isInteger(parseInt(sort_order)) ? parseInt(sort_order) : 0;
  try {
    const { rows } = await pool.query(
      'INSERT INTO teacher_support_contacts (teacher_id, name, phone, photo_url, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, phone, photo_url, sort_order',
      [tid, name.trim(), phone?.trim() || null, photo_url?.trim() || null, order]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT update a support contact
router.put('/support-contacts/:id', requireRole('teacher'), async (req, res) => {
  const tid = req.user.id;
  const id = parseInt(req.params.id);
  if (!id || id < 1 || id > 2147483647)
    return res.status(400).json({ error: 'معرّف غير صحيح' });
  const { name, phone, photo_url, sort_order } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0)
    return res.status(400).json({ error: 'الاسم مطلوب' });
  if (name.trim().length > 100)
    return res.status(400).json({ error: 'الاسم طويل جداً (أقصى 100 حرف)' });
  const order = Number.isInteger(parseInt(sort_order)) ? parseInt(sort_order) : 0;
  try {
    const { rows } = await pool.query(
      'UPDATE teacher_support_contacts SET name=$1, phone=$2, photo_url=$3, sort_order=$4 WHERE id=$5 AND teacher_id=$6 RETURNING id, name, phone, photo_url, sort_order',
      [name.trim(), phone?.trim() || null, photo_url?.trim() || null, order, id, tid]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'غير موجود' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE a support contact
router.delete('/support-contacts/:id', requireRole('teacher'), async (req, res) => {
  const tid = req.user.id;
  const id = parseInt(req.params.id);
  if (!id || id < 1 || id > 2147483647)
    return res.status(400).json({ error: 'معرّف غير صحيح' });
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM teacher_support_contacts WHERE id=$1 AND teacher_id=$2',
      [id, tid]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'غير موجود' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
