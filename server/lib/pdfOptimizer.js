/**
 * server/lib/pdfOptimizer.js
 *
 * Enterprise-grade PDF Linearization (Fast Web View) and Stream Compression using qpdf.
 *
 * Safety Guarantees:
 *  1. Zero Data Loss: Original PDF is never modified or deleted unless the optimized
 *     output is 100% verified (magic bytes '%PDF-' + valid size > 100 bytes).
 *  2. Warning Tolerance: Handles qpdf exit code 3 (warnings / automatic PDF repairs) safely.
 *  3. Process Protection: Execution timeouts (45s) and 10MB buffer prevents hangs.
 *  4. Filesystem Safety: Atomic replacement with cross-mount copy/unlink fallback.
 *  5. Graceful Fallback: If qpdf binary is absent, leaves original intact with warning.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const PDF_MAGIC = Buffer.from('%PDF-');

/**
 * Checks whether qpdf is available in the system PATH.
 * @returns {Promise<boolean>}
 */
function isQpdfAvailable() {
  return new Promise((resolve) => {
    execFile('qpdf', ['--version'], { timeout: 5000 }, (error) => {
      resolve(!error);
    });
  });
}

/**
 * Validates that a file starts with the '%PDF-' magic header.
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function isFileValidPdf(filePath) {
  let handle = null;
  try {
    handle = await fs.promises.open(filePath, 'r');
    const buf = Buffer.alloc(5);
    const { bytesRead } = await handle.read(buf, 0, 5, 0);
    return bytesRead === 5 && buf.equals(PDF_MAGIC);
  } catch (_) {
    return false;
  } finally {
    if (handle) {
      try { await handle.close(); } catch (_) {}
    }
  }
}

/**
 * Optimizes and linearizes a PDF file in-place with rigorous safety checks.
 *
 * @param {string} filePath - Absolute path to the PDF file.
 * @param {object} [options]
 * @param {number} [options.timeout=45000] - Max processing time in ms.
 * @returns {Promise<{ success: boolean, originalSize: number, newSize: number, linearized: boolean, error?: string, warning?: string }>}
 */
async function optimizeAndLinearizePdf(filePath, options = {}) {
  if (!filePath || typeof filePath !== 'string') {
    return { success: false, originalSize: 0, newSize: 0, linearized: false, error: 'Invalid file path' };
  }

  // 1. Verify source file exists
  let originalStats;
  try {
    originalStats = await fs.promises.stat(filePath);
    if (!originalStats.isFile() || originalStats.size === 0) {
      return { success: false, originalSize: 0, newSize: 0, linearized: false, error: 'Source file is empty or not a file' };
    }
  } catch (err) {
    return { success: false, originalSize: 0, newSize: 0, linearized: false, error: `File stat error: ${err.message}` };
  }

  const originalSize = originalStats.size;

  // 2. Check qpdf availability
  const qpdfOk = await isQpdfAvailable();
  if (!qpdfOk) {
    return {
      success: true,
      originalSize,
      newSize: originalSize,
      linearized: false,
      warning: 'qpdf not available on host system (safe fallback applied)',
    };
  }

  // 3. Prepare unique temporary output path in the same directory
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath) || '.pdf';
  const base = path.basename(filePath, ext);
  const tempOutput = path.join(dir, `.${base}_tmp_opt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);

  const timeoutMs = options.timeout || 45000;

  return new Promise((resolve) => {
    // qpdf arguments:
    // --linearize: Fast Web View / progressive streaming
    // --object-streams=generate: compresses objects & XRef into object streams
    // --stream-data=compress: flate compresses streams
    const args = [
      '--linearize',
      '--object-streams=generate',
      '--stream-data=compress',
      filePath,
      tempOutput,
    ];

    const execOpts = {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    };

    execFile('qpdf', args, execOpts, async (err) => {
      // qpdf exit codes:
      // 0 = Success (no errors or warnings)
      // 3 = Warnings (output file was produced successfully and is valid, e.g. repaired minor issues)
      // 2 = Fatal error (no output produced)
      const isExitCode3 = err && (err.code === 3 || err.code === '3');
      const isFatal = err && !isExitCode3;

      if (isFatal) {
        // Clean up temp file
        try { if (fs.existsSync(tempOutput)) await fs.promises.unlink(tempOutput); } catch (_) {}
        return resolve({
          success: false,
          originalSize,
          newSize: originalSize,
          linearized: false,
          error: `qpdf error: ${err.message}`,
        });
      }

      // 4. Strict Safety Validation of the generated temp output
      try {
        if (!fs.existsSync(tempOutput)) {
          return resolve({
            success: false,
            originalSize,
            newSize: originalSize,
            linearized: false,
            error: 'qpdf finished but output file was not created',
          });
        }

        const newStats = await fs.promises.stat(tempOutput);
        const newSize = newStats.size;

        // Minimum valid PDF size is ~100 bytes
        if (newSize < 100) {
          try { await fs.promises.unlink(tempOutput); } catch (_) {}
          return resolve({
            success: false,
            originalSize,
            newSize: originalSize,
            linearized: false,
            error: `Optimized file is too small (${newSize} bytes), keeping original`,
          });
        }

        // Verify magic bytes of the output file
        const magicOk = await isFileValidPdf(tempOutput);
        if (!magicOk) {
          try { await fs.promises.unlink(tempOutput); } catch (_) {}
          return resolve({
            success: false,
            originalSize,
            newSize: originalSize,
            linearized: false,
            error: 'Optimized file failed PDF magic header verification, keeping original',
          });
        }

        // 5. Safe atomic replacement with cross-device copy fallback
        try {
          await fs.promises.rename(tempOutput, filePath);
        } catch (renameErr) {
          await fs.promises.copyFile(tempOutput, filePath);
          try { await fs.promises.unlink(tempOutput); } catch (_) {}
        }

        resolve({
          success: true,
          originalSize,
          newSize,
          linearized: true,
          warning: isExitCode3 ? 'qpdf completed with minor repair warnings' : undefined,
        });
      } catch (validationErr) {
        try { if (fs.existsSync(tempOutput)) await fs.promises.unlink(tempOutput); } catch (_) {}
        resolve({
          success: false,
          originalSize,
          newSize: originalSize,
          linearized: false,
          error: `Post-optimization validation failed: ${validationErr.message}`,
        });
      }
    });
  });
}

module.exports = {
  isQpdfAvailable,
  isFileValidPdf,
  optimizeAndLinearizePdf,
};
