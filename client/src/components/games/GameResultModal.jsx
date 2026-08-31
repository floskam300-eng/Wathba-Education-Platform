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
      gameAudio.playVictory();
      const colors = ['#f59e0b', '#ec4899', '#8b5cf6', '#10b981', '#3b82f6', '#f97316'];
      const p = Array.from({ length: 32 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 5 + Math.random() * 8,
        color: colors[i % colors.length],
        duration: 1.5 + Math.random() * 2,
        delay: Math.random() * 1
      }));
      setParticles(p);
    } else {
      gameAudio.playWrong();
    }
  }, [isVictory]);

  const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const starsCount = accuracy >= 90 ? 3 : accuracy >= 50 ? 2 : 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn"
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

      <div className="relative w-full max-w-md bg-gradient-to-b from-[#1e1438] via-[#140e2b] to-[#0a0718] border border-purple-500/30 rounded-3xl p-6 sm:p-8 text-center shadow-[0_0_60px_rgba(168,85,247,0.35)] overflow-hidden">
        {/* Top Glow & Icon */}
        <div className="mx-auto w-24 h-24 mb-4 rounded-3xl bg-gradient-to-tr from-amber-400 via-orange-500 to-pink-500 flex items-center justify-center text-4xl shadow-xl shadow-orange-500/30 animate-bounce">
          {isVictory ? '🏆' : '💪'}
        </div>

        <h2 className="text-2xl sm:text-3xl font-black text-white mb-1">
          {isVictory ? 'إنجاز أسطوري! رائع!' : 'محاولة ممتازة!'}
        </h2>
        <p className="text-sm text-purple-200/70 mb-6">
          {isVictory ? `أكملت تحدي ${gameTitle} بنجاح باهر!` : `استمر في التدريب، المعرفة تحتاج تكرار المحاولة!`}
        </p>

        {/* Stars */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2, 3].map((starNum) => (
            <Star
              key={starNum}
              size={36}
              className={`transition-all duration-500 ${
                starNum <= starsCount
                  ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)] scale-110'
                  : 'text-white/15'
              }`}
            />
          ))}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 text-center">
            <div className="text-xs text-white/50 font-bold mb-1 flex items-center justify-center gap-1">
              <Zap size={14} className="text-amber-400" /> النقاط المكتسبة
            </div>
            <div className="text-2xl font-black text-amber-400 font-mono">
              +{pointsEarned}
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 text-center">
            <div className="text-xs text-white/50 font-bold mb-1 flex items-center justify-center gap-1">
              <CheckCircle size={14} className="text-emerald-400" /> الإجابات الصحيحة
            </div>
            <div className="text-2xl font-black text-emerald-400 font-mono">
              {correctCount} / {totalQuestions}
            </div>
          </div>
        </div>

        {/* Score info */}
        <div className="bg-black/30 border border-white/10 rounded-2xl px-4 py-2.5 mb-6 flex items-center justify-between text-xs text-white/70">
          <span>مجموع سكور اللعبة:</span>
          <span className="font-mono font-bold text-white text-sm">{score.toLocaleString('ar-EG')} نقطة</span>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-2.5">
          {canReplay && (
            <button
              type="button"
              onClick={onReplay}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-black text-base shadow-lg shadow-purple-500/40 active:scale-98 transition-all flex items-center justify-center gap-2"
            >
              <RotateCcw size={18} />
              <span>العب مرة تانية</span>
              {remainingAttempts !== null && (
                <span className="text-xs bg-black/20 px-2 py-0.5 rounded-lg mr-1 font-mono">
                  (متبقي {remainingAttempts})
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onExit}
            className="w-full py-3 px-4 rounded-2xl bg-white/10 hover:bg-white/15 text-white/90 font-bold text-sm border border-white/10 active:scale-98 transition-all flex items-center justify-center gap-2"
          >
            <span>العودة لقسم الفعاليات</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
