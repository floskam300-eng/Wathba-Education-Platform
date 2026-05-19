/**
 * WATHBA — البيانات التجريبية الشاملة (النسخة الكاملة المحدّثة)
 * تغطي كل الجداول وكل الأعمدة وكل الحالات
 * تشغيل: node server/db/seed.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('./connection');
const bcrypt = require('bcryptjs');

const q = (text, params = []) => pool.query(text, params).then(r => r.rows);

async function seed() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🌱 WATHBA — بدء إضافة البيانات التجريبية الشاملة الكاملة');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ══════════════════════════════════════════════════════════
  // 0. مسح كل البيانات القديمة بالترتيب الصحيح
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  مسح البيانات القديمة...');
  await q('DELETE FROM event_plays');
  await q('DELETE FROM live_hand_raises');
  await q('DELETE FROM live_chat_messages');
  await q('DELETE FROM live_stream_viewers');
  await q('DELETE FROM live_streams');
  await q('DELETE FROM course_completion_points');
  await q('DELETE FROM exam_retry_requests');
  await q('DELETE FROM notification_log');
  await q('DELETE FROM badges');
  await q('DELETE FROM video_progress');
  await q('DELETE FROM exam_results');
  await q('DELETE FROM course_enrollment_requests');
  await q('DELETE FROM student_course_enrollment');
  await q('DELETE FROM payments');
  await q('DELETE FROM questions');
  await q('DELETE FROM bank_questions');
  await q('DELETE FROM question_banks');
  await q('DELETE FROM exams');
  await q('DELETE FROM pdf_files');
  await q('DELETE FROM videos');
  await q('DELETE FROM sections');
  await q('DELETE FROM courses');
  await q('DELETE FROM students');
  await q('DELETE FROM assistants');
  await q('DELETE FROM leaderboard_history');
  await q('DELETE FROM leaderboard_reset_tracker');
  console.log('  ✓ تم مسح البيانات القديمة بالكامل');

  // ══════════════════════════════════════════════════════════
  // 1. المعلم admin — تحديث كل أعمدة البروفايل
  //    id, username, password, name, bio, classification,
  //    logo_url, photo_url, whatsapp_phone, created_at
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  تحديث بيانات المعلم admin...');
  const [teacher] = await q(`SELECT id FROM teachers WHERE username='admin' LIMIT 1`);
  if (!teacher) {
    console.error('❌ المعلم admin غير موجود — شغّل السيرفر أولاً ليتم إنشاؤه تلقائياً');
    process.exit(1);
  }
  const T = teacher.id;

  await q(`
    UPDATE teachers SET
      name           = 'أ/ محمد عبد الرحمن',
      bio            = 'معلم رياضيات بخبرة 20 عاماً، متخصص في الثانوية العامة والإعدادية، حاصل على بكالوريوس رياضيات جامعة القاهرة ودبلوم تربوي. نجح على يديه أكثر من 4000 طالب في الثانوية العامة. يتميز بأسلوب تبسيطي فريد وشرح مرئي متميز.',
      classification = 'مدرس رياضيات — ثانوية عامة وإعدادية',
      whatsapp_phone = '+201000000000',
      logo_url       = 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=120&h=120&fit=crop',
      photo_url      = 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=400&h=400&fit=crop'
    WHERE id = $1
  `, [T]);
  console.log(`  ✓ المعلم admin (id=${T}) — تسجيل الدخول: admin / admin123`);

  // ══════════════════════════════════════════════════════════
  // 2. المساعدون — كل الأعمدة:
  //    username, password, name, phone, teacher_id,
  //    can_add_students, can_edit_students, can_delete_students,
  //    can_manage_exams, can_view_analytics, can_send_reports,
  //    can_manage_payments, can_manage_courses, can_send_notifications
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة المساعدين...');
  const pass = await bcrypt.hash('123456', 10);

  const assistantsRes = await q(`
    INSERT INTO assistants
      (username, password, name, phone, teacher_id,
       can_add_students, can_edit_students, can_delete_students,
       can_manage_exams,  can_view_analytics, can_send_reports,
       can_manage_payments, can_manage_courses, can_send_notifications)
    VALUES
      ('asst_nour',  $1, 'نور أحمد علي',    '+201111111101', $2,
       true,  true,  false, true,  true,  true,  true,  true,  true),
      ('asst_karim', $1, 'كريم محمود حسن',  '+201111111102', $2,
       true,  true,  true,  true,  true,  true,  false, false, false),
      ('asst_heba',  $1, 'هبة سامي ناصر',   '+201111111103', $2,
       true,  false, false, false, true,  true,  false, false, false)
    RETURNING id, username
  `, [pass, T]);

  const A1 = assistantsRes[0].id;
  const A2 = assistantsRes[1].id;
  const A3 = assistantsRes[2].id;
  console.log(`  ✓ 3 مساعدين — asst_nour(id=${A1}) / asst_karim(id=${A2}) / asst_heba(id=${A3})`);

  // ══════════════════════════════════════════════════════════
  // 3. الطلاب — كل الأعمدة:
  //    username, password, name, phone, parent_phone,
  //    academic_stage, gender, teacher_id, points,
  //    plain_password, deleted_at, fcm_token
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الطلاب...');

  const studentsRaw = [
    // ── الصف الثالث الثانوي ─ 12 طالب
    ['std_ali',      'علي محمد رمضان',           '+201200000001', '+201200000002', 'الصف الثالث الثانوي', 'ذكر',   780],
    ['std_fatma',    'فاطمة أحمد سعد',            '+201200000003', '+201200000004', 'الصف الثالث الثانوي', 'أنثى',  710],
    ['std_youssef',  'يوسف إبراهيم كمال',         '+201200000005', '+201200000006', 'الصف الثالث الثانوي', 'ذكر',   850],
    ['std_nada',     'ندى حسن عبد الله',          '+201200000007', '+201200000008', 'الصف الثالث الثانوي', 'أنثى',  540],
    ['std_omar',     'عمر سامي فرج',              '+201200000009', '+201200000010', 'الصف الثالث الثانوي', 'ذكر',   620],
    ['std_hana',     'هناء وليد منصور',            '+201200000011', '+201200000012', 'الصف الثالث الثانوي', 'أنثى',  690],
    ['std_hassan',   'حسن علاء طارق',             '+201200000013', '+201200000014', 'الصف الثالث الثانوي', 'ذكر',   430],
    ['std_mona',     'منى رامي عبد العزيز',        '+201200000015', '+201200000016', 'الصف الثالث الثانوي', 'أنثى',  280],
    ['std_khaled',   'خالد عصام مبروك',            '+201200000017', '+201200000018', 'الصف الثالث الثانوي', 'ذكر',   660],
    ['std_dina',     'دينا وليد شريف',             '+201200000019', '+201200000020', 'الصف الثالث الثانوي', 'أنثى',  370],
    ['std_amr',      'عمرو جمال سليم',             '+201200000021', '+201200000022', 'الصف الثالث الثانوي', 'ذكر',   510],
    ['std_randa',    'رندا كمال مصطفى',            '+201200000023', '+201200000024', 'الصف الثالث الثانوي', 'أنثى',  460],
    // ── الصف الثاني الثانوي ─ 10 طلاب
    ['std_mostafa',  'مصطفى أسامة نور',            '+201200000025', '+201200000026', 'الصف الثاني الثانوي', 'ذكر',   340],
    ['std_rana',     'رنا طارق عبد العزيز',        '+201200000027', '+201200000028', 'الصف الثاني الثانوي', 'أنثى',  420],
    ['std_adam',     'آدم محمود صلاح',             '+201200000029', '+201200000030', 'الصف الثاني الثانوي', 'ذكر',   295],
    ['std_lina',     'لينا سعيد القاضي',           '+201200000031', '+201200000032', 'الصف الثاني الثانوي', 'أنثى',  380],
    ['std_ziad',     'زياد أحمد مبارك',            '+201200000033', '+201200000034', 'الصف الثاني الثانوي', 'ذكر',   260],
    ['std_reem',     'ريم حاتم رشاد',              '+201200000035', '+201200000036', 'الصف الثاني الثانوي', 'أنثى',  315],
    ['std_ibrahim',  'إبراهيم عادل فوزي',          '+201200000037', '+201200000038', 'الصف الثاني الثانوي', 'ذكر',   190],
    ['std_sara',     'سارة خالد نجيب',             '+201200000039', '+201200000040', 'الصف الثاني الثانوي', 'أنثى',  445],
    ['std_walid',    'وليد فتحي عمار',             '+201200000041', '+201200000042', 'الصف الثاني الثانوي', 'ذكر',   210],
    ['std_nadia',    'نادية سمير حلمي',            '+201200000043', '+201200000044', 'الصف الثاني الثانوي', 'أنثى',  330],
    // ── الصف الأول الثانوي ─ 7 طلاب
    ['std_nour2',    'نور الدين سامي توفيق',       '+201200000045', '+201200000046', 'الصف الأول الثانوي',  'ذكر',   145],
    ['std_yasmin',   'ياسمين رأفت عوض',            '+201200000047', '+201200000048', 'الصف الأول الثانوي',  'أنثى',  120],
    ['std_tarek',    'طارق ماهر أبو زيد',          '+201200000049', '+201200000050', 'الصف الأول الثانوي',  'ذكر',   175],
    ['std_hana2',    'هنا إسلام قنديل',            '+201200000051', '+201200000052', 'الصف الأول الثانوي',  'أنثى',   90],
    ['std_layla',    'ليلى وسام عطية',             '+201200000053', '+201200000054', 'الصف الأول الثانوي',  'أنثى',  130],
    ['std_karim2',   'كريم شريف النجار',            '+201200000055', '+201200000056', 'الصف الأول الثانوي',  'ذكر',    80],
    ['std_salma',    'سلمى محمد الشاذلي',          '+201200000057', '+201200000058', 'الصف الأول الثانوي',  'أنثى',  160],
    // ── طلاب خاصة
    ['std_new',      'أحمد جديد غير نشط',          '+201200000059', '+201200000060', 'الصف الأول الثانوي',  'ذكر',     0],
    ['std_deleted',  'طالب محذوف تجريبي',           '+201200000061', '+201200000062', 'الصف الثالث الإعدادي','ذكر',     0],
  ];

  const students = [];
  for (const [un, name, ph, pph, stage, gender, pts] of studentsRaw) {
    const [r] = await q(
      `INSERT INTO students
         (username, password, name, phone, parent_phone, academic_stage, gender,
          teacher_id, points, fcm_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, username, academic_stage`,
      [un, pass, name, ph, pph, stage, gender, T, pts, null]
    );
    students.push(r);
  }

  await q(`UPDATE students SET deleted_at = NOW() - INTERVAL '7 days' WHERE username = 'std_deleted'`);

  const sid = (u) => students.find(s => s.username === u)?.id;
  const s3  = students.filter(s => s.academic_stage === 'الصف الثالث الثانوي');
  const s2  = students.filter(s => s.academic_stage === 'الصف الثاني الثانوي');
  const s1  = students.filter(s => s.academic_stage === 'الصف الأول الثانوي');
  console.log(`  ✓ ${students.length} طالب (ثالثة:${s3.length} | ثانية:${s2.length} | أولى:${s1.length+2} + خاصة:2)`);

  // ══════════════════════════════════════════════════════════
  // 4. الكورسات — كل الأعمدة:
  //    name, description, price, teacher_id, thumbnail_url,
  //    target_stage, is_free, is_published, points_on_complete
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الكورسات...');
  const coursesRes = await q(`
    INSERT INTO courses
      (name, description, price, teacher_id, target_stage, is_free, is_published,
       points_on_complete, thumbnail_url)
    VALUES
      ('رياضيات الصف الثالث الثانوي — الترم الأول',
       'شرح كامل ومفصل لمنهج رياضيات الصف الثالث الثانوي الترم الأول: المصفوفات والمحددات والجبر الخطي وحساب التفاضل والتكامل. يشمل حل جميع أسئلة الكتاب ونماذج الامتحانات السابقة لآخر 10 سنوات. 16 درس + 4 ملازم + 3 امتحانات.',
       400.00, $1, 'الصف الثالث الثانوي', false, true, 100,
       'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=800&h=450&fit=crop'),

      ('رياضيات الصف الثالث الثانوي — الترم الثاني',
       'شرح شامل للترم الثاني: الاحتمالات والإحصاء والمتسلسلات والهندسة التحليلية وحساب المثلثات. 12 درس + 4 ملازم + 2 امتحانات.',
       400.00, $1, 'الصف الثالث الثانوي', false, true, 100,
       'https://images.unsplash.com/photo-1509228627152-72ae9ae6848d?w=800&h=450&fit=crop'),

      ('مراجعة نهائية — رياضيات الثانوية العامة',
       'كورس مكثف قبل الامتحان: أهم المسائل والتوقعات وحل نماذج الوزارة لآخر 5 سنوات. مثالي للمراجعة السريعة. 8 دروس مكثفة + نماذج محلولة.',
       300.00, $1, 'الصف الثالث الثانوي', false, true, 80,
       'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&h=450&fit=crop'),

      ('رياضيات الصف الثاني الثانوي — كامل الترمين',
       'المنهج الكامل للصف الثاني الثانوي بأسلوب مبسط: الهندسة الفراغية وحساب المثلثات والجبر والإحصاء. 7 دروس أساسية + 3 ملازم.',
       350.00, $1, 'الصف الثاني الثانوي', false, true, 90,
       'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&h=450&fit=crop'),

      ('رياضيات الصف الأول الثانوي — تأسيس شامل',
       'كورس تأسيسي شامل للصف الأول الثانوي: الأعداد الحقيقية والجبر الأساسي والهندسة المستوية والإحصاء. مثالي لمن يريد بداية قوية.',
       250.00, $1, 'الصف الأول الثانوي', false, true, 70,
       'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=800&h=450&fit=crop'),

      ('مجاني: مقدمة في الرياضيات للجميع',
       'كورس مجاني مفتوح لجميع الطلاب: مفاهيم أساسية في الرياضيات — الأعداد والعمليات الأساسية والكسور والنسبة والتناسب. 3 دروس + ملزمة مجانية.',
       0.00, $1, NULL, true, true, 20,
       'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&h=450&fit=crop')
    RETURNING id
  `, [T]);

  const [C1, C2, C3, C4, C5, C6] = coursesRes.map(r => r.id);
  console.log(`  ✓ 6 كورسات (5 مدفوعة + 1 مجاني) — كلها منشورة`);

  // ══════════════════════════════════════════════════════════
  // 5. الأقسام — كل الأعمدة: course_id, title, sort_order
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الأقسام...');
  const secRes = await q(`
    INSERT INTO sections (course_id, title, sort_order) VALUES
      ($1, 'الوحدة الأولى: المصفوفات والمحددات',       1),
      ($1, 'الوحدة الثانية: الجبر الخطي',               2),
      ($1, 'الوحدة الثالثة: حساب التفاضل',              3),
      ($1, 'الوحدة الرابعة: حساب التكامل',              4),

      ($2, 'الوحدة الأولى: الاحتمالات والإحصاء',        1),
      ($2, 'الوحدة الثانية: المتسلسلات والمتتاليات',    2),
      ($2, 'الوحدة الثالثة: الهندسة التحليلية',         3),
      ($2, 'الوحدة الرابعة: حساب المثلثات',             4),

      ($3, 'مراجعة الجبر والمصفوفات',                   1),
      ($3, 'مراجعة التفاضل والتكامل',                   2),
      ($3, 'نماذج امتحانات وزارية محلولة',              3),

      ($4, 'الوحدة الأولى: الهندسة الفراغية',           1),
      ($4, 'الوحدة الثانية: حساب المثلثات',             2),
      ($4, 'الوحدة الثالثة: الجبر والإحصاء',            3),

      ($5, 'الوحدة الأولى: الأعداد الحقيقية',           1),
      ($5, 'الوحدة الثانية: الجبر الأساسي',             2),
      ($5, 'الوحدة الثالثة: الهندسة المستوية',          3)
    RETURNING id, course_id, sort_order
  `, [C1, C2, C3, C4, C5]);

  const secMap = {};
  for (const s of secRes) {
    if (!secMap[s.course_id]) secMap[s.course_id] = [];
    secMap[s.course_id].push(s.id);
  }
  console.log(`  ✓ ${secRes.length} قسم على 5 كورسات`);

  // ══════════════════════════════════════════════════════════
  // 6. الفيديوهات — كل الأعمدة:
  //    title, file_path_or_url, duration_minutes, course_id,
  //    sort_order, section_id, url_480, url_720, url_1080
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الفيديوهات...');
  const DEMO_VID   = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const VID_480    = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&quality=480';
  const VID_720    = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&quality=720';
  const VID_1080   = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&quality=1080';

  const videoData = [
    // C1 — ثالثة ترم1 (16 فيديو)
    [C1, 'مقدمة الكورس وخطة المذاكرة الذكية',           DEMO_VID, 12,  1,  secMap[C1][0]],
    [C1, 'المصفوفات وأنواعها وعملياتها',                 DEMO_VID, 55,  2,  secMap[C1][0]],
    [C1, 'جمع وطرح المصفوفات — تطبيقات',                DEMO_VID, 45,  3,  secMap[C1][0]],
    [C1, 'ضرب المصفوفات — الطريقة الصحيحة',             DEMO_VID, 60,  4,  secMap[C1][0]],
    [C1, 'المحددات من الرتبة الثانية والثالثة',           DEMO_VID, 60,  5,  secMap[C1][0]],
    [C1, 'المصفوفة المعكوسة وحل الأنظمة الخطية',         DEMO_VID, 70,  6,  secMap[C1][0]],
    [C1, 'المعادلات الخطية — الجبر الخطي كامل',          DEMO_VID, 55,  7,  secMap[C1][1]],
    [C1, 'النهايات وخصائصها — حلول الصيغ غير المحددة',   DEMO_VID, 50,  8,  secMap[C1][2]],
    [C1, 'الاشتقاق وقواعد التفاضل الأساسية',             DEMO_VID, 65,  9,  secMap[C1][2]],
    [C1, 'قاعدة السلسلة وتفاضل الدوال المركبة',          DEMO_VID, 60, 10,  secMap[C1][2]],
    [C1, 'تطبيقات الاشتقاق — القيم الحدية',              DEMO_VID, 70, 11,  secMap[C1][2]],
    [C1, 'القيم العظمى والصغرى — حل مسائل',             DEMO_VID, 55, 12,  secMap[C1][2]],
    [C1, 'مقدمة حساب التكامل — المفهوم والتطبيق',        DEMO_VID, 60, 13,  secMap[C1][3]],
    [C1, 'التكامل غير المحدود وقواعده',                  DEMO_VID, 55, 14,  secMap[C1][3]],
    [C1, 'التكامل المحدود وقانون نيوتن-ليبنتز',          DEMO_VID, 65, 15,  secMap[C1][3]],
    [C1, 'مراجعة شاملة الترم الأول + حل نموذج كامل',     DEMO_VID, 90, 16,  secMap[C1][3]],
    // C2 — ثالثة ترم2 (12 فيديو)
    [C2, 'فضاء العينة والأحداث العشوائية',               DEMO_VID, 50,  1,  secMap[C2][0]],
    [C2, 'قوانين الاحتمالات وتطبيقاتها',                 DEMO_VID, 55,  2,  secMap[C2][0]],
    [C2, 'الإحصاء الوصفي — المتوسط والوسيط والمنوال',    DEMO_VID, 50,  3,  secMap[C2][0]],
    [C2, 'الانحراف المعياري والتشتت',                    DEMO_VID, 50,  4,  secMap[C2][0]],
    [C2, 'المتتاليات الحسابية ومجاميعها',                DEMO_VID, 55,  5,  secMap[C2][1]],
    [C2, 'المتتاليات الهندسية ومجاميعها اللانهائية',      DEMO_VID, 60,  6,  secMap[C2][1]],
    [C2, 'الهندسة التحليلية — المستقيم والميل',           DEMO_VID, 65,  7,  secMap[C2][2]],
    [C2, 'الدائرة والقطوع المخروطية',                    DEMO_VID, 70,  8,  secMap[C2][2]],
    [C2, 'مقدمة حساب المثلثات — التعريفات والنسب',       DEMO_VID, 55,  9,  secMap[C2][3]],
    [C2, 'قانون الجيب وقانون التمام',                    DEMO_VID, 60, 10,  secMap[C2][3]],
    [C2, 'دوائر الوحدة وعلاقات المثلثات',                DEMO_VID, 60, 11,  secMap[C2][3]],
    [C2, 'مراجعة شاملة الترم الثاني + حل نموذج كامل',    DEMO_VID, 90, 12,  secMap[C2][3]],
    // C3 — مراجعة نهائية (8 فيديو)
    [C3, 'مراجعة المصفوفات — أهم القوانين والمسائل',      DEMO_VID, 45,  1,  secMap[C3][0]],
    [C3, 'مراجعة التفاضل — المسائل المتوقعة',            DEMO_VID, 50,  2,  secMap[C3][1]],
    [C3, 'مراجعة التكامل — أنواع التكامل المتوقعة',       DEMO_VID, 55,  3,  secMap[C3][1]],
    [C3, 'نموذج امتحان وزاري 2023 كامل بالحل',           DEMO_VID, 90,  4,  secMap[C3][2]],
    [C3, 'نموذج امتحان وزاري 2024 كامل بالحل',           DEMO_VID, 90,  5,  secMap[C3][2]],
    [C3, 'توقعات امتحان 2025 — الجزء الأول',             DEMO_VID, 60,  6,  secMap[C3][2]],
    [C3, 'توقعات امتحان 2025 — الجزء الثاني',            DEMO_VID, 60,  7,  secMap[C3][2]],
    [C3, 'أهم 50 سؤال متوقع في الامتحان النهائي',         DEMO_VID, 75,  8,  secMap[C3][2]],
    // C4 — ثانية كامل (7 فيديو)
    [C4, 'الهندسة الفراغية — المستوى والخط والفضاء',      DEMO_VID, 55,  1,  secMap[C4][0]],
    [C4, 'المجسمات وحساب الحجوم والمساحات',               DEMO_VID, 60,  2,  secMap[C4][0]],
    [C4, 'حساب المثلثات — التعريفات والنسب المثلثية',     DEMO_VID, 50,  3,  secMap[C4][1]],
    [C4, 'قانون الجيب وقانون التمام — تطبيقات',           DEMO_VID, 55,  4,  secMap[C4][1]],
    [C4, 'الجبر — المعادلات التربيعية وما فوقها',          DEMO_VID, 50,  5,  secMap[C4][2]],
    [C4, 'الإحصاء — تمثيل البيانات وتحليلها',             DEMO_VID, 45,  6,  secMap[C4][2]],
    [C4, 'مراجعة شاملة للصف الثاني — حل نموذج',          DEMO_VID, 60,  7,  secMap[C4][2]],
    // C5 — أولى تأسيس (4 فيديو)
    [C5, 'الأعداد الحقيقية والعمليات الأساسية',           DEMO_VID, 45,  1,  secMap[C5][0]],
    [C5, 'الجبر الأساسي والمعادلات من الدرجة الأولى',     DEMO_VID, 50,  2,  secMap[C5][1]],
    [C5, 'الهندسة المستوية — الأشكال والمساحات',          DEMO_VID, 45,  3,  secMap[C5][2]],
    [C5, 'تمارين وتطبيقات شاملة على المنهج كله',          DEMO_VID, 55,  4,  secMap[C5][2]],
    // C6 — مجاني (3 فيديو)
    [C6, 'مقدمة في الرياضيات — الأعداد والعمليات',        DEMO_VID, 30,  1,  null],
    [C6, 'الكسور والنسبة والتناسب',                       DEMO_VID, 35,  2,  null],
    [C6, 'مسائل يومية من الحياة بالرياضيات',              DEMO_VID, 40,  3,  null],
  ];

  const videoIds = [];
  for (const [cid, title, url, dur, so, secid] of videoData) {
    const [v] = await q(
      `INSERT INTO videos
         (title, file_path_or_url, duration_minutes, course_id, sort_order, section_id,
          url_480, url_720, url_1080)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, course_id, duration_minutes`,
      [title, url, dur, cid, so, secid, VID_480, VID_720, VID_1080]
    );
    videoIds.push(v);
  }
  console.log(`  ✓ ${videoIds.length} فيديو على 6 كورسات (مع روابط 480/720/1080)`);

  // ══════════════════════════════════════════════════════════
  // 7. ملفات PDF — كل الأعمدة: title, file_url, course_id, section_id
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة ملفات PDF...');
  const DEMO_PDF = '/uploads/sample_demo.pdf';
  const pdfRows = [
    ['ملزمة المصفوفات والمحددات — شرح كامل',              C1, secMap[C1][0]],
    ['أسئلة وحلول نموذجية — الجبر الخطي',                 C1, secMap[C1][1]],
    ['شرح التفاضل بالتفصيل — كل القواعد مع الأمثلة',       C1, secMap[C1][2]],
    ['تمارين التكامل المحلولة — كل الأنواع',               C1, secMap[C1][3]],
    ['ورقة صيغ رياضيات الثالثة ثانوي — الترم الأول',       C1, null],
    ['ملزمة الاحتمالات والإحصاء — شرح وتمارين',            C2, secMap[C2][0]],
    ['أسئلة المتتاليات — حلول نموذجية كاملة',              C2, secMap[C2][1]],
    ['الهندسة التحليلية — أهم المسائل والحلول',            C2, secMap[C2][2]],
    ['حساب المثلثات — ملزمة الترم الثاني',                 C2, secMap[C2][3]],
    ['ملخص شامل لكل منهج الثالث الثانوي',                  C3, secMap[C3][0]],
    ['نماذج امتحانات 5 سنوات سابقة مع الحلول التفصيلية',   C3, secMap[C3][2]],
    ['ورقة التوقعات والأسئلة المكررة 2025',                C3, secMap[C3][2]],
    ['الهندسة الفراغية — شرح وتمارين محلولة',              C4, secMap[C4][0]],
    ['حساب المثلثات للصف الثاني — ملزمة بالحلول',          C4, secMap[C4][1]],
    ['الجبر والإحصاء للصف الثاني — أسئلة متنوعة',          C4, secMap[C4][2]],
    ['الأساسيات — ملزمة الصف الأول الثانوي كاملة',         C5, secMap[C5][0]],
    ['الجبر الأساسي — مسائل وحلول نموذجية',                C5, secMap[C5][1]],
    ['الهندسة الأساسية والقياسات — شرح تفصيلي',            C5, secMap[C5][2]],
    ['ملزمة الكورس المجاني — كل الدروس مجمعة',             C6, null],
    ['أسئلة الكورس المجاني مع الحلول',                     C6, null],
    ['قاموس مصطلحات الرياضيات عربي-إنجليزي',              C6, null],
    ['ورقة الصيغ الشاملة — كل المراحل الدراسية',           C1, null],
  ];
  for (const [title, cid, secid] of pdfRows) {
    await q(
      `INSERT INTO pdf_files (title, file_url, course_id, section_id) VALUES ($1,$2,$3,$4)`,
      [title, DEMO_PDF, cid, secid]
    );
  }
  console.log(`  ✓ ${pdfRows.length} ملف PDF`);

  // ══════════════════════════════════════════════════════════
  // 8. بنوك الأسئلة (question_banks + bank_questions) — كل الأعمدة
  //    name, subject, teacher_id, course_id
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة بنوك الأسئلة...');
  const banksRes = await q(`
    INSERT INTO question_banks (name, subject, teacher_id, course_id) VALUES
      ('بنك أسئلة المصفوفات — الثالثة الثانوي', 'رياضيات', $1, $2),
      ('بنك أسئلة التفاضل والتكامل',             'رياضيات', $1, $2),
      ('بنك أسئلة الهندسة والمثلثات',            'رياضيات', $1, $3),
      ('بنك أسئلة الإحصاء والاحتمالات',          'رياضيات', $1, $4),
      ('بنك أسئلة الصف الأول التأسيسي',          'رياضيات', $1, $5)
    RETURNING id
  `, [T, C1, C4, C2, C5]);

  const [BK1, BK2, BK3, BK4, BK5] = banksRes.map(r => r.id);

  const bankQsData = [
    // BK1 — مصفوفات (8 أسئلة)
    [BK1,'ما رتبة ناتج ضرب مصفوفة 3×2 في 2×4؟','3×4','2×3','3×2','4×2','A',5,'mcq'],
    [BK1,'إذا A مصفوفة مربعة وdet(A)≠0 فهي:','منفردة','قابلة للعكس','قطرية','متماثلة','B',5,'mcq'],
    [BK1,'المصفوفة الصفرية هي مصفوفة كل عناصرها أصفار','صح','خطأ',null,null,'A',5,'true_false'],
    [BK1,'المصفوفة المنتقلة لمصفوفة (m×n) رتبتها (n×m)','صح','خطأ',null,null,'A',5,'true_false'],
    [BK1,'ناتج A·A⁻¹=','A²','0','I','Aᵀ','C',5,'mcq'],
    [BK1,'المحدد الرئيسي للمصفوفة [[4,0],[0,3]]:','7','12','1','0','B',5,'mcq'],
    [BK1,'المصفوفة المتماثلة تحقق A=Aᵀ','صح','خطأ',null,null,'A',5,'true_false'],
    [BK1,'أوجد مقلوس المصفوفة [[2,1],[1,1]]','','',null,null,'A',10,'essay'],
    // BK2 — تفاضل وتكامل (8 أسئلة)
    [BK2,'مشتقة x⁵ هي:','5x⁴','4x⁵','x⁴','5x⁵','A',5,'mcq'],
    [BK2,'مشتقة cos(x) هي:','-sin(x)','sin(x)','-cos(x)','tan(x)','A',5,'mcq'],
    [BK2,'∫cos(x)dx يساوي:','sin(x)+C','-sin(x)+C','cos(x)+C','-cos(x)+C','A',5,'mcq'],
    [BK2,'الدالة f(x)=x²-4x+3 أدناها عند x=:','3','2','-2','4','B',5,'mcq'],
    [BK2,'التكامل عملية عكسية للاشتقاق','صح','خطأ',null,null,'A',5,'true_false'],
    [BK2,'∫₀¹ x dx يساوي:','1/2','1','2','0','A',5,'mcq'],
    [BK2,'مشتقة الثابت دائماً تساوي صفراً','صح','خطأ',null,null,'A',5,'true_false'],
    [BK2,'احسب ∫(3x²+2x)dx','','',null,null,'A',10,'essay'],
    // BK3 — هندسة ومثلثات (6 أسئلة)
    [BK3,'sin(0°) يساوي:','0','1','-1','0.5','A',5,'mcq'],
    [BK3,'cos(180°) يساوي:','-1','0','1','-0.5','A',5,'mcq'],
    [BK3,'tan(90°) غير معرف','صح','خطأ',null,null,'A',5,'true_false'],
    [BK3,'حجم الكرة = (4/3)πr³','صح','خطأ',null,null,'A',5,'true_false'],
    [BK3,'المسافة بين (1,2) و (4,6):','3','4','5','6','C',5,'mcq'],
    [BK3,'ميل المستقيم المار بـ (0,0) و (2,4):','1','2','4','0','B',5,'mcq'],
    // BK4 — إحصاء (5 أسئلة)
    [BK4,'المتوسط الحسابي لـ 10,20,30 يساوي:','15','20','25','30','B',5,'mcq'],
    [BK4,'احتمال الحدث المؤكد يساوي:','0','0.5','1','-1','C',5,'mcq'],
    [BK4,'الانحراف المعياري لا يمكن أن يكون سالباً','صح','خطأ',null,null,'A',5,'true_false'],
    [BK4,'الوسيط للأعداد 2,4,6,8 يساوي:','4','5','6','3','B',5,'mcq'],
    [BK4,'احتمال ظهور صورة عند رمي عملة معدنية:','1/4','1/3','1/2','1','C',5,'mcq'],
    // BK5 — أولى تأسيسي (4 أسئلة)
    [BK5,'العدد الأولي الأصغر من 10 هو:','1','2','3','4','B',5,'mcq'],
    [BK5,'√25 يساوي:','5','6','7','4','A',5,'mcq'],
    [BK5,'محيط المربع = 4 × الضلع','صح','خطأ',null,null,'A',5,'true_false'],
    [BK5,'ناتج 15 × 15:','200','225','215','230','B',5,'mcq'],
  ];

  for (const [bid, qt, a, b, c, d, ans, pts, type] of bankQsData) {
    await q(`
      INSERT INTO bank_questions
        (bank_id, question_text, option_a, option_b, option_c, option_d,
         correct_answer_letter, points, question_type)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [bid, qt, a, b, c||null, d||null, ans, pts, type]);
  }
  const totalBankQs = await q('SELECT COUNT(*) FROM bank_questions');
  console.log(`  ✓ 5 بنوك أسئلة — ${totalBankQs[0].count} سؤال`);

  // ══════════════════════════════════════════════════════════
  // 9. الامتحانات — كل الأعمدة:
  //    title, duration_minutes, total_score, course_id, teacher_id,
  //    pass_score, badge_name, badge_color, start_date, end_date,
  //    is_published, shuffle_questions, shuffle_options,
  //    question_source, bank_id, bank_question_count,
  //    points_on_attempt, points_on_pass, start_notified
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الامتحانات...');
  const now       = new Date();
  const ago       = (d) => new Date(now - d * 86400000).toISOString();
  const daysAgo   = ago;
  const daysLater = (d) => new Date(now.getTime() + d * 86400000).toISOString();

  const examDefs = [
    // ── منتهية (is_published=true, start_notified=true) ──────
    { title:'امتحان المصفوفات والمحددات — الشهر الأول',     dur:45,  total:100, cid:C1, pass:60, badge:'نجم المصفوفات',      color:'#FFD700', sd:daysAgo(42), ed:daysAgo(35), pub:true,  shQ:false, shO:false, src:'manual',    bankId:null, bankCnt:10, ptAtt:5,  ptPass:20, notified:true  },
    { title:'امتحان التفاضل والتكامل — الترم الأول',        dur:60,  total:100, cid:C1, pass:65, badge:'خبير التفاضل',       color:'#FF6347', sd:daysAgo(28), ed:daysAgo(21), pub:true,  shQ:true,  shO:false, src:'manual',    bankId:null, bankCnt:10, ptAtt:5,  ptPass:20, notified:true  },
    { title:'امتحان نهاية الترم الأول — رياضيات ثالثة',     dur:90,  total:100, cid:C1, pass:65, badge:'متفوق الترم الأول',  color:'#FF4500', sd:daysAgo(14), ed:daysAgo(7),  pub:true,  shQ:true,  shO:true,  src:'manual',    bankId:null, bankCnt:10, ptAtt:10, ptPass:30, notified:true  },
    { title:'امتحان الاحتمالات والإحصاء',                   dur:50,  total:100, cid:C2, pass:60, badge:'عالم الإحصاء',       color:'#00CED1', sd:daysAgo(35), ed:daysAgo(28), pub:true,  shQ:false, shO:false, src:'manual',    bankId:null, bankCnt:10, ptAtt:5,  ptPass:20, notified:true  },
    { title:'امتحان المتتاليات والهندسة التحليلية',          dur:60,  total:100, cid:C2, pass:60, badge:'مبدع الهندسة',       color:'#8B5CF6', sd:daysAgo(18), ed:daysAgo(11), pub:true,  shQ:false, shO:true,  src:'manual',    bankId:null, bankCnt:10, ptAtt:5,  ptPass:20, notified:true  },
    { title:'امتحان الهندسة الفراغية',                      dur:45,  total:100, cid:C4, pass:60, badge:'مهندس المستقبل',     color:'#4169E1', sd:daysAgo(22), ed:daysAgo(15), pub:true,  shQ:false, shO:false, src:'bank',      bankId:BK3,  bankCnt:8,  ptAtt:5,  ptPass:15, notified:true  },
    { title:'امتحان حساب المثلثات',                         dur:45,  total:100, cid:C4, pass:60, badge:'عبقري المثلثات',     color:'#DC143C', sd:daysAgo(10), ed:daysAgo(5),  pub:true,  shQ:true,  shO:false, src:'manual',    bankId:null, bankCnt:10, ptAtt:5,  ptPass:15, notified:true  },
    // ── نشط الآن ─────────────────────────────────────────────
    { title:'امتحان المراجعة النهائية — شامل الثلاث سنوات', dur:90,  total:100, cid:C3, pass:70, badge:'مستعد للثانوية',     color:'#32CD32', sd:daysAgo(4),  ed:daysLater(3),pub:true,  shQ:true,  shO:true,  src:'manual',    bankId:null, bankCnt:10, ptAtt:10, ptPass:40, notified:true  },
    // ── قادم ─────────────────────────────────────────────────
    { title:'امتحان الفصل الثاني — مجدول مسبقاً',           dur:60,  total:100, cid:C1, pass:60, badge:'متميز الفصل الثاني', color:'#0EA5E9', sd:daysLater(7),ed:daysLater(14),pub:true, shQ:false, shO:false, src:'manual',    bankId:null, bankCnt:10, ptAtt:5,  ptPass:20, notified:false },
    // ── عام مفتوح (بدون كورس) ────────────────────────────────
    { title:'امتحان عام مفتوح — كل الطلاب',                 dur:30,  total:50,  cid:null,pass:25, badge:'نجم الدفعة',         color:'#22C55E', sd:daysAgo(6),  ed:daysLater(4),pub:true,  shQ:true,  shO:true,  src:'bank',      bankId:BK5,  bankCnt:5,  ptAtt:3,  ptPass:10, notified:true  },
    // ── بدون تاريخ (مفتوح دائماً) ────────────────────────────
    { title:'اختبار تحديد المستوى — أول ثانوي',             dur:30,  total:50,  cid:C5, pass:25, badge:'طالب متميز',          color:'#F59E0B', sd:null,        ed:null,        pub:true,  shQ:false, shO:false, src:'manual',    bankId:null, bankCnt:10, ptAtt:2,  ptPass:8,  notified:false },
    { title:'تمرين قصير — جبر أساسي',                       dur:20,  total:20,  cid:C5, pass:10, badge:null,                  color:'#6B7280', sd:null,        ed:null,        pub:false, shQ:false, shO:false, src:'manual',    bankId:null, bankCnt:10, ptAtt:1,  ptPass:3,  notified:false },
    // ── امتحان مقالي فقط ─────────────────────────────────────
    { title:'امتحان مقالي تحريري — المصفوفات',               dur:60,  total:40,  cid:C1, pass:24, badge:'كاتب المعادلات',      color:'#A855F7', sd:daysAgo(8),  ed:daysAgo(3),  pub:true,  shQ:false, shO:false, src:'manual',    bankId:null, bankCnt:10, ptAtt:5,  ptPass:15, notified:true  },
    // ── امتحان ثانية إضافي ───────────────────────────────────
    { title:'امتحان نهاية العام — الصف الثاني',              dur:60,  total:100, cid:C4, pass:60, badge:'ناجح بامتياز',        color:'#10B981', sd:daysAgo(7),  ed:daysAgo(2),  pub:true,  shQ:true,  shO:true,  src:'bank',      bankId:BK3,  bankCnt:6,  ptAtt:5,  ptPass:20, notified:true  },
  ];

  const examIds = [];
  for (const e of examDefs) {
    const [r] = await q(`
      INSERT INTO exams
        (title, duration_minutes, total_score, course_id, teacher_id,
         pass_score, badge_name, badge_color, start_date, end_date,
         is_published, shuffle_questions, shuffle_options,
         question_source, bank_id, bank_question_count,
         points_on_attempt, points_on_pass, start_notified)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING id`,
      [e.title, e.dur, e.total, e.cid, T, e.pass, e.badge, e.color, e.sd, e.ed,
       e.pub, e.shQ, e.shO, e.src, e.bankId, e.bankCnt, e.ptAtt, e.ptPass, e.notified]
    );
    examIds.push(r.id);
  }
  const [E1,E2,E3,E4,E5,E6,E7,E8,E9,E10,E11,E12,E13,E14] = examIds;
  console.log(`  ✓ ${examIds.length} امتحان (منتهية + نشط + قادم + مفتوح + بدون تاريخ + مقالي)`);

  // ══════════════════════════════════════════════════════════
  // 10. الأسئلة — كل الأعمدة:
  //     exam_id, question_text, option_a/b/c/d, correct_answer_letter,
  //     points, question_type, essay_answer_key, question_image_url
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الأسئلة...');

  const addQs = async (examId, rows) => {
    for (const [qt, a, b, c, d, ans, pts, type, ekey] of rows) {
      await q(
        `INSERT INTO questions
           (exam_id, question_text, option_a, option_b, option_c, option_d,
            correct_answer_letter, points, question_type, essay_answer_key, question_image_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [examId, qt, a, b, c||null, d||null, ans, pts, type||'mcq', ekey||null, null]
      );
    }
  };

  // E1 — المصفوفات (10 mcq = 100)
  await addQs(E1, [
    ['ما رتبة حاصل ضرب مصفوفة (2×3) في مصفوفة (3×4)؟',         '2×4','3×3','2×3','4×2','A',10,'mcq',null],
    ['ما قيمة محدد المصفوفة [[5,2],[3,1]]؟',                     '-1','11','7','1','A',10,'mcq',null],
    ['المصفوفة المنتقلة تُنشأ بـ:',                               'عكس الإشارات','تبديل الصفوف بالأعمدة','ضرب في -1','إضافة صف','B',10,'mcq',null],
    ['إذا كان det(A)=0 فالمصفوفة تسمى:',                         'وحدانية','قطرية','منفردة','متعامدة','C',10,'mcq',null],
    ['ناتج ضرب مصفوفة الوحدة I في أي مصفوفة A يساوي:',           'I','الصفر','A','A²','C',10,'mcq',null],
    ['المصفوفة المعكوسة A⁻¹ موجودة إذا كان:',                    'det(A)=1','det(A)≠0','A مربعة فقط','A قطرية','B',10,'mcq',null],
    ['عناصر القطر الرئيسي للمصفوفة القطرية تقع على:',             'الصف الأول','القطر الرئيسي','القطر الثانوي','الصف الأخير','B',10,'mcq',null],
    ['حاصل ضرب مصفوفة في مقلوبها يعطي:',                         'الصفر','ضعف A','مصفوفة الوحدة','مقلوب A','C',10,'mcq',null],
    ['المصفوفة المتماثلة (Symmetric) تحقق الشرط:',                'A=A⁻¹','A=Aᵀ','det(A)=0','A²=I','B',10,'mcq',null],
    ['عدد عناصر المصفوفة من الرتبة (m×n) يساوي:',                'm+n','m-n','m×n','m÷n','C',10,'mcq',null],
  ]);

  // E2 — التفاضل (8 mcq + 1 صح/خطأ + 1 مقالي = 100)
  await addQs(E2, [
    ['مشتقة الدالة f(x)=x⁴ بالنسبة لـ x هي:',                   '4x³','x³','4x','3x⁴','A',10,'mcq',null],
    ['مشتقة f(x)=sin(x) هي:',                                    'cos(x)','-cos(x)','-sin(x)','tan(x)','A',10,'mcq',null],
    ['إذا f(x)=eˣ فإن f\'(x)=',                                  'eˣ','xeˣ','e^(x-1)','1/eˣ','A',10,'mcq',null],
    ['قاعدة حاصل الضرب: (uv)\'=',                                'u\'v','uv\'','u\'v+uv\'','u\'v-uv\'','C',10,'mcq',null],
    ['عند النقطة الحرجة تكون قيمة f\'(x) تساوي:',                '1','-1','0','غير محددة','C',10,'mcq',null],
    ['مشتقة ln(x) بالنسبة لـ x هي:',                             'ln(x)','1/x','x','1','B',10,'mcq',null],
    ['مشتقة أي ثابت c تساوي دائماً:',                            'c','1','0','c²','C',10,'mcq',null],
    ['الدالة تتزايد في فترة ما عندما تكون f\'(x):',              '<0','=0','>0','غير معرفة','C',10,'mcq',null],
    ['نقطة الانعطاف تحدث عند f\'\'(x)=0',                        'صح','خطأ',null,null,'A',10,'true_false',null],
    ['اشرح قاعدة السلسلة (Chain Rule) مع مثال.',                 '','',null,null,'A',10,'essay',
     'إذا كانت y=f(g(x)) فإن dy/dx = f\'(g(x))·g\'(x) — مثال: d/dx[sin(x²)] = cos(x²)·2x = 2x·cos(x²)'],
  ]);

  // E3 — نهاية الترم الأول (7 mcq + 2 صح/خطأ + 1 مقالي = 100)
  await addQs(E3, [
    ['ما قيمة lim(x→3) (x²-9)/(x-3)؟',                          '3','6','0','غير محددة','B',10,'mcq',null],
    ['مشتقة f(x)=3x²-5x+2 هي:',                                 '6x-5','3x-5','6x+2','x-5','A',10,'mcq',null],
    ['التكامل ∫x² dx يساوي:',                                    'x²/2','x³/3+C','2x','3x²','B',10,'mcq',null],
    ['الحد الأعظم لـ f(x)=-(x-2)²+5 يساوي:',                    '2','5','-5','10','B',10,'mcq',null],
    ['∫₀² 2x dx يساوي:',                                         '4','2','8','6','A',10,'mcq',null],
    ['محدد [[2,0],[0,3]] يساوي:',                                 '6','5','0','1','A',10,'mcq',null],
    ['مشتقة x³·sin(x) بالنسبة لـ x:',                           '3x²sinx+x³cosx','3x²sinx','x³cosx','3x²cosx','A',10,'mcq',null],
    ['إذا كانت f(x) متزايدة عند x=a فإن f\'(a)>0',              'صح','خطأ',null,null,'A',10,'true_false',null],
    ['التكامل المحدود يستخدم لحساب المساحة تحت المنحنى',         'صح','خطأ',null,null,'A',10,'true_false',null],
    ['احسب مساحة المنطقة المحصورة بين f(x)=x² والمحور السيني من x=0 إلى x=3',
     '','',null,null,'A',20,'essay','∫₀³ x² dx = [x³/3]₀³ = 27/3 - 0 = 9 — المساحة = 9 وحدات مربعة'],
  ]);

  // E4 — الاحتمالات (10 mcq = 100)
  await addQs(E4, [
    ['فضاء العينة لرمي حجر نرد يحتوي على:',                     '4 عناصر','6 عناصر','8 عناصر','12 عنصراً','B',10,'mcq',null],
    ['احتمال ظهور رقم زوجي عند رمي نرد واحد:',                  '1/6','1/3','1/2','2/3','C',10,'mcq',null],
    ['إذا كان P(A)=0.4 فإن P(Aᶜ) يساوي:',                     '0.4','0.6','0.2','0.8','B',10,'mcq',null],
    ['الأحداث المستقلة تحقق: P(A∩B)=',                          'P(A)+P(B)','P(A)·P(B)','P(A)-P(B)','P(A)/P(B)','B',10,'mcq',null],
    ['المتوسط الحسابي للأعداد 2,4,6,8,10 يساوي:',               '5','6','7','8','B',10,'mcq',null],
    ['الوسيط للأعداد 1,3,5,7,9 يساوي:',                         '3','5','7','4','B',10,'mcq',null],
    ['الانحراف المعياري يقيس:',                                   'المتوسط','التشتت حول المتوسط','الوسيط','القيمة العظمى','B',10,'mcq',null],
    ['توزيع ذو الحدين ينطبق عندما:',                             'نجاح k من n محاولة مستقلة','الاحتمالات تتغير','المحاولات غير مستقلة','k=n دائماً','A',10,'mcq',null],
    ['إذا P(A∪B)=0.7 وP(A)=0.4 وP(B)=0.5 فـ P(A∩B)=',         '0.1','0.2','0.3','0.4','B',10,'mcq',null],
    ['احتمال الحدث المستحيل يساوي دائماً:',                      '0','1','0.5','-1','A',10,'mcq',null],
  ]);

  // E5 — المتتاليات والهندسة التحليلية (6 mcq + 2 صح/خطأ + 2 مقالي = 100)
  await addQs(E5, [
    ['الحد العام للمتتالية الحسابية: aₙ=',                       'a₁·(n-1)d','a₁+(n-1)d','a₁+(n+1)d','a₁·rⁿ⁻¹','B',10,'mcq',null],
    ['مجموع 10 حدود لمتتالية حسابية أولها 2 وأساسها 3:',         '155','165','175','185','B',10,'mcq',null],
    ['الحد العام للمتتالية الهندسية: aₙ=',                       'a₁+rⁿ⁻¹','a₁·rⁿ⁻¹','a₁·(n-1)r','a₁/rⁿ','B',10,'mcq',null],
    ['معادلة المستقيم المار بـ (1,2) وميله 3:',                  'y=3x+1','y=3x-1','y=3x+2','y=x+3','B',10,'mcq',null],
    ['المسافة بين النقطتين (0,0) و (3,4):',                      '3','4','5','7','C',10,'mcq',null],
    ['معادلة الدائرة مركزها (2,3) ونصف قطرها 5:',               '(x-2)²+(y-3)²=5','(x-2)²+(y-3)²=25','(x+2)²+(y+3)²=25','x²+y²=25','B',10,'mcq',null],
    ['المتتالية الهندسية ذات الأساس r>1 تتقارب نحو الصفر',       'صح','خطأ',null,null,'B',10,'true_false',null],
    ['الأساس الموجب الأقل من 1 يجعل المتتالية الهندسية متناقصة', 'صح','خطأ',null,null,'A',10,'true_false',null],
    ['أوجد مجموع المتتالية الهندسية اللانهائية: 8, 4, 2, 1, ...',
     '','',null,null,'A',10,'essay','مج = a₁/(1-r) = 8/(1-½) = 8/0.5 = 16'],
    ['جد معادلة المستقيم المار بالنقطتين A(1,3) وB(4,9)',
     '','',null,null,'A',10,'essay','الميل m=(9-3)/(4-1)=6/3=2 — المعادلة: y-3=2(x-1) → y=2x+1'],
  ]);

  // E6 — الهندسة الفراغية (5 mcq + 5 صح/خطأ = 100)
  await addQs(E6, [
    ['حجم المكعب الذي طول حافته 4 سم:',                          '16','48','64','32','C',10,'mcq',null],
    ['عدد أوجه المكعب يساوي:',                                    '4','6','8','12','B',10,'mcq',null],
    ['عدد أوجه الهرم الرباعي القاعدة إجمالاً:',                  '4','5','6','8','B',10,'mcq',null],
    ['المجسم الذي جميع وجوهه مثلثات متساوية يسمى:',              'مكعب','هرم','رباعي الأوجه المنتظم','أسطوانة','C',10,'mcq',null],
    ['أسطوانة نصف قطرها 3 وارتفاعها 7 — حجمها يساوي:',          '63π','42π','21π','9π','A',10,'mcq',null],
    ['المسافة بين نقطتين في الفضاء = √(Δx²+Δy²+Δz²)',           'صح','خطأ',null,null,'A',10,'true_false',null],
    ['حجم الأسطوانة = π × r² × h',                               'صح','خطأ',null,null,'A',10,'true_false',null],
    ['حجم الكرة = (4/3)πr³',                                     'صح','خطأ',null,null,'A',10,'true_false',null],
    ['حجم المخروط = (1/3)πr²h',                                  'صح','خطأ',null,null,'A',10,'true_false',null],
    ['مساحة الوجه الجانبي للأسطوانة = 2πrh',                    'صح','خطأ',null,null,'A',10,'true_false',null],
  ]);

  // E7 — المثلثات (7 mcq + 2 صح/خطأ + 1 مقالي = 100)
  await addQs(E7, [
    ['sin(30°) يساوي:',                                           '0.5','√3/2','1','√2/2','A',10,'mcq',null],
    ['cos(90°) يساوي:',                                           '0','1','-1','0.5','A',10,'mcq',null],
    ['tan(45°) يساوي:',                                           '1','√3','0','∞','A',10,'mcq',null],
    ['sin²θ + cos²θ تساوي دائماً:',                              '1','0','2','يتغير','A',10,'mcq',null],
    ['sin(60°) يساوي:',                                           '√3/2','0.5','1','√2/2','A',10,'mcq',null],
    ['إذا sin θ = 0.6 فإن cos θ = (في الربع الأول):',            '0.8','0.4','1.6','0.36','A',10,'mcq',null],
    ['عند معرفة ضلعين والزاوية المحصورة نستخدم:',                'قانون الجيب','قانون التمام','فيثاغورس','لا قانون','B',10,'mcq',null],
    ['cos(0°) = 1',                                               'صح','خطأ',null,null,'A',10,'true_false',null],
    ['sin(90°) = 1',                                              'صح','خطأ',null,null,'A',10,'true_false',null],
    ['اشرح قانون التمام مع مثال تطبيقي كامل.',
     '','',null,null,'A',20,'essay',
     'قانون التمام: c²=a²+b²-2ab·cosC — يُستخدم عند معرفة الأضلاع الثلاثة أو ضلعين والزاوية المحصورة — مثال: a=3,b=4,C=60°: c²=9+16-24×0.5=13 → c=√13'],
  ]);

  // E8 — مراجعة نهائية شاملة (6 mcq + 1 صح/خطأ + 2 مقالي = 100)
  await addQs(E8, [
    ['مشتقة f(x)=x³ هي:',                                        '3x²','3x','x²','2x³','A',10,'mcq',null],
    ['∫2x dx يساوي:',                                             'x','2x²','x²+C','2x+C','C',10,'mcq',null],
    ['log₁₀(1000) يساوي:',                                        '1','2','3','4','C',10,'mcq',null],
    ['الاحتمال دائماً يقع في النطاق:',                            '0 إلى 100','0 إلى 1','-1 إلى 1','1 إلى 10','B',10,'mcq',null],
    ['المتتالية الهندسية 2,6,18,... أساسها يساوي:',               '2','3','4','6','B',10,'mcq',null],
    ['معادلة الدائرة مركزها الأصل ونصف قطرها 5:',                'x+y=25','x²+y²=5','x²+y²=25','x²+y²=√5','C',10,'mcq',null],
    ['sin²(x)+cos²(x)=1',                                         'صح','خطأ',null,null,'A',10,'true_false',null],
    ['اشرح نظرية لوبيتال مع مثال على صيغة 0/0.',
     '','',null,null,'A',15,'essay',
     'لوبيتال: إذا كانت النهاية من النوع 0/0 أو ∞/∞ فنأخذ مشتقة البسط على مشتقة المقام — مثال: lim(x→2)(x²-4)/(x-2) = lim(x→2)(2x/1) = 4'],
    ['حل المعادلة التفاضلية: dy/dx=2x مع y(0)=3.',
     '','',null,null,'A',15,'essay',
     'بالتكامل: y=∫2x dx = x²+C — بتطبيق y(0)=3: 3=0+C → C=3 — الحل النهائي: y=x²+3'],
  ]);

  // E9 — قادم (5 أسئلة = 100)
  await addQs(E9, [
    ['ما ناتج 15² - 10²؟',                                        '125','225','150','175','A',20,'mcq',null],
    ['π تساوي تقريباً:',                                          '3.14','2.71','1.41','3.41','A',20,'mcq',null],
    ['مجموع زوايا المثلث = 180°',                                 'صح','خطأ',null,null,'A',20,'true_false',null],
    ['مساحة المستطيل = طول × عرض',                               'صح','خطأ',null,null,'A',20,'true_false',null],
    ['مساحة دائرة نصف قطرها 5 تقريباً:',                         '78.54','31.4','25','157','A',20,'mcq',null],
  ]);

  // E10 — عام مفتوح (5 أسئلة = 50)
  await addQs(E10, [
    ['كم يساوي 5 × 5؟',                                           '20','25','30','35','B',10,'mcq',null],
    ['الجذر التربيعي للعدد 144:',                                  '11','12','13','14','B',10,'mcq',null],
    ['2 + 2 × 2 = ؟',                                             '8','6','4','10','B',10,'mcq',null],
    ['العدد 7 عدد أولي',                                           'صح','خطأ',null,null,'A',10,'true_false',null],
    ['المضاعف المشترك الأصغر لـ 4 و 6 يساوي:',                   '8','10','12','24','C',10,'mcq',null],
  ]);

  // E11 — تحديد مستوى (5 أسئلة = 50)
  await addQs(E11, [
    ['7 × 8 = ؟',                                                 '48','56','64','54','B',10,'mcq',null],
    ['مربع العدد 13 يساوي:',                                       '169','139','196','163','A',10,'mcq',null],
    ['√36 يساوي:',                                                 '5','6','7','8','B',10,'mcq',null],
    ['مجموع 1+2+3+...+10 يساوي:',                                 '50','55','60','45','B',10,'mcq',null],
    ['مساحة المثلث = (القاعدة × الارتفاع) ÷ 2',                  'صح','خطأ',null,null,'A',10,'true_false',null],
  ]);

  // E12 — تمرين قصير (4 أسئلة = 20)
  await addQs(E12, [
    ['حل المعادلة 2x + 4 = 10:',                                  'x=2','x=3','x=4','x=5','B',5,'mcq',null],
    ['بسّط: 3(x+2) = ',                                            '3x+2','3x+6','x+6','3x+3','B',5,'mcq',null],
    ['إذا x=3 فإن x²+1 = ',                                       '9','10','8','7','B',5,'mcq',null],
    ['ناتج (a+b)² = a²+2ab+b²',                                   'صح','خطأ',null,null,'A',5,'true_false',null],
  ]);

  // E13 — مقالي تحريري (4 أسئلة = 40)
  await addQs(E13, [
    ['اشرح طريقة حساب محدد مصفوفة 3×3 بالتوسيع وفق الصف الأول.',
     '','',null,null,'A',10,'essay',
     'نضرب كل عنصر من الصف الأول في المحدد المقابل له مع إشارته (+ - +)، ثم نجمع الناتج.'],
    ['أثبت أن المصفوفة A=[[1,2],[0,1]] قابلة للعكس وجد مقلوبها.',
     '','',null,null,'A',10,'essay',
     'det(A)=1×1-2×0=1≠0 → قابلة للعكس. A⁻¹=[[1,-2],[0,1]]'],
    ['اشرح الفرق بين المصفوفة المتماثلة والمائلة التماثل.',
     '','',null,null,'A',10,'essay',
     'المتماثلة: A=Aᵀ — المائلة التماثل: A=-Aᵀ وعناصر قطرها أصفار.'],
    ['احسب det([[3,1,0],[2,4,1],[0,2,3]]).',
     '','',null,null,'A',10,'essay',
     'بالتوسيع: 3(4×3-1×2)-1(2×3-1×0)+0 = 3(12-2)-1(6) = 30-6 = 24'],
  ]);

  // E14 — نهاية العام ثانية (8 mcq + 2 صح/خطأ = 100)
  await addQs(E14, [
    ['حجم الهرم الرباعي قاعدته 6×6 وارتفاعه 4:',                 '24','36','48','72','C',10,'mcq',null],
    ['sin(45°) يساوي:',                                            '0.5','√3/2','√2/2','1','C',10,'mcq',null],
    ['الحد الأوسط للمتتالية الحسابية 5,8,11,14,17 هو:',          '8','11','14','10','B',10,'mcq',null],
    ['المسافة من النقطة (3,4) إلى مركز الإحداثيات:',              '3','4','5','7','C',10,'mcq',null],
    ['إذا كانت المتتالية الهندسية 2,6,18,... فالحد الخامس:',     '54','162','486','324','B',10,'mcq',null],
    ['معادلة الدائرة مركزها (1,-2) ونصف قطرها 3:',               '(x-1)²+(y+2)²=9','(x-1)²+(y-2)²=9','(x+1)²+(y-2)²=9','x²+y²=9','A',10,'mcq',null],
    ['مجموع المتتالية الهندسية اللانهائية |r|<1 يساوي a₁/(1-r)', 'صح','خطأ',null,null,'A',10,'true_false',null],
    ['الميل السالب يعني أن المستقيم منحدر من اليسار إلى اليمين', 'صح','خطأ',null,null,'A',10,'true_false',null],
    ['احسب مساحة السطح الكلية لأسطوانة نصف قطرها 4 وارتفاعها 10:','56π','80π','88π','72π','C',10,'mcq',null],
    ['جد الحد العاشر في المتتالية الحسابية: 3, 7, 11, ...',       '35','39','43','47','B',10,'mcq',null],
  ]);

  const totalQs = await q('SELECT COUNT(*) FROM questions');
  console.log(`  ✓ ${totalQs[0].count} سؤال على ${examIds.length} امتحان`);

  // ══════════════════════════════════════════════════════════
  // 11. التسجيل في الكورسات — كل الأعمدة:
  //     student_id, course_id, enrollment_date, status
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  تسجيل الطلاب في الكورسات...');
  const enrollments = [];

  // ثالثة → C1 (الجميع) + C2 + C3
  for (const st of s3) {
    enrollments.push([st.id, C1, ago(Math.floor(Math.random()*30+40)), 'active']);
    if (['std_ali','std_youssef','std_fatma','std_hana','std_khaled','std_amr'].includes(st.username))
      enrollments.push([st.id, C2, ago(Math.floor(Math.random()*20+20)), 'active']);
    if (['std_ali','std_youssef','std_fatma'].includes(st.username))
      enrollments.push([st.id, C3, ago(Math.floor(Math.random()*10+10)), 'active']);
  }

  // ثانية → C4
  for (const st of s2) {
    enrollments.push([st.id, C4, ago(Math.floor(Math.random()*30+30)), 'active']);
  }

  // أولى → C5
  for (const st of s1) {
    const status = st.username === 'std_new' ? 'inactive' : 'active';
    enrollments.push([st.id, C5, ago(Math.floor(Math.random()*20+15)), status]);
  }

  // الجميع → C6 مجاني (مختارين)
  const c6Students = ['std_ali','std_youssef','std_mostafa','std_nour2','std_yasmin','std_tarek','std_salma','std_rana'];
  for (const un of c6Students) {
    const s_id = sid(un);
    if (s_id) enrollments.push([s_id, C6, ago(5), 'active']);
  }

  for (const [s_id, cid, edate, status] of enrollments) {
    await q(`
      INSERT INTO student_course_enrollment (student_id, course_id, enrollment_date, status)
      VALUES ($1,$2,$3,$4) ON CONFLICT (student_id, course_id) DO NOTHING`,
      [s_id, cid, edate, status]
    );
  }
  const totalEnroll = await q('SELECT COUNT(*) FROM student_course_enrollment');
  console.log(`  ✓ ${totalEnroll[0].count} تسجيل في الكورسات`);

  // ══════════════════════════════════════════════════════════
  // 12. طلبات التسجيل في الكورسات — كل الأعمدة:
  //     student_id, course_id, status, message, created_at, handled_at
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة طلبات التسجيل...');
  const enrollReqs = [
    [sid('std_hassan'), C2, 'pending',  'أريد الاشتراك في كورس الترم الثاني',              ago(3),  null],
    [sid('std_mona'),   C3, 'pending',  'أحتاج المراجعة النهائية قبل الامتحان',            ago(1),  null],
    [sid('std_nada'),   C3, 'accepted', 'رجاءً قبول طلبي في كورس المراجعة',               ago(8),  ago(7)],
    [sid('std_adam'),   C1, 'accepted', 'أريد الانتقال من الثانية إلى الثالثة كورس',      ago(12), ago(10)],
    [sid('std_ziad'),   C3, 'rejected', 'هل ينفعني كورس الثالثة وأنا في الثانية؟',        ago(6),  ago(5)],
    [sid('std_karim2'), C4, 'pending',  'أريد التسجيل في كورس الثانية لاستعداد مبكر',     ago(2),  null],
  ];
  for (const [s_id, cid, status, msg, created, handled] of enrollReqs) {
    if (!s_id) continue;
    await q(`
      INSERT INTO course_enrollment_requests
        (student_id, course_id, status, message, created_at, handled_at)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (student_id, course_id) DO NOTHING`,
      [s_id, cid, status, msg, created, handled]
    );
  }
  console.log(`  ✓ ${enrollReqs.length} طلب تسجيل في الكورسات`);

  // ══════════════════════════════════════════════════════════
  // 13. المدفوعات — كل الأعمدة:
  //     student_id, course_id, amount, method, payment_date,
  //     status, reference_number, notes, verified_by, verified_at
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة المدفوعات...');
  const payMethods = ['إنستا باي', 'فودافون كاش', 'تحويل بنكي', 'أورنج كاش', 'نقداً'];
  const paymentsData = [
    // ثالثة — C1 (كل طلاب ثالثة)
    [sid('std_ali'),     C1, 400, payMethods[0], ago(42), 'verified', 'REF-001-ALI',     'دفع كامل مرة واحدة',       A1, ago(41)],
    [sid('std_fatma'),   C1, 400, payMethods[1], ago(40), 'verified', 'REF-002-FAT',     'دفع عن طريق ولي الأمر',     A1, ago(39)],
    [sid('std_youssef'), C1, 400, payMethods[2], ago(41), 'verified', 'REF-003-YOU',     'تحويل بنكي مباشر',          A2, ago(40)],
    [sid('std_nada'),    C1, 400, payMethods[3], ago(38), 'verified', 'REF-004-NAD',     null,                        A1, ago(37)],
    [sid('std_omar'),    C1, 400, payMethods[0], ago(39), 'verified', 'REF-005-OMA',     'دفع مع أخيه',               A1, ago(38)],
    [sid('std_hana'),    C1, 400, payMethods[1], ago(40), 'verified', 'REF-006-HAN',     null,                        A2, ago(39)],
    [sid('std_hassan'),  C1, 400, payMethods[4], ago(35), 'verified', 'REF-007-HAS',     'دفع نقداً في المركز',        A1, ago(34)],
    [sid('std_mona'),    C1, 400, payMethods[0], ago(14), 'rejected', 'REF-008-MON',     'رقم المرجع غير صحيح',       null, null],
    [sid('std_khaled'),  C1, 400, payMethods[2], ago(37), 'verified', 'REF-009-KHA',     null,                        A1, ago(36)],
    [sid('std_dina'),    C1, 200, payMethods[1], ago(8),  'pending',  'REF-010-DIN',     'قسط أول',                   null, null],
    [sid('std_amr'),     C1, 400, payMethods[0], ago(36), 'verified', 'REF-011-AMR',     null,                        A2, ago(35)],
    [sid('std_randa'),   C1, 400, payMethods[3], ago(38), 'verified', 'REF-012-RAN',     'دفع عن طريق ولي الأمر',     A1, ago(37)],
    // ثالثة — C2
    [sid('std_ali'),     C2, 400, payMethods[0], ago(22), 'verified', 'REF-013-ALI-C2',  null,                        A1, ago(21)],
    [sid('std_youssef'), C2, 400, payMethods[1], ago(20), 'verified', 'REF-014-YOU-C2',  null,                        A1, ago(19)],
    [sid('std_fatma'),   C2, 400, payMethods[2], ago(21), 'verified', 'REF-015-FAT-C2',  'تحويل بنكي',                A2, ago(20)],
    [sid('std_hana'),    C2, 400, payMethods[0], ago(19), 'verified', 'REF-016-HAN-C2',  null,                        A1, ago(18)],
    [sid('std_khaled'),  C2, 400, payMethods[4], ago(18), 'verified', 'REF-017-KHA-C2',  'نقداً',                     A2, ago(17)],
    [sid('std_amr'),     C2, 400, payMethods[1], ago(4),  'pending',  'REF-018-AMR-C2',  'قيد المراجعة',              null, null],
    // ثالثة — C3
    [sid('std_ali'),     C3, 300, payMethods[0], ago(12), 'verified', 'REF-019-ALI-C3',  null,                        A1, ago(11)],
    [sid('std_youssef'), C3, 300, payMethods[1], ago(11), 'verified', 'REF-020-YOU-C3',  null,                        A1, ago(10)],
    [sid('std_fatma'),   C3, 300, payMethods[3], ago(10), 'verified', 'REF-021-FAT-C3',  null,                        A2, ago(9)],
    // ثانية — C4
    [sid('std_mostafa'), C4, 350, payMethods[0], ago(32), 'verified', 'REF-022-MOS',     null,                        A1, ago(31)],
    [sid('std_rana'),    C4, 350, payMethods[1], ago(30), 'verified', 'REF-023-RAN',     null,                        A1, ago(29)],
    [sid('std_adam'),    C4, 350, payMethods[2], ago(31), 'verified', 'REF-024-ADA',     'تحويل بنكي',                A2, ago(30)],
    [sid('std_lina'),    C4, 350, payMethods[0], ago(29), 'verified', 'REF-025-LIN',     null,                        A1, ago(28)],
    [sid('std_ziad'),    C4, 350, payMethods[4], ago(28), 'verified', 'REF-026-ZIA',     'نقداً',                     A2, ago(27)],
    [sid('std_reem'),    C4, 350, payMethods[0], ago(4),  'pending',  'REF-027-REE',     'قيد المراجعة',              null, null],
    [sid('std_ibrahim'), C4, 350, payMethods[1], ago(27), 'verified', 'REF-028-IBR',     null,                        A1, ago(26)],
    [sid('std_sara'),    C4, 350, payMethods[2], ago(28), 'verified', 'REF-029-SAR',     null,                        A2, ago(27)],
    [sid('std_walid'),   C4, 350, payMethods[0], ago(26), 'verified', 'REF-030-WAL',     null,                        A1, ago(25)],
    // أولى — C5
    [sid('std_nour2'),   C5, 250, payMethods[0], ago(18), 'verified', 'REF-031-NOU',     null,                        A1, ago(17)],
    [sid('std_tarek'),   C5, 250, payMethods[3], ago(17), 'verified', 'REF-032-TAR',     null,                        A2, ago(16)],
    [sid('std_salma'),   C5, 250, payMethods[1], ago(16), 'verified', 'REF-033-SAL',     null,                        A1, ago(15)],
  ];

  for (const [s_id, cid, amount, method, pdate, status, ref, notes, vby, vat] of paymentsData) {
    if (!s_id) continue;
    await q(`
      INSERT INTO payments
        (student_id, course_id, amount, method, payment_date,
         status, reference_number, notes, verified_by, verified_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [s_id, cid, amount, method, pdate, status, ref, notes, vby, vat]
    );
  }
  const payStats = await q(`
    SELECT
      COUNT(*) FILTER (WHERE status='verified') AS verified,
      COUNT(*) FILTER (WHERE status='pending')  AS pending,
      COUNT(*) FILTER (WHERE status='rejected') AS rejected,
      COUNT(*) AS total
    FROM payments`);
  console.log(`  ✓ ${payStats[0].total} دفعة (✓${payStats[0].verified} | ⏳${payStats[0].pending} | ✗${payStats[0].rejected})`);

  // ══════════════════════════════════════════════════════════
  // 14. نتائج الامتحانات — كل الأعمدة:
  //     student_id, exam_id, score, correct_count, wrong_count,
  //     unanswered_count, start_time, end_time, answers (JSONB),
  //     points_earned, essay_graded, essay_score_adjustment
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة نتائج الامتحانات...');

  const buildAnswers = (n, correctPct) => {
    const ans = {};
    const correct = Math.round(n * correctPct);
    for (let i = 1; i <= n; i++) {
      ans[i] = i <= correct ? 'A' : (i <= correct + 1 ? null : 'B');
    }
    return JSON.stringify(ans);
  };

  const addResult = async (s_id, examId, score, correct, wrong, unanswered, daysBack, ptsEarned, graded=true, adjustment=0) => {
    if (!s_id) return;
    const startT = new Date(now - daysBack * 86400000 - 2*3600000).toISOString();
    const endT   = new Date(now - daysBack * 86400000).toISOString();
    await q(`
      INSERT INTO exam_results
        (student_id, exam_id, score, correct_count, wrong_count, unanswered_count,
         start_time, end_time, answers, points_earned, essay_graded, essay_score_adjustment)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [s_id, examId, score, correct, wrong, unanswered, startT, endT,
       buildAnswers(correct+wrong+unanswered, correct/(correct+wrong+unanswered||1)),
       ptsEarned, graded, adjustment]
    );
  };

  // E1 — المصفوفات (نتائج متنوعة)
  await addResult(sid('std_ali'),     E1, 100, 10, 0, 0, 38,  25, true,  0);
  await addResult(sid('std_youssef'), E1, 100, 10, 0, 0, 36,  25, true,  0);
  await addResult(sid('std_fatma'),   E1,  80,  8, 2, 0, 37,  20, true,  0);
  await addResult(sid('std_hana'),    E1,  90,  9, 1, 0, 37,  20, true,  0);
  await addResult(sid('std_khaled'),  E1,  70,  7, 3, 0, 36,  15, true,  0);
  await addResult(sid('std_omar'),    E1,  60,  6, 4, 0, 38,  10, true,  0);
  await addResult(sid('std_nada'),    E1,  50,  5, 5, 0, 37,   5, true,  0);
  await addResult(sid('std_hassan'),  E1,  40,  4, 6, 0, 38,   5, true,  0);
  await addResult(sid('std_mona'),    E1,  20,  2, 8, 0, 37,   5, true,  0);
  await addResult(sid('std_dina'),    E1,  30,  3, 6, 1, 36,   5, true,  0);
  await addResult(sid('std_amr'),     E1,  60,  6, 4, 0, 37,  10, true,  0);
  await addResult(sid('std_randa'),   E1,  70,  7, 3, 0, 36,  15, true,  0);

  // E2 — التفاضل
  await addResult(sid('std_ali'),     E2, 100, 10, 0, 0, 28,  25, true,  0);
  await addResult(sid('std_youssef'), E2,  90,  9, 1, 0, 27,  20, true,  5);
  await addResult(sid('std_fatma'),   E2,  80,  8, 2, 0, 28,  20, true,  0);
  await addResult(sid('std_hana'),    E2,  70,  7, 3, 0, 27,  15, true,  0);
  await addResult(sid('std_khaled'),  E2,  60,  6, 4, 0, 28,  10, true,  0);
  await addResult(sid('std_omar'),    E2,  50,  5, 5, 0, 27,   5, true,  0);
  await addResult(sid('std_nada'),    E2,  40,  4, 6, 0, 28,   5, true,  0);
  await addResult(sid('std_mona'),    E2,  30,  3, 7, 0, 27,   5, false, 0);

  // E3 — نهاية الترم
  await addResult(sid('std_ali'),     E3,  90,  9, 1, 0, 14,  30, true,  0);
  await addResult(sid('std_youssef'), E3, 100, 10, 0, 0, 13,  30, true, 10);
  await addResult(sid('std_fatma'),   E3,  75,  7, 2, 1, 14,  20, true,  5);
  await addResult(sid('std_hana'),    E3,  80,  8, 2, 0, 13,  20, true,  0);
  await addResult(sid('std_khaled'),  E3,  65,  6, 3, 1, 12,  10, true,  0);
  await addResult(sid('std_amr'),     E3,  55,  5, 4, 1, 11,   5, true,  0);
  await addResult(sid('std_dina'),    E3,  20,  2, 8, 0,  8,   5, true,  0);
  await addResult(sid('std_mona'),    E3,  35,  3, 5, 2,  9,   5, false, 0);

  // E4 — الاحتمالات
  await addResult(sid('std_ali'),     E4,  90,  9, 1, 0, 35,  20, true,  0);
  await addResult(sid('std_youssef'), E4,  80,  8, 2, 0, 34,  20, true,  0);
  await addResult(sid('std_fatma'),   E4,  70,  7, 3, 0, 35,  15, true,  0);
  await addResult(sid('std_hana'),    E4,  60,  6, 4, 0, 34,  10, true,  0);
  await addResult(sid('std_khaled'),  E4,  50,  5, 5, 0, 33,   5, true,  0);

  // E5 — المتتاليات
  await addResult(sid('std_ali'),     E5,  80,  8, 2, 0, 18,  20, true,  0);
  await addResult(sid('std_youssef'), E5,  90,  9, 1, 0, 17,  20, true,  5);
  await addResult(sid('std_fatma'),   E5,  70,  7, 3, 0, 18,  15, true,  0);
  await addResult(sid('std_hana'),    E5,  60,  6, 4, 0, 17,  10, true,  0);

  // E6 — الهندسة الفراغية
  await addResult(sid('std_mostafa'), E6,  90,  9, 1, 0, 22,  20, true,  0);
  await addResult(sid('std_rana'),    E6,  80,  8, 2, 0, 21,  20, true,  0);
  await addResult(sid('std_lina'),    E6,  70,  7, 3, 0, 22,  15, true,  0);
  await addResult(sid('std_reem'),    E6,  60,  6, 4, 0, 20,  10, true,  0);
  await addResult(sid('std_sara'),    E6,  85,  8, 1, 1, 21,  20, true,  0);
  await addResult(sid('std_adam'),    E6,  50,  5, 5, 0, 20,   5, true,  0);
  await addResult(sid('std_ziad'),    E6,  40,  4, 6, 0, 21,   5, true,  0);
  await addResult(sid('std_walid'),   E6,  65,  6, 3, 1, 19,  10, true,  0);
  await addResult(sid('std_nadia'),   E6,  75,  7, 2, 1, 18,  15, true,  0);

  // E7 — المثلثات
  await addResult(sid('std_mostafa'), E7,  80,  8, 2, 0, 10,  20, true,  0);
  await addResult(sid('std_rana'),    E7, 100, 10, 0, 0,  9,  20, true, 20);
  await addResult(sid('std_lina'),    E7,  75,  7, 2, 1, 10,  15, true,  0);
  await addResult(sid('std_sara'),    E7,  90,  9, 1, 0,  8,  20, true,  0);
  await addResult(sid('std_nadia'),   E7,  70,  7, 3, 0,  9,  15, true,  0);
  await addResult(sid('std_adam'),    E7,  55,  5, 4, 1, 10,   5, true,  0);
  await addResult(sid('std_ziad'),    E7,  45,  4, 5, 1,  8,   5, true,  0);

  // E8 — مراجعة نهائية (نشط — بعض الطلاب أدّوه)
  await addResult(sid('std_ali'),     E8,  85,  7, 1, 1,  3,  30, true,  0);
  await addResult(sid('std_youssef'), E8,  95,  8, 0, 1,  2,  40, true, 10);
  await addResult(sid('std_fatma'),   E8,  70,  6, 2, 1,  3,  20, true,  0);

  // E10 — عام مفتوح
  await addResult(sid('std_ali'),     E10, 50,  5, 0, 0,  5,  10, true,  0);
  await addResult(sid('std_mostafa'), E10, 40,  4, 1, 0,  4,   8, true,  0);
  await addResult(sid('std_nour2'),   E10, 50,  5, 0, 0,  4,  10, true,  0);
  await addResult(sid('std_yasmin'),  E10, 30,  3, 2, 0,  3,   5, true,  0);

  // E11 — تحديد مستوى
  await addResult(sid('std_nour2'),   E11, 50,  5, 0, 0, 10,   8, true,  0);
  await addResult(sid('std_tarek'),   E11, 40,  4, 1, 0,  8,   5, true,  0);
  await addResult(sid('std_salma'),   E11, 50,  5, 0, 0,  7,   8, true,  0);
  await addResult(sid('std_hana2'),   E11, 30,  3, 2, 0,  9,   5, true,  0);
  await addResult(sid('std_layla'),   E11, 40,  4, 1, 0,  6,   5, true,  0);
  await addResult(sid('std_karim2'),  E11, 20,  2, 3, 0,  8,   3, true,  0);

  // E13 — مقالي (essay_graded = false لبعض)
  await addResult(sid('std_ali'),     E13, 30,  0, 0, 4,  6,  15, true,  5);
  await addResult(sid('std_youssef'), E13, 40,  0, 0, 4,  5,  20, true,  0);
  await addResult(sid('std_fatma'),   E13, 25,  0, 0, 4,  6,  10, false, 0);
  await addResult(sid('std_hana'),    E13, 20,  0, 0, 4,  5,   5, false, 0);
  await addResult(sid('std_khaled'),  E13, 15,  0, 0, 4,  4,   5, false, 0);

  // E14 — نهاية العام ثانية
  await addResult(sid('std_mostafa'), E14,  90,  9, 1, 0,  7,  25, true,  0);
  await addResult(sid('std_rana'),    E14,  80,  8, 2, 0,  6,  20, true,  0);
  await addResult(sid('std_lina'),    E14,  70,  7, 3, 0,  7,  15, true,  0);
  await addResult(sid('std_sara'),    E14,  85,  8, 1, 1,  5,  20, true,  0);
  await addResult(sid('std_nadia'),   E14,  75,  7, 2, 1,  6,  15, true,  0);
  await addResult(sid('std_walid'),   E14,  60,  6, 4, 0,  7,  10, true,  0);

  const resStats = await q(`
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE essay_graded=false) AS pending
    FROM exam_results`);
  console.log(`  ✓ ${resStats[0].total} نتيجة (${resStats[0].pending} مقالي معلق للتصحيح)`);

  // ══════════════════════════════════════════════════════════
  // 15. الشارات — كل الأعمدة:
  //     student_id, exam_id, badge_name, badge_color, earned_at
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الشارات...');
  const badgesData = [
    [sid('std_ali'),     E1, 'نجم المصفوفات',    '#FFD700', ago(38)],
    [sid('std_youssef'), E1, 'نجم المصفوفات',    '#FFD700', ago(36)],
    [sid('std_fatma'),   E1, 'نجم المصفوفات',    '#FFD700', ago(37)],
    [sid('std_ali'),     E2, 'خبير التفاضل',     '#FF6347', ago(28)],
    [sid('std_youssef'), E2, 'خبير التفاضل',     '#FF6347', ago(27)],
    [sid('std_fatma'),   E2, 'خبير التفاضل',     '#FF6347', ago(28)],
    [sid('std_ali'),     E3, 'متفوق الترم الأول', '#FF4500', ago(14)],
    [sid('std_youssef'), E3, 'متفوق الترم الأول', '#FF4500', ago(13)],
    [sid('std_fatma'),   E3, 'متفوق الترم الأول', '#FF4500', ago(14)],
    [sid('std_hana'),    E3, 'متفوق الترم الأول', '#FF4500', ago(13)],
    [sid('std_mostafa'), E6, 'مهندس المستقبل',   '#4169E1', ago(22)],
    [sid('std_sara'),    E6, 'مهندس المستقبل',   '#4169E1', ago(21)],
    [sid('std_rana'),    E7, 'عبقري المثلثات',   '#DC143C', ago(10)],
    [sid('std_sara'),    E7, 'عبقري المثلثات',   '#DC143C', ago(9)],
    [sid('std_ali'),     E8, 'مستعد للثانوية',   '#32CD32', ago(3)],
    [sid('std_youssef'), E8, 'مستعد للثانوية',   '#32CD32', ago(2)],
    [sid('std_ali'),    E10, 'نجم الدفعة',        '#22C55E', ago(5)],
    [sid('std_nour2'),  E10, 'نجم الدفعة',        '#22C55E', ago(4)],
    [sid('std_nour2'),  E11, 'طالب متميز',        '#F59E0B', ago(10)],
    [sid('std_salma'),  E11, 'طالب متميز',        '#F59E0B', ago(7)],
    [sid('std_mostafa'),E14, 'ناجح بامتياز',      '#10B981', ago(7)],
    [sid('std_rana'),   E14, 'ناجح بامتياز',      '#10B981', ago(6)],
  ];
  for (const [s_id, examId, bname, bcolor, earnedAt] of badgesData) {
    if (!s_id) continue;
    await q(`
      INSERT INTO badges (student_id, exam_id, badge_name, badge_color, earned_at)
      VALUES ($1,$2,$3,$4,$5)`,
      [s_id, examId, bname, bcolor, earnedAt]
    );
  }
  console.log(`  ✓ ${badgesData.length} شارة على الامتحانات`);

  // ══════════════════════════════════════════════════════════
  // 16. تقدم الفيديوهات — كل الأعمدة:
  //     student_id, video_id, watch_count, watched_minutes,
  //     progress_percentage, last_watched_at,
  //     last_position, actual_watched_seconds
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة تقدم الفيديوهات...');
  const c1Vids = videoIds.filter(v => v.course_id === C1);
  const c2Vids = videoIds.filter(v => v.course_id === C2);
  const c3Vids = videoIds.filter(v => v.course_id === C3);
  const c4Vids = videoIds.filter(v => v.course_id === C4);
  const c5Vids = videoIds.filter(v => v.course_id === C5);
  const c6Vids = videoIds.filter(v => v.course_id === C6);

  const addProgress = async (studentUsername, vids, pct, watchCount=1, lastSeen=2) => {
    const s_id = sid(studentUsername);
    if (!s_id) return;
    for (const v of vids) {
      const watchedMin  = Math.floor(v.duration_minutes * pct / 100);
      const lastPosSec  = Math.floor(watchedMin * 60 * (pct / 100));
      const actualSec   = Math.floor(v.duration_minutes * 60 * pct / 100);
      await q(`
        INSERT INTO video_progress
          (student_id, video_id, watch_count, watched_minutes, progress_percentage,
           last_watched_at, last_position, actual_watched_seconds)
        VALUES ($1,$2,$3,$4,$5, NOW() - INTERVAL '${lastSeen} days',$6,$7)
        ON CONFLICT (student_id, video_id) DO NOTHING`,
        [s_id, v.id, watchCount, watchedMin, pct, lastPosSec, actualSec]
      );
    }
  };

  // ثالثة — C1
  await addProgress('std_ali',     c1Vids,        100, 3, 2);
  await addProgress('std_fatma',   c1Vids,         85, 1, 3);
  await addProgress('std_youssef', c1Vids,        100, 4, 1);
  await addProgress('std_hana',    c1Vids,         90, 2, 2);
  await addProgress('std_khaled',  c1Vids,         70, 1, 4);
  await addProgress('std_omar',    c1Vids,         55, 1, 5);
  await addProgress('std_amr',     c1Vids,         65, 1, 3);
  await addProgress('std_randa',   c1Vids,         80, 2, 2);
  await addProgress('std_hassan',  c1Vids.slice(0,8), 50, 1, 6);
  await addProgress('std_mona',    c1Vids.slice(0,4), 30, 1, 8);
  await addProgress('std_dina',    c1Vids.slice(0,6), 40, 1, 7);
  await addProgress('std_nada',    c1Vids,         60, 1, 4);

  // ثالثة — C2
  await addProgress('std_ali',     c2Vids,         85, 2, 2);
  await addProgress('std_youssef', c2Vids,         70, 1, 3);
  await addProgress('std_fatma',   c2Vids,         50, 1, 4);
  await addProgress('std_hana',    c2Vids,         40, 1, 5);
  await addProgress('std_khaled',  c2Vids,         30, 1, 6);

  // ثالثة — C3
  await addProgress('std_ali',     c3Vids,        100, 2, 1);
  await addProgress('std_youssef', c3Vids,         90, 2, 1);
  await addProgress('std_fatma',   c3Vids,         75, 1, 2);
  await addProgress('std_amr',     c3Vids,         60, 1, 3);

  // ثانية — C4
  await addProgress('std_mostafa', c4Vids,        100, 3, 2);
  await addProgress('std_rana',    c4Vids,         90, 2, 2);
  await addProgress('std_lina',    c4Vids,         75, 1, 3);
  await addProgress('std_reem',    c4Vids,         70, 1, 3);
  await addProgress('std_sara',    c4Vids,         85, 2, 2);
  await addProgress('std_adam',    c4Vids,         45, 1, 5);
  await addProgress('std_ziad',    c4Vids,         35, 1, 6);
  await addProgress('std_walid',   c4Vids,         60, 1, 4);
  await addProgress('std_nadia',   c4Vids,         80, 2, 3);
  await addProgress('std_ibrahim', c4Vids.slice(0,3), 25, 1, 7);

  // أولى — C5
  await addProgress('std_nour2',   c5Vids,        100, 2, 2);
  await addProgress('std_yasmin',  c5Vids,         55, 1, 4);
  await addProgress('std_tarek',   c5Vids,         85, 2, 2);
  await addProgress('std_hana2',   c5Vids,         40, 1, 5);
  await addProgress('std_layla',   c5Vids,         70, 1, 3);
  await addProgress('std_karim2',  c5Vids,         30, 1, 6);
  await addProgress('std_salma',   c5Vids,         90, 2, 2);

  // C6 — مجاني
  for (const un of c6Students) {
    await addProgress(un, c6Vids, 100, 1, 1);
  }

  const totalProgress = await q('SELECT COUNT(*) FROM video_progress');
  console.log(`  ✓ ${totalProgress[0].count} سجل تقدم فيديو (مع last_position وactual_watched_seconds)`);

  // ══════════════════════════════════════════════════════════
  // 17. إتمام الكورس وإعطاء النقاط — course_completion_points:
  //     student_id, course_id, points_awarded, awarded_at
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة سجل إتمام الكورسات...');
  const completions = [
    [sid('std_ali'),     C1, 100, ago(10)],
    [sid('std_youssef'), C1, 100, ago(9)],
    [sid('std_ali'),     C3, 80,  ago(2)],
    [sid('std_youssef'), C3, 80,  ago(2)],
    [sid('std_mostafa'), C4, 90,  ago(5)],
    [sid('std_rana'),    C4, 90,  ago(4)],
    [sid('std_nour2'),   C5, 70,  ago(3)],
    [sid('std_salma'),   C5, 70,  ago(3)],
  ];
  for (const [s_id, cid, pts, awarded_at] of completions) {
    if (!s_id) continue;
    await q(`
      INSERT INTO course_completion_points (student_id, course_id, points_awarded, awarded_at)
      VALUES ($1,$2,$3,$4) ON CONFLICT (student_id, course_id) DO NOTHING`,
      [s_id, cid, pts, awarded_at]
    );
  }
  console.log(`  ✓ ${completions.length} سجل إتمام كورس`);

  // ══════════════════════════════════════════════════════════
  // 18. طلبات إعادة الامتحان — كل الأعمدة:
  //     student_id, exam_id, status, message, teacher_note,
  //     created_at, handled_at
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة طلبات إعادة الامتحان...');
  const retryReqs = [
    [sid('std_mona'),    E1, 'pending',  'لم أكن مستعدة — أرجو فرصة أخرى',                null,                                     ago(3), null],
    [sid('std_hassan'),  E1, 'pending',  'كنت مريضاً يوم الامتحان',                         null,                                     ago(4), null],
    [sid('std_dina'),    E3, 'pending',  'أريد تحسين درجتي في امتحان الترم',               null,                                     ago(2), null],
    [sid('std_nada'),    E2, 'pending',  'أريد تحسين إجابتي في السؤال المقالي',             null,                                     ago(1), null],
    [sid('std_adam'),    E6, 'approved', 'درجتي منخفضة وأريد إعادة الاختبار',              'تمت الموافقة — حدد موعداً مع المعلم',   ago(10),ago(8)],
    [sid('std_ziad'),    E7, 'rejected', 'طلب إعادة',                                       'مرفوض — أديت الامتحان في وقته المناسب', ago(8), ago(6)],
    [sid('std_ibrahim'), E6, 'approved', 'أريد تحسين درجتي',                                'مقبول — موعد الإعادة الأسبوع القادم',   ago(6), ago(4)],
    [sid('std_hassan'),  E3, 'pending',  'أريد إعادة امتحان الترم لأن درجتي منخفضة',      null,                                     ago(2), null],
  ];
  for (const [s_id, examId, status, msg, note, created, handled] of retryReqs) {
    if (!s_id) continue;
    await q(`
      INSERT INTO exam_retry_requests
        (student_id, exam_id, status, message, teacher_note, created_at, handled_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [s_id, examId, status, msg, note, created, handled]
    );
  }
  console.log(`  ✓ ${retryReqs.length} طلب إعادة (pending + approved + rejected)`);

  // ══════════════════════════════════════════════════════════
  // 19. سجل الإشعارات — كل الأعمدة:
  //     teacher_id, student_id, recipient_phone, recipient_type,
  //     message, type, is_read, sent_at, title, source
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة سجل الإشعارات...');
  const notifications = [
    // نتائج امتحانات — للطلاب
    [T, sid('std_ali'),     '+201200000001', 'student', 'أحسنت يا علي! حصلت على 100/100 في امتحان المصفوفات. أداء استثنائي! 🏆',     'exam_result', true,  ago(38), 'نتيجة ممتازة في امتحان المصفوفات',     'system'],
    [T, sid('std_youssef'), '+201200000005', 'student', 'مبروك يوسف! حصلت على 100/100 في امتحان المصفوفات. واصل هذا التفوق!',        'exam_result', true,  ago(36), 'نتيجة ممتازة في امتحان المصفوفات',     'system'],
    [T, sid('std_mona'),    '+201200000015', 'student', 'درجتك في امتحان المصفوفات 20/100. نرجو المراجعة مع المعلم.',                 'exam_result', false, ago(37), 'نتيجة امتحان المصفوفات',                'system'],
    [T, sid('std_dina'),    '+201200000019', 'student', 'درجتك في امتحان الترم الأول 20/100. يرجى الاستعداد للامتحانات القادمة.',    'exam_result', false, ago(8),  'نتيجة امتحان نهاية الترم',              'system'],
    // شارات
    [T, sid('std_ali'),     '+201200000001', 'student', 'مبروك! حصلت على شارة "نجم المصفوفات" 🥇 — تقدير ممتاز على أدائك المتميز!', 'badge',       true,  ago(37), 'شارة جديدة: نجم المصفوفات',             'system'],
    [T, sid('std_youssef'), '+201200000005', 'student', 'مبروك! حصلت على شارة "خبير التفاضل" 🏆 — استمر في التفوق!',               'badge',       true,  ago(22), 'شارة جديدة: خبير التفاضل',              'system'],
    [T, sid('std_rana'),    '+201200000027', 'student', 'مبروك! حصلت على شارة "عبقري المثلثات" 🎓 — أداء رائع في الامتحان!',       'badge',       true,  ago(5),  'شارة جديدة: عبقري المثلثات',            'system'],
    // مدفوعات
    [T, sid('std_fatma'),   '+201200000003', 'student', 'تم استلام دفعتك وتوثيقها بنجاح. شكراً لك! ✅',                             'payment',     true,  ago(37), 'توثيق الدفعة',                          'whatsapp'],
    [T, sid('std_reem'),    '+201200000035', 'student', 'دفعتك قيد المراجعة — سيتم التأكيد خلال 24 ساعة.',                          'payment',     false, ago(4),  'دفعة قيد المراجعة',                     'whatsapp'],
    [T, sid('std_mona'),    '+201200000015', 'student', 'تم رفض دفعتك — رقم المرجع غير صحيح. يرجى إعادة الإرسال.',                 'payment',     false, ago(14), 'رفض الدفعة',                            'whatsapp'],
    // إشعارات عامة
    [T, sid('std_nour2'),   '+201200000045', 'student', 'مرحباً نور! تم قبولك في كورس الصف الأول الثانوي. حظاً موفقاً! 📚',        'general',     true,  ago(28), 'قبول التسجيل في الكورس',                'system'],
    [T, sid('std_hana'),    '+201200000011', 'student', 'امتحان المراجعة النهائية يبدأ بعد 3 أيام — استعد جيداً!',                  'general',     false, ago(3),  'تذكير: امتحان قريب',                    'system'],
    [T, sid('std_khaled'),  '+201200000017', 'student', 'تم إضافة فيديوهات جديدة لكورس الثالثة ترم أول — اطلع عليها الآن!',        'general',     true,  ago(2),  'محتوى جديد في الكورس',                  'system'],
    // لأولياء الأمور
    [T, sid('std_ali'),     '+201200000002', 'parent',  'تقرير شهري: علي يحقق أداءً ممتازاً — 5 امتحانات بمعدل 95% أو أعلى.',      'report',      true,  ago(7),  'التقرير الشهري — علي محمد',              'whatsapp'],
    [T, sid('std_mona'),    '+201200000016', 'parent',  'تنبيه: منى تحتاج دعماً في مادة الرياضيات — يرجى المتابعة معها.',           'report',      false, ago(37), 'تنبيه: أداء منى الدراسي',               'whatsapp'],
    [T, sid('std_nada'),    '+201200000008', 'parent',  'تقرير: ندى تؤدي الاختبارات بشكل متوسط — يُنصح بمراجعة إضافية.',           'report',      true,  ago(5),  'التقرير الأسبوعي — ندى حسن',            'whatsapp'],
    [T, sid('std_mostafa'), '+201200000026', 'parent',  'تقرير ممتاز: مصطفى يتفوق في الصف الثاني — درجة 90+ في آخر امتحانين.',     'report',      true,  ago(3),  'تقرير ممتاز — مصطفى أسامة',             'whatsapp'],
    [T, sid('std_hassan'),  '+201200000014', 'parent',  'تنبيه: حسن غائب عن بعض الدروس — يرجى التواصل معنا.',                      'general',     false, ago(6),  'تنبيه غياب — حسن علاء',                'whatsapp'],
  ];

  for (const [tid, s_id, phone, rtype, msg, type, is_read, sent_at, title, source] of notifications) {
    if (!s_id) continue;
    await q(`
      INSERT INTO notification_log
        (teacher_id, student_id, recipient_phone, recipient_type,
         message, type, is_read, sent_at, title, source)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [tid, s_id, phone, rtype, msg, type, is_read, sent_at, title, source]
    );
  }
  console.log(`  ✓ ${notifications.length} إشعار (مع title وsource)`);

  // ══════════════════════════════════════════════════════════
  // 20. البث المباشر — كل الجداول والأعمدة:
  //     live_streams, live_stream_viewers,
  //     live_chat_messages, live_hand_raises
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة بيانات البث المباشر...');

  // live_streams — كل الأعمدة
  const streamsRes = await q(`
    INSERT INTO live_streams
      (teacher_id, room_id, title, description, access, allowed_stages,
       allowed_student_ids, chat_enabled, hand_raise_enabled, status,
       started_at, ended_at)
    VALUES
      ($1, 'wathba-room-math-g3-t1-001',
       'درس المصفوفات المباشر — الصف الثالث الثانوي',
       'شرح مباشر لقاعدة كرامر وحل الأنظمة الخطية — جلسة تفاعلية مع الطلاب',
       'stage', '["الصف الثالث الثانوي"]'::jsonb, '[]'::jsonb,
       true, true, 'ended', $2, $3),

      ($1, 'wathba-room-math-g2-001',
       'درس الهندسة الفراغية المباشر — الصف الثاني',
       'شرح المجسمات والحجوم — جلسة مراجعة',
       'stage', '["الصف الثاني الثانوي"]'::jsonb, '[]'::jsonb,
       true, true, 'ended', $4, $5),

      ($1, 'wathba-room-review-final-001',
       'مراجعة نهائية مفتوحة — كل الطلاب',
       'جلسة مراجعة شاملة قبل الامتحانات النهائية — مفتوحة لكل الطلاب',
       'all', '[]'::jsonb, '[]'::jsonb,
       true, true, 'active', $6, NULL)
    RETURNING id, room_id, status
  `, [
    T,
    ago(15), new Date(now - 15*86400000 + 1.5*3600000).toISOString(),
    ago(8),  new Date(now - 8*86400000 + 2*3600000).toISOString(),
    ago(0),
  ]);

  const [LS1, LS2, LS3] = streamsRes.map(r => r.id);

  // live_stream_viewers — كل الأعمدة
  const viewers = [
    [LS1, sid('std_ali'),     ago(15), new Date(now - 15*86400000 + 1.5*3600000).toISOString(), false],
    [LS1, sid('std_youssef'), ago(15), new Date(now - 15*86400000 + 1.2*3600000).toISOString(), false],
    [LS1, sid('std_fatma'),   ago(15), new Date(now - 15*86400000 + 1.5*3600000).toISOString(), false],
    [LS1, sid('std_hana'),    ago(15), new Date(now - 15*86400000 + 1.0*3600000).toISOString(), false],
    [LS1, sid('std_khaled'),  ago(15), new Date(now - 15*86400000 + 0.8*3600000).toISOString(), false],
    [LS2, sid('std_mostafa'), ago(8),  new Date(now - 8*86400000 + 2*3600000).toISOString(), false],
    [LS2, sid('std_rana'),    ago(8),  new Date(now - 8*86400000 + 2*3600000).toISOString(), false],
    [LS2, sid('std_lina'),    ago(8),  new Date(now - 8*86400000 + 1.5*3600000).toISOString(), false],
    [LS3, sid('std_ali'),     ago(0),  null, true],
    [LS3, sid('std_mostafa'), ago(0),  null, true],
    [LS3, sid('std_nour2'),   ago(0),  null, true],
  ];
  for (const [str_id, s_id, joined, left, is_active] of viewers) {
    if (!s_id) continue;
    await q(`
      INSERT INTO live_stream_viewers
        (stream_id, student_id, joined_at, left_at, is_active)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (stream_id, student_id) DO NOTHING`,
      [str_id, s_id, joined, left, is_active]
    );
  }

  // live_chat_messages — كل الأعمدة
  const chatMsgs = [
    [LS1, T,              'teacher', 'أ/ محمد عبد الرحمن', 'أهلاً بالجميع! نبدأ شرح قاعدة كرامر.',        new Date(now - 15*86400000 + 1*60000).toISOString()],
    [LS1, sid('std_ali'), 'student', 'علي محمد',           'أستاذ، هل نحل المثال الأول بالمحددات؟',        new Date(now - 15*86400000 + 5*60000).toISOString()],
    [LS1, T,              'teacher', 'أ/ محمد عبد الرحمن', 'نعم يا علي — الطريقة الأسرع والأدق.',          new Date(now - 15*86400000 + 6*60000).toISOString()],
    [LS1, sid('std_fatma'),'student','فاطمة أحمد',          'شكراً أستاذ! فهمت الخطوة الأخيرة الآن.',       new Date(now - 15*86400000 + 20*60000).toISOString()],
    [LS1, sid('std_youssef'),'student','يوسف إبراهيم',      'هل يمكن استخدام المصفوفة المعكوسة بدلاً منها؟', new Date(now - 15*86400000 + 25*60000).toISOString()],
    [LS2, T,              'teacher', 'أ/ محمد عبد الرحمن', 'يا أهل الثانية — نبدأ بالهرم الرباعي.',        new Date(now - 8*86400000 + 5*60000).toISOString()],
    [LS2, sid('std_mostafa'),'student','مصطفى أسامة',       'أستاذ، عندي سؤال على مساحة الجانبي.',         new Date(now - 8*86400000 + 15*60000).toISOString()],
    [LS2, T,              'teacher', 'أ/ محمد عبد الرحمن', 'اتفضل يا مصطفى، السؤال واضح.',                 new Date(now - 8*86400000 + 16*60000).toISOString()],
    [LS3, T,              'teacher', 'أ/ محمد عبد الرحمن', 'مرحباً بالجميع في المراجعة الشاملة!',          new Date(now - 5*60000).toISOString()],
    [LS3, sid('std_ali'), 'student', 'علي محمد',           'موجود يا أستاذ! جاهز للمراجعة.',               new Date(now - 4*60000).toISOString()],
    [LS3, sid('std_nour2'),'student','نور الدين',           'حاضر أستاذ 🎓',                               new Date(now - 3*60000).toISOString()],
  ];
  for (const [str_id, sender_id, sender_type, sender_name, message, sent_at] of chatMsgs) {
    if (!sender_id) continue;
    await q(`
      INSERT INTO live_chat_messages
        (stream_id, sender_id, sender_type, sender_name, message, sent_at)
      VALUES ($1,$2,$3,$4,$5,$6)`,
      [str_id, sender_id, sender_type, sender_name, message, sent_at]
    );
  }

  // live_hand_raises — كل الأعمدة
  const handRaises = [
    [LS1, sid('std_youssef'), ago(15), new Date(now - 15*86400000 + 30*60000).toISOString(), false],
    [LS1, sid('std_hana'),    ago(15), new Date(now - 15*86400000 + 45*60000).toISOString(), false],
    [LS2, sid('std_mostafa'), ago(8),  new Date(now - 8*86400000 + 20*60000).toISOString(), false],
    [LS3, sid('std_ali'),     ago(0),  null, true],
    [LS3, sid('std_mostafa'), ago(0),  null, true],
  ];
  for (const [str_id, s_id, raised, lowered, is_active] of handRaises) {
    if (!s_id) continue;
    await q(`
      INSERT INTO live_hand_raises
        (stream_id, student_id, raised_at, lowered_at, is_active)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (stream_id, student_id) DO NOTHING`,
      [str_id, s_id, raised, lowered, is_active]
    );
  }

  const lsCounts = await q(`
    SELECT
      (SELECT COUNT(*) FROM live_streams)         AS streams,
      (SELECT COUNT(*) FROM live_stream_viewers)  AS viewers,
      (SELECT COUNT(*) FROM live_chat_messages)   AS msgs,
      (SELECT COUNT(*) FROM live_hand_raises)     AS raises
  `);
  console.log(`  ✓ ${lsCounts[0].streams} بث مباشر | ${lsCounts[0].viewers} مشاهد | ${lsCounts[0].msgs} رسالة شات | ${lsCounts[0].raises} رفع يد`);

  // ══════════════════════════════════════════════════════════
  // 21. الألعاب التعليمية (event_plays) — كل الأعمدة:
  //     student_id, event_id, played_at, score, completed
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة سجل الألعاب...');
  const eventId = 'weekly-stickman-run';
  const eventPlays = [
    // الأسبوع الحالي
    [sid('std_ali'),     eventId, ago(1), 1250, true],
    [sid('std_youssef'), eventId, ago(1), 1100, true],
    [sid('std_fatma'),   eventId, ago(2), 980,  true],
    [sid('std_hana'),    eventId, ago(1), 870,  true],
    [sid('std_mostafa'), eventId, ago(2), 760,  true],
    [sid('std_nour2'),   eventId, ago(1), 650,  true],
    [sid('std_tarek'),   eventId, ago(2), 540,  true],
    [sid('std_salma'),   eventId, ago(1), 490,  true],
    [sid('std_khaled'),  eventId, ago(2), 420,  true],
    [sid('std_omar'),    eventId, ago(1), 380,  true],
    [sid('std_rana'),    eventId, ago(3), 320,  true],
    [sid('std_yasmin'),  eventId, ago(2), 280,  true],
    [sid('std_adam'),    eventId, ago(3), 240,  false],
    [sid('std_lina'),    eventId, ago(2), 200,  true],
    [sid('std_reem'),    eventId, ago(1), 350,  true],
  ];
  for (const [s_id, eid, played_at, score, completed] of eventPlays) {
    if (!s_id) continue;
    await q(`
      INSERT INTO event_plays (student_id, event_id, played_at, score, completed)
      VALUES ($1,$2,$3,$4,$5)`,
      [s_id, eid, played_at, score, completed]
    );
  }
  console.log(`  ✓ ${eventPlays.length} لعبة مسجّلة (Stickman Run)`);

  // ══════════════════════════════════════════════════════════
  // 22. سجل المتصدرين — كل الأعمدة:
  //     teacher_id, month_label, reset_at, rankings (JSONB)
  //     leaderboard_reset_tracker: last_reset_at, next_reset_at
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة سجل المتصدرين...');

  const buildRankings = (entries) =>
    JSON.stringify(
      entries.map(([username, name, stage, pts, badge], rank) => ({
        rank: rank + 1,
        student_id: sid(username),
        username,
        name,
        academic_stage: stage,
        points: pts,
        top_badge: badge,
      })).filter(e => e.student_id)
    );

  const rankingsMar = buildRankings([
    ['std_youssef', 'يوسف إبراهيم كمال',    'الصف الثالث الثانوي', 780, 'خبير التفاضل'],
    ['std_ali',     'علي محمد رمضان',        'الصف الثالث الثانوي', 740, 'نجم المصفوفات'],
    ['std_fatma',   'فاطمة أحمد سعد',        'الصف الثالث الثانوي', 650, 'نجم المصفوفات'],
    ['std_hana',    'هناء وليد منصور',       'الصف الثالث الثانوي', 610, 'نجم المصفوفات'],
    ['std_rana',    'رنا طارق عبد العزيز',   'الصف الثاني الثانوي', 380, 'عبقري المثلثات'],
    ['std_mostafa', 'مصطفى أسامة نور',       'الصف الثاني الثانوي', 290, 'مهندس المستقبل'],
    ['std_khaled',  'خالد عصام مبروك',        'الصف الثالث الثانوي', 580, null],
    ['std_salma',   'سلمى محمد الشاذلي',     'الصف الأول الثانوي',  145, 'نجم الدفعة'],
    ['std_tarek',   'طارق ماهر أبو زيد',     'الصف الأول الثانوي',  155, 'طالب متميز'],
    ['std_nour2',   'نور الدين سامي توفيق',  'الصف الأول الثانوي',  130, 'نجم الدفعة'],
  ]);

  const rankingsApr = buildRankings([
    ['std_youssef', 'يوسف إبراهيم كمال',    'الصف الثالث الثانوي', 850, 'خبير التفاضل'],
    ['std_ali',     'علي محمد رمضان',        'الصف الثالث الثانوي', 780, 'نجم المصفوفات'],
    ['std_fatma',   'فاطمة أحمد سعد',        'الصف الثالث الثانوي', 710, 'نجم المصفوفات'],
    ['std_hana',    'هناء وليد منصور',       'الصف الثالث الثانوي', 690, 'نجم المصفوفات'],
    ['std_rana',    'رنا طارق عبد العزيز',   'الصف الثاني الثانوي', 420, 'عبقري المثلثات'],
    ['std_mostafa', 'مصطفى أسامة نور',       'الصف الثاني الثانوي', 340, 'مهندس المستقبل'],
    ['std_omar',    'عمر سامي فرج',          'الصف الثالث الثانوي', 620, null],
    ['std_tarek',   'طارق ماهر أبو زيد',     'الصف الأول الثانوي',  175, 'طالب متميز'],
    ['std_salma',   'سلمى محمد الشاذلي',     'الصف الأول الثانوي',  160, 'نجم الدفعة'],
    ['std_nour2',   'نور الدين سامي توفيق',  'الصف الأول الثانوي',  145, 'نجم الدفعة'],
  ]);

  const rankingsMay = buildRankings([
    ['std_youssef', 'يوسف إبراهيم كمال',    'الصف الثالث الثانوي', 850, 'مستعد للثانوية'],
    ['std_ali',     'علي محمد رمضان',        'الصف الثالث الثانوي', 780, 'مستعد للثانوية'],
    ['std_fatma',   'فاطمة أحمد سعد',        'الصف الثالث الثانوي', 710, 'متفوق الترم الأول'],
    ['std_hana',    'هناء وليد منصور',       'الصف الثالث الثانوي', 690, 'متفوق الترم الأول'],
    ['std_rana',    'رنا طارق عبد العزيز',   'الصف الثاني الثانوي', 420, 'عبقري المثلثات'],
    ['std_mostafa', 'مصطفى أسامة نور',       'الصف الثاني الثانوي', 340, 'ناجح بامتياز'],
    ['std_khaled',  'خالد عصام مبروك',        'الصف الثالث الثانوي', 660, null],
    ['std_omar',    'عمر سامي فرج',          'الصف الثالث الثانوي', 620, null],
    ['std_tarek',   'طارق ماهر أبو زيد',     'الصف الأول الثانوي',  175, 'طالب متميز'],
    ['std_nour2',   'نور الدين سامي توفيق',  'الصف الأول الثانوي',  145, 'طالب متميز'],
  ]);

  await q(`
    INSERT INTO leaderboard_history (teacher_id, month_label, reset_at, rankings)
    VALUES
      ($1, 'مارس 2025',  $2::TIMESTAMP, $3::JSONB),
      ($1, 'أبريل 2025', $4::TIMESTAMP, $5::JSONB),
      ($1, 'مايو 2025',  $6::TIMESTAMP, $7::JSONB)
  `, [
    T,
    new Date(now - 75 * 86400000).toISOString(), rankingsMar,
    new Date(now - 45 * 86400000).toISOString(), rankingsApr,
    new Date(now - 15 * 86400000).toISOString(), rankingsMay,
  ]);

  await q(`
    INSERT INTO leaderboard_reset_tracker (teacher_id, last_reset_at, next_reset_at)
    VALUES ($1, $2::TIMESTAMP, $3::TIMESTAMP)
    ON CONFLICT (teacher_id) DO UPDATE
      SET last_reset_at = EXCLUDED.last_reset_at,
          next_reset_at = EXCLUDED.next_reset_at
  `, [
    T,
    new Date(now - 15 * 86400000).toISOString(),
    new Date(now.getTime() + 15 * 86400000).toISOString(),
  ]);

  console.log('  ✓ 3 أشهر في سجل المتصدرين (مارس + أبريل + مايو 2025) + سجل الإعادة');

  // ══════════════════════════════════════════════════════════
  // ملخص نهائي شامل
  // ══════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ✅ اكتملت البيانات التجريبية الشاملة بنجاح!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const s = (await q(`
    SELECT
      (SELECT COUNT(*) FROM teachers)                                            AS teachers,
      (SELECT COUNT(*) FROM assistants)                                          AS assistants,
      (SELECT COUNT(*) FROM students WHERE deleted_at IS NULL)                   AS students,
      (SELECT COUNT(*) FROM students WHERE deleted_at IS NOT NULL)               AS deleted_students,
      (SELECT COUNT(*) FROM courses)                                             AS courses,
      (SELECT COUNT(*) FROM courses WHERE is_published=true)                     AS published_courses,
      (SELECT COUNT(*) FROM sections)                                            AS sections,
      (SELECT COUNT(*) FROM videos)                                              AS videos,
      (SELECT COUNT(*) FROM pdf_files)                                           AS pdfs,
      (SELECT COUNT(*) FROM question_banks)                                      AS banks,
      (SELECT COUNT(*) FROM bank_questions)                                      AS bank_qs,
      (SELECT COUNT(*) FROM exams)                                               AS exams,
      (SELECT COUNT(*) FROM exams WHERE is_published=true)                       AS pub_exams,
      (SELECT COUNT(*) FROM questions)                                           AS questions,
      (SELECT COUNT(*) FROM questions WHERE question_type='mcq')                 AS q_mcq,
      (SELECT COUNT(*) FROM questions WHERE question_type='true_false')          AS q_tf,
      (SELECT COUNT(*) FROM questions WHERE question_type='essay')               AS q_essay,
      (SELECT COUNT(*) FROM exam_results)                                        AS results,
      (SELECT COUNT(*) FROM exam_results WHERE essay_graded=false)               AS pending_grading,
      (SELECT COUNT(*) FROM student_course_enrollment)                           AS enrollments,
      (SELECT COUNT(*) FROM payments)                                            AS payments,
      (SELECT COUNT(*) FROM payments WHERE status='verified')                    AS pay_verified,
      (SELECT COUNT(*) FROM payments WHERE status='pending')                     AS pay_pending,
      (SELECT COUNT(*) FROM payments WHERE status='rejected')                    AS pay_rejected,
      (SELECT COUNT(*) FROM badges)                                              AS badges,
      (SELECT COUNT(*) FROM video_progress)                                      AS video_progress,
      (SELECT COUNT(*) FROM course_completion_points)                            AS completions,
      (SELECT COUNT(*) FROM notification_log)                                    AS notifications,
      (SELECT COUNT(*) FROM exam_retry_requests)                                 AS retries,
      (SELECT COUNT(*) FROM course_enrollment_requests)                          AS enroll_reqs,
      (SELECT COUNT(*) FROM live_streams)                                        AS live_streams,
      (SELECT COUNT(*) FROM live_stream_viewers)                                 AS live_viewers,
      (SELECT COUNT(*) FROM live_chat_messages)                                  AS live_chats,
      (SELECT COUNT(*) FROM live_hand_raises)                                    AS live_raises,
      (SELECT COUNT(*) FROM event_plays)                                         AS event_plays,
      (SELECT COUNT(*) FROM leaderboard_history)                                 AS lb_history,
      (SELECT COUNT(*) FROM leaderboard_reset_tracker)                           AS lb_tracker
  `))[0];

  console.log(`
  الجدول                              العدد    تفاصيل
  ───────────────────────────────────────────────────────────────
  المعلمون                             ${s.teachers}       (admin / admin123)
  المساعدون                            ${s.assistants}       (asst_nour / asst_karim / asst_heba)
  الطلاب النشطون                       ${s.students}      كل الأعمدة مكتملة
  الطلاب المحذوفون                     ${s.deleted_students}       (std_deleted)
  الكورسات                             ${s.courses}       (${s.published_courses} منشورة | is_published + points_on_complete)
  الأقسام                              ${s.sections}      (17 قسم)
  الفيديوهات                           ${s.videos}      (url_480 + url_720 + url_1080 ✓)
  ملفات PDF                            ${s.pdfs}      (مع section_id)
  ───────────────────────────────────────────────────────────────
  بنوك الأسئلة                         ${s.banks}       (مع subject وcourse_id)
  أسئلة البنوك                         ${s.bank_qs}      (mcq + true_false + essay)
  ───────────────────────────────────────────────────────────────
  الامتحانات                           ${s.exams}      (${s.pub_exams} منشور | shuffle + source + points ✓)
  الأسئلة الإجمالي                     ${s.questions}     (MCQ:${s.q_mcq} | صح/خطأ:${s.q_tf} | مقالي:${s.q_essay})
  نتائج الامتحانات                     ${s.results}      (essay_graded + adjustment ✓ | معلق:${s.pending_grading})
  التسجيلات في الكورسات                ${s.enrollments}      (enrollment_date + status ✓)
  ───────────────────────────────────────────────────────────────
  المدفوعات                            ${s.payments}      (verified_by + verified_at ✓ | ✓${s.pay_verified} ⏳${s.pay_pending} ✗${s.pay_rejected})
  الشارات                              ${s.badges}      (badge_name + badge_color + earned_at ✓)
  تقدم الفيديوهات                      ${s.video_progress}     (last_position + actual_watched_seconds ✓)
  إتمام الكورسات (نقاط)                ${s.completions}       (points_awarded ✓)
  ───────────────────────────────────────────────────────────────
  الإشعارات                            ${s.notifications}      (title + source ✓)
  طلبات إعادة الامتحان                 ${s.retries}       (pending + approved + rejected)
  طلبات التسجيل في الكورسات            ${s.enroll_reqs}       (pending + accepted + rejected)
  ───────────────────────────────────────────────────────────────
  البث المباشر (جلسات)                 ${s.live_streams}       (ended + active)
  مشاهدو البث                          ${s.live_viewers}      (joined_at + left_at + is_active ✓)
  رسائل شات البث                       ${s.live_chats}      (sender_type + sender_name ✓)
  رفع يد                               ${s.live_raises}       (raised_at + lowered_at + is_active ✓)
  ───────────────────────────────────────────────────────────────
  الألعاب (Stickman Run)               ${s.event_plays}      (score + completed + played_at ✓)
  سجل المتصدرين (تاريخ)                ${s.lb_history}       (مارس + أبريل + مايو 2025)
  متتبع إعادة الضبط                    ${s.lb_tracker}       (next_reset_at بعد 15 يوم)
  ───────────────────────────────────────────────────────────────

  🔑 بيانات تسجيل الدخول:
     المعلم:    admin       / admin123
     مساعد 1:   asst_nour   / 123456  (صلاحيات كاملة)
     مساعد 2:   asst_karim  / 123456  (بدون كورسات وإشعارات)
     مساعد 3:   asst_heba   / 123456  (عرض وتقارير فقط)
     طالب ثالثة متفوق:  std_ali     / 123456
     طالب ثالثة ضعيف:   std_mona    / 123456
     طالب ثانية متفوق:  std_mostafa / 123456
     طالب أولى متفوق:   std_nour2   / 123456
     طالب غير نشط:      std_new     / 123456
  `);

  await pool.end();
}

seed().catch(err => {
  console.error('\n❌ خطأ في إضافة البيانات:', err.message);
  console.error(err.stack);
  pool.end();
  process.exit(1);
});
