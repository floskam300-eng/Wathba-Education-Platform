/**
 * WATHBA — Seed File (شامل ومركّز)
 * ─────────────────────────────────────────────────────────────────
 * الحسابات المحورية الثلاثة:
 *   🎓 المعلم    : admin / admin123   — أكاديمية محمد للرياضيات
 *   🧑‍💼 المساعد  : asst_nour / 123456 — صلاحيات كاملة
 *   🎒 الطالب   : std_ali / 123456   — يغطي كل سيناريوهات الطالب
 *
 * تشغيل: node server/db/seed.js
 * ─────────────────────────────────────────────────────────────────
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
  console.log('  🌱 WATHBA — بيانات تجريبية شاملة (3 حسابات محورية)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ══════════════════════════════════════════════════════════
  // 0. مسح البيانات القديمة
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  مسح البيانات القديمة...');
  const tables = [
    'activity_logs', 'game_session_tokens', 'student_devices',
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
    try { await q(`DELETE FROM ${t}`); } catch (_) {}
  }
  await q(`DELETE FROM teachers WHERE username != 'admin'`);
  console.log('  ✓ تم مسح كل البيانات');

  const pass6  = await bcrypt.hash('123456', 10);
  const passAd = await bcrypt.hash('admin123', 10);

  // تواريخ مساعدة
  const now    = new Date();
  const past   = d => new Date(now.getTime() - d * 86400000).toISOString();
  const future = d => new Date(now.getTime() + d * 86400000).toISOString();
  const pastH  = h => new Date(now.getTime() - h * 3600000).toISOString();

  // ══════════════════════════════════════════════════════════
  // 1. المعلم الرئيسي (admin) — يُنشأ أو يُحدَّث
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إعداد المعلم الرئيسي...');
  let [adminRow] = await q(`SELECT id FROM teachers WHERE username='admin'`);
  if (!adminRow) {
    [adminRow] = await q(`
      INSERT INTO teachers
        (username,password,name,bio,classification,whatsapp_phone,slug,platform_name,logo_url,photo_url)
      VALUES ('admin',$1,
        'أ/ محمد عبد الرحمن',
        'معلم رياضيات بخبرة 20 عاماً متخصص في الثانوية العامة. نجح على يديه أكثر من 4000 طالب وحقق طلابه نسب نجاح تتجاوز 95٪.',
        'مدرس رياضيات — ثانوية عامة',
        '+201000000000','admin','أكاديمية محمد للرياضيات',
        'https://ui-avatars.com/api/?name=MA&background=f97316&color=fff&size=256&bold=true',
        'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=300&h=300&fit=crop')
      RETURNING id
    `, [passAd]);
  } else {
    await q(`
      UPDATE teachers SET
        password=$2, name='أ/ محمد عبد الرحمن',
        bio='معلم رياضيات بخبرة 20 عاماً متخصص في الثانوية العامة. نجح على يديه أكثر من 4000 طالب وحقق طلابه نسب نجاح تتجاوز 95٪.',
        classification='مدرس رياضيات — ثانوية عامة',
        whatsapp_phone='+201000000000', slug='admin',
        platform_name='أكاديمية محمد للرياضيات',
        logo_url='https://ui-avatars.com/api/?name=MA&background=f97316&color=fff&size=256&bold=true',
        photo_url='https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=300&h=300&fit=crop'
      WHERE id=$1
    `, [adminRow.id, passAd]);
  }
  const T1 = adminRow.id;
  console.log(`  ✓ admin (id=${T1}) — أكاديمية محمد للرياضيات`);

  // ══════════════════════════════════════════════════════════
  // 2. المساعدون — محوري: asst_nour (صلاحيات كاملة)
  //    + 2 مساعدين إضافيين بصلاحيات مختلفة لإظهار التنوع
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة المساعدين...');
  await q(`
    INSERT INTO assistants
      (username,password,name,phone,teacher_id,
       can_add_students,can_edit_students,can_delete_students,
       can_manage_exams,can_view_analytics,can_send_reports,
       can_manage_payments,can_manage_courses,can_send_notifications)
    VALUES
      -- asst_nour: صلاحيات كاملة (الحساب المحوري للمساعد)
      ('asst_nour','${await bcrypt.hash('123456',10)}','نور أحمد حسين','+201111111101',$1,
       true,true,true,true,true,true,true,true,true),
      -- asst_karim: صلاحيات جزئية (يرى الطلاب والمدفوعات فقط)
      ('asst_karim','${await bcrypt.hash('123456',10)}','كريم محمود إبراهيم','+201111111102',$1,
       true,true,false,false,true,false,true,false,false),
      -- asst_dina: مساعدة ذات صلاحيات منخفضة (عرض فقط)
      ('asst_dina','${await bcrypt.hash('123456',10)}','دينا سعيد محمد','+201111111103',$1,
       false,false,false,false,true,false,false,false,false)
  `, [T1]);

  const [asstNour]  = await q(`SELECT id,name FROM assistants WHERE username='asst_nour'`);
  const [asstKarim] = await q(`SELECT id,name FROM assistants WHERE username='asst_karim'`);
  const [asstDina]  = await q(`SELECT id,name FROM assistants WHERE username='asst_dina'`);
  console.log(`  ✓ 3 مساعدين (asst_nour بصلاحيات كاملة، asst_karim جزئية، asst_dina عرض فقط)`);

  // ══════════════════════════════════════════════════════════
  // 3. الطلاب
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الطلاب...');

  // الطالب المحوري: std_ali — الصف الثالث الثانوي
  const [stdAliRow] = await q(`
    INSERT INTO students
      (username,password,plain_password,name,phone,parent_phone,academic_stage,gender,teacher_id,points)
    VALUES ('std_ali',$1,'123456','علي محمد رمضان','+201200000001','+201200000002',
            'الصف الثالث الثانوي','ذكر',$2,1250)
    RETURNING id,name
  `, [pass6, T1]);
  const STD_ALI = stdAliRow.id;

  // طلاب داعمون (لملء لوحة المتصدرين والإحصائيات)
  const supportStudentsData = [
    ['std_fatma',  'فاطمة أحمد سعد',       '+201200000003', '+201200000004', 'الصف الثالث الثانوي', 'أنثى',  980],
    ['std_youssef','يوسف إبراهيم كمال',    '+201200000005', '+201200000006', 'الصف الثالث الثانوي', 'ذكر',  1100],
    ['std_nada',   'ندى حسن عبد الله',     '+201200000007', '+201200000008', 'الصف الثالث الثانوي', 'أنثى',  640],
    ['std_omar',   'عمر سامي فرج',         '+201200000009', '+201200000010', 'الصف الثالث الثانوي', 'ذكر',   720],
    ['std_mostafa','مصطفى أسامة نور',      '+201200000025', '+201200000026', 'الصف الثاني الثانوي', 'ذكر',   340],
    ['std_rana',   'رنا طارق عبد العزيز',  '+201200000027', '+201200000028', 'الصف الثاني الثانوي', 'أنثى',  420],
    ['std_adam',   'آدم محمود صلاح',       '+201200000029', '+201200000030', 'الصف الثاني الثانوي', 'ذكر',   295],
    ['std_lina',   'لينا سعيد القاضي',     '+201200000031', '+201200000032', 'الصف الثاني الثانوي', 'أنثى',  380],
    ['std_hana',   'هناء وليد منصور',      '+201200000033', '+201200000034', 'الصف الأول الثانوي',  'أنثى',  150],
    ['std_hassan', 'حسن علاء طارق',        '+201200000035', '+201200000036', 'الصف الأول الثانوي',  'ذكر',   190],
  ];

  const supportIds = {};
  for (const [user, name, phone, pPhone, stage, gender, pts] of supportStudentsData) {
    const [r] = await q(`
      INSERT INTO students
        (username,password,plain_password,name,phone,parent_phone,academic_stage,gender,teacher_id,points)
      VALUES ($1,$2,'123456',$3,$4,$5,$6,$7,$8,$9)
      RETURNING id
    `, [user, pass6, name, phone, pPhone, stage, gender, T1, pts]);
    supportIds[user] = r.id;
  }

  const S_TH3 = [STD_ALI, supportIds['std_fatma'], supportIds['std_youssef'], supportIds['std_nada'], supportIds['std_omar']];
  const S_TH2 = [supportIds['std_mostafa'], supportIds['std_rana'], supportIds['std_adam'], supportIds['std_lina']];
  const S_TH1 = [supportIds['std_hana'], supportIds['std_hassan']];

  console.log(`  ✓ 11 طالب (std_ali هو الحساب المحوري، 780 نقطة ث3)`);

  // ══════════════════════════════════════════════════════════
  // 4. الكورسات — كل الحالات الممكنة
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الكورسات...');

  // C1 — كورس مدفوع منشور (ث3) — std_ali مسجّل فيه
  const [c1] = await q(`
    INSERT INTO courses
      (name,description,price,teacher_id,target_stage,is_published,is_free,points_on_complete,thumbnail_url)
    VALUES (
      'رياضيات الثالث الثانوي — الجبر والمثلثات',
      'شرح مفصّل لكل أبواب الجبر والمثلثات منهج الثانوية العامة مع أكثر من 200 مسألة محلولة وامتحانات تفاعلية شاملة.',
      300,$1,'الصف الثالث الثانوي',true,false,80,
      'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&h=340&fit=crop')
    RETURNING id
  `, [T1]);

  // C2 — كورس مدفوع منشور (ث3) — std_ali مسجّل فيه أيضاً
  const [c2] = await q(`
    INSERT INTO courses
      (name,description,price,teacher_id,target_stage,is_published,is_free,points_on_complete,thumbnail_url)
    VALUES (
      'رياضيات الثالث الثانوي — التفاضل والتكامل',
      'الباب الأصعب في المنهج بأسلوب مبسط خطوة بخطوة مع تطبيقات عملية وامتحانات تدريبية مكثفة.',
      250,$1,'الصف الثالث الثانوي',true,false,60,
      'https://images.unsplash.com/photo-1509228627152-72ae9ae6848d?w=600&h=340&fit=crop')
    RETURNING id
  `, [T1]);

  // C3 — كورس مجاني منشور (ث3) — std_ali مسجّل فيه (مجاني بدون دفع)
  const [c3] = await q(`
    INSERT INTO courses
      (name,description,price,teacher_id,target_stage,is_published,is_free,points_on_complete,thumbnail_url)
    VALUES (
      'مقدمة مجانية — أساسيات الرياضيات للثانوية',
      'درس تعريفي مجاني كامل يشمل المفاهيم الأساسية للرياضيات — اكتشف أسلوب الشرح وابدأ مجاناً بدون أي رسوم.',
      0,$1,'الصف الثالث الثانوي',true,true,20,
      'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=600&h=340&fit=crop')
    RETURNING id
  `, [T1]);

  // C4 — كورس مدفوع منشور (ث2) — std_ali سيقدم طلب انضمام له (pending)
  const [c4] = await q(`
    INSERT INTO courses
      (name,description,price,teacher_id,target_stage,is_published,is_free,points_on_complete,thumbnail_url)
    VALUES (
      'رياضيات الثاني الثانوي — الهندسة التحليلية',
      'أساسيات وتطبيقات الهندسة التحليلية بطريقة مبسطة مع تمارين تفصيلية على كل درس.',
      200,$1,'الصف الثاني الثانوي',true,false,40,
      'https://images.unsplash.com/photo-1596495578065-6e0763fa1178?w=600&h=340&fit=crop')
    RETURNING id
  `, [T1]);

  // C5 — كورس غير منشور (draft) — المعلم لم ينشره بعد
  const [c5] = await q(`
    INSERT INTO courses
      (name,description,price,teacher_id,target_stage,is_published,is_free,points_on_complete,thumbnail_url)
    VALUES (
      'رياضيات الثالث الثانوي — الإحصاء والاحتمالات [مسودة]',
      'كورس قيد الإعداد — سيتم نشره قريباً بعد اكتمال رفع المحتوى والامتحانات.',
      200,$1,'الصف الثالث الثانوي',false,false,50,
      'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=340&fit=crop')
    RETURNING id
  `, [T1]);

  // C6 — كورس مجاني منشور (ث2) — للطلاب الآخرين
  const [c6] = await q(`
    INSERT INTO courses
      (name,description,price,teacher_id,target_stage,is_published,is_free,points_on_complete,thumbnail_url)
    VALUES (
      'مقدمة مجانية — الجبر للثاني الثانوي',
      'درس تعريفي مجاني لطلاب الثاني الثانوي.',
      0,$1,'الصف الثاني الثانوي',true,true,15,
      'https://images.unsplash.com/photo-1596495578065-6e0763fa1178?w=600&h=340&fit=crop')
    RETURNING id
  `, [T1]);

  console.log('  ✓ 6 كورسات (مدفوع×3، مجاني×2، مسودة×1)');

  // ══════════════════════════════════════════════════════════
  // 5. الأقسام والمحتوى (فيديوهات + PDF)
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الأقسام والمحتوى...');

  const addSec = async (courseId, title, order) => {
    const [s] = await q(
      `INSERT INTO sections (course_id,title,sort_order) VALUES ($1,$2,$3) RETURNING id`,
      [courseId, title, order]
    );
    return s.id;
  };
  const addVid = async (courseId, sectionId, title, url, mins, order) => {
    const [v] = await q(
      `INSERT INTO videos (course_id,section_id,title,file_path_or_url,duration_minutes,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [courseId, sectionId, title, url, mins, order]
    );
    return v.id;
  };
  const addPdf = async (courseId, sectionId, title, url) => {
    const [p] = await q(
      `INSERT INTO pdf_files (course_id,section_id,title,file_url) VALUES ($1,$2,$3,$4) RETURNING id`,
      [courseId, sectionId, title, url]
    );
    return p.id;
  };

  const YT1 = 'https://www.youtube.com/watch?v=NybHckSEQBI';
  const YT2 = 'https://www.youtube.com/watch?v=tNkZsRW7h2c';
  const YT3 = 'https://www.youtube.com/watch?v=VVn5OEucnQs';
  const YT4 = 'https://www.youtube.com/watch?v=kMiUGiSWMEI';
  const PDF = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

  // ── C1: جبر ومثلثات (3 أقسام، 9 فيديوهات، 4 PDF) ──
  const c1_s1 = await addSec(c1.id, 'الباب الأول — المعادلات والمتباينات', 1);
  const c1_s2 = await addSec(c1.id, 'الباب الثاني — المثلثات', 2);
  const c1_s3 = await addSec(c1.id, 'الباب الثالث — الدوال والرسوم البيانية', 3);

  const c1v1  = await addVid(c1.id, c1_s1, 'مقدمة الجبر — حل المعادلات من الدرجة الأولى', YT1, 28, 1);
  const c1v2  = await addVid(c1.id, c1_s1, 'المعادلات التربيعية وطرق الحل', YT2, 35, 2);
  const c1v3  = await addVid(c1.id, c1_s1, 'المتباينات وتمثيلها على محور الأعداد', YT3, 22, 3);
  const c1v4  = await addVid(c1.id, c1_s2, 'مقدمة المثلثات — النسب المثلثية الأساسية', YT1, 30, 1);
  const c1v5  = await addVid(c1.id, c1_s2, 'النسب المثلثية للزوايا الخاصة', YT2, 40, 2);
  const c1v6  = await addVid(c1.id, c1_s2, 'قاعدة الجيب وقاعدة جيب التمام', YT3, 38, 3);
  const c1v7  = await addVid(c1.id, c1_s3, 'الدوال الخطية والتربيعية — رسم البيان', YT1, 32, 1);
  const c1v8  = await addVid(c1.id, c1_s3, 'التطبيقات العملية على الدوال', YT4, 25, 2);
  const c1v9  = await addVid(c1.id, c1_s3, 'مراجعة شاملة — الباب الثالث', YT2, 20, 3);
  await addPdf(c1.id, c1_s1, 'ملخص المعادلات والمتباينات PDF', PDF);
  await addPdf(c1.id, c1_s2, 'جدول النسب المثلثية + تدريبات محلولة', PDF);
  await addPdf(c1.id, c1_s3, 'ورقة عمل الدوال — 50 سؤال محلول', PDF);
  await addPdf(c1.id, c1_s1, 'بنك أسئلة المعادلات من الثانوية العامة', PDF);

  // ── C2: تفاضل وتكامل (2 قسم، 6 فيديوهات، 3 PDF) ──
  const c2_s1 = await addSec(c2.id, 'الوحدة الأولى — مفهوم المشتقة وقواعدها', 1);
  const c2_s2 = await addSec(c2.id, 'الوحدة الثانية — التكامل وتطبيقاته', 2);

  const c2v1  = await addVid(c2.id, c2_s1, 'مقدمة التفاضل — مفهوم النهايات', YT1, 35, 1);
  const c2v2  = await addVid(c2.id, c2_s1, 'قواعد المشتقة — الجمع والضرب والقسمة', YT2, 42, 2);
  const c2v3  = await addVid(c2.id, c2_s1, 'تطبيقات المشتقة — الحد الأقصى والأدنى', YT3, 38, 3);
  const c2v4  = await addVid(c2.id, c2_s2, 'مقدمة التكامل — مفهوم المضاد', YT4, 30, 1);
  const c2v5  = await addVid(c2.id, c2_s2, 'قوانين التكامل الأساسية', YT1, 45, 2);
  const c2v6  = await addVid(c2.id, c2_s2, 'التكامل المحدود وحساب المساحات', YT2, 40, 3);
  await addPdf(c2.id, c2_s1, 'ملخص قواعد المشتقة المكثف', PDF);
  await addPdf(c2.id, c2_s2, 'تمارين التكامل — 100 مسألة محلولة', PDF);
  await addPdf(c2.id, c2_s2, 'نماذج امتحانات الثانوية العامة في التفاضل', PDF);

  // ── C3: مجاني (1 قسم، 3 فيديوهات، 1 PDF) ──
  const c3_s1 = await addSec(c3.id, 'الدرس التعريفي المجاني', 1);
  const c3v1  = await addVid(c3.id, c3_s1, 'درس مجاني — الحساب الذهني وأساسيات الجبر', YT1, 20, 1);
  const c3v2  = await addVid(c3.id, c3_s1, 'درس مجاني — مقدمة في علم الرياضيات', YT2, 18, 2);
  const c3v3  = await addVid(c3.id, c3_s1, 'درس مجاني — كيف تستعد لمنهج الثانوية', YT3, 15, 3);
  await addPdf(c3.id, c3_s1, 'خطة المنهج والجدول الزمني الكامل', PDF);

  // ── C4: هندسة تحليلية ث2 (2 قسم، 4 فيديوهات، 2 PDF) ──
  const c4_s1 = await addSec(c4.id, 'الباب الأول — الإحداثيات والمسافة', 1);
  const c4_s2 = await addSec(c4.id, 'الباب الثاني — المستقيمات والدائرة', 2);
  await addVid(c4.id, c4_s1, 'نظام الإحداثيات الديكارتي', YT1, 25, 1);
  await addVid(c4.id, c4_s1, 'المسافة بين نقطتين ومنتصف القطعة', YT2, 30, 2);
  await addVid(c4.id, c4_s2, 'معادلة المستقيم بأشكالها المختلفة', YT3, 35, 1);
  await addVid(c4.id, c4_s2, 'الدائرة — معادلتها وتطبيقاتها', YT4, 40, 2);
  await addPdf(c4.id, c4_s1, 'ملخص الإحداثيات', PDF);
  await addPdf(c4.id, c4_s2, 'تدريبات الدائرة والمستقيم', PDF);

  // ── C5: مسودة (قسم واحد، فيديو واحد — غير مكتملة) ──
  const c5_s1 = await addSec(c5.id, 'الباب الأول — مقدمة في الإحصاء', 1);
  await addVid(c5.id, c5_s1, 'مقدمة الإحصاء — المفاهيم الأساسية', YT1, 22, 1);
  await addPdf(c5.id, c5_s1, 'مخطط المحتوى القادم', PDF);

  // ── C6: مجاني ث2 ──
  const c6_s1 = await addSec(c6.id, 'الدرس التعريفي', 1);
  await addVid(c6.id, c6_s1, 'مقدمة لطلاب الثاني الثانوي', YT1, 15, 1);
  await addPdf(c6.id, c6_s1, 'خطة المنهج', PDF);

  console.log('  ✓ الأقسام والفيديوهات والـ PDF اكتملت');

  // ══════════════════════════════════════════════════════════
  // 6. بنك الأسئلة
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة بنك الأسئلة...');

  const [bank1] = await q(`
    INSERT INTO question_banks (name,subject,teacher_id,course_id)
    VALUES ('بنك أسئلة الجبر والمثلثات','رياضيات',$1,$2) RETURNING id
  `, [T1, c1.id]);

  const [bank2] = await q(`
    INSERT INTO question_banks (name,subject,teacher_id,course_id)
    VALUES ('بنك أسئلة التفاضل والتكامل','رياضيات',$1,$2) RETURNING id
  `, [T1, c2.id]);

  // أسئلة بنك 1 (جبر) — متعددة المستويات
  const bankQ1Data = [
    ['MCQ', 'حل المعادلة 3x - 9 = 0', 'x = 1', 'x = 2', 'x = 3', 'x = 9', 'C', 1, 'easy'],
    ['MCQ', 'حل المعادلة التربيعية x² - 5x + 6 = 0', 'x=1 أو x=6', 'x=2 أو x=3', 'x=-2 أو x=-3', 'x=0 أو x=5', 'B', 2, 'medium'],
    ['MCQ', 'sin(30°) يساوي', '1', '1/2', '√3/2', '0', 'B', 1, 'easy'],
    ['MCQ', 'cos(60°) يساوي', '√3/2', '1', '1/2', '0', 'C', 1, 'easy'],
    ['MCQ', 'sin²(x) + cos²(x) يساوي', '0', '1/2', '1', '2', 'C', 2, 'easy'],
    ['MCQ', 'المتباينة 2x + 4 > 10، إذن x', 'x > 2', 'x > 3', 'x < 3', 'x = 3', 'B', 2, 'medium'],
    ['MCQ', 'الجذر التربيعي لـ 144', '11', '12', '13', '14', 'B', 1, 'easy'],
    ['TF',  'العدد -5 يُعدّ حلاً للمعادلة x² = 25', null, null, null, null, 'T', 1, 'easy'],
    ['TF',  'sin(90°) = 1', null, null, null, null, 'T', 1, 'easy'],
    ['MCQ', 'إذا كان f(x) = x² + 2x فإن f(3) =', '9', '12', '15', '6', 'C', 3, 'hard'],
    ['MCQ', 'مجموع جذري المعادلة x² - 7x + 12 = 0', '3', '4', '7', '12', 'C', 3, 'hard'],
    ['MCQ', 'قيمة tan(45°)', '0', '1', '√3', '1/√2', 'B', 2, 'medium'],
  ];
  for (const [type, text, a, b, c, d, ans, pts, diff] of bankQ1Data) {
    await q(`
      INSERT INTO bank_questions
        (bank_id,question_text,option_a,option_b,option_c,option_d,
         correct_answer_letter,points,question_type,difficulty)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [bank1.id, text, a||'صح', b||'خطأ', c, d, ans, pts, type==='TF'?'true_false':'mcq', diff]);
  }

  const bankQ2Data = [
    ['MCQ', 'مشتقة الدالة f(x) = x³', '3x²', 'x²', '3x', '2x³', 'A', 2, 'medium'],
    ['MCQ', 'مشتقة الثابت تساوي', '1', '0', 'الثابت نفسه', 'غير معرّفة', 'B', 1, 'easy'],
    ['MCQ', 'مشتقة f(x) = 5x² عند x=2', '10', '20', '40', '5', 'B', 2, 'medium'],
    ['TF',  'مشتقة الدالة sin(x) هي cos(x)', null, null, null, null, 'T', 1, 'easy'],
    ['MCQ', 'تكامل (2x) dx = ', 'x²', 'x² + c', '2x² + c', 'x + c', 'B', 2, 'medium'],
    ['MCQ', 'قيمة ∫₀¹ x dx', '1/4', '1/2', '1', '2', 'B', 3, 'hard'],
  ];
  for (const [type, text, a, b, c, d, ans, pts, diff] of bankQ2Data) {
    await q(`
      INSERT INTO bank_questions
        (bank_id,question_text,option_a,option_b,option_c,option_d,
         correct_answer_letter,points,question_type,difficulty)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [bank2.id, text, a||'صح', b||'خطأ', c, d, ans, pts, type==='TF'?'true_false':'mcq', diff]);
  }
  console.log('  ✓ 2 بنك أسئلة (18 سؤال جبر، 6 تفاضل)');

  // ══════════════════════════════════════════════════════════
  // 7. الامتحانات — كل الحالات الممكنة لـ std_ali
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الامتحانات...');

  // ── E1: امتحان انتهى (c1 — ث3) — std_ali امتحنه ونجح ✅
  const [e1] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,pass_score,teacher_id,course_id,
       is_published,start_date,end_date,badge_name,badge_color,
       points_on_attempt,points_on_pass,shuffle_questions,shuffle_options)
    VALUES ('امتحان الجبر — الوحدة الأولى',45,30,15,$1,$2,
            true,$3,$4,'نجم الجبر','#f97316',5,20,false,false)
    RETURNING id
  `, [T1, c1.id, past(21), past(14)]);

  // ── E2: امتحان انتهى (c1 — ث3) — std_ali امتحنه وراسب + طلب إعادة مقبول ✅
  const [e2] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,pass_score,teacher_id,course_id,
       is_published,start_date,end_date,badge_name,badge_color,
       points_on_attempt,points_on_pass)
    VALUES ('امتحان المثلثات الشامل',60,50,30,$1,$2,
            true,$3,$4,'متفوق الرياضيات','#7c3aed',5,25)
    RETURNING id
  `, [T1, c1.id, past(14), past(7)]);

  // ── E3: امتحان متاح الآن (c1 — ث3) — std_ali لم يمتحنه بعد 🕐
  const [e3] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,pass_score,teacher_id,course_id,
       is_published,start_date,end_date,points_on_attempt,points_on_pass)
    VALUES ('مراجعة الدوال والرسوم البيانية',40,40,20,$1,$2,
            true,$3,$4,5,15)
    RETURNING id
  `, [T1, c1.id, past(2), future(5)]);

  // ── E4: امتحان قادم (c1 — ث3) — وقته لم يجئ بعد ⏳
  const [e4] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,pass_score,teacher_id,course_id,
       is_published,start_date,end_date,badge_name,badge_color,
       points_on_attempt,points_on_pass)
    VALUES ('الاختبار النهائي — الجبر والمثلثات',90,100,60,$1,$2,
            true,$3,$4,'بطل الرياضيات','#f59e0b',10,40)
    RETURNING id
  `, [T1, c1.id, future(7), future(14)]);

  // ── E5: امتحان انتهى (c2 — تفاضل) — std_ali امتحنه ونجح بدرجة ممتازة + شارة ✅
  const [e5] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,pass_score,teacher_id,course_id,
       is_published,start_date,end_date,badge_name,badge_color,
       points_on_attempt,points_on_pass)
    VALUES ('اختبار مفهوم المشتقة',50,30,15,$1,$2,
            true,$3,$4,'عبقري التفاضل','#10b981',5,20)
    RETURNING id
  `, [T1, c2.id, past(10), past(3)]);

  // ── E6: امتحان متاح الآن (c2 — تفاضل) — std_ali لم يمتحنه بعد 🕐
  const [e6] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,pass_score,teacher_id,course_id,
       is_published,start_date,end_date,points_on_attempt,points_on_pass)
    VALUES ('اختبار التكامل وتطبيقاته',45,30,15,$1,$2,
            true,$3,$4,5,15)
    RETURNING id
  `, [T1, c2.id, past(1), future(6)]);

  // ── E7: امتحان (c3 مجاني) — std_ali ممتحن فيه ✅
  const [e7] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,pass_score,teacher_id,course_id,
       is_published,start_date,end_date,points_on_attempt,points_on_pass)
    VALUES ('اختبار التشخيص المجاني',20,20,10,$1,$2,
            true,$3,$4,3,10)
    RETURNING id
  `, [T1, c3.id, past(30), past(20)]);

  // ── E8: امتحان غير منشور (c5 مسودة) — لا يرى الطلاب 🔒
  const [e8] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,pass_score,teacher_id,course_id,
       is_published,start_date,end_date,points_on_attempt,points_on_pass)
    VALUES ('اختبار الإحصاء — مسودة',60,50,25,$1,$2,
            false,$3,$4,5,20)
    RETURNING id
  `, [T1, c5.id, future(30), future(45)]);

  // ── E9: امتحان (c4 — ث2) انتهى — للطلاب الآخرين 
  const [e9] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,pass_score,teacher_id,course_id,
       is_published,start_date,end_date,points_on_attempt,points_on_pass)
    VALUES ('اختبار الهندسة التحليلية',30,20,10,$1,$2,
            true,$3,$4,5,10)
    RETURNING id
  `, [T1, c4.id, past(5), future(10)]);

  // ── E10: امتحان قادم (c4 — ث2) للطلاب الآخرين
  const [e10] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,pass_score,teacher_id,course_id,
       is_published,start_date,end_date,points_on_attempt,points_on_pass)
    VALUES ('الاختبار النهائي — الهندسة التحليلية',60,50,25,$1,$2,
            true,$3,$4,5,20)
    RETURNING id
  `, [T1, c4.id, future(14), future(21)]);

  console.log('  ✓ 10 امتحانات (منتهية، جارية، قادمة، غير منشورة)');

  // ══════════════════════════════════════════════════════════
  // 8. أسئلة الامتحانات
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة أسئلة الامتحانات...');

  const addMCQ = async (examId, text, a, b, c, d, correct, pts) => {
    await q(`
      INSERT INTO questions
        (exam_id,question_text,option_a,option_b,option_c,option_d,
         correct_answer_letter,points,question_type)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'mcq')
    `, [examId, text, a, b, c, d, correct, pts]);
  };
  const addTF = async (examId, text, correct, pts) => {
    await q(`
      INSERT INTO questions
        (exam_id,question_text,option_a,option_b,option_c,option_d,
         correct_answer_letter,points,question_type)
      VALUES ($1,$2,'صح','خطأ',NULL,NULL,$3,$4,'true_false')
    `, [examId, text, correct, pts]);
  };

  // أسئلة E1 — 10 أسئلة × 3 نقاط = 30
  await addMCQ(e1.id,'حل المعادلة: 2x + 6 = 14','x=3','x=4','x=5','x=10','B',3);
  await addMCQ(e1.id,'إذا كان 3x − 9 = 0 فإن x =','1','2','3','9','C',3);
  await addMCQ(e1.id,'حل x² − 5x + 6 = 0','x=1 أو x=6','x=2 أو x=3','x=−2 أو x=−3','x=0 أو x=5','B',3);
  await addMCQ(e1.id,'المتباينة x + 3 > 7 تعني','x>4','x<4','x=4','x>10','A',3);
  await addMCQ(e1.id,'الجذر الموجب لـ x² = 25','√5','5','10','25','B',3);
  await addMCQ(e1.id,'قيمة y = 2x+1 عند x=3','5','7','9','3','B',3);
  await addMCQ(e1.id,'إذا كان f(x)=x² فإن f(4) =','8','12','16','4','C',3);
  await addMCQ(e1.id,'حل المتباينة 2x < 10','x<5','x>5','x=5','x<20','A',3);
  await addTF (e1.id,'العدد −3 يُعدّ حلاً للمعادلة x² = 9','T',3);
  await addTF (e1.id,'مجموع حلّي x² − 5x + 6 = 0 يساوي 5','T',3);

  // أسئلة E2 — 10 أسئلة × 5 نقاط = 50
  await addMCQ(e2.id,'sin(30°) =','1/√2','1/2','√3/2','1','B',5);
  await addMCQ(e2.id,'cos(60°) =','√3/2','1','1/2','0','C',5);
  await addMCQ(e2.id,'tan(45°) =','0','√2/2','1','√3','C',5);
  await addMCQ(e2.id,'sin(90°) =','0','√2/2','1','−1','C',5);
  await addMCQ(e2.id,'cos(0°) =','0','1','−1','1/2','B',5);
  await addMCQ(e2.id,'sin²(x) + cos²(x) =','0','1/2','1','2','C',5);
  await addMCQ(e2.id,'tan(θ) = sin(θ) ÷ ___','sin(θ)','tan(θ)','cos(θ)','sec(θ)','C',5);
  await addMCQ(e2.id,'الوتر في المثلث القائم هو','الضلع الأقصر','الضلع المقابل للزاوية القائمة','الضلع المجاور','الضلع الأطول دائماً','B',5);
  await addTF (e2.id,'sin(60°) = cos(30°)','T',5);
  await addTF (e2.id,'tan(90°) قيمة غير محددة','T',5);

  // أسئلة E3 — 8 أسئلة × 5 نقاط = 40
  await addMCQ(e3.id,'الدالة f(x) = 2x+3 عند x=5 تساوي','10','13','16','23','B',5);
  await addMCQ(e3.id,'قاطع الصادات لمستقيم y=3x-6','2','−6','6','3','B',5);
  await addMCQ(e3.id,'الميل للمستقيم y = -2x + 1','1','−1','2','−2','D',5);
  await addMCQ(e3.id,'الدالة f(x) = x² قطعية مكافئة تفتح إلى','اليسار','اليمين','الأعلى','الأسفل','C',5);
  await addMCQ(e3.id,'إذا f(x) = x²-4 فإن f(2) =','0','4','−4','2','A',5);
  await addTF (e3.id,'الدالة الثابتة f(x)=5 ميلها يساوي صفر','T',5);
  await addTF (e3.id,'مستقيمان متوازيان لهما نفس الميل','T',5);
  await addTF (e3.id,'ميل المستقيم العمودي على محور السينات يساوي صفر','F',5);

  // أسئلة E4 — 10 أسئلة × 10 نقاط = 100
  await addMCQ(e4.id,'حل x² + 2x - 15 = 0','x=3 أو x=5','x=3 أو x=-5','x=-3 أو x=5','x=-3 أو x=-5','B',10);
  await addMCQ(e4.id,'sin(45°) =','1','1/2','1/√2','√3/2','C',10);
  await addMCQ(e4.id,'cos(30°) =','1/2','√3/2','1/√2','√3','B',10);
  await addMCQ(e4.id,'مشتقة f(x)=3x²','6x','3x','6','3','A',10);
  await addMCQ(e4.id,'تكامل ∫3x²dx =','x³','x³+c','3x³','x²+c','B',10);
  await addMCQ(e4.id,'قيمة y=x²-2x+1 عند x=3','4','6','2','8','A',10);
  await addTF (e4.id,'مجموع جذري ax²+bx+c=0 هو -b/a','T',10);
  await addTF (e4.id,'الدالة f(x)=x³ دالة فردية','T',10);
  await addTF (e4.id,'cos(90°) = 0','T',10);
  await addTF (e4.id,'حاصل ضرب جذري x²-5x+6=0 يساوي 6','T',10);

  // أسئلة E5 — 10 أسئلة × 3 نقاط = 30
  await addMCQ(e5.id,'مشتقة f(x) = x⁴','4x³','x³','4x','x⁴','A',3);
  await addMCQ(e5.id,'مشتقة الثابت 7','7','1','0','−7','C',3);
  await addMCQ(e5.id,'مشتقة f(x)=5x² عند x=2','10','20','40','5','B',3);
  await addMCQ(e5.id,'مشتقة f(x)=2x³+3x','6x²+3','6x²','6x+3','2x³','A',3);
  await addMCQ(e5.id,'قيمة f\'(x) لـ f(x)=x² عند x=3','3','6','9','12','B',3);
  await addMCQ(e5.id,'نقطة القصوى المحلية تحدث عند f\'(x)=','1','−1','0','∞','C',3);
  await addTF (e5.id,'مشتقة sin(x) هي cos(x)','T',3);
  await addTF (e5.id,'مشتقة e^x هي e^x','T',3);
  await addTF (e5.id,'الدالة المتزايدة لها مشتقة موجبة دائماً','T',3);
  await addTF (e5.id,'مشتقة f(x)=x هي 1','T',3);

  // أسئلة E6 — 10 أسئلة × 3 نقاط = 30
  await addMCQ(e6.id,'تكامل ∫x²dx =','x³+c','x³/3+c','2x','3x²','B',3);
  await addMCQ(e6.id,'∫1dx =','0','x','x+c','1','C',3);
  await addMCQ(e6.id,'∫2x dx =','x²','x²+c','2x²+c','2x','B',3);
  await addMCQ(e6.id,'قيمة ∫₀² 2x dx','4','2','8','1','A',3);
  await addMCQ(e6.id,'∫(x²+2x)dx =','x³/3+x²','x³/3+x²+c','x²+2','x³+x²+c','B',3);
  await addTF (e6.id,'التكامل المحدود يستخدم لحساب المساحة','T',3);
  await addTF (e6.id,'ثابت التكامل c يُحذف في التكامل المحدود','T',3);
  await addTF (e6.id,'∫₀¹ 1 dx = 1','T',3);
  await addTF (e6.id,'التكامل هو مضاد الاشتقاق','T',3);
  await addTF (e6.id,'مساحة المنطقة بين الدالة ومحور السينات دائماً موجبة','F',3);

  // أسئلة E7 — 5 أسئلة × 4 نقاط = 20
  await addMCQ(e7.id,'2 × 7 + 3 =','14','17','21','10','B',4);
  await addMCQ(e7.id,'أكبر عدد من مجموعة {3,7,1,9,2}','7','9','3','2','B',4);
  await addMCQ(e7.id,'مربع العدد 8','56','64','72','48','B',4);
  await addTF (e7.id,'1 + 1 = 3','F',4);
  await addTF (e7.id,'مجموع زوايا المثلث 180°','T',4);

  // أسئلة E8 (مسودة) — 5 أسئلة × 10 نقاط = 50
  await addMCQ(e8.id,'وسيط مجموعة {2,4,6,8,10}','4','5','6','8','C',10);
  await addMCQ(e8.id,'المتوسط الحسابي لـ {10,20,30}','15','20','25','30','B',10);
  await addTF (e8.id,'الاحتمال دائماً بين 0 و1','T',10);
  await addTF (e8.id,'احتمال الحدث المستحيل = 1','F',10);
  await addMCQ(e8.id,'المدى في {3,7,1,9}','8','9','6','7','A',10);

  // أسئلة E9 — 6 أسئلة
  await addMCQ(e9.id,'المسافة بين (0,0) و(3,4)','3','4','5','7','C',3);
  await addMCQ(e9.id,'منتصف القطعة بين (2,4) و(6,8) هو','(4,6)','(3,5)','(4,4)','(8,12)','A',3);
  await addMCQ(e9.id,'معادلة المستقيم المار بـ (0,2) بميل 3','y=3x','y=3x+2','y=2x+3','y=x+3','B',3);
  await addMCQ(e9.id,'الدائرة ذات المركز (0,0) والنصف قطر 5','x²+y²=5','x²+y²=10','x²+y²=25','x+y=5','C',3);
  await addTF (e9.id,'الميل للمستقيم الموازي لمحور x يساوي صفراً','T',2);
  await addTF (e9.id,'المسافة بين (1,1) و(4,5) تساوي 5','T',2);

  // أسئلة E10 — 5 أسئلة
  await addMCQ(e10.id,'ميل المستقيم المار بـ (1,2) و(3,6)','1','2','3','4','B',10);
  await addMCQ(e10.id,'قاطع الصادات للمستقيم 2x+y=4','2','4','8','0','B',10);
  await addTF (e10.id,'مستقيمان متعامدان حاصل ضرب ميليهما = -1','T',10);
  await addTF (e10.id,'مركز الدائرة x²+y²=16 هو (0,0)','T',10);
  await addMCQ(e10.id,'معادلة الدائرة المركز (3,4) والنصف قطر 5','(x-3)²+(y-4)²=5','(x-3)²+(y-4)²=25','x²+y²=25','(x+3)²+(y+4)²=25','B',10);

  console.log('  ✓ أسئلة 10 امتحانات اكتملت');

  // ══════════════════════════════════════════════════════════
  // 9. التسجيل في الكورسات
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  تسجيل الطلاب في الكورسات...');

  const enroll = async (studentId, courseId) => {
    await q(
      `INSERT INTO student_course_enrollment (student_id,course_id,status)
       VALUES ($1,$2,'active') ON CONFLICT (student_id,course_id) DO NOTHING`,
      [studentId, courseId]
    );
  };

  // std_ali مسجّل في: c1 (مدفوع ث3) + c2 (مدفوع ث3) + c3 (مجاني ث3)
  await enroll(STD_ALI, c1.id);
  await enroll(STD_ALI, c2.id);
  await enroll(STD_ALI, c3.id);  // مجاني

  // باقي طلاب ث3 في c1 + c3
  for (const sid of [supportIds['std_fatma'], supportIds['std_youssef'], supportIds['std_nada'], supportIds['std_omar']]) {
    await enroll(sid, c1.id);
    await enroll(sid, c3.id);
  }
  // بعضهم في c2
  await enroll(supportIds['std_youssef'], c2.id);
  await enroll(supportIds['std_fatma'], c2.id);

  // طلاب ث2 في c4 + c6
  for (const sid of S_TH2) {
    await enroll(sid, c4.id);
    await enroll(sid, c6.id);
  }

  // طلاب ث1 في c6 (مجاني ث2 فقط)
  await enroll(supportIds['std_hana'], c6.id);
  await enroll(supportIds['std_hassan'], c6.id);

  console.log('  ✓ التسجيلات: std_ali في 3 كورسات، باقي الطلاب حسب مراحلهم');

  // ══════════════════════════════════════════════════════════
  // 10. طلبات الانضمام
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة طلبات الانضمام...');

  // std_ali يطلب الانضمام لكورس ث2 (c4) — طلب pending
  await q(`
    INSERT INTO course_enrollment_requests (student_id,course_id,status,message)
    VALUES ($1,$2,'pending','مهتم بمنهج الهندسة التحليلية للاستعداد المبكر')
  `, [STD_ALI, c4.id]);

  // طالب ث2 يطلب كورس ث3 — مرفوض
  await q(`
    INSERT INTO course_enrollment_requests (student_id,course_id,status,message)
    VALUES ($1,$2,'rejected','أريد الاستعداد المبكر لمنهج الثالث')
  `, [supportIds['std_mostafa'], c1.id]);

  // طالب ث1 يطلب كورس ث2 — pending
  await q(`
    INSERT INTO course_enrollment_requests (student_id,course_id,status,message)
    VALUES ($1,$2,'pending','أريد الانضمام مبكراً للكورس')
  `, [supportIds['std_hana'], c4.id]);

  // طالب ث2 يطلب كورس مجاني ث3 — pending
  await q(`
    INSERT INTO course_enrollment_requests (student_id,course_id,status,message)
    VALUES ($1,$2,'pending','أريد مشاهدة المحتوى المجاني')
  `, [supportIds['std_rana'], c3.id]);

  console.log('  ✓ 4 طلبات انضمام (pending×3، مرفوض×1)');

  // ══════════════════════════════════════════════════════════
  // 11. نتائج الامتحانات — كل سيناريوهات std_ali
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة نتائج الامتحانات...');

  const insertResult = async (studentId, examId, score, correct, wrong, unanswered, ptEarned, daysAgo, attempt=1, isLatest=true) => {
    await q(`
      INSERT INTO exam_results
        (student_id,exam_id,score,correct_count,wrong_count,unanswered_count,
         start_time,end_time,points_earned,attempt_number,is_latest)
      VALUES ($1,$2,$3,$4,$5,$6,
              NOW()-($7::int * INTERVAL '1 day')-INTERVAL '2 hours',
              NOW()-($7::int * INTERVAL '1 day')-INTERVAL '1 hour',
              $8,$9,$10)
    `, [studentId, examId, score, correct, wrong, unanswered, daysAgo, ptEarned, attempt, isLatest]);
  };

  // std_ali — E1 (جبر): ناجح بدرجة ممتازة 27/30 ✅
  await insertResult(STD_ALI, e1.id, 27, 9, 1, 0, 25, 18);

  // std_ali — E2 (مثلثات): محاولة أولى راسب 20/50، ثم إعادة نجح 38/50 ✅
  await insertResult(STD_ALI, e2.id, 20, 4, 6, 0, 5, 12, 1, false);  // محاولة أولى راسب
  await insertResult(STD_ALI, e2.id, 38, 8, 2, 0, 30, 8, 2, true);   // إعادة ونجح

  // std_ali — E5 (تفاضل): نجح بدرجة مثالية 30/30 → شارة ✅
  await insertResult(STD_ALI, e5.id, 30, 10, 0, 0, 25, 5);

  // std_ali — E7 (تشخيصي مجاني): نجح 16/20 ✅
  await insertResult(STD_ALI, e7.id, 16, 4, 1, 0, 13, 25);

  // نتائج الطلاب الآخرين في E1
  const e1OtherResults = [
    [supportIds['std_fatma'],  24, 8, 2, 0, 24],
    [supportIds['std_youssef'],30,10, 0, 0, 25],
    [supportIds['std_nada'],   15, 5, 5, 0, 20],
    [supportIds['std_omar'],   12, 4, 6, 0,  5],
  ];
  for (const [sid, sc, cor, wr, un, pts] of e1OtherResults) {
    await insertResult(sid, e1.id, sc, cor, wr, un, pts, 16);
  }

  // نتائج في E2
  const e2OtherResults = [
    [supportIds['std_fatma'],  40, 8, 2, 0, 30],
    [supportIds['std_youssef'],50,10, 0, 0, 30],
    [supportIds['std_omar'],   25, 5, 5, 0,  5],
  ];
  for (const [sid, sc, cor, wr, un, pts] of e2OtherResults) {
    await insertResult(sid, e2.id, sc, cor, wr, un, pts, 10);
  }

  // نتائج في E5 (تفاضل) — يوسف وفاطمة
  await insertResult(supportIds['std_youssef'], e5.id, 27, 9, 1, 0, 25, 5);
  await insertResult(supportIds['std_fatma'],   e5.id, 21, 7, 3, 0, 20, 5);

  // نتائج E9 (هندسة ث2)
  for (const sid of S_TH2) {
    const sc = [14, 12, 16, 10][S_TH2.indexOf(sid)];
    const co = [5,4,5,4][S_TH2.indexOf(sid)];
    const wr = [1,2,1,2][S_TH2.indexOf(sid)];
    await insertResult(sid, e9.id, sc, co, wr, 0, 10, 4);
  }

  console.log('  ✓ نتائج الامتحانات اكتملت (std_ali: 5 امتحانات بحالات متنوعة)');

  // ══════════════════════════════════════════════════════════
  // 12. الشارات
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الشارات...');

  // std_ali حصل على شارتين
  await q(`INSERT INTO badges (student_id,exam_id,badge_name,badge_color) VALUES ($1,$2,'نجم الجبر','#f97316')`,      [STD_ALI, e1.id]);
  await q(`INSERT INTO badges (student_id,exam_id,badge_name,badge_color) VALUES ($1,$2,'عبقري التفاضل','#10b981')`, [STD_ALI, e5.id]);
  // يوسف حصل على شارة
  await q(`INSERT INTO badges (student_id,exam_id,badge_name,badge_color) VALUES ($1,$2,'نجم الجبر','#f97316')`,        [supportIds['std_youssef'], e1.id]);
  await q(`INSERT INTO badges (student_id,exam_id,badge_name,badge_color) VALUES ($1,$2,'متفوق الرياضيات','#7c3aed')`, [supportIds['std_youssef'], e2.id]);

  console.log('  ✓ شارات: std_ali حصل على 2 شارات، يوسف 2 شارات');

  // ══════════════════════════════════════════════════════════
  // 13. طلبات إعادة الامتحان
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة طلبات إعادة الامتحان...');

  // std_ali: طلب إعادة E3 (الدوال) — pending (لأنه لم يمتحنه بعد، محاكاة)
  // std_ali: طلب إعادة E2 (مثلثات) — مقبول (يشرح لماذا امتحنه مرتين)
  await q(`
    INSERT INTO exam_retry_requests (student_id,exam_id,status,message,teacher_note,created_at,handled_at)
    VALUES ($1,$2,'accepted',
      'حصلت على درجة أقل من المتوقع بسبب ظروف صحية، أرجو منح فرصة إعادة',
      'تمت الموافقة على الإعادة — حظاً موفقاً',
      NOW()-INTERVAL '9 days', NOW()-INTERVAL '8 days')
  `, [STD_ALI, e2.id]);

  // طالب آخر — طلب إعادة مرفوض
  await q(`
    INSERT INTO exam_retry_requests (student_id,exam_id,status,message,teacher_note,created_at,handled_at)
    VALUES ($1,$2,'rejected',
      'لم أكن مستعداً بشكل كافٍ',
      'الإعادة غير متاحة — راجع المادة وانتظر الاختبار القادم',
      NOW()-INTERVAL '5 days', NOW()-INTERVAL '4 days')
  `, [supportIds['std_omar'], e1.id]);

  // طلب إعادة pending للطالب ندى
  await q(`
    INSERT INTO exam_retry_requests (student_id,exam_id,status,message,created_at)
    VALUES ($1,$2,'pending',
      'كان الإنترنت مقطوعاً أثناء الامتحان وخسرت وقتاً كبيراً',
      NOW()-INTERVAL '2 days')
  `, [supportIds['std_nada'], e2.id]);

  console.log('  ✓ 3 طلبات إعادة (مقبول×1، مرفوض×1، pending×1)');

  // ══════════════════════════════════════════════════════════
  // 14. المدفوعات — كل الحالات
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة المدفوعات...');

  const addPay = async (studentId, courseId, amount, method, status, daysAgo=5, ref=null) => {
    const r = ref || `REF${Math.floor(Math.random()*900000+100000)}`;
    await q(`
      INSERT INTO payments (student_id,course_id,amount,method,status,reference_number,payment_date)
      VALUES ($1,$2,$3,$4,$5,$6, NOW()-($7::int * INTERVAL '1 day'))
    `, [studentId, courseId, amount, method, status, r, daysAgo]);
  };

  // std_ali — مدفوعاته:
  await addPay(STD_ALI, c1.id, 300, 'instapay',     'verified', 22, 'REF100001');  // c1 مُتحقق
  await addPay(STD_ALI, c2.id, 250, 'vodafone_cash', 'verified', 12, 'REF100002');  // c2 مُتحقق

  // طلاب آخرون — c1
  await addPay(supportIds['std_fatma'],  c1.id, 300, 'fawry',        'verified', 20);
  await addPay(supportIds['std_youssef'],c1.id, 300, 'instapay',     'verified', 20);
  await addPay(supportIds['std_nada'],   c1.id, 300, 'vodafone_cash','pending',  18); // pending
  await addPay(supportIds['std_omar'],   c1.id, 300, 'instapay',     'verified', 19);

  // طلاب c2
  await addPay(supportIds['std_youssef'],c2.id, 250, 'instapay',    'verified', 14);
  await addPay(supportIds['std_fatma'],  c2.id, 250, 'fawry',       'pending',   6); // pending

  // طلاب c4 (ث2)
  await addPay(supportIds['std_mostafa'],c4.id, 200, 'vodafone_cash','verified', 10);
  await addPay(supportIds['std_rana'],   c4.id, 200, 'instapay',    'verified',  9);
  await addPay(supportIds['std_adam'],   c4.id, 200, 'fawry',       'pending',   5); // pending
  await addPay(supportIds['std_lina'],   c4.id, 200, 'vodafone_cash','rejected',  8); // مرفوض

  // دفعة مكررة بعد الرفض — مُتحقق
  await addPay(supportIds['std_lina'],   c4.id, 200, 'instapay',    'verified',  6);

  console.log('  ✓ 13 عملية دفع (verified×9، pending×3، rejected×1)');

  // ══════════════════════════════════════════════════════════
  // 15. تقدم الفيديو — كل حالات std_ali
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة تقدم الفيديو...');

  const setProgress = async (studentId, videoId, durationMins, pct, daysAgo=1) => {
    const watched = Math.floor(durationMins * pct / 100);
    const actualSecs = watched * 60;
    await q(`
      INSERT INTO video_progress
        (student_id,video_id,progress_percentage,watched_minutes,watch_count,
         last_watched_at,last_position,actual_watched_seconds)
      VALUES ($1,$2,$3,$4,$5,
              NOW()-($6::int * INTERVAL '1 day'),
              $7,$8)
      ON CONFLICT (student_id,video_id) DO UPDATE SET
        progress_percentage=$3, watched_minutes=$4,
        last_watched_at=NOW()-($6::int * INTERVAL '1 day'),
        actual_watched_seconds=$8
    `, [studentId, videoId, pct, watched, pct===100?3:1, daysAgo, watched*60, actualSecs]);
  };

  // std_ali — C1 (جبر): ش1 مكتمل، ش2 جزئي، ش3 لم يبدأ
  // الباب الأول — 3 فيديوهات مكتملة 100%
  await setProgress(STD_ALI, c1v1, 28, 100, 20);
  await setProgress(STD_ALI, c1v2, 35, 100, 17);
  await setProgress(STD_ALI, c1v3, 22, 100, 15);
  // الباب الثاني — 2 مكتمل، 1 في النص
  await setProgress(STD_ALI, c1v4, 30, 100, 12);
  await setProgress(STD_ALI, c1v5, 40,  65,  7);  // في النص
  // c1v6 لم يُشاهد بعد
  // الباب الثالث — لم يبدأ بعد (c1v7, c1v8, c1v9 بدون progress)

  // std_ali — C2 (تفاضل): بدأ ولم يكمل
  await setProgress(STD_ALI, c2v1, 35, 100, 9);
  await setProgress(STD_ALI, c2v2, 42,  80, 6);   // 80%
  await setProgress(STD_ALI, c2v3, 38,  40, 3);   // 40%
  // c2v4, c2v5, c2v6 لم يُشاهدوا

  // std_ali — C3 (مجاني): كل الفيديوهات مكتملة
  await setProgress(STD_ALI, c3v1, 20, 100, 28);
  await setProgress(STD_ALI, c3v2, 18, 100, 27);
  await setProgress(STD_ALI, c3v3, 15, 100, 26);

  // تقدم الطلاب الآخرين في c1
  const c1Videos = [c1v1, c1v2, c1v3, c1v4, c1v5, c1v6, c1v7];
  const c1Durs   = [28, 35, 22, 30, 40, 38, 32];
  const otherPcts = [[100,100,80,60,0,0,0],[100,100,100,100,100,80,50],[100,60,0,0,0,0,0],[100,100,90,70,40,0,0]];
  const otherSids = [supportIds['std_fatma'], supportIds['std_youssef'], supportIds['std_nada'], supportIds['std_omar']];
  for (let i = 0; i < otherSids.length; i++) {
    for (let j = 0; j < c1Videos.length; j++) {
      if (otherPcts[i][j] > 0) {
        await setProgress(otherSids[i], c1Videos[j], c1Durs[j], otherPcts[i][j], 15-i*2);
      }
    }
  }

  // تقدم طلاب ث2 في c4
  const c4Vids = await q(`SELECT id,duration_minutes FROM videos WHERE course_id=$1 ORDER BY sort_order`, [c4.id]);
  const th2Pcts = [[100,100,100,80],[100,100,60,0],[100,40,0,0],[100,100,90,70]];
  for (let i = 0; i < S_TH2.length; i++) {
    for (let j = 0; j < c4Vids.length; j++) {
      if (th2Pcts[i][j] > 0) {
        await setProgress(S_TH2[i], c4Vids[j].id, c4Vids[j].duration_minutes, th2Pcts[i][j], 10-i);
      }
    }
  }

  console.log('  ✓ تقدم الفيديو: std_ali في 3 مستويات (مكتمل/جزئي/لم يبدأ)');

  // ══════════════════════════════════════════════════════════
  // 16. الإشعارات
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الإشعارات...');

  // إشعارات std_ali — مزيج مقروء وغير مقروء
  const stdAliNotifs = [
    ['نتيجة الامتحان', 'تهانينا! حصلت على 27/30 في امتحان الجبر وكسبت شارة "نجم الجبر"! 🏆', 'exam_result', true,  18],
    ['امتحان جديد', 'تم نشر اختبار "مراجعة الدوال" — متاح حتى بعد 5 أيام. لا تفوّته!', 'new_exam', true,  3],
    ['موافقة إعادة', 'وافق الأستاذ محمد على طلب إعادة امتحان المثلثات. يمكنك التقديم الآن.', 'retry_approved', true, 8],
    ['امتحان قادم', 'تذكير: الاختبار النهائي سيبدأ بعد 7 أيام — ابدأ المراجعة الآن!', 'reminder', false, 7],
    ['محتوى جديد', 'تم إضافة 3 فيديوهات جديدة في باب الدوال بكورس الجبر والمثلثات.', 'announcement', false, 4],
    ['تهنئة نقاط', 'عظيم! وصلت إلى 1250 نقطة وتحتل المركز الثالث في قائمة المتصدرين.', 'points', false, 2],
    ['امتحان مجاني', 'تم نشر اختبار التكامل — لديك 6 أيام للإجابة عليه. درجة الاجتياز 15/30.', 'new_exam', false, 1],
  ];
  for (const [title, msg, type, isRead, daysAgo] of stdAliNotifs) {
    await q(`
      INSERT INTO notification_log
        (teacher_id,student_id,recipient_type,message,type,is_read,source,title,sent_at)
      VALUES ($1,$2,'student',$3,$4,$5,'platform',$6,NOW()-($7::int * INTERVAL '1 day'))
    `, [T1, STD_ALI, msg, type, isRead, title, daysAgo]);
  }

  // إشعارات جماعية لكل الطلاب
  const broadcastNotifs = [
    ['إعلان هام', 'أهلاً بالجميع في الأكاديمية — ابدأ مشاهدة الكورسات وحقق النجاح!', 'announcement', 30],
    ['تذكير المراجعة', 'تأكد من مشاهدة جميع الفيديوهات قبل الامتحان النهائي.', 'reminder', 10],
    ['تحديث المنصة', 'تم تحديث المنصة بميزات جديدة — جرّب الوضع الليلي!', 'general', 5],
  ];
  for (const sid of [...S_TH3, ...S_TH2]) {
    for (const [title, msg, type, daysAgo] of broadcastNotifs) {
      await q(`
        INSERT INTO notification_log
          (teacher_id,student_id,recipient_type,message,type,is_read,source,title,sent_at)
        VALUES ($1,$2,'student',$3,$4,false,'platform',$5,NOW()-($6::int * INTERVAL '1 day'))
      `, [T1, sid, msg, type, title, daysAgo]);
    }
  }

  console.log('  ✓ إشعارات: 7 لـ std_ali (3 مقروءة + 4 غير مقروءة) + جماعية');

  // ══════════════════════════════════════════════════════════
  // 17. سجل المتصدرين التاريخي
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة سجل المتصدرين...');

  const aprilRankings = [
    { student_id: supportIds['std_youssef'], name: 'يوسف إبراهيم كمال', points: 920, rank: 1 },
    { student_id: STD_ALI,                  name: 'علي محمد رمضان',     points: 780, rank: 2 },
    { student_id: supportIds['std_fatma'],  name: 'فاطمة أحمد سعد',     points: 650, rank: 3 },
    { student_id: supportIds['std_omar'],   name: 'عمر سامي فرج',       points: 520, rank: 4 },
    { student_id: supportIds['std_nada'],   name: 'ندى حسن عبد الله',   points: 410, rank: 5 },
  ];
  const marchRankings = [
    { student_id: STD_ALI,                  name: 'علي محمد رمضان',     points: 560, rank: 1 },
    { student_id: supportIds['std_youssef'],name: 'يوسف إبراهيم كمال',  points: 490, rank: 2 },
    { student_id: supportIds['std_fatma'],  name: 'فاطمة أحمد سعد',     points: 380, rank: 3 },
  ];

  await q(`
    INSERT INTO leaderboard_history (teacher_id,month_label,reset_at,rankings)
    VALUES ($1,'مايو 2025',NOW()-INTERVAL '1 day',$2)
  `, [T1, JSON.stringify(aprilRankings)]);
  await q(`
    INSERT INTO leaderboard_history (teacher_id,month_label,reset_at,rankings)
    VALUES ($1,'أبريل 2025',NOW()-INTERVAL '31 days',$2)
  `, [T1, JSON.stringify(marchRankings)]);

  await q(`
    INSERT INTO leaderboard_reset_tracker (teacher_id,last_reset_at,next_reset_at)
    VALUES ($1,NOW()-INTERVAL '1 day',NOW()+INTERVAL '29 days')
    ON CONFLICT (teacher_id) DO UPDATE SET
      last_reset_at=NOW()-INTERVAL '1 day',
      next_reset_at=NOW()+INTERVAL '29 days'
  `, [T1]);

  console.log('  ✓ سجل متصدرين شهرين (std_ali: 2 في مايو، 1 في أبريل)');

  // ══════════════════════════════════════════════════════════
  // 18. البث المباشر
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة جلسات البث المباشر...');

  // بث منتهي — std_ali شارك فيه
  const [ls1] = await q(`
    INSERT INTO live_streams
      (teacher_id,room_id,title,description,access,chat_enabled,hand_raise_enabled,
       status,started_at,ended_at)
    VALUES ($1,'room-math-revision-001',
      'مراجعة الجبر والمثلثات — الحصة الثانية',
      'مراجعة شاملة لأهم أسئلة امتحانات الثانوية العامة في الجبر والمثلثات',
      'all',true,true,'ended',
      NOW()-INTERVAL '10 days'-INTERVAL '2 hours',
      NOW()-INTERVAL '10 days')
    RETURNING id
  `, [T1]);

  // بث نشط حالياً
  const [ls2] = await q(`
    INSERT INTO live_streams
      (teacher_id,room_id,title,description,access,chat_enabled,hand_raise_enabled,
       status,started_at)
    VALUES ($1,'room-calculus-live-001',
      'شرح التفاضل — الجلسة المباشرة الأولى',
      'شرح تفصيلي لقواعد المشتقة مع حل تمارين تفاعلية',
      'all',true,true,'active',
      NOW()-INTERVAL '30 minutes')
    RETURNING id
  `, [T1]);

  // بث مجدول قادم
  await q(`
    INSERT INTO live_streams
      (teacher_id,room_id,title,description,access,chat_enabled,hand_raise_enabled,
       status,scheduled_at)
    VALUES ($1,'room-final-review-001',
      'المراجعة الشاملة قبل الاختبار النهائي',
      'جلسة مراجعة مكثفة تغطي كل المنهج — حضور إلزامي',
      'all',true,true,'scheduled',
      $2)
  `, [T1, future(5)]);

  // std_ali شارك في البث المنتهي
  await q(`
    INSERT INTO live_stream_viewers (stream_id,student_id,joined_at,left_at,is_active)
    VALUES ($1,$2,
      NOW()-INTERVAL '10 days'-INTERVAL '1 hour 45 minutes',
      NOW()-INTERVAL '10 days'-INTERVAL '5 minutes',
      false)
    ON CONFLICT (stream_id,student_id) DO NOTHING
  `, [ls1.id, STD_ALI]);

  // رسائل في شات البث المنتهي
  const chatMsgs = [
    [T1,    'teacher', 'أ/ محمد',           'أهلاً بالجميع! سنبدأ المراجعة من أسئلة الجبر'],
    [STD_ALI,'student','علي محمد',           'جاهزين يا أستاذ 🎯'],
    [T1,    'teacher', 'أ/ محمد',           'ممتاز علي! نبدأ بحل المعادلات التربيعية'],
    [supportIds['std_youssef'],'student','يوسف إبراهيم','سؤال عن معادلة x²-7x+12=0 أستاذ'],
    [T1,    'teacher', 'أ/ محمد',           'جيد يوسف! الجواب x=3 أو x=4 — الجداء ×المجموع'],
    [STD_ALI,'student','علي محمد',           'شكراً أستاذ! فهمت الطريقة'],
  ];
  const streamTime = new Date(now.getTime() - 10 * 86400000 - 90 * 60000);
  for (let i = 0; i < chatMsgs.length; i++) {
    const [sid, stype, sname, msg] = chatMsgs[i];
    const t = new Date(streamTime.getTime() + i * 300000);
    await q(`
      INSERT INTO live_chat_messages (stream_id,sender_id,sender_type,sender_name,message,sent_at)
      VALUES ($1,$2,$3,$4,$5,$6)
    `, [ls1.id, sid, stype, sname, msg, t.toISOString()]);
  }

  console.log('  ✓ 3 جلسات بث (منتهي×1، نشط×1، مجدول×1) + شات');

  // ══════════════════════════════════════════════════════════
  // 19. نقاط إكمال الكورس
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة نقاط إكمال الكورسات...');

  // std_ali أكمل c3 (مجاني) وحصل على نقاطه
  await q(`
    INSERT INTO course_completion_points (student_id,course_id,points_awarded,awarded_at)
    VALUES ($1,$2,20,NOW()-INTERVAL '20 days')
    ON CONFLICT (student_id,course_id) DO NOTHING
  `, [STD_ALI, c3.id]);

  // يوسف أكمل c1 وc3
  await q(`
    INSERT INTO course_completion_points (student_id,course_id,points_awarded,awarded_at)
    VALUES ($1,$2,80,NOW()-INTERVAL '5 days')
    ON CONFLICT (student_id,course_id) DO NOTHING
  `, [supportIds['std_youssef'], c1.id]);
  await q(`
    INSERT INTO course_completion_points (student_id,course_id,points_awarded,awarded_at)
    VALUES ($1,$2,20,NOW()-INTERVAL '25 days')
    ON CONFLICT (student_id,course_id) DO NOTHING
  `, [supportIds['std_youssef'], c3.id]);

  console.log('  ✓ نقاط إكمال الكورسات');

  // ══════════════════════════════════════════════════════════
  // 20. الفعاليات (Stickman Run)
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة بيانات الفعاليات...');

  // std_ali لعب الأسبوع الماضي
  await q(`
    INSERT INTO event_plays (student_id,event_id,played_at,score,completed)
    VALUES ($1,'weekly-run-2025-w20', NOW()-INTERVAL '7 days', 8500, true)
  `, [STD_ALI]);

  // لاعبون آخرون لهذا الأسبوع
  const eventPlays = [
    [supportIds['std_youssef'], 'weekly-run-2025-w21', 12000, true],
    [supportIds['std_fatma'],   'weekly-run-2025-w21',  9500, true],
    [supportIds['std_omar'],    'weekly-run-2025-w21',  6200, true],
    [supportIds['std_nada'],    'weekly-run-2025-w21',  3800, false],
  ];
  for (const [sid, evid, sc, comp] of eventPlays) {
    await q(`
      INSERT INTO event_plays (student_id,event_id,played_at,score,completed)
      VALUES ($1,$2,NOW()-INTERVAL '2 days',$3,$4)
    `, [sid, evid, sc, comp]);
  }

  console.log('  ✓ بيانات الفعاليات (std_ali لعب الأسبوع الماضي)');

  // ══════════════════════════════════════════════════════════
  // 21. سجل النشاط — شامل ومتنوع
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة سجل النشاط...');

  const T = 'teacher';
  const A = 'assistant';

  const logAct = async (teachId, actorType, actorId, actorName, action, entityType, entityId, entityName, details, daysAgo, hoursOffset=0) => {
    const createdAt = new Date(now.getTime() - daysAgo * 86400000 - hoursOffset * 3600000);
    await q(`
      INSERT INTO activity_logs
        (teacher_id,actor_type,actor_id,actor_name,action,
         entity_type,entity_id,entity_name,details,ip_address,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `, [teachId, actorType, actorId, actorName, action,
        entityType, entityId, entityName, JSON.stringify(details),
        '197.34.5.' + Math.floor(Math.random()*50+50),
        createdAt.toISOString()]);
  };

  const MR = 'أ/ محمد عبد الرحمن';
  const NOUR = asstNour.name;
  const KARIM_A = asstKarim.name;

  // === تسجيل الدخول ===
  await logAct(T1,T,T1,MR,'login_teacher','teacher',T1,MR,{ip:'197.34.5.70'},30,8);
  await logAct(T1,A,asstNour.id,NOUR,'login_assistant','assistant',asstNour.id,NOUR,{ip:'197.34.5.71'},29,9);
  await logAct(T1,T,T1,MR,'login_teacher','teacher',T1,MR,{ip:'197.34.5.70'},15,7);
  await logAct(T1,A,asstNour.id,NOUR,'login_assistant','assistant',asstNour.id,NOUR,{ip:'197.34.5.72'},14,8);
  await logAct(T1,A,asstKarim.id,KARIM_A,'login_assistant','assistant',asstKarim.id,KARIM_A,{ip:'197.34.5.75'},7,10);
  await logAct(T1,T,T1,MR,'login_teacher','teacher',T1,MR,{ip:'197.34.5.70'},1,6);

  // === إنشاء وإدارة الكورسات ===
  await logAct(T1,T,T1,MR,'create_course','course',c1.id,'رياضيات الثالث — الجبر والمثلثات',{price:300,stage:'ث3'},30,7);
  await logAct(T1,T,T1,MR,'create_course','course',c2.id,'رياضيات الثالث — التفاضل والتكامل',{price:250,stage:'ث3'},30,6);
  await logAct(T1,T,T1,MR,'create_course','course',c3.id,'مقدمة مجانية',{price:0,is_free:true,stage:'ث3'},29,10);
  await logAct(T1,T,T1,MR,'create_course','course',c4.id,'رياضيات الثاني — الهندسة',{price:200,stage:'ث2'},28,9);
  await logAct(T1,T,T1,MR,'create_course','course',c5.id,'الإحصاء والاحتمالات [مسودة]',{price:200,stage:'ث3'},27,8);
  await logAct(T1,T,T1,MR,'publish_course','course',c1.id,'رياضيات الثالث — الجبر',{is_published:true},29,9);
  await logAct(T1,T,T1,MR,'publish_course','course',c2.id,'رياضيات الثالث — التفاضل',{is_published:true},29,8);
  await logAct(T1,T,T1,MR,'publish_course','course',c3.id,'مقدمة مجانية',{is_published:true},29,7);
  await logAct(T1,T,T1,MR,'publish_course','course',c4.id,'رياضيات الثاني — الهندسة',{is_published:true},28,8);
  await logAct(T1,T,T1,MR,'edit_course','course',c1.id,'رياضيات الثالث — الجبر',{changed:['description','thumbnail_url']},20,10);

  // === رفع المحتوى ===
  await logAct(T1,T,T1,MR,'upload_video','course',c1.id,'مقدمة الجبر — حل المعادلات',{video_id:c1v1,file:'algebra_intro.mp4'},29,12);
  await logAct(T1,T,T1,MR,'add_video_url','course',c1.id,'المعادلات التربيعية',{url:'youtube.com/watch?v=...'},28,11);
  await logAct(T1,A,asstNour.id,NOUR,'upload_video','course',c1.id,'المتباينات',{video_id:c1v3,file:'inequalities.mp4'},27,13);
  await logAct(T1,A,asstNour.id,NOUR,'upload_pdf','course',c1.id,'ملخص المعادلات',{pdf_id:1,file:'equations_summary.pdf'},27,12);
  await logAct(T1,T,T1,MR,'add_video_url','course',c2.id,'مقدمة التفاضل',{url:'youtube.com'},26,10);
  await logAct(T1,T,T1,MR,'upload_pdf','course',c2.id,'ملخص قواعد المشتقة',{pdf_id:2,file:'derivative_summary.pdf'},25,9);
  await logAct(T1,A,asstNour.id,NOUR,'delete_video','course',c1.id,'فيديو قديم مسودة',{video_id:999},24,14);
  await logAct(T1,A,asstNour.id,NOUR,'delete_pdf','course',c2.id,'ملاحظات غير مكتملة',{pdf_id:999},23,13);

  // === إدارة الطلاب ===
  await logAct(T1,T,T1,MR,'add_student','student',STD_ALI,'علي محمد رمضان',{username:'std_ali',stage:'ث3'},28,10);
  await logAct(T1,T,T1,MR,'add_student','student',supportIds['std_fatma'],'فاطمة أحمد سعد',{username:'std_fatma',stage:'ث3'},28,9);
  await logAct(T1,A,asstNour.id,NOUR,'add_student','student',supportIds['std_youssef'],'يوسف إبراهيم كمال',{username:'std_youssef',stage:'ث3'},27,11);
  await logAct(T1,A,asstNour.id,NOUR,'bulk_import_students','student',null,null,{count:4,failed:0},26,14);
  await logAct(T1,T,T1,MR,'bulk_import_students','student',null,null,{count:6,failed:1},20,12);
  await logAct(T1,A,asstNour.id,NOUR,'bulk_import_students','student',null,null,{count:0,failed:3},10,15);
  await logAct(T1,A,asstNour.id,NOUR,'edit_student','student',STD_ALI,'علي محمد رمضان',{changed:['phone','parent_phone']},15,11);
  await logAct(T1,T,T1,MR,'edit_student','student',supportIds['std_nada'],'ندى حسن عبد الله',{changed:['academic_stage']},12,9);
  await logAct(T1,T,T1,MR,'delete_student','student',null,'طالب مكرر اختبار',null,18,10);

  // === المدفوعات ===
  await logAct(T1,A,asstNour.id,NOUR,'approve_payment','payment',null,'علي محمد رمضان',{amount:300,method:'instapay',status:'verified'},21,13);
  await logAct(T1,A,asstNour.id,NOUR,'approve_payment','payment',null,'فاطمة أحمد سعد',{amount:300,method:'fawry',status:'verified'},20,12);
  await logAct(T1,A,asstKarim.id,KARIM_A,'approve_payment','payment',null,'يوسف إبراهيم كمال',{amount:300,method:'instapay',status:'verified'},20,11);
  await logAct(T1,A,asstKarim.id,KARIM_A,'reject_payment','payment',null,'لينا سعيد القاضي',{amount:200,method:'fawry',status:'rejected'},8,13);
  await logAct(T1,T,T1,MR,'approve_payment','payment',null,'لينا سعيد القاضي',{amount:200,method:'instapay',status:'verified'},6,9);
  await logAct(T1,T,T1,MR,'reject_payment','payment',null,'ندى حسن عبد الله',{amount:300,method:'vodafone_cash',reason:'صورة إيصال غير واضحة'},4,11);
  await logAct(T1,T,T1,MR,'add_payment','payment',null,'آدم محمود صلاح',{amount:200,method:'cash',status:'pending'},3,10);

  // === الامتحانات ===
  await logAct(T1,T,T1,MR,'create_exam','exam',e1.id,'امتحان الجبر — الوحدة الأولى',{total_score:30,duration:45},29,10);
  await logAct(T1,T,T1,MR,'publish_exam','exam',e1.id,'امتحان الجبر — الوحدة الأولى',{is_published:true,start_date:'قبل 21 يوم'},29,9);
  await logAct(T1,T,T1,MR,'create_exam','exam',e2.id,'امتحان المثلثات الشامل',{total_score:50,duration:60},28,11);
  await logAct(T1,T,T1,MR,'publish_exam','exam',e2.id,'امتحان المثلثات الشامل',{is_published:true},28,10);
  await logAct(T1,A,asstNour.id,NOUR,'create_exam','exam',e3.id,'مراجعة الدوال والرسوم',{total_score:40,duration:40},8,13);
  await logAct(T1,A,asstNour.id,NOUR,'publish_exam','exam',e3.id,'مراجعة الدوال والرسوم',{is_published:true},8,12);
  await logAct(T1,T,T1,MR,'create_exam','exam',e4.id,'الاختبار النهائي',{total_score:100,duration:90,badge:'بطل الرياضيات'},25,9);
  await logAct(T1,T,T1,MR,'publish_exam','exam',e4.id,'الاختبار النهائي',{is_published:true,start_date:'بعد 7 أيام'},25,8);
  await logAct(T1,T,T1,MR,'create_exam','exam',e5.id,'اختبار مفهوم المشتقة',{total_score:30,duration:50},18,10);
  await logAct(T1,T,T1,MR,'publish_exam','exam',e5.id,'اختبار مفهوم المشتقة',{is_published:true},18,9);
  await logAct(T1,T,T1,MR,'edit_exam','exam',e1.id,'امتحان الجبر — الوحدة الأولى',{changed:['duration_minutes','pass_score']},27,9);
  await logAct(T1,T,T1,MR,'force_reset_exam_results','exam',e1.id,'امتحان الجبر — الوحدة الأولى',{deleted_results:3},26,16);
  await logAct(T1,T,T1,MR,'approve_retry','exam',e2.id,'امتحان المثلثات الشامل',{student:'علي محمد رمضان',decision:'accepted'},8,8);
  await logAct(T1,A,asstNour.id,NOUR,'reject_retry','exam',e1.id,'امتحان الجبر',{student:'عمر سامي فرج',decision:'rejected'},4,11);

  // === المساعدون ===
  await logAct(T1,T,T1,MR,'create_assistant','assistant',asstNour.id,'نور أحمد حسين',{username:'asst_nour'},30,8);
  await logAct(T1,T,T1,MR,'create_assistant','assistant',asstKarim.id,'كريم محمود إبراهيم',{username:'asst_karim'},30,7);
  await logAct(T1,T,T1,MR,'create_assistant','assistant',asstDina.id,'دينا سعيد محمد',{username:'asst_dina'},29,9);
  await logAct(T1,T,T1,MR,'edit_assistant_perms','assistant',asstNour.id,'نور أحمد حسين',{granted:['كل الصلاحيات'],revoked:[]},30,6);
  await logAct(T1,T,T1,MR,'edit_assistant_perms','assistant',asstKarim.id,'كريم محمود إبراهيم',{granted:['إضافة طلاب','المدفوعات'],revoked:['حذف طلاب','إدارة امتحانات']},28,7);
  await logAct(T1,T,T1,MR,'edit_assistant_perms','assistant',asstDina.id,'دينا سعيد محمد',{granted:['عرض تحليلات'],revoked:['كل الباقي']},27,8);

  // === الإشعارات ===
  await logAct(T1,T,T1,MR,'send_notification','notification',null,null,{type:'new_exam',title:'امتحان الجبر الجديد',recipients:9},27,8);
  await logAct(T1,T,T1,MR,'send_notification','notification',null,null,{type:'reminder',title:'تذكير بالاختبار النهائي',recipients:5},7,9);
  await logAct(T1,A,asstNour.id,NOUR,'send_notification','notification',null,null,{type:'announcement',title:'محتوى جديد في التفاضل',recipients:4},4,12);
  await logAct(T1,A,asstNour.id,NOUR,'send_notification','notification',null,null,{type:'exam_result',title:'نتيجة امتحان الجبر',recipients:5},18,10);

  // === المتصدرون ===
  await logAct(T1,T,T1,MR,'reset_leaderboard','leaderboard',null,null,{month:'أبريل 2025',students_affected:5},1,10);

  // === البث المباشر ===
  await logAct(T1,T,T1,MR,'start_live','live_stream',ls1.id,'مراجعة الجبر والمثلثات',{room_id:'room-math-revision-001'},11,8);
  await logAct(T1,T,T1,MR,'end_live','live_stream',ls1.id,'مراجعة الجبر والمثلثات',{duration_minutes:105},10,7);
  await logAct(T1,T,T1,MR,'start_live','live_stream',ls2.id,'شرح التفاضل — الجلسة الأولى',{room_id:'room-calculus-live-001'},0,1);

  // === بنك الأسئلة ===
  await logAct(T1,T,T1,MR,'create_question_bank','question_bank',bank1.id,'بنك أسئلة الجبر والمثلثات',{subject:'رياضيات',question_count:12},29,11);
  await logAct(T1,T,T1,MR,'create_question_bank','question_bank',bank2.id,'بنك أسئلة التفاضل والتكامل',{subject:'رياضيات',question_count:6},27,10);
  await logAct(T1,A,asstNour.id,NOUR,'add_bank_questions','question_bank',bank1.id,'بنك أسئلة الجبر',{added:6},26,12);

  const totalLogs = await q(`SELECT COUNT(*) FROM activity_logs`);
  console.log(`  ✓ ${totalLogs[0].count} سجل نشاط متنوع`);

  // ══════════════════════════════════════════════════════════
  // ملخص نهائي
  // ══════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ✅ البيانات التجريبية الشاملة اكتملت بنجاح!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n  🔑 الحسابات المحورية الثلاثة:');
  console.log('  ┌─────────────────────────────────────────────────────────────────┐');
  console.log('  │  🎓 المعلم — أكاديمية محمد للرياضيات                           │');
  console.log('  │     admin / admin123   →  رابط: /admin/teacher                 │');
  console.log('  │     ✓ 6 كورسات (مدفوع×3، مجاني×2، مسودة×1)                   │');
  console.log('  │     ✓ 10 امتحانات (منتهية/جارية/قادمة/غير منشور)              │');
  console.log('  │     ✓ 11 طالب بمراحل مختلفة                                    │');
  console.log('  │     ✓ 3 مساعدين بصلاحيات متفاوتة                              │');
  console.log('  │     ✓ مدفوعات بكل الحالات (verified/pending/rejected)          │');
  console.log('  │     ✓ بنك أسئلة بمستويات صعوبة                                │');
  console.log('  │     ✓ بث مباشر (منتهي/نشط/مجدول)                             │');
  console.log('  │     ✓ سجل نشاط شامل + إشعارات + متصدرون                       │');
  console.log('  ├─────────────────────────────────────────────────────────────────┤');
  console.log('  │  🧑‍💼 المساعد — صلاحيات كاملة                                   │');
  console.log('  │     asst_nour / 123456  →  رابط: /admin/assistant              │');
  console.log('  │     ✓ كل الصلاحيات: طلاب/امتحانات/مدفوعات/كورسات/إشعارات     │');
  console.log('  │     ✓ نشاط مسبق موثّق في السجل                                │');
  console.log('  ├─────────────────────────────────────────────────────────────────┤');
  console.log('  │  🎒 الطالب — يغطي كل السيناريوهات                              │');
  console.log('  │     std_ali / 123456    →  رابط: /admin/student                │');
  console.log('  │     ✓ كورسات: 2 مدفوعة مسجّل + 1 مجاني + 1 طلب pending        │');
  console.log('  │     ✓ امتحانات خدّها: جبر (27/30)، تفاضل (30/30 شارة!)        │');
  console.log('  │     ✓ امتحان خدّه وراسب ثم أعاده ونجح (مثلثات 38/50)          │');
  console.log('  │     ✓ امتحانات متاحة الآن (لم يمتحنها بعد)                    │');
  console.log('  │     ✓ امتحان قادم (وقته لم يجئ بعد)                           │');
  console.log('  │     ✓ تقدم فيديو: مكتمل/جزئي/لم يبدأ                         │');
  console.log('  │     ✓ 2 شارات + ترتيب 2 في المتصدرين + نقاط 1250              │');
  console.log('  │     ✓ إشعارات (مقروءة + غير مقروءة)                           │');
  console.log('  │     ✓ شارك في بث مباشر منتهي                                  │');
  console.log('  └─────────────────────────────────────────────────────────────────┘');
  console.log('\n  🔗 مساعدون إضافيون للمقارنة:');
  console.log('     asst_karim / 123456 — صلاحيات جزئية (طلاب + مدفوعات فقط)');
  console.log('     asst_dina  / 123456 — صلاحيات منخفضة (عرض تحليلات فقط)');
  console.log('\n  📌 ملاحظة: كل الحسابات على منصة admin (الرابط يبدأ بـ /admin/)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

seed()
  .catch(err => {
    console.error('\n❌ خطأ في الـ seed:', err.message);
    console.error(err.stack);
    process.exit(1);
  })
  .finally(() => pool.end());
