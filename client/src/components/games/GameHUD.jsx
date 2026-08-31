import React from 'react';
import { Volume2, VolumeX, Heart, Trophy, X, Zap } from 'lucide-react';
import gameAudio from '../../lib/gameAudio';

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
    <div className="absolute top-0 left-0 right-0 p-3 sm:p-4 flex items-center justify-between z-30 pointer-events-none select-none" dir="rtl">
      {/* Right side: Lives & Title */}
      <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto">
        <div className="bg-black/60 backdrop-blur-md border border-white/15 px-3 py-1.5 rounded-2xl flex items-center gap-1.5 shadow-lg">
          {Array.from({ length: maxLives }).map((_, i) => (
            <Heart
              key={i}
              size={18}
              className={`transition-all duration-300 ${
                i < lives
                  ? 'text-red-500 fill-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.7)] animate-pulse'
                  : 'text-white/20'
              }`}
            />
          ))}
        </div>

        <div className="hidden sm:flex items-center gap-1.5 bg-black/60 backdrop-blur-md border border-white/15 px-3 py-1.5 rounded-2xl text-xs font-bold text-white shadow-lg">
          <span className="w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: accentColor }} />
          <span>{title}</span>
        </div>
      </div>

      {/* Center: Question Progress & Combo */}
      <div className="flex items-center gap-2 pointer-events-auto">
        <div className="bg-black/60 backdrop-blur-md border border-white/15 px-3.5 py-1.5 rounded-2xl flex items-center gap-2 shadow-lg">
          <div className="text-xs text-white/70 font-medium">التقدم:</div>
          <div className="flex items-center gap-1">
            <span className="text-sm font-black text-amber-400">{currentQuestion}</span>
            <span className="text-xs text-white/40">/</span>
            <span className="text-xs font-bold text-white/60">{totalQuestions}</span>
          </div>
        </div>

        {combo > 1 && (
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-2.5 py-1 rounded-xl text-xs font-black flex items-center gap-1 animate-bounce shadow-lg shadow-orange-500/40">
            <Zap size={13} className="fill-white" />
            <span>{combo}x Combo!</span>
          </div>
        )}
      </div>

      {/* Left side: Score & Controls */}
      <div className="flex items-center gap-2 pointer-events-auto">
        <div className="bg-black/60 backdrop-blur-md border border-white/15 px-3 py-1.5 rounded-2xl flex items-center gap-1.5 shadow-lg">
          <Trophy size={16} className="text-amber-400" />
          <span className="font-black text-sm text-white font-mono">{score.toLocaleString('ar-EG')}</span>
        </div>

        <button
          type="button"
          onClick={onToggleMute}
          className="bg-black/60 hover:bg-white/20 active:scale-95 transition-all backdrop-blur-md border border-white/15 p-2 rounded-xl text-white shadow-lg"
          title={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
        >
          {muted ? <VolumeX size={17} className="text-red-400" /> : <Volume2 size={17} className="text-emerald-400" />}
        </button>

        <button
          type="button"
          onClick={onExit}
          className="bg-red-500/20 hover:bg-red-500/40 border border-red-500/40 text-red-300 hover:text-white active:scale-95 transition-all p-2 rounded-xl shadow-lg"
          title="خروج من اللعبة"
        >
          <X size={17} />
        </button>
      </div>
    </div>
  );
}
