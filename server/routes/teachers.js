const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const { getCached, setCache, invalidateCache } = require('../lib/analyticsCache');

router.get('/dashboard', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  try {
    const [students, courses, exams, assistants, payments] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM students WHERE teacher_id = $1', [teacherId]),
      pool.query('SELECT COUNT(*) FROM courses WHERE teacher_id = $1', [teacherId]),
      pool.query('SELECT COUNT(*) FROM exams WHERE teacher_id = $1', [teacherId]),
      pool.query('SELECT COUNT(*) FROM assistants WHERE teacher_id = $1', [teacherId]),
      pool.query("SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status='verified' AND student_id IN (SELECT id FROM students WHERE teacher_id=$1)", [teacherId]),
    ]);
    res.json({
      totalStudents: parseInt(students.rows[0].count),
      totalCourses: parseInt(courses.rows[0].count),
      totalExams: parseInt(exams.rows[0].count),
      totalAssistants: parseInt(assistants.rows[0].count),
      totalRevenue: parseFloat(payments.rows[0].total),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/profile', requireRole('teacher'), async (req, res) => {
  const { name, bio, classification, logo_url, photo_url, whatsapp_phone } = req.body;
  try {
    const result = await pool.query(
      'UPDATE teachers SET name=$1, bio=$2, classification=$3, logo_url=$4, photo_url=$5, whatsapp_phone=$6 WHERE id=$7 RETURNING *',
      [name, bio, classification, logo_url, photo_url, whatsapp_phone, req.user.id]
    );
    const { password: _, ...safe } = result.rows[0];
    res.json(safe);
  } catch (err) {
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

    const topStudents = await pool.query(`
      SELECT s.id, s.name, s.username, s.points, s.academic_stage, s.gender,
             COUNT(er.id) as exams_taken,
             COALESCE(ROUND(AVG(er.score::numeric / NULLIF(e.total_score,0) * 100), 1), 0) as avg_score
      FROM students s
      LEFT JOIN exam_results er ON s.id = er.student_id
      LEFT JOIN exams e ON er.exam_id = e.id
      WHERE s.teacher_id = $1 AND s.deleted_at IS NULL
      GROUP BY s.id, s.name, s.username, s.points, s.academic_stage, s.gender
      ORDER BY s.points DESC LIMIT 20
    `, [teacherId]);

    const recentResults = await pool.query(`
      SELECT er.id, er.student_id, er.score, er.correct_count, er.wrong_count,
             er.unanswered_count, er.created_at,
             s.name as student_name, s.academic_stage,
             e.title as exam_title, e.total_score, e.pass_score
      FROM exam_results er
      JOIN students s ON er.student_id = s.id
      JOIN exams e ON er.exam_id = e.id
      WHERE e.teacher_id = $1
      ORDER BY er.created_at DESC LIMIT 30
    `, [teacherId]);

    const result = { examResults: examResults.rows, topStudents: topStudents.rows, recentResults: recentResults.rows };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/analytics/wrong-questions', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = req.user.role === 'teacher' ? req.user.id : req.user.teacher_id;
  try {
    const result = await pool.query(`
      SELECT
        e.id   AS exam_id,
        e.title AS exam_title,
        q.id   AS question_id,
        q.question_text,
        q.option_a, q.option_b, q.option_c, q.option_d,
        q.correct_answer_letter,
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
      JOIN questions q ON q.id = (ans->>'question_id')::integer
      WHERE e.teacher_id = $1
        AND (ans->>'question_type' = 'mcq' OR ans->>'question_type' IS NULL OR ans->>'question_type' = '')
        AND ans->>'is_correct' IS NOT NULL
      GROUP BY e.id, e.title, q.id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer_letter
      HAVING COUNT(*) > 0
      ORDER BY e.id, wrong_pct DESC, wrong_count DESC
    `, [teacherId]);

    const full = req.query.full === 'true';
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
    res.json(Object.values(byExam));
  } catch (err) {
    console.error('wrong-questions error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/analytics/trend', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const months = parseInt(req.query.months) || 6;
  const cacheKey = `t${teacherId}_trend_${months}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);
  try {
    const intervalClause = months > 0
      ? `AND er.created_at >= NOW() - INTERVAL '${months} months'`
      : '';
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
      WHERE e.teacher_id = $1
        ${intervalClause}
      GROUP BY DATE_TRUNC('month', er.created_at)
      ORDER BY DATE_TRUNC('month', er.created_at) ASC
    `, [teacherId]);
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
             COALESCE(ROUND(AVG(vp.progress_percentage)::numeric, 0), 0)::int AS avg_progress,
             COUNT(DISTINCT CASE WHEN vp.progress_percentage >= 80 THEN vp.student_id END)::int AS active_students
      FROM courses c
      LEFT JOIN student_course_enrollment sce ON c.id = sce.course_id
      LEFT JOIN videos v  ON v.course_id = c.id
      LEFT JOIN video_progress vp ON v.id = vp.video_id
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
      pool.query('SELECT id,username,name,phone,parent_phone,academic_stage,gender,points,plain_password,created_at FROM students WHERE teacher_id=$1 AND deleted_at IS NULL ORDER BY name', [teacherId]),
      pool.query('SELECT * FROM courses WHERE teacher_id=$1 ORDER BY created_at', [teacherId]),
      pool.query('SELECT s.* FROM sections s JOIN courses c ON s.course_id=c.id WHERE c.teacher_id=$1 ORDER BY s.course_id, s.sort_order', [teacherId]),
      pool.query('SELECT v.* FROM videos v JOIN courses c ON v.course_id=c.id WHERE c.teacher_id=$1 ORDER BY v.course_id, v.sort_order, v.id', [teacherId]),
      pool.query('SELECT p.* FROM pdf_files p JOIN courses c ON p.course_id=c.id WHERE c.teacher_id=$1 ORDER BY p.course_id, p.id', [teacherId]),
      pool.query('SELECT * FROM exams WHERE teacher_id=$1 ORDER BY created_at', [teacherId]),
      pool.query('SELECT q.* FROM questions q JOIN exams e ON q.exam_id=e.id WHERE e.teacher_id=$1 ORDER BY q.exam_id, q.id', [teacherId]),
      pool.query(`SELECT er.id, er.student_id, er.exam_id, er.score, er.correct_count, er.wrong_count,
                         er.unanswered_count, er.points_earned, er.start_time, er.end_time, er.answers, er.created_at
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

  try {
    // 1. Import courses
    for (const c of (data.courses || [])) {
      try {
        const r = await pool.query(
          `INSERT INTO courses (name,description,price,thumbnail_url,teacher_id,target_stage,is_free,created_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [c.name, c.description || null, c.price || 0, c.thumbnail_url || null, teacherId,
           c.target_stage || null, c.is_free || false, c.created_at || new Date()]
        );
        courseMap[c.id] = r.rows[0].id;
        stats.courses++;
      } catch (e) {
        stats.errors.push(`كورس "${c.name}": ${e.message}`);
      }
    }

    // 2. Import sections
    for (const s of (data.sections || [])) {
      const newCourseId = courseMap[s.course_id];
      if (!newCourseId) continue;
      try {
        const r = await pool.query(
          `INSERT INTO sections (course_id,title,sort_order,created_at) VALUES($1,$2,$3,$4) RETURNING id`,
          [newCourseId, s.title, s.sort_order || 0, s.created_at || new Date()]
        );
        sectionMap[s.id] = r.rows[0].id;
        stats.sections++;
      } catch (e) { /* silent */ }
    }

    // 3. Import videos
    for (const v of (data.videos || [])) {
      const newCourseId = courseMap[v.course_id];
      if (!newCourseId) continue;
      try {
        await pool.query(
          `INSERT INTO videos (title,file_path_or_url,duration_minutes,course_id,sort_order,section_id,created_at)
           VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [v.title, v.file_path_or_url || null, v.duration_minutes || 0, newCourseId,
           v.sort_order || 0, v.section_id ? (sectionMap[v.section_id] || null) : null, v.created_at || new Date()]
        );
        stats.videos++;
      } catch (e) { /* silent */ }
    }

    // 4. Import PDFs
    for (const p of (data.pdfs || [])) {
      const newCourseId = courseMap[p.course_id];
      if (!newCourseId) continue;
      try {
        await pool.query(
          `INSERT INTO pdf_files (title,file_url,course_id,section_id,created_at) VALUES($1,$2,$3,$4,$5)`,
          [p.title, p.file_url || null, newCourseId,
           p.section_id ? (sectionMap[p.section_id] || null) : null, p.created_at || new Date()]
        );
        stats.pdfs++;
      } catch (e) { /* silent */ }
    }

    // 5. Import exams
    for (const e of (data.exams || [])) {
      try {
        const newCourseId = e.course_id ? (courseMap[e.course_id] || null) : null;
        const r = await pool.query(
          `INSERT INTO exams (title,duration_minutes,total_score,course_id,teacher_id,pass_score,badge_name,badge_color,start_date,end_date,created_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [e.title, e.duration_minutes || 60, e.total_score || 100, newCourseId, teacherId,
           e.pass_score ?? 50, e.badge_name || null, e.badge_color || '#FF8C00',
           e.start_date || null, e.end_date || null, e.created_at || new Date()]
        );
        examMap[e.id] = r.rows[0].id;
        stats.exams++;
      } catch (e2) {
        stats.errors.push(`اختبار "${e.title}": ${e2.message}`);
      }
    }

    // 6. Import questions
    for (const q of (data.questions || [])) {
      const newExamId = examMap[q.exam_id];
      if (!newExamId) continue;
      try {
        await pool.query(
          `INSERT INTO questions (question_text,question_image_url,option_a,option_b,option_c,option_d,
             correct_answer_letter,points,exam_id,question_type,essay_answer_key)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [q.question_text, q.question_image_url || null, q.option_a || '-', q.option_b || '-',
           q.option_c || null, q.option_d || null, q.correct_answer_letter || 'A',
           q.points || 1, newExamId, q.question_type || 'mcq', q.essay_answer_key || null]
        );
        stats.questions++;
      } catch (e) { /* silent */ }
    }

    // 7. Import students
    for (const s of (data.students || [])) {
      try {
        // If username already exists under this teacher, just remap
        const existing = await pool.query(
          'SELECT id FROM students WHERE username=$1 AND teacher_id=$2 AND deleted_at IS NULL',
          [s.username, teacherId]
        );
        if (existing.rows.length > 0) {
          studentMap[s.id] = existing.rows[0].id;
          stats.skipped_students++;
          continue;
        }
        const plainPwd = s.plain_password || Math.floor(100000 + Math.random() * 900000).toString();
        const hashed = await bcrypt.hash(plainPwd, 10);
        const r = await pool.query(
          `INSERT INTO students (username,password,name,phone,parent_phone,academic_stage,gender,
             teacher_id,points,plain_password,created_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [s.username, hashed, s.name, s.phone || null, s.parent_phone || null,
           s.academic_stage || null, s.gender || null, teacherId,
           s.points || 0, plainPwd, s.created_at || new Date()]
        );
        studentMap[s.id] = r.rows[0].id;
        stats.students++;
      } catch (e) {
        stats.errors.push(`طالب "${s.name}": ${e.message}`);
      }
    }

    // 8. Import enrollments
    for (const e of (data.enrollments || [])) {
      const newStudentId = studentMap[e.student_id];
      const newCourseId  = courseMap[e.course_id];
      if (!newStudentId || !newCourseId) continue;
      try {
        await pool.query(
          `INSERT INTO student_course_enrollment (student_id,course_id,enrollment_date,status)
           VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [newStudentId, newCourseId, e.enrollment_date || new Date(), e.status || 'active']
        );
        stats.enrollments++;
      } catch (e2) { /* silent */ }
    }

    // 9. Import payments
    for (const p of (data.payments || [])) {
      const newStudentId = studentMap[p.student_id];
      if (!newStudentId) continue;
      try {
        await pool.query(
          `INSERT INTO payments (student_id,course_id,amount,method,payment_date,status,reference_number,notes)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [newStudentId, p.course_id ? (courseMap[p.course_id] || null) : null,
           p.amount, p.method || 'Cash', p.payment_date || new Date(),
           p.status || 'pending', p.reference_number || null, p.notes || null]
        );
        stats.payments++;
      } catch (e) { /* silent */ }
    }

    // 10. Import exam results
    for (const r of (data.exam_results || [])) {
      const newStudentId = studentMap[r.student_id];
      const newExamId    = examMap[r.exam_id];
      if (!newStudentId || !newExamId) continue;
      try {
        await pool.query(
          `INSERT INTO exam_results (student_id,exam_id,score,correct_count,wrong_count,
             unanswered_count,start_time,end_time,answers,points_earned,created_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [newStudentId, newExamId, r.score || 0, r.correct_count || 0,
           r.wrong_count || 0, r.unanswered_count || 0,
           r.start_time || null, r.end_time || null,
           r.answers ? JSON.stringify(r.answers) : null,
           r.points_earned || 0, r.created_at || new Date()]
        );
        stats.results++;
      } catch (e) { /* silent */ }
    }

    invalidateCache(teacherId);
    res.json({ success: true, stats });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: 'حدث خطأ أثناء الاستيراد', details: err.message });
  }
});

module.exports = router;
