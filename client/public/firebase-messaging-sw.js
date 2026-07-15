importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBd0Oc_kNJig2VhP91bI90x4XrcXHhqU04',
  authDomain: 'wathba-education-platform.firebaseapp.com',
  projectId: 'wathba-education-platform',
  storageBucket: 'wathba-education-platform.firebasestorage.app',
  messagingSenderId: '827312209667',
  appId: '1:827312209667:web:399a23817bd2a51fa1b336',
});

const messaging = firebase.messaging();

// Data-only messages always route here regardless of foreground/background.
// We read from payload.data (server sends { title, body, type }).
messaging.onBackgroundMessage((payload) => {
  const data  = payload.data || {};
  const title = data.title || payload.notification?.title || 'وثبة التعليمية';
  const body  = data.body  || payload.notification?.body  || '';

  // Unique tag per notification so they stack instead of replacing each other
  const tag = 'wathba-' + Date.now();

  self.registration.showNotification(title, {
    body,
    icon:  '/wathba-logo.png',
    badge: '/wathba-logo.png',
    dir:   'rtl',
    lang:  'ar',
    tag,
    data:  data,
    requireInteraction: false,
    silent: false,
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/student';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(link);
    })
  );
});
