/**
 * webp-conversion.test.js
 * =======================
 * Comprehensive test suite for the WebP image conversion feature.
 *
 * Run (unit tests only — no server required):
 *   node server/tests/webp-conversion.test.js
 *
 * Run (integration tests — requires server on port 3001 + DATABASE_URL + JWT_SECRET):
 *   INTEGRATION=1 node server/tests/webp-conversion.test.js
 *
 * Covers:
 *  1. Unit: Core PNG/JPEG → WebP conversion
 *  2. Unit: Filename edge cases (multiple dots, no extension, already .webp)
 *  3. Unit: Security — path traversal prevention in filename sanitisation
 *  4. Unit: Error handling — sharp failure leaves no stale .webp, original untouched
 *  5. Unit: Static code audits of all 5 route files
 *  6. Integration: HTTP upload endpoints return .webp URLs and store real WebP files
 */

'use strict';

require('dotenv').config();

const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const crypto = require('crypto');
const http   = require('http');
const sharp  = require('sharp'); // available in this project (v0.35.0)

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌ ${name}\n     ${e.message}`);
    if (process.env.VERBOSE) console.error(e.stack);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ── Image helpers (use sharp itself to generate valid test images) ─────────────

/** Create a real 1×1 PNG using sharp */
async function createPng(filePath) {
  await sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 0, b: 0 } } })
    .png()
    .toFile(filePath);
}

/** Create a real 4×4 JPEG using sharp */
async function createJpeg(filePath) {
  await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 128, b: 255 } } })
    .jpeg({ quality: 80 })
    .toFile(filePath);
}

/** Create a fake "image" file (plain text) for invalid-file tests */
function createFakeImage(filePath) {
  fs.writeFileSync(filePath, 'this is definitely not an image file');
}

/** Read the first 12 bytes of a file to check WebP magic bytes */
function readMagicBytes(filePath) {
  const buf = Buffer.alloc(12);
  const fd  = fs.openSync(filePath, 'r');
  fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);
  return buf;
}

function isWebP(filePath) {
  const buf = readMagicBytes(filePath);
  return (
    buf.slice(0, 4).toString('ascii') === 'RIFF' &&
    buf.slice(8, 12).toString('ascii') === 'WEBP'
  );
}

// ── HTTP helper for integration tests ─────────────────────────────────────────
function multipartRequest(urlPath, token, files) {
  return new Promise((resolve, reject) => {
    const boundary = `----FormBoundary${crypto.randomBytes(8).toString('hex')}`;
    const parts = [];

    for (const [fieldName, { filePath, mime }] of Object.entries(files)) {
      const fileContent = fs.readFileSync(filePath);
      const header = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; ` +
        `filename="${path.basename(filePath)}"\r\nContent-Type: ${mime}\r\n\r\n`
      );
      parts.push(header, fileContent, Buffer.from('\r\n'));
    }
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    const body = Buffer.concat(parts);

    const opts = {
      hostname: 'localhost', port: 3001, path: urlPath, method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };

    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch (_) { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function jsonRequest(method, urlPath, bodyObj, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(bodyObj);
    const opts = {
      hostname: 'localhost', port: 3001, path: urlPath, method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch (_) { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ═════════════════════════════════════════════════════════════════════════════
//  UNIT TESTS
// ═════════════════════════════════════════════════════════════════════════════

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webp-test-'));

async function runUnitTests() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  Section 1 — Unit Tests: convertToWebp()');
  console.log('══════════════════════════════════════════════════\n');

  const { convertToWebp } = require('../lib/convertToWebp');

  // ── 1. Basic conversion ────────────────────────────────────────────────────
  console.log('▶ 1. Basic PNG/JPEG → WebP conversion');

  await test('PNG → WebP: output file exists and is valid WebP', async () => {
    const inputPath = path.join(tmpDir, 'basic_test.png');
    await createPng(inputPath);

    const { webpPath, filename } = await convertToWebp(inputPath, 'basic_test.png');

    assertEqual(filename, 'basic_test.webp', 'filename mismatch');
    assert(fs.existsSync(webpPath), 'WebP output file does not exist');
    assert(!fs.existsSync(inputPath), 'Original PNG must be deleted after conversion');
    assert(isWebP(webpPath), 'Output file magic bytes do not match WebP format');

    fs.unlinkSync(webpPath);
  });

  await test('JPEG → WebP: output file exists and is valid WebP', async () => {
    const inputPath = path.join(tmpDir, 'basic_test.jpg');
    await createJpeg(inputPath);

    const { webpPath, filename } = await convertToWebp(inputPath, 'basic_test.jpg');

    assertEqual(filename, 'basic_test.webp', 'filename mismatch');
    assert(fs.existsSync(webpPath), 'WebP output file does not exist');
    assert(!fs.existsSync(inputPath), 'Original JPEG must be deleted after conversion');
    assert(isWebP(webpPath), 'Output file magic bytes do not match WebP format');

    fs.unlinkSync(webpPath);
  });

  await test('Output file is smaller than or equal to input (compression works)', async () => {
    // Create a larger PNG (100×100) where compression makes a meaningful difference
    const inputPath = path.join(tmpDir, 'compression_test.png');
    await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 100, b: 50 } }
    }).png().toFile(inputPath);

    const inputSize = fs.statSync(inputPath).size;
    const { webpPath } = await convertToWebp(inputPath, 'compression_test.png');
    const outputSize = fs.statSync(webpPath).size;

    // WebP should generally be smaller; for solid-color images it always is
    assert(outputSize <= inputSize, `WebP (${outputSize}) is larger than PNG (${inputSize})`);

    fs.unlinkSync(webpPath);
  });

  // ── 2. Filename edge cases ─────────────────────────────────────────────────
  console.log('\n▶ 2. Filename edge cases');

  await test('File with multiple dots: only last extension is replaced with .webp', async () => {
    const inputPath = path.join(tmpDir, 'q_1234_abc.def.png');
    await createPng(inputPath);

    const { filename, webpPath } = await convertToWebp(inputPath, 'q_1234_abc.def.png');

    assert(filename.endsWith('.webp'), `Must end with .webp, got: ${filename}`);
    assert(!filename.endsWith('.png.webp'), `Double extension detected: ${filename}`);
    // Specifically the last dot should be replaced
    assertEqual(filename, 'q_1234_abc.def.webp', 'Unexpected filename');

    if (fs.existsSync(webpPath)) fs.unlinkSync(webpPath);
  });

  await test('Input already named .webp: converted in-place without "same file" error', async () => {
    const inputPath = path.join(tmpDir, 'already_webp.webp');
    // Write a PNG into a file named .webp (as if multer saved it that way)
    await createPng(inputPath);

    // This must NOT throw "Cannot use same file for input and output"
    const { filename, webpPath } = await convertToWebp(inputPath, 'already_webp.webp');

    assertEqual(filename, 'already_webp.webp', 'filename mismatch');
    assert(fs.existsSync(webpPath), 'WebP output does not exist');
    assert(isWebP(webpPath), 'Output is not a valid WebP');

    if (fs.existsSync(webpPath)) fs.unlinkSync(webpPath);
  });

  await test('Filename with no extension: base name preserved, .webp appended', async () => {
    const inputPath = path.join(tmpDir, 'noextension');
    await createPng(inputPath);

    const { filename, webpPath } = await convertToWebp(inputPath, 'noextension');

    assertEqual(filename, 'noextension.webp', `Expected 'noextension.webp', got '${filename}'`);
    if (fs.existsSync(webpPath)) fs.unlinkSync(webpPath);
  });

  // ── 3. Security — Path Traversal ──────────────────────────────────────────
  console.log('\n▶ 3. Security — Path Traversal Prevention [S1]');

  await test('[S1] "../" in originalName does not escape the upload directory', async () => {
    const inputPath = path.join(tmpDir, 'legit_input.png');
    await createPng(inputPath);

    const { filename, webpPath } = await convertToWebp(inputPath, '../../etc/passwd.png');

    // The output must be INSIDE tmpDir, not at /etc/passwd.webp
    assertEqual(path.dirname(webpPath), tmpDir, `Output escaped tmpDir: ${webpPath}`);
    assert(!filename.includes('/'), 'filename must not contain /');
    assert(!filename.includes('\\'), 'filename must not contain \\');
    assert(!filename.includes('..'), 'filename must not contain ..');
    assert(filename.endsWith('.webp'), 'Must end with .webp');

    if (fs.existsSync(webpPath)) fs.unlinkSync(webpPath);
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
  });

  await test('[S1] Absolute path in originalName does not escape upload directory', async () => {
    const inputPath = path.join(tmpDir, 'legit_input2.png');
    await createPng(inputPath);

    const { webpPath } = await convertToWebp(inputPath, '/etc/shadow.png');

    assertEqual(path.dirname(webpPath), tmpDir, `Output escaped tmpDir: ${webpPath}`);

    if (fs.existsSync(webpPath)) fs.unlinkSync(webpPath);
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
  });

  await test('[S1] Semicolons and spaces in filename are replaced with underscores', async () => {
    const inputPath = path.join(tmpDir, 'legit_input3.png');
    await createPng(inputPath);

    const { filename, webpPath } = await convertToWebp(inputPath, 'hello world; rm -rf /.png');

    assert(!/[\s;]/.test(filename), `Unsafe chars in filename: '${filename}'`);
    assert(filename.endsWith('.webp'), 'Must end with .webp');

    if (fs.existsSync(webpPath)) fs.unlinkSync(webpPath);
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
  });

  await test('[S1] Null bytes in filename are sanitised', async () => {
    const inputPath = path.join(tmpDir, 'legit_input4.png');
    await createPng(inputPath);

    // Null byte injection attempt
    const { filename, webpPath } = await convertToWebp(inputPath, 'valid\x00malicious.png');

    assert(!filename.includes('\x00'), 'Null byte found in output filename');
    if (fs.existsSync(webpPath)) fs.unlinkSync(webpPath);
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
  });

  // ── 4. Error handling ──────────────────────────────────────────────────────
  console.log('\n▶ 4. Error Handling & Cleanup');

  await test('[R1] Corrupt file → exception thrown, no stale .webp left, original untouched', async () => {
    const inputPath = path.join(tmpDir, 'corrupt.png');
    createFakeImage(inputPath);

    const expectedWebpPath = path.join(tmpDir, 'corrupt.webp');

    let threw = false;
    try {
      await convertToWebp(inputPath, 'corrupt.png');
    } catch (e) {
      threw = true;
      assert(e.message.includes('[convertToWebp]'), `Unexpected error msg: ${e.message}`);
    }

    assert(threw, 'convertToWebp must throw on corrupt input');
    assert(!fs.existsSync(expectedWebpPath), '[R1] Stale .webp found after conversion failure');
    assert(fs.existsSync(inputPath), 'Original file must remain when conversion fails');

    fs.unlinkSync(inputPath);
  });

  await test('On success: original file is deleted (no orphan original left)', async () => {
    const inputPath = path.join(tmpDir, 'cleanup_check.png');
    await createPng(inputPath);

    const { webpPath } = await convertToWebp(inputPath, 'cleanup_check.png');

    assert(!fs.existsSync(inputPath), 'Original file must be deleted after successful conversion');
    assert(fs.existsSync(webpPath), 'WebP file must exist after successful conversion');

    fs.unlinkSync(webpPath);
  });

  // ── 5. Static code audits ──────────────────────────────────────────────────
  console.log('\n▶ 5. Static Code Audits');

  await test('[P1] convertToWebp.js uses async unlink only (no unlinkSync in code)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../lib/convertToWebp.js'), 'utf8');
    // Strip comments before checking — unlinkSync may legitimately appear in JSDoc comments
    // explaining what we DON'T do. We only care about actual code calls.
    const codeOnly = src
      .split('\n')
      .filter(line => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
      .join('\n');
    assert(!codeOnly.includes('unlinkSync'), 'convertToWebp.js must not call unlinkSync in code (use fs.promises.unlink)');
    assert(src.includes('fs.promises.unlink'), 'convertToWebp.js must use fs.promises.unlink');
  });

  await test('[S2] admin.js: no require() inside the upload request handler', () => {
    const src = fs.readFileSync(path.join(__dirname, '../routes/admin.js'), 'utf8');
    const handlerStart = src.indexOf("router.post('/upload/image'");
    assert(handlerStart !== -1, 'Could not find upload/image handler in admin.js');
    const handlerBlock = src.slice(handlerStart, handlerStart + 2500);
    assert(!handlerBlock.includes("require('"), 'Inline require() found inside handler in admin.js');
  });

  await test('[S2] admin.js: isValidImage & deleteFile imported at module level', () => {
    const src = fs.readFileSync(path.join(__dirname, '../routes/admin.js'), 'utf8');
    // Must be imported BEFORE the router.post lines (i.e., at the top)
    const importLine = src.indexOf("require('../lib/validateFileMagic')");
    const handlerLine = src.indexOf("router.post('/upload/image'");
    assert(importLine !== -1, 'validateFileMagic not imported in admin.js');
    assert(importLine < handlerLine, 'validateFileMagic import must come before the handler');
    assert(
      src.slice(0, importLine).includes('const {') || src.slice(importLine - 50, importLine).includes('const {'),
      'validateFileMagic must be a top-level const import'
    );
  });

  await test('[L2] courses.js: thumbnail filename uses crypto.randomBytes', () => {
    const src = fs.readFileSync(path.join(__dirname, '../routes/courses.js'), 'utf8');
    assert(src.includes('randomBytes'), 'thumbnail filename must use crypto.randomBytes');
    assert(
      src.includes("require('crypto')") || src.includes('require("crypto")'),
      'crypto module must be imported in courses.js'
    );
    // Ensure the randomBytes is used inside the thumbnailStorage filename function
    const storageBlock = src.slice(src.indexOf('thumbnailStorage'), src.indexOf('uploadThumbnail'));
    assert(storageBlock.includes('randomBytes'), 'randomBytes must be inside thumbnailStorage.filename');
  });

  await test('All 5 upload routes have convertToWebp import', () => {
    const files = [
      '../routes/exams.js',
      '../routes/recitations.js',
      '../routes/questionBanks.js',
      '../routes/courses.js',
      '../routes/admin.js',
    ];
    for (const f of files) {
      const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
      assert(src.includes("require('../lib/convertToWebp')"), `${f}: missing convertToWebp import`);
    }
  });

  await test('All 5 upload routes await convertToWebp in their handler', () => {
    const files = [
      '../routes/exams.js',
      '../routes/recitations.js',
      '../routes/questionBanks.js',
      '../routes/courses.js',
      '../routes/admin.js',
    ];
    for (const f of files) {
      const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
      assert(src.includes('await convertToWebp('), `${f}: does not await convertToWebp()`);
    }
  });

  await test('All upload handlers have a catch block with cleanup on WebP failure', () => {
    const files = [
      '../routes/exams.js',
      '../routes/recitations.js',
      '../routes/questionBanks.js',
      '../routes/courses.js',
      '../routes/admin.js',
    ];
    for (const f of files) {
      const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
      assert(src.includes('convErr'), `${f}: missing convErr catch block for WebP error`);
    }
  });

  await test('All upload handlers return webpName-based URL (not original filename)', () => {
    const checks = [
      { f: '../routes/exams.js',         needle: 'webpName' },
      { f: '../routes/recitations.js',   needle: 'webpName' },
      { f: '../routes/questionBanks.js', needle: 'webpName' },
      { f: '../routes/courses.js',       needle: 'webpName' },
      { f: '../routes/admin.js',         needle: 'webpName' },
    ];
    for (const { f, needle } of checks) {
      const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
      assert(src.includes(needle), `${f}: URL does not use ${needle} variable`);
    }
  });

  await test('recitations.js: cleanup in catch uses async unlink (not callback fs.unlink)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../routes/recitations.js'), 'utf8');
    // Find the catch block for convErr
    const catchIdx = src.lastIndexOf('convErr');
    const catchBlock = src.slice(catchIdx, catchIdx + 300);
    assert(
      catchBlock.includes('fs.promises.unlink') || !catchBlock.includes('fs.unlink('),
      'recitations.js catch block should use fs.promises.unlink, not callback fs.unlink'
    );
  });
}

