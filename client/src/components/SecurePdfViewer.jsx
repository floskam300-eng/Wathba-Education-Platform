/**
 * SecurePdfViewer — renders PDFs on <canvas> via PDF.js.
 *
 * Security measures:
 *  1. PDF rendered page-by-page to <canvas> — browser never sees a raw PDF
 *     file so its built-in "Save as PDF" / download toolbar never appears.
 *  2. Diagonal watermark (student name + ID) burned into every canvas frame.
 *  3. Right-click disabled on the viewer container.
 *  4. Ctrl+S / Ctrl+P / Ctrl+U keyboard shortcuts blocked.
 *  5. CSS user-select:none + pointer-events:none on the canvas element.
 *  6. No download / open-in-new-tab button is rendered.
 *  7. Loading task cancelled on component unmount (no memory leak).
 *  8. Rendering is blocked until user identity is confirmed (no watermark-less frames).
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  FileText, ChevronRight, ChevronLeft,
  ZoomIn, ZoomOut, Loader2, AlertTriangle, RefreshCw,
  Maximize2, Minimize2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { withToken } from '../lib/mediaAccess';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

/* ─── Constants ─────────────────────────────────────────────── */
const DEFAULT_SCALE = 1.3;
const MIN_SCALE     = 0.5;
const MAX_SCALE     = 3.0;

