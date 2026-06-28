require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('./connection');

if (process.env.NODE_ENV === 'production') {
  console.error(' مرفوض في بيئة الإنتاج');
  process.exit(1);
}

const q = (text, params = []) => pool.query(text, params).then(r => r.rows);

async function reset() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  WATHBA — تفريغ كل البيانات');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  console.log('\n⟳  جاري مسح البيانات...');
  const tables = [
    'revoked_tokens',
    'whatsapp_send_log', 'whatsapp_schedules',
    'activity_logs', 'game_session_tokens',
    'device_alerts', 'student_devices',
    'recitation_streaks', 'recitation_results', 'recitation_sessions',
    'recitation_questions', 'recitations',
    'exam_sessions', 'event_plays', 'live_hand_raises',
    'live_chat_messages', 'live_stream_viewers', 'live_streams',
    'course_completion_points', 'exam_retry_requests', 'notification_log',
    'badges', 'video_progress', 'exam_results',
    'course_enrollment_requests', 'student_course_enrollment',
    'payments', 'leaderboard_history', 'leaderboard_reset_tracker',
    'bank_questions', 'question_banks', 'questions', 'exams',
    'pdf_files', 'videos', 'sections', 'courses',
    'students', 'assistants',
  ];
  for (const t of tables) {
    try {
      await q(`DELETE FROM ${t}`);
      console.log(`  ✓ ${t}`);
    } catch (e) {
      console.log(`  - ${t} (${e.message})`);
    }
  }
  try {
    await q(`DELETE FROM teachers WHERE username != 'admin'`);
    console.log('  ✓ teachers (non-admin)');
  } catch (_) {}

  console.log('\n✓ تم مسح كل البيانات بنجاح');
  await pool.end();
}

reset().catch(e => { console.error(e); process.exit(1); });
