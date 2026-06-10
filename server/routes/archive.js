const express = require('express');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { getPermissions } = require('../lib/permissionsCache');

const router = express.Router();
router.use(authenticate);

const PG_INT_MAX = 2147483647;
const parseParamId = (raw) => {
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0 || n > PG_INT_MAX || String(n) !== String(raw).trim()) return null;
  return n;
};

const getTeacherId = (req) =>
  req.user.role === 'teacher' ? req.user.id : req.user.teacher_id;

const checkViewPerm = async (req, res, next) => {
  if (req.user.role === 'teacher') return next();
  try {
    const perms = await getPermissions(req.user.id, pool);
    if (!perms || (!perms.can_view_analytics && !perms.can_manage_exams && !perms.can_manage_recitations))
      return res.status(403).json({ error: 'Access denied' });
    next();
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
};

// ── GET /api/archive/exam-results ──────────────────────────────────────────
// Filters: student_id, course_id, exam_id, stage, status (pass/fail/pending),
//          attempt (first/retry), date_from, date_to, sort, order, page, limit
router.get('/exam-results', requireRole('teacher', 'assistant'), checkViewPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  const {
    student_id, course_id, exam_id, stage,
    status, attempt,
    date_from, date_to,
    sort = 'date', order = 'desc',
    page = 1, limit = 50,
  } = req.query;

  try {
    const conditions = ['e.teacher_id = $1', 's.deleted_at IS NULL', 'er.is_latest = true'];
    const params = [teacherId];
    let p = 2;

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
      conditions.push(`er.score >= e.pass_score`);
    } else if (status === 'fail') {
      conditions.push(`er.score < e.pass_score`);
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

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const whereClause = conditions.map((c, i) => (i === 0 ? `WHERE ${c}` : `AND ${c}`)).join('\n      ');

    const countQ = await pool.query(
      `SELECT COUNT(*) as total
       FROM exam_results er
       JOIN exams e ON er.exam_id = e.id
       JOIN students s ON er.student_id = s.id
       JOIN courses c ON e.course_id = c.id
       ${whereClause}`,
      params
    );

    const dataQ = await pool.query(
      `SELECT
         er.id, er.score, er.correct_count, er.wrong_count, er.unanswered_count,
         er.points_earned, er.attempt_number, er.created_at,
         e.id AS exam_id, e.title AS exam_title, e.total_score, e.pass_score,
         e.course_id,
         c.name AS course_name,
         s.id AS student_id, s.name AS student_name, s.username AS student_username,
         s.academic_stage, s.phone AS student_phone
       FROM exam_results er
       JOIN exams e ON er.exam_id = e.id
       JOIN students s ON er.student_id = s.id
       JOIN courses c ON e.course_id = c.id
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
// Filters: student_id, recitation_id, stage, status (pass/fail),
//          date_from, date_to, sort, order, page, limit
router.get('/recitation-results', requireRole('teacher', 'assistant'), checkViewPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  const {
    student_id, recitation_id, stage,
    status,
    date_from, date_to,
    sort = 'date', order = 'desc',
    page = 1, limit = 50,
  } = req.query;

  try {
    const conditions = ['r.teacher_id = $1', 's.deleted_at IS NULL'];
    const params = [teacherId];
    let p = 2;

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

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
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
         s.academic_stage, s.phone AS student_phone
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

// ── GET /api/archive/filters ────────────────────────────────────────────────
// Returns all courses, exams, recitations, and academic stages for filter dropdowns
router.get('/filters', requireRole('teacher', 'assistant'), checkViewPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
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
// Full exam history for one student (for student detail page)
router.get('/student/:id/exam-results', requireRole('teacher', 'assistant'), checkViewPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
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
         er.points_earned, er.attempt_number, er.created_at, er.is_latest,
         e.id AS exam_id, e.title AS exam_title, e.total_score, e.pass_score,
         c.id AS course_id, c.name AS course_name
       FROM exam_results er
       JOIN exams e ON er.exam_id = e.id
       JOIN courses c ON e.course_id = c.id
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
router.get('/student/:id/recitation-results', requireRole('teacher', 'assistant'), checkViewPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
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
router.get('/student/:id/summary', requireRole('teacher', 'assistant'), checkViewPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  const studentId = parseParamId(req.params.id);
  if (!studentId) return res.status(400).json({ error: 'معرّف الطالب غير صالح' });

  try {
    const [studentQ, examStatsQ, recStatsQ] = await Promise.all([
      pool.query(
        'SELECT id, name, username, academic_stage, phone, points FROM students WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL',
        [studentId, teacherId]
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE er.is_latest=true) AS total_exams,
           COUNT(*) FILTER (WHERE er.is_latest=true AND er.score >= e.pass_score) AS passed_exams,
           COUNT(*) FILTER (WHERE er.is_latest=true AND er.score < e.pass_score) AS failed_exams,
           ROUND(AVG(er.score) FILTER (WHERE er.is_latest=true)::numeric, 1) AS avg_score
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
           ROUND(AVG(rr.score)::numeric, 1) AS avg_score
         FROM recitation_results rr
         JOIN recitations r ON rr.recitation_id=r.id
         WHERE rr.student_id=$1 AND r.teacher_id=$2`,
        [studentId, teacherId]
      ),
    ]);

    if (!studentQ.rows.length) return res.status(404).json({ error: 'الطالب غير موجود' });

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
