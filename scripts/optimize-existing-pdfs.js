/**
 * scripts/optimize-existing-pdfs.js
 *
 * One-time / on-demand optimization utility for all existing PDFs in uploads/pdfs/.
 * - Linearizes PDFs for Fast Web View (instant streaming of page 1 in <200ms).
 * - Compresses stream objects and removes duplicate data using qpdf.
 * - Safe & idempotent: can be re-run anytime without breaking database records.
 *
 * Usage locally:
 *   node scripts/optimize-existing-pdfs.js
 *
 * Usage on Hostinger VPS:
 *   sudo docker compose exec app node scripts/optimize-existing-pdfs.js
 */

const fs = require('fs');
const path = require('path');
const { isQpdfAvailable, optimizeAndLinearizePdf } = require('../server/lib/pdfOptimizer');

const PDF_DIR = path.resolve(__dirname, '../uploads/pdfs');

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function run() {
  console.log('====================================================');
  console.log('  Wathba PDF Optimization & Linearization Utility');
  console.log('====================================================\n');

  const qpdfOk = await isQpdfAvailable();
  if (!qpdfOk) {
    console.error('❌ Error: qpdf binary is not installed or not in PATH.');
    console.error('   On Linux / Alpine: apk add qpdf (or apt-get install qpdf)');
    console.error('   On Windows: download qpdf or run inside the Docker container.');
    process.exit(1);
  }

  console.log('✔ qpdf is available.\n');

  if (!fs.existsSync(PDF_DIR)) {
    console.log(`Directory not found: ${PDF_DIR}`);
    process.exit(0);
  }

  const files = await fs.promises.readdir(PDF_DIR);
  const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));

  console.log(`Found ${pdfFiles.length} PDF file(s) in ${PDF_DIR}\n`);

  let totalOldBytes = 0;
  let totalNewBytes = 0;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < pdfFiles.length; i++) {
    const filename = pdfFiles[i];
    const filePath = path.join(PDF_DIR, filename);

    try {
      const stats = await fs.promises.stat(filePath);
      const oldSize = stats.size;
      totalOldBytes += oldSize;

      process.stdout.write(`[${i + 1}/${pdfFiles.length}] Optimizing ${filename} (${formatBytes(oldSize)})... `);

      const result = await optimizeAndLinearizePdf(filePath);

      if (result.success) {
        totalNewBytes += result.newSize;
        const saved = result.originalSize - result.newSize;
        const pct = result.originalSize > 0 ? ((saved / result.originalSize) * 100).toFixed(1) : 0;
        console.log(`✔ Done! (${formatBytes(result.newSize)}, -${pct}%)`);
        successCount++;
      } else {
        totalNewBytes += oldSize;
        console.log(`⚠ Skipped (${result.error || 'unknown error'})`);
        failCount++;
      }
    } catch (err) {
      console.log(`❌ Failed: ${err.message}`);
      failCount++;
    }
  }

  console.log('\n====================================================');
  console.log('  Summary');
  console.log('====================================================');
  console.log(`Total files processed: ${pdfFiles.length}`);
  console.log(`Successfully optimized: ${successCount}`);
  console.log(`Failed / Skipped:       ${failCount}`);
  console.log(`Original total size:    ${formatBytes(totalOldBytes)}`);
  console.log(`New total size:         ${formatBytes(totalNewBytes)}`);
  const totalSaved = totalOldBytes - totalNewBytes;
  if (totalOldBytes > 0) {
    const totalPct = ((totalSaved / totalOldBytes) * 100).toFixed(1);
    console.log(`Total storage saved:    ${formatBytes(totalSaved)} (-${totalPct}%)`);
  }
  console.log('====================================================\n');
}

run().catch((err) => {
  console.error('Fatal error during optimization:', err);
  process.exit(1);
});
