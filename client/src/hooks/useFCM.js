import { useEffect, useRef } from 'react';
import { messaging, getToken, onMessage } from '../lib/firebase';
import api from '../lib/api';
import toast from 'react-hot-toast';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export function useFCM(enabled) {
  const setupDone = useRef(false);

  useEffect(() => {
    if (!enabled || setupDone.current) return;
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return;
    if (!VAPID_KEY) {
      console.warn('[FCM] VITE_FIREBASE_VAPID_KEY not set — push notifications disabled');
      return;
    }

    const setup = async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          console.log('[FCM] Notification permission denied');
          return;
        }

        const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
          scope: '/',
        });

        await navigator.serviceWorker.ready;

        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        });

        if (token) {
          await api.post('/notifications/fcm-token', { token });
          setupDone.current = true;
          console.log('[FCM] Token registered successfully');
        }

        onMessage(messaging, (payload) => {
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
        console.error('[FCM] Setup error:', err);
      }
    };

    setup();
  }, [enabled]);
}
