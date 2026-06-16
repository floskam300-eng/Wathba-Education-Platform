import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, ZoomOut } from 'lucide-react';

const MIN_SCALE = 1;
const MAX_SCALE = 5;

function clampTranslate(x, y, scale) {
  const maxX = window.innerWidth  * (scale - 1) / 2;
  const maxY = window.innerHeight * (scale - 1) / 2;
  return {
    x: Math.max(-maxX, Math.min(maxX, x)),
    y: Math.max(-maxY, Math.min(maxY, y)),
  };
}

export default function ImageLightbox({ src, alt = '', onClose }) {
  const [scale, setScale]         = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isGesturing, setIsGesturing] = useState(false);

  // Refs for synchronous reads inside event handlers (avoid stale closures)
  const scaleRef     = useRef(1);
  const translateRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef(null);

  const pinchStartDistRef  = useRef(null);
  const pinchStartScaleRef = useRef(1);
  const lastTapRef         = useRef(0);
  const dragStartRef       = useRef(null);

  // Keep refs in sync with state
  const applyScale = useCallback((newScale) => {
    scaleRef.current = newScale;
    setScale(newScale);
  }, []);

  const applyTranslate = useCallback((newTrans) => {
    translateRef.current = newTrans;
    setTranslate(newTrans);
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const resetZoom = useCallback(() => {
    applyScale(1);
    applyTranslate({ x: 0, y: 0 });
  }, [applyScale, applyTranslate]);

  // [IL-6 FIX] Use translateRef instead of translate state so handleTouchStart
  // is not re-created on every translate change.
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      // [IL-5 FIX] Clear lastTap to prevent accidental double-tap after pinch
      lastTapRef.current = 0;
      dragStartRef.current = null;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current  = Math.hypot(dx, dy);
      pinchStartScaleRef.current = scaleRef.current;
      setIsGesturing(true);
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapRef.current < 280) {
        lastTapRef.current = 0;
        // [IL-1 FIX] Read scale from ref, update both in sequence (no nested setState)
        const newScale = scaleRef.current > 1 ? 1 : 2.5;
        applyScale(newScale);
        if (newScale === 1) applyTranslate({ x: 0, y: 0 });
      } else {
        lastTapRef.current = now;
        dragStartRef.current = {
          x: e.touches[0].clientX - translateRef.current.x,
          y: e.touches[0].clientY - translateRef.current.y,
        };
        setIsGesturing(true);
      }
    }
  }, [applyScale, applyTranslate]);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    if (e.touches.length === 2 && pinchStartDistRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE,
        pinchStartScaleRef.current * (dist / pinchStartDistRef.current)));
      applyScale(newScale);
      if (newScale <= 1) applyTranslate({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && dragStartRef.current) {
      // [IL-1 FIX] Direct setTranslate — no longer nested inside setScale callback
      if (scaleRef.current <= 1) return;
      const rawX = e.touches[0].clientX - dragStartRef.current.x;
      const rawY = e.touches[0].clientY - dragStartRef.current.y;
      // [IL-4 FIX] Clamp so image never fully leaves the viewport
      applyTranslate(clampTranslate(rawX, rawY, scaleRef.current));
    }
  }, [applyScale, applyTranslate]);

  const handleTouchEnd = useCallback(() => {
    pinchStartDistRef.current = null;
    dragStartRef.current      = null;
    setIsGesturing(false);
  }, []);

  // [IL-2 FIX] Attach wheel listener manually with { passive: false } so
  // e.preventDefault() actually works in Chrome/Safari (React's onWheel cannot
  // set passive:false, causing the browser to ignore preventDefault).
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scaleRef.current * factor));
    applyScale(newScale);
    // [IL-4 FIX] Also clamp translate on zoom-out to prevent out-of-bounds state
    if (newScale <= 1) {
      applyTranslate({ x: 0, y: 0 });
    } else {
      applyTranslate(clampTranslate(translateRef.current.x, translateRef.current.y, newScale));
    }
  }, [applyScale, applyTranslate]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] bg-black/96 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget && scaleRef.current === 1) onClose(); }}
    >
      <button
        onClick={onClose}
        className="absolute z-10 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)', insetInlineStart: '16px' }}
        aria-label="إغلاق"
      >
        <X className="w-6 h-6" />
      </button>

      {scale > 1 ? (
        <button
          onClick={resetZoom}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 hover:bg-white/30 text-white text-sm font-bold transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
          إعادة الحجم
        </button>
      ) : (
        <p className="absolute bottom-10 left-1/2 -translate-x-1/2 text-white/40 text-xs font-medium pointer-events-none whitespace-nowrap">
          اضغط مرتين للتكبير · اسحب بعد التكبير
        </p>
      )}

      <div
        style={{
          transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
          transformOrigin: 'center center',
          cursor: scale > 1 ? 'grab' : 'default',
          touchAction: 'none',
          willChange: 'transform',
          // [IL-3 FIX] Use isGesturing STATE (not ref) so React re-renders and
          // correctly removes the transition during active drag/pinch.
          transition: isGesturing ? 'none' : 'transform 0.15s ease',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <img
          src={src}
          alt={alt}
          style={{
            maxWidth: '95vw',
            maxHeight: '85vh',
            objectFit: 'contain',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            pointerEvents: 'none',
            display: 'block',
          }}
          draggable={false}
        />
      </div>
    </div>
  );
}
