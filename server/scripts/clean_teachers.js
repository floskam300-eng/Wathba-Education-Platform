/**
 * Cleanup script: Delete all teachers except "demo" (id: 1) and "alhusaini" (id: 12)
 * along with their database rows (cascade) and associated files on disk.
 */

const path = require('path');
const fs = require('fs');
const pool = require('../db/connection');

const PRESERVED_SLUGS = ['demo', 'alhusaini'];
const PRESERVED_IDS = [1, 12];

const UPLOADS_ROOT = path.resolve(__dirname, '../../uploads');
const SESSIONS_ROOT = path.resolve(__dirname, '../../whatsapp-sessions');

function extractSubQuestionImages(subQuestions) {
  if (!Array.isArray(subQuestions)) return [];
  return subQuestions
    .map(sq => sq && sq.image_url)
    .filter(url => url && typeof url === 'string' && url.startsWith('/uploads/'));
}

function safeDeleteUploadFile(urlPath) {
  if (!urlPath || typeof urlPath !== 'string') return false;
  if (!urlPath.startsWith('/uploads/')) return false;
  try {
    const abs = path.resolve(__dirname, '../..', urlPath.slice(1));
    if (!abs.startsWith(UPLOADS_ROOT + path.sep)) return false;
    if (fs.existsSync(abs)) {
      fs.unlinkSync(abs);
      return true;
    }
  } catch (err) {
    console.warn(`[WARN] Failed to delete file ${urlPath}:`, err.message);
  }
  return false;
}

