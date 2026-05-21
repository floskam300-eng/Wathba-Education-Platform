import React, { useEffect, useState } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

export default function PWAInstallBanner({ logoUrl = null, platformName = 'وثبة' }) {
  const [prompt, setPrompt]       = useState(null);
  const [visible, setVisible]     = useState(false);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem('pwa_banner_dismissed') === '1'
  );

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      setPrompt(e);
      if (!sessionStorage.getItem('pwa_banner_dismissed')) {
        setTimeout(() => setVisible(true), 3000);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setVisible(false);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
      setInstalled(true);
    }
    setPrompt(null);
  };

  const handleDismiss = () => {
    setVisible(false);
    setDismissed(true);
    sessionStorage.setItem('pwa_banner_dismissed', '1');
  };

  if (installed || dismissed || !visible || !prompt) return null;

  return (
    <>
      <style>{`
        @keyframes slideUpBanner {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmerInstall {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
      `}</style>

      <div
        dir="rtl"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 99999,
          animation: 'slideUpBanner 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
          fontFamily: "'Cairo', sans-serif",
          padding: '0 16px',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
          paddingTop: 12,
          background: 'linear-gradient(to top, rgba(10,8,18,0.98) 0%, rgba(10,8,18,0) 100%)',
        }}
      >
        <div style={{
          maxWidth: 480,
          margin: '0 auto',
          background: 'linear-gradient(135deg, #1a1030 0%, #0f0e20 100%)',
          border: '1px solid rgba(249,115,22,0.4)',
          borderRadius: 16,
          padding: '12px 14px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(249,115,22,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'nowrap',
        }}>
          {/* Icon */}
          <div style={{
            width: 40, height: 40, borderRadius: 11, flexShrink: 0,
            background: 'linear-gradient(135deg, #f97316, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(249,115,22,0.4)',
            overflow: 'hidden',
          }}>
            {logoUrl ? (
              <img src={logoUrl} alt={platformName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Smartphone size={20} color="#fff" />
            )}
          </div>

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: '#fff', fontWeight: 900, fontSize: 13, margin: 0, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              ثبّت تطبيق {platformName}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, margin: '1px 0 0', lineHeight: 1.3 }}>
              أسرع وأسهل — يشتغل بدون إنترنت
            </p>
          </div>

          {/* Install button */}
          <button
            onClick={handleInstall}
            style={{
              flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '8px 12px', borderRadius: 10, border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: 12,
              color: '#fff',
              background: 'linear-gradient(90deg, #f97316 0%, #ea580c 50%, #f97316 100%)',
              backgroundSize: '200% 100%',
              animation: 'shimmerInstall 2.5s linear infinite',
              boxShadow: '0 4px 14px rgba(249,115,22,0.45)',
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation',
            }}
          >
            <Download size={13} />
            تثبيت
          </button>

          {/* Dismiss */}
          <button
            onClick={handleDismiss}
            style={{
              flexShrink: 0,
              width: 30, height: 30, borderRadius: '50%', border: 'none',
              background: 'rgba(255,255,255,0.08)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(255,255,255,0.5)',
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation',
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </>
  );
}
