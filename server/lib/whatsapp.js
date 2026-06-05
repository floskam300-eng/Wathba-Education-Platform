/**
 * WhatsApp Integration via Baileys
 * Manages per-teacher WhatsApp Web connections
 */

const path = require('path');
const fs   = require('fs');

const SESSION_BASE  = path.join(__dirname, '../../whatsapp-sessions');
const MAX_RETRIES   = 5;   // max auto-reconnect attempts before giving up
const RETRY_BASE_MS = 5000; // base delay; multiplied by attempt number (5s, 10s, 15s…)

// In-memory map: teacherId -> { socket, status, qrBase64, retryCount }
const connections = new Map();

function getSessionDir(teacherId) {
  // teacherId comes from JWT (integer) — safe to use as dir name
  return path.join(SESSION_BASE, String(parseInt(teacherId, 10)));
}

// Normalise Egyptian / international phone numbers to WhatsApp JID
function formatPhone(phone) {
  if (!phone) return null;
  let p = String(phone).replace(/[\s\-\+\(\)]/g, '');
  // Egyptian mobile: 01xxxxxxxxx (11 digits) → strip leading 0 and prepend 20
  // e.g. 01012345678 → 201012345678 (12 digits)
  if (p.startsWith('01') && p.length === 11) p = '20' + p.slice(1);
  // International with 00 prefix → strip leading zeros
  if (p.startsWith('00')) p = p.slice(2);
  // Minimum 10 digits required for any valid international mobile number
  if (!p || p.length < 10) return null;
  return p + '@s.whatsapp.net';
}

function hasSession(teacherId) {
  const dir = getSessionDir(teacherId);
  return fs.existsSync(path.join(dir, 'creds.json'));
}

function getStatus(teacherId) {
  const conn = connections.get(teacherId);
  if (!conn) {
    return { status: hasSession(teacherId) ? 'disconnected' : 'not_setup', qrBase64: null };
  }
  return { status: conn.status, qrBase64: conn.qrBase64 || null };
}

async function initConnection(teacherId) {
  let makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, pino;
  try {
    const baileys = require('@whiskeysockets/baileys');
    makeWASocket              = baileys.default || baileys.makeWASocket;
    DisconnectReason          = baileys.DisconnectReason;
    useMultiFileAuthState     = baileys.useMultiFileAuthState;
    fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
    pino = require('pino');
  } catch (e) {
    throw new Error('مكتبة WhatsApp غير مثبتة: ' + e.message);
  }

  const sessionDir = getSessionDir(teacherId);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  // Close any existing socket gracefully before creating a new one
  const existing = connections.get(teacherId);
  const retryCount = existing?.retryCount || 0;
  if (existing?.socket) {
    try { existing.socket.end(undefined); } catch (_) {}
  }

  const conn = { status: 'connecting', qrBase64: null, socket: null, retryCount };
  connections.set(teacherId, conn);

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  let version;
  try {
    const v = await fetchLatestBaileysVersion();
    version = v.version;
  } catch (_) {
    version = [2, 3000, 1015901307];
  }

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['وثبة منصة', 'Chrome', '120.0.0'],
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    keepAliveIntervalMs: 25_000,
  });

  conn.socket = sock;
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    const c = connections.get(teacherId);
    if (!c) return;

    if (qr) {
      try {
        const qrcode = require('qrcode');
        c.qrBase64 = await qrcode.toDataURL(qr, { width: 300 });
        c.status = 'qr_ready';
        console.log(`[WhatsApp] QR ready for teacher ${teacherId}`);
      } catch (e) {
        console.error('[WhatsApp] QR gen error:', e.message);
      }
    }

    if (connection === 'open') {
      c.status     = 'connected';
      c.qrBase64   = null;
      c.retryCount = 0;   // reset on successful connection
      console.log(`[WhatsApp] Teacher ${teacherId} connected ✓`);
    }

    if (connection === 'close') {
      const code      = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      console.log(`[WhatsApp] Teacher ${teacherId} disconnected (code=${code})`);

      if (loggedOut) {
        // Credentials invalidated — wipe session and mark as not_setup
        try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (_) {}
        connections.set(teacherId, { status: 'not_setup', qrBase64: null, socket: null, retryCount: 0 });
      } else if (c.retryCount < MAX_RETRIES) {
        // Transient failure — retry with linear back-off (5s, 10s, 15s…)
        c.retryCount++;
        c.status = 'reconnecting';
        const delay = RETRY_BASE_MS * c.retryCount;
        console.log(`[WhatsApp] Retrying teacher ${teacherId} in ${delay / 1000}s (attempt ${c.retryCount}/${MAX_RETRIES})`);
        setTimeout(() => {
          initConnection(teacherId).catch(err => {
            console.error('[WhatsApp] Reconnect failed:', err.message);
            const cur = connections.get(teacherId);
            if (cur) cur.status = 'disconnected';
          });
        }, delay);
      } else {
        // Exhausted retries — stop trying
        console.log(`[WhatsApp] Teacher ${teacherId} max retries reached — giving up`);
        connections.set(teacherId, { status: 'disconnected', qrBase64: null, socket: null, retryCount: 0 });
      }
    }
  });

  return sock;
}

function disconnect(teacherId) {
  const conn = connections.get(teacherId);
  if (conn?.socket) {
    try { conn.socket.logout(); } catch (_) {}
    try { conn.socket.end(undefined); } catch (_) {}
  }
  const sessionDir = getSessionDir(teacherId);
  try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (_) {}
  connections.set(teacherId, { status: 'not_setup', qrBase64: null, socket: null, retryCount: 0 });
}

async function sendMessage(teacherId, phone, message) {
  const conn = connections.get(teacherId);
  if (!conn || conn.status !== 'connected' || !conn.socket) {
    throw new Error('واتساب غير متصل');
  }
  const jid = formatPhone(phone);
  if (!jid) throw new Error(`رقم غير صالح: ${phone}`);

  // Timeout guard: if Baileys hangs, reject after 30s to unblock the send loop.
  // clearTimeout in finally prevents a timer leak on every successful send.
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('انتهت مهلة الإرسال (30s)')), 30_000);
  });
  try {
    await Promise.race([
      conn.socket.sendMessage(jid, { text: message }),
      timeout,
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function restoreConnections() {
  if (!fs.existsSync(SESSION_BASE)) return;
  let dirs;
  try { dirs = fs.readdirSync(SESSION_BASE); } catch (_) { return; }
  for (const dir of dirs) {
    const teacherId = parseInt(dir, 10);
    if (!isNaN(teacherId) && teacherId > 0 && hasSession(teacherId)) {
      console.log(`[WhatsApp] Restoring session for teacher ${teacherId}`);
      initConnection(teacherId).catch(e =>
        console.error(`[WhatsApp] Restore failed teacher ${teacherId}:`, e.message)
      );
    }
  }
}

module.exports = { initConnection, getStatus, disconnect, hasSession, sendMessage, formatPhone, restoreConnections };