async function runCleanup() {
  console.log('=== Starting Teachers & Subdomains Cleanup ===');

  // 1. Safety Check: Ensure preserved teachers exist
  const preservedCheck = await pool.query(
    'SELECT id, name, username, slug FROM teachers WHERE id = ANY($1::int[]) OR slug = ANY($2::text[])',
    [PRESERVED_IDS, PRESERVED_SLUGS]
  );

  console.log('Preserved teachers found in DB:');
  preservedCheck.rows.forEach(t => console.log(`  [KEEP] ID: ${t.id} | Name: "${t.name}" | Username: "${t.username}" | Slug: "${t.slug}"`));

  if (preservedCheck.rows.length < 2) {
    throw new Error('Safety abort: Expected 2 preserved teachers (demo and alhusaini), but found ' + preservedCheck.rows.length);
  }

  // 2. Identify teachers to delete
  const teachersToDelete = await pool.query(
    'SELECT id, name, username, slug FROM teachers WHERE id != ALL($1::int[]) AND slug != ALL($2::text[]) ORDER BY id',
    [PRESERVED_IDS, PRESERVED_SLUGS]
  );

  if (teachersToDelete.rows.length === 0) {
    console.log('No extra teachers found to delete. System is already clean!');
    return;
  }

  console.log(`\nFound ${teachersToDelete.rows.length} teacher(s) to delete:`);
  teachersToDelete.rows.forEach(t => console.log(`  [DELETE] ID: ${t.id} | Name: "${t.name}" | Username: "${t.username}" | Slug: "${t.slug}"`));

  const deleteIds = teachersToDelete.rows.map(t => t.id);

  // 3. Collect preserved files to never delete them even if shared
  const preservedFiles = new Set();
  const [pTeachers, pTeam, pCourses, pPdfs, pExams, pBanks, pRecs] = await Promise.all([
    pool.query('SELECT logo_url, logo_wide_url, photo_url, background_image_url, hero_image_url FROM teachers WHERE id = ANY($1::int[])', [PRESERVED_IDS]),
    pool.query('SELECT photo_url FROM teacher_team_members WHERE teacher_id = ANY($1::int[])', [PRESERVED_IDS]),
    pool.query('SELECT thumbnail_url FROM courses WHERE teacher_id = ANY($1::int[])', [PRESERVED_IDS]),
    pool.query('SELECT pf.file_url FROM pdf_files pf JOIN courses c ON pf.course_id = c.id WHERE c.teacher_id = ANY($1::int[])', [PRESERVED_IDS]),
    pool.query('SELECT q.question_image_url, q.sub_questions FROM questions q JOIN exams e ON q.exam_id = e.id WHERE e.teacher_id = ANY($1::int[])', [PRESERVED_IDS]),
    pool.query('SELECT bq.question_image_url, bq.sub_questions FROM bank_questions bq JOIN question_banks qb ON bq.bank_id = qb.id WHERE qb.teacher_id = ANY($1::int[])', [PRESERVED_IDS]),
    pool.query('SELECT rq.question_image_url, rq.sub_questions FROM recitation_questions rq JOIN recitations r ON rq.recitation_id = r.id WHERE r.teacher_id = ANY($1::int[])', [PRESERVED_IDS]),
  ]);

  pTeachers.rows.forEach(r => [r.logo_url, r.logo_wide_url, r.photo_url, r.background_image_url, r.hero_image_url].forEach(u => u && preservedFiles.add(u)));
  pTeam.rows.forEach(r => r.photo_url && preservedFiles.add(r.photo_url));
  pCourses.rows.forEach(r => r.thumbnail_url && preservedFiles.add(r.thumbnail_url));
  pPdfs.rows.forEach(r => r.file_url && preservedFiles.add(r.file_url));
  pExams.rows.forEach(r => {
    if (r.question_image_url) preservedFiles.add(r.question_image_url);
    extractSubQuestionImages(r.sub_questions).forEach(u => preservedFiles.add(u));
  });
  pBanks.rows.forEach(r => {
    if (r.question_image_url) preservedFiles.add(r.question_image_url);
    extractSubQuestionImages(r.sub_questions).forEach(u => preservedFiles.add(u));
  });
  pRecs.rows.forEach(r => {
    if (r.question_image_url) preservedFiles.add(r.question_image_url);
    extractSubQuestionImages(r.sub_questions).forEach(u => preservedFiles.add(u));
  });

  console.log(`\nPreserved files count: ${preservedFiles.size}`);

  // 4. Collect files to delete from target teachers
  const candidateFiles = new Set();
  const [dTeachers, dTeam, dCourses, dPdfs, dExams, dBanks, dRecs] = await Promise.all([
    pool.query('SELECT logo_url, logo_wide_url, photo_url, background_image_url, hero_image_url FROM teachers WHERE id = ANY($1::int[])', [deleteIds]),
    pool.query('SELECT photo_url FROM teacher_team_members WHERE teacher_id = ANY($1::int[])', [deleteIds]),
    pool.query('SELECT thumbnail_url FROM courses WHERE teacher_id = ANY($1::int[])', [deleteIds]),
    pool.query('SELECT pf.file_url FROM pdf_files pf JOIN courses c ON pf.course_id = c.id WHERE c.teacher_id = ANY($1::int[])', [deleteIds]),
    pool.query('SELECT q.question_image_url, q.sub_questions FROM questions q JOIN exams e ON q.exam_id = e.id WHERE e.teacher_id = ANY($1::int[])', [deleteIds]),
    pool.query('SELECT bq.question_image_url, bq.sub_questions FROM bank_questions bq JOIN question_banks qb ON bq.bank_id = qb.id WHERE qb.teacher_id = ANY($1::int[])', [deleteIds]),
    pool.query('SELECT rq.question_image_url, rq.sub_questions FROM recitation_questions rq JOIN recitations r ON rq.recitation_id = r.id WHERE r.teacher_id = ANY($1::int[])', [deleteIds]),
  ]);

  dTeachers.rows.forEach(r => [r.logo_url, r.logo_wide_url, r.photo_url, r.background_image_url, r.hero_image_url].forEach(u => u && candidateFiles.add(u)));
  dTeam.rows.forEach(r => r.photo_url && candidateFiles.add(r.photo_url));
  dCourses.rows.forEach(r => r.thumbnail_url && candidateFiles.add(r.thumbnail_url));
  dPdfs.rows.forEach(r => r.file_url && candidateFiles.add(r.file_url));
  dExams.rows.forEach(r => {
    if (r.question_image_url) candidateFiles.add(r.question_image_url);
    extractSubQuestionImages(r.sub_questions).forEach(u => candidateFiles.add(u));
  });
  dBanks.rows.forEach(r => {
    if (r.question_image_url) candidateFiles.add(r.question_image_url);
    extractSubQuestionImages(r.sub_questions).forEach(u => candidateFiles.add(u));
  });
  dRecs.rows.forEach(r => {
    if (r.question_image_url) candidateFiles.add(r.question_image_url);
    extractSubQuestionImages(r.sub_questions).forEach(u => candidateFiles.add(u));
  });

  const filesToDelete = Array.from(candidateFiles).filter(f => !preservedFiles.has(f));
  console.log(`Candidate files to delete: ${candidateFiles.size} (${filesToDelete.length} unique to deleted teachers, ${candidateFiles.size - filesToDelete.length} shared/preserved)`);

  // 5. Delete physical files from disk
  let deletedFilesCount = 0;
  for (const fileUrl of filesToDelete) {
    if (safeDeleteUploadFile(fileUrl)) {
      deletedFilesCount++;
    }
  }
  console.log(`Deleted ${deletedFilesCount} physical files from disk.`);

  // 6. Delete WhatsApp session directories
  for (const tId of deleteIds) {
    const sessionDir = path.join(SESSIONS_ROOT, String(tId));
    if (fs.existsSync(sessionDir)) {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log(`Removed WhatsApp session dir for teacher ${tId}`);
      } catch (err) {
        console.warn(`Could not remove WhatsApp session dir for teacher ${tId}:`, err.message);
      }
    }
  }

  // 7. Execute Database Deletions
  console.log('\nExecuting database cascade delete...');
  const deleteResult = await pool.query(
    'DELETE FROM teachers WHERE id = ANY($1::int[])',
    [deleteIds]
  );
  console.log(`Successfully deleted ${deleteResult.rowCount} teacher row(s) from database.`);

  // 8. Clean up orphan payments if any
  const orphanPayments = await pool.query(
    'DELETE FROM payments WHERE student_id IS NULL OR student_id NOT IN (SELECT id FROM students)'
  );
  if (orphanPayments.rowCount > 0) {
    console.log(`Cleaned up ${orphanPayments.rowCount} orphan payment record(s).`);
  }

  // 9. Invalidate caches
  try {
    const subdomainTenant = require('../middleware/subdomainTenant');
    teachersToDelete.rows.forEach(t => {
      if (subdomainTenant && typeof subdomainTenant.invalidateCache === 'function') {
        subdomainTenant.invalidateCache(t.slug);
      }
    });
    console.log('Subdomain tenant caches invalidated.');
  } catch (err) {
    console.warn('Cache invalidation warning:', err.message);
  }

  // 10. Reclaim PostgreSQL storage (VACUUM ANALYZE)
  console.log('\nRunning VACUUM ANALYZE to reclaim disk space in PostgreSQL...');
  await pool.query('VACUUM ANALYZE');
  console.log('VACUUM ANALYZE complete.');

  // 11. Final verification
  const finalTeachers = await pool.query('SELECT id, name, username, slug, (SELECT COUNT(*) FROM students WHERE teacher_id = teachers.id) as students FROM teachers ORDER BY id');
  console.log('\n=== Final Teachers Remaining in Platform ===');
  finalTeachers.rows.forEach(t => console.log(`  ID: ${t.id} | Name: "${t.name}" | Username: "${t.username}" | Slug: "${t.slug}" | Students: ${t.students}`));

  console.log('\n=== Cleanup Finished Successfully ===');
}

runCleanup()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Cleanup failed with error:', err);
    process.exit(1);
  });
