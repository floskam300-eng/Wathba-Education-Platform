/**
 * convertToWebp.js
 *
 * Central utility for converting uploaded images to WebP format.
 * Used by all image-upload route handlers across the platform.
 *
 * Why WebP?
 *  - Up to 80% smaller file size vs PNG/JPEG with equivalent visual quality
 *  - Supported by all modern browsers (Chrome, Firefox, Safari 14+, Edge)
 *  - Faster page load → better UX and SEO scores
 *
 * Usage:
 *   const { convertToWebp } = require('../lib/convertToWebp');
 *   const { webpPath, filename } = await convertToWebp(req.file.path, req.file.filename);
 *   // Original file is deleted. Use `filename` for the stored URL.
 */

const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

/**
 * Convert an image file to WebP and delete the original.
 *
 * Security hardening:
 *  - [S1] Strips directory components from originalName via path.basename()
 *    to prevent path traversal if a malicious filename somehow reaches here.
 *  - [S1] Sanitises the base name: only allows word chars, hyphens, and dots.
 *
 * Reliability hardening:
 *  - [R1] Cleans up a partially-written .webp output file if sharp fails mid-write.
 *  - [P1] Uses fs.promises.unlink (async) instead of unlinkSync to avoid blocking
 *    the event loop while Node.js waits for the filesystem operation to complete.
 *
 * @param {string} inputPath    - Absolute path to the uploaded file
 * @param {string} originalName - Multer-generated filename (NOT the user-supplied name)
 * @returns {Promise<{ webpPath: string, filename: string }>}
 *   webpPath  — absolute path of the saved .webp file
 *   filename  — basename of the saved .webp file (used for building the public URL)
 */
async function convertToWebp(inputPath, originalName) {
  // [S1] Sanitise: strip any directory components, then allow only safe chars.
  // path.basename() removes any leading `../` or `/` that could cause path traversal.
  const safeBase = path.basename(originalName);
  // Replace any character that is not a word-char, hyphen, or dot with '_'
  const sanitised = safeBase.replace(/[^\w.\-]/g, '_');

  // Build the output filename: strip the old extension and force .webp
  const lastDot = sanitised.lastIndexOf('.');
  const baseName = lastDot !== -1 ? sanitised.slice(0, lastDot) : sanitised;
  const webpName = `${baseName}.webp`;

  // The output file lives in the same directory as the input
  const dir       = path.dirname(inputPath);
  const webpPath  = path.join(dir, webpName);

  // [EDGE] If input and output paths are the same (file was already named .webp),
  // sharp refuses to overwrite the source while reading it.
  // Write to a temp path first, then rename to the final name.
  const isSamePath = path.resolve(inputPath) === path.resolve(webpPath);
  const tempWebpPath = isSamePath
    ? path.join(dir, `${baseName}_tmp_${Date.now()}.webp`)
    : webpPath;

  try {
    await sharp(inputPath)
      .rotate() // Auto-orient based on EXIF metadata from phone cameras
      .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80, effort: 4 })
      .toFile(tempWebpPath);

    // If we wrote to a temp path, rename it to the final name
    if (isSamePath) {
      await fs.promises.rename(tempWebpPath, webpPath);
    }
  } catch (sharpErr) {
    // [R1] If sharp failed mid-write it may have left a partial .webp file on disk.
    // Attempt a best-effort cleanup so we don't accumulate corrupt files.
    try { await fs.promises.unlink(tempWebpPath); } catch (_) {}
    if (isSamePath) {
      try { await fs.promises.unlink(webpPath); } catch (_) {}
    }
    throw new Error(`[convertToWebp] فشل تحويل الصورة إلى WebP: ${sharpErr.message}`);
  }

  // [P1] Async unlink — avoids blocking the event loop (vs unlinkSync)
  // Delete the original file after successful conversion.
  // Skip deletion if the input was already the .webp destination (same path).
  if (!isSamePath) {
    try {
      await fs.promises.unlink(inputPath);
    } catch (unlinkErr) {
      console.error('[convertToWebp] تعذّر حذف الملف الأصلي:', unlinkErr.message);
    }
  }

  return { webpPath, filename: webpName };
}

module.exports = { convertToWebp };
