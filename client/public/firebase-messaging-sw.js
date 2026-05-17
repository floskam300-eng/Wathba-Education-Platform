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

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'وثبة التعليمية';
  const body  = payload.notification?.body  || '';
  self.registration.showNotification(title, {
    body,
    icon:  '/wathba_logo.png',
    badge: '/wathba_logo.png',
    dir:   'rtl',
    lang:  'ar',
    tag:   'wathba-notification',
    data:  payload.data || {},
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/student');
    })
  );
});
