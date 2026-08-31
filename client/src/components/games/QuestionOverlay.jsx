import React, { useState, useEffect, useRef } from 'react';
import { Timer, CheckCircle, XCircle, Sparkles, HelpCircle, Flame } from 'lucide-react';
import gameAudio from '../../lib/gameAudio';

const CHOICE_LETTERS = ['أ', 'ب', 'ج', 'د'];
const CHOICE_COLORS = [
  'from-blue-600/30 to-indigo-600/30 border-blue-500/40 hover:border-blue-400',
  'from-purple-600/30 to-pink-600/30 border-purple-500/40 hover:border-purple-400',
  'from-amber-600/30 to-orange-600/30 border-amber-500/40 hover:border-amber-400',
  'from-emerald-600/30 to-teal-600/30 border-emerald-500/40 hover:border-emerald-400'
];

export default function QuestionOverlay({
  question,
  questionIndex = 0,
  totalQuestions = 3,
  timeLimit = 45,
  enemyLabel = 'تحدي المعرفة',
  onAnswer,
  lifelines = null,
  onUseLifeline = null
}) {
  const [timeLeft, setTimeLeft] = useState(timeLimit);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [eliminatedChoices, setEliminatedChoices] = useState([]);
  const [isFrozen, setIsFrozen] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    setTimeLeft(timeLimit);
    setSelectedIdx(null);
    setIsAnswered(false);
    setEliminatedChoices([]);
    setIsFrozen(false);
  }, [question?.id, questionIndex]);

  // Countdown timer
  useEffect(() => {
    if (isAnswered || isFrozen) return;

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleTimeOut();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [isAnswered, isFrozen]);

  const handleTimeOut = () => {
    if (isAnswered) return;
    setIsAnswered(true);
    gameAudio.playWrong();
    if (onAnswer) {
      onAnswer({ questionIndex, questionId: question.id, selectedIndex: -1, isTimeout: true });
    }
  };

  const handleSelectChoice = (idx) => {
    if (isAnswered || eliminatedChoices.includes(idx)) return;
    setSelectedIdx(idx);
    setIsAnswered(true);
    clearInterval(timerRef.current);

    if (onAnswer) {
      onAnswer({ questionIndex, questionId: question.id, selectedIndex: idx });
    }
  };

  // Keyboard shortcut support (1, 2, 3, 4)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isAnswered) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= (question?.choices?.length || 4)) {
        handleSelectChoice(num - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAnswered, question]);

  const timerPct = Math.max(0, (timeLeft / (timeLimit || 45)) * 100);
  const timerColor = timerPct > 50 ? '#10b981' : timerPct > 25 ? '#f59e0b' : '#ef4444';

  const choices = Array.isArray(question?.choices) ? question.choices : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn"
      dir="rtl"
    >
      <div className="relative w-full max-w-2xl bg-gradient-to-b from-[#1c1836] to-[#0d0a1e] border border-indigo-500/30 rounded-3xl p-5 sm:p-7 shadow-[0_0_50px_rgba(99,102,241,0.3)] overflow-hidden">
        {/* Top subtle glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-24 bg-indigo-500/10 blur-3xl pointer-events-none" />

        {/* Header row */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-lg shadow-lg shadow-indigo-500/30">
              <Flame size={20} className="animate-pulse text-amber-300" />
            </div>
            <div>
              <div className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                <span>{enemyLabel || 'تحدي الذكاء'}</span>
                <span className="text-white/30">•</span>
                <span>سؤال {questionIndex + 1} من {totalQuestions}</span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-white">اختر الإجابة الصحيحة</h3>
            </div>
          </div>

          {/* Timer Display */}
          <div className="flex items-center gap-2 bg-black/40 border border-white/10 px-3.5 py-1.5 rounded-2xl">
            <Timer size={16} className="text-amber-400" />
            <span
              className="font-mono font-black text-base sm:text-lg"
              style={{ color: timerColor }}
            >
              {timeLeft}s
            </span>
          </div>
        </div>

        {/* Timer Bar */}
        <div className="w-full h-2 bg-black/50 rounded-full overflow-hidden mb-6 p-0.5 border border-white/10">
          <div
            className="h-full rounded-full transition-all duration-300 ease-linear shadow-[0_0_8px_currentColor]"
            style={{ width: `${timerPct}%`, backgroundColor: timerColor, color: timerColor }}
          />
        </div>

        {/* Question Content */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 mb-6 text-center">
          <p className="text-base sm:text-xl font-bold text-white leading-relaxed select-none">
            {question?.questionText || question?.question_text}
          </p>
          {question?.questionImage && (
            <div className="mt-3 max-h-48 overflow-hidden rounded-xl mx-auto flex justify-center">
              <img src={question.questionImage} alt="Question Diagram" className="object-contain max-h-44" />
            </div>
          )}
        </div>

        {/* Choices Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {choices.map((choiceText, idx) => {
            const isEliminated = eliminatedChoices.includes(idx);
            const isSelected = selectedIdx === idx;

            return (
              <button
                key={idx}
                type="button"
                disabled={isAnswered || isEliminated}
                onClick={() => handleSelectChoice(idx)}
                className={`group relative text-right p-4 rounded-2xl border backdrop-blur-sm transition-all duration-200 flex items-center justify-between gap-3 ${
                  isEliminated
                    ? 'opacity-20 border-white/5 bg-black/20 cursor-not-allowed'
                    : isSelected
                    ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-500/50 scale-[1.02]'
                    : `bg-gradient-to-r ${CHOICE_COLORS[idx % CHOICE_COLORS.length]} text-white/90 hover:scale-[1.01] active:scale-[0.99]`
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-7 h-7 rounded-lg bg-black/30 border border-white/15 flex items-center justify-center font-bold text-xs text-amber-300 flex-shrink-0 group-hover:scale-110 transition-transform">
                    {CHOICE_LETTERS[idx] || (idx + 1)}
                  </span>
                  <span className="text-sm sm:text-base font-bold truncate select-none">
                    {choiceText}
                  </span>
                </div>

                <span className="hidden sm:inline text-xs font-mono text-white/30 group-hover:text-white/60">
                  [{idx + 1}]
                </span>
              </button>
            );
          })}
        </div>

        {/* Lifelines (if available for Puzzle/Tower games) */}
        {lifelines && onUseLifeline && (
          <div className="flex items-center justify-center gap-2 pt-2 border-t border-white/10">
            <span className="text-xs text-white/50 font-bold ml-2">وسائل المساعدة:</span>
            <button
              type="button"
              disabled={isAnswered || lifelines.fiftyFifty <= 0}
              onClick={() => onUseLifeline('fiftyFifty', setEliminatedChoices)}
              className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
            >
              50:50 ({lifelines.fiftyFifty})
            </button>
            <button
              type="button"
              disabled={isAnswered || lifelines.freezeTime <= 0 || isFrozen}
              onClick={() => onUseLifeline('freezeTime', () => setIsFrozen(true))}
              className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
            >
              تجميد الوقت ({lifelines.freezeTime})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
