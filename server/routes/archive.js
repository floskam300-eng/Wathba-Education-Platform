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
    min_minutes, max_minutes,
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

  // Validate duration range filters
  const minMinutes = min_minutes !== undefined && min_minutes !== '' ? parseInt(min_minutes, 10) : null;
  const maxMinutes = max_minutes !== undefined && max_minutes !== '' ? parseInt(max_minutes, 10) : null;
  if (minMinutes !== null && (isNaN(minMinutes) || minMinutes < 0))
    return res.status(400).json({ error: 'min_minutes غير صالح' });
  if (maxMinutes !== null && (isNaN(maxMinutes) || maxMinutes < 0))
    return res.status(400).json({ error: 'max_minutes غير صالح' });
  if (minMinutes !== null && maxMinutes !== null && minMinutes > maxMinutes)
    return res.status(400).json({ error: 'min_minutes يجب أن يكون أقل من max_minutes' });

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

    // Duration filters — only apply to completed attempts (end_time IS NOT NULL).
    if (minMinutes !== null) {
      conditions.push(`er.end_time IS NOT NULL AND ROUND(EXTRACT(EPOCH FROM (er.end_time - er.start_time)) / 60.0)::int >= $${p++}`);
      params.push(minMinutes);
    }
    if (maxMinutes !== null) {
      conditions.push(`er.end_time IS NOT NULL AND ROUND(EXTRACT(EPOCH FROM (er.end_time - er.start_time)) / 60.0)::int <= $${p++}`);
      params.push(maxMinutes);
    }

    const sortMap = {
      date: 'er.created_at',
      score: 'er.score',
      name: 's.name',
      exam: 'e.title',
      duration: 'time_minutes',
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
         er.start_time, er.end_time,
         ROUND(EXTRACT(EPOCH FROM (er.end_time - er.start_time)) / 60.0, 1) AS time_minutes,
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
    min_minutes, max_minutes,
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

  // Validate duration range filters
  const minMinutes = min_minutes !== undefined && min_minutes !== '' ? parseInt(min_minutes, 10) : null;
  const maxMinutes = max_minutes !== undefined && max_minutes !== '' ? parseInt(max_minutes, 10) : null;
  if (minMinutes !== null && (isNaN(minMinutes) || minMinutes < 0))
    return res.status(400).json({ error: 'min_minutes غير صالح' });
  if (maxMinutes !== null && (isNaN(maxMinutes) || maxMinutes < 0))
    return res.status(400).json({ error: 'max_minutes غير صالح' });
  if (minMinutes !== null && maxMinutes !== null && minMinutes > maxMinutes)
    return res.status(400).json({ error: 'min_minutes يجب أن يكون أقل من max_minutes' });

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

    // Duration filters — only apply to completed attempts (end_time IS NOT NULL).
    if (minMinutes !== null) {
      conditions.push(`rr.end_time IS NOT NULL AND ROUND(EXTRACT(EPOCH FROM (rr.end_time - rr.start_time)) / 60.0)::int >= $${p++}`);
      params.push(minMinutes);
    }
    if (maxMinutes !== null) {
      conditions.push(`rr.end_time IS NOT NULL AND ROUND(EXTRACT(EPOCH FROM (rr.end_time - rr.start_time)) / 60.0)::int <= $${p++}`);
      params.push(maxMinutes);
    }

    const sortMap = {
      date: 'rr.created_at',
      score: 'rr.score',
      name: 's.name',
      recitation: 'r.title',
      duration: 'time_minutes',
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
         rr.start_time, rr.end_time,
         ROUND(EXTRACT(EPOCH FROM (rr.end_time - rr.start_time)) / 60.0, 1) AS time_minutes,
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
    // BUG-4+6 FIX: include absent_exams in the "has exams" filters so that
    // students who were only marked absent (never actually took an exam) still
    // appear in the archive list. Without this fix they are completely invisible.
    if (has_type === 'exams') {
      conditions.push('(COALESCE(ex.total_exams,0) + COALESCE(ex.absent_exams,0)) > 0');
    } else if (has_type === 'recitations') {
      conditions.push('COALESCE(rec.total_recitations,0) > 0');
    } else if (has_type === 'both') {
      conditions.push('(COALESCE(ex.total_exams,0) + COALESCE(ex.absent_exams,0)) > 0');
      conditions.push('COALESCE(rec.total_recitations,0) > 0');
    } else {
      conditions.push('((COALESCE(ex.total_exams,0) + COALESCE(ex.absent_exams,0)) > 0 OR COALESCE(rec.total_recitations,0) > 0)');
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
      // FIX-FILTERS-1: Use LEFT JOIN so standalone exams (course_id = NULL) appear
      // in the dropdown. INNER JOIN silently dropped them.
      pool.query(
        `SELECT e.id, e.title, e.course_id, c.name AS course_name
         FROM exams e LEFT JOIN courses c ON e.course_id=c.id
         WHERE e.teacher_id=$1 AND e.deleted_at IS NULL ORDER BY c.name NULLS LAST, e.title`,
        [teacherId]
      ),
      pool.query(
        `SELECT id, title FROM recitations WHERE teacher_id=$1 AND deleted_at IS NULL ORDER BY title`,
        [teacherId]
      ),
      pool.query(
        `SELECT DISTINCT stage FROM (
           SELECT academic_stage AS stage FROM students WHERE teacher_id=$1 AND deleted_at IS NULL AND academic_stage IS NOT NULL
           UNION
           SELECT target_stage AS stage FROM courses WHERE teacher_id=$1 AND target_stage IS NOT NULL
           UNION
           SELECT academic_stage AS stage FROM recitations WHERE teacher_id=$1 AND deleted_at IS NULL AND academic_stage IS NOT NULL
         ) s WHERE stage IS NOT NULL AND stage != ''`,
        [teacherId]
      ),
    ]);

    const STAGE_ORDER = [
      'الصف الأول الابتدائي', 'الصف الثاني الابتدائي', 'الصف الثالث الابتدائي',
      'الصف الرابع الابتدائي', 'الصف الخامس الابتدائي', 'الصف السادس الابتدائي',
      'الصف الأول الإعدادي', 'الصف الثاني الإعدادي', 'الصف الثالث الإعدادي',
      'الصف الأول الثانوي عام', 'الصف الأول الثانوي بكالوريا',
      'الصف الثاني الثانوي عام', 'الصف الثاني الثانوي بكالوريا',
      'الصف الثالث الثانوي', 'جامعي'
    ];
    const dbStages = stagesQ.rows.map(r => r.stage).filter(Boolean);
    dbStages.sort((a, b) => {
      const idxA = STAGE_ORDER.indexOf(a);
      const idxB = STAGE_ORDER.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b, 'ar');
    });

    res.json({
      courses: coursesQ.rows,
      exams: examsQ.rows,
      recitations: recitationsQ.rows,
      stages: dbStages,
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
         er.start_time, er.end_time,
         ROUND(EXTRACT(EPOCH FROM (er.end_time - er.start_time)) / 60.0, 1) AS time_minutes,
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
         rr.start_time, rr.end_time,
         ROUND(EXTRACT(EPOCH FROM (rr.end_time - rr.start_time)) / 60.0, 1) AS time_minutes,
         ROW_NUMBER() OVER (PARTITION BY rr.student_id, rr.recitation_id ORDER BY rr.created_at ASC) AS attempt_number,
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
    // N3 FIX: exclude absent records from total/passed/failed/avg — absent ≠ "took the exam";
    // count them separately so the modal can show a distinct "غائب" pill.
    const [examStatsQ, recStatsQ] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE er.is_latest=true AND er.is_absent=false) AS total_exams,
           COUNT(*) FILTER (WHERE er.is_latest=true AND er.is_absent=false AND er.score >= e.pass_score) AS passed_exams,
           COUNT(*) FILTER (WHERE er.is_latest=true AND er.is_absent=false AND er.score < e.pass_score) AS failed_exams,
           COUNT(*) FILTER (WHERE er.is_latest=true AND er.is_absent=true) AS absent_exams,
           ROUND(AVG(er.score::numeric / NULLIF(e.total_score, 0) * 100) FILTER (WHERE er.is_latest=true AND er.is_absent=false), 1) AS avg_score
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

// ── GET /api/archive/items ──────────────────────────────────────────────────
// Returns all exams and recitations for the teacher with aggregated summary stats
router.get('/items', requireRole('teacher', 'assistant'), checkAnyPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  if (!teacherId) return res.status(400).json({ error: 'بيانات المعلم غير صالحة' });

  const { type = 'all', q, stage, published, min_minutes, max_minutes, sort = 'date', order = 'desc' } = req.query;

  // Validate optional duration range filters on /items (avg minutes per item).
  const itemsMinMinutes = min_minutes !== undefined && min_minutes !== '' ? parseInt(min_minutes, 10) : null;
  const itemsMaxMinutes = max_minutes !== undefined && max_minutes !== '' ? parseInt(max_minutes, 10) : null;
  if (itemsMinMinutes !== null && (isNaN(itemsMinMinutes) || itemsMinMinutes < 0))
    return res.status(400).json({ error: 'min_minutes غير صالح' });
  if (itemsMaxMinutes !== null && (isNaN(itemsMaxMinutes) || itemsMaxMinutes < 0))
    return res.status(400).json({ error: 'max_minutes غير صالح' });
  if (itemsMinMinutes !== null && itemsMaxMinutes !== null && itemsMinMinutes > itemsMaxMinutes)
    return res.status(400).json({ error: 'min_minutes يجب أن يكون أقل من max_minutes' });

  try {
    const items = [];

    // 1. Fetch Exams (if type is 'all' or 'exam')
    if (type === 'all' || type === 'exam') {
      const examConditions = ['e.teacher_id = $1', 'e.deleted_at IS NULL'];
      const examParams = [teacherId];
      let ep = 2;

      if (q && q.trim()) {
        examConditions.push(`(e.title ILIKE $${ep} OR COALESCE(c.name, '') ILIKE $${ep})`);
        examParams.push(`%${q.trim().slice(0, 100)}%`);
        ep++;
      }
      if (published === 'true') {
        examConditions.push(`e.is_published = true`);
      } else if (published === 'false') {
        examConditions.push(`e.is_published = false`);
      }
      if (stage && stage !== 'الكل') {
        examConditions.push(`(c.target_stage = $${ep} OR (e.course_id IS NULL AND EXISTS (SELECT 1 FROM students s WHERE s.teacher_id = $1 AND s.academic_stage = $${ep} AND s.deleted_at IS NULL)))`);
        examParams.push(stage);
        ep++;
      }
      if (itemsMinMinutes !== null) {
        examConditions.push(`er_stats.avg_time_minutes IS NOT NULL AND er_stats.avg_time_minutes >= $${ep}`);
        examParams.push(itemsMinMinutes);
        ep++;
      }
      if (itemsMaxMinutes !== null) {
        examConditions.push(`er_stats.avg_time_minutes IS NOT NULL AND er_stats.avg_time_minutes <= $${ep}`);
        examParams.push(itemsMaxMinutes);
        ep++;
      }

      const examWhere = examConditions.join(' AND ');

      const examsQ = await pool.query(
        `SELECT
           e.id,
           'exam' AS item_type,
           e.title,
           e.total_score,
           e.pass_score,
           e.is_published,
           e.course_id,
           COALESCE(c.name, '—') AS course_name,
           c.target_stage AS course_target_stage,
           c.target_stage AS academic_stage,
           e.duration_minutes,
           e.start_date,
           e.end_date,
           e.created_at,
           (CASE
              WHEN e.course_id IS NOT NULL THEN
                (SELECT COUNT(DISTINCT sce.student_id)::int
                 FROM student_course_enrollment sce
                 JOIN students s ON sce.student_id = s.id
                 WHERE sce.course_id = e.course_id AND sce.status = 'active'
                   AND s.teacher_id = $1 AND s.deleted_at IS NULL AND s.is_suspended = false)
              ELSE
                (SELECT COUNT(*)::int
                 FROM students s
                 WHERE s.teacher_id = $1 AND s.deleted_at IS NULL AND s.is_suspended = false)
            END) AS total_targeted,
           COALESCE(er_stats.attended_count, 0)::int AS attended_count,
           COALESCE(er_stats.passed_count, 0)::int AS passed_count,
           COALESCE(er_stats.failed_count, 0)::int AS failed_count,
           COALESCE(er_stats.absent_marked_count, 0)::int AS absent_marked_count,
           COALESCE(er_stats.avg_score, 0)::numeric AS avg_score,
           COALESCE(er_stats.retried_count, 0)::int AS retried_count,
           er_stats.avg_time_minutes,
           er_stats.fastest_time_minutes,
           er_stats.slowest_time_minutes
         FROM exams e
         LEFT JOIN courses c ON e.course_id = c.id
         LEFT JOIN (
           SELECT
             er.exam_id,
             COUNT(DISTINCT er.student_id) FILTER (WHERE er.is_latest = true AND er.is_absent = false) AS attended_count,
             COUNT(DISTINCT er.student_id) FILTER (WHERE er.is_latest = true AND er.is_absent = false AND er.score >= ex_inner.pass_score) AS passed_count,
             COUNT(DISTINCT er.student_id) FILTER (WHERE er.is_latest = true AND er.is_absent = false AND er.score < ex_inner.pass_score) AS failed_count,
             COUNT(DISTINCT er.student_id) FILTER (WHERE er.is_latest = true AND er.is_absent = true) AS absent_marked_count,
             ROUND(AVG(er.score::numeric / NULLIF(ex_inner.total_score, 0) * 100) FILTER (WHERE er.is_latest = true AND er.is_absent = false), 1) AS avg_score,
             COUNT(DISTINCT er.student_id) FILTER (WHERE er.attempt_number > 1) AS retried_count,
             ROUND(AVG(EXTRACT(EPOCH FROM (er.end_time - er.start_time)) / 60.0)
               FILTER (WHERE er.is_latest = true AND er.is_absent = false AND er.end_time IS NOT NULL AND er.start_time IS NOT NULL), 1) AS avg_time_minutes,
             ROUND(MIN(EXTRACT(EPOCH FROM (er.end_time - er.start_time)) / 60.0)
               FILTER (WHERE er.is_latest = true AND er.is_absent = false AND er.end_time IS NOT NULL AND er.start_time IS NOT NULL), 1) AS fastest_time_minutes,
             ROUND(MAX(EXTRACT(EPOCH FROM (er.end_time - er.start_time)) / 60.0)
               FILTER (WHERE er.is_latest = true AND er.is_absent = false AND er.end_time IS NOT NULL AND er.start_time IS NOT NULL), 1) AS slowest_time_minutes
           FROM exam_results er
           JOIN exams ex_inner ON er.exam_id = ex_inner.id
           WHERE ex_inner.teacher_id = $1
           GROUP BY er.exam_id
         ) er_stats ON er_stats.exam_id = e.id
         WHERE ${examWhere}
         ORDER BY e.created_at DESC`,
        examParams
      );

      examsQ.rows.forEach(row => {
        const targeted = Number(row.total_targeted) || 0;
        const attended = Number(row.attended_count) || 0;
        const absent = Math.max(0, targeted - attended);
        items.push({
          ...row,
          total_targeted: targeted,
          attended_count: attended,
          passed_count: Number(row.passed_count) || 0,
          failed_count: Number(row.failed_count) || 0,
          absent_count: absent,
          retried_count: Number(row.retried_count) || 0,
          avg_score: Number(row.avg_score) || 0,
        });
      });
    }

    // 2. Fetch Recitations (if type is 'all' or 'recitation')
    if (type === 'all' || type === 'recitation') {
      const recConditions = ['r.teacher_id = $1', 'r.deleted_at IS NULL'];
      const recParams = [teacherId];
      let rp = 2;

      if (q && q.trim()) {
        recConditions.push(`(r.title ILIKE $${rp} OR COALESCE(c.name, '') ILIKE $${rp})`);
        recParams.push(`%${q.trim().slice(0, 100)}%`);
        rp++;
      }
      if (published === 'true') {
        recConditions.push(`r.is_published = true`);
      } else if (published === 'false') {
        recConditions.push(`r.is_published = false`);
      }
      if (stage && stage !== 'الكل') {
        recConditions.push(`(r.academic_stage = $${rp} OR (r.course_id IS NOT NULL AND c.target_stage = $${rp}))`);
        recParams.push(stage);
        rp++;
      }
      if (itemsMinMinutes !== null) {
        recConditions.push(`rr_stats.avg_time_minutes IS NOT NULL AND rr_stats.avg_time_minutes >= $${rp}`);
        recParams.push(itemsMinMinutes);
        rp++;
      }
      if (itemsMaxMinutes !== null) {
        recConditions.push(`rr_stats.avg_time_minutes IS NOT NULL AND rr_stats.avg_time_minutes <= $${rp}`);
        recParams.push(itemsMaxMinutes);
        rp++;
      }

      const recWhere = recConditions.join(' AND ');

      const recsQ = await pool.query(
        `SELECT
           r.id,
           'recitation' AS item_type,
           r.title,
           r.total_score,
           r.pass_score,
           r.is_published,
           r.course_id,
           COALESCE(c.name, '—') AS course_name,
           c.target_stage AS course_target_stage,
           r.academic_stage,
           r.duration_minutes,
           r.start_date,
           r.end_date,
           r.created_at,
           (CASE
              WHEN r.course_id IS NOT NULL THEN
                (SELECT COUNT(DISTINCT sce.student_id)::int
                 FROM student_course_enrollment sce
                 JOIN students s ON sce.student_id = s.id
                 WHERE sce.course_id = r.course_id AND sce.status = 'active'
                   AND s.teacher_id = $1 AND s.deleted_at IS NULL AND s.is_suspended = false)
              WHEN r.academic_stage IS NOT NULL THEN
                (SELECT COUNT(*)::int
                 FROM students s
                 WHERE s.teacher_id = $1 AND s.academic_stage = r.academic_stage
                   AND s.deleted_at IS NULL AND s.is_suspended = false)
              ELSE
                (SELECT COUNT(*)::int
                 FROM students s
                 WHERE s.teacher_id = $1 AND s.deleted_at IS NULL AND s.is_suspended = false)
            END) AS total_targeted,
           COALESCE(rr_stats.attended_count, 0)::int AS attended_count,
           COALESCE(rr_stats.passed_count, 0)::int AS passed_count,
           COALESCE(rr_stats.failed_count, 0)::int AS failed_count,
           COALESCE(rr_stats.absent_marked_count, 0)::int AS absent_marked_count,
           COALESCE(rr_stats.avg_score, 0)::numeric AS avg_score,
           COALESCE(rr_stats.retried_count, 0)::int AS retried_count,
           rr_stats.avg_time_minutes,
           rr_stats.fastest_time_minutes,
           rr_stats.slowest_time_minutes
         FROM recitations r
         LEFT JOIN courses c ON r.course_id = c.id
         LEFT JOIN (
           SELECT
             rr.recitation_id,
             COUNT(DISTINCT rr.student_id) FILTER (WHERE rr.is_absent = false) AS attended_count,
             COUNT(DISTINCT rr.student_id) FILTER (WHERE rr.passed = true AND rr.is_absent = false) AS passed_count,
             COUNT(DISTINCT rr.student_id) FILTER (WHERE rr.passed = false AND rr.is_absent = false) AS failed_count,
             COUNT(DISTINCT rr.student_id) FILTER (WHERE rr.is_absent = true) AS absent_marked_count,
             ROUND(AVG(rr.score::numeric / NULLIF(rc_inner.total_score, 0) * 100) FILTER (WHERE rr.is_absent = false), 1) AS avg_score,
             COUNT(rr.id) - COUNT(DISTINCT rr.student_id) AS retried_count,
             ROUND(AVG(EXTRACT(EPOCH FROM (rr.end_time - rr.start_time)) / 60.0)
               FILTER (WHERE rr.is_absent = false AND rr.end_time IS NOT NULL AND rr.start_time IS NOT NULL), 1) AS avg_time_minutes,
             ROUND(MIN(EXTRACT(EPOCH FROM (rr.end_time - rr.start_time)) / 60.0)
               FILTER (WHERE rr.is_absent = false AND rr.end_time IS NOT NULL AND rr.start_time IS NOT NULL), 1) AS fastest_time_minutes,
             ROUND(MAX(EXTRACT(EPOCH FROM (rr.end_time - rr.start_time)) / 60.0)
               FILTER (WHERE rr.is_absent = false AND rr.end_time IS NOT NULL AND rr.start_time IS NOT NULL), 1) AS slowest_time_minutes
           FROM recitation_results rr
           JOIN recitations rc_inner ON rr.recitation_id = rc_inner.id
           WHERE rc_inner.teacher_id = $1
           GROUP BY rr.recitation_id
         ) rr_stats ON rr_stats.recitation_id = r.id
         WHERE ${recWhere}
         ORDER BY r.created_at DESC`,
        recParams
      );

      recsQ.rows.forEach(row => {
        const targeted = Number(row.total_targeted) || 0;
        const attended = Number(row.attended_count) || 0;
        const absent = Math.max(0, targeted - attended);
        items.push({
          ...row,
          total_targeted: targeted,
          attended_count: attended,
          passed_count: Number(row.passed_count) || 0,
          failed_count: Number(row.failed_count) || 0,
          absent_count: absent,
          retried_count: Number(row.retried_count) || 0,
          avg_score: Number(row.avg_score) || 0,
        });
      });
    }

    // Sort items
    items.sort((a, b) => {
      let cmp = 0;
      if (sort === 'title') {
        cmp = (a.title || '').localeCompare(b.title || '', 'ar');
      } else if (sort === 'targeted') {
        cmp = (a.total_targeted || 0) - (b.total_targeted || 0);
      } else if (sort === 'score') {
        cmp = (a.avg_score || 0) - (b.avg_score || 0);
      } else {
        // default: date
        cmp = new Date(a.created_at || 0) - new Date(b.created_at || 0);
      }
      return order === 'asc' ? cmp : -cmp;
    });

    res.json({
      total: items.length,
      items,
    });
  } catch (err) {
    console.error('[archive/items]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/archive/item/:type/:id/students ────────────────────────────────
// Returns all targeted students for a specific exam or recitation with their results,
// pass/fail/absent status, and attempts history.
router.get('/item/:type/:id/students', requireRole('teacher', 'assistant'), checkAnyPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  if (!teacherId) return res.status(400).json({ error: 'بيانات المعلم غير صالحة' });

  const { type, id: rawId } = req.params;
  const itemId = parseParamId(rawId);
  if (!itemId) return res.status(400).json({ error: 'المعرف غير صالح' });
  if (type !== 'exam' && type !== 'recitation') {
    return res.status(400).json({ error: 'نوع العنصر غير صالح، يجب أن يكون exam أو recitation' });
  }

  const { q, status = 'all', sort = 'name', order = 'asc' } = req.query;

  try {
    if (type === 'exam') {
      // 1. Fetch Exam info
      const examQ = await pool.query(
        `SELECT
           e.id, 'exam' AS item_type, e.title, e.total_score, e.pass_score,
           e.duration_minutes, e.course_id, e.is_published, e.start_date, e.end_date,
           e.created_at, COALESCE(c.name, '—') AS course_name, c.target_stage AS course_target_stage
         FROM exams e
         LEFT JOIN courses c ON e.course_id = c.id
         WHERE e.id = $1 AND e.teacher_id = $2 AND e.deleted_at IS NULL`,
        [itemId, teacherId]
      );
      if (!examQ.rows.length) return res.status(404).json({ error: 'الاختبار غير موجود' });
      const itemInfo = examQ.rows[0];

      // 2. Query target students + results + attempts
      let targetStudentsSql;
      const fullParams = [itemId, teacherId, itemInfo.total_score, itemInfo.pass_score];

      if (itemInfo.course_id) {
        fullParams.push(itemInfo.course_id);
        targetStudentsSql = `
          SELECT DISTINCT s.id, s.name, s.username, s.academic_stage, s.phone, s.parent_phone
          FROM students s
          JOIN student_course_enrollment sce ON s.id = sce.student_id
          WHERE sce.course_id = $5 AND sce.status = 'active'
            AND s.teacher_id = $2 AND s.deleted_at IS NULL AND s.is_suspended = false
          UNION
          SELECT DISTINCT s.id, s.name, s.username, s.academic_stage, s.phone, s.parent_phone
          FROM students s
          JOIN exam_results er ON s.id = er.student_id
          WHERE er.exam_id = $1 AND s.teacher_id = $2 AND s.deleted_at IS NULL
        `;
      } else {
        targetStudentsSql = `
          SELECT s.id, s.name, s.username, s.academic_stage, s.phone, s.parent_phone
          FROM students s
          WHERE s.teacher_id = $2 AND s.deleted_at IS NULL AND s.is_suspended = false
          UNION
          SELECT DISTINCT s.id, s.name, s.username, s.academic_stage, s.phone, s.parent_phone
          FROM students s
          JOIN exam_results er ON s.id = er.student_id
          WHERE er.exam_id = $1 AND s.teacher_id = $2 AND s.deleted_at IS NULL
        `;
      }

      const querySql = `
        WITH target_students AS (
          ${targetStudentsSql}
        ),
        student_attempts AS (
          SELECT
            er.student_id,
            COUNT(*) FILTER (WHERE er.is_absent = false) AS total_attempts,
            json_agg(
              json_build_object(
                'id', er.id,
                'attempt_number', er.attempt_number,
                'score', er.score,
                'percentage', ROUND(er.score::numeric / NULLIF($3::int, 0) * 100, 1),
                'passed', (er.score >= $4::int AND er.is_absent = false),
                'is_absent', er.is_absent,
                'correct_count', er.correct_count,
                'wrong_count', er.wrong_count,
                'unanswered_count', er.unanswered_count,
                'points_earned', er.points_earned,
                'start_time', er.start_time,
                'end_time', er.end_time,
                'time_minutes', ROUND(EXTRACT(EPOCH FROM (er.end_time - er.start_time)) / 60.0, 1),
                'created_at', er.created_at
              ) ORDER BY er.attempt_number ASC, er.created_at ASC
            ) AS attempts_list
          FROM exam_results er
          WHERE er.exam_id = $1
          GROUP BY er.student_id
        )
        SELECT
          ts.id AS student_id,
          ts.name AS student_name,
          ts.username AS student_username,
          ts.academic_stage,
          ts.phone,
          ts.parent_phone,
          latest_er.id AS result_id,
          latest_er.score,
          ROUND(latest_er.score::numeric / NULLIF($3::int, 0) * 100, 1) AS percentage,
          latest_er.correct_count,
          latest_er.wrong_count,
          latest_er.unanswered_count,
          latest_er.points_earned,
          latest_er.is_absent,
          latest_er.start_time,
          latest_er.end_time,
          ROUND(EXTRACT(EPOCH FROM (latest_er.end_time - latest_er.start_time)) / 60.0, 1) AS time_minutes,
          latest_er.created_at AS submitted_at,
          latest_er.attempt_number,
          COALESCE(sa.total_attempts, 0)::int AS attempts_count,
          COALESCE(sa.attempts_list, '[]'::json) AS attempts
        FROM target_students ts
        LEFT JOIN exam_results latest_er ON latest_er.student_id = ts.id AND latest_er.exam_id = $1 AND latest_er.is_latest = true
        LEFT JOIN student_attempts sa ON sa.student_id = ts.id
        ORDER BY ts.name ASC
      `;

      const studentsQ = await pool.query(querySql, fullParams);

      let processedStudents = studentsQ.rows.map(st => {
        const hasResult = st.result_id !== null && st.is_absent === false;
        const isAbsent = st.result_id === null || st.is_absent === true;
        const isPassed = hasResult && Number(st.score) >= itemInfo.pass_score;
        const isFailed = hasResult && Number(st.score) < itemInfo.pass_score;

        let studentStatus = 'absent';
        let statusLabel = 'غائب';
        if (isPassed) {
          studentStatus = 'passed';
          statusLabel = 'ناجح';
        } else if (isFailed) {
          studentStatus = 'failed';
          statusLabel = 'راسب';
        }

        return {
          student_id: st.student_id,
          student_name: st.student_name,
          student_username: st.student_username,
          academic_stage: st.academic_stage,
          phone: st.phone,
          parent_phone: st.parent_phone,
          result_id: st.result_id,
          score: isAbsent ? null : Number(st.score),
          percentage: isAbsent ? null : Number(st.percentage),
          status: studentStatus,
          status_label: statusLabel,
          is_absent: isAbsent,
          correct_count: isAbsent ? 0 : Number(st.correct_count) || 0,
          wrong_count: isAbsent ? 0 : Number(st.wrong_count) || 0,
          unanswered_count: isAbsent ? 0 : Number(st.unanswered_count) || 0,
          points_earned: isAbsent ? 0 : Number(st.points_earned) || 0,
          start_time: isAbsent ? null : st.start_time,
          end_time: isAbsent ? null : st.end_time,
          time_minutes: isAbsent ? null : (st.time_minutes !== null && st.time_minutes !== undefined ? Number(st.time_minutes) : null),
          submitted_at: isAbsent ? null : st.submitted_at,
          attempt_number: isAbsent ? null : st.attempt_number,
          attempts_count: Number(st.attempts_count) || 0,
          attempts: st.attempts || [],
        };
      });

      // Filter in JS
      if (q && q.trim()) {
        const queryTerm = q.trim().toLowerCase();
        processedStudents = processedStudents.filter(
          s => (s.student_name && s.student_name.toLowerCase().includes(queryTerm)) ||
               (s.student_username && s.student_username.toLowerCase().includes(queryTerm))
        );
      }
      if (status && status !== 'all') {
        if (status === 'passed') {
          processedStudents = processedStudents.filter(s => s.status === 'passed');
        } else if (status === 'failed') {
          processedStudents = processedStudents.filter(s => s.status === 'failed');
        } else if (status === 'absent') {
          processedStudents = processedStudents.filter(s => s.status === 'absent');
        } else if (status === 'retried') {
          processedStudents = processedStudents.filter(s => s.attempts_count > 1);
        }
      }

      // Sort
      processedStudents.sort((a, b) => {
        let cmp = 0;
        if (sort === 'score') {
          cmp = (a.score ?? -1) - (b.score ?? -1);
        } else if (sort === 'status') {
          cmp = a.status.localeCompare(b.status);
        } else if (sort === 'attempts') {
          cmp = a.attempts_count - b.attempts_count;
        } else if (sort === 'date') {
          cmp = new Date(a.submitted_at || 0) - new Date(b.submitted_at || 0);
        } else {
          // name
          cmp = (a.student_name || '').localeCompare(b.student_name || '', 'ar');
        }
        return order === 'asc' ? cmp : -cmp;
      });

      // Overall stats from all students (before q/status filtering)
      const allRows = studentsQ.rows;
      const totalTargeted = allRows.length;
      const attendedRows = allRows.filter(r => r.result_id !== null && r.is_absent === false);
      const attendedCount = attendedRows.length;
      const passedCount = attendedRows.filter(r => Number(r.score) >= itemInfo.pass_score).length;
      const failedCount = attendedRows.filter(r => Number(r.score) < itemInfo.pass_score).length;
      const absentCount = totalTargeted - attendedCount;
      const retriedCount = allRows.filter(r => (Number(r.attempts_count) || 0) > 1).length;

      const scores = attendedRows.map(r => Number(r.score)).filter(s => !isNaN(s));
      const avgScore = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
      const avgPct = itemInfo.total_score > 0 && scores.length ? Math.round((avgScore / itemInfo.total_score) * 1000) / 10 : 0;
      const maxScore = scores.length ? Math.max(...scores) : 0;
      const minScore = scores.length ? Math.min(...scores) : 0;

      // Time aggregates across all attended attempts for this item
      const timeMinutes = attendedRows
        .map(r => r.time_minutes !== null && r.time_minutes !== undefined ? Number(r.time_minutes) : NaN)
        .filter(m => !isNaN(m));
      const avgTimeMinutes = timeMinutes.length ? Math.round((timeMinutes.reduce((a, b) => a + b, 0) / timeMinutes.length) * 10) / 10 : 0;
      const fastestTimeMinutes = timeMinutes.length ? Math.min(...timeMinutes) : 0;
      const slowestTimeMinutes = timeMinutes.length ? Math.max(...timeMinutes) : 0;

      res.json({
        item: {
          ...itemInfo,
          total_targeted: totalTargeted,
          attended_count: attendedCount,
          passed_count: passedCount,
          failed_count: failedCount,
          absent_count: absentCount,
          retried_count: retriedCount,
          avg_score: avgScore,
          avg_pct: avgPct,
          max_score: maxScore,
          min_score: minScore,
          avg_time_minutes: avgTimeMinutes,
          fastest_time_minutes: fastestTimeMinutes,
          slowest_time_minutes: slowestTimeMinutes,
        },
        students: processedStudents,
        total: processedStudents.length,
      });
    } else {
      // 2. Recitation
      const recQ = await pool.query(
        `SELECT
           r.id, 'recitation' AS item_type, r.title, r.total_score, r.pass_score,
           r.duration_minutes, r.course_id, r.academic_stage, r.is_published,
           r.start_date, r.end_date, r.created_at,
           COALESCE(c.name, '—') AS course_name, c.target_stage AS course_target_stage
         FROM recitations r
         LEFT JOIN courses c ON r.course_id = c.id
         WHERE r.id = $1 AND r.teacher_id = $2 AND r.deleted_at IS NULL`,
        [itemId, teacherId]
      );
      if (!recQ.rows.length) return res.status(404).json({ error: 'التسميع غير موجود' });
      const itemInfo = recQ.rows[0];

      let targetStudentsSql;
      const fullParams = [itemId, teacherId, itemInfo.total_score, itemInfo.pass_score];

      if (itemInfo.course_id) {
        fullParams.push(itemInfo.course_id);
        targetStudentsSql = `
          SELECT DISTINCT s.id, s.name, s.username, s.academic_stage, s.phone, s.parent_phone
          FROM students s
          JOIN student_course_enrollment sce ON s.id = sce.student_id
          WHERE sce.course_id = $5 AND sce.status = 'active'
            AND s.teacher_id = $2 AND s.deleted_at IS NULL AND s.is_suspended = false
          UNION
          SELECT DISTINCT s.id, s.name, s.username, s.academic_stage, s.phone, s.parent_phone
          FROM students s
          JOIN recitation_results rr ON s.id = rr.student_id
          WHERE rr.recitation_id = $1 AND s.teacher_id = $2 AND s.deleted_at IS NULL
        `;
      } else if (itemInfo.academic_stage) {
        fullParams.push(itemInfo.academic_stage);
        targetStudentsSql = `
          SELECT s.id, s.name, s.username, s.academic_stage, s.phone, s.parent_phone
          FROM students s
          WHERE s.academic_stage = $5 AND s.teacher_id = $2
            AND s.deleted_at IS NULL AND s.is_suspended = false
          UNION
          SELECT DISTINCT s.id, s.name, s.username, s.academic_stage, s.phone, s.parent_phone
          FROM students s
          JOIN recitation_results rr ON s.id = rr.student_id
          WHERE rr.recitation_id = $1 AND s.teacher_id = $2 AND s.deleted_at IS NULL
        `;
      } else {
        targetStudentsSql = `
          SELECT s.id, s.name, s.username, s.academic_stage, s.phone, s.parent_phone
          FROM students s
          WHERE s.teacher_id = $2 AND s.deleted_at IS NULL AND s.is_suspended = false
          UNION
          SELECT DISTINCT s.id, s.name, s.username, s.academic_stage, s.phone, s.parent_phone
          FROM students s
          JOIN recitation_results rr ON s.id = rr.student_id
          WHERE rr.recitation_id = $1 AND s.teacher_id = $2 AND s.deleted_at IS NULL
        `;
      }

      const querySql = `
        WITH target_students AS (
          ${targetStudentsSql}
        ),
        rec_ordered AS (
          SELECT
            rr.*,
            ROW_NUMBER() OVER (PARTITION BY rr.student_id ORDER BY rr.created_at ASC, rr.id ASC) AS attempt_num
          FROM recitation_results rr
          WHERE rr.recitation_id = $1
        ),
        student_attempts AS (
          SELECT
            ro.student_id,
            COUNT(*) FILTER (WHERE ro.is_absent = false) AS total_attempts,
            json_agg(
              json_build_object(
                'id', ro.id,
                'attempt_number', ro.attempt_num,
                'score', ro.score,
                'percentage', ROUND(ro.score::numeric / NULLIF($3::int, 0) * 100, 1),
                'passed', ((ro.passed = true OR ro.score >= $4::int) AND ro.is_absent = false),
                'is_absent', ro.is_absent,
                'correct_count', ro.correct_count,
                'wrong_count', ro.wrong_count,
                'unanswered_count', ro.unanswered_count,
                'points_earned', ro.points_earned,
                'start_time', ro.start_time,
                'end_time', ro.end_time,
                'time_minutes', ROUND(EXTRACT(EPOCH FROM (ro.end_time - ro.start_time)) / 60.0, 1),
                'created_at', ro.created_at
              ) ORDER BY ro.attempt_num ASC, ro.created_at ASC
            ) AS attempts_list
          FROM rec_ordered ro
          GROUP BY ro.student_id
        )
        SELECT
          ts.id AS student_id,
          ts.name AS student_name,
          ts.username AS student_username,
          ts.academic_stage,
          ts.phone,
          ts.parent_phone,
          latest_rr.id AS result_id,
          latest_rr.score,
          ROUND(latest_rr.score::numeric / NULLIF($3::int, 0) * 100, 1) AS percentage,
          latest_rr.passed,
          latest_rr.correct_count,
          latest_rr.wrong_count,
          latest_rr.unanswered_count,
          latest_rr.points_earned,
          latest_rr.is_absent,
          latest_rr.start_time,
          latest_rr.end_time,
          ROUND(EXTRACT(EPOCH FROM (latest_rr.end_time - latest_rr.start_time)) / 60.0, 1) AS time_minutes,
          latest_rr.created_at AS submitted_at,
          COALESCE(latest_rr.attempt_num, sa.total_attempts, 0)::int AS attempt_number,
          COALESCE(sa.total_attempts, 0)::int AS attempts_count,
          COALESCE(sa.attempts_list, '[]'::json) AS attempts
        FROM target_students ts
        LEFT JOIN LATERAL (
          SELECT * FROM rec_ordered ro
          WHERE ro.student_id = ts.id
          ORDER BY ro.created_at DESC, ro.id DESC LIMIT 1
        ) latest_rr ON true
        LEFT JOIN student_attempts sa ON sa.student_id = ts.id
        ORDER BY ts.name ASC
      `;

      const studentsQ = await pool.query(querySql, fullParams);

      let processedStudents = studentsQ.rows.map(st => {
        const hasResult = st.result_id !== null && st.is_absent === false;
        const isAbsent = st.result_id === null || st.is_absent === true;
        const isPassed = hasResult && (st.passed === true || Number(st.score) >= itemInfo.pass_score);
        const isFailed = hasResult && !isPassed;

        let studentStatus = 'absent';
        let statusLabel = 'غائب';
        if (isPassed) {
          studentStatus = 'passed';
          statusLabel = 'ناجح';
        } else if (isFailed) {
          studentStatus = 'failed';
          statusLabel = 'راسب';
        }

        return {
          student_id: st.student_id,
          student_name: st.student_name,
          student_username: st.student_username,
          academic_stage: st.academic_stage,
          phone: st.phone,
          parent_phone: st.parent_phone,
          result_id: st.result_id,
          score: isAbsent ? null : Number(st.score),
          percentage: isAbsent ? null : Number(st.percentage),
          status: studentStatus,
          status_label: statusLabel,
          is_absent: isAbsent,
          correct_count: isAbsent ? 0 : Number(st.correct_count) || 0,
          wrong_count: isAbsent ? 0 : Number(st.wrong_count) || 0,
          unanswered_count: isAbsent ? 0 : Number(st.unanswered_count) || 0,
          points_earned: isAbsent ? 0 : Number(st.points_earned) || 0,
          start_time: isAbsent ? null : st.start_time,
          end_time: isAbsent ? null : st.end_time,
          time_minutes: isAbsent ? null : (st.time_minutes !== null && st.time_minutes !== undefined ? Number(st.time_minutes) : null),
          submitted_at: isAbsent ? null : st.submitted_at,
          attempt_number: isAbsent ? null : (Number(st.attempt_number) || Number(st.attempts_count) || 1),
          attempts_count: Number(st.attempts_count) || 0,
          attempts: st.attempts || [],
        };
      });

      // Filter in JS
      if (q && q.trim()) {
        const queryTerm = q.trim().toLowerCase();
        processedStudents = processedStudents.filter(
          s => (s.student_name && s.student_name.toLowerCase().includes(queryTerm)) ||
               (s.student_username && s.student_username.toLowerCase().includes(queryTerm))
        );
      }
      if (status && status !== 'all') {
        if (status === 'passed') {
          processedStudents = processedStudents.filter(s => s.status === 'passed');
        } else if (status === 'failed') {
          processedStudents = processedStudents.filter(s => s.status === 'failed');
        } else if (status === 'absent') {
          processedStudents = processedStudents.filter(s => s.status === 'absent');
        } else if (status === 'retried') {
          processedStudents = processedStudents.filter(s => s.attempts_count > 1);
        }
      }

      // Sort
      processedStudents.sort((a, b) => {
        let cmp = 0;
        if (sort === 'score') {
          cmp = (a.score ?? -1) - (b.score ?? -1);
        } else if (sort === 'status') {
          cmp = a.status.localeCompare(b.status);
        } else if (sort === 'attempts') {
          cmp = a.attempts_count - b.attempts_count;
        } else if (sort === 'date') {
          cmp = new Date(a.submitted_at || 0) - new Date(b.submitted_at || 0);
        } else {
          // name
          cmp = (a.student_name || '').localeCompare(b.student_name || '', 'ar');
        }
        return order === 'asc' ? cmp : -cmp;
      });

      const allRows = studentsQ.rows;
      const totalTargeted = allRows.length;
      const attendedRows = allRows.filter(r => r.result_id !== null && r.is_absent === false);
      const attendedCount = attendedRows.length;
      const passedCount = attendedRows.filter(r => r.passed === true || Number(r.score) >= itemInfo.pass_score).length;
      const failedCount = attendedRows.filter(r => !(r.passed === true || Number(r.score) >= itemInfo.pass_score)).length;
      const absentCount = totalTargeted - attendedCount;
      const retriedCount = allRows.filter(r => (Number(r.attempts_count) || 0) > 1).length;

      const scores = attendedRows.map(r => Number(r.score)).filter(s => !isNaN(s));
      const avgScore = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
      const avgPct = itemInfo.total_score > 0 && scores.length ? Math.round((avgScore / itemInfo.total_score) * 1000) / 10 : 0;
      const maxScore = scores.length ? Math.max(...scores) : 0;
      const minScore = scores.length ? Math.min(...scores) : 0;

      // Time aggregates across all attended attempts for this recitation
      const timeMinutes = attendedRows
        .map(r => r.time_minutes !== null && r.time_minutes !== undefined ? Number(r.time_minutes) : NaN)
        .filter(m => !isNaN(m));
      const avgTimeMinutes = timeMinutes.length ? Math.round((timeMinutes.reduce((a, b) => a + b, 0) / timeMinutes.length) * 10) / 10 : 0;
      const fastestTimeMinutes = timeMinutes.length ? Math.min(...timeMinutes) : 0;
      const slowestTimeMinutes = timeMinutes.length ? Math.max(...timeMinutes) : 0;

      res.json({
        item: {
          ...itemInfo,
          total_targeted: totalTargeted,
          attended_count: attendedCount,
          passed_count: passedCount,
          failed_count: failedCount,
          absent_count: absentCount,
          retried_count: retriedCount,
          avg_score: avgScore,
          avg_pct: avgPct,
          max_score: maxScore,
          min_score: minScore,
          avg_time_minutes: avgTimeMinutes,
          fastest_time_minutes: fastestTimeMinutes,
          slowest_time_minutes: slowestTimeMinutes,
        },
        students: processedStudents,
        total: processedStudents.length,
      });
    }
  } catch (err) {
    console.error('[archive/item/students]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
