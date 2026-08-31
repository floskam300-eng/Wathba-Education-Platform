import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import gameAudio from '../../../lib/gameAudio';
import GameHUD from '../../../components/games/GameHUD';
import QuestionOverlay from '../../../components/games/QuestionOverlay';
import GameResultModal from '../../../components/games/GameResultModal';
import { Lock, Unlock, Sparkles, Shield, Key, Trophy, Star, ChevronUp, Flame } from 'lucide-react';
import api from '../../../lib/api';
import toast from 'react-hot-toast';

export default function TowerOfRiddles({ onClose }) {
  const [gameState, setGameState] = useState('loading'); // loading, floor, question, chest, gameOver, victory
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

  // 2. Start Riddle on Current Floor
  const handleOpenGate = () => {
    gameAudio.playPowerup();
    setGameState('question');
  };

  // 3. Lifeline Handlers
  const handleUseLifeline = (type, action) => {
    if (type === 'fiftyFifty' && lifelines.fiftyFifty > 0) {
      setLifelines(prev => ({ ...prev, fiftyFifty: prev.fiftyFifty - 1 }));
      const correct = currentQ?.correctIndex ?? 0;
      const wrongIndices = [0, 1, 2, 3].filter(i => i !== correct && i < (currentQ?.choices?.length || 4));
      // Pick 2 wrong indices to eliminate
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
        // Complete the tower!
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
        // Retry or proceed
        setGameState('floor');
      }
    }
  };

  // 5. Finish Game
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
    <div className="fixed inset-0 z-50 bg-[#0c0818] flex flex-col items-center justify-center select-none overflow-hidden" dir="rtl">
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

      {/* Main Tower View Container */}
      <div className="relative w-full max-w-[920px] aspect-[920/500] max-h-[85vh] rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(245,158,11,0.3)] border border-amber-500/25 bg-gradient-to-b from-[#190d2e] via-[#0f071d] to-[#080310] flex flex-col items-center justify-between p-6 sm:p-10">

        {/* Floating Magic Sparks */}
        <div className="absolute inset-0 pointer-events-none opacity-40 bg-[radial-gradient(#f59e0b_1px,transparent_1px)] [background-size:24px_24px]" />

        {/* Top Tower Header */}
        <div className="relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-xs mb-2 shadow-lg">
            <Key size={14} />
            <span>الطابق {currentFloor + 1} من {totalFloors}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white">
            {currentQ?.enemyLabel || 'بوابة الحكمة والألغاز'}
          </h2>
        </div>

        {/* Center: Tower Gate Illustration */}
        <div className="relative z-10 flex flex-col items-center justify-center my-auto">
          <div className="relative w-40 h-48 sm:w-48 sm:h-56 rounded-t-full bg-gradient-to-b from-amber-600/30 via-purple-900/40 to-black/80 border-4 border-amber-500/50 flex flex-col items-center justify-center shadow-[0_0_40px_rgba(245,158,11,0.4)] transition-all hover:scale-105">
            {/* Glowing Rune Core */}
            <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-amber-300 text-3xl shadow-lg animate-pulse mb-3">
              🏰
            </div>

            <button
              type="button"
              onClick={handleOpenGate}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-black text-sm shadow-lg shadow-orange-500/40 active:scale-95 transition-all flex items-center gap-2"
            >
              <Unlock size={16} />
              <span>افتح لغز البوابة</span>
            </button>
          </div>

          <p className="text-white/60 text-xs mt-3 font-medium">
            اضغط على البوابة لحل الفزورة والصعود للطابق التالي!
          </p>
        </div>

        {/* Floor Progression Bar */}
        <div className="relative z-10 w-full max-w-lg flex items-center justify-between gap-2 bg-black/40 border border-white/10 p-2.5 rounded-2xl">
          {Array.from({ length: totalFloors }).map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-3 rounded-full transition-all duration-500 ${
                i < currentFloor
                  ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                  : i === currentFloor
                  ? 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.9)] animate-pulse'
                  : 'bg-white/10'
              }`}
            />
          ))}
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
