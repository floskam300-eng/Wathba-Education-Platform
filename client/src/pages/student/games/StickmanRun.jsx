import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import gameAudio from '../../../lib/gameAudio';
import GameHUD from '../../../components/games/GameHUD';
import QuestionOverlay from '../../../components/games/QuestionOverlay';
import GameResultModal from '../../../components/games/GameResultModal';
import api from '../../../lib/api';
import toast from 'react-hot-toast';

// ── Game Constants (Full Screen 1280x720 Native Canvas Resolution) ───────────
const CW = 1280;
const CH = 720;
const GROUND = CH - 100;
const PLAYER_X = 180;
const GRAVITY = 0.76;
const JUMP_V = -17.5;
const DUCK_H = 34;
const STAND_H = 68;
const BASE_SPD = 4.5;
const MAX_SPD = 10.5;

// Boss Timings (in frames at ~60fps)
const BOSS1_FRAME = 15 * 60; // Boss 1 at ~15s
const BOSS_GAP_FRAMES = 22 * 60; // ~22s gap

// ── Drawing Helpers ──────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
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

function drawBackground(ctx, offset, stars, frame) {
  // 1. Deep synthwave cyberpunk sky gradient (spans full 100% viewport)
  const grad = ctx.createLinearGradient(0, 0, 0, GROUND);
  grad.addColorStop(0, '#040112');
  grad.addColorStop(0.35, '#120328');
  grad.addColorStop(0.75, '#280645');
  grad.addColorStop(1, '#0a0216');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CW, CH);

  // 2. Glowing Giant Cyber Moon with Rings
  const moonX = CW - 240;
  const moonY = 130;
  const moonGrad = ctx.createRadialGradient(moonX, moonY, 12, moonX, moonY, 80);
  moonGrad.addColorStop(0, '#fef08a');
  moonGrad.addColorStop(0.35, '#f59e0b');
  moonGrad.addColorStop(0.75, '#ec4899');
  moonGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = moonGrad;
  ctx.beginPath();
  ctx.arc(moonX, moonY, 80, 0, Math.PI * 2);
  ctx.fill();

  // Moon core
  ctx.fillStyle = '#fde68a';
  ctx.beginPath();
  ctx.arc(moonX, moonY, 44, 0, Math.PI * 2);
  ctx.fill();

  // Moon craters
  ctx.fillStyle = 'rgba(217, 119, 6, 0.35)';
  ctx.beginPath();
  ctx.arc(moonX - 12, moonY - 10, 10, 0, Math.PI * 2);
  ctx.arc(moonX + 15, moonY + 12, 13, 0, Math.PI * 2);
  ctx.arc(moonX - 10, moonY + 20, 8, 0, Math.PI * 2);
  ctx.fill();

  // Moon Ring
  ctx.save();
  ctx.translate(moonX, moonY);
  ctx.rotate(-0.35);
  ctx.strokeStyle = 'rgba(244, 114, 182, 0.45)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(0, 0, 110, 26, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // 3. Twinkling Stars across wide sky
  stars.forEach(s => {
    ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(frame * 0.02 * s.speed + s.phase));
    ctx.fillStyle = s.color || '#fff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // 4. Distant Parallax Neon Mountains
  ctx.fillStyle = 'rgba(45, 9, 76, 0.5)';
  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  for (let x = 0; x <= CW + 80; x += 80) {
    const mx = ((x - offset * 0.08) % (CW + 160) + CW + 160) % (CW + 160);
    const my = GROUND - 110 - Math.sin(mx * 0.012) * 65;
    ctx.lineTo(x, my);
  }
  ctx.lineTo(CW, GROUND);
  ctx.closePath();
  ctx.fill();

  // 5. Futuristic Cyber Skyline (Wide Screen Panoramic)
  for (let i = 0; i < 24; i++) {
    const bx = ((i * 70 - offset * 0.22) % (CW + 160) + CW + 160) % (CW + 160) - 70;
    const bh = 110 + ((i * 47) % 160);
    const bw = 55;

    // Building body
    ctx.fillStyle = 'rgba(20, 6, 40, 0.85)';
    ctx.fillRect(bx, GROUND - bh, bw, bh);

    // Neon edge highlight
    ctx.fillStyle = i % 2 === 0 ? 'rgba(139, 92, 246, 0.65)' : 'rgba(236, 72, 153, 0.65)';
    ctx.fillRect(bx + bw - 2, GROUND - bh, 2, bh);

    // Illuminated window matrix
    ctx.fillStyle = i % 3 === 0 ? '#38bdf8' : (i % 3 === 1 ? '#facc15' : '#c084fc');
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(frame * 0.03 + i);
    for (let wy = GROUND - bh + 14; wy < GROUND - 12; wy += 16) {
      for (let wx = bx + 8; wx < bx + bw - 10; wx += 12) {
        ctx.fillRect(wx, wy, 4, 7);
      }
    }
    ctx.globalAlpha = 1;
  }
}

