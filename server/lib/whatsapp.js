/**
 * WhatsApp Integration via Baileys
 * Manages per-teacher WhatsApp Web connections
 */

const path = require('path');
const fs   = require('fs');

const SESSION_BASE = path.join(__dirname, '../../whatsapp-sessions');

// In-memory map: teacherId -> { socket, status, qrBase64 }
const connections = new Map();

function getSessionDir(teacherId) {
  return path.join(SESSION_BASE, String(teacherId));
}

// Format Egyptian/international phone → WhatsApp JID
function formatPhone(phone) {
  if (!phone) return null;
  let p = String(phone).replace(/[\s\-\+\(\)]/g, '');
  if (p.startsWith('01') && p.length === 11) p = '20' + p;
  if (p.startsWith('00')) p = p.slice(2);
  if (!p || p.length < 7) return null;
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
    makeWASocket            = baileys.default || baileys.makeWASocket;
    DisconnectReason        = baileys.DisconnectReason;
    useMultiFileAuthState   = baileys.useMultiFileAuthState;
    fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
    pino = require('pino');
  } catch (e) {
    throw new Error('مكتبة WhatsApp غير مثبتة: ' + e.message);
  }

  const sessionDir = getSessionDir(teacherId);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  const existing = connections.get(teacherId);
  if (existing?.socket) {
    try { existing.socket.end(undefined); } catch (_) {}
  }

  const conn = { status: 'connecting', qrBase64: null, socket: null };
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
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
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
      c.status = 'connected';
      c.qrBase64 = null;
      console.log(`[WhatsApp] Teacher ${teacherId} connected ✓`);
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      console.log(`[WhatsApp] Teacher ${teacherId} disconnected (code=${code})`);

      if (loggedOut) {
        try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (_) {}
        connections.set(teacherId, { status: 'not_setup', qrBase64: null, socket: null });
      } else {
        c.status = 'reconnecting';
        setTimeout(() => initConnection(teacherId).catch(e => {
          console.error('[WhatsApp] Reconnect failed:', e.message);
          connections.set(teacherId, { status: 'disconnected', qrBase64: null, socket: null });
        }), 5000);
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
  connections.set(teacherId, { status: 'not_setup', qrBase64: null, socket: null });
}

async function sendMessage(teacherId, phone, message) {
  const conn = connections.get(teacherId);
  if (!conn || conn.status !== 'connected' || !conn.socket) {
    throw new Error('واتساب غير متصل');
  }
  const jid = formatPhone(phone);
  if (!jid) throw new Error(`رقم غير صالح: ${phone}`);
  await conn.socket.sendMessage(jid, { text: message });
}

async function restoreConnections() {
  if (!fs.existsSync(SESSION_BASE)) return;
  let dirs;
  try { dirs = fs.readdirSync(SESSION_BASE); } catch (_) { return; }
  for (const dir of dirs) {
    const teacherId = parseInt(dir, 10);
    if (!isNaN(teacherId) && hasSession(teacherId)) {
      console.log(`[WhatsApp] Restoring session for teacher ${teacherId}`);
      initConnection(teacherId).catch(e =>
        console.error(`[WhatsApp] Restore failed teacher ${teacherId}:`, e.message)
      );
    }
  }
}

module.exports = { initConnection, getStatus, disconnect, hasSession, sendMessage, formatPhone, restoreConnections };
