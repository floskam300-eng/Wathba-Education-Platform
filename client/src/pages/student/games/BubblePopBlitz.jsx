import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import gameAudio from '../../../lib/gameAudio';
import GameHUD from '../../../components/games/GameHUD';
import GameResultModal from '../../../components/games/GameResultModal';
import { Sparkles, Zap, Timer, Star } from 'lucide-react';
import api from '../../../lib/api';
import toast from 'react-hot-toast';

const CW = 920;
const CH = 500;

const BUBBLE_COLORS = [
  { bg: 'rgba(59, 130, 246, 0.45)', stroke: '#60a5fa', glow: '#3b82f6' },
  { bg: 'rgba(236, 72, 153, 0.45)', stroke: '#f472b6', glow: '#ec4899' },
  { bg: 'rgba(245, 158, 11, 0.45)', stroke: '#fbbf24', glow: '#f59e0b' },
  { bg: 'rgba(16, 185, 129, 0.45)', stroke: '#34d399', glow: '#10b981' }
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

  // Mutable Engine Ref
  const gameRef = useRef({
    frame: 0,
    score: 0,
    lives: 3,
    combo: 0,
    bubbles: [],
    particles: [],
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
    const newBubbles = choices.map((choice, idx) => {
      const col = BUBBLE_COLORS[idx % BUBBLE_COLORS.length];
      const radius = 48 + Math.min(20, choice.length * 2);
      return {
        id: idx,
        text: choice,
        choiceIndex: idx,
        isCorrect: idx === 0 || idx === (currentQ.correctIndex ?? 0),
        x: 140 + idx * 190 + (Math.random() * 40 - 20),
        y: CH + 60 + Math.random() * 120,
        vx: (Math.random() - 0.5) * 1.2,
        vy: -1.8 - Math.random() * 0.8,
        r: radius,
        col,
        wobble: Math.random() * Math.PI * 2
      };
    });

    gameRef.current.bubbles = newBubbles;
  }, [gameState, currentQIndex, currentQ]);

  // 2. Keyboard Handlers (1, 2, 3, 4 to pop bubbles directly)
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

  // 3. Canvas Click / Touch Handler for Bubble Popping
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

      if (dist < b.r) {
        popBubble(b, i);
        break;
      }
    }
  };

  const popBubble = (bubble, index) => {
    const g = gameRef.current;
    g.bubbles.splice(index, 1);

    // Spawn Burst Particles
    for (let p = 0; p < 18; p++) {
      g.particles.push({
        x: bubble.x,
        y: bubble.y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        r: 3 + Math.random() * 4,
        color: bubble.col.stroke,
        life: 25
      });
    }

    const isCorrect = bubble.isCorrect;
    const newAnswers = [...answersLog, {
      questionIndex: currentQIndex,
      questionId: currentQ.id,
      selectedIndex: bubble.choiceIndex
    }];
    setAnswersLog(newAnswers);

    if (isCorrect) {
      gameAudio.playPop();
      gameAudio.playCorrect();
      g.combo++;
      const bonus = g.combo * 200;
      g.score += 500 + bonus;
      setScore(g.score);
      setCombo(g.combo);

      const nextQ = currentQIndex + 1;
      if (nextQ >= questions.length) {
        handleFinishGame(true, newAnswers);
      } else {
        setCurrentQIndex(nextQ);
      }
    } else {
      gameAudio.playWrong();
      g.combo = 0;
      setCombo(0);
      g.lives--;
      setLives(g.lives);

      if (g.lives <= 0) {
        handleFinishGame(false, newAnswers);
      }
    }
  };

  // 4. Main Game Loop
  useEffect(() => {
    if (gameState !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const loop = () => {
      const g = gameRef.current;

      if (!g.isPaused) {
        g.frame++;

        // Update Bubbles
        g.bubbles.forEach(b => {
          b.x += b.vx + Math.sin(g.frame * 0.04 + b.wobble) * 0.8;
          b.y += b.vy;

          // Wrap top to bottom if missed
          if (b.y < -b.r - 20) {
            b.y = CH + b.r + 20;
            b.x = 100 + Math.random() * (CW - 200);
          }
        });

        // Update Particles
        g.particles.forEach(p => {
          p.x += p.vx;
          p.y += p.vy;
          p.r = Math.max(0, p.r - 0.12);
          p.life--;
        });
        g.particles = g.particles.filter(p => p.life > 0 && p.r > 0);
      }

      // Render
      // Gradient background
      const grad = ctx.createLinearGradient(0, 0, 0, CH);
      grad.addColorStop(0, '#041e1b');
      grad.addColorStop(0.5, '#062d27');
      grad.addColorStop(1, '#021311');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CW, CH);

      // Render Particles
      g.particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // Render Bubbles
      g.bubbles.forEach(b => {
        ctx.save();
        ctx.shadowBlur = 18;
        ctx.shadowColor = b.col.glow;
        ctx.fillStyle = b.col.bg;
        ctx.strokeStyle = b.col.stroke;
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Bubble Highlight reflection
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.22, 0, Math.PI * 2);
        ctx.fill();

        // Bubble Text
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Tajawal, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.text, b.x, b.y);
        ctx.restore();
      });

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [gameState]);

  // 5. Finish Game
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
    <div className="fixed inset-0 z-50 bg-[#02110f] flex flex-col items-center justify-center select-none overflow-hidden" dir="rtl">
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
      <div className="relative w-full max-w-[920px] aspect-[920/500] max-h-[78vh] rounded-2xl sm:rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(16,185,129,0.35)] border border-emerald-500/25 flex flex-col touch-none select-none">
        {/* Question Bar at Top */}
        <div className="absolute top-14 sm:top-16 left-3 right-3 sm:left-4 sm:right-4 z-20 bg-black/70 backdrop-blur-md border border-emerald-500/30 rounded-2xl p-3 sm:p-4 text-center shadow-lg pointer-events-none">
          <div className="text-[10px] sm:text-xs font-bold text-emerald-400 mb-0.5">
            سؤال {currentQIndex + 1} من {totalQ}:
          </div>
          <h3 className="text-sm sm:text-lg font-black text-white">
            {currentQ?.questionText || currentQ?.question_text}
          </h3>
        </div>

        {/* Canvas for Floating Bubbles */}
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
          className="w-full h-full object-contain block bg-[#031a17] cursor-pointer"
        />

        {/* Desktop Keyboard Helper Badge */}
        <div className="hidden sm:flex absolute bottom-3 left-4 items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-[11px] text-white/70 pointer-events-none">
          <span>⌨️ تحكم الكيبورد:</span>
          <span className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-300 font-mono font-bold">1 - 4</span> فرقعة الفقاعة بالاختيار
        </div>

        {gameState === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm gap-3 z-30">
            <div className="animate-spin w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full" />
            <p className="text-white font-bold text-sm animate-pulse">جاري تحضير الفقاعات السحرية...</p>
          </div>
        )}
      </div>

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
