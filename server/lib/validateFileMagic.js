/**
 * [M-11] Magic-byte file validation.
 *
 * Multer's fileFilter trusts Content-Type and file.originalname, both of
 * which an attacker can spoof trivially. This module reads the first bytes
 * of the already-saved file from disk and compares them against known
 * format signatures — the only reliable way to verify file type.
 *
 * Call these helpers in route handlers immediately after the multer middleware
 * saves the file; delete the file and return 400 if validation fails.
 */

const fs = require('fs');

const SIGNATURES = {
  png:     { bytes: [0x89, 0x50, 0x4E, 0x47], offset: 0 },
  jpg:     { bytes: [0xFF, 0xD8, 0xFF],        offset: 0 },
  gif:     { bytes: [0x47, 0x49, 0x46, 0x38], offset: 0 },
  webp:    { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 }, // "WEBP" at byte 8 (inside RIFF header)
  pdf:     { bytes: [0x25, 0x50, 0x44, 0x46], offset: 0 }, // "%PDF"
  mp4ftyp: { bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }, // "ftyp" at offset 4 (MP4 / MOV)
  webm:    { bytes: [0x1A, 0x45, 0xDF, 0xA3], offset: 0 },
  avi:     { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // "RIFF" (AVI / WAV)
};

function readFirstBytes(filePath, count) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.alloc(count);
    fs.open(filePath, 'r', (err, fd) => {
      if (err) return reject(err);
      fs.read(fd, buf, 0, count, 0, (readErr, bytesRead) => {
        fs.close(fd, () => {});
        if (readErr) return reject(readErr);
        resolve(buf.slice(0, bytesRead));
      });
    });
  });
}

function matches(buf, sig) {
  const { bytes, offset } = sig;
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

async function isValidImage(filePath) {
  try {
    const buf = await readFirstBytes(filePath, 16);
    return matches(buf, SIGNATURES.png)
        || matches(buf, SIGNATURES.jpg)
        || matches(buf, SIGNATURES.gif)
        || matches(buf, SIGNATURES.webp);
  } catch { return false; }
}

async function isValidPdf(filePath) {
  try {
    const buf = await readFirstBytes(filePath, 8);
    return matches(buf, SIGNATURES.pdf);
  } catch { return false; }
}

async function isValidVideo(filePath) {
  try {
    const buf = await readFirstBytes(filePath, 16);
    return matches(buf, SIGNATURES.mp4ftyp)
        || matches(buf, SIGNATURES.webm)
        || matches(buf, SIGNATURES.avi);
  } catch { return false; }
}

/**
 * Safely delete an uploaded file — used to clean up on validation failure.
 * Errors are swallowed to avoid masking the original 400 response.
 */
function deleteFile(filePath) {
  try { fs.unlinkSync(filePath); } catch (_) {}
}

module.exports = { isValidImage, isValidPdf, isValidVideo, deleteFile };