export default function SecurePdfViewer({ pdf }) {
  const { user } = useAuth();

  const [numPages,    setNumPages]    = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale,       setScale]       = useState(DEFAULT_SCALE);
  const [isLoading,   setIsLoading]   = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [error,       setError]       = useState(null);
  const [retryKey,    setRetryKey]    = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const canvasRef          = useRef(null);
  // Root container ref — used to enter fullscreen so the toolbar + canvas both
  // expand together and stay usable while studying.
  const containerRef       = useRef(null);
  const pdfDocRef          = useRef(null);
  const renderTaskRef      = useRef(null);
  const loadTaskRef        = useRef(null);
  const mountedRef         = useRef(true);
  // [P-2 fix] store latest label in a ref so renderPage never re-creates
  // just because the user object identity changed.
  const watermarkLabelRef  = useRef('');
  // [B-4 fix] keep current page and scale in refs for the watermark re-draw
  // effect so it always reads the latest values (no stale closure).
  const currentPageRef     = useRef(1);
  const scaleRef           = useRef(DEFAULT_SCALE);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // [P-1 fix] memoize label — recomputes only when name/id actually change
  const watermarkLabel = useMemo(
    () => (user ? `${user.name}   |   #${String(user.id).padStart(6, '0')}` : ''),
    [user?.name, user?.id],
  );

  // Keep the ref in sync with the memoized string
  useEffect(() => {
    watermarkLabelRef.current = watermarkLabel;
  }, [watermarkLabel]);

  /* ── Watermark ─────────────────────────────────────────────── */
  const drawWatermark = useCallback((canvas, label) => {
    if (!label) return;
    const ctx = canvas.getContext('2d');
    ctx.save();

    const fontSize = Math.max(12, Math.round(canvas.width / 30));
    ctx.font        = `bold ${fontSize}px Arial, sans-serif`;
    ctx.fillStyle   = '#1a1a1a';
    ctx.globalAlpha = 0.11;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-Math.PI / 7);

    const stepX  = canvas.width  * 0.55;
    const stepY  = canvas.height * 0.17;
    const startX = -canvas.width * 1.5;
    const startY = -canvas.height * 1.5;

    for (let x = startX; x < canvas.width * 2; x += stepX) {
      for (let y = startY; y < canvas.height * 2; y += stepY) {
        ctx.fillText(label, x, y);
      }
    }
    ctx.restore();
  }, []);

  /* ── Page render ────────────────────────────────────────────── */
  // [P-2 fix] renderPage reads label from ref — no dependency on watermarkLabel
  const renderPage = useCallback(async (doc, pageNum, sc) => {
    if (!doc || !canvasRef.current || !mountedRef.current) return;

    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch (_) {}
      renderTaskRef.current = null;
    }

    setPageLoading(true);
    // [B-1 fix] track cancellation so finally doesn't clear the spinner
    // that the *next* render already started.
    let wasCancelled = false;
    try {
      const page = await doc.getPage(pageNum);
      if (!mountedRef.current) return;

      const dpr      = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: sc * dpr });
      const canvas   = canvasRef.current;
      if (!canvas || !mountedRef.current) return;

      const ctx = canvas.getContext('2d');
      canvas.width        = viewport.width;
      canvas.height       = viewport.height;
      canvas.style.width  = `${viewport.width  / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      await task.promise;

      if (!mountedRef.current) return;
      // Read the label from ref so this callback never needs to be recreated
      drawWatermark(canvas, watermarkLabelRef.current);
    } catch (err) {
      if (err?.name === 'RenderingCancelledException') {
        // Do NOT clear pageLoading — the new render already owns the spinner.
        wasCancelled = true;
        return;
      }
      console.error('[SecurePdfViewer] render error', err);
    } finally {
      // Skip if cancelled: the replacement render will call setPageLoading(false).
      if (mountedRef.current && !wasCancelled) setPageLoading(false);
    }
  }, [drawWatermark]);                          // watermarkLabel removed from deps

  /* ── Keep currentPage/scale refs in sync with state ─────────── */
  // [B-4 fix] so the watermark re-draw effect always reads the latest page/zoom
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);

  /* ── PDF load ───────────────────────────────────────────────── */
  useEffect(() => {
    // [F-1 fix] If there is nothing to load, reset stale state immediately.
    // Without this, isLoading starts as `true` and stays there forever when
    // pdf.file_url is absent or user has not loaded yet.
    if (!pdf?.file_url || !user?.id) {
      setIsLoading(false);
      setError(null);
      setNumPages(0);
      setCurrentPage(1);
      setPageLoading(false);
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch (_) {}
        renderTaskRef.current = null;
      }
      if (pdfDocRef.current) {
        try { pdfDocRef.current.destroy(); } catch (_) {}
        pdfDocRef.current = null;
      }
      return;
    }

    let cancelled = false;

    // [B-2 fix] reset ALL loading/navigation state when switching PDFs
    setIsLoading(true);
    setError(null);
    setNumPages(0);
    setCurrentPage(1);
    setPageLoading(false);    // ← was missing; prevented stale spinner
    setScale(DEFAULT_SCALE);  // [B-3 fix] reset zoom per-document

    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch (_) {}
      renderTaskRef.current = null;
    }
    if (pdfDocRef.current) {
      try { pdfDocRef.current.destroy(); } catch (_) {}
      pdfDocRef.current = null;
    }

    const url  = withToken(pdf.file_url);
    const task = pdfjsLib.getDocument({ url });
    loadTaskRef.current = task;

    task.promise
      .then((doc) => {
        if (cancelled) { doc.destroy(); return; }
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[SecurePdfViewer] load error', err);
        setError('تعذّر تحميل الملف');
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
      try { loadTaskRef.current?.destroy(); } catch (_) {}
      loadTaskRef.current = null;
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch (_) {}
        renderTaskRef.current = null;
      }
    };
  // [B-2 fix] depend on user?.id not the full user object reference
  }, [pdf?.file_url, pdf?.id, retryKey, user?.id]);

  /* ── Re-render page when doc / page / zoom changes ──────────── */
  useEffect(() => {
    if (!isLoading && !error && pdfDocRef.current) {
      renderPage(pdfDocRef.current, currentPage, scale);
    }
  }, [currentPage, scale, isLoading, error, renderPage]);

  /* ── Re-draw watermark when label changes (user data update) ── */
  // [B-4 fix] read page/scale from refs so we never have a stale closure —
  // if the user's name is updated while they're on page 7 at 200% zoom, the
  // watermark re-draws correctly on page 7 at 200%, not on page 1 at 130%.
  useEffect(() => {
    const doc = pdfDocRef.current;
    if (doc && watermarkLabel) {
      renderPage(doc, currentPageRef.current, scaleRef.current);
    }
  }, [watermarkLabel, renderPage]);

  /* ── Block download / print keyboard shortcuts ──────────────── */
  useEffect(() => {
    const block = (e) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        ['s', 'S', 'p', 'P', 'u', 'U'].includes(e.key)
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', block, { capture: true });
    return () => window.removeEventListener('keydown', block, { capture: true });
  }, []);

  /* ── Fullscreen ──────────────────────────────────────────────────
     Keep state in sync when the user exits fullscreen via ESC / browser UI. */
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    // If already fullscreen (native or state), exit.
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      try { (document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen)?.call(document); } catch (_) {}
      return;
    }
    const fsReq = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
    if (fsReq) {
      fsReq.call(el).catch(() => {});
    }
  };

  /* ── Navigation helpers ─────────────────────────────────────── */
  const prevPage = () => setCurrentPage(p => Math.max(1, p - 1));
  const nextPage = () => setCurrentPage(p => Math.min(numPages, p + 1));
  const zoomIn   = () => setScale(s => Math.min(MAX_SCALE, parseFloat((s + 0.2).toFixed(1))));
  const zoomOut  = () => setScale(s => Math.max(MIN_SCALE, parseFloat((s - 0.2).toFixed(1))));
  const retry    = () => { setError(null); setRetryKey(k => k + 1); };

  /* ── Empty state ────────────────────────────────────────────── */
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

  // [B-4 fix + B-2 fix] Block rendering until user identity is confirmed
  if (!user?.id) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-orange-400" />
      </div>
    );
  }

  /* ── Main render ────────────────────────────────────────────── */
  return (
    <div
      ref={containerRef}
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

        {/* Zoom controls */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-1 py-0.5">
          <button
            onClick={zoomOut}
            disabled={scale <= MIN_SCALE || isLoading}
            className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40 transition-colors"
            title="تصغير"
            aria-label="تصغير"
          >
            <ZoomOut className="w-3.5 h-3.5 text-gray-600" />
          </button>
          <span className="text-xs font-bold text-gray-600 w-10 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={zoomIn}
            disabled={scale >= MAX_SCALE || isLoading}
            className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40 transition-colors"
            title="تكبير"
            aria-label="تكبير"
          >
            <ZoomIn className="w-3.5 h-3.5 text-gray-600" />
          </button>
        </div>

        {/* Page controls */}
        {numPages > 0 && (
          <div className="flex items-center gap-1">
            <button
              onClick={nextPage}
              disabled={currentPage >= numPages || pageLoading}
              className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 transition-colors"
              title="الصفحة التالية"
              aria-label="الصفحة التالية"
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
              aria-label="الصفحة السابقة"
            >
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        )}

        {/* Fullscreen toggle — lets the student enlarge the page for studying */}
        <button
          onClick={toggleFullscreen}
          className="p-1.5 rounded hover:bg-gray-200 transition-colors flex-shrink-0"
          title={isFullscreen ? 'إنهاء الشاشة الكاملة' : 'شاشة كاملة'}
          aria-label={isFullscreen ? 'إنهاء الشاشة الكاملة' : 'شاشة كاملة'}
        >
          {isFullscreen
            ? <Minimize2 className="w-4 h-4 text-gray-600" />
            : <Maximize2 className="w-4 h-4 text-gray-600" />}
        </button>
      </div>

      {/* ── Canvas area ── */}
      <div className="flex-1 overflow-auto flex flex-col items-center py-4 px-2">

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
            <Loader2 className="w-10 h-10 animate-spin text-orange-400" />
            <span className="text-sm font-medium">جاري تحميل الملف…</span>
          </div>
        )}

        {/* Error with retry */}
        {error && !isLoading && (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <AlertTriangle className="w-12 h-12 text-red-400" />
            <p className="text-sm font-bold text-red-500">{error}</p>
            <button
              onClick={retry}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-xl transition-colors active:scale-95"
            >
              <RefreshCw className="w-4 h-4" /> إعادة المحاولة
            </button>
          </div>
        )}

        {/* Canvas (always mounted once loaded, hidden during load/error) */}
        {!isLoading && !error && (
          <div className="relative">
            {pageLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10 rounded">
                <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
              </div>
            )}
            <canvas
              ref={canvasRef}
              className="shadow-xl rounded max-w-full block"
              style={{
                imageRendering: 'auto',   // [B-1 fix] 'high-quality' is not a valid CSS value
                pointerEvents: 'none',
              }}
              draggable={false}
              onDragStart={e => e.preventDefault()}
            />
          </div>
        )}
      </div>

      {/* ── Bottom page nav (only for multi-page docs) ── */}
      {numPages > 1 && (
        <div className="flex-shrink-0 bg-white border-t border-gray-200 px-4 py-2 flex items-center justify-center gap-3">
          <button
            onClick={nextPage}
            disabled={currentPage >= numPages || pageLoading}
            aria-label="الصفحة التالية"
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
            aria-label="الصفحة السابقة"
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> السابقة
          </button>
        </div>
      )}
    </div>
  );
}
