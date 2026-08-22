/**
 * Exam Start Scheduler
 * Runs periodically to detect published exams whose start_date has arrived
 * and sends real-time SSE events to eligible students.
 * This is restart-resilient: if the server restarts before a scheduled timeout fires,
 * this scheduler will catch it on the next tick.
 */

const { sendEvent } = require('./sse');
const { sendFCMToStudents } = require('./lib/fcm');
const { activeSends } = require('./lib/waActiveSends');
// N4 FIX: import markAbsentStudents so the scheduler reuses the same logic as the
// manual-unpublish path instead of duplicating it.  Any future bugfixes to
// markAbsentStudents will automatically apply here too.
const { markAbsentStudents } = require('./routes/exams');
const { markAbsentRecitationStudents } = require('./routes/recitations');
const { autoSubmitExpiredExamSession } = require('./lib/examScoring');
const { autoSubmitExpiredRecitationSession } = require('./lib/recitationScoring');

let _pool = null;
let _intervalId = null;
let _waIntervalId = null;
let _recIntervalId = null;
let _examEndIntervalId = null;
let _recEndIntervalId = null;
let _cleanupIntervalId = null;
let _sessionCleanupIntervalId = null;
let _isRunning = false;
let _isWaRunning = false;
let _isRecRunning = false;
let _isEndRunning = false;
let _isRecEndRunning = false;

async function runCheck() {
  if (!_pool || _isRunning) return;
  _isRunning = true;
  try {
    // [M-14] FIX: Atomic claim via UPDATE...WHERE start_notified=false RETURNING.
    const { rows: exams } = await _pool.query(`
      UPDATE exams
         SET start_notified = true
       WHERE is_published = true
         AND start_date IS NOT NULL
         AND start_date <= NOW()
         AND start_notified = false
         AND (end_date IS NULL OR end_date > NOW())
      RETURNING id, title, course_id, teacher_id
    `);

    for (const exam of exams) {
      try {
        let studentIds = [];
        if (exam.course_id) {
          const r = await _pool.query(
            `SELECT s.id FROM students s
               JOIN student_course_enrollment sce ON s.id = sce.student_id
              WHERE sce.course_id=$1 AND sce.status='active'
                AND s.deleted_at IS NULL AND s.is_suspended = false`,
            [exam.course_id]
          );
          studentIds = r.rows.map(row => row.id);
        } else {
          // [SC1-FIX] Exclude suspended students
          const r = await _pool.query(
            'SELECT id FROM students WHERE teacher_id=$1 AND deleted_at IS NULL AND is_suspended = false',
            [exam.teacher_id]
          );
          studentIds = r.rows.map(row => row.id);
        }

        for (const sid of studentIds) {
          sendEvent(`student_${sid}`, 'exam_started', {
            title: exam.title,
            examId: exam.id,
          });
        }

        if (studentIds.length > 0) {
          _pool.query(
            `INSERT INTO notification_log (teacher_id, student_id, recipient_type, message, type, is_read, source, title)
             SELECT $1, unnest($2::int[]), 'student', $3, 'exam_started', false, 'platform', $4`,
            [exam.teacher_id, studentIds, `بدأ موعد اختبار: "${exam.title}" الآن — يمكنك الدخول لأدائه`, 'بدأ الاختبار الآن! 📝']
          ).catch(() => {});
        }

        sendFCMToStudents(_pool, studentIds, 'بدأ الاختبار الآن! 📝', `⏰ يمكنك الدخول الآن لأداء اختبار: "${exam.title}"`, { examId: String(exam.id) }).catch(() => {});

        console.log(`[Scheduler] Notified ${studentIds.length} students: exam "${exam.title}" (id=${exam.id}) started`);
      } catch (examErr) {
        console.error(`[Scheduler] Error processing exam ${exam.id}:`, examErr.message);
      }
    }
  } catch (err) {
    console.error('[Scheduler] DB error during check:', err.message);
  } finally {
    _isRunning = false;
  }
}

