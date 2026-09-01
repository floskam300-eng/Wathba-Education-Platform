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
    gameAudio.playPowerup();
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
      gameAudio.playPop();
    } else if (type === 'freezeTime' && lifelines.freezeTime > 0) {
      setLifelines(prev => ({ ...prev, freezeTime: prev.freezeTime - 1 }));
      action();
      gameAudio.playPop();
    }
  };

  // 4. Handle Answer Submission
  const handleAnswerSubmit = (result) => {
    const newAnswers = [...answersLog, result];
    setAnswersLog(newAnswers);

    const isCorrect = result.selectedIndex === 0 || result.selectedIndex === (currentQ?.correctIndex ?? 0);

    if (isCorrect) {
      gameAudio.playCorrect();
      setScore(prev => prev + 1000);
      const nextFloor = currentFloor + 1;

      if (nextFloor >= questions.length) {
        // Complete the entire tower!
        handleFinishGame(true, newAnswers);
      } else {
        setCurrentFloor(nextFloor);
        setGameState('floor');
      }
    } else {
      gameAudio.playWrong();
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
    <div className="fixed inset-0 z-50 bg-[#070312] flex flex-col items-center justify-between select-none overflow-hidden touch-none" dir="rtl">
      {/* Game HUD Bar */}
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

      {/* Main Responsive Castle Chamber */}
      <div className="relative w-full h-full max-w-[960px] max-h-[560px] my-auto flex flex-col items-center justify-between p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-amber-500/30 bg-gradient-to-b from-[#180b2c] via-[#10061e] to-[#080210] shadow-[0_0_50px_rgba(245,158,11,0.25)] overflow-hidden">
        {/* Floating Magical Glow & Runes */}
        <div className="absolute inset-0 pointer-events-none opacity-30 bg-[radial-gradient(#f59e0b_1.5px,transparent_1.5px)] [background-size:24px_24px]" />

        {/* Top: Floor Badge & Title */}
        <div className="relative z-10 text-center pt-8 sm:pt-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 font-black text-xs sm:text-sm mb-1.5 shadow-lg">
            <Key size={16} className="text-amber-400 animate-spin" style={{ animationDuration: '6s' }} />
            <span>الطابق {currentFloor + 1} من {totalFloors}</span>
          </div>
          <h2 className="text-lg sm:text-2xl font-black text-white drop-shadow-md">
            {currentQ?.enemyLabel || `لغز وبوابة الطابق ${currentFloor + 1}`}
          </h2>
        </div>

        {/* Center: Castle Gate & Interactive Torch Door */}
        <div className="relative z-10 flex flex-col items-center justify-center my-auto">
          {/* Animated Castle Gate Arch */}
          <div className="relative w-36 h-44 sm:w-52 sm:h-60 rounded-t-full bg-gradient-to-b from-amber-600/25 via-purple-950/60 to-black/90 border-4 border-amber-500/60 flex flex-col items-center justify-center shadow-[0_0_50px_rgba(245,158,11,0.45)] transition-all hover:scale-105 p-3">
            {/* Glowing Golden Core Symbol */}
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-amber-500/20 border-2 border-amber-400/80 flex items-center justify-center text-3xl sm:text-4xl shadow-xl shadow-amber-500/30 animate-pulse mb-3">
              🏰
            </div>

            {/* Gate Unlock Button */}
            <button
              type="button"
              onClick={handleOpenGate}
              className="w-full py-3 px-4 rounded-xl sm:rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-400 text-white font-black text-xs sm:text-sm shadow-xl shadow-orange-500/50 active:scale-95 transition-all flex items-center justify-center gap-2 border border-amber-300/40 cursor-pointer"
            >
              <Unlock size={18} />
              <span>افتح لغز البوابة</span>
            </button>
          </div>

          <p className="text-amber-200/80 text-xs sm:text-sm mt-3 font-bold text-center">
            ✨ اضغط لفتح لغز البوابة وحله للوصول للكنز التالي!
          </p>
        </div>

        {/* Bottom: Floor Progression Steps & Lifeline Badges */}
        <div className="relative z-10 w-full max-w-md flex flex-col items-center gap-2.5 pb-2">
          {/* Progress Bars */}
          <div className="w-full flex items-center justify-between gap-2 bg-black/60 border border-white/10 p-2.5 rounded-2xl backdrop-blur-md">
            {Array.from({ length: totalFloors }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-3.5 rounded-full transition-all duration-500 ${
                  i < currentFloor
                    ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]'
                    : i === currentFloor
                    ? 'bg-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.9)] animate-pulse'
                    : 'bg-white/10'
                }`}
              />
            ))}
          </div>

          {/* Lifelines quick summary */}
          <div className="flex items-center gap-4 text-[11px] text-white/70 font-bold">
            <span className="flex items-center gap-1 bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
              <HelpCircle size={13} className="text-amber-400" />
              حذف إجابتين (50:50): <strong className="text-white">{lifelines.fiftyFifty}</strong>
            </span>
            <span className="flex items-center gap-1 bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
              <Hourglass size={13} className="text-cyan-400" />
              تجميد الوقت: <strong className="text-white">{lifelines.freezeTime}</strong>
            </span>
          </div>
        </div>

        {/* Loading Spinner */}
        {gameState === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm gap-3 z-30">
            <div className="animate-spin w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full" />
            <p className="text-white font-bold text-sm animate-pulse">جاري صعود سلالم البرج السحري...</p>
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
