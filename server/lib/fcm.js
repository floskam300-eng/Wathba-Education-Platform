const admin = require('firebase-admin');

let messaging = null;

function initFCM() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return;
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

async function sendFCMToTokens(tokens, title, body, data = {}, pool = null) {
  if (!messaging) return;
  const validTokens = (tokens || []).filter(Boolean);
  if (!validTokens.length) return;
  try {
    const stringData = {};
    for (const [k, v] of Object.entries(data)) {
      if (v != null) {
        stringData[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
      }
    }
    const result = await messaging.sendEachForMulticast({
      data: { title, body, ...stringData },
      webpush: {
        headers: { Urgency: 'high' },
        data: { title, body, ...stringData },
      },
      tokens: validTokens,
    });

    // [NOTIF-FIX] Remove stale / invalid tokens so future sends don't silently fail.
    // Tokens become invalid when the user uninstalls the app, revokes notification
    // permission, or the FCM registration expires. Without cleanup, every subsequent
    // push to that student is a guaranteed no-op.
    if (pool && result.responses) {
      const staleTokens = [];
      result.responses.forEach((resp, i) => {
        if (!resp.success) {
          const code = resp.error?.code || '';
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/invalid-argument'
          ) {
            staleTokens.push(validTokens[i]);
          }
        }
      });
      if (staleTokens.length > 0) {
        pool.query(
          'UPDATE students SET fcm_token = NULL WHERE fcm_token = ANY($1)',
          [staleTokens]
        ).catch(err => console.error('[FCM] stale token cleanup error:', err.message));
        console.log(`[FCM] Removed ${staleTokens.length} stale token(s)`);
      }
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
    // Pass pool so sendFCMToTokens can clean up stale tokens automatically
    if (tokens.length) await sendFCMToTokens(tokens, title, body, data, pool);
  } catch (err) {
    console.error('[FCM] sendFCMToStudents error:', err.message);
  }
}


module.exports = { initFCM, sendFCMToTokens, sendFCMToStudents };
