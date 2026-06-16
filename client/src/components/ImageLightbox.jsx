import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, ZoomOut } from 'lucide-react';

export default function ImageLightbox({ src, alt = '', onClose }) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });

  const pinchStartDistRef = useRef(null);
  const pinchStartScaleRef = useRef(1);
  const lastTapRef = useRef(0);
  const dragStartRef = useRef(null);
  const isDraggingRef = useRef(false);

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
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.hypot(dx, dy);
      pinchStartScaleRef.current = scale;
      isDraggingRef.current = false;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapRef.current < 280) {
        lastTapRef.current = 0;
        setScale(s => {
          if (s > 1) { setTranslate({ x: 0, y: 0 }); return 1; }
          return 2.5;
        });
      } else {
        lastTapRef.current = now;
        dragStartRef.current = {
          x: e.touches[0].clientX - translate.x,
          y: e.touches[0].clientY - translate.y,
        };
        isDraggingRef.current = true;
      }
    }
  }, [scale, translate]);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    if (e.touches.length === 2 && pinchStartDistRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const newScale = Math.min(5, Math.max(1, pinchStartScaleRef.current * (dist / pinchStartDistRef.current)));
      setScale(newScale);
      if (newScale <= 1) setTranslate({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && isDraggingRef.current && dragStartRef.current) {
      setScale(s => {
        if (s <= 1) return s;
        setTranslate({
          x: e.touches[0].clientX - dragStartRef.current.x,
          y: e.touches[0].clientY - dragStartRef.current.y,
        });
        return s;
      });
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    pinchStartDistRef.current = null;
    isDraggingRef.current = false;
    dragStartRef.current = null;
  }, []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    setScale(s => {
      const ns = Math.min(5, Math.max(1, s * factor));
      if (ns <= 1) setTranslate({ x: 0, y: 0 });
      return ns;
    });
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/96 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget && scale === 1) onClose(); }}
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
          transition: isDraggingRef.current || pinchStartDistRef.current ? 'none' : 'transform 0.15s ease',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
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
