import { useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';

// [L-5] FIX: report capture attempts to the server so they are persisted in
// the DB and visible to the teacher — purely client-side blocking is trivially
// bypassed, but server-side logging makes violations auditable.
// Fire-and-forget: never blocks the user flow, never throws.
let _lastReportedAt = 0;
const REPORT_DEBOUNCE_MS = 3000; // at most one report per 3 s per tab

function reportAttemptToServer(type) {
  const now = Date.now();
  if (now - _lastReportedAt < REPORT_DEBOUNCE_MS) return;
  _lastReportedAt = now;
  try {
    api.post('/events/capture-attempt', { type }).catch(() => {});
  } catch (_) {}
}

export function useAntiCapture({ onAttempt, examId } = {}) {
  const examIdRef = useRef(examId);
  examIdRef.current = examId;

  const notify = useCallback((type = 'unknown') => {
    reportAttemptToServer(type);
    if (onAttempt) onAttempt(type);
  }, [onAttempt]);

  useEffect(() => {
    const blockContext = (e) => e.preventDefault();
    document.addEventListener('contextmenu', blockContext);

    const blockKeys = (e) => {
      const key = e.key?.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      if (key === 'printscreen') {
        e.preventDefault();
        notify('printscreen');
        return;
      }
      if (key === 'f12') { e.preventDefault(); return; }
      if (ctrl && key === 'p') { e.preventDefault(); return; }
      if (ctrl && key === 's') { e.preventDefault(); return; }
      if (ctrl && shift && (key === 'i' || key === 'c' || key === 'j' || key === 'k')) {
        e.preventDefault();
        return;
      }
      if (ctrl && key === 'u') { e.preventDefault(); return; }
    };
    document.addEventListener('keydown', blockKeys, true);

    const blockKeyUp = (e) => {
      if (e.key === 'PrintScreen') {
        try { navigator.clipboard.writeText(''); } catch (_) {}
        notify('printscreen_up');
      }
    };
    document.addEventListener('keyup', blockKeyUp, true);

    const blockDrag = (e) => e.preventDefault();
    document.addEventListener('dragstart', blockDrag);

    const blockSelect = (e) => e.preventDefault();
    document.addEventListener('selectstart', blockSelect);

    // [L-5] Detect tab/window visibility changes — common precursor to
    // OS-level screenshots or screen recording via another app
    const handleVisibilityChange = () => {
      if (document.hidden) {
        notify('visibility_hidden');
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    let origGetDisplayMedia = null;
    if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
      origGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getDisplayMedia = async () => {
        notify('screen_capture_api');
        throw new DOMException('Screen capture is not permitted on this platform.', 'NotAllowedError');
      };
    }

    return () => {
      document.removeEventListener('contextmenu', blockContext);
      document.removeEventListener('keydown', blockKeys, true);
      document.removeEventListener('keyup', blockKeyUp, true);
      document.removeEventListener('dragstart', blockDrag);
      document.removeEventListener('selectstart', blockSelect);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (origGetDisplayMedia && navigator.mediaDevices) {
        navigator.mediaDevices.getDisplayMedia = origGetDisplayMedia;
      }
    };
  }, [notify]);
}