// ── WhatsApp Schedule Runner ─────────────────────────────────────────────────
async function runWhatsAppSchedules() {
  if (!_pool || _isWaRunning) return;
  _isWaRunning = true;
  try {
    const { rows: schedules } = await _pool.query(
      `SELECT * FROM whatsapp_schedules
       WHERE is_active = true AND next_run_at IS NOT NULL AND next_run_at <= NOW()`
    );
    if (schedules.length === 0) { _isWaRunning = false; return; }

    const wa = require('./lib/whatsapp');

    for (const sched of schedules) {
      try {
        // Skip if a manual send is already in progress for this teacher — prevents
      // double-speed sending that could trigger WhatsApp's anti-spam detection.
        if (activeSends.has(sched.teacher_id)) {
          console.log(`[WA Scheduler] Teacher ${sched.teacher_id} has an active manual send — skipping schedule "${sched.name}" this tick`);
          continue;
        }

        const { status } = wa.getStatus(sched.teacher_id);
        if (status !== 'connected') {
          // Advance next_run_at even when disconnected — prevents pile-up of
          // overdue schedules that would all fire at once when teacher reconnects.
          const nextRun = new Date(Date.now() + sched.interval_days * 24 * 60 * 60 * 1000);
          await _pool.query(
            `UPDATE whatsapp_schedules SET next_run_at=$1, updated_at=NOW() WHERE id=$2`,
            [nextRun.toISOString(), sched.id]
          );
          console.log(`[WA Scheduler] Teacher ${sched.teacher_id} not connected — schedule "${sched.name}" rescheduled to ${nextRun.toISOString()}`);
          continue;
        }

        // Build recipient list
        let query;
        const params = [sched.teacher_id];
        const stageClause = (sched.stage_filter && sched.stage_filter !== 'all')
          ? ` AND s.academic_stage = $2` : '';
        if (sched.stage_filter && sched.stage_filter !== 'all') params.push(sched.stage_filter);

        query = `SELECT s.id AS student_id, s.name, s.phone, s.parent_phone, s.academic_stage,
                        COALESCE(AVG(er.score),0)::int AS avg_score,
                        COUNT(er.id)::int AS exam_count
                 FROM students s
                 LEFT JOIN exam_results er ON s.id = er.student_id
                 WHERE s.teacher_id = $1 AND s.deleted_at IS NULL${stageClause}
                 GROUP BY s.id ORDER BY s.name`;

        const { rows: students } = await _pool.query(query, params);

        // Build recipients based on target_type
        const recipients = [];
        for (const st of students) {
          if ((sched.target_type === 'students' || sched.target_type === 'both') && st.phone) {
            recipients.push({ phone: st.phone, name: st.name, student_name: st.name, academic_stage: st.academic_stage, avg_score: st.avg_score, exam_count: st.exam_count, student_id: st.student_id });
          }
          if ((sched.target_type === 'parents' || sched.target_type === 'both') && st.parent_phone) {
            recipients.push({ phone: st.parent_phone, name: st.name, student_name: st.name, academic_stage: st.academic_stage, avg_score: st.avg_score, exam_count: st.exam_count, student_id: st.student_id });
          }
        }

        if (recipients.length === 0) {
          console.log(`[WA Scheduler] No recipients for schedule "${sched.name}"`);
        } else {
          const { rows: [log] } = await _pool.query(
            `INSERT INTO whatsapp_send_log (teacher_id, schedule_id, message, total_count, status, send_type)
             VALUES ($1,$2,$3,$4,'sending','scheduled') RETURNING id`,
            [sched.teacher_id, sched.id, sched.message, recipients.length]
          );

          let success = 0, failed = 0;
          for (let i = 0; i < recipients.length; i++) {
            const rec = recipients[i];
            try {
              const msg = sched.message
                .replace(/\{name\}/g,         rec.name          || '')
                .replace(/\{student_name\}/g, rec.student_name  || rec.name || '')
                .replace(/\{avg_score\}/g,    String(rec.avg_score || 0))
                .replace(/\{exam_count\}/g,   String(rec.exam_count || 0))
                .replace(/\{stage\}/g,        rec.academic_stage || '');
              await wa.sendMessage(sched.teacher_id, rec.phone, msg);
              success++;
            } catch (_) { failed++; }
            // Random delay 8–16s between messages to avoid WhatsApp ban — skip after last message
            if (i < recipients.length - 1) {
              await new Promise(r => setTimeout(r, 8000 + Math.floor(Math.random() * 8000)));
            }
          }

          await _pool.query(
            `UPDATE whatsapp_send_log SET status='completed', success_count=$1, fail_count=$2, finished_at=NOW() WHERE id=$3`,
            [success, failed, log.id]
          );
          console.log(`[WA Scheduler] Schedule "${sched.name}": sent ${success}/${recipients.length}`);
        }

        // Advance next_run_at
        const nextRun = new Date(Date.now() + sched.interval_days * 24 * 60 * 60 * 1000);
        await _pool.query(
          `UPDATE whatsapp_schedules SET last_run_at=NOW(), next_run_at=$1, updated_at=NOW() WHERE id=$2`,
          [nextRun.toISOString(), sched.id]
        );
      } catch (schedErr) {
        console.error(`[WA Scheduler] Error on schedule ${sched.id}:`, schedErr.message);
      }
    }
  } catch (err) {
    console.error('[WA Scheduler] DB error:', err.message);
  } finally {
    _isWaRunning = false;
  }
}

