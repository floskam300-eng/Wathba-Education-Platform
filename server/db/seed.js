/**
 * WATHBA — Comprehensive Seed Script
 * Run: node server/db/seed.js
 * Seeds ALL tables with realistic Arabic data for the admin teacher
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function q(text, params = []) {
  const res = await pool.query(text, params);
  return res.rows;
}

async function seed() {
  console.log('🌱 بدء إضافة البيانات التجريبية...\n');

  // ─────────────────────────────────────────
  // 1. Teacher — admin (already exists, update profile)
  // ─────────────────────────────────────────
  const [teacher] = await q(`SELECT id FROM teachers WHERE username = 'admin' LIMIT 1`);
  if (!teacher) { console.error('❌ المعلم admin غير موجود'); process.exit(1); }
  const teacherId = teacher.id;

  await q(`UPDATE teachers SET
    name = 'أ. أحمد محمود',
    bio = 'مدرس رياضيات خبرة 15 سنة — ثانوي وإعدادي — متخصص في الثانوية العامة',
    classification = 'مدرس رياضيات',
    whatsapp_phone = '01012345678'
    WHERE id = $1`, [teacherId]);
  console.log(`✅ تم تحديث بيانات المعلم (id=${teacherId})`);

  // ─────────────────────────────────────────
  // 2. Assistants
  // ─────────────────────────────────────────
  const assPass = await bcrypt.hash('123456', 10);

  await q(`INSERT INTO assistants
    (username, password, name, phone, teacher_id,
     can_add_students, can_edit_students, can_delete_students,
     can_manage_exams, can_view_analytics, can_send_reports,
     can_manage_payments, can_manage_courses, can_send_notifications)
    VALUES
    ('sara_assistant', $1, 'سارة علي', '01111111111', $2,
     true, true, false, true, true, true, true, true, true),
    ('omar_assistant', $1, 'عمر حسن', '01222222222', $2,
     true, false, false, false, true, false, false, false, false)
    ON CONFLICT (username) DO UPDATE SET
      name = EXCLUDED.name, phone = EXCLUDED.phone,
      can_add_students = EXCLUDED.can_add_students,
      can_manage_payments = EXCLUDED.can_manage_payments,
      can_manage_courses = EXCLUDED.can_manage_courses`,
    [assPass, teacherId]);

  const [ass1] = await q(`SELECT id FROM assistants WHERE username='sara_assistant'`);
  console.log(`✅ تم إضافة المساعدين (sara_assistant / omar_assistant) — كلمة السر: 123456`);

  // ─────────────────────────────────────────
  // 3. Students — 12 students across all stages
  // ─────────────────────────────────────────
  const stuPass = await bcrypt.hash('123456', 10);

  const studentsData = [
    { u: 'ahmed_s1',   name: 'أحمد سامي',    phone: '01011110001', parent: '01011110011', stage: 'الصف الأول الثانوي',   gender: 'male',   points: 320 },
    { u: 'nour_s1',    name: 'نور حسام',      phone: '01011110002', parent: '01011110012', stage: 'الصف الأول الثانوي',   gender: 'female', points: 180 },
    { u: 'youssef_s2', name: 'يوسف طارق',     phone: '01011110003', parent: '01011110013', stage: 'الصف الثاني الثانوي',  gender: 'male',   points: 450 },
    { u: 'mona_s2',    name: 'منى إبراهيم',   phone: '01011110004', parent: '01011110014', stage: 'الصف الثاني الثانوي',  gender: 'female', points: 90  },
    { u: 'karim_s3',   name: 'كريم محمد',     phone: '01011110005', parent: '01011110015', stage: 'الصف الثالث الثانوي',  gender: 'male',   points: 610 },
    { u: 'hana_s3',    name: 'هناء عبدالله',  phone: '01011110006', parent: '01011110016', stage: 'الصف الثالث الثانوي',  gender: 'female', points: 540 },
    { u: 'omar_i1',    name: 'عمر رضا',       phone: '01011110007', parent: '01011110017', stage: 'الصف الأول الإعدادي',  gender: 'male',   points: 140 },
    { u: 'layla_i1',   name: 'ليلى فاروق',    phone: '01011110008', parent: '01011110018', stage: 'الصف الأول الإعدادي',  gender: 'female', points: 210 },
    { u: 'salma_i2',   name: 'سلمى أحمد',     phone: '01011110009', parent: '01011110019', stage: 'الصف الثاني الإعدادي', gender: 'female', points: 380 },
    { u: 'badr_i2',    name: 'بدر حسين',      phone: '01011110010', parent: '01011110020', stage: 'الصف الثاني الإعدادي', gender: 'male',   points: 50  },
    { u: 'rana_i3',    name: 'رنا سعد',       phone: '01011110011', parent: '01011110021', stage: 'الصف الثالث الإعدادي', gender: 'female', points: 480 },
    { u: 'ziad_uni',   name: 'زياد ممدوح',    phone: '01011110012', parent: '01011110022', stage: 'جامعي',                gender: 'male',   points: 720 },
  ];

  for (const s of studentsData) {
    await q(`INSERT INTO students
      (username, password, name, phone, parent_phone, academic_stage, gender, teacher_id, points)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (username) DO UPDATE SET
        name=EXCLUDED.name, points=EXCLUDED.points,
        academic_stage=EXCLUDED.academic_stage, gender=EXCLUDED.gender,
        phone=EXCLUDED.phone, parent_phone=EXCLUDED.parent_phone`,
      [s.u, stuPass, s.name, s.phone, s.parent, s.stage, s.gender, teacherId, s.points]);
  }
  console.log(`✅ تم إضافة 12 طالب — كلمة السر لكلهم: 123456`);

  const students = await q(`SELECT id, username, academic_stage FROM students WHERE teacher_id=$1 AND deleted_at IS NULL`, [teacherId]);
  const stu = (u) => students.find(s => s.username === u);

  // ─────────────────────────────────────────
  // 4. Courses
  // ─────────────────────────────────────────
  const coursesData = [
    { name: 'رياضيات الصف الأول الثانوي — الترم الأول',      desc: 'الجبر والهندسة والإحصاء للصف الأول الثانوي',                            price: 500, stage: 'الصف الأول الثانوي'   },
    { name: 'رياضيات الصف الثاني الثانوي — مستوى متقدم',     desc: 'حساب التفاضل والتكامل والجبر الخطي',                                      price: 600, stage: 'الصف الثاني الثانوي'  },
    { name: 'رياضيات الثانوية العامة — مراجعة نهائية',        desc: 'مراجعة شاملة لكل مناهج الثانوية العامة مع أسئلة السنوات السابقة',         price: 800, stage: 'الصف الثالث الثانوي'  },
    { name: 'رياضيات الإعدادية — الصفوف الثلاثة',            desc: 'المنهج الكامل للمرحلة الإعدادية بأسلوب مبسط',                              price: 350, stage: 'الصف الثاني الإعدادي' },
    { name: 'مجاني: مقدمة في الرياضيات للجميع',              desc: 'كورس مجاني للمبتدئين — مفاهيم أساسية للأعداد والعمليات الحسابية',          price: 0,   stage: null                  },
  ];

  for (const c of coursesData) {
    await q(`INSERT INTO courses (name, description, price, teacher_id, target_stage)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [c.name, c.desc, c.price, teacherId, c.stage]);
  }
  const courses = await q(`SELECT id, name, target_stage FROM courses WHERE teacher_id=$1 ORDER BY id`, [teacherId]);
  const crs = (idx) => courses[idx];
  console.log(`✅ تم إضافة ${courses.length} كورس`);

  // ─────────────────────────────────────────
  // 5. Sections per course
  // ─────────────────────────────────────────
  const sectionsMap = {};
  for (const c of courses.slice(0, 4)) {
    const existing = await q(`SELECT id FROM sections WHERE course_id=$1`, [c.id]);
    if (existing.length === 0) {
      const secs = await q(`INSERT INTO sections (course_id, title, sort_order) VALUES
        ($1, 'الوحدة الأولى: المفاهيم الأساسية', 1),
        ($1, 'الوحدة الثانية: التطبيقات والتمارين', 2),
        ($1, 'الوحدة الثالثة: المراجعة والاختبارات', 3)
        RETURNING id, title, sort_order`, [c.id]);
      sectionsMap[c.id] = secs;
    } else {
      sectionsMap[c.id] = existing;
    }
  }
  console.log(`✅ تم إضافة الفصول (Sections) للكورسات`);

  // ─────────────────────────────────────────
  // 6. Videos (metadata only — URLs placeholder)
  // ─────────────────────────────────────────
  const videoTitles = [
    'الدرس الأول: مقدمة وتعريفات',
    'الدرس الثاني: أمثلة وتطبيقات',
    'الدرس الثالث: التمارين المتنوعة',
    'الدرس الرابع: مراجعة الوحدة',
  ];
  for (const c of courses.slice(0, 4)) {
    const sec = sectionsMap[c.id] || [];
    const existing = await q(`SELECT id FROM videos WHERE course_id=$1 LIMIT 1`, [c.id]);
    if (existing.length > 0) continue;
    for (let i = 0; i < videoTitles.length; i++) {
      const secId = i < 2 ? sec[0]?.id : sec[1]?.id;
      await q(`INSERT INTO videos (title, file_path_or_url, duration_minutes, course_id, sort_order, section_id)
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [videoTitles[i], 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 35 + i * 7, c.id, i + 1, secId || null]);
    }
  }
  console.log(`✅ تم إضافة الفيديوهات`);

  // ─────────────────────────────────────────
  // 7. PDF files
  // ─────────────────────────────────────────
  for (const c of courses.slice(0, 4)) {
    const existing = await q(`SELECT id FROM pdf_files WHERE course_id=$1 LIMIT 1`, [c.id]);
    if (existing.length > 0) continue;
    const sec = sectionsMap[c.id] || [];
    await q(`INSERT INTO pdf_files (title, file_url, course_id, section_id) VALUES
      ($1, '/uploads/sample.pdf', $2, $3),
      ($1, '/uploads/sample.pdf', $2, $4)`,
      ['ملزمة الوحدة — ' + c.name.slice(0, 20), c.id, sec[0]?.id || null, sec[2]?.id || null]);
  }
  console.log(`✅ تم إضافة ملفات PDF`);

  // ─────────────────────────────────────────
  // 8. Exams
  // ─────────────────────────────────────────
  const examsData = [
    { title: 'اختبار الوحدة الأولى — جبر',               duration: 45, total: 50,  pass: 25, cidx: 0,    badge: 'نجم الجبر',      color: '#FFD700', sdate: null, edate: null },
    { title: 'اختبار هندسة شاملة',                        duration: 60, total: 100, pass: 60, cidx: 1,    badge: 'بطل الهندسة',    color: '#4169E1', sdate: null, edate: null },
    { title: 'امتحان التدريب على الثانوية العامة',          duration: 90, total: 100, pass: 50, cidx: 2,    badge: null,             color: '#FF8C00', sdate: null, edate: null },
    { title: 'اختبار عام مفتوح — بدون كورس',               duration: 30, total: 20,  pass: 10, cidx: null, badge: 'متفوق',          color: '#22C55E', sdate: null, edate: null },
    { title: 'اختبار مقبل — يبدأ بعد 7 أيام',             duration: 60, total: 50,  pass: 30, cidx: 0,    badge: 'مثابر',          color: '#8B5CF6', sdate: new Date(Date.now()+7*86400000), edate: new Date(Date.now()+14*86400000) },
    { title: 'اختبار منتهي — انتهت المدة',                 duration: 45, total: 40,  pass: 20, cidx: 3,    badge: null,             color: '#FF8C00', sdate: new Date(Date.now()-10*86400000), edate: new Date(Date.now()-2*86400000) },
  ];

  for (const e of examsData) {
    await q(`INSERT INTO exams (title, duration_minutes, total_score, course_id, teacher_id, pass_score, badge_name, badge_color, start_date, end_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
      [e.title, e.duration, e.total, e.cidx !== null ? crs(e.cidx)?.id : null,
       teacherId, e.pass, e.badge, e.color, e.sdate, e.edate]);
  }
  const exams = await q(`SELECT id, title, total_score, pass_score FROM exams WHERE teacher_id=$1 ORDER BY id`, [teacherId]);
  const ex = (i) => exams[i];
  console.log(`✅ تم إضافة ${exams.length} اختبار`);

  // ─────────────────────────────────────────
  // 9. Questions
  // ─────────────────────────────────────────
  const addQ = async (examId, rows) => {
    const existing = await q(`SELECT id FROM questions WHERE exam_id=$1 LIMIT 1`, [examId]);
    if (existing.length > 0) return;
    for (const [qt, a, b, c, d, ans, pts, type, essay_key] of rows) {
      await q(`INSERT INTO questions (question_text,option_a,option_b,option_c,option_d,correct_answer_letter,points,exam_id,question_type,essay_answer_key)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [qt, a, b, c||null, d||null, ans, pts, examId, type||'mcq', essay_key||null]);
    }
  };

  // Exam 0 — جبر MCQ (10 × 5 = 50 نقطة)
  if (ex(0)) await addQ(ex(0).id, [
    ['حل المعادلة: 2x + 4 = 10',                    'x=2','x=3','x=4','x=5','B',5,'mcq',null],
    ['ما قيمة: 3² + 4²',                             '20','25','16','30','B',5,'mcq',null],
    ['بسّط: (x+2)(x-2)',                             'x²-4','x²+4','x²-2x+4','x+4','A',5,'mcq',null],
    ['إذا كان x=3، ما قيمة 2x²-1؟',                 '15','17','16','18','B',5,'mcq',null],
    ['ما هو المقلوب الجمعي لـ -7؟',                  '7','-7','1/7','-1/7','A',5,'mcq',null],
    ['المعادلة x²=9 لها حلول:',                      'x=3 فقط','x=-3 فقط','x=±3','لا حل','C',5,'mcq',null],
    ['ما حاصل ضرب (2x)(3x)؟',                       '6x','5x²','6x²','6x³','C',5,'mcq',null],
    ['حل: x/4 = 5',                                  'x=20','x=1.25','x=9','x=15','A',5,'mcq',null],
    ['إذا a=2، b=3، فـ a²+b² يساوي:',               '10','13','12','25','B',5,'mcq',null],
    ['أي من الآتي معادلة تربيعية؟',                   'x+2=0','2x+3=7','x²-5x+6=0','3x-1=2x+1','C',5,'mcq',null],
  ]);

  // Exam 1 — هندسة MCQ + صح/خطأ (10 × 10 = 100 نقطة)
  if (ex(1)) await addQ(ex(1).id, [
    ['مجموع زوايا المثلث يساوي:',                    '90°','180°','360°','270°','B',10,'mcq',null],
    ['في مثلث قائم، الوتر هو:',                      'أقصر ضلع','أطول ضلع','الزاوية القائمة','لا شيء','B',10,'mcq',null],
    ['مساحة المربع بضلع 7 سم:',                      '28 سم²','49 سم²','14 سم²','56 سم²','B',10,'mcq',null],
    ['محيط الدائرة = 2πr',                            'صح','خطأ','صح','خطأ','A',10,'true_false',null],
    ['القطر = 2 × نصف القطر',                         'صح','خطأ','صح','خطأ','A',10,'true_false',null],
    ['زوايا المربع الأربع مجموعها 360°',              'صح','خطأ','صح','خطأ','A',10,'true_false',null],
    ['المثلث المتساوي الأضلاع كل زواياه 60°',         'صح','خطأ','صح','خطأ','A',10,'true_false',null],
    ['مساحة المثلث = ½ × القاعدة × الارتفاع',        'صح','خطأ','صح','خطأ','A',10,'true_false',null],
    ['محيط المستطيل = 2(الطول + العرض)',               'صح','خطأ','صح','خطأ','A',10,'true_false',null],
    ['المثلث الحاد له زاوية أكبر من 90°',             'صح','خطأ','صح','خطأ','B',10,'true_false',null],
  ]);

  // Exam 2 — ثانوية MCQ + مقالي (5×15 + 1×25 = 100)
  if (ex(2)) await addQ(ex(2).id, [
    ['مشتقة x³ بالنسبة لـ x:',                       '3x','3x²','x²','2x³','B',15,'mcq',null],
    ['∫2x dx يساوي:',                                 'x','2x²','x²+c','2x+c','C',15,'mcq',null],
    ['log₁₀(1000) يساوي:',                            '1','2','3','4','C',15,'mcq',null],
    ['الحد الأعظم لـ f(x)=-(x-2)²+5 يساوي:',         '2','5','-5','10','B',15,'mcq',null],
    ['حل المعادلة e^x = 1:',                           'x=1','x=0','x=e','لا حل','B',10,'mcq',null],
    ['اشرح قاعدة المشتقة لدالة الضرب (Product Rule) مع مثال تطبيقي كامل.',
      'الإجابة الصحيحة','خطأ',null,null,'A',30,'essay',
      'f(x)=u·v → f\'=(u\'·v)+(u·v\') — مثال: d/dx[x²·sinx] = 2x·sinx + x²·cosx'],
  ]);

  // Exam 3 — عام سهل (4 × 5 = 20 نقطة)
  if (ex(3)) await addQ(ex(3).id, [
    ['كم يساوي 5 × 5؟',                              '20','25','30','35','B',5,'mcq',null],
    ['الجذر التربيعي لـ 144 يساوي:',                  '11','12','13','14','B',5,'mcq',null],
    ['2 + 2 × 2 = ؟',                                '8','6','4','10','B',5,'mcq',null],
    ['المضاعف المشترك الأصغر لـ 4 و 6:',              '8','10','12','24','C',5,'mcq',null],
  ]);

  // Exam 4 — مقبل (أسئلة للاختبار القادم)
  if (ex(4)) await addQ(ex(4).id, [
    ['ما قيمة 2⁵؟',                                   '16','32','64','8','B',10,'mcq',null],
    ['بسّط 15/25:',                                    '2/3','3/5','5/3','3/4','B',10,'mcq',null],
    ['العدد الأولي بين 10 و 15:',                     '11','12','14','15','A',10,'mcq',null],
    ['حاصل جمع زوايا المضلع الرباعي:',               '180°','270°','360°','540°','C',10,'mcq',null],
    ['تبسيط: √(9×16) يساوي:',                         '12','25','144','7','A',10,'mcq',null],
  ]);

  // Exam 5 — منتهية (4 أسئلة)
  if (ex(5)) await addQ(ex(5).id, [
    ['أكمل: 2، 4، 6، __',                             '7','8','9','10','B',10,'mcq',null],
    ['ما هو مقلوب 0.25؟',                             '2','4','0.75','0.5','B',10,'mcq',null],
    ['القسمة: 144 ÷ 12 = ؟',                          '10','12','11','13','B',10,'mcq',null],
    ['ما الأكبر: 2/3 أم 3/4؟',                        '2/3','3/4','متساويان','لا يمكن المقارنة','B',10,'mcq',null],
  ]);

  console.log(`✅ تم إضافة الأسئلة للاختبارات`);

  // ─────────────────────────────────────────
  // 10. Enrollments
  // ─────────────────────────────────────────
  const enrollMap = [
    ['ahmed_s1', 0], ['nour_s1', 0],
    ['youssef_s2', 1], ['mona_s2', 1],
    ['karim_s3', 2], ['hana_s3', 2],
    ['omar_i1', 3], ['layla_i1', 3], ['salma_i2', 3], ['badr_i2', 3],
    ['rana_i3', 2], ['karim_s3', 0],
    ...studentsData.map(s => [s.u, 4]),
  ];
  for (const [u, ci] of enrollMap) {
    const sid = stu(u)?.id; const cid = crs(ci)?.id;
    if (!sid || !cid) continue;
    await q(`INSERT INTO student_course_enrollment (student_id, course_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [sid, cid]);
  }
  console.log(`✅ تم تسجيل الطلاب في الكورسات`);

  // ─────────────────────────────────────────
  // 11. Exam Results
  // ─────────────────────────────────────────
  const ago = (h) => new Date(Date.now() - h * 3600000);

  const mkAnswers = (qs, stuAnswers) => qs.map((row, i) => ({
    question_id: row.id,
    question_text: row.question_text,
    question_type: row.question_type,
    student_answer: stuAnswers[i] ?? null,
    correct_answer: row.correct_answer_letter,
    is_correct: row.question_type === 'essay' ? null : stuAnswers[i] === row.correct_answer_letter,
    points: row.points,
  }));

  const qsByExam = {};
  for (const exam of exams) {
    qsByExam[exam.id] = await q(`SELECT * FROM questions WHERE exam_id=$1 ORDER BY id`, [exam.id]);
  }

  const results = [
    // اختبار جبر (ex0): أحمد ناجح 40/50، نور راسب 20/50، رنا ناجح 45/50
    { u: 'ahmed_s1', ei: 0, answers: ['B','B','A','B','A','C','C','A','B','C'], score: 40, correct: 8, wrong: 2, unans: 0, pts: 40, graded: true },
    { u: 'nour_s1',  ei: 0, answers: ['A','A','B','A','B','A','B','B','A','A'], score: 20, correct: 4, wrong: 6, unans: 0, pts: 0,  graded: true },
    { u: 'rana_i3',  ei: 0, answers: ['B','B','A','B','A','C','C','A','B','C'], score: 45, correct: 9, wrong: 1, unans: 0, pts: 45, graded: true },
    // اختبار هندسة (ex1): يوسف ناجح 80/100، منى راسب 40/100
    { u: 'youssef_s2', ei: 1, answers: ['B','B','B','A','A','A','A','A','A','B'], score: 80, correct: 8, wrong: 2, unans: 0, pts: 80, graded: true },
    { u: 'mona_s2',    ei: 1, answers: ['A','A','A','B','B','B','B','A','A','A'], score: 40, correct: 4, wrong: 6, unans: 0, pts: 0,  graded: true },
    // اختبار ثانوية (ex2): كريم ناجح 75/70 (MCQ صح + مقالي ينتظر)، هناء راسب (MCQ + مقالي)
    { u: 'karim_s3', ei: 2, answers: ['B','C','C','B','B','الـ Product Rule تنص على أن f\'(x) = u\'v + uv\' مثال: d/dx[x²sinx] = 2xsinx + x²cosx'], score: 70, correct: 5, wrong: 0, unans: 0, pts: 70, graded: false },
    { u: 'hana_s3',  ei: 2, answers: ['A','A','B','A','A','لا أعرف قاعدة المشتقة بالتفصيل'], score: 30, correct: 2, wrong: 3, unans: 0, pts: 0,  graded: false },
    // اختبار عام (ex3): عمر 20/20، ليلى 15/20، سلمى 5/20، زياد 20/20
    { u: 'omar_i1',  ei: 3, answers: ['B','B','B','C'], score: 20, correct: 4, wrong: 0, unans: 0, pts: 20, graded: true },
    { u: 'layla_i1', ei: 3, answers: ['B','B','B','A'], score: 15, correct: 3, wrong: 1, unans: 0, pts: 15, graded: true },
    { u: 'salma_i2', ei: 3, answers: ['A','A','A','A'], score: 5,  correct: 1, wrong: 3, unans: 0, pts: 0,  graded: true },
    { u: 'ziad_uni', ei: 3, answers: ['B','B','B','C'], score: 20, correct: 4, wrong: 0, unans: 0, pts: 20, graded: true },
    // اختبار منتهي (ex5): بدر 30/40، هناء 20/40
    { u: 'badr_i2',  ei: 5, answers: ['B','B','B','B'], score: 30, correct: 3, wrong: 1, unans: 0, pts: 30, graded: true },
    { u: 'hana_s3',  ei: 5, answers: ['A','A','A','A'], score: 10, correct: 1, wrong: 3, unans: 0, pts: 0,  graded: true },
  ];

  for (const r of results) {
    const sid = stu(r.u)?.id;
    const exam = ex(r.ei);
    if (!sid || !exam) continue;
    const qs = qsByExam[exam.id] || [];
    const answers = mkAnswers(qs, r.answers);
    await q(`INSERT INTO exam_results
      (student_id, exam_id, score, correct_count, wrong_count, unanswered_count,
       start_time, end_time, answers, points_earned, essay_graded)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
      [sid, exam.id, r.score, r.correct, r.wrong, r.unans,
       ago(24), ago(23), JSON.stringify(answers), r.pts, r.graded]);
  }
  console.log(`✅ تم إضافة ${results.length} نتيجة اختبار`);

  // ─────────────────────────────────────────
  // 12. Badges
  // ─────────────────────────────────────────
  const badgeData = [
    ['ahmed_s1',   0, 'نجم الجبر',   '#FFD700'],
    ['rana_i3',    0, 'نجم الجبر',   '#FFD700'],
    ['youssef_s2', 1, 'بطل الهندسة', '#4169E1'],
    ['omar_i1',    3, 'متفوق',       '#22C55E'],
    ['ziad_uni',   3, 'متفوق',       '#22C55E'],
    ['layla_i1',   3, 'متفوق',       '#22C55E'],
  ];
  for (const [u, ei, bn, bc] of badgeData) {
    const sid = stu(u)?.id; const exam = ex(ei);
    if (!sid || !exam || !bn) continue;
    await q(`INSERT INTO badges (student_id, exam_id, badge_name, badge_color)
      VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [sid, exam.id, bn, bc]);
  }
  console.log(`✅ تم إضافة الشارات`);

  // ─────────────────────────────────────────
  // 13. Video Progress
  // ─────────────────────────────────────────
  const allVideos = await q(`SELECT v.id FROM videos v JOIN courses c ON v.course_id=c.id WHERE c.teacher_id=$1`, [teacherId]);
  const vpData = [
    ['ahmed_s1',   100, 45], ['nour_s1',    65, 30],
    ['youssef_s2', 100, 38], ['mona_s2',    45, 18],
    ['karim_s3',   100, 52], ['hana_s3',    80, 40],
    ['omar_i1',    100, 41], ['layla_i1',   55, 25],
    ['salma_i2',   35,  15], ['rana_i3',    90, 44],
  ];
  for (const [u, pct, mins] of vpData) {
    const sid = stu(u)?.id;
    if (!sid) continue;
    for (const vid of allVideos.slice(0, 4)) {
      await q(`INSERT INTO video_progress (student_id, video_id, watch_count, watched_minutes, progress_percentage)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, [sid, vid.id, Math.ceil(pct/25), mins, pct]);
    }
  }
  console.log(`✅ تم إضافة بيانات مشاهدة الفيديوهات`);

  // ─────────────────────────────────────────
  // 14. Payments
  // ─────────────────────────────────────────
  const pmts = [
    ['ahmed_s1',   0, 500, 'vodafone_cash', 'confirmed', 'VC-001', 'دفع كامل',          true],
    ['nour_s1',    0, 250, 'instapay',      'confirmed', 'IP-001', 'نصف الرسوم',          true],
    ['youssef_s2', 1, 600, 'vodafone_cash', 'confirmed', 'VC-002', null,                  true],
    ['mona_s2',    1, 300, 'instapay',      'pending',   'IP-002', 'دفعة أولى فقط',      false],
    ['karim_s3',   2, 800, 'vodafone_cash', 'confirmed', 'VC-003', null,                  true],
    ['hana_s3',    2, 800, 'instapay',      'pending',   'IP-003', 'في انتظار التحقق',   false],
    ['omar_i1',    3, 350, 'cash',          'confirmed', null,     'دفع نقدي',            true],
    ['layla_i1',   3, 350, 'vodafone_cash', 'confirmed', 'VC-004', null,                  true],
    ['salma_i2',   3, 175, 'instapay',      'pending',   'IP-004', 'قسط أول',            false],
    ['badr_i2',    3, 350, 'cash',          'confirmed', null,     null,                   true],
    ['rana_i3',    2, 800, 'vodafone_cash', 'rejected',  'VC-005', 'رقم مرجعي خاطئ',    false],
    ['ziad_uni',   4, 0,   'cash',          'confirmed', null,     'كورس مجاني',          true],
    // دفعات إضافية لإظهار سجل متنوع
    ['ahmed_s1',   4, 0,   'cash',          'confirmed', null,     'كورس مجاني',          true],
    ['karim_s3',   0, 500, 'instapay',      'confirmed', 'IP-005', 'تسجيل في كورس إضافي',true],
  ];
  for (const [u, ci, amount, method, status, ref, notes, verified] of pmts) {
    const sid = stu(u)?.id;
    if (!sid) continue;
    const cid = ci !== null ? crs(ci)?.id : null;
    const vby = verified ? ass1?.id : null;
    const vat = verified ? ago(48) : null;
    await q(`INSERT INTO payments (student_id, course_id, amount, method, status, reference_number, notes, verified_by, verified_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [sid, cid, amount, method, status, ref, notes, vby, vat]);
  }
  console.log(`✅ تم إضافة ${pmts.length} سجل دفع`);

  // ─────────────────────────────────────────
  // 15. Course Enrollment Requests
  // ─────────────────────────────────────────
  const cerData = [
    ['badr_i2',    4, 'عاوز أتعلم أساسيات رياضيات'],
    ['ziad_uni',   2, 'محتاج مراجعة الثانوية العامة'],
    ['salma_i2',   0, 'عايزة أتقوي في الجبر'],
    ['rana_i3',    1, null],
    ['mona_s2',    3, 'للتدريب الإضافي'],
    ['layla_i1',   2, 'مستعدة للتحدي'],
    ['nour_s1',    1, 'أريد الانضمام للكورس المتقدم'],
    ['omar_i1',    0, 'أريد تطوير مهاراتي في الجبر'],
  ];
  for (const [u, ci, msg] of cerData) {
    const sid = stu(u)?.id; const cid = crs(ci)?.id;
    if (!sid || !cid) continue;
    await q(`INSERT INTO course_enrollment_requests (student_id, course_id, message, status)
      VALUES ($1,$2,$3,'pending') ON CONFLICT DO NOTHING`, [sid, cid, msg]);
  }
  console.log(`✅ تم إضافة ${cerData.length} طلب انضمام معلق`);

  // ─────────────────────────────────────────
  // 16. Exam Retry Requests
  // ─────────────────────────────────────────
  const retryData = [
    { u: 'nour_s1',  ei: 0, status: 'pending',  msg: 'كنت مريضاً وقت الاختبار، أرجو السماح بإعادته',           note: null },
    { u: 'mona_s2',  ei: 1, status: 'approved', msg: 'ظروف شخصية طارئة أثرت على أدائي',                        note: 'تمت الموافقة — يمكنك الإعادة خلال أسبوع' },
    { u: 'hana_s3',  ei: 2, status: 'rejected', msg: 'أريد إعادة الاختبار',                                     note: 'لا يمكن إعادة الامتحانات الكبيرة — ادرسي أكثر' },
    { u: 'salma_i2', ei: 3, status: 'pending',  msg: 'لم أكن مركزة وقت الحل',                                   note: null },
    { u: 'badr_i2',  ei: 5, status: 'pending',  msg: 'أريد تحسين درجتي',                                        note: null },
  ];
  for (const r of retryData) {
    const sid = stu(r.u)?.id; const exam = ex(r.ei);
    if (!sid || !exam) continue;
    const handled = r.status !== 'pending' ? ago(2) : null;
    await q(`INSERT INTO exam_retry_requests (student_id, exam_id, status, message, teacher_note, handled_at)
      VALUES ($1,$2,$3,$4,$5,$6)`,
      [sid, exam.id, r.status, r.msg, r.note, handled]);
  }
  console.log(`✅ تم إضافة ${retryData.length} طلب إعادة اختبار`);

  // ─────────────────────────────────────────
  // 17. Notifications
  // ─────────────────────────────────────────
  const notifData = [
    [stu('nour_s1')?.id,    '01011110002', 'student', 'نتيجة اختبار: حصلت على 20/50 في اختبار الجبر — تحتاج مراجعة إضافية',           'exam_result',    false],
    [stu('nour_s1')?.id,    '01011110012', 'parent',  'نتيجة ابنك في اختبار الجبر: 20/50 — يحتاج دعم إضافي',                          'parent_report',  false],
    [stu('mona_s2')?.id,    '01011110004', 'student', 'تمت الموافقة على طلب إعادة اختبار الهندسة — يمكنك الإعادة الآن',               'retry_approved', false],
    [stu('hana_s3')?.id,    '01011110006', 'student', 'تم رفض طلب إعادة امتحان الثانوية العامة — ادرسي أكثر',                         'retry_rejected', true],
    [stu('karim_s3')?.id,   '01011110005', 'student', 'مبروك! اجتزت امتحان الثانوية بنجاح 🎉',                                        'exam_result',    true],
    [stu('ahmed_s1')?.id,   '01011110001', 'student', 'مبروك! حصلت على شارة نجم الجبر 🏅',                                           'badge',          true],
    [stu('youssef_s2')?.id, '01011110003', 'student', 'مبروك! حصلت على شارة بطل الهندسة 🏅',                                         'badge',          true],
    [stu('salma_i2')?.id,   '01011110009', 'student', 'نتيجة اختبار: حصلت على 5/20 فقط — راجعي المنهج من البداية',                    'exam_result',    false],
    [stu('salma_i2')?.id,   '01011110019', 'parent',  'نتيجة ابنتك في الاختبار العام: 5/20 — تحتاج متابعة عاجلة',                     'parent_report',  false],
    [stu('omar_i1')?.id,    '01011110007', 'student', 'أحسنت! حصلت على 20/20 في الاختبار العام 💯',                                   'exam_result',    true],
    [stu('ziad_uni')?.id,   '01011110012', 'student', 'مرحباً بك في منصة وثبة — تم تسجيلك بنجاح 🎓',                                 'general',        true],
    [stu('rana_i3')?.id,    '01011110011', 'student', 'تم رفض دفعة بـ Vodafone Cash — برجاء التواصل مع المدرس',                       'payment',        false],
  ];
  for (const [sid, phone, rtype, msg, type, is_read] of notifData) {
    if (!sid) continue;
    await q(`INSERT INTO notification_log (teacher_id, student_id, recipient_phone, recipient_type, message, type, is_read)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [teacherId, sid, phone, rtype, msg, type, is_read]);
  }
  console.log(`✅ تم إضافة ${notifData.length} إشعار`);

  // ─────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ✅ تم إضافة جميع البيانات التجريبية بنجاح!');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log('📋 بيانات الدخول:');
  console.log('  👨‍🏫  المعلم        : admin / admin123');
  console.log('  👩‍💼  مساعد (كامل)  : sara_assistant / 123456');
  console.log('  👨‍💼  مساعد (قراءة) : omar_assistant / 123456');
  console.log('  👨‍🎓  12 طالب       : ahmed_s1 | nour_s1 | youssef_s2 | mona_s2');
  console.log('                         karim_s3 | hana_s3 | omar_i1  | layla_i1');
  console.log('                         salma_i2 | badr_i2 | rana_i3  | ziad_uni');
  console.log('                         كلمة السر لجميع الطلاب: 123456\n');
  console.log('🧪 سيناريوهات الاختبار المتاحة:');
  console.log('  ✅ ناجحون        : ahmed_s1, youssef_s2, karim_s3, omar_i1, rana_i3, layla_i1, ziad_uni');
  console.log('  ❌ راسبون        : nour_s1, mona_s2, hana_s3, salma_i2');
  console.log('  📝 مقالي ينتظر   : karim_s3 + hana_s3 في "امتحان الثانوية"');
  console.log('  🔄 إعادة معلقة   : nour_s1 (جبر), salma_i2 (عام), badr_i2 (منتهي)');
  console.log('  ✅ إعادة موافقة  : mona_s2 — يمكنها إعادة اختبار الهندسة');
  console.log('  ❌ إعادة مرفوضة  : hana_s3');
  console.log('  📋 طلبات كورسات  : 8 طلبات معلقة (6+ كورسات مختلفة)');
  console.log('  ⏳ اختبار مقبل   : "اختبار مقبل" — يبدأ بعد 7 أيام');
  console.log('  🔒 اختبار منتهي  : "اختبار منتهي" — انتهت مدته قبل يومين');
  console.log('  💳 مدفوعات       : مؤكدة + معلقة + مرفوضة (Vodafone/Instapay/كاش)');
  console.log('  🏅 شارات         : ahmed_s1, rana_i3, youssef_s2, omar_i1, ziad_uni, layla_i1');
  console.log('  📊 Leaderboard   : نقاط من 50 (badr_i2) إلى 720 (ziad_uni)');
  console.log('  🎬 مشاهدة فيديو  : 10 طلاب بنسب مختلفة 35%–100%');
  console.log('═══════════════════════════════════════════════════════\n');

  await pool.end();
}

seed().catch(e => { console.error('❌ خطأ في الـ Seed:', e.message, e.stack); process.exit(1); });
