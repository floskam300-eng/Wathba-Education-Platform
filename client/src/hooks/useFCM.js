import { useEffect, useRef } from 'react';
import { messaging, getToken, onMessage } from '../lib/firebase';
import api from '../lib/api';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

function isInIframe() {
  try { return window.self !== window.top; } catch (_) { return true; }
}

function isSupported() {
  return (
    !isInIframe() &&
    'serviceWorker' in navigator &&
    'Notification' in window &&
    !!VAPID_KEY &&
    !!messaging
  );
}

// ── Internal: register SW, get token, save to server ──────────────────────────
async function _doSetup() {
  await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
  const swReg = await navigator.serviceWorker.ready;

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: swReg,
  });

  if (!token) {
    console.warn('[FCM] No registration token received — check VAPID key');
    return false;
  }

  await api.post('/notifications/fcm-token', { token });
  console.info('[FCM] Push notifications enabled successfully');
  return true;
}

// ── Exported: user-triggered setup (call on button click) ─────────────────────
// Returns: 'granted' | 'denied' | 'unsupported' | 'error'
export async function setupFCM() {
  if (!isSupported()) return 'unsupported';
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';
    await _doSetup();
    return 'granted';
  } catch (err) {
    console.error('[FCM] Setup failed:', err.message || err);
    return 'error';
  }
}

// ── Hook: silently enables FCM if permission already granted ──────────────────
// Does NOT prompt the user — call setupFCM() on user action for that.
export function useFCM(enabled) {
  const setupDone = useRef(false);
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    if (!enabled || setupDone.current) return;
    if (!isSupported()) return;
    if (Notification.permission !== 'granted') return; // don't auto-prompt

    const setup = async () => {
      try {
        const ok = await _doSetup();
        if (!ok) return;
        setupDone.current = true;

        // Foreground FCM messages: keep channel alive silently.
        // SSE (useSSE.js) already shows real-time toasts while the app is open.
        unsubscribeRef.current = onMessage(messaging, (_payload) => {});
      } catch (err) {
        console.error('[FCM] Auto-setup failed:', err.message || err);
      }
    };

    setup();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [enabled]);
}