function drawGround(ctx, offset) {
  // Ground body
  const gGrad = ctx.createLinearGradient(0, GROUND, 0, CH);
  gGrad.addColorStop(0, '#0c031d');
  gGrad.addColorStop(1, '#04010a');
  ctx.fillStyle = gGrad;
  ctx.fillRect(0, GROUND, CW, CH - GROUND);

  // Glowing Neon Laser Line
  ctx.save();
  ctx.shadowBlur = 20;
  ctx.shadowColor = '#8b5cf6';
  ctx.strokeStyle = '#c084fc';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  ctx.lineTo(CW, GROUND);
  ctx.stroke();

  // Secondary Cyan Accent line
  ctx.shadowColor = '#06b6d4';
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND + 5);
  ctx.lineTo(CW, GROUND + 5);
  ctx.stroke();
  ctx.restore();

  // High-Speed Animated Perspective Grid
  ctx.strokeStyle = 'rgba(168, 85, 247, 0.24)';
  ctx.lineWidth = 2;
  const sp = 55;
  const sx = -(offset % sp);
  for (let x = sx; x < CW + 80; x += sp) {
    ctx.beginPath();
    ctx.moveTo(x, GROUND);
    ctx.lineTo(x - 60, CH);
    ctx.stroke();
  }

  // Horizontal road depth lines
  for (let dy = 20; dy < CH - GROUND; dy += 22) {
    ctx.strokeStyle = `rgba(139, 92, 246, ${0.1 + (dy / (CH - GROUND)) * 0.22})`;
    ctx.beginPath();
    ctx.moveTo(0, GROUND + dy);
    ctx.lineTo(CW, GROUND + dy);
    ctx.stroke();
  }
}

function drawStickmanHero(ctx, px, py, frame, ducking, invincible, isDoubleJump) {
  if (invincible && Math.floor(frame * 0.15) % 2 === 1) return;

  const heroColor = isDoubleJump ? '#f59e0b' : '#00ffcc';
  ctx.strokeStyle = heroColor;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.shadowBlur = 18;
  ctx.shadowColor = heroColor;

  if (ducking) {
    // Sliding duck pose
    const hy = py - 30;
    ctx.beginPath();
    ctx.arc(px + 4, hy, 10, 0, Math.PI * 2);
    ctx.stroke();
    // Torso
    ctx.beginPath();
    ctx.moveTo(px + 4, hy + 10);
    ctx.lineTo(px - 20, hy + 26);
    ctx.stroke();
    // Arms forward
    ctx.beginPath();
    ctx.moveTo(px, hy + 16);
    ctx.lineTo(px + 24, hy + 14);
    ctx.stroke();
    // Legs back sliding
    ctx.beginPath();
    ctx.moveTo(px - 20, hy + 26);
    ctx.lineTo(px - 34, hy + 30);
    ctx.lineTo(-14 + px - 20, hy + 30);
    ctx.stroke();
  } else {
    const headY = py - 64;
    const shouldY = headY + 19;
    const hipY = headY + 41;

    // Glowing head
    ctx.beginPath();
    ctx.arc(px, headY, 10, 0, Math.PI * 2);
    ctx.stroke();

    // Spine
    ctx.beginPath();
    ctx.moveTo(px, headY + 10);
    ctx.lineTo(px, hipY);
    ctx.stroke();

    const inAir = py < GROUND - 4;
    if (inAir) {
      // Dynamic Jump Pose
      ctx.beginPath();
      ctx.moveTo(px, shouldY);
      ctx.lineTo(px - 22, shouldY - 16);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px, shouldY);
      ctx.lineTo(px + 22, shouldY - 16);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(px, hipY);
      ctx.lineTo(px - 16, hipY + 19);
      ctx.lineTo(px - 22, hipY + 36);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px, hipY);
      ctx.lineTo(px + 14, hipY + 17);
      ctx.lineTo(px + 19, hipY + 34);
      ctx.stroke();
    } else {
      // Running Animation
      const t = frame * 0.22;
      const sw = Math.sin(t);
      const cw = Math.cos(t);

      // Arms
      ctx.beginPath();
      ctx.moveTo(px, shouldY);
      ctx.lineTo(px - sw * 20, shouldY + 17);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px, shouldY);
      ctx.lineTo(px + sw * 20, shouldY + 17);
      ctx.stroke();

      // Legs
      ctx.beginPath();
      ctx.moveTo(px, hipY);
      ctx.lineTo(px + sw * 22, hipY + 20);
      ctx.lineTo(px + sw * 22 + cw * 10, py);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px, hipY);
      ctx.lineTo(px - sw * 22, hipY + 20);
      ctx.lineTo(px - sw * 22 - cw * 10, py);
      ctx.stroke();
    }
  }

  ctx.shadowBlur = 0;
}

