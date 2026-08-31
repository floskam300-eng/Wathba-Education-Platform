import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import gameAudio from '../../../lib/gameAudio';
import GameHUD from '../../../components/games/GameHUD';
import QuestionOverlay from '../../../components/games/QuestionOverlay';
import GameResultModal from '../../../components/games/GameResultModal';
import api from '../../../lib/api';
import toast from 'react-hot-toast';

// ── Game Constants ────────────────────────────────────────────────────────────
const CW = 920;
const CH = 500;
const GROUND = CH - 75;
const PLAYER_X = 130;
const GRAVITY = 0.68;
const JUMP_V = -15.5;
const DUCK_H = 26;
const STAND_H = 54;
const BASE_SPD = 3.5;
const MAX_SPD = 8.5;

// Boss Timings (in frames at ~60fps)
const BOSS1_FRAME = 16 * 60; // Boss 1 at ~16s
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
  // Deep space neon gradient
  const grad = ctx.createLinearGradient(0, 0, 0, CH);
  grad.addColorStop(0, '#060312');
  grad.addColorStop(0.5, '#12082b');
  grad.addColorStop(1, '#1a0d3d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CW, CH);

  // Twinkling stars
  stars.forEach(s => {
    ctx.globalAlpha = 0.3 + 0.6 * Math.abs(Math.sin(frame * 0.02 * s.speed + s.phase));
    ctx.fillStyle = s.color || '#fff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // Futuristic city / grid skyline in distance
  ctx.fillStyle = 'rgba(76, 29, 149, 0.25)';
  for (let i = 0; i < 15; i++) {
    const bx = ((i * 80 - offset * 0.2) % (CW + 160) + CW + 160) % (CW + 160) - 80;
    const bh = 100 + ((i * 37) % 120);
    const bw = 60;
    ctx.fillRect(bx, GROUND - bh, bw, bh);
  }
}

function drawGround(ctx, offset) {
  // Ground body
  ctx.fillStyle = '#0a0518';
  ctx.fillRect(0, GROUND, CW, CH - GROUND);

  // Glowing neon line on top of ground
  ctx.shadowBlur = 14;
  ctx.shadowColor = '#8b5cf6';
  ctx.strokeStyle = '#8b5cf6';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  ctx.lineTo(CW, GROUND);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Perspective ground grid
  ctx.strokeStyle = 'rgba(139, 92, 246, 0.18)';
  ctx.lineWidth = 1;
  const sp = 50;
  const sx = -(offset % sp);
  for (let x = sx; x < CW; x += sp) {
    ctx.beginPath();
    ctx.moveTo(x, GROUND);
    ctx.lineTo(x - 30, CH);
    ctx.stroke();
  }
}

function drawStickmanHero(ctx, px, py, frame, ducking, invincible, isDoubleJump) {
  if (invincible && Math.floor(frame * 0.15) % 2 === 1) return;

  const heroColor = isDoubleJump ? '#f59e0b' : '#00ffcc';
  ctx.strokeStyle = heroColor;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.shadowBlur = 12;
  ctx.shadowColor = heroColor;

  if (ducking) {
    // Sliding duck pose with energy sparks
    const hy = py - 24;
    ctx.beginPath();
    ctx.arc(px + 4, hy, 7, 0, Math.PI * 2);
    ctx.stroke();
    // Torso
    ctx.beginPath();
    ctx.moveTo(px + 4, hy + 7);
    ctx.lineTo(px - 14, hy + 20);
    ctx.stroke();
    // Arms forward
    ctx.beginPath();
    ctx.moveTo(px, hy + 12);
    ctx.lineTo(px + 18, hy + 10);
    ctx.stroke();
    // Legs back sliding
    ctx.beginPath();
    ctx.moveTo(px - 14, hy + 20);
    ctx.lineTo(px - 26, hy + 24);
    ctx.lineTo(px - 10, hy + 24);
    ctx.stroke();
  } else {
    const headY = py - 50;
    const shouldY = headY + 16;
    const hipY = headY + 34;

    // Glowing head
    ctx.beginPath();
    ctx.arc(px, headY, 7.5, 0, Math.PI * 2);
    ctx.stroke();

    // Spine
    ctx.beginPath();
    ctx.moveTo(px, headY + 7.5);
    ctx.lineTo(px, hipY);
    ctx.stroke();

    const inAir = py < GROUND - 4;
    if (inAir) {
      // Dynamic Jump Pose
      ctx.beginPath();
      ctx.moveTo(px, shouldY);
      ctx.lineTo(px - 18, shouldY - 12);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px, shouldY);
      ctx.lineTo(px + 18, shouldY - 12);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(px, hipY);
      ctx.lineTo(px - 12, hipY + 14);
      ctx.lineTo(px - 16, hipY + 28);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px, hipY);
      ctx.lineTo(px + 10, hipY + 12);
      ctx.lineTo(px + 14, hipY + 26);
      ctx.stroke();
    } else {
      // Running Animation
      const t = frame * 0.22;
      const sw = Math.sin(t);
      const cw = Math.cos(t);

      // Arms
      ctx.beginPath();
      ctx.moveTo(px, shouldY);
      ctx.lineTo(px - sw * 14, shouldY + 14);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px, shouldY);
      ctx.lineTo(px + sw * 14, shouldY + 14);
      ctx.stroke();

      // Legs
      const lThighX = sw * 10;
      const lFootX = sw * 20;
      ctx.beginPath();
      ctx.moveTo(px, hipY);
      ctx.lineTo(px + lThighX, hipY + 16 - Math.abs(cw) * 4);
      ctx.lineTo(px + lFootX, hipY + 30);
      ctx.stroke();

      const rThighX = -sw * 10;
      const rFootX = -sw * 20;
      ctx.beginPath();
      ctx.moveTo(px, hipY);
      ctx.lineTo(px + rThighX, hipY + 16 - Math.abs(cw) * 4);
      ctx.lineTo(px + rFootX, hipY + 30);
      ctx.stroke();
    }
  }
  ctx.shadowBlur = 0;
}

