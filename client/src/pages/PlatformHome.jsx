import React, { useEffect, useRef, useState } from 'react';
import {
  GraduationCap, BookOpen, BarChart3, Users, CheckCircle,
  Sparkles, Trophy, MessageCircle, Target, CreditCard,
  Video, Gamepad2, Shield, Star, Zap, Mail,
  ChevronDown, ArrowLeft, Play, FileText, Bell, Award, Phone
} from 'lucide-react';
import wathbaLogo from '../assets/wathba_logo_transparent.png';
import { useForceLightMode } from '../hooks/useForceLightMode';

/* ── Hooks ── */
function useReveal(threshold = 0.1) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

function useCounter(target, duration = 1800, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start || !target) return;
    let t0 = null;
    const tick = (ts) => {
      if (!t0) t0 = ts;
      const p = Math.min((ts - t0) / duration, 1);
      setCount(Math.floor((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration, start]);
  return count;
}

/* ── Primitives ── */
function Reveal({ children, className = '', delay = 0 }) {
  const [ref, visible] = useReveal();
  return (
    <div ref={ref} className={className} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(28px)',
      transition: `opacity 0.65s ease ${delay}s, transform 0.65s ease ${delay}s`,
    }}>
      {children}
    </div>
  );
}

function StatCard({ value, suffix = '', label, duration = 2000 }) {
  const [ref, visible] = useReveal();
  const count = useCounter(value, duration, visible);
  return (
    <div ref={ref} className="text-center">
      <div className="text-4xl md:text-5xl font-black text-orange-500 mb-1">
        {count.toLocaleString('ar-EG')}{suffix}
      </div>
      <div className="text-[#0B3C5D]/60 text-sm font-semibold">{label}</div>
    </div>
  );
}

/* ── Feature Card ── */
function FeatureCard({ icon: Icon, title, desc, color, delay }) {
  const [ref, visible] = useReveal();
  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.97)',
      transition: `opacity 0.5s ease ${delay}s, transform 0.5s ease ${delay}s`,
    }}
      className="group relative bg-white hover:bg-slate-50/50 border border-slate-100 hover:border-orange-500/30 rounded-xl md:rounded-2xl p-3.5 md:p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-md shadow-sm cursor-default"
    >
      <div className={`w-9 h-9 md:w-12 md:h-12 rounded-lg md:rounded-xl ${color} flex items-center justify-center mb-2.5 md:mb-4 group-hover:scale-110 transition-transform`}>
        <Icon className="w-5 h-5 md:w-6 md:h-6 text-white" />
      </div>
      <h3 className="text-[#0B3C5D] font-bold text-sm md:text-base mb-1.5 md:mb-2">{title}</h3>
      <p className="text-slate-500 text-xs md:text-sm leading-relaxed">{desc}</p>
    </div>
  );
}

