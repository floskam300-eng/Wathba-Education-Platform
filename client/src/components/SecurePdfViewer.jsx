/**
 * SecurePdfViewer — renders PDFs vertically on <canvas> via PDF.js.
 *
 * Key Features & Fixes:
 *  1. Vertical scroll layout — pages stacked vertically in natural sequence.
 *  2. Default Fit-to-Width — auto-calculates scale based on device / container width.
 *  3. Dynamic container resize tracking via ResizeObserver (adapts to phone orientation & window resize).
 *  4. Pinch-to-zoom & Ctrl+scroll zoom support with manual +/- and "Fit Width" reset.
 *  5. Diagonal watermark (student name + ID) burned into every canvas frame.
 *  6. Viewport rendering via IntersectionObserver for instant scrolling & high performance.
 *  7. Full security: canvas pointer-events:none, user-select:none, no download buttons, key shortcuts blocked.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  FileText, ChevronUp, ChevronDown,
  ZoomIn, ZoomOut, Loader2, AlertTriangle, RefreshCw,
  Maximize2, Minimize2, Maximize
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { withToken } from '../lib/mediaAccess';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

/* ─── Constants ─────────────────────────────────────────────── */
const MIN_SCALE = 0.4;
const MAX_SCALE = 3.0;

/* ─── Sub-component: Single PDF Page Canvas ─────────────────── */
const PdfPageItem = React.memo(function PdfPageItem({
  doc,
  pageNum,
  scale,
  watermarkLabel,
  drawWatermark,
  defaultAspect = 0.707,
  defaultWidth = 595,
  registerRef,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);

  const [isVisible, setIsVisible] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [pageAspect, setPageAspect] = useState(defaultAspect);
  const [originalWidth, setOriginalWidth] = useState(defaultWidth);

  // Pre-render pages when they approach the viewport (600px margin)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      {
        rootMargin: '600px 0px 600px 0px',
        threshold: 0.01,
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Render canvas when page becomes visible or scale / doc changes
  useEffect(() => {
    if (!doc || !isVisible) return;
    let cancelled = false;

    const render = async () => {
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch (_) {}
        renderTaskRef.current = null;
      }

      setIsRendering(true);
      try {
        const page = await doc.getPage(pageNum);
        if (cancelled) return;

        const unscaledViewport = page.getViewport({ scale: 1.0 });
        if (unscaledViewport.width && unscaledViewport.height) {
          setOriginalWidth(unscaledViewport.width);
          setPageAspect(unscaledViewport.width / unscaledViewport.height);
        }

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: scale * dpr });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const cssW = Math.round(viewport.width / dpr);
        const cssH = Math.round(viewport.height / dpr);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;

        if (cancelled) return;
        drawWatermark(canvas, watermarkLabel);
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error(`[SecurePdfViewer] Page ${pageNum} render error`, err);
        }
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    };

    render();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch (_) {}
        renderTaskRef.current = null;
      }
    };
  }, [doc, pageNum, scale, isVisible, watermarkLabel, drawWatermark]);

  const cssW = Math.round(originalWidth * scale);
  const cssH = Math.round(cssW / (pageAspect || 0.707));

  return (
    <div
      ref={(el) => {
        containerRef.current = el;
        registerRef(pageNum, el);
      }}
      data-page={pageNum}
      className="relative mx-auto my-3 sm:my-5 bg-white dark:bg-gray-800 shadow-md sm:shadow-lg rounded-lg overflow-hidden transition-shadow"
      style={{
        width: `${cssW}px`,
        height: `${cssH}px`,
      }}
    >
      {/* Page number badge */}
      <div className="absolute top-2 right-2 bg-gray-900/80 backdrop-blur-md text-white text-[11px] font-bold px-2 py-0.5 rounded-full z-10 pointer-events-none select-none">
        صفحة {pageNum}
      </div>

      {(!isVisible || isRendering) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900/50 z-0">
          <Loader2 className="w-6 h-6 animate-spin text-orange-400 mb-1.5" />
          <span className="text-xs text-gray-400 font-medium">جاري العرض... ({pageNum})</span>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="block w-full h-full shadow-sm rounded-lg"
        style={{
          imageRendering: 'auto',
          pointerEvents: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
        }}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
      />
    </div>
  );
});

