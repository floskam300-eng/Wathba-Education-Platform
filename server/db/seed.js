/**
 * WATHBA Multi-Tenant Seed
 * 3 مدرسين مختلفين، كل واحد عنده طلاب وكورسات وامتحانات
 * تشغيل: node server/db/seed.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('./connection');
const bcrypt = require('bcryptjs');

if (process.env.NODE_ENV === 'production') {
  console.error('❌ seed.js مرفوض في بيئة الإنتاج');
  process.exit(1);
}

const q = (text, params = []) => pool.query(text, params).then(r => r.rows);

async function seed() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🌱 WATHBA Multi-Tenant — بدء إضافة البيانات التجريبية');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ══════════════════════════════════════════════════════════
  // 0. مسح كل البيانات بالترتيب الصحيح
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  مسح البيانات القديمة...');
  const tables = [
    'event_plays', 'live_hand_raises', 'live_chat_messages',
    'live_stream_viewers', 'live_streams', 'course_completion_points',
    'exam_retry_requests', 'notification_log', 'badges', 'video_progress',
    'exam_results', 'course_enrollment_requests', 'student_course_enrollment',
    'payments', 'bank_questions', 'question_banks', 'questions', 'exams',
    'pdf_files', 'videos', 'sections', 'courses', 'students', 'assistants',
    'leaderboard_history', 'leaderboard_reset_tracker',
  ];
  for (const t of tables) {
    try { await q(`DELETE FROM ${t}`); } catch (_) {}
  }
  // مسح المدرسين غير الـ admin
  await q(`DELETE FROM teachers WHERE username != 'admin'`);
  console.log('  ✓ تم مسح كل البيانات');

  const pass6  = await bcrypt.hash('123456', 10);
  const passAd = await bcrypt.hash('admin123', 10);

  // ══════════════════════════════════════════════════════════
  // 1. إنشاء/تحديث المدرسين الثلاثة
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إنشاء المدرسين...');

  // المدرس الافتراضي (موجود من قبل)
  let [adminRow] = await q(`SELECT id FROM teachers WHERE username='admin'`);
  if (!adminRow) {
    [adminRow] = await q(`
      INSERT INTO teachers (username, password, name, bio, classification, whatsapp_phone, slug, platform_name)
      VALUES ('admin', $1, 'أ/ محمد عبد الرحمن', 'معلم رياضيات بخبرة 20 عاماً', 'مدرس رياضيات', '+201000000000', 'admin', 'أكاديمية محمد للرياضيات')
      RETURNING id
    `, [passAd]);
  } else {
    await q(`
      UPDATE teachers SET
        name = 'أ/ محمد عبد الرحمن',
        bio = 'معلم رياضيات بخبرة 20 عاماً، متخصص في الثانوية العامة والإعدادية. نجح على يديه أكثر من 4000 طالب.',
        classification = 'مدرس رياضيات — ثانوية عامة وإعدادية',
        whatsapp_phone = '+201000000000',
        slug = 'admin',
        platform_name = 'أكاديمية محمد للرياضيات'
      WHERE id = $1
    `, [adminRow.id]);
  }
  const T1 = adminRow.id;
  console.log(`  ✓ admin (id=${T1}) → /admin — أكاديمية محمد للرياضيات`);

  // المدرسة الثانية
  const [t2] = await q(`
    INSERT INTO teachers (username, password, name, bio, classification, whatsapp_phone, slug, platform_name)
    VALUES ('ms_sara', $1, 'أ/ سارة خالد الحسيني',
            'مدرسة علوم متميزة بخبرة 12 عاماً في تدريس الأحياء والكيمياء. خريجة كلية العلوم جامعة عين شمس.',
            'مدرسة علوم — أحياء وكيمياء', '+201100000000',
            'ms-sara', 'منصة سارة للعلوم')
    RETURNING id
  `, [pass6]);
  const T2 = t2.id;
  console.log(`  ✓ ms_sara (id=${T2}) → /ms-sara — منصة سارة للعلوم`);

  // المدرس الثالث
  const [t3] = await q(`
    INSERT INTO teachers (username, password, name, bio, classification, whatsapp_phone, slug, platform_name)
    VALUES ('mr_karim', $1, 'أ/ كريم الشافعي',
            'معلم لغة عربية ومدرب خطابة بخبرة 15 عاماً. متخصص في الثانوية العامة والكفاءة اللغوية.',
            'مدرس لغة عربية — ثانوية وإعدادية', '+201200000000',
            'mr-karim', 'مركز كريم للغة العربية')
    RETURNING id
  `, [pass6]);
  const T3 = t3.id;
  console.log(`  ✓ mr_karim (id=${T3}) → /mr-karim — مركز كريم للغة العربية`);

  // ══════════════════════════════════════════════════════════
  // 2. المساعدون
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة المساعدين...');
  const assts = await q(`
    INSERT INTO assistants
      (username, password, name, phone, teacher_id,
       can_add_students, can_edit_students, can_delete_students,
       can_manage_exams, can_view_analytics, can_send_reports,
       can_manage_payments, can_manage_courses, can_send_notifications)
    VALUES
      ('asst_nour',  $1, 'نور أحمد',    '+201111111101', $2, true, true,  false, true,  true, true, true,  true,  true),
      ('asst_karim', $1, 'كريم محمود',  '+201111111102', $2, true, true,  false, false, true, true, false, false, false),
      ('asst_dina',  $1, 'دينا سعيد',   '+201111111103', $3, true, true,  false, true,  true, true, true,  true,  true),
      ('asst_yara',  $1, 'يارا محمد',   '+201111111104', $4, true, false, false, false, true, true, false, false, false)
    RETURNING id, username, teacher_id
  `, [pass6, T1, T2, T3]);
  console.log(`  ✓ 4 مساعدين`);

  // ══════════════════════════════════════════════════════════
  // 3. الطلاب
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الطلاب...');

  // طلاب أ/ محمد (رياضيات) — 10 طلاب
  const t1StudentsRaw = [
    ['std_ali',     'علي محمد رمضان',        '+201200000001', '+201200000002', 'الصف الثالث الثانوي',  'ذكر',  780],
    ['std_fatma',   'فاطمة أحمد سعد',        '+201200000003', '+201200000004', 'الصف الثالث الثانوي',  'أنثى', 710],
    ['std_youssef', 'يوسف إبراهيم كمال',     '+201200000005', '+201200000006', 'الصف الثالث الثانوي',  'ذكر',  850],
    ['std_nada',    'ندى حسن عبد الله',      '+201200000007', '+201200000008', 'الصف الثالث الثانوي',  'أنثى', 540],
    ['std_omar',    'عمر سامي فرج',          '+201200000009', '+201200000010', 'الصف الثالث الثانوي',  'ذكر',  620],
    ['std_mostafa', 'مصطفى أسامة نور',       '+201200000025', '+201200000026', 'الصف الثاني الثانوي', 'ذكر',  340],
    ['std_rana',    'رنا طارق عبد العزيز',   '+201200000027', '+201200000028', 'الصف الثاني الثانوي', 'أنثى', 420],
    ['std_adam',    'آدم محمود صلاح',        '+201200000029', '+201200000030', 'الصف الثاني الثانوي', 'ذكر',  295],
    ['std_lina',    'لينا سعيد القاضي',      '+201200000031', '+201200000032', 'الصف الثاني الثانوي', 'أنثى', 380],
    ['std_ziad',    'زياد أحمد مبارك',       '+201200000033', '+201200000034', 'الصف الثاني الثانوي', 'ذكر',  260],
  ];

  // طلاب أ/ سارة (علوم) — 8 طلاب
  const t2StudentsRaw = [
    ['sci_hana',    'هناء وليد منصور',       '+201300000001', '+201300000002', 'الصف الثالث الثانوي',  'أنثى', 690],
    ['sci_hassan',  'حسن علاء طارق',         '+201300000003', '+201300000004', 'الصف الثالث الثانوي',  'ذكر',  430],
    ['sci_mona',    'منى رامي عبد العزيز',   '+201300000005', '+201300000006', 'الصف الثاني الثانوي', 'أنثى', 280],
    ['sci_khaled',  'خالد عصام مبروك',       '+201300000007', '+201300000008', 'الصف الثاني الثانوي', 'ذكر',  660],
    ['sci_dina',    'دينا وليد شريف',        '+201300000009', '+201300000010', 'الصف الثاني الثانوي', 'أنثى', 370],
    ['sci_amr',     'عمرو جمال سليم',        '+201300000011', '+201300000012', 'الصف الأول الثانوي',  'ذكر',  510],
    ['sci_randa',   'رندا كمال مصطفى',       '+201300000013', '+201300000014', 'الصف الأول الثانوي',  'أنثى', 460],
    ['sci_walid',   'وليد فتحي عمار',        '+201300000015', '+201300000016', 'الصف الأول الثانوي',  'ذكر',  210],
  ];

  // طلاب أ/ كريم (عربي) — 6 طلاب
  const t3StudentsRaw = [
    ['ara_nour',    'نور الدين سامي توفيق',  '+201400000001', '+201400000002', 'الصف الثالث الثانوي',  'ذكر',  145],
    ['ara_yasmin',  'ياسمين رأفت عوض',       '+201400000003', '+201400000004', 'الصف الثالث الثانوي',  'أنثى', 320],
    ['ara_tarek',   'طارق ماهر أبو زيد',     '+201400000005', '+201400000006', 'الصف الثاني الثانوي', 'ذكر',  175],
    ['ara_hana',    'هنا إسلام قنديل',       '+201400000007', '+201400000008', 'الصف الثاني الثانوي', 'أنثى',  90],
    ['ara_layla',   'ليلى وسام عطية',        '+201400000009', '+201400000010', 'الصف الأول الثانوي',  'أنثى', 130],
    ['ara_karim2',  'كريم شريف النجار',      '+201400000011', '+201400000012', 'الصف الأول الثانوي',  'ذكر',   80],
  ];

  const insertStudents = async (rows, teacherId) => {
    const ids = [];
    for (const [username, name, phone, parent_phone, stage, gender, points] of rows) {
      const [s] = await q(`
        INSERT INTO students (username, password, plain_password, name, phone, parent_phone, academic_stage, gender, teacher_id, points)
        VALUES ($1, $2, '123456', $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `, [username, pass6, name, phone, parent_phone, stage, gender, teacherId, points]);
      ids.push(s.id);
    }
    return ids;
  };

  const S1 = await insertStudents(t1StudentsRaw, T1);
  const S2 = await insertStudents(t2StudentsRaw, T2);
  const S3 = await insertStudents(t3StudentsRaw, T3);
  console.log(`  ✓ ${S1.length + S2.length + S3.length} طالب (${S1.length} رياضيات / ${S2.length} علوم / ${S3.length} عربي)`);

  // ══════════════════════════════════════════════════════════
  // 4. الكورسات
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الكورسات...');

  // كورسات أ/ محمد
  const [c1a] = await q(`
    INSERT INTO courses (name, description, price, teacher_id, target_stage, is_published, is_free, points_on_complete,
      thumbnail_url)
    VALUES ('رياضيات الثالث الثانوي — الجبر والمثلثات', 'شرح مفصّل لكل أبواب الجبر والمثلثات منهج الثانوية العامة مع أكثر من 200 مسألة محلولة.', 250, $1, 'الصف الثالث الثانوي', true, false, 50,
      'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&h=340&fit=crop')
    RETURNING id
  `, [T1]);
  const [c1b] = await q(`
    INSERT INTO courses (name, description, price, teacher_id, target_stage, is_published, is_free, points_on_complete,
      thumbnail_url)
    VALUES ('رياضيات الثاني الثانوي — الهندسة التحليلية', 'أساسيات وتطبيقات الهندسة التحليلية بطريقة مبسطة ومنظمة مع تمارين على كل درس.', 200, $1, 'الصف الثاني الثانوي', true, false, 40,
      'https://images.unsplash.com/photo-1509228627152-72ae9ae6848d?w=600&h=340&fit=crop')
    RETURNING id
  `, [T1]);
  const [c1free] = await q(`
    INSERT INTO courses (name, description, price, teacher_id, target_stage, is_published, is_free, points_on_complete,
      thumbnail_url)
    VALUES ('مقدمة مجانية — أساسيات الجبر', 'درس تعريفي مجاني لأساسيات الجبر والمعادلات. اكتشف أسلوب الشرح قبل الاشتراك.', 0, $1, 'الصف الثاني الثانوي', true, true, 10,
      'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=600&h=340&fit=crop')
    RETURNING id
  `, [T1]);

  // كورسات أ/ سارة
  const [c2a] = await q(`
    INSERT INTO courses (name, description, price, teacher_id, target_stage, is_published, is_free, points_on_complete,
      thumbnail_url)
    VALUES ('أحياء الثالث الثانوي — الشامل', 'المنهج كاملاً من الخلية إلى الجهاز العصبي — شرح مصوّر مع أسئلة البكالوريا السابقة.', 280, $1, 'الصف الثالث الثانوي', true, false, 50,
      'https://images.unsplash.com/photo-1576086213369-97a306d36557?w=600&h=340&fit=crop')
    RETURNING id
  `, [T2]);
  const [c2b] = await q(`
    INSERT INTO courses (name, description, price, teacher_id, target_stage, is_published, is_free, points_on_complete,
      thumbnail_url)
    VALUES ('كيمياء الثاني الثانوي — التفاعلات والموازين', 'كل أبواب الكيمياء للثاني الثانوي مع حل معادلات التفاعل وتمارين متنوعة.', 220, $1, 'الصف الثاني الثانوي', true, false, 40,
      'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=600&h=340&fit=crop')
    RETURNING id
  `, [T2]);

  // كورسات أ/ كريم
  const [c3a] = await q(`
    INSERT INTO courses (name, description, price, teacher_id, target_stage, is_published, is_free, points_on_complete,
      thumbnail_url)
    VALUES ('لغة عربية الثالث الثانوي — النصوص والأدب', 'شرح جميع النصوص والقصائد الأدبية مع نماذج الإجابة الكاملة للثانوية العامة.', 200, $1, 'الصف الثالث الثانوي', true, false, 40,
      'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=600&h=340&fit=crop')
    RETURNING id
  `, [T3]);
  const [c3b] = await q(`
    INSERT INTO courses (name, description, price, teacher_id, target_stage, is_published, is_free, points_on_complete,
      thumbnail_url)
    VALUES ('قواعد اللغة العربية — النحو والصرف', 'مراجعة شاملة لقواعد النحو والصرف مع أمثلة تطبيقية وتمارين على كل قاعدة.', 150, $1, 'الصف الثاني الثانوي', true, false, 30,
      'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?w=600&h=340&fit=crop')
    RETURNING id
  `, [T3]);

  console.log(`  ✓ 7 كورسات (3 رياضيات / 2 علوم / 2 عربي)`);

  // ══════════════════════════════════════════════════════════
  // 5. الأقسام والفيديوهات والـ PDF
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الأقسام والمحتوى...');

  const addSection = async (courseId, title, order) => {
    const [s] = await q(`INSERT INTO sections (course_id, title, sort_order) VALUES ($1,$2,$3) RETURNING id`, [courseId, title, order]);
    return s.id;
  };
  const addVideo = async (courseId, sectionId, title, url, mins, order) => {
    await q(`INSERT INTO videos (course_id, section_id, title, file_path_or_url, duration_minutes, sort_order) VALUES ($1,$2,$3,$4,$5,$6)`,
      [courseId, sectionId, title, url, mins, order]);
  };
  const addPdf = async (courseId, sectionId, title, url) => {
    await q(`INSERT INTO pdf_files (course_id, section_id, title, file_url) VALUES ($1,$2,$3,$4)`, [courseId, sectionId, title, url]);
  };

  // كورس c1a رياضيات ثالث ثانوي
  const sec1 = await addSection(c1a.id, 'الباب الأول — المعادلات والمتباينات', 1);
  const sec2 = await addSection(c1a.id, 'الباب الثاني — المثلثات', 2);
  await addVideo(c1a.id, sec1, 'مقدمة الجبر وحل المعادلات من الدرجة الأولى', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 28, 1);
  await addVideo(c1a.id, sec1, 'المعادلات التربيعية وطرق الحل', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 35, 2);
  await addVideo(c1a.id, sec1, 'المتباينات وتمثيلها على محور الأعداد', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 22, 3);
  await addVideo(c1a.id, sec2, 'مقدمة المثلثات والزوايا', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 30, 1);
  await addVideo(c1a.id, sec2, 'النسب المثلثية وجدول القيم', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 40, 2);
  await addPdf(c1a.id, sec1, 'ملخص المعادلات والمتباينات PDF', 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf');
  await addPdf(c1a.id, sec2, 'جدول النسب المثلثية + تدريبات', 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf');

  // كورس c2a أحياء
  const sec3 = await addSection(c2a.id, 'الوحدة الأولى — الخلية والوراثة', 1);
  const sec4 = await addSection(c2a.id, 'الوحدة الثانية — الجهاز العصبي', 2);
  await addVideo(c2a.id, sec3, 'بنية الخلية ووظائفها', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 32, 1);
  await addVideo(c2a.id, sec3, 'الانقسام الخلوي المتساوي والاختزالي', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 38, 2);
  await addVideo(c2a.id, sec4, 'الجهاز العصبي — التشريح والوظيفة', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 45, 1);
  await addPdf(c2a.id, sec3, 'ملخص الخلية والوراثة', 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf');

  // كورس c3a عربي
  const sec5 = await addSection(c3a.id, 'النصوص الأدبية', 1);
  await addVideo(c3a.id, sec5, 'شرح قصيدة المساء — إيليا أبو ماضي', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 25, 1);
  await addVideo(c3a.id, sec5, 'شرح نص — من أدب النهضة', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 30, 2);
  await addPdf(c3a.id, sec5, 'نماذج إجابة النصوص كاملة', 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf');

  console.log('  ✓ الأقسام والفيديوهات والـ PDF تم إضافتها');

  // ══════════════════════════════════════════════════════════
  // 6. الامتحانات والأسئلة
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الامتحانات...');

  const now = new Date();
  const past   = d => new Date(now.getTime() - d * 86400000).toISOString();
  const future = d => new Date(now.getTime() + d * 86400000).toISOString();

  // امتحانات أ/ محمد
  const [e1] = await q(`
    INSERT INTO exams (title, duration_minutes, total_score, pass_score, teacher_id, course_id, is_published,
      start_date, end_date, badge_name, badge_color)
    VALUES ('امتحان الجبر — الوحدة الأولى', 45, 30, 15, $1, $2, true, $3, $4, 'نجم الجبر', '#f97316')
    RETURNING id
  `, [T1, c1a.id, past(14), past(7)]);

  const [e2] = await q(`
    INSERT INTO exams (title, duration_minutes, total_score, pass_score, teacher_id, course_id, is_published,
      start_date, end_date, badge_name, badge_color)
    VALUES ('مراجعة المثلثات النهائية', 60, 50, 25, $1, $2, true, $3, $4, 'متفوق الرياضيات', '#7c3aed')
    RETURNING id
  `, [T1, c1a.id, past(3), future(4)]);

  const [e3] = await q(`
    INSERT INTO exams (title, duration_minutes, total_score, pass_score, teacher_id, course_id, is_published,
      start_date, end_date)
    VALUES ('اختبار الهندسة التحليلية', 30, 20, 10, $1, $2, true, $3, $4)
    RETURNING id
  `, [T1, c1b.id, future(2), future(9)]);

  // امتحانات أ/ سارة
  const [e4] = await q(`
    INSERT INTO exams (title, duration_minutes, total_score, pass_score, teacher_id, course_id, is_published,
      start_date, end_date, badge_name, badge_color)
    VALUES ('امتحان الخلية والوراثة', 40, 25, 12, $1, $2, true, $3, $4, 'عالم الأحياء', '#10b981')
    RETURNING id
  `, [T2, c2a.id, past(10), past(3)]);

  const [e5] = await q(`
    INSERT INTO exams (title, duration_minutes, total_score, pass_score, teacher_id, course_id, is_published,
      start_date, end_date)
    VALUES ('اختبار الكيمياء التمهيدي', 35, 20, 10, $1, $2, true, $3, $4)
    RETURNING id
  `, [T2, c2b.id, future(1), future(8)]);

  // امتحانات أ/ كريم
  const [e6] = await q(`
    INSERT INTO exams (title, duration_minutes, total_score, pass_score, teacher_id, course_id, is_published,
      start_date, end_date, badge_name, badge_color)
    VALUES ('امتحان النصوص الأدبية', 50, 30, 15, $1, $2, true, $3, $4, 'أديب المنصة', '#f59e0b')
    RETURNING id
  `, [T3, c3a.id, past(5), past(1)]);

  // الأسئلة
  const addMCQ = async (examId, text, a, b, c, d, correct, pts = 1) => {
    await q(`INSERT INTO questions (exam_id, question_text, option_a, option_b, option_c, option_d, correct_answer_letter, points, question_type)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'mcq')`, [examId, text, a, b, c, d, correct, pts]);
  };

  // أسئلة e1
  await addMCQ(e1.id, 'حل المعادلة: 2x + 6 = 14', 'x = 3', 'x = 4', 'x = 5', 'x = 10', 'B', 3);
  await addMCQ(e1.id, 'إذا كان 3x - 9 = 0 فإن x =', '1', '2', '3', '9', 'C', 3);
  await addMCQ(e1.id, 'حل المعادلة التربيعية: x² - 5x + 6 = 0', 'x=1,x=6', 'x=2,x=3', 'x=-2,x=-3', 'x=0,x=5', 'B', 3);
  await addMCQ(e1.id, 'المتباينة x + 3 > 7 تعني', 'x > 4', 'x < 4', 'x = 4', 'x > 10', 'A', 3);
  await addMCQ(e1.id, 'ما هو الجذر الموجب لـ x² = 25', '5', '10', '15', '25', 'A', 3);
  await addMCQ(e1.id, 'يحتوي المضلع المنتظم على 6 أضلاع. ما مجموع زواياه الداخلية؟', '540°', '720°', '900°', '1080°', 'B', 3);
  await addMCQ(e1.id, 'المعادلة y = 2x + 1 ، قيمة y عند x=3 هي', '5', '7', '9', '3', 'B', 3);
  await addMCQ(e1.id, 'أي من التالي يمثل حلاً للمعادلة x² = 16', '2', '4', '8', '6', 'B', 3);
  await addMCQ(e1.id, 'حل المتباينة 2x < 10', 'x < 5', 'x > 5', 'x = 5', 'x < 20', 'A', 3);
  await addMCQ(e1.id, 'إذا كان f(x) = x² فإن f(4) =', '8', '12', '16', '4', 'C', 3);

  // أسئلة e2
  await addMCQ(e2.id, 'sin(30°) =', '1/√2', '1/2', '√3/2', '1', 'B', 5);
  await addMCQ(e2.id, 'cos(60°) =', '√3/2', '1', '1/2', '0', 'C', 5);
  await addMCQ(e2.id, 'tan(45°) =', '0', '1/√2', '1', '√3', 'C', 5);
  await addMCQ(e2.id, 'إذا كان sin(θ)=0.5 فإن θ في الربع الأول =', '30°', '45°', '60°', '90°', 'A', 5);
  await addMCQ(e2.id, 'sin²(x) + cos²(x) =', '0', '1/2', '1', '2', 'C', 5);
  await addMCQ(e2.id, 'أي قيمة صحيحة لـ cos(0°)', '0', '1', '-1', '1/2', 'B', 5);
  await addMCQ(e2.id, 'قيمة sin(90°) =', '0', '√2/2', '1', '-1', 'C', 5);
  await addMCQ(e2.id, 'في مثلث قائم الزاوية، الوتر هو', 'أقصر ضلع', 'الضلع المقابل للزاوية القائمة', 'الضلع المجاور للزاوية الحادة', 'أي ضلع', 'B', 5);
  await addMCQ(e2.id, 'cos(0°) + sin(90°) =', '1', '2', '0', '√2', 'B', 5);
  await addMCQ(e2.id, 'tan(θ) = sin(θ) / ___', 'sin(θ)', 'tan(θ)', 'cos(θ)', 'sec(θ)', 'C', 5);

  // أسئلة e4 (علوم)
  await addMCQ(e4.id, 'الوحدة الأساسية للحياة هي', 'الذرة', 'الجزيء', 'الخلية', 'العضو', 'C', 5);
  await addMCQ(e4.id, 'الانقسام الذي ينتج عنه خلايا تكاثر هو', 'الانقسام المتساوي', 'الانقسام الاختزالي', 'الانقسام اللاجنسي', 'الانقسام الثانوي', 'B', 5);
  await addMCQ(e4.id, 'DNA يوجد بشكل رئيسي في', 'السيتوبلازم', 'الغشاء الخلوي', 'النواة', 'الميتوكندريا', 'C', 5);
  await addMCQ(e4.id, 'مكان صنع البروتين في الخلية هو', 'الريبوسوم', 'الميتوكندريا', 'جولجي', 'النواة', 'A', 5);
  await addMCQ(e4.id, 'عدد الكروموسومات في الخلية البشرية =', '23', '46', '48', '92', 'B', 5);

  // أسئلة e6 (عربي)
  await addMCQ(e6.id, 'من قائل قصيدة المساء؟', 'شوقي', 'إيليا أبو ماضي', 'المتنبي', 'نزار قباني', 'B', 5);
  await addMCQ(e6.id, 'المذهب الأدبي الذي ينتمي إليه أبو ماضي', 'الكلاسيكية', 'الرومانسية', 'الواقعية', 'الرمزية', 'B', 5);
  await addMCQ(e6.id, 'الفعل اللازم هو الفعل الذي', 'يتعدى إلى مفعول به', 'لا يحتاج مفعولاً به', 'يأتي مع الجار والمجرور فقط', 'يسبقه حرف جر دائماً', 'B', 5);
  await addMCQ(e6.id, 'إعراب كلمة "الطالبُ" في "جاء الطالبُ" هي', 'مبتدأ', 'خبر', 'فاعل', 'مفعول به', 'C', 5);
  await addMCQ(e6.id, 'المفعول المطلق يأتي', 'اسماً مشتقاً من الفعل', 'فعلاً مضارعاً', 'حرفاً', 'صفةً', 'A', 5);
  await addMCQ(e6.id, 'الجناس في البلاغة هو', 'تشابه المعاني', 'تشابه الألفاظ في النطق مع اختلاف المعنى', 'التضاد', 'المبالغة', 'B', 5);

  console.log('  ✓ 6 امتحانات مع أسئلتها');

  // ══════════════════════════════════════════════════════════
  // 7. التسجيل في الكورسات
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  تسجيل الطلاب في الكورسات...');

  const enroll = async (studentId, courseId) => {
    await q(`INSERT INTO student_course_enrollment (student_id, course_id, status) VALUES ($1,$2,'active')
             ON CONFLICT (student_id, course_id) DO NOTHING`, [studentId, courseId]);
  };

  // طلاب أ/ محمد
  for (const sid of S1.slice(0, 5)) await enroll(sid, c1a.id);  // ثالث ثانوي في كورس الجبر
  for (const sid of S1.slice(5))    await enroll(sid, c1b.id);  // ثاني ثانوي في كورس الهندسة
  for (const sid of S1)             await enroll(sid, c1free.id); // الكل في الكورس المجاني

  // طلاب أ/ سارة
  for (const sid of S2.slice(0, 5)) await enroll(sid, c2a.id);
  for (const sid of S2.slice(3))    await enroll(sid, c2b.id);

  // طلاب أ/ كريم
  for (const sid of S3.slice(0, 4)) await enroll(sid, c3a.id);
  for (const sid of S3.slice(2))    await enroll(sid, c3b.id);

  console.log('  ✓ التسجيلات تمت');

  // ══════════════════════════════════════════════════════════
  // 8. نتائج الامتحانات
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة نتائج الامتحانات...');

  const scoreData = [
    // e1 (جبر) — ثالث ثانوي S1[0..4]
    [S1[0], e1.id, 27, 9, 1, 0],
    [S1[1], e1.id, 24, 8, 2, 0],
    [S1[2], e1.id, 30, 10, 0, 0],
    [S1[3], e1.id, 15, 5, 5, 0],
    [S1[4], e1.id, 18, 6, 4, 0],
    // e2 (مثلثات) — نفس الطلاب
    [S1[0], e2.id, 40, 8, 2, 0],
    [S1[1], e2.id, 35, 7, 3, 0],
    [S1[2], e2.id, 45, 9, 1, 0],
    [S1[3], e2.id, 20, 4, 6, 0],
    // e4 (أحياء) — طلاب سارة
    [S2[0], e4.id, 20, 4, 1, 0],
    [S2[1], e4.id, 15, 3, 2, 0],
    [S2[2], e4.id, 10, 2, 3, 0],
    [S2[3], e4.id, 23, 4, 1, 0],
    [S2[4], e4.id, 18, 3, 2, 0],
    // e6 (عربي) — طلاب كريم
    [S3[0], e6.id, 20, 4, 2, 0],
    [S3[1], e6.id, 25, 5, 1, 0],
    [S3[2], e6.id, 15, 3, 3, 0],
    [S3[3], e6.id, 18, 3, 3, 0],
  ];

  for (const [sid, eid, score, correct, wrong, unanswered] of scoreData) {
    await q(`
      INSERT INTO exam_results (student_id, exam_id, score, correct_count, wrong_count, unanswered_count,
        start_time, end_time, points_earned, essay_graded)
      VALUES ($1,$2,$3,$4,$5,$6, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour', $3, true)
    `, [sid, eid, score, correct, wrong, unanswered]);
  }

  // شارات للمتفوقين
  await q(`INSERT INTO badges (student_id, exam_id, badge_name, badge_color) VALUES ($1,$2,'نجم الجبر','#f97316')`, [S1[2], e1.id]);
  await q(`INSERT INTO badges (student_id, exam_id, badge_name, badge_color) VALUES ($1,$2,'متفوق الرياضيات','#7c3aed')`, [S1[2], e2.id]);
  await q(`INSERT INTO badges (student_id, exam_id, badge_name, badge_color) VALUES ($1,$2,'عالم الأحياء','#10b981')`, [S2[3], e4.id]);

  console.log(`  ✓ ${scoreData.length} نتيجة امتحان و 3 شارات`);

  // ══════════════════════════════════════════════════════════
  // 9. المدفوعات
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة المدفوعات...');
  const payments = [
    [S1[0], c1a.id, 250, 'instapay', 'verified'],
    [S1[1], c1a.id, 250, 'vodafone_cash', 'verified'],
    [S1[2], c1a.id, 250, 'instapay', 'verified'],
    [S1[5], c1b.id, 200, 'vodafone_cash', 'pending'],
    [S1[6], c1b.id, 200, 'instapay', 'verified'],
    [S2[0], c2a.id, 280, 'instapay', 'verified'],
    [S2[1], c2a.id, 280, 'vodafone_cash', 'verified'],
    [S2[2], c2a.id, 280, 'instapay', 'pending'],
    [S3[0], c3a.id, 200, 'vodafone_cash', 'verified'],
    [S3[1], c3a.id, 200, 'instapay', 'verified'],
  ];
  for (const [sid, cid, amount, method, status] of payments) {
    await q(`INSERT INTO payments (student_id, course_id, amount, method, status, reference_number)
             VALUES ($1,$2,$3,$4,$5, $6)`,
      [sid, cid, amount, method, status, `REF${Math.floor(Math.random()*900000+100000)}`]);
  }
  console.log(`  ✓ ${payments.length} عملية دفع`);

  // ══════════════════════════════════════════════════════════
  // 10. تقدم الفيديو
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة تقدم الفيديو...');
  const vids = await q(`SELECT id FROM videos LIMIT 5`);
  const progData = [
    [S1[0], 0, 80],
    [S1[0], 1, 100],
    [S1[1], 0, 55],
    [S1[2], 0, 100],
    [S1[2], 1, 100],
    [S2[0], 2, 70],
    [S2[1], 2, 40],
  ];
  for (const [sid, vidIdx, pct] of progData) {
    if (vids[vidIdx]) {
      await q(`INSERT INTO video_progress (student_id, video_id, progress_percentage, watched_minutes, watch_count)
               VALUES ($1,$2,$3,$4,1) ON CONFLICT DO NOTHING`,
        [sid, vids[vidIdx].id, pct, Math.floor(pct * 0.3)]);
    }
  }
  console.log('  ✓ تقدم الفيديو تم');

  // ══════════════════════════════════════════════════════════
  // 11. الإشعارات
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة إشعارات تجريبية...');
  const notifs = [
    [T1, S1[0], 'إشعار عام', 'مرحباً بك في أكاديمية محمد للرياضيات! تم تفعيل حسابك بنجاح.', 'general'],
    [T1, S1[1], 'امتحان جديد', 'تم نشر امتحان مراجعة المثلثات النهائية — لا تفوّت الفرصة!', 'new_exam'],
    [T1, S1[2], 'نتيجة الامتحان', 'حصلت على 30/30 في امتحان الجبر 🎉 ممتاز!', 'exam_result'],
    [T2, S2[0], 'إشعار عام', 'أهلاً بك في منصة سارة للعلوم! نتمنى لك تجربة تعليمية مميزة.', 'general'],
    [T3, S3[1], 'إشعار عام', 'مرحباً في مركز كريم للغة العربية! تفضّل بمشاهدة كورساتك.', 'general'],
  ];
  for (const [tid, sid, title, message, type] of notifs) {
    await q(`INSERT INTO notification_log (teacher_id, student_id, title, message, type, source)
             VALUES ($1,$2,$3,$4,$5,'platform')`, [tid, sid, title, message, type]);
  }
  console.log('  ✓ الإشعارات تمت');

  // ══════════════════════════════════════════════════════════
  // ملخص نهائي
  // ══════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ✅ البيانات التجريبية اكتملت بنجاح!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n  🔑 بيانات تسجيل الدخول:');
  console.log('  ┌─────────────────────────────────────────────────────┐');
  console.log('  │  المعلم الأول (رياضيات)                             │');
  console.log('  │  رابط:     /admin                                   │');
  console.log('  │  دخول:     admin / admin123                         │');
  console.log('  │  طالب:     std_ali / 123456                         │');
  console.log('  ├─────────────────────────────────────────────────────┤');
  console.log('  │  المعلمة الثانية (علوم)                             │');
  console.log('  │  رابط:     /ms-sara                                 │');
  console.log('  │  دخول:     ms_sara / 123456                         │');
  console.log('  │  طالبة:    sci_hana / 123456                        │');
  console.log('  ├─────────────────────────────────────────────────────┤');
  console.log('  │  المعلم الثالث (عربي)                               │');
  console.log('  │  رابط:     /mr-karim                                │');
  console.log('  │  دخول:     mr_karim / 123456                        │');
  console.log('  │  طالب:     ara_nour / 123456                        │');
  console.log('  └─────────────────────────────────────────────────────┘\n');

  await pool.end();
}

seed().catch(err => {
  console.error('\n❌ خطأ:', err.message);
  pool.end();
  process.exit(1);
});
