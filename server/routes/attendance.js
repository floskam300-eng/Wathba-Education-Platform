/**
 * Class Attendance Routes
 * Handles offline/in-person daily attendance tracking.
 * Completely separate from video-watch attendance (students.js /students/attendance).
 */
const express = require('express');
const pool    = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { logActivity, getActor, getIp } = require('../lib/activityLog');

const router = express.Router();
router.use(authenticate);

// ── Permission helper ─────────────────────────────────────────────────────────
// Teacher always passes. Assistant passes only if can_manage_attendance = true.
async function requireAttendancePerm(req, res, next) {
  if (req.user.role === 'teacher') return next();
  if (req.user.role === 'assistant') {
    try {
      const r = await pool.query(
        'SELECT can_manage_attendance, teacher_id FROM assistants WHERE id = $1',
        [req.user.id]
      );
      if (!r.rows.length || !r.rows[0].can_manage_attendance) {
        return res.status(403).json({ error: 'ليس لديك صلاحية إدارة الحضور والغياب' });
      }
      // Attach the teacher_id so subsequent queries are always scoped correctly
      req.attendanceTeacherId = r.rows[0].teacher_id;
      return next();
    } catch {
      return res.status(500).json({ error: 'Server error' });
    }
  }
  return res.status(403).json({ error: 'Access denied' });
}

// Resolve effective teacher ID (teacher = own id, assistant = parent teacher)
async function resolveTeacherId(req) {
  if (req.user.role === 'teacher') return req.user.id;
  if (req.attendanceTeacherId) return req.attendanceTeacherId;
  const r = await pool.query('SELECT teacher_id FROM assistants WHERE id=$1', [req.user.id]);
  return r.rows[0]?.teacher_id ?? null;
}

// ════════════════════════════════════════════════════════════════════
//  SUBJECTS  (المواد الدراسية)
// ════════════════════════════════════════════════════════════════════

