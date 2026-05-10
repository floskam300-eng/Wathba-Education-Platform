/**
 * WATHBA — ملف البيانات التجريبية الشامل
 * يغطي جميع الجداول وجميع الحالات الممكنة
 * تشغيل: node server/db/seed.js
 * المعلم الأساسي: admin / admin123
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('./connection');
const bcrypt = require('bcryptjs');

const q = (text, params = []) => pool.query(text, params).then(r => r.rows);

async function seed() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🌱 WATHBA — بدء إضافة البيانات التجريبية الشاملة');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ══════════════════════════════════════════════════════
  // 0. مسح كل البيانات القديمة (بدون مسح المعلم admin)
  // ══════════════════════════════════════════════════════
  console.log('\n⟳  مسح البيانات القديمة...');
  await q('DELETE FROM exam_retry_requests');
  await q('DELETE FROM notification_log');
  await q('DELETE FROM badges');
  await q('DELETE FROM video_progress');
  await q('DELETE FROM exam_results');
  await q('DELETE FROM course_enrollment_requests');
  await q('DELETE FROM student_course_enrollment');
  await q('DELETE FROM payments');
  await q('DELETE FROM questions');
  await q('DELETE FROM exams');
  await q('DELETE FROM pdf_files');
  await q('DELETE FROM videos');
  await q('DELETE FROM sections');
  await q('DELETE FROM courses');
  await q('DELETE FROM students');
  await q('DELETE FROM assistants');
  console.log('  ✓ تم مسح البيانات القديمة');

  // ══════════════════════════════════════════════════════
  // 1. المعلم admin — تحديث البروفايل
  // ══════════════════════════════════════════════════════
  console.log('\n⟳  تحديث بيانات المعلم admin...');
  const [teacher] = await q(`SELECT id FROM teachers WHERE username='admin' LIMIT 1`);
  if (!teacher) {
    console.error('❌ المعلم admin غير موجود — شغّل السيرفر أولاً ليتم إنشاؤه تلقائياً');
    process.exit(1);
  }
  const T = teacher.id;

  await q(`
    UPDATE teachers SET
      name            = 'أ/ محمد عبد الرحمن',
      bio             = 'معلم رياضيات بخبرة 18 عاماً، متخصص في الثانوية العامة، حاصل على بكالوريوس رياضيات جامعة القاهرة، نجح على يديه أكثر من 3000 طالب.',
      classification  = 'مدرس رياضيات — ثانوية عامة وإعدادية',
      whatsapp_phone  = '+201000000000'
    WHERE id = $1
  `, [T]);
  console.log(`  ✓ المعلم admin (id=${T}) — تسجيل الدخول: admin / admin123`);

  // ══════════════════════════════════════════════════════
  // 2. المساعدون (3 مساعدين بصلاحيات مختلفة)
  // ══════════════════════════════════════════════════════
  console.log('\n⟳  إضافة المساعدين...');
  const pass = await bcrypt.hash('123456', 10);

  const assistantsRes = await q(`
    INSERT INTO assistants
      (username, password, name, phone, teacher_id,
       can_add_students, can_edit_students, can_delete_students,
       can_manage_exams, can_view_analytics, can_send_reports,
       can_manage_payments, can_manage_courses, can_send_notifications)
    VALUES
      ('asst_nour',  $1, 'نور أحمد علي',   '+201111111101', $2,
       true,  true,  false, true,  true,  true,  true,  true,  true),
      ('asst_karim', $1, 'كريم محمود حسن', '+201111111102', $2,
       true,  true,  true,  true,  true,  true,  true,  false, false),
      ('asst_heba',  $1, 'هبة سامي ناصر',  '+201111111103', $2,
       true,  true,  false, false, true,  true,  false, false, false)
    RETURNING id, username
  `, [pass, T]);

  const A1 = assistantsRes[0].id; // نور — صلاحيات كاملة
  const A2 = assistantsRes[1].id; // كريم — بدون إدارة كورسات/إشعارات
  // A3 = assistantsRes[2].id    // هبة — للعرض والتقارير فقط
  console.log(`  ✓ 3 مساعدين (asst_nour / asst_karim / asst_heba) — كلمة السر: 123456`);

  // ══════════════════════════════════════════════════════
  // 3. الطلاب (25 طالب — كل المراحل الدراسية)
  // ══════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الطلاب...');
  const studentsRaw = [
    // الصف الثالث الثانوي — 10 طلاب
    ['std_ali',      'علي محمد رمضان',        '+2012001', '+2012002', 'الصف الثالث الثانوي', 'ذكر',  520],
    ['std_fatma',    'فاطمة أحمد سعد',         '+2012003', '+2012004', 'الصف الثالث الثانوي', 'أنثى', 480],
    ['std_youssef',  'يوسف إبراهيم كمال',      '+2012005', '+2012006', 'الصف الثالث الثانوي', 'ذكر',  610],
    ['std_nada',     'ندى حسن عبد الله',       '+2012007', '+2012008', 'الصف الثالث الثانوي', 'أنثى', 390],
    ['std_omar',     'عمر سامي فرج',            '+2012009', '+2012010', 'الصف الثالث الثانوي', 'ذكر',  450],
    ['std_hana',     'هناء وليد منصور',         '+2012011', '+2012012', 'الصف الثالث الثانوي', 'أنثى', 560],
    ['std_hassan',   'حسن علاء طارق',           '+2012013', '+2012014', 'الصف الثالث الثانوي', 'ذكر',  310],
    ['std_mona',     'منى رامي عبد العزيز',     '+2012015', '+2012016', 'الصف الثالث الثانوي', 'أنثى', 275],
    ['std_khaled',   'خالد عصام مبروك',         '+2012017', '+2012018', 'الصف الثالث الثانوي', 'ذكر',  490],
    ['std_dina',     'دينا وليد شريف',          '+2012019', '+2012020', 'الصف الثالث الثانوي', 'أنثى', 340],
    // الصف الثاني الثانوي — 8 طلاب
    ['std_mostafa',  'مصطفى أسامة نور',         '+2012021', '+2012022', 'الصف الثاني الثانوي', 'ذكر',  230],
    ['std_rana',     'رنا طارق عبد العزيز',     '+2012023', '+2012024', 'الصف الثاني الثانوي', 'أنثى', 195],
    ['std_adam',     'آدم محمود صلاح',          '+2012025', '+2012026', 'الصف الثاني الثانوي', 'ذكر',  280],
    ['std_lina',     'لينا سعيد القاضي',        '+2012027', '+2012028', 'الصف الثاني الثانوي', 'أنثى', 185],
    ['std_ziad',     'زياد أحمد مبارك',         '+2012029', '+2012030', 'الصف الثاني الثانوي', 'ذكر',  315],
    ['std_reem',     'ريم حاتم رشاد',           '+2012031', '+2012032', 'الصف الثاني الثانوي', 'أنثى', 248],
    ['std_ibrahim',  'إبراهيم عادل فوزي',       '+2012033', '+2012034', 'الصف الثاني الثانوي', 'ذكر',  170],
    ['std_sara',     'سارة خالد نجيب',          '+2012035', '+2012036', 'الصف الثاني الثانوي', 'أنثى', 290],
    // الصف الأول الثانوي — 5 طلاب
    ['std_nour2',    'نور الدين سامي توفيق',    '+2012039', '+2012040', 'الصف الأول الثانوي',  'ذكر',  95],
    ['std_yasmin',   'ياسمين رأفت عوض',         '+2012041', '+2012042', 'الصف الأول الثانوي',  'أنثى', 80],
    ['std_tarek',    'طارق ماهر أبو زيد',       '+2012043', '+2012044', 'الصف الأول الثانوي',  'ذكر',  125],
    ['std_hana2',    'هنا إسلام قنديل',         '+2012045', '+2012046', 'الصف الأول الثانوي',  'أنثى', 60],
    ['std_layla',    'ليلى وسام عطية',          '+2012049', '+2012050', 'الصف الأول الثانوي',  'أنثى', 85],
    // الصف الثالث الإعدادي — 1 طالب (محذوف — لاختبار deleted_at)
    ['std_deleted',  'طالب محذوف تجريبي',       '+2012099', '+2012098', 'الصف الثالث الإعدادي','ذكر',  0],
    // طالب بدون نشاط — صفر نقاط
    ['std_new',      'أحمد جديد غير نشط',       '+2012097', '+2012096', 'الصف الأول الثانوي',  'ذكر',  0],
  ];

  const students = [];
  for (const [un, name, ph, pph, stage, gender, pts] of studentsRaw) {
    const [r] = await q(
      `INSERT INTO students (username,password,name,phone,parent_phone,academic_stage,gender,teacher_id,points,plain_password)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, username, academic_stage`,
      [un, pass, name, ph, pph, stage, gender, T, pts, '123456']
    );
    students.push(r);
  }

  // نضع deleted_at للطالب المحذوف
  await q(`UPDATE students SET deleted_at = NOW() - INTERVAL '5 days' WHERE username = 'std_deleted'`);

  const sid = (u) => students.find(s => s.username === u)?.id;
  const s3 = students.filter(s => s.academic_stage === 'الصف الثالث الثانوي');
  const s2 = students.filter(s => s.academic_stage === 'الصف الثاني الثانوي');
  const s1 = students.filter(s => s.academic_stage === 'الصف الأول الثانوي');
  console.log(`  ✓ ${students.length} طالب (ثالثة:${s3.length} | ثانية:${s2.length} | أولى:${s1.length}) — كلمة السر: 123456`);

  // ══════════════════════════════════════════════════════
  // 4. الكورسات (6 كورسات — مدفوعة ومجانية)
  // ══════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الكورسات...');
  const coursesRes = await q(`
    INSERT INTO courses (name, description, price, teacher_id, target_stage, is_free, thumbnail_url)
    VALUES
      ('رياضيات الصف الثالث الثانوي — الترم الأول',
       'شرح كامل ومفصل لمنهج رياضيات الصف الثالث الثانوي الترم الأول: المصفوفات والمحددات والجبر الخطي وحساب التفاضل والتكامل. يشمل حل جميع أسئلة الكتاب ونماذج الامتحانات السابقة لآخر 10 سنوات.',
       400.00, $1, 'الصف الثالث الثانوي', false,
       'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=800&h=450&fit=crop'),

      ('رياضيات الصف الثالث الثانوي — الترم الثاني',
       'شرح شامل للترم الثاني: الاحتمالات والإحصاء والمتسلسلات والهندسة التحليلية وحساب المثلثات.',
       400.00, $1, 'الصف الثالث الثانوي', false,
       'https://images.unsplash.com/photo-1509228627152-72ae9ae6848d?w=800&h=450&fit=crop'),

      ('مراجعة نهائية — رياضيات الثانوية العامة',
       'كورس مكثف قبل الامتحان: أهم المسائل والتوقعات وحل نماذج الوزارة لآخر 5 سنوات. مثالي للمراجعة السريعة.',
       300.00, $1, 'الصف الثالث الثانوي', false,
       'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&h=450&fit=crop'),

      ('رياضيات الصف الثاني الثانوي — كامل الترمين',
       'المنهج الكامل للصف الثاني الثانوي بأسلوب مبسط: الهندسة الفراغية وحساب المثلثات والجبر والإحصاء.',
       350.00, $1, 'الصف الثاني الثانوي', false,
       'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&h=450&fit=crop'),

      ('رياضيات الصف الأول الثانوي — تأسيس',
       'كورس تأسيسي شامل للصف الأول الثانوي: الأعداد والجبر الأساسي والهندسة المستوية والإحصاء.',
       250.00, $1, 'الصف الأول الثانوي', false,
       'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=800&h=450&fit=crop'),

      ('مجاني: مقدمة في الرياضيات للجميع',
       'كورس مجاني مفتوح لجميع الطلاب: مفاهيم أساسية في الرياضيات — الأعداد والعمليات والكسور والنسبة والتناسب.',
       0.00, $1, NULL, true,
       'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&h=450&fit=crop')
    RETURNING id
  `, [T]);

  const [C1, C2, C3, C4, C5, C6] = coursesRes.map(r => r.id);
  console.log(`  ✓ 6 كورسات (5 مدفوعة + 1 مجاني)`);

  // ══════════════════════════════════════════════════════
  // 5. الأقسام (sections) — للكورسات 1-5
  // ══════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الأقسام...');
  const secRes = await q(`
    INSERT INTO sections (course_id, title, sort_order) VALUES
      ($1,'الوحدة الأولى: المصفوفات والمحددات',    1),
      ($1,'الوحدة الثانية: الجبر الخطي',            2),
      ($1,'الوحدة الثالثة: حساب التفاضل',           3),
      ($1,'الوحدة الرابعة: حساب التكامل',           4),

      ($2,'الوحدة الأولى: الاحتمالات والإحصاء',     1),
      ($2,'الوحدة الثانية: المتسلسلات والمتتاليات', 2),
      ($2,'الوحدة الثالثة: الهندسة التحليلية',      3),
      ($2,'الوحدة الرابعة: حساب المثلثات',          4),

      ($3,'مراجعة الجبر والمصفوفات',                1),
      ($3,'مراجعة التفاضل والتكامل',                2),
      ($3,'نماذج امتحانات وزارية',                   3),

      ($4,'الوحدة الأولى: الهندسة الفراغية',        1),
      ($4,'الوحدة الثانية: حساب المثلثات',          2),
      ($4,'الوحدة الثالثة: الجبر والإحصاء',         3),

      ($5,'الوحدة الأولى: الأعداد الحقيقية',        1),
      ($5,'الوحدة الثانية: الجبر الأساسي',          2),
      ($5,'الوحدة الثالثة: الهندسة المستوية',       3)
    RETURNING id, course_id, sort_order
  `, [C1, C2, C3, C4, C5]);

  // بناء خريطة sections لكل كورس
  const secMap = {};
  for (const s of secRes) {
    if (!secMap[s.course_id]) secMap[s.course_id] = [];
    secMap[s.course_id].push(s.id);
  }
  console.log(`  ✓ ${secRes.length} قسم على 5 كورسات`);

  // ══════════════════════════════════════════════════════
  // 6. الفيديوهات (47 فيديو)
  // ══════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الفيديوهات...');
  const DEMO_VID = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const videoData = [
    // C1 — ثالثة ترم1 (16 فيديو)
    [C1,'مقدمة الكورس وخطة المذاكرة',               DEMO_VID, 12, 1, secMap[C1][0]],
    [C1,'المصفوفات وأنواعها',                         DEMO_VID, 50, 2, secMap[C1][0]],
    [C1,'جمع وطرح المصفوفات',                        DEMO_VID, 45, 3, secMap[C1][0]],
    [C1,'ضرب المصفوفات',                             DEMO_VID, 60, 4, secMap[C1][0]],
    [C1,'المحددات وخصائصها',                          DEMO_VID, 55, 5, secMap[C1][0]],
    [C1,'المصفوفة المعكوسة وحل الأنظمة',              DEMO_VID, 65, 6, secMap[C1][0]],
    [C1,'المعادلات الخطية — جبر خطي',                 DEMO_VID, 55, 7, secMap[C1][1]],
    [C1,'النهايات وخصائصها',                          DEMO_VID, 50, 8, secMap[C1][2]],
    [C1,'الاشتقاق وقواعد التفاضل',                   DEMO_VID, 65, 9, secMap[C1][2]],
    [C1,'تطبيقات الاشتقاق والقيم الحدية',             DEMO_VID, 70,10, secMap[C1][2]],
    [C1,'القيم العظمى والصغرى',                       DEMO_VID, 55,11, secMap[C1][2]],
    [C1,'مقدمة حساب التكامل',                         DEMO_VID, 60,12, secMap[C1][3]],
    [C1,'التكامل غير المحدود',                        DEMO_VID, 55,13, secMap[C1][3]],
    [C1,'التكامل المحدود',                             DEMO_VID, 65,14, secMap[C1][3]],
    [C1,'تطبيقات التكامل — حساب المساحة',             DEMO_VID, 70,15, secMap[C1][3]],
    [C1,'مراجعة شاملة الترم الأول',                   DEMO_VID, 90,16, secMap[C1][3]],
    // C2 — ثالثة ترم2 (12 فيديو)
    [C2,'فضاء العينة والأحداث',                       DEMO_VID, 50, 1, secMap[C2][0]],
    [C2,'قوانين الاحتمالات وتطبيقاتها',               DEMO_VID, 55, 2, secMap[C2][0]],
    [C2,'الإحصاء الوصفي — المتوسط والوسيط',           DEMO_VID, 45, 3, secMap[C2][0]],
    [C2,'الانحراف المعياري والتشتت',                  DEMO_VID, 50, 4, secMap[C2][0]],
    [C2,'المتتاليات الحسابية',                        DEMO_VID, 55, 5, secMap[C2][1]],
    [C2,'المتتاليات الهندسية ومجاميعها',              DEMO_VID, 55, 6, secMap[C2][1]],
    [C2,'الهندسة التحليلية — المستقيم',               DEMO_VID, 65, 7, secMap[C2][2]],
    [C2,'الدائرة والقطوع المخروطية',                  DEMO_VID, 70, 8, secMap[C2][2]],
    [C2,'مقدمة حساب المثلثات',                        DEMO_VID, 55, 9, secMap[C2][3]],
    [C2,'قانون الجيب وقانون التمام',                  DEMO_VID, 60,10, secMap[C2][3]],
    [C2,'دوائر الوحدة وعلاقات المثلثات',              DEMO_VID, 60,11, secMap[C2][3]],
    [C2,'مراجعة شاملة الترم الثاني',                  DEMO_VID, 90,12, secMap[C2][3]],
    // C3 — مراجعة نهائية (8 فيديو)
    [C3,'مراجعة سريعة للمصفوفات — أهم القوانين',      DEMO_VID, 45, 1, secMap[C3][0]],
    [C3,'مراجعة التفاضل — مسائل متوقعة',              DEMO_VID, 50, 2, secMap[C3][1]],
    [C3,'مراجعة التكامل — مسائل متوقعة',              DEMO_VID, 55, 3, secMap[C3][1]],
    [C3,'نموذج امتحان وزاري 2023 بالحل',              DEMO_VID, 90, 4, secMap[C3][2]],
    [C3,'نموذج امتحان وزاري 2024 بالحل',              DEMO_VID, 90, 5, secMap[C3][2]],
    [C3,'توقعات امتحان 2025 — الجزء الأول',           DEMO_VID, 60, 6, secMap[C3][2]],
    [C3,'توقعات امتحان 2025 — الجزء الثاني',          DEMO_VID, 60, 7, secMap[C3][2]],
    [C3,'أهم 50 سؤال متوقع في الامتحان',              DEMO_VID, 75, 8, secMap[C3][2]],
    // C4 — ثانية كامل (7 فيديو)
    [C4,'الهندسة الفراغية — المستوى والخط',           DEMO_VID, 55, 1, secMap[C4][0]],
    [C4,'المجسمات وحجوم الأجسام الهندسية',            DEMO_VID, 60, 2, secMap[C4][0]],
    [C4,'حساب المثلثات — التعريفات والنسب',           DEMO_VID, 50, 3, secMap[C4][1]],
    [C4,'القانون الجيبي وقانون التمام',               DEMO_VID, 55, 4, secMap[C4][1]],
    [C4,'الجبر — المعادلات التربيعية وما فوقها',       DEMO_VID, 50, 5, secMap[C4][2]],
    [C4,'الإحصاء — تمثيل البيانات وتحليلها',           DEMO_VID, 45, 6, secMap[C4][2]],
    [C4,'مراجعة شاملة للصف الثاني',                   DEMO_VID, 60, 7, secMap[C4][2]],
    // C5 — أولى تأسيس (4 فيديو)
    [C5,'الأعداد الحقيقية والعمليات الأساسية',        DEMO_VID, 45, 1, secMap[C5][0]],
    [C5,'الجبر الأساسي والمعادلات',                   DEMO_VID, 50, 2, secMap[C5][1]],
    [C5,'الهندسة المستوية الأساسية',                  DEMO_VID, 45, 3, secMap[C5][2]],
    [C5,'تمارين وتطبيقات شاملة',                      DEMO_VID, 55, 4, secMap[C5][2]],
    // C6 — مجاني (3 فيديو) — بدون sections
    [C6,'مقدمة في الرياضيات — الأعداد',               DEMO_VID, 30, 1, null],
    [C6,'الكسور والنسبة والتناسب',                    DEMO_VID, 35, 2, null],
    [C6,'مسائل يومية من الحياة بالرياضيات',           DEMO_VID, 40, 3, null],
  ];

  const videoIds = [];
  for (const [cid, title, url, dur, so, secid] of videoData) {
    const [v] = await q(
      `INSERT INTO videos (title,file_path_or_url,duration_minutes,course_id,sort_order,section_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, course_id, duration_minutes`,
      [title, url, dur, cid, so, secid]
    );
    videoIds.push(v);
  }
  console.log(`  ✓ ${videoIds.length} فيديو على 6 كورسات`);

  // ══════════════════════════════════════════════════════
  // 7. ملفات PDF (20 ملف)
  // ══════════════════════════════════════════════════════
  console.log('\n⟳  إضافة ملفات PDF...');
  const DEMO_PDF = '/uploads/sample_demo.pdf';
  const pdfRows = [
    ['ملزمة المصفوفات والمحددات كاملة',               C1, secMap[C1][0]],
    ['أسئلة وحلول نموذجية — الجبر الخطي',             C1, secMap[C1][1]],
    ['شرح التفاضل بالتفصيل مع أمثلة',                 C1, secMap[C1][2]],
    ['تمارين التكامل المحلولة — كل الأنواع',           C1, secMap[C1][3]],
    ['ملزمة الاحتمالات والإحصاء',                      C2, secMap[C2][0]],
    ['أسئلة المتتاليات — حلول نموذجية كاملة',          C2, secMap[C2][1]],
    ['الهندسة التحليلية — أهم المسائل والحلول',         C2, secMap[C2][2]],
    ['ملخص شامل لكل منهج الثالث الثانوي',              C3, secMap[C3][0]],
    ['نماذج امتحانات 5 سنوات سابقة مع الحلول',         C3, secMap[C3][2]],
    ['ورقة التوقعات والأسئلة المكررة 2025',            C3, secMap[C3][2]],
    ['الهندسة الفراغية — شرح وتمارين محلولة',          C4, secMap[C4][0]],
    ['حساب المثلثات — ملزمة كاملة بالحلول',            C4, secMap[C4][1]],
    ['الجبر والإحصاء للصف الثاني — أسئلة متنوعة',      C4, secMap[C4][2]],
    ['الأساسيات — ملزمة الصف الأول الثانوي',           C5, secMap[C5][0]],
    ['الجبر الأساسي — مسائل وحلول',                    C5, secMap[C5][1]],
    ['الهندسة الأساسية والقياسات',                      C5, secMap[C5][2]],
    ['ملزمة الكورس المجاني — كل الدروس',               C6, null],
    ['أسئلة الكورس المجاني مع الحلول',                 C6, null],
    ['ورقة صيغ الرياضيات الشاملة — كل المراحل',        C1, null],
    ['قاموس مصطلحات الرياضيات بالعربية والإنجليزية',    C6, null],
  ];
  for (const [title, cid, secid] of pdfRows) {
    await q(
      `INSERT INTO pdf_files (title, file_url, course_id, section_id) VALUES ($1,$2,$3,$4)`,
      [title, DEMO_PDF, cid, secid]
    );
  }
  console.log(`  ✓ ${pdfRows.length} ملف PDF`);

  // ══════════════════════════════════════════════════════
  // 8. الامتحانات (12 امتحان — كل الحالات)
  // ══════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الامتحانات...');
  const now = new Date();
  const daysAgo  = (d) => new Date(now - d * 86400000).toISOString();
  const daysLater = (d) => new Date(now.getTime() + d * 86400000).toISOString();

  const examDefs = [
    // امتحانات منتهية (start < end < now)
    { title:'امتحان المصفوفات والمحددات — الشهر الأول',  dur:45,  total:100, cid:C1, pass:60, badge:'نجم المصفوفات',      color:'#FFD700', sd:daysAgo(40), ed:daysAgo(35) },
    { title:'امتحان التفاضل والتكامل',                   dur:60,  total:100, cid:C1, pass:65, badge:'خبير التفاضل',       color:'#FF6347', sd:daysAgo(25), ed:daysAgo(20) },
    { title:'امتحان نهاية الترم الأول — رياضيات ثالثة',  dur:90,  total:100, cid:C1, pass:65, badge:'متفوق الترم الأول',  color:'#FF4500', sd:daysAgo(10), ed:daysAgo(5)  },
    { title:'امتحان الاحتمالات والإحصاء',                dur:50,  total:100, cid:C2, pass:60, badge:'عالم الإحصاء',       color:'#00CED1', sd:daysAgo(30), ed:daysAgo(25) },
    { title:'امتحان المتتاليات والهندسة التحليلية',       dur:60,  total:100, cid:C2, pass:60, badge:'مبدع الهندسة',       color:'#8B5CF6', sd:daysAgo(15), ed:daysAgo(10) },
    { title:'امتحان الهندسة الفراغية',                   dur:45,  total:100, cid:C4, pass:60, badge:'مهندس المستقبل',     color:'#4169E1', sd:daysAgo(20), ed:daysAgo(15) },
    { title:'امتحان حساب المثلثات',                      dur:45,  total:100, cid:C4, pass:60, badge:'عبقري المثلثات',     color:'#DC143C', sd:daysAgo(8),  ed:daysAgo(3)  },
    // امتحان نشط الآن (start < now < end)
    { title:'امتحان المراجعة النهائية — شامل الثلاث سنوات',dur:90, total:100, cid:C3, pass:70, badge:'مستعد للثانوية',     color:'#32CD32', sd:daysAgo(3),  ed:daysLater(4)},
    // امتحان قادم (now < start < end)
    { title:'امتحان الفصل الثاني — مجدول مسبقاً',        dur:60,  total:100, cid:C1, pass:60, badge:'متميز الفصل الثاني', color:'#0EA5E9', sd:daysLater(7),ed:daysLater(14)},
    // امتحان بدون كورس (عام لكل الطلاب)
    { title:'امتحان عام مفتوح — كل الطلاب',              dur:30,  total:50,  cid:null,pass:25,badge:'نجم الدفعة',          color:'#22C55E', sd:daysAgo(5),  ed:daysLater(5)},
    // امتحان بدون تاريخ (مفتوح دائماً)
    { title:'اختبار تحديد المستوى — أول ثانوي',          dur:30,  total:50,  cid:C5, pass:25, badge:null,                  color:'#FF8C00', sd:null,        ed:null        },
    // امتحان بدون شارة
    { title:'تمرين قصير — جبر أساسي',                    dur:20,  total:20,  cid:C5, pass:10, badge:null,                  color:'#6B7280', sd:null,        ed:null        },
  ];

  const examIds = [];
  for (const e of examDefs) {
    const [r] = await q(`
      INSERT INTO exams
        (title,duration_minutes,total_score,course_id,teacher_id,pass_score,badge_name,badge_color,start_date,end_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [e.title, e.dur, e.total, e.cid, T, e.pass, e.badge, e.color, e.sd, e.ed]
    );
    examIds.push(r.id);
  }
  const [E1,E2,E3,E4,E5,E6,E7,E8,E9,E10,E11,E12] = examIds;
  console.log(`  ✓ ${examIds.length} امتحان (منتهية + نشط + قادم + مفتوح + بدون تاريخ)`);

  // ══════════════════════════════════════════════════════
  // 9. الأسئلة — كل الأنواع (mcq / true_false / essay)
  // ══════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الأسئلة...');

  const addQs = async (examId, rows) => {
    for (const [qt, a, b, c, d, ans, pts, type, ekey] of rows) {
      await q(
        `INSERT INTO questions
           (exam_id,question_text,option_a,option_b,option_c,option_d,
            correct_answer_letter,points,question_type,essay_answer_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [examId, qt, a, b, c||null, d||null, ans, pts, type||'mcq', ekey||null]
      );
    }
  };

  // E1 — المصفوفات (10 أسئلة × 10 = 100 نقطة — كل mcq)
  await addQs(E1, [
    ['ما رتبة حاصل ضرب مصفوفة 2×3 في مصفوفة 3×4؟',           '2×4','3×3','2×3','4×2','A',10,'mcq',null],
    ['ما قيمة محدد المصفوفة [[5,2],[3,1]]؟',                  '-1','11','7','1','A',10,'mcq',null],
    ['المصفوفة المنتقلة تُنشأ بـ:',                            'عكس الإشارات','تبديل الصفوف بالأعمدة','ضرب في -1','إضافة صف','B',10,'mcq',null],
    ['إذا كان det(A)=0 فالمصفوفة تسمى:',                       'وحدانية','قطرية','منفردة','متعامدة','C',10,'mcq',null],
    ['ناتج ضرب مصفوفة الوحدة I في A يساوي:',                  'I','صفر','A','A²','C',10,'mcq',null],
    ['المصفوفة المعكوسة A⁻¹ موجودة إذا:',                     'det(A)=1','det(A)≠0','A مربعة','A قطرية','B',10,'mcq',null],
    ['عناصر المصفوفة القطرية الرئيسية تقع على:',               'الصف الأول','القطر الرئيسي','القطر الثانوي','الصف الأخير','B',10,'mcq',null],
    ['ضرب مصفوفة في مقلوبها يعطي:',                            'الصفر','ضعف A','مصفوفة الوحدة','مقلوب A','C',10,'mcq',null],
    ['المصفوفة المتماثلة تحقق:',                                'A=A⁻¹','A=Aᵀ','det(A)=0','A²=I','B',10,'mcq',null],
    ['عدد عناصر المصفوفة m×n يساوي:',                          'm+n','m-n','m×n','m÷n','C',10,'mcq',null],
  ]);

  // E2 — التفاضل (8 mcq + 1 صح/خطأ + 1 مقالي = 100)
  await addQs(E2, [
    ['مشتقة الدالة f(x)=x⁴ هي:',                              '4x³','x³','4x','3x⁴','A',10,'mcq',null],
    ['مشتقة f(x)=sin(x) هي:',                                 'cos(x)','-cos(x)','-sin(x)','tan(x)','A',10,'mcq',null],
    ['إذا f(x)=e^x فإن f\'(x)=',                              'e^x','xe^x','e^(x-1)','1/e^x','A',10,'mcq',null],
    ['قاعدة حاصل الضرب: (uv)\'=',                             'u\'v','uv\'','u\'v+uv\'','u\'v-uv\'','C',10,'mcq',null],
    ['عند النقطة الحرجة f\'(x)=',                             '0','1','-1','غير محددة','A',10,'mcq',null],
    ['مشتقة ln(x) هي:',                                       'ln(x)','1/x','x','1','B',10,'mcq',null],
    ['مشتقة الثابت c تساوي:',                                  'c','1','0','c²','C',10,'mcq',null],
    ['الدالة تتزايد عندما f\'(x):',                           '<0','=0','>0','غير معرفة','C',10,'mcq',null],
    ['نقطة الانعطاف تحدث عند f\'\'(x)=0',                     'صح','خطأ',null,null,'A',10,'true_false',null],
    ['اشرح قاعدة السلسلة (Chain Rule) مع مثال تطبيقي.',       '','',null,null,'A',10,'essay',
     'إذا كانت y=f(g(x)) فإن dy/dx = f\'(g(x)) · g\'(x) — مثال: d/dx[sin(x²)] = cos(x²) · 2x'],
  ]);

  // E3 — نهاية الترم الأول (7 mcq + 2 صح/خطأ + 1 مقالي = 100)
  await addQs(E3, [
    ['ما قيمة lim(x→3) (x²-9)/(x-3)؟',                       '3','6','0','غير محددة','B',10,'mcq',null],
    ['مشتقة f(x)=3x²-5x+2 هي:',                              '6x-5','3x-5','6x+2','x-5','A',10,'mcq',null],
    ['التكامل ∫x²dx يساوي:',                                   'x²/2','x³/3+C','2x','3x²','B',10,'mcq',null],
    ['الحد الأعظم لـ f(x)=-(x-2)²+5 يساوي:',                  '2','5','-5','10','B',10,'mcq',null],
    ['∫₀² 2x dx يساوي:',                                       '4','2','8','6','A',10,'mcq',null],
    ['محدد [[2,0],[0,3]] يساوي:',                               '6','5','0','1','A',10,'mcq',null],
    ['مشتقة x³ · sin(x) بالنسبة لـ x:',                       '3x²sinx+x³cosx','3x²sinx','x³cosx','3x²cosx','A',10,'mcq',null],
    ['إذا كانت f(x) متزايدة عند x=a فإن f\'(a) > 0',          'صح','خطأ',null,null,'A',10,'true_false',null],
    ['التكامل المحدود يستخدم لحساب المساحة تحت المنحنى',      'صح','خطأ',null,null,'A',10,'true_false',null],
    ['احسب مساحة المنطقة المحصورة بين f(x)=x² و المحور السيني من x=0 إلى x=3',
     '','',null,null,'A',20,'essay','∫₀³ x² dx = [x³/3]₀³ = 9 — المساحة = 9 وحدة مربعة'],
  ]);

  // E4 — الاحتمالات (10 أسئلة — mcq فقط = 100)
  await addQs(E4, [
    ['فضاء العينة لرمي حجر نرد يحتوي على:',                   '4 عناصر','6 عناصر','8 عناصر','12 عنصراً','B',10,'mcq',null],
    ['احتمال ظهور رقم زوجي في رمي نرد:',                      '1/6','1/3','1/2','2/3','C',10,'mcq',null],
    ['إذا كان P(A)=0.4 فإن P(A\')=',                          '0.4','0.6','0.2','0.8','B',10,'mcq',null],
    ['الأحداث المستقلة تحقق: P(A∩B)=',                        'P(A)+P(B)','P(A)·P(B)','P(A)-P(B)','P(A)/P(B)','B',10,'mcq',null],
    ['المتوسط الحسابي لـ 2,4,6,8,10 يساوي:',                  '5','6','7','8','B',10,'mcq',null],
    ['الوسيط لـ 1,3,5,7,9 يساوي:',                            '3','5','7','4','B',10,'mcq',null],
    ['الانحراف المعياري يقيس:',                                 'المتوسط','التشتت حول المتوسط','الوسيط','القيمة العظمى','B',10,'mcq',null],
    ['توزيع ذو الحدين ينطبق عندما:',                          'k نجاح من n محاولة مستقلة','الاحتمالات تتغير','المحاولات غير مستقلة','k=n','A',10,'mcq',null],
    ['إذا كان P(A∪B)=0.7 وP(A)=0.4 وP(B)=0.5 فـ P(A∩B)=',   '0.1','0.2','0.3','0.4','B',10,'mcq',null],
    ['احتمال الحدث المستحيل يساوي:',                           '0','1','0.5','-1','A',10,'mcq',null],
  ]);

  // E5 — المتتاليات والهندسة التحليلية (6 mcq + 2 صح/خطأ + 2 مقالي = 100)
  await addQs(E5, [
    ['الحد العام للمتتالية الحسابية: a_n=',                    'a₁·(n-1)d','a₁+(n-1)d','a₁+(n+1)d','a₁·r^(n-1)','B',10,'mcq',null],
    ['مجموع 10 حدود أولى لمتتالية حسابية أولها 2 وأساسها 3:', '155','165','175','185','B',10,'mcq',null],
    ['الحد العام للمتتالية الهندسية: a_n=',                    'a₁+r^(n-1)','a₁·r^(n-1)','a₁·(n-1)r','a₁/r^n','B',10,'mcq',null],
    ['معادلة المستقيم المار بـ (1,2) وميله 3:',                'y=3x+1','y=3x-1','y=3x+2','y=x+3','B',10,'mcq',null],
    ['المسافة بين (0,0) و (3,4):',                             '3','4','5','7','C',10,'mcq',null],
    ['معادلة الدائرة مركزها (2,3) ونصف قطرها 5:',             '(x-2)²+(y-3)²=5','(x-2)²+(y-3)²=25','(x+2)²+(y+3)²=25','x²+y²=25','B',10,'mcq',null],
    ['المتتالية الهندسية ذات الأساس r>1 تتقارب إلى الصفر',    'صح','خطأ',null,null,'B',10,'true_false',null],
    ['الأساس الموجب والأقل من 1 يجعل المتتالية الهندسية متناقصة','صح','خطأ',null,null,'A',10,'true_false',null],
    ['أوجد مجموع المتتالية الهندسية اللانهائية: 8, 4, 2, 1, ...','','',null,null,'A',10,'essay',
     'المجموع = a₁/(1-r) = 8/(1-0.5) = 8/0.5 = 16'],
    ['جد معادلة المستقيم المار بالنقطتين A(1,3) وB(4,9)','','',null,null,'A',10,'essay',
     'الميل m=(9-3)/(4-1)=2 — المعادلة: y-3=2(x-1) → y=2x+1'],
  ]);

  // E6 — الهندسة الفراغية (10 أسئلة — mcq + صح/خطأ = 100)
  await addQs(E6, [
    ['حجم المكعب الذي طول حافته 4 سم:',                       '16','48','64','32','C',10,'mcq',null],
    ['حجم الأسطوانة = π × r² × h — صح أم خطأ؟',             'صح','خطأ',null,null,'A',10,'true_false',null],
    ['حجم الكرة = (4/3)πr³ — صح أم خطأ؟',                   'صح','خطأ',null,null,'A',10,'true_false',null],
    ['عدد أوجه المكعب:',                                       '4','6','8','12','B',10,'mcq',null],
    ['عدد أوجه الهرم الرباعي (القاعدة + الجوانب):',           '4','5','6','8','B',10,'mcq',null],
    ['مساحة الوجه الجانبي للأسطوانة = 2πrh',                 'صح','خطأ',null,null,'A',10,'true_false',null],
    ['المجسم الذي جميع وجوهه مثلثات متساوية يسمى:',           'مكعب','هرم','رباعي الأوجه المنتظم','أسطوانة','C',10,'mcq',null],
    ['حجم المخروط = (1/3)πr²h',                               'صح','خطأ',null,null,'A',10,'true_false',null],
    ['المسافة بين نقطتين في الفضاء D=√(Δx²+Δy²+Δz²)',        'صح','خطأ',null,null,'A',10,'true_false',null],
    ['أسطوانة نصف قطرها 3 وارتفاعها 7 — حجمها يساوي:',       '63π','42π','21π','9π','A',10,'mcq',null],
  ]);

  // E7 — المثلثات (8 mcq + 2 صح/خطأ = 100)
  await addQs(E7, [
    ['sin(30°) =',                                             '0.5','√3/2','1','√2/2','A',10,'mcq',null],
    ['cos(90°) =',                                             '0','1','-1','0.5','A',10,'mcq',null],
    ['tan(45°) =',                                             '1','√3','0','∞','A',10,'mcq',null],
    ['sin²θ + cos²θ =',                                       '1','0','2','يتغير','A',10,'mcq',null],
    ['sin(60°) =',                                             '√3/2','0.5','1','√2/2','A',10,'mcq',null],
    ['إذا كان sin θ = 0.6 فإن cos θ =',                      '0.8','0.4','1.6','0.36','A',10,'mcq',null],
    ['في مثلث إذا عرفنا ضلعين والزاوية المحصورة نستخدم:',    'قانون الجيب','قانون التمام','نظرية فيثاغورس','لا قانون','B',10,'mcq',null],
    ['cos(0°) = 1',                                           'صح','خطأ',null,null,'A',10,'true_false',null],
    ['sin(90°) = 1',                                          'صح','خطأ',null,null,'A',10,'true_false',null],
    ['قانون التمام: c²=a²+b²-2ab·cosC — اشرح متى يُستخدم.',  '','',null,null,'A',20,'essay',
     'يُستخدم عندما نعرف الأضلاع الثلاثة أو ضلعين والزاوية المحصورة بينهما — يعطينا الضلع أو الزاوية المجهولة'],
  ]);

  // E8 — مراجعة نهائية شاملة (7 mcq + 1 صح/خطأ + 2 مقالي = 100)
  await addQs(E8, [
    ['مشتقة f(x)=x³ هي:',                                     '3x²','3x','x²','2x³','A',10,'mcq',null],
    ['∫2x dx يساوي:',                                         'x','2x²','x²+C','2x+C','C',10,'mcq',null],
    ['log₁₀(1000) يساوي:',                                    '1','2','3','4','C',10,'mcq',null],
    ['الاحتمال دائماً يقع في:',                               '0 إلى 100','0 إلى 1','-1 إلى 1','1 إلى 10','B',10,'mcq',null],
    ['sin²(x)+cos²(x)=1',                                     'صح','خطأ',null,null,'A',10,'true_false',null],
    ['المتتالية الهندسية 2,6,18,...  أساسها:',                '2','3','4','6','B',10,'mcq',null],
    ['معادلة الدائرة مركزها الأصل ونصف قطرها 5:',             'x+y=25','x²+y²=5','x²+y²=25','x²+y²=√5','C',10,'mcq',null],
    ['محدد [[3,1],[2,4]] يساوي:',                              '10','11','7','14','A',10,'mcq',null],
    ['اشرح نظرية النهايات وأعط مثالاً على نهاية ذات صيغة غير محددة (0/0).',
     '','',null,null,'A',15,'essay',
     'الصيغة 0/0 غير محددة — نطبق قاعدة لوبيتال أو التحليل: مثال lim(x→2)(x²-4)/(x-2) = lim(x→2)(x+2) = 4'],
    ['حل المعادلة التفاضلية: dy/dx = 2x مع الشرط الابتدائي y(0)=3.',
     '','',null,null,'A',15,'essay','بالتكامل: y = x² + C — نطبق y(0)=3: 3=0+C → C=3 — الحل: y=x²+3'],
  ]);

  // E9 — امتحان قادم (5 أسئلة بسيطة = 100)
  await addQs(E9, [
    ['ما ناتج 15² - 10²؟',                                    '125','225','125','125','A',20,'mcq',null],
    ['π تساوي تقريباً:',                                      '3.14','2.71','1.41','3.41','A',20,'mcq',null],
    ['مجموع زوايا المثلث = 180°',                             'صح','خطأ',null,null,'A',20,'true_false',null],
    ['مساحة المستطيل = طول × عرض',                            'صح','خطأ',null,null,'A',20,'true_false',null],
    ['مساحة دائرة نصف قطرها 5:',                              '78.54','31.4','25','157','A',20,'mcq',null],
  ]);

  // E10 — عام مفتوح (5 أسئلة = 50 نقطة)
  await addQs(E10, [
    ['كم يساوي 5 × 5؟',                                       '20','25','30','35','B',10,'mcq',null],
    ['الجذر التربيعي لـ 144:',                                 '11','12','13','14','B',10,'mcq',null],
    ['2 + 2 × 2 = ؟',                                         '8','6','4','10','B',10,'mcq',null],
    ['العدد 7 عدد أولي',                                       'صح','خطأ',null,null,'A',10,'true_false',null],
    ['المضاعف المشترك الأصغر لـ 4 و 6:',                     '8','10','12','24','C',10,'mcq',null],
  ]);

  // E11 — تحديد مستوى (5 أسئلة = 50 نقطة)
  await addQs(E11, [
    ['7 × 8 =',                                               '48','56','64','54','B',10,'mcq',null],
    ['مربع العدد 13 =',                                        '169','139','196','163','A',10,'mcq',null],
    ['√144 =',                                                 '12','14','16','11','A',10,'mcq',null],
    ['15 ÷ 3 + 4 × 2 =',                                      '11','13','18','7','B',10,'mcq',null],
    ['الجمع التبادلي: a+b = b+a',                             'صح','خطأ',null,null,'A',10,'true_false',null],
  ]);

  // E12 — تمرين قصير (4 أسئلة = 20 نقطة)
  await addQs(E12, [
    ['حل: 2x + 4 = 10',                                       'x=2','x=3','x=4','x=5','B',5,'mcq',null],
    ['بسّط: (x+2)(x-2)',                                      'x²-4','x²+4','x²-2x+4','x+4','A',5,'mcq',null],
    ['إذا كان x=3، ما قيمة 2x²-1؟',                          '15','17','16','18','B',5,'mcq',null],
    ['المعادلة x²=9 لها حلول: x=±3',                         'صح','خطأ',null,null,'A',5,'true_false',null],
  ]);

  // احسب عدد الأسئلة
  const totalQs = await q('SELECT COUNT(*) FROM questions WHERE exam_id = ANY($1)', [examIds]);
  console.log(`  ✓ ${totalQs[0].count} سؤال على ${examIds.length} امتحان (mcq + صح/خطأ + مقالي)`);

  // ══════════════════════════════════════════════════════
  // 10. التسجيل في الكورسات
  // ══════════════════════════════════════════════════════
  console.log('\n⟳  تسجيل الطلاب في الكورسات...');
  const enrollments = [];

  // طلاب ثالثة → C1, C2, C3
  for (const s of s3) {
    enrollments.push([s.id, C1, 'active']);
    enrollments.push([s.id, C2, 'active']);
    enrollments.push([s.id, C3, 'active']);
  }
  // طلاب ثانية → C4
  for (const s of s2) {
    enrollments.push([s.id, C4, 'active']);
  }
  // طلاب أولى → C5
  for (const s of s1) {
    enrollments.push([s.id, C5, 'active']);
  }
  // بعض الطلاب في C6 المجاني (الكل يمكن)
  for (const s of [...s3.slice(0,3), ...s2.slice(0,3), ...s1]) {
    enrollments.push([s.id, C6, 'active']);
  }
  // حالة "غير نشط"
  enrollments.push([sid('std_dina'), C1, 'inactive']);

  for (const [sid_val, cid, status] of enrollments) {
    if (!sid_val) continue;
    await q(
      `INSERT INTO student_course_enrollment (student_id, course_id, status)
       VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [sid_val, cid, status]
    );
  }
  console.log(`  ✓ ${enrollments.length} تسجيل في الكورسات`);

  // ══════════════════════════════════════════════════════
  // 11. طلبات التسجيل (course_enrollment_requests)
  // ══════════════════════════════════════════════════════
  console.log('\n⟳  إضافة طلبات التسجيل...');
  const enrollReqs = [
    [sid('std_new'),    C1, 'pending',  'أريد الانضمام لكورس الثالثة ثانوي'],
    [sid('std_hana2'),  C4, 'pending',  'هل يمكنني الانضمام لكورس الثانية أيضاً؟'],
    [sid('std_yasmin'), C3, 'accepted', 'أريد المراجعة النهائية'],
    [sid('std_tarek'),  C2, 'rejected', 'طلب تسجيل مرفوض — الطالب لم يكمل المتطلبات'],
  ];
  for (const [s_id, cid, status, msg] of enrollReqs) {
    if (!s_id) continue;
    await q(
      `INSERT INTO course_enrollment_requests (student_id, course_id, status, message)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [s_id, cid, status, msg]
    );
  }
  console.log(`  ✓ ${enrollReqs.length} طلب تسجيل (pending / accepted / rejected)`);

  // ══════════════════════════════════════════════════════
  // 12. المدفوعات (كل الحالات)
  // ══════════════════════════════════════════════════════
  console.log('\n⟳  إضافة المدفوعات...');
  const ago = (days, hours=0) =>
    new Date(now - days * 86400000 - hours * 3600000).toISOString();

  const payments = [
    // مدفوعات موثقة (verified)
    [sid('std_ali'),      C1, 400.00, 'Vodafone Cash', 'verified', 'VF-001-2025', A1, ago(30)],
    [sid('std_fatma'),    C1, 400.00, 'Instapay',      'verified', 'IP-002-2025', A1, ago(28)],
    [sid('std_youssef'),  C1, 400.00, 'Vodafone Cash', 'verified', 'VF-003-2025', A2, ago(25)],
    [sid('std_nada'),     C1, 400.00, 'Instapay',      'verified', 'IP-004-2025', A2, ago(22)],
    [sid('std_omar'),     C1, 400.00, 'Vodafone Cash', 'verified', 'VF-005-2025', A1, ago(20)],
    [sid('std_hana'),     C1, 400.00, 'Cash',          'verified', null,          A1, ago(18)],
    [sid('std_hassan'),   C1, 400.00, 'Instapay',      'verified', 'IP-007-2025', A2, ago(15)],
    [sid('std_mona'),     C1, 400.00, 'Vodafone Cash', 'verified', 'VF-008-2025', A1, ago(12)],
    [sid('std_khaled'),   C1, 400.00, 'Cash',          'verified', null,          A2, ago(10)],
    [sid('std_dina'),     C1, 400.00, 'Instapay',      'verified', 'IP-010-2025', A1, ago(8)],
    [sid('std_ali'),      C2, 400.00, 'Vodafone Cash', 'verified', 'VF-011-2025', A1, ago(7)],
    [sid('std_fatma'),    C2, 400.00, 'Instapay',      'verified', 'IP-012-2025', A2, ago(6)],
    [sid('std_youssef'),  C3, 300.00, 'Cash',          'verified', null,          A1, ago(5)],
    [sid('std_mostafa'),  C4, 350.00, 'Vodafone Cash', 'verified', 'VF-014-2025', A2, ago(20)],
    [sid('std_rana'),     C4, 350.00, 'Instapay',      'verified', 'IP-015-2025', A1, ago(18)],
    [sid('std_adam'),     C4, 350.00, 'Cash',          'verified', null,          A2, ago(15)],
    [sid('std_nour2'),    C5, 250.00, 'Vodafone Cash', 'verified', 'VF-017-2025', A1, ago(10)],
    [sid('std_yasmin'),   C5, 250.00, 'Instapay',      'verified', 'IP-018-2025', A1, ago(8)],
    // مدفوعات معلقة (pending)
    [sid('std_lina'),     C4, 350.00, 'Vodafone Cash', 'pending',  'VF-019-2025', null, ago(2)],
    [sid('std_ziad'),     C4, 350.00, 'Instapay',      'pending',  'IP-020-2025', null, ago(1)],
    [sid('std_tarek'),    C5, 250.00, 'Cash',          'pending',  null,          null, ago(0,5)],
    [sid('std_new'),      C1, 400.00, 'Vodafone Cash', 'pending',  'VF-022-2025', null, ago(0,2)],
    // مدفوعة مرفوضة (rejected)
    [sid('std_hana2'),    C5, 250.00, 'Instapay',      'rejected', 'IP-023-FAKE', null, ago(3)],
  ];

  for (const [s_id, cid, amount, method, status, ref, verified_by, pdate] of payments) {
    if (!s_id) continue;
    await q(`
      INSERT INTO payments
        (student_id, course_id, amount, method, status, reference_number,
         verified_by, verified_at, payment_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [s_id, cid, amount, method, status, ref,
       status === 'verified' ? verified_by : null,
       status === 'verified' ? pdate : null,
       pdate]
    );
  }
  console.log(`  ✓ ${payments.length} دفعة (verified + pending + rejected)`);

  // ══════════════════════════════════════════════════════
  // 13. نتائج الامتحانات
  // ══════════════════════════════════════════════════════
  console.log('\n⟳  إضافة نتائج الامتحانات...');

  const getQs = async (examId) =>
    q('SELECT * FROM questions WHERE exam_id=$1 ORDER BY id', [examId]);

  const mkAnswers = (qs, stuAnswers) =>
    qs.map((row, i) => ({
      question_id:    row.id,
      question_text:  row.question_text,
      question_type:  row.question_type,
      student_answer: stuAnswers[i] ?? null,
      correct_answer: row.correct_answer_letter,
      is_correct:     row.question_type === 'essay' ? null
                        : (stuAnswers[i] === row.correct_answer_letter),
      points: row.points,
    }));

  const insertResult = async (studentUsername, examId, stuAnswers,
                              score, correct, wrong, unans, ptsEarned,
                              graded = true, daysAgoN = 20) => {
    const s_id = sid(studentUsername);
    if (!s_id) return;
    const qs = await getQs(examId);
    const answers = mkAnswers(qs, stuAnswers);
    await q(`
      INSERT INTO exam_results
        (student_id, exam_id, score, correct_count, wrong_count, unanswered_count,
         start_time, end_time, answers, points_earned, essay_graded)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT DO NOTHING`,
      [s_id, examId, score, correct, wrong, unans,
       new Date(now - daysAgoN * 86400000 - 3600000).toISOString(),
       new Date(now - daysAgoN * 86400000).toISOString(),
       JSON.stringify(answers), ptsEarned, graded]
    );
  };

  // ── E1: المصفوفات (منتهي) ──────────────────────────────────
  // إجابات كلها صح
  const allCorrectE1 = ['A','A','B','C','C','B','B','C','B','C'];
  // إجابات نصفها صح
  const halfE1 = ['A','A','A','A','A','B','B','B','B','B'];
  // إجابات كلها خطأ
  const allWrongE1 = ['B','B','A','A','B','A','A','B','A','B'];

  await insertResult('std_ali',      E1, allCorrectE1, 100, 10, 0, 0, 100, true, 37);
  await insertResult('std_fatma',    E1, allCorrectE1, 100, 10, 0, 0, 100, true, 36);
  await insertResult('std_youssef',  E1, allCorrectE1, 100, 10, 0, 0, 100, true, 35);
  await insertResult('std_nada',     E1, halfE1,        50,  5, 5, 0, 50,  true, 37);
  await insertResult('std_omar',     E1, halfE1,        60,  6, 4, 0, 60,  true, 37);
  await insertResult('std_hana',     E1, allCorrectE1,  90,  9, 1, 0, 90,  true, 36);
  await insertResult('std_hassan',   E1, halfE1,        40,  4, 6, 0, 0,   true, 36);
  await insertResult('std_mona',     E1, allWrongE1,    20,  2, 8, 0, 0,   true, 36);
  await insertResult('std_khaled',   E1, allCorrectE1,  80,  8, 2, 0, 80,  true, 37);
  await insertResult('std_dina',     E1, allWrongE1,    30,  3, 7, 0, 0,   true, 37);

  // ── E2: التفاضل (بعضهم لم يحلوا المقالي بعد) ─────────────
  const e2Answered = ['A','A','A','C','A','B','C','C','A','اشتقاق دالة التركيب = مشتقة الخارجية × مشتقة الداخلية'];
  const e2WrongEssay = ['A','A','A','C','A','B','C','C','A','لا أعرف'];
  await insertResult('std_ali',      E2, e2Answered,  90, 8, 0, 0, 90, false, 22);
  await insertResult('std_fatma',    E2, e2WrongEssay,70, 8, 0, 0, 70, false, 22);
  await insertResult('std_youssef',  E2, e2Answered,  90, 8, 0, 0, 90, true,  22);
  await insertResult('std_nada',     E2, halfE1.slice(0,8).concat(['B','لا أعرف الإجابة']), 40, 4, 4, 0, 0, true, 22);
  await insertResult('std_hana',     E2, e2Answered,  80, 7, 1, 0, 80, true,  22);

  // ── E3: نهاية الترم الأول ─────────────────────────────────
  const e3All = ['B','A','B','B','A','A','A','A','A','نحسب ∫₀³ x² dx = [x³/3]₀³ = 9'];
  const e3Half = ['A','B','A','A','B','B','B','B','B','لا أتذكر'];
  await insertResult('std_ali',     E3, e3All,  90, 8, 1, 0, 90, true,  7);
  await insertResult('std_fatma',   E3, e3All,  80, 7, 2, 0, 80, true,  7);
  await insertResult('std_youssef', E3, e3All, 100, 9, 0, 0, 100,true,  7);
  await insertResult('std_omar',    E3, e3Half, 50, 5, 4, 0, 0,  true,  7);
  await insertResult('std_hana',    E3, e3All,  70, 6, 3, 0, 70, false, 7);
  await insertResult('std_hassan',  E3, e3Half, 40, 4, 5, 0, 0,  true,  7);
  await insertResult('std_mona',    E3, e3Half, 30, 3, 6, 0, 0,  true,  7);
  await insertResult('std_khaled',  E3, e3All,  60, 6, 3, 0, 60, true,  7);
  await insertResult('std_dina',    E3, e3Half, 20, 2, 7, 0, 0,  true,  7);
  await insertResult('std_nada',    E3, e3All,  50, 5, 4, 0, 0,  true,  7);

  // ── E4: الاحتمالات ────────────────────────────────────────
  const e4All = ['B','C','B','B','B','B','B','A','B','A'];
  const e4Half = ['A','A','A','A','B','B','B','B','A','B'];
  await insertResult('std_ali',     E4, e4All,  100,10,0,0,100,true, 27);
  await insertResult('std_fatma',   E4, e4All,   80, 8,2,0, 80,true, 27);
  await insertResult('std_youssef', E4, e4All,   90, 9,1,0, 90,true, 27);
  await insertResult('std_nada',    E4, e4Half,  40, 4,6,0,  0,true, 27);
  await insertResult('std_omar',    E4, e4Half,  50, 5,5,0,  0,true, 27);
  await insertResult('std_hana',    E4, e4All,   70, 7,3,0, 70,true, 27);

  // ── E5: المتتاليات ────────────────────────────────────────
  const e5All = ['B','B','B','B','C','B','B','A','السلسلة اللانهائية مجموعها 16','y=2x+1'];
  const e5Half = ['A','A','A','A','A','A','A','B','لا أعرف','لا أعرف'];
  await insertResult('std_ali',     E5, e5All,  90, 8,1,0, 90,true, 12);
  await insertResult('std_youssef', E5, e5All, 100, 9,0,0,100,true, 12);
  await insertResult('std_fatma',   E5, e5Half, 40, 4,5,0,  0,true, 12);
  await insertResult('std_khaled',  E5, e5All,  80, 7,2,0, 80,true, 12);

  // ── E6: الهندسة الفراغية ─────────────────────────────────
  const e6All = ['C','A','A','B','B','A','C','A','A','A'];
  const e6Half = ['A','B','B','A','A','B','A','B','B','B'];
  await insertResult('std_mostafa', E6, e6All,  90, 9,1,0, 90,true, 17);
  await insertResult('std_rana',    E6, e6All, 100,10,0,0,100,true, 17);
  await insertResult('std_adam',    E6, e6Half, 40, 4,6,0,  0,true, 17);
  await insertResult('std_lina',    E6, e6All,  70, 7,3,0, 70,true, 17);
  await insertResult('std_ziad',    E6, e6Half, 50, 5,5,0,  0,true, 17);
  await insertResult('std_reem',    E6, e6All,  80, 8,2,0, 80,true, 17);
  await insertResult('std_ibrahim', E6, e6Half, 30, 3,7,0,  0,true, 17);

  // ── E7: المثلثات ──────────────────────────────────────────
  const e7All = ['A','A','A','A','A','A','B','A','A','يُستخدم عند معرفة الأضلاع الثلاثة أو ضلعين والزاوية المحصورة'];
  const e7Half = ['B','B','B','B','B','B','A','B','B','لا أعرف'];
  await insertResult('std_mostafa', E7, e7All,  80, 8,1,0, 80,true, 5);
  await insertResult('std_rana',    E7, e7All,  90, 9,0,0, 90,true, 5);
  await insertResult('std_adam',    E7, e7Half, 30, 3,6,0,  0,true, 5);
  await insertResult('std_lina',    E7, e7All,  60, 6,3,0, 60,true, 5);
  await insertResult('std_ziad',    E7, e7Half, 20, 2,7,0,  0,true, 5);

  // ── E10: عام مفتوح ───────────────────────────────────────
  const e10All  = ['B','B','B','A','C'];
  const e10Half = ['A','A','A','B','A'];
  // طلاب من مراحل مختلفة
  await insertResult('std_ali',     E10, e10All,  50, 5,0,0, 50,true, 3);
  await insertResult('std_mostafa', E10, e10All,  50, 5,0,0, 50,true, 3);
  await insertResult('std_nour2',   E10, e10Half, 20, 2,3,0,  0,true, 3);
  await insertResult('std_yasmin',  E10, e10All,  40, 4,1,0, 40,true, 3);
  await insertResult('std_hana2',   E10, e10Half, 10, 1,4,0,  0,true, 3);
  await insertResult('std_tarek',   E10, e10All,  50, 5,0,0, 50,true, 3);

  // ── E11: تحديد المستوى ───────────────────────────────────
  const e11All  = ['B','A','A','B','A'];
  const e11Half = ['A','B','B','A','B'];
  await insertResult('std_nour2',   E11, e11All,  50, 5,0,0, 50,true, 30);
  await insertResult('std_yasmin',  E11, e11Half, 30, 3,2,0,  0,true, 30);
  await insertResult('std_tarek',   E11, e11All,  40, 4,1,0, 40,true, 30);
  await insertResult('std_hana2',   E11, e11Half, 20, 2,3,0,  0,true, 30);

  // ── E12: تمرين قصير ──────────────────────────────────────
  const e12All  = ['B','A','B','A'];
  const e12Half = ['A','B','A','B'];
  await insertResult('std_nour2',  E12, e12All,  20, 4,0,0, 20,true, 15);
  await insertResult('std_tarek',  E12, e12Half, 10, 2,2,0,  0,true, 15);
  await insertResult('std_yasmin', E12, e12All,  20, 4,0,0, 20,true, 15);

  const totalResults = await q('SELECT COUNT(*) FROM exam_results');
  console.log(`  ✓ ${totalResults[0].count} نتيجة امتحان (ناجح + راسب + مقالي معلق + محلول)`);

  // ══════════════════════════════════════════════════════
  // 14. الشارات (badges)
  // ══════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الشارات...');
  const badgesData = [
    [sid('std_ali'),     E1, 'نجم المصفوفات',      '#FFD700'],
    [sid('std_fatma'),   E1, 'نجم المصفوفات',      '#FFD700'],
    [sid('std_youssef'), E1, 'نجم المصفوفات',      '#FFD700'],
    [sid('std_hana'),    E1, 'نجم المصفوعات',      '#FFD700'],
    [sid('std_khaled'),  E1, 'نجم المصفوفات',      '#FFD700'],
    [sid('std_ali'),     E2, 'خبير التفاضل',        '#FF6347'],
    [sid('std_youssef'), E2, 'خبير التفاضل',        '#FF6347'],
    [sid('std_hana'),    E2, 'خبير التفاضل',        '#FF6347'],
    [sid('std_ali'),     E3, 'متفوق الترم الأول',   '#FF4500'],
    [sid('std_youssef'), E3, 'متفوق الترم الأول',   '#FF4500'],
    [sid('std_fatma'),   E3, 'متفوق الترم الأول',   '#FF4500'],
    [sid('std_khaled'),  E3, 'متفوق الترم الأول',   '#FF4500'],
    [sid('std_ali'),     E4, 'عالم الإحصاء',         '#00CED1'],
    [sid('std_youssef'), E4, 'عالم الإحصاء',         '#00CED1'],
    [sid('std_hana'),    E4, 'عالم الإحصاء',         '#00CED1'],
    [sid('std_ali'),     E5, 'مبدع الهندسة',         '#8B5CF6'],
    [sid('std_youssef'), E5, 'مبدع الهندسة',         '#8B5CF6'],
    [sid('std_khaled'),  E5, 'مبدع الهندسة',         '#8B5CF6'],
    [sid('std_rana'),    E6, 'مهندس المستقبل',       '#4169E1'],
    [sid('std_mostafa'), E6, 'مهندس المستقبل',       '#4169E1'],
    [sid('std_lina'),    E6, 'مهندس المستقبل',       '#4169E1'],
    [sid('std_reem'),    E6, 'مهندس المستقبل',       '#4169E1'],
    [sid('std_rana'),    E7, 'عبقري المثلثات',       '#DC143C'],
    [sid('std_mostafa'), E7, 'عبقري المثلثات',       '#DC143C'],
    [sid('std_lina'),    E7, 'عبقري المثلثات',       '#DC143C'],
    [sid('std_nour2'),   E11,'تحديد مستوى — ممتاز',  '#20B2AA'],
    [sid('std_tarek'),   E11,'تحديد مستوى — ممتاز',  '#20B2AA'],
    [sid('std_ali'),     E10,'نجم الدفعة',            '#22C55E'],
    [sid('std_mostafa'), E10,'نجم الدفعة',            '#22C55E'],
    [sid('std_yasmin'),  E10,'نجم الدفعة',            '#22C55E'],
    [sid('std_tarek'),   E10,'نجم الدفعة',            '#22C55E'],
  ];
  for (const [s_id, examId, name, color] of badgesData) {
    if (!s_id) continue;
    await q(
      `INSERT INTO badges (student_id, exam_id, badge_name, badge_color) VALUES ($1,$2,$3,$4)`,
      [s_id, examId, name, color]
    );
  }
  console.log(`  ✓ ${badgesData.length} شارة`);

  // ══════════════════════════════════════════════════════
  // 15. تقدم مشاهدة الفيديوهات (video_progress)
  // ══════════════════════════════════════════════════════
  console.log('\n⟳  إضافة تقدم الفيديوهات...');
  const c1Vids = videoIds.filter(v => v.course_id === C1);
  const c2Vids = videoIds.filter(v => v.course_id === C2);
  const c4Vids = videoIds.filter(v => v.course_id === C4);
  const c5Vids = videoIds.filter(v => v.course_id === C5);

  const addProgress = async (studentUsername, vids, pct, watchCount = 1) => {
    const s_id = sid(studentUsername);
    if (!s_id) return;
    for (const v of vids) {
      await q(`
        INSERT INTO video_progress
          (student_id, video_id, watch_count, watched_minutes, progress_percentage, last_watched_at)
        VALUES ($1,$2,$3,$4,$5, NOW() - INTERVAL '2 days')
        ON CONFLICT (student_id, video_id) DO NOTHING`,
        [s_id, v.id, watchCount, Math.floor(v.duration_minutes * pct / 100), pct]
      );
    }
  };

  // طلاب ثالثة — تقدم في C1 وC2
  await addProgress('std_ali',      c1Vids, 100, 2);
  await addProgress('std_fatma',    c1Vids, 80);
  await addProgress('std_youssef',  c1Vids, 100, 3);
  await addProgress('std_hana',     c1Vids, 90);
  await addProgress('std_khaled',   c1Vids, 65);
  await addProgress('std_omar',     c1Vids, 50);
  await addProgress('std_ali',      c2Vids, 75);
  await addProgress('std_youssef',  c2Vids, 60);
  // طلاب ثانية — تقدم في C4
  await addProgress('std_mostafa',  c4Vids, 100, 2);
  await addProgress('std_rana',     c4Vids, 85);
  await addProgress('std_adam',     c4Vids, 45);
  await addProgress('std_lina',     c4Vids, 70);
  await addProgress('std_ziad',     c4Vids, 30);
  // طلاب أولى — تقدم في C5
  await addProgress('std_nour2',    c5Vids, 100);
  await addProgress('std_yasmin',   c5Vids, 50);
  await addProgress('std_tarek',    c5Vids, 80);

  const totalProgress = await q('SELECT COUNT(*) FROM video_progress');
  console.log(`  ✓ ${totalProgress[0].count} سجل تقدم فيديو`);

  // ══════════════════════════════════════════════════════
  // 16. طلبات إعادة الامتحان (exam_retry_requests)
  // ══════════════════════════════════════════════════════
  console.log('\n⟳  إضافة طلبات إعادة الامتحان...');
  const retryReqs = [
    [sid('std_mona'),    E1, 'pending',  'لم أكن مستعدة جيداً، أرجو فرصة أخرى', null],
    [sid('std_hassan'),  E1, 'pending',  'كنت مريضاً يوم الامتحان',              null],
    [sid('std_dina'),    E3, 'pending',  'أريد تحسين درجتي في الامتحان النهائي', null],
    [sid('std_adam'),    E6, 'accepted', 'طلب مقبول — سيُعاد الامتحان هذا الأسبوع',
     'تمت الموافقة — حدد موعد مع المعلم'],
    [sid('std_ziad'),    E7, 'rejected', 'طلب إعادة',
     'مرفوض — لقد أديت الامتحان في الوقت المناسب'],
    [sid('std_nada'),    E2, 'pending',  'أريد تحسين إجابتي في السؤال المقالي', null],
  ];
  for (const [s_id, examId, status, msg, teacherNote] of retryReqs) {
    if (!s_id) continue;
    await q(`
      INSERT INTO exam_retry_requests
        (student_id, exam_id, status, message, teacher_note, handled_at)
      VALUES ($1,$2,$3,$4,$5,$6)`,
      [s_id, examId, status, msg, teacherNote,
       status !== 'pending' ? ago(1) : null]
    );
  }
  console.log(`  ✓ ${retryReqs.length} طلب إعادة (pending + accepted + rejected)`);

  // ══════════════════════════════════════════════════════
  // 17. سجل الإشعارات (notification_log)
  // ══════════════════════════════════════════════════════
  console.log('\n⟳  إضافة سجل الإشعارات...');
  const notifications = [
    // إشعارات للطلاب (WhatsApp)
    [T, sid('std_ali'),    '+2012001', 'student', 'أحسنت يا علي! حصلت على 100% في امتحان المصفوفات. استمر في التفوق!', 'exam_result',  false, ago(37)],
    [T, sid('std_mona'),   '+2012015', 'student', 'درجتك في امتحان المصفوفات 20%. نرجو المراجعة جيداً والتواصل مع المعلم.', 'exam_result', false, ago(36)],
    [T, sid('std_youssef'),'+2012005', 'student', 'مبروك يوسف! حصلت على شارة "نجم المصفوفات". أداء رائع!',            'badge',       true,  ago(35)],
    [T, sid('std_fatma'),  '+2012003', 'student', 'فاطمة، يرجى سداد رسوم الكورس قبل الأسبوع القادم.',                  'payment',     false, ago(10)],
    [T, sid('std_nour2'),  '+2012039', 'student', 'مرحباً نور! تم قبولك في الكورس الجديد. حظاً موفقاً.',               'general',     true,  ago(5)],
    // إشعارات لأولياء الأمور
    [T, sid('std_ali'),    '+2012002', 'parent',  'تقرير شهري: علي يحقق أداء ممتازاً — 3 امتحانات بدرجة 90% فأكثر.',   'report',      true,  ago(7)],
    [T, sid('std_mona'),   '+2012016', 'parent',  'تنبيه: منى تحتاج إلى دعم في مادة المصفوفات. نرجو المتابعة معها.',    'report',      false, ago(36)],
    [T, sid('std_nada'),   '+2012008', 'parent',  'تقرير: ندى تؤدي اختبارات بشكل متوسط. يرجى تشجيعها على المراجعة.',   'report',      false, ago(5)],
    // إشعار عام
    [T, sid('std_hana'),   '+2012011', 'student', 'امتحان المراجعة النهائية يبدأ بعد 3 أيام. استعد جيداً!',              'general',     false, ago(3)],
    [T, sid('std_khaled'), '+2012017', 'student', 'تم تحديث الكورس بفيديوهات جديدة. اطلع عليها الآن!',                  'general',     true,  ago(2)],
  ];

  for (const [tid, s_id, phone, rtype, msg, type, is_read, sent_at] of notifications) {
    if (!s_id) continue;
    await q(`
      INSERT INTO notification_log
        (teacher_id, student_id, recipient_phone, recipient_type, message, type, is_read, sent_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [tid, s_id, phone, rtype, msg, type, is_read, sent_at]
    );
  }
  console.log(`  ✓ ${notifications.length} إشعار (طلاب + أولياء أمور — مقروء وغير مقروء)`);

  // ══════════════════════════════════════════════════════
  // ملخص نهائي
  // ══════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ✅ اكتملت البيانات التجريبية بنجاح!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const summary = await q(`
    SELECT
      (SELECT COUNT(*) FROM teachers)                   AS teachers,
      (SELECT COUNT(*) FROM assistants)                 AS assistants,
      (SELECT COUNT(*) FROM students WHERE deleted_at IS NULL) AS students,
      (SELECT COUNT(*) FROM courses)                    AS courses,
      (SELECT COUNT(*) FROM sections)                   AS sections,
      (SELECT COUNT(*) FROM videos)                     AS videos,
      (SELECT COUNT(*) FROM pdf_files)                  AS pdfs,
      (SELECT COUNT(*) FROM exams)                      AS exams,
      (SELECT COUNT(*) FROM questions)                  AS questions,
      (SELECT COUNT(*) FROM exam_results)               AS results,
      (SELECT COUNT(*) FROM student_course_enrollment)  AS enrollments,
      (SELECT COUNT(*) FROM payments)                   AS payments,
      (SELECT COUNT(*) FROM badges)                     AS badges,
      (SELECT COUNT(*) FROM video_progress)             AS vp,
      (SELECT COUNT(*) FROM notification_log)           AS notifications,
      (SELECT COUNT(*) FROM exam_retry_requests)        AS retries,
      (SELECT COUNT(*) FROM course_enrollment_requests) AS enroll_reqs
  `);
  const s = summary[0];
  console.log(`
  الجدول                    العدد
  ──────────────────────────────────
  المعلمون                   ${s.teachers}
  المساعدون                  ${s.assistants}   (asst_nour / asst_karim / asst_heba — 123456)
  الطلاب                     ${s.students}   (std_ali ... std_new — كلمة السر: 123456)
  الكورسات                   ${s.courses}    (5 مدفوعة + 1 مجاني)
  الأقسام                    ${s.sections}
  الفيديوهات                 ${s.videos}
  ملفات PDF                  ${s.pdfs}
  الامتحانات                 ${s.exams}   (منتهي + نشط + قادم + بدون تاريخ)
  الأسئلة                    ${s.questions}   (mcq + صح/خطأ + مقالي)
  نتائج الامتحانات           ${s.results}
  التسجيلات في الكورسات      ${s.enrollments}
  المدفوعات                  ${s.payments}   (verified + pending + rejected)
  الشارات                    ${s.badges}
  تقدم الفيديوهات            ${s.vp}
  الإشعارات                  ${s.notifications}
  طلبات إعادة الامتحان       ${s.retries}
  طلبات التسجيل في الكورسات ${s.enroll_reqs}
  ──────────────────────────────────

  🔑 تسجيل الدخول:
     المعلم:   admin        / admin123
     مساعد 1:  asst_nour    / 123456  (صلاحيات كاملة)
     مساعد 2:  asst_karim   / 123456  (بدون إدارة كورسات)
     مساعد 3:  asst_heba    / 123456  (عرض وتقارير فقط)
     طالب:     std_ali      / 123456  (الأعلى أداءً)
     طالب:     std_mona     / 123456  (الأضعف أداءً)
     طالب:     std_nour2    / 123456  (أولى ثانوي)
  `);

  await pool.end();
}

seed().catch(err => {
  console.error('\n❌ خطأ في إضافة البيانات:', err.message);
  console.error(err.stack);
  pool.end();
  process.exit(1);
});
