import { useEffect, useRef } from 'react';
import { messaging, getToken, onMessage } from '../lib/firebase';
import api from '../lib/api';
import toast from 'react-hot-toast';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

function isInIframe() {
  try { return window.self !== window.top; } catch (_) { return true; }
}

export function useFCM(enabled) {
  const setupDone = useRef(false);
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    if (!enabled || setupDone.current) return;

    if (isInIframe()) {
      console.info('[FCM] Running inside iframe — push permission unavailable in this context. Will work on the deployed domain.');
      return;
    }

    if (!('serviceWorker' in navigator) || !('Notification' in window)) {
      console.warn('[FCM] Service workers or Notifications not supported by this browser');
      return;
    }

    if (!VAPID_KEY || !messaging) {
      console.warn('[FCM] Firebase not configured — push notifications disabled');
      return;
    }

    const setup = async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          console.warn('[FCM] Notification permission denied by user');
          return;
        }

        await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
        const swReg = await navigator.serviceWorker.ready;

        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        });

        if (!token) {
          console.warn('[FCM] No registration token received — check VAPID key');
          return;
        }

        await api.post('/notifications/fcm-token', { token });
        setupDone.current = true;
        console.info('[FCM] Push notifications enabled successfully');

        // Foreground FCM messages are intentionally not toasted here.
        // SSE (useSSE.js) already handles real-time toasts while the app is open.
        // Showing both would double every notification for connected users.
        // The service worker (firebase-messaging-sw.js) handles background push display.
        unsubscribeRef.current = onMessage(messaging, (_payload) => {
          // Silently keep the FCM channel alive so background notifications still work.
        });
      } catch (err) {
        console.error('[FCM] Setup failed:', err.message || err);
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