// GET /attendance/subjects?stage=  — list all subjects (optionally filter by stage)
router.get('/subjects', requireRole('teacher', 'assistant'), requireAttendancePerm, async (req, res) => {
  try {
    const teacherId = await resolveTeacherId(req);
    const { stage } = req.query;
    const params = [teacherId];
    let whereExtra = '';
    if (stage) {
      params.push(stage);
      whereExtra = ` AND academic_stage = $${params.length}`;
    }
    const result = await pool.query(
      `SELECT id, name, academic_stage, created_at
       FROM class_subjects
       WHERE teacher_id = $1${whereExtra}
       ORDER BY academic_stage NULLS LAST, name`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('attendance/subjects GET:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /attendance/subjects — create a subject
router.post('/subjects', requireRole('teacher', 'assistant'), requireAttendancePerm, async (req, res) => {
  const { name, academic_stage } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'اسم المادة مطلوب' });
  try {
    const teacherId = await resolveTeacherId(req);
    const result = await pool.query(
      `INSERT INTO class_subjects (teacher_id, name, academic_stage)
       VALUES ($1, $2, $3)
       RETURNING id, name, academic_stage, created_at`,
      [teacherId, name.trim(), academic_stage?.trim() || null]
    );
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'create_subject',
      entity: { type: 'class_subject', id: result.rows[0].id, name: name.trim() },
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('attendance/subjects POST:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /attendance/subjects/:id — rename a subject
router.put('/subjects/:id', requireRole('teacher', 'assistant'), requireAttendancePerm, async (req, res) => {
  const subjectId = parseInt(req.params.id, 10);
  if (isNaN(subjectId)) return res.status(400).json({ error: 'معرّف غير صحيح' });
  const { name, academic_stage } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'اسم المادة مطلوب' });
  try {
    const teacherId = await resolveTeacherId(req);
    const result = await pool.query(
      `UPDATE class_subjects SET name=$1, academic_stage=$2
       WHERE id=$3 AND teacher_id=$4
       RETURNING id, name, academic_stage`,
      [name.trim(), academic_stage?.trim() || null, subjectId, teacherId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'المادة غير موجودة' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('attendance/subjects PUT:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /attendance/subjects/:id
router.delete('/subjects/:id', requireRole('teacher', 'assistant'), requireAttendancePerm, async (req, res) => {
  const subjectId = parseInt(req.params.id, 10);
  if (isNaN(subjectId)) return res.status(400).json({ error: 'معرّف غير صحيح' });
  try {
    const teacherId = await resolveTeacherId(req);
    const result = await pool.query(
      'DELETE FROM class_subjects WHERE id=$1 AND teacher_id=$2 RETURNING id, name',
      [subjectId, teacherId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'المادة غير موجودة' });
    res.json({ message: 'تم الحذف', name: result.rows[0].name });
  } catch (err) {
    console.error('attendance/subjects DELETE:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════
//  RECORDS  (سجلات الحضور اليومي)
// ════════════════════════════════════════════════════════════════════

/**
 * GET /attendance/records
 * Query: date (YYYY-MM-DD), subject_id, stage (optional student filter)
 *
 * Returns:
 *  {
 *    subject: { id, name, academic_stage },
 *    date: "2026-08-01",
 *    exam_total: number | null,   // shared total for this class on this date
 *    students: [
 *      { id, username, name, phone, academic_stage, status, exam_score, notes }
 *    ]
 *  }
 */
router.get('/records', requireRole('teacher', 'assistant'), requireAttendancePerm, async (req, res) => {
  const { date, subject_id, stage } = req.query;
  if (!date || !subject_id) return res.status(400).json({ error: 'date و subject_id مطلوبان' });

  try {
    const teacherId = await resolveTeacherId(req);

    // Validate subject belongs to teacher
    const subjectRes = await pool.query(
      'SELECT id, name, academic_stage FROM class_subjects WHERE id=$1 AND teacher_id=$2',
      [subject_id, teacherId]
    );
    if (!subjectRes.rows.length) return res.status(404).json({ error: 'المادة غير موجودة' });
    const subject = subjectRes.rows[0];

    // Build student query
    const stageFilter = stage || subject.academic_stage;
    const stageParams = [teacherId];
    let stageWhere = '';
    if (stageFilter) {
      stageParams.push(stageFilter);
      stageWhere = ` AND s.academic_stage = $${stageParams.length}`;
    }

    // Get all active students in this stage
    const studentsRes = await pool.query(
      `SELECT s.id, s.username, s.name, s.phone, s.academic_stage
       FROM students s
       WHERE s.teacher_id = $1${stageWhere} AND s.deleted_at IS NULL AND s.is_simulation IS NOT TRUE
       ORDER BY s.name`,
      stageParams
    );

    // Get existing attendance records for this subject+date
    const recordsRes = await pool.query(
      `SELECT student_id, status, exam_score, exam_total, notes
       FROM class_attendance_records
       WHERE subject_id=$1 AND attendance_date=$2 AND teacher_id=$3`,
      [subject_id, date, teacherId]
    );
    const recordMap = {};
    let sharedExamTotal = null;
    for (const r of recordsRes.rows) {
      recordMap[r.student_id] = r;
      if (r.exam_total !== null) sharedExamTotal = r.exam_total;
    }

    // Normalize NUMERIC exam_score (pg returns "8.00"-style strings) to JSON numbers
    const toScore = (v) => (v === null || v === undefined ? null : Number(v));

    const students = studentsRes.rows.map(s => ({
      ...s,
      status: recordMap[s.id]?.status ?? null,        // null = not recorded yet
      exam_score: toScore(recordMap[s.id]?.exam_score),
      notes: recordMap[s.id]?.notes ?? null,
    }));

    res.json({ subject, date, exam_total: sharedExamTotal, students });
  } catch (err) {
    console.error('attendance/records GET:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /attendance/records/bulk
 * Body: { date, subject_id, exam_total, records: [{ student_id, status, exam_score, notes }] }
 * Uses UPSERT inside a transaction to handle both create and update atomically.
 */
router.post('/records/bulk', requireRole('teacher', 'assistant'), requireAttendancePerm, async (req, res) => {
  const { date, subject_id, exam_total, records } = req.body;
  if (!date || !subject_id || !Array.isArray(records)) {
    return res.status(400).json({ error: 'date, subject_id, records مطلوبة' });
  }

  // Validate date format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'صيغة التاريخ غير صحيحة (YYYY-MM-DD)' });
  }

  // Prevent recording for future dates (compared against Egypt calendar date)
  const nowEgyptStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  if (date > nowEgyptStr) {
    return res.status(400).json({ error: 'لا يمكن تسجيل الحضور لتاريخ في المستقبل' });
  }

  if (records.length === 0) return res.json({ saved: 0 });

  const client = await pool.connect();
  try {
    const teacherId = await resolveTeacherId(req);

    // Validate subject ownership
    const subjectCheck = await client.query(
      'SELECT id FROM class_subjects WHERE id=$1 AND teacher_id=$2',
      [subject_id, teacherId]
    );
    if (!subjectCheck.rows.length) {
      client.release();
      return res.status(403).json({ error: 'المادة غير موجودة أو لا تملك صلاحية' });
    }

    // Validate exam_total if provided
    let examTotalVal = null;
    if (exam_total !== null && exam_total !== undefined && exam_total !== '') {
      examTotalVal = parseInt(exam_total, 10);
      if (isNaN(examTotalVal) || examTotalVal < 0) {
        client.release();
        return res.status(400).json({ error: 'الدرجة الكلية للامتحان يجب أن تكون رقماً أكبر من أو يساوي 0' });
      }
    }

    // Validate all student IDs belong to this teacher
    const studentIds = records.map(r => r.student_id);
    const studentCheck = await client.query(
      `SELECT id FROM students WHERE id = ANY($1::int[]) AND teacher_id=$2 AND deleted_at IS NULL AND is_simulation IS NOT TRUE`,
      [studentIds, teacherId]
    );
    if (studentCheck.rows.length !== studentIds.length) {
      client.release();
      return res.status(400).json({ error: 'بعض معرّفات الطلاب غير صحيحة' });
    }

    await client.query('BEGIN');

    // UPSERT each record
    let saved = 0;
    for (const r of records) {
      const status = ['present', 'absent'].includes(r.status) ? r.status : 'present';
      let examScore = null;

      // If absent, exam score must be null
      if (status === 'present' && r.exam_score !== null && r.exam_score !== undefined && r.exam_score !== '') {
        // Decimal grades are allowed (e.g. 13.5/20)
        examScore = Number(r.exam_score);
        if (!Number.isFinite(examScore) || examScore < 0) {
          await client.query('ROLLBACK');
          client.release();
          return res.status(400).json({ error: `درجة الامتحان غير صحيحة للطالب ID ${r.student_id}` });
        }
        // Guard against float precision junk (keep max 2 decimals)
        examScore = Math.round(examScore * 100) / 100;
        if (examTotalVal !== null && examScore > examTotalVal) {
          await client.query('ROLLBACK');
          client.release();
          return res.status(400).json({ error: `درجة الطالب (${examScore}) لا يمكن أن تتجاوز الدرجة الكلية (${examTotalVal})` });
        }
      }

      await client.query(
        `INSERT INTO class_attendance_records
           (teacher_id, student_id, subject_id, attendance_date, status, exam_score, exam_total, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (student_id, subject_id, attendance_date)
         DO UPDATE SET status=$5, exam_score=$6, exam_total=$7, notes=$8`,
        [teacherId, r.student_id, subject_id, date, status, examScore, examTotalVal, r.notes || null]
      );
      saved++;
    }

    await client.query('COMMIT');

    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'save_attendance',
      entity: { type: 'class_attendance', id: subject_id, name: `${date}` },
      details: { records_count: saved, date },
    });

    res.json({ saved });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('attendance/records/bulk POST:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ════════════════════════════════════════════════════════════════════
//  CALENDAR  — which dates have records for a given subject + month
// ════════════════════════════════════════════════════════════════════

// GET /attendance/calendar?subject_id=&year=2026&month=8
router.get('/calendar', requireRole('teacher', 'assistant'), requireAttendancePerm, async (req, res) => {
  const { subject_id, year, month } = req.query;
  if (!subject_id) return res.status(400).json({ error: 'subject_id مطلوب' });
  try {
    const teacherId = await resolveTeacherId(req);
    const y = parseInt(year, 10) || new Date().getFullYear();
    const m = parseInt(month, 10) || new Date().getMonth() + 1;

    if (m < 1 || m > 12) {
      return res.status(400).json({ error: 'الشهر غير صحيح' });
    }

    const daysInMonth = new Date(y, m, 0).getDate();
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const endDate   = `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const result = await pool.query(
      `SELECT DISTINCT attendance_date::text AS date
       FROM class_attendance_records
       WHERE subject_id=$1 AND teacher_id=$2
         AND attendance_date BETWEEN $3 AND $4
       ORDER BY date`,
      [subject_id, teacherId, startDate, endDate]
    );
    res.json(result.rows.map(r => r.date));
  } catch (err) {
    console.error('attendance/calendar GET:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════
//  ANALYTICS  — summary per student or per subject
// ════════════════════════════════════════════════════════════════════

/**
 * GET /attendance/analytics?subject_id=&stage=
 * Returns per-student summary: total sessions, present count, absent count, avg exam score
 */
router.get('/analytics', requireRole('teacher', 'assistant'), requireAttendancePerm, async (req, res) => {
  const { subject_id, stage } = req.query;
  try {
    const teacherId = await resolveTeacherId(req);
    const params = [teacherId];
    let subjectWhere = '';
    if (subject_id) {
      params.push(subject_id);
      subjectWhere = ` AND car.subject_id = $${params.length}`;
    }
    let stageWhere = '';
    if (stage) {
      params.push(stage);
      stageWhere = ` AND s.academic_stage = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT
         s.id,
         s.name,
         s.username,
         s.phone,
         s.academic_stage,
         cs.id   AS subject_id,
         cs.name AS subject_name,
         COUNT(car.id)                                    AS total_sessions,
         COUNT(car.id) FILTER (WHERE car.status='present') AS present_count,
         COUNT(car.id) FILTER (WHERE car.status='absent')  AS absent_count,
         ROUND(AVG(car.exam_score) FILTER (WHERE car.exam_score IS NOT NULL), 2) AS avg_exam_score
       FROM students s
       JOIN class_attendance_records car ON car.student_id = s.id ${subjectWhere}
       JOIN class_subjects cs ON cs.id = car.subject_id AND cs.teacher_id = $1
       WHERE s.teacher_id = $1 ${stageWhere} AND s.deleted_at IS NULL AND s.is_simulation IS NOT TRUE
       GROUP BY s.id, s.name, s.username, s.phone, s.academic_stage, cs.id, cs.name
       ORDER BY cs.name, s.name`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('attendance/analytics GET:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /attendance/stages — unique academic stages that have subjects
 */
router.get('/stages', requireRole('teacher', 'assistant'), requireAttendancePerm, async (req, res) => {
  try {
    const teacherId = await resolveTeacherId(req);
    // Also pull distinct student stages to allow filtering before any subjects are created
    const [subjectStages, studentStages] = await Promise.all([
      pool.query(
        'SELECT DISTINCT academic_stage FROM class_subjects WHERE teacher_id=$1 AND academic_stage IS NOT NULL ORDER BY academic_stage',
        [teacherId]
      ),
      pool.query(
        'SELECT DISTINCT academic_stage FROM students WHERE teacher_id=$1 AND deleted_at IS NULL AND is_simulation IS NOT TRUE AND academic_stage IS NOT NULL ORDER BY academic_stage',
        [teacherId]
      ),
    ]);
    const merged = [...new Set([
      ...subjectStages.rows.map(r => r.academic_stage),
      ...studentStages.rows.map(r => r.academic_stage),
    ])].sort();
    res.json(merged);
  } catch (err) {
    console.error('attendance/stages GET:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
