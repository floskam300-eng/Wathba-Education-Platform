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
  grant_recitation_retake:   'منح محاولة إضافية لتسميع',
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
  login_student:             'تسجيل دخول طالب',
  whatsapp_connect:          'ربط واتساب',
  whatsapp_disconnect:       'قطع اتصال واتساب',
  whatsapp_send:             'إرسال رسائل واتساب',
  whatsapp_schedule_create:  'إنشاء جدولة واتساب',
  whatsapp_schedule_edit:    'تعديل جدولة واتساب',
  whatsapp_schedule_delete:  'حذف جدولة واتساب',
  create_recitation:         'إنشاء تسميع',
  edit_recitation:           'تعديل تسميع',
  delete_recitation:         'حذف تسميع',
  publish_recitation:        'نشر/إلغاء نشر تسميع',
  add_assistant:             'إضافة مساعد',
  edit_assistant:            'تعديل مساعد',
  suspend_student:           'إيقاف تعليق طالب',
  device_alert_review:       'مراجعة تنبيه جهاز',
  send_whatsapp_broadcast:   'إرسال رسالة واتساب جماعية',
  create_whatsapp_schedule:  'إنشاء جدولة واتساب',
  enroll_student:            'تسجيل طالب في كورس',
  review_enrollment_request: 'مراجعة طلب انضمام لكورس',
  edit_profile:              'تعديل الملف الشخصي',
  change_password:           'تغيير كلمة المرور',
  create_question_bank:      'إنشاء بنك أسئلة',
  edit_question_bank:        'تعديل بنك أسئلة',
  delete_question_bank:      'حذف بنك أسئلة',
  schedule_livestream:       'جدولة بث مباشر',
  start_livestream:          'بدء بث مباشر',
  end_livestream:            'إنهاء بث مباشر',
  cancel_scheduled_livestream: 'إلغاء بث مجدول',
  kick_student_livestream:  'إخراج طالب من البث',
  clear_all_devices:        'مسح جميع أجهزة طالب',
  update_stream_permissions: 'تعديل صلاحيات طالب في البث',
  mute_all_students:         'كتم صوت جميع الطلاب',
  lock_livestream:           'قفل/فتح البث المباشر',
  award_livestream_points:  'منح نقاط أثناء البث',
  simulation_start:          'بدء وضع محاكاة الطالب',
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
  if (!req) return null;
  return (
    req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    null
  );
}

module.exports = { logActivity, getActor, getIp, ACTION_LABELS };