function drawObstacle(ctx, ob) {
  if (ob.type === 'jump') {
    // Cyber Laser Spike / Crystal Barrier
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#f97316';
    ctx.fillStyle = '#2b0c03';
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.moveTo(ob.x, GROUND - ob.h);
    ctx.lineTo(ob.x + 18, GROUND);
    ctx.lineTo(ob.x - 18, GROUND);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner glow core
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(ob.x, GROUND - ob.h / 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  } else {
    // Flying Drone Barrier (duck under)
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#06b6d4';
    ctx.fillStyle = '#031b26';
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2.5;

    roundRect(ctx, ob.x - ob.w / 2, ob.y - 14, ob.w, 28, 8, true, true);

    // Glowing laser beam underneath
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.arc(ob.x, ob.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// ── Boss Monsters (Generic Sci-Fi / Cyber Overlords) ─────────────────────────
function drawBossVillain(ctx, x, y, bossNum, frame) {
  ctx.save();
  const floatY = y + Math.sin(frame * 0.08) * 8;

  if (bossNum === 1) {
    // Boss 1: Flame Demon Guardian
    ctx.shadowBlur = 25;
    ctx.shadowColor = '#ef4444';
    ctx.fillStyle = '#2a0808';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    roundRect(ctx, x - 45, floatY - 85, 90, 85, 14, true, true);

    // Eyes & Horns
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(x - 18, floatY - 55, 6, 0, Math.PI * 2);
    ctx.arc(x + 18, floatY - 55, 6, 0, Math.PI * 2);
    ctx.fill();

    // Horns
    ctx.strokeStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(x - 30, floatY - 85);
    ctx.lineTo(x - 45, floatY - 115);
    ctx.moveTo(x + 30, floatY - 85);
    ctx.lineTo(x + 45, floatY - 115);
    ctx.stroke();
  } else if (bossNum === 2) {
    // Boss 2: Cyber Mecha Dragon
    ctx.shadowBlur = 25;
    ctx.shadowColor = '#a855f7';
    ctx.fillStyle = '#160829';
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 3;
    roundRect(ctx, x - 50, floatY - 90, 100, 90, 16, true, true);

    // Visor beam
    ctx.fillStyle = '#ec4899';
    roundRect(ctx, x - 35, floatY - 60, 70, 12, 6, true, false);

    // Wings
    ctx.strokeStyle = '#c084fc';
    ctx.beginPath();
    ctx.moveTo(x - 50, floatY - 60);
    ctx.lineTo(x - 85, floatY - 95);
    ctx.lineTo(x - 50, floatY - 30);
    ctx.moveTo(x + 50, floatY - 60);
    ctx.lineTo(x + 85, floatY - 95);
    ctx.lineTo(x + 50, floatY - 30);
    ctx.stroke();
  } else {
    // Boss 3: Shadow Overlord Supreme
    ctx.shadowBlur = 30;
    ctx.shadowColor = '#3b82f6';
    ctx.fillStyle = '#061329';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3.5;
    roundRect(ctx, x - 55, floatY - 100, 110, 100, 18, true, true);

    // Crown / Spikes
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(x - 45, floatY - 100);
    ctx.lineTo(x - 30, floatY - 130);
    ctx.lineTo(x - 15, floatY - 100);
    ctx.lineTo(x, floatY - 135);
    ctx.lineTo(x + 15, floatY - 100);
    ctx.lineTo(x + 30, floatY - 130);
    ctx.lineTo(x + 45, floatY - 100);
    ctx.fill();

    // Dark energy core
    ctx.fillStyle = '#60a5fa';
    ctx.beginPath();
    ctx.arc(x, floatY - 45, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export default function StickmanRun({ onClose }) {
  const { user } = useAuth();
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

  // Mutable Game Loop State Ref
  const gameRef = useRef({
    frame: 0,
    offset: 0,
    speed: BASE_SPD,
    score: 0,
    lives: 3,
    player: { y: GROUND, vy: 0, jumping: false, ducking: false, invincible: 0, isDoubleJump: false },
    obstacles: [],
    particles: [],
    stars: [],
    boss: null,
    bossIndex: 0,
    nextBossFrame: BOSS1_FRAME,
    isPaused: false
  });

  // 1. Initialize Game Session from Backend
  useEffect(() => {
    let mounted = true;
    api.post('/events/stickman_run/start')
      .then(res => {
        if (!mounted) return;
        if (res.data.success) {
          setSessionToken(res.data.sessionToken);
          setQuestions(res.data.questions || []);
          setGameState('playing');

          // Initialize background stars
          const stars = Array.from({ length: 45 }, () => ({
            x: Math.random() * CW,
            y: Math.random() * (GROUND - 40),
            r: 1 + Math.random() * 2,
            speed: 0.5 + Math.random() * 1.5,
            phase: Math.random() * Math.PI * 2,
            color: ['#fff', '#c4b5fd', '#67e8f9', '#fde047'][Math.floor(Math.random() * 4)]
          }));
          gameRef.current.stars = stars;
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

  // 2. Keyboard Controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (gameState !== 'playing') return;
      const g = gameRef.current;

      if ((e.code === 'Space' || e.code === 'ArrowUp' || e.key === 'w' || e.key === 'W') && !e.repeat) {
        e.preventDefault();
        if (!g.player.jumping && g.player.y >= GROUND - 4) {
          g.player.vy = JUMP_V;
          g.player.jumping = true;
          g.player.isDoubleJump = false;
          gameAudio.playJump();
        } else if (g.player.jumping && !g.player.isDoubleJump) {
          // Double Jump!
          g.player.vy = JUMP_V * 0.85;
          g.player.isDoubleJump = true;
          gameAudio.playJump();
        }
      }

      if ((e.code === 'ArrowDown' || e.key === 's' || e.key === 'S') && !e.repeat) {
        e.preventDefault();
        g.player.ducking = true;
        gameAudio.playDuck();
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'ArrowDown' || e.key === 's' || e.key === 'S') {
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
        g.score += Math.round(g.speed * 0.5);
        setScore(g.score);

        // Speed ramp
        if (g.speed < MAX_SPD) g.speed += 0.0008;

        // Player physics
        g.player.vy += GRAVITY;
        g.player.y += g.player.vy;

        if (g.player.y >= GROUND) {
          g.player.y = GROUND;
          g.player.vy = 0;
          g.player.jumping = false;
          g.player.isDoubleJump = false;
        }

        if (g.player.invincible > 0) g.player.invincible--;

        // Spawn obstacles when no boss is active
        if (!g.boss && g.frame % Math.max(70, Math.floor(140 - g.speed * 8)) === 0) {
          const type = Math.random() > 0.45 ? 'jump' : 'duck';
          g.obstacles.push({
            x: CW + 40,
            type,
            h: 36 + Math.random() * 14,
            w: 38 + Math.random() * 16,
            y: GROUND - (type === 'duck' ? 44 : 0)
          });
        }

        // Move obstacles
        g.obstacles.forEach(ob => { ob.x -= g.speed; });
        g.obstacles = g.obstacles.filter(ob => ob.x > -60);

        // Obstacle Collision Check
        if (g.player.invincible <= 0) {
          for (const ob of g.obstacles) {
            let hit = false;
            if (ob.type === 'jump' && !g.player.ducking) {
              if (PLAYER_X + 15 > ob.x - 14 && PLAYER_X - 15 < ob.x + 14 && g.player.y > GROUND - ob.h + 8) {
                hit = true;
              }
            } else if (ob.type === 'duck') {
              if (PLAYER_X + 15 > ob.x - ob.w / 2 && PLAYER_X - 15 < ob.x + ob.w / 2 && !g.player.ducking) {
                hit = true;
              }
            }

            if (hit) {
              g.lives--;
              setLives(g.lives);
              g.player.invincible = 75; // ~1.25s
              gameAudio.playExplosion();

              if (g.lives <= 0) {
                handleGameOver(false);
                return;
              }
              break;
            }
          }
        }

        // Boss Encounter Logic
        if (!g.boss && g.bossIndex < questions.length && g.frame >= g.nextBossFrame) {
          g.boss = {
            num: g.bossIndex + 1,
            x: CW + 80,
            targetX: CW - 130,
            hp: 1
          };
          gameAudio.playBossAlert();
        }

        if (g.boss) {
          if (g.boss.x > g.boss.targetX) {
            g.boss.x -= 4.5;
          } else {
            // Trigger Question Overlay!
            g.isPaused = true;
            setActiveQuestion(questions[g.bossIndex]);
            setCurrentQIndex(g.bossIndex);
            setGameState('question');
            return;
          }
        }
      }

      // Render Everything
      drawBackground(ctx, g.offset, g.stars, g.frame);
      drawGround(ctx, g.offset);

      g.obstacles.forEach(ob => drawObstacle(ctx, ob));

      if (g.boss) {
        drawBossVillain(ctx, g.boss.x, GROUND - 10, g.boss.num, g.frame);
      }

      drawStickmanHero(ctx, PLAYER_X, g.player.y, g.frame, g.player.ducking, g.player.invincible > 0, g.player.isDoubleJump);

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
      g.score += 500;
    } else {
      gameAudio.playWrong();
      g.lives--;
      setLives(g.lives);
    }

    // Dismiss boss and resume
    g.boss = null;
    g.bossIndex++;
    g.nextBossFrame = g.frame + BOSS_GAP_FRAMES;
    g.isPaused = false;

    if (g.lives <= 0) {
      handleGameOver(false, newAnswers);
    } else if (g.bossIndex >= questions.length) {
      // Victory! All bosses cleared
      handleGameOver(true, newAnswers);
    } else {
      setGameState('playing');
    }
  };

  // 5. Finish Game & Submit to Server
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
    <div className="fixed inset-0 z-50 bg-[#080414] flex flex-col items-center justify-center select-none overflow-hidden" dir="rtl">
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

      {/* Main Canvas Container with Gestures */}
      <div
        className="relative w-full max-w-[920px] aspect-[920/500] max-h-[78vh] rounded-2xl sm:rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(139,92,246,0.35)] border border-purple-500/20 touch-none select-none"
        onTouchStart={(e) => {
          if (gameState !== 'playing') return;
          const touch = e.touches[0];
          const rect = e.currentTarget.getBoundingClientRect();
          const touchY = touch.clientY - rect.top;
          const isTopHalf = touchY < rect.height * 0.55;
          const g = gameRef.current;

          if (isTopHalf) {
            if (!g.player.jumping && g.player.y >= GROUND - 4) {
              g.player.vy = JUMP_V;
              g.player.jumping = true;
              g.player.isDoubleJump = false;
              gameAudio.playJump();
            } else if (g.player.jumping && !g.player.isDoubleJump) {
              g.player.vy = JUMP_V * 0.85;
              g.player.isDoubleJump = true;
              gameAudio.playJump();
            }
          } else {
            g.player.ducking = true;
            gameAudio.playDuck();
          }
        }}
        onTouchEnd={() => {
          gameRef.current.player.ducking = false;
        }}
      >
        <canvas
          ref={canvasRef}
          width={CW}
          height={CH}
          className="w-full h-full object-contain block bg-[#060312]"
        />

        {/* Desktop Keyboard Helper Badge */}
        <div className="hidden sm:flex absolute bottom-3 left-4 items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-[11px] text-white/70 pointer-events-none">
          <span>⌨️ تحكم الكيبورد:</span>
          <span className="bg-white/10 px-1.5 py-0.5 rounded text-purple-300 font-mono font-bold">Space / ↑</span> قفز
          <span className="bg-white/10 px-1.5 py-0.5 rounded text-indigo-300 font-mono font-bold">↓ / S</span> انحناء
        </div>

        {/* Loading Spinner */}
        {gameState === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm gap-3">
            <div className="animate-spin w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full" />
            <p className="text-white font-bold text-sm animate-pulse">جاري تجهيز مضمار السباق والتحديات...</p>
          </div>
        )}
      </div>

      {/* Mobile Touch Action Buttons */}
      <div className="sm:hidden flex items-center justify-between w-full max-w-md px-4 mt-2.5 gap-3">
        <button
          type="button"
          onTouchStart={(e) => {
            e.preventDefault();
            const g = gameRef.current;
            if (!g.player.jumping && g.player.y >= GROUND - 4) {
              g.player.vy = JUMP_V;
              g.player.jumping = true;
              gameAudio.playJump();
            } else if (g.player.jumping && !g.player.isDoubleJump) {
              g.player.vy = JUMP_V * 0.85;
              g.player.isDoubleJump = true;
              gameAudio.playJump();
            }
          }}
          className="flex-1 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 active:from-purple-500 active:to-indigo-500 border border-purple-400/50 rounded-2xl text-white font-black text-base text-center shadow-lg shadow-purple-900/40 active:scale-95 transition-transform"
        >
          ⬆️ قـفـز (Jump)
        </button>

        <button
          type="button"
          onTouchStart={(e) => {
            e.preventDefault();
            gameRef.current.player.ducking = true;
            gameAudio.playDuck();
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            gameRef.current.player.ducking = false;
          }}
          className="flex-1 py-3.5 bg-gradient-to-r from-pink-600 to-purple-700 active:from-pink-500 active:to-purple-600 border border-pink-400/50 rounded-2xl text-white font-black text-base text-center shadow-lg shadow-pink-900/40 active:scale-95 transition-transform"
        >
          ⬇️ انـحـنـاء (Duck)
        </button>
      </div>

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
