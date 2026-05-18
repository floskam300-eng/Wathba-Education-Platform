import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { getGameConfig, BOSS_POINTS } from './gameConfig';
import api from '../../../lib/api';

// ── constants ──────────────────────────────────────────────────
const CW = 900;
const CH = 480;
const GROUND = CH - 70;
const PLAYER_X = 120;
const GRAVITY = 0.65;
const JUMP_V = -15;
const DUCK_H = 24;
const STAND_H = 52;
const BASE_SPD = 3.2;
const MAX_SPD = 8.5;

// Frame-based boss timing (at ~60fps)
const BOSS1_FRAME   = 30 * 60;       // boss 1 appears after 30 seconds
const BOSS_GAP_FRAMES = 120 * 60;    // 2 minutes gap between bosses
const BOSS_WARN_FRAMES = 10 * 60;    // warning 10 seconds before boss

// ── canvas helpers ─────────────────────────────────────────────
function rr(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function drawSky(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, CH);
  g.addColorStop(0, '#04040e'); g.addColorStop(1, '#120826');
  ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
}

function drawStars(ctx, stars, fr) {
  stars.forEach(s => {
    ctx.globalAlpha = 0.2 + 0.6 * Math.abs(Math.sin(fr * 0.016 * s.speed + s.phase));
    ctx.fillStyle = '#fff'; ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawMathBg(ctx, syms, off) {
  ctx.globalAlpha = 0.05; ctx.fillStyle = '#c084fc';
  syms.forEach(s => {
    const x = ((s.x - off * s.spd * 0.12) % (CW + 120) + CW + 120) % (CW + 120) - 60;
    ctx.font = `bold ${s.sz}px Georgia`; ctx.fillText(s.ch, x, s.y);
  });
  ctx.globalAlpha = 1;
}

function drawMountains(ctx, layers, off) {
  layers.forEach(l => {
    ctx.fillStyle = l.color;
    l.peaks.forEach(p => {
      const x = ((p.x - off * l.spd) % (CW + p.w * 2) + CW + p.w * 2) % (CW + p.w * 2) - p.w;
      ctx.beginPath(); ctx.moveTo(x, GROUND - 6);
      ctx.lineTo(x + p.w / 2, GROUND - p.h); ctx.lineTo(x + p.w, GROUND - 6);
      ctx.closePath(); ctx.fill();
    });
  });
}

function drawGround(ctx, off) {
  ctx.fillStyle = '#0e061e'; ctx.fillRect(0, GROUND, CW, CH - GROUND);
  ctx.shadowBlur = 10; ctx.shadowColor = '#7c3aed';
  ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(CW, GROUND); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(124,58,237,0.15)'; ctx.lineWidth = 1;
  const sp = 58, sx = -(off % sp);
  for (let x = sx; x < CW; x += sp) {
    ctx.beginPath(); ctx.moveTo(x, GROUND); ctx.lineTo(x - 36, CH); ctx.stroke();
  }
}

function drawStickman(ctx, px, py, frame, ducking, inv) {
  if (inv && Math.floor(frame * 0.1) % 2 === 1) return;
  const col = '#00ff88';
  ctx.strokeStyle = col; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
  ctx.shadowBlur = 11; ctx.shadowColor = col;

  if (ducking) {
    const hy = py - 26;
    ctx.beginPath(); ctx.arc(px, hy, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px, hy + 8); ctx.lineTo(px, hy + 22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px, hy + 13); ctx.lineTo(px - 18, hy + 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px, hy + 13); ctx.lineTo(px + 18, hy + 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px, hy + 22); ctx.lineTo(px - 14, hy + 34); ctx.lineTo(px - 7, hy + 34); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px, hy + 22); ctx.lineTo(px + 14, hy + 34); ctx.lineTo(px + 7, hy + 34); ctx.stroke();
  } else {
    const headY = py - 52;
    const shouldY = headY + 17;
    const hipY = headY + 36;
    ctx.beginPath(); ctx.arc(px, headY, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px, headY + 8); ctx.lineTo(px, hipY); ctx.stroke();
    const inAir = py < GROUND - 4;
    if (inAir) {
      ctx.beginPath(); ctx.moveTo(px, shouldY); ctx.lineTo(px - 20, shouldY - 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, shouldY); ctx.lineTo(px + 20, shouldY - 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, hipY); ctx.lineTo(px - 12, hipY + 18); ctx.lineTo(px - 16, hipY + 30); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, hipY); ctx.lineTo(px + 12, hipY + 18); ctx.lineTo(px + 16, hipY + 30); ctx.stroke();
    } else {
      const t = frame * 0.18;
      const sw = Math.sin(t);
      const cw = Math.cos(t);
      const armL = -sw * 16, armR = sw * 16;
      ctx.beginPath(); ctx.moveTo(px, shouldY); ctx.lineTo(px - 13 + armL, shouldY + 15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, shouldY); ctx.lineTo(px + 13 + armR, shouldY + 15); ctx.stroke();
      const lLthighX = sw * 9, lLfootX = sw * 18, lLkneeY = hipY + 16 - Math.abs(cw) * 5;
      ctx.beginPath(); ctx.moveTo(px, hipY); ctx.lineTo(px - 5 + lLthighX, lLkneeY); ctx.lineTo(px - 3 + lLfootX, hipY + 30); ctx.stroke();
      const lRthighX = -sw * 9, lRfootX = -sw * 18, lRkneeY = hipY + 16 - Math.abs(cw) * 5;
      ctx.beginPath(); ctx.moveTo(px, hipY); ctx.lineTo(px + 5 + lRthighX, lRkneeY); ctx.lineTo(px + 3 + lRfootX, hipY + 30); ctx.stroke();
    }
  }
  ctx.shadowBlur = 0;
}

function drawObstacle(ctx, ob) {
  if (ob.type === 'jump') {
    ctx.shadowBlur = 14; ctx.shadowColor = '#f97316';
    ctx.fillStyle = '#200800'; ctx.strokeStyle = '#f97316'; ctx.lineWidth = 2;
    rr(ctx, ob.x - 18, GROUND - ob.h, 36, ob.h, 6, true, true);
    ctx.fillStyle = '#f97316'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
    ctx.fillText('x²', ob.x, GROUND - ob.h / 2 + 5); ctx.shadowBlur = 0;
  } else {
    ctx.shadowBlur = 14; ctx.shadowColor = '#06b6d4';
    ctx.fillStyle = '#001520'; ctx.strokeStyle = '#06b6d4'; ctx.lineWidth = 2;
    rr(ctx, ob.x - ob.w / 2, ob.y - 15, ob.w, 30, 7, true, true);
    ctx.fillStyle = '#06b6d4'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
    ctx.fillText('÷', ob.x, ob.y + 5); ctx.shadowBlur = 0;
  }
}

function drawBoss1(ctx, x, y, fr) {
  ctx.shadowBlur = 20; ctx.shadowColor = '#a855f7';
  ctx.fillStyle = '#180040'; ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 2.5;
  rr(ctx, x - 46, y - 88, 92, 88, 10, true, true); ctx.shadowBlur = 0;
  ctx.fillStyle = '#7c3aed';
  ctx.beginPath(); ctx.moveTo(x - 30, y - 88); ctx.lineTo(x - 20, y - 112); ctx.lineTo(x - 10, y - 88); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x + 10, y - 88); ctx.lineTo(x + 20, y - 112); ctx.lineTo(x + 30, y - 88); ctx.fill();
  const blink = Math.abs(Math.sin(fr * 0.045)) > 0.88;
  if (!blink) {
    ctx.fillStyle = '#ff2020';
    ctx.beginPath(); ctx.ellipse(x - 16, y - 62, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 16, y - 62, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x - 14, y - 62, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 14, y - 62, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#e9d5ff'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
  ctx.fillText('x²+5x', x, y - 38); ctx.fillText('+6=0', x, y - 20);
  const ls = Math.sin(fr * 0.13) * 10;
  ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - 20, y); ctx.lineTo(x - 20 - ls, y + 26); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 20, y); ctx.lineTo(x + 20 + ls, y + 26); ctx.stroke();
}

