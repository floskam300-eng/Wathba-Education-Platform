const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { invalidateCache } = require('../lib/analyticsCache');
const { getPermissions } = require('../lib/permissionsCache');
const { validateStudent } = require('../middleware/validate');

const router = express.Router();
router.use(authenticate);

const getTeacherId = (req) => {
  if (req.user.role === 'teacher') return req.user.id;
  return req.user.teacher_id;
};

// ── Stage → username prefix map ──
const STAGE_PREFIXES = {
  'الصف الأول الثانوي':   'H',
  'الصف الثاني الثانوي':  'N',
  'الصف الثالث الثانوي':  'T',
  'الصف الأول الإعدادي':  'A',
  'الصف الثاني الإعدادي': 'B',
  'الصف الثالث الإعدادي': 'C',
  'جامعي':                 'U',
};

// Returns the next available username for a teacher + stage (e.g. H001, H002 …)
const generateUsername = async (teacherId, stage, dbPool) => {
  const prefix = STAGE_PREFIXES[stage] || 'S';
  // Fetch all usernames that match PREFIX followed by digits only
  const { rows } = await dbPool.query(
    `SELECT username FROM students
     WHERE teacher_id = $1 AND username ~ $2`,
    [teacherId, `^${prefix}[0-9]+$`]
  );
  let maxNum = 0;
  for (const row of rows) {
    const n = parseInt(row.username.slice(prefix.length), 10);
    if (!isNaN(n) && n > maxNum) maxNum = n;
  }
  return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
};

