const { sendEvent } = require('../sse');
const { sendFCMToStudents } = require('../lib/fcm');
const { isValidImage, isValidPdf, deleteFile, deleteUploadFile } = require('../lib/validateFileMagic');
const { convertToWebp } = require('../lib/convertToWebp');
const { optimizeAndLinearizePdf } = require('../lib/pdfOptimizer');
const express = require('express');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateCourse } = require('../middleware/validate');
const { logActivity, getActor, getIp } = require('../lib/activityLog');
const { getPermissions } = require('../lib/permissionsCache');

const router = express.Router();
router.use(authenticate);

const getTeacherId = (req) => req.user.role === 'teacher' ? req.user.id : req.user.teacher_id;

// Validate and parse integer route params — returns null on invalid input (prevents DB errors)
const parseParamId = (val) => {
  const n = parseInt(val, 10);
  return (Number.isFinite(n) && n > 0 && n <= 2147483647) ? n : null;
};

// Extract the 11-char YouTube video id from any common URL form.
// Used by the content endpoint to send ONLY the id (not the raw URL) to students,
// so the full youtube.com/watch?v=... link is never exposed in the API response.
const YOUTUBE_RE = [
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  /youtube\.com\/watch\?.*[&?]v=([a-zA-Z0-9_-]{11})/,
];
function extractYoutubeId(url) {
  if (!url || typeof url !== 'string') return null;
  for (const re of YOUTUBE_RE) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

// Middleware: check course ownership BEFORE multer writes to disk
const preCheckOwnership = async (req, res, next) => {
  const teacherId = getTeacherId(req);
  try {
    if (!(await verifyCourseOwnership(req.params.id, teacherId))) {
      return res.status(403).json({ error: 'Access denied: course not yours' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

const verifyCourseOwnership = async (courseId, teacherId) => {
  const r = await pool.query('SELECT id FROM courses WHERE id=$1 AND teacher_id=$2', [courseId, teacherId]);
  return r.rows.length > 0;
};

const checkManageCoursesPerm = async (req, res, next) => {
  if (req.user.role === 'teacher') return next();
  try {
    const perms = await getPermissions(req.user.id, pool);
    if (!perms || !perms.can_manage_courses)
      return res.status(403).json({ error: 'Access denied: missing permission (can_manage_courses)' });
    next();
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
};

// Pre-create upload directories once at startup (not on every request)
// Note: video uploads are not supported — only YouTube URLs are accepted.
const UPLOAD_DIRS = {
  thumbnails: path.join(__dirname, '../../uploads/thumbnails'),
  pdfs:       path.join(__dirname, '../../uploads/pdfs'),
};
Object.values(UPLOAD_DIRS).forEach(dir => fs.mkdirSync(dir, { recursive: true }));

const thumbnailStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIRS.thumbnails),
  filename: (req, file, cb) => {
    // [L2-FIX] Use crypto.randomBytes to prevent filename collision when two users
    // upload a thumbnail at the same millisecond. Date.now() alone was insufficient.
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const rand = crypto.randomBytes(8).toString('hex');
    cb(null, `thumb_${Date.now()}_${rand}${ext}`);
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

const pdfStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIRS.pdfs),
  filename: (req, file, cb) => {
    // Use randomBytes (same pattern as thumbnails) to prevent collision when
    // two uploads happen at the same millisecond.
    const rand = crypto.randomBytes(8).toString('hex');
    cb(null, `pdf_${Date.now()}_${rand}.pdf`);
  },
});
const ACCEPTED_PDF_MIMES = [
  'application/pdf',
  'application/x-pdf',
  'application/acrobat',
  'application/vnd.pdf',
  'application/octet-stream',
];
const uploadPdf = multer({
  storage: pdfStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mimeOk = ACCEPTED_PDF_MIMES.includes(file.mimetype);
    const extOk  = ext === '.pdf';
    if (mimeOk || extOk) cb(null, true);
    else cb(new Error('يُسمح بملفات PDF فقط'));
  },
});

// Wraps a multer middleware and returns clean JSON errors instead of HTML
const withMulterErrors = (upload, limitLabel) => (req, res, next) => {
  upload(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `حجم الملف يتجاوز الحد المسموح به (${limitLabel || '50 MB'})` });
    }
    return res.status(400).json({ error: err.message || 'خطأ في رفع الملف' });
  });
};

router.post('/upload-thumbnail', requireRole('teacher', 'assistant'), checkManageCoursesPerm, uploadThumbnail.single('thumbnail'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'لم يتم رفع أي ملف' });
  // [M-11] FIX: validate image magic bytes
  const validImg = await isValidImage(req.file.path);
  if (!validImg) {
    deleteFile(req.file.path);
    return res.status(400).json({ error: 'الملف المرفوع ليس صورة صالحة (PNG / JPEG / GIF / WebP)' });
  }
  // Convert to WebP for smaller file size (up to 80% reduction)
  try {
    const { filename: webpName } = await convertToWebp(req.file.path, req.file.filename);
    const url = `/uploads/thumbnails/${webpName}`;
    res.json({ url });
  } catch (convErr) {
    console.error('[courses] WebP conversion error:', convErr.message);
    deleteFile(req.file.path);
    return res.status(500).json({ error: 'خطأ أثناء معالجة الصورة' });
  }
});

