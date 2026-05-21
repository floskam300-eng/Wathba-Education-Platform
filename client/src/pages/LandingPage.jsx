import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  GraduationCap, BookOpen, BarChart3, Play, FileText,
  Users, CheckCircle, ArrowLeft, Sparkles, Trophy,
  MessageCircle, ChevronDown, Target, CreditCard, Phone,
  Video, Gamepad2, Database, HelpCircle, Shield, Star,
  Zap, Clock, TrendingUp
} from 'lucide-react';
import wathbaLogo from '../assets/wathba_logo_transparent.png';
import { useTeacher } from '../context/TeacherContext';

/* ════════════════ DEMO COVERS ════════════════ */
const DEMO_COVERS = [
  'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=480&h=260&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1509228627152-72ae9ae6848d?w=480&h=260&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=480&h=260&fit=crop&auto=format',
];


/* ════════════════ HOOKS ════════════════ */
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

function useReveal(threshold = 0.12) {
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

/* ════════════════ PRIMITIVES ════════════════ */
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

function Orb({ size, top, left, color, delay = 0, dur = 10 }) {
  return (
    <div style={{
      position: 'absolute', width: size, height: size, top, left,
      borderRadius: '50%', background: color, filter: 'blur(90px)',
      opacity: 0.18, pointerEvents: 'none',
      animation: `lp-float ${dur}s ease-in-out ${delay}s infinite alternate`,
    }} />
  );
}

function SectionLabel({ text }) {
  return (
    <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/25 text-orange-400 text-xs font-bold px-4 py-1.5 rounded-full mb-5 tracking-widest uppercase">
      <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
      {text}
    </div>
  );
}

function SectionHeading({ pre, main, sub, accent = 'orange' }) {
  return (
    <div className="text-center mb-14">
      <SectionLabel text={pre} />
      <h2 className="font-black text-white mb-3" style={{ fontSize: 'clamp(1.9rem,4vw,2.8rem)' }}>
        {main}{' '}
        <span className={accent === 'purple' ? 'text-purple' : 'text-orange'}>{sub}</span>
      </h2>
      <div className="w-16 h-0.5 bg-gradient-to-l from-orange-500 to-transparent rounded-full mx-auto mt-4" />
    </div>
  );
}

/* ════════════════ FEATURE CARD ════════════════ */
function FeatureCard({ icon: Icon, title, desc, variant = 'orange', delay = 0 }) {
  const isPurple = variant === 'purple';
  return (
    <Reveal delay={delay}
      className="group relative bg-white/[0.04] border border-white/[0.08] rounded-2xl p-5 hover:border-orange-500/30 hover:bg-white/[0.07] transition-all duration-400 hover:-translate-y-1.5 cursor-default overflow-hidden">
      <div className={`absolute top-0 left-0 w-full h-0.5 ${isPurple ? 'bg-gradient-to-r from-transparent via-purple-500/60 to-transparent' : 'bg-gradient-to-r from-transparent via-orange-500/60 to-transparent'} opacity-0 group-hover:opacity-100 transition-opacity duration-400`} />
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${isPurple ? 'bg-purple-500/15 border border-purple-500/25' : 'bg-orange-500/15 border border-orange-500/25'} group-hover:scale-110 transition-transform duration-300`}>
        <Icon className={`w-5 h-5 ${isPurple ? 'text-purple-400' : 'text-orange-400'}`} />
      </div>
      <h3 className="font-black text-white text-sm mb-1.5 leading-snug">{title}</h3>
      <p className="text-white/45 text-xs leading-relaxed">{desc}</p>
    </Reveal>
  );
}

/* ════════════════ COURSE CARD ════════════════ */
function CourseCard({ course, index, delay = 0 }) {
  const [imgErr, setImgErr] = useState(false);
  const raw = course.thumbnail_url;
  const src = raw ? (raw.startsWith('http') ? raw : `/uploads/${raw}`) : null;
  const cover = (!imgErr && src) ? src : DEMO_COVERS[index % DEMO_COVERS.length];
  return (
    <Reveal delay={delay}
      className="group bg-white/[0.04] border border-white/[0.08] rounded-2xl overflow-hidden hover:border-orange-500/35 hover:-translate-y-2 transition-all duration-500" style={{ boxShadow: 'none' }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 8px 40px rgba(249,115,22,0.12)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
      <div className="h-44 relative overflow-hidden bg-[#0c1325]">
        <img src={cover} alt={course.name} onError={() => setImgErr(true)}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-600 opacity-80 group-hover:opacity-100" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#05080f] via-[#05080f]/20 to-transparent" />
        {course.price > 0 && (
          <div className="absolute top-3 right-3 bg-orange-500 text-white text-xs font-black px-2.5 py-1 rounded-lg">
            {parseFloat(course.price).toFixed(0)} جنيه
          </div>
        )}
        {course.target_stage && (
          <div className="absolute top-3 left-3 bg-black/50 backdrop-blur text-white/80 text-[10px] font-bold px-2 py-1 rounded-lg border border-white/15">
            {course.target_stage}
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="w-12 h-12 rounded-full bg-orange-500/95 flex items-center justify-center shadow-xl shadow-orange-500/40">
            <Play className="w-5 h-5 text-white ms-0.5" />
          </div>
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-black text-white text-sm leading-snug mb-1 group-hover:text-orange-300 transition-colors">{course.name}</h3>
        {course.description && (
          <p className="text-white/40 text-xs leading-relaxed line-clamp-2">{course.description}</p>
        )}
      </div>
    </Reveal>
  );
}

/* ════════════════ STAT CARD ════════════════ */
function StatCard({ icon: Icon, value, label, color, delay = 0 }) {
  return (
    <Reveal delay={delay}
      className={`relative bg-white/[0.04] border ${color.border} rounded-2xl p-6 text-center overflow-hidden group hover:-translate-y-1.5 transition-all duration-400`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${color.bg} opacity-0 group-hover:opacity-100 transition-opacity duration-400`} />
      <div className="relative z-10">
        <Icon className={`w-7 h-7 mx-auto mb-3 ${color.icon}`} />
        <p className={`text-3xl font-black mb-1 ${color.icon}`}>{value.toLocaleString('ar-EG')}+</p>
        <p className="text-white/45 text-xs font-semibold">{label}</p>
      </div>
    </Reveal>
  );
}

