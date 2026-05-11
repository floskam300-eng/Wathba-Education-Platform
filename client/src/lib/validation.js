// ═══════════════════════════════════════════════════════════
//  Wathba – Shared Frontend Validation Utilities
// ═══════════════════════════════════════════════════════════

export const EGYPTIAN_PHONE_RE = /^01[0125][0-9]{8}$/;

// ── Field-level validators (return null = ok, string = error msg) ──

export function validateName(name, label = 'الاسم') {
  if (!name || !name.trim()) return `${label} مطلوب`;
  if (name.trim().length < 2) return `${label} يجب أن يكون حرفين على الأقل`;
  if (name.trim().length > 100) return `${label} طويل جداً (الحد الأقصى 100 حرف)`;
  return null;
}

export function validatePhone(phone, label = 'رقم الهاتف') {
  if (!phone || !phone.trim()) return null; // optional
  const cleaned = phone.replace(/[\s\-]/g, '');
  if (!EGYPTIAN_PHONE_RE.test(cleaned))
    return `${label} غير صحيح — يجب أن يبدأ بـ 01 ومكوّن من 11 رقم (مثال: 01012345678)`;
  return null;
}

export function validateUsername(username) {
  if (!username || !username.trim()) return 'اسم المستخدم مطلوب';
  if (username.length < 3) return 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل';
  if (username.length > 50) return 'اسم المستخدم طويل جداً (الحد الأقصى 50 حرف)';
  if (/\s/.test(username)) return 'اسم المستخدم لا يجب أن يحتوي على مسافات';
  if (!/^[a-zA-Z0-9_\-.]+$/.test(username))
    return 'اسم المستخدم يجب أن يحتوي على أحرف إنجليزية وأرقام والرموز _ - . فقط';
  return null;
}

export function validatePassword(password, required = true) {
  if (!password || !password.trim()) return required ? 'كلمة المرور مطلوبة' : null;
  if (password.length < 6) return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
  return null;
}

export function validateRequired(value, label) {
  if (value === null || value === undefined || value === '')
    return `${label} مطلوب`;
  return null;
}

export function validatePrice(price) {
  if (price === '' || price === null || price === undefined) return null;
  const num = parseFloat(price);
  if (isNaN(num)) return 'السعر يجب أن يكون رقماً';
  if (num < 0) return 'السعر لا يمكن أن يكون سالباً';
  return null;
}

export function validateAmount(amount) {
  if (amount === '' || amount === null || amount === undefined) return 'المبلغ مطلوب';
  const num = parseFloat(amount);
  if (isNaN(num)) return 'المبلغ يجب أن يكون رقماً';
  if (num <= 0) return 'المبلغ يجب أن يكون أكبر من صفر';
  return null;
}

export function validateDuration(duration) {
  if (duration === '' || duration === null || duration === undefined) return 'مدة الاختبار مطلوبة';
  const num = parseInt(duration, 10);
  if (isNaN(num) || !Number.isInteger(num)) return 'المدة يجب أن تكون رقماً صحيحاً';
  if (num < 1) return 'المدة يجب أن تكون دقيقة واحدة على الأقل';
  if (num > 600) return 'المدة لا يمكن أن تتجاوز 600 دقيقة (10 ساعات)';
  return null;
}

export function validateTotalScore(score) {
  if (score === '' || score === null || score === undefined) return 'المجموع الكلي مطلوب';
  const num = parseInt(score, 10);
  if (isNaN(num)) return 'المجموع يجب أن يكون رقماً صحيحاً';
  if (num < 1) return 'المجموع يجب أن يكون أكبر من صفر';
  if (num > 1000) return 'المجموع لا يمكن أن يتجاوز 1000';
  return null;
}

export function validatePassScore(passScore, totalScore) {
  if (passScore === '' || passScore === null || passScore === undefined)
    return 'درجة النجاح مطلوبة';
  const num = parseInt(passScore, 10);
  const total = parseInt(totalScore, 10);
  if (isNaN(num)) return 'درجة النجاح يجب أن تكون رقماً صحيحاً';
  if (num < 0) return 'درجة النجاح لا يمكن أن تكون سالبة';
  if (!isNaN(total) && num > total)
    return `درجة النجاح لا يمكن أن تتجاوز المجموع الكلي (${total})`;
  return null;
}

export function validateDates(startDate, endDate) {
  if (!startDate || !endDate) return null;
  if (new Date(endDate) <= new Date(startDate))
    return 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية';
  return null;
}

// ── Aggregate validators (return { field: errorMsg } object) ──

export function validateStudentForm(form, isEdit = false) {
  const errors = {};
  const e = (f, v) => { if (v) errors[f] = v; };
  e('name', validateName(form.name, 'اسم الطالب'));
  e('phone', validatePhone(form.phone, 'هاتف الطالب'));
  e('parent_phone', validatePhone(form.parent_phone, 'هاتف ولي الأمر'));
  if (isEdit && form.password) e('password', validatePassword(form.password, false));
  return errors;
}

export function validateAssistantForm(form) {
  const errors = {};
  const e = (f, v) => { if (v) errors[f] = v; };
  e('name', validateName(form.name, 'اسم المساعد'));
  e('username', validateUsername(form.username));
  e('password', validatePassword(form.password, true));
  e('phone', validatePhone(form.phone, 'هاتف المساعد'));
  return errors;
}

export function validateCourseForm(form) {
  const errors = {};
  const e = (f, v) => { if (v) errors[f] = v; };
  e('name', validateName(form.name, 'اسم الكورس'));
  e('price', validatePrice(form.price));
  return errors;
}

export function validateExamForm(form) {
  const errors = {};
  const e = (f, v) => { if (v) errors[f] = v; };
  e('title', validateRequired(form.title?.trim(), 'عنوان الاختبار'));
  e('duration_minutes', validateDuration(form.duration_minutes));
  e('total_score', validateTotalScore(form.total_score));
  e('pass_score', validatePassScore(form.pass_score, form.total_score));
  e('end_date', validateDates(form.start_date, form.end_date));
  return errors;
}

export function validatePaymentForm(form) {
  const errors = {};
  const e = (f, v) => { if (v) errors[f] = v; };
  e('student_id', validateRequired(form.student_id, 'الطالب'));
  e('amount', validateAmount(form.amount));
  return errors;
}

// ── Helper: does the errors object have any error? ──
export const hasErrors = (errors) => Object.keys(errors).length > 0;
