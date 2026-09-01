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
    <div className="fixed inset-0 z-50 bg-[#070312] w-screen h-screen flex flex-col justify-between select-none overflow-hidden touch-none p-1.5 sm:p-4" dir="rtl">
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
      <div className="relative w-full flex-1 my-auto flex flex-col items-center justify-between p-2 sm:p-5 rounded-2xl sm:rounded-3xl border border-amber-500/30 bg-gradient-to-b from-[#180b2c] via-[#10061e] to-[#080210] shadow-[0_0_80px_rgba(245,158,11,0.25)] overflow-hidden">
        {/* Floating Magical Glow & Runes */}
        <div className="absolute inset-0 pointer-events-none opacity-25 bg-[radial-gradient(#f59e0b_1.5px,transparent_1.5px)] [background-size:24px_24px]" />

        {/* Top: Floor Badge & Title (Compact) */}
        <div className="relative z-10 text-center pt-8 sm:pt-2">
          <div className="inline-flex items-center gap-1 px-3 py-0.5 sm:px-4 sm:py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 font-black text-[10px] sm:text-xs mb-0.5 shadow-md backdrop-blur-md">
            <Key size={13} className="text-amber-400 animate-spin" style={{ animationDuration: '6s' }} />
            <span>الطابق {currentFloor + 1} من {totalFloors}</span>
          </div>
          <h2 className="text-xs sm:text-xl font-black text-white drop-shadow truncate max-w-[85vw]">
            {currentQ?.enemyLabel || `لغز وبوابة الطابق ${currentFloor + 1}`}
          </h2>
        </div>

        {/* Center: Castle Gate & Interactive Door Button */}
        <div className="relative z-10 flex flex-col items-center justify-center my-auto">
          <div className="relative w-32 h-36 sm:w-52 sm:h-58 rounded-t-full bg-gradient-to-b from-amber-600/25 via-purple-950/60 to-black/90 border-3 border-amber-500/60 flex flex-col items-center justify-center shadow-[0_0_40px_rgba(245,158,11,0.4)] transition-all hover:scale-105 p-2 sm:p-3">
            <div className="w-11 h-11 sm:w-16 sm:h-16 rounded-full bg-amber-500/20 border border-amber-400/80 flex items-center justify-center text-2xl sm:text-3xl shadow-xl shadow-amber-500/35 animate-pulse mb-1.5 sm:mb-2">
              🏰
            </div>

            <button
              type="button"
              onClick={handleOpenGate}
              className="w-full py-2 sm:py-2.5 px-3 sm:px-5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-400 text-white font-black text-[11px] sm:text-sm shadow-xl shadow-orange-500/50 active:scale-95 transition-all flex items-center justify-center gap-1.5 border border-amber-300/40 cursor-pointer"
            >
              <Unlock size={15} />
              <span>افتح لغز البوابة</span>
            </button>
          </div>

          <p className="text-amber-200/80 text-[10px] sm:text-xs mt-1 font-bold text-center drop-shadow">
            ✨ اضغط لفتح لغز البوابة للوصول للكنز!
          </p>
        </div>

        {/* Bottom: Floor Progression Steps & Lifelines (Compact) */}
        <div className="relative z-10 w-full max-w-lg flex flex-col items-center gap-1 pb-1">
          <div className="w-full flex items-center justify-between gap-1.5 bg-black/60 border border-white/15 p-1.5 sm:p-2 rounded-xl backdrop-blur-md shadow-md">
            {Array.from({ length: totalFloors }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-2 sm:h-3 rounded-full transition-all duration-500 ${
                  i < currentFloor
                    ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]'
                    : i === currentFloor
                    ? 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.9)] animate-pulse'
                    : 'bg-white/10'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-3 text-[10px] sm:text-xs text-white/80 font-bold">
            <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-lg border border-white/10">
              <HelpCircle size={12} className="text-amber-400" />
              50:50: <strong className="text-white">{lifelines.fiftyFifty}</strong>
            </span>
            <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-lg border border-white/10">
              <Hourglass size={12} className="text-cyan-400" />
              تجميد: <strong className="text-white">{lifelines.freezeTime}</strong>
            </span>
          </div>
        </div>

        {gameState === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md gap-3 z-30">
            <div className="animate-spin w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full" />
            <p className="text-white font-bold text-xs sm:text-sm animate-pulse">جاري صعود سلالم البرج السحري...</p>
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