function drawBoss2(ctx, x, y, fr) {
  ctx.shadowBlur = 22; ctx.shadowColor = '#ec4899';
  ctx.fillStyle = '#1a0028'; ctx.strokeStyle = '#ec4899'; ctx.lineWidth = 2.5;
  rr(ctx, x - 54, y - 106, 108, 106, 12, true, true); ctx.shadowBlur = 0;
  const hornData = [[-32], [0], [32]];
  ctx.fillStyle = '#9f1239';
  hornData.forEach(([cx]) => {
    ctx.beginPath(); ctx.moveTo(x + cx - 10, y - 106);
    ctx.lineTo(x + cx, y - 132); ctx.lineTo(x + cx + 10, y - 106); ctx.fill();
  });
  const blink = Math.abs(Math.sin(fr * 0.038)) > 0.9;
  if (!blink) {
    ctx.fillStyle = '#ff4080';
    ctx.beginPath(); ctx.ellipse(x - 18, y - 76, 13, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 18, y - 76, 13, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x - 16, y - 76, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 16, y - 76, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#fbcfe8'; ctx.font = 'bold 14px serif'; ctx.textAlign = 'center';
  ctx.fillText('∫f(x)dx', x, y - 46); ctx.font = 'bold 11px monospace';
  ctx.fillText('= F(x)+C', x, y - 26);
  const ls = Math.sin(fr * 0.11) * 11;
  ctx.strokeStyle = '#ec4899'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - 22, y); ctx.lineTo(x - 22 - ls, y + 28); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 22, y); ctx.lineTo(x + 22 + ls, y + 28); ctx.stroke();
}

function drawBoss3(ctx, x, y, fr, img) {
  const pulse = 1 + Math.sin(fr * 0.09) * 0.035;
  const iw = 118 * pulse, ih = 118 * pulse;
  ctx.shadowBlur = 28; ctx.shadowColor = '#fbbf24';
  ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 3.5;
  rr(ctx, x - iw / 2 - 8, y - ih - 8, iw + 16, ih + 16, 14, false, true); ctx.shadowBlur = 0;
  ctx.fillStyle = '#160900';
  rr(ctx, x - iw / 2 - 8, y - ih - 8, iw + 16, ih + 16, 14, true, false);
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.save();
    ctx.beginPath(); rr(ctx, x - iw / 2, y - ih, iw, ih, 10, false, false); ctx.clip();
    ctx.drawImage(img, x - iw / 2, y - ih, iw, ih);
    ctx.restore();
  } else {
    ctx.fillStyle = '#fbbf24'; ctx.font = `bold 64px serif`; ctx.textAlign = 'center';
    ctx.fillText('👨‍🏫', x, y - ih / 2 + 20);
  }
  ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 12px serif'; ctx.textAlign = 'center';
  ctx.fillText('الأستاذ! 😤', x, y + 18);
}

