const express = require('express');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { getPermissions } = require('../lib/permissionsCache');

const router = express.Router();
router.use(authenticate);

const PG_INT_MAX = 2147483647;

// ── Helpers ──────────────────────────────────────────────────────────────────

const parseParamId = (raw) => {
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0 || n > PG_INT_MAX || String(n) !== String(raw).trim()) return null;
  return n;
};

// FIX-A3: Validate teacherId is a positive integer before using in queries
const getTeacherId = (req) => {
  const id = req.user.role === 'teacher' ? req.user.id : req.user.teacher_id;
  return (typeof id === 'number' && id > 0 && id <= PG_INT_MAX) ? id : null;
};

// FIX-A1: Validate date strings are ISO YYYY-MM-DD before passing to PostgreSQL
const isValidDate = (s) => {
  if (!s || typeof s !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  return !isNaN(d.getTime());
};

// FIX-B1: Per-endpoint permission checks (granular, not a single broad gate)
// - Exam data: requires can_manage_exams OR can_view_analytics
// - Recitation data: requires can_manage_recitations OR can_view_analytics
// - Student detail (both): requires any of the three

const makePerm = (checker) => async (req, res, next) => {
  if (req.user.role === 'teacher') return next();
  try {
    const perms = await getPermissions(req.user.id, pool);
    if (!perms || !checker(perms)) return res.status(403).json({ error: 'Access denied' });
    next();
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
};

const checkExamPerm = makePerm(p => p.can_view_analytics || p.can_manage_exams);
const checkRecPerm  = makePerm(p => p.can_view_analytics || p.can_manage_recitations);
const checkAnyPerm  = makePerm(p => p.can_view_analytics || p.can_manage_exams || p.can_manage_recitations);

// ── GET /api/archive/exam-results ──────────────────────────────────────────
// Filters: q (text search), student_id, course_id, exam_id, stage,
//          status (pass/fail), attempt (first/retry),
//          date_from, date_to, sort, order, page, limit
// FIX-B1: exam-results uses checkExamPerm (can_view_analytics OR can_manage_exams only)
router.get('/exam-results', requireRole('teacher', 'assistant'), checkExamPerm, async (req, res) => {
  // FIX-A3: Validate teacher ownership before querying
  const teacherId = getTeacherId(req);
  if (!teacherId) return res.status(400).json({ error: 'بيانات المعلم غير صالحة' });

  const {
    q,
    student_id, course_id, exam_id, stage,
    status, attempt,
    date_from, date_to,
    sort = 'date', order = 'desc',
    page = 1, limit = 50,
  } = req.query;

  // FIX-A1: Validate date inputs before building query
  if (date_from && !isValidDate(date_from))
    return res.status(400).json({ error: 'تاريخ البداية غير صالح، استخدم صيغة YYYY-MM-DD' });
  if (date_to && !isValidDate(date_to))
    return res.status(400).json({ error: 'تاريخ النهاية غير صالح، استخدم صيغة YYYY-MM-DD' });
  if (date_from && date_to && date_from > date_to)
    return res.status(400).json({ error: 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية' });

  try {
    const conditions = ['e.teacher_id = $1', 's.deleted_at IS NULL'];
    const params = [teacherId];
    let p = 2;

    // FIX-A4: Server-side text search — works across all pages
    if (q && q.trim()) {
      const like = `%${q.trim().slice(0, 100)}%`;
      conditions.push(`(s.name ILIKE $${p} OR s.username ILIKE $${p} OR e.title ILIKE $${p})`);
      params.push(like);
      p++;
    }
    if (student_id) {
      const sid = parseParamId(student_id);
      if (!sid) return res.status(400).json({ error: 'student_id غير صالح' });
      conditions.push(`er.student_id = $${p++}`);
      params.push(sid);
    }
    if (course_id) {
      const cid = parseParamId(course_id);
      if (!cid) return res.status(400).json({ error: 'course_id غير صالح' });
      conditions.push(`e.course_id = $${p++}`);
      params.push(cid);
    }
    if (exam_id) {
      const eid = parseParamId(exam_id);
      if (!eid) return res.status(400).json({ error: 'exam_id غير صالح' });
      conditions.push(`er.exam_id = $${p++}`);
      params.push(eid);
    }
    if (stage && stage !== 'الكل') {
      conditions.push(`s.academic_stage = $${p++}`);
      params.push(stage);
    }
    if (status === 'pass') {
      conditions.push(`er.score >= e.pass_score AND er.is_absent = false`);
    } else if (status === 'fail') {
      conditions.push(`er.score < e.pass_score AND er.is_absent = false`);
    } else if (status === 'absent') {
      conditions.push(`er.is_absent = true`);
    }
    if (attempt === 'first') {
      conditions.push(`er.attempt_number = 1`);
    } else if (attempt === 'retry') {
      conditions.push(`er.attempt_number > 1`);
    }
    if (date_from) {
      conditions.push(`er.created_at >= $${p++}`);
      params.push(date_from);
    }
    if (date_to) {
      conditions.push(`er.created_at <= $${p++}::date + interval '1 day'`);
      params.push(date_to);
    }

    const sortMap = {
      date: 'er.created_at',
      score: 'er.score',
      name: 's.name',
      exam: 'e.title',
    };
    const sortCol = sortMap[sort] || 'er.created_at';
    const sortDir = order === 'asc' ? 'ASC' : 'DESC';

    // FIX-B2: Cap page at 10000 to prevent massive OFFSET queries
    const pageNum = Math.min(10000, Math.max(1, parseInt(page, 10) || 1));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const whereClause = conditions.map((c, i) => (i === 0 ? `WHERE ${c}` : `AND ${c}`)).join('\n      ');

    const countQ = await pool.query(
      `SELECT COUNT(*) as total
       FROM exam_results er
       JOIN exams e ON er.exam_id = e.id
       JOIN students s ON er.student_id = s.id
       LEFT JOIN courses c ON e.course_id = c.id
       ${whereClause}`,
      params
    );

    const dataQ = await pool.query(
      `SELECT
         er.id, er.score, er.correct_count, er.wrong_count, er.unanswered_count,
         er.points_earned, er.attempt_number, er.created_at, er.is_absent, er.is_latest,
         e.id AS exam_id, e.title AS exam_title, e.total_score, e.pass_score,
         e.course_id,
         COALESCE(c.name, '—') AS course_name,
         s.id AS student_id, s.name AS student_name, s.username AS student_username,
         s.academic_stage
       FROM exam_results er
       JOIN exams e ON er.exam_id = e.id
       JOIN students s ON er.student_id = s.id
       LEFT JOIN courses c ON e.course_id = c.id
       ${whereClause}
       ORDER BY ${sortCol} ${sortDir}
       LIMIT $${p} OFFSET $${p + 1}`,
      [...params, limitNum, offset]
    );

    res.json({
      total: parseInt(countQ.rows[0].total, 10),
      page: pageNum,
      limit: limitNum,
      results: dataQ.rows,
    });
  } catch (err) {
    console.error('[archive/exam-results]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/archive/recitation-results ────────────────────────────────────
// Filters: q (text search), student_id, recitation_id, stage, status (pass/fail),
//          date_from, date_to, sort, order, page, limit
// FIX-B1: recitation-results uses checkRecPerm (can_view_analytics OR can_manage_recitations only)
router.get('/recitation-results', requireRole('teacher', 'assistant'), checkRecPerm, async (req, res) => {
  // FIX-A3: Validate teacher ownership
  const teacherId = getTeacherId(req);
  if (!teacherId) return res.status(400).json({ error: 'بيانات المعلم غير صالحة' });

  const {
    q,
    student_id, recitation_id, stage,
    status,
    date_from, date_to,
    sort = 'date', order = 'desc',
    page = 1, limit = 50,
  } = req.query;

  // FIX-A1: Validate date inputs
  if (date_from && !isValidDate(date_from))
    return res.status(400).json({ error: 'تاريخ البداية غير صالح، استخدم صيغة YYYY-MM-DD' });
  if (date_to && !isValidDate(date_to))
    return res.status(400).json({ error: 'تاريخ النهاية غير صالح، استخدم صيغة YYYY-MM-DD' });
  if (date_from && date_to && date_from > date_to)
    return res.status(400).json({ error: 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية' });

  try {
    const conditions = ['r.teacher_id = $1', 's.deleted_at IS NULL'];
    const params = [teacherId];
    let p = 2;

    // FIX-A4: Server-side text search
    if (q && q.trim()) {
      const like = `%${q.trim().slice(0, 100)}%`;
      conditions.push(`(s.name ILIKE $${p} OR s.username ILIKE $${p} OR r.title ILIKE $${p})`);
      params.push(like);
      p++;
    }
    if (student_id) {
      const sid = parseParamId(student_id);
      if (!sid) return res.status(400).json({ error: 'student_id غير صالح' });
      conditions.push(`rr.student_id = $${p++}`);
      params.push(sid);
    }
    if (recitation_id) {
      const rid = parseParamId(recitation_id);
      if (!rid) return res.status(400).json({ error: 'recitation_id غير صالح' });
      conditions.push(`rr.recitation_id = $${p++}`);
      params.push(rid);
    }
    if (stage && stage !== 'الكل') {
      conditions.push(`s.academic_stage = $${p++}`);
      params.push(stage);
    }
    if (status === 'pass') {
      conditions.push(`rr.passed = true`);
    } else if (status === 'fail') {
      conditions.push(`rr.passed = false`);
    }
    if (date_from) {
      conditions.push(`rr.created_at >= $${p++}`);
      params.push(date_from);
    }
    if (date_to) {
      conditions.push(`rr.created_at <= $${p++}::date + interval '1 day'`);
      params.push(date_to);
    }

    const sortMap = {
      date: 'rr.created_at',
      score: 'rr.score',
      name: 's.name',
      recitation: 'r.title',
    };
    const sortCol = sortMap[sort] || 'rr.created_at';
    const sortDir = order === 'asc' ? 'ASC' : 'DESC';

    // FIX-B2: Cap page at 10000 to prevent massive OFFSET queries
    const pageNum = Math.min(10000, Math.max(1, parseInt(page, 10) || 1));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const whereClause = conditions.map((c, i) => (i === 0 ? `WHERE ${c}` : `AND ${c}`)).join('\n      ');

    const countQ = await pool.query(
      `SELECT COUNT(*) as total
       FROM recitation_results rr
       JOIN recitations r ON rr.recitation_id = r.id
       JOIN students s ON rr.student_id = s.id
       ${whereClause}`,
      params
    );

    const dataQ = await pool.query(
      `SELECT
         rr.id, rr.score, rr.passed, rr.correct_count,
         rr.wrong_count, rr.unanswered_count, rr.points_earned, rr.created_at,
         r.id AS recitation_id, r.title AS recitation_title,
         r.total_score, r.pass_score,
         s.id AS student_id, s.name AS student_name, s.username AS student_username,
         s.academic_stage
       FROM recitation_results rr
       JOIN recitations r ON rr.recitation_id = r.id
       JOIN students s ON rr.student_id = s.id
       ${whereClause}
       ORDER BY ${sortCol} ${sortDir}
       LIMIT $${p} OFFSET $${p + 1}`,
      [...params, limitNum, offset]
    );

    res.json({
      total: parseInt(countQ.rows[0].total, 10),
      page: pageNum,
      limit: limitNum,
      results: dataQ.rows,
    });
  } catch (err) {
    console.error('[archive/recitation-results]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/archive/students ───────────────────────────────────────────────
// Each student appears ONCE with aggregated exam + recitation stats.
// Only students who have at least one result are included.
// Supports: q (search), stage, sort (name/exams/recitations/score), order, page, limit
router.get('/students', requireRole('teacher', 'assistant'), checkAnyPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  if (!teacherId) return res.status(400).json({ error: 'بيانات المعلم غير صالحة' });

  const {
    q, stage,
    sort = 'name', order = 'asc',
    page = 1, limit = 50,
  } = req.query;

  try {
    // Dynamic outer WHERE conditions (s.teacher_id = $1 is always first).
    // $1 is also reused inside the two subqueries — PostgreSQL allows this.
    const conditions = ['s.teacher_id = $1', 's.deleted_at IS NULL'];
    // has_type: '' = any results, 'exams' = has exams, 'recitations' = has recitations, 'both' = has both
    const { has_type } = req.query;
    if (has_type === 'exams') {
      conditions.push('COALESCE(ex.total_exams,0) > 0');
    } else if (has_type === 'recitations') {
      conditions.push('COALESCE(rec.total_recitations,0) > 0');
    } else if (has_type === 'both') {
      conditions.push('COALESCE(ex.total_exams,0) > 0');
      conditions.push('COALESCE(rec.total_recitations,0) > 0');
    } else {
      conditions.push('(COALESCE(ex.total_exams,0) > 0 OR COALESCE(rec.total_recitations,0) > 0)');
    }
    const params = [teacherId];
    let p = 2;

    if (q && q.trim()) {
      const like = `%${q.trim().slice(0, 100)}%`;
      conditions.push(`(s.name ILIKE $${p} OR s.username ILIKE $${p})`);
      params.push(like);
      p++;
    }
    if (stage && stage !== 'الكل') {
      conditions.push(`s.academic_stage = $${p++}`);
      params.push(stage);
    }

    const sortMap = {
      name:        's.name',
      exams:       'COALESCE(ex.total_exams, 0)',
      recitations: 'COALESCE(rec.total_recitations, 0)',
      score:       'COALESCE(ex.avg_exam_score, 0)',
    };
    const sortCol = sortMap[sort] || 's.name';
    const sortDir = order === 'desc' ? 'DESC' : 'ASC';

    const pageNum  = Math.min(10000, Math.max(1, parseInt(page,  10) || 1));
    const limitNum = Math.min(200,   Math.max(1, parseInt(limit, 10) || 50));
    const offset   = (pageNum - 1) * limitNum;

    const whereClause = conditions
      .map((c, i) => (i === 0 ? `WHERE ${c}` : `AND ${c}`))
      .join('\n      ');

    // Subquery for exam stats (per student, this teacher only)
    const examSub = `
      SELECT er.student_id,
        COUNT(*) FILTER (WHERE er.is_latest = true AND er.is_absent = false) AS total_exams,
        COUNT(*) FILTER (WHERE er.is_latest = true AND er.score >= e.pass_score AND er.is_absent = false) AS passed_exams,
        COUNT(*) FILTER (WHERE er.is_latest = true AND er.is_absent = true) AS absent_exams,
        ROUND(AVG(er.score::numeric / NULLIF(e.total_score,0) * 100)
              FILTER (WHERE er.is_latest = true AND er.is_absent = false), 1) AS avg_exam_score
      FROM exam_results er
      JOIN exams e ON er.exam_id = e.id
      WHERE e.teacher_id = $1
      GROUP BY er.student_id`;

    // Subquery for recitation stats (per student, this teacher only)
    const recSub = `
      SELECT rr.student_id,
        COUNT(*) AS total_recitations,
        COUNT(*) FILTER (WHERE rr.passed = true) AS passed_recitations,
        ROUND(AVG(rr.score::numeric / NULLIF(r.total_score,0) * 100), 1) AS avg_rec_score
      FROM recitation_results rr
      JOIN recitations r ON rr.recitation_id = r.id
      WHERE r.teacher_id = $1
      GROUP BY rr.student_id`;

    const fromClause = `
      FROM students s
      LEFT JOIN (${examSub}) ex  ON ex.student_id  = s.id
      LEFT JOIN (${recSub})  rec ON rec.student_id = s.id
      ${whereClause}`;

    const countQ = await pool.query(
      `SELECT COUNT(*) AS total ${fromClause}`, params);

    const dataQ = await pool.query(
      `SELECT
         s.id, s.name, s.username, s.academic_stage,
         COALESCE(ex.total_exams,       0) AS total_exams,
         COALESCE(ex.passed_exams,      0) AS passed_exams,
         COALESCE(ex.absent_exams,      0) AS absent_exams,
         COALESCE(ex.avg_exam_score,    0) AS avg_exam_score,
         COALESCE(rec.total_recitations,0) AS total_recitations,
         COALESCE(rec.passed_recitations,0) AS passed_recitations,
         COALESCE(rec.avg_rec_score,    0) AS avg_rec_score
       ${fromClause}
       ORDER BY ${sortCol} ${sortDir}, s.name ASC
       LIMIT $${p} OFFSET $${p + 1}`,
      [...params, limitNum, offset]
    );

    res.json({
      total:    parseInt(countQ.rows[0].total, 10),
      page:     pageNum,
      limit:    limitNum,
      students: dataQ.rows,
    });
  } catch (err) {
    console.error('[archive/students]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/archive/filters ────────────────────────────────────────────────
// Returns all courses, exams, recitations, and academic stages for filter dropdowns
// FIX-B1: filters uses checkAnyPerm (shows all filter options regardless of tab)
router.get('/filters', requireRole('teacher', 'assistant'), checkAnyPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  if (!teacherId) return res.status(400).json({ error: 'بيانات المعلم غير صالحة' });

  try {
    const [coursesQ, examsQ, recitationsQ, stagesQ] = await Promise.all([
      pool.query(
        `SELECT id, name FROM courses WHERE teacher_id=$1 ORDER BY name`,
        [teacherId]
      ),
      pool.query(
        `SELECT e.id, e.title, e.course_id, c.name AS course_name
         FROM exams e JOIN courses c ON e.course_id=c.id
         WHERE e.teacher_id=$1 ORDER BY c.name, e.title`,
        [teacherId]
      ),
      pool.query(
        `SELECT id, title FROM recitations WHERE teacher_id=$1 ORDER BY title`,
        [teacherId]
      ),
      pool.query(
        `SELECT DISTINCT academic_stage FROM students
         WHERE teacher_id=$1 AND deleted_at IS NULL AND academic_stage IS NOT NULL
         ORDER BY academic_stage`,
        [teacherId]
      ),
    ]);

    res.json({
      courses: coursesQ.rows,
      exams: examsQ.rows,
      recitations: recitationsQ.rows,
      stages: stagesQ.rows.map(r => r.academic_stage),
    });
  } catch (err) {
    console.error('[archive/filters]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/archive/student/:id/exam-results ───────────────────────────────
// Full exam history for one student (all attempts, not just latest)
// FIX-B1: student exam detail uses checkExamPerm
router.get('/student/:id/exam-results', requireRole('teacher', 'assistant'), checkExamPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  if (!teacherId) return res.status(400).json({ error: 'بيانات المعلم غير صالحة' });

  const studentId = parseParamId(req.params.id);
  if (!studentId) return res.status(400).json({ error: 'معرّف الطالب غير صالح' });

  try {
    const check = await pool.query(
      'SELECT id FROM students WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL',
      [studentId, teacherId]
    );
    if (!check.rows.length) return res.status(404).json({ error: 'الطالب غير موجود' });

    const { rows } = await pool.query(
      `SELECT
         er.id, er.score, er.correct_count, er.wrong_count, er.unanswered_count,
         er.points_earned, er.attempt_number, er.created_at, er.is_latest, er.is_absent,
         e.id AS exam_id, e.title AS exam_title, e.total_score, e.pass_score,
         c.id AS course_id, c.name AS course_name
       FROM exam_results er
       JOIN exams e ON er.exam_id = e.id
       LEFT JOIN courses c ON e.course_id = c.id
       WHERE er.student_id = $1 AND e.teacher_id = $2
       ORDER BY er.created_at DESC`,
      [studentId, teacherId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[archive/student/exam-results]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/archive/student/:id/recitation-results ────────────────────────
// Full recitation history for one student
// FIX-B1: student recitation detail uses checkRecPerm
router.get('/student/:id/recitation-results', requireRole('teacher', 'assistant'), checkRecPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  if (!teacherId) return res.status(400).json({ error: 'بيانات المعلم غير صالحة' });

  const studentId = parseParamId(req.params.id);
  if (!studentId) return res.status(400).json({ error: 'معرّف الطالب غير صالح' });

  try {
    const check = await pool.query(
      'SELECT id FROM students WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL',
      [studentId, teacherId]
    );
    if (!check.rows.length) return res.status(404).json({ error: 'الطالب غير موجود' });

    const { rows } = await pool.query(
      `SELECT
         rr.id, rr.score, rr.passed, rr.correct_count,
         rr.wrong_count, rr.unanswered_count, rr.points_earned, rr.created_at,
         r.id AS recitation_id, r.title AS recitation_title,
         r.total_score, r.pass_score
       FROM recitation_results rr
       JOIN recitations r ON rr.recitation_id = r.id
       WHERE rr.student_id = $1 AND r.teacher_id = $2
       ORDER BY rr.created_at DESC`,
      [studentId, teacherId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[archive/student/recitation-results]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/archive/student/:id/summary ────────────────────────────────────
// Quick stats summary for one student (for the modal header)
// FIX-B1: summary shows both exam+rec stats so uses checkAnyPerm
router.get('/student/:id/summary', requireRole('teacher', 'assistant'), checkAnyPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  if (!teacherId) return res.status(400).json({ error: 'بيانات المعلم غير صالحة' });

  const studentId = parseParamId(req.params.id);
  if (!studentId) return res.status(400).json({ error: 'معرّف الطالب غير صالح' });

  try {
    // Check student ownership first before running stats queries
    const studentQ = await pool.query(
      'SELECT id, name, username, academic_stage, phone, points FROM students WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL',
      [studentId, teacherId]
    );
    if (!studentQ.rows.length) return res.status(404).json({ error: 'الطالب غير موجود' });

    // FIX-A2: avg_score returns percentage (0-100) not raw score
    const [examStatsQ, recStatsQ] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE er.is_latest=true) AS total_exams,
           COUNT(*) FILTER (WHERE er.is_latest=true AND er.score >= e.pass_score) AS passed_exams,
           COUNT(*) FILTER (WHERE er.is_latest=true AND er.score < e.pass_score) AS failed_exams,
           ROUND(AVG(er.score::numeric / NULLIF(e.total_score, 0) * 100) FILTER (WHERE er.is_latest=true), 1) AS avg_score
         FROM exam_results er
         JOIN exams e ON er.exam_id = e.id
         WHERE er.student_id=$1 AND e.teacher_id=$2`,
        [studentId, teacherId]
      ),
      pool.query(
        `SELECT
           COUNT(*) AS total_recitations,
           COUNT(*) FILTER (WHERE rr.passed=true) AS passed_recitations,
           COUNT(*) FILTER (WHERE rr.passed=false) AS failed_recitations,
           ROUND(AVG(rr.score::numeric / NULLIF(r.total_score, 0) * 100), 1) AS avg_score
         FROM recitation_results rr
         JOIN recitations r ON rr.recitation_id=r.id
         WHERE rr.student_id=$1 AND r.teacher_id=$2`,
        [studentId, teacherId]
      ),
    ]);

    res.json({
      student: studentQ.rows[0],
      exams: examStatsQ.rows[0],
      recitations: recStatsQ.rows[0],
    });
  } catch (err) {
    console.error('[archive/student/summary]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