export default function StickmanRun({ onClose }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  const [gameState, setGameState] = useState('loading'); // loading, playing, question, gameOver, victory
  const [sessionToken, setSessionToken] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [answersLog, setAnswersLog] = useState([]);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [muted, setMuted] = useState(() => gameAudio.isMuted());

  // Mutable Game Engine State Ref
  const gameRef = useRef({
    frame: 0,
    offset: 0,
    speed: BASE_SPD,
    score: 0,
    lives: 3,
    player: {
      y: GROUND,
      vy: 0,
      ducking: false,
      jumping: false,
      isDoubleJump: false,
      invincible: 0
    },
    obstacles: [],
    coins: [],
    particles: [],
    stars: [],
    bossActive: false,
    bossIndex: 0,
    bossDefeatedCount: 0,
    isPaused: false,
    keys: {}
  });

  // 1. Initialize API Session
  useEffect(() => {
    let mounted = true;
    api.post('/events/stickman_run/start')
      .then(res => {
        if (!mounted) return;
        if (res.data.success) {
          setSessionToken(res.data.sessionToken);
          setQuestions(res.data.questions || []);
          setGameState('playing');

          // Initialize background stars across wide screen
          const stars = Array.from({ length: 90 }, () => ({
            x: Math.random() * CW,
            y: Math.random() * (GROUND - 40),
            r: 1 + Math.random() * 2.5,
            speed: 0.5 + Math.random() * 2,
            phase: Math.random() * Math.PI * 2,
            color: ['#fff', '#a78bfa', '#fbcfe8', '#fed7aa', '#38bdf8'][Math.floor(Math.random() * 5)]
          }));
          gameRef.current.stars = stars;
        } else {
          toast.error(res.data.error || 'تعذر بدء اللعبة');
          onClose();
        }
      })
      .catch(err => {
        if (!mounted) return;
        toast.error(err.response?.data?.error || 'حدث خطأ في الاتصال بالخادم');
        onClose();
      });

    return () => {
      mounted = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  // 2. Keyboard Handlers
  useEffect(() => {
    const handleKeyDown = (e) => {
      gameRef.current.keys[e.code] = true;
      if ((e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') && gameState === 'playing') {
        e.preventDefault();
        triggerJump();
      }
      if ((e.code === 'ArrowDown' || e.code === 'KeyS') && gameState === 'playing') {
        e.preventDefault();
        gameRef.current.player.ducking = true;
        try { gameAudio.playDuck(); } catch (_) {}
      }
    };
    const handleKeyUp = (e) => {
      gameRef.current.keys[e.code] = false;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        gameRef.current.player.ducking = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState]);

  const triggerJump = () => {
    const g = gameRef.current;
    if (g.isPaused) return;

    if (!g.player.jumping && g.player.y >= GROUND - 4) {
      g.player.vy = JUMP_V;
      g.player.jumping = true;
      g.player.isDoubleJump = false;
      try { gameAudio.playJump(); } catch (_) {}
    } else if (g.player.jumping && !g.player.isDoubleJump) {
      g.player.vy = JUMP_V * 0.85;
      g.player.isDoubleJump = true;
      try { gameAudio.playJump(); } catch (_) {}
    }
  };

  // 3. Main Game Loop
  useEffect(() => {
    if (gameState !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const loop = () => {
      const g = gameRef.current;

      if (!g.isPaused) {
        g.frame++;
        g.offset += g.speed;
        g.speed = Math.min(MAX_SPD, BASE_SPD + Math.floor(g.frame / 600) * 0.35);

        // Player Physics
        const p = g.player;
        p.vy += GRAVITY;
        p.y += p.vy;

        if (p.y >= GROUND) {
          p.y = GROUND;
          p.vy = 0;
          p.jumping = false;
          p.isDoubleJump = false;
        }

        if (p.invincible > 0) p.invincible--;

        // Spawn Obstacles (Ground Crates & Aerial Drones)
        if (!g.bossActive) {
          if (g.frame % 105 === 0 && Math.random() > 0.35) {
            const isFlying = Math.random() > 0.55;
            g.obstacles.push({
              x: CW + 50,
              y: isFlying ? GROUND - 75 : GROUND - 46,
              w: isFlying ? 50 : 44,
              h: isFlying ? 36 : 46,
              isFlying,
              type: isFlying ? 'drone' : 'spike',
              color: isFlying ? '#ec4899' : '#f59e0b'
            });
          }

          // Spawn Star Coins
          if (g.frame % 70 === 0) {
            g.coins.push({
              x: CW + 50,
              y: GROUND - 45 - (Math.random() > 0.5 ? 70 : 0),
              r: 16,
              collected: false
            });
          }
        }

        // Update Obstacles
        g.obstacles.forEach(ob => { ob.x -= g.speed; });
        g.obstacles = g.obstacles.filter(ob => ob.x > -80);

        // Update Coins
        g.coins.forEach(c => { c.x -= g.speed; });
        g.coins = g.coins.filter(c => c.x > -40 && !c.collected);

        // Update Particles
        g.particles.forEach(pt => {
          pt.x += pt.vx;
          pt.y += pt.vy;
          pt.life--;
        });
        g.particles = g.particles.filter(pt => pt.life > 0);

        // Coin Collection Collision (Protected with try/catch)
        g.coins.forEach(c => {
          if (!c.collected) {
            const playerH = p.ducking ? DUCK_H : STAND_H;
            const playerTop = p.y - playerH;
            if (PLAYER_X + 22 > c.x - c.r && PLAYER_X - 22 < c.x + c.r &&
                p.y > c.y - c.r && playerTop < c.y + c.r) {
              c.collected = true;
              g.score += 50;
              setScore(g.score);

              try {
                gameAudio.playCoin();
              } catch (_) {}

              // Sparkle particles
              for (let i = 0; i < 10; i++) {
                g.particles.push({
                  x: c.x,
                  y: c.y,
                  vx: (Math.random() - 0.5) * 8,
                  vy: (Math.random() - 0.5) * 8,
                  r: 3 + Math.random() * 4,
                  color: '#facc15',
                  life: 22
                });
              }
            }
          }
        });

        // Obstacle Hit Collision
        if (p.invincible <= 0) {
          for (const ob of g.obstacles) {
            const playerH = p.ducking ? DUCK_H : STAND_H;
            const playerTop = p.y - playerH;

            // Box Collision
            if (PLAYER_X + 18 > ob.x && PLAYER_X - 18 < ob.x + ob.w &&
                p.y > ob.y && playerTop < ob.y + ob.h) {
              // Hit obstacle!
              g.lives--;
              setLives(g.lives);
              p.invincible = 65;
              try { gameAudio.playExplosion(); } catch (_) {}

              if (g.lives <= 0) {
                handleGameOver(false);
                return;
              }
              break;
            }
          }
        }

        // ── BOSS TRIGGER CHECK ───────────────────────────────────────
        if (!g.bossActive && g.bossIndex < questions.length) {
          const targetFrame = g.bossIndex === 0 ? BOSS1_FRAME : (BOSS1_FRAME + g.bossIndex * BOSS_GAP_FRAMES);
          if (g.frame >= targetFrame) {
            g.bossActive = true;
            g.isPaused = true;
            try { gameAudio.playBossAlert(); } catch (_) {}
            setActiveQuestion(questions[g.bossIndex]);
            setCurrentQIndex(g.bossIndex);
            setGameState('question');
            return;
          }
        }
      }

      // ── RENDER CANVAS (Spans 100% full screen) ────────────────────
      ctx.clearRect(0, 0, CW, CH);

      // 1. Synthwave Cyber Parallax Background
      drawBackground(ctx, g.offset, g.stars, g.frame);

      // 2. High-Speed Ground Grid
      drawGround(ctx, g.offset);

      // 3. Draw Star Coins ⭐
      g.coins.forEach(c => {
        if (!c.collected) {
          ctx.save();
          ctx.shadowBlur = 16;
          ctx.shadowColor = '#f59e0b';
          ctx.fillStyle = '#facc15';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Star Symbol inside coin
          ctx.fillStyle = '#92400e';
          ctx.font = 'bold 15px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('★', c.x, c.y + 1);
          ctx.restore();
        }
      });

      // 4. Draw Obstacles
      g.obstacles.forEach(ob => {
        ctx.save();
        ctx.shadowBlur = 18;
        ctx.shadowColor = ob.color;

        if (ob.type === 'drone') {
          // Cyber Flying Drone
          ctx.fillStyle = '#db2777';
          ctx.strokeStyle = '#f472b6';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.ellipse(ob.x + ob.w / 2, ob.y + ob.h / 2, ob.w / 2, ob.h / 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Laser eye
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(ob.x + ob.w / 2, ob.y + ob.h / 2, 6, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Cyber Ground Hazard
          ctx.fillStyle = '#f59e0b';
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 2.5;
          roundRect(ctx, ob.x, ob.y, ob.w, ob.h, 8, true, true);

          // Diagonal Hazard Stripes
          ctx.strokeStyle = '#78350f';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(ob.x + 8, ob.y + ob.h);
          ctx.lineTo(ob.x + ob.w - 8, ob.y);
          ctx.stroke();
        }
        ctx.restore();
      });

      // 5. Draw Particles
      g.particles.forEach(pt => {
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // 6. Draw Stickman Hero
      drawStickmanHero(
        ctx,
        PLAYER_X,
        g.player.y,
        g.frame,
        g.player.ducking,
        g.player.invincible > 0,
        g.player.isDoubleJump
      );

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [gameState]);

  // 4. Handle Boss Question Answer
  const handleAnswerSubmit = (result) => {
    const newAnswers = [...answersLog, result];
    setAnswersLog(newAnswers);

    const isCorrect = result.selectedIndex === 0 || result.selectedIndex === (activeQuestion?.correctIndex ?? 0);

    if (isCorrect) {
      try {
        gameAudio.playCorrect();
        gameAudio.playExplosion();
      } catch (_) {}

      const g = gameRef.current;
      g.score += 1000;
      setScore(g.score);
      g.bossDefeatedCount++;
      g.bossIndex++;
      g.bossActive = false;

      // Particle explosion for boss defeat
      for (let i = 0; i < 40; i++) {
        g.particles.push({
          x: CW - 240 + (Math.random() - 0.5) * 80,
          y: CH / 2 + (Math.random() - 0.5) * 80,
          vx: (Math.random() - 0.5) * 18,
          vy: (Math.random() - 0.5) * 18,
          r: 4 + Math.random() * 6,
          color: ['#00ffcc', '#f59e0b', '#ec4899', '#ffffff'][Math.floor(Math.random() * 4)],
          life: 35
        });
      }

      if (g.bossIndex >= questions.length) {
        // Victory!
        handleGameOver(true, newAnswers);
      } else {
        g.isPaused = false;
        setGameState('playing');
      }
    } else {
      try { gameAudio.playWrong(); } catch (_) {}
      const newLives = lives - 1;
      setLives(newLives);

      if (newLives <= 0) {
        handleGameOver(false, newAnswers);
      } else {
        const g = gameRef.current;
        g.bossIndex++;
        g.bossActive = false;
        g.isPaused = false;
        setGameState('playing');
      }
    }
  };

  // 5. Finish Game
  const handleGameOver = (isVictory, finalAnswers = answersLog) => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const g = gameRef.current;
    g.isPaused = true;

    api.post('/events/stickman_run/finish', {
      sessionToken,
      answers: finalAnswers,
      completed: isVictory,
      rawScore: g.score
    })
      .then(res => {
        if (res.data.success) {
          setPointsEarned(res.data.pointsEarned);
          setGameState(isVictory ? 'victory' : 'gameOver');
        }
      })
      .catch(err => {
        console.error('[finish game error]', err);
        setGameState(isVictory ? 'victory' : 'gameOver');
      });
  };

  const handleToggleMute = () => {
    const isMuted = gameAudio.toggleMute();
    setMuted(isMuted);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#040112] w-screen h-screen flex flex-col justify-between select-none overflow-hidden touch-none" dir="rtl">
      {/* HUD spanning full width */}
      <GameHUD
        title="مغامرة الستيكمان"
        lives={lives}
        score={score}
        currentQuestion={Math.min(currentQIndex + 1, questions.length)}
        totalQuestions={questions.length || 3}
        muted={muted}
        onToggleMute={handleToggleMute}
        onExit={onClose}
        accentColor="#8b5cf6"
      />

      {/* Fullscreen Canvas filling 100vw x 100vh */}
      <canvas
        ref={canvasRef}
        width={CW}
        height={CH}
        className="absolute inset-0 w-full h-full object-cover block bg-[#040112]"
      />

      {/* ── ON-CANVAS MOBILE TOUCH CONTROLS (TWO-THUMB CORNERS) ── */}
      <div className="absolute inset-x-0 bottom-4 sm:bottom-6 px-4 sm:px-8 flex items-center justify-between pointer-events-none z-20">
        {/* Left Thumb: Duck Button */}
        <div className="pointer-events-auto">
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              gameRef.current.player.ducking = true;
              try { gameAudio.playDuck(); } catch (_) {}
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              gameRef.current.player.ducking = false;
            }}
            onPointerCancel={() => {
              gameRef.current.player.ducking = false;
            }}
            className="w-18 h-18 sm:w-22 sm:h-22 rounded-3xl bg-gradient-to-tr from-pink-600 via-purple-700 to-indigo-800 border-2 border-pink-300 shadow-2xl shadow-pink-600/60 flex flex-col items-center justify-center text-white active:scale-90 transition-transform font-black select-none cursor-pointer"
          >
            <span className="text-2xl sm:text-3xl">⬇️</span>
            <span className="text-[11px] sm:text-xs font-black mt-0.5">انحناء</span>
          </button>
        </div>

        {/* Desktop Keyboard Helper Badge */}
        <div className="hidden md:flex items-center gap-2 bg-black/60 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/15 text-white/80 text-xs font-bold pointer-events-auto shadow-xl">
          <span>⌨️ التحكم بالكيبورد:</span>
          <span className="bg-white/10 px-2 py-0.5 rounded text-purple-300 font-mono">Space / ↑</span> قفز
          <span className="bg-white/10 px-2 py-0.5 rounded text-indigo-300 font-mono">↓ / S</span> انحناء
        </div>

        {/* Right Thumb: Jump Button */}
        <div className="pointer-events-auto">
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              triggerJump();
            }}
            className="w-18 h-18 sm:w-22 sm:h-22 rounded-3xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-500 border-2 border-cyan-300 shadow-2xl shadow-purple-600/60 flex flex-col items-center justify-center text-white active:scale-90 transition-transform font-black select-none cursor-pointer"
          >
            <span className="text-2xl sm:text-3xl">⬆️</span>
            <span className="text-[11px] sm:text-xs font-black mt-0.5">قفز</span>
          </button>
        </div>
      </div>

      {/* Loading Spinner */}
      {gameState === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md gap-3 z-30">
          <div className="animate-spin w-14 h-14 border-4 border-purple-500 border-t-transparent rounded-full" />
          <p className="text-white font-bold text-base animate-pulse">جاري تجهيز مضمار السباق والتحديات...</p>
        </div>
      )}

      {/* Question Dialog Overlay */}
      {gameState === 'question' && activeQuestion && (
        <QuestionOverlay
          question={activeQuestion}
          questionIndex={currentQIndex}
          totalQuestions={questions.length}
          timeLimit={activeQuestion.timeLimit || 45}
          enemyLabel={activeQuestion.enemyLabel || `الزعيم ${currentQIndex + 1}`}
          onAnswer={handleAnswerSubmit}
        />
      )}

      {/* Result Modal */}
      {(gameState === 'victory' || gameState === 'gameOver') && (
        <GameResultModal
          isVictory={gameState === 'victory'}
          score={score}
          pointsEarned={pointsEarned}
          correctCount={answersLog.filter(a => a.selectedIndex === 0 || a.selectedIndex === (questions[a.questionIndex]?.correctIndex ?? 0)).length}
          totalQuestions={questions.length}
          gameTitle="مغامرة الستيكمان"
          onReplay={() => window.location.reload()}
          onExit={onClose}
        />
      )}
    </div>
  );
}
