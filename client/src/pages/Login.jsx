import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTeacher } from '../context/TeacherContext';
import toast from 'react-hot-toast';
import {
  Eye, EyeOff, LogIn, Lock, User,
  BookOpen, BarChart2, Award, Video, Target, Users, Sparkles,
} from 'lucide-react';
import WathbaLogo from '../assets/wathba_logo_new.png';

const FEATURES = [
  { icon: BookOpen,  title: 'كورسات تفاعلية',  desc: 'فيديوهات وملفات PDF منظّمة' },
  { icon: Target,    title: 'امتحانات ذكية',    desc: 'تحليل فوري للنتائج' },
  { icon: BarChart2, title: 'تحليلات متقدمة',   desc: 'تقارير أداء تفصيلية' },
  { icon: Award,     title: 'نقاط وشارات',      desc: 'نظام تحفيز للتفوق' },
  { icon: Users,     title: 'إدارة شاملة',      desc: 'طلاب ومساعدين ومدفوعات' },
  { icon: Video,     title: 'بث مباشر',         desc: 'حصص تفاعلية أونلاين' },
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
    <div dir="rtl" style={{
      minHeight: '100vh',
      display: 'flex',
      fontFamily: "'Cairo', sans-serif",
      background: '#080711',
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes lg-float { 0%{transform:translateY(0) rotate(0deg)} 100%{transform:translateY(-22px) rotate(3deg)} }
        @keyframes lg-spin { to{transform:rotate(360deg)} }
        @keyframes lg-fade-up { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes lg-pulse { 0%,100%{opacity:.3} 50%{opacity:.6} }
        .lg-orb { position:absolute; border-radius:50%; filter:blur(90px); pointer-events:none; }
        .lg-ring { position:absolute; border-radius:50%; border:1px solid; pointer-events:none; }
        .lg-float-anim { animation: lg-float 7s ease-in-out infinite alternate; }
        .lg-fade-1 { animation: lg-fade-up .7s ease .05s both; }
        .lg-fade-2 { animation: lg-fade-up .7s ease .15s both; }
        .lg-fade-3 { animation: lg-fade-up .7s ease .25s both; }
        .lg-fade-4 { animation: lg-fade-up .7s ease .4s both; }
        .lg-spinner { width:18px; height:18px; border:2px solid rgba(255,255,255,.3); border-top-color:#fff; border-radius:50%; animation:lg-spin .7s linear infinite; }
        .lg-input:focus { outline:none; }
        .lg-btn:hover:not(:disabled) { transform:translateY(-2px); }
        .lg-btn:active:not(:disabled) { transform:translateY(0); }
        .lg-feature { transition: all .2s; }
        .lg-feature:hover { background:rgba(249,115,22,.08); border-color:rgba(249,115,22,.3); transform:translateY(-2px); }
        @media (max-width: 860px) {
          .lg-left { display: none !important; }
          .lg-right { width: 100% !important; }
        }
      `}</style>

      {/* ═══ LEFT PANEL ═══ */}
      <div className="lg-left" style={{
        width: '58%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '3rem 3.5rem',
        overflow: 'hidden',
        background: 'linear-gradient(145deg, #0D0B1A 0%, #13102A 40%, #0A0918 100%)',
      }}>
        {/* Orbs */}
        <div className="lg-orb" style={{ width:600, height:600, top:-200, right:-100, background:'radial-gradient(circle,rgba(249,115,22,.18),transparent 70%)' }} />
        <div className="lg-orb" style={{ width:500, height:500, bottom:-150, left:-80, background:'radial-gradient(circle,rgba(124,58,237,.14),transparent 70%)' }} />
        <div className="lg-orb" style={{ width:300, height:300, top:'40%', left:'30%', background:'radial-gradient(circle,rgba(249,115,22,.06),transparent 70%)', animation:'lg-pulse 5s ease-in-out infinite' }} />

        {/* Rings */}
        <div className="lg-ring" style={{ width:500, height:500, top:'50%', left:'50%', transform:'translate(-50%,-50%)', borderColor:'rgba(249,115,22,.06)' }} />
        <div className="lg-ring" style={{ width:700, height:700, top:'50%', left:'50%', transform:'translate(-50%,-50%)', borderColor:'rgba(255,255,255,.03)' }} />

        <div style={{ position:'relative', zIndex:1, maxWidth:520 }}>
          {/* Logo + Name */}
          <div className="lg-fade-1" style={{ display:'flex', alignItems:'center', gap:'1rem', marginBottom:'2.5rem' }}>
            <div style={{ width:60, height:60, borderRadius:16, overflow:'hidden', boxShadow:'0 0 28px rgba(249,115,22,.35)', border:'1px solid rgba(249,115,22,.25)', flexShrink:0 }}>
              <img src={displayLogo} alt={displayName} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
            </div>
            <div>
              <div style={{ fontSize:'1.75rem', fontWeight:900, lineHeight:1.1, background:'linear-gradient(135deg,#fff 0%,#f97316 55%,#fb923c 100%)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>
                {displayName}
              </div>
              <div style={{ fontSize:'.8rem', color:'rgba(249,115,22,.7)', fontWeight:600, marginTop:2 }}>
                المنصة التعليمية المتكاملة
              </div>
            </div>
          </div>

          {/* Headline */}
          <div className="lg-fade-2" style={{ marginBottom:'2rem' }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:6, background:'rgba(249,115,22,.1)', border:'1px solid rgba(249,115,22,.2)', color:'#fb923c', fontSize:'.72rem', fontWeight:700, padding:'5px 14px', borderRadius:99, marginBottom:'1rem', letterSpacing:'.05em', textTransform:'uppercase' }}>
              <Sparkles size={12} />
              تسجيل دخول آمن
            </div>
            <h1 style={{ fontSize:'clamp(1.7rem,2.8vw,2.5rem)', fontWeight:900, color:'#fff', lineHeight:1.25, marginBottom:'.6rem' }}>
              مرحباً بك في<br />
              <span style={{ color:'#f97316' }}>{displayName}</span>
            </h1>
            <p style={{ color:'rgba(255,255,255,.45)', fontSize:'.9rem', lineHeight:1.65 }}>
              اكسب المعرفة، تتبع تقدمك، وحقق التفوق من خلال منصة تعليمية احترافية.
            </p>
          </div>

          {/* Features grid */}
          <div className="lg-fade-3" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.6rem' }}>
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="lg-feature" style={{
                display:'flex', alignItems:'center', gap:'.7rem',
                padding:'.75rem .9rem',
                background:'rgba(255,255,255,.03)',
                border:'1px solid rgba(255,255,255,.07)',
                borderRadius:14,
              }}>
                <div style={{ width:34, height:34, borderRadius:10, background:'rgba(249,115,22,.12)', border:'1px solid rgba(249,115,22,.2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Icon size={15} color="#f97316" />
                </div>
                <div>
                  <div style={{ fontSize:'.78rem', fontWeight:700, color:'rgba(255,255,255,.85)', lineHeight:1.2 }}>{title}</div>
                  <div style={{ fontSize:'.68rem', color:'rgba(255,255,255,.35)', marginTop:2 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ RIGHT PANEL ═══ */}
      <div className="lg-right" style={{
        width: '42%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2.5rem 2rem',
        background: '#0B0A15',
        position: 'relative',
        borderRight: '1px solid rgba(249,115,22,.1)',
      }}>
        {/* subtle right-side orb */}
        <div className="lg-orb" style={{ width:400, height:400, bottom:-100, right:-80, background:'radial-gradient(circle,rgba(124,58,237,.1),transparent 70%)', pointerEvents:'none' }} />

        <div className="lg-fade-4" style={{ width:'100%', maxWidth:360, position:'relative', zIndex:1 }}>
          {/* Mobile-only logo */}
          <div style={{ display:'none', textAlign:'center', marginBottom:'1.75rem' }} className="lg-mobile-logo">
            <div style={{ width:72, height:72, borderRadius:18, overflow:'hidden', margin:'0 auto 0.75rem', boxShadow:'0 0 24px rgba(249,115,22,.3)' }}>
              <img src={displayLogo} alt={displayName} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            </div>
            <div style={{ fontSize:'1.5rem', fontWeight:900, color:'#fff' }}>{displayName}</div>
          </div>

          {/* Form header */}
          <div style={{ textAlign:'center', marginBottom:'2rem' }}>
            <div style={{ width:52, height:52, borderRadius:14, background:'linear-gradient(135deg,rgba(249,115,22,.2),rgba(249,115,22,.08))', border:'1px solid rgba(249,115,22,.25)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1rem' }}>
              <LogIn size={22} color="#f97316" />
            </div>
            <h2 style={{ fontSize:'1.45rem', fontWeight:900, color:'#fff', marginBottom:'.3rem' }}>تسجيل الدخول</h2>
            <p style={{ fontSize:'.82rem', color:'rgba(255,255,255,.35)' }}>أدخل بياناتك للوصول إلى حسابك</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            {/* Username */}
            <div style={{ marginBottom:'1.1rem' }}>
              <label style={{ display:'block', fontSize:'.8rem', fontWeight:600, color:'rgba(255,255,255,.55)', marginBottom:'.45rem' }}>
                اسم المستخدم
              </label>
              <div style={{
                position:'relative',
                borderRadius:12,
                border: `1.5px solid ${focused==='user' ? 'rgba(249,115,22,.6)' : 'rgba(255,255,255,.1)'}`,
                background: focused==='user' ? 'rgba(249,115,22,.06)' : 'rgba(255,255,255,.04)',
                boxShadow: focused==='user' ? '0 0 0 3px rgba(249,115,22,.1)' : 'none',
                transition:'all .2s',
              }}>
                <User size={15} style={{ position:'absolute', right:13, top:'50%', transform:'translateY(-50%)', color: focused==='user' ? '#f97316' : 'rgba(255,255,255,.3)', pointerEvents:'none', transition:'color .2s' }} />
                <input
                  type="text"
                  placeholder="أدخل اسم المستخدم"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  onFocus={() => setFocused('user')}
                  onBlur={() => setFocused(null)}
                  autoComplete="username"
                  className="lg-input"
                  style={{ width:'100%', background:'transparent', border:'none', padding:'.75rem 2.4rem .75rem .9rem', color:'#f2ede5', fontSize:'.9rem', fontFamily:"'Cairo', sans-serif", borderRadius:12, direction:'ltr', textAlign:'left' }}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom:'1.5rem' }}>
              <label style={{ display:'block', fontSize:'.8rem', fontWeight:600, color:'rgba(255,255,255,.55)', marginBottom:'.45rem' }}>
                كلمة المرور
              </label>
              <div style={{
                position:'relative',
                borderRadius:12,
                border: `1.5px solid ${focused==='pass' ? 'rgba(249,115,22,.6)' : 'rgba(255,255,255,.1)'}`,
                background: focused==='pass' ? 'rgba(249,115,22,.06)' : 'rgba(255,255,255,.04)',
                boxShadow: focused==='pass' ? '0 0 0 3px rgba(249,115,22,.1)' : 'none',
                transition:'all .2s',
              }}>
                <Lock size={15} style={{ position:'absolute', right:13, top:'50%', transform:'translateY(-50%)', color: focused==='pass' ? '#f97316' : 'rgba(255,255,255,.3)', pointerEvents:'none', transition:'color .2s' }} />
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="أدخل كلمة المرور"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={() => setFocused('pass')}
                  onBlur={() => setFocused(null)}
                  autoComplete="current-password"
                  className="lg-input"
                  style={{ width:'100%', background:'transparent', border:'none', padding:'.75rem 2.4rem .75rem 2.4rem', color:'#f2ede5', fontSize:'.9rem', fontFamily:"'Cairo', sans-serif", borderRadius:12, direction:'ltr', textAlign:'left' }}
                />
                <button type="button" onClick={() => setShowPass(!showPass)} tabIndex={-1} style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,.3)', display:'flex', alignItems:'center', padding:3 }}>
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || teacherLoading}
              className="lg-btn"
              style={{
                width:'100%',
                border:'none',
                borderRadius:12,
                padding:'.9rem',
                fontSize:'.95rem',
                fontWeight:700,
                fontFamily:"'Cairo', sans-serif",
                cursor: loading || teacherLoading ? 'not-allowed' : 'pointer',
                display:'flex',
                alignItems:'center',
                justifyContent:'center',
                gap:'.5rem',
                background: loading || teacherLoading ? 'rgba(249,115,22,.5)' : 'linear-gradient(135deg,#f97316,#ea6c0a)',
                color:'#fff',
                boxShadow:'0 4px 22px rgba(249,115,22,.35)',
                transition:'all .25s',
                marginBottom:'1.25rem',
                opacity: loading || teacherLoading ? .7 : 1,
              }}
            >
              {loading ? (
                <><div className="lg-spinner" /> جاري التحقق...</>
              ) : (
                <><LogIn size={17} /> دخول</>
              )}
            </button>
          </form>

          {/* Admin hint */}
          {teacherSlug === 'admin' && (
            <div style={{ padding:'.7rem 1rem', background:'rgba(249,115,22,.07)', border:'1px solid rgba(249,115,22,.18)', borderRadius:10, textAlign:'center', fontSize:'.75rem', color:'rgba(255,255,255,.5)' }}>
              الحساب الافتراضي:&nbsp;
              <span style={{ fontFamily:'monospace', color:'#f97316', fontWeight:700 }}>admin / admin123</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ position:'absolute', bottom:'1.25rem', fontSize:'.68rem', color:'rgba(255,255,255,.2)', textAlign:'center', width:'100%' }}>
          {displayName} © {new Date().getFullYear()} — منصة التعليم الإلكتروني
        </div>
      </div>
    </div>
  );
}
