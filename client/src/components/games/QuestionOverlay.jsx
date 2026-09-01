import React, { useState, useEffect, useRef } from 'react';
import { Timer, CheckCircle, XCircle, Sparkles, HelpCircle, Flame, Hourglass } from 'lucide-react';
import gameAudio from '../../lib/gameAudio';

const CHOICE_LETTERS = ['أ', 'ب', 'ج', 'د'];
const CHOICE_COLORS = [
  'from-blue-600/35 to-indigo-600/35 border-blue-500/40 hover:border-blue-400',
  'from-purple-600/35 to-pink-600/35 border-purple-500/40 hover:border-purple-400',
  'from-amber-600/35 to-orange-600/35 border-amber-500/40 hover:border-amber-400',
  'from-emerald-600/35 to-teal-600/35 border-emerald-500/40 hover:border-emerald-400'
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
    try { gameAudio.playWrong(); } catch (_) {}
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
      className="fixed inset-0 z-[110] flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn select-none"
      dir="rtl"
    >
      <div className="relative w-full max-w-2xl max-h-[96vh] overflow-y-auto bg-gradient-to-b from-[#1c1836] to-[#0d0a1e] border border-indigo-500/40 rounded-2xl sm:rounded-3xl p-3 sm:p-5 shadow-[0_0_50px_rgba(99,102,241,0.35)] custom-scrollbar">
        {/* Top subtle glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-16 bg-indigo-500/15 blur-2xl pointer-events-none" />

        {/* ── HEADER ROW (COMPACT SINGLE LINE) ── */}
        <div className="flex items-center justify-between gap-2 mb-2">
          {/* Label + Question Index */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-base shadow-md shadow-indigo-500/30 flex-shrink-0">
              <Flame size={16} className="animate-pulse text-amber-300" />
            </div>
            <div>
              <div className="text-[11px] sm:text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                <span className="truncate max-w-[140px] sm:max-w-xs">{enemyLabel || 'تحدي المعرفة'}</span>
                <span className="text-white/30">•</span>
                <span className="text-amber-400">سؤال {questionIndex + 1}/{totalQuestions}</span>
              </div>
            </div>
          </div>

          {/* Lifelines (Tower of Riddles) */}
          {lifelines && onUseLifeline && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={isAnswered || lifelines.fiftyFifty <= 0}
                onClick={() => onUseLifeline('fiftyFifty', (toElim) => setEliminatedChoices(toElim))}
                className={`px-2 py-1 rounded-lg text-[10px] sm:text-xs font-bold flex items-center gap-1 border transition-all ${
                  lifelines.fiftyFifty > 0 && !isAnswered
                    ? 'bg-amber-500/20 border-amber-400/50 text-amber-300 active:scale-95'
                    : 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'
                }`}
                title="حذف إجابتين"
              >
                <HelpCircle size={12} />
                <span>50:50 ({lifelines.fiftyFifty})</span>
              </button>

              <button
                type="button"
                disabled={isAnswered || lifelines.freezeTime <= 0 || isFrozen}
                onClick={() => onUseLifeline('freezeTime', () => setIsFrozen(true))}
                className={`px-2 py-1 rounded-lg text-[10px] sm:text-xs font-bold flex items-center gap-1 border transition-all ${
                  lifelines.freezeTime > 0 && !isAnswered && !isFrozen
                    ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300 active:scale-95'
                    : 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'
                }`}
                title="تجميد الوقت"
              >
                <Hourglass size={12} />
                <span>تجميد ({lifelines.freezeTime})</span>
              </button>
            </div>
          )}

          {/* Timer Display Badge */}
          <div className="flex items-center gap-1.5 bg-black/50 border border-white/10 px-2.5 py-1 rounded-xl">
            <Timer size={13} className="text-amber-400" />
            <span className="font-mono font-black text-xs sm:text-sm" style={{ color: timerColor }}>
              {timeLeft}s
            </span>
          </div>
        </div>

        {/* ── TIMER PROGRESS BAR (SLIM) ── */}
        <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden mb-2.5 p-0.5 border border-white/10">
          <div
            className="h-full rounded-full transition-all duration-300 ease-linear shadow-[0_0_6px_currentColor]"
            style={{ width: `${timerPct}%`, backgroundColor: timerColor, color: timerColor }}
          />
        </div>

        {/* ── QUESTION TEXT BOX (COMPACT) ── */}
        <div className="bg-white/5 border border-white/10 rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 mb-2.5 text-center">
          <p className="text-xs sm:text-base font-bold text-white leading-relaxed select-none">
            {question?.questionText || question?.question_text}
          </p>
          {question?.questionImage && (
            <div className="mt-2 max-h-32 overflow-hidden rounded-lg mx-auto flex justify-center">
              <img src={question.questionImage} alt="Question Diagram" className="object-contain max-h-28" />
            </div>
          )}
        </div>

        {/* ── CHOICES 2x2 GRID (FIT ON ONE SCREEN WITHOUT SCROLLING) ── */}
        <div className="grid grid-cols-2 gap-2 mb-1">
          {choices.map((choiceText, idx) => {
            const isEliminated = eliminatedChoices.includes(idx);
            const isSelected = selectedIdx === idx;

            return (
              <button
                key={idx}
                type="button"
                disabled={isAnswered || isEliminated}
                onClick={() => handleSelectChoice(idx)}
                className={`group relative text-right p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border backdrop-blur-sm transition-all duration-150 flex items-center justify-between gap-2 cursor-pointer ${
                  isEliminated
                    ? 'opacity-20 border-white/5 bg-black/20 cursor-not-allowed'
                    : isSelected
                    ? 'bg-indigo-600 border-indigo-300 text-white shadow-lg shadow-indigo-500/50 scale-[1.01]'
                    : `bg-gradient-to-r ${CHOICE_COLORS[idx % CHOICE_COLORS.length]} text-white/95 hover:scale-[1.01] active:scale-[0.98]`
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-black/40 border border-white/20 flex items-center justify-center font-black text-xs text-amber-300 flex-shrink-0">
                    {CHOICE_LETTERS[idx] || (idx + 1)}
                  </span>
                  <span className="text-xs sm:text-sm font-bold truncate select-none">
                    {choiceText}
                  </span>
                </div>

                <span className="hidden md:inline text-[10px] font-mono text-white/30 group-hover:text-white/60">
                  [{idx + 1}]
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
