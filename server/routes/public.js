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

// R-8 / R-6 OPT: lightweight TTL cache for public endpoints.
// /info (teacher profile stats) → 5 min  |  parent-lookup rank → 2 min
const _pubCache = new Map();
function _pubGet(key, ttl) {
  const e = _pubCache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > ttl) { _pubCache.delete(key); return null; }
  return e.data;
}
function _pubSet(key, data) { _pubCache.set(key, { data, ts: Date.now() }); }
const PUB_TTL_5MIN = 5 * 60 * 1000;
const PUB_TTL_2MIN = 2 * 60 * 1000;

// Allow admin routes to invalidate the pub_info cache when teacher data changes
// (e.g. after PUT /api/admin/teachers/:id updates photo_url or other profile fields)
function invalidatePubInfoCache(slug) {
  if (slug) _pubCache.delete(`pub_info_${slug}`);
}

// Public landing page info — scoped by tenant (subdomain or X-Tenant-Slug header)
router.get('/info', async (req, res) => {
  // Tenant must be resolved by subdomainTenant middleware — never fall back to
  // query params or first-in-DB, both of which bypass tenant isolation.
  const slug = req.tenantSlug;
  if (!slug) return res.status(400).json({ error: 'معرّف المنصة مطلوب' });

  try {
    // R-8 OPT: cache full /info response per slug — teacher profile + stats rarely change
    const infoCacheKey = `pub_info_${slug}`;
    const cachedInfo = _pubGet(infoCacheKey, PUB_TTL_5MIN);
    if (cachedInfo) return res.json(cachedInfo);

    const teacherRes = await pool.query(
      'SELECT id, name, bio, classification, logo_url, photo_url, background_image_url, whatsapp_phone, platform_name, slug, features_enabled, created_at FROM teachers WHERE slug = $1',
      [slug]
    );

    if (teacherRes.rows.length === 0) {
      return res.status(404).json({ error: 'المعلم غير موجود' });
    }

    const teacher = teacherRes.rows[0];
    const tid = teacher.id;

    const [stats, supportContacts, topCourses, teamResult] = await Promise.all([
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM students   WHERE teacher_id=$1 AND deleted_at IS NULL) AS total_students,
          (SELECT COUNT(*) FROM courses    WHERE teacher_id=$1 AND is_published = true) AS total_courses,
          (SELECT COUNT(*) FROM exams      WHERE teacher_id=$1 AND is_published = true) AS total_exams,
          (SELECT COUNT(*) FROM exam_results er JOIN exams e ON e.id = er.exam_id WHERE e.teacher_id=$1) AS total_results,
          (SELECT COUNT(*) FROM videos v JOIN courses c ON c.id = v.course_id WHERE c.teacher_id=$1 AND c.is_published = true) AS total_videos
      `, [tid]),
      pool.query(
        'SELECT id, name, phone, photo_url FROM teacher_support_contacts WHERE teacher_id=$1 ORDER BY sort_order, id LIMIT 10',
        [tid]
      ),
      pool.query(`
        SELECT c.id, c.name, c.description, c.price, c.is_free, c.thumbnail_url, c.target_stage,
               COUNT(DISTINCT vp.student_id) AS views_count
        FROM courses c
        LEFT JOIN videos v ON v.course_id = c.id
        LEFT JOIN video_progress vp ON vp.video_id = v.id
        WHERE c.teacher_id = $1 AND c.is_published = true
        GROUP BY c.id
        ORDER BY views_count DESC, c.created_at DESC
        LIMIT 3
      `, [tid]),
      pool.query(
        'SELECT name, role_title, photo_url, whatsapp_phone FROM teacher_team_members WHERE teacher_id = $1 ORDER BY display_order',
        [tid]
      ),
    ]);

    const infoResponse = {
      teacher,
      stats: stats.rows[0],
      supportContacts: supportContacts.rows,
      topCourses: topCourses.rows,
      team: teamResult.rows,
    };
    _pubSet(infoCacheKey, infoResponse);
    res.json(infoResponse);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});


// Parent portal — lookup student results by parent phone, scoped to teacher
router.get('/parent-lookup', parentLookupLimiter, async (req, res) => {
  const { phone } = req.query;
  if (!phone || phone.trim().length < 7) {
    return res.status(400).json({ error: 'رقم الهاتف غير صحيح' });
  }

  try {
    const teacherId = req.tenantTeacherId || null;

    // Tenant is required — never fall back to cross-teacher search
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

    // R-6 OPT: cache rank per student (2 min TTL) — skips COUNT(*) query when fresh
    const rankCacheKey = `pub_rank_${teacherId}_${sid}`;
    const cachedRank   = _pubGet(rankCacheKey, PUB_TTL_2MIN);

    const queries = [
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
    ];
    // Only run the COUNT rank query when not cached
    if (!cachedRank) {
      queries.push(
        pool.query(
          'SELECT COUNT(*) + 1 AS rank FROM students WHERE points > $1 AND teacher_id = $2 AND deleted_at IS NULL',
          [student.points, teacherId]
        )
      );
    }

    const [coursesRes, examsRes, videoProgressRes, rankRes] = await Promise.all(queries);

    const rank = cachedRank ?? (() => {
      const r = parseInt(rankRes.rows[0].rank);
      _pubSet(rankCacheKey, r);
      return r;
    })();

    res.json({
      student: {
        name: student.name,
        academic_stage: student.academic_stage,
        gender: student.gender,
        points: student.points,
        created_at: student.created_at,
        rank,
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

// Dynamic PWA manifest — scoped to current tenant (subdomain or X-Tenant-Slug)
async function buildManifest(req, slug) {
  const result = await pool.query(
    'SELECT name, platform_name, pwa_name, logo_url FROM teachers WHERE slug = $1',
    [slug]
  );
  if (result.rows.length === 0) return null;

  const t = result.rows[0];
  const appName   = t.platform_name || t.name || 'منصة تعليمية';
  // pwa_name is the admin-configured short label for the phone home screen icon.
  // Fall back to appName if not set (no artificial truncation — admin controls the length).
  const shortName = t.pwa_name || appName;

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

  return {
    name:             appName,
    short_name:       shortName,
    description:      `منصة ${appName} التعليمية`,
    start_url:        '/student',
    scope:            '/',
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
        url:       '/student',
        icons:     [{ src: logoSrc || '/icon-192.png', sizes: '192x192' }],
      },
      {
        name:      'كورساتي',
        short_name:'كورسات',
        url:       '/student/courses',
        icons:     [{ src: logoSrc || '/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}

// Subdomain-based manifest (no slug in URL)
router.get('/manifest', async (req, res) => {
  try {
    const slug = req.tenantSlug;
    if (!slug) return res.status(400).json({ error: 'No tenant' });
    const manifest = await buildManifest(req, slug);
    if (!manifest) return res.status(404).json({ error: 'Not found' });
    res.setHeader('Content-Type', 'application/manifest+json');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(manifest);
  } catch (err) {
    console.error('Manifest error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// Attach to router so callers can do:
//   const { invalidatePubInfoCache } = require('./public');
router.invalidatePubInfoCache = invalidatePubInfoCache;

module.exports = router;