/* ── FAQ Item ── */
function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 bg-white rounded-xl overflow-hidden shadow-sm hover:shadow transition-shadow">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-5 text-right text-[#0B3C5D] font-bold text-sm hover:bg-slate-50 transition-colors"
      >
        {q}
        <ChevronDown className={`w-4 h-4 text-[#0B3C5D]/40 transition-transform shrink-0 ms-3 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 text-[#0B3C5D]/75 text-sm leading-relaxed border-t border-slate-100 bg-slate-50/30 pt-4">
          {a}
        </div>
      )}
    </div>
  );
}

/* ── Dev Access Panel (dev only) ── */
function DevAccessPanel() {
  const [slug, setSlug] = useState('admin');
  const [open, setOpen] = useState(false);

  const isDevHost = (() => {
    const h = window.location.hostname;
    return h === 'localhost' || h === '127.0.0.1';
  })();

  if (!isDevHost) return null;

  const goTo = (path = '/login') => {
    localStorage.setItem('wathba_teacher_slug', slug.trim());
    window.location.href = path;
  };

  return (
    <div style={{
      position: 'fixed', bottom: 20, left: 20, zIndex: 9999,
      fontFamily: "'Cairo', sans-serif",
    }}>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{
            background: 'rgba(15,12,30,0.95)',
            border: '1px solid rgba(249,115,22,0.4)',
            color: '#f97316', fontSize: '11px', fontWeight: 700,
            padding: '6px 12px', borderRadius: 10, cursor: 'pointer',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          🛠 وضع المطور
        </button>
      ) : (
        <div style={{
          background: 'rgba(10,8,22,0.98)',
          border: '1px solid rgba(249,115,22,0.35)',
          borderRadius: 16, padding: '16px',
          width: 260, backdropFilter: 'blur(20px)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
          direction: 'rtl',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ color: '#f97316', fontWeight: 800, fontSize: 13 }}>🛠 وضع المطور</span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 5 }}>slug المعلم</div>
            <input
              value={slug}
              onChange={e => setSlug(e.target.value)}
              placeholder="مثال: admin"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8, padding: '7px 10px', color: '#fff', fontSize: 13,
                fontFamily: "'Cairo', sans-serif", outline: 'none',
                direction: 'ltr', textAlign: 'left',
              }}
              onKeyDown={e => e.key === 'Enter' && goTo('/login')}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              onClick={() => goTo('/login')}
              style={{
                background: 'linear-gradient(135deg,#f97316,#ea6c0a)',
                border: 'none', borderRadius: 8, padding: '8px',
                color: '#fff', fontWeight: 700, fontSize: 12,
                cursor: 'pointer', fontFamily: "'Cairo', sans-serif",
              }}
            >
              🔐 فتح صفحة تسجيل الدخول
            </button>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button
                onClick={() => { localStorage.setItem('wathba_teacher_slug', slug.trim()); window.location.href = '/teacher'; }}
                style={{ background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 8, padding: '7px 4px', color: '#a78bfa', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: "'Cairo', sans-serif" }}
              >
                👨‍🏫 لوحة المعلم
              </button>
              <button
                onClick={() => { localStorage.setItem('wathba_teacher_slug', slug.trim()); window.location.href = '/student'; }}
                style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 8, padding: '7px 4px', color: '#34d399', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: "'Cairo', sans-serif" }}
              >
                🎒 لوحة الطالب
              </button>
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', textAlign: 'center', marginTop: 2 }}>
              هذا الـ panel يظهر فقط في بيئة التطوير
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════ */
/*                  MAIN COMPONENT                         */
/* ════════════════════════════════════════════════════════ */
export default function PlatformHome() {
  useForceLightMode();
  const PHONE = '01210737582';
  const PHONE_INTL = '201210737582';
  const EMAIL = 'wathbaeduplatform@gmail.com';
  const WHATSAPP = `https://wa.me/${PHONE_INTL}?text=أريد الاستفسار عن منصة وثبة`;

  useEffect(() => {
    document.title = 'وثبة — منصة تعليمية متكاملة';
    const favicon = document.querySelector("link[rel='icon']");
    if (favicon) favicon.href = '/favicon.png';

    const style = document.createElement('style');
    style.id = 'ph-styles';
    style.textContent = `
      @keyframes ph-float { 0%{transform:translateY(0)} 100%{transform:translateY(-18px)} }
      @keyframes ph-spin-slow { to{transform:rotate(360deg)} }
      @keyframes ph-pulse-ring {
        0%{transform:scale(1);opacity:0.4}
        100%{transform:scale(1.6);opacity:0}
      }
      .ph-orb {
        position:absolute;border-radius:50%;filter:blur(100px);
        opacity:0.06;pointer-events:none;
      }
      .ph-float { animation: ph-float 6s ease-in-out infinite alternate; }
      .ph-gradient-text {
        background: linear-gradient(135deg, #0b3c5d 30%, #f97316 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .ph-dot-grid {
        background-image:radial-gradient(rgba(11,60,93,.06) 1px,transparent 1px);
        background-size:32px 32px;
      }
      .ph-card-glow:hover {
        box-shadow: 0 12px 40px rgba(249,115,22,0.08);
      }
    `;
    document.head.appendChild(style);
    return () => document.getElementById('ph-styles')?.remove();
  }, []);

  const features = [
    { icon: BookOpen,    title: 'كورسات تفاعلية',     desc: 'رفع فيديوهات وملفات PDF منظّمة في أقسام مع تتبع تقدم كل طالب تلقائياً.',       color: 'bg-orange-500',   delay: 0 },
    { icon: FileText,    title: 'امتحانات ذكية',       desc: 'بنك أسئلة متنوع — اختيار متعدد وصح/غلط — مع تصحيح فوري وتحليل تفصيلي.', color: 'bg-violet-600',   delay: 0.05 },
    { icon: BarChart3,   title: 'تحليلات متقدمة',     desc: 'لوحة بيانات شاملة لأداء كل طالب والكورسات والامتحانات بالرسوم البيانية.',         color: 'bg-blue-600',     delay: 0.10 },
    { icon: Users,       title: 'إدارة المساعدين',    desc: 'أضف مساعدين بصلاحيات مخصصة لكل وظيفة — طلاب، مدفوعات، امتحانات وأكثر.',         color: 'bg-emerald-600',  delay: 0.15 },
    { icon: CreditCard,  title: 'إدارة المدفوعات',    desc: 'تتبع طلبات التسجيل وإيصالات الدفع والتحقق منها في لحظات.',                        color: 'bg-pink-600',     delay: 0.20 },
    { icon: Video,       title: 'بث مباشر',           desc: 'حصص مباشرة تفاعلية بتقنية LiveKit — شات وكاميرا وإدارة الطلاب وصلاحيات التحدث.',  color: 'bg-cyan-600',     delay: 0.25 },
    { icon: Trophy,      title: 'نظام نقاط ومتصدرين', desc: 'شارات وترتيب تنافسي يحفّز الطلاب على الاستمرار والتفوق.',                         color: 'bg-yellow-600',   delay: 0.30 },
    { icon: Bell,        title: 'إشعارات فورية',      desc: 'أرسل إشعارات للطلاب وأولياء الأمور عبر الموقع مباشرة.',                           color: 'bg-red-600',      delay: 0.35 },
    { icon: Gamepad2,    title: 'فعاليات وألعاب',     desc: 'لعبة أسبوعية تعليمية Stickman Run مع أسئلة مرتبطة بالمراحل الدراسية.',            color: 'bg-indigo-600',   delay: 0.40 },
    { icon: Target,      title: 'بوابة أولياء الأمور', desc: 'ولي الأمر يتابع أداء ابنه بالرقم فقط — نتائج، كورسات، وترتيب.',                  color: 'bg-teal-600',     delay: 0.45 },
    { icon: Shield,      title: 'أمان وعزل كامل',     desc: 'كل مدرس له بياناته المعزولة — الطلاب والكورسات والنتائج لا تتقاطع أبداً.',          color: 'bg-slate-600',    delay: 0.50 },
    { icon: GraduationCap, title: 'تخصيص كامل',       desc: 'اسم المنصة ولوجو ورابط فريد لكل مدرس — منصتك بهويتك الخاصة.',                    color: 'bg-fuchsia-600',  delay: 0.55 },
  ];

  const faqs = [
    { q: 'إيه الفرق بين وثبة والمنصات التانية؟', a: 'وثبة بتديك منصتك الخاصة بالكامل — اسمك، لوجوك، ورابطك الفريد. مش اكونت على منصة مشتركة، ده موقع خاص بيك أنت بس.' },
    { q: 'هل في تطبيق موبايل؟', a: 'المنصة تشتغل على كل الأجهزة من المتصفح مباشرة. بتدعم الـ PWA يعني تنزلها على شاشة الهاتف زي أي تطبيق.' },
    { q: 'إيه نظام الحماية ضد سرقة الكورسات؟', a: 'المنصة مجهّزة بنظام حماية متكامل — بيمنع التصوير والتسجيل، بيعطّل كليك يمين وكل الاختصارات اللي بتفتح أدوات المطور أو بتحاول تنزّل المحتوى. أي محاولة اختراق بتتسجّل وبتظهر تحذير للطالب فوراً.' },
    { q: 'المنصة بتدعم البث المباشر؟', a: 'أيوه، المنصة بتدعم حصص اللايف أونلاين من جوّاها مباشرةً بدون ما الطالب يخرج من المنصة. الطالب بيلاقي زرار الانضمام للحصة المباشرة على طول من لوحة التحكم بتاعته، ومع الدردشة والإشعارات الفورية.' },
    { q: 'أقدر أضيف مساعدين؟', a: 'أيوه، تقدر تضيف عدد غير محدود من المساعدين وتحدد صلاحيات كل واحد منهم بالتفصيل.' },
    { q: 'في تدريب على استخدام المنصة؟', a: 'أيوه، بنوفر جلسة تدريبية كاملة + دعم فني مستمر لضمان أحسن تجربة ليك ولطلابك.' },
  ];

  return (
    <div dir="rtl" style={{ fontFamily: "'Cairo', sans-serif", minHeight: '100vh', color: '#0B3C5D', overflowX: 'hidden', position: 'relative' }}>

      {/* ── Fixed full page background with gradient, dot-grid, and soft ambient orbs ── */}
      <div className="fixed inset-0 pointer-events-none select-none overflow-hidden bg-gradient-to-br from-white via-[#F4F6F9] to-[#E9EDF0]" style={{ zIndex: 0 }}>
        <div className="absolute inset-0 opacity-60" style={{ backgroundImage: 'radial-gradient(rgba(11,60,93,.06) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div style={{ position: 'absolute', width: '700px', height: '700px', top: '-200px', left: '-150px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(124,58,237,0.05),transparent 70%)', filter: 'blur(95px)', animation: 'ph-float 15s ease-in-out infinite alternate' }} />
        <div style={{ position: 'absolute', width: '600px', height: '600px', top: '40%', right: '-100px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(249,115,22,0.05),transparent 70%)', filter: 'blur(90px)', animation: 'ph-float 12s ease-in-out 2s infinite alternate' }} />
        <div style={{ position: 'absolute', width: '500px', height: '500px', top: '75%', left: '-120px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(11,60,93,0.04),transparent 70%)', filter: 'blur(90px)', animation: 'ph-float 18s ease-in-out 4s infinite alternate' }} />
      </div>

      {/* ══ Fixed side decorations — visible on entire page ══ */}
      <div style={{ position:'fixed', left:0, top:0, height:'100%', width:260, overflow:'hidden', pointerEvents:'none', zIndex:1, opacity:0.4 }} className="hidden xl:block">
        <svg width="260" height="100%" viewBox="0 0 260 900" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ height:'100%', width:'100%' }}>
          <path d="M-80,0 Q60,200 -30,400 T10,700 Q-80,820 -180,900 L-180,0 Z" fill="#0B3C5D" fillOpacity="0.05" />
          <path d="M-60,0 Q90,220 0,420 T20,680 Q-90,800 -180,900 L-180,0 Z" fill="#f97316" fillOpacity="0.06" />
          <path d="M-10,0 Q130,220 0,440 T20,760 Q-60,840 -110,900" stroke="#0B3C5D" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
          <path d="M-30,0 Q100,230 -10,430 T10,770 Q-80,850 -130,900" stroke="#f97316" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
          <circle cx="40" cy="160" r="90" stroke="#0B3C5D" strokeOpacity="0.04" strokeWidth="1.5" />
          <circle cx="40" cy="160" r="60" stroke="#0B3C5D" strokeOpacity="0.04" strokeWidth="1.5" />
          <circle cx="-10" cy="580" r="110" stroke="#f97316" strokeOpacity="0.04" strokeWidth="1.5" />
          <circle cx="-10" cy="580" r="75" stroke="#f97316" strokeOpacity="0.04" strokeWidth="1.5" />
        </svg>
        <div style={{ position:'absolute', top:'22%', left:80, fontSize:'1.5rem', animation:'ph-float 4s ease-in-out infinite alternate' }}>💡</div>
        <div style={{ position:'absolute', top:'60%', left:60, fontSize:'1.2rem', animation:'ph-float 3s ease-in-out 1s infinite alternate' }}>💡</div>
      </div>

      <div style={{ position:'fixed', right:0, top:0, height:'100%', width:260, overflow:'hidden', pointerEvents:'none', zIndex:0, opacity:0.4 }} className="hidden xl:block">
        <svg width="260" height="100%" viewBox="0 0 260 900" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ height:'100%', width:'100%' }}>
          <path d="M340,0 Q230,200 330,400 T280,700 Q380,820 460,900 L460,0 Z" fill="#0B3C5D" fillOpacity="0.05" />
          <path d="M320,0 Q210,220 310,420 T270,680 Q390,800 460,900 L460,0 Z" fill="#f97316" fillOpacity="0.06" />
          <path d="M270,0 Q170,220 280,440 T240,760 Q320,840 370,900" stroke="#0B3C5D" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
          <path d="M290,0 Q190,230 270,430 T250,770 Q340,850 390,900" stroke="#f97316" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
          <circle cx="220" cy="300" r="95" stroke="#0B3C5D" strokeOpacity="0.04" strokeWidth="1.5" />
          <circle cx="220" cy="300" r="65" stroke="#0B3C5D" strokeOpacity="0.04" strokeWidth="1.5" />
          <circle cx="250" cy="680" r="85" stroke="#f97316" strokeOpacity="0.04" strokeWidth="1.5" />
          <circle cx="250" cy="680" r="55" stroke="#f97316" strokeOpacity="0.04" strokeWidth="1.5" />
          <circle cx="250" cy="300" r="110" stroke="#0B3C5D" strokeOpacity="0.06" strokeWidth="2" />
          <circle cx="250" cy="300" r="80" stroke="#0B3C5D" strokeOpacity="0.06" strokeWidth="2" />
          <circle cx="280" cy="650" r="90" stroke="#f97316" strokeOpacity="0.05" strokeWidth="2" />
          <circle cx="280" cy="650" r="60" stroke="#f97316" strokeOpacity="0.05" strokeWidth="2" />
        </svg>
        <div style={{ position:'absolute', top:'35%', right:60, fontSize:'1.5rem', animation:'ph-float 5s ease-in-out infinite alternate' }}>💡</div>
        <div style={{ position:'absolute', top:'65%', right:80, animation:'ph-float 2.5s ease-in-out 0.5s infinite alternate' }}>
          <Shield style={{ width:20, height:20, color:'#3b82f6', opacity:0.6 }} />
        </div>
      </div>

      {/* ── Navbar ── */}
      <nav style={{ position: 'fixed', top: 0, insetInline: 0, zIndex: 100, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(11,60,93,0.1)' }}>
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <img src={wathbaLogo} alt="وثبة" className="h-9 object-contain rounded-xl shadow-sm" />
          <div className="hidden md:flex items-center gap-6 text-sm text-[#0B3C5D]/75 font-semibold">
            <a href="#about"     className="hover:text-[#0B3C5D] transition-colors">عن المنصه</a>
            <a href="#faq"       className="hover:text-[#0B3C5D] transition-colors">الأسئلة الشائعة</a>
          </div>
          <a href={WHATSAPP} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors">
            <MessageCircle className="w-4 h-4" />
            تواصل معنا
          </a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ position: 'relative', paddingTop: '130px', paddingBottom: '100px' }}>


        <div className="max-w-4xl mx-auto px-5 text-center relative z-10">
          <Reveal delay={0.1}>
            <h1 className="text-5xl md:text-7xl font-black leading-tight mb-6 text-[#0B3C5D]">
              منصتك التعليمية
              <br />
              <span className="ph-gradient-text">بهويتك الخاصة</span>
            </h1>
          </Reveal>

          <Reveal delay={0.2}>
            <p className="text-[#0B3C5D]/65 text-lg md:text-xl leading-relaxed max-w-2xl mx-auto mb-10">
              احصل على منصتك التعليمية الخاصة برابط فريد ولوجو خاص بيك —
              إدارة كورسات، امتحانات، طلاب، ومدفوعات في مكان واحد.
              مصممة خصيصاً لمدرسي السناتر في مصر.
            </p>
          </Reveal>

          <Reveal delay={0.3}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a href={WHATSAPP} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold px-7 py-3.5 rounded-2xl text-base transition-all hover:scale-105 hover:shadow-lg hover:shadow-orange-500/25">
                <MessageCircle className="w-5 h-5" />
                احجز منصتك الآن
              </a>
              <a href="#features"
                className="flex items-center gap-2 bg-[#0B3C5D]/5 hover:bg-[#0B3C5D]/10 text-[#0B3C5D] font-semibold px-7 py-3.5 rounded-2xl text-base border border-[#0B3C5D]/15 transition-all">
                اعرف أكثر
                <ArrowLeft className="w-4 h-4" />
              </a>
            </div>
          </Reveal>

          {/* Stats bar */}
          <Reveal delay={0.5}>
            <div className="mt-16 pt-10 border-t border-[#0B3C5D]/10 grid grid-cols-2 md:grid-cols-4 gap-8">
              <StatCard value={500}  suffix="+"  label="طالب على المنصة"    />
              <StatCard value={12}   suffix="+"  label="مدرس يستخدم المنصة" />
              <StatCard value={98}   suffix="٪"  label="رضا العملاء"        />
              <StatCard value={24}   suffix="/7" label="دعم فني مستمر"       />
            </div>
          </Reveal>
        </div>
      </section>



      {/* ── How it works ── */}
      <section className="max-w-4xl mx-auto px-5 py-16">
        <Reveal className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 text-violet-600 text-xs font-bold px-4 py-1.5 rounded-full mb-4 tracking-widest uppercase">
            <Zap className="w-3.5 h-3.5" />
            كيف يشتغل؟
          </div>
          <h2 className="text-4xl font-black text-[#0B3C5D] mb-3">٣ خطوات وانت شغّال</h2>
        </Reveal>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { num: '١', title: 'تواصل معنا', desc: 'كلمنا على واتساب وهنساعدك تحدد الباقة المناسبة لحجم عملك.' },
            { num: '٢', title: 'إعداد منصتك', desc: 'هنجهّز منصتك بالاسم واللوجو والرابط الخاص بيك خلال 24 ساعة.' },
            { num: '٣', title: 'ابدأ التدريس', desc: 'ارفع كورساتك وأضف طلابك وابدأ تحصل على نتائج فعلية.' },
          ].map((step, i) => (
            <Reveal key={i} delay={i * 0.1}>
              <div className="relative bg-white border border-slate-100 rounded-2xl p-6 text-center ph-card-glow shadow-sm">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-2xl font-black text-white mx-auto mb-4">
                  {step.num}
                </div>
                <h3 className="text-[#0B3C5D] font-bold text-lg mb-2">{step.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{step.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── About Developer ── */}
      <section id="about" className="max-w-4xl mx-auto px-5 py-16">
        <div className="bg-white border border-slate-200/60 rounded-3xl p-8 md:p-12 shadow-md">
          <Reveal>
            <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 text-violet-600 text-xs font-bold px-4 py-1.5 rounded-full mb-6 tracking-widest uppercase">
              <GraduationCap className="w-3.5 h-3.5" />
              عن المنصه
            </div>
          </Reveal>
          <div className="flex flex-col md:flex-row items-start gap-8">
            <Reveal className="flex-shrink-0">
              <div className="w-28 h-28 rounded-2xl bg-white flex items-center justify-center p-3 shadow-md border border-slate-100 select-none">
                <img src={wathbaLogo} alt="وثبة" className="w-full h-full object-contain" />
              </div>
            </Reveal>
            <Reveal delay={0.1} className="flex-1">
              <h3 className="text-[#0B3C5D] text-2xl font-black mb-1">منصة وثبة التعليمية</h3>
              <p className="text-orange-500 font-semibold text-sm mb-4">منصتك التعليمية بهويتك الخاصة · مصر</p>
              <p className="text-slate-500 leading-relaxed mb-6">
                وثبة منصة تعليمية متكاملة مصممة خصيصاً لمدرسي السناتر في مصر — بتوفّر لكل
                مدرس منصته الخاصة بيه، بإدارة كورسات وامتحانات وطلاب ومدفوعات في مكان واحد،
                مع فريق دعم فني جاهز يساعدك في أي وقت.
              </p>
              <div className="flex flex-wrap gap-3">
                <a href={WHATSAPP} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/25 text-green-600 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all">
                  <MessageCircle className="w-4 h-4" />
                  واتساب: {PHONE}
                </a>
                <a href={`mailto:${EMAIL}`}
                  className="flex items-center gap-2 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/25 text-violet-600 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all">
                  <Mail className="w-4 h-4" />
                  {EMAIL}
                </a>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="max-w-3xl mx-auto px-5 py-16" style={{ position: 'relative', zIndex: 1 }}>
        <Reveal className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-600 text-xs font-bold px-4 py-1.5 rounded-full mb-4 tracking-widest uppercase">
            الأسئلة الشائعة
          </div>
          <h2 className="text-4xl font-black text-[#0B3C5D]">عندك سؤال؟</h2>
        </Reveal>
        <div className="space-y-3">
          {faqs.map((f, i) => <FAQItem key={i} {...f} />)}
        </div>
      </section>


      {/* ── FAQ Section ── */}
      <section className="max-w-4xl mx-auto px-5 py-10 mb-10">
        <Reveal>
          <div className="relative overflow-hidden bg-white border border-slate-200/85 rounded-3xl p-10 text-center shadow-md">
            <div className="absolute inset-0 bg-gradient-to-br from-white via-[#F4F6F9] to-[#E9EDF0]" />
            <div className="ph-orb" style={{ width: 300, height: 300, top: -100, right: -50, background: 'radial-gradient(circle, rgba(249,115,22,0.06), transparent 70%)', opacity: 0.8 }} />
            <div className="ph-orb" style={{ width: 250, height: 250, bottom: -80, left: -30, background: 'radial-gradient(circle, rgba(124,58,237,0.05), transparent 70%)', opacity: 0.8 }} />
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-black text-[#0B3C5D] mb-3">
                جاهز تبدأ منصتك؟
              </h2>
              <p className="text-[#0B3C5D]/65 mb-8 text-lg">
                كلمنا دلوقتي وهنجهّزلك كل حاجة خلال 24 ساعة.
              </p>
              <a href={WHATSAPP} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 py-4 rounded-2xl text-base transition-all hover:scale-105 hover:shadow-xl hover:shadow-orange-500/25">
                <MessageCircle className="w-5 h-5" />
                تواصل معنا عبر واتساب
              </a>
            </div>
          </div>
        </Reveal>
      </section>

      <DevAccessPanel />

      {/* ── Footer ── */}
      <footer className="border-t border-slate-200 py-8 bg-white" style={{ position: 'relative', zIndex: 2 }}>
        <div className="max-w-6xl mx-auto px-5 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={wathbaLogo} alt="وثبة" className="h-8 object-contain rounded-xl shadow-sm" />
            <span className="text-[#0B3C5D]/70 text-sm font-semibold">منصة تعليمية متكاملة</span>
          </div>
          <p className="text-[#0B3C5D]/60 text-sm font-medium">
            © {new Date().getFullYear()} وثبة — جميع الحقوق محفوظة
          </p>
          <div className="flex items-center gap-4 text-[#0B3C5D]/70 text-sm font-semibold">
            <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="text-[#0B3C5D]/70 hover:text-orange-500 transition-colors">واتساب</a>
            <a href={`mailto:${EMAIL}`} className="text-[#0B3C5D]/70 hover:text-orange-500 transition-colors">البريد الإلكتروني</a>
            <a href="/terms" className="text-[#0B3C5D]/70 hover:text-orange-500 transition-colors">الشروط والأحكام</a>
            <a href="/privacy" className="text-[#0B3C5D]/70 hover:text-orange-500 transition-colors">سياسة الخصوصية</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
