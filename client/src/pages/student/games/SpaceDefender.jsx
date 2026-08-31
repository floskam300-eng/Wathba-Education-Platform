import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import gameAudio from '../../../lib/gameAudio';
import GameHUD from '../../../components/games/GameHUD';
import QuestionOverlay from '../../../components/games/QuestionOverlay';
import GameResultModal from '../../../components/games/GameResultModal';
import api from '../../../lib/api';
import toast from 'react-hot-toast';

const CW = 920;
const CH = 500;

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

  // Mutable Game Engine Ref
  const gameRef = useRef({
    frame: 0,
    score: 0,
    lives: 3,
    ship: { x: 120, y: CH / 2, vx: 0, vy: 0, speed: 6, inv: 0, w: 44, h: 32 },
    lasers: [],
    asteroids: [],
    enemies: [],
    particles: [],
    stars: [],
    boss: null,
    bossIndex: 0,
    nextBossScore: 1200,
    isPaused: false,
    keys: {}
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

          // Initialize space stars
          const stars = Array.from({ length: 60 }, () => ({
            x: Math.random() * CW,
            y: Math.random() * CH,
            r: 1 + Math.random() * 2,
            speed: 1 + Math.random() * 3,
            color: ['#fff', '#67e8f9', '#c084fc', '#fde047'][Math.floor(Math.random() * 4)]
          }));
          gameRef.current.stars = stars;
        } else {
          toast.error(res.data.error || 'تعذر بدء اللعبة');
          onClose();
        }
      })
      .catch(err => {
        if (!mounted) return;
        toast.error(err.response?.data?.error || 'حدث خطأ في تحميل لعبة الفضاء');
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
      if (e.code === 'Space' && gameState === 'playing' && !e.repeat) {
        e.preventDefault();
        fireLaser();
      }
    };
    const handleKeyUp = (e) => {
      gameRef.current.keys[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState]);

  const fireLaser = () => {
    const g = gameRef.current;
    if (g.isPaused) return;

    g.lasers.push({
      x: g.ship.x + 24,
      y: g.ship.y,
      vx: 12,
      w: 16,
      h: 4,
      color: '#00ffff'
    });
    gameAudio.playLaser();
  };

  // 3. Game Loop
  useEffect(() => {
    if (gameState !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const loop = () => {
      const g = gameRef.current;

      if (!g.isPaused) {
        g.frame++;

        // Ship Movement
        const k = g.keys;
        let dx = 0, dy = 0;
        if (k['ArrowUp'] || k['KeyW']) dy -= 1;
        if (k['ArrowDown'] || k['KeyS']) dy += 1;
        if (k['ArrowLeft'] || k['KeyA']) dx -= 1;
        if (k['ArrowRight'] || k['KeyD']) dx += 1;

        g.ship.x += dx * g.ship.speed;
        g.ship.y += dy * g.ship.speed;

        // Keep inside bounds
        g.ship.x = Math.max(30, Math.min(CW - 80, g.ship.x));
        g.ship.y = Math.max(30, Math.min(CH - 30, g.ship.y));

        if (g.ship.inv > 0) g.ship.inv--;

        // Auto laser fire every ~18 frames
        if (g.frame % 18 === 0) {
          fireLaser();
        }

        // Move stars
        g.stars.forEach(s => {
          s.x -= s.speed;
          if (s.x < 0) s.x = CW + 10;
        });

        // Move lasers
        g.lasers.forEach(l => { l.x += l.vx; });
        g.lasers = g.lasers.filter(l => l.x < CW + 30);

        // Spawn Asteroids & Drones when no boss
        if (!g.boss && g.frame % 45 === 0) {
          g.asteroids.push({
            x: CW + 40,
            y: 40 + Math.random() * (CH - 80),
            r: 16 + Math.random() * 14,
            speed: 3 + Math.random() * 2.5,
            hp: 2,
            rot: 0,
            rotSpeed: (Math.random() - 0.5) * 0.08
          });
        }

        // Update Asteroids
        g.asteroids.forEach(a => {
          a.x -= a.speed;
          a.rot += a.rotSpeed;
        });
        g.asteroids = g.asteroids.filter(a => a.x > -50);

        // Laser vs Asteroid Collisions
        for (let i = g.lasers.length - 1; i >= 0; i--) {
          const l = g.lasers[i];
          for (let j = g.asteroids.length - 1; j >= 0; j--) {
            const a = g.asteroids[j];
            const dist = Math.hypot(l.x - a.x, l.y - a.y);
            if (dist < a.r + 8) {
              a.hp--;
              g.lasers.splice(i, 1);
              if (a.hp <= 0) {
                g.asteroids.splice(j, 1);
                g.score += 100;
                setScore(g.score);
                gameAudio.playExplosion();
              }
              break;
            }
          }
        }

        // Ship vs Asteroid Collision
        if (g.ship.inv <= 0) {
          for (const a of g.asteroids) {
            const dist = Math.hypot(g.ship.x - a.x, g.ship.y - a.y);
            if (dist < a.r + 14) {
              g.lives--;
              setLives(g.lives);
              g.ship.inv = 70;
              gameAudio.playExplosion();

              if (g.lives <= 0) {
                handleGameOver(false);
                return;
              }
              break;
            }
          }
        }

        // Boss Encounter
        if (!g.boss && g.bossIndex < questions.length && g.score >= g.nextBossScore) {
          g.boss = {
            x: CW + 80,
            targetX: CW - 160,
            y: CH / 2,
            hp: 3,
            w: 120,
            h: 110,
            num: g.bossIndex + 1
          };
          gameAudio.playBossAlert();
        }

        if (g.boss) {
          if (g.boss.x > g.boss.targetX) {
            g.boss.x -= 4;
          } else {
            // Trigger Question
            g.isPaused = true;
            setActiveQuestion(questions[g.bossIndex]);
            setCurrentQIndex(g.bossIndex);
            setGameState('question');
            return;
          }
        }
      }

      // ── Render ──
      // Deep Space Canvas
      ctx.fillStyle = '#03020c';
      ctx.fillRect(0, 0, CW, CH);

      // Stars
      g.stars.forEach(s => {
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // Lasers
      g.lasers.forEach(l => {
        ctx.shadowBlur = 10;
        ctx.shadowColor = l.color;
        ctx.fillStyle = l.color;
        ctx.fillRect(l.x, l.y - 2, l.w, l.h);
        ctx.shadowBlur = 0;
      });

      // Asteroids
      g.asteroids.forEach(a => {
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.rot);
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#f97316';
        ctx.fillStyle = '#230e06';
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, a.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });

      // Space Boss
      if (g.boss) {
        ctx.save();
        ctx.translate(g.boss.x, g.boss.y + Math.sin(g.frame * 0.05) * 15);
        ctx.shadowBlur = 25;
        ctx.shadowColor = '#06b6d4';
        ctx.fillStyle = '#081c2e';
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 3;

        // Boss Hull
        ctx.beginPath();
        ctx.moveTo(40, 0);
        ctx.lineTo(-50, -50);
        ctx.lineTo(-20, 0);
        ctx.lineTo(-50, 50);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Energy Core
        ctx.fillStyle = '#22d3ee';
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Player Spaceship
      if (g.ship.inv <= 0 || Math.floor(g.frame * 0.15) % 2 === 0) {
        ctx.save();
        ctx.translate(g.ship.x, g.ship.y);
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#38bdf8';
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;

        // Sleek Arrow Ship
        ctx.beginPath();
        ctx.moveTo(22, 0);
        ctx.lineTo(-18, -14);
        ctx.lineTo(-8, 0);
        ctx.lineTo(-18, 14);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Cockpit
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(4, 0, 4, 0, Math.PI * 2);
        ctx.fill();

        // Thruster flame
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(-10, -4);
        ctx.lineTo(-10 - Math.random() * 12, 0);
        ctx.lineTo(-10, 4);
        ctx.fill();
        ctx.restore();
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [gameState, questions]);

  // 4. Handle Question Answer
  const handleAnswerSubmit = (result) => {
    const g = gameRef.current;
    const newAnswers = [...answersLog, result];
    setAnswersLog(newAnswers);

    const isCorrect = result.selectedIndex === 0 || result.selectedIndex === (questions[currentQIndex]?.correctIndex ?? 0);

    if (isCorrect) {
      gameAudio.playCorrect();
      g.score += 800;
    } else {
      gameAudio.playWrong();
      g.lives--;
      setLives(g.lives);
    }

    g.boss = null;
    g.bossIndex++;
    g.nextBossScore = g.score + 1400;
    g.isPaused = false;

    if (g.lives <= 0) {
      handleGameOver(false, newAnswers);
    } else if (g.bossIndex >= questions.length) {
      handleGameOver(true, newAnswers);
    } else {
      setGameState('playing');
    }
  };

  // 5. Game Over / Finish
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

  return (
    <div className="fixed inset-0 z-50 bg-[#020108] flex flex-col items-center justify-center select-none overflow-hidden" dir="rtl">
      <GameHUD
        title="صائد الفضاء"
        lives={lives}
        score={score}
        currentQuestion={Math.min(currentQIndex + 1, questions.length)}
        totalQuestions={questions.length || 3}
        muted={muted}
        onToggleMute={handleToggleMute}
        onExit={onClose}
        accentColor="#06b6d4"
      />

      <div
        className="relative w-full max-w-[920px] aspect-[920/500] max-h-[78vh] rounded-2xl sm:rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(6,182,212,0.35)] border border-cyan-500/20 touch-none select-none"
        onTouchMove={(e) => {
          if (gameState !== 'playing') return;
          const touch = e.touches[0];
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const scaleX = CW / rect.width;
          const scaleY = CH / rect.height;
          const targetX = (touch.clientX - rect.left) * scaleX;
          const targetY = (touch.clientY - rect.top) * scaleY;
          const g = gameRef.current;
          // Smooth follow finger
          g.ship.x += (targetX - g.ship.x) * 0.45;
          g.ship.y += (targetY - g.ship.y) * 0.45;
          g.ship.x = Math.max(30, Math.min(CW - 80, g.ship.x));
          g.ship.y = Math.max(30, Math.min(CH - 30, g.ship.y));
        }}
        onTouchStart={(e) => {
          if (gameState !== 'playing') return;
          const touch = e.touches[0];
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const scaleX = CW / rect.width;
          const scaleY = CH / rect.height;
          const targetX = (touch.clientX - rect.left) * scaleX;
          const targetY = (touch.clientY - rect.top) * scaleY;
          const g = gameRef.current;
          g.ship.x = Math.max(30, Math.min(CW - 80, targetX));
          g.ship.y = Math.max(30, Math.min(CH - 30, targetY));
          fireLaser();
        }}
      >
        <canvas
          ref={canvasRef}
          width={CW}
          height={CH}
          className="w-full h-full object-contain block bg-[#03020c]"
        />

        {/* Desktop Keyboard Helper Badge */}
        <div className="hidden sm:flex absolute bottom-3 left-4 items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-[11px] text-white/70 pointer-events-none">
          <span>⌨️ تحكم الكيبورد:</span>
          <span className="bg-white/10 px-1.5 py-0.5 rounded text-cyan-300 font-mono font-bold">WASD / الأسهم</span> تحريك السفينة
          <span className="bg-white/10 px-1.5 py-0.5 rounded text-amber-300 font-mono font-bold">Space</span> إطلاق ليزر
        </div>

        {gameState === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm gap-3">
            <div className="animate-spin w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full" />
            <p className="text-white font-bold text-sm animate-pulse">جاري فحص محركات السفينة الفضائية...</p>
          </div>
        )}
      </div>

      {/* Mobile Touch Fire Button & Drag Guide */}
      <div className="sm:hidden flex items-center justify-between w-full max-w-md px-4 mt-2.5 gap-3">
        <div className="flex-1 text-[11px] text-cyan-300/80 bg-cyan-950/40 border border-cyan-500/30 px-3 py-2.5 rounded-xl text-center font-bold">
          👆 اسحب إصبعك على الشاشة لتحريك السفينة
        </div>

        <button
          type="button"
          onTouchStart={(e) => {
            e.preventDefault();
            fireLaser();
          }}
          className="py-3 px-6 bg-gradient-to-r from-cyan-500 to-blue-600 active:from-cyan-400 active:to-blue-500 border border-cyan-300/50 rounded-2xl text-white font-black text-sm text-center shadow-lg shadow-cyan-900/50 active:scale-95 transition-transform flex items-center gap-1.5"
        >
          ⚡ إطلاق ليزر
        </button>
      </div>

      {gameState === 'question' && activeQuestion && (
        <QuestionOverlay
          question={activeQuestion}
          questionIndex={currentQIndex}
          totalQuestions={questions.length}
          timeLimit={activeQuestion.timeLimit || 45}
          enemyLabel={activeQuestion.enemyLabel || `الزعيم الفضائي ${currentQIndex + 1}`}
          onAnswer={handleAnswerSubmit}
        />
      )}

      {(gameState === 'victory' || gameState === 'gameOver') && (
        <GameResultModal
          isVictory={gameState === 'victory'}
          score={score}
          pointsEarned={pointsEarned}
          correctCount={answersLog.filter(a => a.selectedIndex === 0 || a.selectedIndex === (questions[a.questionIndex]?.correctIndex ?? 0)).length}
          totalQuestions={questions.length}
          gameTitle="صائد الفضاء"
          onReplay={() => window.location.reload()}
          onExit={onClose}
        />
      )}
    </div>
  );
}
