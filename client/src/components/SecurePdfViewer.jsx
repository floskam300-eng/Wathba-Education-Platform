/**
 * SecurePdfViewer — renders PDFs on <canvas> via PDF.js so the raw file
 * bytes are never exposed as a downloadable resource in the browser.
 *
 * Security measures applied here:
 *  1. PDF rendered page-by-page onto <canvas> — no <object>/<embed>/<iframe>
 *     so the browser's built-in "Save as PDF" toolbar never appears.
 *  2. Diagonal watermark (student name + ID) burned into every canvas frame.
 *  3. Right-click disabled on the canvas container.
 *  4. Ctrl+S / Ctrl+P / Ctrl+U keyboard shortcuts blocked.
 *  5. CSS user-select:none + pointer-events:none on the canvas layer.
 *  6. No download / open-in-new-tab button exposed to the student.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { FileText, ChevronRight, ChevronLeft, ZoomIn, ZoomOut, Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { withToken } from '../lib/mediaAccess';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export default function SecurePdfViewer({ pdf }) {
  const { user } = useAuth();
  const [numPages, setNumPages]     = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale]           = useState(1.3);
  const [isLoading, setIsLoading]   = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError]           = useState(null);

  const canvasRef     = useRef(null);
  const pdfDocRef     = useRef(null);
  const renderTaskRef = useRef(null);
  const mountedRef    = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const watermarkLabel = user
    ? `${user.name}   |   #${String(user.id).padStart(6, '0')}`
    : '';

  const drawWatermark = useCallback((canvas, label) => {
    if (!label) return;
    const ctx = canvas.getContext('2d');
    ctx.save();

    const fontSize = Math.max(13, Math.round(canvas.width / 28));
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    ctx.fillStyle = '#1a1a1a';
    ctx.globalAlpha = 0.10;
    ctx.textAlign  = 'center';
    ctx.textBaseline = 'middle';

    const angle   = -Math.PI / 7;
    const stepX   = canvas.width  * 0.52;
    const stepY   = canvas.height * 0.18;

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(angle);

    const startX = -canvas.width;
    const startY = -canvas.height;
    for (let x = startX; x < canvas.width * 2; x += stepX) {
      for (let y = startY; y < canvas.height * 2; y += stepY) {
        ctx.fillText(label, x, y);
      }
    }

    ctx.restore();
  }, []);

  const renderPage = useCallback(async (doc, pageNum, sc) => {
    if (!doc || !canvasRef.current || !mountedRef.current) return;

    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch (_) {}
      renderTaskRef.current = null;
    }

    setPageLoading(true);
    try {
      const page     = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: sc });
      const canvas   = canvasRef.current;
      if (!canvas || !mountedRef.current) return;

      const ctx = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width  = viewport.width;

      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      await task.promise;

      if (!mountedRef.current) return;

      drawWatermark(canvas, watermarkLabel);
    } catch (err) {
      if (err?.name === 'RenderingCancelledException') return;
      console.error('[SecurePdfViewer] render error', err);
    } finally {
      if (mountedRef.current) setPageLoading(false);
    }
  }, [drawWatermark, watermarkLabel]);

  useEffect(() => {
    if (!pdf?.file_url) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setCurrentPage(1);
    if (pdfDocRef.current) {
      try { pdfDocRef.current.destroy(); } catch (_) {}
      pdfDocRef.current = null;
    }

    const load = async () => {
      try {
        const url  = withToken(pdf.file_url);
        const task = pdfjsLib.getDocument({ url, disableAutoFetch: false, disableStream: false });
        const doc  = await task.promise;
        if (cancelled) { doc.destroy(); return; }
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error('[SecurePdfViewer] load error', err);
          setError('تعذّر تحميل الملف، حاول مرة أخرى');
          setIsLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch (_) {}
        renderTaskRef.current = null;
      }
    };
  }, [pdf?.file_url, pdf?.id]);

  useEffect(() => {
    if (!isLoading && pdfDocRef.current) {
      renderPage(pdfDocRef.current, currentPage, scale);
    }
  }, [currentPage, scale, isLoading, renderPage]);

  useEffect(() => {
    const block = (e) => {
      if ((e.ctrlKey || e.metaKey) && ['s', 'p', 'u', 'S', 'P', 'U'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };
    window.addEventListener('keydown', block, { capture: true });
    return () => window.removeEventListener('keydown', block, { capture: true });
  }, []);

  const prevPage = () => setCurrentPage(p => Math.max(1, p - 1));
  const nextPage = () => setCurrentPage(p => Math.min(numPages, p + 1));
  const zoomIn   = () => setScale(s => Math.min(3, parseFloat((s + 0.2).toFixed(1))));
  const zoomOut  = () => setScale(s => Math.max(0.5, parseFloat((s - 0.2).toFixed(1))));

  if (!pdf) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-400">
          <FileText className="w-20 h-20 mx-auto mb-4 opacity-20" />
          <p className="font-semibold text-lg">اختر ملفاً للعرض</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col w-full h-full bg-gray-100 select-none"
      onContextMenu={e => e.preventDefault()}
      style={{ WebkitUserSelect: 'none', MozUserSelect: 'none', userSelect: 'none' }}
    >
      {/* ── Toolbar ── */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileText className="w-4 h-4 text-orange-500 flex-shrink-0" />
          <span className="font-bold text-sm text-gray-800 truncate">{pdf.title}</span>
        </div>

        <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-1 py-0.5">
          <button
            onClick={zoomOut}
            disabled={scale <= 0.5}
            className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40 transition-colors"
            title="تصغير"
          >
            <ZoomOut className="w-3.5 h-3.5 text-gray-600" />
          </button>
          <span className="text-xs font-bold text-gray-600 w-10 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={zoomIn}
            disabled={scale >= 3}
            className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40 transition-colors"
            title="تكبير"
          >
            <ZoomIn className="w-3.5 h-3.5 text-gray-600" />
          </button>
        </div>

        {numPages > 0 && (
          <div className="flex items-center gap-1">
            <button
              onClick={nextPage}
              disabled={currentPage >= numPages || pageLoading}
              className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 transition-colors"
              title="الصفحة التالية"
            >
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
            <span className="text-xs font-bold text-gray-600 whitespace-nowrap px-1">
              {currentPage} / {numPages}
            </span>
            <button
              onClick={prevPage}
              disabled={currentPage <= 1 || pageLoading}
              className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 transition-colors"
              title="الصفحة السابقة"
            >
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        )}
      </div>

      {/* ── Canvas area ── */}
      <div className="flex-1 overflow-auto flex flex-col items-center py-4 px-2 relative">
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
            <Loader2 className="w-10 h-10 animate-spin text-orange-400" />
            <span className="text-sm font-medium">جاري تحميل الملف…</span>
          </div>
        )}

        {error && !isLoading && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-red-400">
            <AlertTriangle className="w-10 h-10" />
            <span className="text-sm font-medium">{error}</span>
          </div>
        )}

        {!isLoading && !error && (
          <div className="relative">
            {pageLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-10 rounded">
                <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
              </div>
            )}
            <canvas
              ref={canvasRef}
              className="shadow-xl rounded max-w-full block"
              style={{
                imageRendering: 'high-quality',
                pointerEvents: 'none',
              }}
              draggable={false}
              onDragStart={e => e.preventDefault()}
            />
          </div>
        )}
      </div>

      {/* ── Page nav bottom bar ── */}
      {numPages > 1 && (
        <div className="flex-shrink-0 bg-white border-t border-gray-200 px-4 py-2 flex items-center justify-center gap-3">
          <button
            onClick={nextPage}
            disabled={currentPage >= numPages || pageLoading}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 disabled:opacity-40 transition-colors"
          >
            التالية <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <span className="text-sm font-bold text-gray-500">
            صفحة {currentPage} من {numPages}
          </span>
          <button
            onClick={prevPage}
            disabled={currentPage <= 1 || pageLoading}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> السابقة
          </button>
        </div>
      )}
    </div>
  );
}