// ── Preview next username for a given stage ──
router.get('/next-username', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { stage } = req.query;
  if (!stage) return res.status(400).json({ error: 'stage is required' });
  try {
    const username = await generateUsername(teacherId, stage, pool);
    res.json({ username, prefix: STAGE_PREFIXES[stage] || 'S' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { search } = req.query;
  try {
    const params = [teacherId];
    let searchClause = '';
    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      searchClause = `AND (s.name ILIKE $2 OR s.username ILIKE $2 OR s.phone ILIKE $2)`;
    }
    const result = await pool.query(
      `SELECT s.*, COUNT(sce.course_id) as enrolled_courses
       FROM students s
       LEFT JOIN student_course_enrollment sce ON s.id = sce.student_id
       WHERE s.teacher_id = $1 AND s.deleted_at IS NULL ${searchClause}
       GROUP BY s.id ORDER BY s.created_at DESC`,
      params
    );
    res.json(result.rows.map(({ password: _, ...s }) => s));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

const checkPermission = async (req, res, next, perm) => {
  if (req.user.role === 'teacher') return next();
  try {
    const perms = await getPermissions(req.user.id, pool);
    if (!perms) return res.status(403).json({ error: 'Access denied' });
    if (!perms[perm]) return res.status(403).json({ error: 'Access denied: missing permission' });
    next();
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

router.post('/', requireRole('teacher', 'assistant'), (req, res, next) => checkPermission(req, res, next, 'can_add_students'), validateStudent, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { name, phone, parent_phone, academic_stage, gender } = req.body;
  // Auto-generate 6-digit numeric password
  const generatedPassword = Math.floor(100000 + Math.random() * 900000).toString();
  try {
    // Auto-generate username based on academic stage
    let username = await generateUsername(teacherId, academic_stage || '', pool);
    // Retry up to 5 times if race condition causes duplicate
    let retries = 0;
    while (retries < 5) {
      try {
        const hashed = await bcrypt.hash(generatedPassword, 10);
        const result = await pool.query(
          'INSERT INTO students (username,password,name,phone,parent_phone,academic_stage,gender,teacher_id,plain_password) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
          [username, hashed, name, phone, parent_phone, academic_stage, gender, teacherId, generatedPassword]
        );
        invalidateCache(teacherId);
        const { password: _, ...safe } = result.rows[0];
        return res.status(201).json({ ...safe, generated_password: generatedPassword });
      } catch (err) {
        if (err.code === '23505') {
          retries++;
          username = await generateUsername(teacherId, academic_stage || '', pool);
        } else {
          throw err;
        }
      }
    }
    res.status(409).json({ error: 'تعذّر توليد اسم مستخدم فريد، حاول مرة أخرى' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', requireRole('teacher', 'assistant'), (req, res, next) => checkPermission(req, res, next, 'can_edit_students'), validateStudent, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { name, phone, parent_phone, academic_stage, gender, password } = req.body;
  try {
    let query, params;
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      query = 'UPDATE students SET name=$1,phone=$2,parent_phone=$3,academic_stage=$4,gender=$5,password=$6 WHERE id=$7 AND teacher_id=$8 RETURNING *';
      params = [name, phone, parent_phone, academic_stage, gender, hashed, req.params.id, teacherId];
    } else {
      query = 'UPDATE students SET name=$1,phone=$2,parent_phone=$3,academic_stage=$4,gender=$5 WHERE id=$6 AND teacher_id=$7 RETURNING *';
      params = [name, phone, parent_phone, academic_stage, gender, req.params.id, teacherId];
    }
    const result = await pool.query(query, params);
    if (!result.rows.length) return res.status(404).json({ error: 'Student not found' });
    const { password: _, ...safe } = result.rows[0];
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', requireRole('teacher', 'assistant'), (req, res, next) => checkPermission(req, res, next, 'can_delete_students'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query(
      'UPDATE students SET deleted_at=NOW() WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL RETURNING id',
      [req.params.id, teacherId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Student not found' });
    invalidateCache(teacherId);
    res.json({ message: 'Student deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/results', requireRole('teacher', 'assistant'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT er.*, e.title as exam_title, e.total_score, e.pass_score
       FROM exam_results er JOIN exams e ON er.exam_id = e.id
       WHERE er.student_id = $1 ORDER BY er.created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Full student profile (for teacher/assistant analytics) ──
router.get('/:id/profile', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const studentId = req.params.id;
  try {
    // Student basic info
    const studentRes = await pool.query(
      `SELECT id, name, username, phone, parent_phone, academic_stage, gender, points, created_at
       FROM students WHERE id=$1 AND teacher_id=$2`,
      [studentId, teacherId]
    );
    if (!studentRes.rows.length) return res.status(404).json({ error: 'Student not found' });

    const [coursesRes, examsRes, paymentsRes, badgesRes, videoProgressRes] = await Promise.all([
      // Enrolled courses + content counts + watched video count
      pool.query(`
        SELECT c.id, c.name, c.description, c.price, c.target_stage,
               sce.enrollment_date, sce.status,
               COUNT(DISTINCT v.id) as total_videos,
               COUNT(DISTINCT p.id) as total_pdfs,
               COUNT(DISTINCT vp.video_id) as watched_videos,
               COALESCE(SUM(vp.watched_minutes), 0) as total_watched_minutes
        FROM student_course_enrollment sce
        JOIN courses c ON sce.course_id = c.id
        LEFT JOIN videos v ON v.course_id = c.id
        LEFT JOIN pdf_files p ON p.course_id = c.id
        LEFT JOIN video_progress vp ON vp.video_id = v.id AND vp.student_id = $1
        WHERE sce.student_id = $1
        GROUP BY c.id, sce.enrollment_date, sce.status
        ORDER BY sce.enrollment_date DESC
      `, [studentId]),

      // All exam results
      pool.query(`
        SELECT er.id, er.score, er.correct_count, er.wrong_count,
               er.unanswered_count, er.points_earned, er.created_at,
               e.title as exam_title, e.total_score, e.pass_score,
               c.name as course_name
        FROM exam_results er
        JOIN exams e ON er.exam_id = e.id
        LEFT JOIN courses c ON e.course_id = c.id
        WHERE er.student_id = $1
        ORDER BY er.created_at DESC
      `, [studentId]),

      // Payment history
      pool.query(`
        SELECT p.id, p.amount, p.method, p.payment_date, p.status,
               p.reference_number, p.notes,
               c.name as course_name
        FROM payments p
        LEFT JOIN courses c ON p.course_id = c.id
        WHERE p.student_id = $1
        ORDER BY p.payment_date DESC
      `, [studentId]),

      // Badges
      pool.query(`
        SELECT b.*, e.title as exam_title
        FROM badges b
        LEFT JOIN exams e ON b.exam_id = e.id
        WHERE b.student_id = $1
        ORDER BY b.earned_at DESC
      `, [studentId]),

      // Video progress summary
      pool.query(`
        SELECT vp.*, v.title as video_title, v.duration_minutes, c.name as course_name
        FROM video_progress vp
        JOIN videos v ON vp.video_id = v.id
        JOIN courses c ON v.course_id = c.id
        WHERE vp.student_id = $1
        ORDER BY vp.last_watched_at DESC
      `, [studentId]),
    ]);

    res.json({
      student: studentRes.rows[0],
      courses: coursesRes.rows,
      examResults: examsRes.rows,
      payments: paymentsRes.rows,
      badges: badgesRes.rows,
      videoProgress: videoProgressRes.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Full stats for the logged-in student themselves ──
router.get('/me/stats', requireRole('student'), async (req, res) => {
  const studentId = req.user.id;
  try {
    const [studentRes, coursesRes, examsRes, paymentsRes, badgesRes, videoProgressRes, rankRes] = await Promise.all([
      pool.query(
        `SELECT id, name, username, phone, parent_phone, academic_stage, gender, points, created_at
         FROM students WHERE id=$1`, [studentId]
      ),
      pool.query(`
        SELECT c.id, c.name, c.description, c.price, c.target_stage,
               sce.enrollment_date, sce.status,
               COUNT(DISTINCT v.id)::int  AS total_videos,
               COUNT(DISTINCT pf.id)::int AS total_pdfs,
               COUNT(DISTINCT vp.video_id)::int AS watched_videos,
               COALESCE(SUM(vp.watched_minutes),0)::int AS total_watched_minutes,
               COALESCE(AVG(vp.progress_percentage),0)::numeric(5,1) AS avg_progress
        FROM student_course_enrollment sce
        JOIN courses c ON sce.course_id = c.id
        LEFT JOIN videos v  ON v.course_id = c.id
        LEFT JOIN pdf_files pf ON pf.course_id = c.id
        LEFT JOIN video_progress vp ON vp.video_id = v.id AND vp.student_id = $1
        WHERE sce.student_id = $1
        GROUP BY c.id, sce.enrollment_date, sce.status
        ORDER BY sce.enrollment_date DESC
      `, [studentId]),
      pool.query(`
        SELECT er.id, er.score, er.correct_count, er.wrong_count,
               er.unanswered_count, er.points_earned, er.start_time, er.end_time, er.created_at,
               e.title AS exam_title, e.total_score, e.pass_score, e.badge_name, e.badge_color,
               c.name  AS course_name
        FROM exam_results er
        JOIN exams e ON er.exam_id = e.id
        LEFT JOIN courses c ON e.course_id = c.id
        WHERE er.student_id = $1
        ORDER BY er.created_at DESC
      `, [studentId]),
      pool.query(`
        SELECT p.id, p.amount, p.method, p.payment_date, p.status,
               p.reference_number, p.notes, c.name AS course_name, c.price AS course_price
        FROM payments p
        LEFT JOIN courses c ON p.course_id = c.id
        WHERE p.student_id = $1
        ORDER BY p.payment_date DESC
      `, [studentId]),
      pool.query(`
        SELECT b.*, e.title AS exam_title
        FROM badges b LEFT JOIN exams e ON b.exam_id = e.id
        WHERE b.student_id = $1 ORDER BY b.earned_at DESC
      `, [studentId]),
      pool.query(`
        SELECT vp.video_id, vp.watch_count, vp.watched_minutes, vp.progress_percentage, vp.last_watched_at,
               v.title AS video_title, v.duration_minutes, c.name AS course_name
        FROM video_progress vp
        JOIN videos v ON vp.video_id = v.id
        JOIN courses c ON v.course_id = c.id
        WHERE vp.student_id = $1
        ORDER BY vp.last_watched_at DESC
      `, [studentId]),
      pool.query(`
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN points > (SELECT points FROM students WHERE id=$1) THEN 1 ELSE 0 END) AS above
        FROM students WHERE teacher_id = (SELECT teacher_id FROM students WHERE id=$1)
      `, [studentId]),
    ]);

    if (!studentRes.rows.length) return res.status(404).json({ error: 'Student not found' });

    const student   = studentRes.rows[0];
    const exams     = examsRes.rows;
    const payments  = paymentsRes.rows;

    // Aggregate totals
    const totalPaid    = payments.filter(p => p.status === 'verified').reduce((s, p) => s + parseFloat(p.amount), 0);
    const totalPending = payments.filter(p => p.status === 'pending').reduce((s, p) => s + parseFloat(p.amount), 0);
    const passCount    = exams.filter(e => e.score >= e.pass_score).length;
    const avgScore     = exams.length ? Math.round(exams.reduce((s, e) => s + (e.score / e.total_score * 100), 0) / exams.length) : 0;
    const totalWatchedMinutes = videoProgressRes.rows.reduce((s, v) => s + v.watched_minutes, 0);

    // Rank among teacher's students by points
    const rankRow  = rankRes.rows[0];
    const myRank   = parseInt(rankRow.total) - parseInt(rankRow.above);

    res.json({
      student,
      courses: coursesRes.rows,
      examResults: exams,
      payments,
      badges: badgesRes.rows,
      videoProgress: videoProgressRes.rows,
      summary: {
        totalPaid,
        totalPending,
        totalExams: exams.length,
        passCount,
        failCount: exams.length - passCount,
        avgScore,
        totalWatchedMinutes,
        totalCourses: coursesRes.rows.length,
        totalBadges: badgesRes.rows.length,
        rank: myRank,
        totalStudents: parseInt(rankRow.total),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/bulk', requireRole('teacher', 'assistant'), (req, res, next) => checkPermission(req, res, next, 'can_add_students'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { students } = req.body;
  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ error: 'No students provided' });
  }
  const MAX_BULK = 200;
  if (students.length > MAX_BULK) {
    return res.status(400).json({ error: `الحد الأقصى للاستيراد الجماعي هو ${MAX_BULK} طالب في المرة الواحدة` });
  }
  const results = { success: 0, failed: 0, errors: [], created: [] };
  for (const s of students) {
    const name           = (s['الاسم'] || s['name'] || '').toString().trim();
    const manualUsername = (s['اسم المستخدم'] || s['username'] || '').toString().trim();
    const manualPassword = (s['كلمة المرور'] || s['password'] || '').toString().trim();
    const phone          = (s['الهاتف'] || s['phone'] || '').toString().trim() || null;
    const parent_phone   = (s['هاتف ولي الأمر'] || s['parent_phone'] || '').toString().trim() || null;
    const academic_stage = (s['المرحلة'] || s['academic_stage'] || '').toString().trim() || null;
    const gender         = (s['الجنس'] || s['gender'] || '').toString().trim() || null;

    if (!name) {
      results.failed++;
      results.errors.push(`(صف فارغ): الاسم مطلوب`);
      continue;
    }

    // Auto-generate password if not supplied
    const finalPassword = manualPassword || Math.floor(100000 + Math.random() * 900000).toString();

    try {
      // Use manual username if provided, otherwise auto-generate
      let username = manualUsername || await generateUsername(teacherId, academic_stage || '', pool);

      // Retry up to 5 times on username collision
      let retries = 0;
      while (retries < 5) {
        try {
          const hashed = await bcrypt.hash(finalPassword, 10);
          await pool.query(
            'INSERT INTO students (username,password,name,phone,parent_phone,academic_stage,gender,teacher_id,plain_password) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
            [username, hashed, name, phone, parent_phone, academic_stage, gender, teacherId, finalPassword]
          );
          results.success++;
          // Only report generated credentials (not user-supplied ones)
          if (!manualPassword || !manualUsername) {
            results.created.push({ name, username, generated_password: finalPassword });
          }
          break;
        } catch (err) {
          if (err.code === '23505' && !manualUsername) {
            retries++;
            username = await generateUsername(teacherId, academic_stage || '', pool);
          } else {
            throw err;
          }
        }
      }
      if (retries >= 5) {
        results.failed++;
        results.errors.push(`${name}: تعذّر توليد اسم مستخدم فريد`);
      }
    } catch (err) {
      results.failed++;
      results.errors.push(`${name}: ${err.code === '23505' ? 'اسم المستخدم موجود مسبقاً' : 'خطأ في الحفظ'}`);
    }
  }
  res.json(results);
});

// ── Save video progress ──
router.post('/me/video-progress', requireRole('student'), async (req, res) => {
  const studentId = req.user.id;
  const { video_id, watched_minutes, progress_percentage, watch_count_increment } = req.body;
  if (!video_id) return res.status(400).json({ error: 'video_id required' });
  try {
    await pool.query(
      `INSERT INTO video_progress (student_id, video_id, watch_count, watched_minutes, progress_percentage, last_watched_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (student_id, video_id) DO UPDATE SET
         watch_count = CASE WHEN $3 > 0 THEN video_progress.watch_count + $3 ELSE video_progress.watch_count END,
         watched_minutes = GREATEST(video_progress.watched_minutes, $4),
         progress_percentage = GREATEST(video_progress.progress_percentage, $5),
         last_watched_at = NOW()`,
      [studentId, video_id, watch_count_increment || 0, watched_minutes || 0, progress_percentage || 0]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me/dashboard', requireRole('student'), async (req, res) => {
  const studentId = req.user.id;
  try {
    const [enrollments, results, progress, badges] = await Promise.all([
      pool.query('SELECT sce.*, c.name, c.description, c.thumbnail_url FROM student_course_enrollment sce JOIN courses c ON sce.course_id=c.id WHERE sce.student_id=$1', [studentId]),
      pool.query('SELECT er.*, e.title as exam_title, e.total_score, e.pass_score FROM exam_results er JOIN exams e ON er.exam_id=e.id WHERE er.student_id=$1 ORDER BY er.created_at DESC LIMIT 5', [studentId]),
      pool.query('SELECT vp.*, v.title FROM video_progress vp JOIN videos v ON vp.video_id=v.id WHERE vp.student_id=$1', [studentId]),
      pool.query('SELECT * FROM badges WHERE student_id=$1 ORDER BY earned_at DESC', [studentId]),
    ]);
    const student = await pool.query('SELECT id,name,points,academic_stage,gender FROM students WHERE id=$1', [studentId]);
    res.json({ student: student.rows[0], enrollments: enrollments.rows, recentResults: results.rows, videoProgress: progress.rows, badges: badges.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me/notifications', requireRole('student'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, message, type, is_read, sent_at
       FROM notification_log
       WHERE student_id = $1
       ORDER BY sent_at DESC LIMIT 30`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/me/notifications/:id/read', requireRole('student'), async (req, res) => {
  try {
    await pool.query(
      'UPDATE notification_log SET is_read=true WHERE id=$1 AND student_id=$2',
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/me/notifications/read-all', requireRole('student'), async (req, res) => {
  try {
    await pool.query(
      'UPDATE notification_log SET is_read=true WHERE student_id=$1',
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/attendance/:courseId', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { courseId } = req.params;
  try {
    const courseCheck = await pool.query(
      'SELECT id, name FROM courses WHERE id=$1 AND teacher_id=$2',
      [courseId, teacherId]
    );
    if (!courseCheck.rows.length) return res.status(403).json({ error: 'Access denied' });

    const [students, videos, progress] = await Promise.all([
      pool.query(
        `SELECT s.id, s.name, s.academic_stage
         FROM students s
         JOIN student_course_enrollment sce ON s.id = sce.student_id
         WHERE sce.course_id = $1
         ORDER BY s.name`,
        [courseId]
      ),
      pool.query(
        `SELECT id, title, duration_minutes, sort_order
         FROM videos WHERE course_id=$1 ORDER BY sort_order, id`,
        [courseId]
      ),
      pool.query(
        `SELECT vp.student_id, vp.video_id, vp.progress_percentage, vp.watched_minutes, vp.watch_count
         FROM video_progress vp
         JOIN videos v ON vp.video_id = v.id
         WHERE v.course_id = $1`,
        [courseId]
      ),
    ]);

    const progressMap = {};
    progress.rows.forEach(p => {
      if (!progressMap[p.student_id]) progressMap[p.student_id] = {};
      progressMap[p.student_id][p.video_id] = {
        progress_percentage: parseFloat(p.progress_percentage),
        watched_minutes: p.watched_minutes,
        watch_count: p.watch_count,
      };
    });

    res.json({
      course: courseCheck.rows[0],
      students: students.rows,
      videos: videos.rows,
      progressMap,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
