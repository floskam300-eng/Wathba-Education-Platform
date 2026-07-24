import React, { useEffect, useState } from 'react';
import { Download, X, Smartphone, Share, MoreVertical } from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true // iOS Safari
  );
}

function isIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !window.MSStream
  );
}

function isSafari() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

// ── iOS instruction sheet ─────────────────────────────────────────────────────
function IOSSheet({ logoUrl, platformName, onDismiss }) {
  return (
    <div
      dir="rtl"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        fontFamily: "'Cairo', sans-serif",
        padding: '0 12px',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
        paddingTop: 10,
        background: 'linear-gradient(to top, rgba(10,8,18,0.98) 0%, rgba(10,8,18,0) 100%)',
      }}
    >
      <div style={{
        maxWidth: 480,
        margin: '0 auto',
        background: 'linear-gradient(135deg, #1a1030 0%, #0f0e20 100%)',
        border: '1px solid rgba(249,115,22,0.4)',
        borderRadius: 20,
        padding: '16px 16px 14px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(249,115,22,0.15)',
        animation: 'slideUpBanner 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
      }}>
        <style>{`
          @keyframes slideUpBanner {
            from { opacity: 0; transform: translateY(20px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg, #f97316, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {logoUrl
              ? <img src={logoUrl} alt={platformName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <Smartphone size={18} color="#fff" />
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: '#fff', fontWeight: 900, fontSize: 13, margin: 0 }}>
              ثبّت تطبيق {platformName} 📲
            </p>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, margin: '2px 0 0' }}>
              أضفه للشاشة الرئيسية عشان تفتحه زي أي تطبيق
            </p>
          </div>
          <button
            onClick={onDismiss}
            style={{
              flexShrink: 0, width: 28, height: 28, borderRadius: '50%', border: 'none',
              background: 'rgba(255,255,255,0.08)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(255,255,255,0.5)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <X size={13} />
          </button>
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { n: 1, icon: '⬆️', text: 'اضغط على زر المشاركة في شريط المتصفح' },
            { n: 2, icon: '➕', text: 'اختر "أضف إلى الشاشة الرئيسية"' },
            { n: 3, icon: '✅', text: 'اضغط "إضافة" وافتح التطبيق!' },
          ].map(({ n, icon, text }) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(249,115,22,0.2)', border: '1px solid rgba(249,115,22,0.4)',
                color: '#f97316', fontSize: 11, fontWeight: 900,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{n}</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>
                {icon} {text}
              </span>
            </div>
          ))}
        </div>

        {/* Arrow hint pointing down toward browser bar on iOS */}
        <p style={{ textAlign: 'center', color: 'rgba(249,115,22,0.6)', fontSize: 20, margin: '10px 0 0', lineHeight: 1 }}>
          ↓
        </p>
      </div>
    </div>
  );
}

// ── Generic "install from browser menu" banner ────────────────────────────────
function GenericBanner({ logoUrl, platformName, onDismiss }) {
  return (
    <div
      dir="rtl"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        fontFamily: "'Cairo', sans-serif",
        padding: '0 16px',
        paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
        paddingTop: 12,
        background: 'linear-gradient(to top, rgba(10,8,18,0.98) 0%, rgba(10,8,18,0) 100%)',
      }}
    >
      <style>{`
        @keyframes slideUpBanner {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{
        maxWidth: 480,
        margin: '0 auto',
        background: 'linear-gradient(135deg, #1a1030 0%, #0f0e20 100%)',
        border: '1px solid rgba(249,115,22,0.4)',
        borderRadius: 16,
        padding: '12px 14px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', gap: 10,
        animation: 'slideUpBanner 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 11, flexShrink: 0,
          background: 'linear-gradient(135deg, #f97316, #7c3aed)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
        }}>
          {logoUrl
            ? <img src={logoUrl} alt={platformName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <Smartphone size={20} color="#fff" />
          }
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: '#fff', fontWeight: 900, fontSize: 13, margin: 0, lineHeight: 1.3 }}>
            ثبّت تطبيق {platformName}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, margin: '1px 0 0', lineHeight: 1.4 }}>
            من قائمة المتصفح ⋮ اختر "تثبيت التطبيق" أو "أضف للشاشة الرئيسية"
          </p>
        </div>

        <button
          onClick={onDismiss}
          style={{
            flexShrink: 0, width: 30, height: 30, borderRadius: '50%', border: 'none',
            background: 'rgba(255,255,255,0.08)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.5)',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Native Chrome/Android banner ──────────────────────────────────────────────
function NativeBanner({ prompt, logoUrl, platformName, onInstalled, onDismiss }) {
  const [loading, setLoading] = useState(false);

  const handleInstall = async () => {
    if (!prompt) return;
    setLoading(true);
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    setLoading(false);
    if (outcome === 'accepted') onInstalled();
    else onDismiss(); // they declined → treat as dismissed for this session
  };

  return (
    <div
      dir="rtl"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        fontFamily: "'Cairo', sans-serif",
        padding: '0 16px',
        paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
        paddingTop: 12,
        background: 'linear-gradient(to top, rgba(10,8,18,0.98) 0%, rgba(10,8,18,0) 100%)',
      }}
    >
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
      <div style={{
        maxWidth: 480,
        margin: '0 auto',
        background: 'linear-gradient(135deg, #1a1030 0%, #0f0e20 100%)',
        border: '1px solid rgba(249,115,22,0.4)',
        borderRadius: 16,
        padding: '12px 14px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(249,115,22,0.15)',
        display: 'flex', alignItems: 'center', gap: 10,
        animation: 'slideUpBanner 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 11, flexShrink: 0,
          background: 'linear-gradient(135deg, #f97316, #7c3aed)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
          boxShadow: '0 4px 16px rgba(249,115,22,0.4)',
        }}>
          {logoUrl
            ? <img src={logoUrl} alt={platformName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <Smartphone size={20} color="#fff" />
          }
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: '#fff', fontWeight: 900, fontSize: 13, margin: 0, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            ثبّت تطبيق {platformName}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, margin: '1px 0 0', lineHeight: 1.3 }}>
            أسرع وأسهل — يشتغل بدون إنترنت
          </p>
        </div>

        <button
          onClick={handleInstall}
          disabled={loading}
          style={{
            flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '8px 12px', borderRadius: 10, border: 'none',
            cursor: loading ? 'default' : 'pointer',
            fontFamily: 'inherit', fontWeight: 800, fontSize: 12,
            color: '#fff',
            background: 'linear-gradient(90deg, #f97316 0%, #ea580c 50%, #f97316 100%)',
            backgroundSize: '200% 100%',
            animation: loading ? 'none' : 'shimmerInstall 2.5s linear infinite',
            boxShadow: '0 4px 14px rgba(249,115,22,0.45)',
            WebkitTapHighlightColor: 'transparent',
            touchAction: 'manipulation',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading
            ? <span style={{ width: 13, height: 13, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
            : <Download size={13} />
          }
          تثبيت
        </button>

        <button
          onClick={onDismiss}
          style={{
            flexShrink: 0, width: 30, height: 30, borderRadius: '50%', border: 'none',
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
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PWAInstallBanner({ logoUrl = null, platformName = 'وثبة' }) {
  const [nativePrompt, setNativePrompt] = useState(null); // beforeinstallprompt event
  const [mode, setMode]                 = useState(null);  // 'native' | 'ios' | 'generic' | null
  const [installed, setInstalled]       = useState(false);
  const [dismissed, setDismissed]       = useState(
    () => sessionStorage.getItem('pwa_banner_dismissed') === '1'
  );

  useEffect(() => {
    // Already running as installed PWA → hide everything
    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    // Listen for the native Chrome/Android install event
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setNativePrompt(e);
      setMode('native');
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // Listen for successful installation via any path
    const onInstalled = () => {
      setInstalled(true);
      setMode(null);
    };
    window.addEventListener('appinstalled', onInstalled);

    // Determine fallback mode for browsers that never fire beforeinstallprompt
    // We use a short timeout so Chrome has a chance to fire the event first.
    const t = setTimeout(() => {
      setMode(prev => {
        if (prev === 'native') return prev; // already got the event
        if (isIOS() && isSafari()) return 'ios';
        return 'generic';
      });
    }, 2000);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      clearTimeout(t);
    };
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('pwa_banner_dismissed', '1');
  };

  const handleInstalled = () => {
    setInstalled(true);
    setMode(null);
  };

  if (installed || dismissed || !mode) return null;

  if (mode === 'native') {
    return (
      <NativeBanner
        prompt={nativePrompt}
        logoUrl={logoUrl}
        platformName={platformName}
        onInstalled={handleInstalled}
        onDismiss={handleDismiss}
      />
    );
  }

  if (mode === 'ios') {
    return (
      <IOSSheet
        logoUrl={logoUrl}
        platformName={platformName}
        onDismiss={handleDismiss}
      />
    );
  }

  // 'generic'
  return (
    <GenericBanner
      logoUrl={logoUrl}
      platformName={platformName}
      onDismiss={handleDismiss}
    />
  );
}
