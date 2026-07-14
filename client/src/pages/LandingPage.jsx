import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  GraduationCap, BookOpen, BarChart3,
  Users, CheckCircle, ArrowLeft, Sparkles, Trophy,
  MessageCircle, ChevronDown, Target, Phone,
  Shield, Star, Zap, Clock, Flame, Tag
} from 'lucide-react';
import wathbaLogo from '../assets/wathba_logo_transparent.png';
import { useTeacher } from '../context/TeacherContext';





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

function SectionLabel({ text }) {
  return (
    <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-600 text-xs font-bold px-4 py-1.5 rounded-full mb-5 tracking-widest uppercase">
      <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
      {text}
    </div>
  );
}





/* ════════════════ MAIN PAGE ════════════════ */
const DEFAULT_TEACHER_BG = 'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=1600&q=80';

export default function LandingPage() {
  const { teacher, stats, supportContacts, topCourses, isLoading, platformName, logoUrl } = useTeacher();
  const displayLogo = logoUrl || wathbaLogo;
  const heroBg = teacher?.background_image_url || DEFAULT_TEACHER_BG;



  useEffect(() => {
    document.title = teacher?.name ? `${teacher.name} — الرئيسية` : platformName || 'وثبة';
    const favicon = document.querySelector("link[rel='icon']");
    if (favicon && logoUrl) favicon.href = logoUrl;
  }, [teacher, platformName, logoUrl]);

  const scrollTo = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });



  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0B3C5D] overflow-x-hidden relative" dir="rtl">

      {/* ── Fixed full page background with gradient, dot-grid, and soft ambient orbs ── */}
      <div className="fixed inset-0 pointer-events-none select-none overflow-hidden bg-gradient-to-br from-white via-[#F4F6F9] to-[#E9EDF0]" style={{ zIndex: 0 }}>
        <div className="absolute inset-0 opacity-60 dot-grid" />
        <div style={{ position: 'absolute', width: '700px', height: '700px', top: '-200px', left: '-150px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(124,58,237,0.05),transparent 70%)', filter: 'blur(95px)', animation: 'lp-float 15s ease-in-out infinite alternate' }} />
        <div style={{ position: 'absolute', width: '600px', height: '600px', top: '40%', right: '-100px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(249,115,22,0.05),transparent 70%)', filter: 'blur(90px)', animation: 'lp-float 12s ease-in-out 2s infinite alternate' }} />
        <div style={{ position: 'absolute', width: '500px', height: '500px', top: '75%', left: '-120px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(11,60,93,0.04),transparent 70%)', filter: 'blur(90px)', animation: 'lp-float 18s ease-in-out 4s infinite alternate' }} />
      </div>

      {/* ══ Fixed side decorations — visible on entire page ══ */}
      <div className="fixed left-0 top-0 h-full w-[260px] overflow-hidden pointer-events-none hidden xl:block opacity-40" style={{ zIndex: 1 }}>
        <svg className="w-full h-full" viewBox="0 0 260 900" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M-80,0 Q60,200 -30,400 T10,700 Q-80,820 -180,900 L-180,0 Z" fill="#0B3C5D" fillOpacity="0.05" />
          <path d="M-60,0 Q90,220 0,420 T20,680 Q-90,800 -180,900 L-180,0 Z" fill="#f97316" fillOpacity="0.06" />
          <path d="M-10,0 Q130,220 0,440 T20,760 Q-60,840 -110,900" stroke="#0B3C5D" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
          <path d="M-30,0 Q100,230 -10,430 T10,770 Q-80,850 -130,900" stroke="#f97316" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
          <circle cx="40" cy="160" r="90" stroke="#0B3C5D" strokeOpacity="0.04" strokeWidth="1.5" />
          <circle cx="40" cy="160" r="60" stroke="#0B3C5D" strokeOpacity="0.04" strokeWidth="1.5" />
          <circle cx="-10" cy="580" r="110" stroke="#f97316" strokeOpacity="0.04" strokeWidth="1.5" />
          <circle cx="-10" cy="580" r="75" stroke="#f97316" strokeOpacity="0.04" strokeWidth="1.5" />
        </svg>
        <div className="absolute top-[22%] left-[90px] text-2xl animate-bounce" style={{ animationDuration: '4s' }}>💡</div>
        <div className="absolute top-[60%] left-[70px] text-xl animate-pulse" style={{ animationDuration: '3s' }}>💡</div>
      </div>

      <div className="fixed right-0 top-0 h-full w-[260px] overflow-hidden pointer-events-none hidden xl:block opacity-40" style={{ zIndex: 1 }}>
        <svg className="w-full h-full" viewBox="0 0 260 900" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M340,0 Q230,200 330,400 T280,700 Q380,820 460,900 L460,0 Z" fill="#0B3C5D" fillOpacity="0.05" />
          <path d="M320,0 Q210,220 310,420 T270,680 Q390,800 460,900 L460,0 Z" fill="#f97316" fillOpacity="0.06" />
          <path d="M270,0 Q170,220 280,440 T240,760 Q320,840 370,900" stroke="#0B3C5D" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
          <path d="M290,0 Q190,230 270,430 T250,770 Q340,850 390,900" stroke="#f97316" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
          <circle cx="220" cy="300" r="95" stroke="#0B3C5D" strokeOpacity="0.04" strokeWidth="1.5" />
          <circle cx="220" cy="300" r="65" stroke="#0B3C5D" strokeOpacity="0.04" strokeWidth="1.5" />
          <circle cx="250" cy="680" r="85" stroke="#f97316" strokeOpacity="0.04" strokeWidth="1.5" />
          <circle cx="250" cy="680" r="55" stroke="#f97316" strokeOpacity="0.04" strokeWidth="1.5" />
        </svg>
        <div className="absolute top-[35%] right-[80px] text-2xl animate-bounce" style={{ animationDuration: '5s' }}>💡</div>
        <div className="absolute top-[62%] right-[100px] animate-pulse" style={{ animationDuration: '2.5s' }}>
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/15 flex items-center justify-center">
            <Shield className="w-4 h-4 text-blue-500" />
          </div>
        </div>
      </div>

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
        .text-purple { color:#7c3aed; }
        .grad-orange {
          background:linear-gradient(135deg,#0b3c5d 30%,#f97316 100%);
          -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
        }
        .grad-purple {
          background:linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%);
          -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
        }
        .nav-glass { backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px); }
        .dot-grid {
          background-image:radial-gradient(rgba(11,60,93,.06) 1px,transparent 1px);
          background-size:32px 32px;
        }
        .line-clamp-2 { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
      `}</style>

      {/* Navbar */}
      <nav className="fixed top-0 inset-x-0 z-50 nav-glass border-b border-[#0B3C5D]/10 bg-white/80">
        <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between gap-4">
          <img src={displayLogo} alt={platformName} className="h-11 w-auto rounded-xl shadow-sm" />

          <div className="hidden md:flex items-center gap-1">
            {[['about','عن المعلم'],['support','فريق الدعم']].map(([id, label]) => (
              <button key={id} onClick={() => scrollTo(id)}
                className="text-[#0B3C5D]/70 hover:text-[#0B3C5D] text-sm font-semibold px-3 py-2 rounded-lg hover:bg-[#0B3C5D]/5 transition-all duration-200">
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link to="/parent-portal"
              className="hidden sm:flex items-center gap-1.5 text-[#0B3C5D]/75 hover:text-[#0B3C5D] text-sm font-semibold px-3 py-2 rounded-lg border border-[#0B3C5D]/15 hover:border-[#0B3C5D]/30 hover:bg-[#0B3C5D]/5 transition-all duration-200">
              <Phone className="w-3.5 h-3.5 text-orange-500" />
              بوابة الأهل
            </Link>
            <Link to="/login"
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-black text-sm px-5 py-2.5 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-orange-500/25 active:scale-95">
              دخول
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ─────────────── HERO ─────────────── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16" style={{ zIndex: 1 }}>
        {/* Teacher background image with dark gradient overlay for text legibility */}
        <div className="absolute inset-0 overflow-hidden">
          <img src={heroBg} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-white/95 via-white/90 to-[#F8FAFC]" />
        </div>

        <div className="absolute w-[600px] h-[600px] rounded-full border border-[#0B3C5D]/[0.03] lp-ring-spin" />
        <div className="absolute w-[420px] h-[420px] rounded-full border border-orange-500/[0.05] lp-ring-pulse" />

        <div className="relative z-10 max-w-6xl mx-auto px-5 grid lg:grid-cols-5 gap-10 items-center">
          {/* Large teacher photo */}
          <Reveal delay={0.05} className="order-1 lg:order-2 lg:col-span-2 flex justify-center">
            <div className="relative">
              <div className="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-orange-500/25 to-[#0B3C5D]/15 blur-xl" />
              {teacher?.photo_url ? (
                <img
                  src={teacher.photo_url.startsWith('http') ? teacher.photo_url : `/uploads/${teacher.photo_url}`}
                  alt={teacher?.name}
                  className="relative w-56 h-56 sm:w-64 sm:h-64 lg:w-72 lg:h-72 rounded-[2rem] object-cover shadow-2xl shadow-orange-500/20 border-4 border-white"
                  onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                />
              ) : null}
              <div className="relative w-56 h-56 sm:w-64 sm:h-64 lg:w-72 lg:h-72 rounded-[2rem] bg-gradient-to-br from-orange-500 to-orange-700 items-center justify-center text-6xl font-black text-white shadow-2xl shadow-orange-500/20 border-4 border-white"
                style={{ display: teacher?.photo_url ? 'none' : 'flex' }}>
                {teacher?.name?.charAt(0) || 'م'}
              </div>
            </div>
          </Reveal>

          <div className="order-2 lg:order-1 lg:col-span-3 text-center lg:text-right">
            <div className="lp-fade-1 inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-600 text-xs font-bold px-4 py-2 rounded-full mb-8 tracking-widest uppercase">
              <Sparkles className="w-3.5 h-3.5 text-orange-500 animate-pulse" />
              منصة تعليمية متكاملة
            </div>

            <h1 className="lp-fade-2 font-black leading-tight mb-5 text-[#0B3C5D]" style={{ fontSize: 'clamp(2.4rem,6vw,4.5rem)' }}>
              {isLoading ? (
                <span className="grad-orange">{platformName || 'منصة وثبة'}</span>
              ) : (
                <>
                  <span className="text-[#0B3C5D]/90">تعلّم مع </span>
                  <span className="grad-orange">{teacher?.name || platformName || 'منصة وثبة'}</span>
                </>
              )}
              <br />
              <span className="text-[#0B3C5D]/45 font-bold" style={{ fontSize: '0.45em', letterSpacing: '0.02em' }}>
                {teacher?.classification || 'المنصة التعليمية المتكاملة'}
              </span>
            </h1>

            <p className="lp-fade-3 text-slate-500 text-base max-w-xl mx-auto lg:mx-0 leading-relaxed mb-10">
              {teacher?.bio
                ? teacher.bio.slice(0, 120) + (teacher.bio.length > 120 ? '...' : '')
                : 'منصة تعليمية احترافية تجمع الكورسات والامتحانات والتحليلات في مكان واحد'}
            </p>

            <div className="lp-fade-3 flex items-center justify-center lg:justify-start gap-3 flex-wrap">
              <Link to="/login"
                className="flex items-center gap-2.5 bg-orange-500 hover:bg-orange-600 text-white font-black text-sm px-7 py-3.5 rounded-xl transition-all duration-200 hover:shadow-xl hover:shadow-orange-500/30 hover:-translate-y-0.5 active:scale-95">
                ابدأ الآن
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>

        <button onClick={() => scrollTo('about')}
          className="lp-fade-4 absolute bottom-8 inset-x-0 flex flex-col items-center gap-1.5 mx-auto text-[#0B3C5D]/30 hover:text-[#0B3C5D]/50 transition-colors z-10">
          <span className="text-[11px] font-semibold tracking-widest uppercase">اكتشف</span>
          <ChevronDown className="w-4 h-4 animate-bounce" />
        </button>
      </section>

      {/* ─────────────── ABOUT ─────────────── */}
      <section id="about" className="relative py-24 overflow-hidden" style={{ zIndex: 1 }}>
        <div className="relative z-10 max-w-6xl mx-auto px-5">
          <Reveal className="text-center">
            <SectionLabel text="من نحن" />
            <h2 className="font-black text-[#0B3C5D] mb-3" style={{ fontSize: 'clamp(1.9rem,4vw,2.8rem)' }}>
              عن <span className="grad-orange">المعلم</span>
            </h2>
            <div className="w-16 h-0.5 bg-gradient-to-l from-orange-500 to-transparent rounded-full mx-auto mt-4 mb-14" />
          </Reveal>

          <div className="grid lg:grid-cols-5 gap-10 items-start">
            {/* ── Left panel: teacher card ── */}
            <Reveal delay={0.1} className="lg:col-span-2">
              <div className="bg-white border border-slate-200/80 rounded-2xl p-7 text-center shadow-sm">
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
                  <div className="absolute -bottom-2 -left-2 w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg border-2 border-white">
                    <CheckCircle className="w-4 h-4 text-white" />
                  </div>
                </div>

                <h3 className="font-black text-[#0B3C5D] text-xl mb-1">{teacher?.name || '—'}</h3>
                <p className="text-orange-500 text-sm font-semibold mb-6">{teacher?.classification || '—'}</p>

                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { label: 'الطلاب',    value: stats?.total_students || '—', icon: Users },
                    { label: 'الكورسات',  value: stats?.total_courses  || '—', icon: BookOpen },
                    { label: 'الامتحانات',value: stats?.total_exams    || '—', icon: Target },
                    { label: 'النتائج',   value: stats?.total_results  || '—', icon: BarChart3 },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                      <Icon className="w-3.5 h-3.5 mx-auto text-orange-500/70 mb-1" />
                      <p className="font-black text-[#0B3C5D] text-base">{value}</p>
                      <p className="text-[#0B3C5D]/40 text-[10px] font-semibold">{label}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-5 border-t border-slate-150 pt-4">
                  <p className="text-[#0B3C5D]/40 text-xs">للانضمام تواصل مع فريق الدعم أسفل الصفحة</p>
                </div>
              </div>
            </Reveal>

            {/* ── Right panel: bio + timeline ── */}
            <div className="lg:col-span-3 space-y-4">
              <Reveal delay={0.15}>
                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                      <Star className="w-4 h-4 text-orange-500" />
                    </div>
                    <p className="font-black text-[#0B3C5D] text-base">من أنا؟</p>
                  </div>
                  <p className="text-slate-500 text-sm leading-relaxed">
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
                  <div className="flex items-start gap-3.5 bg-white border border-slate-150 rounded-xl p-4 hover:bg-slate-50/50 transition-colors duration-200 shadow-sm">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-black text-[#0B3C5D] text-sm mb-0.5">{title}</p>
                      <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────── TOP COURSES ─────────────── */}
      {topCourses && topCourses.length > 0 && (
        <section id="top-courses" className="relative py-24 overflow-hidden" style={{ zIndex: 1 }}>
          <div className="relative z-10 max-w-6xl mx-auto px-5">
            <Reveal className="text-center">
              <SectionLabel text="الأكثر طلباً" />
              <h2 className="font-black text-[#0B3C5D] mb-3" style={{ fontSize: 'clamp(1.9rem,4vw,2.8rem)' }}>
                أبرز <span className="grad-orange">الكورسات</span>
              </h2>
              <p className="text-[#0B3C5D]/50 text-sm max-w-md mx-auto mt-3 mb-1">أكثر الكورسات التي شاهدها الطلاب وتابعوا محتواها على المنصة</p>
              <div className="w-16 h-0.5 bg-gradient-to-l from-orange-500 to-transparent rounded-full mx-auto mt-4 mb-14" />
            </Reveal>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {topCourses.map((course, i) => (
                <Reveal key={course.id} delay={i * 0.1}
                  className="group bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm hover:shadow-2xl hover:border-orange-300 hover:-translate-y-1.5 transition-all duration-300">
                  <div className="relative w-full overflow-hidden" style={{ paddingTop: '56.25%' }}>
                    <img
                      src={course.thumbnail_url || '/default-course.svg'}
                      alt={course.name}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      onError={e => { e.target.src = '/default-course.svg'; }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                    {i === 0 && (
                      <div className="absolute top-3 right-3 flex items-center gap-1 bg-orange-500 text-white text-[11px] font-black px-3 py-1 rounded-full shadow-lg">
                        <Flame className="w-3.5 h-3.5" />
                        الأكثر مشاهدة
                      </div>
                    )}
                    <div className="absolute top-3 left-3">
                      {course.is_free ? (
                        <span className="text-[11px] font-black bg-emerald-500 text-white px-2.5 py-1 rounded-full shadow">مجاني</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black bg-white/95 text-[#0B3C5D] px-2.5 py-1 rounded-full shadow">
                          <Tag className="w-3 h-3 text-orange-500" />
                          {parseFloat(course.price).toLocaleString()} ج.م
                        </span>
                      )}
                    </div>
                    {course.target_stage && (
                      <div className="absolute bottom-3 right-3">
                        <span className="text-[10px] font-bold bg-black/50 text-white px-2 py-1 rounded-full backdrop-blur-sm">
                          {course.target_stage}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="p-5">
                    <h3 className="font-black text-[#0B3C5D] text-base leading-snug line-clamp-2 mb-2 group-hover:text-orange-600 transition-colors">
                      {course.name}
                    </h3>
                    {course.description && (
                      <p className="text-slate-500 text-xs leading-relaxed line-clamp-2 mb-4">{course.description}</p>
                    )}
                    <Link to="/login"
                      className="flex items-center justify-center gap-2 w-full bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/25 hover:border-orange-500/50 text-orange-600 font-bold text-sm px-4 py-2.5 rounded-xl transition-all duration-200 active:scale-95">
                      عرض الكورس
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─────────────── SUPPORT CONTACTS ─────────────── */}
      {supportContacts && supportContacts.length > 0 && (
        <section id="support" className="relative py-20 overflow-hidden" style={{ zIndex: 1 }}>
          <div className="relative z-10 max-w-4xl mx-auto px-5">
            <Reveal className="text-center">
              <SectionLabel text="انضم إلينا" />
              <h2 className="font-black text-[#0B3C5D] mb-2" style={{ fontSize: 'clamp(1.9rem,4vw,2.8rem)' }}>
                تواصل مع <span className="grad-orange">فريق الدعم</span>
              </h2>
              <p className="text-[#0B3C5D]/50 text-sm max-w-md mx-auto mt-3 mb-1">للاستفسار عن الكورسات أو التسجيل في المنصة، تواصل مع فريق الدعم مباشرةً</p>
              <div className="w-16 h-0.5 bg-gradient-to-l from-orange-500 to-transparent rounded-full mx-auto mt-4 mb-12" />
            </Reveal>

            <div className={`grid gap-4 ${
              supportContacts.length === 1 ? 'max-w-xs mx-auto' :
              supportContacts.length === 2 ? 'sm:grid-cols-2 max-w-lg mx-auto' :
              'sm:grid-cols-2 lg:grid-cols-3'
            }`}>
              {supportContacts.map((c, i) => {
                const photoSrc = c.photo_url
                  ? (c.photo_url.startsWith('http') ? c.photo_url : `/uploads/${c.photo_url}`)
                  : null;
                return (
                  <Reveal key={c.id} delay={i * 0.08}
                    className="group bg-white border border-slate-150 rounded-2xl p-6 text-center hover:border-orange-500/30 hover:-translate-y-1.5 transition-all duration-400 overflow-hidden relative shadow-sm">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-400" />

                    <div className="w-14 h-14 rounded-xl overflow-hidden mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                      {photoSrc ? (
                        <img src={photoSrc} alt={c.name}
                          className="w-full h-full object-cover"
                          onError={e => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }} />
                      ) : null}
                      <div className="w-full h-full bg-gradient-to-br from-orange-500/20 to-orange-700/10 border border-orange-500/20 items-center justify-center"
                        style={{ display: photoSrc ? 'none' : 'flex' }}>
                        <span className="text-xl font-black text-orange-500">{c.name?.charAt(0) || '؟'}</span>
                      </div>
                    </div>

                    <h3 className="font-black text-[#0B3C5D] text-base mb-0.5">{c.name}</h3>
                    <p className="text-[#0B3C5D]/40 text-xs mb-5">دعم فني واستفسارات</p>

                    {c.phone ? (
                      <a href={`https://wa.me/${c.phone.replace(/\D/g, '')}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/25 hover:border-orange-500/50 text-orange-600 font-bold text-sm px-4 py-2.5 rounded-xl transition-all duration-200 active:scale-95">
                        <MessageCircle className="w-4 h-4" />
                        {c.phone}
                      </a>
                    ) : (
                      <div className="flex items-center justify-center gap-2 w-full bg-slate-50 border border-slate-100 text-[#0B3C5D]/30 text-xs px-4 py-2.5 rounded-xl">
                        <Phone className="w-3.5 h-3.5" />
                        رقم غير متاح
                      </div>
                    )}
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ─────────────── CTA ─────────────── */}
      <section className="relative py-24 overflow-hidden bg-[#F1F5F9]/60 border-t border-b border-slate-200/60" style={{ zIndex: 1 }}>
        <div className="relative z-10 max-w-2xl mx-auto px-5 text-center">
          <Reveal>
            <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-600 text-xs font-bold px-4 py-2 rounded-full mb-8 tracking-widest uppercase">
              <Sparkles className="w-3.5 h-3.5 text-orange-500 animate-pulse" />
              ابدأ رحلتك الآن
            </div>
            <h2 className="font-black text-[#0B3C5D] mb-5 leading-tight" style={{ fontSize: 'clamp(2rem,5vw,3.2rem)' }}>
              جاهز تبدأ؟
              <br />
              <span className="text-orange-500">سجّل دخولك الآن</span>
            </h2>
            <p className="text-[#0B3C5D]/65 text-sm mb-10 leading-relaxed max-w-md mx-auto">
              انضم لمنصة وثبة وابدأ رحلتك مع أفضل المحتوى التعليمي والامتحانات التفاعلية
            </p>
            <Link to="/login"
              className="inline-flex items-center gap-3 bg-orange-500 hover:bg-orange-600 text-white font-black text-base px-10 py-4 rounded-2xl transition-all duration-200 hover:shadow-lg hover:shadow-orange-500/25 active:scale-95">
              <GraduationCap className="w-5 h-5" />
              تسجيل الدخول
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ─────────────── FOOTER ─────────────── */}
      <footer className="border-t border-slate-200/80 py-8 bg-white" style={{ position: 'relative', zIndex: 2 }}>
        <div className="max-w-7xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={displayLogo} alt={platformName} className="h-9 w-auto opacity-95 rounded-xl shadow-sm" />
            <span className="text-[#0B3C5D]/70 text-xs font-semibold">المنصة التعليمية المتكاملة</span>
          </div>
          <div className="flex items-center gap-1">
            {[['about','عن المعلم'],['support','فريق الدعم']].map(([id, label]) => (
              <button key={id} onClick={() => scrollTo(id)}
                className="text-[#0B3C5D]/65 hover:text-orange-500 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 text-[#0B3C5D]/65 text-xs font-medium">
            <p>© {new Date().getFullYear()} {platformName || 'وثبة'}</p>
            <span className="text-slate-300">|</span>
            <Link to="/terms" className="text-[#0B3C5D]/70 hover:text-orange-500 transition-colors">الشروط والأحكام</Link>
            <Link to="/privacy" className="text-[#0B3C5D]/70 hover:text-orange-500 transition-colors">سياسة الخصوصية</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
