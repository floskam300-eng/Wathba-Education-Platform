import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: 'AIzaSyBd0Oc_kNJig2VhP91bI90x4XrcXHhqU04',
  authDomain: 'wathba-education-platform.firebaseapp.com',
  projectId: 'wathba-education-platform',
  storageBucket: 'wathba-education-platform.firebasestorage.app',
  messagingSenderId: '827312209667',
  appId: '1:827312209667:web:399a23817bd2a51fa1b336',
  measurementId: 'G-K7N8D7W9PD',
};

const app = initializeApp(firebaseConfig);
export const messaging = getMessaging(app);
export { getToken, onMessage };