// ── Recurring Recitation Window Scheduler ────────────────────────────────────
async function runRecitationSchedule() {
  if (!_pool || _isRecRunning) return;
  _isRecRunning = true;
  try {
    // Find published recurring recitations whose window has ended
    const { rows: recs } = await _pool.query(`
      SELECT * FROM recitations
       WHERE is_published = true
         AND deleted_at IS NULL
         AND schedule_type IN ('daily','weekly')
         AND end_date IS NOT NULL
         AND end_date < NOW()
    `);

    for (const rec of recs) {
      try {
        const now = new Date();
        const dur = (rec.start_date && rec.end_date)
          ? (new Date(rec.end_date) - new Date(rec.start_date))
          : (rec.schedule_type === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000);
        const stepMs = rec.schedule_type === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
        let nextEnd = new Date(rec.end_date);

        // Advance until nextEnd is in the future
        while (nextEnd <= now) {
          nextEnd = new Date(nextEnd.getTime() + stepMs);
        }
        const newEnd = nextEnd;
        const newStart = new Date(newEnd.getTime() - dur);

        // [R3-FIX] Reset: use a dedicated client for the transaction.
        const txClient = await _pool.connect();
        try {
          await txClient.query('BEGIN');
          // Also reset absent_marked so a new window can record absences again.
          await txClient.query(
            `UPDATE recitations SET start_date=$1, end_date=$2, start_notified=false, absent_marked=false
              WHERE id=$3`,
            [newStart.toISOString(), newEnd.toISOString(), rec.id]
          );
          // Clear old sessions so students can take it again this window
          await txClient.query('DELETE FROM recitation_sessions WHERE recitation_id=$1', [rec.id]);
          await txClient.query('COMMIT');
          txClient.release();

          // Notify eligible students
          let studentIds = [];
          if (rec.course_id) {
            const r = await _pool.query(
              "SELECT student_id AS id FROM student_course_enrollment WHERE course_id=$1 AND status='active'",
              [rec.course_id]
            );
            studentIds = r.rows.map(row => row.id);
          } else if (rec.academic_stage) {
            const r = await _pool.query(
              'SELECT id FROM students WHERE teacher_id=$1 AND academic_stage=$2 AND deleted_at IS NULL AND is_suspended = false',
              [rec.teacher_id, rec.academic_stage]
            );
            studentIds = r.rows.map(row => row.id);
          } else {
            const r = await _pool.query(
              'SELECT id FROM students WHERE teacher_id=$1 AND deleted_at IS NULL AND is_suspended = false',
              [rec.teacher_id]
            );
            studentIds = r.rows.map(row => row.id);
          }

          for (const sid of studentIds) {
            sendEvent(`student_${sid}`, 'new_recitation', {
              title: rec.title,
              recitationId: rec.id,
            });
          }

          if (studentIds.length > 0) {
            _pool.query(
              `INSERT INTO notification_log (teacher_id, student_id, title, message, type, source)
               SELECT $1, unnest($2::int[]), $3, $4, 'new_recitation', 'platform'`,
              [rec.teacher_id, studentIds, 'تسميع جديد 📖', `تسميع "${rec.title}" متاح الآن`]
            ).catch(() => {});

            sendFCMToStudents(_pool, studentIds, 'تسميع جديد 📖', `تسميع "${rec.title}" متاح الآن للبدء`, { recitationId: String(rec.id) }).catch(() => {});
          }

          console.log(`[Scheduler] Recitation "${rec.title}" (id=${rec.id}) window reset — notified ${studentIds.length} students`);
        } catch (txErr) {
          await txClient.query('ROLLBACK').catch(() => {});
          txClient.release();
          throw txErr;
        }
      } catch (recErr) {
        console.error(`[Scheduler] Error resetting recitation ${rec.id}:`, recErr.message);
      }
    }

    // Auto-submit and clean up expired in-progress recitation sessions
    try {
      const { rows: expiredRecSessions } = await _pool.query(`
        SELECT rs.student_id, rs.recitation_id, rs.started_at, rs.questions_snapshot, rs.answers,
               r.id, r.title, r.total_score, r.pass_score, r.points_on_attempt, r.points_on_pass,
               r.teacher_id, r.start_date, r.end_date
        FROM recitation_sessions rs
        JOIN recitations r ON rs.recitation_id = r.id
        WHERE rs.started_at + ((COALESCE(r.duration_minutes, 10) * 60 + 30) * interval '1 second') < NOW()
           OR (r.schedule_type = 'once' AND r.end_date IS NOT NULL AND r.end_date < NOW())
           OR r.deleted_at IS NOT NULL
        LIMIT 100
      `);
      for (const sess of expiredRecSessions) {
        try {
          await autoSubmitExpiredRecitationSession(_pool, sess, sess, sess.student_id, sess.recitation_id);
        } catch (sessErr) {
          console.error(`[Scheduler] Error auto-submitting expired recitation session (student=${sess.student_id}, rec=${sess.recitation_id}):`, sessErr.message);
        }
      }
    } catch (cleanErr) {
      console.error('[Scheduler] Error cleaning expired recitation sessions:', cleanErr.message);
    }

    // [N4-FIX] Clean up orphaned sessions from expired 'once' recitations.
    try {
      const { rowCount: cleanedSessions } = await _pool.query(`
        DELETE FROM recitation_sessions rs
        WHERE EXISTS (
          SELECT 1 FROM recitations r
           WHERE r.id = rs.recitation_id
             AND (
               -- Expired 'once' recitations whose window has passed
               (r.schedule_type = 'once' AND r.end_date IS NOT NULL AND r.end_date < NOW())
               OR r.deleted_at IS NOT NULL
             )
        )
      `);
      if (cleanedSessions > 0) {
        console.log(`[Scheduler] Cleaned up ${cleanedSessions} orphaned session(s) from expired recitations`);
      }
    } catch (cleanErr) {
      console.error('[Scheduler] Error cleaning orphaned sessions:', cleanErr.message);
    }

    // Also handle start notifications for recitations
    const { rows: toNotify } = await _pool.query(`
      UPDATE recitations
         SET start_notified = true
       WHERE is_published = true
         AND deleted_at IS NULL
         AND start_date IS NOT NULL
         AND start_date <= NOW()
         AND start_notified = false
         AND (end_date IS NULL OR end_date > NOW())
      RETURNING id, title, teacher_id, academic_stage, course_id
    `);

    for (const rec of toNotify) {
      try {
        let studentIds = [];
        if (rec.course_id) {
          const r = await _pool.query(
            "SELECT student_id AS id FROM student_course_enrollment WHERE course_id=$1 AND status='active'",
            [rec.course_id]
          );
          studentIds = r.rows.map(row => row.id);
        } else if (rec.academic_stage) {
          const r = await _pool.query(
            'SELECT id FROM students WHERE teacher_id=$1 AND academic_stage=$2 AND deleted_at IS NULL AND is_suspended = false',
            [rec.teacher_id, rec.academic_stage]
          );
          studentIds = r.rows.map(row => row.id);
        } else {
          const r = await _pool.query(
            'SELECT id FROM students WHERE teacher_id=$1 AND deleted_at IS NULL AND is_suspended = false',
            [rec.teacher_id]
          );
          studentIds = r.rows.map(row => row.id);
        }

        for (const sid of studentIds) {
          sendEvent(`student_${sid}`, 'new_recitation', {
            title: rec.title, recitationId: rec.id,
          });
        }

        if (studentIds.length > 0) {
          _pool.query(
            `INSERT INTO notification_log (teacher_id, student_id, title, message, type, source)
             SELECT $1, unnest($2::int[]), $3, $4, 'new_recitation', 'platform'`,
            [rec.teacher_id, studentIds, 'تسميع جديد 📖', `بدأ موعد تسميع: "${rec.title}" الآن — يمكنك الدخول لأدائه`]
          ).catch(() => {});

          sendFCMToStudents(_pool, studentIds, 'بدأ التسميع الآن! 📖', `⏰ يمكنك الدخول الآن لأداء تسميع: "${rec.title}"`, { recitationId: String(rec.id) }).catch(() => {});
        }

        console.log(`[Scheduler] Recitation "${rec.title}" (id=${rec.id}) started — notified ${studentIds.length} students`);
      } catch (e) {
        console.error(`[Scheduler] Error notifying recitation ${rec.id}:`, e.message);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Recitation schedule error:', err.message);
  } finally {
    _isRecRunning = false;
  }
}

// ── Ended-recitation absent marker ───────────────────────────────────────────
// Runs every 5 minutes. Finds 'once' recitations whose end_date has passed and
// marks every eligible student with no result as "absent".
// Recurring recitations are excluded — their windows are reset by runRecitationSchedule.
async function runEndedRecitationCheck() {
  if (!_pool || _isRecEndRunning) return;
  _isRecEndRunning = true;
  try {
    const { rows: endedRecs } = await _pool.query(`
      SELECT r.id, r.teacher_id, r.title
        FROM recitations r
       WHERE r.end_date IS NOT NULL
         AND r.end_date <= NOW()
         AND r.absent_marked = false
         AND r.is_published = true
         AND r.deleted_at IS NULL
         AND r.schedule_type = 'once'
       LIMIT 50
    `);

    for (const rec of endedRecs) {
      try {
        const count = await markAbsentRecitationStudents(_pool, rec.id, rec.teacher_id);
        console.log(`[Scheduler] Ended recitation "${rec.title}" (id=${rec.id}) — marked ${count} absent`);
      } catch (e) {
        console.error(`[Scheduler] Error marking absent for recitation ${rec.id}:`, e.message);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error in ended recitation check:', err.message);
  } finally {
    _isRecEndRunning = false;
  }
}

// ── Ended-exam absent marker ──────────────────────────────────────────────────
// Runs every 5 minutes. Finds exams whose end_date has passed and marks every
// eligible student with no result as "absent" — regardless of is_published state
// so that manually-unpublished exams (already handled inline in the route) as
// well as exams that simply expired are both covered.
async function runEndedExamCheck() {
  if (!_pool || _isEndRunning) return;
  _isEndRunning = true;
  try {
    // BUG-1 FIX: Only mark absent for PUBLISHED exams that have ended.
    // Without is_published=true, exams that were never published (draft/expired)
    // would incorrectly mark all students as absent.
    const { rows: endedExams } = await _pool.query(`
      SELECT e.id, e.teacher_id, e.title, e.course_id
      FROM exams e
      WHERE e.end_date IS NOT NULL
        AND e.end_date <= NOW()
        AND e.absent_marked = false
        AND e.is_published = true
        AND e.deleted_at IS NULL
      LIMIT 50
    `);

    for (const exam of endedExams) {
      try {
        // Auto-submit any active in-progress exam sessions for this ended exam first
        const { rows: openSessions } = await _pool.query(`
          SELECT es.student_id, es.exam_id, es.started_at, es.questions_snapshot, es.answers,
                 e.id, e.title, e.total_score, e.pass_score, e.points_on_pass, e.points_on_attempt,
                 e.badge_name, e.badge_color, e.teacher_id, e.question_source, e.bank_id,
                 COALESCE(e.duration_minutes, 60) AS duration_minutes
          FROM exam_sessions es
          JOIN exams e ON es.exam_id = e.id
          WHERE es.exam_id = $1
        `, [exam.id]);
        for (const sess of openSessions) {
          try {
            await autoSubmitExpiredExamSession(_pool, sess, sess, sess.student_id, sess.exam_id);
          } catch (sessErr) {
            console.error(`[Scheduler] Error auto-submitting session for ended exam ${exam.id}:`, sessErr.message);
          }
        }

        // N4 FIX: delegate to markAbsentStudents() instead of duplicating its logic here.
        // Previously this block was a copy of that function — any future fix to the
        // shared function (e.g. new eligibility rules) now automatically applies here.
        const count = await markAbsentStudents(_pool, exam.id, exam.teacher_id);
        console.log(`[Scheduler] Ended exam "${exam.title}" (id=${exam.id}) — marked ${count} absent`);
      } catch (e) {
        console.error(`[Scheduler] Error marking absent for exam ${exam.id}:`, e.message);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error in ended exam check:', err.message);
  } finally {
    _isEndRunning = false;
  }
}

async function runDataRetentionCleanup() {
  if (!_pool) return;
  try {
    const [notifRes, waLogRes, examRes, recRes] = await Promise.all([
      _pool.query(`DELETE FROM notification_log WHERE sent_at < NOW() - INTERVAL '180 days'`),
      _pool.query(`DELETE FROM whatsapp_send_log WHERE created_at < NOW() - INTERVAL '180 days'`),
      // Keep only the latest attempt per student+exam beyond 1 year (preserve is_latest=true rows always)
      _pool.query(`DELETE FROM exam_results WHERE created_at < NOW() - INTERVAL '365 days' AND is_latest = false`),
      // Recitation results older than 1 year — only delete a row if a NEWER
      // result exists for the same (student, recitation), so the student's latest
      // grade is never erased even after 365 days.
      _pool.query(`
        DELETE FROM recitation_results rr
        WHERE rr.submitted_at < NOW() - INTERVAL '365 days'
          AND EXISTS (
            SELECT 1 FROM recitation_results newer
            WHERE newer.student_id     = rr.student_id
              AND newer.recitation_id  = rr.recitation_id
              AND newer.submitted_at   > rr.submitted_at
          )
      `),
    ]);
    const deleted = [
      notifRes.rowCount || 0,
      waLogRes.rowCount || 0,
      examRes.rowCount || 0,
      recRes.rowCount || 0,
    ];
    if (deleted.some(n => n > 0)) {
      console.log(`[Scheduler] Data retention cleanup: notif=${deleted[0]}, wa_log=${deleted[1]}, exam_results=${deleted[2]}, recitation_results=${deleted[3]}`);
    }
  } catch (err) {
    console.error('[Scheduler] Data retention cleanup error:', err.message);
  }
}

// [Phase 2] Trim dead / expired student sessions so the student_active_sessions
// table doesn't grow unbounded. Only sessions older than 7 days (the JWT TTL)
// are purged because the corresponding token can no longer authenticate anyway.
async function runSessionCleanup() {
  if (!_pool) return;
  try {
    const purged = await _pool.query(
      `DELETE FROM student_active_sessions
        WHERE logged_in_at < NOW() - INTERVAL '7 days'
           OR (kicked_at IS NOT NULL AND kicked_at < NOW() - INTERVAL '7 days')`
    );
    const pCount = purged.rowCount || 0;
    if (pCount > 0) {
      console.log(`[Scheduler] Session cleanup: purged=${pCount}`);
    }
  } catch (err) {
    console.error('[Scheduler] Session cleanup error:', err.message);
  }
}

// ── Auto-submit and clean up expired in-progress exam sessions ──
// Runs every 60 seconds. Finds exam_sessions where the exam duration + 90s grace
// has elapsed, grades the student's saved progress into exam_results,
// and removes the session from exam_sessions so the student cannot resume.
let _isSessionCheckRunning = false;
async function runExpiredExamSessionsCheck() {
  if (!_pool || _isSessionCheckRunning) return;
  _isSessionCheckRunning = true;
  try {
    const { rows: expiredSessions } = await _pool.query(`
      SELECT es.student_id, es.exam_id, es.started_at, es.questions_snapshot, es.answers,
             e.id, e.title, e.total_score, e.pass_score, e.points_on_pass, e.points_on_attempt,
             e.badge_name, e.badge_color, e.teacher_id, e.question_source, e.bank_id,
             COALESCE(e.duration_minutes, 60) AS duration_minutes
      FROM exam_sessions es
      JOIN exams e ON es.exam_id = e.id
      WHERE es.started_at + ((COALESCE(e.duration_minutes, 60) * 60 + 90) * interval '1 second') < NOW()
         OR (e.end_date IS NOT NULL AND e.end_date <= NOW())
         OR e.deleted_at IS NOT NULL
      LIMIT 100
    `);

    for (const sess of expiredSessions) {
      try {
        await autoSubmitExpiredExamSession(_pool, sess, sess, sess.student_id, sess.exam_id);
      } catch (err) {
        console.error(`[Scheduler] Error auto-submitting expired exam session (student=${sess.student_id}, exam=${sess.exam_id}):`, err.message);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error in expired exam session check:', err.message);
  } finally {
    _isSessionCheckRunning = false;
  }
}

let _examSessionIntervalId = null;

function startScheduler(pool) {
  _pool = pool;
  runCheck();
  _intervalId = setInterval(runCheck, 30 * 1000);
  // Check WhatsApp schedules every 5 minutes
  _waIntervalId = setInterval(runWhatsAppSchedules, 5 * 60 * 1000);
  // Check recitation windows & scheduled starts every 30 seconds
  runRecitationSchedule();
  _recIntervalId = setInterval(runRecitationSchedule, 30 * 1000);
  // Check for ended exams and mark absent students every 5 minutes
  runEndedExamCheck();
  _examEndIntervalId = setInterval(runEndedExamCheck, 5 * 60 * 1000);
  // Check for expired in-progress exam sessions every 60 seconds
  runExpiredExamSessionsCheck();
  _examSessionIntervalId = setInterval(runExpiredExamSessionsCheck, 60 * 1000);
  // Check for ended 'once' recitations and mark absent students every 5 minutes
  runEndedRecitationCheck();
  _recEndIntervalId = setInterval(runEndedRecitationCheck, 5 * 60 * 1000);
  // Run database log retention cleanup daily
  runDataRetentionCleanup();
  _cleanupIntervalId = setInterval(runDataRetentionCleanup, 24 * 60 * 60 * 1000);
  // [Phase 2] Trim dead student sessions every 5 minutes.
  runSessionCleanup();
  _sessionCleanupIntervalId = setInterval(runSessionCleanup, 5 * 60 * 1000);

  console.log('[Scheduler] Exam start scheduler running (30s interval)');
  console.log('[Scheduler] WhatsApp schedule checker running (5min interval)');
  console.log('[Scheduler] Recitation window scheduler running (30s interval)');
  console.log('[Scheduler] Ended-exam absent marker running (5min interval)');
  console.log('[Scheduler] Expired-exam session auto-cleaner running (60s interval)');
  console.log('[Scheduler] Ended-recitation absent marker running (5min interval)');
  console.log('[Scheduler] Data retention logs cleanup running (24h interval)');
  console.log('[Scheduler] Student session cleanup running (5min interval)');
}

function stopScheduler() {
  if (_intervalId)              { clearInterval(_intervalId);              _intervalId              = null; }
  if (_waIntervalId)            { clearInterval(_waIntervalId);            _waIntervalId            = null; }
  if (_recIntervalId)           { clearInterval(_recIntervalId);           _recIntervalId           = null; }
  if (_examEndIntervalId)       { clearInterval(_examEndIntervalId);       _examEndIntervalId       = null; }
  if (_examSessionIntervalId)   { clearInterval(_examSessionIntervalId);   _examSessionIntervalId   = null; }
  if (_recEndIntervalId)        { clearInterval(_recEndIntervalId);        _recEndIntervalId        = null; }
  if (_cleanupIntervalId)       { clearInterval(_cleanupIntervalId);       _cleanupIntervalId       = null; }
  if (_sessionCleanupIntervalId){ clearInterval(_sessionCleanupIntervalId);_sessionCleanupIntervalId= null; }
}

module.exports = { startScheduler, stopScheduler };
