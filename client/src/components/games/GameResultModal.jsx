import React, { useEffect, useState } from 'react';
import { Trophy, Star, Award, RotateCcw, ArrowRight, Zap, CheckCircle, Flame } from 'lucide-react';
import gameAudio from '../../lib/gameAudio';

export default function GameResultModal({
  isVictory = false,
  score = 0,
  pointsEarned = 0,
  correctCount = 0,
  totalQuestions = 3,
  gameTitle = 'اللعبة',
  canReplay = true,
  remainingAttempts = null,
  onReplay,
  onExit
}) {
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    if (isVictory) {
      try { gameAudio.playVictory(); } catch (_) {}
      const colors = ['#f59e0b', '#ec4899', '#8b5cf6', '#10b981', '#3b82f6', '#f97316'];
      const p = Array.from({ length: 28 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 4 + Math.random() * 6,
        color: colors[i % colors.length],
        duration: 1.5 + Math.random() * 2,
        delay: Math.random() * 0.8
      }));
      setParticles(p);
    } else {
      try { gameAudio.playWrong(); } catch (_) {}
    }
  }, [isVictory]);

  const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const starsCount = accuracy >= 90 ? 3 : accuracy >= 50 ? 2 : 1;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn select-none"
      dir="rtl"
    >
      {/* Confetti particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full pointer-events-none animate-ping"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: p.color,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`
          }}
        />
      ))}

      {/* Main Responsive Modal Card (Scrollable if screen height is very small) */}
      <div className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto bg-gradient-to-b from-[#1e1438] via-[#140e2b] to-[#0a0718] border border-purple-500/30 rounded-3xl p-4 sm:p-6 text-center shadow-[0_0_60px_rgba(168,85,247,0.35)] custom-scrollbar">
        {/* Top Header: Badge + Title + Stars */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-3">
          <div className="w-14 h-14 sm:w-18 sm:h-18 rounded-2xl bg-gradient-to-tr from-amber-400 via-orange-500 to-pink-500 flex items-center justify-center text-2xl sm:text-3xl shadow-xl shadow-orange-500/30 flex-shrink-0 animate-bounce">
            {isVictory ? '🏆' : '💪'}
          </div>

          <div className="text-center sm:text-right">
            <h2 className="text-lg sm:text-2xl font-black text-white">
              {isVictory ? 'إنجاز أسطوري! رائع!' : 'محاولة ممتازة!'}
            </h2>
            <p className="text-xs sm:text-sm text-purple-200/70">
              {isVictory ? `أكملت تحدي ${gameTitle} بنجاح باهر!` : `استمر في التدريب، المعرفة تحتاج تكرار المحاولة!`}
            </p>
          </div>
        </div>

        {/* Stars */}
        <div className="flex items-center justify-center gap-2 mb-3">
          {[1, 2, 3].map((starNum) => (
            <Star
              key={starNum}
              size={24}
              className={`transition-all duration-500 sm:w-7 sm:h-7 ${
                starNum <= starsCount
                  ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.8)] scale-110'
                  : 'text-white/15'
              }`}
            />
          ))}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-2.5 sm:p-3 text-center">
            <div className="text-[11px] sm:text-xs text-white/50 font-bold mb-0.5 flex items-center justify-center gap-1">
              <Zap size={13} className="text-amber-400" /> النقاط المكتسبة
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-400 font-mono">
              +{pointsEarned}
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-2.5 sm:p-3 text-center">
            <div className="text-[11px] sm:text-xs text-white/50 font-bold mb-0.5 flex items-center justify-center gap-1">
              <CheckCircle size={13} className="text-emerald-400" /> الإجابات الصحيحة
            </div>
            <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">
              {correctCount} / {totalQuestions}
            </div>
          </div>
        </div>

        {/* Score info */}
        <div className="bg-black/40 border border-white/10 rounded-2xl px-3.5 py-2 mb-3 flex items-center justify-between text-xs text-white/70">
          <span>مجموع سكور اللعبة:</span>
          <span className="font-mono font-bold text-white text-sm">{score.toLocaleString('ar-EG')} نقطة</span>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {canReplay && (
            <button
              type="button"
              onClick={onReplay}
              className="w-full py-2.5 sm:py-3 px-3 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-black text-xs sm:text-sm shadow-lg shadow-purple-500/40 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw size={16} />
              <span>العب مرة تانية</span>
              {remainingAttempts !== null && (
                <span className="text-[10px] bg-black/30 px-1.5 py-0.5 rounded font-mono">
                  ({remainingAttempts})
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onExit}
            className={`w-full py-2.5 sm:py-3 px-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white/90 font-bold text-xs sm:text-sm border border-white/10 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              !canReplay ? 'col-span-2' : ''
            }`}
          >
            <span>العودة للفعاليات</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