router.delete('/upload-thumbnail', requireRole('teacher', 'assistant'), checkManageCoursesPerm, async (req, res) => {
  const { url } = req.body;
  if (!url || !url.startsWith('/uploads/thumbnails/')) {
    return res.status(400).json({ error: 'مسار غير صالح' });
  }
  // Guard against path traversal: normalize and re-verify the prefix.
  // e.g. "/uploads/thumbnails/../../server/index.js" would be caught here.
  const normalized = path.normalize(url);
  if (!normalized.startsWith('/uploads/thumbnails/') || normalized.includes('..')) {
    return res.status(400).json({ error: 'مسار غير صالح' });
  }
  try {
    const teacherId = getTeacherId(req);
    // Only delete if not referenced by any of this teacher's courses
    const inUse = await pool.query(
      'SELECT id FROM courses WHERE thumbnail_url=$1 AND teacher_id=$2 LIMIT 1',
      [url, teacherId]
    );
    if (inUse.rows.length) return res.json({ ok: true }); // in use, don't delete
    const filePath = path.join(__dirname, '../../', normalized);
    fs.unlink(filePath, () => {});
    res.json({ ok: true });
  } catch {
    res.json({ ok: true }); // non-critical, always succeed
  }
});

router.get('/', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query(
      `SELECT c.*,
              COUNT(DISTINCT CASE WHEN sce.status = 'active' THEN sce.student_id END)::int as enrolled_count,
              COUNT(DISTINCT v.id)::int as video_count, COUNT(DISTINCT p.id)::int as pdf_count
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
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'create_course',
      entity: { type: 'course', id: course.id, name: course.name },
    });
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
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'edit_course',
      entity: { type: 'course', id: result.rows[0].id, name: result.rows[0].name },
    });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Publish / Unpublish a course ──────────────────────────────────────────
router.put('/:id/publish', requireRole('teacher', 'assistant'), checkManageCoursesPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  const courseId = parseInt(req.params.id, 10);
  if (isNaN(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course ID' });
  try {
    const courseRes = await pool.query(
      'SELECT * FROM courses WHERE id=$1 AND teacher_id=$2',
      [courseId, teacherId]
    );
    if (!courseRes.rows.length) return res.status(404).json({ error: 'Course not found' });
    const course = courseRes.rows[0];
    const newPublished = !course.is_published;

    // If publishing, validate course has content
    if (newPublished) {
      const contentCheck = await pool.query(
        `SELECT (SELECT COUNT(id) FROM videos WHERE course_id=$1) + (SELECT COUNT(id) FROM pdf_files WHERE course_id=$1) as total`,
        [courseId]
      );
      if (parseInt(contentCheck.rows[0].total) === 0) {
        return res.status(400).json({ error: 'لا يمكن نشر كورس بدون محتوى — أضف فيديوهات أو ملفات PDF أولاً' });
      }
    }

    // ── Atomic: update course + exams in one transaction ──
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE courses SET is_published=$1 WHERE id=$2 AND teacher_id=$3',
        [newPublished, courseId, teacherId]
      );
      if (!newPublished) {
        // Save current published state before zeroing it out (so we can restore on re-publish)
        await client.query(
          'UPDATE exams SET pre_unpublish_published=is_published, is_published=false WHERE course_id=$1 AND teacher_id=$2 AND deleted_at IS NULL',
          [courseId, teacherId]
        );
      } else {
        // Restore each exam's published state from before the course was unpublished
        await client.query(
          'UPDATE exams SET is_published=pre_unpublish_published, pre_unpublish_published=false WHERE course_id=$1 AND teacher_id=$2 AND deleted_at IS NULL',
          [courseId, teacherId]
        );
      }
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      client.release();
      throw txErr;
    }
    client.release();

    if (newPublished) {
      // Determine which students to notify (parameterized — no SQL injection)
      const eligibleStudents = (course.target_stage && course.target_stage.trim())
        ? await pool.query(
            'SELECT id FROM students WHERE teacher_id=$1 AND deleted_at IS NULL AND academic_stage=$2',
            [teacherId, course.target_stage]
          )
        : await pool.query(
            'SELECT id FROM students WHERE teacher_id=$1 AND deleted_at IS NULL',
            [teacherId]
          );

      if (course.is_free) {
        // Auto-enroll all eligible students — reactivate previously inactive enrollments
        if (course.target_stage && course.target_stage.trim()) {
          await pool.query(
            `INSERT INTO student_course_enrollment (student_id, course_id, status)
             SELECT id, $1, 'active' FROM students WHERE teacher_id=$2 AND academic_stage=$3 AND deleted_at IS NULL
             ON CONFLICT (student_id, course_id) DO UPDATE SET status = 'active'`,
            [course.id, teacherId, course.target_stage]
          );
        } else {
          await pool.query(
            `INSERT INTO student_course_enrollment (student_id, course_id, status)
             SELECT id, $1, 'active' FROM students WHERE teacher_id=$2 AND deleted_at IS NULL
             ON CONFLICT (student_id, course_id) DO UPDATE SET status = 'active'`,
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
      // Batch INSERT all notifications in one query (avoid N+1)
      if (eligibleStudentIds.length > 0) {
        await pool.query(
          `INSERT INTO notification_log (teacher_id, student_id, recipient_type, message, type, is_read, source, title)
           SELECT $1, unnest($2::int[]), 'student', $3, $4, false, 'platform', $5`,
          [teacherId, eligibleStudentIds, msgText, notifType, notifTitle]
        ).catch(e => console.error('[course publish notif batch]', e.message));
        for (const sid of eligibleStudentIds) {
          sendEvent(`student_${sid}`, 'platform_notification', {
            title: notifTitle, message: msgText, type: notifType, courseId: course.id,
          });
        }
      }
      sendFCMToStudents(pool, eligibleStudentIds, notifTitle, msgText, { courseId: String(course.id) }).catch(() => {});
    } else {
      // Unpublishing — notify enrolled students so their UI updates immediately
      const enrolledRes = await pool.query(
        'SELECT student_id FROM student_course_enrollment WHERE course_id=$1',
        [courseId]
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

    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'publish_course',
      entity: { type: 'course', id: course.id, name: course.name },
      details: { is_published: newPublished },
    });
    res.json({ is_published: newPublished });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', requireRole('teacher', 'assistant'), checkManageCoursesPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  const courseId = parseInt(req.params.id, 10);
  if (isNaN(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course ID' });
  try {
    const courseInfo = await pool.query('SELECT name FROM courses WHERE id=$1 AND teacher_id=$2', [courseId, teacherId]);
    if (!courseInfo.rows.length) return res.status(404).json({ error: 'Course not found' });
    // Check for active enrollments before deletion — prevent data loss
    const enrollCount = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM student_course_enrollment WHERE course_id=$1 AND status='active'",
      [courseId]
    );
    if (parseInt(enrollCount.rows[0].cnt) > 0 && !req.body.force_delete) {
      return res.status(409).json({
        error: `يوجد ${enrollCount.rows[0].cnt} طالب مسجل في هذا الكورس — سيتم إلغاء تسجيلهم. أرسل force_delete=true للتأكيد`,
        code: 'ENROLLMENTS_EXIST',
        count: parseInt(enrollCount.rows[0].cnt),
      });
    }
    // Collect course files before the hard-delete so we can clean up disk after
    const [thumbRow, pdfFilesRow] = await Promise.all([
      pool.query('SELECT thumbnail_url FROM courses WHERE id=$1', [courseId]),
      pool.query('SELECT file_url FROM pdf_files WHERE course_id=$1', [courseId]),
    ]);

    // BUG-8 FIX: Soft-delete all exams linked to this course BEFORE the hard-delete.
    // Schema has `exams.course_id ON DELETE SET NULL`, so a hard-delete would leave
    // those exams alive as standalone exams. If any were published, students could
    // still access them even after the course is gone. Cleaning their sessions too.
    await pool.query(`
      DELETE FROM exam_sessions
       WHERE exam_id IN (SELECT id FROM exams WHERE course_id=$1 AND deleted_at IS NULL)
    `, [courseId]).catch(err => console.warn('[delete course] exam session cleanup failed:', err.message));
    await pool.query(
      'UPDATE exams SET deleted_at=NOW() WHERE course_id=$1 AND deleted_at IS NULL',
      [courseId]
    ).catch(err => console.warn('[delete course] exam soft-delete failed:', err.message));

    // BUG-9 FIX: Same issue for recitations — `recitations.course_id ON DELETE SET NULL`
    // would orphan published recitations as standalone ones after course deletion.
    await pool.query(`
      DELETE FROM recitation_sessions
       WHERE recitation_id IN (SELECT id FROM recitations WHERE course_id=$1 AND deleted_at IS NULL)
    `, [courseId]).catch(err => console.warn('[delete course] recitation session cleanup failed:', err.message));
    await pool.query(
      'UPDATE recitations SET deleted_at=NOW() WHERE course_id=$1 AND deleted_at IS NULL',
      [courseId]
    ).catch(err => console.warn('[delete course] recitation soft-delete failed:', err.message));

    const result = await pool.query('DELETE FROM courses WHERE id=$1 AND teacher_id=$2 RETURNING id', [courseId, teacherId]);

    // Clean up course files from disk (best-effort, after DB delete)
    deleteUploadFile(thumbRow.rows[0]?.thumbnail_url);
    pdfFilesRow.rows.forEach(r => deleteUploadFile(r.file_url));

    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'delete_course',
      entity: { type: 'course', id: courseId, name: courseInfo.rows[0]?.name },
    });
    res.json({ message: 'Course deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// [AUDIT-FIX] Had NO requireRole/permission gate at all — any assistant (even one
// granted zero permissions) could fetch full course content (videos, pdfs, sections,
// and unpublished-exam metadata) by calling the API directly, bypassing the frontend's
// can_manage_courses gate on the /courses/:id/content page. Ownership was checked but
// that's not the same as being granted can_manage_courses.
router.get('/:id/content', requireRole('teacher', 'assistant', 'student'), async (req, res, next) => {
  if (req.user.role === 'assistant') {
    try {
      const perms = await getPermissions(req.user.id, pool);
      if (!perms?.can_manage_courses) {
        return res.status(403).json({ error: 'Access denied: missing permission (can_manage_courses)' });
      }
    } catch {
      return res.status(500).json({ error: 'Server error' });
    }
  }
  next();
}, async (req, res) => {
  const courseId = parseParamId(req.params.id);
  if (!courseId) return res.status(400).json({ error: 'Invalid course ID' });
  try {
    if (req.user.role === 'student') {
      const enrollment = await pool.query(
        `SELECT sce.id FROM student_course_enrollment sce
         JOIN courses c ON c.id = sce.course_id
         JOIN students s ON s.id = sce.student_id
         WHERE sce.student_id=$1 AND sce.course_id=$2 AND sce.status='active'
           AND c.teacher_id = s.teacher_id
           AND c.is_published = true`,
        [req.user.id, courseId]
      );
      if (!enrollment.rows.length) {
        return res.status(403).json({ error: 'Access denied: you are not enrolled in this course' });
      }
    } else {
      const teacherId = getTeacherId(req);
      if (!(await verifyCourseOwnership(courseId, teacherId))) {
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
      isStudent
        ? pool.query('SELECT id,title,duration_minutes,total_score,pass_score,start_date,end_date FROM exams WHERE course_id=$1 AND is_published=true AND deleted_at IS NULL', [courseId])
        : pool.query('SELECT id,title,duration_minutes,total_score,pass_score,start_date,end_date,is_published FROM exams WHERE course_id=$1 AND deleted_at IS NULL', [courseId]),
      pool.query('SELECT * FROM sections WHERE course_id=$1 ORDER BY sort_order, id', [courseId]),
    ]);

    // Fetch recitations tied to this course, grouped by section_id.
    // Lock semantic (Phase-7): a recitation linked to section X "gates" section X —
    // i.e. the student must pass every such recitation to unlock section X's
    // videos / files / recitations. Section 1 (lowest sort_order) is always
    // unlocked by design so the student can start the course.
    const recitationsRes = isStudent
      ? pool.query(
          `SELECT r.id, r.title, r.description, r.duration_minutes, r.total_score, r.pass_score,
                  r.start_date, r.end_date, r.allow_retry, r.max_retry_attempts,
                  r.section_id, r.is_published, r.academic_stage,
                  (SELECT COUNT(*) FROM recitation_questions WHERE recitation_id=r.id) AS question_count,
                  (SELECT bool_or(rr3.passed) FROM recitation_results rr3
                    WHERE rr3.student_id=$2 AND rr3.recitation_id=r.id
                      AND (rr3.is_absent IS NULL OR rr3.is_absent=false)) AS my_ever_passed,
                  rr.id AS result_id, rr.score AS my_score, rr.passed AS my_passed,
                  rr.correct_count AS my_correct, rr.wrong_count AS my_wrong,
                  rr.created_at AS my_submitted_at,
                  COALESCE(g.unused_grants, 0) AS unused_grants
             FROM recitations r
             LEFT JOIN LATERAL (
               SELECT id, score, passed,
                      correct_count, wrong_count, created_at
                 FROM recitation_results rr2
                WHERE rr2.student_id=$2
                  AND rr2.recitation_id=r.id
                  AND (rr2.is_absent IS NULL OR rr2.is_absent=false)
                ORDER BY rr2.created_at DESC
                LIMIT 1
             ) rr ON true
             LEFT JOIN LATERAL (
               SELECT COUNT(*)::int AS unused_grants
                 FROM recitation_retake_grants
                WHERE recitation_id = r.id
                  AND student_id    = $2
                  AND used_at IS NULL
             ) g ON true
            WHERE r.course_id=$1
              AND r.is_published=true
              AND r.deleted_at IS NULL
            ORDER BY r.section_id NULLS LAST, r.created_at ASC`,
          [courseId, req.user.id]
        )
      : pool.query(
          `SELECT r.id, r.title, r.description, r.duration_minutes, r.total_score, r.pass_score,
                  r.start_date, r.end_date, r.allow_retry, r.max_retry_attempts,
                  r.section_id, r.is_published, r.academic_stage,
                  (SELECT COUNT(*) FROM recitation_questions WHERE recitation_id=r.id) AS question_count,
                  (SELECT COUNT(*) FROM recitation_results WHERE recitation_id=r.id) AS result_count,
                  r.created_at
             FROM recitations r
            WHERE r.course_id=$1
              AND r.deleted_at IS NULL
            ORDER BY r.section_id NULLS LAST, r.created_at ASC`,
          [courseId]
        );

    const [videoRowsRaw, pdfRows, examRows, sectionRows, recitationRows] = await Promise.all([
      Promise.resolve(videos.rows),
      Promise.resolve(pdfs.rows),
      Promise.resolve(exams.rows),
      Promise.resolve(sections.rows),
      recitationsRes.then(r => r.rows),
    ]);

    // ── Compute section-level lock for students ──────────────────────────────
    // A section is locked for a student if:
    //   - it's NOT the first section (sort_order=1) — that one is always open
    //   - there exists at least one published recitation in this course with
    //     section_id = <this section> that the student has NOT passed
    // The lock applies to the whole section: videos / pdfs / recitations inside
    // are hidden until unlocked.
    let sectionLockInfo = new Map(); // section_id → { required, passed, hasUnpassed }
    if (isStudent) {
      // [B5] Single round-trip: combine gate + progress with FILTER clauses.
      const { rows: gateRows } = await pool.query(
        `SELECT r.section_id,
                count(*)::int AS total,
                count(*) FILTER (WHERE rr.passed = true)::int AS passed,
                bool_or(rr.passed IS NULL OR rr.passed = false) AS has_unpassed
           FROM recitations r
           LEFT JOIN recitation_results rr
             ON rr.recitation_id = r.id AND rr.student_id = $2
               AND (rr.is_absent IS NULL OR rr.is_absent=false)
          WHERE r.course_id = $1
            AND r.is_published = true
            AND r.deleted_at IS NULL
            AND r.section_id IS NOT NULL
          GROUP BY r.section_id`,
        [courseId, req.user.id]
      );
      sectionLockInfo = new Map(
        gateRows.map(r => [
          Number(r.section_id),
          { required: r.total, passed: r.passed, hasUnpassed: r.has_unpassed },
        ])
      );
    }

    // Identify the "first section" by sort_order. If none exists, treat as no
    // sections at all (legacy flat-list mode — student UI will fallback).
    const sortedSections = [...sectionRows].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );
    const firstSectionId = sortedSections.length ? Number(sortedSections[0].id) : null;

    // Annotate each section with lock state
    const sectionRowsAnnotated = sortedSections.map(s => {
      const id = Number(s.id);
      const lock = sectionLockInfo.get(id);
      const isFirst = firstSectionId === id;
      const isLocked = isStudent && !isFirst && lock?.hasUnpassed === true;
      return {
        ...s,
        is_unlocked_for_student: isStudent ? !isLocked : true,
        gate_progress: lock ? { required: lock.required || 0, passed: lock.passed || 0 } : null,
      };
    });

    // Annotate videos with is_locked (kept for legacy code-paths that still
    // inspect videos directly — the new section-level UI ignores this and
    // hides whole sections instead).
    let videoRows = videoRowsRaw;
    if (isStudent) {
      videoRows = videoRows.map((v) => {
        const ytId = extractYoutubeId(v.file_path_or_url);
        const base = ytId
          ? { ...v, provider: 'youtube', youtube_id: ytId, file_path_or_url: undefined }
          : { ...v, provider: 'upload', youtube_id: null };
        return { ...base, is_locked: false };
      });
    }

    // Nest videos / pdfs / recitations under each section (and an _uncategorized
    // bucket for items without section_id, when no sections exist).
    const videoBySection = new Map();
    const pdfBySection = new Map();
    const recBySection = new Map();
    for (const v of videoRows) {
      const key = v.section_id ? Number(v.section_id) : '_none';
      if (!videoBySection.has(key)) videoBySection.set(key, []);
      videoBySection.get(key).push(v);
    }
    for (const p of pdfRows) {
      const key = p.section_id ? Number(p.section_id) : '_none';
      if (!pdfBySection.has(key)) pdfBySection.set(key, []);
      pdfBySection.get(key).push(p);
    }
    for (const r of recitationRows) {
      const key = r.section_id ? Number(r.section_id) : '_none';
      if (!recBySection.has(key)) recBySection.set(key, []);
      recBySection.get(key).push(r);
    }

    const sectionsPayload = sectionRowsAnnotated.map(s => ({
      ...s,
      videos: videoBySection.get(Number(s.id)) || [],
      pdfs: pdfBySection.get(Number(s.id)) || [],
      recitations: recBySection.get(Number(s.id)) || [],
    }));

    // Build an "uncategorized" section when there are items without a section
    // AND the course has no sections at all (legacy fallback for teachers who
    // haven't created any chapters). When sections exist, items without a
    // section_id still appear under "_none" so the teacher can move them.
    const uncategorized =
      videoBySection.get('_none')?.length ||
      pdfBySection.get('_none')?.length ||
      recBySection.get('_none')?.length
        ? {
            id: null,
            title: 'بدون فصل',
            sort_order: 999999,
            is_unlocked_for_student: true,
            gate_progress: null,
            videos: videoBySection.get('_none') || [],
            pdfs: pdfBySection.get('_none') || [],
            recitations: recBySection.get('_none') || [],
          }
        : null;

    res.json({
      sections: sectionsPayload,
      uncategorized,
      // Legacy flat fields — kept so existing frontend code paths keep working
      // while we migrate. CourseContent (teacher) and CourseView (student) will
      // move to sections[] over the next phase.
      videos: videoRows,
      pdfs: pdfRows,
      exams: examRows,
    });
  } catch (err) {
    console.error('[courses GET /:id/content]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/sections', requireRole('teacher', 'assistant'), checkManageCoursesPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { title } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
  try {
    if (!(await verifyCourseOwnership(req.params.id, teacherId))) {
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
    if (!(await verifyCourseOwnership(req.params.id, teacherId))) {
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
  if (!(await verifyCourseOwnership(req.params.id, teacherId))) {
    return res.status(403).json({ error: 'Access denied: course not yours' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE videos SET section_id=NULL WHERE section_id=$1', [req.params.sectionId]);
    await client.query('UPDATE pdf_files SET section_id=NULL WHERE section_id=$1', [req.params.sectionId]);
    // [Phase-7] Section deletion also unlinks any recitations that gated it,
    // otherwise those recitations would dangle pointing at a non-existent
    // section and confuse the student gate-progress UI.
    await client.query('UPDATE recitations SET section_id=NULL WHERE section_id=$1 AND course_id=$2', [req.params.sectionId, req.params.id]);
    await client.query('DELETE FROM sections WHERE id=$1 AND course_id=$2', [req.params.sectionId, req.params.id]);
    await client.query('COMMIT');
    res.json({ message: 'Section deleted' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

router.put('/:id/videos/:videoId/section', requireRole('teacher', 'assistant'), checkManageCoursesPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { section_id } = req.body;
  try {
    if (!(await verifyCourseOwnership(req.params.id, teacherId))) {
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
    if (!(await verifyCourseOwnership(req.params.id, teacherId))) {
      return res.status(403).json({ error: 'Access denied: course not yours' });
    }
    await pool.query('UPDATE pdf_files SET section_id=$1 WHERE id=$2 AND course_id=$3', [section_id || null, req.params.pdfId, req.params.id]);
    res.json({ message: 'Updated' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// [Phase-7] Move a recitation to a different section (or to no section).
// The recitation's `section_id` is what gates access — when set, the student
// must pass the recitation to unlock that section's content.
router.put('/:id/recitations/:recitationId/section', requireRole('teacher', 'assistant'), checkManageCoursesPerm, async (req, res) => {
  const teacherId = getTeacherId(req);

  // [B2/B3] Validate that courseId + recitationId route params are real
  // integers BEFORE running any SQL. Otherwise PostgreSQL throws "invalid
  // input syntax for type integer" and we leak a 500.
  const courseId = parseParamId(req.params.id);
  if (!courseId) return res.status(400).json({ error: 'Invalid course ID' });
  const recitationId = parseParamId(req.params.recitationId);
  if (!recitationId) return res.status(400).json({ error: 'Invalid recitation ID' });

  // Coerce section_id the same way — same reasoning.
  const rawSectionId = parseInt(req.body?.section_id, 10);
  const sectionId = Number.isFinite(rawSectionId) && rawSectionId > 0 ? rawSectionId : null;

  try {
    if (!(await verifyCourseOwnership(courseId, teacherId))) {
      return res.status(403).json({ error: 'Access denied: course not yours' });
    }
    if (sectionId) {
      const { rows: sRows } = await pool.query(
        'SELECT id FROM sections WHERE id=$1 AND course_id=$2',
        [sectionId, courseId]
      );
      if (!sRows.length) {
        return res.status(400).json({ error: 'الفصل المحدد لا ينتمي لهذا الكورس' });
      }
    }
    // Verify the recitation belongs to this teacher & course.
    const { rows: rRows } = await pool.query(
      'SELECT id FROM recitations WHERE id=$1 AND course_id=$2 AND teacher_id=$3 AND deleted_at IS NULL',
      [recitationId, courseId, teacherId]
    );
    if (!rRows.length) {
      return res.status(404).json({ error: 'التسميع غير موجود' });
    }
    await pool.query(
      'UPDATE recitations SET section_id=$1 WHERE id=$2',
      [sectionId, recitationId]
    );
    res.json({ message: 'Updated' });
  } catch (err) {
    console.error('[courses PUT recitation/section]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/videos/url', requireRole('teacher', 'assistant'), checkManageCoursesPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    if (!(await verifyCourseOwnership(req.params.id, teacherId))) {
      return res.status(403).json({ error: 'Access denied: course not yours' });
    }
    const { title, url, duration_minutes, sort_order, section_id, url_480, url_720, url_1080 } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'عنوان الفيديو مطلوب' });
    if (!url?.trim()) return res.status(400).json({ error: 'رابط الفيديو مطلوب' });
    if (!/^https?:\/\//.test(url.trim()) && !url.trim().startsWith('/uploads/'))
      return res.status(400).json({ error: 'رابط الفيديو غير صالح' });
    if (section_id) {
      const secCheck = await pool.query('SELECT id FROM sections WHERE id=$1 AND course_id=$2', [section_id, req.params.id]);
      if (!secCheck.rows.length) return res.status(400).json({ error: 'القسم المحدد لا ينتمي لهذا الكورس' });
    }
    const result = await pool.query(
      'INSERT INTO videos (title,file_path_or_url,duration_minutes,course_id,sort_order,section_id,url_480,url_720,url_1080) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [title.trim(), url.trim(), parseInt(duration_minutes) || 0, req.params.id, parseInt(sort_order) || 0, section_id || null, url_480?.trim() || null, url_720?.trim() || null, url_1080?.trim() || null]
    );
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'add_video_url',
      entity: { type: 'course', id: parseInt(req.params.id), name: title.trim() },
      details: { video_id: result.rows[0].id },
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/pdfs/upload', requireRole('teacher', 'assistant'), checkManageCoursesPerm, preCheckOwnership, withMulterErrors(uploadPdf.single('pdf')), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });
    // [M-11] FIX: validate PDF magic bytes
    const diskPath = req.file.path;
    const validPdf = await isValidPdf(diskPath);
    if (!validPdf) {
      deleteFile(diskPath);
      return res.status(400).json({ error: 'الملف المرفوع ليس PDF صالح — يُرجى رفع ملف PDF حقيقي' });
    }

    // Optimize and linearize PDF (Fast Web View & stream compression)
    try {
      await optimizeAndLinearizePdf(diskPath);
    } catch (optErr) {
      console.warn('[courses/upload_pdf] Optimization warning:', optErr.message);
    }

    const { title, section_id } = req.body;
    if (section_id) {
      const secCheck = await pool.query('SELECT id FROM sections WHERE id=$1 AND course_id=$2', [section_id, req.params.id]);
      if (!secCheck.rows.length) return res.status(400).json({ error: 'القسم المحدد لا ينتمي لهذا الكورس' });
    }
    const filePath = `/uploads/pdfs/${req.file.filename}`;
    const pdfTitle = title || req.file.originalname;
    const result = await pool.query(
      'INSERT INTO pdf_files (title,file_url,course_id,section_id) VALUES($1,$2,$3,$4) RETURNING *',
      [pdfTitle, filePath, req.params.id, section_id || null]
    );
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'upload_pdf',
      entity: { type: 'course', id: parseInt(req.params.id), name: pdfTitle },
      details: { pdf_id: result.rows[0].id, file: req.file.originalname },
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/videos/:videoId', requireRole('teacher', 'assistant'), checkManageCoursesPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    if (!(await verifyCourseOwnership(req.params.id, teacherId))) {
      return res.status(403).json({ error: 'Access denied: course not yours' });
    }
    const parseParamId = (v) => { if (!/^\d+$/.test(String(v))) return null; const n = parseInt(v, 10); return n > 0 && n <= 2147483647 ? n : null; };
    const videoId = parseParamId(req.params.videoId);
    if (!videoId) return res.status(400).json({ error: 'معرف الفيديو غير صالح' });

    const existing = await pool.query('SELECT * FROM videos WHERE id=$1 AND course_id=$2', [videoId, req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'الفيديو غير موجود' });
    const v = existing.rows[0];

    // Only URL-based videos can be edited (not uploaded files)
    if (v.file_path_or_url?.startsWith('/uploads/')) {
      return res.status(400).json({ error: 'لا يمكن تعديل بيانات فيديو مرفوع' });
    }

    const { title, url, duration_minutes } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'عنوان الفيديو مطلوب' });
    if (!url?.trim()) return res.status(400).json({ error: 'رابط الفيديو مطلوب' });
    if (!/^https?:\/\//.test(url.trim()))
      return res.status(400).json({ error: 'رابط الفيديو غير صالح' });

    const updated = await pool.query(
      'UPDATE videos SET title=$1, file_path_or_url=$2, duration_minutes=$3 WHERE id=$4 AND course_id=$5 RETURNING *',
      [title.trim(), url.trim(), parseInt(duration_minutes) || 0, videoId, req.params.id]
    );
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'edit_video_url',
      entity: { type: 'course', id: parseInt(req.params.id), name: title.trim() },
      details: { video_id: videoId },
    });
    res.json(updated.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id/videos/:videoId', requireRole('teacher', 'assistant'), checkManageCoursesPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    if (!(await verifyCourseOwnership(req.params.id, teacherId))) {
      return res.status(403).json({ error: 'Access denied: course not yours' });
    }
    const v = await pool.query('SELECT title, file_path_or_url FROM videos WHERE id=$1 AND course_id=$2', [req.params.videoId, req.params.id]);
    if (!v.rows.length) return res.status(404).json({ error: 'Video not found' });
    if (v.rows[0].file_path_or_url?.startsWith('/uploads/')) {
      const uploadsRoot = path.resolve(__dirname, '../../uploads');
      const fp = path.resolve(__dirname, '../../', v.rows[0].file_path_or_url.replace(/^\//, ''));
      if (fp.startsWith(uploadsRoot) && fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await pool.query('DELETE FROM videos WHERE id=$1 AND course_id=$2', [req.params.videoId, req.params.id]);
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'delete_video',
      entity: { type: 'course', id: parseInt(req.params.id), name: v.rows[0].title },
      details: { video_id: parseInt(req.params.videoId) },
    });
    res.json({ message: 'Video deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id/pdfs/:pdfId', requireRole('teacher', 'assistant'), checkManageCoursesPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    if (!(await verifyCourseOwnership(req.params.id, teacherId))) {
      return res.status(403).json({ error: 'Access denied: course not yours' });
    }
    const p = await pool.query('SELECT title, file_url FROM pdf_files WHERE id=$1 AND course_id=$2', [req.params.pdfId, req.params.id]);
    if (!p.rows.length) return res.status(404).json({ error: 'PDF not found' });
    if (p.rows[0].file_url?.startsWith('/uploads/')) {
      const uploadsRoot = path.resolve(__dirname, '../../uploads');
      const fp = path.resolve(__dirname, '../../', p.rows[0].file_url.replace(/^\//, ''));
      if (fp.startsWith(uploadsRoot) && fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await pool.query('DELETE FROM pdf_files WHERE id=$1 AND course_id=$2', [req.params.pdfId, req.params.id]);
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'delete_pdf',
      entity: { type: 'course', id: parseInt(req.params.id), name: p.rows[0].title },
      details: { pdf_id: parseInt(req.params.pdfId) },
    });
    res.json({ message: 'PDF deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/enroll/:studentId', requireRole('teacher', 'assistant'), checkManageCoursesPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    if (!(await verifyCourseOwnership(req.params.id, teacherId))) {
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
    const courseName = (await pool.query('SELECT name FROM courses WHERE id=$1', [req.params.id]).catch(() => ({ rows: [] }))).rows[0]?.name;
    const studentName = (await pool.query('SELECT name FROM students WHERE id=$1', [req.params.studentId]).catch(() => ({ rows: [] }))).rows[0]?.name;
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'enroll_student',
      entity: { type: 'course', id: parseInt(req.params.id, 10), name: courseName },
      details: { student_name: studentName },
    });
    res.json({ message: 'Student enrolled' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/student/my-courses', requireRole('student'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, sce.enrollment_date, sce.status,
              COUNT(DISTINCT v.id)::int as video_count, COUNT(DISTINCT p.id)::int as pdf_count
       FROM courses c
       JOIN student_course_enrollment sce ON c.id = sce.course_id
       JOIN students st ON st.id = $1 AND st.teacher_id = c.teacher_id
       LEFT JOIN videos v ON c.id = v.course_id
       LEFT JOIN pdf_files p ON c.id = p.course_id
       WHERE sce.student_id = $1
         AND sce.status = 'active'
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
              COUNT(DISTINCT v.id)::int as video_count, COUNT(DISTINCT p.id)::int as pdf_count,
              sce.student_id IS NOT NULL as is_enrolled,
              cer.status as request_status, cer.id as request_id
       FROM courses c
       LEFT JOIN videos v ON c.id = v.course_id
       LEFT JOIN pdf_files p ON c.id = p.course_id
       LEFT JOIN student_course_enrollment sce ON c.id = sce.course_id AND sce.student_id = $1 AND sce.status = 'active'
       LEFT JOIN LATERAL (
         SELECT id, status FROM course_enrollment_requests
         WHERE course_id = c.id AND student_id = $1
         ORDER BY created_at DESC LIMIT 1
       ) cer ON true
       WHERE c.teacher_id = $2
         AND c.is_published = true
         AND (c.target_stage = $3 OR c.target_stage IS NULL OR c.target_stage = '')
       GROUP BY c.id, sce.student_id, sce.status, cer.status, cer.id
       ORDER BY c.created_at DESC`,
      [req.user.id, teacherId, studentStage]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

const courseRequestLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => `course_req_${req.user?.id}`,
  message: { error: 'لقد قمت بتقديم العديد من طلبات الالتحاق، يرجى الانتظار قليلاً' }
});

