import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTeacher } from '../context/TeacherContext';
import toast from 'react-hot-toast';
import {
  Eye, EyeOff, LogIn, Lock, User,
  BookOpen, BarChart2, Award, Video, Target, Users, Sparkles,
  ShieldAlert, ShieldX, CheckCircle, ArrowRight, Smartphone,
} from 'lucide-react';
import WathbaLogo from '../assets/wathba_logo_new.png';
import { useForceLightMode } from '../hooks/useForceLightMode';

const FEATURES = [
  { icon: BookOpen,  title: 'كورسات تفاعلية',  desc: 'فيديوهات وملفات PDF منظّمة' },
  { icon: Target,    title: 'امتحانات ذكية',    desc: 'تحليل فوري للنتائج' },
  { icon: BarChart2, title: 'تحليلات متقدمة',   desc: 'تقارير أداء تفصيلية' },
  { icon: Award,     title: 'نقاط وشارات',      desc: 'نظام تحفيز للتفوق' },
  { icon: Users,     title: 'إدارة شاملة',      desc: 'طلاب ومساعدين ومدفوعات' },
  { icon: Video,     title: 'بث مباشر',         desc: 'حصص تفاعلية أونلاين' },
];

import { getOrCreateDeviceId } from '../lib/deviceId';

// Security warning modal shown on every student login
function DeviceWarningModal({ onAccept }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)', padding: '1rem',
      animation: 'lg-fade-up .3s ease both',
    }}>
      <div style={{
        background: '#FFFFFF',
        border: '1px solid rgba(249,115,22,.25)',
        borderRadius: 20,
        width: '100%', maxWidth: 420,
        padding: '2rem',
        boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: 'rgba(249,115,22,.08)',
            border: '1px solid rgba(249,115,22,.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1rem',
          }}>
            <ShieldAlert size={28} color="#f97316" />
          </div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#0B3C5D', marginBottom: '.4rem' }}>
            تنبيه أمني هام
          </h2>
          <p style={{ fontSize: '.8rem', color: 'rgba(11,60,93,0.5)', lineHeight: 1.6 }}>
            يرجى قراءة هذا التنبيه بعناية قبل الدخول
          </p>
        </div>

        <div style={{
          background: 'rgba(249,115,22,.04)',
          border: '1px solid rgba(249,115,22,.15)',
          borderRadius: 14, padding: '1.2rem',
          marginBottom: '1.5rem',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
            {[
              { icon: '🔐', text: 'حسابك مسجّل على جهاز واحد فقط. لا تسجّل دخولك من أي جهاز آخر غير مسجّل.' },
              { icon: '🚫', text: 'مشاركة بيانات حسابك مع أي شخص آخر محظورة تماماً وتؤدي إلى إيقاف الحساب فوراً.' },
              { icon: '📱', text: 'في حالة تغيير جهازك (هاتف جديد، تابلت، لابتوب، …) يجب عليك التواصل مع المدرس لإعادة ضبط الأجهزة المسجّلة.' },
              { icon: '⚠️', text: 'أي محاولة لتسجيل الدخول من جهاز آخر ستُرفض فوراً وسيتم إشعار المدرس.' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: '.75rem', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
                <span style={{ fontSize: '.78rem', color: 'rgba(11,60,93,0.7)', lineHeight: 1.6 }}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={onAccept}
          style={{
            width: '100%', border: 'none', borderRadius: 12,
            padding: '.85rem', fontSize: '.9rem', fontWeight: 700,
            fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem',
            background: 'linear-gradient(135deg,#f97316,#ea6c0a)',
            color: '#fff',
            boxShadow: '0 4px 22px rgba(249,115,22,.35)',
            transition: 'all .25s',
          }}
        >
          <CheckCircle size={16} />
          فهمت وأوافق — متابعة الدخول
        </button>
      </div>
    </div>
  );
}

// Shown when a student attempts login from an unregistered second/third device.
// If `autoSuspended` is true the server already auto-suspended the account
// after the student failed 3 times in a row, so we render a heavier UI.
function DeviceBlockedModal({ onClose, autoSuspended = false }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.55)', padding: '1rem',
      animation: 'lg-fade-up .3s ease both',
    }}>
      <div style={{
        background: '#FFFFFF',
        border: '2px solid rgba(239,68,68,.3)',
        borderRadius: 20,
        width: '100%', maxWidth: 420,
        padding: '2rem',
        boxShadow: '0 10px 40px rgba(239,68,68,0.12)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            width: 68, height: 68, borderRadius: 20,
            background: autoSuspended ? 'rgba(220,38,38,.18)' : 'rgba(239,68,68,.08)',
            border: `2px solid ${autoSuspended ? 'rgba(220,38,38,.5)' : 'rgba(239,68,68,.25)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1rem',
          }}>
            <ShieldX size={32} color="#dc2626" />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 900, color: autoSuspended ? '#450a0a' : '#7f1d1d', marginBottom: '.4rem' }}>
            {autoSuspended ? 'تم إيقاف حسابك تلقائياً' : 'تم رصد جهاز جديد'}
          </h2>
          <p style={{ fontSize: '.82rem', color: 'rgba(127,29,29,0.65)', lineHeight: 1.6 }}>
            {autoSuspended
              ? 'نظراً لتكرار محاولة الدخول من أجهزة مختلفة، تم إيقاف حسابك تلقائياً.'
              : 'تم إشعار المدرس بهذه المحاولة'}
          </p>
        </div>

        {/* Details box */}
        <div style={{
          background: 'rgba(239,68,68,.04)',
          border: '1px solid rgba(239,68,68,.2)',
          borderRadius: 14, padding: '1.2rem',
          marginBottom: '1.5rem',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[
              autoSuspended
                ? { icon: <Lock size={17} color="#dc2626" />, title: 'الحساب متوقف الآن', text: 'لن تستطيع الدخول حتى يقوم المدرس بإعادة التفعيل.' }
                : { icon: <Smartphone size={17} color="#ef4444" />, title: 'جهاز أو متصفح غير مسجّل', text: 'هذا الجهاز أو المتصفح لم يسبق تسجيله في حسابك. الحد الأقصى المسموح به جهاز واحد فقط.' },
              { icon: <ShieldAlert size={17} color="#f97316" />, title: 'المدرس تم إشعاره', text: 'تلقّى المدرس تنبيهاً فورياً بهذه المحاولة وسيراجعها.' },
              { icon: <CheckCircle size={17} color="#16a34a" />, title: 'ماذا تفعل؟', text: 'إذا كنت تستخدم التصفح الخفي (Incognito) أو متصفحاً آخر، أغلقه وافتح من متصفحك الأصلي المعتاد، أو تواصل مع المدرس.' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: '.75rem', alignItems: 'flex-start' }}>
                <div style={{ flexShrink: 0, marginTop: 2 }}>{item.icon}</div>
                <div>
                  <div style={{ fontSize: '.8rem', fontWeight: 800, color: '#7f1d1d', marginBottom: 2 }}>{item.title}</div>
                  <div style={{ fontSize: '.76rem', color: 'rgba(127,29,29,0.7)', lineHeight: 1.6 }}>{item.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%', border: '2px solid rgba(239,68,68,.3)', borderRadius: 12,
            padding: '.85rem', fontSize: '.9rem', fontWeight: 700,
            fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem',
            background: 'rgba(239,68,68,.06)',
            color: '#dc2626',
            transition: 'all .2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background='rgba(239,68,68,.12)'; }}
          onMouseLeave={e => { e.currentTarget.style.background='rgba(239,68,68,.06)'; }}
        >
          حسناً — فهمت الأمر
        </button>
      </div>
    </div>
  );
}

export default function Login() {
  useForceLightMode();
  const [username, setUsername]       = useState('');
  const [password, setPassword]       = useState('');
  const [showPass, setShowPass]       = useState(false);
  const [loading, setLoading]         = useState(false);
  const [focused, setFocused]         = useState(null);
  const [pendingUser, setPendingUser] = useState(null);
  const [showWarning, setShowWarning] = useState(false);
  const [showDeviceBlocked, setShowDeviceBlocked] = useState(false);
  const [autoSuspendedFlag, setAutoSuspendedFlag] = useState(false);

  const isPwa = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  const { login } = useAuth();
  const navigate = useNavigate();
  const { platformName, logoUrl, isLoading: teacherLoading } = useTeacher();

  const displayLogo = logoUrl || WathbaLogo;
  const displayName = platformName || 'وثبة';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return toast.error('يرجى إدخال اسم المستخدم وكلمة المرور');
    setLoading(true);
    try {
      const { device_id: deviceId, origin: deviceOrigin } = await getOrCreateDeviceId();
      const { user, force_password_change, is_new_device } = await login(
        username.trim(), password, undefined, undefined, deviceId, deviceOrigin
      );
      if (force_password_change && user.role === 'teacher') {
        toast('يرجى تغيير كلمة المرور الافتراضية قبل المتابعة', { icon: '🔑', duration: 5000 });
        navigate('/teacher/settings?tab=password');
        return;
      }
      if (user.role === 'student') {
        // [H-3] Only show the orange DeviceWarningModal on first-time login from
        // this device. Returning to a known device should be a silent, normal
        // experience.
        if (is_new_device) {
          setPendingUser(user);
          setShowWarning(true);
        } else {
          toast.success(`أهلاً بعودتك، ${user.name}!`, { icon: '🎉' });
          navigate(`/${user.role}`);
        }
      } else {
        toast.success(`أهلاً بك، ${user.name}!`, { icon: '🎉' });
        navigate(`/${user.role}`);
      }
    } catch (err) {
      const code = err.response?.data?.code;
      const autoSuspended = err.response?.data?.auto_suspended === true;
      if (code === 'NEW_DEVICE_BLOCKED' || code === 'STUDENT_AUTO_SUSPENDED') {
        // Show the dedicated device-blocked modal. If the server already
        // auto-suspended the student after 3 failed attempts, we render
        // a heavier "your account was suspended" UI.
        setAutoSuspendedFlag(autoSuspended);
        setShowDeviceBlocked(true);
      } else if (code === 'DEVICE_ID_REQUIRED') {
        toast.error('يرجى تسجيل الدخول عبر متصفح وثبة الرسمي');
      } else {
        toast.error(err.response?.data?.error || 'بيانات الدخول غير صحيحة');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleWarningAccept = () => {
    setShowWarning(false);
    if (pendingUser) {
      toast.success(`أهلاً بك، ${pendingUser.name}!`, { icon: '🎉' });
      navigate(`/${pendingUser.role}`);
    }
  };

  return (
    <div dir="rtl" style={{
      minHeight: '100vh',
      display: 'flex',
      fontFamily: "'Cairo', sans-serif",
      background: '#F8FAFC',
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
        .lg-feature:hover { background:rgba(249,115,22,.04); border-color:rgba(249,115,22,.2); transform:translateY(-2px); }
        @media (max-width: 860px) {
          .lg-left { display: none !important; }
          .lg-right { width: 100% !important; }
        }
      `}</style>

      {/* Device security warning modal (first login on any device) */}
      {showWarning && <DeviceWarningModal onAccept={handleWarningAccept} />}

      {/* Device blocked modal (attempt from unregistered second device) */}
      {showDeviceBlocked && (
        <DeviceBlockedModal
          autoSuspended={autoSuspendedFlag}
          onClose={() => {
            setShowDeviceBlocked(false);
            setAutoSuspendedFlag(false);
          }}
        />
      )}

      {/* ═══ LEFT PANEL ═══ */}
      <div className="lg-left" style={{
        width: '58%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '3rem 3.5rem',
        overflow: 'hidden',
        background: 'linear-gradient(145deg, #EEF2F8 0%, #E4ECF5 40%, #D6E5F5 100%)',
      }}>
        {/* Dot grid overlay */}
        <div style={{ position:'absolute', inset:0, backgroundImage:'radial-gradient(rgba(11,60,93,.07) 1px,transparent 1px)', backgroundSize:'28px 28px', pointerEvents:'none' }} />

        {/* SVG wave shapes */}
        <svg style={{ position:'absolute', left:0, top:0, bottom:0, height:'100%', width:'40%', opacity:0.5, pointerEvents:'none' }} viewBox="0 0 200 800" fill="none" preserveAspectRatio="none">
          <path d="M-60,0 Q80,200 -20,400 T30,700 Q-60,800 -150,800 L-150,0 Z" fill="#0B3C5D" fillOpacity="0.06" />
          <path d="M-40,0 Q100,220 0,420 T50,680 Q-40,780 -150,800 L-150,0 Z" fill="#f97316" fillOpacity="0.07" />
          <path d="M10,0 Q130,220 20,440 T30,760 Q-50,840 -100,800" stroke="#0B3C5D" strokeWidth="2.5" strokeLinecap="round" opacity="0.4" />
        </svg>
        <svg style={{ position:'absolute', right:0, top:0, bottom:0, height:'100%', width:'35%', opacity:0.4, pointerEvents:'none' }} viewBox="0 0 180 800" fill="none" preserveAspectRatio="none">
          <path d="M240,0 Q130,200 220,400 T180,700 Q260,800 350,800 L350,0 Z" fill="#0B3C5D" fillOpacity="0.05" />
          <path d="M160,0 Q90,180 180,380 T160,680 Q240,780 350,800 L350,0 Z" fill="#f97316" fillOpacity="0.06" />
        </svg>

        {/* Decorative circles */}
        <div className="lg-orb" style={{ width:400, height:400, top:-100, right:-60, background: 'radial-gradient(circle,rgba(249,115,22,.08),transparent 70%)' }} />
        <div className="lg-orb" style={{ width:350, height:350, bottom:-80, left:-50, background: 'radial-gradient(circle,rgba(11,60,93,.06),transparent 70%)' }} />
        <div className="lg-ring" style={{ width:500, height:500, top:'50%', left:'50%', transform:'translate(-50%,-50%)', borderColor: 'rgba(11,60,93,.04)' }} />
        <div className="lg-ring" style={{ width:350, height:350, top:'50%', left:'50%', transform:'translate(-50%,-50%)', borderColor: 'rgba(249,115,22,.05)' }} />

        {/* Floating lightbulbs */}
        <div style={{ position:'absolute', top:'15%', left:'15%', fontSize:'2rem', animation:'lg-float 6s ease-in-out infinite alternate', pointerEvents:'none', filter:'drop-shadow(0 4px 8px rgba(249,115,22,0.15))' }}>💡</div>
        <div style={{ position:'absolute', bottom:'22%', right:'20%', fontSize:'1.6rem', animation:'lg-float 7s ease-in-out 1s infinite alternate', pointerEvents:'none', filter:'drop-shadow(0 4px 8px rgba(249,115,22,0.15))' }}>💡</div>


        <div style={{ position:'relative', zIndex:1, maxWidth:520 }}>
          <div className="lg-fade-1" style={{ display:'flex', alignItems:'center', gap:'1rem', marginBottom:'2.5rem' }}>
            <div style={{ width:60, height:60, borderRadius:16, overflow:'hidden', boxShadow: '0 8px 24px rgba(249,115,22,.15)', border: '1px solid rgba(249,115,22,.15)', flexShrink:0 }}>
              <img src={displayLogo} alt={displayName} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
            </div>
            <div>
              <div style={{ fontSize:'1.75rem', fontWeight:900, lineHeight:1.1, background: 'linear-gradient(135deg,#0b3c5d 30%,#f97316 100%)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>
                {displayName}
              </div>
              <div style={{ fontSize:'.8rem', color: '#f97316', fontWeight:600, marginTop:2 }}>
                المنصة التعليمية المتكاملة
              </div>
            </div>
          </div>

          <div className="lg-fade-2" style={{ marginBottom:'2rem' }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:6, background: 'rgba(249,115,22,.06)', border: '1px solid rgba(249,115,22,.15)', color: '#ea580c', fontSize:'.72rem', fontWeight:700, padding:'5px 14px', borderRadius:99, marginBottom:'1rem', letterSpacing:'.05em', textTransform:'uppercase' }}>
              <Sparkles size={12} />
              تسجيل دخول آمن
            </div>
            <h1 style={{ fontSize:'clamp(1.7rem,2.8vw,2.5rem)', fontWeight:900, color: '#0B3C5D', lineHeight:1.25, marginBottom:'.6rem' }}>
              مرحباً بك في<br />
              <span style={{ color:'#f97316' }}>{displayName}</span>
            </h1>
            <p style={{ color: 'rgba(11,60,93,.65)', fontSize:'.9rem', lineHeight:1.65 }}>
              اكسب المعرفة، تتبع تقدمك، وحقق التفوق من خلال منصة تعليمية احترافية.
            </p>
          </div>

          <div className="lg-fade-3" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.6rem' }}>
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="lg-feature" style={{
                display:'flex', alignItems:'center', gap:'.7rem',
                padding:'.75rem .9rem',
                background: '#FFFFFF',
                border: '1px solid rgba(11,60,93,.06)',
                borderRadius:14,
                boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
              }}>
                <div style={{ width:34, height:34, borderRadius:10, background: 'rgba(249,115,22,.08)', border: '1px solid rgba(249,115,22,.15)', display:'flex', alignItems:'center', justifyContext:'center', flexShrink:0 }}>
                  <Icon size={15} color="#f97316" style={{ margin: 'auto' }} />
                </div>
                <div>
                  <div style={{ fontSize:'.78rem', fontWeight:700, color: '#0B3C5D', lineHeight:1.2 }}>{title}</div>
                  <div style={{ fontSize:'.68rem', color: 'rgba(11,60,93,.5)', marginTop:2 }}>{desc}</div>
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
        justifyContext: 'center',
        padding: '2.5rem 2rem',
        background: '#FFFFFF',
        position: 'relative',
        borderRight: '1px solid rgba(11,60,93,.08)',
      }}>
        <div className="lg-orb" style={{ width:400, height:400, bottom:-100, right:-80, background: 'radial-gradient(circle,rgba(124,58,237,.04),transparent 70%)', pointerEvents:'none' }} />

        <div className="lg-fade-4" style={{ width:'100%', maxWidth:360, position:'relative', zIndex:1, margin: 'auto 0' }}>
          {!isPwa && (
            <button
              type="button"
              onClick={() => navigate(-1)}
              style={{
                display:'flex', alignItems:'center', gap:'.4rem',
                background:'none', border:'1px solid rgba(11,60,93,.1)',
                borderRadius:10, padding:'.45rem .85rem',
                cursor:'pointer', marginBottom:'1.5rem',
                color:'rgba(11,60,93,.6)', fontSize:'.8rem', fontWeight:600,
                fontFamily:"'Cairo', sans-serif",
                transition:'all .2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(249,115,22,.35)'; e.currentTarget.style.color='#f97316'; e.currentTarget.style.background='rgba(249,115,22,.04)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(11,60,93,.1)'; e.currentTarget.style.color='rgba(11,60,93,.6)'; e.currentTarget.style.background='none'; }}
            >
              <ArrowRight size={15} />
              رجوع
            </button>
          )}

          <div style={{ display:'none', textAlign:'center', marginBottom:'1.75rem' }} className="lg-mobile-logo">
            <div style={{ width:72, height:72, borderRadius:18, overflow:'hidden', margin:'0 auto 0.75rem', boxShadow: '0 8px 24px rgba(249,115,22,.15)' }}>
              <img src={displayLogo} alt={displayName} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            </div>
            <div style={{ fontSize:'1.5rem', fontWeight:900, color: '#0B3C5D' }}>{displayName}</div>
          </div>

          <div style={{ textAlign:'center', marginBottom:'2rem' }}>
            <div style={{ width:52, height:52, borderRadius:14, background: 'linear-gradient(135deg,rgba(249,115,22,.1),rgba(249,115,22,.04))', border: '1px solid rgba(249,115,22,.2)', display:'flex', alignItems:'center', justifyContext:'center', margin:'0 auto 1rem' }}>
              <LogIn size={22} color="#f97316" style={{ margin: 'auto' }} />
            </div>
            <h2 style={{ fontSize:'1.45rem', fontWeight:900, color: '#0B3C5D', marginBottom:'.3rem' }}>تسجيل الدخول</h2>
            <p style={{ fontSize:'.82rem', color: 'rgba(11,60,93,.5)' }}>أدخل بياناتك للوصول إلى حسابك</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:'1.1rem' }}>
              <label style={{ display:'block', fontSize:'.8rem', fontWeight:600, color: 'rgba(11,60,93,.65)', marginBottom:'.45rem' }}>
                اسم المستخدم
              </label>
              <div style={{
                position:'relative', borderRadius:12,
                border: `1.5px solid ${focused==='user' ? 'rgba(249,115,22,.5)' : 'rgba(11,60,93,.1)'}`,
                background: focused==='user' ? 'rgba(249,115,22,.04)' : 'rgba(11,60,93,.02)',
                boxShadow: focused==='user' ? '0 0 0 3px rgba(249,115,22,.1)' : 'none',
                transition:'all .2s',
              }}>
                <User size={15} style={{ position:'absolute', right:13, top:'50%', transform:'translateY(-50%)', color: focused==='user' ? '#f97316' : 'rgba(11,60,93,.3)', pointerEvents:'none', transition:'color .2s' }} />
                <input
                  type="text"
                  placeholder="أدخل اسم المستخدم"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  onFocus={() => setFocused('user')}
                  onBlur={() => setFocused(null)}
                  autoComplete="username"
                  className="lg-input"
                  style={{ width:'100%', background:'transparent', border:'none', padding:'.75rem 2.4rem .75rem .9rem', color: '#0B3C5D', fontSize:'.9rem', fontFamily:"'Cairo', sans-serif", borderRadius:12, direction:'ltr', textAlign:'left' }}
                />
              </div>
            </div>

            <div style={{ marginBottom:'1.5rem' }}>
              <label style={{ display:'block', fontSize:'.8rem', fontWeight:600, color: 'rgba(11,60,93,.65)', marginBottom:'.45rem' }}>
                كلمة المرور
              </label>
              <div style={{
                position:'relative', borderRadius:12,
                border: `1.5px solid ${focused==='pass' ? 'rgba(249,115,22,.5)' : 'rgba(11,60,93,.1)'}`,
                background: focused==='pass' ? 'rgba(249,115,22,.04)' : 'rgba(11,60,93,.02)',
                boxShadow: focused==='pass' ? '0 0 0 3px rgba(249,115,22,.1)' : 'none',
                transition:'all .2s',
              }}>
                <Lock size={15} style={{ position:'absolute', right:13, top:'50%', transform:'translateY(-50%)', color: focused==='pass' ? '#f97316' : 'rgba(11,60,93,.3)', pointerEvents:'none', transition:'color .2s' }} />
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="أدخل كلمة المرور"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={() => setFocused('pass')}
                  onBlur={() => setFocused(null)}
                  autoComplete="current-password"
                  className="lg-input"
                  style={{ width:'100%', background:'transparent', border:'none', padding:'.75rem 2.4rem .75rem 2.4rem', color: '#0B3C5D', fontSize:'.9rem', fontFamily:"'Cairo', sans-serif", borderRadius:12, direction:'ltr', textAlign:'left' }}
                />
                <button type="button" onClick={() => setShowPass(!showPass)} tabIndex={-1} style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color: 'rgba(11,60,93,.4)', display:'flex', alignItems:'center', padding:3 }}>
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || teacherLoading}
              className="lg-btn"
              style={{
                width:'100%', border:'none', borderRadius:12, padding:'.9rem',
                fontSize:'.95rem', fontWeight:700, fontFamily:"'Cairo', sans-serif",
                cursor: loading || teacherLoading ? 'not-allowed' : 'pointer',
                display:'flex', alignItems:'center', justifyContent:'center', gap:'.5rem',
                background: loading || teacherLoading ? 'rgba(249,115,22,.5)' : 'linear-gradient(135deg,#f97316,#ea6c0a)',
                color:'#fff', boxShadow:'0 4px 22px rgba(249,115,22,.35)',
                transition:'all .25s', marginBottom:'1.25rem',
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
        </div>

        <div style={{ position:'absolute', bottom:'1.25rem', fontSize:'.68rem', color: 'rgba(11,60,93,.35)', textAlign:'center', width:'100%' }}>
          {displayName} © {new Date().getFullYear()} — منصة التعليم الإلكتروني
        </div>
      </div>
    </div>
  );
}
