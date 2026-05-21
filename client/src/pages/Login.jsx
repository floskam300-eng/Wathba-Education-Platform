import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTeacher } from '../context/TeacherContext';
import toast from 'react-hot-toast';
import {
  Eye, EyeOff, LogIn, Lock, User,
  BookOpen, Users, BarChart2, Award, Video, FileText,
} from 'lucide-react';
import WathbaLogo from '../assets/wathba_logo_new.png';

const FEATURES = [
  { icon: BookOpen,  title: 'كورسات تفاعلية',    desc: 'محتوى فيديو منظّم مع متابعة تقدم الطالب' },
  { icon: FileText,  title: 'امتحانات ذكية',      desc: 'بنك أسئلة متنوع مع تحليل فوري للنتائج' },
  { icon: BarChart2, title: 'تحليلات متقدمة',     desc: 'تقارير أداء تفصيلية للطلاب والمعلمين' },
  { icon: Award,     title: 'نقاط وشارات',        desc: 'نظام تحفيز يشجع الطلاب على التفوق' },
  { icon: Users,     title: 'إدارة شاملة',        desc: 'إدارة الطلاب والمساعدين والمدفوعات' },
  { icon: Video,     title: 'بث مباشر',           desc: 'حصص مباشرة تفاعلية مع الطلاب' },
];

