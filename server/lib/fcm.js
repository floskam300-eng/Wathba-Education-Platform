const admin = require('firebase-admin');

let messaging = null;

function initFCM() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    console.log('[FCM] FIREBASE_SERVICE_ACCOUNT_JSON not set — push notifications disabled');
    return;
  }
  try {
    const serviceAccount = JSON.parse(raw);
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    messaging = admin.messaging();
    console.log('[FCM] Firebase Admin initialized successfully');
  } catch (err) {
    console.error('[FCM] Failed to initialize:', err.message);
  }
}

async function sendFCMToTokens(tokens, title, body, data = {}) {
  if (!messaging) return;
  const validTokens = (tokens || []).filter(Boolean);
  if (!validTokens.length) return;
  try {
    const stringData = {};
    for (const [k, v] of Object.entries(data)) {
      if (v != null) stringData[k] = String(v);
    }
    const response = await messaging.sendEachForMulticast({
      notification: { title, body },
      data: stringData,
      webpush: {
        notification: {
          title,
          body,
          icon: '/wathba-logo.png',
          badge: '/wathba-logo.png',
          dir: 'rtl',
          lang: 'ar',
          tag: 'wathba-notification',
        },
        fcmOptions: { link: '/' },
      },
      tokens: validTokens,
    });
    const failed = response.responses.filter(r => !r.success);
    if (failed.length) {
      console.log(`[FCM] ${response.successCount} sent, ${response.failureCount} failed`);
    }
  } catch (err) {
    console.error('[FCM] sendEachForMulticast error:', err.message);
  }
}

async function sendFCMToStudents(pool, studentIds, title, body, data = {}) {
  if (!messaging || !studentIds || !studentIds.length) return;
  try {
    const result = await pool.query(
      'SELECT fcm_token FROM students WHERE id = ANY($1) AND fcm_token IS NOT NULL',
      [studentIds]
    );
    const tokens = result.rows.map(r => r.fcm_token).filter(Boolean);
    if (tokens.length) await sendFCMToTokens(tokens, title, body, data);
  } catch (err) {
    console.error('[FCM] sendFCMToStudents error:', err.message);
  }
}

module.exports = { initFCM, sendFCMToTokens, sendFCMToStudents };
