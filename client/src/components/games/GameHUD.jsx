import React from 'react';
import { Volume2, VolumeX, Heart, Trophy, X, Zap } from 'lucide-react';

export default function GameHUD({
  title,
  lives = 3,
  maxLives = 3,
  score = 0,
  combo = 0,
  currentQuestion = 1,
  totalQuestions = 3,
  muted = false,
  onToggleMute,
  onExit,
  accentColor = '#8b5cf6'
}) {
  return (
    <div className="absolute top-0 left-0 right-0 p-2 sm:p-4 flex items-center justify-between z-30 pointer-events-none select-none" dir="rtl">
      {/* Right side: Lives & Game Title */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 pointer-events-auto">
        {/* Hearts Life Pill */}
        <div className="bg-black/65 backdrop-blur-md border border-white/15 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl sm:rounded-2xl flex items-center gap-1 sm:gap-1.5 shadow-lg">
          {Array.from({ length: maxLives }).map((_, i) => (
            <Heart
              key={i}
              size={15}
              className={`transition-all duration-300 sm:w-[18px] sm:h-[18px] ${
                i < lives
                  ? 'text-red-500 fill-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.7)] animate-pulse'
                  : 'text-white/20'
              }`}
            />
          ))}
        </div>

        {/* Title Badge (Visible on desktop / hidden on narrow mobile landscape to save room) */}
        <div className="hidden md:flex items-center gap-1.5 bg-black/65 backdrop-blur-md border border-white/15 px-3 py-1.5 rounded-2xl text-xs font-bold text-white shadow-lg">
          <span className="w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: accentColor }} />
          <span>{title}</span>
        </div>
      </div>

      {/* Center: Question Progress & Combo */}
      <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
        <div className="bg-black/65 backdrop-blur-md border border-white/15 px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-xl sm:rounded-2xl flex items-center gap-1.5 shadow-lg">
          <span className="text-[10px] sm:text-xs text-white/70 font-medium">التقدم:</span>
          <div className="flex items-center gap-1">
            <span className="text-xs sm:text-sm font-black text-amber-400">{currentQuestion}</span>
            <span className="text-[10px] sm:text-xs text-white/40">/</span>
            <span className="text-[10px] sm:text-xs font-bold text-white/60">{totalQuestions}</span>
          </div>
        </div>

        {combo > 1 && (
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black flex items-center gap-1 animate-bounce shadow-lg shadow-orange-500/40">
            <Zap size={12} className="fill-white" />
            <span>{combo}x!</span>
          </div>
        )}
      </div>

      {/* Left side: Score & Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
        {/* Score Pill */}
        <div className="bg-black/65 backdrop-blur-md border border-white/15 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl sm:rounded-2xl flex items-center gap-1 sm:gap-1.5 shadow-lg">
          <Trophy size={14} className="text-amber-400 sm:w-4 sm:h-4" />
          <span className="font-black text-xs sm:text-sm text-white font-mono">{score.toLocaleString('ar-EG')}</span>
        </div>

        {/* Sound Toggle */}
        <button
          type="button"
          onClick={onToggleMute}
          className="bg-black/65 hover:bg-white/20 active:scale-95 transition-all backdrop-blur-md border border-white/15 p-1.5 sm:p-2 rounded-xl text-white shadow-lg"
          title={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
        >
          {muted ? <VolumeX size={15} className="text-red-400 sm:w-4 sm:h-4" /> : <Volume2 size={15} className="text-emerald-400 sm:w-4 sm:h-4" />}
        </button>

        {/* Exit Game */}
        <button
          type="button"
          onClick={onExit}
          className="bg-red-500/20 hover:bg-red-500/40 border border-red-500/40 text-red-300 hover:text-white active:scale-90 transition-all p-1.5 sm:p-2 rounded-xl shadow-lg"
          title="خروج من اللعبة"
        >
          <X size={15} className="sm:w-4 sm:h-4" />
        </button>
      </div>
    </div>
  );
}
