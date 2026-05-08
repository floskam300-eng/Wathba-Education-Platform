require('dotenv').config();
const pool = require('./connection');
const bcrypt = require('bcryptjs');

async function seed() {
  const client = await pool.connect();
  try {
    console.log('🧹 مسح البيانات القديمة...');

    // مسح كل البيانات القديمة عدا المعلم admin
    await client.query(`DELETE FROM notification_log`);
    await client.query(`DELETE FROM badges`);
    await client.query(`DELETE FROM video_progress`);
    await client.query(`DELETE FROM exam_results`);
    await client.query(`DELETE FROM course_enrollment_requests`);
    await client.query(`DELETE FROM student_course_enrollment`);
    await client.query(`DELETE FROM payments`);
    await client.query(`DELETE FROM questions`);
    await client.query(`DELETE FROM exams`);
    await client.query(`DELETE FROM pdf_files`);
    await client.query(`DELETE FROM videos`);
    await client.query(`DELETE FROM sections`);
    await client.query(`DELETE FROM courses`);
    await client.query(`DELETE FROM students`);
    await client.query(`DELETE FROM assistants`);
    await client.query(`DELETE FROM teachers WHERE username != 'admin'`);
    console.log('✅ تم مسح البيانات القديمة');

    // ─── كلمة المرور المشفرة ──────────────────────────────────────────────────
    const pass = await bcrypt.hash('123456', 10);

    // ─── المعلم الأساسي (admin) ───────────────────────────────────────────────
    const teacherRes = await client.query(`
      UPDATE teachers
      SET name = 'أ/ محمد عبد الرحمن',
          bio  = 'معلم رياضيات بخبرة 18 عاماً، متخصص في الثانوية العامة، حاصل على بكالوريوس رياضيات جامعة القاهرة، نجح على يديه أكثر من 3000 طالب',
          classification = 'مدرس رياضيات - ثانوية عامة',
          whatsapp_phone = '+201000000000'
      WHERE username = 'admin'
      RETURNING id
    `);
    const TID = teacherRes.rows[0].id;
    console.log('✅ المعلم ID:', TID);

    // ─── 1. المساعدون (3 مساعدين) ────────────────────────────────────────────
    const aRes = await client.query(`
      INSERT INTO assistants
        (username, password, name, phone, teacher_id,
         can_add_students, can_edit_students, can_delete_students,
         can_manage_exams, can_view_analytics, can_send_reports,
         can_manage_payments, can_manage_courses)
      VALUES
        ('asst_nour',  $1, 'نور أحمد علي',    '+201111111101', $2, true,  true,  false, true,  true,  true,  true,  true),
        ('asst_karim', $1, 'كريم محمود حسن',  '+201111111102', $2, true,  true,  true,  true,  true,  true,  true,  false),
        ('asst_heba',  $1, 'هبة سامي ناصر',   '+201111111103', $2, true,  true,  false, false, true,  true,  false, false)
      RETURNING id, username
    `, [pass, TID]);

    const A1 = aRes.rows[0].id; // نور
    const A2 = aRes.rows[1].id; // كريم
    console.log('✅ المساعدون:', aRes.rows.map(r => r.username));

    // ─── 2. الطلاب (25 طالب) ─────────────────────────────────────────────────
    const studentsRaw = [
      // الصف الثالث الثانوي - 10 طلاب
      ['std_ali',       'علي محمد رمضان',         '+2012001', '+2012002', 'الصف الثالث الثانوي', 'ذكر',  420],
      ['std_fatma',     'فاطمة أحمد سعد',          '+2012003', '+2012004', 'الصف الثالث الثانوي', 'أنثى', 380],
      ['std_youssef',   'يوسف إبراهيم كمال',       '+2012005', '+2012006', 'الصف الثالث الثانوي', 'ذكر',  510],
      ['std_nada',      'ندى حسن عبد الله',        '+2012007', '+2012008', 'الصف الثالث الثانوي', 'أنثى', 290],
      ['std_omar',      'عمر سامي فرج',             '+2012009', '+2012010', 'الصف الثالث الثانوي', 'ذكر',  350],
      ['std_hana',      'هناء وليد منصور',          '+2012011', '+2012012', 'الصف الثالث الثانوي', 'أنثى', 460],
      ['std_hassan',    'حسن علاء طارق',            '+2012013', '+2012014', 'الصف الثالث الثانوي', 'ذكر',  310],
      ['std_mona',      'منى رامي عبد العزيز',      '+2012015', '+2012016', 'الصف الثالث الثانوي', 'أنثى', 275],
      ['std_khaled',    'خالد عصام مبروك',          '+2012017', '+2012018', 'الصف الثالث الثانوي', 'ذكر',  480],
      ['std_dina',      'دينا وليد شريف',           '+2012019', '+2012020', 'الصف الثالث الثانوي', 'أنثى', 330],
      // الصف الثاني الثانوي - 9 طلاب
      ['std_mostafa',   'مصطفى أسامة نور',          '+2012021', '+2012022', 'الصف الثاني الثانوي', 'ذكر',  220],
      ['std_rana',      'رنا طارق عبد العزيز',      '+2012023', '+2012024', 'الصف الثاني الثانوي', 'أنثى', 195],
      ['std_adam',      'آدم محمود صلاح',           '+2012025', '+2012026', 'الصف الثاني الثانوي', 'ذكر',  260],
      ['std_lina',      'لينا سعيد القاضي',         '+2012027', '+2012028', 'الصف الثاني الثانوي', 'أنثى', 180],
      ['std_ziad',      'زياد أحمد مبارك',          '+2012029', '+2012030', 'الصف الثاني الثانوي', 'ذكر',  305],
      ['std_reem',      'ريم حاتم رشاد',            '+2012031', '+2012032', 'الصف الثاني الثانوي', 'أنثى', 240],
      ['std_ibrahim',   'إبراهيم عادل فوزي',        '+2012033', '+2012034', 'الصف الثاني الثانوي', 'ذكر',  170],
      ['std_sara',      'سارة خالد نجيب',           '+2012035', '+2012036', 'الصف الثاني الثانوي', 'أنثى', 288],
      ['std_amr',       'عمرو حامد رشاد',           '+2012037', '+2012038', 'الصف الثاني الثانوي', 'ذكر',  210],
      // الصف الأول الثانوي - 6 طلاب
      ['std_nour2',     'نور الدين سامي توفيق',     '+2012039', '+2012040', 'الصف الأول الثانوي',  'ذكر',  90],
      ['std_yasmin',    'ياسمين رأفت عوض',          '+2012041', '+2012042', 'الصف الأول الثانوي',  'أنثى', 75],
      ['std_tarek',     'طارق ماهر أبو زيد',        '+2012043', '+2012044', 'الصف الأول الثانوي',  'ذكر',  120],
      ['std_hana2',     'هنا إسلام قنديل',          '+2012045', '+2012046', 'الصف الأول الثانوي',  'أنثى', 55],
      ['std_amir',      'أمير ممدوح رجب',           '+2012047', '+2012048', 'الصف الأول الثانوي',  'ذكر',  105],
      ['std_layla',     'ليلى وسام عطية',           '+2012049', '+2012050', 'الصف الأول الثانوي',  'أنثى', 80],
    ];

    const students = [];
    for (const [un, name, ph, pph, stage, gender, pts] of studentsRaw) {
      const r = await client.query(
        `INSERT INTO students (username,password,name,phone,parent_phone,academic_stage,gender,teacher_id,points)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, academic_stage`,
        [un, pass, name, ph, pph, stage, gender, TID, pts]
      );
      students.push({ id: r.rows[0].id, stage: r.rows[0].academic_stage, username: un, name });
    }

    const s3 = students.filter(s => s.stage === 'الصف الثالث الثانوي'); // 10
    const s2 = students.filter(s => s.stage === 'الصف الثاني الثانوي'); // 9
    const s1 = students.filter(s => s.stage === 'الصف الأول الثانوي');  // 6
    console.log(`✅ الطلاب: ${students.length} (ثالثة:${s3.length} | ثانية:${s2.length} | أولى:${s1.length})`);

    // ─── 3. الكورسات (6 كورسات) ──────────────────────────────────────────────
    const cRes = await client.query(`
      INSERT INTO courses (name, description, price, teacher_id, target_stage) VALUES
        ('رياضيات الصف الثالث الثانوي - ترم أول',
         'شرح كامل ومفصل لمنهج رياضيات الصف الثالث الثانوي الترم الأول، يشمل الجبر الخطي والمصفوفات والمحددات والتفاضل والتكامل مع حل جميع أسئلة الكتاب المدرسي ونماذج الامتحانات السابقة',
         400.00, $1, 'الصف الثالث الثانوي'),

        ('رياضيات الصف الثالث الثانوي - ترم ثاني',
         'شرح شامل للترم الثاني يشمل الاحتمالات والإحصاء والمتسلسلات والمتتاليات والهندسة التحليلية وحساب المثلثات',
         400.00, $1, 'الصف الثالث الثانوي'),

        ('مراجعة نهائية - رياضيات ثانوية عامة',
         'كورس مكثف للمراجعة النهائية قبل امتحان الثانوية العامة، يشمل أهم المسائل والتوقعات وحل نماذج الوزارة',
         300.00, $1, 'الصف الثالث الثانوي'),

        ('رياضيات الصف الثاني الثانوي - ترم أول',
         'شرح منهج الصف الثاني الثانوي كاملاً يشمل الهندسة الفراغية وحساب المثلثات والجبر والإحصاء',
         300.00, $1, 'الصف الثاني الثانوي'),

        ('رياضيات الصف الثاني الثانوي - ترم ثاني',
         'الترم الثاني للصف الثاني الثانوي مع شرح تفصيلي لكل درس وحل التمارين والاختبارات',
         300.00, $1, 'الصف الثاني الثانوي'),

        ('رياضيات الصف الأول الثانوي - تأسيس',
         'كورس تأسيسي شامل للصف الأول الثانوي يضمن فهم القواعد الأساسية للرياضيات وبناء أساس متين',
         250.00, $1, 'الصف الأول الثانوي')
      RETURNING id
    `, [TID]);

    const [C1, C2, C3, C4, C5, C6] = cRes.rows.map(r => r.id);
    console.log('✅ الكورسات:', { C1, C2, C3, C4, C5, C6 });

    // ─── 4. الأقسام ──────────────────────────────────────────────────────────
    const secRes = await client.query(`
      INSERT INTO sections (course_id, title, sort_order) VALUES
        ($1,'الوحدة الأولى: المصفوفات والمحددات',1),
        ($1,'الوحدة الثانية: الجبر الخطي',2),
        ($1,'الوحدة الثالثة: حساب التفاضل',3),
        ($1,'الوحدة الرابعة: حساب التكامل',4),

        ($2,'الوحدة الأولى: الاحتمالات',1),
        ($2,'الوحدة الثانية: الإحصاء',2),
        ($2,'الوحدة الثالثة: المتسلسلات والمتتاليات',3),
        ($2,'الوحدة الرابعة: الهندسة التحليلية',4),

        ($3,'مراجعة الجبر والمصفوفات',1),
        ($3,'مراجعة التفاضل والتكامل',2),
        ($3,'مراجعة الهندسة والاحتمالات',3),
        ($3,'نماذج امتحانات وزارية',4),

        ($4,'الوحدة الأولى: الهندسة الفراغية',1),
        ($4,'الوحدة الثانية: حساب المثلثات',2),
        ($4,'الوحدة الثالثة: الجبر',3),

        ($5,'الوحدة الأولى: الاقترانات والرسم',1),
        ($5,'الوحدة الثانية: المتراجحات',2),
        ($5,'الوحدة الثالثة: الإحصاء التطبيقي',3),

        ($6,'الوحدة الأولى: الأعداد الحقيقية',1),
        ($6,'الوحدة الثانية: الجبر الأساسي',2),
        ($6,'الوحدة الثالثة: الهندسة المستوية',3)
      RETURNING id, course_id
    `, [C1, C2, C3, C4, C5, C6]);

    const secMap = {};
    for (const s of secRes.rows) {
      if (!secMap[s.course_id]) secMap[s.course_id] = [];
      secMap[s.course_id].push(s.id);
    }

    // ─── 5. الفيديوهات (48 فيديو) ────────────────────────────────────────────
    const videosData = [
      // C1 - ثالثة ترم1 (16 فيديو)
      [C1,'مقدمة في المصفوفات وأنواعها',55,1,secMap[C1][0]],
      [C1,'جمع وطرح المصفوفات',50,2,secMap[C1][0]],
      [C1,'ضرب المصفوفات',65,3,secMap[C1][0]],
      [C1,'المحددات وخصائصها',60,4,secMap[C1][0]],
      [C1,'المصفوفة المعكوسة',55,5,secMap[C1][0]],
      [C1,'حل الأنظمة الخطية بالمصفوفات',70,6,secMap[C1][0]],
      [C1,'المعادلات الخطية والتطبيقات',60,7,secMap[C1][1]],
      [C1,'النهايات وخصائصها',50,8,secMap[C1][2]],
      [C1,'الاشتقاق وقواعد التفاضل',65,9,secMap[C1][2]],
      [C1,'تطبيقات الاشتقاق',70,10,secMap[C1][2]],
      [C1,'القيم العظمى والصغرى',55,11,secMap[C1][2]],
      [C1,'مقدمة التكامل',60,12,secMap[C1][3]],
      [C1,'التكامل المحدود وغير المحدود',65,13,secMap[C1][3]],
      [C1,'تطبيقات التكامل - المساحة',70,14,secMap[C1][3]],
      [C1,'تطبيقات التكامل - الحجم',60,15,secMap[C1][3]],
      [C1,'مراجعة شاملة الترم الأول',90,16,secMap[C1][3]],

      // C2 - ثالثة ترم2 (12 فيديو)
      [C2,'فضاء العينة والأحداث',50,1,secMap[C2][0]],
      [C2,'قوانين الاحتمالات',55,2,secMap[C2][0]],
      [C2,'توزيع ذو الحدين',60,3,secMap[C2][0]],
      [C2,'المتوسط والوسيط والمنوال',45,4,secMap[C2][1]],
      [C2,'التشتت والانحراف المعياري',50,5,secMap[C2][1]],
      [C2,'المتتاليات الحسابية',55,6,secMap[C2][2]],
      [C2,'المتتاليات الهندسية',55,7,secMap[C2][2]],
      [C2,'مجاميع المتتاليات',60,8,secMap[C2][2]],
      [C2,'الهندسة التحليلية - المستقيم',65,9,secMap[C2][3]],
      [C2,'الدائرة والقطوع المخروطية',70,10,secMap[C2][3]],
      [C2,'الإهليلج والقطع المكافئ',65,11,secMap[C2][3]],
      [C2,'مراجعة شاملة الترم الثاني',90,12,secMap[C2][3]],

      // C3 - مراجعة نهائية (8 فيديو)
      [C3,'مراجعة سريعة للمصفوفات',45,1,secMap[C3][0]],
      [C3,'مراجعة التفاضل - أهم القوانين',50,2,secMap[C3][1]],
      [C3,'مراجعة التكامل - مسائل متوقعة',55,3,secMap[C3][1]],
      [C3,'مراجعة الاحتمالات والإحصاء',45,4,secMap[C3][2]],
      [C3,'نموذج امتحان وزارة 2023',90,5,secMap[C3][3]],
      [C3,'نموذج امتحان وزارة 2024',90,6,secMap[C3][3]],
      [C3,'توقعات امتحان 2025 - جزء أول',60,7,secMap[C3][3]],
      [C3,'توقعات امتحان 2025 - جزء ثاني',60,8,secMap[C3][3]],

      // C4 - ثانية ترم1 (7 فيديو)
      [C4,'الهندسة الفراغية - المستوى والخط',55,1,secMap[C4][0]],
      [C4,'المجسمات والأجسام الهندسية',60,2,secMap[C4][0]],
      [C4,'حساب المثلثات - التعريفات',50,3,secMap[C4][1]],
      [C4,'القانون الجيبي وقانون التمام',55,4,secMap[C4][1]],
      [C4,'الجبر - المعادلات التربيعية',50,5,secMap[C4][2]],
      [C4,'الجبر - المعادلات من الدرجة الثالثة',55,6,secMap[C4][2]],
      [C4,'تطبيقات الجبر',45,7,secMap[C4][2]],

      // C5 - ثانية ترم2 (5 فيديو)
      [C5,'الاقترانات وأنواعها',50,1,secMap[C5][0]],
      [C5,'رسم الدوال',45,2,secMap[C5][0]],
      [C5,'المتراجحات وحلها',50,3,secMap[C5][1]],
      [C5,'الإحصاء التطبيقي',55,4,secMap[C5][2]],
      [C5,'مراجعة شاملة ثانية ثانوي',60,5,secMap[C5][2]],

      // C6 - أولى تأسيس (4 فيديو)
      [C6,'الأعداد الحقيقية والعمليات الأساسية',45,1,secMap[C6][0]],
      [C6,'الكسور والنسبة والتناسب',40,2,secMap[C6][0]],
      [C6,'الجبر الأساسي والمعادلات',50,3,secMap[C6][1]],
      [C6,'الهندسة المستوية الأساسية',45,4,secMap[C6][2]],
    ];

    for (const [cid, title, dur, ord, secid] of videosData) {
      await client.query(
        `INSERT INTO videos (title, file_path_or_url, duration_minutes, course_id, sort_order, section_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [title, `https://www.youtube.com/watch?v=placeholder_${ord}`, dur, cid, ord, secid]
      );
    }

    const vidRows = await client.query('SELECT id, course_id FROM videos ORDER BY course_id, sort_order');
    const allVids = vidRows.rows;
    console.log('✅ الفيديوهات:', allVids.length);

    // ─── 6. ملفات PDF (18 ملف) ───────────────────────────────────────────────
    const pdfData = [
      [C1,'ملزمة المصفوفات والمحددات - كاملة',secMap[C1][0]],
      [C1,'أسئلة وحلول على الجبر الخطي',secMap[C1][1]],
      [C1,'شرح التفاضل بالتفصيل',secMap[C1][2]],
      [C1,'تمارين التكامل مع الحلول',secMap[C1][3]],
      [C2,'ملزمة الاحتمالات والإحصاء',secMap[C2][0]],
      [C2,'أسئلة المتتاليات - حلول نموذجية',secMap[C2][2]],
      [C2,'الهندسة التحليلية - أهم المسائل',secMap[C2][3]],
      [C3,'ملخص شامل للمنهج كاملاً',secMap[C3][0]],
      [C3,'نماذج امتحانات 5 سنوات سابقة',secMap[C3][3]],
      [C3,'توقعات الامتحان 2025',secMap[C3][3]],
      [C4,'الهندسة الفراغية - شرح وتمارين',secMap[C4][0]],
      [C4,'حساب المثلثات - ملزمة كاملة',secMap[C4][1]],
      [C4,'الجبر - مسائل وحلول',secMap[C4][2]],
      [C5,'الاقترانات والمتراجحات',secMap[C5][0]],
      [C5,'الإحصاء التطبيقي - ملزمة',secMap[C5][2]],
      [C6,'الأساسيات - ملزمة الصف الأول',secMap[C6][0]],
      [C6,'الجبر الأساسي للصف الأول',secMap[C6][1]],
      [C6,'الهندسة الأساسية',secMap[C6][2]],
    ];

    for (const [cid, title, secid] of pdfData) {
      await client.query(
        `INSERT INTO pdf_files (title, file_url, course_id, section_id) VALUES ($1,$2,$3,$4)`,
        [title, `/uploads/pdf_${title.replace(/\s+/g,'_').substring(0,30)}.pdf`, cid, secid]
      );
    }
    console.log('✅ ملفات PDF:', pdfData.length);

    // ─── 7. الامتحانات (10 امتحانات) ─────────────────────────────────────────
    const examData = [
      ['امتحان المصفوفات - الشهر الأول',            45, 100, C1, 60, 'نجم المصفوفات',     '#FFD700', -40, -35],
      ['امتحان التفاضل والتكامل',                    60, 100, C1, 65, 'خبير التفاضل',      '#FF6347', -25, -20],
      ['امتحان نهاية ترم أول - رياضيات ثالثة',      90, 100, C1, 65, 'متفوق الترم الأول', '#FF4500', -10,  -5],
      ['امتحان الاحتمالات والإحصاء',                 50, 100, C2, 60, 'عالم الإحصاء',      '#00CED1', -30, -25],
      ['امتحان نهاية ترم ثاني - رياضيات ثالثة',     90, 100, C2, 65, 'متفوق الترم الثاني','#9400D3', -8,   -3],
      ['امتحان المراجعة النهائية - توقعات',          60, 100, C3, 70, 'مستعد للثانوية',    '#32CD32',  -3,   2],
      ['امتحان الهندسة الفراغية',                    45, 100, C4, 60, 'مهندس المستقبل',    '#4169E1', -20, -15],
      ['امتحان حساب المثلثات',                        45, 100, C4, 60, 'عبقري المثلثات',    '#DC143C', -15, -10],
      ['امتحان نهاية ترم - رياضيات ثانية',           75, 100, C4, 60, 'متفوق الصف الثاني', '#FF8C00',  -7,  -2],
      ['امتحان تأسيس - أول ثانوي',                   45, 100, C6, 50, 'مبتدئ ومتميز',      '#20B2AA', -35, -30],
    ];

    const examIds = [];
    for (const [title, dur, total, cid, pass, badge, bcolor, startOff, endOff] of examData) {
      const r = await client.query(
        `INSERT INTO exams (title,duration_minutes,total_score,course_id,teacher_id,pass_score,badge_name,badge_color,start_date,end_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW()+($9||' days')::interval, NOW()+($10||' days')::interval)
         RETURNING id`,
        [title, dur, total, cid, TID, pass, badge, bcolor, startOff, endOff]
      );
      examIds.push(r.rows[0].id);
    }
    const [E1,E2,E3,E4,E5,E6,E7,E8,E9,E10] = examIds;
    console.log('✅ الامتحانات:', examIds.length);

    // ─── 8. الأسئلة (10 لكل امتحان = 100 سؤال) ──────────────────────────────
    const questionsPerExam = {
      [E1]: [ // المصفوفات
        ['ما رتبة حاصل ضرب مصفوفة 2×3 في مصفوفة 3×4؟','2×4','3×3','2×3','4×2','a',10],
        ['ما قيمة محدد المصفوفة [[5,2],[3,1]]؟','-1','11','7','1','a',10],
        ['المصفوفة المنتقلة تُنشأ بـ:','قلب الإشارات','تبديل الصفوف بالأعمدة','ضرب في -1','إضافة صف','b',10],
        ['إذا كان det(A)=0 فالمصفوفة تسمى:','وحدانية','قطرية','منفردة','متعامدة','c',10],
        ['ناتج ضرب مصفوفة الوحدة I في A يساوي:','I','صفر','A','A²','c',10],
        ['المصفوفة المعكوسة A⁻¹ موجودة إذا:','det(A)=1','det(A)≠0','A مربعة','A قطرية','b',10],
        ['عناصر المصفوفة القطرية الرئيسية تقع على:','الصف الأول','القطر الرئيسي','القطر الثانوي','الصف الأخير','b',10],
        ['ضرب مصفوفة في مقلوبها يعطي:','الصفر','ضعف A','مصفوفة الوحدة','مقلوب A','c',10],
        ['المصفوفة المتماثلة تحقق:','A=A⁻¹','A=Aᵀ','det(A)=0','A²=I','b',10],
        ['عدد عناصر المصفوفة m×n يساوي:','m+n','m-n','m×n','m÷n','c',10],
      ],
      [E2]: [ // التفاضل
        ['مشتقة الدالة f(x)=x⁴ هي:','4x³','x³','4x','3x⁴','a',10],
        ['مشتقة الدالة f(x)=sin(x) هي:','-cos(x)','cos(x)','-sin(x)','tan(x)','b',10],
        ['إذا f(x)=e^x فإن f\'(x)=','e^x','xe^x','e^(x-1)','1/e^x','a',10],
        ['قاعدة حاصل الضرب: (uv)\'=','u\'v','uv\'','u\'v+uv\'','u\'v-uv\'','c',10],
        ['عند النقطة الحرجة f\'(x)=','0','1','-1','غير محددة','a',10],
        ['مشتقة ln(x) هي:','ln(x)','1/x','x','1','b',10],
        ['مشتقة الثابت c تساوي:','c','1','0','c²','c',10],
        ['قاعدة السلسلة لـ f(g(x)) هي:','f\'(x)','f\'(g(x))·g\'(x)','f\'(g(x))','f(g\'(x))','b',10],
        ['الدالة تتزايد عندما f\'(x):','<0','=0','>0','غير معرفة','c',10],
        ['نقطة الانعطاف تحدث عند f\'\'(x)=','0','1','>0','<0','a',10],
      ],
      [E3]: [ // نهاية ترم أول
        ['ما قيمة lim(x→3) (x²-9)/(x-3)؟','3','6','0','غير محددة','b',10],
        ['ما مشتقة f(x)=3x²-5x+2؟','6x-5','3x-5','6x+2','x-5','a',10],
        ['التكامل ∫x²dx=','x²/2','x³/3','2x','3x²','b',10],
        ['حل المعادلة 2x-8=0:','x=2','x=4','x=8','x=16','b',10],
        ['ما محدد [[2,0],[0,3]]؟','6','5','0','1','a',10],
        ['f(x)=x³-3x تتزايد عند:','x>1','x<-1 أو x>1','x<1','لا تتزايد','b',10],
        ['∫₀¹ x dx =','1','1/2','2','0','b',10],
        ['مشتقة f(x)=cos(2x) هي:','-2sin(2x)','2sin(2x)','-sin(2x)','sin(2x)','a',10],
        ['قيمة f\'(2) إذا f(x)=x²+3x:','7','10','4','14','a',10],
        ['المصفوفة المعكوسة لـ [[1,0],[0,1]] هي:','نفسها','الصفر','مضاعفة','غير موجودة','a',10],
      ],
      [E4]: [ // الاحتمالات
        ['احتمال ظهور نتيجة مستحيلة يساوي:','1','0','0.5','∞','b',10],
        ['احتمال الحدث المؤكد يساوي:','0','0.5','1','2','c',10],
        ['إذا P(A)=0.4، فـ P(A\')=','0.4','0.6','1.4','0','b',10],
        ['في رمي حجر النرد: P(زوجي)=','1/6','1/3','1/2','2/3','c',10],
        ['p+q=1 في التوزيع ذو الحدين يعني:','p=q','الاستقلالية','الشمولية','التعارض','c',10],
        ['المتوسط الحسابي لـ 2,4,6,8,10 يساوي:','5','6','7','8','b',10],
        ['الانحراف المعياري هو:','الوسيط','جذر تباين','المدى','المنوال','b',10],
        ['إذا P(A∩B)=0 فالحدثان:','متكافئان','مستقلان','متعارضان','متحدان','c',10],
        ['عدد العناصر في حاصل الضرب الديكارتي A×B إذا |A|=3 و|B|=4:','7','12','1','81','b',10],
        ['التوزيع الطبيعي منحناه:','مستقيم','جرسي','دائري','مثلثي','b',10],
      ],
      [E5]: [ // نهاية ترم ثاني
        ['المتتالية الحسابية: 3,7,11,... الحد العاشر:','39','43','41','37','b',10],
        ['مجموع أول 10 حدود للمتتالية الحسابية 2,4,6...:','100','110','90','120','b',10],
        ['في المتتالية الهندسية 2,6,18,... الأساس:','2','3','6','9','b',10],
        ['معادلة الدائرة مركزها (0,0) ونصف قطرها 5:','x²+y²=25','x²+y²=5','(x+5)²+(y+5)²=1','x²-y²=25','a',10],
        ['ميل المستقيم المار بـ (1,2) و(3,6):','1','2','3','4','b',10],
        ['المستقيمان المتوازيان ميلهما:','متعاكسان','متساويان','حاصل ضربهما 1','حاصل ضربهما -1','b',10],
        ['بؤرة القطع المكافئ y²=4x هي:','(1,0)','(0,1)','(4,0)','(0,4)','a',10],
        ['المحور الرئيسي للإهليلج x²/25+y²/16=1:','المحور الصادي','المحور السيني','لا يوجد','يتقاطعان','b',10],
        ['∑ₙ₌₁¹⁰ n =','45','55','50','60','b',10],
        ['الفترة الدورية للدالة sin(2x):','π','2π','π/2','4π','a',10],
      ],
      [E6]: [ // مراجعة نهائية
        ['أهم قانون في الاشتقاق:','قاعدة السلسلة','قاعدة ليبنتز','قاعدة القوة','قاعدة الحاصل','c',10],
        ['∫eˣdx=','eˣ+c','xeˣ+c','eˣ/x+c','e^(x+1)+c','a',10],
        ['det([[a,b],[c,d]])=','ac-bd','ad-bc','ab-cd','ac+bd','b',10],
        ['الدالة المتصلة عند x=a تعني:','f(a) موجودة','lim موجودة','كلاهما متساويان','لا شيء','c',10],
        ['معادلة المماس للمنحنى عند نقطة (x₀,y₀):','y-y₀=m(x-x₀)','y=mx','y=m+x₀','y₀=mx','a',10],
        ['الاحتمال الشرطي P(A|B)=','P(A)','P(A∩B)/P(B)','P(A)×P(B)','P(A)/P(B)','b',10],
        ['∫₀^π sinx dx=','0','1','2','π','c',10],
        ['المصفوفة القابلة للعكس يجب أن تكون:','مربعة فقط','det≠0','قطرية','شبه مثلثية','b',10],
        ['النقطة الحرجة هي نقطة:','الاتصال','لا يكون فيها المشتق صفراً','يكون فيها المشتق صفراً أو غير معرف','الانقطاع','c',10],
        ['مجموع المتتالية الهندسية اللانهائية بشرط |q|<1:','a/(1-q)','a(1-q)','a×q','1-q/a','a',10],
      ],
      [E7]: [ // الهندسة الفراغية
        ['عدد أوجه المكعب:','4','6','8','12','b',10],
        ['حجم الكرة نصف قطرها r:','4πr²','4/3πr³','2πr','πr²','b',10],
        ['مساحة جانبية الأسطوانة:','πr²h','2πrh','2πr²','πrh','b',10],
        ['الخطان المتوازيان في الفراغ:','لا يلتقيان ومتقاطعان','يلتقيان','لا يلتقيان وفي مستو واحد','متعامدان','c',10],
        ['مستوى يتعامد على خط إذا:','يوازيه','يقاطعه بزاوية 90°','يحتويه','لا علاقة','b',10],
        ['حجم الهرم القائم قاعدته a² وارتفاعه h:','a²h','a²h/3','3a²h','a²h/2','b',10],
        ['قطر المكعب طول ضلعه a:','a√2','a√3','2a','3a','b',10],
        ['المستوى الواحد يحتوي:','نقطة واحدة','خطين متوازيين على الأقل','لا نهاية من الخطوط','خطاً واحداً','c',10],
        ['المسافة بين نقطتين (0,0,0) و(3,4,0):','5','7','25','12','a',10],
        ['مساحة القاعدة للمخروط نصف قطرها r:','2πr','πr²','4πr²','πr','b',10],
      ],
      [E8]: [ // حساب المثلثات
        ['sin(30°) تساوي:','√3/2','1/2','√2/2','1','b',10],
        ['cos(60°) تساوي:','√3/2','1/2','√2/2','1','b',10],
        ['tan(45°) تساوي:','0','1','√3','1/√3','b',10],
        ['sin²x + cos²x =','0','1','2','sin(2x)','b',10],
        ['القانون الجيبي: a/sinA = ','b/sinB','c/sinC','b/sinB=c/sinC','كلاهما','c',10],
        ['قانون التمام: a²=','b²+c²','b²+c²-2bc·cosA','b²-c²+2bc·cosA','b²+c²+2bc','b',10],
        ['sin(A+B)=','sinA+sinB','sinAcosB+cosAsinB','sinAcosB-cosAsinB','cosAcosB','b',10],
        ['التقدير الدائري لـ 180°:','π/2','π','2π','3π','b',10],
        ['sec(x) =','sin(x)','1/cos(x)','cos(x)','1/sin(x)','b',10],
        ['مساحة المثلث = 1/2×a×b×','sin C','cos C','tan C','sec C','a',10],
      ],
      [E9]: [ // نهاية ثانية
        ['الاقتران f(x)=x²-4 يمر بالنقطة:','(0,4)','(2,0)','(-2,-4)','(0,-4)','d',10],
        ['مجال الاقتران f(x)=√(x-3):','x≥3','x>3','x≤3','كل الأعداد','a',10],
        ['الاقتران الزوجي يحقق:','f(-x)=f(x)','f(-x)=-f(x)','f(x)=f(x+1)','لا شيء','a',10],
        ['الحل x>3 ممثلاً على خط الأعداد:','نقطة مفرغة عند 3 وسهم يميناً','نقطة ممتلئة عند 3','سهم يساراً','نقطتان','a',10],
        ['المتوسط الحسابي لـ 10,20,30,40,50:','25','30','35','40','b',10],
        ['المنوال لـ 1,2,2,3,3,3,4:','1','2','3','4','c',10],
        ['الوسيط لـ 1,3,5,7,9:','5','7','3','9','a',10],
        ['معادلة التحويل العمودي لـ y=f(x) بمقدار 3:','y=f(x+3)','y=f(x-3)','y=f(x)+3','y=f(x)-3','c',10],
        ['ميل المستقيم العمودي:','0','1','غير معرف','∞','c',10],
        ['الاقتران المتناقص يحقق:','f(x₁)>f(x₂) إذا x₁<x₂','f(x₁)<f(x₂) إذا x₁<x₂','f(x₁)=f(x₂)','لا شيء','b',10],
      ],
      [E10]: [ // تأسيس أول ثانوي
        ['ما ناتج 15 × 8 ÷ 4 + 3؟','33','36','30','27','a',10],
        ['ما قيمة x في: 3x + 6 = 21؟','5','3','7','9','a',10],
        ['ما مساحة المثلث قاعدته 10 وارتفاعه 6؟','30','60','16','36','a',10],
        ['ما قيمة 2³ × 3²؟','72','36','18','54','a',10],
        ['ما أكبر عامل مشترك لـ 24 و36؟','6','8','12','4','c',10],
        ['ما ناتج (x+3)(x-3)؟','x²-9','x²+9','x²-6x','x²+6x','a',10],
        ['ما محيط المربع طول ضلعه 7؟','28','21','14','49','a',10],
        ['ما قيمة √144؟','11','12','13','14','b',10],
        ['x²=25، قيم x هي:','5','±5','-5','0','b',10],
        ['ما ناتج (2x²)³؟','8x⁶','6x⁵','8x⁵','6x⁶','a',10],
      ],
    };

    for (const [eid, qs] of Object.entries(questionsPerExam)) {
      for (const [qtxt, a, b, c, d, correct, pts] of qs) {
        await client.query(
          `INSERT INTO questions (question_text,option_a,option_b,option_c,option_d,correct_answer_letter,points,exam_id,question_type)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'mcq')`,
          [qtxt, a, b, c, d, correct, pts, eid]
        );
      }
    }
    console.log('✅ الأسئلة: 100 سؤال');

    // ─── 9. الالتحاق بالكورسات ───────────────────────────────────────────────
    const enrollMap = [
      // ثالثة → C1,C2,C3
      ...s3.map(s => [s.id, C1, 'active']),
      ...s3.map(s => [s.id, C2, 'active']),
      ...s3.slice(0, 7).map(s => [s.id, C3, 'active']),
      // ثانية → C4,C5
      ...s2.map(s => [s.id, C4, 'active']),
      ...s2.slice(0, 6).map(s => [s.id, C5, 'active']),
      // أولى → C6
      ...s1.map(s => [s.id, C6, 'active']),
    ];
    for (const [sid, cid, status] of enrollMap) {
      await client.query(
        `INSERT INTO student_course_enrollment (student_id,course_id,status) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [sid, cid, status]
      );
    }
    console.log('✅ تسجيلات الكورسات:', enrollMap.length);

    // ─── 10. نتائج الامتحانات ─────────────────────────────────────────────────
    // درجات واقعية لكل طالب في كل امتحان
    const scoreMatrix = {
      [E1]: {
        // std_ali:90  std_fatma:78  std_youssef:95  std_nada:62  std_omar:73
        // std_hana:88  std_hassan:55  std_mona:70  std_khaled:92  std_dina:67
        [s3[0].id]:90,[s3[1].id]:78,[s3[2].id]:95,[s3[3].id]:62,[s3[4].id]:73,
        [s3[5].id]:88,[s3[6].id]:55,[s3[7].id]:70,[s3[8].id]:92,[s3[9].id]:67,
      },
      [E2]: {
        [s3[0].id]:85,[s3[1].id]:72,[s3[2].id]:91,[s3[3].id]:58,[s3[4].id]:68,
        [s3[5].id]:80,[s3[6].id]:50,[s3[7].id]:65,[s3[8].id]:88,[s3[9].id]:75,
      },
      [E3]: {
        [s3[0].id]:88,[s3[1].id]:76,[s3[2].id]:97,[s3[3].id]:60,[s3[4].id]:71,
        [s3[5].id]:84,[s3[6].id]:53,[s3[7].id]:67,[s3[8].id]:93,[s3[9].id]:72,
      },
      [E4]: {
        [s3[0].id]:83,[s3[1].id]:69,[s3[2].id]:90,[s3[3].id]:55,[s3[4].id]:66,
        [s3[5].id]:79,[s3[6].id]:48,[s3[7].id]:62,[s3[8].id]:87,[s3[9].id]:70,
      },
      [E5]: {
        [s3[0].id]:86,[s3[1].id]:74,[s3[2].id]:93,[s3[3].id]:63,[s3[4].id]:70,
        [s3[5].id]:82,[s3[6].id]:52,[s3[7].id]:68,[s3[8].id]:90,[s3[9].id]:73,
      },
      [E6]: { // فقط 7 طلاب مسجلين في C3
        [s3[0].id]:91,[s3[1].id]:77,[s3[2].id]:98,[s3[3].id]:65,[s3[4].id]:72,
        [s3[5].id]:85,[s3[6].id]:58,
      },
      [E7]: {
        [s2[0].id]:75,[s2[1].id]:68,[s2[2].id]:82,[s2[3].id]:55,[s2[4].id]:78,
        [s2[5].id]:70,[s2[6].id]:50,[s2[7].id]:65,[s2[8].id]:88,
      },
      [E8]: {
        [s2[0].id]:80,[s2[1].id]:72,[s2[2].id]:85,[s2[3].id]:60,[s2[4].id]:73,
        [s2[5].id]:67,[s2[6].id]:55,[s2[7].id]:70,[s2[8].id]:90,
      },
      [E9]: {
        [s2[0].id]:77,[s2[1].id]:65,[s2[2].id]:88,[s2[3].id]:58,[s2[4].id]:71,
        [s2[5].id]:74,[s2[6].id]:52,[s2[7].id]:68,[s2[8].id]:85,
      },
      [E10]: {
        [s1[0].id]:80,[s1[1].id]:65,[s1[2].id]:88,[s1[3].id]:52,[s1[4].id]:75,[s1[5].id]:60,
      },
    };

    // مدة كل امتحان
    const examDur = { [E1]:45,[E2]:60,[E3]:90,[E4]:50,[E5]:90,[E6]:60,[E7]:45,[E8]:45,[E9]:75,[E10]:45 };
    const examStart = { [E1]:-38,[E2]:-23,[E3]:-8,[E4]:-28,[E5]:-6,[E6]:-1,[E7]:-18,[E8]:-13,[E9]:-5,[E10]:-33 };

    for (const [eid, scores] of Object.entries(scoreMatrix)) {
      const dur = examDur[eid] || 60;
      const startDayOffset = examStart[eid] || -10;
      for (const [sid, score] of Object.entries(scores)) {
        const correct = Math.round(score / 10);
        const wrong   = 10 - correct;
        const pts     = score >= 50 ? Math.round(score / 4) : 0;
        const answers = {};
        for (let i = 1; i <= 10; i++) answers[i] = i <= correct ? 'a' : 'b';
        const startTime = new Date(Date.now() + startDayOffset * 86400000);
        const endTime   = new Date(startTime.getTime() + dur * 60000);
        await client.query(
          `INSERT INTO exam_results
            (student_id,exam_id,score,correct_count,wrong_count,unanswered_count,start_time,end_time,answers,points_earned,essay_graded)
           VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8,$9,true)`,
          [sid, eid, score, correct, wrong, startTime, endTime, JSON.stringify(answers), pts]
        );
      }
    }
    console.log('✅ نتائج الامتحانات أضيفت');

    // ─── 11. الشارات ─────────────────────────────────────────────────────────
    const passedQ = await client.query(`
      SELECT er.student_id, er.exam_id, e.badge_name, e.badge_color, e.pass_score
      FROM exam_results er
      JOIN exams e ON e.id = er.exam_id
      WHERE er.score >= e.pass_score AND e.badge_name IS NOT NULL
    `);
    for (const r of passedQ.rows) {
      await client.query(
        `INSERT INTO badges (student_id,exam_id,badge_name,badge_color) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [r.student_id, r.exam_id, r.badge_name, r.badge_color]
      );
    }
    console.log('✅ الشارات:', passedQ.rows.length);

    // ─── 12. تقدم مشاهدة الفيديوهات ──────────────────────────────────────────
    const vidProgress = [
      // ثالثة → فيديوهات C1,C2,C3
      { stds: s3, courses: [C1, C2, C3] },
      // ثانية → فيديوهات C4,C5
      { stds: s2, courses: [C4, C5] },
      // أولى → فيديوهات C6
      { stds: s1, courses: [C6] },
    ];

    for (const { stds, courses } of vidProgress) {
      const courseVids = allVids.filter(v => courses.includes(v.course_id));
      for (const s of stds) {
        // كل طالب شاهد نسبة مختلفة من الفيديوهات
        const watchRatio = 0.4 + Math.random() * 0.6; // 40% - 100% من الفيديوهات
        const shuffled = [...courseVids].sort(() => Math.random() - 0.5);
        const toWatch  = shuffled.slice(0, Math.ceil(shuffled.length * watchRatio));
        for (const v of toWatch) {
          const pct  = Math.floor(Math.random() * 101);
          const mins = Math.floor(pct * 0.5);
          const cnt  = pct > 80 ? 2 : 1;
          await client.query(
            `INSERT INTO video_progress (student_id,video_id,watch_count,watched_minutes,progress_percentage)
             VALUES ($1,$2,$3,$4,$5) ON CONFLICT (student_id,video_id) DO NOTHING`,
            [s.id, v.id, cnt, mins, pct]
          );
        }
      }
    }
    console.log('✅ تقدم الفيديوهات');

    // ─── 13. المدفوعات ───────────────────────────────────────────────────────
    const payRef = (prefix, i) => `${prefix}${String(1000 + i).padStart(5, '0')}`;
    let pi = 0;

    // ثالثة → C1,C2
    for (const s of s3) {
      await client.query(
        `INSERT INTO payments (student_id,course_id,amount,method,status,reference_number,notes,verified_by,verified_at)
         VALUES ($1,$2,400,'vodafone_cash','completed',$3,'دفع كورس رياضيات ثالثة ترم أول',$4,NOW()-INTERVAL'${5+pi} days')`,
        [s.id, C1, payRef('VC', pi++), A1]
      );
      await client.query(
        `INSERT INTO payments (student_id,course_id,amount,method,status,reference_number,notes,verified_by,verified_at)
         VALUES ($1,$2,400,'instapay','completed',$3,'دفع كورس رياضيات ثالثة ترم ثاني',$4,NOW()-INTERVAL'${3+pi} days')`,
        [s.id, C2, payRef('IP', pi++), A2]
      );
    }
    // 7 من ثالثة → C3
    for (const s of s3.slice(0, 7)) {
      await client.query(
        `INSERT INTO payments (student_id,course_id,amount,method,status,reference_number,notes,verified_by,verified_at)
         VALUES ($1,$2,300,'vodafone_cash','completed',$3,'دفع كورس المراجعة النهائية',$4,NOW()-INTERVAL'${pi} days')`,
        [s.id, C3, payRef('VC', pi++), A1]
      );
    }
    // ثانية → C4
    for (const s of s2) {
      const method = pi % 2 === 0 ? 'vodafone_cash' : 'instapay';
      await client.query(
        `INSERT INTO payments (student_id,course_id,amount,method,status,reference_number,notes,verified_by,verified_at)
         VALUES ($1,$2,300,$3,'completed',$4,'دفع كورس رياضيات ثانية ترم أول',$5,NOW()-INTERVAL'${2+pi} days')`,
        [s.id, C4, method, payRef(method === 'vodafone_cash' ? 'VC' : 'IP', pi++), A2]
      );
    }
    // 6 من ثانية → C5
    for (const s of s2.slice(0, 6)) {
      await client.query(
        `INSERT INTO payments (student_id,course_id,amount,method,status,reference_number,notes)
         VALUES ($1,$2,300,'vodafone_cash','pending',$3,'في انتظار التحقق')`,
        [s.id, C5, payRef('VC', pi++)]
      );
    }
    // أولى → C6
    for (const s of s1) {
      const status = s1.indexOf(s) < 4 ? 'completed' : 'pending';
      await client.query(
        `INSERT INTO payments (student_id,course_id,amount,method,status,reference_number,notes${status === 'completed' ? ',verified_by,verified_at' : ''})
         VALUES ($1,$2,250,'instapay',$3,$4,'دفع كورس أول ثانوي تأسيس'${status === 'completed' ? ',$5,NOW()' : ''})`,
        status === 'completed'
          ? [s.id, C6, status, payRef('IP', pi++), A1]
          : [s.id, C6, status, payRef('IP', pi++)]
      );
    }
    console.log('✅ المدفوعات:', pi);

    // ─── 14. سجل الإشعارات ───────────────────────────────────────────────────
    const notifData = [
      [TID, s3[0].id, '+2012001', 'student', 'مبروك يا علي! 🎉 حصلت على 90/100 في امتحان المصفوفات وكسبت شارة نجم المصفوفات', 'exam_result', true],
      [TID, s3[2].id, '+2012005', 'student', 'أحسنت يا يوسف! حصلت على أعلى درجة في الفصل 95/100 🏆 أنت فخر المجموعة', 'exam_result', true],
      [TID, s3[6].id, '+2012013', 'student', 'يا حسن، درجتك في امتحان المصفوفات 55/100. أنت قريب من النجاح، راجع الدروس وتعال لساعة إضافية', 'exam_result', false],
      [TID, s3[0].id, '+2012002', 'parent',  'حضرة ولي أمر الطالب علي محمد، ابنك حقق 88/100 في امتحان التفاضل. نتمنى له مزيداً من التفوق', 'parent_report', true],
      [TID, s3[4].id, '+2012010', 'parent',  'حضرة ولي أمر الطالب عمر سامي، تذكير بموعد امتحان نهاية الترم يوم الخميس القادم. يُرجى الاستعداد الجيد', 'reminder', false],
      [TID, s2[0].id, '+2012021', 'student', 'تم تسجيلك بنجاح في كورس رياضيات الصف الثاني ترم أول. موعد أول درس السبت القادم', 'enrollment', true],
      [TID, s2[3].id, '+2012027', 'student', 'لينا، يُرجى إتمام دفع رسوم كورس ترم ثاني قبل نهاية الأسبوع لضمان الاستمرار في الكورس', 'payment', false],
      [TID, s3[5].id, '+2012011', 'student', 'هناء، ممتازة! كسبت شارة "خبير التفاضل" بعد حصولك على 80/100 في امتحان التفاضل 🌟', 'badge', true],
      [TID, s1[2].id, '+2012043', 'student', 'طارق، أداؤك في تحسن مستمر! حصلت على 88/100 في امتحان التأسيس. استمر هكذا 💪', 'exam_result', false],
      [TID, s3[8].id, '+2012017', 'student', 'خالد، تهانينا! احتللت المركز الثاني في نتائج امتحان نهاية الترم الأول بـ 93/100 🥈', 'exam_result', true],
      [TID, s2[8].id, '+2012038', 'parent',  'حضرة ولي أمر الطالب عمرو حامد، ابنك حقق 85/100 في امتحان حساب المثلثات. نتمنى له الاستمرار', 'parent_report', false],
      [TID, s1[3].id, '+2012045', 'student', 'هنا، لاحظت أنك لم تشاهدي بعض الفيديوهات. يُرجى مشاهدة دروس الهندسة الأساسية قبل الامتحان', 'reminder', false],
    ];

    for (const [tid, sid, phone, rtype, msg, type, isRead] of notifData) {
      await client.query(
        `INSERT INTO notification_log (teacher_id,student_id,recipient_phone,recipient_type,message,type,is_read)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [tid, sid, phone, rtype, msg, type, isRead]
      );
    }
    console.log('✅ الإشعارات:', notifData.length);

    // ─── 15. طلبات الانتساب المعلقة ──────────────────────────────────────────
    await client.query(
      `INSERT INTO course_enrollment_requests (student_id,course_id,status,message)
       VALUES ($1,$2,'pending','أود الالتحاق بكورس المراجعة النهائية لتعزيز فرصي في الثانوية')
       ON CONFLICT DO NOTHING`,
      [s3[9].id, C3]
    );
    await client.query(
      `INSERT INTO course_enrollment_requests (student_id,course_id,status,message)
       VALUES ($1,$2,'pending','أرجو قبول طلبي في كورس الترم الثاني')
       ON CONFLICT DO NOTHING`,
      [s2[7].id, C5]
    );
    await client.query(
      `INSERT INTO course_enrollment_requests (student_id,course_id,status,message)
       VALUES ($1,$2,'approved','تم قبول طلبي شكراً')
       ON CONFLICT DO NOTHING`,
      [s2[6].id, C5]
    );
    console.log('✅ طلبات الانتساب');

    // ─── الملخص النهائي ───────────────────────────────────────────────────────
    const counts = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM teachers)                    AS معلمون,
        (SELECT COUNT(*) FROM assistants)                  AS مساعدون,
        (SELECT COUNT(*) FROM students)                    AS طلاب,
        (SELECT COUNT(*) FROM courses)                     AS كورسات,
        (SELECT COUNT(*) FROM sections)                    AS أقسام,
        (SELECT COUNT(*) FROM videos)                      AS فيديوهات,
        (SELECT COUNT(*) FROM pdf_files)                   AS ملفات_pdf,
        (SELECT COUNT(*) FROM exams)                       AS امتحانات,
        (SELECT COUNT(*) FROM questions)                   AS أسئلة,
        (SELECT COUNT(*) FROM exam_results)                AS نتائج,
        (SELECT COUNT(*) FROM badges)                      AS شارات,
        (SELECT COUNT(*) FROM payments)                    AS مدفوعات,
        (SELECT COUNT(*) FROM student_course_enrollment)   AS تسجيلات,
        (SELECT COUNT(*) FROM video_progress)              AS تقدم_فيديو,
        (SELECT COUNT(*) FROM notification_log)            AS اشعارات
    `);

    console.log('\n🎉 تم إدخال البيانات التجريبية الشاملة!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const row = counts.rows[0];
    for (const [k, v] of Object.entries(row)) {
      console.log(`  ${k.padEnd(15)} → ${v}`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('بيانات الدخول:');
    console.log('  المعلم: admin / admin123');
    console.log('  المساعدون: asst_nour | asst_karim | asst_heba / 123456');
    console.log('  الطلاب: std_ali | std_fatma | std_youssef ... / 123456');

  } catch (err) {
    console.error('❌ خطأ:', err.message);
    console.error(err.stack);
  } finally {
    client.release();
    process.exit(0);
  }
}

seed();
