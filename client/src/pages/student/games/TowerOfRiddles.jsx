import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import gameAudio from '../../../lib/gameAudio';
import GameHUD from '../../../components/games/GameHUD';
import QuestionOverlay from '../../../components/games/QuestionOverlay';
import GameResultModal from '../../../components/games/GameResultModal';
import { Lock, Unlock, Sparkles, Shield, Key, Trophy, Star, ChevronUp, Flame, HelpCircle, Hourglass } from 'lucide-react';
import api from '../../../lib/api';
import toast from 'react-hot-toast';

export default function TowerOfRiddles({ onClose }) {
  const [gameState, setGameState] = useState('loading'); // loading, floor, question, gameOver, victory
  const [sessionToken, setSessionToken] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentFloor, setCurrentFloor] = useState(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [answersLog, setAnswersLog] = useState([]);
  const [muted, setMuted] = useState(() => gameAudio.isMuted());

  // Lifelines
  const [lifelines, setLifelines] = useState({
    fiftyFifty: 1,
    freezeTime: 1
  });

  // 1. Initialize API Session
  useEffect(() => {
    let mounted = true;
    api.post('/events/tower_of_riddles/start')
      .then(res => {
        if (!mounted) return;
        if (res.data.success) {
          setSessionToken(res.data.sessionToken);
          setQuestions(res.data.questions || []);
          setGameState('floor');
        } else {
          toast.error(res.data.error || 'تعذر بدء اللعبة');
          onClose();
        }
      })
      .catch(err => {
        if (!mounted) return;
        toast.error(err.response?.data?.error || 'حدث خطأ في تحميل برج الفوازير');
        onClose();
      });

    return () => { mounted = false; };
  }, []);

  const currentQ = questions[currentFloor];

  // 2. Open Gate & Launch Riddle
  const handleOpenGate = () => {
    try { gameAudio.playPowerup(); } catch (_) {}
    setGameState('question');
  };

  // 3. Lifeline Handlers
  const handleUseLifeline = (type, action) => {
    if (type === 'fiftyFifty' && lifelines.fiftyFifty > 0) {
      setLifelines(prev => ({ ...prev, fiftyFifty: prev.fiftyFifty - 1 }));
      const correct = currentQ?.correctIndex ?? 0;
      const choicesCount = currentQ?.choices?.length || 4;
      const wrongIndices = [0, 1, 2, 3].filter(i => i !== correct && i < choicesCount);
      const toEliminate = wrongIndices.sort(() => Math.random() - 0.5).slice(0, 2);
      action(toEliminate);
      try { gameAudio.playPop(); } catch (_) {}
    } else if (type === 'freezeTime' && lifelines.freezeTime > 0) {
      setLifelines(prev => ({ ...prev, freezeTime: prev.freezeTime - 1 }));
      action();
      try { gameAudio.playPop(); } catch (_) {}
    }
  };

  // 4. Handle Answer Submission
  const handleAnswerSubmit = (result) => {
    const newAnswers = [...answersLog, result];
    setAnswersLog(newAnswers);

    const isCorrect = result.selectedIndex === 0 || result.selectedIndex === (currentQ?.correctIndex ?? 0);

    if (isCorrect) {
      try { gameAudio.playCorrect(); } catch (_) {}
      setScore(prev => prev + 1000);
      const nextFloor = currentFloor + 1;

      if (nextFloor >= questions.length) {
        handleFinishGame(true, newAnswers);
      } else {
        setCurrentFloor(nextFloor);
        setGameState('floor');
      }
    } else {
      try { gameAudio.playWrong(); } catch (_) {}
      const newLives = lives - 1;
      setLives(newLives);

      if (newLives <= 0) {
        handleFinishGame(false, newAnswers);
      } else {
        setGameState('floor');
      }
    }
  };

  // 5. Finish Game & Award Points
  const handleFinishGame = (isVictory, finalAnswers = answersLog) => {
    api.post('/events/tower_of_riddles/finish', {
      sessionToken,
      answers: finalAnswers,
      completed: isVictory,
      rawScore: score + (isVictory ? 1500 : 0)
    })
      .then(res => {
        if (res.data.success) {
          setPointsEarned(res.data.pointsEarned);
          setGameState(isVictory ? 'victory' : 'gameOver');
        }
      })
      .catch(err => {
        console.error('[tower finish error]', err);
        setGameState(isVictory ? 'victory' : 'gameOver');
      });
  };

  const handleToggleMute = () => {
    const isMuted = gameAudio.toggleMute();
    setMuted(isMuted);
  };

  const totalFloors = questions.length || 4;

  return (
    <div className="fixed inset-0 z-50 bg-[#070312] w-screen h-screen flex flex-col justify-between select-none overflow-hidden touch-none p-4 sm:p-8" dir="rtl">
      {/* Game HUD Bar spanning full width */}
      <GameHUD
        title="برج الفوازير والكنوز"
        lives={lives}
        score={score}
        currentQuestion={Math.min(currentFloor + 1, totalFloors)}
        totalQuestions={totalFloors}
        muted={muted}
        onToggleMute={handleToggleMute}
        onExit={onClose}
        accentColor="#f59e0b"
      />

      {/* Main Fullscreen Grand Castle Chamber */}
      <div className="relative w-full h-full my-auto flex flex-col items-center justify-between p-6 sm:p-10 rounded-3xl border border-amber-500/30 bg-gradient-to-b from-[#180b2c] via-[#10061e] to-[#080210] shadow-[0_0_80px_rgba(245,158,11,0.25)] overflow-hidden">
        {/* Floating Magical Glow & Runes */}
        <div className="absolute inset-0 pointer-events-none opacity-30 bg-[radial-gradient(#f59e0b_1.5px,transparent_1.5px)] [background-size:28px_28px]" />

        {/* Top: Floor Badge & Title */}
        <div className="relative z-10 text-center pt-10 sm:pt-6">
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 font-black text-xs sm:text-base mb-2 shadow-xl backdrop-blur-md">
            <Key size={18} className="text-amber-400 animate-spin" style={{ animationDuration: '6s' }} />
            <span>الطابق {currentFloor + 1} من {totalFloors}</span>
          </div>
          <h2 className="text-xl sm:text-3xl font-black text-white drop-shadow-lg">
            {currentQ?.enemyLabel || `لغز وبوابة الطابق ${currentFloor + 1}`}
          </h2>
        </div>

        {/* Center: Castle Gate & Interactive Torch Door */}
        <div className="relative z-10 flex flex-col items-center justify-center my-auto">
          <div className="relative w-44 h-52 sm:w-64 sm:h-72 rounded-t-full bg-gradient-to-b from-amber-600/25 via-purple-950/60 to-black/90 border-4 border-amber-500/60 flex flex-col items-center justify-center shadow-[0_0_60px_rgba(245,158,11,0.5)] transition-all hover:scale-105 p-4">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-amber-500/20 border-2 border-amber-400/80 flex items-center justify-center text-4xl sm:text-5xl shadow-2xl shadow-amber-500/35 animate-pulse mb-4">
              🏰
            </div>

            <button
              type="button"
              onClick={handleOpenGate}
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-400 text-white font-black text-sm sm:text-base shadow-2xl shadow-orange-500/50 active:scale-95 transition-all flex items-center justify-center gap-2.5 border border-amber-300/40 cursor-pointer"
            >
              <Unlock size={20} />
              <span>افتح لغز البوابة</span>
            </button>
          </div>

          <p className="text-amber-200/90 text-xs sm:text-base mt-4 font-bold text-center drop-shadow">
            ✨ اضغط لفتح لغز البوابة وحله للوصول للكنز التالي!
          </p>
        </div>

        {/* Bottom: Floor Progression Steps & Lifelines */}
        <div className="relative z-10 w-full max-w-xl flex flex-col items-center gap-3 pb-4">
          <div className="w-full flex items-center justify-between gap-3 bg-black/60 border border-white/15 p-3 rounded-2xl backdrop-blur-md shadow-xl">
            {Array.from({ length: totalFloors }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-4 rounded-full transition-all duration-500 ${
                  i < currentFloor
                    ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]'
                    : i === currentFloor
                    ? 'bg-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.9)] animate-pulse'
                    : 'bg-white/10'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-6 text-xs sm:text-sm text-white/80 font-bold">
            <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10 shadow-md">
              <HelpCircle size={15} className="text-amber-400" />
              حذف إجابتين (50:50): <strong className="text-white">{lifelines.fiftyFifty}</strong>
            </span>
            <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10 shadow-md">
              <Hourglass size={15} className="text-cyan-400" />
              تجميد الوقت: <strong className="text-white">{lifelines.freezeTime}</strong>
            </span>
          </div>
        </div>

        {gameState === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md gap-3 z-30">
            <div className="animate-spin w-14 h-14 border-4 border-amber-500 border-t-transparent rounded-full" />
            <p className="text-white font-bold text-base animate-pulse">جاري صعود سلالم البرج السحري...</p>
          </div>
        )}
      </div>

      {/* Question Overlay with Lifelines */}
      {gameState === 'question' && currentQ && (
        <QuestionOverlay
          question={currentQ}
          questionIndex={currentFloor}
          totalQuestions={totalFloors}
          timeLimit={currentQ.timeLimit || 45}
          enemyLabel={currentQ.enemyLabel || `لغز الطابق ${currentFloor + 1}`}
          lifelines={lifelines}
          onUseLifeline={handleUseLifeline}
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
          totalQuestions={totalFloors}
          gameTitle="برج الفوازير والكنوز"
          onReplay={() => window.location.reload()}
          onExit={onClose}
        />
      )}
    </div>
  );
}
