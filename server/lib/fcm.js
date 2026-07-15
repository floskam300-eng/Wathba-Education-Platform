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
  if (!messaging) {
    console.warn('[FCM] sendFCMToTokens called but messaging not initialized');
    return;
  }
  const validTokens = (tokens || []).filter(Boolean);
  if (!validTokens.length) {
    console.warn('[FCM] sendFCMToTokens called with no valid tokens');
    return;
  }
  try {
    const stringData = {};
    for (const [k, v] of Object.entries(data)) {
      if (v != null) {
        stringData[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
      }
    }
    const response = await messaging.sendEachForMulticast({
      data: { title, body, ...stringData },   // data-only → onBackgroundMessage always fires
      webpush: {
        headers: { Urgency: 'high' },
        data: { title, body, ...stringData },
      },
      tokens: validTokens,
    });
    console.log(`[FCM] sendEachForMulticast — success:${response.successCount} failed:${response.failureCount} of ${validTokens.length} token(s)`);
    if (response.failureCount > 0) {
      response.responses.forEach((r, i) => {
        if (!r.success) {
          console.error(`[FCM] Token[${i}] failed: ${r.error?.code} — ${r.error?.message}`);
        }
      });
    }
  } catch (err) {
    console.error('[FCM] sendEachForMulticast error:', err.message);
  }
}

async function sendFCMToStudents(pool, studentIds, title, body, data = {}) {
  if (!messaging) {
    console.warn('[FCM] sendFCMToStudents called but messaging not initialized');
    return;
  }
  if (!studentIds || !studentIds.length) return;
  try {
    const result = await pool.query(
      'SELECT id, fcm_token FROM students WHERE id = ANY($1) AND fcm_token IS NOT NULL',
      [studentIds]
    );
    const tokens = result.rows.map(r => r.fcm_token).filter(Boolean);
    console.log(`[FCM] sendFCMToStudents — ${studentIds.length} student(s) targeted, ${tokens.length} token(s) found`);
    if (tokens.length) await sendFCMToTokens(tokens, title, body, data);
  } catch (err) {
    console.error('[FCM] sendFCMToStudents error:', err.message);
  }
}

module.exports = { initFCM, sendFCMToTokens, sendFCMToStudents };