function drawExplosion(ctx, parts) {
  parts.forEach(p => {
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color; ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawHUD(ctx, lives, defeated, spd, nextBossFrames, totalFrames) {
  // hearts
  for (let i = 0; i < 3; i++) {
    ctx.font = '22px serif'; ctx.globalAlpha = i < lives ? 1 : 0.2;
    ctx.fillText('❤️', 12 + i * 30, 32);
  }
  ctx.globalAlpha = 1;
  // boss stars
  for (let i = 0; i < 3; i++) {
    ctx.font = '20px serif'; ctx.globalAlpha = i < defeated ? 1 : 0.2;
    ctx.fillText('⭐', CW - 78 + i * 24, 32);
  }
  ctx.globalAlpha = 1;
  // speed bar
  const sp = Math.min((spd - BASE_SPD) / (MAX_SPD - BASE_SPD), 1);
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(CW / 2 - 55, 10, 110, 11);
  const gc = ctx.createLinearGradient(CW / 2 - 55, 0, CW / 2 + 55, 0);
  gc.addColorStop(0, '#22c55e'); gc.addColorStop(0.6, '#f59e0b'); gc.addColorStop(1, '#ef4444');
  ctx.fillStyle = gc; ctx.fillRect(CW / 2 - 55, 10, sp * 110, 11);
  ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1;
  ctx.strokeRect(CW / 2 - 55, 10, 110, 11);
  ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.font = '10px monospace';
  ctx.textAlign = 'center'; ctx.fillText('السرعة', CW / 2, 33); ctx.textAlign = 'left';

  // Next boss countdown
  if (nextBossFrames > 0 && defeated < 3) {
    const secs = Math.ceil(nextBossFrames / 60);
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    const label = mins > 0 ? `${mins}:${String(s).padStart(2, '0')}` : `${s}ث`;
    const isWarning = secs <= 10;
    ctx.globalAlpha = isWarning ? (0.6 + 0.4 * Math.abs(Math.sin(totalFrames * 0.15))) : 0.7;
    ctx.fillStyle = isWarning ? '#ef4444' : '#a855f7';
    ctx.font = `bold ${isWarning ? 13 : 11}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(isWarning ? `⚠️ البوس قادم! ${label}` : `👹 البوس بعد: ${label}`, CW / 2, 52);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  // Game time
  const gameSecs = Math.floor(totalFrames / 60);
  const gm = Math.floor(gameSecs / 60), gs2 = gameSecs % 60;
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${gm}:${String(gs2).padStart(2, '0')}`, CW - 8, 48);
  ctx.textAlign = 'left';
}

// Scrolling story text on canvas
function drawStoryText(ctx, texts, fr) {
  texts.forEach(t => {
    if (fr < t.startFrame || fr > t.endFrame) return;
    const life = fr - t.startFrame;
    const duration = t.endFrame - t.startFrame;
    const fadeIn = Math.min(life / 30, 1);
    const fadeOut = Math.min((duration - life) / 30, 1);
    ctx.globalAlpha = Math.min(fadeIn, fadeOut) * 0.9;
    const x = t.x - life * 0.3;
    ctx.font = `bold ${t.size || 16}px Cairo, sans-serif`;
    ctx.fillStyle = t.color || '#c084fc';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 12; ctx.shadowColor = t.color || '#c084fc';
    ctx.fillText(t.text, x, t.y);
    ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.textAlign = 'left';
  });
}

const MATH_SYMS = ['π', 'Σ', '∫', 'x²', '√', '∞', 'Δ', '∂', 'α', 'β', 'θ', 'λ'];

// Story texts that appear during gameplay
const STORY_TEXTS = [
  { text: '🏃 اهرب! اهرب! العقبات في كل مكان!', x: CW / 2, y: GROUND - 120, startFrame: 60, endFrame: 300, color: '#86efac', size: 17 },
  { text: '⚡ السرعة بتزيد... جهز نفسك!', x: CW / 2, y: GROUND - 100, startFrame: 400, endFrame: 640, color: '#fbbf24', size: 15 },
  { text: '💪 كده كده! اقفز وتجنب العقبات!', x: CW / 2, y: GROUND - 110, startFrame: 800, endFrame: 1040, color: '#a855f7', size: 15 },
  { text: '🎯 ممتاز! كمل وخليك جاهز!', x: CW / 2, y: GROUND - 100, startFrame: 1200, endFrame: 1440, color: '#22c55e', size: 15 },
];

function makeInitState() {
  return {
    frame: 0, distance: 0, speed: BASE_SPD,
    lives: 3, bossesDefeated: 0, totalPoints: 0,
    player: { y: GROUND, vy: 0, jumping: false, ducking: false, invincible: 0 },
    obstacles: [], obTimer: 90,
    boss: null, explosionParts: [],
    bossTriggered: [false, false, false],
    bossUnlockFrame: [BOSS1_FRAME, Infinity, Infinity],
    bossDefeatFrame: [-1, -1, -1],
    stars: Array.from({ length: 60 }, () => ({
      x: Math.random() * CW, y: Math.random() * (GROUND - 80),
      r: 0.5 + Math.random() * 1.5, speed: 0.4 + Math.random(), phase: Math.random() * Math.PI * 2,
    })),
    mathSymbols: Array.from({ length: 16 }, (_, i) => ({
      ch: MATH_SYMS[i % MATH_SYMS.length], x: Math.random() * CW,
      y: 25 + Math.random() * (GROUND - 90), sz: 18 + Math.random() * 22, spd: 0.18 + Math.random() * 0.28,
    })),
    mountains: [
      { color: '#160830', spd: 0.16, peaks: Array.from({ length: 9 }, (_, i) => ({ x: i * 140 + Math.random() * 60, w: 130 + Math.random() * 80, h: 80 + Math.random() * 55 })) },
      { color: '#0e041e', spd: 0.3, peaks: Array.from({ length: 11 }, (_, i) => ({ x: i * 115 + Math.random() * 50, w: 95 + Math.random() * 65, h: 50 + Math.random() * 40 })) },
    ],
    bgOffset: 0,
    phase: 'running',
  };
}

function makeObstacle(speed) {
  // At higher speeds, more varied obstacles
  const r = Math.random();
  if (r < 0.52) return { type: 'jump', x: CW + 40, h: 38 + Math.random() * 32 };
  return { type: 'duck', x: CW + 40, y: GROUND - 55, w: 68 + Math.random() * 36 };
}

function collides(p, ob) {
  const ph = p.ducking ? DUCK_H : STAND_H;
  const py1 = p.y - ph, py2 = p.y;
  const px1 = PLAYER_X - 13, px2 = PLAYER_X + 13;
  if (ob.type === 'jump') {
    return px2 > ob.x - 17 && px1 < ob.x + 17 && py2 > GROUND - ob.h && py1 < GROUND;
  }
  return px2 > ob.x - ob.w / 2 && px1 < ob.x + ob.w / 2 && py2 > ob.y - 15 && py1 < ob.y + 15;
}

const BOSS_DIALOGUES = [
  { title: 'شيطان الجبر', subtitle: 'البوس الأول', color: '#a855f7', emoji: '👹', taunt: 'هاهاها! تقدر تحل المعادلة دي يا شاطر؟ 😈', fight: 'واجهه!' },
  { title: 'وحش التفاضل', subtitle: 'البوس الثاني', color: '#ec4899', emoji: '👾', taunt: '∫ و ∂ و لا فاهم حاجة؟ جرب الدلوقتي! 🔥', fight: 'هاجمه!' },
  { title: 'الأستاذ نفسه!', subtitle: 'البوس الأخير', color: '#fbbf24', emoji: '👨‍🏫', taunt: 'أنت فاكرني مش موجود؟ هاتحدّيني في داري؟! 😤', fight: 'جاهز؟!' },
];

// ── COMPONENT ──────────────────────────────────────────────────
export default function StickmanRun({ onClose, academicStage }) {
  const { user, updateUser } = useAuth();
  const canvasRef   = useRef(null);
  const stateRef    = useRef(null);
  const inputRef    = useRef({ duck: false });
  const bossActiveRef = useRef(false);
  const timerRef    = useRef(null);
  const handleAnswerRef = useRef(null);
  const startFightRef   = useRef(null);
  const teacherImgs = useRef({});

  const [phase, setPhase]             = useState('loading');
  const [dialogueUI, setDialogueUI]   = useState(null);
  const [bossUI, setBossUI]           = useState(null);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [answerResult, setAnswerResult]     = useState(null);
  const [timerPct, setTimerPct]       = useState(100);
  const [lives, setLives]             = useState(3);
  const [bossesDefeated, setBossesDefeated] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [resultData, setResultData]   = useState(null);

  const stage    = academicStage || user?.academic_stage;
  const cfg      = getGameConfig(stage);
  const bossCfgs = [cfg.boss1, cfg.boss2, cfg.boss3];

  useEffect(() => {
    ['normal', 'sad', 'fury'].forEach(k => {
      const img = new Image(); img.src = `/teacher-${k}.png`;
      teacherImgs.current[k] = img;
    });
  }, []);

  useEffect(() => {
    api.get('/events/weekly-run/status')
      .then(r => setPhase(r.data.played ? 'already_played' : 'intro'))
      .catch(() => setPhase('intro'));
  }, []);

  // Keyboard
  useEffect(() => {
    const dn = (e) => {
      if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) {
        e.preventDefault();
        const gs = stateRef.current;
        if (gs?.phase === 'running' && gs.player.y >= GROUND && !gs.player.jumping) {
          gs.player.vy = JUMP_V; gs.player.jumping = true;
        }
      }
      if (e.code === 'ArrowDown' || e.code === 'KeyS') inputRef.current.duck = true;
    };
    const up = (e) => { if (e.code === 'ArrowDown' || e.code === 'KeyS') inputRef.current.duck = false; };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, []);

  const onTouchStart = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const gs = stateRef.current;
    if (!gs || gs.phase !== 'running') return;
    const relY = (e.touches[0].clientY - rect.top) / rect.height;
    if (relY < 0.55) {
      if (gs.player.y >= GROUND && !gs.player.jumping) { gs.player.vy = JUMP_V; gs.player.jumping = true; }
    } else inputRef.current.duck = true;
  };
  const onTouchEnd = () => { inputRef.current.duck = false; };

  // ── GAME LOOP ─────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const gs  = stateRef.current;
    if (!gs) return;

    const finishGame = (state) => {
      state.phase = 'gameover';
      const pts = state.totalPoints, def = state.bossesDefeated;
      setResultData({ won: def === 3, pts, def });
      setPhase(def === 3 ? 'victory' : 'gameover');
      api.post('/events/weekly-run/finish', { pointsEarned: pts, bossesDefeated: def })
        .then(r => { if (r.data.success && updateUser) updateUser({ points: r.data.newTotal }); })
        .catch(() => {});
    };

    const handleAnswer = (bossIdx, choiceIdx) => {
      clearInterval(timerRef.current);
      const state = stateRef.current; if (!state) return;
      const bcfg   = bossCfgs[bossIdx];
      const correct = choiceIdx === bcfg.correctIndex;
      setSelectedChoice(choiceIdx); setAnswerResult(correct ? 'correct' : 'wrong');
      setTimeout(() => {
        if (correct) {
          state.totalPoints += BOSS_POINTS[bossIdx];
          state.bossesDefeated += 1;
          setBossesDefeated(state.bossesDefeated);
          setTotalPoints(state.totalPoints);
          // Record defeat frame and unlock next boss after 2 minutes
          state.bossDefeatFrame[bossIdx] = state.frame;
          if (bossIdx < 2) {
            state.bossUnlockFrame[bossIdx + 1] = state.frame + BOSS_GAP_FRAMES;
          }
          const cx = state.boss?.x || CW * 0.65, cy = state.boss?.y || GROUND;
          state.explosionParts = Array.from({ length: 40 }, () => ({
            x: cx, y: cy - 50, vx: (Math.random() - 0.5) * 16, vy: -8 - Math.random() * 10,
            r: 3 + Math.random() * 7,
            color: ['#fbbf24', '#f97316', '#ec4899', '#a855f7', '#22c55e'][Math.floor(Math.random() * 5)],
            life: 55, maxLife: 55,
          }));
          if (state.bossesDefeated === 3) { finishGame(state); return; }
        } else {
          state.lives = Math.max(0, state.lives - 1);
          setLives(state.lives);
          state.player.invincible = 120;
          if (state.lives === 0) { finishGame(state); return; }
        }
        state.boss = null; state.phase = 'running';
        setBossUI(null); bossActiveRef.current = false;
      }, 1400);
    };

    handleAnswerRef.current = handleAnswer;

    const startFight = (bossIdx) => {
      const state = stateRef.current; if (!state) return;
      const bcfg = bossCfgs[bossIdx];
      state.phase = 'boss_encounter';
      setDialogueUI(null);
      setBossUI({ bossIdx, cfg: bcfg });
      setSelectedChoice(null); setAnswerResult(null);
      let pct = 100;
      const step = 100 / (bcfg.timeLimit * 20);
      timerRef.current = setInterval(() => {
        pct -= step; setTimerPct(Math.max(0, pct));
        if (pct <= 0) { clearInterval(timerRef.current); handleAnswer(bossIdx, -1); }
      }, 50);
    };

    startFightRef.current = startFight;

    const triggerDialogue = (bossIdx) => {
      if (bossActiveRef.current) return;
      bossActiveRef.current = true;
      const state = stateRef.current; if (!state) return;
      state.phase = 'boss_dialogue';
      setDialogueUI({ bossIdx, dlg: BOSS_DIALOGUES[bossIdx] });
    };

    let animId;
    const loop = () => {
      const state = stateRef.current; if (!state) return;

      if (state.phase === 'running') {
        state.frame++;
        state.distance += state.speed;
        state.speed = Math.min(MAX_SPD, BASE_SPD + state.distance * 0.002);
        state.bgOffset += state.speed;

        const p = state.player;
        if (p.jumping || p.y < GROUND) {
          p.vy += GRAVITY;
          p.y = Math.min(GROUND, p.y + p.vy);
          if (p.y >= GROUND) { p.y = GROUND; p.vy = 0; p.jumping = false; }
        }
        p.ducking = !!inputRef.current.duck;
        if (p.invincible > 0) p.invincible--;

        // Obstacles — spacing decreases as time goes on
        state.obTimer--;
        const minGap = Math.max(35, 80 - Math.floor(state.frame / 600) * 5);
        if (state.obTimer <= 0) {
          state.obstacles.push(makeObstacle(state.speed));
          state.obTimer = minGap + Math.random() * 55;
        }
        state.obstacles.forEach(o => { o.x -= state.speed; });
        state.obstacles = state.obstacles.filter(o => o.x > -90);

        for (const ob of state.obstacles) {
          if (p.invincible === 0 && collides(p, ob)) {
            state.lives = Math.max(0, state.lives - 1);
            setLives(state.lives);
            p.invincible = 120; ob.x = -300;
            if (state.lives === 0) { finishGame(state); return; }
            break;
          }
        }

        // Frame-based boss triggers
        if (!state.boss) {
          for (let i = 0; i < 3; i++) {
            if (!state.bossTriggered[i] && state.frame >= state.bossUnlockFrame[i]) {
              state.bossTriggered[i] = true;
              state.boss = { x: CW + 90, y: GROUND, idx: i, walkSpd: 2.0 };
              break;
            }
          }
        }

        // Boss walk-in → trigger dialogue
        if (state.boss) {
          const targetX = CW * 0.6;
          if (state.boss.x > targetX) state.boss.x -= state.boss.walkSpd;
          else if (!bossActiveRef.current) triggerDialogue(state.boss.idx);
        }

      } else if (state.phase === 'boss_dialogue' || state.phase === 'boss_encounter') {
        state.frame++;
      }

      // Explosions
      state.explosionParts = state.explosionParts.filter(p => p.life > 0);
      state.explosionParts.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.32; p.life--; });

      // Calculate next boss countdown
      let nextBossFrames = 0;
      if (state.phase === 'running' && !state.boss) {
        for (let i = 0; i < 3; i++) {
          if (!state.bossTriggered[i]) {
            const remaining = state.bossUnlockFrame[i] - state.frame;
            if (remaining > 0) nextBossFrames = remaining;
            break;
          }
        }
      }

      // ── Draw ──
      drawSky(ctx);
      drawStars(ctx, state.stars, state.frame);
      drawMathBg(ctx, state.mathSymbols, state.bgOffset);
      drawMountains(ctx, state.mountains, state.bgOffset);
      drawGround(ctx, state.bgOffset);
      drawStoryText(ctx, STORY_TEXTS, state.frame);
      state.obstacles.forEach(ob => drawObstacle(ctx, ob));

      if (state.boss && state.boss.x < CW + 10) {
        const { x, y, idx } = state.boss;
        if      (idx === 0) drawBoss1(ctx, x, y, state.frame);
        else if (idx === 1) drawBoss2(ctx, x, y, state.frame);
        else    drawBoss3(ctx, x, y, state.frame, teacherImgs.current.normal);
      }

      drawStickman(ctx, PLAYER_X, state.player.y, state.frame, state.player.ducking, state.player.invincible > 0);
      drawExplosion(ctx, state.explosionParts);
      drawHUD(ctx, state.lives, state.bossesDefeated, state.speed, nextBossFrames, state.frame);

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animId);
      clearInterval(timerRef.current);
      handleAnswerRef.current = null;
      startFightRef.current   = null;
    };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const startGame = () => {
    stateRef.current = makeInitState();
    setLives(3); setBossesDefeated(0); setTotalPoints(0);
    bossActiveRef.current = false;
    setBossUI(null); setDialogueUI(null);
    setPhase('playing');
  };

  const bossImg = bossUI?.bossIdx === 2
    ? (answerResult === 'correct' ? teacherImgs.current.sad
      : answerResult === 'wrong'   ? teacherImgs.current.fury
      : teacherImgs.current.normal)
    : null;

  const dlgBossImg = dialogueUI?.bossIdx === 2 ? teacherImgs.current.fury : null;

  // ── Render ────────────────────────────────────────────────────
  return (
    <div dir="rtl" style={{
      position: 'relative', background: '#04040e',
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
    }}>
      <style>{`
        @keyframes slideUp   { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:none} }
        @keyframes slideDown { from{opacity:0;transform:translateY(-22px) scale(.97)} to{opacity:1;transform:none} }
        @keyframes choiceIn  { from{opacity:0;transform:translateX(12px)} to{opacity:1;transform:none} }
        @keyframes shakeX    { 0%,100%{transform:none} 25%{transform:translateX(-7px)} 75%{transform:translateX(7px)} }
        @keyframes bossWarn  { 0%,100%{opacity:.85} 50%{opacity:1} }
        @keyframes punchIn   { from{opacity:0;transform:scale(.7) rotate(-8deg)} to{opacity:1;transform:scale(1) rotate(0deg)} }
        @keyframes spin      { to{transform:rotate(360deg)} }
        @keyframes pulse     { 0%,100%{transform:scale(1)} 50%{transform:scale(1.04)} }
      `}</style>

      {/* Canvas — fills all available space */}
      <canvas
        ref={canvasRef} width={CW} height={CH}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
        style={{
          display: 'block', width: '100%', height: '100%',
          objectFit: 'contain', touchAction: 'none',
          visibility: phase === 'playing' ? 'visible' : 'hidden',
          flex: 1,
        }}
      />

      {/* ── NON-PLAYING OVERLAYS ── */}
      {phase !== 'playing' && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(145deg,#04040e 0%,#180838 100%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 18, padding: '32px 28px', textAlign: 'center',
        }}>
          {phase === 'loading' && (
            <div style={{ width: 44, height: 44, border: '4px solid #7c3aed', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          )}

          {phase === 'intro' && (
            <div style={{ animation: 'slideUp .45s both', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
              <div style={{ fontSize: 90, filter: 'drop-shadow(0 0 24px #7c3aed)', animation: 'pulse 2s ease-in-out infinite' }}>🏃</div>
              <div>
                <h2 style={{ color: '#fff', fontSize: 30, fontWeight: 900, margin: '0 0 8px' }}>تحدي الأسبوعي الرياضي</h2>
                <p style={{ color: '#c084fc', fontSize: 15, margin: '0 0 4px' }}>اهرب من العقبات وهزم ٣ بوسات خلال رحلة طويلة!</p>
                <p style={{ color: 'rgba(255,255,255,.35)', fontSize: 13, margin: 0 }}>فارق دقيقتين على الأقل بين كل بوس والتاني 💪</p>
              </div>

              {/* Controls */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                {[['⬆️ / Space', 'قفز'], ['⬇️ / S', 'اركع'], ['🧠', 'جاوب السؤال']].map(([ic, lb]) => (
                  <div key={lb} style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 11, padding: '10px 18px', minWidth: 90 }}>
                    <div style={{ fontSize: 24 }}>{ic}</div>
                    <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, marginTop: 4 }}>{lb}</div>
                  </div>
                ))}
              </div>

              {/* Boss timeline */}
              <div style={{ background: 'rgba(124,58,237,.1)', border: '1px solid rgba(124,58,237,.25)', borderRadius: 14, padding: '14px 20px', width: '100%', maxWidth: 420 }}>
                <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, marginBottom: 10 }}>🗺️ خريطة الرحلة</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { icon: '🏃', label: 'ابدأ الجري', sub: '٣٠ ثانية أولى', color: '#22c55e' },
                    { icon: '👹', label: 'البوس الأول — شيطان الجبر', sub: `+${BOSS_POINTS[0]} نقطة`, color: '#a855f7' },
                    { icon: '⏱️', label: 'استمر في الجري', sub: 'دقيقتين على الأقل', color: '#fbbf24' },
                    { icon: '👾', label: 'البوس الثاني — وحش التفاضل', sub: `+${BOSS_POINTS[1]} نقطة`, color: '#ec4899' },
                    { icon: '⏱️', label: 'استمر في الجري', sub: 'دقيقتين على الأقل', color: '#fbbf24' },
                    { icon: '👨‍🏫', label: 'البوس الأخير — الأستاذ!', sub: `+${BOSS_POINTS[2]} نقطة`, color: '#fbbf24' },
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
                      <div style={{ flex: 1, textAlign: 'right' }}>
                        <div style={{ color: item.color, fontSize: 13, fontWeight: 700 }}>{item.label}</div>
                        <div style={{ color: 'rgba(255,255,255,.35)', fontSize: 11 }}>{item.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={startGame} style={{
                padding: '16px 56px', borderRadius: 14, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg,#7c3aed,#ec4899)', color: '#fff',
                fontFamily: 'inherit', fontWeight: 900, fontSize: 20,
                boxShadow: '0 8px 28px rgba(124,58,237,.55)',
                animation: 'pulse 2s ease-in-out infinite',
              }}>العب دلوقتي 🎮</button>
            </div>
          )}

          {phase === 'already_played' && (
            <div style={{ animation: 'slideUp .4s both', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <div style={{ fontSize: 68 }}>🗓️</div>
              <h2 style={{ color: '#fff', fontSize: 24, fontWeight: 900, margin: 0 }}>لعبت هذا الأسبوع!</h2>
              <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 14, margin: 0 }}>تعالى تاني الأسبوع الجاي 🎮</p>
              {onClose && <button onClick={onClose} style={{ padding: '10px 28px', borderRadius: 10, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>رجوع</button>}
            </div>
          )}

          {(phase === 'victory' || phase === 'gameover') && resultData && (
            <div style={{ animation: 'slideUp .4s both', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
              <div style={{ fontSize: 90, animation: 'pulse 1.5s ease-in-out infinite' }}>{phase === 'victory' ? '🏆' : '💔'}</div>
              <h2 style={{ color: phase === 'victory' ? '#fbbf24' : '#ef4444', fontSize: 32, fontWeight: 900, margin: 0 }}>
                {phase === 'victory' ? 'أنت بطل المنهج! 🌟' : 'حاول الأسبوع الجاي!'}
              </h2>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
                <div style={{ background: 'rgba(251,191,36,.1)', border: '1px solid rgba(251,191,36,.28)', borderRadius: 12, padding: '16px 28px' }}>
                  <div style={{ color: '#fbbf24', fontSize: 40, fontWeight: 900 }}>{resultData.pts}</div>
                  <div style={{ color: 'rgba(255,255,255,.4)', fontSize: 13 }}>نقطة مكسوبة</div>
                </div>
                <div style={{ background: 'rgba(124,58,237,.1)', border: '1px solid rgba(124,58,237,.28)', borderRadius: 12, padding: '16px 28px' }}>
                  <div style={{ color: '#c084fc', fontSize: 40, fontWeight: 900 }}>{resultData.def}/3</div>
                  <div style={{ color: 'rgba(255,255,255,.4)', fontSize: 13 }}>بوسات انهزمت</div>
                </div>
              </div>
              <p style={{ color: 'rgba(255,255,255,.3)', fontSize: 13, margin: 0 }}>مرة واحدة في الأسبوع — شوفك الأسبوع الجاي!</p>
              {onClose && <button onClick={onClose} style={{ padding: '14px 44px', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#7c3aed,#ec4899)', color: '#fff', fontFamily: 'inherit', fontWeight: 900, fontSize: 17 }}>رجوع للفعاليات</button>}
            </div>
          )}
        </div>
      )}

      {/* ── BOSS PRE-FIGHT DIALOGUE ── */}
      {phase === 'playing' && dialogueUI && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(4,4,14,.9)',
          backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: 28,
          animation: 'slideUp .4s cubic-bezier(.34,1.56,.64,1) both',
        }}>
          <div style={{
            background: `linear-gradient(145deg,#0a0820,rgba(${
              dialogueUI.bossIdx === 0 ? '168,85,247' : dialogueUI.bossIdx === 1 ? '236,72,153' : '251,191,36'
            },.14))`,
            border: `1.5px solid rgba(${dialogueUI.bossIdx === 0 ? '168,85,247' : dialogueUI.bossIdx === 1 ? '236,72,153' : '251,191,36'},.45)`,
            borderRadius: 24, padding: '32px 36px', maxWidth: 500, width: '100%',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, textAlign: 'center',
            boxShadow: `0 16px 60px rgba(${dialogueUI.bossIdx === 0 ? '168,85,247' : dialogueUI.bossIdx === 1 ? '236,72,153' : '251,191,36'},.4)`,
          }}>
            <div style={{ animation: 'punchIn .5s cubic-bezier(.34,1.56,.64,1) both' }}>
              {dlgBossImg ? (
                <img src={dlgBossImg.src} alt="boss" style={{ width: 130, height: 130, borderRadius: 20, objectFit: 'cover', border: `3px solid ${dialogueUI.dlg.color}`, boxShadow: `0 0 32px ${dialogueUI.dlg.color}66` }} />
              ) : (
                <div style={{ fontSize: 110, lineHeight: 1, filter: `drop-shadow(0 0 26px ${dialogueUI.dlg.color})`, animation: 'bossWarn 1.2s ease-in-out infinite' }}>
                  {dialogueUI.dlg.emoji}
                </div>
              )}
            </div>
            <div>
              <div style={{ color: 'rgba(255,255,255,.38)', fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>{dialogueUI.dlg.subtitle}</div>
              <div style={{ color: '#fff', fontSize: 26, fontWeight: 900, marginTop: 4 }}>{dialogueUI.dlg.title}</div>
            </div>
            <div style={{
              background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)',
              borderRadius: 16, padding: '16px 22px', position: 'relative',
            }}>
              <div style={{ position: 'absolute', top: -10, right: 34, width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderBottom: '10px solid rgba(255,255,255,.14)' }} />
              <p style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: 0 }}>{dialogueUI.dlg.taunt}</p>
            </div>
            <button
              onClick={() => startFightRef.current?.(dialogueUI.bossIdx)}
              style={{
                padding: '16px 60px', borderRadius: 16, border: 'none', cursor: 'pointer',
                background: `linear-gradient(135deg, ${dialogueUI.dlg.color}, ${dialogueUI.bossIdx === 0 ? '#ec4899' : dialogueUI.bossIdx === 1 ? '#f97316' : '#f97316'})`,
                color: '#fff', fontFamily: 'inherit', fontWeight: 900, fontSize: 20,
                boxShadow: `0 8px 28px ${dialogueUI.dlg.color}77`,
                animation: 'bossWarn 1.5s ease-in-out infinite',
              }}
            >{dialogueUI.dlg.fight} ⚔️</button>
          </div>
        </div>
      )}

      {/* ── BOSS QUESTION (fight phase) ── */}
      {phase === 'playing' && bossUI && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(4,4,14,.88)',
          backdropFilter: 'blur(5px)', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '20px 24px',
          animation: 'slideDown .35s cubic-bezier(.34,1.56,.64,1) both',
        }}>
          {/* Timer bar */}
          <div style={{ width: '100%', maxWidth: 600, height: 9, background: 'rgba(255,255,255,.1)', borderRadius: 5, marginBottom: 20 }}>
            <div style={{
              height: '100%', borderRadius: 5, transition: 'width .05s linear', width: `${timerPct}%`,
              background: timerPct > 50 ? '#22c55e' : timerPct > 25 ? '#f59e0b' : '#ef4444',
              boxShadow: `0 0 8px ${timerPct > 50 ? '#22c55e' : timerPct > 25 ? '#f59e0b' : '#ef4444'}`,
            }} />
          </div>

          {/* Time label */}
          <div style={{ color: timerPct > 50 ? '#86efac' : timerPct > 25 ? '#fcd34d' : '#fca5a5', fontSize: 13, fontWeight: 700, marginBottom: 16 }}>
            ⏱️ الوقت المتبقي: {Math.ceil(timerPct * bossCfgs[bossUI.bossIdx].timeLimit / 100)}ث
          </div>

          <div style={{ display: 'flex', gap: 20, width: '100%', maxWidth: 600, alignItems: 'flex-start' }}>
            {/* Boss face */}
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
              {bossImg ? (
                <img src={bossImg.src} alt="boss"
                  style={{ width: 100, height: 100, borderRadius: 16, objectFit: 'cover',
                    border: `3px solid ${answerResult === 'correct' ? '#22c55e' : answerResult === 'wrong' ? '#ef4444' : '#fbbf24'}`,
                    animation: answerResult === 'wrong' ? 'shakeX .4s ease' : 'none',
                    boxShadow: `0 0 20px ${answerResult === 'correct' ? '#22c55e55' : answerResult === 'wrong' ? '#ef444455' : '#fbbf2455'}` }} />
              ) : (
                <div style={{ width: 90, height: 90, fontSize: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {bossUI.bossIdx === 0 ? '👹' : '👾'}
                </div>
              )}
              <div style={{ color: 'rgba(255,255,255,.35)', fontSize: 11, fontWeight: 700 }}>بوس {bossUI.bossIdx + 1}</div>
            </div>

            {/* Question + choices */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)',
                borderRadius: 14, padding: '14px 18px', marginBottom: 14,
              }}>
                <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 13, margin: '0 0 8px' }}>
                  {answerResult === 'correct' ? bossUI.cfg.correctDialog
                    : answerResult === 'wrong' ? bossUI.cfg.wrongDialog
                    : bossUI.cfg.dialog}
                </p>
                <p style={{ color: '#fff', fontWeight: 900, fontSize: 17, margin: 0, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                  {bossUI.cfg.question}
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {bossUI.cfg.choices.map((ch, idx) => {
                  const sel = selectedChoice === idx, cor = idx === bossUI.cfg.correctIndex;
                  let bg = 'rgba(255,255,255,.08)', bd = '1px solid rgba(255,255,255,.16)', cl = '#fff';
                  if (answerResult && sel) {
                    bg = answerResult === 'correct' ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)';
                    bd = `1px solid ${answerResult === 'correct' ? '#22c55e' : '#ef4444'}`;
                    cl = answerResult === 'correct' ? '#86efac' : '#fca5a5';
                  } else if (answerResult === 'wrong' && cor) {
                    bg = 'rgba(34,197,94,.18)'; bd = '1px solid #22c55e'; cl = '#86efac';
                  }
                  return (
                    <button key={idx} disabled={!!answerResult}
                      onClick={() => { if (!answerResult) handleAnswerRef.current?.(bossUI.bossIdx, idx); }}
                      style={{
                        background: bg, border: bd, borderRadius: 11, padding: '12px 14px',
                        color: cl, fontFamily: 'inherit', fontWeight: 700, fontSize: 15,
                        cursor: answerResult ? 'default' : 'pointer', textAlign: 'center',
                        transition: 'all .2s', animation: `choiceIn .3s ${.07 * idx}s both`,
                      }}>
                      {ch}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Controls hint strip */}
      {phase === 'playing' && !dialogueUI && !bossUI && (
        <div dir="rtl" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '5px 16px', background: 'rgba(0,0,0,.55)', flexShrink: 0,
        }}>
          <div style={{ color: 'rgba(255,255,255,.3)', fontSize: 12 }}>⬆️ قفز &nbsp;|&nbsp; ⬇️ اركع &nbsp;|&nbsp; 📱 اضغط فوق/تحت</div>
          <div style={{ color: '#fbbf24', fontSize: 14, fontWeight: 700 }}>⭐ {totalPoints} نقطة</div>
        </div>
      )}
    </div>
  );
}
