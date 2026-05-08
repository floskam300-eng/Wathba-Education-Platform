require('dotenv').config();
const pool = require('./db/connection');
const bcrypt = require('bcryptjs');

async function seedDemo() {
  try {
    console.log('🌱 بدء إضافة البيانات التجريبية...');

    // ─── 1. Teachers ───────────────────────────────────────────────
    const teacherPass = await bcrypt.hash('teacher123', 10);
    const t = await pool.query(`
      INSERT INTO teachers (username, password, name, bio, classification, whatsapp_phone)
      VALUES
        ('dr_ahmed',   $1, 'د. أحمد محمد السيد',   'دكتوراه في الرياضيات من جامعة القاهرة، خبرة 15 سنة في التدريس', 'مدرس رياضيات', '+201012345678'),
        ('ustaz_sara', $1, 'أ. سارة عبد الرحمن',   'ماجستير في اللغة العربية، متخصصة في النحو والصرف', 'مدرسة لغة عربية', '+201098765432'),
        ('dr_khaled',  $1, 'د. خالد إبراهيم',      'دكتوراه في الفيزياء التطبيقية، مدرب معتمد', 'مدرس فيزياء وكيمياء', '+201155544433')
      ON CONFLICT (username) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, username, name
    `, [teacherPass]);
    const teachers = t.rows;
    console.log('✅ المعلمون:', teachers.map(r => r.name));

    // ─── 2. Assistants ─────────────────────────────────────────────
    const assistPass = await bcrypt.hash('assist123', 10);
    const a = await pool.query(`
      INSERT INTO assistants (username, password, name, phone, teacher_id,
        can_add_students, can_edit_students, can_delete_students,
        can_manage_exams, can_view_analytics, can_send_reports)
      VALUES
        ('ali_asst',   $1, 'علي حسن',    '+201011223344', $2, true, true, false, true,  true,  true),
        ('mona_asst',  $1, 'منى سالم',   '+201099887766', $3, true, true, false, false, true,  true),
        ('omar_asst',  $1, 'عمر فاروق',  '+201066554433', $4, true, true, true,  true,  true,  true)
      ON CONFLICT (username) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name
    `, [assistPass, teachers[0].id, teachers[1].id, teachers[2].id]);
    console.log('✅ المساعدون:', a.rows.map(r => r.name));

    // ─── 3. Students ───────────────────────────────────────────────
    const studPass = await bcrypt.hash('student123', 10);
    const students = [];
    const studentData = [
      // teacher 1 students
      ['youssef_2024',  'يوسف محمود',       '+201011111111', '+201022222222', 'الصف الثالث الثانوي', 'male',   teachers[0].id, 320],
      ['nada_2024',     'ندى أحمد',          '+201033333333', '+201044444444', 'الصف الثالث الثانوي', 'female', teachers[0].id, 280],
      ['karim_2024',    'كريم عبد الله',     '+201055555555', '+201066666666', 'الصف الثاني الثانوي', 'male',   teachers[0].id, 150],
      ['layla_2024',    'ليلى حسين',         '+201077777777', '+201088888888', 'الصف الثالث الثانوي', 'female', teachers[0].id, 400],
      ['hassan_2024',   'حسن رضا',           '+201099999999', '+201000000001', 'الصف الأول الثانوي',  'male',   teachers[0].id, 90],
      // teacher 2 students
      ['mariam_2024',   'مريم خالد',         '+201111111111', '+201222222222', 'الصف الثالث الثانوي', 'female', teachers[1].id, 500],
      ['ibrahim_2024',  'إبراهيم محمد',      '+201333333333', '+201444444444', 'الصف الثاني الثانوي', 'male',   teachers[1].id, 210],
      ['hana_2024',     'هناء سعيد',         '+201555555555', '+201666666666', 'الصف الثالث الثانوي', 'female', teachers[1].id, 375],
      // teacher 3 students
      ['tamer_2024',    'تامر فوزي',         '+201777777777', '+201888888888', 'الصف الثالث الثانوي', 'male',   teachers[2].id, 260],
      ['dina_2024',     'دينا ناصر',         '+201999999999', '+200111111111', 'الصف الثاني الثانوي', 'female', teachers[2].id, 180],
      ['ziad_2024',     'زياد وليد',         '+200222222222', '+200333333333', 'الصف الأول الثانوي',  'male',   teachers[2].id, 120],
    ];

    for (const [un, name, ph, pph, stage, gender, tid, pts] of studentData) {
      const r = await pool.query(`
        INSERT INTO students (username, password, name, phone, parent_phone, academic_stage, gender, teacher_id, points)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (username) DO UPDATE SET name = EXCLUDED.name, points = EXCLUDED.points
        RETURNING id, name
      `, [un, studPass, name, ph, pph, stage, gender, tid, pts]);
      students.push(r.rows[0]);
    }
    console.log('✅ الطلاب:', students.map(r => r.name));

    // ─── 4. Courses ────────────────────────────────────────────────
    const coursesData = [
      ['رياضيات الثانوية العامة - الكاملة',         'شرح كامل لمنهج الرياضيات للصف الثالث الثانوي مع تمارين وامتحانات', 350.00, teachers[0].id, 'الصف الثالث الثانوي'],
      ['الجبر والتحليل - الصف الثاني الثانوي',     'منهج الجبر الكامل للصف الثاني الثانوي بأسلوب مبسط',               250.00, teachers[0].id, 'الصف الثاني الثانوي'],
      ['اللغة العربية - النحو والصرف',              'قواعد النحو والصرف من الأساس مع تطبيقات عملية',                   200.00, teachers[1].id, 'الصف الثالث الثانوي'],
      ['الأدب والنصوص - ثانوية عامة',               'شرح نصوص الأدب العربي للثانوية العامة مع تحليل الشعر والنثر',     300.00, teachers[1].id, 'الصف الثالث الثانوي'],
      ['الفيزياء العملية - الثانوية العامة',        'شرح الفيزياء بالتجارب والمسائل لطلاب الثانوية العامة',            400.00, teachers[2].id, 'الصف الثالث الثانوي'],
      ['الكيمياء والميكانيكا - الصف الثاني',       'منهج الكيمياء والميكانيكا للصف الثاني الثانوي',                   280.00, teachers[2].id, 'الصف الثاني الثانوي'],
    ];
    const courses = [];
    for (const [name, desc, price, tid, stage] of coursesData) {
      const r = await pool.query(`
        INSERT INTO courses (name, description, price, teacher_id, target_stage)
        VALUES ($1,$2,$3,$4,$5) RETURNING id, name
      `, [name, desc, price, tid, stage]);
      courses.push(r.rows[0]);
    }
    console.log('✅ الكورسات:', courses.map(r => r.name));

    // ─── 5. Videos ─────────────────────────────────────────────────
    const videosData = [
      // course 0: math 3rd year
      [courses[0].id, 'المقدمة والتعريف بالمنهج',                   'https://youtu.be/demo1', 45, 1],
      [courses[0].id, 'التفاضل - المشتقات الأساسية',                'https://youtu.be/demo2', 60, 2],
      [courses[0].id, 'التكامل وتطبيقاته',                          'https://youtu.be/demo3', 75, 3],
      [courses[0].id, 'المتتاليات والمتسلسلات',                     'https://youtu.be/demo4', 55, 4],
      [courses[0].id, 'الإحصاء والاحتمالات',                        'https://youtu.be/demo5', 50, 5],
      // course 1: algebra
      [courses[1].id, 'المعادلات التربيعية',                        'https://youtu.be/demo6', 40, 1],
      [courses[1].id, 'المتراجحات',                                  'https://youtu.be/demo7', 45, 2],
      [courses[1].id, 'الدوال وخصائصها',                            'https://youtu.be/demo8', 50, 3],
      // course 2: arabic
      [courses[2].id, 'مقدمة في النحو العربي',                     'https://youtu.be/demo9',  35, 1],
      [courses[2].id, 'المبتدأ والخبر',                             'https://youtu.be/demo10', 40, 2],
      [courses[2].id, 'الفعل والفاعل والمفعول به',                 'https://youtu.be/demo11', 45, 3],
      [courses[2].id, 'الصرف - الأوزان والميزان الصرفي',           'https://youtu.be/demo12', 50, 4],
      // course 4: physics
      [courses[4].id, 'الميكانيكا - قوانين نيوتن',                 'https://youtu.be/demo13', 65, 1],
      [courses[4].id, 'الديناميكا الحرارية',                       'https://youtu.be/demo14', 70, 2],
      [courses[4].id, 'الكهرباء والمغناطيسية',                     'https://youtu.be/demo15', 80, 3],
      [courses[4].id, 'الموجات والضوء',                            'https://youtu.be/demo16', 60, 4],
    ];
    const videoIds = [];
    for (const [cid, title, url, dur, sort] of videosData) {
      const r = await pool.query(`
        INSERT INTO videos (title, file_path_or_url, duration_minutes, course_id, sort_order)
        VALUES ($1,$2,$3,$4,$5) RETURNING id
      `, [title, url, dur, cid, sort]);
      videoIds.push(r.rows[0].id);
    }
    console.log('✅ الفيديوهات:', videoIds.length, 'فيديو');

    // ─── 6. PDF Files ──────────────────────────────────────────────
    const pdfData = [
      [courses[0].id, 'ملزمة رياضيات الثالث الثانوي كاملة',          '/uploads/math3_full.pdf'],
      [courses[0].id, 'بنك أسئلة التفاضل والتكامل',                  '/uploads/calculus_bank.pdf'],
      [courses[1].id, 'ملزمة الجبر والمتراجحات',                     '/uploads/algebra.pdf'],
      [courses[2].id, 'قواعد النحو مع الأمثلة والتمارين',            '/uploads/arabic_grammar.pdf'],
      [courses[4].id, 'ملزمة الفيزياء - قوانين وتطبيقات',           '/uploads/physics_laws.pdf'],
      [courses[4].id, 'مسائل الفيزياء المحلولة',                    '/uploads/physics_solved.pdf'],
    ];
    for (const [cid, title, url] of pdfData) {
      await pool.query(`
        INSERT INTO pdf_files (title, file_url, course_id) VALUES ($1,$2,$3)
      `, [title, url, cid]);
    }
    console.log('✅ ملفات PDF:', pdfData.length);

    // ─── 7. Exams ──────────────────────────────────────────────────
    const examsData = [
      ['امتحان التفاضل والتكامل',           60, 100, courses[0].id, teachers[0].id, 50, 'نجم الرياضيات',    '#FFD700'],
      ['امتحان المتتاليات والإحصاء',        45, 50,  courses[0].id, teachers[0].id, 25, 'محترف الإحصاء',   '#FF6B6B'],
      ['امتحان الجبر الشامل',               50, 100, courses[1].id, teachers[0].id, 60, 'ملك الجبر',       '#4ECDC4'],
      ['امتحان النحو الأول',                40, 60,  courses[2].id, teachers[1].id, 36, 'فارس النحو',      '#45B7D1'],
      ['امتحان شامل في اللغة العربية',      90, 100, courses[3].id, teachers[1].id, 50, 'أمير اللغة',      '#96CEB4'],
      ['امتحان الفيزياء - ميكانيكا',       60, 80,  courses[4].id, teachers[2].id, 40, 'عبقري الفيزياء', '#FFEAA7'],
      ['امتحان الكهرباء والمغناطيسية',     45, 60,  courses[4].id, teachers[2].id, 30, 'نجم الكيمياء',    '#DDA0DD'],
    ];
    const exams = [];
    for (const [title, dur, total, cid, tid, pass, badge, color] of examsData) {
      const r = await pool.query(`
        INSERT INTO exams (title, duration_minutes, total_score, course_id, teacher_id, pass_score, badge_name, badge_color)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, title
      `, [title, dur, total, cid, tid, pass, badge, color]);
      exams.push(r.rows[0]);
    }
    console.log('✅ الامتحانات:', exams.map(r => r.title));

    // ─── 8. Questions ──────────────────────────────────────────────
    const questionsData = [
      // exam 0: calculus
      [exams[0].id, 'ما هي مشتقة الدالة f(x) = x³ + 2x² - 5x + 3 ؟',     '3x² + 4x - 5',        '3x² + 2x - 5',  '3x + 4x - 5',   'x³ + 4x - 5',  'A', 5],
      [exams[0].id, 'ما قيمة ∫(2x + 3)dx ؟',                                'x² + 3x + c',         '2x² + 3x + c',  'x + 3 + c',     '2x + c',       'A', 5],
      [exams[0].id, 'إذا كانت f(x) = sin(x)، فإن f\'(x) تساوي:',           'cos(x)',              '-cos(x)',       '-sin(x)',       'tan(x)',        'A', 5],
      [exams[0].id, 'ما هي مشتقة الدالة e^x ؟',                             'e^x',                 'x·e^(x-1)',     'e^(x-1)',       'ln(x)·e^x',    'A', 5],
      [exams[0].id, 'حد ∫₀¹ x² dx يساوي:',                                  '1/3',                 '1/2',           '1/4',           '2/3',           'A', 10],

      // exam 1: sequences
      [exams[1].id, 'إذا كان المتتالية الحسابية: 2, 5, 8, 11, ... فما الحد العاشر؟', '29', '32', '26', '30', 'A', 5],
      [exams[1].id, 'ما هو أساس المتتالية الهندسية: 3, 6, 12, 24 ؟',       '2',                   '3',             '4',             '6',             'A', 5],
      [exams[1].id, 'مجموع أول 100 عدد طبيعي يساوي:',                      '5050',                '5000',          '4950',          '5100',          'A', 5],

      // exam 2: algebra
      [exams[2].id, 'حل المعادلة التربيعية: x² - 5x + 6 = 0',             'x = 2 أو x = 3',     'x = 1 أو x = 6', 'x = -2 أو x = -3', 'x = 2 أو x = -3', 'A', 5],
      [exams[2].id, 'ما هو مجموع جذري المعادلة: x² - 7x + 10 = 0 ؟',     '7',                   '10',            '5',             '2',             'A', 5],
      [exams[2].id, 'حل المتراجحة: 2x + 3 > 7',                           'x > 2',               'x < 2',         'x > 4',         'x < 4',         'A', 5],

      // exam 3: arabic grammar
      [exams[3].id, 'ما إعراب كلمة "الطالبُ" في جملة: "الطالبُ مجتهدٌ" ؟', 'مبتدأ مرفوع',      'خبر مرفوع',     'فاعل مرفوع',   'مفعول به',      'A', 5],
      [exams[3].id, 'أي الكلمات التالية فعل مضارع؟',                       'يكتبُ',              'كتبَ',          'كتابةٌ',       'كاتبٌ',         'A', 5],
      [exams[3].id, 'في جملة "قرأ محمدٌ الكتابَ"، ما إعراب "الكتابَ"؟',    'مفعول به منصوب',    'فاعل مرفوع',   'مبتدأ مرفوع',  'خبر منصوب',     'A', 5],
      [exams[3].id, 'الميزان الصرفي لكلمة "كاتب":',                        'فاعل',              'فعَّال',        'مفعول',        'فَعِيل',         'A', 5],

      // exam 5: physics mechanics
      [exams[5].id, 'قانون نيوتن الثاني للحركة: F = ?',                    'ma',                 'm/a',           'mg',            'mv',            'A', 5],
      [exams[5].id, 'وحدة قياس القوة في النظام الدولي:',                   'نيوتن (N)',          'جول (J)',       'واط (W)',       'باسكال (Pa)',    'A', 5],
      [exams[5].id, 'جسم كتلته 10 كجم يتسارع بمقدار 5 م/ث². القوة المؤثرة عليه:', '50 N', '15 N', '2 N', '500 N', 'A', 5],
      [exams[5].id, 'قانون الطاقة الحركية: KE = ?',                       '½mv²',              'mv²',           'mgh',           '½mv',           'A', 5],

      // exam 6: electricity
      [exams[6].id, 'قانون أوم: V = ?',                                     'IR',                 'I/R',           'R/I',           'I+R',           'A', 5],
      [exams[6].id, 'وحدة قياس المقاومة الكهربية:',                        'أوم (Ω)',            'أمبير (A)',     'فولت (V)',      'فاراد (F)',      'A', 5],
      [exams[6].id, 'إذا كانت قوة التيار 2A والمقاومة 5Ω، فإن الجهد يساوي:', '10V', '2.5V', '7V', '3V', 'A', 5],
    ];

    for (const [eid, qtext, oa, ob, oc, od, correct, pts] of questionsData) {
      await pool.query(`
        INSERT INTO questions (exam_id, question_text, option_a, option_b, option_c, option_d, correct_answer_letter, points)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [eid, qtext, oa, ob, oc, od, correct, pts]);
    }
    console.log('✅ الأسئلة:', questionsData.length);

    // ─── 9. Enrollments ────────────────────────────────────────────
    const enrollments = [
      [students[0].id, courses[0].id], [students[0].id, courses[1].id],
      [students[1].id, courses[0].id],
      [students[2].id, courses[1].id],
      [students[3].id, courses[0].id], [students[3].id, courses[1].id],
      [students[4].id, courses[1].id],
      [students[5].id, courses[2].id], [students[5].id, courses[3].id],
      [students[6].id, courses[2].id],
      [students[7].id, courses[2].id], [students[7].id, courses[3].id],
      [students[8].id, courses[4].id], [students[8].id, courses[5].id],
      [students[9].id, courses[4].id],
      [students[10].id, courses[5].id],
    ];
    for (const [sid, cid] of enrollments) {
      await pool.query(`
        INSERT INTO student_course_enrollment (student_id, course_id, status)
        VALUES ($1,$2,'active') ON CONFLICT DO NOTHING
      `, [sid, cid]);
    }
    console.log('✅ الاشتراكات:', enrollments.length);

    // ─── 10. Exam Results ──────────────────────────────────────────
    const now = new Date();
    const resultsData = [
      // [student_idx, exam_idx, score, correct, wrong, unanswered, pts_earned, days_ago]
      [0, 0, 85,  17, 2, 1, 85,  30],
      [0, 1, 40,  8,  7, 0, 40,  25],
      [0, 2, 75,  15, 3, 2, 75,  20],
      [1, 0, 92,  18, 1, 1, 92,  28],
      [1, 2, 60,  12, 5, 3, 60,  15],
      [3, 0, 98,  19, 0, 1, 98,  10],
      [3, 1, 48,  9,  6, 0, 48,  8],
      [5, 3, 55,  11, 4, 1, 55,  20],
      [5, 4, 82,  16, 2, 2, 82,  12],
      [6, 3, 40,  8,  7, 1, 40,  18],
      [7, 4, 90,  18, 1, 1, 90,  5],
      [8, 5, 70,  14, 4, 2, 70,  22],
      [8, 6, 55,  11, 6, 1, 55,  14],
      [9, 5, 45,  9,  8, 1, 45,  19],
      [10, 6, 50, 10, 7, 1, 50,  7],
    ];

    for (const [si, ei, score, correct, wrong, unanswered, pts, daysAgo] of resultsData) {
      const startTime = new Date(now - daysAgo * 86400000);
      const endTime   = new Date(startTime.getTime() + examsData[ei][1] * 60000);
      await pool.query(`
        INSERT INTO exam_results
          (student_id, exam_id, score, correct_count, wrong_count, unanswered_count,
           start_time, end_time, points_earned, answers)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, [
        students[si].id, exams[ei].id, score, correct, wrong, unanswered,
        startTime, endTime, pts,
        JSON.stringify({ note: 'بيانات تجريبية' })
      ]);

      // Update student points
      await pool.query(`UPDATE students SET points = points + $1 WHERE id = $2`, [pts, students[si].id]);
    }
    console.log('✅ نتائج الامتحانات:', resultsData.length);

    // ─── 11. Badges ────────────────────────────────────────────────
    const badgesData = [
      [students[0].id, exams[0].id, 'نجم الرياضيات',    '#FFD700'],
      [students[1].id, exams[0].id, 'نجم الرياضيات',    '#FFD700'],
      [students[3].id, exams[0].id, 'نجم الرياضيات',    '#FFD700'],
      [students[5].id, exams[4].id, 'أمير اللغة',       '#96CEB4'],
      [students[7].id, exams[4].id, 'أمير اللغة',       '#96CEB4'],
    ];
    for (const [sid, eid, badge, color] of badgesData) {
      await pool.query(`
        INSERT INTO badges (student_id, exam_id, badge_name, badge_color)
        VALUES ($1,$2,$3,$4)
      `, [sid, eid, badge, color]);
    }
    console.log('✅ الشارات:', badgesData.length);

    // ─── 12. Video Progress ────────────────────────────────────────
    const progressData = [
      [students[0].id, videoIds[0],  5, 45, 100],
      [students[0].id, videoIds[1],  3, 60, 100],
      [students[0].id, videoIds[2],  2, 50, 66],
      [students[0].id, videoIds[3],  1, 20, 36],
      [students[1].id, videoIds[0],  4, 45, 100],
      [students[1].id, videoIds[1],  2, 30, 50],
      [students[3].id, videoIds[0],  7, 45, 100],
      [students[3].id, videoIds[1],  6, 60, 100],
      [students[3].id, videoIds[2],  5, 75, 100],
      [students[3].id, videoIds[3],  3, 55, 100],
      [students[3].id, videoIds[4],  2, 40, 80],
      [students[5].id, videoIds[8],  4, 35, 100],
      [students[5].id, videoIds[9],  3, 40, 100],
      [students[5].id, videoIds[10], 2, 30, 66],
      [students[8].id, videoIds[12], 3, 65, 100],
      [students[8].id, videoIds[13], 2, 50, 71],
    ];
    for (const [sid, vid, wc, wm, pct] of progressData) {
      await pool.query(`
        INSERT INTO video_progress (student_id, video_id, watch_count, watched_minutes, progress_percentage)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT (student_id, video_id) DO UPDATE
        SET watch_count=$3, watched_minutes=$4, progress_percentage=$5
      `, [sid, vid, wc, wm, pct]);
    }
    console.log('✅ تقدم الفيديوهات:', progressData.length);

    // ─── 13. Payments ──────────────────────────────────────────────
    const paymentsData = [
      [students[0].id, courses[0].id, 350, 'instapay',      'completed', 'INS-001-2024', 35],
      [students[0].id, courses[1].id, 250, 'vodafone_cash', 'completed', 'VF-002-2024',  30],
      [students[1].id, courses[0].id, 350, 'instapay',      'completed', 'INS-003-2024', 28],
      [students[3].id, courses[0].id, 350, 'vodafone_cash', 'completed', 'VF-004-2024',  25],
      [students[3].id, courses[1].id, 250, 'instapay',      'completed', 'INS-005-2024', 22],
      [students[5].id, courses[2].id, 200, 'instapay',      'completed', 'INS-006-2024', 20],
      [students[5].id, courses[3].id, 300, 'vodafone_cash', 'completed', 'VF-007-2024',  18],
      [students[7].id, courses[2].id, 200, 'instapay',      'completed', 'INS-008-2024', 15],
      [students[8].id, courses[4].id, 400, 'vodafone_cash', 'completed', 'VF-009-2024',  12],
      [students[8].id, courses[5].id, 280, 'instapay',      'pending',   'INS-010-2024', 5],
      [students[9].id, courses[4].id, 400, 'vodafone_cash', 'pending',   'VF-011-2024',  3],
      [students[2].id, courses[1].id, 250, 'instapay',      'pending',   'INS-012-2024', 1],
    ];
    for (const [sid, cid, amount, method, status, ref, daysAgo] of paymentsData) {
      const payDate = new Date(now - daysAgo * 86400000);
      await pool.query(`
        INSERT INTO payments (student_id, course_id, amount, method, payment_date, status, reference_number)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [sid, cid, amount, method, payDate, status, ref]);
    }
    console.log('✅ المدفوعات:', paymentsData.length);

    console.log('\n🎉 تم إضافة جميع البيانات التجريبية بنجاح!');
    process.exit(0);
  } catch (err) {
    console.error('❌ خطأ:', err.message);
    process.exit(1);
  }
}

seedDemo();
