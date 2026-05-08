const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const getTeacherId = (req) => req.user.role === 'teacher' ? req.user.id : req.user.teacher_id;

// ── Helper: verify course belongs to teacher ──
const verifyCoursOwnership = async (courseId, teacherId) => {
  const r = await pool.query('SELECT id FROM courses WHERE id=$1 AND teacher_id=$2', [courseId, teacherId]);
  return r.rows.length > 0;
};

// ── Multer storage ──
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/videos');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `vid_${Date.now()}${ext}`);
  },
});
const pdfStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/pdfs');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `pdf_${Date.now()}.pdf`);
  },
});
const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Only video files allowed'));
  },
});
const uploadPdf = multer({
  storage: pdfStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files allowed'));
  },
});

// ── List courses (scoped to teacher) ──
router.get('/', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query(
      `SELECT c.*, COUNT(DISTINCT sce.student_id) as enrolled_count,
              COUNT(DISTINCT v.id) as video_count, COUNT(DISTINCT p.id) as pdf_count
       FROM courses c
       LEFT JOIN student_course_enrollment sce ON c.id = sce.course_id
       LEFT JOIN videos v ON c.id = v.course_id
       LEFT JOIN pdf_files p ON c.id = p.course_id
       WHERE c.teacher_id = $1
       GROUP BY c.id ORDER BY c.created_at DESC`,
      [teacherId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Create course ──
router.post('/', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { name, description, price, thumbnail_url, target_stage } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO courses (name,description,price,thumbnail_url,teacher_id,target_stage) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
      [name, description, price || 0, thumbnail_url, teacherId, target_stage || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Update course ──
router.put('/:id', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { name, description, price, thumbnail_url, target_stage } = req.body;
  try {
    const result = await pool.query(
      'UPDATE courses SET name=$1,description=$2,price=$3,thumbnail_url=$4,target_stage=$5 WHERE id=$6 AND teacher_id=$7 RETURNING *',
      [name, description, price, thumbnail_url, target_stage || null, req.params.id, teacherId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Course not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Delete course ──
router.delete('/:id', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query('DELETE FROM courses WHERE id=$1 AND teacher_id=$2 RETURNING id', [req.params.id, teacherId]);
    if (!result.rows.length) return res.status(404).json({ error: 'Course not found' });
    res.json({ message: 'Course deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Course content — FIXED: check enrollment for students, ownership for staff ──
router.get('/:id/content', authenticate, async (req, res) => {
  const courseId = req.params.id;
  try {
    if (req.user.role === 'student') {
      // Student must be enrolled in this course
      const enrollment = await pool.query(
        'SELECT id FROM student_course_enrollment WHERE student_id=$1 AND course_id=$2',
        [req.user.id, courseId]
      );
      if (!enrollment.rows.length) {
        return res.status(403).json({ error: 'Access denied: you are not enrolled in this course' });
      }
    } else {
      // Teacher or assistant must own the course
      const teacherId = getTeacherId(req);
      if (!(await verifyCoursOwnership(courseId, teacherId))) {
        return res.status(403).json({ error: 'Access denied: course not yours' });
      }
    }

    const [videos, pdfs, exams, sections] = await Promise.all([
      pool.query('SELECT * FROM videos WHERE course_id=$1 ORDER BY sort_order, id', [courseId]),
      pool.query('SELECT * FROM pdf_files WHERE course_id=$1 ORDER BY id', [courseId]),
      pool.query('SELECT id,title,duration_minutes,total_score,pass_score FROM exams WHERE course_id=$1', [courseId]),
      pool.query('SELECT * FROM sections WHERE course_id=$1 ORDER BY sort_order, id', [courseId]),
    ]);
    res.json({ videos: videos.rows, pdfs: pdfs.rows, exams: exams.rows, sections: sections.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Sections CRUD — FIXED: verify course ownership ──
router.post('/:id/sections', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { title } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
  try {
    if (!(await verifyCoursOwnership(req.params.id, teacherId))) {
      return res.status(403).json({ error: 'Access denied: course not yours' });
    }
    const maxOrder = await pool.query('SELECT COALESCE(MAX(sort_order),0) AS m FROM sections WHERE course_id=$1', [req.params.id]);
    const result = await pool.query(
      'INSERT INTO sections (course_id,title,sort_order) VALUES($1,$2,$3) RETURNING *',
      [req.params.id, title.trim(), parseInt(maxOrder.rows[0].m) + 1]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.put('/:id/sections/:sectionId', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { title } = req.body;
  try {
    if (!(await verifyCoursOwnership(req.params.id, teacherId))) {
      return res.status(403).json({ error: 'Access denied: course not yours' });
    }
    const result = await pool.query(
      'UPDATE sections SET title=$1 WHERE id=$2 AND course_id=$3 RETURNING *',
      [title, req.params.sectionId, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Section not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.delete('/:id/sections/:sectionId', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    if (!(await verifyCoursOwnership(req.params.id, teacherId))) {
      return res.status(403).json({ error: 'Access denied: course not yours' });
    }
    await pool.query('UPDATE videos SET section_id=NULL WHERE section_id=$1', [req.params.sectionId]);
    await pool.query('UPDATE pdf_files SET section_id=NULL WHERE section_id=$1', [req.params.sectionId]);
    await pool.query('DELETE FROM sections WHERE id=$1 AND course_id=$2', [req.params.sectionId, req.params.id]);
    res.json({ message: 'Section deleted' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ── Move video/PDF to section — FIXED: verify course ownership ──
router.put('/:id/videos/:videoId/section', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { section_id } = req.body;
  try {
    if (!(await verifyCoursOwnership(req.params.id, teacherId))) {
      return res.status(403).json({ error: 'Access denied: course not yours' });
    }
    await pool.query('UPDATE videos SET section_id=$1 WHERE id=$2 AND course_id=$3', [section_id || null, req.params.videoId, req.params.id]);
    res.json({ message: 'Updated' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.put('/:id/pdfs/:pdfId/section', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { section_id } = req.body;
  try {
    if (!(await verifyCoursOwnership(req.params.id, teacherId))) {
      return res.status(403).json({ error: 'Access denied: course not yours' });
    }
    await pool.query('UPDATE pdf_files SET section_id=$1 WHERE id=$2 AND course_id=$3', [section_id || null, req.params.pdfId, req.params.id]);
    res.json({ message: 'Updated' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ── Video upload — FIXED: verify course ownership ──
router.post('/:id/videos/upload', requireRole('teacher', 'assistant'), uploadVideo.single('video'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    if (!req.file) return res.status(400).json({ error: 'No video file uploaded' });
    if (!(await verifyCoursOwnership(req.params.id, teacherId))) {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: 'Access denied: course not yours' });
    }
    const { title, duration_minutes, sort_order, section_id } = req.body;
    const filePath = `/uploads/videos/${req.file.filename}`;
    const result = await pool.query(
      'INSERT INTO videos (title,file_path_or_url,duration_minutes,course_id,sort_order,section_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
      [title || req.file.originalname, filePath, parseInt(duration_minutes) || 0, req.params.id, parseInt(sort_order) || 0, section_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PDF upload — FIXED: verify course ownership ──
router.post('/:id/pdfs/upload', requireRole('teacher', 'assistant'), uploadPdf.single('pdf'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });
    if (!(await verifyCoursOwnership(req.params.id, teacherId))) {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: 'Access denied: course not yours' });
    }
    const { title, section_id } = req.body;
    const filePath = `/uploads/pdfs/${req.file.filename}`;
    const result = await pool.query(
      'INSERT INTO pdf_files (title,file_url,course_id,section_id) VALUES($1,$2,$3,$4) RETURNING *',
      [title || req.file.originalname, filePath, req.params.id, section_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Delete video — FIXED: verify video belongs to teacher's course ──
router.delete('/:id/videos/:videoId', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    if (!(await verifyCoursOwnership(req.params.id, teacherId))) {
      return res.status(403).json({ error: 'Access denied: course not yours' });
    }
    const v = await pool.query('SELECT file_path_or_url FROM videos WHERE id=$1 AND course_id=$2', [req.params.videoId, req.params.id]);
    if (!v.rows.length) return res.status(404).json({ error: 'Video not found' });
    if (v.rows[0].file_path_or_url?.startsWith('/uploads/')) {
      const fp = path.join(__dirname, '../../', v.rows[0].file_path_or_url);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await pool.query('DELETE FROM videos WHERE id=$1', [req.params.videoId]);
    res.json({ message: 'Video deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Delete PDF — FIXED: verify PDF belongs to teacher's course ──
router.delete('/:id/pdfs/:pdfId', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    if (!(await verifyCoursOwnership(req.params.id, teacherId))) {
      return res.status(403).json({ error: 'Access denied: course not yours' });
    }
    const p = await pool.query('SELECT file_url FROM pdf_files WHERE id=$1 AND course_id=$2', [req.params.pdfId, req.params.id]);
    if (!p.rows.length) return res.status(404).json({ error: 'PDF not found' });
    if (p.rows[0].file_url?.startsWith('/uploads/')) {
      const fp = path.join(__dirname, '../../', p.rows[0].file_url);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await pool.query('DELETE FROM pdf_files WHERE id=$1', [req.params.pdfId]);
    res.json({ message: 'PDF deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Enrollment — FIXED: verify course AND student both belong to teacher ──
router.post('/:id/enroll/:studentId', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    if (!(await verifyCoursOwnership(req.params.id, teacherId))) {
      return res.status(403).json({ error: 'Access denied: course not yours' });
    }
    const studentCheck = await pool.query('SELECT id FROM students WHERE id=$1 AND teacher_id=$2', [req.params.studentId, teacherId]);
    if (!studentCheck.rows.length) {
      return res.status(403).json({ error: 'Access denied: student not yours' });
    }
    await pool.query(
      'INSERT INTO student_course_enrollment (student_id,course_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [req.params.studentId, req.params.id]
    );
    res.json({ message: 'Student enrolled' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Student: my courses ──
router.get('/student/my-courses', requireRole('student'), async (req, res) => {
  try {
    const studentRes = await pool.query('SELECT academic_stage FROM students WHERE id=$1', [req.user.id]);
    const stage = studentRes.rows[0]?.academic_stage;
    const result = await pool.query(
      `SELECT c.*, sce.enrollment_date, sce.status,
              COUNT(DISTINCT v.id) as video_count, COUNT(DISTINCT p.id) as pdf_count
       FROM courses c
       JOIN student_course_enrollment sce ON c.id = sce.course_id
       LEFT JOIN videos v ON c.id = v.course_id
       LEFT JOIN pdf_files p ON c.id = p.course_id
       WHERE sce.student_id = $1
         AND (c.target_stage = $2 OR c.target_stage IS NULL)
       GROUP BY c.id, sce.enrollment_date, sce.status
       ORDER BY c.created_at DESC`,
      [req.user.id, stage]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Student: browse all available courses (with enrollment/request status) ──
router.get('/student/available-all', requireRole('student'), async (req, res) => {
  try {
    const teacherRes = await pool.query('SELECT teacher_id FROM students WHERE id=$1', [req.user.id]);
    if (!teacherRes.rows.length) return res.status(404).json({ error: 'Student not found' });
    const teacherId = teacherRes.rows[0].teacher_id;

    const result = await pool.query(
      `SELECT c.*,
              COUNT(DISTINCT v.id) as video_count, COUNT(DISTINCT p.id) as pdf_count,
              sce.student_id IS NOT NULL as is_enrolled,
              cer.status as request_status, cer.id as request_id
       FROM courses c
       LEFT JOIN videos v ON c.id = v.course_id
       LEFT JOIN pdf_files p ON c.id = p.course_id
       LEFT JOIN student_course_enrollment sce ON c.id = sce.course_id AND sce.student_id = $1
       LEFT JOIN course_enrollment_requests cer ON c.id = cer.course_id AND cer.student_id = $1
       WHERE c.teacher_id = $2
       GROUP BY c.id, sce.student_id, cer.status, cer.id
       ORDER BY c.created_at DESC`,
      [req.user.id, teacherId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Student: request enrollment in a course ──
router.post('/student/request/:courseId', requireRole('student'), async (req, res) => {
  const { message } = req.body;
  try {
    const teacherRes = await pool.query('SELECT teacher_id FROM students WHERE id=$1', [req.user.id]);
    if (!teacherRes.rows.length) return res.status(404).json({ error: 'Student not found' });
    const teacherId = teacherRes.rows[0].teacher_id;

    const courseCheck = await pool.query('SELECT id FROM courses WHERE id=$1 AND teacher_id=$2', [req.params.courseId, teacherId]);
    if (!courseCheck.rows.length) return res.status(403).json({ error: 'Course not available' });

    const enrolled = await pool.query('SELECT id FROM student_course_enrollment WHERE student_id=$1 AND course_id=$2', [req.user.id, req.params.courseId]);
    if (enrolled.rows.length) return res.status(409).json({ error: 'Already enrolled' });

    const result = await pool.query(
      `INSERT INTO course_enrollment_requests (student_id, course_id, message)
       VALUES ($1, $2, $3)
       ON CONFLICT (student_id, course_id) DO UPDATE SET status='pending', message=EXCLUDED.message
       RETURNING *`,
      [req.user.id, req.params.courseId, message || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Teacher: list enrollment requests ──
router.get('/enrollment-requests', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query(
      `SELECT cer.*, s.name as student_name, s.academic_stage, s.phone,
              c.name as course_name
       FROM course_enrollment_requests cer
       JOIN students s ON cer.student_id = s.id
       JOIN courses c ON cer.course_id = c.id
       WHERE c.teacher_id = $1
       ORDER BY cer.created_at DESC`,
      [teacherId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Teacher: approve or reject enrollment request ──
router.put('/enrollment-requests/:id', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { action } = req.body; // 'approve' | 'reject'
  try {
    const reqRes = await pool.query(
      `SELECT cer.* FROM course_enrollment_requests cer
       JOIN courses c ON cer.course_id = c.id
       WHERE cer.id = $1 AND c.teacher_id = $2`,
      [req.params.id, teacherId]
    );
    if (!reqRes.rows.length) return res.status(404).json({ error: 'Request not found' });
    const enrReq = reqRes.rows[0];

    if (action === 'approve') {
      await pool.query(
        'INSERT INTO student_course_enrollment (student_id, course_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [enrReq.student_id, enrReq.course_id]
      );
      await pool.query(
        'UPDATE course_enrollment_requests SET status=$1, handled_at=NOW() WHERE id=$2',
        ['approved', req.params.id]
      );
    } else {
      await pool.query(
        'UPDATE course_enrollment_requests SET status=$1, handled_at=NOW() WHERE id=$2',
        ['rejected', req.params.id]
      );
    }
    res.json({ success: true, action });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
