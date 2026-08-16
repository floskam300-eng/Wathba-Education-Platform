import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ZoomIn, RefreshCw, AlertTriangle, Image as ImageIcon, ExternalLink } from 'lucide-react';
import { withToken, refreshMediaToken } from '../../lib/mediaAccess';

/**
 * QuestionImage
 *
 * Resilient, accessible image loader for exams, quizzes, and recitations.
 * - Automatic retry with exponential backoff on transient network drops.
 * - Token-refresh recovery on 401 / expired media tokens.
 * - Smooth skeleton loading indicator.
 * - Graceful fallback UI with manual retry button (NEVER silently disappears).
 * - Full Dark Mode & Lightbox support.
 */
export default function QuestionImage({
  src,
  alt = 'صورة السؤال',
  className = '',
  containerClassName = '',
  maxHeightClass = 'max-h-64 sm:max-h-80',
  onImagePress,
  showZoomButton = true,
  dark = false,
}) {
  const [status, setStatus] = useState('loading'); // 'loading' | 'loaded' | 'error'
  const [retryCount, setRetryCount] = useState(0);
  const [cacheBuster, setCacheBuster] = useState(0);
  const isMountedRef = useRef(true);

  const MAX_AUTO_RETRIES = 2;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Reset state whenever src changes
  useEffect(() => {
    setStatus('loading');
    setRetryCount(0);
    setCacheBuster(0);
  }, [src]);

  // Compute resolved URL with auth token
  const resolvedUrl = React.useMemo(() => {
    if (!src) return '';
    const base = withToken(src);
    if (!cacheBuster) return base;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}_retry=${cacheBuster}`;
  }, [src, cacheBuster]);

  const handleManualRetry = useCallback(async () => {
    setStatus('loading');
    // Attempt token refresh in case 401 was the cause
    try {
      await refreshMediaToken();
    } catch (_) {}
    if (isMountedRef.current) {
      setCacheBuster((c) => c + 1);
    }
  }, []);

  const handleError = useCallback(async () => {
    if (!isMountedRef.current) return;

    if (retryCount < MAX_AUTO_RETRIES) {
      // Auto retry after a short delay
      const nextRetry = retryCount + 1;
      setRetryCount(nextRetry);

      // If possibly a token issue, refresh token ahead of retry
      if (nextRetry === 1) {
        try {
          await refreshMediaToken();
        } catch (_) {}
      }

      setTimeout(() => {
        if (isMountedRef.current) {
          setCacheBuster((c) => c + 1);
        }
      }, 1000 * nextRetry);
    } else {
      setStatus('error');
    }
  }, [retryCount]);

  const handleLoad = useCallback(() => {
    if (isMountedRef.current) {
      setStatus('loaded');
    }
  }, []);

  if (!src) return null;

  return (
    <div className={`relative rounded-xl overflow-hidden mb-3 select-none ${containerClassName}`}>
      {/* Loading Skeleton */}
      {status === 'loading' && (
        <div
          className={`w-full min-h-[140px] ${maxHeightClass} flex flex-col items-center justify-center gap-2 rounded-xl border animate-pulse transition-colors ${
            dark
              ? 'bg-purple-950/20 border-purple-900/30 text-purple-300'
              : 'bg-gray-50 border-gray-200 text-gray-400'
          }`}
        >
          <ImageIcon className="w-8 h-8 opacity-60 animate-bounce" />
          <span className="text-xs font-semibold">
            {retryCount > 0 ? `إعادة محاولة تحميل الصورة (${retryCount}/${MAX_AUTO_RETRIES})...` : 'جاري تحميل الصورة...'}
          </span>
        </div>
      )}

      {/* Error / Fallback UI */}
      {status === 'error' && (
        <div
          className={`w-full p-4 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-right ${
            dark
              ? 'bg-amber-950/20 border-amber-900/40 text-amber-300'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-500" />
            <div className="text-xs sm:text-sm font-medium">
              <span>تعذر تحميل الصورة (تحقق من اتصال الإنترنت)</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <button
              type="button"
              onClick={handleManualRetry}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-sm transition-all active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              إعادة المحاولة
            </button>
            {src.startsWith('http') && (
              <a
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-black/10 hover:bg-black/20 transition-colors"
                title="فتح الرابط المباشر"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                فتح الرابط
              </a>
            )}
          </div>
        </div>
      )}

      {/* Actual Image */}
      <img
        src={resolvedUrl}
        alt={alt}
        loading="eager"
        decoding="async"
        onLoad={handleLoad}
        onError={handleError}
        onClick={onImagePress ? () => onImagePress(resolvedUrl) : undefined}
        className={`w-full ${maxHeightClass} object-contain rounded-xl border transition-opacity duration-300 ${
          status === 'loaded' ? 'opacity-100 block' : 'opacity-0 absolute inset-0 pointer-events-none'
        } ${dark ? 'border-[var(--dk-border)] bg-black/10' : 'border-gray-100 bg-gray-50/50'} ${
          onImagePress ? 'cursor-zoom-in' : ''
        } ${className}`}
      />

      {/* Lightbox Zoom Icon Button */}
      {status === 'loaded' && showZoomButton && onImagePress && (
        <button
          type="button"
          onClick={() => onImagePress(resolvedUrl)}
          className="absolute top-2 left-2 bg-black/50 hover:bg-black/75 active:scale-95 text-white rounded-lg p-1.5 transition-all shadow-sm"
          title="تكبير الصورة"
          aria-label="تكبير الصورة"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
