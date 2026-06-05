const pool = require('../db/connection');

const ACTION_LABELS = {
  add_student:               'إضافة طالب',
  edit_student:              'تعديل طالب',
  delete_student:            'حذف طالب',
  bulk_import_students:      'استيراد طلاب جماعي',
  create_course:             'إنشاء كورس',
  edit_course:               'تعديل كورس',
  delete_course:             'حذف كورس',
  publish_course:            'نشر/إلغاء نشر كورس',
  upload_video:              'رفع فيديو',
  add_video_url:             'إضافة رابط فيديو',
  upload_pdf:                'رفع ملف PDF',
  delete_video:              'حذف فيديو',
  delete_pdf:                'حذف PDF',
  create_exam:               'إنشاء اختبار',
  edit_exam:                 'تعديل اختبار',
  delete_exam:               'حذف اختبار',
  publish_exam:              'نشر/إلغاء نشر اختبار',
  force_reset_exam_results:  'إعادة تعيين نتائج اختبار',
  approve_retry:             'الموافقة على إعادة اختبار',
  reject_retry:              'رفض إعادة اختبار',
  approve_payment:           'قبول دفعة',
  reject_payment:            'رفض دفعة',
  add_payment:               'إضافة دفعة',
  verify_payment:            'تحقق من دفعة',
  create_assistant:          'إضافة مساعد',
  edit_assistant_perms:      'تعديل صلاحيات مساعد',
  delete_assistant:          'حذف مساعد',
  send_notification:         'إرسال إشعار',
  reset_leaderboard:         'تصفير المتصدرين',
  login_teacher:             'تسجيل دخول معلم',
  login_assistant:           'تسجيل دخول مساعد',
  whatsapp_connect:          'ربط واتساب',
  whatsapp_disconnect:       'قطع اتصال واتساب',
  whatsapp_send:             'إرسال رسائل واتساب',
  whatsapp_schedule_create:  'إنشاء جدولة واتساب',
  whatsapp_schedule_edit:    'تعديل جدولة واتساب',
  whatsapp_schedule_delete:  'حذف جدولة واتساب',
};

async function logActivity({ teacherId, actor, action, entity = {}, details = null, ip = null }) {
  try {
    await pool.query(
      `INSERT INTO activity_logs
         (teacher_id, actor_type, actor_id, actor_name, action,
          entity_type, entity_id, entity_name, details, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        teacherId,
        actor.type,
        actor.id,
        actor.name || null,
        action,
        entity.type || null,
        entity.id   || null,
        entity.name || null,
        details ? JSON.stringify(details) : null,
        ip || null,
      ]
    );
  } catch (err) {
    console.error('[activityLog] Failed to log activity:', err.message);
  }
}

function getActor(req) {
  return {
    type: req.user.role === 'teacher' ? 'teacher' : 'assistant',
    id:   req.user.id,
    name: req.user.name || req.user.username,
  };
}

function getIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    null
  );
}

module.exports = { logActivity, getActor, getIp, ACTION_LABELS };