/* ─── Main Component ────────────────────────────────────────── */
export default function SecurePdfViewer({ pdf }) {
  const { user } = useAuth();

  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInputValue, setPageInputValue] = useState('1');
  const [scale, setScale] = useState(1.0);
  const [scaleMode, setScaleMode] = useState('fit'); // 'fit' | 'custom'
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef(null);
  const canvasAreaRef = useRef(null);
  const pdfDocRef = useRef(null);
  const loadTaskRef = useRef(null);
  const mountedRef = useRef(true);
  const watermarkLabelRef = useRef('');
  const scaleRef = useRef(1.0);
  const scaleModeRef = useRef('fit');
  const pageWidthRef = useRef(595);
  const pageRefs = useRef({});

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const watermarkLabel = useMemo(
    () => (user ? `${user.name}   |   #${String(user.id).padStart(6, '0')}` : ''),
    [user?.name, user?.id]
  );

  useEffect(() => {
    watermarkLabelRef.current = watermarkLabel;
  }, [watermarkLabel]);

  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { scaleModeRef.current = scaleMode; }, [scaleMode]);

  /* ── Watermark ─────────────────────────────────────────────── */
  const drawWatermark = useCallback((canvas, label) => {
    if (!label) return;
    const ctx = canvas.getContext('2d');
    ctx.save();

    const fontSize = Math.max(12, Math.round(canvas.width / 30));
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    ctx.fillStyle = '#1a1a1a';
    ctx.globalAlpha = 0.11;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-Math.PI / 7);

    const stepX = canvas.width * 0.55;
    const stepY = canvas.height * 0.17;
    const startX = -canvas.width * 1.5;
    const startY = -canvas.height * 1.5;

    for (let x = startX; x < canvas.width * 2; x += stepX) {
      for (let y = startY; y < canvas.height * 2; y += stepY) {
        ctx.fillText(label, x, y);
      }
    }
    ctx.restore();
  }, []);

  /* ── Calculate Fit-to-Width Scale ───────────────────────────── */
  const calculateFitScale = useCallback((pWidth) => {
    const el = canvasAreaRef.current;
    if (!el) return 1.0;
    const containerW = el.clientWidth;
    // On mobile (<640px): 16px padding (8px per side). Desktop: 32px padding.
    const padding = containerW < 640 ? 16 : 32;
    const availableW = Math.max(280, containerW - padding);
    const targetWidth = pWidth || pageWidthRef.current || 595;
    const fit = parseFloat((availableW / targetWidth).toFixed(2));
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, fit));
  }, []);

  /* ── PDF Load ───────────────────────────────────────────────── */
  useEffect(() => {
    if (!pdf?.file_url || !user?.id) {
      setIsLoading(false);
      setError(null);
      setNumPages(0);
      setCurrentPage(1);
      setPageInputValue('1');
      if (pdfDocRef.current) {
        try { pdfDocRef.current.destroy(); } catch (_) {}
        pdfDocRef.current = null;
      }
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setNumPages(0);
    setCurrentPage(1);
    setPageInputValue('1');
    pageRefs.current = {};

    if (pdfDocRef.current) {
      try { pdfDocRef.current.destroy(); } catch (_) {}
      pdfDocRef.current = null;
    }

    const url = withToken(pdf.file_url);
    const task = pdfjsLib.getDocument({
      url,
      cMapUrl: '/pdfjs/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/pdfjs/standard_fonts/',
      disableFontFace: true,
    });
    loadTaskRef.current = task;

    task.promise
      .then(async (doc) => {
        if (cancelled) { doc.destroy(); return; }
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);

        // Fetch page 1 dimensions to calculate fit scale
        try {
          const page1 = await doc.getPage(1);
          if (!cancelled) {
            const vp = page1.getViewport({ scale: 1.0 });
            pageWidthRef.current = vp.width || 595;
            const fit = calculateFitScale(vp.width);
            setScale(fit);
            setScaleMode('fit');
          }
        } catch (_) {
          if (!cancelled) setScale(1.0);
        }

        if (!cancelled) setIsLoading(false);
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
    };
  }, [pdf?.file_url, pdf?.id, retryKey, user?.id, calculateFitScale]);

  /* ── ResizeObserver for Auto-Fit on Container Resize ────────── */
  useEffect(() => {
    const el = canvasAreaRef.current;
    if (!el) return;

    let resizeTimer = null;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (scaleModeRef.current === 'fit' && pageWidthRef.current) {
          const fit = calculateFitScale(pageWidthRef.current);
          setScale(fit);
        }
      }, 100);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(el);

    return () => {
      clearTimeout(resizeTimer);
      resizeObserver.disconnect();
    };
  }, [calculateFitScale]);

  /* ── Scroll Tracking to Sync Page Number Indicator ─────────── */
  useEffect(() => {
    const container = canvasAreaRef.current;
    if (!container || numPages === 0) return;

    const handleScroll = () => {
      const containerRect = container.getBoundingClientRect();
      const containerTop = containerRect.top;

      let closestPage = 1;
      let minDistance = Infinity;

      for (let p = 1; p <= numPages; p++) {
        const el = pageRefs.current[p];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const dist = Math.abs(rect.top - containerTop);
        if (dist < minDistance) {
          minDistance = dist;
          closestPage = p;
        }
      }

      setCurrentPage(closestPage);
      setPageInputValue(String(closestPage));
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [numPages]);

  /* ── Keyboard Shortcuts Security ───────────────────────────── */
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

  /* ── Fullscreen Sync ────────────────────────────────────────── */
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
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      try { (document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen)?.call(document); } catch (_) {}
      return;
    }
    const fsReq = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
    if (fsReq) {
      fsReq.call(el).catch(() => {});
    }
  };

  /* ── Pinch Zoom & Ctrl+Wheel Zoom ──────────────────────────── */
  useEffect(() => {
    const el = canvasAreaRef.current;
    if (!el) return;

    let pinchStartDist = null;
    let pinchStartScale = null;
    let pendingScale = null;

    const getTouchDist = (t) => {
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        pinchStartDist = getTouchDist(e.touches);
        pinchStartScale = scaleRef.current;
        pendingScale = null;
      }
    };

    const onTouchMove = (e) => {
      if (e.touches.length !== 2 || pinchStartDist === null) return;
      e.preventDefault();
      const ratio = getTouchDist(e.touches) / pinchStartDist;
      pendingScale = parseFloat(
        Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchStartScale * ratio)).toFixed(2)
      );
    };

    const onTouchEnd = () => {
      if (pendingScale !== null) {
        setScaleMode('custom');
        scaleModeRef.current = 'custom';
        setScale(pendingScale);
      }
      pinchStartDist = null;
      pinchStartScale = null;
      pendingScale = null;
    };

    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      setScaleMode('custom');
      scaleModeRef.current = 'custom';
      setScale(s => parseFloat(Math.min(MAX_SCALE, Math.max(MIN_SCALE, s + delta)).toFixed(2)));
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  /* ── Action Handlers ────────────────────────────────────────── */
  const scrollToPage = useCallback((pageNum) => {
    const target = Math.max(1, Math.min(numPages, pageNum));
    setCurrentPage(target);
    setPageInputValue(String(target));
    const el = pageRefs.current[target];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [numPages]);

  const handleZoomIn = () => {
    setScaleMode('custom');
    scaleModeRef.current = 'custom';
    setScale(s => Math.min(MAX_SCALE, parseFloat((s + 0.15).toFixed(2))));
  };

  const handleZoomOut = () => {
    setScaleMode('custom');
    scaleModeRef.current = 'custom';
    setScale(s => Math.max(MIN_SCALE, parseFloat((s - 0.15).toFixed(2))));
  };

  const handleFitWidth = () => {
    setScaleMode('fit');
    scaleModeRef.current = 'fit';
    const fit = calculateFitScale(pageWidthRef.current);
    setScale(fit);
  };

  const registerPageRef = useCallback((pageNum, el) => {
    if (el) pageRefs.current[pageNum] = el;
  }, []);

  const retry = () => { setError(null); setRetryKey(k => k + 1); };

  /* ── Empty & Auth States ────────────────────────────────────── */
  if (!pdf) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center text-gray-400">
          <FileText className="w-20 h-20 mx-auto mb-4 opacity-20" />
          <p className="font-semibold text-lg">اختر ملفاً للعرض</p>
        </div>
      </div>
    );
  }

  if (!user?.id) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="w-10 h-10 animate-spin text-orange-400" />
      </div>
    );
  }

  /* ── Main View ──────────────────────────────────────────────── */
  return (
    <div
      ref={containerRef}
      className="flex flex-col w-full h-full bg-gray-100 dark:bg-gray-900 select-none overflow-hidden"
      onContextMenu={e => e.preventDefault()}
      style={{ WebkitUserSelect: 'none', MozUserSelect: 'none', userSelect: 'none' }}
    >
      {/* ── Sticky Control Toolbar ── */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-3 sm:px-4 py-2 flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap shadow-sm z-20">
        
        {/* Document Title */}
        <div className="flex items-center gap-2 min-w-0 max-w-[200px] sm:max-w-xs">
          <FileText className="w-4 h-4 text-orange-500 flex-shrink-0" />
          <span className="font-bold text-xs sm:text-sm text-gray-800 dark:text-gray-100 truncate">
            {pdf.title}
          </span>
        </div>

        {/* Center Controls: Page Jumping + Zoom + Fit */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">

          {/* Page Jumper */}
          {numPages > 0 && (
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg px-1.5 py-0.5">
              <button
                onClick={() => scrollToPage(currentPage - 1)}
                disabled={currentPage <= 1 || isLoading}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 transition-colors"
                title="الصفحة السابقة (أعلى)"
                aria-label="الصفحة السابقة"
              >
                <ChevronUp className="w-3.5 h-3.5 text-gray-700 dark:text-gray-200" />
              </button>
              <div className="flex items-center gap-1 text-xs font-bold text-gray-700 dark:text-gray-200">
                <input
                  type="number"
                  min={1}
                  max={numPages}
                  value={pageInputValue}
                  onChange={(e) => setPageInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const p = parseInt(pageInputValue, 10);
                      if (p >= 1 && p <= numPages) scrollToPage(p);
                    }
                  }}
                  onBlur={() => {
                    const p = parseInt(pageInputValue, 10);
                    if (p >= 1 && p <= numPages) scrollToPage(p);
                    else setPageInputValue(String(currentPage));
                  }}
                  className="w-9 text-center bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded py-0.5 text-xs font-bold text-gray-800 dark:text-gray-100 focus:outline-none focus:border-orange-500"
                />
                <span className="whitespace-nowrap">/ {numPages}</span>
              </div>
              <button
                onClick={() => scrollToPage(currentPage + 1)}
                disabled={currentPage >= numPages || isLoading}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 transition-colors"
                title="الصفحة التالية (أسفل)"
                aria-label="الصفحة التالية"
              >
                <ChevronDown className="w-3.5 h-3.5 text-gray-700 dark:text-gray-200" />
              </button>
            </div>
          )}

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg px-1 py-0.5">
            <button
              onClick={handleZoomOut}
              disabled={scale <= MIN_SCALE || isLoading}
              className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 transition-colors"
              title="تصغير"
              aria-label="تصغير"
            >
              <ZoomOut className="w-3.5 h-3.5 text-gray-600 dark:text-gray-200" />
            </button>
            <span className="text-xs font-bold text-gray-600 dark:text-gray-200 w-11 text-center select-none">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              disabled={scale >= MAX_SCALE || isLoading}
              className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 transition-colors"
              title="تكبير"
              aria-label="تكبير"
            >
              <ZoomIn className="w-3.5 h-3.5 text-gray-600 dark:text-gray-200" />
            </button>
          </div>

          {/* Fit Width Button */}
          <button
            onClick={handleFitWidth}
            disabled={isLoading}
            className={`px-2 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
              scaleMode === 'fit'
                ? 'bg-orange-500 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
            title="احتواء للشاشة (العرض الطبيعي)"
            aria-label="احتواء للشاشة"
          >
            <Maximize className="w-3 h-3" />
            <span>احتواء الشاشة</span>
          </button>
        </div>

        {/* Right Controls: Fullscreen */}
        <button
          onClick={toggleFullscreen}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-200 transition-colors flex-shrink-0"
          title={isFullscreen ? 'إنهاء الشاشة الكاملة' : 'شاشة كاملة'}
          aria-label={isFullscreen ? 'إنهاء الشاشة الكاملة' : 'شاشة كاملة'}
        >
          {isFullscreen
            ? <Minimize2 className="w-4 h-4" />
            : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* ── Scrollable Multi-Page Canvas Area ── */}
      <div
        ref={canvasAreaRef}
        className="flex-1 overflow-auto py-2 sm:py-4 px-2 sm:px-4"
      >
        {/* Loading state */}
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
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-xl transition-colors active:scale-95 shadow-md"
            </button>
          </div>
        )}

        {/* Vertical Pages List */}
        {!isLoading && !error && numPages > 0 && (
          <div className="flex flex-col items-center min-w-max mx-auto">
            {Array.from({ length: numPages }, (_, i) => i + 1).map((pNum) => (
              <PdfPageItem
                key={pNum}
                doc={pdfDocRef.current}
                pageNum={pNum}
                scale={scale}
                watermarkLabel={watermarkLabelRef.current}
                drawWatermark={drawWatermark}
                defaultWidth={pageWidthRef.current || 595}
                registerRef={registerPageRef}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

