const express   = require('express');
const rateLimit = require('express-rate-limit');
const pool      = require('../db/connection');
const router    = express.Router();

const parentLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'طلبات كثيرة جداً — انتظر دقيقة ثم حاول مجدداً' },
});

// Public landing page info — scoped by teacher slug
router.get('/info', async (req, res) => {
  const { slug } = req.query;
  try {
    let teacherRes;
    if (slug) {
      teacherRes = await pool.query(
        'SELECT id, name, bio, classification, logo_url, photo_url, whatsapp_phone, platform_name, slug, created_at FROM teachers WHERE slug = $1',
        [slug]
      );
    } else {
      teacherRes = await pool.query(
        'SELECT id, name, bio, classification, logo_url, photo_url, whatsapp_phone, platform_name, slug, created_at FROM teachers ORDER BY id LIMIT 1'
      );
    }

    if (teacherRes.rows.length === 0) {
      return res.status(404).json({ error: 'المعلم غير موجود' });
    }

    const teacher = teacherRes.rows[0];
    const tid = teacher.id;

    const [stats, courses, assistants] = await Promise.all([
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM students   WHERE teacher_id=$1 AND deleted_at IS NULL) AS total_students,
          (SELECT COUNT(*) FROM courses    WHERE teacher_id=$1 AND is_published = true) AS total_courses,
          (SELECT COUNT(*) FROM exams      WHERE teacher_id=$1 AND is_published = true) AS total_exams,
          (SELECT COUNT(*) FROM exam_results er JOIN exams e ON e.id = er.exam_id WHERE e.teacher_id=$1) AS total_results
      `, [tid]),
      pool.query(
        'SELECT id, name, description, price, thumbnail_url, target_stage, created_at FROM courses WHERE teacher_id=$1 AND is_published = true AND price > 0 ORDER BY price DESC LIMIT 3',
        [tid]
      ),
      pool.query(
        'SELECT id, name FROM assistants WHERE teacher_id=$1 ORDER BY id LIMIT 10',
        [tid]
      ),
    ]);

    res.json({ teacher, stats: stats.rows[0], courses: courses.rows, assistants: assistants.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Check if a teacher slug exists
router.get('/teacher/:slug', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, slug, platform_name, logo_url FROM teachers WHERE slug = $1',
      [req.params.slug]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'المعلم غير موجود' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Parent portal — lookup student results by parent phone, scoped to teacher slug
router.get('/parent-lookup', parentLookupLimiter, async (req, res) => {
  const { phone, slug } = req.query;
  if (!phone || phone.trim().length < 7) {
    return res.status(400).json({ error: 'رقم الهاتف غير صحيح' });
  }

  try {
    // Resolve teacher id from slug
    let teacherId = null;
    if (slug) {
      const tRes = await pool.query('SELECT id FROM teachers WHERE slug = $1', [slug]);
      if (tRes.rows.length > 0) teacherId = tRes.rows[0].id;
    }

    // Slug is required — never fall back to cross-teacher search
    if (!teacherId) {
      return res.status(400).json({ error: 'معرّف المنصة مطلوب' });
    }

    // Find student by parent phone, strictly scoped to this teacher
    const studentRes = await pool.query(
      'SELECT id, name, phone, parent_phone, academic_stage, gender, points, created_at FROM students WHERE parent_phone = $1 AND teacher_id = $2 AND deleted_at IS NULL',
      [phone.trim(), teacherId]
    );

    if (studentRes.rows.length === 0) {
      return res.status(404).json({ error: 'لم يتم العثور على طالب مرتبط بهذا الرقم' });
    }

    const student = studentRes.rows[0];
    const sid = student.id;

    const [coursesRes, examsRes, videoProgressRes, rankRes] = await Promise.all([
      pool.query(
        `SELECT c.id, c.name, c.description, c.thumbnail_url, c.target_stage, sce.enrollment_date, sce.status
         FROM student_course_enrollment sce
         JOIN courses c ON c.id = sce.course_id
         WHERE sce.student_id = $1
         ORDER BY sce.enrollment_date DESC`,
        [sid]
      ),
      pool.query(
        `SELECT er.id, er.score, er.correct_count, er.wrong_count, er.unanswered_count,
                er.created_at, e.title AS exam_title, e.total_score, e.pass_score,
                c.name AS course_name
         FROM exam_results er
         JOIN exams e ON e.id = er.exam_id
         LEFT JOIN courses c ON c.id = e.course_id
         WHERE er.student_id = $1
         ORDER BY er.created_at DESC`,
        [sid]
      ),
      pool.query(
        `SELECT COUNT(DISTINCT vp.video_id) AS videos_started,
                COALESCE(SUM(vp.watched_minutes), 0) AS total_watched_minutes,
                COALESCE(AVG(vp.progress_percentage), 0) AS avg_progress
         FROM video_progress vp
         WHERE vp.student_id = $1`,
        [sid]
      ),
      // Rank within this teacher's students only
      pool.query(
        'SELECT COUNT(*) + 1 AS rank FROM students WHERE points > $1 AND teacher_id = $2 AND deleted_at IS NULL',
        [student.points, teacherId]
      ),
    ]);

    res.json({
      student: {
        name: student.name,
        academic_stage: student.academic_stage,
        gender: student.gender,
        points: student.points,
        created_at: student.created_at,
        rank: parseInt(rankRes.rows[0].rank),
      },
      courses: coursesRes.rows,
      exam_results: examsRes.rows,
      video_progress: videoProgressRes.rows[0],
    });
  } catch (err) {
    console.error('Parent lookup error:', err);
    res.status(500).json({ error: 'حدث خطأ في الخادم' });
  }
});

// Dynamic PWA manifest — scoped to a specific teacher slug
router.get('/manifest/:slug', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT name, platform_name, logo_url FROM teachers WHERE slug = $1',
      [req.params.slug]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const t = result.rows[0];
    const appName  = t.platform_name || t.name || 'منصة تعليمية';
    const shortName = appName.length > 14 ? appName.slice(0, 14) : appName;

    const rawLogo = t.logo_url;
    const logoSrc = rawLogo
      ? (rawLogo.startsWith('http') ? rawLogo : `${req.protocol}://${req.get('host')}${rawLogo.startsWith('/') ? '' : '/'}${rawLogo}`)
      : null;

    const icons = logoSrc
      ? [
          { src: logoSrc, sizes: '48x48',   type: 'image/png', purpose: 'any' },
          { src: logoSrc, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: logoSrc, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ]
      : [
          { src: '/icon-48.png',  sizes: '48x48',   type: 'image/png', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ];

    const manifest = {
      name:             appName,
      short_name:       shortName,
      description:      `منصة ${appName} التعليمية`,
      start_url:        `/${req.params.slug}/student`,
      scope:            `/${req.params.slug}/`,
      display:          'standalone',
      orientation:      'portrait',
      background_color: '#0F0E15',
      theme_color:      '#f97316',
      lang:             'ar',
      dir:              'rtl',
      icons,
      categories: ['education'],
      shortcuts: [
        {
          name:      'لوحتي',
          short_name:'لوحتي',
          url:       `/${req.params.slug}/student`,
          icons:     [{ src: logoSrc || '/icon-192.png', sizes: '192x192' }],
        },
        {
          name:      'كورساتي',
          short_name:'كورسات',
          url:       `/${req.params.slug}/student/courses`,
          icons:     [{ src: logoSrc || '/icon-192.png', sizes: '192x192' }],
        },
      ],
    };

    res.setHeader('Content-Type', 'application/manifest+json');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(manifest);
  } catch (err) {
    console.error('Manifest error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
