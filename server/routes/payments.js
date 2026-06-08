const express = require('express');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { getPermissions } = require('../lib/permissionsCache');
const { validatePayment } = require('../middleware/validate');
const { logActivity, getActor, getIp } = require('../lib/activityLog');

const router = express.Router();
router.use(authenticate);

const getTeacherId = (req) => req.user.role === 'teacher' ? req.user.id : req.user.teacher_id;

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

// ─── helper: get Arabic month+year label ───────────────────────────────────
function getArabicMonthLabel(date) {
  const months = [
    'يناير','فبراير','مارس','أبريل','مايو','يونيو',
    'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
  ];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

// ─── helper: check & auto-reset leaderboard if 30 days passed ──────────────
async function checkAndResetLeaderboard(teacherId) {
  try {
    const trackerRes = await pool.query(
      'SELECT * FROM leaderboard_reset_tracker WHERE teacher_id=$1',
      [teacherId]
    );

    const now = new Date();

    if (trackerRes.rows.length === 0) {
      // First time: init tracker, no reset yet
      await pool.query(
        `INSERT INTO leaderboard_reset_tracker (teacher_id, last_reset_at, next_reset_at)
         VALUES ($1, NOW(), NOW() + INTERVAL '30 days')
         ON CONFLICT (teacher_id) DO NOTHING`,
        [teacherId]
      );
      return false;
    }

    // Atomic claim: only the first concurrent request will get the row back
    const claimed = await pool.query(
      `UPDATE leaderboard_reset_tracker
          SET next_reset_at = DATE_TRUNC('month', NOW()) + INTERVAL '1 month', last_reset_at = NOW()
        WHERE teacher_id = $1 AND next_reset_at <= NOW()
       RETURNING last_reset_at - INTERVAL '30 days' AS prev_last_reset_at`,
      [teacherId]
    );

    if (claimed.rows.length) {
      const prevLabel = getArabicMonthLabel(new Date(claimed.rows[0].prev_last_reset_at));
      await doLeaderboardReset(teacherId, prevLabel, true);
      return true;
    }
    return false;
  } catch (err) {
    console.error('leaderboard auto-reset error:', err.message);
    return false;
  }
}

// ─── helper: perform the actual reset ──────────────────────────────────────
async function doLeaderboardReset(teacherId, monthLabel, skipTrackerUpdate = false) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock tracker row to prevent concurrent manual resets from creating duplicate history
    await client.query(
      `INSERT INTO leaderboard_reset_tracker (teacher_id, last_reset_at, next_reset_at)
       VALUES ($1, NOW(), NOW() + INTERVAL '30 days')
       ON CONFLICT (teacher_id) DO NOTHING`,
      [teacherId]
    );
    await client.query(
      'SELECT teacher_id FROM leaderboard_reset_tracker WHERE teacher_id=$1 FOR UPDATE',
      [teacherId]
    );

    // 1. snapshot current rankings
    const snapshot = await client.query(
      `SELECT s.id as student_id, s.name, s.points, s.academic_stage,
              COUNT(DISTINCT b.id) as badge_count
       FROM students s
       LEFT JOIN badges b ON s.id = b.student_id
       WHERE s.teacher_id = $1 AND s.deleted_at IS NULL
       GROUP BY s.id
       ORDER BY s.points DESC`,
      [teacherId]
    );

    const rankings = snapshot.rows.map((r, i) => ({
      rank: i + 1,
      student_id: r.student_id,
      name: r.name,
      points: parseInt(r.points) || 0,
      academic_stage: r.academic_stage,
      badge_count: parseInt(r.badge_count) || 0,
    }));

    // 2. save snapshot to history (only if there are students with points)
    const hasPoints = rankings.some(r => r.points > 0);
    if (hasPoints) {
      await client.query(
        'INSERT INTO leaderboard_history (teacher_id, month_label, reset_at, rankings) VALUES ($1, $2, NOW(), $3)',
        [teacherId, monthLabel, JSON.stringify(rankings)]
      );
    }

    // 3. reset all student points to 0
    await client.query(
      'UPDATE students SET points = 0 WHERE teacher_id = $1',
      [teacherId]
    );

    // 4. update tracker — skipped if already updated atomically in checkAndResetLeaderboard
    if (!skipTrackerUpdate) {
      await client.query(
        `INSERT INTO leaderboard_reset_tracker (teacher_id, last_reset_at, next_reset_at)
         VALUES ($1, NOW(), NOW() + INTERVAL '30 days')
         ON CONFLICT (teacher_id) DO UPDATE
         SET last_reset_at = NOW(), next_reset_at = NOW() + INTERVAL '30 days'`,
        [teacherId]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ════════════════════════════════════════════════════════════════
//  Payments routes
// ════════════════════════════════════════════════════════════════

router.get('/', requireRole('teacher', 'assistant'), (req, res, next) => checkPermission(req, res, next, 'can_manage_payments'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query(
      `SELECT p.*, s.name as student_name, s.phone as student_phone, c.name as course_name
       FROM payments p JOIN students s ON p.student_id=s.id
       LEFT JOIN courses c ON p.course_id=c.id
       WHERE s.teacher_id=$1 AND s.deleted_at IS NULL ORDER BY p.payment_date DESC`,
      [teacherId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireRole('teacher', 'assistant'), (req, res, next) => checkPermission(req, res, next, 'can_manage_payments'), validatePayment, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { student_id, course_id, reference_number, notes } = req.body;
  const method = req.body.method || '';
  const amount = parseFloat(req.body.amount);
  try {
    // BUG-16 FIX: also require deleted_at IS NULL — prevents creating payments for soft-deleted students
    const studentCheck = await pool.query('SELECT id FROM students WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL', [student_id, teacherId]);
    if (!studentCheck.rows.length) {
      return res.status(403).json({ error: 'Access denied: student not yours or has been deleted' });
    }
    if (course_id) {
      const courseCheck = await pool.query('SELECT id FROM courses WHERE id=$1 AND teacher_id=$2', [course_id, teacherId]);
      if (!courseCheck.rows.length) {
        return res.status(403).json({ error: 'Access denied: course not yours' });
      }
    }
    const result = await pool.query(
      'INSERT INTO payments (student_id,course_id,amount,method,reference_number,notes,status) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [student_id, course_id || null, amount, method, reference_number || null, notes || null, 'pending']
    );
    const sName = (await pool.query('SELECT name FROM students WHERE id=$1', [student_id]).catch(() => ({ rows: [] }))).rows[0]?.name;
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'add_payment',
      entity: { type: 'payment', id: result.rows[0].id, name: sName },
      details: { amount, method, status: 'pending' },
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/verify', requireRole('teacher', 'assistant'), (req, res, next) => checkPermission(req, res, next, 'can_manage_payments'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { status, method, reference_number } = req.body;
  const VALID_STATUSES = ['verified', 'pending', 'rejected'];
  if (!VALID_STATUSES.includes(status))
    return res.status(400).json({ error: 'قيمة الحالة غير صحيحة — المسموح: verified / pending / rejected' });
  try {
    const paymentRes = await pool.query(
      `SELECT p.*, s.teacher_id as student_teacher_id
       FROM payments p JOIN students s ON p.student_id=s.id
       WHERE p.id=$1`,
      [req.params.id]
    );
    if (!paymentRes.rows.length) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    if (parseInt(paymentRes.rows[0].student_teacher_id) !== parseInt(teacherId)) {
      return res.status(403).json({ error: 'Access denied: payment not yours' });
    }
    if (paymentRes.rows[0].status === 'verified' && status !== 'verified') {
      return res.status(400).json({ error: 'لا يمكن تغيير حالة مدفوعة تم التحقق منها — غيّرها لـ "معلّق" أولاً إذا لزم الأمر' });
    }

    const updateFields = ['status=$1'];
    if (status === 'verified') updateFields.push('verified_at=NOW()');
    const params = [status];

    if (method !== undefined && method !== null) {
      params.push(method);
      updateFields.push(`method=$${params.length}`);
    }
    if (reference_number !== undefined && reference_number !== null) {
      params.push(reference_number);
      updateFields.push(`reference_number=$${params.length}`);
    }
    params.push(req.params.id);
    const idIdx = params.length;

    const result = await pool.query(
      `UPDATE payments SET ${updateFields.join(', ')} WHERE id=$${idIdx} RETURNING *`,
      params
    );

    const payRow = result.rows[0];

    // Auto-enroll student in course when payment is verified
    // [M-9] FIX: compare payment amount with course price before auto-enroll
    if (status === 'verified' && payRow.course_id) {
      const courseRow = await pool.query(
        'SELECT price, is_free FROM courses WHERE id=$1',
        [payRow.course_id]
      );
      if (courseRow.rows.length > 0) {
        const coursePrice = parseFloat(courseRow.rows[0].price) || 0;
        const isFree = courseRow.rows[0].is_free;
        const paidAmount = parseFloat(payRow.amount) || 0;
        // Block auto-enroll if course is paid and payment amount is less than the price
        // Allow override via force_enroll=true in request body (teacher's explicit decision)
        if (!isFree && coursePrice > 0 && paidAmount < coursePrice && !req.body.force_enroll) {
          return res.status(400).json({
            error: `المبلغ المدفوع (${paidAmount} جنيه) أقل من سعر الكورس (${coursePrice} جنيه) — لا يمكن التسجيل التلقائي. أرسل force_enroll=true للتجاوز يدوياً`,
            code: 'AMOUNT_MISMATCH',
            paid: paidAmount,
            required: coursePrice,
          });
        }
      }
      await pool.query(
        `INSERT INTO student_course_enrollment (student_id, course_id, status)
         VALUES ($1, $2, 'active')
         ON CONFLICT (student_id, course_id) DO UPDATE SET status = 'active'`,
        [payRow.student_id, payRow.course_id]
      ).catch(e => console.warn('[payments] auto-enroll failed:', e.message));
    }

    const sName = (await pool.query('SELECT name FROM students WHERE id=$1', [payRow.student_id]).catch(() => ({ rows: [] }))).rows[0]?.name;
    const payAction = status === 'verified' ? 'approve_payment' : status === 'rejected' ? 'reject_payment' : 'verify_payment';
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: payAction,
      entity: { type: 'payment', id: payRow.id, name: sName },
      details: { status, amount: payRow.amount },
    });
    res.json(payRow);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Student: view own payment history ──────────────────────────────────────────
router.get('/my', requireRole('student'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.amount, p.method, p.payment_date, p.status,
              p.reference_number, p.notes,
              c.name as course_name, c.id as course_id
       FROM payments p
       LEFT JOIN courses c ON p.course_id = c.id
       WHERE p.student_id = $1
       ORDER BY p.payment_date DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════
//  Leaderboard routes
// ════════════════════════════════════════════════════════════════

// GET /leaderboard — current month rankings (auto-reset if due)
router.get('/leaderboard', requireRole('teacher', 'assistant', 'student'), async (req, res) => {
  let teacherId;
  try {
    if (req.user.role === 'student') {
      const r = await pool.query('SELECT teacher_id FROM students WHERE id=$1', [req.user.id]);
      if (!r.rows.length) return res.status(404).json({ error: 'Student not found' });
      teacherId = r.rows[0].teacher_id;
    } else {
      teacherId = getTeacherId(req);
    }

    // auto-reset check
    await checkAndResetLeaderboard(teacherId);

    // fetch tracker for countdown
    const trackerRes = await pool.query(
      'SELECT last_reset_at, next_reset_at FROM leaderboard_reset_tracker WHERE teacher_id=$1',
      [teacherId]
    );

    const result = await pool.query(
      `SELECT s.id, s.name, s.points, s.academic_stage, s.gender,
              COUNT(DISTINCT er.exam_id)::int as exams_taken,
              COALESCE(ROUND(AVG(er.score::numeric / NULLIF(e.total_score,0) * 100), 1), 0) as avg_score,
              COUNT(DISTINCT b.id)::int as badge_count
       FROM students s
       LEFT JOIN exam_results er ON s.id=er.student_id AND er.is_latest = true
       LEFT JOIN exams e ON er.exam_id = e.id
       LEFT JOIN badges b ON s.id=b.student_id
       WHERE s.teacher_id=$1 AND s.deleted_at IS NULL
       GROUP BY s.id ORDER BY s.points DESC LIMIT 50`,
      [teacherId]
    );

    res.json({
      students: result.rows,
      tracker: trackerRes.rows[0] || null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /leaderboard/history — past months archive
router.get('/leaderboard/history', requireRole('teacher', 'assistant', 'student'), async (req, res) => {
  let teacherId;
  try {
    if (req.user.role === 'student') {
      const r = await pool.query('SELECT teacher_id FROM students WHERE id=$1', [req.user.id]);
      if (!r.rows.length) return res.status(404).json({ error: 'Student not found' });
      teacherId = r.rows[0].teacher_id;
    } else {
      teacherId = getTeacherId(req);
    }

    const result = await pool.query(
      'SELECT id, month_label, reset_at, rankings FROM leaderboard_history WHERE teacher_id=$1 ORDER BY reset_at DESC',
      [teacherId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /leaderboard/reset — manual reset by teacher
router.post('/leaderboard/reset', requireRole('teacher'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    // Use the current month label (the month being closed/archived now)
    const label = getArabicMonthLabel(new Date());
    await doLeaderboardReset(teacherId, label);
    res.json({ success: true, message: 'تم تصفير اللوحة وحفظ سجل الشهر بنجاح' });
  } catch (err) {
    console.error('manual reset error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