const STATS = [
  { value: '١٠٠٠+', label: 'طالب مسجل' },
  { value: '٥٠+',   label: 'كورس متاح' },
  { value: '٩٨٪',   label: 'رضا الطلاب' },
];

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(null);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { teacherSlug } = useParams();
  const { platformName, logoUrl, isLoading: teacherLoading } = useTeacher();

  const displayLogo = logoUrl || WathbaLogo;
  const displayName = platformName || 'وثبة';

  useEffect(() => {
    const s = document.createElement('style');
    s.id = 'login-page-styles';
    s.textContent = `
      .lp-root {
        min-height: 100vh; display: flex; direction: rtl;
        font-family: 'Cairo', sans-serif; background: #080711;
      }
      .lp-left {
        position: relative; width: 52%; display: flex; flex-direction: column;
        justify-content: center; padding: 3rem 3.5rem; overflow: hidden;
        background: linear-gradient(155deg, #0E0B1A 0%, #130F22 50%, #0A0914 100%);
      }
      .lp-left::after {
        content: ''; position: absolute; inset: 0;
        background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23F5A623' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
        pointer-events: none;
      }
      .lp-orb1 { position: absolute; width: 500px; height: 500px; border-radius: 50%; background: radial-gradient(circle, rgba(245,166,35,0.12) 0%, transparent 70%); top: -120px; right: -100px; pointer-events: none; }
      .lp-orb2 { position: absolute; width: 380px; height: 380px; border-radius: 50%; background: radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%); bottom: -80px; left: -60px; pointer-events: none; }
      .lp-right { width: 48%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem 2.5rem; background: #0B0A14; position: relative; }
      .lp-right::before { content: ''; position: absolute; top: 0; right: 0; width: 1px; height: 100%; background: linear-gradient(to bottom, transparent 0%, rgba(245,166,35,0.25) 30%, rgba(245,166,35,0.25) 70%, transparent 100%); }
      .lp-logo { display: block; width: 200px; max-height: 100px; object-fit: contain; margin-bottom: 1.5rem; filter: drop-shadow(0 0 30px rgba(245,166,35,0.25)); animation: lp-logo-in 0.8s ease both; border-radius: 16px; }
      @keyframes lp-logo-in { from { opacity:0; transform:translateY(-16px); } to { opacity:1; transform:translateY(0); } }
      .lp-platform-name { font-size: 2.2rem; font-weight: 900; line-height: 1.2; margin-bottom: 0.5rem; background: linear-gradient(135deg, #F2EDE5 0%, #F5A623 60%, #FCD577 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
      .lp-tagline { font-size: 1.1rem; font-weight: 700; line-height: 1.4; margin-bottom: 0.5rem; color: rgba(196,184,172,0.75); }
      .lp-sub { color: rgba(196,184,172,0.6); font-size: 0.9rem; margin-bottom: 2.5rem; line-height: 1.6; max-width: 420px; }
      .lp-stats { display: flex; gap: 0; margin-bottom: 2.5rem; border: 1px solid rgba(245,166,35,0.15); border-radius: 16px; overflow: hidden; background: rgba(245,166,35,0.04); max-width: 420px; width: 100%; }
      .lp-stat { flex: 1; text-align: center; padding: 0.9rem 0.5rem; border-left: 1px solid rgba(245,166,35,0.12); }
      .lp-stat:last-child { border-left: none; }
      .lp-stat-val { display: block; font-size: 1.4rem; font-weight: 900; color: #F5A623; line-height: 1; margin-bottom: 0.25rem; }
      .lp-stat-lbl { font-size: 0.72rem; color: rgba(196,184,172,0.55); font-weight: 500; }
      .lp-features { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; max-width: 440px; width: 100%; }
      .lp-feature { display: flex; align-items: flex-start; gap: 0.65rem; padding: 0.9rem; background: rgba(255,255,255,0.025); border: 1px solid rgba(245,166,35,0.1); border-radius: 14px; transition: all 0.2s; cursor: default; }
      .lp-feature:hover { background: rgba(245,166,35,0.07); border-color: rgba(245,166,35,0.25); transform: translateY(-2px); }
      .lp-feature-icon { width: 34px; height: 34px; border-radius: 10px; background: rgba(245,166,35,0.12); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #F5A623; }
      .lp-feature-title { font-size: 0.82rem; font-weight: 700; color: #F2EDE5; margin-bottom: 0.15rem; }
      .lp-feature-desc { font-size: 0.72rem; color: rgba(138,126,114,0.85); line-height: 1.45; }
      .lp-form-card { width: 100%; max-width: 380px; animation: lp-form-in 0.7s 0.15s cubic-bezier(.22,1,.36,1) both; }
      @keyframes lp-form-in { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
      .lp-form-title { font-size: 1.5rem; font-weight: 900; color: #F2EDE5; margin-bottom: 0.3rem; text-align: center; }
      .lp-form-subtitle { font-size: 0.82rem; color: rgba(138,126,114,0.75); text-align: center; margin-bottom: 2rem; }
      .lp-field-label { display: block; font-size: 0.8rem; font-weight: 600; color: rgba(196,184,172,0.8); margin-bottom: 0.45rem; }
      .lp-input-wrap { position: relative; border-radius: 12px; border: 1.5px solid rgba(245,166,35,0.15); background: rgba(10,9,20,0.8); transition: border-color 0.2s, box-shadow 0.2s; margin-bottom: 1.1rem; }
      .lp-input-wrap.focused { border-color: rgba(245,166,35,0.55); box-shadow: 0 0 0 3px rgba(245,166,35,0.1); }
      .lp-input-icon { position: absolute; right: 13px; top: 50%; transform: translateY(-50%); color: rgba(138,126,114,0.6); transition: color 0.2s; pointer-events: none; }
      .lp-input-wrap.focused .lp-input-icon { color: #F5A623; }
      .lp-input { width: 100%; background: transparent; border: none; outline: none; padding: 0.72rem 2.4rem 0.72rem 0.9rem; color: #F2EDE5; font-size: 0.9rem; font-family: 'Cairo', sans-serif; border-radius: 12px; direction: ltr; text-align: left; }
      .lp-input::placeholder { color: rgba(138,126,114,0.5); }
      .lp-eye-btn { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: rgba(138,126,114,0.6); display: flex; align-items: center; padding: 3px; transition: color 0.2s; }
      .lp-eye-btn:hover { color: #F5A623; }
      .lp-submit { width: 100%; border: none; border-radius: 12px; padding: 0.85rem; font-size: 0.95rem; font-weight: 700; font-family: 'Cairo', sans-serif; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem; background: linear-gradient(135deg, #F5A623 0%, #E07B0A 100%); color: #fff; box-shadow: 0 4px 20px rgba(245,166,35,0.35); transition: all 0.25s; margin-bottom: 1.25rem; }
      .lp-submit:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(245,166,35,0.5); }
      .lp-submit:active:not(:disabled) { transform: translateY(0); }
      .lp-submit:disabled { opacity: 0.65; cursor: not-allowed; }
      .lp-hint { padding: 0.7rem 1rem; background: rgba(245,166,35,0.07); border: 1px solid rgba(245,166,35,0.18); border-radius: 10px; text-align: center; font-size: 0.75rem; color: rgba(196,184,172,0.7); }
      .lp-hint span { font-family: monospace; color: #F5A623; font-weight: 700; }
      @keyframes lp-spin { to { transform: rotate(360deg); } }
      .lp-spinner { width: 18px; height: 18px; border: 2.5px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: lp-spin 0.7s linear infinite; }
      .lp-divider { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem; }
      .lp-divider-line { flex: 1; height: 1px; background: rgba(245,166,35,0.12); }
      .lp-divider-text { font-size: 0.72rem; color: rgba(138,126,114,0.5); white-space: nowrap; }
      .lp-right-logo { display: none; width: 130px; max-height: 65px; object-fit: contain; margin-bottom: 1.5rem; filter: drop-shadow(0 0 20px rgba(245,166,35,0.2)); border-radius: 12px; }
      .lp-footer { position: absolute; bottom: 1.25rem; font-size: 0.7rem; color: rgba(138,126,114,0.35); text-align: center; width: 100%; }
      @media (max-width: 900px) {
        .lp-left  { display: none; }
        .lp-right { width: 100%; padding: 2rem 1.5rem; }
        .lp-right::before { display: none; }
        .lp-right-logo { display: block; }
      }
    `;
    document.head.appendChild(s);
    return () => { const el = document.getElementById('login-page-styles'); if (el) el.remove(); };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return toast.error('يرجى إدخال اسم المستخدم وكلمة المرور');
    setLoading(true);
    try {
      const user = await login(username.trim(), password, undefined, teacherSlug);
      toast.success(`أهلاً بك، ${user.name}!`, { icon: '🎉' });
      const slug = user.teacher_slug || teacherSlug;
      navigate(`/${slug}/${user.role}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'بيانات الدخول غير صحيحة');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lp-root">
      {/* ═══ LEFT PANEL ═══ */}
      <div className="lp-left">
        <div className="lp-orb1" />
        <div className="lp-orb2" />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <img src={displayLogo} alt={displayName} className="lp-logo" />

          <h1 className="lp-platform-name">{displayName}</h1>
          <p className="lp-tagline">قفزة نحو التميّز التعليمي</p>
          <p className="lp-sub">
            منصة تعليمية متكاملة تجمع المعلمين والطلاب في تجربة احترافية
            تشمل الكورسات والامتحانات والتحليلات والتواصل المباشر.
          </p>

          <div className="lp-stats">
            {STATS.map((s) => (
              <div key={s.label} className="lp-stat">
                <span className="lp-stat-val">{s.value}</span>
                <span className="lp-stat-lbl">{s.label}</span>
              </div>
            ))}
          </div>

          <div className="lp-features">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="lp-feature">
                <div className="lp-feature-icon"><Icon size={16} /></div>
                <div>
                  <div className="lp-feature-title">{title}</div>
                  <div className="lp-feature-desc">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ RIGHT PANEL ═══ */}
      <div className="lp-right">
        <img src={displayLogo} alt={displayName} className="lp-right-logo" />

        <div className="lp-form-card">
          <h2 className="lp-form-title">مرحباً بك 👋</h2>
          <p className="lp-form-subtitle">سجّل دخولك للوصول إلى {displayName}</p>

          <div className="lp-divider">
            <div className="lp-divider-line" />
            <span className="lp-divider-text">تسجيل الدخول</span>
            <div className="lp-divider-line" />
          </div>

          <form onSubmit={handleSubmit}>
            <label className="lp-field-label">اسم المستخدم</label>
            <div className={`lp-input-wrap ${focused === 'user' ? 'focused' : ''}`}>
              <User size={16} className="lp-input-icon" />
              <input
                className="lp-input"
                type="text"
                placeholder="أدخل اسم المستخدم"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onFocus={() => setFocused('user')}
                onBlur={() => setFocused(null)}
                autoComplete="username"
              />
            </div>

            <label className="lp-field-label">كلمة المرور</label>
            <div className={`lp-input-wrap ${focused === 'pass' ? 'focused' : ''}`}>
              <Lock size={16} className="lp-input-icon" />
              <input
                className="lp-input"
                type={showPass ? 'text' : 'password'}
                placeholder="أدخل كلمة المرور"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocused('pass')}
                onBlur={() => setFocused(null)}
                autoComplete="current-password"
                style={{ paddingLeft: '2.4rem' }}
              />
              <button type="button" className="lp-eye-btn" onClick={() => setShowPass(!showPass)} tabIndex={-1}>
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            <button type="submit" disabled={loading || teacherLoading} className="lp-submit">
              {loading ? (
                <><div className="lp-spinner" /> جاري التحقق...</>
              ) : (
                <><LogIn size={17} /> دخول</>
              )}
            </button>
          </form>

          {teacherSlug === 'admin' && (
            <div className="lp-hint">
              الحساب الافتراضي:&nbsp;<span>admin / admin123</span>
            </div>
          )}
        </div>

        <div className="lp-footer">{displayName} © {new Date().getFullYear()} — منصة التعليم الإلكتروني</div>
      </div>
    </div>
  );
}
