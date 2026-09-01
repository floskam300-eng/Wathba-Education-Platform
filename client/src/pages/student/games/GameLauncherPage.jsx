import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import StickmanRun from './StickmanRun';
import SpaceDefender from './SpaceDefender';
import TowerOfRiddles from './TowerOfRiddles';
import BubblePopBlitz from './BubblePopBlitz';
import { Smartphone, RotateCw, Play, Maximize2 } from 'lucide-react';

export default function GameLauncherPage() {
  const { gameId } = useParams();
  const navigate = useNavigate();

  const [isPortraitMobile, setIsPortraitMobile] = useState(false);
  const [dismissRotatePrompt, setDismissRotatePrompt] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      const isMobile = window.innerWidth < 850 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isPortrait = window.innerHeight > window.innerWidth;
      setIsPortraitMobile(isMobile && isPortrait);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  const handleRequestLandscape = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if (document.documentElement.webkitRequestFullscreen) {
        await document.documentElement.webkitRequestFullscreen();
      }
      if (window.screen.orientation && window.screen.orientation.lock) {
        await window.screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (_) {}
    setDismissRotatePrompt(true);
  };

  const handleClose = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    navigate('/student/events', { replace: true });
  };

  const normalized = (gameId || '').replace(/-/g, '_');

  const renderGame = () => {
    switch (normalized) {
      case 'stickman_run':
      case 'weekly_run':
        return <StickmanRun onClose={handleClose} />;
      case 'space_blaster':
      case 'space_defender':
        return <SpaceDefender onClose={handleClose} />;
      case 'tower_of_riddles':
      case 'riddle_tower':
        return <TowerOfRiddles onClose={handleClose} />;
      case 'bubble_blitz':
      case 'bubble_pop':
        return <BubblePopBlitz onClose={handleClose} />;
      default:
        return <StickmanRun onClose={handleClose} />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center overflow-hidden touch-none select-none">
      {/* ── ROTATE DEVICE PROMPT FOR MOBILE PORTRAIT ── */}
      {isPortraitMobile && !dismissRotatePrompt && (
        <div className="absolute inset-0 z-[60] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center text-white select-none animate-fadeIn" dir="rtl">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-400 p-0.5 shadow-[0_0_50px_rgba(139,92,246,0.5)] mb-6 animate-bounce">
            <div className="w-full h-full bg-[#10072b] rounded-[22px] flex items-center justify-center text-4xl">
              <RotateCw className="w-12 h-12 text-cyan-400 animate-spin" style={{ animationDuration: '4s' }} />
            </div>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black mb-2 bg-gradient-to-r from-purple-200 via-white to-cyan-200 bg-clip-text text-transparent">
            قم بتدوير هاتفك للوضع الأفقي 🔄
          </h2>
          <p className="text-sm text-purple-200/70 max-w-xs mb-8 leading-relaxed font-medium">
            للحصول على تجربة لعب ممتعة بملء الشاشة وتحكم كامل بأصابع يدك اليمنى واليسرى! 🎮
          </p>

          <div className="flex flex-col gap-3 w-full max-w-xs">
            <button
              type="button"
              onClick={handleRequestLandscape}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:brightness-110 active:scale-95 text-white font-black text-base shadow-xl shadow-purple-600/40 flex items-center justify-center gap-2 border border-purple-300/40 cursor-pointer"
            >
              <Maximize2 size={20} />
              <span>تدوير وملء الشاشة 📱</span>
            </button>

            <button
              type="button"
              onClick={() => setDismissRotatePrompt(true)}
              className="w-full py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 text-white/70 font-bold text-xs border border-white/10"
            >
              المتابعة بالوضع الرأسي الحالي
            </button>
          </div>
        </div>
      )}

      {/* Render Active Game */}
      {renderGame()}
    </div>
  );
}
