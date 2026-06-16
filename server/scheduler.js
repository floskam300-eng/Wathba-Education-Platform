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

let _pool = null;
let _intervalId = null;
let _waIntervalId = null;
let _recIntervalId = null;
let _examEndIntervalId = null;
let _isRunning = false;
let _isWaRunning = false;
let _isRecRunning = false;
let _isEndRunning = false;

async function runCheck() {
  if (!_pool || _isRunning) return;
  _isRunning = true;
  try {
    // [M-14] FIX: Atomic claim via UPDATE...WHERE start_notified=false RETURNING.
    // This prevents duplicate notifications when multiple instances (or rapid restarts)
    // race on the same exams — only the instance that claims the row will notify students.
    const { rows: exams } = await _pool.query(`
      UPDATE exams
         SET start_notified = true
       WHERE is_published = true
         AND start_date IS NOT NULL
         AND start_date <= NOW()
         AND start_notified = false
      RETURNING id, title, course_id, teacher_id
    `);

    for (const exam of exams) {
      try {
        let studentIds = [];
        if (exam.course_id) {
          const r = await _pool.query(
            "SELECT student_id AS id FROM student_course_enrollment WHERE course_id=$1 AND status='active'",
            [exam.course_id]
          );
          studentIds = r.rows.map(row => row.id);
        } else {
          // [SC1-FIX] Exclude suspended students — they cannot take exams and
          // must not receive start-notifications (same pattern applied to the
          // recitation scheduler in T3-FIX; was only fixed for course-enrolled
          // students previously, not for the teacher-wide fallback branch).
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

        sendFCMToStudents(_pool, studentIds, 'بدأ الاختبار الآن!', `⏰ يمكنك الدخول الآن لأداء اختبار: "${exam.title}"`, { examId: String(exam.id) }).catch(() => {});

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
            `UPDATE whatsapp_send_log SET status='done', success_count=$1, fail_count=$2, finished_at=NOW() WHERE id=$3`,
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
         AND schedule_type IN ('daily','weekly')
         AND end_date IS NOT NULL
         AND end_date < NOW()
    `);

    for (const rec of recs) {
      try {
        const now = new Date();
        let newStart, newEnd;

        if (rec.schedule_type === 'daily') {
          // Advance by 1 day from current end_date
          const next = new Date(rec.end_date);
          next.setDate(next.getDate() + 1);
          const dur = new Date(rec.end_date) - new Date(rec.start_date);
          newStart = new Date(next.getTime() - dur);
          newEnd = next;
        } else if (rec.schedule_type === 'weekly') {
          // Advance by 7 days from current end_date
          const next = new Date(rec.end_date);
          next.setDate(next.getDate() + 7);
          const dur = new Date(rec.end_date) - new Date(rec.start_date);
          newStart = new Date(next.getTime() - dur);
          newEnd = next;
        }

        // [R3-FIX] Reset: use a dedicated client for the transaction.
        // pool.query('BEGIN') is unsafe with connection pools — each call can
        // land on a different connection. pool.connect() pins to one connection.
        const txClient = await _pool.connect();
        try {
          await txClient.query('BEGIN');
          await txClient.query(
            `UPDATE recitations SET start_date=$1, end_date=$2, start_notified=false
              WHERE id=$3`,
            [newStart.toISOString(), newEnd.toISOString(), rec.id]
          );
          // Clear old sessions so students can take it again this window
          await txClient.query('DELETE FROM recitation_sessions WHERE recitation_id=$1', [rec.id]);
          await txClient.query('COMMIT');
          txClient.release();

          // Notify eligible students
          let studentQuery, params;
          // [T3-FIX] Exclude suspended students — they cannot take recitations
        // and should not receive notifications about new windows.
        if (rec.academic_stage) {
            studentQuery = 'SELECT id FROM students WHERE teacher_id=$1 AND academic_stage=$2 AND deleted_at IS NULL AND is_suspended = false';
            params = [rec.teacher_id, rec.academic_stage];
          } else {
            studentQuery = 'SELECT id FROM students WHERE teacher_id=$1 AND deleted_at IS NULL AND is_suspended = false';
            params = [rec.teacher_id];
          }
          const { rows: students } = await _pool.query(studentQuery, params);
          const studentIds = students.map(s => s.id);

          for (const sid of studentIds) {
            sendEvent(`student_${sid}`, 'new_recitation', {
              title: rec.title,
              recitationId: rec.id,
            });
            _pool.query(
              `INSERT INTO notification_log (teacher_id, student_id, title, message, type, source)
               VALUES ($1,$2,$3,$4,'new_recitation','platform')`,
              [rec.teacher_id, sid, 'تسميع جديد 📖', `تسميع "${rec.title}" متاح الآن`]
            ).catch(() => {});
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

    // [N4-FIX] Clean up orphaned sessions from expired 'once' recitations.
    // For recurring recitations the window-reset code already deletes sessions.
    // For 'once' recitations that have ended, sessions from students who never
    // submitted just pile up in the DB forever — clean them here.
    try {
      const { rowCount: cleanedSessions } = await _pool.query(`
        DELETE FROM recitation_sessions rs
        WHERE EXISTS (
          SELECT 1 FROM recitations r
           WHERE r.id = rs.recitation_id
             AND r.schedule_type = 'once'
             AND r.end_date IS NOT NULL
             AND r.end_date < NOW()
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
         AND start_date IS NOT NULL
         AND start_date <= NOW()
         AND start_notified = false
         AND (end_date IS NULL OR end_date > NOW())
      RETURNING id, title, teacher_id, academic_stage
    `);

    for (const rec of toNotify) {
      try {
        let studentQuery, params;
        // [T3-FIX] Also exclude suspended students for start notifications
        if (rec.academic_stage) {
          studentQuery = 'SELECT id FROM students WHERE teacher_id=$1 AND academic_stage=$2 AND deleted_at IS NULL AND is_suspended = false';
          params = [rec.teacher_id, rec.academic_stage];
        } else {
          studentQuery = 'SELECT id FROM students WHERE teacher_id=$1 AND deleted_at IS NULL AND is_suspended = false';
          params = [rec.teacher_id];
        }
        const { rows: students } = await _pool.query(studentQuery, params);
        const studentIds = students.map(s => s.id);
        for (const sid of studentIds) {
          sendEvent(`student_${sid}`, 'new_recitation', {
            title: rec.title, recitationId: rec.id,
          });
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
      LIMIT 50
    `);

    for (const exam of endedExams) {
      try {
        const courseId = exam.course_id;
        let eligibleRows;
        if (courseId) {
          const r = await _pool.query(
            `SELECT sce.student_id AS id
             FROM student_course_enrollment sce
             WHERE sce.course_id=$1 AND sce.status='active'
               AND NOT EXISTS (
                 SELECT 1 FROM exam_results er
                 WHERE er.student_id=sce.student_id AND er.exam_id=$2
               )`,
            [courseId, exam.id]
          );
          eligibleRows = r.rows;
        } else {
          const r = await _pool.query(
            `SELECT s.id
             FROM students s
             WHERE s.teacher_id=$1 AND s.deleted_at IS NULL AND s.is_suspended=false
               AND NOT EXISTS (
                 SELECT 1 FROM exam_results er
                 WHERE er.student_id=s.id AND er.exam_id=$2
               )`,
            [exam.teacher_id, exam.id]
          );
          eligibleRows = r.rows;
        }

        if (eligibleRows.length > 0) {
          const studentIds = eligibleRows.map(r => r.id);
          await _pool.query(
            `INSERT INTO exam_results
               (student_id, exam_id, score, correct_count, wrong_count, unanswered_count,
                is_absent, is_latest, attempt_number, points_earned)
             SELECT s_id, $2, 0, 0, 0, 0, true, true, 1, 0
             FROM unnest($1::int[]) AS s_id
             WHERE NOT EXISTS (
               SELECT 1 FROM exam_results er WHERE er.student_id=s_id AND er.exam_id=$2
             )`,
            [studentIds, exam.id]
          );
        }
        await _pool.query('UPDATE exams SET absent_marked=true WHERE id=$1', [exam.id]);
        console.log(`[Scheduler] Ended exam "${exam.title}" (id=${exam.id}) — marked ${eligibleRows.length} absent`);
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

function startScheduler(pool) {
  _pool = pool;
  runCheck();
  _intervalId = setInterval(runCheck, 30 * 1000);
  // Check WhatsApp schedules every 5 minutes
  _waIntervalId = setInterval(runWhatsAppSchedules, 5 * 60 * 1000);
  // Check recitation windows every 5 minutes
  runRecitationSchedule();
  _recIntervalId = setInterval(runRecitationSchedule, 5 * 60 * 1000);
  // Check for ended exams and mark absent students every 5 minutes
  runEndedExamCheck();
  _examEndIntervalId = setInterval(runEndedExamCheck, 5 * 60 * 1000);
  console.log('[Scheduler] Exam start scheduler running (30s interval)');
  console.log('[Scheduler] WhatsApp schedule checker running (5min interval)');
  console.log('[Scheduler] Recitation window scheduler running (5min interval)');
  console.log('[Scheduler] Ended-exam absent marker running (5min interval)');
}

function stopScheduler() {
  if (_intervalId)       { clearInterval(_intervalId);       _intervalId       = null; }
  if (_waIntervalId)     { clearInterval(_waIntervalId);     _waIntervalId     = null; }
  if (_recIntervalId)    { clearInterval(_recIntervalId);    _recIntervalId    = null; }
  if (_examEndIntervalId){ clearInterval(_examEndIntervalId); _examEndIntervalId = null; }
}

module.exports = { startScheduler, stopScheduler };
