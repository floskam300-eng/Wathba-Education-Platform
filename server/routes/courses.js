const { sendEvent } = require('../sse');
const { sendFCMToStudents } = require('../lib/fcm');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateCourse } = require('../middleware/validate');

const router = express.Router();
router.use(authenticate);

const getTeacherId = (req) => req.user.role === 'teacher' ? req.user.id : req.user.teacher_id;

const verifyCoursOwnership = async (courseId, teacherId) => {
  const r = await pool.query('SELECT id FROM courses WHERE id=$1 AND teacher_id=$2', [courseId, teacherId]);
  return r.rows.length > 0;
};

const checkManageCoursesPerm = (req, res, next) => {
  if (req.user.role === 'teacher') return next();
  pool.query('SELECT can_manage_courses FROM assistants WHERE id=$1', [req.user.id])
    .then(r => {
      if (!r.rows.length || !r.rows[0].can_manage_courses)
        return res.status(403).json({ error: 'Access denied: missing permission' });
      next();
    })
    .catch(() => res.status(500).json({ error: 'Server error' }));
};

const thumbnailStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/thumbnails');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `thumb_${Date.now()}${ext}`);
  },
});
const uploadThumbnail = multer({
  storage: thumbnailStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('يُسمح بالصور فقط'));
  },
});

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

router.post('/upload-thumbnail', requireRole('teacher', 'assistant'), checkManageCoursesPerm, uploadThumbnail.single('thumbnail'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'لم يتم رفع أي ملف' });
  const url = `/uploads/thumbnails/${req.file.filename}`;
  res.json({ url });
});

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

