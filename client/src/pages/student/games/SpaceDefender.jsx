import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import gameAudio from '../../../lib/gameAudio';
import GameHUD from '../../../components/games/GameHUD';
import QuestionOverlay from '../../../components/games/QuestionOverlay';
import GameResultModal from '../../../components/games/GameResultModal';
import api from '../../../lib/api';
import toast from 'react-hot-toast';

const CW = 1280;
const CH = 720;

export default function SpaceDefender({ onClose }) {
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

  // Mutable Game Engine Ref with Multi-Touch Tracking
  const gameRef = useRef({
    frame: 0,
    score: 0,
    lives: 3,
    ship: { x: 160, y: CH / 2, vx: 0, vy: 0, speed: 7.5, inv: 0, w: 56, h: 42 },
    lasers: [],
    ducks: [],
    eggs: [],
    particles: [],
    stars: [],
    boss: null,
    bossIndex: 0,
    nextBossScore: 1000,
    isPaused: false,
    isFiring: false,
    lastFireTime: 0,
    keys: {},
    moveTouchId: null,
    touchPos: null
  });

  // 1. Initialize API Session
  useEffect(() => {
    let mounted = true;
    api.post('/events/space_blaster/start')
      .then(res => {
        if (!mounted) return;
        if (res.data.success) {
          setSessionToken(res.data.sessionToken);
          setQuestions(res.data.questions || []);
          setGameState('playing');

          const stars = Array.from({ length: 110 }, () => ({
            x: Math.random() * CW,
            y: Math.random() * CH,
            r: 1 + Math.random() * 2.4,
            speed: 0.8 + Math.random() * 2.8,
            color: ['#ffffff', '#67e8f9', '#c084fc', '#fde047', '#a7f3d0'][Math.floor(Math.random() * 5)]
          }));
          gameRef.current.stars = stars;
        } else {
          toast.error(res.data.error || 'تعذر بدء اللعبة');
          onClose();
        }
      })
      .catch(err => {
        if (!mounted) return;
        toast.error(err.response?.data?.error || 'حدث خطأ في تحميل لعبة حرب البط الفضائي');
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
      if ((e.code === 'Space' || e.code === 'KeyC' || e.code === 'KeyX') && gameState === 'playing') {
        e.preventDefault();
        gameRef.current.isFiring = true;
        tryManualFire();
      }
    };
    const handleKeyUp = (e) => {
      gameRef.current.keys[e.code] = false;
      if (e.code === 'Space' || e.code === 'KeyC' || e.code === 'KeyX') {
        gameRef.current.isFiring = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState]);

  // Laser manual trigger with firing cooldown
  const tryManualFire = () => {
    const g = gameRef.current;
    if (g.isPaused) return;
    const now = Date.now();
    if (now - g.lastFireTime < 160) return;
    g.lastFireTime = now;

    // Dual Plasma Lasers
    g.lasers.push(
      { x: g.ship.x + 32, y: g.ship.y - 12, vx: 16, w: 22, h: 5, color: '#22d3ee' },
      { x: g.ship.x + 32, y: g.ship.y + 12, vx: 16, w: 22, h: 5, color: '#22d3ee' }
    );
    try { gameAudio.playLaser(); } catch (_) {}
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

        // Keyboard Movement
        const k = g.keys;
        let dx = 0, dy = 0;
        if (k['ArrowUp'] || k['KeyW']) dy -= 1;
        if (k['ArrowDown'] || k['KeyS']) dy += 1;
        if (k['ArrowLeft'] || k['KeyA']) dx -= 1;
        if (k['ArrowRight'] || k['KeyD']) dx += 1;

        if (g.isFiring) {
          tryManualFire();
        }

        g.ship.x += dx * g.ship.speed;
        g.ship.y += dy * g.ship.speed;

        g.ship.x = Math.max(50, Math.min(CW - 100, g.ship.x));
        g.ship.y = Math.max(50, Math.min(CH - 50, g.ship.y));

        if (g.ship.inv > 0) g.ship.inv--;

        // Move stars
        g.stars.forEach(s => {
          s.x -= s.speed;
          if (s.x < 0) s.x = CW + 10;
        });

        // Move lasers
        g.lasers.forEach(l => { l.x += l.vx; });
        g.lasers = g.lasers.filter(l => l.x < CW + 30);

        // ── SPAWN SPACE DUCKS ─────────────────────────────────────────
        if (!g.boss && g.frame % 50 === 0) {
          const isArmored = Math.random() > 0.65;
          g.ducks.push({
            x: CW + 60,
            baseY: 80 + Math.random() * (CH - 180),
            y: 0,
            vx: 3.0 + Math.random() * 2.5,
            phase: Math.random() * Math.PI * 2,
            hp: isArmored ? 2 : 1,
            maxHp: isArmored ? 2 : 1,
            isArmored,
            w: 52,
            h: 44,
            eggTimer: Math.floor(Math.random() * 40)
          });
        }

        // Update Ducks & Drop Egg Bombs
        g.ducks.forEach(d => {
          d.x -= d.vx;
          d.y = d.baseY + Math.sin(g.frame * 0.045 + d.phase) * 45;
          d.eggTimer++;

          if (d.eggTimer > 75 && d.x > 220 && d.x < CW - 120 && Math.random() < 0.04) {
            d.eggTimer = 0;
            g.eggs.push({
              x: d.x - 12,
              y: d.y + 16,
              vx: -4.0 - Math.random() * 2,
              vy: 1.8 + (Math.random() - 0.5) * 2,
              r: 10,
              rot: 0,
              color: d.isArmored ? '#ec4899' : '#facc15'
            });
            try { gameAudio.playPop(); } catch (_) {}
          }
        });
        g.ducks = g.ducks.filter(d => d.x > -70);

        // Update Eggs
        g.eggs.forEach(egg => {
          egg.x += egg.vx;
          egg.y += egg.vy;
          egg.rot += 0.14;
        });
        g.eggs = g.eggs.filter(egg => egg.x > -30 && egg.y > -30 && egg.y < CH + 30);

        // Update Particles
        g.particles.forEach(p => {
          p.x += p.vx;
          p.y += p.vy;
          p.life--;
        });
        g.particles = g.particles.filter(p => p.life > 0);

        // ── LASERS VS DUCKS COLLISION ────────────────────────────────
        for (let i = g.lasers.length - 1; i >= 0; i--) {
          const l = g.lasers[i];
          let laserHit = false;

          for (let j = g.ducks.length - 1; j >= 0; j--) {
            const d = g.ducks[j];
            const dist = Math.hypot(l.x - d.x, l.y - d.y);
            if (dist < 38) {
              d.hp--;
              laserHit = true;

              for (let p = 0; p < 7; p++) {
                g.particles.push({
                  x: l.x,
                  y: l.y,
                  vx: (Math.random() - 0.5) * 7,
                  vy: (Math.random() - 0.5) * 7,
                  r: 2 + Math.random() * 3,
                  color: '#22d3ee',
                  life: 15
                });
              }

              if (d.hp <= 0) {
                g.ducks.splice(j, 1);
                g.score += d.isArmored ? 150 : 100;
                setScore(g.score);
                try { gameAudio.playExplosion(); } catch (_) {}

                for (let f = 0; f < 16; f++) {
                  g.particles.push({
                    x: d.x,
                    y: d.y,
                    vx: (Math.random() - 0.5) * 9,
                    vy: (Math.random() - 0.5) * 9,
                    r: 3 + Math.random() * 5,
                    color: d.isArmored ? '#f472b6' : '#fde047',
                    life: 25
                  });
                }
              }
              break;
            }
          }

          if (!laserHit) {
            for (let e = g.eggs.length - 1; e >= 0; e--) {
              const egg = g.eggs[e];
              const dist = Math.hypot(l.x - egg.x, l.y - egg.y);
              if (dist < egg.r + 12) {
                laserHit = true;
                g.eggs.splice(e, 1);
                g.score += 50;
                setScore(g.score);
                try { gameAudio.playPop(); } catch (_) {}

                for (let p = 0; p < 9; p++) {
                  g.particles.push({
                    x: egg.x,
                    y: egg.y,
                    vx: (Math.random() - 0.5) * 7,
                    vy: (Math.random() - 0.5) * 7,
                    r: 2 + Math.random() * 4,
                    color: '#f59e0b',
                    life: 20
                  });
                }
                break;
              }
            }
          }

          if (laserHit) {
            g.lasers.splice(i, 1);
          }
        }

        // ── SHIP VS EGGS & DUCKS COLLISION ───────────────────────────
        if (g.ship.inv <= 0) {
          for (let e = g.eggs.length - 1; e >= 0; e--) {
            const egg = g.eggs[e];
            const dist = Math.hypot(g.ship.x - egg.x, g.ship.y - egg.y);
            if (dist < egg.r + 24) {
              g.eggs.splice(e, 1);
              g.lives--;
              setLives(g.lives);
              g.ship.inv = 70;
              try { gameAudio.playExplosion(); } catch (_) {}

              if (g.lives <= 0) {
                handleGameOver(false);
                return;
              }
              break;
            }
          }

          for (const d of g.ducks) {
            const dist = Math.hypot(g.ship.x - d.x, g.ship.y - d.y);
            if (dist < 40) {
              g.lives--;
              setLives(g.lives);
              g.ship.inv = 70;
              try { gameAudio.playExplosion(); } catch (_) {}

              if (g.lives <= 0) {
                handleGameOver(false);
                return;
              }
              break;
            }
          }
        }

        // ── BOSS ENCOUNTER ───────────────────────────────────────────
        if (!g.boss && g.bossIndex < questions.length && g.score >= g.nextBossScore) {
          g.boss = {
            x: CW + 140,
            targetX: CW - 220,
            y: CH / 2,
            w: 150,
            h: 140,
            hp: 3,
            num: g.bossIndex + 1,
            pulse: 0
          };
          try { gameAudio.playBossAlert(); } catch (_) {}
        }

        if (g.boss) {
          g.boss.pulse += 0.08;
          if (g.boss.x > g.boss.targetX) {
            g.boss.x -= 4;
          } else {
            g.isPaused = true;
            g.isFiring = false;
            setActiveQuestion(questions[g.bossIndex]);
            setCurrentQIndex(g.bossIndex);
            setGameState('question');
            return;
          }
        }
      }

      // ── CANVAS RENDERING ───────────────────────────────────────────
      ctx.clearRect(0, 0, CW, CH);

      // 1. Deep Space Cosmic Background
      const bgGrad = ctx.createLinearGradient(0, 0, CW, CH);
      bgGrad.addColorStop(0, '#04020c');
      bgGrad.addColorStop(0.5, '#0b061e');
      bgGrad.addColorStop(1, '#020d18');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, CW, CH);

      // 2. Twinkling Stars
      g.stars.forEach(s => {
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // 3. Laser Beams
      g.lasers.forEach(l => {
        ctx.save();
        ctx.shadowBlur = 16;
        ctx.shadowColor = '#06b6d4';
        ctx.fillStyle = '#67e8f9';
        ctx.fillRect(l.x, l.y - l.h / 2, l.w, l.h);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(l.x + 4, l.y - (l.h - 2) / 2, l.w - 8, l.h - 2);
        ctx.restore();
      });

      // 4. Draw Space Ducks 🦆
      g.ducks.forEach(d => {
        ctx.save();
        ctx.translate(d.x, d.y);

        const wingWing = Math.sin(g.frame * 0.28 + d.phase) * 14;

        ctx.fillStyle = d.isArmored ? '#ec4899' : '#facc15';
        ctx.beginPath();
        ctx.ellipse(0, 5, 22, 16, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = d.isArmored ? '#db2777' : '#eab308';
        ctx.beginPath();
        ctx.ellipse(-5, 2 + wingWing * 0.35, 14, 8, -0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = d.isArmored ? '#ec4899' : '#facc15';
        ctx.beginPath();
        ctx.arc(-14, -7, 13, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(-26, -7);
        ctx.lineTo(-38, -4);
        ctx.lineTo(-26, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#06b6d4';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#06b6d4';
        ctx.beginPath();
        ctx.arc(-18, -8, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = 'rgba(103, 232, 249, 0.65)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(-13, -6, 17, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
      });

      // 5. Draw Glowing Egg Bombs 🥚
      g.eggs.forEach(egg => {
        ctx.save();
        ctx.translate(egg.x, egg.y);
        ctx.rotate(egg.rot);
        ctx.shadowBlur = 14;
        ctx.shadowColor = egg.color;

        ctx.fillStyle = egg.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, egg.r, egg.r * 1.35, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-2.5, -3.5, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      });

      // 6. Draw Player Fighter Spaceship 🚀
      if (!(g.ship.inv > 0 && Math.floor(g.frame * 0.2) % 2 === 1)) {
        ctx.save();
        ctx.translate(g.ship.x, g.ship.y);

        const thrusterLen = 20 + Math.random() * 16;
        const thrusterGrad = ctx.createLinearGradient(-20, 0, -20 - thrusterLen, 0);
        thrusterGrad.addColorStop(0, '#00ffff');
        thrusterGrad.addColorStop(0.5, '#3b82f6');
        thrusterGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = thrusterGrad;
        ctx.beginPath();
        ctx.moveTo(-18, -8);
        ctx.lineTo(-18 - thrusterLen, 0);
        ctx.lineTo(-18, 8);
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 18;
        ctx.shadowColor = '#00ffff';
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.moveTo(30, 0);
        ctx.lineTo(-14, -22);
        ctx.lineTo(-8, -8);
        ctx.lineTo(-22, -8);
        ctx.lineTo(-22, 8);
        ctx.lineTo(-8, 8);
        ctx.lineTo(-14, 22);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.ellipse(6, 0, 10, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      // 7. Draw Giant Boss Duck 👑🦆
      if (g.boss) {
        ctx.save();
        ctx.translate(g.boss.x, g.boss.y);

        ctx.shadowBlur = 30;
        ctx.shadowColor = '#f59e0b';

        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        ctx.ellipse(0, 12, 58, 46, 0, 0, Math.PI * 2);
        ctx.fill();

        const bossWing = Math.sin(g.boss.pulse) * 18;
        ctx.fillStyle = '#ca8a04';
        ctx.beginPath();
        ctx.ellipse(-12, 10 + bossWing * 0.35, 36, 20, -0.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(-30, -22, 34, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ea580c';
        ctx.beginPath();
        ctx.moveTo(-60, -22);
        ctx.lineTo(-92, -12);
        ctx.lineTo(-60, -2);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fbbf24';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-45, -54);
        ctx.lineTo(-52, -70);
        ctx.lineTo(-38, -58);
        ctx.lineTo(-28, -75);
        ctx.lineTo(-18, -58);
        ctx.lineTo(-4, -70);
        ctx.lineTo(-12, -54);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(-28, -20, 44, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
      }

      // 8. Draw Particles
      g.particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [gameState]);

  // 4. Handle Boss Question Submission
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
      g.score += 800;
      setScore(g.score);
      g.boss = null;
      g.bossIndex++;
      g.nextBossScore = g.score + 1200;

      for (let p = 0; p < 45; p++) {
        g.particles.push({
          x: CW - 200 + (Math.random() - 0.5) * 100,
          y: CH / 2 + (Math.random() - 0.5) * 100,
          vx: (Math.random() - 0.5) * 20,
          vy: (Math.random() - 0.5) * 20,
          r: 4 + Math.random() * 7,
          color: ['#00ffff', '#f59e0b', '#ec4899', '#ffffff'][Math.floor(Math.random() * 4)],
          life: 35
        });
      }

      if (g.bossIndex >= questions.length) {
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
        g.boss = null;
        g.bossIndex++;
        g.nextBossScore = g.score + 1000;
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

    api.post('/events/space_blaster/finish', {
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
        console.error('[space finish error]', err);
        setGameState(isVictory ? 'victory' : 'gameOver');
      });
  };

  const handleToggleMute = () => {
    const isMuted = gameAudio.toggleMute();
    setMuted(isMuted);
  };

  const totalBosses = questions.length || 3;

  // ── MULTI-TOUCH STEERING HANDLERS ──
  const handleContainerTouchStart = (e) => {
    if (gameState !== 'playing') return;
    const g = gameRef.current;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (g.moveTouchId === null && touch.clientX < window.innerWidth * 0.78) {
        g.moveTouchId = touch.identifier;
        g.touchPos = { x: touch.clientX, y: touch.clientY };
        break;
      }
    }
  };

  const handleContainerTouchMove = (e) => {
    if (gameState !== 'playing') return;
    const g = gameRef.current;
    if (g.moveTouchId === null || !g.touchPos) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === g.moveTouchId) {
        const dx = (touch.clientX - g.touchPos.x) * 1.8;
        const dy = (touch.clientY - g.touchPos.y) * 1.8;

        g.ship.x = Math.max(50, Math.min(CW - 100, g.ship.x + dx));
        g.ship.y = Math.max(50, Math.min(CH - 50, g.ship.y + dy));

        g.touchPos = { x: touch.clientX, y: touch.clientY };
        break;
      }
    }
  };

  const handleContainerTouchEnd = (e) => {
    const g = gameRef.current;
    if (g.moveTouchId === null) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === g.moveTouchId) {
        g.moveTouchId = null;
        g.touchPos = null;
        break;
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#03010a] w-screen h-screen flex flex-col justify-between select-none overflow-hidden touch-none"
      dir="rtl"
      onTouchStart={handleContainerTouchStart}
      onTouchMove={handleContainerTouchMove}
      onTouchEnd={handleContainerTouchEnd}
      onTouchCancel={handleContainerTouchEnd}
    >
      <GameHUD
        title="حرب البط الفضائي 🦆"
        lives={lives}
        score={score}
        currentQuestion={Math.min(currentQIndex + 1, totalBosses)}
        totalQuestions={totalBosses}
        muted={muted}
        onToggleMute={handleToggleMute}
        onExit={onClose}
        accentColor="#06b6d4"
      />

      {/* Fullscreen Canvas */}
      <canvas
        ref={canvasRef}
        width={CW}
        height={CH}
        className="absolute inset-0 w-full h-full object-cover block bg-[#03010a]"
      />

      {/* ── ON-SCREEN CONTROLS: EXTRA LARGE CLEAN FIRE BUTTON ── */}
      <div className="absolute inset-x-0 bottom-4 sm:bottom-6 px-4 sm:px-8 flex items-center justify-between pointer-events-none z-20">
        {/* Left Thumb Virtual Steer Indicator */}
        <div className="pointer-events-auto">
          <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-2xl border border-cyan-500/30 text-cyan-200 text-xs font-bold shadow-2xl flex items-center gap-2">
            <span className="text-base animate-pulse">🕹️</span>
            <span>اسحب للتحليق</span>
          </div>
        </div>

        {/* Keyboard helper for desktop */}
        <div className="hidden lg:flex items-center gap-2 bg-black/60 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/15 text-white/80 text-xs font-bold pointer-events-auto shadow-xl">
          <span>⌨️ التحكم:</span>
          <span className="bg-white/10 px-2 py-0.5 rounded text-cyan-300 font-mono">WASD / الأسهم</span>
          <span className="bg-white/10 px-2 py-0.5 rounded text-cyan-300 font-mono">Space</span> إطلاق
        </div>

        {/* Right Thumb: Huge Circular Fire Button (No text, pure large clear icon) */}
        <div className="pointer-events-auto">
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              gameRef.current.isFiring = true;
              tryManualFire();
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              e.stopPropagation();
              gameRef.current.isFiring = false;
            }}
            onPointerCancel={(e) => {
              e.stopPropagation();
              gameRef.current.isFiring = false;
            }}
            onPointerLeave={(e) => {
              e.stopPropagation();
              gameRef.current.isFiring = false;
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
            }}
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 border-4 border-cyan-300/80 shadow-[0_0_35px_rgba(6,182,212,0.6)] flex items-center justify-center text-white active:scale-90 transition-transform select-none cursor-pointer"
          >
            <span className="text-4xl sm:text-5xl drop-shadow-[0_0_12px_rgba(34,211,238,0.9)]">🔥</span>
          </button>
        </div>
      </div>

      {gameState === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md gap-3 z-30">
          <div className="animate-spin w-14 h-14 border-4 border-cyan-500 border-t-transparent rounded-full" />
          <p className="text-white font-bold text-base animate-pulse">جاري تجهيز مقاتلة الفضاء وتتبع سرب البط...</p>
        </div>
      )}

      {/* Boss Question Overlay */}
      {gameState === 'question' && activeQuestion && (
        <QuestionOverlay
          question={activeQuestion}
          questionIndex={currentQIndex}
          totalQuestions={totalBosses}
          timeLimit={activeQuestion.timeLimit || 45}
          enemyLabel={activeQuestion.enemyLabel || `زعيم بط الفضاء ${currentQIndex + 1} 👑🦆`}
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
          totalQuestions={totalBosses}
          gameTitle="حرب البط الفضائي 🦆"
          onReplay={() => window.location.reload()}
          onExit={onClose}
        />
      )}
    </div>
  );
}
