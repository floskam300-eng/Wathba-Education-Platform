/**
 * Exam Start Scheduler
 * Runs periodically to detect published exams whose start_date has arrived
 * and sends real-time SSE events to eligible students.
 * This is restart-resilient: if the server restarts before a scheduled timeout fires,
 * this scheduler will catch it on the next tick.
 */

const { sendEvent } = require('./sse');
const { sendFCMToStudents } = require('./lib/fcm');

let _pool = null;
let _intervalId = null;

async function runCheck() {
  if (!_pool) return;
  try {
    const { rows: exams } = await _pool.query(`
      SELECT id, title, course_id, teacher_id
      FROM exams
      WHERE is_published = true
        AND start_date IS NOT NULL
        AND start_date <= NOW()
        AND start_notified = false
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
          const r = await _pool.query(
            'SELECT id FROM students WHERE teacher_id=$1 AND deleted_at IS NULL',
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

        await _pool.query(
          'UPDATE exams SET start_notified = true WHERE id = $1',
          [exam.id]
        );

        console.log(`[Scheduler] Notified ${studentIds.length} students: exam "${exam.title}" (id=${exam.id}) started`);
      } catch (examErr) {
        console.error(`[Scheduler] Error processing exam ${exam.id}:`, examErr.message);
      }
    }
  } catch (err) {
    console.error('[Scheduler] DB error during check:', err.message);
  }
}

function startScheduler(pool) {
  _pool = pool;
  runCheck();
  _intervalId = setInterval(runCheck, 30 * 1000);
  console.log('[Scheduler] Exam start scheduler running (30s interval)');
}

function stopScheduler() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

module.exports = { startScheduler, stopScheduler };
