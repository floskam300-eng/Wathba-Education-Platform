import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Eye, EyeOff, LogIn, Lock, User } from 'lucide-react';
import WathbaLogo from '../assets/wathba_logo.png';

const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  size: Math.random() * 3 + 1,
  x: Math.random() * 100,
  y: Math.random() * 100,
  delay: Math.random() * 6,
  duration: Math.random() * 8 + 10,
  opacity: Math.random() * 0.4 + 0.1,
}));

const ORBS = [
  { w: 420, h: 420, top: '-10%', left: '-8%', color: 'rgba(245,166,35,0.13)', blur: 90 },
  { w: 320, h: 320, top: '55%', right: '-6%', color: 'rgba(245,166,35,0.09)', blur: 80 },
  { w: 250, h: 250, top: '30%', left: '45%', color: 'rgba(99,102,241,0.07)', blur: 70 },
];

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(null);
  const { login } = useAuth();
  const navigate = useNavigate();
  const formRef = useRef(null);

  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'login-animations';
    style.textContent = `
      @keyframes floatUp {
        0%   { transform: translateY(0px) scale(1);   opacity: var(--op); }
        50%  { transform: translateY(-28px) scale(1.1); opacity: calc(var(--op) * 1.5); }
        100% { transform: translateY(0px) scale(1);   opacity: var(--op); }
      }
      @keyframes loginSlideIn {
        from { opacity: 0; transform: translateY(28px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes logoFloat {
        0%,100% { transform: translateY(0px); }
        50%      { transform: translateY(-6px); }
      }
      @keyframes shimmer {
        0%   { background-position: -200% center; }
        100% { background-position:  200% center; }
      }
      @keyframes spin360 {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }
      .login-card-anim { animation: loginSlideIn 0.7s cubic-bezier(.22,1,.36,1) both; }
      .logo-float      { animation: logoFloat 3.5s ease-in-out infinite; }
      .shimmer-text {
        background: linear-gradient(90deg, #F5A623 0%, #FCD577 40%, #F5A623 60%, #E8870A 100%);
        background-size: 200% auto;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        animation: shimmer 3s linear infinite;
      }
      .input-glow:focus-within {
        box-shadow: 0 0 0 2px rgba(245,166,35,0.35), 0 4px 20px rgba(245,166,35,0.12);
      }
      .btn-login {
        background: linear-gradient(135deg, #F5A623 0%, #E8870A 100%);
        transition: all 0.25s ease;
        box-shadow: 0 4px 20px rgba(245,166,35,0.35);
      }
      .btn-login:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 8px 28px rgba(245,166,35,0.5);
      }
      .btn-login:active:not(:disabled) {
        transform: translateY(0px);
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return toast.error('يرجى إدخال اسم المستخدم وكلمة المرور');
    setLoading(true);
    try {
      const user = await login(username.trim(), password);
      toast.success(`أهلاً بك، ${user.name}!`, { icon: '🎉' });
      navigate(`/${user.role}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'بيانات الدخول غير صحيحة');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(145deg, #0A0910 0%, #0F0E17 40%, #130E1A 70%, #0C0B14 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "'Cairo', sans-serif",
      }}
    >
      {ORBS.map((o, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: o.w,
            height: o.h,
            top: o.top,
            left: o.left,
            right: o.right,
            borderRadius: '50%',
            background: o.color,
            filter: `blur(${o.blur}px)`,
            pointerEvents: 'none',
          }}
        />
      ))}

      {PARTICLES.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            top: `${p.y}%`,
            left: `${p.x}%`,
            background: '#F5A623',
            '--op': p.opacity,
            opacity: p.opacity,
            animation: `floatUp ${p.duration}s ${p.delay}s ease-in-out infinite`,
            pointerEvents: 'none',
          }}
        />
      ))}

      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(245,166,35,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(245,166,35,0.03) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
          pointerEvents: 'none',
        }}
      />

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 10 }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            className="logo-float"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 88,
              height: 88,
              borderRadius: 24,
              background: 'linear-gradient(145deg, #1E1B2E, #272239)',
              border: '1px solid rgba(245,166,35,0.3)',
              boxShadow: '0 0 40px rgba(245,166,35,0.2), inset 0 1px 0 rgba(255,255,255,0.06)',
              marginBottom: '1rem',
              overflow: 'hidden',
              padding: 6,
            }}
          >
            <img src={WathbaLogo} alt="وثبة" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>

          <h1
            className="shimmer-text"
            style={{ fontSize: '2.5rem', fontWeight: 900, margin: 0, letterSpacing: '-0.5px' }}
          >
            وثبة
          </h1>
          <p style={{ color: 'rgba(196,184,172,0.7)', fontSize: '0.85rem', marginTop: '0.35rem', fontWeight: 500 }}>
            المنصة التعليمية المتكاملة
          </p>
        </div>

        <div
          className="login-card-anim"
          style={{
            background: 'linear-gradient(160deg, rgba(30,27,46,0.95) 0%, rgba(20,18,34,0.98) 100%)',
            borderRadius: 24,
            border: '1px solid rgba(245,166,35,0.18)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.05)',
            padding: '2.25rem 2rem',
            backdropFilter: 'blur(20px)',
          }}
        >
          <div style={{ marginBottom: '1.75rem', textAlign: 'center' }}>
            <h2 style={{ color: '#F2EDE5', fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
              تسجيل الدخول
            </h2>
            <p style={{ color: 'rgba(138,126,114,0.9)', fontSize: '0.8rem', marginTop: '0.3rem' }}>
              أدخل بياناتك للوصول إلى حسابك
            </p>
          </div>

          <form ref={formRef} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            <div>
              <label style={{ display: 'block', color: 'rgba(196,184,172,0.85)', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                اسم المستخدم
              </label>
              <div
                className="input-glow"
                style={{
                  position: 'relative',
                  borderRadius: 12,
                  border: focused === 'user'
                    ? '1.5px solid rgba(245,166,35,0.55)'
                    : '1.5px solid rgba(245,166,35,0.15)',
                  background: 'rgba(15,14,23,0.7)',
                  transition: 'border-color 0.2s',
                }}
              >
                <User
                  size={16}
                  style={{
                    position: 'absolute',
                    right: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: focused === 'user' ? '#F5A623' : 'rgba(138,126,114,0.7)',
                    transition: 'color 0.2s',
                  }}
                />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onFocus={() => setFocused('user')}
                  onBlur={() => setFocused(null)}
                  placeholder="أدخل اسم المستخدم"
                  dir="ltr"
                  autoComplete="username"
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    padding: '0.7rem 2.5rem 0.7rem 0.9rem',
                    color: '#F2EDE5',
                    fontSize: '0.9rem',
                    fontFamily: "'Cairo', sans-serif",
                    borderRadius: 12,
                    textAlign: 'left',
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', color: 'rgba(196,184,172,0.85)', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                كلمة المرور
              </label>
              <div
                className="input-glow"
                style={{
                  position: 'relative',
                  borderRadius: 12,
                  border: focused === 'pass'
                    ? '1.5px solid rgba(245,166,35,0.55)'
                    : '1.5px solid rgba(245,166,35,0.15)',
                  background: 'rgba(15,14,23,0.7)',
                  transition: 'border-color 0.2s',
                }}
              >
                <Lock
                  size={16}
                  style={{
                    position: 'absolute',
                    right: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: focused === 'pass' ? '#F5A623' : 'rgba(138,126,114,0.7)',
                    transition: 'color 0.2s',
                  }}
                />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocused('pass')}
                  onBlur={() => setFocused(null)}
                  placeholder="أدخل كلمة المرور"
                  dir="ltr"
                  autoComplete="current-password"
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    padding: '0.7rem 2.5rem 0.7rem 2.5rem',
                    color: '#F2EDE5',
                    fontSize: '0.9rem',
                    fontFamily: "'Cairo', sans-serif",
                    borderRadius: 12,
                    textAlign: 'left',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'rgba(138,126,114,0.7)',
                    padding: 2,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-login"
              style={{
                width: '100%',
                border: 'none',
                borderRadius: 12,
                padding: '0.85rem',
                color: '#fff',
                fontSize: '0.95rem',
                fontWeight: 700,
                fontFamily: "'Cairo', sans-serif",
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                marginTop: '0.25rem',
                opacity: loading ? 0.75 : 1,
              }}
            >
              {loading ? (
                <>
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      border: '2.5px solid rgba(255,255,255,0.35)',
                      borderTopColor: '#fff',
                      borderRadius: '50%',
                      animation: 'spin360 0.7s linear infinite',
                    }}
                  />
                  جاري التحقق...
                </>
              ) : (
                <>
                  <LogIn size={17} />
                  دخول
                </>
              )}
            </button>
          </form>

          <div
            style={{
              marginTop: '1.5rem',
              padding: '0.75rem 1rem',
              background: 'rgba(245,166,35,0.07)',
              border: '1px solid rgba(245,166,35,0.18)',
              borderRadius: 12,
              textAlign: 'center',
            }}
          >
            <p style={{ color: 'rgba(196,184,172,0.75)', fontSize: '0.75rem', margin: 0 }}>
              الحساب الافتراضي:{' '}
              <span style={{ fontFamily: 'monospace', color: '#F5A623', fontWeight: 700 }}>
                admin / admin123
              </span>
            </p>
          </div>
        </div>

        <p style={{ textAlign: 'center', color: 'rgba(138,126,114,0.5)', fontSize: '0.72rem', marginTop: '1.25rem' }}>
          وثبة © 2025 — منصة التعليم الإلكتروني
        </p>
      </div>
    </div>
  );
}
