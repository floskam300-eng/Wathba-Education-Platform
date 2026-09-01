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
const GROUND_Y = 560;

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

  // Mutable Game Engine Ref
  const gameRef = useRef({
    frame: 0,
    speed: 6.5,
    score: 0,
    lives: 3,
    hero: {
      x: 180,
      y: GROUND_Y - 70,
      vy: 0,
      isGrounded: true,
      isDucking: false,
      invulnerable: 0,
      animFrame: 0,
      jumpCount: 0
    },
    obstacles: [],
    coins: [],
    particles: [],
    boss: null,
    bossIndex: 0,
    nextBossScore: 1000,
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
        } else {
          toast.error(res.data.error || 'تعذر بدء اللعبة');
          onClose();
        }
      })
      .catch(err => {
        if (!mounted) return;
        toast.error(err.response?.data?.error || 'حدث خطأ في تحميل اللعبة');
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
      if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) {
        e.preventDefault();
        handleJump();
      }
      if (['ArrowDown', 'KeyS'].includes(e.code)) {
        e.preventDefault();
        handleDuck(true);
      }
    };
    const handleKeyUp = (e) => {
      gameRef.current.keys[e.code] = false;
      if (['ArrowDown', 'KeyS'].includes(e.code)) {
        handleDuck(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState]);

  // Jump Action (Supports Double Jump)
  const handleJump = () => {
    const hero = gameRef.current.hero;
    if (gameRef.current.isPaused) return;

    if (hero.isGrounded) {
      hero.vy = -16.5;
      hero.isGrounded = false;
      hero.jumpCount = 1;
      hero.isDucking = false;
      try { gameAudio.playJump(); } catch (_) {}
    } else if (hero.jumpCount === 1) {
      hero.vy = -14.5;
      hero.jumpCount = 2;
      try { gameAudio.playJump(); } catch (_) {}

      // Double jump spark particles
      for (let i = 0; i < 8; i++) {
        gameRef.current.particles.push({
          x: hero.x,
          y: hero.y + 40,
          vx: (Math.random() - 0.5) * 8,
          vy: Math.random() * 4,
          r: 3 + Math.random() * 3,
          color: '#8b5cf6',
          life: 20
        });
      }
    }
  };

  // Duck Action
  const handleDuck = (ducking) => {
    const hero = gameRef.current.hero;
    if (gameRef.current.isPaused) return;
    hero.isDucking = ducking;
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
        g.score += 2;
        setScore(g.score);

        // Update Hero Physics
        const hero = g.hero;
        if (!hero.isGrounded) {
          hero.vy += 0.78; // Gravity
          hero.y += hero.vy;

          if (hero.y >= GROUND_Y - 70) {
            hero.y = GROUND_Y - 70;
            hero.vy = 0;
            hero.isGrounded = true;
            hero.jumpCount = 0;
          }
        }

        if (hero.invulnerable > 0) hero.invulnerable--;

        // ── SPAWN OBSTACLES ───────────────────────────────────────────
        if (!g.boss && g.frame % 100 === 0 && Math.random() > 0.25) {
          const isHigh = Math.random() > 0.55;
          g.obstacles.push({
            x: CW + 50,
            y: isHigh ? GROUND_Y - 120 : GROUND_Y - 55,
            w: 44,
            h: isHigh ? 36 : 55,
            type: isHigh ? 'drone' : 'barrier',
            passed: false
          });
        }

        // ── SPAWN COINS ───────────────────────────────────────────────
        if (g.frame % 45 === 0 && Math.random() > 0.4) {
          g.coins.push({
            x: CW + 40,
            y: GROUND_Y - 60 - (Math.random() > 0.5 ? 65 : 0),
            r: 14,
            collected: false
          });
        }

        // Move & Filter Obstacles
        g.obstacles.forEach(o => { o.x -= g.speed; });
        g.obstacles = g.obstacles.filter(o => o.x > -80);

        // Move & Filter Coins
        g.coins.forEach(c => { c.x -= g.speed; });
        g.coins = g.coins.filter(c => c.x > -40);

        // Move & Filter Particles
        g.particles.forEach(p => {
          p.x += p.vx;
          p.y += p.vy;
          p.life--;
        });
        g.particles = g.particles.filter(p => p.life > 0);

        // ── HERO COLLISION WITH COINS ─────────────────────────────────
        const heroW = 34;
        const heroH = hero.isDucking ? 35 : 70;
        const heroTop = hero.isDucking ? hero.y + 35 : hero.y;

        g.coins.forEach(c => {
          if (!c.collected && Math.hypot(hero.x - c.x, (heroTop + heroH / 2) - c.y) < c.r + 28) {
            c.collected = true;
            g.score += 150;
            setScore(g.score);

            try {
              if (typeof gameAudio.playCoin === 'function') {
                gameAudio.playCoin();
              } else if (typeof gameAudio.playPop === 'function') {
                gameAudio.playPop();
              }
            } catch (_) {}

            for (let i = 0; i < 7; i++) {
              g.particles.push({
                x: c.x,
                y: c.y,
                vx: (Math.random() - 0.5) * 6,
                vy: (Math.random() - 0.5) * 6,
                r: 2 + Math.random() * 3,
                color: '#fbbf24',
                life: 18
              });
            }
          }
        });

        // ── HERO COLLISION WITH OBSTACLES ─────────────────────────────
        if (hero.invulnerable <= 0) {
          for (const o of g.obstacles) {
            const hitX = hero.x + heroW / 2 > o.x && hero.x - heroW / 2 < o.x + o.w;
            const hitY = heroTop < o.y + o.h && heroTop + heroH > o.y;

            if (hitX && hitY) {
              g.lives--;
              setLives(g.lives);
              hero.invulnerable = 60; // 1 second invulnerability
              try { gameAudio.playExplosion(); } catch (_) {}

              for (let i = 0; i < 14; i++) {
                g.particles.push({
                  x: hero.x,
                  y: heroTop + heroH / 2,
                  vx: (Math.random() - 0.5) * 8,
                  vy: (Math.random() - 0.5) * 8,
                  r: 3 + Math.random() * 4,
                  color: '#ef4444',
                  life: 25
                });
              }

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
            x: CW + 100,
            targetX: CW - 240,
            y: GROUND_Y - 140,
            w: 120,
            h: 140,
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
            setActiveQuestion(questions[g.bossIndex]);
            setCurrentQIndex(g.bossIndex);
            setGameState('question');
            return;
          }
        }
      }

      // ── CANVAS RENDERING ───────────────────────────────────────────
      ctx.clearRect(0, 0, CW, CH);

      // 1. Synthwave Cyber Sky Gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      skyGrad.addColorStop(0, '#090014');
      skyGrad.addColorStop(0.5, '#1e053a');
      skyGrad.addColorStop(1, '#3b0764');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, CW, GROUND_Y);

      // 2. Glowing Synthwave Moon
      ctx.save();
      const moonX = CW * 0.75;
      const moonY = 160;
      const moonGrad = ctx.createRadialGradient(moonX, moonY, 10, moonX, moonY, 80);
      moonGrad.addColorStop(0, '#ffffff');
      moonGrad.addColorStop(0.4, '#c084fc');
      moonGrad.addColorStop(0.8, '#7e22ce');
      moonGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = moonGrad;
      ctx.beginPath();
      ctx.arc(moonX, moonY, 80, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 3. Parallax Skyline
      ctx.fillStyle = 'rgba(23, 7, 45, 0.9)';
      const skylineOffset = (g.frame * 0.4) % 180;
      for (let bx = -skylineOffset; bx < CW + 180; bx += 100) {
        const bHeight = 110 + ((bx * 37) % 130);
        ctx.fillRect(bx, GROUND_Y - bHeight, 75, bHeight);
      }

      // 4. Ground Grid & Cyber Glow
      ctx.fillStyle = '#06010f';
      ctx.fillRect(0, GROUND_Y, CW, CH - GROUND_Y);

      // Neon Top Border of Ground
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 4;
      ctx.shadowBlur = 16;
      ctx.shadowColor = '#d946ef';
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(CW, GROUND_Y);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Moving Ground Grid Lines
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.35)';
      ctx.lineWidth = 2;
      const gridOffset = (g.frame * g.speed) % 50;
      for (let gx = -gridOffset; gx < CW + 50; gx += 50) {
        ctx.beginPath();
        ctx.moveTo(gx, GROUND_Y);
        ctx.lineTo(gx - 60, CH);
        ctx.stroke();
      }

      // 5. Draw Obstacles
      g.obstacles.forEach(o => {
        ctx.save();
        ctx.shadowBlur = 12;
        if (o.type === 'drone') {
          ctx.shadowColor = '#f43f5e';
          ctx.fillStyle = '#e11d48';
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(o.x + o.w / 2, o.y + o.h / 2, 6, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.shadowColor = '#ec4899';
          ctx.fillStyle = '#db2777';
          ctx.beginPath();
          ctx.moveTo(o.x, o.y + o.h);
          ctx.lineTo(o.x + o.w / 2, o.y);
          ctx.lineTo(o.x + o.w, o.y + o.h);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      });

      // 6. Draw Gold Coins / Stars ⭐
      g.coins.forEach(c => {
        if (c.collected) return;
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.shadowBlur = 14;
        ctx.shadowColor = '#facc15';
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(0, 0, c.r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', 0, 1);
        ctx.restore();
      });

      // 7. Draw Hero (Stickman Cyber Runner)
      const hero = g.hero;
      if (!(hero.invulnerable > 0 && Math.floor(g.frame * 0.2) % 2 === 1)) {
        ctx.save();
        ctx.translate(hero.x, hero.y);

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.shadowBlur = 14;
        ctx.shadowColor = '#0284c7';

        if (hero.isDucking) {
          // Ducking Hero
          ctx.beginPath();
          ctx.arc(0, 42, 10, 0, Math.PI * 2); // Head
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(0, 52);
          ctx.lineTo(24, 60); // Torso sliding
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(24, 60);
          ctx.lineTo(38, 68); // Legs sliding
          ctx.stroke();
        } else {
          // Running / Jumping Hero
          const legPhase = Math.sin(g.frame * 0.35) * 16;

          // Head
          ctx.beginPath();
          ctx.arc(0, 12, 12, 0, Math.PI * 2);
          ctx.stroke();

          // Body Torso
          ctx.beginPath();
          ctx.moveTo(0, 24);
          ctx.lineTo(0, 48);
          ctx.stroke();

          // Legs
          if (hero.isGrounded) {
            ctx.beginPath();
            ctx.moveTo(0, 48);
            ctx.lineTo(-legPhase, 70);
            ctx.moveTo(0, 48);
            ctx.lineTo(legPhase, 70);
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.moveTo(0, 48);
            ctx.lineTo(-12, 64);
            ctx.moveTo(0, 48);
            ctx.lineTo(14, 62);
            ctx.stroke();
          }

          // Arms
          ctx.beginPath();
          ctx.moveTo(0, 32);
          ctx.lineTo(legPhase * 0.8, 44);
          ctx.moveTo(0, 32);
          ctx.lineTo(-legPhase * 0.8, 44);
          ctx.stroke();
        }

        ctx.restore();
      }

      // 8. Draw Boss Monster 👾
      if (g.boss) {
        ctx.save();
        ctx.translate(g.boss.x, g.boss.y);
        ctx.shadowBlur = 24;
        ctx.shadowColor = '#f59e0b';

        const bossPulse = Math.sin(g.boss.pulse) * 6;

        // Dark Cyber Shadow Robe
        ctx.fillStyle = '#1e1b4b';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 140);
        ctx.lineTo(25, 25);
        ctx.lineTo(60, 0 + bossPulse);
        ctx.lineTo(95, 25);
        ctx.lineTo(120, 140);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Glowing Monster Eyes
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.ellipse(44, 45, 8, 5, 0.2, 0, Math.PI * 2);
        ctx.ellipse(76, 45, 8, 5, -0.2, 0, Math.PI * 2);
        ctx.fill();

        // Horns / Spikes
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(25, 25);
        ctx.lineTo(10, -15);
        ctx.moveTo(95, 25);
        ctx.lineTo(110, -15);
        ctx.stroke();

        ctx.restore();
      }

      // 9. Draw Particles
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

      for (let p = 0; p < 40; p++) {
        g.particles.push({
          x: CW - 200 + (Math.random() - 0.5) * 80,
          y: GROUND_Y - 80 + (Math.random() - 0.5) * 80,
          vx: (Math.random() - 0.5) * 16,
          vy: (Math.random() - 0.5) * 16,
          r: 3 + Math.random() * 5,
          color: ['#8b5cf6', '#f59e0b', '#10b981', '#ffffff'][Math.floor(Math.random() * 4)],
          life: 30
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

  // 5. Finish Game & Award Verified Points
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
        console.error('[stickman finish error]', err);
        setGameState(isVictory ? 'victory' : 'gameOver');
      });
  };

  const handleToggleMute = () => {
    const isMuted = gameAudio.toggleMute();
    setMuted(isMuted);
  };

  const totalBosses = questions.length || 3;

  return (
    <div className="fixed inset-0 z-50 bg-[#06010f] w-screen h-screen flex flex-col justify-between select-none overflow-hidden touch-none" dir="rtl">
      {/* Game HUD Bar spanning full width */}
      <GameHUD
        title="سباق الستيكمان المطور"
        lives={lives}
        score={score}
        currentQuestion={Math.min(currentQIndex + 1, totalBosses)}
        totalQuestions={totalBosses}
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
        className="absolute inset-0 w-full h-full object-cover block bg-[#06010f]"
      />

      {/* ── ON-SCREEN MOBILE TOUCH CONTROLS (LARGE DUAL-THUMB CORNERS) ── */}
      <div className="absolute inset-x-0 bottom-4 sm:bottom-6 px-4 sm:px-8 flex items-center justify-between pointer-events-none z-20">
        {/* Left Thumb: Extra Large Duck Button */}
        <div className="pointer-events-auto">
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDuck(true);
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDuck(false);
            }}
            onPointerCancel={(e) => {
              e.stopPropagation();
              handleDuck(false);
            }}
            onPointerLeave={(e) => {
              e.stopPropagation();
              handleDuck(false);
            }}
            className="w-22 h-22 sm:w-26 sm:h-26 rounded-3xl bg-gradient-to-tr from-purple-700 via-pink-600 to-rose-500 border-3 border-pink-300 shadow-2xl shadow-pink-500/60 flex flex-col items-center justify-center text-white active:scale-90 transition-transform font-black select-none cursor-pointer"
          >
            <span className="text-3xl sm:text-4xl drop-shadow">⬇️</span>
            <span className="text-xs sm:text-sm font-black mt-0.5 drop-shadow">انحناء</span>
          </button>
        </div>

        {/* Keyboard helper for desktop */}
        <div className="hidden lg:flex items-center gap-2 bg-black/60 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/15 text-white/80 text-xs font-bold pointer-events-auto shadow-xl">
          <span>⌨️ الكيبورد:</span>
          <span className="bg-white/10 px-2 py-0.5 rounded text-purple-300 font-mono">W / Space</span> للقفز
          <span className="bg-white/10 px-2 py-0.5 rounded text-pink-300 font-mono">S / ↓</span> للانحناء
        </div>

        {/* Right Thumb: Extra Large Jump Button */}
        <div className="pointer-events-auto">
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleJump();
            }}
            className="w-22 h-22 sm:w-26 sm:h-26 rounded-3xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-purple-600 border-3 border-cyan-300 shadow-2xl shadow-cyan-500/60 flex flex-col items-center justify-center text-white active:scale-90 transition-transform font-black select-none cursor-pointer"
          >
            <span className="text-3xl sm:text-4xl drop-shadow">⬆️</span>
            <span className="text-xs sm:text-sm font-black mt-0.5 drop-shadow">قفز</span>
          </button>
        </div>
      </div>

      {gameState === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md gap-3 z-30">
          <div className="animate-spin w-14 h-14 border-4 border-purple-500 border-t-transparent rounded-full" />
          <p className="text-white font-bold text-base animate-pulse">جاري تحميل مضمار السباق والأسئلة...</p>
        </div>
      )}

      {/* Boss Question Overlay */}
      {gameState === 'question' && activeQuestion && (
        <QuestionOverlay
          question={activeQuestion}
          questionIndex={currentQIndex}
          totalQuestions={totalBosses}
          timeLimit={activeQuestion.timeLimit || 45}
          enemyLabel={activeQuestion.enemyLabel || `زعيم المعرفة ${currentQIndex + 1} 👾`}
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
          gameTitle="سباق الستيكمان المطور"
          onReplay={() => window.location.reload()}
          onExit={onClose}
        />
      )}
    </div>
  );
}