/* ════════════════ MAIN PAGE ════════════════ */
export default function LandingPage() {
  const { teacher, stats, courses: rawCourses, assistants, isLoading, teacherSlug, platformName, logoUrl } = useTeacher();
  const [statsVisible, setStatsVisible] = useState(false);
  const statsRef = useRef(null);

  const courses    = (rawCourses || []).slice(0, 3);
  const displayLogo = logoUrl || wathbaLogo;

  const sCount = useCounter(parseInt(stats?.total_students || 0), 2000, statsVisible);
  const cCount = useCounter(parseInt(stats?.total_courses  || 0), 1600, statsVisible);
  const eCount = useCounter(parseInt(stats?.total_exams    || 0), 1800, statsVisible);
  const rCount = useCounter(parseInt(stats?.total_results  || 0), 2200, statsVisible);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setStatsVisible(true); obs.disconnect(); } },
      { threshold: 0.3 }
    );
    if (statsRef.current) obs.observe(statsRef.current);
    return () => obs.disconnect();
  }, []);

  const scrollTo = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  const features = [
    { icon: Play,          title: 'فيديوهات تعليمية',   desc: 'محتوى فيديو منظم داخل كل كورس مع تتبع تقدم مشاهدة كل طالب بدقة.',              variant: 'orange' },
    { icon: Target,        title: 'امتحانات تفاعلية',   desc: 'أسئلة MCQ وصح/خطأ ومقالي — نتائج فورية مع تحليل تفصيلي لكل إجابة.',            variant: 'purple' },
    { icon: Video,         title: 'بث مباشر',            desc: 'حصص أونلاين مع شات وعرض اليد وتتبع الحضور والغياب في الوقت الفعلي.',            variant: 'orange' },
    { icon: BarChart3,     title: 'تحليلات متقدمة',     desc: 'رسوم بيانية تفاعلية لمتابعة أداء كل طالب وتحديد نقاط الضعف والقوة.',           variant: 'purple' },
    { icon: Trophy,        title: 'نقاط ولوحة الشرف',   desc: 'نظام مكافآت يحفّز الطلاب مع لوحة متصدرين شهرية تُعاد تلقائياً.',               variant: 'orange' },
    { icon: Gamepad2,      title: 'ألعاب تعليمية',       desc: 'لعبة Stickman Run أسبوعية بأسئلة علمية — تحفيز التعلم من خلال المتعة.',         variant: 'purple' },
    { icon: Phone,         title: 'بوابة أولياء الأمور', desc: 'ولي الأمر يتابع نتائج ابنه فوراً — امتحانات وكورسات ونقاط — برقم هاتفه.',      variant: 'orange' },
    { icon: HelpCircle,    title: 'بنك الأسئلة',         desc: 'مكتبة أسئلة منظمة يختار منها المعلم لبناء امتحاناته بسرعة واحترافية.',          variant: 'purple' },
    { icon: FileText,      title: 'تقارير PDF',           desc: 'تقارير أداء مفصلة قابلة للطباعة لأولياء الأمور والمتابعة الأكاديمية.',          variant: 'orange' },
    { icon: CreditCard,    title: 'دفع إلكتروني',        desc: 'نظام مدفوعات يدعم فودافون كاش وإنستاباي مع تحقق فوري وتتبع كامل.',              variant: 'purple' },
    { icon: Shield,        title: 'مساعدون بصلاحيات',    desc: 'أضف مساعدين مع تحكم دقيق في 9 صلاحيات مختلفة لكل مساعد على حدة.',              variant: 'orange' },
    { icon: Database,      title: 'نسخ احتياطية',        desc: 'تصدير واستيراد بيانات الطلاب بصيغة Excel مع سجل كامل لكل العمليات.',            variant: 'purple' },
  ];

  return (
    <div className="min-h-screen bg-[#05080f] text-white overflow-x-hidden" dir="rtl">
      <style>{`
        @keyframes lp-float {
          from { transform:translate(0,0) scale(1); }
          to   { transform:translate(20px,-30px) scale(1.1); }
        }
        @keyframes lp-fade {
          from { opacity:0; transform:translateY(22px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes lp-spin { to { transform:rotate(360deg); } }
        @keyframes lp-pulse {
          0%,100% { opacity:.35; transform:scale(1); }
          50%     { opacity:.65; transform:scale(1.04); }
        }
        .lp-fade-1 { animation:lp-fade .85s ease .1s both; }
        .lp-fade-2 { animation:lp-fade .85s ease .3s both; }
        .lp-fade-3 { animation:lp-fade .85s ease .5s both; }
        .lp-fade-4 { animation:lp-fade .85s ease .85s both; }
        .lp-ring-spin  { animation:lp-spin 22s linear infinite; }
        .lp-ring-pulse { animation:lp-pulse 4s ease-in-out infinite; }
        .text-orange { color:#f97316; }
        .text-purple { color:#a78bfa; }
        .grad-orange {
          background:linear-gradient(135deg,#fff 0%,#f97316 55%,#fb923c 100%);
          -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
        }
        .grad-purple {
          background:linear-gradient(135deg,#a78bfa 0%,#7c3aed 100%);
          -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
        }
        .nav-glass { backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px); }
        .dot-grid {
          background-image:radial-gradient(rgba(255,255,255,.06) 1px,transparent 1px);
          background-size:32px 32px;
        }
        .line-clamp-2 { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
      `}</style>

      {/* ─────────────── NAVBAR ─────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 nav-glass border-b border-white/[0.07] bg-[#05080f]/85">
        <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between gap-4">
          <img src={displayLogo} alt={platformName} className="h-11 w-auto rounded-xl" />

          <div className="hidden md:flex items-center gap-1">
            {[['about','عن المعلم'],['courses','الكورسات'],['features','المميزات'],['assistants','فريق الدعم']].map(([id, label]) => (
              <button key={id} onClick={() => scrollTo(id)}
                className="text-white/50 hover:text-white text-sm font-semibold px-3 py-2 rounded-lg hover:bg-white/[0.06] transition-all duration-200">
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link to={`/${teacherSlug}/parent-portal`}
              className="hidden sm:flex items-center gap-1.5 text-white/60 hover:text-white text-sm font-semibold px-3 py-2 rounded-lg border border-white/[0.1] hover:border-white/25 hover:bg-white/[0.06] transition-all duration-200">
              <Phone className="w-3.5 h-3.5" />
              بوابة الأهل
            </Link>
            <Link to={`/${teacherSlug}/login`}
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white font-black text-sm px-5 py-2.5 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-orange-500/25 active:scale-95">
              دخول
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ─────────────── HERO ─────────────── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden dot-grid pt-16">
        <div className="absolute inset-0 bg-[#05080f]" />
        <Orb size="700px" top="-200px" left="-150px" color="radial-gradient(circle,#7c3aed,transparent)" dur={12} />
        <Orb size="600px" top="30%"   left="55%"    color="radial-gradient(circle,#f97316,transparent)" delay={2} dur={10} />

        <div className="absolute w-[600px] h-[600px] rounded-full border border-white/[0.04] lp-ring-spin" />
        <div className="absolute w-[420px] h-[420px] rounded-full border border-orange-500/[0.07] lp-ring-pulse" />

        <div className="relative z-10 text-center max-w-4xl mx-auto px-5">
          <div className="lp-fade-1 inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-bold px-4 py-2 rounded-full mb-8 tracking-widest uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            منصة تعليمية متكاملة
          </div>

          <h1 className="lp-fade-2 font-black leading-tight mb-5" style={{ fontSize: 'clamp(2.4rem,6vw,4.5rem)' }}>
            {isLoading ? (
              <span className="grad-orange">{platformName || 'منصة وثبة'}</span>
            ) : (
              <>
                <span className="text-white/80">تعلّم مع </span>
                <span className="grad-orange">{teacher?.name || platformName || 'منصة وثبة'}</span>
              </>
            )}
            <br />
            <span className="text-white/40 font-bold" style={{ fontSize: '0.45em', letterSpacing: '0.02em' }}>
              {teacher?.classification || 'المنصة التعليمية المتكاملة'}
            </span>
          </h1>

          <p className="lp-fade-3 text-white/50 text-base max-w-xl mx-auto leading-relaxed mb-10">
            {teacher?.bio
              ? teacher.bio.slice(0, 120) + (teacher.bio.length > 120 ? '...' : '')
              : 'منصة تعليمية احترافية تجمع الكورسات والامتحانات والتحليلات في مكان واحد'}
          </p>

          <div className="lp-fade-3 flex items-center justify-center gap-3 flex-wrap">
            <Link to={`/${teacherSlug}/login`}
              className="flex items-center gap-2.5 bg-orange-500 hover:bg-orange-400 text-white font-black text-sm px-7 py-3.5 rounded-xl transition-all duration-200 hover:shadow-xl hover:shadow-orange-500/30 hover:-translate-y-0.5 active:scale-95">
              ابدأ الآن
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <button onClick={() => scrollTo('courses')}
              className="flex items-center gap-2 bg-white/[0.06] hover:bg-white/10 border border-white/[0.1] hover:border-white/25 text-white font-bold text-sm px-7 py-3.5 rounded-xl transition-all duration-200">
              <BookOpen className="w-4 h-4 text-orange-400" />
              الكورسات
            </button>
          </div>

          <button onClick={() => scrollTo('stats')}
            className="lp-fade-4 mt-16 flex flex-col items-center gap-1.5 mx-auto text-white/25 hover:text-white/50 transition-colors">
            <span className="text-[11px] font-semibold tracking-widest uppercase">اكتشف</span>
            <ChevronDown className="w-4 h-4 animate-bounce" />
          </button>
        </div>
      </section>

      {/* ─────────────── STATS ─────────────── */}
      <section id="stats" ref={statsRef} className="relative py-16 bg-[#05080f]">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a0d18]/60 to-transparent pointer-events-none" />
        <div className="relative z-10 max-w-5xl mx-auto px-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Users}    value={sCount} label="طالب مسجّل"  delay={0}    color={{ icon:'text-orange-400', bg:'from-orange-500/8 to-transparent', border:'border-orange-500/15' }} />
            <StatCard icon={BookOpen} value={cCount} label="كورس تعليمي" delay={0.08} color={{ icon:'text-purple-400', bg:'from-purple-500/8 to-transparent', border:'border-purple-500/15' }} />
            <StatCard icon={Target}   value={eCount} label="امتحان متاح"  delay={0.16} color={{ icon:'text-orange-400', bg:'from-orange-500/8 to-transparent', border:'border-orange-500/15' }} />
            <StatCard icon={BarChart3} value={rCount} label="نتيجة محللة" delay={0.24} color={{ icon:'text-purple-400', bg:'from-purple-500/8 to-transparent', border:'border-purple-500/15' }} />
          </div>
        </div>
      </section>

      {/* ─────────────── ABOUT ─────────────── */}
      <section id="about" className="relative py-24 overflow-hidden bg-[#070b15]">
        <Orb size="500px" top="-100px" left="-200px" color="radial-gradient(circle,#7c3aed,transparent)" dur={14} />
        <Orb size="400px" top="50%"   left="70%"    color="radial-gradient(circle,#f97316,transparent)" delay={3} dur={11} />

        <div className="relative z-10 max-w-6xl mx-auto px-5">
          <Reveal className="text-center">
            <SectionLabel text="من نحن" />
            <h2 className="font-black text-white mb-3" style={{ fontSize: 'clamp(1.9rem,4vw,2.8rem)' }}>
              عن <span className="grad-orange">المعلم</span>
            </h2>
            <div className="w-16 h-0.5 bg-gradient-to-l from-orange-500 to-transparent rounded-full mx-auto mt-4 mb-14" />
          </Reveal>

          <div className="grid lg:grid-cols-5 gap-10 items-start">
            {/* ── Left panel: teacher card ── */}
            <Reveal delay={0.1} className="lg:col-span-2">
              <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-7 text-center">
                <div className="relative inline-block mb-5">
                  {teacher?.photo_url ? (
                    <img
                      src={teacher.photo_url.startsWith('http') ? teacher.photo_url : `/uploads/${teacher.photo_url}`}
                      alt={teacher.name}
                      className="w-28 h-28 rounded-2xl object-cover shadow-xl shadow-orange-500/25 mx-auto border-2 border-orange-500/30"
                      onError={e => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-700 items-center justify-center text-4xl font-black text-white shadow-xl shadow-orange-500/25 mx-auto"
                    style={{ display: teacher?.photo_url ? 'none' : 'flex' }}>
                    {teacher?.name?.charAt(0) || 'م'}
                  </div>
                  <div className="absolute -bottom-2 -left-2 w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg border-2 border-[#070b15]">
                    <CheckCircle className="w-4 h-4 text-white" />
                  </div>
                </div>

                <h3 className="font-black text-white text-xl mb-1">{teacher?.name || '—'}</h3>
                <p className="text-orange-400 text-sm font-semibold mb-6">{teacher?.classification || '—'}</p>

                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { label: 'الطلاب',    value: stats?.total_students || '—', icon: Users },
                    { label: 'الكورسات',  value: stats?.total_courses  || '—', icon: BookOpen },
                    { label: 'الامتحانات',value: stats?.total_exams    || '—', icon: Target },
                    { label: 'النتائج',   value: stats?.total_results  || '—', icon: BarChart3 },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="bg-white/[0.04] border border-white/[0.07] rounded-xl p-3 text-center">
                      <Icon className="w-3.5 h-3.5 mx-auto text-orange-400/70 mb-1" />
                      <p className="font-black text-white text-base">{value}</p>
                      <p className="text-white/35 text-[10px] font-semibold">{label}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-5 border-t border-white/[0.07] pt-4">
                  <p className="text-white/30 text-xs">للانضمام تواصل مع فريق الدعم أسفل الصفحة</p>
                </div>
              </div>
            </Reveal>

            {/* ── Right panel: bio + timeline ── */}
            <div className="lg:col-span-3 space-y-4">
              <Reveal delay={0.15}>
                <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/15 border border-orange-500/20 flex items-center justify-center">
                      <Star className="w-4 h-4 text-orange-400" />
                    </div>
                    <p className="font-black text-white text-base">من أنا؟</p>
                  </div>
                  <p className="text-white/55 text-sm leading-relaxed">
                    {teacher?.bio || 'معلم متخصص بخبرة واسعة في التدريس، يهتم بتقديم المحتوى التعليمي بأسلوب مبسط ومشوق لمساعدة الطلاب على التفوق وتحقيق أعلى الدرجات.'}
                  </p>
                </div>
              </Reveal>

              {[
                { icon: GraduationCap, title: 'خبرة تعليمية متميزة',  desc: 'سنوات من التدريس الاحترافي لطلاب المراحل المختلفة بأسلوب محترف.',     delay: 0.2 },
                { icon: Zap,           title: 'أسلوب تعليمي مبتكر',   desc: 'طريقة حديثة تجمع الشرح الواضح والتدريب المكثف على النماذج والأسئلة.', delay: 0.25 },
                { icon: Trophy,        title: 'نتائج طلاب مشرّفة',     desc: 'عدد كبير من الطلاب حققوا درجات امتياز وتفوق في المراحل الدراسية.',     delay: 0.3 },
                { icon: Clock,         title: 'متابعة مستمرة',         desc: 'متابعة دورية لأداء كل طالب مع إرسال تقارير منتظمة لأولياء الأمور.',    delay: 0.35 },
              ].map(({ icon: Icon, title, desc, delay }) => (
                <Reveal key={title} delay={delay}>
                  <div className="flex items-start gap-3.5 bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 hover:bg-white/[0.055] transition-colors duration-200">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/12 border border-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="w-4 h-4 text-purple-400" />
                    </div>
                    <div>
                      <p className="font-black text-white text-sm mb-0.5">{title}</p>
                      <p className="text-white/45 text-xs leading-relaxed">{desc}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────── ASSISTANTS ─────────────── */}
      {assistants.length > 0 && (
        <section id="assistants" className="relative py-20 overflow-hidden bg-[#05080f]">
          <Orb size="500px" top="0"   left="60%"    color="radial-gradient(circle,#f97316,transparent)" dur={11} />
          <Orb size="400px" top="40%" left="-100px" color="radial-gradient(circle,#7c3aed,transparent)" delay={2} dur={13} />

          <div className="relative z-10 max-w-4xl mx-auto px-5">
            <Reveal className="text-center">
              <SectionLabel text="انضم إلينا" />
              <h2 className="font-black text-white mb-2" style={{ fontSize: 'clamp(1.9rem,4vw,2.8rem)' }}>
                تواصل مع <span className="grad-orange">فريق الدعم</span>
              </h2>
              <p className="text-white/40 text-sm max-w-md mx-auto mt-3 mb-1">للاستفسار عن الكورسات أو التسجيل في المنصة، راسل أحد المساعدين مباشرةً</p>
              <div className="w-16 h-0.5 bg-gradient-to-l from-orange-500 to-transparent rounded-full mx-auto mt-4 mb-12" />
            </Reveal>

            <div className={`grid gap-4 ${
              assistants.length === 1 ? 'max-w-xs mx-auto' :
              assistants.length === 2 ? 'sm:grid-cols-2 max-w-lg mx-auto' :
              'sm:grid-cols-2 lg:grid-cols-3'
            }`}>
              {assistants.map((a, i) => (
                <Reveal key={a.id} delay={i * 0.08}
                  className="group bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 text-center hover:border-orange-500/30 hover:-translate-y-1.5 transition-all duration-400 overflow-hidden relative">
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-400" />

                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-700/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                    <span className="text-xl font-black text-orange-300">{a.name?.charAt(0) || '؟'}</span>
                  </div>

                  <h3 className="font-black text-white text-base mb-0.5">{a.name}</h3>
                  <p className="text-white/35 text-xs mb-5">مساعد تسجيل ودعم</p>

                  {a.phone ? (
                    <a href={`https://wa.me/${a.phone.replace(/\D/g, '')}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/25 hover:border-orange-500/50 text-orange-300 font-bold text-sm px-4 py-2.5 rounded-xl transition-all duration-200 active:scale-95">
                      <MessageCircle className="w-4 h-4" />
                      {a.phone}
                    </a>
                  ) : (
                    <div className="flex items-center justify-center gap-2 w-full bg-white/[0.04] border border-white/[0.08] text-white/25 text-xs px-4 py-2.5 rounded-xl">
                      <Phone className="w-3.5 h-3.5" />
                      رقم غير متاح
                    </div>
                  )}
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─────────────── COURSES ─────────────── */}
      <section id="courses" className="relative py-24 overflow-hidden bg-[#070b15]">
        <Orb size="600px" top="20%" left="50%" color="radial-gradient(circle,#f97316,transparent)" dur={12} />

        <div className="relative z-10 max-w-5xl mx-auto px-5">
          <Reveal className="text-center">
            <SectionLabel text="تعلّم معنا" />
            <h2 className="font-black text-white mb-2" style={{ fontSize: 'clamp(1.9rem,4vw,2.8rem)' }}>
              أبرز <span className="grad-orange">الكورسات</span>
            </h2>
            <p className="text-white/40 text-sm mt-3 mb-1">أفضل ٣ كورسات مدفوعة — محتوى احترافي يأخذك خطوة للأمام</p>
            <div className="w-16 h-0.5 bg-gradient-to-l from-orange-500 to-transparent rounded-full mx-auto mt-4 mb-14" />
          </Reveal>

          {isLoading ? (
            <div className="grid sm:grid-cols-3 gap-5">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-56 rounded-2xl bg-white/[0.04] animate-pulse border border-white/[0.06]" />
              ))}
            </div>
          ) : courses.length > 0 ? (
            <div className="grid sm:grid-cols-3 gap-5">
              {courses.map((c, i) => <CourseCard key={c.id} course={c} index={i} delay={i * 0.1} />)}
            </div>
          ) : (
            <div className="text-center py-16 text-white/25">
              <BookOpen className="w-12 h-12 mx-auto mb-3" />
              <p className="text-sm font-semibold">لا توجد كورسات بعد</p>
            </div>
          )}

          <Reveal delay={0.3} className="text-center mt-8">
            <Link to={`/${teacherSlug}/login`}
              className="inline-flex items-center gap-2 text-white/50 hover:text-orange-400 text-sm font-bold border border-white/[0.1] hover:border-orange-500/40 px-6 py-2.5 rounded-xl transition-all duration-200">
              عرض جميع الكورسات
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ─────────────── FEATURES ─────────────── */}
      <section id="features" className="relative py-24 overflow-hidden bg-[#05080f]">
        <Orb size="600px" top="-50px"  left="-150px" color="radial-gradient(circle,#7c3aed,transparent)" dur={13} />
        <Orb size="500px" top="60%"    left="70%"    color="radial-gradient(circle,#f97316,transparent)" delay={2} dur={10} />

        <div className="relative z-10 max-w-6xl mx-auto px-5">
          <Reveal className="text-center">
            <SectionLabel text="لماذا وثبة؟" />
            <h2 className="font-black text-white mb-2" style={{ fontSize: 'clamp(1.9rem,4vw,2.8rem)' }}>
              مميزات <span className="grad-purple">المنصة</span>
            </h2>
            <p className="text-white/40 text-sm mt-3 mb-1">كل الأدوات التي يحتاجها المعلم والطالب في مكان واحد</p>
            <div className="w-16 h-0.5 bg-gradient-to-l from-purple-500 to-transparent rounded-full mx-auto mt-4 mb-14" />
          </Reveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {features.map((f, i) => (
              <FeatureCard key={f.title} {...f} delay={i * 0.04} />
            ))}
          </div>

          <Reveal delay={0.5} className="text-center mt-8">
            <p className="text-white/25 text-xs">
              <span className="text-orange-400 font-bold">{features.length}</span> ميزة متكاملة في منصة واحدة
            </p>
          </Reveal>
        </div>
      </section>

      {/* ─────────────── CTA ─────────────── */}
      <section className="relative py-24 overflow-hidden bg-[#070b15]">
        <Orb size="700px" top="50%" left="50%" color="radial-gradient(circle,#f97316,transparent)" dur={9} />

        <div className="relative z-10 max-w-2xl mx-auto px-5 text-center">
          <Reveal>
            <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-bold px-4 py-2 rounded-full mb-8 tracking-widest uppercase">
              <Sparkles className="w-3.5 h-3.5" />
              ابدأ رحلتك الآن
            </div>
            <h2 className="font-black text-white mb-5 leading-tight" style={{ fontSize: 'clamp(2rem,5vw,3.2rem)' }}>
              جاهز تبدأ؟
              <br />
              <span className="grad-orange">سجّل دخولك الآن</span>
            </h2>
            <p className="text-white/40 text-sm mb-10 leading-relaxed max-w-md mx-auto">
              انضم لمنصة وثبة وابدأ رحلتك مع أفضل المحتوى التعليمي والامتحانات التفاعلية
            </p>
            <Link to={`/${teacherSlug}/login`}
              className="inline-flex items-center gap-3 bg-orange-500 hover:bg-orange-400 text-white font-black text-base px-10 py-4 rounded-2xl transition-all duration-200 hover:shadow-2xl hover:shadow-orange-500/30 hover:-translate-y-1 active:scale-95">
              <GraduationCap className="w-5 h-5" />
              تسجيل الدخول
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ─────────────── FOOTER ─────────────── */}
      <footer className="border-t border-white/[0.07] py-8 bg-[#05080f]">
        <div className="max-w-7xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={displayLogo} alt={platformName} className="h-9 w-auto opacity-80 rounded-xl" />
            <span className="text-white/25 text-xs">المنصة التعليمية المتكاملة</span>
          </div>
          <div className="flex items-center gap-1">
            {[['about','عن المعلم'],['courses','الكورسات'],['features','المميزات'],['assistants','فريق الدعم']].map(([id, label]) => (
              <button key={id} onClick={() => scrollTo(id)}
                className="text-white/35 hover:text-orange-400 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 text-white/30 text-xs">
            <p>© {new Date().getFullYear()} {platformName || 'وثبة'}</p>
            <span className="text-white/15">|</span>
            <Link to="/terms" className="hover:text-orange-400 transition-colors">الشروط والأحكام</Link>
            <Link to="/privacy" className="hover:text-orange-400 transition-colors">سياسة الخصوصية</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
