import { useEffect, useCallback } from 'react';

export function useAntiCapture({ onAttempt } = {}) {
  const notify = useCallback(() => {
    if (onAttempt) onAttempt();
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
        notify();
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
        notify();
      }
    };
    document.addEventListener('keyup', blockKeyUp, true);

    const blockDrag = (e) => e.preventDefault();
    document.addEventListener('dragstart', blockDrag);

    const blockSelect = (e) => e.preventDefault();
    document.addEventListener('selectstart', blockSelect);

    let origGetDisplayMedia = null;
    if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
      origGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getDisplayMedia = async () => {
        notify();
        throw new DOMException('Screen capture is not permitted on this platform.', 'NotAllowedError');
      };
    }

    return () => {
      document.removeEventListener('contextmenu', blockContext);
      document.removeEventListener('keydown', blockKeys, true);
      document.removeEventListener('keyup', blockKeyUp, true);
      document.removeEventListener('dragstart', blockDrag);
      document.removeEventListener('selectstart', blockSelect);
      if (origGetDisplayMedia && navigator.mediaDevices) {
        navigator.mediaDevices.getDisplayMedia = origGetDisplayMedia;
      }
    };
  }, [notify]);
}
