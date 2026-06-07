// ═══════════════════════════════════════════════════════════
//  Wathba – Server-side Validation Middleware
// ═══════════════════════════════════════════════════════════

const EGYPTIAN_PHONE_RE = /^01[0125][0-9]{8}$/;

const VALID_STAGES = [
  'الصف الأول الثانوي',
  'الصف الثاني الثانوي',
  'الصف الثالث الثانوي',
  'الصف الأول الإعدادي',
  'الصف الثاني الإعدادي',
  'الصف الثالث الإعدادي',
];
const VALID_GENDERS = ['ذكر', 'أنثى'];

function checkPhone(phone) {
  if (!phone || !String(phone).trim()) return null;
  const cleaned = String(phone).replace(/[\s\-]/g, '');
  if (!EGYPTIAN_PHONE_RE.test(cleaned)) return 'رقم الهاتف غير صحيح — يجب أن يبدأ بـ 01 ومكوّن من 11 رقم';
  return null;
}

function fail(res, errors) {
  const first = Object.values(errors)[0];
  return res.status(400).json({ error: first, errors });
}

// ── Student (POST create / PUT update) ──────────────────────
function validateStudent(req, res, next) {
  const { name, phone, parent_phone, password } = req.body;
  const errors = {};

  const { academic_stage, gender } = req.body;

  if (!name || !String(name).trim()) errors.name = 'اسم الطالب مطلوب';
  else if (String(name).trim().length < 2) errors.name = 'الاسم يجب أن يكون حرفين على الأقل';
  else if (String(name).trim().length > 100) errors.name = 'الاسم طويل جداً (الحد الأقصى 100 حرف)';

  if (academic_stage && !VALID_STAGES.includes(academic_stage))
    errors.academic_stage = `المرحلة الدراسية غير صالحة — القيم المسموح بها: ${VALID_STAGES.join('، ')}`;

  if (gender && !VALID_GENDERS.includes(gender))
    errors.gender = `الجنس يجب أن يكون: ${VALID_GENDERS.join(' أو ')}`;

  const phoneErr = checkPhone(phone);
  if (phoneErr) errors.phone = phoneErr;

  const ppErr = checkPhone(parent_phone);
  if (ppErr) errors.parent_phone = ppErr;

  if (!errors.phone && !errors.parent_phone && phone && parent_phone) {
    const cleanPhone = String(phone).replace(/[\s\-]/g, '');
    const cleanParent = String(parent_phone).replace(/[\s\-]/g, '');
    if (cleanPhone === cleanParent) errors.parent_phone = 'رقم ولي الأمر يجب أن يكون مختلفاً عن رقم الطالب';
  }

  // password only required on edit when provided
  if (password !== undefined && password !== '') {
    if (String(password).length < 6) errors.password = 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
  }

  if (Object.keys(errors).length > 0) return fail(res, errors);
  next();
}

// ── Assistant ────────────────────────────────────────────────
function validateAssistant(req, res, next) {
  const { name, username, password, phone } = req.body;
  const errors = {};

  if (!name || !String(name).trim()) errors.name = 'اسم المساعد مطلوب';
  else if (String(name).trim().length < 2) errors.name = 'الاسم يجب أن يكون حرفين على الأقل';
  else if (String(name).trim().length > 100) errors.name = 'الاسم طويل جداً';

  if (!username || !String(username).trim()) errors.username = 'اسم المستخدم مطلوب';
  else if (String(username).length < 3) errors.username = 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل';
  else if (String(username).length > 50) errors.username = 'اسم المستخدم طويل جداً';
  else if (/\s/.test(username)) errors.username = 'اسم المستخدم لا يجب أن يحتوي على مسافات';
  else if (!/^[a-zA-Z0-9_\-.]+$/.test(username)) errors.username = 'اسم المستخدم يحتوي على أحرف غير مسموحة';

  if (!password) errors.password = 'كلمة المرور مطلوبة';
  else if (String(password).length < 6) errors.password = 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';

  const phoneErr = checkPhone(phone);
  if (phoneErr) errors.phone = phoneErr;

  if (Object.keys(errors).length > 0) return fail(res, errors);
  next();
}

