/**
 * WATHBA — Seed File (مُعاد بناؤه بالكامل)
 * ─────────────────────────────────────────────────────────────────
 * الحسابات المحورية الثلاثة:
 *   🎓 المعلم    : admin / admin123       — أكاديمية محمد للرياضيات
 *   🧑‍💼 المساعد  : asst_nour / 123456     — صلاحيات كاملة
 *   🎒 الطالب   : std_ali / 123456        — يغطي كل سيناريوهات الطالب
 *
 * الجداول المغطّاة (كاملة):
 *   teachers, assistants, students
 *   courses, sections, videos, pdf_files
 *   question_banks, bank_questions
 *   exams, questions, exam_sessions, exam_results, exam_retry_requests
 *   student_course_enrollment, course_enrollment_requests
 *   payments, video_progress, badges, course_completion_points
 *   notification_log, leaderboard_history, leaderboard_reset_tracker
 *   live_streams, live_stream_viewers, live_chat_messages, live_hand_raises
 *   event_plays, game_session_tokens
 *   student_devices, device_alerts
 *   activity_logs
 *   whatsapp_schedules, whatsapp_send_log
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
  console.log('  🌱 WATHBA — بيانات تجريبية شاملة (مُعاد بناؤه بالكامل)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ══════════════════════════════════════════════════════════
  // 0. مسح البيانات القديمة (بالترتيب الصحيح للـ FK)
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  مسح البيانات القديمة...');
  const tables = [
    'whatsapp_send_log', 'whatsapp_schedules',
    'activity_logs', 'game_session_tokens',
    'device_alerts', 'student_devices',
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

  // كلمات المرور الجاهزة
  const pass6  = await bcrypt.hash('123456',  10);
  const passAd = await bcrypt.hash('admin123', 10);

  // دوال مساعدة للتواريخ
  const now    = new Date();
  const past   = d => new Date(now.getTime() - d * 86400000).toISOString();
  const future = d => new Date(now.getTime() + d * 86400000).toISOString();

  // ══════════════════════════════════════════════════════════
  // 1. المعلم الرئيسي (admin)
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إعداد المعلم الرئيسي...');
  let [adminRow] = await q(`SELECT id FROM teachers WHERE username='admin'`);
  if (!adminRow) {
    [adminRow] = await q(`
      INSERT INTO teachers
        (username,password,name,bio,classification,whatsapp_phone,
         slug,platform_name,logo_url,photo_url)
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
        photo_url='https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=300&h=300&fit=crop',
        force_password_change=true
      WHERE id=$1
    `, [adminRow.id, passAd]);
  }
  // [M-16] Mark seed admin as requiring a password change on first login
  await q(`UPDATE teachers SET force_password_change=true WHERE username='admin'`).catch(() => {});
  const T1 = adminRow.id;
  console.log(`  ✓ admin (id=${T1}) — slug=admin — أكاديمية محمد للرياضيات`);

  // ══════════════════════════════════════════════════════════
  // 2. المساعدون (3 مساعدين بصلاحيات مختلفة)
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة المساعدين...');

  const passA1 = await bcrypt.hash('123456', 10);
  const passA2 = await bcrypt.hash('123456', 10);
  const passA3 = await bcrypt.hash('123456', 10);

  await q(`
    INSERT INTO assistants
      (username,password,name,phone,teacher_id,
       can_add_students,can_edit_students,can_delete_students,
       can_manage_exams,can_view_analytics,can_send_reports,
       can_manage_payments,can_manage_courses,can_send_notifications)
    VALUES
      ('asst_nour',$1,'نور أحمد حسين','+201111111101',$4,
       true,true,true,true,true,true,true,true,true),
      ('asst_karim',$2,'كريم محمود إبراهيم','+201111111102',$4,
       true,true,false,false,true,false,true,false,false),
      ('asst_dina',$3,'دينا سعيد محمد','+201111111103',$4,
       false,false,false,false,true,false,false,false,false)
  `, [passA1, passA2, passA3, T1]);

  const [asstNour]  = await q(`SELECT id,name FROM assistants WHERE username='asst_nour'`);
  const [asstKarim] = await q(`SELECT id,name FROM assistants WHERE username='asst_karim'`);
  const [asstDina]  = await q(`SELECT id,name FROM assistants WHERE username='asst_dina'`);
  console.log('  ✓ 3 مساعدين: asst_nour (كاملة) | asst_karim (جزئية) | asst_dina (عرض فقط)');

  // ══════════════════════════════════════════════════════════
  // 3. الطلاب (11 طالب)
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الطلاب...');

  const [stdAliRow] = await q(`
    INSERT INTO students
      (username,password,name,phone,parent_phone,
       academic_stage,gender,teacher_id,points,is_suspended)
    VALUES ('std_ali',$1,'علي محمد رمضان',
            '+201200000001','+201200000002',
            'الصف الثالث الثانوي','ذكر',$2,1250,false)
    RETURNING id,name
  `, [pass6, T1]);
  const STD_ALI = stdAliRow.id;

  const studentsData = [
    // [username, name, phone, parentPhone, stage, gender, points, isSuspended]
    ['std_fatma',   'فاطمة أحمد سعد',        '+201200000003', '+201200000004', 'الصف الثالث الثانوي', 'أنثى',  980, false],
    ['std_youssef', 'يوسف إبراهيم كمال',     '+201200000005', '+201200000006', 'الصف الثالث الثانوي', 'ذكر',  1100, false],
    ['std_nada',    'ندى حسن عبد الله',      '+201200000007', '+201200000008', 'الصف الثالث الثانوي', 'أنثى',  640, false],
    ['std_omar',    'عمر سامي فرج',          '+201200000009', '+201200000010', 'الصف الثالث الثانوي', 'ذكر',   720, false],
    ['std_mostafa', 'مصطفى أسامة نور',       '+201200000025', '+201200000026', 'الصف الثاني الثانوي', 'ذكر',   340, false],
    ['std_rana',    'رنا طارق عبد العزيز',   '+201200000027', '+201200000028', 'الصف الثاني الثانوي', 'أنثى',  420, false],
    ['std_adam',    'آدم محمود صلاح',        '+201200000029', '+201200000030', 'الصف الثاني الثانوي', 'ذكر',   295, false],
    ['std_lina',    'لينا سعيد القاضي',      '+201200000031', '+201200000032', 'الصف الثاني الثانوي', 'أنثى',  380, false],
    ['std_hana',    'هناء وليد منصور',       '+201200000033', '+201200000034', 'الصف الأول الثانوي',  'أنثى',  150, false],
    ['std_hassan',  'حسن علاء طارق',         '+201200000035', '+201200000036', 'الصف الأول الثانوي',  'ذكر',   190, false],
  ];

  const sids = {};
  for (const [user, name, phone, pPhone, stage, gender, pts, susp] of studentsData) {
    const [r] = await q(`
      INSERT INTO students
        (username,password,name,phone,parent_phone,
         academic_stage,gender,teacher_id,points,is_suspended)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id
    `, [user, pass6, name, phone, pPhone, stage, gender, T1, pts, susp]);
    sids[user] = r.id;
  }

  const S_TH3 = [STD_ALI, sids['std_fatma'], sids['std_youssef'], sids['std_nada'], sids['std_omar']];
  const S_TH2 = [sids['std_mostafa'], sids['std_rana'], sids['std_adam'], sids['std_lina']];
  const S_TH1 = [sids['std_hana'], sids['std_hassan']];
  console.log('  ✓ 11 طالب (std_ali: الحساب المحوري — ث3 — 1250 نقطة)');

  // ══════════════════════════════════════════════════════════
  // 4. الكورسات (6 كورسات — كل الحالات الممكنة)
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الكورسات...');

  const [c1] = await q(`
    INSERT INTO courses
      (name,description,price,teacher_id,target_stage,
       is_published,is_free,points_on_complete,thumbnail_url)
    VALUES (
      'رياضيات الثالث الثانوي — الجبر والمثلثات',
      'شرح مفصّل لكل أبواب الجبر والمثلثات منهج الثانوية العامة مع أكثر من 200 مسألة محلولة وامتحانات تفاعلية شاملة.',
      300,$1,'الصف الثالث الثانوي',true,false,80,
      'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&h=340&fit=crop')
    RETURNING id
  `, [T1]);

  const [c2] = await q(`
    INSERT INTO courses
      (name,description,price,teacher_id,target_stage,
       is_published,is_free,points_on_complete,thumbnail_url)
    VALUES (
      'رياضيات الثالث الثانوي — التفاضل والتكامل',
      'الباب الأصعب في المنهج بأسلوب مبسط خطوة بخطوة مع تطبيقات عملية وامتحانات تدريبية مكثفة.',
      250,$1,'الصف الثالث الثانوي',true,false,60,
      'https://images.unsplash.com/photo-1509228627152-72ae9ae6848d?w=600&h=340&fit=crop')
    RETURNING id
  `, [T1]);

  const [c3] = await q(`
    INSERT INTO courses
      (name,description,price,teacher_id,target_stage,
       is_published,is_free,points_on_complete,thumbnail_url)
    VALUES (
      'مقدمة مجانية — أساسيات الرياضيات للثانوية',
      'درس تعريفي مجاني كامل يشمل المفاهيم الأساسية — اكتشف أسلوب الشرح وابدأ مجاناً بدون أي رسوم.',
      0,$1,'الصف الثالث الثانوي',true,true,20,
      'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=600&h=340&fit=crop')
    RETURNING id
  `, [T1]);

  const [c4] = await q(`
    INSERT INTO courses
      (name,description,price,teacher_id,target_stage,
       is_published,is_free,points_on_complete,thumbnail_url)
    VALUES (
      'رياضيات الثاني الثانوي — الهندسة التحليلية',
      'أساسيات وتطبيقات الهندسة التحليلية بطريقة مبسطة مع تمارين تفصيلية على كل درس.',
      200,$1,'الصف الثاني الثانوي',true,false,40,
      'https://images.unsplash.com/photo-1596495578065-6e0763fa1178?w=600&h=340&fit=crop')
    RETURNING id
  `, [T1]);

  const [c5] = await q(`
    INSERT INTO courses
      (name,description,price,teacher_id,target_stage,
       is_published,is_free,points_on_complete,thumbnail_url)
    VALUES (
      'رياضيات الثالث الثانوي — الإحصاء والاحتمالات [مسودة]',
      'كورس قيد الإعداد — سيتم نشره قريباً بعد اكتمال رفع المحتوى والامتحانات.',
      200,$1,'الصف الثالث الثانوي',false,false,50,
      'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=340&fit=crop')
    RETURNING id
  `, [T1]);

  const [c6] = await q(`
    INSERT INTO courses
      (name,description,price,teacher_id,target_stage,
       is_published,is_free,points_on_complete,thumbnail_url)
    VALUES (
      'مقدمة مجانية — الجبر للثاني الثانوي',
      'درس تعريفي مجاني لطلاب الثاني الثانوي يغطي المفاهيم الأساسية.',
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

  const addVid = async (courseId, sectionId, title, url, mins, order, url480 = null, url720 = null) => {
    const [v] = await q(
      `INSERT INTO videos
         (course_id,section_id,title,file_path_or_url,duration_minutes,sort_order,url_480,url_720)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [courseId, sectionId, title, url, mins, order, url480, url720]
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
  const c1s1 = await addSec(c1.id, 'الباب الأول — المعادلات والمتباينات', 1);
  const c1s2 = await addSec(c1.id, 'الباب الثاني — المثلثات', 2);
  const c1s3 = await addSec(c1.id, 'الباب الثالث — الدوال والرسوم البيانية', 3);

  const c1v1 = await addVid(c1.id, c1s1, 'مقدمة الجبر — حل المعادلات من الدرجة الأولى', YT1, 28, 1);
  const c1v2 = await addVid(c1.id, c1s1, 'المعادلات التربيعية وطرق الحل', YT2, 35, 2);
  const c1v3 = await addVid(c1.id, c1s1, 'المتباينات وتمثيلها على محور الأعداد', YT3, 22, 3);
  const c1v4 = await addVid(c1.id, c1s2, 'مقدمة المثلثات — النسب المثلثية الأساسية', YT1, 30, 1);
  const c1v5 = await addVid(c1.id, c1s2, 'النسب المثلثية للزوايا الخاصة', YT2, 40, 2);
  const c1v6 = await addVid(c1.id, c1s2, 'قاعدة الجيب وقاعدة جيب التمام', YT3, 38, 3);
  const c1v7 = await addVid(c1.id, c1s3, 'الدوال الخطية والتربيعية — رسم البيان', YT1, 32, 1);
  const c1v8 = await addVid(c1.id, c1s3, 'التطبيقات العملية على الدوال', YT4, 25, 2);
  const c1v9 = await addVid(c1.id, c1s3, 'مراجعة شاملة — الباب الثالث', YT2, 20, 3);
  await addPdf(c1.id, c1s1, 'ملخص المعادلات والمتباينات PDF', PDF);
  await addPdf(c1.id, c1s2, 'جدول النسب المثلثية + تدريبات محلولة', PDF);
  await addPdf(c1.id, c1s3, 'ورقة عمل الدوال — 50 سؤال محلول', PDF);
  await addPdf(c1.id, c1s1, 'بنك أسئلة المعادلات من الثانوية العامة', PDF);

  // ── C2: تفاضل وتكامل (2 قسم، 6 فيديوهات، 3 PDF) ──
  const c2s1 = await addSec(c2.id, 'الوحدة الأولى — مفهوم المشتقة وقواعدها', 1);
  const c2s2 = await addSec(c2.id, 'الوحدة الثانية — التكامل وتطبيقاته', 2);

  const c2v1 = await addVid(c2.id, c2s1, 'مقدمة التفاضل — مفهوم النهايات', YT1, 35, 1);
  const c2v2 = await addVid(c2.id, c2s1, 'قواعد المشتقة — الجمع والضرب والقسمة', YT2, 42, 2);
  const c2v3 = await addVid(c2.id, c2s1, 'تطبيقات المشتقة — الحد الأقصى والأدنى', YT3, 38, 3);
  const c2v4 = await addVid(c2.id, c2s2, 'مقدمة التكامل — مفهوم المضاد', YT4, 30, 1);
  const c2v5 = await addVid(c2.id, c2s2, 'قوانين التكامل الأساسية', YT1, 45, 2);
  const c2v6 = await addVid(c2.id, c2s2, 'التكامل المحدود وحساب المساحات', YT2, 40, 3);
  await addPdf(c2.id, c2s1, 'ملخص قواعد المشتقة المكثف', PDF);
  await addPdf(c2.id, c2s2, 'تمارين التكامل — 100 مسألة محلولة', PDF);
  await addPdf(c2.id, c2s2, 'نماذج امتحانات الثانوية العامة في التفاضل', PDF);

  // ── C3: مجاني (1 قسم، 3 فيديوهات، 1 PDF) ──
  const c3s1 = await addSec(c3.id, 'الدرس التعريفي المجاني', 1);
  const c3v1 = await addVid(c3.id, c3s1, 'درس مجاني — الحساب الذهني وأساسيات الجبر', YT1, 20, 1);
  const c3v2 = await addVid(c3.id, c3s1, 'درس مجاني — مقدمة في علم الرياضيات', YT2, 18, 2);
  const c3v3 = await addVid(c3.id, c3s1, 'درس مجاني — كيف تستعد لمنهج الثانوية', YT3, 15, 3);
  await addPdf(c3.id, c3s1, 'خطة المنهج والجدول الزمني الكامل', PDF);

  // ── C4: هندسة تحليلية ث2 (2 قسم، 4 فيديوهات، 2 PDF) ──
  const c4s1 = await addSec(c4.id, 'الباب الأول — الإحداثيات والمسافة', 1);
  const c4s2 = await addSec(c4.id, 'الباب الثاني — المستقيمات والدائرة', 2);
  const c4v1 = await addVid(c4.id, c4s1, 'نظام الإحداثيات الديكارتي', YT1, 25, 1);
  const c4v2 = await addVid(c4.id, c4s1, 'المسافة بين نقطتين ومنتصف القطعة', YT2, 30, 2);
  const c4v3 = await addVid(c4.id, c4s2, 'معادلة المستقيم بأشكالها المختلفة', YT3, 35, 1);
  const c4v4 = await addVid(c4.id, c4s2, 'الدائرة — معادلتها وتطبيقاتها', YT4, 40, 2);
  await addPdf(c4.id, c4s1, 'ملخص الإحداثيات', PDF);
  await addPdf(c4.id, c4s2, 'تدريبات الدائرة والمستقيم', PDF);

  // ── C5: مسودة (1 قسم، 1 فيديو، 1 PDF — غير مكتملة) ──
  const c5s1 = await addSec(c5.id, 'الباب الأول — مقدمة في الإحصاء', 1);
  await addVid(c5.id, c5s1, 'مقدمة الإحصاء — المفاهيم الأساسية', YT1, 22, 1);
  await addPdf(c5.id, c5s1, 'مخطط المحتوى القادم', PDF);

  // ── C6: مجاني ث2 (1 قسم، 1 فيديو، 1 PDF) ──
  const c6s1 = await addSec(c6.id, 'الدرس التعريفي', 1);
  await addVid(c6.id, c6s1, 'مقدمة لطلاب الثاني الثانوي', YT1, 15, 1);
  await addPdf(c6.id, c6s1, 'خطة المنهج', PDF);

  console.log('  ✓ الأقسام والفيديوهات والـ PDF اكتملت');

  // ══════════════════════════════════════════════════════════
  // 6. بنك الأسئلة (2 بنك — مع أسئلة فردية ومجمّعة)
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

  // أسئلة بنك 1 (جبر) — مستويات مختلفة
  const bankQ1 = [
    ['mcq','حل المعادلة 3x - 9 = 0','x = 1','x = 2','x = 3','x = 9','C',1,'easy'],
    ['mcq','حل المعادلة التربيعية x² - 5x + 6 = 0','x=1 أو x=6','x=2 أو x=3','x=-2 أو x=-3','x=0 أو x=5','B',2,'medium'],
    ['mcq','sin(30°) يساوي','1','1/2','√3/2','0','B',1,'easy'],
    ['mcq','cos(60°) يساوي','√3/2','1','1/2','0','C',1,'easy'],
    ['mcq','sin²(x) + cos²(x) يساوي','0','1/2','1','2','C',2,'easy'],
    ['mcq','المتباينة 2x + 4 > 10، إذن x','x > 2','x > 3','x < 3','x = 3','B',2,'medium'],
    ['mcq','الجذر التربيعي لـ 144','11','12','13','14','B',1,'easy'],
    ['true_false','العدد -5 يُعدّ حلاً للمعادلة x² = 25','صح','خطأ',null,null,'T',1,'easy'],
    ['true_false','sin(90°) = 1','صح','خطأ',null,null,'T',1,'easy'],
    ['mcq','إذا كان f(x) = x² + 2x فإن f(3) =','9','12','15','6','C',3,'hard'],
    ['mcq','مجموع جذري المعادلة x² - 7x + 12 = 0','3','4','7','12','C',3,'hard'],
    ['mcq','قيمة tan(45°)','0','1','√3','1/√2','B',2,'medium'],
  ];
  for (const [type, text, a, b, c, d, ans, pts, diff] of bankQ1) {
    await q(`
      INSERT INTO bank_questions
        (bank_id,question_text,option_a,option_b,option_c,option_d,
         correct_answer_letter,points,question_type,difficulty)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [bank1.id, text, a, b, c, d, ans, pts, type, diff]);
  }

  // أسئلة بنك 2 (تفاضل)
  const bankQ2 = [
    ['mcq','مشتقة الدالة f(x) = x³','3x²','x²','3x','2x³','A',2,'medium'],
    ['mcq','مشتقة الثابت تساوي','1','0','الثابت نفسه','غير معرّفة','B',1,'easy'],
    ['mcq','مشتقة f(x) = 5x² عند x=2','10','20','40','5','B',2,'medium'],
    ['true_false','مشتقة الدالة sin(x) هي cos(x)','صح','خطأ',null,null,'T',1,'easy'],
    ['mcq','تكامل (2x) dx = ','x²','x² + c','2x² + c','x + c','B',2,'medium'],
    ['mcq','قيمة ∫₀¹ x dx','1/4','1/2','1','2','B',3,'hard'],
  ];
  for (const [type, text, a, b, c, d, ans, pts, diff] of bankQ2) {
    await q(`
      INSERT INTO bank_questions
        (bank_id,question_text,option_a,option_b,option_c,option_d,
         correct_answer_letter,points,question_type,difficulty)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [bank2.id, text, a, b, c, d, ans, pts, type, diff]);
  }

  // أسئلة مجمّعة — بنك 1: مثلث قائم (3 أسئلة بسياق مشترك)
  const GRP_B1 = 20011;
  const GRP_B1_CTX =
    'في مثلث ABC قائم الزاوية عند C، الضلعان المحيطان بالزاوية القائمة هما:\n' +
    'a = BC = 3 سم، و b = AC = 4 سم.\n' +
    'احسب ما يُطلب في الأسئلة التالية باستخدام هذه المعطيات.';
  const bankGroup1 = [
    ['ما طول الوتر AB في هذا المثلث؟',   '5 سم', '6 سم', '7 سم', '√7 سم', 'A', 2, 'medium'],
    ['ما قيمة sin(A) في هذا المثلث؟',     '3/5',  '4/5',  '4/3',  '3/4',   'A', 2, 'medium'],
    ['ما قيمة cos(A) في هذا المثلث؟',     '3/5',  '4/5',  '3/4',  '4/3',   'B', 2, 'medium'],
  ];
  for (const [text, a, b, c, d, ans, pts, diff] of bankGroup1) {
    await q(`
      INSERT INTO bank_questions
        (bank_id,question_text,option_a,option_b,option_c,option_d,
         correct_answer_letter,points,question_type,difficulty,
         group_id,group_context,group_context_image)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'mcq',$9,$10,$11,$12)
    `, [bank1.id, text, a, b, c, d, ans, pts, diff, GRP_B1, GRP_B1_CTX, null]);
  }

  // أسئلة مجمّعة — بنك 2: تحليل دالة (3 أسئلة بسياق مشترك)
  const GRP_B2 = 20021;
  const GRP_B2_CTX =
    'لتكن الدالة f(x) = x³ − 3x² + 2\n' +
    '• مشتقة الدالة: f\'(x) = 3x² − 6x = 3x(x − 2)\n' +
    '• الدالة لها نقطتا قصوى عند x = 0 و x = 2\n' +
    'استخدم هذه المعلومات للإجابة عن الأسئلة التالية.';
  const bankGroup2 = [
    ['ما قيمة f(0) للدالة المعطاة؟',                    '2',     '0',     '-2',    '3',    'A', 2, 'medium'],
    ['ما قيمة f\'(x) عند x = 1؟',                       '-3',    '0',     '3',     '-1',   'A', 2, 'medium'],
    ['الدالة f(x) متناقصة في الفترة التي تقع في',        '[0,2]', '[1,3]', '[-1,0]','[2,4]','A', 3, 'hard'],
  ];
  for (const [text, a, b, c, d, ans, pts, diff] of bankGroup2) {
    await q(`
      INSERT INTO bank_questions
        (bank_id,question_text,option_a,option_b,option_c,option_d,
         correct_answer_letter,points,question_type,difficulty,
         group_id,group_context,group_context_image)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'mcq',$9,$10,$11,$12)
    `, [bank2.id, text, a, b, c, d, ans, pts, diff, GRP_B2, GRP_B2_CTX, null]);
  }

  console.log('  ✓ 2 بنك أسئلة (12 جبر + 3 مجمّعة، 6 تفاضل + 3 مجمّعة)');

  // ══════════════════════════════════════════════════════════
  // 7. الامتحانات (11 امتحان — كل الحالات)
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الامتحانات...');

  // E1 — منتهي (c1 ث3) — std_ali نجح ✅
  const [e1] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,pass_score,teacher_id,course_id,
       is_published,start_date,end_date,badge_name,badge_color,
       points_on_attempt,points_on_pass,shuffle_questions,shuffle_options,
       question_source)
    VALUES ('امتحان الجبر — الوحدة الأولى',45,30,15,$1,$2,
            true,$3,$4,'نجم الجبر','#f97316',5,20,false,false,'manual')
    RETURNING id
  `, [T1, c1.id, past(21), past(14)]);

  // E2 — منتهي (c1 ث3) — std_ali راسب + طلب إعادة مقبول ✅
  const [e2] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,pass_score,teacher_id,course_id,
       is_published,start_date,end_date,badge_name,badge_color,
       points_on_attempt,points_on_pass,question_source)
    VALUES ('امتحان المثلثات الشامل',60,50,30,$1,$2,
            true,$3,$4,'متفوق الرياضيات','#7c3aed',5,25,'manual')
    RETURNING id
  `, [T1, c1.id, past(14), past(7)]);

  // E3 — متاح الآن (c1 ث3) — std_ali لم يمتحنه بعد 🕐
  const [e3] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,pass_score,teacher_id,course_id,
       is_published,start_date,end_date,points_on_attempt,points_on_pass,
       question_source)
    VALUES ('مراجعة الدوال والرسوم البيانية',40,40,20,$1,$2,
            true,$3,$4,5,15,'manual')
    RETURNING id
  `, [T1, c1.id, past(2), future(5)]);

  // E4 — قادم (c1 ث3) — وقته لم يجئ بعد ⏳
  const [e4] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,pass_score,teacher_id,course_id,
       is_published,start_date,end_date,badge_name,badge_color,
       points_on_attempt,points_on_pass,shuffle_questions,shuffle_options,
       question_source)
    VALUES ('الاختبار النهائي — الجبر والمثلثات',90,100,60,$1,$2,
            true,$3,$4,'بطل الرياضيات','#f59e0b',10,40,true,true,'manual')
    RETURNING id
  `, [T1, c1.id, future(7), future(14)]);

  // E5 — منتهي (c2 تفاضل) — std_ali نجح بامتياز + شارة ✅
  const [e5] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,pass_score,teacher_id,course_id,
       is_published,start_date,end_date,badge_name,badge_color,
       points_on_attempt,points_on_pass,question_source)
    VALUES ('اختبار مفهوم المشتقة',50,30,15,$1,$2,
            true,$3,$4,'عبقري التفاضل','#10b981',5,20,'manual')
    RETURNING id
  `, [T1, c2.id, past(10), past(3)]);

  // E6 — متاح الآن (c2 تفاضل) — std_ali لم يمتحنه بعد 🕐
  const [e6] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,pass_score,teacher_id,course_id,
       is_published,start_date,end_date,points_on_attempt,points_on_pass,
       question_source)
    VALUES ('اختبار التكامل وتطبيقاته',45,30,15,$1,$2,
            true,$3,$4,5,15,'manual')
    RETURNING id
  `, [T1, c2.id, past(1), future(6)]);

  // E7 — منتهي (c3 مجاني) — std_ali امتحنه ✅
  const [e7] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,pass_score,teacher_id,course_id,
       is_published,start_date,end_date,points_on_attempt,points_on_pass,
       question_source)
    VALUES ('اختبار التشخيص المجاني',20,20,10,$1,$2,
            true,$3,$4,3,10,'manual')
    RETURNING id
  `, [T1, c3.id, past(30), past(20)]);

  // E8 — غير منشور مسودة (c5) — لا يرى الطلاب 🔒
  const [e8] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,pass_score,teacher_id,course_id,
       is_published,start_date,end_date,points_on_attempt,points_on_pass,
       question_source)
    VALUES ('اختبار الإحصاء — مسودة',60,50,25,$1,$2,
            false,$3,$4,5,20,'manual')
    RETURNING id
  `, [T1, c5.id, future(30), future(45)]);

  // E9 — متاح (c4 ث2) — للطلاب الآخرين
  const [e9] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,pass_score,teacher_id,course_id,
       is_published,start_date,end_date,points_on_attempt,points_on_pass,
       question_source)
    VALUES ('اختبار الهندسة التحليلية',30,20,10,$1,$2,
            true,$3,$4,5,10,'manual')
    RETURNING id
  `, [T1, c4.id, past(5), future(10)]);

  // E10 — قادم (c4 ث2)
  const [e10] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,pass_score,teacher_id,course_id,
       is_published,start_date,end_date,points_on_attempt,points_on_pass,
       question_source)
    VALUES ('الاختبار النهائي — الهندسة التحليلية',60,50,25,$1,$2,
            true,$3,$4,5,20,'manual')
    RETURNING id
  `, [T1, c4.id, future(14), future(21)]);

  // E11 — امتحان بالأسئلة المجمّعة (c1) — متاح الآن
  const [e11] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,pass_score,teacher_id,course_id,
       is_published,start_date,end_date,badge_name,badge_color,
       points_on_attempt,points_on_pass,shuffle_questions,shuffle_options,
       question_source)
    VALUES ('اختبار قراءة وتحليل — أسئلة مجمّعة',50,40,20,$1,$2,
            true,$3,$4,'محلل بارع','#06b6d4',5,20,false,false,'manual')
    RETURNING id
  `, [T1, c1.id, past(1), future(9)]);

  console.log('  ✓ 11 امتحانات (منتهية، جارية، قادمة، غير منشورة، مجمّعة)');

  // ══════════════════════════════════════════════════════════
  // 8. أسئلة الامتحانات
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة أسئلة الامتحانات...');

  const mcq = async (eid, text, a, b, c, d, ans, pts) => q(`
    INSERT INTO questions
      (exam_id,question_text,option_a,option_b,option_c,option_d,
       correct_answer_letter,points,question_type)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'mcq')
  `, [eid, text, a, b, c, d, ans, pts]);

  const tf = async (eid, text, ans, pts) => q(`
    INSERT INTO questions
      (exam_id,question_text,option_a,option_b,option_c,option_d,
       correct_answer_letter,points,question_type)
    VALUES ($1,$2,'صح','خطأ',NULL,NULL,$3,$4,'true_false')
  `, [eid, text, ans, pts]);

  const grpMcq = async (eid, gid, ctx, img, text, a, b, c, d, ans, pts) => q(`
    INSERT INTO questions
      (exam_id,question_text,option_a,option_b,option_c,option_d,
       correct_answer_letter,points,question_type,group_id,group_context,group_context_image)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'mcq',$9,$10,$11)
  `, [eid, text, a, b, c, d, ans, pts, gid, ctx, img || null]);

  const grpTf = async (eid, gid, ctx, img, text, ans, pts) => q(`
    INSERT INTO questions
      (exam_id,question_text,option_a,option_b,option_c,option_d,
       correct_answer_letter,points,question_type,group_id,group_context,group_context_image)
    VALUES ($1,$2,'صح','خطأ',NULL,NULL,$3,$4,'true_false',$5,$6,$7)
  `, [eid, text, ans, pts, gid, ctx, img || null]);

  // E1 — 10 أسئلة × 3 = 30
  await mcq(e1.id,'حل المعادلة: 2x + 6 = 14','x=3','x=4','x=5','x=10','B',3);
  await mcq(e1.id,'إذا كان 3x − 9 = 0 فإن x =','1','2','3','9','C',3);
  await mcq(e1.id,'حل x² − 5x + 6 = 0','x=1 أو x=6','x=2 أو x=3','x=−2 أو x=−3','x=0 أو x=5','B',3);
  await mcq(e1.id,'المتباينة x + 3 > 7 تعني','x>4','x<4','x=4','x>10','A',3);
  await mcq(e1.id,'الجذر الموجب لـ x² = 25','√5','5','10','25','B',3);
  await mcq(e1.id,'قيمة y = 2x+1 عند x=3','5','7','9','3','B',3);
  await mcq(e1.id,'إذا كان f(x)=x² فإن f(4) =','8','12','16','4','C',3);
  await mcq(e1.id,'حل المتباينة 2x < 10','x<5','x>5','x=5','x<20','A',3);
  await tf(e1.id,'العدد −3 يُعدّ حلاً للمعادلة x² = 9','T',3);
  await tf(e1.id,'مجموع حلّي x² − 5x + 6 = 0 يساوي 5','T',3);

  // E2 — 10 أسئلة × 5 = 50
  await mcq(e2.id,'sin(30°) =','1/√2','1/2','√3/2','1','B',5);
  await mcq(e2.id,'cos(60°) =','√3/2','1','1/2','0','C',5);
  await mcq(e2.id,'tan(45°) =','0','√2/2','1','√3','C',5);
  await mcq(e2.id,'sin(90°) =','0','√2/2','1','−1','C',5);
  await mcq(e2.id,'cos(0°) =','0','1','−1','1/2','B',5);
  await mcq(e2.id,'sin²(x) + cos²(x) =','0','1/2','1','2','C',5);
  await mcq(e2.id,'tan(θ) = sin(θ) ÷ ___','sin(θ)','tan(θ)','cos(θ)','sec(θ)','C',5);
  await mcq(e2.id,'الوتر في المثلث القائم هو','الضلع الأقصر','الضلع المقابل للزاوية القائمة','الضلع المجاور','الضلع الأطول','B',5);
  await tf(e2.id,'sin(60°) = cos(30°)','T',5);
  await tf(e2.id,'tan(90°) قيمة غير محددة','T',5);

  // E3 — 8 أسئلة × 5 = 40
  await mcq(e3.id,'الدالة f(x) = 2x+3 عند x=5 تساوي','10','13','16','23','B',5);
  await mcq(e3.id,'قاطع الصادات لمستقيم y=3x-6','2','−6','6','3','B',5);
  await mcq(e3.id,'الميل للمستقيم y = -2x + 1','1','−1','2','−2','D',5);
  await mcq(e3.id,'الدالة f(x) = x² قطعية مكافئة تفتح إلى','اليسار','اليمين','الأعلى','الأسفل','C',5);
  await mcq(e3.id,'إذا f(x) = x²-4 فإن f(2) =','0','4','−4','2','A',5);
  await tf(e3.id,'الدالة الثابتة f(x)=5 ميلها يساوي صفر','T',5);
  await tf(e3.id,'مستقيمان متوازيان لهما نفس الميل','T',5);
  await tf(e3.id,'ميل المستقيم العمودي على محور السينات يساوي صفر','F',5);

  // E4 — 10 أسئلة × 10 = 100
  await mcq(e4.id,'حل x² + 2x - 15 = 0','x=3 أو x=5','x=3 أو x=-5','x=-3 أو x=5','x=-3 أو x=-5','B',10);
  await mcq(e4.id,'sin(45°) =','1','1/2','1/√2','√3/2','C',10);
  await mcq(e4.id,'cos(30°) =','1/2','√3/2','1/√2','√3','B',10);
  await mcq(e4.id,'مشتقة f(x)=3x²','6x','3x','6','3','A',10);
  await mcq(e4.id,'تكامل ∫3x²dx =','x³','x³+c','3x³','x²+c','B',10);
  await mcq(e4.id,'قيمة y=x²-2x+1 عند x=3','4','6','2','8','A',10);
  await tf(e4.id,'مجموع جذري ax²+bx+c=0 هو -b/a','T',10);
  await tf(e4.id,'الدالة f(x)=x³ دالة فردية','T',10);
  await tf(e4.id,'cos(90°) = 0','T',10);
  await tf(e4.id,'حاصل ضرب جذري x²-5x+6=0 يساوي 6','T',10);

  // E5 — 10 أسئلة × 3 = 30
  await mcq(e5.id,'مشتقة f(x) = x⁴','4x³','x³','4x','x⁴','A',3);
  await mcq(e5.id,'مشتقة الثابت 7','7','1','0','−7','C',3);
  await mcq(e5.id,'مشتقة f(x)=5x² عند x=2','10','20','40','5','B',3);
  await mcq(e5.id,'مشتقة f(x)=2x³+3x','6x²+3','6x²','6x+3','2x³','A',3);
  await mcq(e5.id,'قيمة f\'(x) لـ f(x)=x² عند x=3','3','6','9','12','B',3);
  await mcq(e5.id,'نقطة القصوى المحلية تحدث عند f\'(x)=','1','−1','0','∞','C',3);
  await tf(e5.id,'مشتقة sin(x) هي cos(x)','T',3);
  await tf(e5.id,'مشتقة e^x هي e^x','T',3);
  await tf(e5.id,'الدالة المتزايدة لها مشتقة موجبة دائماً','T',3);
  await tf(e5.id,'مشتقة f(x)=x هي 1','T',3);

  // E6 — 10 أسئلة × 3 = 30
  await mcq(e6.id,'تكامل ∫x²dx =','x³+c','x³/3+c','2x','3x²','B',3);
  await mcq(e6.id,'∫1dx =','0','x','x+c','1','C',3);
  await mcq(e6.id,'∫2x dx =','x²','x²+c','2x²+c','2x','B',3);
  await mcq(e6.id,'قيمة ∫₀² 2x dx','4','2','8','1','A',3);
  await mcq(e6.id,'∫(x²+2x)dx =','x³/3+x²','x³/3+x²+c','x²+2','x³+x²+c','B',3);
  await tf(e6.id,'التكامل المحدود يستخدم لحساب المساحة','T',3);
  await tf(e6.id,'ثابت التكامل c يُحذف في التكامل المحدود','T',3);
  await tf(e6.id,'∫₀¹ 1 dx = 1','T',3);
  await tf(e6.id,'التكامل هو مضاد الاشتقاق','T',3);
  await tf(e6.id,'مساحة المنطقة بين الدالة ومحور السينات دائماً موجبة','F',3);

  // E7 — 5 أسئلة × 4 = 20
  await mcq(e7.id,'2 × 7 + 3 =','14','17','21','10','B',4);
  await mcq(e7.id,'أكبر عدد من مجموعة {3,7,1,9,2}','7','9','3','2','B',4);
  await mcq(e7.id,'مربع العدد 8','56','64','72','48','B',4);
  await tf(e7.id,'1 + 1 = 3','F',4);
  await tf(e7.id,'مجموع زوايا المثلث 180°','T',4);

  // E8 (مسودة) — 5 أسئلة × 10 = 50
  await mcq(e8.id,'وسيط مجموعة {2,4,6,8,10}','4','5','6','8','C',10);
  await mcq(e8.id,'المتوسط الحسابي لـ {10,20,30}','15','20','25','30','B',10);
  await tf(e8.id,'الاحتمال دائماً بين 0 و1','T',10);
  await tf(e8.id,'احتمال الحدث المستحيل = 1','F',10);
  await mcq(e8.id,'المدى في {3,7,1,9}','8','9','6','7','A',10);

  // E9 — 6 أسئلة
  await mcq(e9.id,'المسافة بين (0,0) و(3,4)','3','4','5','7','C',3);
  await mcq(e9.id,'منتصف القطعة بين (2,4) و(6,8)','(4,6)','(3,5)','(4,4)','(8,12)','A',3);
  await mcq(e9.id,'معادلة المستقيم المار بـ (0,2) بميل 3','y=3x','y=3x+2','y=2x+3','y=x+3','B',3);
  await mcq(e9.id,'الدائرة ذات المركز (0,0) والنصف قطر 5','x²+y²=5','x²+y²=10','x²+y²=25','x+y=5','C',3);
  await tf(e9.id,'الميل للمستقيم الموازي لمحور x يساوي صفراً','T',2);
  await tf(e9.id,'المسافة بين (1,1) و(4,5) تساوي 5','T',2);

  // E10 — 5 أسئلة
  await mcq(e10.id,'ميل المستقيم المار بـ (1,2) و(3,6)','1','2','3','4','B',10);
  await mcq(e10.id,'قاطع الصادات للمستقيم 2x+y=4','2','4','8','0','B',10);
  await tf(e10.id,'مستقيمان متعامدان حاصل ضرب ميليهما = -1','T',10);
  await tf(e10.id,'مركز الدائرة x²+y²=16 هو (0,0)','T',10);
  await mcq(e10.id,'معادلة الدائرة المركز (3,4) والنصف قطر 5','(x-3)²+(y-4)²=5','(x-3)²+(y-4)²=25','x²+y²=25','(x+3)²+(y+4)²=25','B',10);

  // E11 — 8 أسئلة مجمّعة × 5 = 40 (مجموعتان + سؤالان مستقلان)
  const G11A = 10011;
  const G11A_CTX =
    'تسير سيارة بسرعة منتظمة، وتعبّر العلاقة بين المسافة المقطوعة s (بالكيلومتر) ' +
    'والزمن t (بالساعة) عن الدالة الخطية: s(t) = 80t\n' +
    'حيث تبدأ السيارة من نقطة الأصل عند t = 0، ولا تتوقف طوال الرحلة.';
  await grpMcq(e11.id,G11A,G11A_CTX,null,'كم تبلغ سرعة السيارة الثابتة؟','40 كم/س','80 كم/س','160 كم/س','800 كم/س','B',5);
  await grpMcq(e11.id,G11A,G11A_CTX,null,'ما المسافة المقطوعة بعد ساعتين ونصف؟','150 كم','160 كم','200 كم','240 كم','C',5);
  await grpMcq(e11.id,G11A,G11A_CTX,null,'بعد كم ساعة تكون المسافة المقطوعة 360 كم؟','3 ساعات','3.5 ساعات','4 ساعات','4.5 ساعات','D',5);

  const G11B = 10012;
  const G11B_CTX =
    'ادرس خصائص الدالة f(x) = x² − 4x + 3 ثم أجب عن الأسئلة التالية:\n' +
    '• الدالة مقعّرة لأعلى\n• تتقاطع مع محور السينات عند x = 1 و x = 3\n' +
    '• أدنى قيمة للدالة عند الرأس x = 2';
  await grpTf(e11.id,G11B,G11B_CTX,null,'الدالة f(x) = x² − 4x + 3 لها حد أدنى (لا حد أقصى)','T',5);
  await grpTf(e11.id,G11B,G11B_CTX,null,'قيمة f(0) تساوي 3','T',5);
  await grpMcq(e11.id,G11B,G11B_CTX,null,'ما أدنى قيمة تأخذها الدالة f(x)؟','3','0','-1','2','C',5);

  await mcq(e11.id,'إذا كانت الدالة g(x) = 2x + 5 فإن g(−2) =','1','9','−4','0','A',5);
  await tf(e11.id,'ميل المستقيم المار بالنقطتين (1,3) و(3,7) يساوي 2','T',5);

  console.log('  ✓ أسئلة 11 امتحان اكتملت (E11 يحتوي مجموعتين من الأسئلة المجمّعة)');

  // ══════════════════════════════════════════════════════════
  // 9. تسجيل الطلاب في الكورسات
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  تسجيل الطلاب في الكورسات...');

  const enroll = async (sid, cid) => q(`
    INSERT INTO student_course_enrollment (student_id,course_id,status)
    VALUES ($1,$2,'active') ON CONFLICT (student_id,course_id) DO NOTHING
  `, [sid, cid]);

  // std_ali: c1 (جبر)، c2 (تفاضل)، c3 (مجاني)
  await enroll(STD_ALI, c1.id);
  await enroll(STD_ALI, c2.id);
  await enroll(STD_ALI, c3.id);

  // ث3 آخرون: c1 وc3
  for (const sid of [sids['std_fatma'], sids['std_youssef']]) {
    await enroll(sid, c1.id);
    await enroll(sid, c3.id);
  }
  for (const sid of [sids['std_nada'], sids['std_omar']]) {
    await enroll(sid, c1.id);
  }

  // ث2: c4 وc6
  for (const sid of [sids['std_mostafa'], sids['std_rana']]) {
    await enroll(sid, c4.id);
    await enroll(sid, c6.id);
  }
  for (const sid of [sids['std_adam'], sids['std_lina']]) {
    await enroll(sid, c4.id);
  }

  // ث1: c6 فقط
  for (const sid of S_TH1) await enroll(sid, c6.id);

  console.log('  ✓ التسجيلات اكتملت');

  // ══════════════════════════════════════════════════════════
  // 10. طلبات التسجيل (course_enrollment_requests)
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة طلبات التسجيل...');

  // std_ali طلب التسجيل في c4 (ث2 هندسة) — pending
  await q(`
    INSERT INTO course_enrollment_requests
      (student_id,course_id,status,message,created_at)
    VALUES ($1,$2,'pending','أريد الانضمام لهذا الكورس',$3)
    ON CONFLICT (student_id,course_id) DO NOTHING
  `, [STD_ALI, c4.id, past(2)]);

  // طلب مقبول — std_fatma التحقت بـ c2
  await q(`
    INSERT INTO course_enrollment_requests
      (student_id,course_id,status,message,created_at,handled_at)
    VALUES ($1,$2,'accepted','رجاء التسجيل في التفاضل',$3,$4)
    ON CONFLICT (student_id,course_id) DO NOTHING
  `, [sids['std_fatma'], c2.id, past(10), past(8)]);

  // طلب مرفوض — std_nada
  await q(`
    INSERT INTO course_enrollment_requests
      (student_id,course_id,status,message,created_at,handled_at)
    VALUES ($1,$2,'rejected','أريد التسجيل',$3,$4)
    ON CONFLICT (student_id,course_id) DO NOTHING
  `, [sids['std_nada'], c2.id, past(12), past(10)]);

  console.log('  ✓ 3 طلبات تسجيل (pending + accepted + rejected)');

  // ══════════════════════════════════════════════════════════
  // 11. نتائج الامتحانات
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة نتائج الامتحانات...');

  const submitExam = async (sid, eid, score, correct, wrong, unans, ptsEarned, daysAgo, attemptNum = 1, isLatest = true) => {
    const startAt = new Date(now.getTime() - daysAgo * 86400000 - 3600000);
    const endAt   = new Date(now.getTime() - daysAgo * 86400000);
    await q(`
      INSERT INTO exam_results
        (student_id,exam_id,score,correct_count,wrong_count,unanswered_count,
         start_time,end_time,points_earned,attempt_number,is_latest,answers)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'[]'::jsonb)
      ON CONFLICT DO NOTHING
    `, [sid, eid, score, correct, wrong, unans, startAt, endAt, ptsEarned, attemptNum, isLatest]);
  };

  // std_ali — E1 (جبر) — نجح ✅ (27/30)
  await submitExam(STD_ALI, e1.id, 27, 9, 1, 0, 25, 16);

  // std_ali — E2 (مثلثات) — راسب أولاً ❌ (20/50)
  await submitExam(STD_ALI, e2.id, 20, 4, 5, 1, 5, 12, 1, false);
  // std_ali — E2 — إعادة بعد القبول — نجح (35/50)
  await submitExam(STD_ALI, e2.id, 35, 7, 2, 1, 30, 8, 2, true);

  // std_ali — E5 (مشتقة) — ممتاز ✅ (28/30)
  await submitExam(STD_ALI, e5.id, 28, 9, 1, 0, 25, 8);

  // std_ali — E7 (مجاني) — نجح ✅ (16/20)
  await submitExam(STD_ALI, e7.id, 16, 4, 1, 0, 13, 25);

  // نتائج الطلاب الآخرين
  await submitExam(sids['std_fatma'],   e1.id, 21, 7, 3, 0, 20, 14);
  await submitExam(sids['std_youssef'], e1.id, 30, 10,0, 0, 25, 13);
  await submitExam(sids['std_nada'],    e1.id, 12, 4, 6, 0,  5, 10);
  await submitExam(sids['std_omar'],    e1.id, 18, 6, 4, 0, 20, 11);
  await submitExam(sids['std_youssef'], e5.id, 25, 8, 2, 0, 20,  7);
  await submitExam(sids['std_mostafa'],  e9.id, 14, 5, 1, 0, 10,  4);
  await submitExam(sids['std_rana'],     e9.id, 16, 5, 0, 1, 15,  3);

  console.log('  ✓ نتائج الامتحانات (std_ali: نجاح×3، إعادة×1)');

  // ══════════════════════════════════════════════════════════
  // 12. الشارات (badges)
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الشارات...');

  // std_ali — شارة E1 (نجم الجبر) وE5 (عبقري التفاضل)
  await q(`
    INSERT INTO badges (student_id,exam_id,badge_name,badge_color,earned_at)
    VALUES ($1,$2,'نجم الجبر','#f97316',$3)
    ON CONFLICT (student_id,exam_id) DO NOTHING
  `, [STD_ALI, e1.id, past(16)]);
  await q(`
    INSERT INTO badges (student_id,exam_id,badge_name,badge_color,earned_at)
    VALUES ($1,$2,'عبقري التفاضل','#10b981',$3)
    ON CONFLICT (student_id,exam_id) DO NOTHING
  `, [STD_ALI, e5.id, past(8)]);

  // يوسف — شارة E1
  await q(`
    INSERT INTO badges (student_id,exam_id,badge_name,badge_color,earned_at)
    VALUES ($1,$2,'نجم الجبر','#f97316',$3)
    ON CONFLICT (student_id,exam_id) DO NOTHING
  `, [sids['std_youssef'], e1.id, past(13)]);

  console.log('  ✓ 3 شارات (std_ali: 2 شارة، يوسف: 1 شارة)');

  // ══════════════════════════════════════════════════════════
  // 13. طلبات إعادة الامتحان
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة طلبات إعادة الامتحان...');

  // std_ali — E2 — طلب مقبول (بعد الرسوب الأول)
  await q(`
    INSERT INTO exam_retry_requests
      (student_id,exam_id,status,message,teacher_note,created_at,handled_at)
    VALUES ($1,$2,'accepted','راسبت بسبب ظروف — أرجو المراجعة',
            'تمت الموافقة — بالتوفيق',$3,$4)
  `, [STD_ALI, e2.id, past(11), past(9)]);

  // std_omar — E1 — طلب مرفوض
  await q(`
    INSERT INTO exam_retry_requests
      (student_id,exam_id,status,message,teacher_note,created_at,handled_at)
    VALUES ($1,$2,'rejected','أريد إعادة الامتحان',
            'لا يمكن الإعادة — الدرجة مقبولة',$3,$4)
  `, [sids['std_omar'], e1.id, past(9), past(7)]);

  // std_nada — E1 — طلب pending
  await q(`
    INSERT INTO exam_retry_requests
      (student_id,exam_id,status,message,created_at)
    VALUES ($1,$2,'pending','الامتحان كان صعباً جداً وحصلت على درجة منخفضة',$3)
  `, [sids['std_nada'], e1.id, past(3)]);

  console.log('  ✓ 3 طلبات إعادة (مقبول + مرفوض + pending)');

  // ══════════════════════════════════════════════════════════
  // 14. المدفوعات
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة المدفوعات...');

  const addPay = async (sid, cid, amount, method, status, daysAgo) => {
    const payDate = past(daysAgo);
    await q(`
      INSERT INTO payments
        (student_id,course_id,amount,method,status,payment_date,
         reference_number,notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [sid, cid, amount, method, status, payDate,
        'REF-' + Math.floor(Math.random()*900000+100000),
        status === 'rejected' ? 'صورة إيصال غير واضحة' : null]);
  };

  // std_ali — c1 (verified) + c2 (verified)
  await addPay(STD_ALI,            c1.id, 300, 'instapay',     'verified', 22);
  await addPay(STD_ALI,            c2.id, 250, 'vodafone_cash','verified', 11);

  // طلاب ث3
  await addPay(sids['std_fatma'],   c1.id, 300, 'fawry',       'verified', 20);
  await addPay(sids['std_youssef'], c1.id, 300, 'instapay',    'verified', 19);
  await addPay(sids['std_youssef'], c2.id, 250, 'instapay',    'verified', 14);
  await addPay(sids['std_fatma'],   c2.id, 250, 'fawry',       'pending',   6);
  await addPay(sids['std_nada'],    c1.id, 300, 'vodafone_cash','pending',  4);

  // طلاب ث2
  await addPay(sids['std_mostafa'], c4.id, 200, 'vodafone_cash','verified', 10);
  await addPay(sids['std_rana'],    c4.id, 200, 'instapay',    'verified',  9);
  await addPay(sids['std_adam'],    c4.id, 200, 'fawry',       'pending',   5);
  await addPay(sids['std_lina'],    c4.id, 200, 'fawry',       'rejected',  8);
  await addPay(sids['std_lina'],    c4.id, 200, 'instapay',    'verified',  6);

  console.log('  ✓ 12 عملية دفع (verified×8، pending×3، rejected×1)');

  // ══════════════════════════════════════════════════════════
  // 15. تقدم الفيديو
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة تقدم الفيديو...');

  const setProgress = async (sid, vid, durationMins, pct, daysAgo = 1) => {
    const watched  = Math.floor(durationMins * pct / 100);
    const actSecs  = watched * 60;
    await q(`
      INSERT INTO video_progress
        (student_id,video_id,progress_percentage,watched_minutes,watch_count,
         last_watched_at,last_position,actual_watched_seconds)
      VALUES ($1,$2,$3,$4,$5,NOW()-($6::int * INTERVAL '1 day'),$7,$8)
      ON CONFLICT (student_id,video_id) DO UPDATE SET
        progress_percentage=$3, watched_minutes=$4,
        last_watched_at=NOW()-($6::int * INTERVAL '1 day'),
        actual_watched_seconds=$8
    `, [sid, vid, pct, watched, pct === 100 ? 3 : 1, daysAgo, watched * 60, actSecs]);
  };

  // std_ali — C1: باب1 مكتمل، باب2 جزئي، باب3 لم يبدأ
  await setProgress(STD_ALI, c1v1, 28, 100, 20);
  await setProgress(STD_ALI, c1v2, 35, 100, 17);
  await setProgress(STD_ALI, c1v3, 22, 100, 15);
  await setProgress(STD_ALI, c1v4, 30, 100, 12);
  await setProgress(STD_ALI, c1v5, 40,  65,  7);

  // std_ali — C2: بدأ ولم يكمل
  await setProgress(STD_ALI, c2v1, 35, 100,  9);
  await setProgress(STD_ALI, c2v2, 42,  80,  6);
  await setProgress(STD_ALI, c2v3, 38,  40,  3);

  // std_ali — C3: كاملة
  await setProgress(STD_ALI, c3v1, 20, 100, 28);
  await setProgress(STD_ALI, c3v2, 18, 100, 27);
  await setProgress(STD_ALI, c3v3, 15, 100, 26);

  // طلاب آخرون في C1
  const c1Vids = [c1v1, c1v2, c1v3, c1v4, c1v5, c1v6, c1v7];
  const c1Durs = [28, 35, 22, 30, 40, 38, 32];
  const c1Pcts = [
    [100, 100,  80, 60,  0, 0,  0], // fatma
    [100, 100, 100,100,100,80, 50], // youssef
    [100,  60,   0,  0,  0, 0,  0], // nada
    [100, 100,  90, 70, 40, 0,  0], // omar
  ];
  const c1Sids = [sids['std_fatma'], sids['std_youssef'], sids['std_nada'], sids['std_omar']];
  for (let i = 0; i < c1Sids.length; i++) {
    for (let j = 0; j < c1Vids.length; j++) {
      if (c1Pcts[i][j] > 0)
        await setProgress(c1Sids[i], c1Vids[j], c1Durs[j], c1Pcts[i][j], 15 - i * 2);
    }
  }

  // طلاب ث2 في C4
  const c4Vids = [c4v1, c4v2, c4v3, c4v4];
  const c4Durs = [25, 30, 35, 40];
  const c4Pcts = [
    [100, 100, 100,  80], // mostafa
    [100, 100,  60,   0], // rana
    [100,  40,   0,   0], // adam
    [100, 100,  90,  70], // lina
  ];
  for (let i = 0; i < S_TH2.length; i++) {
    for (let j = 0; j < c4Vids.length; j++) {
      if (c4Pcts[i][j] > 0)
        await setProgress(S_TH2[i], c4Vids[j], c4Durs[j], c4Pcts[i][j], 10 - i);
    }
  }

  console.log('  ✓ تقدم الفيديو: std_ali في 3 مستويات (مكتمل/جزئي/لم يبدأ)');

  // ══════════════════════════════════════════════════════════
  // 16. نقاط إكمال الكورس
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة نقاط إكمال الكورسات...');

  await q(`
    INSERT INTO course_completion_points (student_id,course_id,points_awarded,awarded_at)
    VALUES ($1,$2,20,NOW()-INTERVAL '20 days')
    ON CONFLICT (student_id,course_id) DO NOTHING
  `, [STD_ALI, c3.id]);

  await q(`
    INSERT INTO course_completion_points (student_id,course_id,points_awarded,awarded_at)
    VALUES ($1,$2,80,NOW()-INTERVAL '5 days')
    ON CONFLICT (student_id,course_id) DO NOTHING
  `, [sids['std_youssef'], c1.id]);

  await q(`
    INSERT INTO course_completion_points (student_id,course_id,points_awarded,awarded_at)
    VALUES ($1,$2,20,NOW()-INTERVAL '25 days')
    ON CONFLICT (student_id,course_id) DO NOTHING
  `, [sids['std_youssef'], c3.id]);

  console.log('  ✓ نقاط إكمال الكورسات');

  // ══════════════════════════════════════════════════════════
  // 17. الإشعارات
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الإشعارات...');

  const stdAliNotifs = [
    ['نتيجة الامتحان', 'تهانينا! حصلت على 27/30 في امتحان الجبر وكسبت شارة "نجم الجبر"! 🏆', 'exam_result',   true,  18],
    ['امتحان جديد',   'تم نشر اختبار "مراجعة الدوال" — متاح حتى بعد 5 أيام.',                'new_exam',      true,   3],
    ['موافقة إعادة',  'وافق الأستاذ محمد على طلب إعادة امتحان المثلثات. يمكنك التقديم الآن.','retry_approved',true,   8],
    ['امتحان قادم',   'تذكير: الاختبار النهائي سيبدأ بعد 7 أيام — ابدأ المراجعة الآن!',      'reminder',      false,  7],
    ['محتوى جديد',   'تم إضافة 3 فيديوهات جديدة في باب الدوال بكورس الجبر والمثلثات.',      'announcement',  false,  4],
    ['تهنئة نقاط',   'عظيم! وصلت إلى 1250 نقطة وتحتل المركز الثالث في قائمة المتصدرين.', 'points',         false,  2],
    ['امتحان جديد',  'تم نشر اختبار التكامل — لديك 6 أيام للإجابة. درجة الاجتياز 15/30.',  'new_exam',       false,  1],
  ];
  for (const [title, msg, type, isRead, daysAgo] of stdAliNotifs) {
    await q(`
      INSERT INTO notification_log
        (teacher_id,student_id,recipient_type,message,type,is_read,source,title,sent_at)
      VALUES ($1,$2,'student',$3,$4,$5,'platform',$6,NOW()-($7::int * INTERVAL '1 day'))
    `, [T1, STD_ALI, msg, type, isRead, title, daysAgo]);
  }

  const broadcastNotifs = [
    ['إعلان هام',       'أهلاً بالجميع في الأكاديمية — ابدأ مشاهدة الكورسات وحقق النجاح!', 'announcement', 30],
    ['تذكير المراجعة',  'تأكد من مشاهدة جميع الفيديوهات قبل الامتحان النهائي.',             'reminder',     10],
    ['تحديث المنصة',    'تم تحديث المنصة بميزات جديدة — جرّب الوضع الليلي!',               'general',       5],
  ];
  for (const sid of [...S_TH3.slice(1), ...S_TH2]) {
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
  // 18. سجل المتصدرين التاريخي
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة سجل المتصدرين...');

  const mayRankings = [
    { student_id: sids['std_youssef'], name: 'يوسف إبراهيم كمال', points: 920, rank: 1 },
    { student_id: STD_ALI,             name: 'علي محمد رمضان',    points: 780, rank: 2 },
    { student_id: sids['std_fatma'],   name: 'فاطمة أحمد سعد',    points: 650, rank: 3 },
    { student_id: sids['std_omar'],    name: 'عمر سامي فرج',      points: 520, rank: 4 },
    { student_id: sids['std_nada'],    name: 'ندى حسن عبد الله',  points: 410, rank: 5 },
  ];
  const aprRankings = [
    { student_id: STD_ALI,             name: 'علي محمد رمضان',    points: 560, rank: 1 },
    { student_id: sids['std_youssef'], name: 'يوسف إبراهيم كمال', points: 490, rank: 2 },
    { student_id: sids['std_fatma'],   name: 'فاطمة أحمد سعد',    points: 380, rank: 3 },
  ];

  await q(`
    INSERT INTO leaderboard_history (teacher_id,month_label,reset_at,rankings)
    VALUES ($1,'مايو 2025',NOW()-INTERVAL '1 day',$2)
  `, [T1, JSON.stringify(mayRankings)]);
  await q(`
    INSERT INTO leaderboard_history (teacher_id,month_label,reset_at,rankings)
    VALUES ($1,'أبريل 2025',NOW()-INTERVAL '31 days',$2)
  `, [T1, JSON.stringify(aprRankings)]);

  await q(`
    INSERT INTO leaderboard_reset_tracker (teacher_id,last_reset_at,next_reset_at)
    VALUES ($1,NOW()-INTERVAL '1 day',NOW()+INTERVAL '29 days')
    ON CONFLICT (teacher_id) DO UPDATE SET
      last_reset_at=NOW()-INTERVAL '1 day',
      next_reset_at=NOW()+INTERVAL '29 days'
  `, [T1]);
  console.log('  ✓ سجل متصدرين شهرين (std_ali: 2 في مايو، 1 في أبريل)');

  // ══════════════════════════════════════════════════════════
  // 19. البث المباشر (live streams)
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة جلسات البث المباشر...');

  // بث منتهي — std_ali شارك فيه
  const [ls1] = await q(`
    INSERT INTO live_streams
      (teacher_id,room_id,title,description,access,chat_enabled,
       hand_raise_enabled,status,is_locked,started_at,ended_at)
    VALUES ($1,'room-math-revision-001',
      'مراجعة الجبر والمثلثات — الحصة الثانية',
      'مراجعة شاملة لأهم أسئلة امتحانات الثانوية العامة',
      'all',true,true,'ended',false,
      NOW()-INTERVAL '10 days'-INTERVAL '2 hours',
      NOW()-INTERVAL '10 days')
    RETURNING id
  `, [T1]);

  // بث نشط حالياً
  const [ls2] = await q(`
    INSERT INTO live_streams
      (teacher_id,room_id,title,description,access,chat_enabled,
       hand_raise_enabled,status,is_locked,started_at)
    VALUES ($1,'room-calculus-live-001',
      'شرح التفاضل — الجلسة المباشرة الأولى',
      'شرح تفصيلي لقواعد المشتقة مع حل تمارين تفاعلية',
      'all',true,true,'active',false,
      NOW()-INTERVAL '30 minutes')
    RETURNING id
  `, [T1]);

  // بث مجدول قادم
  await q(`
    INSERT INTO live_streams
      (teacher_id,room_id,title,description,access,chat_enabled,
       hand_raise_enabled,status,is_locked,scheduled_at)
    VALUES ($1,'room-final-review-001',
      'المراجعة الشاملة قبل الاختبار النهائي',
      'جلسة مراجعة مكثفة تغطي كل المنهج — حضور إلزامي',
      'all',true,true,'scheduled',false,$2)
  `, [T1, future(5)]);

  // std_ali شارك في البث المنتهي
  await q(`
    INSERT INTO live_stream_viewers
      (stream_id,student_id,joined_at,left_at,is_active,can_speak,can_share_screen,is_kicked)
    VALUES ($1,$2,
      NOW()-INTERVAL '10 days'-INTERVAL '1 hour 45 minutes',
      NOW()-INTERVAL '10 days'-INTERVAL '5 minutes',
      false,false,false,false)
    ON CONFLICT (stream_id,student_id) DO NOTHING
  `, [ls1.id, STD_ALI]);

  // مشاهد في البث الحي
  await q(`
    INSERT INTO live_stream_viewers
      (stream_id,student_id,joined_at,is_active,can_speak,can_share_screen,is_kicked)
    VALUES ($1,$2,NOW()-INTERVAL '25 minutes',true,false,false,false)
    ON CONFLICT (stream_id,student_id) DO NOTHING
  `, [ls2.id, sids['std_youssef']]);

  // رسائل شات
  const chatRows = [
    [T1,                    'teacher', 'أ/ محمد',      'أهلاً بالجميع! سنبدأ مراجعة الجبر'],
    [STD_ALI,               'student', 'علي محمد',     'جاهزين يا أستاذ 🎯'],
    [T1,                    'teacher', 'أ/ محمد',      'ممتاز! نبدأ بحل المعادلات التربيعية'],
    [sids['std_youssef'],   'student', 'يوسف إبراهيم', 'سؤال عن معادلة x²-7x+12=0 أستاذ'],
    [T1,                    'teacher', 'أ/ محمد',      'الجواب x=3 أو x=4 — الجداء×المجموع'],
    [STD_ALI,               'student', 'علي محمد',     'شكراً أستاذ! فهمت الطريقة'],
  ];
  const streamBase = new Date(now.getTime() - 10 * 86400000 - 90 * 60000);
  for (let i = 0; i < chatRows.length; i++) {
    const [sid, stype, sname, msg] = chatRows[i];
    const t = new Date(streamBase.getTime() + i * 300000);
    await q(`
      INSERT INTO live_chat_messages (stream_id,sender_id,sender_type,sender_name,message,sent_at)
      VALUES ($1,$2,$3,$4,$5,$6)
    `, [ls1.id, sid, stype, sname, msg, t.toISOString()]);
  }

  // رفع يد std_ali في البث المنتهي (ثم خُفض)
  await q(`
    INSERT INTO live_hand_raises
      (stream_id,student_id,raised_at,lowered_at,is_active)
    VALUES ($1,$2,
      NOW()-INTERVAL '10 days'-INTERVAL '1 hour',
      NOW()-INTERVAL '10 days'-INTERVAL '55 minutes',
      false)
    ON CONFLICT (stream_id,student_id) DO NOTHING
  `, [ls1.id, STD_ALI]);

  console.log('  ✓ 3 جلسات بث (منتهي×1، نشط×1، مجدول×1) + شات + رفع يد');

  // ══════════════════════════════════════════════════════════
  // 20. الفعاليات (Stickman Run)
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة بيانات الفعاليات...');

  // std_ali لعب الأسبوع الماضي
  await q(`
    INSERT INTO event_plays (student_id,event_id,played_at,score,completed)
    VALUES ($1,'weekly-run-2025-w20',NOW()-INTERVAL '7 days',8500,true)
  `, [STD_ALI]);

  const evPlays = [
    [sids['std_youssef'], 'weekly-run-2025-w21', 12000, true],
    [sids['std_fatma'],   'weekly-run-2025-w21',  9500, true],
    [sids['std_omar'],    'weekly-run-2025-w21',  6200, true],
    [sids['std_nada'],    'weekly-run-2025-w21',  3800, false],
  ];
  for (const [sid, evid, sc, comp] of evPlays) {
    await q(`
      INSERT INTO event_plays (student_id,event_id,played_at,score,completed)
      VALUES ($1,$2,NOW()-INTERVAL '2 days',$3,$4)
    `, [sid, evid, sc, comp]);
  }
  console.log('  ✓ بيانات الفعاليات (std_ali: لعب الأسبوع الماضي)');

  // ══════════════════════════════════════════════════════════
  // 21. رموز جلسات الألعاب (game_session_tokens) — حماية ضد الغش
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة رموز جلسات الألعاب...');

  await q(`
    INSERT INTO game_session_tokens (student_id,token,event_id,created_at,used_at)
    VALUES ($1,'token_ali_w20_used','weekly-run-2025-w20',NOW()-INTERVAL '7 days',NOW()-INTERVAL '7 days'+INTERVAL '30 minutes')
  `, [STD_ALI]);

  await q(`
    INSERT INTO game_session_tokens (student_id,token,event_id,created_at,used_at)
    VALUES ($1,'token_youssef_w21_used','weekly-run-2025-w21',NOW()-INTERVAL '2 days',NOW()-INTERVAL '2 days'+INTERVAL '45 minutes')
  `, [sids['std_youssef']]);

  console.log('  ✓ رموز جلسات الألعاب');

  // ══════════════════════════════════════════════════════════
  // 22. أجهزة الطلاب (student_devices) + تنبيهات الأجهزة (device_alerts)
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة بيانات الأجهزة...');

  // std_ali — جهازان (محمول + حاسوب)
  await q(`
    INSERT INTO student_devices
      (student_id,device_id,device_name,user_agent,ip_address,first_seen,last_seen)
    VALUES
      ($1,'device_ali_mobile_001','iPhone 14 Pro','Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit','197.34.5.100',NOW()-INTERVAL '25 days',NOW()-INTERVAL '1 hour'),
      ($1,'device_ali_laptop_002','MacBook Pro','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit','197.34.5.100',NOW()-INTERVAL '20 days',NOW()-INTERVAL '3 days')
  `, [STD_ALI]);

  // std_youssef — جهاز واحد
  await q(`
    INSERT INTO student_devices
      (student_id,device_id,device_name,user_agent,ip_address,first_seen,last_seen)
    VALUES ($1,'device_youssef_android_001','Samsung Galaxy S23','Mozilla/5.0 (Linux; Android 13) AppleWebKit','197.34.5.110',NOW()-INTERVAL '18 days',NOW()-INTERVAL '2 days')
  `, [sids['std_youssef']]);

  // std_nada — محاولة تسجيل دخول من جهاز جديد — تنبيه
  await q(`
    INSERT INTO student_devices
      (student_id,device_id,device_name,user_agent,ip_address,first_seen,last_seen)
    VALUES ($1,'device_nada_001','Laptop Unknown','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit','197.34.5.120',NOW()-INTERVAL '3 days',NOW()-INTERVAL '3 days')
  `, [sids['std_nada']]);

  // تنبيه: std_nada استخدمت جهازاً مشبوهاً
  await q(`
    INSERT INTO device_alerts
      (teacher_id,student_id,alert_type,device_id,device_name,ip_address,status,created_at)
    VALUES ($1,$2,'device_limit_exceeded','device_nada_001','Laptop Unknown','197.34.5.120','pending',NOW()-INTERVAL '3 days')
  `, [T1, sids['std_nada']]);

  console.log('  ✓ أجهزة الطلاب + 1 تنبيه جهاز مشبوه');

  // ══════════════════════════════════════════════════════════
  // 23. جداول الواتساب (whatsapp_schedules + whatsapp_send_log)
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة بيانات الواتساب...');

  const [ws1] = await q(`
    INSERT INTO whatsapp_schedules
      (teacher_id,name,message,target_type,stage_filter,
       interval_days,next_run_at,last_run_at,is_active)
    VALUES ($1,
      'تذكير شهري لأولياء الأمور',
      'السادة أولياء الأمور، نذكّركم بمتابعة أداء أبنائكم وسداد الرسوم المستحقة. شكراً.',
      'parents','all',30,NOW()+INTERVAL '5 days',NOW()-INTERVAL '25 days',true)
    RETURNING id
  `, [T1]);

  const [ws2] = await q(`
    INSERT INTO whatsapp_schedules
      (teacher_id,name,message,target_type,stage_filter,
       interval_days,next_run_at,is_active)
    VALUES ($1,
      'تذكير الامتحانات — ث3',
      'تذكير للطلاب: الاختبار النهائي قادم قريباً. راجعوا المنهج بانتظام.',
      'students','الصف الثالث الثانوي',14,NOW()+INTERVAL '2 days',true)
    RETURNING id
  `, [T1]);

  // سجل إرسال واتساب
  await q(`
    INSERT INTO whatsapp_send_log
      (teacher_id,schedule_id,message,total_count,success_count,fail_count,
       status,send_type,created_at,finished_at)
    VALUES ($1,$2,
      'السادة أولياء الأمور، نذكّركم بمتابعة أداء أبنائكم...',
      11,10,1,'completed','scheduled',
      NOW()-INTERVAL '25 days',NOW()-INTERVAL '25 days'+INTERVAL '5 minutes')
  `, [T1, ws1.id]);

  await q(`
    INSERT INTO whatsapp_send_log
      (teacher_id,schedule_id,message,total_count,success_count,fail_count,
       status,send_type,created_at,finished_at)
    VALUES ($1,$2,
      'إعلان: تم نشر الامتحان النهائي! سجّل دخولك وابدأ التقديم الآن.',
      5,5,0,'completed','manual',
      NOW()-INTERVAL '7 days',NOW()-INTERVAL '7 days'+INTERVAL '3 minutes')
  `, [T1, null]);

  console.log('  ✓ جدولان واتساب + 2 سجل إرسال');

  // ══════════════════════════════════════════════════════════
  // 24. سجل النشاط (activity_logs) — شامل ومتنوع
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة سجل النشاط...');

  const log = async (actorType, actorId, actorName, action, entityType, entityId, entityName, details, daysAgo, hoursOff = 0) => {
    const ts = new Date(now.getTime() - daysAgo * 86400000 - hoursOff * 3600000);
    await q(`
      INSERT INTO activity_logs
        (teacher_id,actor_type,actor_id,actor_name,action,
         entity_type,entity_id,entity_name,details,ip_address,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `, [T1, actorType, actorId, actorName, action,
        entityType, entityId, entityName, JSON.stringify(details),
        '197.34.5.' + Math.floor(Math.random() * 50 + 50),
        ts.toISOString()]);
  };

  const MR = 'أ/ محمد عبد الرحمن';
  const NOUR  = asstNour.name;
  const KARIM = asstKarim.name;

  // تسجيل الدخول
  await log('teacher',   T1,            MR,    'login_teacher',    'teacher',   T1,             MR,    {ip:'197.34.5.70'}, 30, 8);
  await log('assistant', asstNour.id,   NOUR,  'login_assistant',  'assistant', asstNour.id,    NOUR,  {ip:'197.34.5.71'}, 29, 9);
  await log('teacher',   T1,            MR,    'login_teacher',    'teacher',   T1,             MR,    {ip:'197.34.5.70'}, 15, 7);
  await log('assistant', asstNour.id,   NOUR,  'login_assistant',  'assistant', asstNour.id,    NOUR,  {ip:'197.34.5.72'}, 14, 8);
  await log('assistant', asstKarim.id,  KARIM, 'login_assistant',  'assistant', asstKarim.id,   KARIM, {ip:'197.34.5.75'},  7,10);
  await log('teacher',   T1,            MR,    'login_teacher',    'teacher',   T1,             MR,    {ip:'197.34.5.70'},  1, 6);

  // الكورسات
  await log('teacher',   T1, MR, 'create_course',  'course', c1.id, 'رياضيات ث3 — الجبر',     {price:300,stage:'ث3'}, 30, 7);
  await log('teacher',   T1, MR, 'create_course',  'course', c2.id, 'رياضيات ث3 — التفاضل',  {price:250,stage:'ث3'}, 30, 6);
  await log('teacher',   T1, MR, 'create_course',  'course', c3.id, 'مقدمة مجانية',           {price:0,is_free:true}, 29,10);
  await log('teacher',   T1, MR, 'create_course',  'course', c4.id, 'رياضيات ث2 — الهندسة',  {price:200,stage:'ث2'}, 28, 9);
  await log('teacher',   T1, MR, 'create_course',  'course', c5.id, 'الإحصاء [مسودة]',       {price:200,stage:'ث3'}, 27, 8);
  await log('teacher',   T1, MR, 'publish_course', 'course', c1.id, 'رياضيات ث3 — الجبر',     {is_published:true},    29, 9);
  await log('teacher',   T1, MR, 'publish_course', 'course', c2.id, 'رياضيات ث3 — التفاضل',  {is_published:true},    29, 8);
  await log('teacher',   T1, MR, 'publish_course', 'course', c3.id, 'مقدمة مجانية',           {is_published:true},    29, 7);
  await log('teacher',   T1, MR, 'publish_course', 'course', c4.id, 'رياضيات ث2 — الهندسة',  {is_published:true},    28, 8);
  await log('teacher',   T1, MR, 'edit_course',    'course', c1.id, 'رياضيات ث3 — الجبر',     {changed:['description','thumbnail_url']}, 20,10);

  // رفع المحتوى
  await log('teacher',   T1,           MR,   'upload_video', 'course', c1.id, 'مقدمة الجبر',     {video_id:c1v1}, 29,12);
  await log('assistant', asstNour.id,  NOUR, 'upload_video', 'course', c1.id, 'المتباينات',      {video_id:c1v3}, 27,13);
  await log('assistant', asstNour.id,  NOUR, 'upload_pdf',   'course', c1.id, 'ملخص المعادلات', {}, 27,12);
  await log('teacher',   T1,           MR,   'add_video_url','course', c2.id, 'مقدمة التفاضل',  {url:'youtube'}, 26,10);
  await log('teacher',   T1,           MR,   'upload_pdf',   'course', c2.id, 'ملخص المشتقة',   {}, 25, 9);

  // الطلاب
  await log('teacher',   T1,           MR,   'add_student', 'student', STD_ALI,           'علي محمد رمضان',      {username:'std_ali',  stage:'ث3'}, 28,10);
  await log('teacher',   T1,           MR,   'add_student', 'student', sids['std_fatma'], 'فاطمة أحمد سعد',      {username:'std_fatma',stage:'ث3'}, 28, 9);
  await log('assistant', asstNour.id,  NOUR, 'add_student', 'student', sids['std_youssef'],'يوسف إبراهيم كمال',  {username:'std_youssef',stage:'ث3'},27,11);
  await log('assistant', asstNour.id,  NOUR, 'bulk_import_students','student',null,null,  {count:4,failed:0},      26,14);
  await log('teacher',   T1,           MR,   'bulk_import_students','student',null,null,  {count:6,failed:1},      20,12);
  await log('assistant', asstNour.id,  NOUR, 'edit_student','student', STD_ALI,           'علي محمد رمضان',      {changed:['phone','parent_phone']},15,11);
  await log('teacher',   T1,           MR,   'edit_student','student', sids['std_nada'],  'ندى حسن عبد الله',    {changed:['academic_stage']},12,9);
  await log('teacher',   T1,           MR,   'suspend_student','student',sids['std_nada'],'ندى حسن عبد الله',   {reason:'تجاوز حد الأجهزة'},3,5);

  // المدفوعات
  await log('assistant', asstNour.id,  NOUR,  'approve_payment','payment',null,'علي محمد رمضان',    {amount:300,method:'instapay',status:'verified'},   21,13);
  await log('assistant', asstNour.id,  NOUR,  'approve_payment','payment',null,'فاطمة أحمد سعد',    {amount:300,method:'fawry',status:'verified'},       20,12);
  await log('assistant', asstKarim.id, KARIM, 'approve_payment','payment',null,'يوسف إبراهيم كمال',{amount:300,method:'instapay',status:'verified'},     20,11);
  await log('assistant', asstKarim.id, KARIM, 'reject_payment', 'payment',null,'لينا سعيد القاضي', {amount:200,method:'fawry',status:'rejected'},         8,13);
  await log('teacher',   T1,           MR,    'approve_payment','payment',null,'لينا سعيد القاضي', {amount:200,method:'instapay',status:'verified'},       6, 9);

  // الامتحانات
  await log('teacher',   T1,           MR,   'create_exam',  'exam', e1.id, 'امتحان الجبر',      {total_score:30,duration:45}, 29,10);
  await log('teacher',   T1,           MR,   'publish_exam', 'exam', e1.id, 'امتحان الجبر',      {is_published:true},          29, 9);
  await log('teacher',   T1,           MR,   'create_exam',  'exam', e2.id, 'امتحان المثلثات',   {total_score:50,duration:60}, 28,11);
  await log('teacher',   T1,           MR,   'publish_exam', 'exam', e2.id, 'امتحان المثلثات',   {is_published:true},          28,10);
  await log('assistant', asstNour.id,  NOUR, 'create_exam',  'exam', e3.id, 'مراجعة الدوال',     {total_score:40,duration:40},  8,13);
  await log('assistant', asstNour.id,  NOUR, 'publish_exam', 'exam', e3.id, 'مراجعة الدوال',     {is_published:true},           8,12);
  await log('teacher',   T1,           MR,   'create_exam',  'exam', e4.id, 'الاختبار النهائي',  {total_score:100,duration:90,badge:'بطل الرياضيات'}, 25, 9);
  await log('teacher',   T1,           MR,   'publish_exam', 'exam', e4.id, 'الاختبار النهائي',  {is_published:true,start:'بعد 7 أيام'},               25, 8);
  await log('teacher',   T1,           MR,   'approve_retry','exam', e2.id, 'امتحان المثلثات',   {student:'علي محمد رمضان',decision:'accepted'},        8, 8);
  await log('assistant', asstNour.id,  NOUR, 'reject_retry', 'exam', e1.id, 'امتحان الجبر',      {student:'عمر سامي فرج',decision:'rejected'},          4,11);
  await log('teacher',   T1,           MR,   'force_reset_exam_results','exam',e1.id,'امتحان الجبر',{deleted_results:3},        26,16);

  // المساعدون
  await log('teacher',   T1, MR, 'add_assistant',    'assistant',asstNour.id, NOUR,  {permissions:'full'}, 30, 5);
  await log('teacher',   T1, MR, 'add_assistant',    'assistant',asstKarim.id,KARIM, {permissions:'partial'},29,5);
  await log('teacher',   T1, MR, 'add_assistant',    'assistant',asstDina.id, asstDina.name, {permissions:'view_only'},28,5);
  await log('teacher',   T1, MR, 'edit_assistant',   'assistant',asstNour.id, NOUR,  {changed:['can_delete_students']},15,8);

  // الواتساب
  await log('teacher', T1, MR, 'send_whatsapp_broadcast','teacher',T1,MR,{count:11,success:10,fail:1,type:'scheduled'},25,14);
  await log('teacher', T1, MR, 'send_whatsapp_broadcast','teacher',T1,MR,{count:5,success:5,fail:0,type:'manual'},7,11);
  await log('teacher', T1, MR, 'create_whatsapp_schedule','teacher',T1,MR,{name:'تذكير شهري لأولياء الأمور',interval:30},30,4);

  // الأجهزة
  await log('teacher', T1, MR, 'device_alert_review', 'student',sids['std_nada'],'ندى حسن عبد الله',{alert_type:'device_limit_exceeded',action:'pending'},3,4);

  console.log('  ✓ سجل النشاط: 50+ حدث (تسجيل دخول، كورسات، طلاب، مدفوعات، امتحانات، واتساب، أجهزة)');

  // ══════════════════════════════════════════════════════════
  // ملخص نهائي
  // ══════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ✅ تمت عملية البذر بنجاح كامل!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n  📋 ملخص البيانات:');
  console.log('  ┌──────────────────────────────────────────────────────┐');
  console.log('  │  👨‍🏫 معلم: 1         (admin / admin123)              │');
  console.log('  │  🧑‍💼 مساعدون: 3      (asst_nour / asst_karim / asst_dina) │');
  console.log('  │  🎒 طلاب: 11        (std_ali / 123456 — المحوري)    │');
  console.log('  │  📚 كورسات: 6       (4 منشور، 1 مجاني، 1 مسودة)     │');
  console.log('  │  📹 فيديوهات: 24    (مع أقسام متعددة)               │');
  console.log('  │  📄 PDF: 14                                          │');
  console.log('  │  🏦 بنوك أسئلة: 2  (مع أسئلة مجمّعة)               │');
  console.log('  │  📝 امتحانات: 11   (منتهية/جارية/قادمة/مسودة)       │');
  console.log('  │  💳 مدفوعات: 12    (verified×8 / pending×3 / rejected×1) │');
  console.log('  │  🔔 إشعارات: 7+ std_ali + جماعية                    │');
  console.log('  │  📡 بث مباشر: 3    (منتهي/نشط/مجدول)               │');
  console.log('  │  🎮 فعاليات: 5     (Stickman Run)                   │');
  console.log('  │  📱 أجهزة: 4       + 1 تنبيه مشبوه                 │');
  console.log('  │  💬 واتساب: 2 جدول + 2 سجل إرسال                   │');
  console.log('  │  📊 سجل نشاط: 50+ حدث                              │');
  console.log('  └──────────────────────────────────────────────────────┘');
  console.log('\n  🔑 بيانات تسجيل الدخول:');
  console.log('     معلم    → admin / admin123');
  console.log('     مساعد   → asst_nour / 123456  (صلاحيات كاملة)');
  console.log('     طالب    → std_ali / 123456    (الحساب المحوري)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

seed()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ خطأ أثناء البذر:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
