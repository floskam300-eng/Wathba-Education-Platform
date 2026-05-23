/**
 * WATHBA — Seed File (منطقي ومتكامل)
 * ─────────────────────────────────────────────
 * 3 مدرسين | 4 مساعدين | 23 طالب | 7 كورسات
 * قاعدة: الطالب يُسجَّل فقط في كورسات تناسب مرحلته الدراسية
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
  console.log('  🌱 WATHBA — بدء إنشاء البيانات التجريبية المنطقية');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ══════════════════════════════════════════════════════════
  // 0. مسح البيانات القديمة بالترتيب الصحيح
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  مسح البيانات القديمة...');
  const tables = [
    'activity_logs',
    'exam_sessions',
    'event_plays',
    'live_hand_raises',
    'live_chat_messages',
    'live_stream_viewers',
    'live_streams',
    'course_completion_points',
    'exam_retry_requests',
    'notification_log',
    'badges',
    'video_progress',
    'exam_results',
    'course_enrollment_requests',
    'student_course_enrollment',
    'payments',
    'leaderboard_history',
    'leaderboard_reset_tracker',
    'bank_questions',
    'question_banks',
    'questions',
    'exams',
    'pdf_files',
    'videos',
    'sections',
    'courses',
    'students',
    'assistants',
  ];
  for (const t of tables) {
    try { await q(`DELETE FROM ${t}`); } catch (_) {}
  }
  await q(`DELETE FROM teachers WHERE username != 'admin'`);
  console.log('  ✓ تم مسح كل البيانات');

  const pass6  = await bcrypt.hash('123456', 10);
  const passAd = await bcrypt.hash('admin123', 10);

  // ══════════════════════════════════════════════════════════
  // 1. المدرسون
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إنشاء المدرسين...');

  // المدرس الأول — admin (موجود مسبقاً أو يُنشأ)
  let [adminRow] = await q(`SELECT id FROM teachers WHERE username='admin'`);
  if (!adminRow) {
    [adminRow] = await q(`
      INSERT INTO teachers
        (username, password, name, bio, classification, whatsapp_phone, slug, platform_name, logo_url, photo_url)
      VALUES ('admin', $1,
        'أ/ محمد عبد الرحمن',
        'معلم رياضيات بخبرة 20 عاماً، متخصص في الثانوية العامة والإعدادية. نجح على يديه أكثر من 4000 طالب.',
        'مدرس رياضيات — ثانوية عامة',
        '+201000000000', 'admin', 'أكاديمية محمد للرياضيات',
        'https://ui-avatars.com/api/?name=MA&background=f97316&color=fff&size=256&bold=true',
        'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=300&h=300&fit=crop')
      RETURNING id
    `, [passAd]);
  } else {
    await q(`
      UPDATE teachers SET
        name           = 'أ/ محمد عبد الرحمن',
        bio            = 'معلم رياضيات بخبرة 20 عاماً، متخصص في الثانوية العامة والإعدادية. نجح على يديه أكثر من 4000 طالب.',
        classification = 'مدرس رياضيات — ثانوية عامة',
        whatsapp_phone = '+201000000000',
        slug           = 'admin',
        platform_name  = 'أكاديمية محمد للرياضيات',
        logo_url       = 'https://ui-avatars.com/api/?name=MA&background=f97316&color=fff&size=256&bold=true',
        photo_url      = 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=300&h=300&fit=crop'
      WHERE id = $1
    `, [adminRow.id]);
  }
  const T1 = adminRow.id;
  console.log(`  ✓ admin (id=${T1}) — أكاديمية محمد للرياضيات`);

  const [t2row] = await q(`
    INSERT INTO teachers
      (username, password, name, bio, classification, whatsapp_phone, slug, platform_name, logo_url, photo_url)
    VALUES ('ms_sara', $1,
      'أ/ سارة خالد الحسيني',
      'مدرسة علوم متميزة بخبرة 12 عاماً في تدريس الأحياء والكيمياء. خريجة كلية العلوم جامعة عين شمس.',
      'مدرسة علوم — أحياء وكيمياء',
      '+201100000000', 'ms-sara', 'منصة سارة للعلوم',
      'https://ui-avatars.com/api/?name=SK&background=7c3aed&color=fff&size=256&bold=true',
      'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=300&h=300&fit=crop')
    RETURNING id
  `, [pass6]);
  const T2 = t2row.id;
  console.log(`  ✓ ms_sara (id=${T2}) — منصة سارة للعلوم`);

  const [t3row] = await q(`
    INSERT INTO teachers
      (username, password, name, bio, classification, whatsapp_phone, slug, platform_name, logo_url, photo_url)
    VALUES ('mr_karim', $1,
      'أ/ كريم الشافعي',
      'معلم لغة عربية ومدرب خطابة بخبرة 15 عاماً. متخصص في الثانوية العامة والكفاءة اللغوية.',
      'مدرس لغة عربية — ثانوية وإعدادية',
      '+201200000000', 'mr-karim', 'مركز كريم للغة العربية',
      'https://ui-avatars.com/api/?name=KS&background=10b981&color=fff&size=256&bold=true',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&h=300&fit=crop')
    RETURNING id
  `, [pass6]);
  const T3 = t3row.id;
  console.log(`  ✓ mr_karim (id=${T3}) — مركز كريم للغة العربية`);

  // ══════════════════════════════════════════════════════════
  // 2. المساعدون
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة المساعدين...');
  await q(`
    INSERT INTO assistants
      (username, password, name, phone, teacher_id,
       can_add_students, can_edit_students, can_delete_students,
       can_manage_exams, can_view_analytics,
       can_manage_payments, can_manage_courses, can_send_notifications)
    VALUES
      ('asst_nour',  $1, 'نور أحمد',    '+201111111101', $2,
       true,  true,  false, true,  true,  true,  true,  true),
      ('asst_karim', $1, 'كريم محمود',  '+201111111102', $2,
       true,  true,  false, false, true,  false, false, false),
      ('asst_dina',  $1, 'دينا سعيد',   '+201111111103', $3,
       true,  true,  false, true,  true,  true,  true,  true),
      ('asst_yara',  $1, 'يارا محمد',   '+201111111104', $4,
       true,  false, false, false, true,  false, false, false)
  `, [pass6, T1, T2, T3]);
  console.log('  ✓ 4 مساعدين');

  // ══════════════════════════════════════════════════════════
  // 3. الطلاب — مقسّمون بدقة حسب المرحلة الدراسية
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الطلاب...');

  // ── أ/ محمد (رياضيات): 5 ثالث ثانوي + 4 ثاني ثانوي ──
  const t1ThirdRaw = [
    ['std_ali',     'علي محمد رمضان',      '+201200000001', '+201200000002', 780],
    ['std_fatma',   'فاطمة أحمد سعد',      '+201200000003', '+201200000004', 710],
    ['std_youssef', 'يوسف إبراهيم كمال',   '+201200000005', '+201200000006', 850],
    ['std_nada',    'ندى حسن عبد الله',    '+201200000007', '+201200000008', 540],
    ['std_omar',    'عمر سامي فرج',        '+201200000009', '+201200000010', 620],
  ];
  const t1SecondRaw = [
    ['std_mostafa', 'مصطفى أسامة نور',     '+201200000025', '+201200000026', 340],
    ['std_rana',    'رنا طارق عبد العزيز', '+201200000027', '+201200000028', 420],
    ['std_adam',    'آدم محمود صلاح',      '+201200000029', '+201200000030', 295],
    ['std_lina',    'لينا سعيد القاضي',    '+201200000031', '+201200000032', 380],
  ];

  // ── أ/ سارة (علوم): 3 ثالث ثانوي + 3 ثاني ثانوي + 2 أول ثانوي ──
  const t2ThirdRaw = [
    ['sci_hana',    'هناء وليد منصور',     '+201300000001', '+201300000002', 690],
    ['sci_hassan',  'حسن علاء طارق',       '+201300000003', '+201300000004', 430],
    ['sci_mariam',  'مريم نبيل عوض',       '+201300000005', '+201300000006', 560],
  ];
  const t2SecondRaw = [
    ['sci_mona',    'منى رامي عبد العزيز', '+201300000007', '+201300000008', 280],
    ['sci_khaled',  'خالد عصام مبروك',     '+201300000009', '+201300000010', 390],
    ['sci_dina',    'دينا وليد شريف',      '+201300000011', '+201300000012', 310],
  ];
  const t2FirstRaw = [
    ['sci_amr',     'عمرو جمال سليم',      '+201300000013', '+201300000014', 150],
    ['sci_randa',   'رندا كمال مصطفى',     '+201300000015', '+201300000016', 200],
  ];

  // ── أ/ كريم (عربي): 2 ثالث ثانوي + 2 ثاني ثانوي + 2 أول ثانوي ──
  const t3ThirdRaw = [
    ['ara_nour',    'نور الدين سامي توفيق', '+201400000001', '+201400000002', 320],
    ['ara_yasmin',  'ياسمين رأفت عوض',      '+201400000003', '+201400000004', 145],
  ];
  const t3SecondRaw = [
    ['ara_tarek',   'طارق ماهر أبو زيد',   '+201400000005', '+201400000006', 175],
    ['ara_hana',    'هنا إسلام قنديل',      '+201400000007', '+201400000008',  90],
  ];
  const t3FirstRaw = [
    ['ara_layla',   'ليلى وسام عطية',      '+201400000009', '+201400000010', 130],
    ['ara_karim2',  'كريم شريف النجار',    '+201400000011', '+201400000012',  80],
  ];

  const insertStudents = async (rows, teacherId, stage, gender = 'ذكر') => {
    const ids = [];
    const genders = ['ذكر', 'أنثى', 'ذكر', 'أنثى', 'ذكر', 'أنثى'];
    for (let i = 0; i < rows.length; i++) {
      const [username, name, phone, parent_phone, points] = rows[i];
      const g = name.endsWith('ة') || name.endsWith('ى') || name.endsWith('اء') || name.endsWith('ين') && i % 2 === 1 ? 'أنثى' : genders[i];
      const [s] = await q(`
        INSERT INTO students
          (username, password, plain_password, name, phone, parent_phone, academic_stage, gender, teacher_id, points)
        VALUES ($1, $2, '123456', $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `, [username, pass6, name, phone, parent_phone, stage, g, teacherId, points]);
      ids.push(s.id);
    }
    return ids;
  };

  const S1_TH3 = await insertStudents(t1ThirdRaw,  T1, 'الصف الثالث الثانوي');
  const S1_TH2 = await insertStudents(t1SecondRaw, T1, 'الصف الثاني الثانوي');
  const S2_TH3 = await insertStudents(t2ThirdRaw,  T2, 'الصف الثالث الثانوي');
  const S2_TH2 = await insertStudents(t2SecondRaw, T2, 'الصف الثاني الثانوي');
  const S2_TH1 = await insertStudents(t2FirstRaw,  T2, 'الصف الأول الثانوي');
  const S3_TH3 = await insertStudents(t3ThirdRaw,  T3, 'الصف الثالث الثانوي');
  const S3_TH2 = await insertStudents(t3SecondRaw, T3, 'الصف الثاني الثانوي');
  const S3_TH1 = await insertStudents(t3FirstRaw,  T3, 'الصف الأول الثانوي');

  const totalStudents = S1_TH3.length + S1_TH2.length + S2_TH3.length + S2_TH2.length +
                        S2_TH1.length + S3_TH3.length + S3_TH2.length + S3_TH1.length;
  console.log(`  ✓ ${totalStudents} طالب`);
  console.log(`     رياضيات: ${S1_TH3.length} (ث3) + ${S1_TH2.length} (ث2)`);
  console.log(`     علوم:    ${S2_TH3.length} (ث3) + ${S2_TH2.length} (ث2) + ${S2_TH1.length} (ث1)`);
  console.log(`     عربي:    ${S3_TH3.length} (ث3) + ${S3_TH2.length} (ث2) + ${S3_TH1.length} (ث1)`);

  // ══════════════════════════════════════════════════════════
  // 4. الكورسات — target_stage يجب أن يطابق مرحلة الطلاب
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الكورسات...');

  // أ/ محمد — رياضيات
  const [c1a] = await q(`
    INSERT INTO courses
      (name, description, price, teacher_id, target_stage, is_published, is_free, points_on_complete, thumbnail_url)
    VALUES (
      'رياضيات الثالث الثانوي — الجبر والمثلثات',
      'شرح مفصّل لكل أبواب الجبر والمثلثات منهج الثانوية العامة مع أكثر من 200 مسألة محلولة وامتحانات تفاعلية.',
      250, $1, 'الصف الثالث الثانوي', true, false, 50,
      'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&h=340&fit=crop')
    RETURNING id
  `, [T1]);

  const [c1b] = await q(`
    INSERT INTO courses
      (name, description, price, teacher_id, target_stage, is_published, is_free, points_on_complete, thumbnail_url)
    VALUES (
      'رياضيات الثاني الثانوي — الهندسة التحليلية',
      'أساسيات وتطبيقات الهندسة التحليلية بطريقة مبسطة ومنظمة مع تمارين تفصيلية على كل درس.',
      200, $1, 'الصف الثاني الثانوي', true, false, 40,
      'https://images.unsplash.com/photo-1509228627152-72ae9ae6848d?w=600&h=340&fit=crop')
    RETURNING id
  `, [T1]);

  const [c1free] = await q(`
    INSERT INTO courses
      (name, description, price, teacher_id, target_stage, is_published, is_free, points_on_complete, thumbnail_url)
    VALUES (
      'مقدمة مجانية — أساسيات الجبر للثانوية',
      'درس تعريفي مجاني لأساسيات الجبر والمعادلات — اكتشف أسلوب الشرح وابدأ مجاناً.',
      0, $1, 'الصف الثاني الثانوي', true, true, 10,
      'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=600&h=340&fit=crop')
    RETURNING id
  `, [T1]);

  // أ/ سارة — علوم
  const [c2a] = await q(`
    INSERT INTO courses
      (name, description, price, teacher_id, target_stage, is_published, is_free, points_on_complete, thumbnail_url)
    VALUES (
      'أحياء الثالث الثانوي — الشامل',
      'المنهج كاملاً من الخلية إلى الجهاز العصبي — شرح مصوّر مع أسئلة الثانوية العامة السابقة.',
      280, $1, 'الصف الثالث الثانوي', true, false, 50,
      'https://images.unsplash.com/photo-1576086213369-97a306d36557?w=600&h=340&fit=crop')
    RETURNING id
  `, [T2]);

  const [c2b] = await q(`
    INSERT INTO courses
      (name, description, price, teacher_id, target_stage, is_published, is_free, points_on_complete, thumbnail_url)
    VALUES (
      'كيمياء الثاني الثانوي — التفاعلات والموازين',
      'كل أبواب الكيمياء للثاني الثانوي مع حل معادلات التفاعل وتمارين متنوعة المستوى.',
      220, $1, 'الصف الثاني الثانوي', true, false, 40,
      'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=600&h=340&fit=crop')
    RETURNING id
  `, [T2]);

  // أ/ كريم — عربي
  const [c3a] = await q(`
    INSERT INTO courses
      (name, description, price, teacher_id, target_stage, is_published, is_free, points_on_complete, thumbnail_url)
    VALUES (
      'لغة عربية الثالث الثانوي — النصوص والأدب',
      'شرح جميع النصوص والقصائد الأدبية مع نماذج الإجابة الكاملة المعتمدة للثانوية العامة.',
      200, $1, 'الصف الثالث الثانوي', true, false, 40,
      'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=600&h=340&fit=crop')
    RETURNING id
  `, [T3]);

  const [c3b] = await q(`
    INSERT INTO courses
      (name, description, price, teacher_id, target_stage, is_published, is_free, points_on_complete, thumbnail_url)
    VALUES (
      'قواعد اللغة العربية — النحو والصرف للثاني الثانوي',
      'مراجعة شاملة لقواعد النحو والصرف مع أمثلة تطبيقية وتمارين على كل قاعدة.',
      150, $1, 'الصف الثاني الثانوي', true, false, 30,
      'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?w=600&h=340&fit=crop')
    RETURNING id
  `, [T3]);

  console.log('  ✓ 7 كورسات');

  // ══════════════════════════════════════════════════════════
  // 5. الأقسام — والفيديوهات — والـ PDF
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الأقسام والمحتوى...');

  const addSec = async (courseId, title, order) => {
    const [s] = await q(
      `INSERT INTO sections (course_id, title, sort_order) VALUES ($1,$2,$3) RETURNING id`,
      [courseId, title, order]
    );
    return s.id;
  };
  const addVid = async (courseId, sectionId, title, url, mins, order) => {
    await q(
      `INSERT INTO videos (course_id, section_id, title, file_path_or_url, duration_minutes, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [courseId, sectionId, title, url, mins, order]
    );
  };
  const addPdf = async (courseId, sectionId, title, url) => {
    await q(
      `INSERT INTO pdf_files (course_id, section_id, title, file_url) VALUES ($1,$2,$3,$4)`,
      [courseId, sectionId, title, url]
    );
  };

  const YT1 = 'https://www.youtube.com/watch?v=NybHckSEQBI';
  const YT2 = 'https://www.youtube.com/watch?v=tNkZsRW7h2c';
  const YT3 = 'https://www.youtube.com/watch?v=VVn5OEucnQs';
  const PDF = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

  // ── c1a: رياضيات ثالث ثانوي ──
  const c1a_s1 = await addSec(c1a.id, 'الباب الأول — المعادلات والمتباينات', 1);
  const c1a_s2 = await addSec(c1a.id, 'الباب الثاني — المثلثات', 2);
  const c1a_s3 = await addSec(c1a.id, 'الباب الثالث — الدوال والرسوم البيانية', 3);
  await addVid(c1a.id, c1a_s1, 'مقدمة الجبر — حل المعادلات من الدرجة الأولى', YT1, 28, 1);
  await addVid(c1a.id, c1a_s1, 'المعادلات التربيعية وطرق الحل (العامل، المعادلة العامة)', YT2, 35, 2);
  await addVid(c1a.id, c1a_s1, 'المتباينات وتمثيلها على محور الأعداد', YT3, 22, 3);
  await addVid(c1a.id, c1a_s2, 'مقدمة المثلثات — النسب المثلثية الأساسية', YT1, 30, 1);
  await addVid(c1a.id, c1a_s2, 'النسب المثلثية للزوايا الخاصة وجدول القيم', YT2, 40, 2);
  await addVid(c1a.id, c1a_s2, 'قاعدة الجيب وقاعدة جيب التمام', YT3, 38, 3);
  await addVid(c1a.id, c1a_s3, 'الدوال الخطية والتربيعية — رسم البيان', YT1, 32, 1);
  await addPdf(c1a.id, c1a_s1, 'ملخص المعادلات والمتباينات PDF', PDF);
  await addPdf(c1a.id, c1a_s2, 'جدول النسب المثلثية + تدريبات محلولة', PDF);

  // ── c1b: رياضيات ثاني ثانوي ──
  const c1b_s1 = await addSec(c1b.id, 'الباب الأول — الإحداثيات والمسافة', 1);
  const c1b_s2 = await addSec(c1b.id, 'الباب الثاني — المستقيمات والأقواس', 2);
  await addVid(c1b.id, c1b_s1, 'مقدمة الهندسة التحليلية — نظام الإحداثيات', YT1, 25, 1);
  await addVid(c1b.id, c1b_s1, 'المسافة بين نقطتين وإيجاد منتصف القطعة', YT2, 30, 2);
  await addVid(c1b.id, c1b_s2, 'معادلة المستقيم — الميل وصور المعادلة', YT3, 35, 1);
  await addVid(c1b.id, c1b_s2, 'الدائرة — المعادلة والتطبيقات', YT1, 40, 2);
  await addPdf(c1b.id, c1b_s1, 'ملخص الإحداثيات وتمارين محلولة', PDF);

  // ── c1free: مقدمة مجانية ──
  const c1free_s1 = await addSec(c1free.id, 'الدرس التعريفي — أساسيات الجبر', 1);
  await addVid(c1free.id, c1free_s1, 'درس مجاني — الحساب الذهني وأساسيات الجبر', YT1, 20, 1);
  await addPdf(c1free.id, c1free_s1, 'خطة المنهج والجدول الزمني', PDF);

  // ── c2a: أحياء ثالث ثانوي ──
  const c2a_s1 = await addSec(c2a.id, 'الوحدة الأولى — الخلية والوراثة', 1);
  const c2a_s2 = await addSec(c2a.id, 'الوحدة الثانية — الجهاز العصبي والغدد', 2);
  const c2a_s3 = await addSec(c2a.id, 'الوحدة الثالثة — البيئة والتنوع الحيوي', 3);
  await addVid(c2a.id, c2a_s1, 'بنية الخلية ووظائف العضيات', YT1, 32, 1);
  await addVid(c2a.id, c2a_s1, 'الانقسام الخلوي المتساوي (Mitosis)', YT2, 38, 2);
  await addVid(c2a.id, c2a_s1, 'الانقسام الاختزالي (Meiosis) وأهميته', YT3, 35, 3);
  await addVid(c2a.id, c2a_s2, 'الجهاز العصبي — التشريح والوظيفة', YT1, 45, 1);
  await addVid(c2a.id, c2a_s2, 'الغدد الصماء والهرمونات', YT2, 30, 2);
  await addVid(c2a.id, c2a_s3, 'التنوع الحيوي والنظم البيئية', YT3, 28, 1);
  await addPdf(c2a.id, c2a_s1, 'ملخص الخلية والوراثة', PDF);
  await addPdf(c2a.id, c2a_s2, 'أسئلة الجهاز العصبي من امتحانات سابقة', PDF);

  // ── c2b: كيمياء ثاني ثانوي ──
  const c2b_s1 = await addSec(c2b.id, 'الوحدة الأولى — البنية الذرية والجدول الدوري', 1);
  const c2b_s2 = await addSec(c2b.id, 'الوحدة الثانية — التفاعلات الكيميائية', 2);
  await addVid(c2b.id, c2b_s1, 'البنية الذرية — البروتونات والنيوترونات والإلكترونات', YT1, 30, 1);
  await addVid(c2b.id, c2b_s1, 'الجدول الدوري وتصنيف العناصر', YT2, 35, 2);
  await addVid(c2b.id, c2b_s2, 'أنواع التفاعلات الكيميائية وموازنة المعادلات', YT3, 40, 1);
  await addVid(c2b.id, c2b_s2, 'الأحماض والقواعد وتفاعلات التعادل', YT1, 38, 2);
  await addPdf(c2b.id, c2b_s1, 'ملخص الجدول الدوري والبنية الذرية', PDF);

  // ── c3a: لغة عربية ثالث ثانوي ──
  const c3a_s1 = await addSec(c3a.id, 'النصوص الأدبية', 1);
  const c3a_s2 = await addSec(c3a.id, 'الأدب والنقد الأدبي', 2);
  await addVid(c3a.id, c3a_s1, 'شرح قصيدة المساء — إيليا أبو ماضي', YT1, 25, 1);
  await addVid(c3a.id, c3a_s1, 'شرح نص — من أدب الرافعي', YT2, 30, 2);
  await addVid(c3a.id, c3a_s1, 'شرح قصيدة النيل لحافظ إبراهيم', YT3, 28, 3);
  await addVid(c3a.id, c3a_s2, 'مدارس الشعر الحديث — الرومانسية والبعث', YT1, 35, 1);
  await addPdf(c3a.id, c3a_s1, 'نماذج إجابة النصوص الأدبية كاملة', PDF);
  await addPdf(c3a.id, c3a_s2, 'تحليل القصائد وأساليب النقد', PDF);

  // ── c3b: قواعد عربية ثاني ثانوي ──
  const c3b_s1 = await addSec(c3b.id, 'النحو — المرفوعات والمنصوبات', 1);
  const c3b_s2 = await addSec(c3b.id, 'الصرف — الاشتقاق والميزان الصرفي', 2);
  await addVid(c3b.id, c3b_s1, 'المبتدأ والخبر وأحكامهما', YT1, 22, 1);
  await addVid(c3b.id, c3b_s1, 'المفعول به — التعريف والأنواع والإعراب', YT2, 28, 2);
  await addVid(c3b.id, c3b_s1, 'الحال والتمييز — الفرق وقواعد الاستخدام', YT3, 25, 3);
  await addVid(c3b.id, c3b_s2, 'الاشتقاق والميزان الصرفي', YT1, 30, 1);
  await addPdf(c3b.id, c3b_s1, 'ملخص المرفوعات والمنصوبات', PDF);

  console.log('  ✓ الأقسام والفيديوهات والـ PDF تمت');

  // ══════════════════════════════════════════════════════════
  // 6. الامتحانات
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الامتحانات...');

  const now    = new Date();
  const past   = d => new Date(now.getTime() - d * 86400000).toISOString();
  const future = d => new Date(now.getTime() + d * 86400000).toISOString();

  // ── e1: امتحان الجبر (c1a — ث3 رياضيات) — انتهى ──
  // 10 أسئلة × 3 نقاط = 30 درجة كلية
  const [e1] = await q(`
    INSERT INTO exams
      (title, duration_minutes, total_score, pass_score, teacher_id, course_id,
       is_published, start_date, end_date, badge_name, badge_color,
       points_on_attempt, points_on_pass)
    VALUES ('امتحان الجبر — الوحدة الأولى', 45, 30, 15, $1, $2,
            true, $3, $4, 'نجم الجبر', '#f97316', 5, 15)
    RETURNING id
  `, [T1, c1a.id, past(14), past(7)]);

  // ── e2: مراجعة المثلثات (c1a — ث3 رياضيات) — جارٍ ──
  // 10 أسئلة × 5 نقاط = 50 درجة كلية
  const [e2] = await q(`
    INSERT INTO exams
      (title, duration_minutes, total_score, pass_score, teacher_id, course_id,
       is_published, start_date, end_date, badge_name, badge_color,
       points_on_attempt, points_on_pass)
    VALUES ('مراجعة المثلثات النهائية', 60, 50, 25, $1, $2,
            true, $3, $4, 'متفوق الرياضيات', '#7c3aed', 5, 20)
    RETURNING id
  `, [T1, c1a.id, past(3), future(4)]);

  // ── e3: اختبار الهندسة (c1b — ث2 رياضيات) — قادم ──
  // 10 أسئلة × 2 نقاط = 20 درجة كلية
  const [e3] = await q(`
    INSERT INTO exams
      (title, duration_minutes, total_score, pass_score, teacher_id, course_id,
       is_published, start_date, end_date,
       points_on_attempt, points_on_pass)
    VALUES ('اختبار الهندسة التحليلية', 30, 20, 10, $1, $2,
            true, $3, $4, 5, 10)
    RETURNING id
  `, [T1, c1b.id, future(3), future(10)]);

  // ── e4: امتحان الخلية (c2a — ث3 علوم) — انتهى ──
  // 5 أسئلة × 5 نقاط = 25 درجة كلية
  const [e4] = await q(`
    INSERT INTO exams
      (title, duration_minutes, total_score, pass_score, teacher_id, course_id,
       is_published, start_date, end_date, badge_name, badge_color,
       points_on_attempt, points_on_pass)
    VALUES ('امتحان الخلية والوراثة', 40, 25, 13, $1, $2,
            true, $3, $4, 'عالم الأحياء', '#10b981', 5, 15)
    RETURNING id
  `, [T2, c2a.id, past(10), past(3)]);

  // ── e5: اختبار الكيمياء (c2b — ث2 علوم) — قادم ──
  // 10 أسئلة × 2 نقاط = 20 درجة كلية
  const [e5] = await q(`
    INSERT INTO exams
      (title, duration_minutes, total_score, pass_score, teacher_id, course_id,
       is_published, start_date, end_date,
       points_on_attempt, points_on_pass)
    VALUES ('اختبار الكيمياء التمهيدي', 35, 20, 10, $1, $2,
            true, $3, $4, 5, 10)
    RETURNING id
  `, [T2, c2b.id, future(1), future(8)]);

  // ── e6: امتحان النصوص (c3a — ث3 عربي) — انتهى ──
  // 6 أسئلة × 5 نقاط = 30 درجة كلية
  const [e6] = await q(`
    INSERT INTO exams
      (title, duration_minutes, total_score, pass_score, teacher_id, course_id,
       is_published, start_date, end_date, badge_name, badge_color,
       points_on_attempt, points_on_pass)
    VALUES ('امتحان النصوص الأدبية', 50, 30, 15, $1, $2,
            true, $3, $4, 'أديب المنصة', '#f59e0b', 5, 15)
    RETURNING id
  `, [T3, c3a.id, past(5), past(1)]);

  // ══════════════════════════════════════════════════════════
  // 7. الأسئلة
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة أسئلة الامتحانات...');

  const addMCQ = async (examId, text, a, b, c, d, correct, pts) => {
    await q(`
      INSERT INTO questions
        (exam_id, question_text, option_a, option_b, option_c, option_d,
         correct_answer_letter, points, question_type)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'mcq')
    `, [examId, text, a, b, c, d, correct, pts]);
  };
  const addTF = async (examId, text, correct, pts) => {
    await q(`
      INSERT INTO questions
        (exam_id, question_text, option_a, option_b, option_c, option_d,
         correct_answer_letter, points, question_type)
      VALUES ($1,$2,'صح','خطأ',NULL,NULL,$3,$4,'true_false')
    `, [examId, text, correct, pts]);
  };

  // ── أسئلة e1 (جبر ث3) — 10 أسئلة × 3 = 30 ──
  await addMCQ(e1.id, 'حل المعادلة: 2x + 6 = 14', 'x = 3', 'x = 4', 'x = 5', 'x = 10', 'B', 3);
  await addMCQ(e1.id, 'إذا كان 3x − 9 = 0 فإن x =', '1', '2', '3', '9', 'C', 3);
  await addMCQ(e1.id, 'حل المعادلة التربيعية: x² − 5x + 6 = 0', 'x=1 أو x=6', 'x=2 أو x=3', 'x=−2 أو x=−3', 'x=0 أو x=5', 'B', 3);
  await addMCQ(e1.id, 'المتباينة x + 3 > 7 تعني', 'x > 4', 'x < 4', 'x = 4', 'x > 10', 'A', 3);
  await addMCQ(e1.id, 'الجذر الموجب لـ x² = 25', '√5', '5', '10', '25', 'B', 3);
  await addMCQ(e1.id, 'قيمة y في المعادلة y = 2x + 1 عند x = 3', '5', '7', '9', '3', 'B', 3);
  await addMCQ(e1.id, 'إذا كان f(x) = x² فإن f(4) =', '8', '12', '16', '4', 'C', 3);
  await addMCQ(e1.id, 'حل المتباينة 2x < 10', 'x < 5', 'x > 5', 'x = 5', 'x < 20', 'A', 3);
  await addTF (e1.id, 'العدد −3 يُعدّ حلاً للمعادلة x² = 9', 'T', 3);
  await addTF (e1.id, 'مجموع حلّي المعادلة x² − 5x + 6 = 0 يساوي 5', 'T', 3);

  // ── أسئلة e2 (مثلثات ث3) — 10 أسئلة × 5 = 50 ──
  await addMCQ(e2.id, 'sin(30°) =', '1/√2', '1/2', '√3/2', '1', 'B', 5);
  await addMCQ(e2.id, 'cos(60°) =', '√3/2', '1', '1/2', '0', 'C', 5);
  await addMCQ(e2.id, 'tan(45°) =', '0', '√2/2', '1', '√3', 'C', 5);
  await addMCQ(e2.id, 'قيمة sin(90°) =', '0', '√2/2', '1', '−1', 'C', 5);
  await addMCQ(e2.id, 'قيمة cos(0°) =', '0', '1', '−1', '1/2', 'B', 5);
  await addMCQ(e2.id, 'sin²(x) + cos²(x) =', '0', '1/2', '1', '2', 'C', 5);
  await addMCQ(e2.id, 'tan(θ) = sin(θ) ÷ ___', 'sin(θ)', 'tan(θ)', 'cos(θ)', 'sec(θ)', 'C', 5);
  await addMCQ(e2.id, 'الوتر في المثلث القائم هو', 'الضلع الأقصر', 'الضلع المقابل للزاوية القائمة', 'الضلع المجاور للزاوية الحادة', 'الضلع الأطول دائماً', 'B', 5);
  await addTF (e2.id, 'sin(60°) = cos(30°)', 'T', 5);
  await addTF (e2.id, 'tan(90°) قيمة غير محددة', 'T', 5);

  // ── أسئلة e3 (هندسة تحليلية ث2) — 10 أسئلة × 2 = 20 ──
  await addMCQ(e3.id, 'المسافة بين النقطتين (0,0) و (3,4) تساوي', '3', '4', '5', '7', 'C', 2);
  await addMCQ(e3.id, 'منتصف القطعة بين (2,4) و (6,8) هو', '(4,6)', '(3,5)', '(4,4)', '(8,12)', 'A', 2);
  await addMCQ(e3.id, 'ميل المستقيم العمودي على x=3', '0', 'غير معرّف', '3', '1/3', 'B', 2);
  await addMCQ(e3.id, 'معادلة المستقيم المار بـ (0,2) بميل 3', 'y = 3x', 'y = 3x + 2', 'y = 2x + 3', 'y = x + 3', 'B', 2);
  await addMCQ(e3.id, 'الدائرة ذات المركز (0,0) والنصف قطر 5، معادلتها', 'x² + y² = 5', 'x² + y² = 10', 'x² + y² = 25', 'x + y = 5', 'C', 2);
  await addMCQ(e3.id, 'ميل المستقيم المار بـ (1,2) و (3,6) يساوي', '1', '2', '3', '4', 'B', 2);
  await addTF (e3.id, 'الميل للمستقيم الموازي لمحور x يساوي صفراً', 'T', 2);
  await addTF (e3.id, 'المسافة بين (1,1) و (4,5) تساوي 5', 'T', 2);
  await addTF (e3.id, 'مركز الدائرة x² + y² = 16 هو (1,1)', 'F', 2);
  await addTF (e3.id, 'الميل للمستقيم العمودي على المحور الصادي هو صفر', 'F', 2);

  // ── أسئلة e4 (أحياء ث3) — 5 أسئلة × 5 = 25 ──
  await addMCQ(e4.id, 'الوحدة الأساسية للحياة هي', 'الذرة', 'الجزيء', 'الخلية', 'العضو', 'C', 5);
  await addMCQ(e4.id, 'الانقسام الذي ينتج خلايا تكاثر جنسي هو', 'الانقسام المتساوي', 'الانقسام الاختزالي', 'الانقسام اللاجنسي', 'الانقسام الثانوي', 'B', 5);
  await addMCQ(e4.id, 'مكان صنع البروتينات في الخلية', 'الريبوسوم', 'الميتوكندريا', 'جهاز جولجي', 'النواة', 'A', 5);
  await addMCQ(e4.id, 'عدد الكروموسومات في الخلية الجسدية البشرية', '23', '46', '48', '92', 'B', 5);
  await addMCQ(e4.id, 'الحمض النووي DNA يُوجد بشكل رئيسي في', 'السيتوبلازم', 'الغشاء الخلوي', 'النواة', 'الريبوسوم', 'C', 5);

  // ── أسئلة e5 (كيمياء ث2) — 10 أسئلة × 2 = 20 ──
  await addMCQ(e5.id, 'عدد البروتونات في ذرة الكربون (العدد الذري 6)', '3', '6', '12', '4', 'B', 2);
  await addMCQ(e5.id, 'العنصر الذي رمزه Na', 'النيتروجين', 'النيون', 'الصوديوم', 'النحاس', 'C', 2);
  await addMCQ(e5.id, 'ماذا ينتج عن تفاعل حمض + قاعدة', 'أكسيد + ماء', 'ملح + ماء', 'غاز + ملح', 'ماء فقط', 'B', 2);
  await addMCQ(e5.id, 'تصنيف التفاعل: 2H₂ + O₂ → 2H₂O', 'تحليل', 'إحلال', 'اتحاد مباشر', 'تأكسد واختزال فقط', 'C', 2);
  await addMCQ(e5.id, 'الأيون الموجب يُسمّى', 'أنيون', 'كاتيون', 'إلكترون', 'نيوترون', 'B', 2);
  await addTF (e5.id, 'الأكسجين عنصر غير فلزي', 'T', 2);
  await addTF (e5.id, 'الكتلة الذرية تساوي عدد البروتونات فقط', 'F', 2);
  await addTF (e5.id, 'يُحافظ قانون حفظ الكتلة على أن كتلة المتفاعلات = كتلة النواتج', 'T', 2);
  await addTF (e5.id, 'الأحماض لها قيمة pH أعلى من 7', 'F', 2);
  await addTF (e5.id, 'الحديد فلز يتفاعل مع الأكسجين لينتج الصدأ', 'T', 2);

  // ── أسئلة e6 (نصوص أدبية ث3 عربي) — 6 أسئلة × 5 = 30 ──
  await addMCQ(e6.id, 'من قائل قصيدة المساء؟', 'أحمد شوقي', 'إيليا أبو ماضي', 'المتنبي', 'نزار قباني', 'B', 5);
  await addMCQ(e6.id, 'المذهب الأدبي الذي ينتمي إليه إيليا أبو ماضي', 'الكلاسيكية', 'الرومانسية', 'الواقعية', 'الرمزية', 'B', 5);
  await addMCQ(e6.id, 'الفعل اللازم هو', 'الفعل الذي يتعدى إلى مفعول به', 'الفعل الذي لا يحتاج إلى مفعول به', 'الفعل الذي يأتي مع حرف جر دائماً', 'الفعل الذي يسبقه ضمير', 'B', 5);
  await addMCQ(e6.id, 'إعراب كلمة "الطالبُ" في "جاء الطالبُ"', 'مبتدأ', 'خبر', 'فاعل', 'مفعول به', 'C', 5);
  await addMCQ(e6.id, 'الجناس في البلاغة هو', 'تشابه المعاني', 'تشابه الألفاظ في النطق مع اختلاف المعنى', 'التضاد بين كلمتين', 'المبالغة في الوصف', 'B', 5);
  await addMCQ(e6.id, 'المفعول المطلق يأتي في الجملة', 'اسماً مشتقاً من الفعل نفسه', 'فعلاً مضارعاً', 'حرف جر ومجرور', 'صفةً للفاعل', 'A', 5);

  console.log('  ✓ 6 امتحانات مع أسئلتها');

  // ══════════════════════════════════════════════════════════
  // 8. التسجيل في الكورسات — بحسب المرحلة الدراسية حصراً
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  تسجيل الطلاب في الكورسات...');

  const enroll = async (studentId, courseId) => {
    await q(
      `INSERT INTO student_course_enrollment (student_id, course_id, status)
       VALUES ($1,$2,'active') ON CONFLICT (student_id, course_id) DO NOTHING`,
      [studentId, courseId]
    );
  };

  // أ/ محمد — c1a: ث3 فقط | c1b: ث2 فقط | c1free: ث2 فقط (نفس target_stage)
  for (const sid of S1_TH3) await enroll(sid, c1a.id);
  for (const sid of S1_TH2) await enroll(sid, c1b.id);
  for (const sid of S1_TH2) await enroll(sid, c1free.id); // مجاني، نفس مرحلة ث2

  // أ/ سارة — c2a: ث3 فقط | c2b: ث2 فقط | أول ثانوي لا يوجد لهم كورس حالياً
  for (const sid of S2_TH3) await enroll(sid, c2a.id);
  for (const sid of S2_TH2) await enroll(sid, c2b.id);

  // أ/ كريم — c3a: ث3 فقط | c3b: ث2 فقط | أول ثانوي لا يوجد لهم كورس حالياً
  for (const sid of S3_TH3) await enroll(sid, c3a.id);
  for (const sid of S3_TH2) await enroll(sid, c3b.id);

  console.log('  ✓ التسجيلات تمت — كل طالب في كورس مرحلته فقط');

  // ══════════════════════════════════════════════════════════
  // 9. طلبات الانضمام — للطلاب الذين لم يُسجَّلوا بعد
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة طلبات الانضمام...');

  // طلاب أول ثانوي (سارة وكريم) يطلبون الانضمام للكورسات المتاحة للثاني (ليس ث3)
  // هذا المنطقي: لا يمكنهم الانضمام لكورسات فوق مستواهم
  // لكن يمكنهم تقديم طلب للمعلم يوافق أو يرفض

  // طالب ث1 (علوم) يطلب انضمام c2b (ث2) — طلب pending
  await q(`
    INSERT INTO course_enrollment_requests (student_id, course_id, status, message)
    VALUES ($1,$2,'pending','أرغب في الانضمام مبكراً للاستعداد للسنة القادمة')
  `, [S2_TH1[0], c2b.id]);

  // طالب ث1 (عربي) يطلب انضمام c3b (ث2) — طلب pending
  await q(`
    INSERT INTO course_enrollment_requests (student_id, course_id, status, message)
    VALUES ($1,$2,'pending','سبق لي دراسة النحو وأريد التقدم')
  `, [S3_TH1[0], c3b.id]);

  // طالب ث2 (رياضيات) يطلب انضمام c1a (ث3) — مرفوض (مستوى أعلى)
  await q(`
    INSERT INTO course_enrollment_requests (student_id, course_id, status, message)
    VALUES ($1,$2,'rejected','أريد الاستعداد المبكر لمنهج الثالث')
  `, [S1_TH2[0], c1a.id]);

  console.log('  ✓ 3 طلبات انضمام');

  // ══════════════════════════════════════════════════════════
  // 10. نتائج الامتحانات — للامتحانات المنتهية فقط (e1, e4, e6)
  //     مع الطلاب المسجّلين في الكورس فقط
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة نتائج الامتحانات...');

  // e1 (جبر ث3) — 10 أسئلة × 3 = 30 — مسجّلون: S1_TH3 (5 طلاب)
  // سيناريوهات متنوعة: ناجح بامتياز / ناجح / راسب
  const e1Results = [
    // [studentId, score, correct, wrong, unanswered]
    [S1_TH3[0], 27, 9, 1, 0],  // علي — ناجح ممتاز
    [S1_TH3[1], 24, 8, 2, 0],  // فاطمة — ناجح
    [S1_TH3[2], 30, 10, 0, 0], // يوسف — كامل ← badge
    [S1_TH3[3], 15, 5, 5, 0],  // ندى — حد النجاح بالضبط
    [S1_TH3[4], 12, 4, 6, 0],  // عمر — راسب
  ];

  // e4 (أحياء ث3) — 5 أسئلة × 5 = 25 — مسجّلون: S2_TH3 (3 طلاب)
  const e4Results = [
    [S2_TH3[0], 20, 4, 1, 0], // هناء — ناجح
    [S2_TH3[1], 15, 3, 2, 0], // حسن — ناجح بالحد الأدنى
    [S2_TH3[2], 25, 5, 0, 0], // مريم — كامل ← badge
  ];

  // e6 (نصوص أدبية ث3 عربي) — 6 أسئلة × 5 = 30 — مسجّلون: S3_TH3 (2 طلاب)
  const e6Results = [
    [S3_TH3[0], 25, 5, 1, 0], // نور — ناجح ممتاز
    [S3_TH3[1], 15, 3, 3, 0], // ياسمين — حد النجاح
  ];

  const insertResults = async (results, examId, pointsOnAttempt, pointsOnPass, passScore) => {
    for (const [sid, score, correct, wrong, unanswered] of results) {
      const passed = score >= passScore;
      const pointsEarned = pointsOnAttempt + (passed ? pointsOnPass : 0);
      await q(`
        INSERT INTO exam_results
          (student_id, exam_id, score, correct_count, wrong_count, unanswered_count,
           start_time, end_time, points_earned, essay_graded)
        VALUES ($1,$2,$3,$4,$5,$6,
                NOW() - INTERVAL '3 hours',
                NOW() - INTERVAL '2 hours',
                $7, true)
      `, [sid, examId, score, correct, wrong, unanswered, pointsEarned]);
    }
  };

  await insertResults(e1Results, e1.id, 5, 15, 15);
  await insertResults(e4Results, e4.id, 5, 15, 13);
  await insertResults(e6Results, e6.id, 5, 15, 15);

  console.log('  ✓ نتائج الامتحانات تمت');

  // ══════════════════════════════════════════════════════════
  // 11. الشارات — للمتفوقين (درجة كاملة)
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الشارات...');

  await q(`INSERT INTO badges (student_id, exam_id, badge_name, badge_color) VALUES ($1,$2,'نجم الجبر','#f97316')`, [S1_TH3[2], e1.id]);
  await q(`INSERT INTO badges (student_id, exam_id, badge_name, badge_color) VALUES ($1,$2,'عالم الأحياء','#10b981')`, [S2_TH3[2], e4.id]);
  await q(`INSERT INTO badges (student_id, exam_id, badge_name, badge_color) VALUES ($1,$2,'أديب المنصة','#f59e0b')`, [S3_TH3[0], e6.id]);

  console.log('  ✓ 3 شارات');

  // ══════════════════════════════════════════════════════════
  // 12. المدفوعات — للكورسات المدفوعة فقط، للطلاب المسجّلين
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة المدفوعات...');

  const paymentsData = [
    // c1a (250 جنيه) — طلاب ث3 رياضيات
    [S1_TH3[0], c1a.id, 250, 'instapay',       'verified'],
    [S1_TH3[1], c1a.id, 250, 'vodafone_cash',   'verified'],
    [S1_TH3[2], c1a.id, 250, 'instapay',       'verified'],
    [S1_TH3[3], c1a.id, 250, 'fawry',           'pending'],  // لم يُتحقق بعد
    [S1_TH3[4], c1a.id, 250, 'vodafone_cash',   'verified'],
    // c1b (200 جنيه) — طلاب ث2 رياضيات
    [S1_TH2[0], c1b.id, 200, 'vodafone_cash',   'verified'],
    [S1_TH2[1], c1b.id, 200, 'instapay',       'verified'],
    [S1_TH2[2], c1b.id, 200, 'fawry',           'pending'],
    [S1_TH2[3], c1b.id, 200, 'instapay',       'verified'],
    // c2a (280 جنيه) — طلاب ث3 علوم
    [S2_TH3[0], c2a.id, 280, 'instapay',       'verified'],
    [S2_TH3[1], c2a.id, 280, 'vodafone_cash',   'verified'],
    [S2_TH3[2], c2a.id, 280, 'instapay',       'verified'],
    // c2b (220 جنيه) — طلاب ث2 علوم
    [S2_TH2[0], c2b.id, 220, 'vodafone_cash',   'verified'],
    [S2_TH2[1], c2b.id, 220, 'instapay',       'pending'],
    [S2_TH2[2], c2b.id, 220, 'fawry',           'verified'],
    // c3a (200 جنيه) — طلاب ث3 عربي
    [S3_TH3[0], c3a.id, 200, 'vodafone_cash',   'verified'],
    [S3_TH3[1], c3a.id, 200, 'instapay',       'verified'],
    // c3b (150 جنيه) — طلاب ث2 عربي
    [S3_TH2[0], c3b.id, 150, 'vodafone_cash',   'verified'],
    [S3_TH2[1], c3b.id, 150, 'instapay',       'verified'],
  ];

  for (const [sid, cid, amount, method, status] of paymentsData) {
    const ref = `REF${Math.floor(Math.random() * 900000 + 100000)}`;
    await q(`
      INSERT INTO payments (student_id, course_id, amount, method, status, reference_number)
      VALUES ($1,$2,$3,$4,$5,$6)
    `, [sid, cid, amount, method, status, ref]);
  }
  console.log(`  ✓ ${paymentsData.length} عملية دفع`);

  // ══════════════════════════════════════════════════════════
  // 13. تقدم الفيديو — للطلاب المسجّلين فقط
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة تقدم الفيديو...');

  // جلب الفيديوهات حسب كورسها
  const fetchVids = async (courseId) =>
    await q(`SELECT id, duration_minutes FROM videos WHERE course_id=$1 ORDER BY sort_order`, [courseId]);

  const c1aVids = await fetchVids(c1a.id);
  const c1bVids = await fetchVids(c1b.id);
  const c2aVids = await fetchVids(c2a.id);
  const c2bVids = await fetchVids(c2b.id);
  const c3aVids = await fetchVids(c3a.id);
  const c3bVids = await fetchVids(c3b.id);

  const setProgress = async (studentId, vid, pct) => {
    if (!vid) return;
    const watched = Math.floor(vid.duration_minutes * pct / 100);
    const actualSecs = watched * 60;
    await q(`
      INSERT INTO video_progress
        (student_id, video_id, progress_percentage, watched_minutes, watch_count,
         actual_watched_seconds, last_watched_at)
      VALUES ($1,$2,$3,$4,1,$5, NOW() - INTERVAL '1 day')
      ON CONFLICT (student_id, video_id) DO NOTHING
    `, [studentId, vid.id, pct, watched, actualSecs]);
  };

  // S1_TH3 — مشاهدة c1a
  await setProgress(S1_TH3[0], c1aVids[0], 100);
  await setProgress(S1_TH3[0], c1aVids[1], 80);
  await setProgress(S1_TH3[0], c1aVids[2], 50);
  await setProgress(S1_TH3[1], c1aVids[0], 100);
  await setProgress(S1_TH3[1], c1aVids[1], 55);
  await setProgress(S1_TH3[2], c1aVids[0], 100);
  await setProgress(S1_TH3[2], c1aVids[1], 100);
  await setProgress(S1_TH3[2], c1aVids[2], 100);
  await setProgress(S1_TH3[2], c1aVids[3], 70);
  await setProgress(S1_TH3[3], c1aVids[0], 60);
  await setProgress(S1_TH3[4], c1aVids[0], 40);

  // S1_TH2 — مشاهدة c1b
  await setProgress(S1_TH2[0], c1bVids[0], 100);
  await setProgress(S1_TH2[0], c1bVids[1], 80);
  await setProgress(S1_TH2[1], c1bVids[0], 65);
  await setProgress(S1_TH2[2], c1bVids[0], 30);
  await setProgress(S1_TH2[3], c1bVids[0], 100);
  await setProgress(S1_TH2[3], c1bVids[1], 100);

  // S2_TH3 — مشاهدة c2a
  await setProgress(S2_TH3[0], c2aVids[0], 100);
  await setProgress(S2_TH3[0], c2aVids[1], 90);
  await setProgress(S2_TH3[1], c2aVids[0], 75);
  await setProgress(S2_TH3[2], c2aVids[0], 100);
  await setProgress(S2_TH3[2], c2aVids[1], 100);
  await setProgress(S2_TH3[2], c2aVids[2], 60);

  // S2_TH2 — مشاهدة c2b
  await setProgress(S2_TH2[0], c2bVids[0], 100);
  await setProgress(S2_TH2[1], c2bVids[0], 45);
  await setProgress(S2_TH2[2], c2bVids[0], 80);

  // S3_TH3 — مشاهدة c3a
  await setProgress(S3_TH3[0], c3aVids[0], 100);
  await setProgress(S3_TH3[0], c3aVids[1], 100);
  await setProgress(S3_TH3[0], c3aVids[2], 50);
  await setProgress(S3_TH3[1], c3aVids[0], 70);

  // S3_TH2 — مشاهدة c3b
  await setProgress(S3_TH2[0], c3bVids[0], 100);
  await setProgress(S3_TH2[1], c3bVids[0], 55);

  console.log('  ✓ تقدم الفيديو تم');

  // ══════════════════════════════════════════════════════════
  // 14. طلبات إعادة الامتحان
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة طلبات إعادة الامتحان...');

  // عمر (راسب في e1) — يطلب إعادة
  await q(`
    INSERT INTO exam_retry_requests (student_id, exam_id, status, message)
    VALUES ($1,$2,'pending','لم أتمكن من التركيز بسبب ظرف طارئ، أرجو الإذن بالإعادة')
  `, [S1_TH3[4], e1.id]);

  // ندى (نجحت بالحد الأدنى في e1) — تطلب إعادة لتحسين الدرجة
  await q(`
    INSERT INTO exam_retry_requests (student_id, exam_id, status, message, teacher_note, handled_at)
    VALUES ($1,$2,'accepted','أريد تحسين درجتي','تمت الموافقة، الامتحان متاح لمدة 3 أيام', NOW())
  `, [S1_TH3[3], e1.id]);

  console.log('  ✓ 2 طلبات إعادة امتحان');

  // ══════════════════════════════════════════════════════════
  // 15. الإشعارات
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الإشعارات...');

  const notifs = [
    [T1, S1_TH3[0], 'مرحباً بك', 'أهلاً بك في أكاديمية محمد للرياضيات! نتمنى لك تجربة تعليمية مميزة.', 'general'],
    [T1, S1_TH3[2], 'نتيجة ممتازة', 'أحسنت! حصلت على الدرجة الكاملة 30/30 في امتحان الجبر 🎉', 'exam_result'],
    [T1, S1_TH3[4], 'تذكير بالامتحان', 'لا تفوّت امتحان مراجعة المثلثات — ينتهي بعد 4 أيام!', 'new_exam'],
    [T1, S1_TH2[0], 'كورس جديد', 'تم إضافة محتوى جديد لكورس الهندسة التحليلية — اطّلع عليه الآن.', 'general'],
    [T2, S2_TH3[0], 'مرحباً بك', 'أهلاً في منصة سارة للعلوم! ابدأ بمشاهدة الدروس الأولى.', 'general'],
    [T2, S2_TH3[2], 'نتيجة ممتازة', 'ممتاز! حصلت على 25/25 في امتحان الخلية والوراثة 🌟', 'exam_result'],
    [T2, S2_TH2[0], 'تذكير', 'اختبار الكيمياء سيبدأ غداً — راجع الوحدة الثانية جيداً.', 'new_exam'],
    [T3, S3_TH3[0], 'مرحباً بك', 'أهلاً في مركز كريم للغة العربية! نتمنى لك التوفيق.', 'general'],
    [T3, S3_TH3[0], 'نتيجة', 'حصلت على 25/30 في امتحان النصوص الأدبية — أداء جيد جداً.', 'exam_result'],
  ];

  for (const [tid, sid, title, message, type] of notifs) {
    await q(`
      INSERT INTO notification_log
        (teacher_id, student_id, title, message, type, source)
      VALUES ($1,$2,$3,$4,$5,'platform')
    `, [tid, sid, title, message, type]);
  }
  console.log(`  ✓ ${notifs.length} إشعارات`);

  // ══════════════════════════════════════════════════════════
  // 16. سجل النشاط — activity_logs
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة سجل النشاط...');

  // جلب IDs المساعدين
  const [asstNour]  = await q(`SELECT id, name FROM assistants WHERE username='asst_nour'`);
  const [asstKarim] = await q(`SELECT id, name FROM assistants WHERE username='asst_karim'`);
  const [asstDina]  = await q(`SELECT id, name FROM assistants WHERE username='asst_dina'`);
  const [asstYara]  = await q(`SELECT id, name FROM assistants WHERE username='asst_yara'`);

  // جلب أسماء الطلاب
  const fetchStudent = async (username) => {
    const [s] = await q(`SELECT id, name FROM students WHERE username=$1`, [username]);
    return s;
  };
  const stdAli     = await fetchStudent('std_ali');
  const stdFatma   = await fetchStudent('std_fatma');
  const stdYoussef = await fetchStudent('std_youssef');
  const stdNada    = await fetchStudent('std_nada');
  const stdOmar    = await fetchStudent('std_omar');
  const stdMostafa = await fetchStudent('std_mostafa');
  const sciHana    = await fetchStudent('sci_hana');
  const sciHassan  = await fetchStudent('sci_hassan');
  const araNourd   = await fetchStudent('ara_nour');

  const logAct = async (teacherId, actorType, actorId, actorName, action,
                        entityType, entityId, entityName, details, daysAgo, hoursAgo = 0) => {
    const ts = new Date(now.getTime() - daysAgo * 86400000 - hoursAgo * 3600000);
    await q(
      `INSERT INTO activity_logs
         (teacher_id, actor_type, actor_id, actor_name, action,
          entity_type, entity_id, entity_name, details, ip_address, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'196.220.10.15',$10)`,
      [
        teacherId, actorType, actorId, actorName, action,
        entityType, entityId ? String(entityId) : null, entityName,
        details ? JSON.stringify(details) : null,
        ts.toISOString(),
      ]
    );
  };

  const T = 'teacher';
  const A = 'assistant';

  // ── أ/ محمد (T1) — سجل نشاط 30 يوماً ──────────────────────
  // إنشاء الكورسات
  await logAct(T1, T, T1, 'أ/ محمد عبد الرحمن', 'create_course',
    'course', c1a.id, 'رياضيات الثالث الثانوي — الجبر والمثلثات',
    { price: 250, stage: 'الصف الثالث الثانوي' }, 28, 9);
  await logAct(T1, T, T1, 'أ/ محمد عبد الرحمن', 'create_course',
    'course', c1b.id, 'رياضيات الثاني الثانوي — الهندسة التحليلية',
    { price: 200, stage: 'الصف الثاني الثانوي' }, 27, 14);
  await logAct(T1, T, T1, 'أ/ محمد عبد الرحمن', 'create_course',
    'course', c1free.id, 'مقدمة مجانية — أساسيات الجبر للثانوية',
    { price: 0, is_free: true }, 26, 10);

  // نشر الكورسات
  await logAct(T1, T, T1, 'أ/ محمد عبد الرحمن', 'publish_course',
    'course', c1a.id, 'رياضيات الثالث الثانوي — الجبر والمثلثات',
    { is_published: true }, 25, 8);

  // إضافة الطلاب (معلم بنفسه)
  await logAct(T1, T, T1, 'أ/ محمد عبد الرحمن', 'add_student',
    'student', stdAli.id, stdAli.name, { stage: 'الصف الثالث الثانوي' }, 25, 7);
  await logAct(T1, T, T1, 'أ/ محمد عبد الرحمن', 'add_student',
    'student', stdFatma.id, stdFatma.name, { stage: 'الصف الثالث الثانوي' }, 25, 6);
  await logAct(T1, T, T1, 'أ/ محمد عبد الرحمن', 'add_student',
    'student', stdYoussef.id, stdYoussef.name, { stage: 'الصف الثالث الثانوي' }, 25, 5);

  // المساعد نور يضيف طلاب
  await logAct(T1, A, asstNour.id, asstNour.name, 'add_student',
    'student', stdNada.id, stdNada.name, { stage: 'الصف الثالث الثانوي' }, 24, 11);
  await logAct(T1, A, asstNour.id, asstNour.name, 'add_student',
    'student', stdOmar.id, stdOmar.name, { stage: 'الصف الثالث الثانوي' }, 24, 10);
  await logAct(T1, A, asstNour.id, asstNour.name, 'add_student',
    'student', stdMostafa.id, stdMostafa.name, { stage: 'الصف الثاني الثانوي' }, 24, 9);

  // المساعد كريم يتحقق من المدفوعات
  await logAct(T1, A, asstKarim.id, asstKarim.name, 'verify_payment',
    'payment', null, stdAli.name,
    { amount: 250, method: 'instapay', status: 'verified' }, 22, 13);
  await logAct(T1, A, asstKarim.id, asstKarim.name, 'verify_payment',
    'payment', null, stdFatma.name,
    { amount: 250, method: 'vodafone_cash', status: 'verified' }, 22, 12);
  await logAct(T1, A, asstKarim.id, asstKarim.name, 'verify_payment',
    'payment', null, stdYoussef.name,
    { amount: 250, method: 'instapay', status: 'verified' }, 21, 9);

  // إنشاء الامتحانات
  await logAct(T1, T, T1, 'أ/ محمد عبد الرحمن', 'create_exam',
    'exam', e1.id, 'امتحان الجبر — الوحدة الأولى',
    { total_score: 30, duration: 45 }, 20, 10);
  await logAct(T1, T, T1, 'أ/ محمد عبد الرحمن', 'publish_exam',
    'exam', e1.id, 'امتحان الجبر — الوحدة الأولى',
    { is_published: true }, 20, 9);
  await logAct(T1, T, T1, 'أ/ محمد عبد الرحمن', 'create_exam',
    'exam', e2.id, 'مراجعة المثلثات النهائية',
    { total_score: 50, duration: 60 }, 15, 11);
  await logAct(T1, T, T1, 'أ/ محمد عبد الرحمن', 'publish_exam',
    'exam', e2.id, 'مراجعة المثلثات النهائية',
    { is_published: true }, 15, 10);

  // المساعد نور ينشئ امتحان الهندسة
  await logAct(T1, A, asstNour.id, asstNour.name, 'create_exam',
    'exam', e3.id, 'اختبار الهندسة التحليلية',
    { total_score: 20, duration: 30 }, 10, 14);

  // الموافقة على إعادة الامتحان
  await logAct(T1, T, T1, 'أ/ محمد عبد الرحمن', 'approve_retry',
    'exam', e1.id, 'امتحان الجبر — الوحدة الأولى',
    { student: stdNada.name, decision: 'accepted' }, 7, 8);

  // تعديل بيانات طالب
  await logAct(T1, A, asstNour.id, asstNour.name, 'edit_student',
    'student', stdOmar.id, stdOmar.name,
    { changed: ['phone', 'parent_phone'] }, 5, 11);

  // إرسال إشعارات
  await logAct(T1, T, T1, 'أ/ محمد عبد الرحمن', 'send_notification',
    'student', null, 'طلاب الثالث الثانوي',
    { title: 'تذكير بالامتحان', recipients: 5 }, 4, 9);
  await logAct(T1, A, asstNour.id, asstNour.name, 'send_notification',
    'student', null, 'طلاب الثاني الثانوي',
    { title: 'كورس جديد', recipients: 4 }, 2, 15);

  // تعديل الكورس
  await logAct(T1, T, T1, 'أ/ محمد عبد الرحمن', 'edit_course',
    'course', c1a.id, 'رياضيات الثالث الثانوي — الجبر والمثلثات',
    { changed: ['description'] }, 3, 10);

  // تحقق من دفعة (معلم نفسه)
  await logAct(T1, T, T1, 'أ/ محمد عبد الرحمن', 'verify_payment',
    'payment', null, stdNada.name,
    { amount: 250, method: 'fawry', status: 'pending→verified' }, 1, 7);

  // ── أ/ سارة (T2) — سجل نشاط ──────────────────────────────
  await logAct(T2, T, T2, 'أ/ سارة خالد الحسيني', 'create_course',
    'course', c2a.id, 'أحياء الثالث الثانوي — الشامل',
    { price: 280, stage: 'الصف الثالث الثانوي' }, 29, 10);
  await logAct(T2, T, T2, 'أ/ سارة خالد الحسيني', 'create_course',
    'course', c2b.id, 'كيمياء الثاني الثانوي — التفاعلات والموازين',
    { price: 220, stage: 'الصف الثاني الثانوي' }, 29, 8);
  await logAct(T2, T, T2, 'أ/ سارة خالد الحسيني', 'publish_course',
    'course', c2a.id, 'أحياء الثالث الثانوي — الشامل',
    { is_published: true }, 28, 9);

  await logAct(T2, T, T2, 'أ/ سارة خالد الحسيني', 'add_student',
    'student', sciHana.id, sciHana.name,
    { stage: 'الصف الثالث الثانوي' }, 27, 11);
  await logAct(T2, T, T2, 'أ/ سارة خالد الحسيني', 'add_student',
    'student', sciHassan.id, sciHassan.name,
    { stage: 'الصف الثالث الثانوي' }, 27, 10);

  await logAct(T2, A, asstDina.id, asstDina.name, 'add_student',
    'student', null, 'sci_mona — منى رامي',
    { stage: 'الصف الثاني الثانوي' }, 26, 14);
  await logAct(T2, A, asstDina.id, asstDina.name, 'verify_payment',
    'payment', null, sciHana.name,
    { amount: 280, method: 'instapay', status: 'verified' }, 23, 9);

  await logAct(T2, T, T2, 'أ/ سارة خالد الحسيني', 'create_exam',
    'exam', e4.id, 'امتحان الخلية والوراثة',
    { total_score: 25, duration: 40 }, 18, 12);
  await logAct(T2, T, T2, 'أ/ سارة خالد الحسيني', 'publish_exam',
    'exam', e4.id, 'امتحان الخلية والوراثة',
    { is_published: true }, 18, 11);
  await logAct(T2, A, asstDina.id, asstDina.name, 'create_exam',
    'exam', e5.id, 'اختبار الكيمياء التمهيدي',
    { total_score: 20, duration: 35 }, 12, 13);

  await logAct(T2, T, T2, 'أ/ سارة خالد الحسيني', 'send_notification',
    'student', null, 'طلاب الثالث الثانوي',
    { title: 'نتيجة ممتازة', recipients: 3 }, 3, 8);
  await logAct(T2, A, asstDina.id, asstDina.name, 'send_notification',
    'student', null, 'طلاب الثاني الثانوي',
    { title: 'تذكير اختبار الكيمياء', recipients: 3 }, 1, 10);

  // ── أ/ كريم (T3) — سجل نشاط ──────────────────────────────
  await logAct(T3, T, T3, 'أ/ كريم الشافعي', 'create_course',
    'course', c3a.id, 'لغة عربية الثالث الثانوي — النصوص والأدب',
    { price: 200, stage: 'الصف الثالث الثانوي' }, 30, 11);
  await logAct(T3, T, T3, 'أ/ كريم الشافعي', 'create_course',
    'course', c3b.id, 'قواعد اللغة العربية — النحو والصرف للثاني الثانوي',
    { price: 150, stage: 'الصف الثاني الثانوي' }, 30, 9);
  await logAct(T3, T, T3, 'أ/ كريم الشافعي', 'publish_course',
    'course', c3a.id, 'لغة عربية الثالث الثانوي — النصوص والأدب',
    { is_published: true }, 29, 10);
  await logAct(T3, T, T3, 'أ/ كريم الشافعي', 'publish_course',
    'course', c3b.id, 'قواعد اللغة العربية — النحو والصرف للثاني الثانوي',
    { is_published: true }, 29, 8);

  await logAct(T3, T, T3, 'أ/ كريم الشافعي', 'add_student',
    'student', araNourd.id, araNourd.name,
    { stage: 'الصف الثالث الثانوي' }, 28, 12);

  await logAct(T3, A, asstYara.id, asstYara.name, 'add_student',
    'student', null, 'ara_yasmin — ياسمين رأفت',
    { stage: 'الصف الثالث الثانوي' }, 27, 14);
  await logAct(T3, A, asstYara.id, asstYara.name, 'add_student',
    'student', null, 'ara_tarek — طارق ماهر',
    { stage: 'الصف الثاني الثانوي' }, 27, 13);

  await logAct(T3, T, T3, 'أ/ كريم الشافعي', 'create_exam',
    'exam', e6.id, 'امتحان النصوص الأدبية',
    { total_score: 30, duration: 50 }, 20, 10);
  await logAct(T3, T, T3, 'أ/ كريم الشافعي', 'publish_exam',
    'exam', e6.id, 'امتحان النصوص الأدبية',
    { is_published: true }, 20, 9);

  await logAct(T3, T, T3, 'أ/ كريم الشافعي', 'verify_payment',
    'payment', null, araNourd.name,
    { amount: 200, method: 'vodafone_cash', status: 'verified' }, 16, 11);

  await logAct(T3, T, T3, 'أ/ كريم الشافعي', 'create_assistant',
    'assistant', asstYara.id, asstYara.name,
    { permissions: ['can_add_students', 'can_view_analytics'] }, 25, 15);
  await logAct(T3, T, T3, 'أ/ كريم الشافعي', 'edit_course',
    'course', c3a.id, 'لغة عربية الثالث الثانوي — النصوص والأدب',
    { changed: ['description', 'thumbnail_url'] }, 8, 9);
  await logAct(T3, T, T3, 'أ/ كريم الشافعي', 'send_notification',
    'student', null, 'طلاب الثالث الثانوي',
    { title: 'نتيجة امتحان النصوص', recipients: 2 }, 1, 12);

  const totalLogs = await q(`SELECT COUNT(*) FROM activity_logs`);
  console.log(`  ✓ ${totalLogs[0].count} سجل نشاط`);

  // ══════════════════════════════════════════════════════════
  // 17. متتبّع إعادة ضبط المتصدرين
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة متتبّع المتصدرين...');

  for (const tid of [T1, T2, T3]) {
    await q(`
      INSERT INTO leaderboard_reset_tracker (teacher_id, last_reset_at, next_reset_at)
      VALUES ($1, NOW(), NOW() + INTERVAL '30 days')
      ON CONFLICT (teacher_id) DO NOTHING
    `, [tid]);
  }
  console.log('  ✓ متتبّع المتصدرين للمدرسين الثلاثة');

  // ══════════════════════════════════════════════════════════
  // ملخص نهائي
  // ══════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ✅ البيانات التجريبية اكتملت بنجاح!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n  🔑 بيانات تسجيل الدخول:');
  console.log('  ┌─────────────────────────────────────────────────────────────┐');
  console.log('  │  المعلم الأول — أكاديمية محمد للرياضيات                    │');
  console.log('  │  دخول معلم:    admin / admin123                             │');
  console.log('  │  دخول مساعد:   asst_nour / 123456                          │');
  console.log('  │  طالب ث3:      std_ali / 123456  (درجات: 780)              │');
  console.log('  │  طالب ث2:      std_mostafa / 123456 (درجات: 340)           │');
  console.log('  ├─────────────────────────────────────────────────────────────┤');
  console.log('  │  المعلمة الثانية — منصة سارة للعلوم                        │');
  console.log('  │  دخول معلم:    ms_sara / 123456                             │');
  console.log('  │  دخول مساعد:   asst_dina / 123456                          │');
  console.log('  │  طالبة ث3:     sci_hana / 123456  (درجات: 690)             │');
  console.log('  │  طالب ث2:      sci_mona / 123456  (درجات: 280)             │');
  console.log('  ├─────────────────────────────────────────────────────────────┤');
  console.log('  │  المعلم الثالث — مركز كريم للغة العربية                    │');
  console.log('  │  دخول معلم:    mr_karim / 123456                            │');
  console.log('  │  دخول مساعد:   asst_yara / 123456                          │');
  console.log('  │  طالب ث3:      ara_nour / 123456  (درجات: 320)             │');
  console.log('  │  طالب ث2:      ara_tarek / 123456 (درجات: 175)             │');
  console.log('  └─────────────────────────────────────────────────────────────┘');
  console.log('\n  📌 ملاحظات المنطق:');
  console.log('  • طلاب ث3 ← مسجّلون في كورسات ث3 فقط');
  console.log('  • طلاب ث2 ← مسجّلون في كورسات ث2 فقط');
  console.log('  • طلاب ث1 ← لا كورسات متاحة لهم حالياً (طلبات انضمام فقط)');
  console.log('  • نتائج الامتحانات: فقط للامتحانات المنتهية (e1, e4, e6)');
  console.log('  • الدرجات: مجموع الصح × نقاط/سؤال = الدرجة الكلية\n');

  await pool.end();
}

seed().catch(err => {
  console.error('\n❌ خطأ:', err.message);
  console.error(err.stack);
  pool.end();
  process.exit(1);
});