router.post('/student/request/:courseId', courseRequestLimiter, requireRole('student'), async (req, res) => {
  const courseId = parseParamId(req.params.courseId);
  if (!courseId) return res.status(400).json({ error: 'Invalid course ID' });
  const { message } = req.body;
  try {
    const teacherRes = await pool.query('SELECT teacher_id FROM students WHERE id=$1', [req.user.id]);
    if (!teacherRes.rows.length) return res.status(404).json({ error: 'Student not found' });
    const teacherId = teacherRes.rows[0].teacher_id;

    const courseCheck = await pool.query('SELECT id, price, is_free, name, is_published FROM courses WHERE id=$1 AND teacher_id=$2', [courseId, teacherId]);
    if (!courseCheck.rows.length) return res.status(403).json({ error: 'Course not available' });
    const course = courseCheck.rows[0];

    if (!course.is_published) return res.status(403).json({ error: 'Course is not published' });

    // BUG-10: only block if the student has an *active* enrollment — inactive rows allow re-request
    const enrolled = await pool.query(
      "SELECT id FROM student_course_enrollment WHERE student_id=$1 AND course_id=$2 AND status='active'",
      [req.user.id, courseId]
    );
    if (enrolled.rows.length) return res.status(409).json({ error: 'Already enrolled' });

    // Free course: auto-enroll directly without needing teacher approval.
    // BUG-11: use UPSERT so an existing *inactive* row is re-activated instead of silently ignored.
    if (course.is_free) {
      await pool.query(
        `INSERT INTO student_course_enrollment (student_id, course_id, status)
         VALUES($1,$2,'active')
         ON CONFLICT (student_id, course_id) DO UPDATE SET status='active'`,
        [req.user.id, courseId]
      );
      sendEvent(`student_${req.user.id}`, 'enrollment_approved', { course_name: course.name, courseId });
      return res.status(201).json({ enrolled: true, message: 'تم التسجيل تلقائياً في الكورس المجاني' });
    }

    const result = await pool.query(
      `INSERT INTO course_enrollment_requests (student_id, course_id, message)
       VALUES ($1, $2, $3)
       ON CONFLICT (student_id, course_id) DO UPDATE SET status='pending', message=EXCLUDED.message
       RETURNING *`,
      [req.user.id, courseId, message || null]
    );

    if (parseFloat(course.price) > 0) {
      await pool.query(
        `INSERT INTO payments (student_id, course_id, amount, method, status)
         SELECT $1, $2, $3, '', 'pending'
         WHERE NOT EXISTS (
           SELECT 1 FROM payments
           WHERE student_id = $1 AND course_id = $2 AND status != 'rejected'
         )`,
        [req.user.id, courseId, course.price]
      );
    }

    try {
      const studentInfo = await pool.query('SELECT name FROM students WHERE id=$1', [req.user.id]);
      const studentName = studentInfo.rows[0]?.name || 'طالب';
      sendEvent(`teacher_${teacherId}`, 'new_request', {
        student_name: studentName,
        course_name: course.name,
        courseId,
      });
    } catch (_) {}
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/enrollment-requests', requireRole('teacher', 'assistant'), checkManageCoursesPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query(
      `SELECT cer.*,
              s.name as student_name, s.academic_stage, s.phone,
              c.name as course_name, c.price as course_price, c.is_free as course_is_free,
              pay.payment_status,
              pay.paid_amount,
              pay.payment_method,
              pay.payment_date
       FROM course_enrollment_requests cer
       JOIN students s ON cer.student_id = s.id
       JOIN courses c ON cer.course_id = c.id
       LEFT JOIN LATERAL (
         SELECT
           MAX(p.status)        FILTER (WHERE p.status = 'verified')  AS payment_status,
           SUM(p.amount)        FILTER (WHERE p.status = 'verified')  AS paid_amount,
           MAX(p.method)        FILTER (WHERE p.status = 'verified')  AS payment_method,
           MAX(p.payment_date)  FILTER (WHERE p.status = 'verified')  AS payment_date
         FROM payments p
         WHERE p.student_id = cer.student_id AND p.course_id = cer.course_id
       ) pay ON true
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
  const reqId = parseParamId(req.params.id);
  if (!reqId) return res.status(400).json({ error: 'Invalid request ID' });
  const teacherId = getTeacherId(req);
  const { action } = req.body;
  if (!['approve', 'reject'].includes(action))
    return res.status(400).json({ error: 'الإجراء غير صالح — يجب أن يكون approve أو reject' });
  try {
    const reqRes = await pool.query(
      `SELECT cer.* FROM course_enrollment_requests cer
       JOIN courses c ON cer.course_id = c.id
       WHERE cer.id = $1 AND c.teacher_id = $2`,
      [reqId, teacherId]
    );
    if (!reqRes.rows.length) return res.status(404).json({ error: 'Request not found' });
    const enrReq = reqRes.rows[0];

    const courseInfo = await pool.query('SELECT name, is_free, price FROM courses WHERE id=$1', [enrReq.course_id]);
    const course = courseInfo.rows[0];
    const courseName = course?.name || '';

    if (action === 'approve') {
      // M-8 fix: for paid courses, require a verified payment before enrolling.
      // This prevents approving enrollment requests that have no payment record,
      // which would give free access to paid content.
      if (course && !course.is_free) {
        const payCheck = await pool.query(
          `SELECT id FROM payments
           WHERE student_id=$1 AND course_id=$2 AND status='verified' LIMIT 1`,
          [enrReq.student_id, enrReq.course_id]
        );
        if (payCheck.rows.length === 0) {
          return res.status(402).json({
            error: 'لا يمكن قبول الطلب — لم يُتحقق من الدفع بعد. قم بالتحقق من الدفع أولاً من صفحة المدفوعات.',
            code: 'PAYMENT_NOT_VERIFIED',
          });
        }
      }

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
      logActivity({
        teacherId, actor: getActor(req), ip: getIp(req),
        action: 'review_enrollment_request',
        entity: { type: 'course', id: enrReq.course_id, name: courseName },
        details: { decision: 'approved', student_id: enrReq.student_id },
      });
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
      logActivity({
        teacherId, actor: getActor(req), ip: getIp(req),
        action: 'review_enrollment_request',
        entity: { type: 'course', id: enrReq.course_id, name: courseName },
        details: { decision: 'rejected', student_id: enrReq.student_id },
      });
    }
    res.json({ success: true, action });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
