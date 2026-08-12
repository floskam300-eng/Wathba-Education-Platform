const p = require('pg');
const c = new p.Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const r = await c.query("SELECT id, username, teacher_id, academic_stage, is_suspended FROM students WHERE username = 'std_rec_lock'");
  console.log('students:', r.rows);
  const t = await c.query("SELECT id, username, slug FROM teachers WHERE username = 'test_rec_lock_teacher'");
  console.log('teachers:', t.rows);
  await c.end();
})();
