/**
 * scratch/test-pdf-optimizer.js
 *
 * Automated verification and edge-case test suite for pdfOptimizer.js & optimize-existing-pdfs.js.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  isQpdfAvailable,
  isFileValidPdf,
  optimizeAndLinearizePdf
} = require('../server/lib/pdfOptimizer');

const TEST_DIR = path.resolve(__dirname, 'test_pdf_sandbox');

function setupSandbox() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

function cleanupSandbox() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

function createDummyPdf(filePath, content = 'Hello World PDF Test') {
  // Minimal valid PDF structure
  const pdfData = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length ${content.length + 20} >>
stream
BT
/F1 12 Tf
72 712 Td
(${content}) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000200 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
${200 + content.length + 50}
%%EOF`;

  fs.writeFileSync(filePath, Buffer.from(pdfData, 'latin1'));
}

async function runTests() {
  console.log('====================================================');
  console.log('  Running PDF Optimizer Edge-Case Test Suite');
  console.log('====================================================\n');

  setupSandbox();

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    process.stdout.write(`Test ${total}: ${name}... `);
    try {
      await fn();
      console.log('✅ PASSED');
      passed++;
    } catch (err) {
      console.log(`❌ FAILED: ${err.message}`);
      console.error(err.stack);
    }
  }

  // ── Test 1: Validate PDF magic header check ──
  await test('isFileValidPdf accurately detects valid vs invalid PDF headers', async () => {
    const validPdfPath = path.join(TEST_DIR, 'valid.pdf');
    const fakePdfPath = path.join(TEST_DIR, 'fake.pdf');
    const emptyPdfPath = path.join(TEST_DIR, 'empty.pdf');

    createDummyPdf(validPdfPath, 'Valid Doc');
    fs.writeFileSync(fakePdfPath, 'NOT A REAL PDF FILE HEADER');
    fs.writeFileSync(emptyPdfPath, '');

    assert.strictEqual(await isFileValidPdf(validPdfPath), true, 'Valid PDF should return true');
    assert.strictEqual(await isFileValidPdf(fakePdfPath), false, 'Fake PDF should return false');
    assert.strictEqual(await isFileValidPdf(emptyPdfPath), false, 'Empty file should return false');
    assert.strictEqual(await isFileValidPdf(path.join(TEST_DIR, 'nonexistent.pdf')), false, 'Missing file should return false');
  });

  // ── Test 2: optimizeAndLinearizePdf with nonexistent file ──
  await test('optimizeAndLinearizePdf safely handles missing files', async () => {
    const missingPath = path.join(TEST_DIR, 'ghost.pdf');
    const res = await optimizeAndLinearizePdf(missingPath);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.linearized, false);
    assert.ok(res.error);
  });

  // ── Test 3: optimizeAndLinearizePdf with empty 0-byte file ──
  await test('optimizeAndLinearizePdf safely rejects empty 0-byte files', async () => {
    const emptyPath = path.join(TEST_DIR, 'zero_byte.pdf');
    fs.writeFileSync(emptyPath, '');
    const res = await optimizeAndLinearizePdf(emptyPath);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.linearized, false);
    assert.ok(res.error.includes('empty'));
  });

  // ── Test 4: optimizeAndLinearizePdf with corrupted file ──
  await test('optimizeAndLinearizePdf preserves corrupted files without deleting original', async () => {
    const corruptPath = path.join(TEST_DIR, 'corrupt.pdf');
    const originalContent = 'CORRUPTED DATA HERE %PDF- BUT INVALID BODY';
    fs.writeFileSync(corruptPath, originalContent);

    const res = await optimizeAndLinearizePdf(corruptPath);
    // Even if qpdf fails or is skipped, original file must remain intact
    assert.strictEqual(fs.existsSync(corruptPath), true);
    assert.strictEqual(fs.readFileSync(corruptPath, 'utf8'), originalContent);
  });

  // ── Test 5: Fallback behavior when qpdf is missing or present ──
  await test('optimizeAndLinearizePdf operates safely in fallback mode', async () => {
    const validPdfPath = path.join(TEST_DIR, 'lecture_notes.pdf');
    createDummyPdf(validPdfPath, 'Mathematics Lecture Notes Week 1');
    const initialSize = fs.statSync(validPdfPath).size;

    const res = await optimizeAndLinearizePdf(validPdfPath);
    assert.strictEqual(res.success, true);
    assert.strictEqual(fs.existsSync(validPdfPath), true);
    assert.ok(res.newSize > 0);
  });

  // ── Test 6: No orphan temporary files are left on disk ──
  await test('Temporary files are always cleaned up after execution', async () => {
    const files = fs.readdirSync(TEST_DIR);
    const tempFiles = files.filter(f => f.includes('_tmp_opt_'));
    assert.strictEqual(tempFiles.length, 0, 'There should be no leftover temp files');
  });

  cleanupSandbox();

  console.log('\n====================================================');
  console.log(`  Test Results: ${passed}/${total} passed (${passed === total ? '100% SUCCESS' : 'FAILURES DETECTED'})`);
  console.log('====================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