// ── Course ───────────────────────────────────────────────────
function validateCourse(req, res, next) {
  const { name, price } = req.body;
  const errors = {};

  if (!name || !String(name).trim()) errors.name = 'اسم الكورس مطلوب';
  else if (String(name).trim().length < 2) errors.name = 'اسم الكورس يجب أن يكون حرفين على الأقل';
  else if (String(name).trim().length > 300) errors.name = 'اسم الكورس طويل جداً';

  if (price !== undefined && price !== '') {
    const num = parseFloat(price);
    if (isNaN(num)) errors.price = 'السعر يجب أن يكون رقماً';
    else if (num < 0) errors.price = 'السعر لا يمكن أن يكون سالباً';
  }

  if (Object.keys(errors).length > 0) return fail(res, errors);
  next();
}

const VALID_QUESTION_SOURCES = ['manual', 'bank'];

// ── Exam ─────────────────────────────────────────────────────
function validateExam(req, res, next) {
  const { title, duration_minutes, total_score, pass_score, start_date, end_date,
          question_source, bank_id, bank_question_count, points_on_attempt, points_on_pass } = req.body;
  const errors = {};

  if (!title || !String(title).trim()) errors.title = 'عنوان الاختبار مطلوب';

  const dur = parseInt(duration_minutes, 10);
  if (isNaN(dur) || dur < 1) errors.duration_minutes = 'المدة يجب أن تكون دقيقة واحدة على الأقل';
  else if (dur > 600) errors.duration_minutes = 'المدة لا تتجاوز 600 دقيقة (10 ساعات)';

  const total = parseInt(total_score, 10);
  if (isNaN(total) || total < 1) errors.total_score = 'المجموع الكلي يجب أن يكون أكبر من صفر';
  else if (total > 1000) errors.total_score = 'المجموع لا يتجاوز 1000';

  const pass = parseInt(pass_score, 10);
  if (isNaN(pass) || pass < 0) errors.pass_score = 'درجة النجاح لا يمكن أن تكون سالبة';
  else if (!isNaN(total) && pass > total) errors.pass_score = `درجة النجاح لا تتجاوز المجموع (${total})`;

  if (start_date && end_date && new Date(end_date) <= new Date(start_date))
    errors.end_date = 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية';

  if (question_source !== undefined && !VALID_QUESTION_SOURCES.includes(String(question_source)))
    errors.question_source = `مصدر الأسئلة غير صالح — القيم المسموح بها: ${VALID_QUESTION_SOURCES.join('، ')}`;

  if (question_source === 'bank') {
    if (!bank_id) errors.bank_id = 'يجب اختيار بنك الأسئلة عند استخدام مصدر البنك';
    if (bank_question_count !== undefined && bank_question_count !== null && bank_question_count !== '') {
      const bqc = parseInt(bank_question_count, 10);
      if (isNaN(bqc) || bqc < 1) errors.bank_question_count = 'عدد الأسئلة من البنك يجب أن يكون واحداً على الأقل';
    }
  }

  if (points_on_attempt !== undefined && points_on_attempt !== null && points_on_attempt !== '') {
    const pts = parseInt(points_on_attempt, 10);
    if (isNaN(pts) || pts < 0) errors.points_on_attempt = 'نقاط المحاولة يجب أن تكون صفراً أو أكثر';
  }

  if (points_on_pass !== undefined && points_on_pass !== null && points_on_pass !== '') {
    const pts = parseInt(points_on_pass, 10);
    if (isNaN(pts) || pts < 0) errors.points_on_pass = 'نقاط النجاح يجب أن تكون صفراً أو أكثر';
  }

  if (Object.keys(errors).length > 0) return fail(res, errors);
  next();
}

// ── Payment ──────────────────────────────────────────────────
function validatePayment(req, res, next) {
  const { student_id, amount } = req.body;
  const errors = {};

  if (!student_id) errors.student_id = 'يجب اختيار الطالب';

  const num = parseFloat(amount);
  if (!amount && amount !== 0) errors.amount = 'المبلغ مطلوب';
  else if (isNaN(num)) errors.amount = 'المبلغ يجب أن يكون رقماً';
  else if (num <= 0) errors.amount = 'المبلغ يجب أن يكون أكبر من صفر';

  if (Object.keys(errors).length > 0) return fail(res, errors);
  next();
}

module.exports = { validateStudent, validateAssistant, validateCourse, validateExam, validatePayment };
