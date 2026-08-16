/**
 * scripts/optimize-existing-images.js
 *
 * One-time optimization utility for all existing question images.
 * - Resizes and compresses heavy .webp images down to ~50-80KB.
 * - Converts legacy PNG/JPG images to WebP and updates database URLs.
 * - Safe & idempotent: can be re-run without breaking data.
 *
 * Usage:
 *   node scripts/optimize-existing-images.js
 * Or on VPS:
 *   sudo docker compose exec app node scripts/optimize-existing-images.js
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pool = require('../server/db/connection');

const QUESTION_IMG_DIR = path.resolve(__dirname, '../uploads/question-images');

async function optimizeImages() {
  console.log('====================================================');
  console.log('  Wathba Image Optimization Utility');
  console.log('====================================================\n');

  if (!fs.existsSync(QUESTION_IMG_DIR)) {
    console.log(`Directory not found: ${QUESTION_IMG_DIR}`);
    process.exit(0);
  }

  const files = await fs.promises.readdir(QUESTION_IMG_DIR);
  console.log(`Found ${files.length} files in ${QUESTION_IMG_DIR}\n`);

  let totalOldBytes = 0;
  let totalNewBytes = 0;
  let optimizedCount = 0;
  let convertedCount = 0;
  let skippedCount = 0;

  for (const filename of files) {
    const filePath = path.join(QUESTION_IMG_DIR, filename);
    const stats = await fs.promises.stat(filePath);
    if (!stats.isFile()) continue;

    const oldSize = stats.size;
    totalOldBytes += oldSize;

    const ext = path.extname(filename).toLowerCase();
    const baseName = path.basename(filename, ext);

    try {
      if (ext === '.webp') {
        // If webp is already small (< 120KB), skip
        if (oldSize < 120 * 1024) {
          totalNewBytes += oldSize;
          skippedCount++;
          continue;
        }

        // Re-compress & downscale large WebP
        const tempPath = path.join(QUESTION_IMG_DIR, `${baseName}_opt_tmp.webp`);
        await sharp(filePath)
          .rotate()
          .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 80, effort: 4 })
          .toFile(tempPath);

        const newStats = await fs.promises.stat(tempPath);
        if (newStats.size < oldSize) {
          await fs.promises.rename(tempPath, filePath);
          totalNewBytes += newStats.size;
          optimizedCount++;
          console.log(`[OPTIMIZED] ${filename}: ${(oldSize / 1024).toFixed(1)} KB -> ${(newStats.size / 1024).toFixed(1)} KB`);
        } else {
          await fs.promises.unlink(tempPath);
          totalNewBytes += oldSize;
          skippedCount++;
        }
      } else if (['.png', '.jpg', '.jpeg'].includes(ext)) {
        // Convert legacy PNG/JPG to WebP
        const newFilename = `${baseName}.webp`;
        const newFilePath = path.join(QUESTION_IMG_DIR, newFilename);

        await sharp(filePath)
          .rotate()
          .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 80, effort: 4 })
          .toFile(newFilePath);

        const newStats = await fs.promises.stat(newFilePath);
        totalNewBytes += newStats.size;

        // Update database references
        const oldUrl = `/uploads/question-images/${filename}`;
        const newUrl = `/uploads/question-images/${newFilename}`;

        await pool.query('UPDATE questions SET question_image_url = $1 WHERE question_image_url = $2', [newUrl, oldUrl]);
        await pool.query('UPDATE bank_questions SET question_image_url = $1 WHERE question_image_url = $2', [newUrl, oldUrl]);
        await pool.query('UPDATE recitation_questions SET question_image_url = $1 WHERE question_image_url = $2', [newUrl, oldUrl]);

        // Safely remove old PNG/JPG
        await fs.promises.unlink(filePath);
        convertedCount++;
        console.log(`[CONVERTED] ${filename} -> ${newFilename}: ${(oldSize / 1024).toFixed(1)} KB -> ${(newStats.size / 1024).toFixed(1)} KB`);
      } else {
        totalNewBytes += oldSize;
        skippedCount++;
      }
    } catch (err) {
      console.error(`[ERROR] Failed to process ${filename}:`, err.message);
      totalNewBytes += oldSize;
    }
  }

  const savedBytes = totalOldBytes - totalNewBytes;
  const savedPercent = totalOldBytes > 0 ? ((savedBytes / totalOldBytes) * 100).toFixed(1) : '0';

  console.log('\n====================================================');
  console.log('  Optimization Summary');
  console.log('====================================================');
  console.log(`- Converted from PNG/JPG: ${convertedCount}`);
  console.log(`- Re-compressed WebP:     ${optimizedCount}`);
  console.log(`- Already optimal/skipped:${skippedCount}`);
  console.log(`- Original total size:    ${(totalOldBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`- New total size:         ${(totalNewBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`- Saved bandwidth/disk:   ${(savedBytes / (1024 * 1024)).toFixed(2)} MB (${savedPercent}%)`);
  console.log('====================================================\n');

  await pool.end();
}

optimizeImages().catch((err) => {
  console.error('Fatal error during optimization:', err);
  process.exit(1);
});