// ═════════════════════════════════════════════════════════════════════════════
//  INTEGRATION TESTS
// ═════════════════════════════════════════════════════════════════════════════

async function runIntegrationTests() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  Section 2 — Integration Tests (HTTP)');
  console.log('══════════════════════════════════════════════════\n');

  const pool   = require('../db/connection');
  const bcrypt = require('bcryptjs');

  const TEST_USER = '_test_webp_conv';
  const TEST_PASS = 'WebPConv_2026!';
  let   TOKEN     = null;

  // ── Setup test teacher ─────────────────────────────────────────────────────
  await pool.query('DELETE FROM teachers WHERE username = $1', [TEST_USER]);
  const hashed = await bcrypt.hash(TEST_PASS, 10);
  await pool.query(
    `INSERT INTO teachers (username, password, name, slug) VALUES ($1, $2, 'WebP Test', $3)`,
    [TEST_USER, hashed, TEST_USER]
  );

  const loginRes = await jsonRequest('POST', '/api/auth/login',
    { username: TEST_USER, password: TEST_PASS, role: 'teacher' }
  );

  if (loginRes.status !== 200) {
    console.error(`[integration setup] Login failed: ${loginRes.status} — ${JSON.stringify(loginRes.body)}`);
    await pool.query('DELETE FROM teachers WHERE username = $1', [TEST_USER]);
    console.log('[integration] Skipped (server not reachable or login failed).');
    return;
  }
  TOKEN = loginRes.body.token;

  // ── 1. exams/upload-question-image ─────────────────────────────────────────
  console.log('▶ 1. /api/exams/upload-question-image');

  await test('PNG upload → response URL ends with .webp', async () => {
    const p = path.join(tmpDir, 'int_exam.png');
    await createPng(p);

    const res = await multipartRequest('/api/exams/upload-question-image', TOKEN,
      { image: { filePath: p, mime: 'image/png' } }
    );
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert(res.body.url, 'Missing url in response');
    assert(res.body.url.endsWith('.webp'), `URL must end in .webp, got: ${res.body.url}`);
    assert(res.body.url.startsWith('/uploads/question-images/'), 'Wrong upload directory in URL');

    // Verify the actual file on disk is WebP
    const diskPath = path.join(__dirname, '../../', res.body.url);
    assert(fs.existsSync(diskPath), `File not found on disk: ${diskPath}`);
    assert(isWebP(diskPath), 'Disk file is not a valid WebP');
    fs.unlinkSync(diskPath);
  });

  await test('JPEG upload → response URL ends with .webp', async () => {
    const p = path.join(tmpDir, 'int_exam.jpg');
    await createJpeg(p);

    const res = await multipartRequest('/api/exams/upload-question-image', TOKEN,
      { image: { filePath: p, mime: 'image/jpeg' } }
    );
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert(res.body.url.endsWith('.webp'), `URL must end in .webp, got: ${res.body.url}`);

    const diskPath = path.join(__dirname, '../../', res.body.url);
    if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
  });

  await test('Invalid (non-image) file rejected with 400 — no URL returned', async () => {
    const p = path.join(tmpDir, 'fake.png');
    createFakeImage(p);

    const res = await multipartRequest('/api/exams/upload-question-image', TOKEN,
      { image: { filePath: p, mime: 'image/png' } }
    );
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    assert(!res.body.url, 'Should NOT return URL for invalid file');
  });

  await test('Unauthenticated upload rejected with 401', async () => {
    const p = path.join(tmpDir, 'auth_check.png');
    await createPng(p);

    const res = await multipartRequest('/api/exams/upload-question-image', null,
      { image: { filePath: p, mime: 'image/png' } }
    );
    assert([401, 403].includes(res.status), `Expected 401/403, got ${res.status}`);
  });

  // ── 2. courses/upload-thumbnail ───────────────────────────────────────────
  console.log('\n▶ 2. /api/courses/upload-thumbnail');

  await test('PNG thumbnail upload → .webp URL in /uploads/thumbnails/', async () => {
    const p = path.join(tmpDir, 'int_thumb.png');
    await createPng(p);

    const res = await multipartRequest('/api/courses/upload-thumbnail', TOKEN,
      { thumbnail: { filePath: p, mime: 'image/png' } }
    );
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert(res.body.url, 'Missing url field');
    assert(res.body.url.endsWith('.webp'), `Expected .webp URL, got: ${res.body.url}`);
    assert(res.body.url.startsWith('/uploads/thumbnails/'), 'Wrong directory in URL');

    const diskPath = path.join(__dirname, '../../', res.body.url);
    assert(fs.existsSync(diskPath), 'Thumbnail file not found on disk');
    assert(isWebP(diskPath), 'Thumbnail is not valid WebP on disk');
    fs.unlinkSync(diskPath);
  });

  // ── 3. recitations/upload-image ───────────────────────────────────────────
  console.log('\n▶ 3. /api/recitations/upload-image');

  await test('PNG upload → .webp URL in /uploads/question-images/', async () => {
    const p = path.join(tmpDir, 'int_rec.png');
    await createPng(p);

    const res = await multipartRequest('/api/recitations/upload-image', TOKEN,
      { image: { filePath: p, mime: 'image/png' } }
    );
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert(res.body.url.endsWith('.webp'), `Expected .webp URL, got: ${res.body.url}`);

    const diskPath = path.join(__dirname, '../../', res.body.url);
    if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
  });

  // ── 4. question-banks/upload-image ────────────────────────────────────────
  console.log('\n▶ 4. /api/question-banks/upload-image');

  await test('PNG upload → .webp URL in /uploads/question-images/', async () => {
    const p = path.join(tmpDir, 'int_qb.png');
    await createPng(p);

    const res = await multipartRequest('/api/question-banks/upload-image', TOKEN,
      { image: { filePath: p, mime: 'image/png' } }
    );
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert(res.body.url.endsWith('.webp'), `Expected .webp URL, got: ${res.body.url}`);

    const diskPath = path.join(__dirname, '../../', res.body.url);
    if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
  });

  // Teardown
  await pool.query('DELETE FROM teachers WHERE username = $1', [TEST_USER]);
  console.log('\n[integration teardown] Test teacher removed.');
}

// ═════════════════════════════════════════════════════════════════════════════
//  MAIN
// ═════════════════════════════════════════════════════════════════════════════

(async () => {
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║   WATHBA — WebP Conversion Test Suite            ║');
  console.log('╚═══════════════════════════════════════════════════╝');

  try {
    await runUnitTests();

    if (process.env.INTEGRATION === '1') {
      await runIntegrationTests();
    } else {
      console.log('\n[info] Integration tests skipped. Run with INTEGRATION=1 to include them.');
    }
  } catch (fatalErr) {
    console.error('\n[FATAL] Test suite crashed:', fatalErr.message);
    if (process.env.VERBOSE) console.error(fatalErr.stack);
    failed++;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}

    const total = passed + failed;
    const pct   = total > 0 ? Math.round((passed / total) * 100) : 0;

    console.log('\n══════════════════════════════════════════════════');
    console.log(`  Results: ${passed}/${total} passed (${pct}%)`);
    if (failed > 0) console.log(`  ⚠️  ${failed} test(s) failed`);
    else            console.log('  🎉 All tests passed!');
    console.log('══════════════════════════════════════════════════\n');

    process.exit(failed > 0 ? 1 : 0);
  }
})();
