import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import gameAudio from '../../../lib/gameAudio';
import GameHUD from '../../../components/games/GameHUD';
import GameResultModal from '../../../components/games/GameResultModal';
import { Sparkles, Zap, Timer, Star, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../../../lib/api';
import toast from 'react-hot-toast';

const CW = 960;
const CH = 540;

const BUBBLE_COLORS = [
  { bg: 'rgba(59, 130, 246, 0.45)', stroke: '#38bdf8', glow: '#0ea5e9', textBg: '#0284c7' },
  { bg: 'rgba(236, 72, 153, 0.45)', stroke: '#f472b6', glow: '#ec4899', textBg: '#db2777' },
  { bg: 'rgba(245, 158, 11, 0.45)', stroke: '#fbbf24', glow: '#f59e0b', textBg: '#d97706' },
  { bg: 'rgba(16, 185, 129, 0.45)', stroke: '#34d399', glow: '#10b981', textBg: '#059669' }
];

export default function BubblePopBlitz({ onClose }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  const [gameState, setGameState] = useState('loading'); // loading, playing, gameOver, victory
  const [sessionToken, setSessionToken] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [combo, setCombo] = useState(0);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [answersLog, setAnswersLog] = useState([]);
  const [muted, setMuted] = useState(() => gameAudio.isMuted());
  const [feedback, setFeedback] = useState(null); // { type: 'correct'|'wrong', text: string }

  // Mutable Engine Ref
  const gameRef = useRef({
    frame: 0,
    score: 0,
    lives: 3,
    combo: 0,
    bubbles: [],
    particles: [],
    floatTexts: [],
    isPaused: false
  });

  // 1. Initialize API Session
  useEffect(() => {
    let mounted = true;
    api.post('/events/bubble_blitz/start')
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
        toast.error(err.response?.data?.error || 'حدث خطأ في تحميل لعبة الفقاعات');
        onClose();
      });

    return () => {
      mounted = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const currentQ = questions[currentQIndex];

  // 2. Spawn Bubbles when question changes
  useEffect(() => {
    if (gameState !== 'playing' || !currentQ) return;

    const choices = Array.isArray(currentQ.choices) ? currentQ.choices : [];
    const count = choices.length;
    const spacing = CW / (count + 1);

    const newBubbles = choices.map((choice, idx) => {
      const col = BUBBLE_COLORS[idx % BUBBLE_COLORS.length];
      const radius = 54 + Math.min(22, choice.length * 1.5);
      return {
        id: idx,
        text: choice,
        choiceIndex: idx,
        isCorrect: idx === 0 || idx === (currentQ.correctIndex ?? 0),
        x: spacing * (idx + 1) + (Math.random() * 30 - 15),
        y: CH + 70 + Math.random() * 100,
        vx: (Math.random() - 0.5) * 1.0,
        vy: -1.7 - Math.random() * 0.6,
        r: radius,
        col,
        wobble: Math.random() * Math.PI * 2
      };
    });

    gameRef.current.bubbles = newBubbles;
  }, [gameState, currentQIndex, currentQ]);

  // 3. Keyboard Handlers (1, 2, 3, 4 to pop bubbles directly)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (gameState !== 'playing') return;
      const key = e.key;
      if (['1', '2', '3', '4'].includes(key)) {
        const choiceIdx = parseInt(key, 10) - 1;
        const g = gameRef.current;
        const foundIdx = g.bubbles.findIndex(b => b.choiceIndex === choiceIdx);
        if (foundIdx !== -1) {
          popBubble(g.bubbles[foundIdx], foundIdx);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, currentQIndex]);

  // 4. Canvas Click / Multi-Touch Handler for Bubble Popping
  const handleTouchOrClick = (clientX, clientY) => {
    if (gameState !== 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = CW / rect.width;
    const scaleY = CH / rect.height;
    const clickX = (clientX - rect.left) * scaleX;
    const clickY = (clientY - rect.top) * scaleY;

    const g = gameRef.current;
    for (let i = g.bubbles.length - 1; i >= 0; i--) {
      const b = g.bubbles[i];
      const dist = Math.hypot(clickX - b.x, clickY - b.y);

      if (dist < b.r + 8) {
        popBubble(b, i);
        break;
      }
    }
  };

  const popBubble = (bubble, index) => {
    const g = gameRef.current;
    g.bubbles.splice(index, 1);

    // Spawn Burst Particles
    for (let p = 0; p < 22; p++) {
      g.particles.push({
        x: bubble.x,
        y: bubble.y,
        vx: (Math.random() - 0.5) * 9,
        vy: (Math.random() - 0.5) * 9,
        r: 3 + Math.random() * 5,
        color: bubble.col.stroke,
        life: 25
      });
    }

    if (bubble.isCorrect) {
      gameAudio.playCorrect();
      g.combo++;
      const bonus = g.combo * 150;
      g.score += 500 + bonus;
      setScore(g.score);
      setCombo(g.combo);

      // Floating Score text
      g.floatTexts.push({
        x: bubble.x,
        y: bubble.y,
        text: `+${500 + bonus} 🎉`,
        color: '#34d399',
        life: 40
      });

      setFeedback({ type: 'correct', text: 'إجابة صحيحة وفرقعة عبقرية! 🎯' });
      setTimeout(() => setFeedback(null), 1200);

      const nextQ = currentQIndex + 1;
      const newAnswers = [...answersLog, { questionIndex: currentQIndex, selectedIndex: bubble.choiceIndex }];
      setAnswersLog(newAnswers);

      if (nextQ >= questions.length) {
        // Complete the quiz!
        handleFinishGame(true, newAnswers);
      } else {
        setTimeout(() => {
          setCurrentQIndex(nextQ);
        }, 500);
      }
    } else {
      gameAudio.playWrong();
      g.combo = 0;
      g.lives--;
      setCombo(0);
      setLives(g.lives);

      g.floatTexts.push({
        x: bubble.x,
        y: bubble.y,
        text: 'خطأ ❌',
        color: '#ef4444',
        life: 40
      });

      setFeedback({ type: 'wrong', text: 'فقاعة خاطئة! انتبه ⚠️' });
      setTimeout(() => setFeedback(null), 1200);

      if (g.lives <= 0) {
        const newAnswers = [...answersLog, { questionIndex: currentQIndex, selectedIndex: bubble.choiceIndex }];
        setAnswersLog(newAnswers);
        handleFinishGame(false, newAnswers);
      }
    }
  };

  // 5. Game Animation Loop
  useEffect(() => {
    if (gameState !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const loop = () => {
      const g = gameRef.current;

      if (!g.isPaused) {
        g.frame++;

        // Update Bubbles Motion
        g.bubbles.forEach(b => {
          b.wobble += 0.04;
          b.x += b.vx + Math.sin(b.wobble) * 0.8;
          b.y += b.vy;

          // Wrap horizontally inside bounds
          if (b.x < b.r + 20) b.vx = Math.abs(b.vx);
          if (b.x > CW - b.r - 20) b.vx = -Math.abs(b.vx);

          // If bubble floats off top, wrap to bottom so student never loses it
          if (b.y < -b.r - 20) {
            b.y = CH + b.r + Math.random() * 60;
          }
        });

        // Update Particles
        g.particles.forEach(p => {
          p.x += p.vx;
          p.y += p.vy;
          p.life--;
        });
        g.particles = g.particles.filter(p => p.life > 0);

        // Update Floating Text
        g.floatTexts.forEach(f => {
          f.y -= 1.5;
          f.life--;
        });
        g.floatTexts = g.floatTexts.filter(f => f.life > 0);
      }

      // Render Canvas
      ctx.clearRect(0, 0, CW, CH);

      // 1. Ambient Background Underwater / Nebula Glow
      const bgGrad = ctx.createLinearGradient(0, 0, 0, CH);
      bgGrad.addColorStop(0, '#021815');
      bgGrad.addColorStop(0.5, '#042721');
      bgGrad.addColorStop(1, '#01120e');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, CW, CH);

      // Ambient bubbles in background
      ctx.fillStyle = 'rgba(52, 211, 153, 0.08)';
      for (let i = 0; i < 12; i++) {
        const ax = ((i * 80 + g.frame * 0.4) % CW);
        const ay = ((i * 120 - g.frame * 0.8) % CH + CH) % CH;
        ctx.beginPath();
        ctx.arc(ax, ay, 8 + (i % 5) * 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. Render Burst Particles
      g.particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // 3. Render Interactive Floating Bubbles
      g.bubbles.forEach(b => {
        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = b.col.glow;
        ctx.fillStyle = b.col.bg;
        ctx.strokeStyle = b.col.stroke;
        ctx.lineWidth = 3.5;

        // Main Bubble Sphere
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Shiny Glass Reflection
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.22, 0, Math.PI * 2);
        ctx.fill();

        // Choice Number Badge (1, 2, 3, 4)
        ctx.fillStyle = b.col.textBg;
        ctx.beginPath();
        ctx.arc(b.x, b.y - b.r * 0.45, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'black 12px Tajawal, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${b.choiceIndex + 1}`, b.x, b.y - b.r * 0.45);

        // Choice Text inside bubble
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 17px Tajawal, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.text, b.x, b.y + 8);

        ctx.restore();
      });

      // 4. Render Floating Feedback Texts (+500, etc.)
      g.floatTexts.forEach(f => {
        ctx.save();
        ctx.fillStyle = f.color;
        ctx.font = 'black 22px Tajawal, sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 10;
        ctx.shadowColor = f.color;
        ctx.fillText(f.text, f.x, f.y);
        ctx.restore();
      });

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [gameState]);

  // 6. Finish Game
  const handleFinishGame = (isVictory, finalAnswers = answersLog) => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const g = gameRef.current;
    g.isPaused = true;

    api.post('/events/bubble_blitz/finish', {
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
        console.error('[bubble finish error]', err);
        setGameState(isVictory ? 'victory' : 'gameOver');
      });
  };

  const handleToggleMute = () => {
    const isMuted = gameAudio.toggleMute();
    setMuted(isMuted);
  };

  const totalQ = questions.length || 5;

  return (
    <div className="fixed inset-0 z-50 bg-[#01110e] flex flex-col items-center justify-between select-none overflow-hidden touch-none" dir="rtl">
      {/* Game HUD Bar */}
      <GameHUD
        title="فرقعة الفقاعات العبقرية"
        lives={lives}
        score={score}
        combo={combo}
        currentQuestion={Math.min(currentQIndex + 1, totalQ)}
        totalQuestions={totalQ}
        muted={muted}
        onToggleMute={handleToggleMute}
        onExit={onClose}
        accentColor="#10b981"
      />

      {/* Main Game Container */}
      <div className="relative w-full h-full max-w-[960px] max-h-[540px] my-auto aspect-[16/9] rounded-2xl sm:rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(16,185,129,0.3)] border border-emerald-500/30 flex flex-col touch-none select-none bg-[#021815]">
        
        {/* ── SLIM QUESTION HEADER (NO BLOCKING TOAST) ── */}
        <div className="absolute top-0 inset-x-0 z-20 bg-black/60 backdrop-blur-md border-b border-emerald-500/30 px-4 py-2 sm:py-2.5 flex items-center justify-between gap-3 pointer-events-none shadow-md">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/25 border border-emerald-400/40 text-emerald-300 font-black text-xs">
              سؤال {currentQIndex + 1}/{totalQ}
            </span>
            <h3 className="text-xs sm:text-base font-black text-white truncate max-w-[65vw]">
              {currentQ?.questionText || currentQ?.question_text}
            </h3>
          </div>

          {/* Feedback badge */}
          {feedback && (
            <div className={`px-3 py-1 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-lg animate-bounce ${
              feedback.type === 'correct'
                ? 'bg-emerald-500 text-white shadow-emerald-500/50'
                : 'bg-red-500 text-white shadow-red-500/50'
            }`}>
              {feedback.type === 'correct' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              <span>{feedback.text}</span>
            </div>
          )}
        </div>

        {/* Canvas for Floating Bubbles (Full viewport visible!) */}
        <canvas
          ref={canvasRef}
          width={CW}
          height={CH}
          onClick={(e) => handleTouchOrClick(e.clientX, e.clientY)}
          onTouchStart={(e) => {
            if (e.touches[0]) {
              handleTouchOrClick(e.touches[0].clientX, e.touches[0].clientY);
            }
          }}
          className="w-full h-full object-contain block bg-[#021815] cursor-pointer"
        />

        {/* Bottom Helper Bar */}
        <div className="absolute bottom-2 inset-x-4 flex items-center justify-between pointer-events-none z-20">
          <div className="text-[11px] text-emerald-200/80 font-bold bg-black/40 px-3 py-1 rounded-xl border border-white/10 backdrop-blur-sm">
            ✨ المس أو اضغط على الفقاعة التي تحمل الإجابة الصحيحة!
          </div>

          <div className="hidden sm:flex items-center gap-1.5 bg-black/40 px-3 py-1 rounded-xl border border-white/10 text-[11px] text-white/70">
            <span>⌨️ كيبورد:</span>
            <span className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-300 font-mono font-bold">1 - 4</span>
          </div>
        </div>

        {gameState === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm gap-3 z-30">
            <div className="animate-spin w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full" />
            <p className="text-white font-bold text-sm animate-pulse">جاري تحضير الفقاعات السحرية...</p>
          </div>
        )}
      </div>

      {/* Result Modal */}
      {(gameState === 'victory' || gameState === 'gameOver') && (
        <GameResultModal
          isVictory={gameState === 'victory'}
          score={score}
          pointsEarned={pointsEarned}
          correctCount={answersLog.filter(a => a.selectedIndex === 0 || a.selectedIndex === (questions[a.questionIndex]?.correctIndex ?? 0)).length}
          totalQuestions={totalQ}
          gameTitle="فرقعة الفقاعات العبقرية"
          onReplay={() => window.location.reload()}
          onExit={onClose}
        />
      )}
    </div>
  );
}
