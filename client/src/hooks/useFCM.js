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

        unsubscribeRef.current = onMessage(messaging, (payload) => {
          const title = payload.notification?.title || '';
          const body  = payload.notification?.body  || '';
          const text  = [title, body].filter(Boolean).join(' — ');
          if (text) {
            toast(`🔔 ${text}`, {
              duration: 7000,
              style: { fontFamily: 'inherit', direction: 'rtl' },
            });
          }
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