router.post('/', requireRole('teacher', 'assistant'), checkManageCoursesPerm, validateCourse, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { name, description, price, thumbnail_url, target_stage, is_free, points_on_complete } = req.body;
  const isFree = is_free === true || is_free === 'true';
  try {
    const result = await pool.query(
      'INSERT INTO courses (name,description,price,thumbnail_url,teacher_id,target_stage,is_free,is_published,points_on_complete) VALUES($1,$2,$3,$4,$5,$6,$7,false,$8) RETURNING *',
      [name, description, isFree ? 0 : (price || 0), thumbnail_url, teacherId, target_stage || null, isFree, points_on_complete || 0]
    );
    const course = result.rows[0];
    res.status(201).json(course);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', requireRole('teacher', 'assistant'), checkManageCoursesPerm, validateCourse, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { name, description, price, thumbnail_url, target_stage, is_free, points_on_complete } = req.body;
  const isFree = is_free === true || is_free === 'true';
  try {
    const result = await pool.query(
      'UPDATE courses SET name=$1,description=$2,price=$3,thumbnail_url=$4,target_stage=$5,is_free=$6,points_on_complete=$7 WHERE id=$8 AND teacher_id=$9 RETURNING *',
      [name, description, isFree ? 0 : (price || 0), thumbnail_url, target_stage || null, isFree, points_on_complete || 0, req.params.id, teacherId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Course not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Publish / Unpublish a course ──────────────────────────────────────────
router.put('/:id/publish', requireRole('teacher', 'assistant'), checkManageCoursesPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const courseRes = await pool.query(
      'SELECT * FROM courses WHERE id=$1 AND teacher_id=$2',
      [req.params.id, teacherId]
    );
    if (!courseRes.rows.length) return res.status(404).json({ error: 'Course not found' });
    const course = courseRes.rows[0];
    const newPublished = !course.is_published;

    // If publishing, validate course has content
    if (newPublished) {
      const contentCheck = await pool.query(
        `SELECT (SELECT COUNT(id) FROM videos WHERE course_id=$1) + (SELECT COUNT(id) FROM pdf_files WHERE course_id=$1) as total`,
        [req.params.id]
      );
      if (parseInt(contentCheck.rows[0].total) === 0) {
        return res.status(400).json({ error: 'لا يمكن نشر كورس بدون محتوى — أضف فيديوهات أو ملفات PDF أولاً' });
      }
    }

    await pool.query(
      'UPDATE courses SET is_published=$1 WHERE id=$2 AND teacher_id=$3',
      [newPublished, req.params.id, teacherId]
    );

    // If unpublishing, also unpublish all exams in this course
    if (!newPublished) {
      await pool.query(
        'UPDATE exams SET is_published=false WHERE course_id=$1 AND teacher_id=$2',
        [req.params.id, teacherId]
      );
    }

    if (newPublished) {
      // Determine which students to notify
      const stageClause = (course.target_stage && course.target_stage.trim())
        ? `AND academic_stage = '${course.target_stage.replace(/'/g, "''")}'`
        : '';
      const eligibleStudents = await pool.query(
        `SELECT id FROM students WHERE teacher_id=$1 AND deleted_at IS NULL ${stageClause}`,
        [teacherId]
      );

      if (course.is_free) {
        // Auto-enroll all eligible students
        if (course.target_stage && course.target_stage.trim()) {
          await pool.query(
            `INSERT INTO student_course_enrollment (student_id, course_id)
             SELECT id, $1 FROM students WHERE teacher_id=$2 AND academic_stage=$3 AND deleted_at IS NULL
             ON CONFLICT DO NOTHING`,
            [course.id, teacherId, course.target_stage]
          );
        } else {
          await pool.query(
            `INSERT INTO student_course_enrollment (student_id, course_id)
             SELECT id, $1 FROM students WHERE teacher_id=$2 AND deleted_at IS NULL
             ON CONFLICT DO NOTHING`,
            [course.id, teacherId]
          );
        }
      }

      // Notify all eligible students via notification_log + SSE
      const msgText = course.is_free
        ? `🎁 تم تسجيلك تلقائياً في الكورس المجاني: "${course.name}"`
        : `📚 كورس جديد متاح للتسجيل: "${course.name}"`;
      const notifTitle = course.is_free ? 'تسجيل تلقائي في كورس مجاني' : 'كورس جديد';
      const notifType  = 'new_course';

      const eligibleStudentIds = eligibleStudents.rows.map(r => r.id);
      for (const sid of eligibleStudentIds) {
        await pool.query(
          `INSERT INTO notification_log (teacher_id, student_id, recipient_type, message, type, is_read, source, title)
           VALUES ($1,$2,'student',$3,$4,false,'platform',$5)`,
          [teacherId, sid, msgText, notifType, notifTitle]
        );
        sendEvent(`student_${sid}`, 'platform_notification', {
          title:   notifTitle,
          message: msgText,
          type:    notifType,
          courseId: course.id,
        });
      }
      sendFCMToStudents(pool, eligibleStudentIds, notifTitle, msgText, { courseId: String(course.id) }).catch(() => {});
    } else {
      // Unpublishing — notify enrolled students so their UI updates immediately
      const enrolledRes = await pool.query(
        'SELECT student_id FROM student_course_enrollment WHERE course_id=$1',
        [req.params.id]
      );
      for (const { student_id } of enrolledRes.rows) {
        sendEvent(`student_${student_id}`, 'course_unpublished', {
          courseId: course.id,
          name: course.name,
        });
      }
    }

    // Notify the teacher (and any logged-in assistants) in real-time
    sendEvent(`teacher_${teacherId}`, 'course_publish_changed', {
      id: course.id,
      is_published: newPublished,
      name: course.name,
    });

    res.json({ is_published: newPublished });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', requireRole('teacher', 'assistant'), checkManageCoursesPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query('DELETE FROM courses WHERE id=$1 AND teacher_id=$2 RETURNING id', [req.params.id, teacherId]);
    if (!result.rows.length) return res.status(404).json({ error: 'Course not found' });
    res.json({ message: 'Course deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/content', authenticate, async (req, res) => {
  const courseId = req.params.id;
  try {
    if (req.user.role === 'student') {
      const enrollment = await pool.query(
        'SELECT id FROM student_course_enrollment WHERE student_id=$1 AND course_id=$2',
        [req.user.id, courseId]
      );
      if (!enrollment.rows.length) {
        return res.status(403).json({ error: 'Access denied: you are not enrolled in this course' });
      }
    } else {
      const teacherId = getTeacherId(req);
      if (!(await verifyCoursOwnership(courseId, teacherId))) {
        return res.status(403).json({ error: 'Access denied: course not yours' });
      }
    }

    const isStudent = req.user.role === 'student';
    const [videos, pdfs, exams, sections] = await Promise.all([
      isStudent
        ? pool.query(
            `SELECT v.*, vp.progress_percentage as saved_progress, vp.last_position as saved_position,
                    vp.watched_minutes as saved_watched_minutes, vp.actual_watched_seconds as saved_watched_seconds,
                    vp.watch_count as saved_watch_count
             FROM videos v
             LEFT JOIN video_progress vp ON vp.video_id = v.id AND vp.student_id = $2
             WHERE v.course_id = $1
             ORDER BY v.sort_order, v.id`,
            [courseId, req.user.id]
          )
        : pool.query('SELECT * FROM videos WHERE course_id=$1 ORDER BY sort_order, id', [courseId]),
      pool.query('SELECT * FROM pdf_files WHERE course_id=$1 ORDER BY id', [courseId]),
      pool.query('SELECT id,title,duration_minutes,total_score,pass_score FROM exams WHERE course_id=$1', [courseId]),
      pool.query('SELECT * FROM sections WHERE course_id=$1 ORDER BY sort_order, id', [courseId]),
    ]);
    res.json({ videos: videos.rows, pdfs: pdfs.rows, exams: exams.rows, sections: sections.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/sections', requireRole('teacher', 'assistant'), checkManageCoursesPerm, async (req, res) => {
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

router.put('/:id/sections/:sectionId', requireRole('teacher', 'assistant'), checkManageCoursesPerm, async (req, res) => {
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

router.delete('/:id/sections/:sectionId', requireRole('teacher', 'assistant'), checkManageCoursesPerm, async (req, res) => {
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

router.put('/:id/videos/:videoId/section', requireRole('teacher', 'assistant'), checkManageCoursesPerm, async (req, res) => {
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

router.put('/:id/pdfs/:pdfId/section', requireRole('teacher', 'assistant'), checkManageCoursesPerm, async (req, res) => {
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

router.post('/:id/videos/url', requireRole('teacher', 'assistant'), checkManageCoursesPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    if (!(await verifyCoursOwnership(req.params.id, teacherId))) {
      return res.status(403).json({ error: 'Access denied: course not yours' });
    }
    const { title, url, duration_minutes, sort_order, section_id, url_480, url_720, url_1080 } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'عنوان الفيديو مطلوب' });
    if (!url?.trim()) return res.status(400).json({ error: 'رابط الفيديو مطلوب' });
    const result = await pool.query(
      'INSERT INTO videos (title,file_path_or_url,duration_minutes,course_id,sort_order,section_id,url_480,url_720,url_1080) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [title.trim(), url.trim(), parseInt(duration_minutes) || 0, req.params.id, parseInt(sort_order) || 0, section_id || null, url_480?.trim() || null, url_720?.trim() || null, url_1080?.trim() || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/videos/upload', requireRole('teacher', 'assistant'), checkManageCoursesPerm, uploadVideo.single('video'), async (req, res) => {
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

router.post('/:id/pdfs/upload', requireRole('teacher', 'assistant'), checkManageCoursesPerm, uploadPdf.single('pdf'), async (req, res) => {
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

router.delete('/:id/videos/:videoId', requireRole('teacher', 'assistant'), checkManageCoursesPerm, async (req, res) => {
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

router.delete('/:id/pdfs/:pdfId', requireRole('teacher', 'assistant'), checkManageCoursesPerm, async (req, res) => {
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

router.post('/:id/enroll/:studentId', requireRole('teacher', 'assistant'), checkManageCoursesPerm, async (req, res) => {
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

router.get('/student/my-courses', requireRole('student'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, sce.enrollment_date, sce.status,
              COUNT(DISTINCT v.id) as video_count, COUNT(DISTINCT p.id) as pdf_count
       FROM courses c
       JOIN student_course_enrollment sce ON c.id = sce.course_id
       LEFT JOIN videos v ON c.id = v.course_id
       LEFT JOIN pdf_files p ON c.id = p.course_id
       WHERE sce.student_id = $1
         AND c.is_published = true
       GROUP BY c.id, sce.enrollment_date, sce.status
       ORDER BY c.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/student/available-all', requireRole('student'), async (req, res) => {
  try {
    const studentRes = await pool.query('SELECT teacher_id, academic_stage FROM students WHERE id=$1', [req.user.id]);
    if (!studentRes.rows.length) return res.status(404).json({ error: 'Student not found' });
    const { teacher_id: teacherId, academic_stage: studentStage } = studentRes.rows[0];

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
         AND c.is_published = true
         AND (c.target_stage = $3 OR c.target_stage IS NULL OR c.target_stage = '')
       GROUP BY c.id, sce.student_id, cer.status, cer.id
       ORDER BY c.created_at DESC`,
      [req.user.id, teacherId, studentStage]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/student/request/:courseId', requireRole('student'), async (req, res) => {
  const { message } = req.body;
  try {
    const teacherRes = await pool.query('SELECT teacher_id FROM students WHERE id=$1', [req.user.id]);
    if (!teacherRes.rows.length) return res.status(404).json({ error: 'Student not found' });
    const teacherId = teacherRes.rows[0].teacher_id;

    const courseCheck = await pool.query('SELECT id, price, is_free, name, is_published FROM courses WHERE id=$1 AND teacher_id=$2', [req.params.courseId, teacherId]);
    if (!courseCheck.rows.length) return res.status(403).json({ error: 'Course not available' });
    const course = courseCheck.rows[0];

    if (!course.is_published) return res.status(403).json({ error: 'Course is not published' });

    const enrolled = await pool.query('SELECT id FROM student_course_enrollment WHERE student_id=$1 AND course_id=$2', [req.user.id, req.params.courseId]);
    if (enrolled.rows.length) return res.status(409).json({ error: 'Already enrolled' });

    // Free course: auto-enroll directly without needing teacher approval
    if (course.is_free) {
      await pool.query(
        'INSERT INTO student_course_enrollment (student_id, course_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [req.user.id, req.params.courseId]
      );
      sendEvent(`student_${req.user.id}`, 'enrollment_approved', { course_name: course.name, courseId: req.params.courseId });
      return res.status(201).json({ enrolled: true, message: 'تم التسجيل تلقائياً في الكورس المجاني' });
    }

    const result = await pool.query(
      `INSERT INTO course_enrollment_requests (student_id, course_id, message)
       VALUES ($1, $2, $3)
       ON CONFLICT (student_id, course_id) DO UPDATE SET status='pending', message=EXCLUDED.message
       RETURNING *`,
      [req.user.id, req.params.courseId, message || null]
    );

    if (parseFloat(course.price) > 0) {
      await pool.query(
        `INSERT INTO payments (student_id, course_id, amount, method, status)
         VALUES ($1, $2, $3, '', 'pending')
         ON CONFLICT DO NOTHING`,
        [req.user.id, req.params.courseId, course.price]
      );
    }

    try {
      const studentInfo = await pool.query('SELECT name FROM students WHERE id=$1', [req.user.id]);
      const studentName = studentInfo.rows[0]?.name || 'طالب';
      sendEvent(`teacher_${teacherId}`, 'new_request', {
        student_name: studentName,
        course_name: course.name,
        courseId: req.params.courseId,
      });
    } catch (_) {}
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

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

router.put('/enrollment-requests/:id', requireRole('teacher', 'assistant'), checkManageCoursesPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { action } = req.body;
  try {
    const reqRes = await pool.query(
      `SELECT cer.* FROM course_enrollment_requests cer
       JOIN courses c ON cer.course_id = c.id
       WHERE cer.id = $1 AND c.teacher_id = $2`,
      [req.params.id, teacherId]
    );
    if (!reqRes.rows.length) return res.status(404).json({ error: 'Request not found' });
    const enrReq = reqRes.rows[0];

    const courseInfo = await pool.query('SELECT name FROM courses WHERE id=$1', [enrReq.course_id]);
    const courseName = courseInfo.rows[0]?.name || '';

    if (action === 'approve') {
      await pool.query(
        'INSERT INTO student_course_enrollment (student_id, course_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [enrReq.student_id, enrReq.course_id]
      );
      await pool.query(
        'UPDATE course_enrollment_requests SET status=$1, handled_at=NOW() WHERE id=$2',
        ['approved', req.params.id]
      );
      await pool.query(
        `INSERT INTO notification_log (teacher_id, student_id, recipient_type, message, type, is_read, source, title)
         VALUES ($1,$2,'student',$3,'enrollment_approved',false,'platform','قبول في كورس')`,
        [teacherId, enrReq.student_id, `🎓 تمت الموافقة على انضمامك لكورس: "${courseName}"`]
      );
      sendEvent(`student_${enrReq.student_id}`, 'enrollment_approved', {
        course_name: courseName,
        courseId: enrReq.course_id,
      });
      sendFCMToStudents(pool, [enrReq.student_id], 'قبول في كورس', `🎓 تمت الموافقة على انضمامك لكورس: "${courseName}"`).catch(() => {});
    } else {
      await pool.query(
        'UPDATE course_enrollment_requests SET status=$1, handled_at=NOW() WHERE id=$2',
        ['rejected', req.params.id]
      );
      await pool.query(
        `INSERT INTO notification_log (teacher_id, student_id, recipient_type, message, type, is_read, source, title)
         VALUES ($1,$2,'student',$3,'enrollment_rejected',false,'platform','رفض طلب كورس')`,
        [teacherId, enrReq.student_id, `رُفض طلب انضمامك لكورس: "${courseName}"`]
      );
      sendEvent(`student_${enrReq.student_id}`, 'enrollment_rejected', {
        course_name: courseName,
        courseId: enrReq.course_id,
      });
      sendFCMToStudents(pool, [enrReq.student_id], 'رفض طلب كورس', `رُفض طلب انضمامك لكورس: "${courseName}"`).catch(() => {});
    }
    res.json({ success: true, action });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
