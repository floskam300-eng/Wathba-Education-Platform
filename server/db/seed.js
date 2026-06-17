/**
 * WATHBA — Seed File (نسخة شاملة محدّثة)
 * ─────────────────────────────────────────────────────────────────
 * الحسابات المحورية:
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
 *   recitations, recitation_questions, recitation_results, recitation_sessions, recitation_streaks
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
  console.log('  🌱 WATHBA — بيانات تجريبية شاملة (نسخة محدّثة كاملة)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ══════════════════════════════════════════════════════════
  // 0. مسح البيانات القديمة (بالترتيب الصحيح للـ FK)
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  مسح البيانات القديمة...');
  const tables = [
    'revoked_tokens',
    'whatsapp_send_log', 'whatsapp_schedules',
    'activity_logs', 'game_session_tokens',
    'device_alerts', 'student_devices',
    'recitation_streaks', 'recitation_results', 'recitation_sessions',
    'recitation_questions', 'recitations',
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
        force_password_change=false
      WHERE id=$1
    `, [adminRow.id, passAd]);
  }
  const T1 = adminRow.id;
  console.log(`  ✓ admin (id=${T1}) — slug=admin — أكاديمية محمد للرياضيات`);

  // ══════════════════════════════════════════════════════════
  // 2. المساعدون (3 مساعدين بصلاحيات مختلفة)
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة المساعدين...');

  await q(`
    INSERT INTO assistants
      (username,password,name,phone,teacher_id,
       can_add_students,can_edit_students,can_delete_students,
       can_manage_exams,can_view_analytics,can_send_reports,
       can_manage_payments,can_manage_courses,can_send_notifications,
       can_manage_recitations)
    VALUES
      ('asst_nour',$1,'نور أحمد حسين','+201111111101',$4,
       true,true,true,true,true,true,true,true,true,true),
      ('asst_karim',$2,'كريم محمود إبراهيم','+201111111102',$4,
       true,true,false,false,true,false,true,false,false,false),
      ('asst_dina',$3,'دينا سعيد محمد','+201111111103',$4,
       false,false,false,false,true,false,false,false,false,false)
  `, [pass6, pass6, pass6, T1]);

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
    ['std_nada',    'ندى حسن عبد الله',      '+201200000007', '+201200000008', 'الصف الثالث الثانوي', 'أنثى',  640, true],
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
  // std_hana و std_hassan: طلاب ث1 — سيُسجَّلون في c3 ويغيبون عن e11 (سيناريو الغياب)
  const stdHanaId = sids['std_hana'];
  const stdHassanId = sids['std_hassan'];

  // طالب بدون نقاط لاختبار الحالات الحدية
  const [stdZero] = await q(`
    INSERT INTO students
      (username,password,name,phone,parent_phone,
       academic_stage,gender,teacher_id,points,is_suspended)
    VALUES ('std_zero',$1,'طالب اختبار — بدون نقاط',
            '+201200000099','+201200000100',
            'الصف الثالث الثانوي','ذكر',$2,0,false)
    RETURNING id
  `, [pass6, T1]);

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

  // ── C5: مسودة (1 قسم، 1 فيديو، 1 PDF) ──
  const c5s1 = await addSec(c5.id, 'الباب الأول — مقدمة في الإحصاء', 1);
  await addVid(c5.id, c5s1, 'مقدمة الإحصاء — المفاهيم الأساسية', YT1, 22, 1);
  await addPdf(c5.id, c5s1, 'مخطط المحتوى القادم', PDF);

  // ── C6: مجاني ث2 (1 قسم، 1 فيديو، 1 PDF) ──
  const c6s1 = await addSec(c6.id, 'الدرس التعريفي', 1);
  await addVid(c6.id, c6s1, 'مقدمة لطلاب الثاني الثانوي', YT1, 15, 1);
  await addPdf(c6.id, c6s1, 'خطة المنهج', PDF);

  console.log('  ✓ الأقسام والفيديوهات والـ PDF اكتملت');

  // ══════════════════════════════════════════════════════════
  // 6. بنك الأسئلة (2 بنك)
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

  const bankQ1 = [
    ['mcq','حل المعادلة 3x - 9 = 0','x = 1','x = 2','x = 3','x = 9','C',1,'easy'],
    ['mcq','حل المعادلة التربيعية x² - 5x + 6 = 0','x=1 أو x=6','x=2 أو x=3','x=-2 أو x=-3','x=0 أو x=5','B',2,'medium'],
    ['mcq','sin(30°) يساوي','1','1/2','√3/2','0','B',1,'easy'],
    ['mcq','cos(60°) يساوي','√3/2','1','1/2','0','C',1,'easy'],
    ['mcq','sin²(x) + cos²(x) يساوي','0','1/2','1','2','C',2,'easy'],
    ['mcq','إذا كان f(x) = 2x + 3 فإن f(4) يساوي','8','10','11','14','C',2,'medium'],
    ['mcq','قيمة cos(0°) تساوي','0','1/2','√3/2','1','D',1,'easy'],
    ['mcq','حل المتباينة 2x - 4 > 0','x > 0','x > 2','x < 2','x > 4','B',2,'medium'],
    ['mcq','قانون الجيب في المثلث يربط بين','الأضلاع والزوايا','الأضلاع فقط','الزوايا فقط','المساحة والمحيط','A',3,'hard'],
    ['mcq','ميل الخط العمودي على خط ميله 2 يساوي','-2','-1/2','1/2','2','B',2,'medium'],
    ['true_false','tan(45°) = 1','صح','خطأ',null,null,'T',1,'easy'],
    ['true_false','sin(90°) = 0','صح','خطأ',null,null,'F',1,'easy'],
    ['true_false','cos(180°) = -1','صح','خطأ',null,null,'T',1,'easy'],
    ['true_false','الميل الموجب يعني الخط صاعد من اليسار لليمين','صح','خطأ',null,null,'T',1,'easy'],
    ['true_false','المعادلة x² + 1 = 0 لها حلول حقيقية','صح','خطأ',null,null,'F',2,'medium'],
  ];

  for (const [qt, txt, a, b, c, d, ans, pts, diff] of bankQ1) {
    await q(`
      INSERT INTO bank_questions
        (bank_id,question_type,question_text,option_a,option_b,option_c,option_d,
         correct_answer_letter,points,difficulty)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [bank1.id, qt, txt, a, b, c, d, ans, pts, diff]);
  }

  const bankQ2 = [
    ['mcq','مشتقة x³ تساوي','x²','2x','3x²','3x','C',2,'easy'],
    ['mcq','مشتقة sin(x) تساوي','cos(x)','-cos(x)','-sin(x)','tan(x)','A',2,'easy'],
    ['mcq','تكامل 2x dx يساوي','x','x²','2x²','x² + C','D',2,'easy'],
    ['mcq','إذا كان f\'(x) = 0 فإن x تسمى','نقطة تقاطع','نقطة قصوى','نقطة بداية','نقطة نهاية','B',3,'medium'],
    ['mcq','تكامل cos(x) dx يساوي','sin(x)+C','-sin(x)+C','cos(x)+C','tan(x)+C','A',2,'medium'],
    ['mcq','قاعدة الضرب في المشتقة: (uv)\' تساوي','u\'v\'','u\'v + uv\'','u\'v - uv\'','uv\'/u\'v','B',3,'hard'],
    ['mcq','تكامل x⁰ dx يساوي','0','x','x+C','1','C',1,'easy'],
    ['true_false','مشتقة الثابت تساوي صفر','صح','خطأ',null,null,'T',1,'easy'],
    ['true_false','تكامل دالة موجبة دائماً موجب','صح','خطأ',null,null,'F',2,'medium'],
    ['true_false','(eˣ)\' = eˣ','صح','خطأ',null,null,'T',2,'medium'],
  ];

  for (const [qt, txt, a, b, c, d, ans, pts, diff] of bankQ2) {
    await q(`
      INSERT INTO bank_questions
        (bank_id,question_type,question_text,option_a,option_b,option_c,option_d,
         correct_answer_letter,points,difficulty)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [bank2.id, qt, txt, a, b, c, d, ans, pts, diff]);
  }

  console.log('  ✓ بنكا الأسئلة: bank1 (15 سؤال جبر) | bank2 (10 أسئلة تفاضل)');

  // ══════════════════════════════════════════════════════════
  // 7. الامتحانات (11 امتحان — كل الحالات)
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الامتحانات...');

  // e1: امتحان الجبر — منتهي (std_ali ناجح ✓)
  const [e1] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,course_id,teacher_id,
       pass_score,badge_name,badge_color,is_published,
       start_date,end_date,shuffle_questions,shuffle_options,
       points_on_attempt,points_on_pass)
    VALUES ('امتحان الجبر والمتباينات',45,30,$1,$2,
      18,'نجم الجبر','#f97316',true,
      $3,$4,false,false,5,15)
    RETURNING id
  `, [c1.id, T1, past(25), past(5)]);

  // e2: امتحان المثلثات — منتهي (std_ali راسب، طلب إعادة مقبولة)
  const [e2] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,course_id,teacher_id,
       pass_score,badge_name,badge_color,is_published,
       start_date,end_date,shuffle_questions,shuffle_options,
       points_on_attempt,points_on_pass)
    VALUES ('امتحان المثلثات والنسب المثلثية',60,50,$1,$2,
      30,'بطل المثلثات','#7c3aed',true,
      $3,$4,true,false,5,20)
    RETURNING id
  `, [c1.id, T1, past(20), past(3)]);

  // e3: مراجعة الدوال — نشط الآن (std_ali لم يأده بعد ✓)
  const [e3] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,course_id,teacher_id,
       pass_score,is_published,start_date,end_date,
       points_on_attempt,points_on_pass)
    VALUES ('مراجعة الدوال والرسوم البيانية',40,57,$1,$2,
      34,true,$3,$4,5,10)
    RETURNING id
  `, [c1.id, T1, past(3), future(5)]);

  // e4: الاختبار النهائي — قادم (std_ali لم يأده بعد + مش بادئ لسا)
  const [e4] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,course_id,teacher_id,
       pass_score,badge_name,badge_color,is_published,
       start_date,end_date,shuffle_questions,shuffle_options,
       points_on_attempt,points_on_pass)
    VALUES ('الاختبار النهائي الشامل',90,100,$1,$2,
      60,'بطل الرياضيات','#f59e0b',true,
      $3,$4,true,true,10,50)
    RETURNING id
  `, [c1.id, T1, future(7), future(14)]);

  // e5: امتحان التفاضل — نشط (std_ali ناجح ✓)
  const [e5] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,course_id,teacher_id,
       pass_score,badge_name,badge_color,is_published,
       start_date,end_date,points_on_attempt,points_on_pass)
    VALUES ('اختبار مشتقات — الوحدة الأولى',50,30,$1,$2,
      18,'نجم التفاضل','#10b981',true,
      $3,$4,5,15)
    RETURNING id
  `, [c2.id, T1, past(15), past(2)]);

  // e6: امتحان التكامل — نشط (std_ali لم يأده بعد ✓)
  const [e6] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,course_id,teacher_id,
       pass_score,is_published,start_date,end_date,
       points_on_attempt,points_on_pass)
    VALUES ('اختبار التكامل المحدود',45,30,$1,$2,
      18,true,$3,$4,5,15)
    RETURNING id
  `, [c2.id, T1, past(1), future(6)]);

  // e7: امتحان قصير — مسودة (غير منشور)
  const [e7] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,course_id,teacher_id,
       pass_score,is_published,points_on_attempt,points_on_pass)
    VALUES ('تمرين سريع على المعادلات [مسودة]',20,20,$1,$2,
      12,false,3,10)
    RETURNING id
  `, [c1.id, T1]);

  // e8: امتحان من بنك الأسئلة — نشط (ث3)
  const [e8] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,course_id,teacher_id,
       pass_score,is_published,start_date,end_date,
       question_source,bank_id,bank_question_count,
       bank_easy_count,bank_medium_count,bank_hard_count,
       points_on_attempt,points_on_pass)
    VALUES ('اختبار بنك الجبر العشوائي',30,20,$1,$2,
      12,true,$3,$4,
      'bank',$5,10,4,4,2,3,12)
    RETURNING id
  `, [c1.id, T1, past(2), future(5), bank1.id]);

  // e9: امتحان ث2 في الهندسة — منتهي
  const [e9] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,course_id,teacher_id,
       pass_score,is_published,start_date,end_date,
       points_on_attempt,points_on_pass)
    VALUES ('امتحان الإحداثيات والمسافة',35,25,$1,$2,
      15,true,$3,$4,3,12)
    RETURNING id
  `, [c4.id, T1, past(10), past(1)]);

  // e10: امتحان ث2 هندسة — نشط
  const [e10] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,course_id,teacher_id,
       pass_score,is_published,start_date,end_date,
       points_on_attempt,points_on_pass)
    VALUES ('امتحان المستقيم والدائرة',40,30,$1,$2,
      18,true,$3,$4,3,12)
    RETURNING id
  `, [c4.id, T1, past(1), future(4)]);

  // e11: امتحان مجاني منتهي
  const [e11] = await q(`
    INSERT INTO exams
      (title,duration_minutes,total_score,course_id,teacher_id,
       pass_score,is_published,start_date,end_date,
       points_on_attempt,points_on_pass)
    VALUES ('اختبار أساسيات المجاني',15,10,$1,$2,
      6,true,$3,$4,2,5)
    RETURNING id
  `, [c3.id, T1, past(30), past(1)]);

  console.log('  ✓ 11 امتحان (منتهي×5، نشط×4، قادم×1، مسودة×1)');

  // ══════════════════════════════════════════════════════════
  // 8. الأسئلة
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الأسئلة...');

  // أسئلة e1 (امتحان الجبر — 30 درجة، 10 أسئلة)
  const e1Questions = [
    ['mcq','حل المعادلة: 2x + 6 = 14','x = 3','x = 4','x = 5','x = 10','B',3,null],
    ['mcq','حل المعادلة التربيعية: x² - 9 = 0','x = ±3','x = ±9','x = 3','x = 9','A',3,null],
    ['mcq','ما قيمة x في: 3(x - 2) = 9','x = 5','x = 3','x = 7','x = 4','A',3,null],
    ['mcq','إذا كان 2x < 10، فإن:','x < 5','x < 4','x ≤ 5','x > 5','A',3,null],
    ['mcq','ما الجذر الموجب للمعادلة: x² - 16 = 0','2','4','8','16','B',3,null],
    ['mcq','حل: 5x - 3 = 2x + 9','x = 3','x = 4','x = 2','x = 6','B',3,null],
    ['true_false','المعادلة x² = -4 لها جذران حقيقيان','صح','خطأ',null,null,'F',3,null],
    ['true_false','إذا كان x² = 25 فإن x = 5 فقط','صح','خطأ',null,null,'F',3,null],
    ['true_false','المتباينة 3x > 9 تعني أن x > 3','صح','خطأ',null,null,'T',3,null],
    ['true_false','x² - 4x + 4 = (x-2)²','صح','خطأ',null,null,'T',3,null],
  ];
  const e1QIds = [];
  for (const [qt, txt, a, b, c, d, ans, pts] of e1Questions) {
    const [qr] = await q(`
      INSERT INTO questions
        (exam_id,question_type,question_text,option_a,option_b,option_c,option_d,
         correct_answer_letter,points)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id
    `, [e1.id, qt, txt, a, b, c, d, ans, pts]);
    e1QIds.push({ id: qr.id, correct: ans, pts });
  }

  // أسئلة e2 (امتحان المثلثات — 50 درجة، 10 أسئلة)
  const e2Questions = [
    ['mcq','sin(30°) يساوي','1','1/2','√3/2','0','B',5,null],
    ['mcq','cos(0°) يساوي','0','1/2','√3/2','1','D',5,null],
    ['mcq','tan(45°) يساوي','0','1/2','1','√3','C',5,null],
    ['mcq','sin(60°) يساوي','1/2','√3/2','√2/2','1','B',5,null],
    ['mcq','cos(90°) يساوي','1','0','-1','1/2','B',5,null],
    ['mcq','sin²(x) + cos²(x) يساوي','0','1/2','1','2','C',5,null],
    ['true_false','sin(0°) = 0','صح','خطأ',null,null,'T',5,null],
    ['true_false','tan(90°) محدود','صح','خطأ',null,null,'F',5,null],
    ['true_false','cos(180°) = -1','صح','خطأ',null,null,'T',5,null],
    ['true_false','sin(-x) = sin(x)','صح','خطأ',null,null,'F',5,null],
  ];
  const e2QIds = [];
  for (const [qt, txt, a, b, c, d, ans, pts] of e2Questions) {
    const [qr] = await q(`
      INSERT INTO questions
        (exam_id,question_type,question_text,option_a,option_b,option_c,option_d,
         correct_answer_letter,points)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id
    `, [e2.id, qt, txt, a, b, c, d, ans, pts]);
    e2QIds.push({ id: qr.id, correct: ans, pts });
  }

  // أسئلة e3 (مراجعة الدوال — 48 درجة: 5 عادية + 1 بصورة)
  const e3Questions = [
    ['mcq','إذا f(x)=3x+1، فإن f(2)=','5','6','7','8','C',8,null],
    ['mcq','قاطع الصادات للمستقيم y=2x+5 هو','2','5','7','0','B',8,null],
    ['mcq','الميل في المعادلة y=-3x+7 يساوي','-7','-3','3','7','B',8,null],
    ['mcq','إذا كان f(x)=x², فإن f(-3)=','-9','9','3','-3','B',8,null],
    ['true_false','الدالة y=x² دالة تربيعية','صح','خطأ',null,null,'T',8,null],
  ];
  const e3QIds = [];
  for (const [qt, txt, a, b, c, d, ans, pts] of e3Questions) {
    const [qr] = await q(`
      INSERT INTO questions
        (exam_id,question_type,question_text,option_a,option_b,option_c,option_d,
         correct_answer_letter,points)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id
    `, [e3.id, qt, txt, a, b, c, d, ans, pts]);
    e3QIds.push({ id: qr.id, correct: ans, pts, question_text: txt, question_type: qt, option_a: a, option_b: b, option_c: c, option_d: d });
  }

  // سؤال بصورة — e3 (الرسم البياني للدالة التربيعية f(x) = x²)
  const [e3ImgQ] = await q(`
    INSERT INTO questions
      (exam_id,question_type,question_text,option_a,option_b,option_c,option_d,
       correct_answer_letter,points,question_image_url)
    VALUES ($1,'mcq',
      'انظر إلى الرسم البياني للدالة f(x) = x² أمامك — أيٌّ من العبارات التالية صحيحة؟',
      'الدالة تتناقص على كامل مجالها',
      'الدالة تزداد لليمين وتتناقص لليسار من نقطة الأصل',
      'قيمة الدالة دائماً موجبة أو صفر لأي قيمة x',
      'للدالة جذران حقيقيان مختلفان',
      'C',8,$2)
    RETURNING id
  `, [e3.id,
     'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Graph_of_f%28x%29%3Dx%5E2.svg/400px-Graph_of_f%28x%29%3Dx%5E2.svg.png']);
  e3QIds.push({ id: e3ImgQ.id, correct: 'C', pts: 8, question_text: 'سؤال بصورة', question_type: 'mcq', option_a: null, option_b: null, option_c: null, option_d: null });

  // سؤال image_multi — e3 (صورة مع بنود متعددة — 9 درجات، 3 أسئلة فرعية)
  const e3MultiSubs = JSON.stringify([
    { label: '1', correct: 'B' },
    { label: '2', correct: 'A' },
    { label: '3', correct: 'C' },
  ]);
  const [e3MultiQ] = await q(`
    INSERT INTO questions
      (exam_id,question_type,question_text,option_a,option_b,option_c,option_d,
       correct_answer_letter,points,question_image_url,sub_questions)
    VALUES ($1,'image_multi',
      'انظر إلى الشكل التالي الذي يُظهر ثلاثة رسوم بيانية لدوال مختلفة — حدد نوع كل دالة من الخيارات الأربعة أمامك',
      'A','B','C','D','A',9,$2,$3)
    RETURNING id
  `, [e3.id,
     'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&h=350&fit=crop',
     e3MultiSubs]);
  e3QIds.push({ id: e3MultiQ.id, correct: 'A', pts: 9, question_type: 'image_multi', question_text: 'سؤال image_multi' });

  // أسئلة e5 (اختبار مشتقات — 30 درجة)
  const e5Questions = [
    ['mcq','مشتقة f(x) = 5x² تساوي','5x','10x','10x²','5','B',6,null],
    ['mcq','مشتقة sin(x) تساوي','cos(x)','-cos(x)','sin(x)','-sin(x)','A',6,null],
    ['mcq','مشتقة الثابت 7 تساوي','7','0','1','-7','B',6,null],
    ['mcq','مشتقة x³ - 2x تساوي','3x² - 2','3x² - 2x','x² - 2','3x - 2','A',6,null],
    ['true_false','مشتقة eˣ = eˣ','صح','خطأ',null,null,'T',6,null],
  ];
  const e5QIds = [];
  for (const [qt, txt, a, b, c, d, ans, pts] of e5Questions) {
    const [qr] = await q(`
      INSERT INTO questions
        (exam_id,question_type,question_text,option_a,option_b,option_c,option_d,
         correct_answer_letter,points)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id
    `, [e5.id, qt, txt, a, b, c, d, ans, pts]);
    e5QIds.push({ id: qr.id, correct: ans, pts });
  }

  // أسئلة e6 (التكامل — 30 درجة)
  const e6Questions = [
    ['mcq','∫2x dx = ','x + C','x² + C','2 + C','2x² + C','B',6,null],
    ['mcq','∫cos(x) dx = ','sin(x)+C','-sin(x)+C','cos(x)+C','tan(x)+C','A',6,null],
    ['mcq','∫(3x²) dx = ','3x + C','6x + C','x³ + C','3x³ + C','C',6,null],
    ['mcq','∫1 dx = ','0','C','x + C','x','C',6,null],
    ['true_false','∫eˣ dx = eˣ + C','صح','خطأ',null,null,'T',6,null],
  ];
  for (const [qt, txt, a, b, c, d, ans, pts] of e6Questions) {
    await q(`
      INSERT INTO questions
        (exam_id,question_type,question_text,option_a,option_b,option_c,option_d,
         correct_answer_letter,points)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [e6.id, qt, txt, a, b, c, d, ans, pts]);
  }

  // أسئلة e9 (الإحداثيات — 25 درجة)
  const e9Questions = [
    ['mcq','المسافة بين (0,0) و (3,4) تساوي','3','4','5','7','C',5,null],
    ['mcq','منتصف القطعة بين (2,4) و (6,8) هو','(3,5)','(4,6)','(8,12)','(2,4)','B',5,null],
    ['mcq','ميل المستقيم المار بـ (1,2) و (3,6) يساوي','1','2','3','4','B',5,null],
    ['mcq','معادلة المستقيم العمودي على محور x هي','y=c','x=c','y=x','y=-x','B',5,null],
    ['true_false','المسافة بين نقطتين دائماً موجبة','صح','خطأ',null,null,'T',5,null],
  ];
  const e9QIds = [];
  for (const [qt, txt, a, b, c, d, ans, pts] of e9Questions) {
    const [qr] = await q(`
      INSERT INTO questions
        (exam_id,question_type,question_text,option_a,option_b,option_c,option_d,
         correct_answer_letter,points)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id
    `, [e9.id, qt, txt, a, b, c, d, ans, pts]);
    e9QIds.push({ id: qr.id, correct: ans, pts });
  }

  // أسئلة e11 (أساسيات مجاني — 10 درجة)
  const e11Questions = [
    ['mcq','2 + 2 × 3 = ','8','10','12','7','A',2,null],
    ['mcq','√16 = ','2','4','8','16','B',2,null],
    ['mcq','5² = ','10','20','25','30','C',2,null],
    ['true_false','7 عدد أولي','صح','خطأ',null,null,'T',2,null],
    ['true_false','كل الأعداد الزوجية قابلة للقسمة على 2','صح','خطأ',null,null,'T',2,null],
  ];
  const e11QIds = [];
  for (const [qt, txt, a, b, c, d, ans, pts] of e11Questions) {
    const [qr] = await q(`
      INSERT INTO questions
        (exam_id,question_type,question_text,option_a,option_b,option_c,option_d,
         correct_answer_letter,points)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id
    `, [e11.id, qt, txt, a, b, c, d, ans, pts]);
    e11QIds.push({ id: qr.id, correct: ans, pts });
  }

  // أسئلة e10 (ث2 هندسة نشط — بسيطة)
  const e10Questions = [
    ['mcq','معادلة الدائرة مركزها الأصل ونصف قطرها 5','x²+y²=5','x²+y²=10','x²+y²=25','x+y=5','C',6,null],
    ['mcq','معادلة المستقيم أفقي يمر بـ (3,4)','x=3','y=4','y=3','x=4','B',6,null],
    ['mcq','ميل خط موازٍ لمحور x يساوي','لا نهاية','0','1','-1','B',6,null],
    ['true_false','المستقيمان المتوازيان ميلاهما متساويان','صح','خطأ',null,null,'T',6,null],
    ['true_false','حاصل ضرب ميلي المستقيمين المتعامدين = 1','صح','خطأ',null,null,'F',6,null],
  ];
  const e10QIds = [];
  for (const [qt, txt, a, b, c, d, ans, pts] of e10Questions) {
    const [qr] = await q(`
      INSERT INTO questions
        (exam_id,question_type,question_text,option_a,option_b,option_c,option_d,
         correct_answer_letter,points)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id
    `, [e10.id, qt, txt, a, b, c, d, ans, pts]);
    e10QIds.push({ id: qr.id, correct: ans, pts });
  }

  console.log('  ✓ الأسئلة أضيفت لكل الامتحانات');

  // ══════════════════════════════════════════════════════════
  // 9. تسجيل الطلاب في الكورسات
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة تسجيلات الكورسات...');

  // std_ali: مسجّل في C1 (مفتوح)، C2 (مفتوح)، C3 مجاني (مكتمل)
  // C5 (مسودة — مش مسجّل)، C4 (مش مسجّل — ليست لمرحلته)
  await q(`
    INSERT INTO student_course_enrollment (student_id,course_id,status,enrollment_date)
    VALUES
      ($1,$2,'active',NOW()-INTERVAL '25 days'),
      ($1,$3,'active',NOW()-INTERVAL '20 days'),
      ($1,$4,'active',NOW()-INTERVAL '30 days')
  `, [STD_ALI, c1.id, c2.id, c3.id]);

  // باقي طلاب ث3 في C1 و C3
  for (const sid of [sids['std_fatma'], sids['std_youssef'], sids['std_nada'], sids['std_omar']]) {
    await q(`
      INSERT INTO student_course_enrollment (student_id,course_id,status,enrollment_date)
      VALUES ($1,$2,'active',NOW()-INTERVAL '22 days')
      ON CONFLICT DO NOTHING
    `, [sid, c1.id]);
    await q(`
      INSERT INTO student_course_enrollment (student_id,course_id,status,enrollment_date)
      VALUES ($1,$2,'active',NOW()-INTERVAL '28 days')
      ON CONFLICT DO NOTHING
    `, [sid, c3.id]);
  }

  // std_youssef مسجّل في C2 أيضاً
  await q(`
    INSERT INTO student_course_enrollment (student_id,course_id,status,enrollment_date)
    VALUES ($1,$2,'active',NOW()-INTERVAL '18 days')
    ON CONFLICT DO NOTHING
  `, [sids['std_youssef'], c2.id]);

  // طلاب ث2 في C4 و C6
  for (const sid of S_TH2) {
    await q(`
      INSERT INTO student_course_enrollment (student_id,course_id,status,enrollment_date)
      VALUES ($1,$2,'active',NOW()-INTERVAL '15 days')
      ON CONFLICT DO NOTHING
    `, [sid, c4.id]);
    await q(`
      INSERT INTO student_course_enrollment (student_id,course_id,status,enrollment_date)
      VALUES ($1,$2,'active',NOW()-INTERVAL '20 days')
      ON CONFLICT DO NOTHING
    `, [sid, c6.id]);
  }

  // طلاب ث1 في c3 (مجاني) — سيغيبون عن e11 (سيناريو الغياب)
  await q(`
    INSERT INTO student_course_enrollment (student_id,course_id,status,enrollment_date)
    VALUES ($1,$2,'active',NOW()-INTERVAL '29 days')
    ON CONFLICT DO NOTHING
  `, [stdHanaId, c3.id]);
  await q(`
    INSERT INTO student_course_enrollment (student_id,course_id,status,enrollment_date)
    VALUES ($1,$2,'active',NOW()-INTERVAL '28 days')
    ON CONFLICT DO NOTHING
  `, [stdHassanId, c3.id]);

  // طلب تسجيل std_ali في C5 (معلّق pending) وطلب رفض لـ std_nada
  await q(`
    INSERT INTO course_enrollment_requests
      (student_id,course_id,status,message,created_at)
    VALUES
      ($1,$2,'pending','أريد الانضمام لهذا الكورس بمجرد نشره',NOW()-INTERVAL '5 days'),
      ($3,$4,'rejected','أريد الانضمام للكورس',NOW()-INTERVAL '8 days')
  `, [STD_ALI, c5.id, sids['std_nada'], c2.id]);

  console.log('  ✓ تسجيلات الكورسات (std_ali: C1+C2+C3 نشط، C5 معلّق) + ث1 في c3 (غياب e11)');

  // ══════════════════════════════════════════════════════════
  // 10. المدفوعات (12 دفعة — كل الحالات)
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة المدفوعات...');

  const payments = [
    // [studentId, courseId, amount, method, status, daysAgo, refNo, asstId, asstName]
    [STD_ALI,              c1.id, 300, 'instapay',   'verified', 24, 'INS-001-2025', asstNour.id,  'نور أحمد حسين'],
    [STD_ALI,              c2.id, 250, 'fawry',      'verified', 19, 'FAW-002-2025', asstKarim.id, 'كريم محمود'],
    [sids['std_fatma'],    c1.id, 300, 'instapay',   'verified', 21, 'INS-003-2025', asstNour.id,  'نور أحمد حسين'],
    [sids['std_youssef'],  c1.id, 300, 'bank',       'verified', 20, 'BNK-004-2025', asstKarim.id, 'كريم محمود'],
    [sids['std_youssef'],  c2.id, 250, 'instapay',   'verified', 17, 'INS-005-2025', asstNour.id,  'نور أحمد حسين'],
    [sids['std_nada'],     c1.id, 300, 'fawry',      'verified', 22, 'FAW-006-2025', asstNour.id,  'نور أحمد حسين'],
    [sids['std_omar'],     c1.id, 300, 'instapay',   'verified', 19, 'INS-007-2025', asstNour.id,  'نور أحمد حسين'],
    [sids['std_mostafa'],  c4.id, 200, 'bank',       'verified', 13, 'BNK-008-2025', asstKarim.id, 'كريم محمود'],
    [sids['std_rana'],     c4.id, 200, 'instapay',   'pending',   3, 'INS-009-2025', null, null],
    [sids['std_adam'],     c4.id, 200, 'fawry',      'pending',   2, 'FAW-010-2025', null, null],
    [sids['std_lina'],     c4.id, 200, 'instapay',   'rejected',  9, 'INS-011-2025', asstKarim.id, 'كريم محمود'],
    [sids['std_lina'],     c4.id, 200, 'bank',       'pending',   1, 'BNK-012-2025', null, null],
  ];

  for (const [sid, cid, amt, method, status, daysAgo, refNo, asstId, asstName] of payments) {
    const isResolved = status === 'verified' || status === 'rejected';
    const payDate = new Date(now.getTime() - daysAgo * 86400000);
    const verDate = isResolved ? new Date(payDate.getTime() + 3 * 3600000) : null;
    await q(`
      INSERT INTO payments
        (student_id,course_id,amount,method,status,reference_number,
         payment_date,verified_by,verified_by_name,verified_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [sid, cid, amt, method, status, refNo,
        payDate.toISOString(), asstId, asstName,
        verDate ? verDate.toISOString() : null]);
  }

  console.log('  ✓ 12 دفعة (verified×8, pending×3, rejected×1)');

  // ══════════════════════════════════════════════════════════
  // 11. نتائج الامتحانات (كل سيناريوهات std_ali + باقي الطلاب)
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة نتائج الامتحانات...');

  function seededRandom(seed) {
    let s = seed >>> 0;
    return () => {
      s = Math.imul(s, 1664525) + 1013904223 >>> 0;
      return s / 0x100000000;
    };
  }

  const makeResult = async (studentId, examId, qIds, correctPct, attemptNum = 1, isLatest = true, daysAgo = 10, passScore = 18, pointsOnPass = 15, pointsOnAttempt = 5) => {
    const rand = seededRandom(studentId * 1000000 + examId * 1000 + attemptNum);
    const answers = {};
    let score = 0;
    let correct = 0, wrong = 0, unanswered = 0;
    for (const { id, correct: correctAns, pts } of qIds) {
      const isCorrect = rand() * 100 < correctPct;
      if (isCorrect) {
        answers[id] = correctAns;
        score += pts;
        correct++;
      } else {
        const wrongLetters = ['A','B','C','D'].filter(l => l !== correctAns);
        answers[id] = wrongLetters[0];
        wrong++;
      }
    }
    const startT = new Date(now.getTime() - daysAgo * 86400000 - 3600000);
    const endT = new Date(startT.getTime() + 30 * 60000);
    // إذا كانت هذه أحدث نتيجة، اجعل كل النتائج السابقة لهذا الطالب في هذا الامتحان غير أحدث
    if (isLatest) {
      await q(`UPDATE exam_results SET is_latest = false WHERE student_id = $1 AND exam_id = $2`, [studentId, examId]);
    }
    await q(`
      INSERT INTO exam_results
        (student_id,exam_id,score,correct_count,wrong_count,unanswered_count,
         answers,start_time,end_time,points_earned,attempt_number,is_latest,is_absent,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,$13)
    `, [studentId, examId, score, correct, wrong, unanswered,
        JSON.stringify(answers), startT.toISOString(), endT.toISOString(),
        score >= passScore ? pointsOnPass : pointsOnAttempt, attemptNum, isLatest,
        endT.toISOString()]);
    return score;
  };

  // std_ali:
  // e1 (جبر): ناجح ✓ (attempt1 قديم راسب + attempt2 ناجح)
  await makeResult(STD_ALI, e1.id, e1QIds, 40, 1, false, 22, 18, 15, 5); // راسب أول محاولة
  await makeResult(STD_ALI, e1.id, e1QIds, 90, 2, true,  12, 18, 15, 5); // ناجح ثاني محاولة

  // e2 (مثلثات): راسب ← طلب إعادة مقبولة
  await makeResult(STD_ALI, e2.id, e2QIds, 35, 1, true, 8, 30, 20, 5);

  // e3 (مراجعة دوال): لم يؤده بعد — لا نتيجة

  // e4 (نهائي): لم يبدأ بعد — لا نتيجة (start_date في المستقبل)

  // e5 (مشتقات): ناجح ✓
  await makeResult(STD_ALI, e5.id, e5QIds, 100, 1, true, 5, 18, 15, 5);

  // e6 (تكامل): لم يؤده بعد

  // e11 (أساسيات): ناجح ✓
  await makeResult(STD_ALI, e11.id, e11QIds, 100, 1, true, 25, 6, 5, 2);

  // طلاب آخرون في e1
  await makeResult(sids['std_fatma'],   e1.id, e1QIds, 70, 1, true, 20, 18, 15, 5);
  await makeResult(sids['std_youssef'], e1.id, e1QIds, 90, 1, true, 20, 18, 15, 5);
  await makeResult(sids['std_nada'],    e1.id, e1QIds, 50, 1, true, 20, 18, 15, 5);
  await makeResult(sids['std_omar'],    e1.id, e1QIds, 60, 1, true, 20, 18, 15, 5);

  // طلاب آخرون في e2
  await makeResult(sids['std_fatma'],   e2.id, e2QIds, 65, 1, true, 15, 30, 20, 5);
  await makeResult(sids['std_youssef'], e2.id, e2QIds, 85, 1, true, 15, 30, 20, 5);

  // طلاب ث2 في e9
  await makeResult(sids['std_mostafa'], e9.id, e9QIds, 80, 1, true, 9, 15, 12, 3);
  await makeResult(sids['std_rana'],    e9.id, e9QIds, 55, 1, true, 9, 15, 12, 3);
  await makeResult(sids['std_adam'],    e9.id, e9QIds, 40, 1, true, 9, 15, 12, 3);

  // std_ali في e11 (مجاني — ناجح مسبقاً — سجّلناه بالأعلى)

  // ── نتائج إضافية لتغطية الأرشيف بشكل كامل ──────────────────────────────

  // e2 (المثلثات — pass=30/50): نتائج إضافية لطلاب ث3
  await makeResult(sids['std_nada'],  e2.id, e2QIds, 28, 1, true, 13, 30, 20, 5);  // راسب ✗
  await makeResult(sids['std_omar'],  e2.id, e2QIds, 50, 1, true, 14, 30, 20, 5);  // راسب ✗

  // e5 (المشتقات — pass=18/30): يوسف مسجّل في C2
  await makeResult(sids['std_youssef'], e5.id, e5QIds, 85, 1, true, 4, 18, 15, 5);  // ناجح ✓

  // e9 (الإحداثيات — pass=15/25): نتيجة إضافية لينا
  await makeResult(sids['std_lina'], e9.id, e9QIds, 72, 1, true, 8, 15, 12, 3);  // ناجح ✓

  // e10 (المستقيم والدائرة — pass=18/30): كل طلاب ث2
  await makeResult(sids['std_mostafa'], e10.id, e10QIds, 90, 1, true, 0, 18, 12, 3);  // ناجح ✓
  await makeResult(sids['std_rana'],    e10.id, e10QIds, 45, 1, true, 0, 18, 12, 3);  // راسب ✗
  await makeResult(sids['std_adam'],    e10.id, e10QIds, 35, 1, true, 0, 18, 12, 3);  // راسب ✗
  await makeResult(sids['std_lina'],    e10.id, e10QIds, 80, 1, true, 0, 18, 12, 3);  // ناجح ✓

  // e11 (الأساسيات المجانية — pass=6/10): باقي طلاب ث3 المسجّلين في c3
  await makeResult(sids['std_fatma'],   e11.id, e11QIds, 80,  1, true, 24, 6, 5, 2);  // ناجح ✓
  await makeResult(sids['std_youssef'], e11.id, e11QIds, 100, 1, true, 23, 6, 5, 2);  // ناجح ✓
  await makeResult(sids['std_nada'],    e11.id, e11QIds, 40,  1, true, 22, 6, 5, 2);  // راسب ✗
  await makeResult(sids['std_omar'],    e11.id, e11QIds, 70,  1, true, 21, 6, 5, 2);  // ناجح ✓

  // e1 (الجبر — محاولة ثانية لـ std_nada بعد قبول الإعادة — راسب للمرة الثانية)
  await makeResult(sids['std_nada'], e1.id, e1QIds, 45, 2, true, 8, 18, 15, 5);  // أحدث محاولة راسبة

  // ── سيناريو الغياب: std_hana و std_hassan مسجَّلان في c3 ولم يؤدِّيا e11 ──
  // [absent_marked] نفس البنية التي تولّدها markAbsentStudents() تلقائياً:
  //   score=0، is_absent=true، is_latest=true، attempt_number=1، points_earned=0
  await q(`
    INSERT INTO exam_results
      (student_id,exam_id,score,correct_count,wrong_count,unanswered_count,
       is_absent,is_latest,attempt_number,points_earned)
    VALUES
      ($1,$2,0,0,0,0,true,true,1,0),
      ($3,$2,0,0,0,0,true,true,1,0)
  `, [stdHanaId, e11.id, stdHassanId]);

  await q(`UPDATE exams SET absent_marked=true WHERE id=$1`, [e11.id]);

  console.log('  ✓ نتائج الامتحانات: std_ali (ناجح×3، راسب×1، لم يؤده×3) + أرشيف شامل + غياب (std_hana+std_hassan في e11)');

  // ══════════════════════════════════════════════════════════
  // 12. طلبات إعادة الامتحان
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة طلبات الإعادة...');

  // std_ali طلب إعادة e2 (مثلثات) — مقبولة
  await q(`
    INSERT INTO exam_retry_requests
      (student_id,exam_id,status,message,teacher_note,created_at,handled_at)
    VALUES ($1,$2,'accepted',
      'أستاذ محمد، لقد راجعت أخطائي وأريد فرصة للإعادة. أعدت دراسة المثلثات بالكامل.',
      'تم القبول — يمكنك تأدية الامتحان مجدداً خلال الفترة المتاحة.',
      NOW()-INTERVAL '7 days', NOW()-INTERVAL '6 days')
  `, [STD_ALI, e2.id]);

  // std_omar طلب إعادة e1 — مرفوضة
  await q(`
    INSERT INTO exam_retry_requests
      (student_id,exam_id,status,message,teacher_note,created_at,handled_at)
    VALUES ($1,$2,'rejected',
      'أستاذ أريد إعادة الامتحان.',
      'تم الرفض — الدرجة فوق الحد المقبول.',
      NOW()-INTERVAL '4 days', NOW()-INTERVAL '3 days')
  `, [sids['std_omar'], e1.id]);

  // std_nada طلب إعادة e1 — معلّق
  await q(`
    INSERT INTO exam_retry_requests
      (student_id,exam_id,status,message,created_at)
    VALUES ($1,$2,'pending',
      'أستاذ محمد، لم أستطع التركيز يوم الامتحان بسبب ظروف طارئة. أرجو فرصة.',
      NOW()-INTERVAL '2 days')
  `, [sids['std_nada'], e1.id]);

  console.log('  ✓ 3 طلبات إعادة (مقبولة×1، مرفوضة×1، معلّقة×1)');

  // ══════════════════════════════════════════════════════════
  // 13. الشارات (badges)
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة الشارات...');

  // std_ali: نجم الجبر + نجم التفاضل
  await q(`
    INSERT INTO badges (student_id,exam_id,badge_name,badge_color,earned_at)
    VALUES
      ($1,$2,'نجم الجبر','#f97316',NOW()-INTERVAL '12 days'),
      ($1,$3,'نجم التفاضل','#10b981',NOW()-INTERVAL '5 days')
    ON CONFLICT DO NOTHING
  `, [STD_ALI, e1.id, e5.id]);

  await q(`
    INSERT INTO badges (student_id,exam_id,badge_name,badge_color,earned_at)
    VALUES
      ($1,$2,'نجم الجبر','#f97316',NOW()-INTERVAL '20 days'),
      ($3,$2,'نجم الجبر','#f97316',NOW()-INTERVAL '20 days')
    ON CONFLICT DO NOTHING
  `, [sids['std_youssef'], e1.id, sids['std_fatma']]);

  console.log('  ✓ شارات: std_ali (×2) + youssef + fatma');

  // ══════════════════════════════════════════════════════════
  // 14. جلسات الامتحانات النشطة (exam_sessions)
  // ══════════════════════════════════════════════════════════
  // std_ali بدأ e3 (مراجعة الدوال) لكن لم يكمله — جلسة نشطة
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة جلسات الامتحانات...');

  const e3Questions_snap = e3QIds.slice(0, 2).map(q => ({
    id: q.id, question_text: q.question_text, question_type: q.question_type,
    option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d,
    correct_answer_letter: q.correct, points: q.pts
  }));

  await q(`
    INSERT INTO exam_sessions (student_id,exam_id,started_at,questions_snapshot)
    VALUES ($1,$2,NOW()-INTERVAL '15 minutes',$3)
    ON CONFLICT (student_id,exam_id) DO NOTHING
  `, [STD_ALI, e3.id, JSON.stringify(e3Questions_snap)]);

  console.log('  ✓ جلسة امتحان نشطة: std_ali في e3 (بدأ ولم يكمل)');

  // ══════════════════════════════════════════════════════════
  // 15. تقدم الفيديو (video_progress)
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة تقدم الفيديو...');

  const setProgress = async (studentId, videoId, durMins, pct, daysAgo) => {
    const watched = Math.round(durMins * pct / 100);
    const actual  = watched * 60;
    const pos     = Math.min(watched * 60, durMins * 60 * 0.95);
    await q(`
      INSERT INTO video_progress
        (student_id,video_id,watch_count,watched_minutes,progress_percentage,
         last_watched_at,last_position,actual_watched_seconds)
      VALUES ($1,$2,$3,$4,$5,NOW()-($6::int * INTERVAL '1 day'),$7,$8)
      ON CONFLICT (student_id,video_id) DO UPDATE SET
        watched_minutes=$4, progress_percentage=$5,
        last_watched_at=NOW()-($6::int * INTERVAL '1 day'),
        last_position=$7, actual_watched_seconds=$8,
        watch_count=video_progress.watch_count+1
    `, [studentId, videoId, 1, watched, pct, daysAgo, pos, actual]);
  };

  // std_ali تقدمه في C1 (جبر):
  // قسم 1: اكتمل (100%)، قسم 2: جزئي (c1v4=100%, c1v5=60%, c1v6=0%)، قسم 3: لم يبدأ
  await setProgress(STD_ALI, c1v1, 28, 100, 20);
  await setProgress(STD_ALI, c1v2, 35, 100, 18);
  await setProgress(STD_ALI, c1v3, 22, 100, 16);
  await setProgress(STD_ALI, c1v4, 30, 100, 14);
  await setProgress(STD_ALI, c1v5, 40,  60, 10);
  // c1v6, c1v7, c1v8, c1v9 — لم يشاهد بعد

  // std_ali في C2 (تفاضل): بدأ الوحدة الأولى فقط
  await setProgress(STD_ALI, c2v1, 35, 100, 12);
  await setProgress(STD_ALI, c2v2, 42,  75,  8);
  await setProgress(STD_ALI, c2v3, 38,  30,  5);
  // c2v4..c2v6 لم يشاهد

  // std_ali في C3 (مجاني): أكمله بالكامل
  await setProgress(STD_ALI, c3v1, 20, 100, 28);
  await setProgress(STD_ALI, c3v2, 18, 100, 28);
  await setProgress(STD_ALI, c3v3, 15, 100, 28);

  // باقي طلاب ث3 في C1
  const c1Vids = [c1v1,c1v2,c1v3,c1v4,c1v5,c1v6,c1v7,c1v8,c1v9];
  const c1Durs = [28,35,22,30,40,38,32,25,20];
  const c1Pcts = [
    [100, 100,  80, 60,  0, 0,  0,  0,  0], // fatma
    [100, 100, 100,100,100,80, 50, 30,  0], // youssef
    [100,  60,   0,  0,  0, 0,  0,  0,  0], // nada
    [100, 100,  90, 70, 40, 0,  0,  0,  0], // omar
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
    ['نتيجة الامتحان',  'تهانينا! حصلت على 27/30 في امتحان الجبر وكسبت شارة "نجم الجبر"! 🏆',    'exam_result',     true,  18],
    ['امتحان جديد',     'تم نشر اختبار "مراجعة الدوال" — متاح حتى بعد 5 أيام.',                   'new_exam',        true,   3],
    ['موافقة إعادة',    'وافق الأستاذ محمد على طلب إعادة امتحان المثلثات. يمكنك التقديم الآن.',   'retry_approved',  true,   6],
    ['تسميع جديد 📖',   'تم نشر تسميع جديد: "تسميع المشتقات اليومي". أدِّه قبل انتهاء الوقت!',   'new_recitation',  true,   4],
    ['امتحان قادم',     'تذكير: الاختبار النهائي سيبدأ بعد 7 أيام — ابدأ المراجعة الآن!',          'reminder',        false,  7],
    ['محتوى جديد',      'تم إضافة 3 فيديوهات جديدة في باب الدوال بكورس الجبر والمثلثات.',         'announcement',    false,  4],
    ['تهنئة نقاط',      'عظيم! وصلت إلى 1250 نقطة وتحتل المركز الثالث في قائمة المتصدرين.',       'points',          false,  2],
    ['امتحان جديد',     'تم نشر اختبار التكامل — لديك 6 أيام للإجابة. درجة الاجتياز 18/30.',      'new_exam',        false,  1],
    ['تسميع أسبوعي 📖', 'تذكير: لم تؤدِّ تسميع هذا الأسبوع بعد. المهلة تنتهي خلال يومين!',        'reminder',        false,  1],
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
    ['تسميع جديد 📖',   'تم نشر تسميع "مراجعة المثلثات الأسبوعية" — أدِّه الآن!',          'new_recitation', 6],
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
  console.log('  ✓ إشعارات: 9 لـ std_ali (4 مقروءة + 5 غير مقروءة) + جماعية');

  // ══════════════════════════════════════════════════════════
  // 18. سجل المتصدرين
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة سجل المتصدرين...');

  const junRankings = [
    { student_id: STD_ALI,             name: 'علي محمد رمضان',    points: 1250, rank: 1 },
    { student_id: sids['std_youssef'], name: 'يوسف إبراهيم كمال', points: 1100, rank: 2 },
    { student_id: sids['std_fatma'],   name: 'فاطمة أحمد سعد',    points: 980,  rank: 3 },
    { student_id: sids['std_omar'],    name: 'عمر سامي فرج',      points: 720,  rank: 4 },
    { student_id: sids['std_nada'],    name: 'ندى حسن عبد الله',  points: 640,  rank: 5 },
    { student_id: sids['std_mostafa'], name: 'مصطفى أسامة نور',   points: 340,  rank: 6 },
    { student_id: sids['std_rana'],    name: 'رنا طارق عبد العزيز',points: 420,  rank: 7 },
    { student_id: sids['std_adam'],    name: 'آدم محمود صلاح',    points: 295,  rank: 8 },
    { student_id: sids['std_lina'],    name: 'لينا سعيد القاضي',  points: 380,  rank: 9 },
    { student_id: sids['std_hana'],    name: 'هناء وليد منصور',   points: 150,  rank: 10 },
    { student_id: sids['std_hassan'],  name: 'حسن علاء طارق',     points: 190,  rank: 11 },
    { student_id: stdZero.id,          name: 'طالب اختبار — بدون نقاط', points: 0, rank: 12 },
  ];
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
    VALUES ($1,'يونيو 2026',NOW()-INTERVAL '1 day',$2)
  `, [T1, JSON.stringify(junRankings)]);
  await q(`
    INSERT INTO leaderboard_history (teacher_id,month_label,reset_at,rankings)
    VALUES ($1,'مايو 2026',NOW()-INTERVAL '31 days',$2)
  `, [T1, JSON.stringify(mayRankings)]);
  await q(`
    INSERT INTO leaderboard_history (teacher_id,month_label,reset_at,rankings)
    VALUES ($1,'أبريل 2026',NOW()-INTERVAL '61 days',$2)
  `, [T1, JSON.stringify(aprRankings)]);

  await q(`
    INSERT INTO leaderboard_reset_tracker (teacher_id,last_reset_at,next_reset_at)
    VALUES ($1,NOW()-INTERVAL '1 day',NOW()+INTERVAL '29 days')
    ON CONFLICT (teacher_id) DO UPDATE SET
      last_reset_at=NOW()-INTERVAL '1 day',
      next_reset_at=NOW()+INTERVAL '29 days'
  `, [T1]);
  console.log('  ✓ سجل متصدرين شهرين');

  // ══════════════════════════════════════════════════════════
  // 19. البث المباشر
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة جلسات البث المباشر...');

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

  await q(`
    INSERT INTO live_streams
      (teacher_id,room_id,title,description,access,chat_enabled,
       hand_raise_enabled,status,is_locked,scheduled_at)
    VALUES ($1,'room-final-review-001',
      'المراجعة الشاملة قبل الاختبار النهائي',
      'جلسة مراجعة مكثفة تغطي كل المنهج — حضور إلزامي',
      'all',true,true,'scheduled',false,$2)
  `, [T1, future(5)]);

  await q(`
    INSERT INTO live_stream_viewers
      (stream_id,student_id,joined_at,left_at,is_active,can_speak,can_share_screen,is_kicked)
    VALUES ($1,$2,
      NOW()-INTERVAL '10 days'-INTERVAL '1 hour 45 minutes',
      NOW()-INTERVAL '10 days'-INTERVAL '5 minutes',
      false,false,false,false)
    ON CONFLICT (stream_id,student_id) DO NOTHING
  `, [ls1.id, STD_ALI]);

  await q(`
    INSERT INTO live_stream_viewers
      (stream_id,student_id,joined_at,is_active,can_speak,can_share_screen,is_kicked)
    VALUES ($1,$2,NOW()-INTERVAL '25 minutes',true,false,false,false)
    ON CONFLICT (stream_id,student_id) DO NOTHING
  `, [ls2.id, sids['std_youssef']]);

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

  await q(`
    INSERT INTO live_hand_raises
      (stream_id,student_id,raised_at,lowered_at,is_active)
    VALUES ($1,$2,
      NOW()-INTERVAL '10 days'-INTERVAL '1 hour',
      NOW()-INTERVAL '10 days'-INTERVAL '55 minutes',
      false)
    ON CONFLICT (stream_id,student_id) DO NOTHING
  `, [ls1.id, STD_ALI]);

  console.log('  ✓ 3 جلسات بث (منتهي×1، نشط×1، مجدول×1)');

  // ══════════════════════════════════════════════════════════
  // 20. الفعاليات (Stickman Run)
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة بيانات الفعاليات...');

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
  console.log('  ✓ فعاليات Stickman Run');

  // ══════════════════════════════════════════════════════════
  // 21. رموز جلسات الألعاب
  // ══════════════════════════════════════════════════════════
  await q(`
    INSERT INTO game_session_tokens (student_id,token,event_id,created_at,used_at)
    VALUES
      ($1,'token_ali_w20_used','weekly-run-2025-w20',
       NOW()-INTERVAL '7 days',NOW()-INTERVAL '7 days'+INTERVAL '30 minutes'),
      ($2,'token_youssef_w21_used','weekly-run-2025-w21',
       NOW()-INTERVAL '2 days',NOW()-INTERVAL '2 days'+INTERVAL '45 minutes')
  `, [STD_ALI, sids['std_youssef']]);

  console.log('  ✓ رموز جلسات الألعاب');

  // ══════════════════════════════════════════════════════════
  // 22. أجهزة الطلاب + تنبيهات
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة بيانات الأجهزة...');

  // std_ali: لا يوجد جهاز مسبق — حتى يتمكن من تسجيل الدخول بدون مشاكل
  // (أول تسجيل دخول من المتصفح سيُضاف كجهاز أول — مسموح بجهازين كحد أقصى)

  await q(`
    INSERT INTO student_devices
      (student_id,device_id,device_name,user_agent,ip_address,first_seen,last_seen)
    VALUES ($1,'device_youssef_android_001','Samsung Galaxy S23',
      'Mozilla/5.0 (Linux; Android 13) AppleWebKit','197.34.5.110',
      NOW()-INTERVAL '18 days',NOW()-INTERVAL '2 days')
  `, [sids['std_youssef']]);

  await q(`
    INSERT INTO student_devices
      (student_id,device_id,device_name,user_agent,ip_address,first_seen,last_seen)
    VALUES ($1,'device_nada_001','Laptop Unknown',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit','197.34.5.120',
      NOW()-INTERVAL '3 days',NOW()-INTERVAL '3 days')
  `, [sids['std_nada']]);

  await q(`
    INSERT INTO device_alerts
      (teacher_id,student_id,alert_type,device_id,device_name,ip_address,status,created_at)
    VALUES ($1,$2,'device_limit_exceeded','device_nada_001',
      'Laptop Unknown','197.34.5.120','pending',NOW()-INTERVAL '3 days')
  `, [T1, sids['std_nada']]);

  console.log('  ✓ أجهزة الطلاب (std_ali: لا جهاز مسبق) + 1 تنبيه');

  // ══════════════════════════════════════════════════════════
  // 23. التسميعات (recitations) — كل الحالات
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة التسميعات...');

  // r1: تسميع يومي على المشتقات — مرتبط بكورس التفاضل (c2)
  const [r1] = await q(`
    INSERT INTO recitations
      (teacher_id,title,description,academic_stage,duration_minutes,
       total_score,pass_score,points_on_attempt,points_on_pass,
       schedule_type,start_date,end_date,is_published,
       shuffle_questions,shuffle_options,course_id,video_ids)
    VALUES ($1,
      'تسميع المشتقات اليومي',
      'تسميع سريع على قواعد المشتقات — 5 أسئلة خلال 10 دقائق',
      'الصف الثالث الثانوي',10,10,6,2,5,
      'daily',
      $2,$3,true,false,false,$4,$5)
    RETURNING id
  `, [T1, past(7), future(1), c2.id, JSON.stringify([c2v3, c2v4])]);

  // r2: تسميع أسبوعي على المثلثات — مرتبط بكورس الجبر (c1)
  const [r2] = await q(`
    INSERT INTO recitations
      (teacher_id,title,description,academic_stage,duration_minutes,
       total_score,pass_score,points_on_attempt,points_on_pass,
       schedule_type,schedule_day,start_date,end_date,is_published,
       shuffle_questions,shuffle_options,course_id,video_ids)
    VALUES ($1,
      'مراجعة المثلثات الأسبوعية',
      'تسميع أسبوعي شامل على النسب المثلثية وقوانينها',
      'الصف الثالث الثانوي',15,20,12,3,10,
      'weekly',6,
      $2,$3,true,true,false,$4,$5)
    RETURNING id
  `, [T1, past(5), future(2), c1.id, JSON.stringify([c1v7, c1v8, c1v9])]);

  // r3: تسميع قواعد التكامل — مرتبط بكورس التفاضل (c2)
  const [r3] = await q(`
    INSERT INTO recitations
      (teacher_id,title,description,academic_stage,duration_minutes,
       total_score,pass_score,points_on_attempt,points_on_pass,
       schedule_type,start_date,end_date,is_published,
       shuffle_questions,shuffle_options,course_id,video_ids)
    VALUES ($1,
      'تسميع قواعد التكامل',
      'أسئلة على قوانين التكامل الأساسية — مستوى متوسط',
      'الصف الثالث الثانوي',12,24,15,2,8,
      'once',
      $2,$3,true,false,true,$4,$5)
    RETURNING id
  `, [T1, past(1), future(4), c2.id, JSON.stringify([c2v5, c2v6])]);

  // r4: تسميع شامل قادم (start_date في المستقبل) — لا كورس محدد
  const [r4] = await q(`
    INSERT INTO recitations
      (teacher_id,title,description,academic_stage,duration_minutes,
       total_score,pass_score,points_on_attempt,points_on_pass,
       schedule_type,start_date,end_date,is_published)
    VALUES ($1,
      'تسميع الاختبار النهائي الشامل',
      'مراجعة شاملة قبل الاختبار النهائي — 20 سؤال',
      'الصف الثالث الثانوي',20,30,18,5,15,
      'once',
      $2,$3,true)
    RETURNING id
  `, [T1, future(5), future(12)]);

  // r5: تسميع ث2 — مرتبط بكورس الهندسة التحليلية (c4)
  const [r5] = await q(`
    INSERT INTO recitations
      (teacher_id,title,description,academic_stage,duration_minutes,
       total_score,pass_score,points_on_attempt,points_on_pass,
       schedule_type,start_date,end_date,is_published,course_id,video_ids)
    VALUES ($1,
      'تسميع الهندسة التحليلية — ث2',
      'أسئلة على الإحداثيات والمستقيمات',
      'الصف الثاني الثانوي',10,10,6,2,5,
      'once',
      $2,$3,true,$4,$5)
    RETURNING id
  `, [T1, past(3), future(3), c4.id, JSON.stringify([c4v3, c4v4])]);

  // r6: تسميع مسودة (غير منشور) — لا كورس
  const [r6] = await q(`
    INSERT INTO recitations
      (teacher_id,title,description,academic_stage,duration_minutes,
       total_score,pass_score,points_on_attempt,points_on_pass,
       schedule_type,is_published)
    VALUES ($1,
      'تسميع الإحصاء [مسودة]',
      'قيد الإعداد',
      'الصف الثالث الثانوي',10,10,6,2,5,
      'once',false)
    RETURNING id
  `, [T1]);

  console.log('  ✓ 6 تسميعات (نشط×4، قادم×1، مسودة×1) — مرتبطة بالكورسات');

  // ── أسئلة التسميعات ─────────────────────────────────────

  // أسئلة r1 (مشتقات — 10 درجات، 5 أسئلة)
  const r1Questions = [
    ['mcq','مشتقة f(x) = 4x² تساوي','4x','8x','8x²','4','B',2,1],
    ['mcq','مشتقة الثابت 10 تساوي','10','0','1','-10','B',2,2],
    ['mcq','مشتقة sin(x) تساوي','cos(x)','-cos(x)','sin(x)','-sin(x)','A',2,3],
    ['true_false','مشتقة eˣ = eˣ','صح','خطأ',null,null,'T',2,4],
    ['true_false','مشتقة x⁴ = 4x³','صح','خطأ',null,null,'T',2,5],
  ];
  const r1QIds = [];
  for (const [qt, txt, a, b, c, d, ans, pts, ord] of r1Questions) {
    const [qr] = await q(`
      INSERT INTO recitation_questions
        (recitation_id,question_type,question_text,option_a,option_b,option_c,option_d,
         correct_answer_letter,points,sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id
    `, [r1.id, qt, txt, a, b, c, d, ans, pts, ord]);
    r1QIds.push({ id: qr.id, correct: ans, pts });
  }

  // أسئلة r2 (مثلثات — 20 درجة، 5 أسئلة)
  const r2Questions = [
    ['mcq','sin(45°) يساوي','1/2','√2/2','√3/2','1','B',4,1],
    ['mcq','cos(0°) يساوي','0','1/2','1','√3/2','C',4,2],
    ['mcq','tan(60°) يساوي','1','√3','√3/2','1/2','B',4,3],
    ['true_false','sin(90°) = 1','صح','خطأ',null,null,'T',4,4],
    ['true_false','cos(180°) = 1','صح','خطأ',null,null,'F',4,5],
  ];
  const r2QIds = [];
  for (const [qt, txt, a, b, c, d, ans, pts, ord] of r2Questions) {
    const [qr] = await q(`
      INSERT INTO recitation_questions
        (recitation_id,question_type,question_text,option_a,option_b,option_c,option_d,
         correct_answer_letter,points,sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id
    `, [r2.id, qt, txt, a, b, c, d, ans, pts, ord]);
    r2QIds.push({ id: qr.id, correct: ans, pts });
  }

  // أسئلة r3 (تكامل — 18 درجة: 5 عادية + 1 بصورة)
  const r3Questions = [
    ['mcq','∫3x² dx = ','x³+C','3x+C','x²+C','3x³+C','A',3,1],
    ['mcq','∫cos(x) dx = ','sin(x)+C','-sin(x)+C','cos(x)+C','-cos(x)+C','A',3,2],
    ['mcq','∫0 dx = ','0','x','x+C','C','D',3,3],
    ['true_false','∫eˣ dx = eˣ + C','صح','خطأ',null,null,'T',3,4],
    ['true_false','التكامل المحدود يعطي مساحة','صح','خطأ',null,null,'T',3,5],
  ];
  for (const [qt, txt, a, b, c, d, ans, pts, ord] of r3Questions) {
    await q(`
      INSERT INTO recitation_questions
        (recitation_id,question_type,question_text,option_a,option_b,option_c,option_d,
         correct_answer_letter,points,sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [r3.id, qt, txt, a, b, c, d, ans, pts, ord]);
  }

  // سؤال بصورة — r3 (الرسم البياني للتكامل المحدود بين x=0 و x=2)
  await q(`
    INSERT INTO recitation_questions
      (recitation_id,question_type,question_text,option_a,option_b,option_c,option_d,
       correct_answer_letter,points,sort_order,question_image_url)
    VALUES ($1,'mcq',
      'انظر إلى الرسم البياني أمامك — ما قيمة التكامل المحدود للدالة f(x) = 2x بين x=0 و x=2؟',
      '2','4','6','8','B',3,6,$2)
  `, [r3.id,
     'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Integral_approximation.svg/400px-Integral_approximation.svg.png']);

  // سؤال image_multi — r3 (صورة مع بنود متعددة — 6 درجات، 3 أسئلة فرعية)
  const r3MultiSubs = JSON.stringify([
    { label: '1', correct: 'A' },
    { label: '2', correct: 'C' },
    { label: '3', correct: 'B' },
  ]);
  await q(`
    INSERT INTO recitation_questions
      (recitation_id,question_type,question_text,option_a,option_b,option_c,option_d,
       correct_answer_letter,points,sort_order,question_image_url,sub_questions)
    VALUES ($1,'image_multi',
      'انظر إلى الشكل التالي الذي يوضح قواعد التكامل — حدد نتيجة كل تكامل من الخيارات',
      'A','B','C','D','A',6,7,$2,$3)
  `, [r3.id,
     'https://images.unsplash.com/photo-1509228627152-72ae9ae6848d?w=600&h=350&fit=crop',
     r3MultiSubs]);

  // أسئلة r4 (شامل — 30 درجة)
  const r4Questions = [
    ['mcq','إذا f(x) = x³، فإن f\'(x) = ','3x²','x²','3x','2x','A',3,1],
    ['mcq','sin²(x)+cos²(x) يساوي','0','1/2','1','2','C',3,2],
    ['mcq','∫2x dx = ','x+C','x²+C','2+C','2x+C','B',3,3],
    ['mcq','حل x²-25=0','x=5','x=±5','x=-5','x=25','B',3,4],
    ['mcq','cos(90°) يساوي','1','0','-1','1/2','B',3,5],
    ['mcq','مشتقة cos(x) تساوي','-sin(x)','sin(x)','-cos(x)','cos(x)','A',3,6],
    ['true_false','tan(45°) = 1','صح','خطأ',null,null,'T',3,7],
    ['true_false','∫sin(x) dx = cos(x)+C','صح','خطأ',null,null,'F',3,8],
    ['true_false','مشتقة الثابت = 0','صح','خطأ',null,null,'T',3,9],
    ['true_false','كل دالة مستمرة قابلة للاشتقاق','صح','خطأ',null,null,'F',3,10],
  ];
  for (const [qt, txt, a, b, c, d, ans, pts, ord] of r4Questions) {
    await q(`
      INSERT INTO recitation_questions
        (recitation_id,question_type,question_text,option_a,option_b,option_c,option_d,
         correct_answer_letter,points,sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [r4.id, qt, txt, a, b, c, d, ans, pts, ord]);
  }

  // أسئلة r5 (ث2 هندسة)
  const r5Questions = [
    ['mcq','المسافة بين (0,0) و (3,4) = ','3','4','5','7','C',2,1],
    ['mcq','ميل المستقيم y=3x+1 يساوي','1','3','4','0','B',2,2],
    ['true_false','ميل الخط الأفقي = صفر','صح','خطأ',null,null,'T',2,3],
    ['true_false','منتصف (2,4) و (6,8) هو (4,6)','صح','خطأ',null,null,'T',2,4],
    ['mcq','معادلة المحور الصادي هي','y=0','x=0','y=x','x=1','B',2,5],
  ];
  const r5QIds = [];
  for (const [qt, txt, a, b, c, d, ans, pts, ord] of r5Questions) {
    const [qr] = await q(`
      INSERT INTO recitation_questions
        (recitation_id,question_type,question_text,option_a,option_b,option_c,option_d,
         correct_answer_letter,points,sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id
    `, [r5.id, qt, txt, a, b, c, d, ans, pts, ord]);
    r5QIds.push({ id: qr.id, correct: ans, pts });
  }

  console.log('  ✓ أسئلة التسميعات أضيفت');

  // ── نتائج التسميعات ──────────────────────────────────────

  // std_ali في r1: ناجح ✓ (10/10)
  await q(`
    INSERT INTO recitation_results
      (student_id,recitation_id,score,correct_count,wrong_count,unanswered_count,
       answers,points_earned,start_time,end_time,passed,created_at,questions_snapshot)
    VALUES ($1,$2,10,5,0,0,
      $3,7,
      NOW()-INTERVAL '5 days'-INTERVAL '10 minutes',
      NOW()-INTERVAL '5 days',
      true,NOW()-INTERVAL '5 days',$4)
  `, [STD_ALI, r1.id, JSON.stringify(
    r1QIds.map(q => ({ question_id: q.id, answer: q.correct, correct: true }))
  ), makeRecitSnapshot(r1QIds)]);

  // std_ali في r2: راسب ✗ (8/20 — دون درجة النجاح 12)
  await q(`
    INSERT INTO recitation_results
      (student_id,recitation_id,score,correct_count,wrong_count,unanswered_count,
       answers,points_earned,start_time,end_time,passed,created_at,questions_snapshot)
    VALUES ($1,$2,8,2,3,0,
      $3,3,
      NOW()-INTERVAL '4 days'-INTERVAL '14 minutes',
      NOW()-INTERVAL '4 days',
      false,NOW()-INTERVAL '4 days',$4)
  `, [STD_ALI, r2.id, JSON.stringify(
    r2QIds.map((q, i) => ({ question_id: q.id, answer: i < 2 ? q.correct : 'A', correct: i < 2 }))
  ), makeRecitSnapshot(r2QIds)]);

  // r3: std_ali لم يؤده بعد (لا نتيجة)
  // r4: قادم — لم يفتح بعد (لا نتيجة)

  // دالة مساعدة: بناء snapshot الأسئلة للتسميع (تُخزَّن في recitation_results)
  function makeRecitSnapshot(qIds) {
    return JSON.stringify(qIds.map(q => ({
      question_id: q.id,
      correct_answer_letter: q.correct,
    })));
  }

  // باقي طلاب في r2 (مراجعة المثلثات الأسبوعية)
  function makeRecitAnswers(qIds, correctCount, wrongCount) {
    const items = [];
    for (let i = 0; i < correctCount && i < qIds.length; i++) {
      items.push({ question_id: qIds[i].id, answer: qIds[i].correct, correct: true });
    }
    for (let i = 0; i < wrongCount && (correctCount + i) < qIds.length; i++) {
      const q = qIds[correctCount + i];
      const wrongLetters = ['A','B','C','D'].filter(l => l !== q.correct);
      items.push({ question_id: q.id, answer: wrongLetters[0], correct: false });
    }
    return items;
  }

  await q(`
    INSERT INTO recitation_results
      (student_id,recitation_id,score,correct_count,wrong_count,unanswered_count,
       answers,points_earned,start_time,end_time,passed,created_at,questions_snapshot)
    VALUES ($1,$2,16,4,1,0,$3,10,
      NOW()-INTERVAL '4 days'-INTERVAL '12 minutes',
      NOW()-INTERVAL '4 days',
      true,NOW()-INTERVAL '4 days',$4)
  `, [sids['std_fatma'],   r2.id, JSON.stringify(makeRecitAnswers(r2QIds, 4, 1)), makeRecitSnapshot(r2QIds)]);

  await q(`
    INSERT INTO recitation_results
      (student_id,recitation_id,score,correct_count,wrong_count,unanswered_count,
       answers,points_earned,start_time,end_time,passed,created_at,questions_snapshot)
    VALUES ($1,$2,20,5,0,0,$3,10,
      NOW()-INTERVAL '4 days'-INTERVAL '11 minutes',
      NOW()-INTERVAL '4 days',
      true,NOW()-INTERVAL '4 days',$4)
  `, [sids['std_youssef'], r2.id, JSON.stringify(makeRecitAnswers(r2QIds, 5, 0)), makeRecitSnapshot(r2QIds)]);

  await q(`
    INSERT INTO recitation_results
      (student_id,recitation_id,score,correct_count,wrong_count,unanswered_count,
       answers,points_earned,start_time,end_time,passed,created_at,questions_snapshot)
    VALUES ($1,$2,6,2,3,0,$3,3,
      NOW()-INTERVAL '3 days'-INTERVAL '14 minutes',
      NOW()-INTERVAL '3 days',
      false,NOW()-INTERVAL '3 days',$4)
  `, [sids['std_nada'],    r2.id, JSON.stringify(makeRecitAnswers(r2QIds, 2, 3)), makeRecitSnapshot(r2QIds)]);

  await q(`
    INSERT INTO recitation_results
      (student_id,recitation_id,score,correct_count,wrong_count,unanswered_count,
       answers,points_earned,start_time,end_time,passed,created_at,questions_snapshot)
    VALUES ($1,$2,10,3,2,0,$3,3,
      NOW()-INTERVAL '3 days'-INTERVAL '13 minutes',
      NOW()-INTERVAL '3 days',
      false,NOW()-INTERVAL '3 days',$4)
  `, [sids['std_omar'],    r2.id, JSON.stringify(makeRecitAnswers(r2QIds, 3, 2)), makeRecitSnapshot(r2QIds)]);

  // باقي طلاب في r1
  const r1StudentConfig = [
    { sid: sids['std_fatma'],   correctCount: 4, wrongCount: 1 },
    { sid: sids['std_youssef'], correctCount: 5, wrongCount: 0 },
    { sid: sids['std_omar'],    correctCount: 3, wrongCount: 2 },
  ];
  const r1Snapshot = makeRecitSnapshot(r1QIds);
  for (const { sid, correctCount, wrongCount } of r1StudentConfig) {
    const score = correctCount * 2;
    const passed = score >= 6;
    const answers = makeRecitAnswers(r1QIds, correctCount, wrongCount);
    await q(`
      INSERT INTO recitation_results
        (student_id,recitation_id,score,correct_count,wrong_count,unanswered_count,
         answers,points_earned,start_time,end_time,passed,created_at,questions_snapshot)
      VALUES ($1,$2,$3,$4,$5,0,$6,$7,
        NOW()-INTERVAL '5 days'-INTERVAL '8 minutes',
        NOW()-INTERVAL '5 days',$8,NOW()-INTERVAL '5 days',$9)
    `, [sid, r1.id,
        score, correctCount, wrongCount,
        JSON.stringify(answers),
        passed ? 7 : 2,
        passed, r1Snapshot]);
  }

  // طلاب ث2 في r5 (هندسة تحليلية)
  const r5Results = [
    [sids['std_mostafa'], 8,  4, 1, true,  2],
    [sids['std_rana'],    8,  4, 1, true,  2],
    [sids['std_adam'],    4,  2, 3, false, 1],
    [sids['std_lina'],    10, 5, 0, true,  1],
  ];
  const r5Snapshot = makeRecitSnapshot(r5QIds);
  for (const [sid, score, correct, wrong, passed, daysAgo] of r5Results) {
    const answers = makeRecitAnswers(r5QIds, correct, wrong);
    await q(`
      INSERT INTO recitation_results
        (student_id,recitation_id,score,correct_count,wrong_count,unanswered_count,
         answers,points_earned,start_time,end_time,passed,created_at,questions_snapshot)
      VALUES ($1,$2,$3,$4,$5,0,$6,$7,
        NOW()-INTERVAL '${daysAgo} days'-INTERVAL '9 minutes',
        NOW()-INTERVAL '${daysAgo} days',
        $8,NOW()-INTERVAL '${daysAgo} days',$9)
    `, [sid, r5.id, score, correct, wrong,
        JSON.stringify(answers),
        passed ? 7 : 2,
        passed, r5Snapshot]);
  }

  console.log('  ✓ نتائج التسميعات: std_ali (ناجح في r1، راسب في r2، لم يؤد r3+r4) + بيانات أرشيف شاملة');

  // ── سلاسل التسميعات (streaks) ────────────────────────────

  // std_ali: streak=3 (أكمل 3 تسميعات متتالية)
  await q(`
    INSERT INTO recitation_streaks
      (student_id,teacher_id,current_streak,max_streak,last_completed_at,total_completed,updated_at)
    VALUES ($1,$2,3,5,NOW()-INTERVAL '4 days',8,NOW()-INTERVAL '4 days')
    ON CONFLICT (student_id,teacher_id) DO UPDATE SET
      current_streak=$3,max_streak=$4,last_completed_at=$5,total_completed=$6,updated_at=NOW()
  `, [STD_ALI, T1, 3, 5, past(4), 8]);

  await q(`
    INSERT INTO recitation_streaks
      (student_id,teacher_id,current_streak,max_streak,last_completed_at,total_completed,updated_at)
    VALUES ($1,$2,1,3,NOW()-INTERVAL '5 days',5,NOW()-INTERVAL '5 days')
    ON CONFLICT (student_id,teacher_id) DO NOTHING
  `, [sids['std_youssef'], T1]);

  await q(`
    INSERT INTO recitation_streaks
      (student_id,teacher_id,current_streak,max_streak,last_completed_at,total_completed,updated_at)
    VALUES ($1,$2,2,4,NOW()-INTERVAL '2 days',6,NOW()-INTERVAL '2 days')
    ON CONFLICT (student_id,teacher_id) DO NOTHING
  `, [sids['std_mostafa'], T1]);

  console.log('  ✓ سلاسل التسميعات: std_ali (streak=3/max=5)');

  // ══════════════════════════════════════════════════════════
  // 24. واتساب
  // ══════════════════════════════════════════════════════════
  console.log('\n⟳  إضافة بيانات الواتساب...');
  try {
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
        'تذكير للطلاب: الاختبار النهائي قادم. راجعوا المنهج بانتظام.',
        'students','الصف الثالث الثانوي',14,NOW()+INTERVAL '2 days',true)
      RETURNING id
    `, [T1]);

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
        (teacher_id,message,total_count,success_count,fail_count,
         status,send_type,created_at,finished_at)
      VALUES ($1,
        'إعلان: تم نشر الامتحان النهائي!',
        5,5,0,'completed','manual',
        NOW()-INTERVAL '7 days',NOW()-INTERVAL '7 days'+INTERVAL '3 minutes')
    `, [T1]);

    console.log('  ✓ جدولان واتساب + 2 سجل إرسال');
  } catch (waErr) {
    console.warn('  ⚠️ تخطّي واتساب — الجدول غير موجود:', waErr.message);
  }

  // ══════════════════════════════════════════════════════════
  // 25. سجل النشاط (activity_logs)
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

  const MR    = 'أ/ محمد عبد الرحمن';
  const NOUR  = asstNour.name;
  const KARIM = asstKarim.name;

  // تسجيل الدخول
  await log('teacher',   T1,            MR,    'login_teacher',   'teacher',   T1,             MR,    {ip:'197.34.5.70'}, 30, 8);
  await log('assistant', asstNour.id,   NOUR,  'login_assistant', 'assistant', asstNour.id,    NOUR,  {ip:'197.34.5.71'}, 29, 9);
  await log('teacher',   T1,            MR,    'login_teacher',   'teacher',   T1,             MR,    {ip:'197.34.5.70'}, 15, 7);
  await log('assistant', asstNour.id,   NOUR,  'login_assistant', 'assistant', asstNour.id,    NOUR,  {ip:'197.34.5.72'}, 14, 8);
  await log('assistant', asstKarim.id,  KARIM, 'login_assistant', 'assistant', asstKarim.id,   KARIM, {ip:'197.34.5.75'},  7,10);
  await log('teacher',   T1,            MR,    'login_teacher',   'teacher',   T1,             MR,    {ip:'197.34.5.70'},  1, 6);

  // الكورسات
  await log('teacher',   T1, MR, 'create_course',  'course', c1.id, 'رياضيات ث3 — الجبر',    {price:300,stage:'ث3'}, 30, 7);
  await log('teacher',   T1, MR, 'create_course',  'course', c2.id, 'رياضيات ث3 — التفاضل', {price:250,stage:'ث3'}, 30, 6);
  await log('teacher',   T1, MR, 'create_course',  'course', c3.id, 'مقدمة مجانية',          {price:0,is_free:true}, 29,10);
  await log('teacher',   T1, MR, 'create_course',  'course', c4.id, 'رياضيات ث2 — الهندسة', {price:200,stage:'ث2'}, 28, 9);
  await log('teacher',   T1, MR, 'create_course',  'course', c5.id, 'الإحصاء [مسودة]',       {price:200,stage:'ث3'}, 27, 8);
  await log('teacher',   T1, MR, 'publish_course', 'course', c1.id, 'رياضيات ث3 — الجبر',    {is_published:true},    29, 9);
  await log('teacher',   T1, MR, 'publish_course', 'course', c2.id, 'رياضيات ث3 — التفاضل', {is_published:true},    29, 8);
  await log('teacher',   T1, MR, 'publish_course', 'course', c3.id, 'مقدمة مجانية',          {is_published:true},    29, 7);
  await log('teacher',   T1, MR, 'publish_course', 'course', c4.id, 'رياضيات ث2 — الهندسة', {is_published:true},    28, 8);
  await log('teacher',   T1, MR, 'edit_course',    'course', c1.id, 'رياضيات ث3 — الجبر',    {changed:['description']}, 20,10);

  // رفع محتوى
  await log('teacher',   T1,           MR,   'upload_video', 'course', c1.id, 'مقدمة الجبر',    {}, 29,12);
  await log('assistant', asstNour.id,  NOUR, 'upload_video', 'course', c1.id, 'المتباينات',     {}, 27,13);
  await log('assistant', asstNour.id,  NOUR, 'upload_pdf',   'course', c1.id, 'ملخص المعادلات', {}, 27,12);
  await log('teacher',   T1,           MR,   'add_video_url','course', c2.id, 'مقدمة التفاضل',  {url:'youtube'}, 26,10);
  await log('teacher',   T1,           MR,   'upload_pdf',   'course', c2.id, 'ملخص المشتقة',   {}, 25, 9);

  // الطلاب
  await log('teacher',   T1,           MR,   'add_student', 'student', STD_ALI,           'علي محمد رمضان',     {username:'std_ali', stage:'ث3'}, 28,10);
  await log('teacher',   T1,           MR,   'add_student', 'student', sids['std_fatma'], 'فاطمة أحمد سعد',     {username:'std_fatma',stage:'ث3'}, 28, 9);
  await log('assistant', asstNour.id,  NOUR, 'add_student', 'student', sids['std_youssef'],'يوسف إبراهيم كمال', {username:'std_youssef',stage:'ث3'}, 27,11);
  await log('assistant', asstNour.id,  NOUR, 'bulk_import_students','student',null,null,  {count:4,failed:0}, 26,14);
  await log('teacher',   T1,           MR,   'bulk_import_students','student',null,null,  {count:6,failed:1}, 20,12);
  await log('assistant', asstNour.id,  NOUR, 'edit_student','student', STD_ALI,           'علي محمد رمضان',     {changed:['phone']}, 15,11);
  await log('teacher',   T1,           MR,   'edit_student','student', sids['std_nada'],  'ندى حسن عبد الله',   {changed:['academic_stage']}, 12, 9);
  await log('teacher',   T1,           MR,   'suspend_student','student',sids['std_nada'],'ندى حسن عبد الله',  {reason:'تجاوز حد الأجهزة'}, 3, 5);

  // المدفوعات
  await log('assistant', asstNour.id,  NOUR,  'approve_payment','payment',null,'علي محمد رمضان',   {amount:300,method:'instapay',status:'verified'}, 24,13);
  await log('assistant', asstNour.id,  NOUR,  'approve_payment','payment',null,'فاطمة أحمد سعد',   {amount:300,method:'fawry',status:'verified'},    21,12);
  await log('assistant', asstKarim.id, KARIM, 'approve_payment','payment',null,'يوسف إبراهيم كمال',{amount:300,method:'instapay',status:'verified'}, 20,11);
  await log('assistant', asstKarim.id, KARIM, 'reject_payment', 'payment',null,'لينا سعيد القاضي', {amount:200,method:'fawry',status:'rejected'},     9,13);
  await log('teacher',   T1,           MR,    'approve_payment','payment',null,'لينا سعيد القاضي', {amount:200,method:'bank',status:'verified'},       8, 9);

  // الامتحانات
  await log('teacher',   T1,           MR,   'create_exam',  'exam', e1.id, 'امتحان الجبر',      {total_score:30,duration:45}, 29,10);
  await log('teacher',   T1,           MR,   'publish_exam', 'exam', e1.id, 'امتحان الجبر',      {is_published:true},          29, 9);
  await log('teacher',   T1,           MR,   'create_exam',  'exam', e2.id, 'امتحان المثلثات',   {total_score:50,duration:60}, 28,11);
  await log('teacher',   T1,           MR,   'publish_exam', 'exam', e2.id, 'امتحان المثلثات',   {is_published:true},          28,10);
  await log('assistant', asstNour.id,  NOUR, 'create_exam',  'exam', e3.id, 'مراجعة الدوال',     {total_score:40,duration:40},  8,13);
  await log('assistant', asstNour.id,  NOUR, 'publish_exam', 'exam', e3.id, 'مراجعة الدوال',     {is_published:true},           8,12);
  await log('teacher',   T1,           MR,   'create_exam',  'exam', e4.id, 'الاختبار النهائي',  {total_score:100,duration:90}, 25, 9);
  await log('teacher',   T1,           MR,   'publish_exam', 'exam', e4.id, 'الاختبار النهائي',  {is_published:true,start:'بعد 7 أيام'}, 25, 8);
  await log('teacher',   T1,           MR,   'approve_retry','exam', e2.id, 'امتحان المثلثات',   {student:'علي محمد رمضان',decision:'accepted'}, 6, 8);
  await log('assistant', asstNour.id,  NOUR, 'reject_retry', 'exam', e1.id, 'امتحان الجبر',      {student:'عمر سامي فرج',decision:'rejected'}, 3,11);
  await log('teacher',   T1,           MR,   'force_reset_exam_results','exam',e1.id,'امتحان الجبر',{deleted_results:3}, 26,16);

  // التسميعات
  await log('teacher',   T1,           MR,   'create_recitation','recitation', r1.id, 'تسميع المشتقات اليومي',    {duration:10,total_score:10}, 10, 8);
  await log('teacher',   T1,           MR,   'publish_recitation','recitation',r1.id, 'تسميع المشتقات اليومي',    {is_published:true},           10, 7);
  await log('teacher',   T1,           MR,   'create_recitation','recitation', r2.id, 'مراجعة المثلثات الأسبوعية',{duration:15,total_score:20},   8, 9);
  await log('teacher',   T1,           MR,   'publish_recitation','recitation',r2.id, 'مراجعة المثلثات الأسبوعية',{is_published:true},             8, 8);
  await log('assistant', asstNour.id,  NOUR, 'create_recitation','recitation', r3.id, 'تسميع قواعد التكامل',      {duration:12,total_score:15},    5, 9);
  await log('assistant', asstNour.id,  NOUR, 'publish_recitation','recitation',r3.id, 'تسميع قواعد التكامل',      {is_published:true},              5, 8);
  await log('teacher',   T1,           MR,   'create_recitation','recitation', r4.id, 'تسميع الاختبار النهائي الشامل',{duration:20,total_score:30},3, 9);
  await log('teacher',   T1,           MR,   'publish_recitation','recitation',r4.id, 'تسميع الاختبار النهائي الشامل',{is_published:true},           3, 8);
  await log('teacher',   T1,           MR,   'create_recitation','recitation', r6.id, 'تسميع الإحصاء [مسودة]',   {is_published:false},             2, 5);

  // المساعدون
  await log('teacher',   T1, MR, 'add_assistant',  'assistant', asstNour.id,  NOUR,        {permissions:'full'},      30, 5);
  await log('teacher',   T1, MR, 'add_assistant',  'assistant', asstKarim.id, KARIM,       {permissions:'partial'},   29, 5);
  await log('teacher',   T1, MR, 'add_assistant',  'assistant', asstDina.id,  asstDina.name,{permissions:'view_only'},28, 5);
  await log('teacher',   T1, MR, 'edit_assistant', 'assistant', asstNour.id,  NOUR,        {changed:['can_delete_students']}, 15, 8);

  // الواتساب
  await log('teacher', T1, MR, 'send_whatsapp_broadcast',  'teacher',T1,MR,{count:11,success:10,fail:1,type:'scheduled'}, 25,14);
  await log('teacher', T1, MR, 'send_whatsapp_broadcast',  'teacher',T1,MR,{count:5,success:5,fail:0,type:'manual'},       7,11);
  await log('teacher', T1, MR, 'create_whatsapp_schedule', 'teacher',T1,MR,{name:'تذكير شهري',interval:30},               30, 4);

  // الأجهزة
  await log('teacher', T1, MR, 'device_alert_review', 'student', sids['std_nada'],'ندى حسن عبد الله',{alert_type:'device_limit_exceeded',action:'pending'}, 3, 4);

  console.log('  ✓ سجل النشاط: 60+ حدث شامل (تسجيل دخول، كورسات، طلاب، مدفوعات، امتحانات، تسميعات، واتساب، أجهزة)');

  // ══════════════════════════════════════════════════════════
  // ملخص نهائي
  // ══════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ✅ تمت عملية البذر بنجاح كامل!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n  📋 ملخص البيانات:');
  console.log('  ┌──────────────────────────────────────────────────────────────┐');
  console.log('  │  👨‍🏫 معلم: 1           admin / admin123                      │');
  console.log('  │  🧑‍💼 مساعدون: 3        asst_nour (كاملة) | asst_karim | asst_dina │');
  console.log('  │  🎒 طلاب: 11           std_ali / 123456  (الحساب المحوري)   │');
  console.log('  │  📚 كورسات: 6          منشور×4، مجاني×2، مسودة×1            │');
  console.log('  │  📹 فيديوهات: 24       مع أقسام                             │');
  console.log('  │  📄 PDF: 14                                                  │');
  console.log('  │  🏦 بنوك أسئلة: 2      bank1 (15 سؤال) + bank2 (10 أسئلة)  │');
  console.log('  │  📝 امتحانات: 11       منتهي×5، نشط×4، قادم×1، مسودة×1     │');
  console.log('  │  📊 نتائج امتحانات: شاملة (كل الطلاب × متعدد الامتحانات)   │');
  console.log('  │  📖 تسميعات: 6         نشط×4، قادم×1، مسودة×1              │');
  console.log('  │     std_ali: ناجح×1، راسب×1، لم يؤد×2 (r3 نشط + r4 قادم)  │');
  console.log('  │  📋 نتائج تسميعات: شاملة (r1,r2,r5 لمتعدد الطلاب)         │');
  console.log('  │  💳 مدفوعات: 12        verified×8، pending×3، rejected×1    │');
  console.log('  │  🔔 إشعارات: 9 لـ std_ali + جماعية                          │');
  console.log('  │  🏅 شارات: std_ali (×2)                                     │');
  console.log('  │  📡 بث مباشر: 3        منتهي×1، نشط×1، مجدول×1             │');
  console.log('  │  🎮 فعاليات: 5         Stickman Run                         │');
  console.log('  │  📱 أجهزة: 3 (std_ali: 0 — حر للتسجيل) + 1 تنبيه          │');
  console.log('  │  💬 واتساب: 2 جدول + 2 سجل إرسال                           │');
  console.log('  │  📊 سجل نشاط: 60+ حدث (يشمل أحداث التسميعات)              │');
  console.log('  └──────────────────────────────────────────────────────────────┘');
  console.log('\n  🔑 بيانات تسجيل الدخول:');
  console.log('     معلم    → admin / admin123');
  console.log('     مساعد   → asst_nour / 123456  (صلاحيات كاملة)');
  console.log('     طالب    → std_ali / 123456    (الحساب المحوري)');
  console.log('\n  📊 سيناريوهات std_ali:');
  console.log('     كورسات   → C1+C2 مفتوح (جزئي)، C3 مكتمل، C5 طلب معلّق');
  console.log('     امتحانات → ناجح×3، راسب×1، جلسة نشطة×1، قادم×1، لم يؤد×2');
  console.log('     تسميعات → ناجح×1، راسب×1، متاح لم يؤده×1، قادم×1');
  console.log('     متصدرين → مركز 3 حالياً، 1 في أبريل، 2 في مايو');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

seed()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ خطأ أثناء البذر:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
