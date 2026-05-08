import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import {
  GraduationCap, BookOpen, BarChart3, Award, Shield,
  Play, FileText, Star, Users, CheckCircle, ArrowLeft,
  Sparkles, Trophy, Zap, MessageCircle, ChevronDown,
  Clock, Target, TrendingUp, CreditCard
} from 'lucide-react';
import wathbaLogo from '../assets/wathba_logo_transparent.png';

/* ─── Demo course cover images (Unsplash) ─── */
const DEMO_COVERS = [
  'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=480&h=260&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1509228627152-72ae9ae6848d?w=480&h=260&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1554475901-4538ddfbccc2?w=480&h=260&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=480&h=260&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=480&h=260&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=480&h=260&fit=crop&auto=format',
];

const fetchPublic = () => axios.get('/api/public/info').then(r => r.data);

/* ─── Animated Counter Hook ─── */
function useCounter(target, duration = 1800, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start || !target) return;
    let startTime = null;
    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(ease * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);
  return count;
}

/* ─── Scroll Reveal Hook ─── */
function useReveal(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

/* ─── Section Wrapper ─── */
function Reveal({ children, className = '', delay = 0 }) {
  const [ref, visible] = useReveal();
  return (
    <div ref={ref} className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(40px)',
        transition: `opacity 0.7s ease ${delay}s, transform 0.7s ease ${delay}s`,
      }}>
      {children}
    </div>
  );
}

/* ─── Feature Card ─── */
function FeatureCard({ icon: Icon, title, desc, color, delay }) {
  return (
    <Reveal delay={delay} className="group bg-white/5 backdrop-blur border border-white/10 rounded-3xl p-6 hover:bg-white/10 hover:border-orange-400/40 transition-all duration-500 hover:-translate-y-2 cursor-default">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${color} group-hover:scale-110 transition-transform duration-300`}>
        <Icon className="w-7 h-7 text-white" />
      </div>
      <h3 className="font-black text-white text-lg mb-2">{title}</h3>
      <p className="text-white/60 text-sm leading-relaxed">{desc}</p>
    </Reveal>
  );
}

/* ─── Course Card ─── */
function CourseCard({ course, index, delay }) {
  const demoCover = DEMO_COVERS[index % DEMO_COVERS.length];
  const realCover = course.thumbnail_url
    ? (course.thumbnail_url.startsWith('http') ? course.thumbnail_url : `/uploads/${course.thumbnail_url}`)
    : null;
  const [imgError, setImgError] = useState(false);
  const cover = (!imgError && realCover) ? realCover : demoCover;
  return (
    <Reveal delay={delay}
      className="group bg-white/5 border border-white/10 rounded-3xl overflow-hidden hover:border-orange-400/50 hover:-translate-y-3 transition-all duration-500 card-glow">
      <div className="h-48 relative overflow-hidden">
        {!imgError ? (
          <img src={cover} alt={course.name} onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#1A2E4A] to-[#0a1628] flex items-center justify-center">
            <BookOpen className="w-16 h-16 text-white/15" />
          </div>
        )}
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#060d1a]/80 via-transparent to-transparent" />
        {/* Badges */}
        {course.price > 0 && (
          <div className="absolute top-3 left-3 bg-orange-500 text-white text-xs font-black px-3 py-1 rounded-full shadow-lg shadow-orange-500/40">
            {parseFloat(course.price).toFixed(0)} جنيه
          </div>
        )}
        {course.target_stage && (
          <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-md text-white text-[11px] font-bold px-2.5 py-1 rounded-full border border-white/20">
            {course.target_stage}
          </div>
        )}
        {/* Play button on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="w-14 h-14 rounded-full bg-orange-500/90 backdrop-blur flex items-center justify-center shadow-2xl shadow-orange-500/50 scale-75 group-hover:scale-100 transition-transform duration-300">
            <Play className="w-6 h-6 text-white ms-1" />
          </div>
        </div>
      </div>
      <div className="p-5">
        <h3 className="font-black text-white text-base leading-snug mb-2 group-hover:text-orange-300 transition-colors duration-300">{course.name}</h3>
        {course.description && (
          <p className="text-white/50 text-xs leading-relaxed line-clamp-2">{course.description}</p>
        )}
      </div>
    </Reveal>
  );
}

/* ─── Floating Orb ─── */
function Orb({ size, top, left, color, delay, duration }) {
  return (
    <div style={{
      position: 'absolute', width: size, height: size, top, left,
      borderRadius: '50%', background: color, filter: 'blur(80px)',
      opacity: 0.25, animation: `floatOrb ${duration}s ease-in-out ${delay}s infinite alternate`,
      pointerEvents: 'none',
    }} />
  );
}

export default function LandingPage() {
  const { data, isLoading } = useQuery({ queryKey: ['public-info'], queryFn: fetchPublic });
  const [statsVisible, setStatsVisible] = useState(false);
  const statsRef = useRef(null);

  const teacher = data?.teacher;
  const stats   = data?.stats;
  const courses = data?.courses || [];

  const studentsCount = useCounter(parseInt(stats?.total_students || 0), 2000, statsVisible);
  const coursesCount  = useCounter(parseInt(stats?.total_courses  || 0), 1600, statsVisible);
  const examsCount    = useCounter(parseInt(stats?.total_exams    || 0), 1800, statsVisible);
  const resultsCount  = useCounter(parseInt(stats?.total_results  || 0), 2200, statsVisible);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setStatsVisible(true); obs.disconnect(); } },
      { threshold: 0.3 }
    );
    if (statsRef.current) obs.observe(statsRef.current);
    return () => obs.disconnect();
  }, []);

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const features = [
    { icon: Play,          title: 'فيديوهات تعليمية',   desc: 'محتوى فيديو احترافي ومنظم داخل كل كورس مع تتبع تقدم المشاهدة لكل طالب.', color: 'bg-blue-500',    delay: 0 },
    { icon: Target,        title: 'امتحانات تفاعلية',   desc: 'امتحانات أونلاين متكاملة بأسئلة متنوعة ونتائج فورية مع تحليل تفصيلي.', color: 'bg-orange-500',  delay: 0.1 },
    { icon: BarChart3,     title: 'تحليلات متقدمة',     desc: 'لوحة تحكم تحليلية لمتابعة أداء الطلاب ورسوم بيانية تفاعلية دقيقة.', color: 'bg-emerald-500', delay: 0.2 },
    { icon: Trophy,        title: 'نقاط وشارات',        desc: 'نظام مكافآت يحفّز الطلاب من خلال النقاط والشارات ولوحة الشرف.', color: 'bg-amber-500',   delay: 0.3 },
    { icon: FileText,      title: 'تقارير PDF',          desc: 'تقارير مفصلة قابلة للطباعة لأولياء الأمور والمتابعة الأكاديمية.', color: 'bg-purple-500',  delay: 0.4 },
    { icon: CreditCard,    title: 'دفع إلكتروني',       desc: 'نظام مدفوعات مدمج يدعم فودافون كاش وإنستاباي مع تتبع كامل.', color: 'bg-pink-500',    delay: 0.5 },
    { icon: Shield,        title: 'صلاحيات مرنة',       desc: 'نظام أدوار متدرج بين المعلم والمساعدين مع تحكم دقيق في الصلاحيات.', color: 'bg-cyan-500',    delay: 0.6 },
    { icon: MessageCircle, title: 'تواصل مع الأهل',     desc: 'إشعارات مباشرة لأولياء الأمور عند تراجع أداء الطالب في الامتحانات.', color: 'bg-rose-500',    delay: 0.7 },
  ];

  return (
    <div className="min-h-screen bg-[#060d1a] text-white font-cairo overflow-x-hidden" dir="rtl">
      <style>{`
        @keyframes floatOrb {
          from { transform: translate(0,0) scale(1); }
          to   { transform: translate(30px, -40px) scale(1.15); }
        }
        @keyframes heroFadeIn {
          from { opacity:0; transform: translateY(30px); }
          to   { opacity:1; transform: translateY(0); }
        }
        @keyframes spinSlow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes pulse2 {
          0%,100% { opacity:0.4; transform:scale(1); }
          50%     { opacity:0.8; transform:scale(1.05); }
        }
        @keyframes lineGrow {
          from { width:0; }
          to   { width:100%; }
        }
        .hero-title   { animation: heroFadeIn 0.9s ease 0.1s both; }
        .hero-sub     { animation: heroFadeIn 0.9s ease 0.3s both; }
        .hero-cta     { animation: heroFadeIn 0.9s ease 0.5s both; }
        .hero-scroll  { animation: heroFadeIn 0.9s ease 0.9s both; }
        .spin-ring    { animation: spinSlow 18s linear infinite; }
        .pulse-ring   { animation: pulse2 3s ease-in-out infinite; }
        .gradient-text {
          background: linear-gradient(135deg, #fff 0%, #FF8C00 60%, #ffb347 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .gradient-text-blue {
          background: linear-gradient(135deg, #60a5fa, #FF8C00);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .nav-blur { backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }
        .grid-bg {
          background-image: linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),
                            linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px);
          background-size: 60px 60px;
        }
        .card-glow:hover { box-shadow: 0 0 40px rgba(255,140,0,0.15); }
        .line-clamp-2 {
          display: -webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
        }
      `}</style>

      {/* ══════════════════════════════════════════
          NAVBAR
      ══════════════════════════════════════════ */}
      <nav className="fixed top-0 inset-x-0 z-50 nav-blur border-b border-white/8 bg-[#060d1a]/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center">
            <img src={wathbaLogo} alt="وثبة" className="h-12 w-auto drop-shadow-lg" />
          </div>

          {/* Nav Links */}
          <div className="hidden md:flex items-center gap-6 text-sm font-semibold text-white/60">
            {[['about','عن المعلم'],['courses','الكورسات'],['features','المميزات']].map(([id, label]) => (
              <button key={id} onClick={() => scrollTo(id)}
                className="hover:text-orange-400 transition-colors duration-200">{label}</button>
            ))}
          </div>

          {/* CTA */}
          <Link to="/login"
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white font-black text-sm px-5 py-2.5 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-orange-500/30 active:scale-95">
            تسجيل الدخول
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </div>
      </nav>

      {/* ══════════════════════════════════════════
          HERO
      ══════════════════════════════════════════ */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden grid-bg pt-16">
        {/* Orbs */}
        <Orb size="500px" top="-100px"  left="-100px"  color="radial-gradient(#1A2E4A,#0a1628)" delay={0}   duration={8} />
        <Orb size="600px" top="20%"     left="60%"     color="radial-gradient(#FF8C00,#c55a00)"  delay={2}   duration={10} />
        <Orb size="400px" top="60%"     left="10%"     color="radial-gradient(#6366f1,#312e81)"  delay={1}   duration={12} />
        <Orb size="300px" top="10%"     left="40%"     color="radial-gradient(#10b981,#047857)"  delay={3}   duration={9} />

        {/* Spinning ring */}
        <div className="absolute w-[700px] h-[700px] rounded-full border border-white/5 spin-ring" />
        <div className="absolute w-[500px] h-[500px] rounded-full border border-orange-500/10 pulse-ring" style={{ animationDirection: 'reverse' }} />

        <div className="relative z-10 text-center max-w-5xl mx-auto px-6">
          {/* Badge */}
          <div className="hero-title inline-flex items-center gap-2 bg-orange-500/15 border border-orange-500/30 text-orange-300 text-sm font-bold px-4 py-2 rounded-full mb-8">
            <Sparkles className="w-4 h-4" />
            منصة تعليمية متكاملة لمراكز الدروس
          </div>

          {/* Main heading */}
          <h1 className="hero-title font-black leading-tight mb-6" style={{ fontSize: 'clamp(2.5rem, 6vw, 5rem)' }}>
            {isLoading ? (
              <span className="gradient-text">منصة وثبة التعليمية</span>
            ) : (
              <>
                <span className="text-white">تعلّم مع </span>
                <span className="gradient-text">{teacher?.name || 'منصة وثبة'}</span>
              </>
            )}
            <br />
            <span className="text-white/70" style={{ fontSize: '0.6em' }}>
              {teacher?.classification || 'المنصة التعليمية المتكاملة'}
            </span>
          </h1>

          {/* Sub */}
          <p className="hero-sub text-white/60 text-lg max-w-2xl mx-auto leading-relaxed mb-10">
            {teacher?.bio || 'منصة تعليمية احترافية تجمع الكورسات والامتحانات والتحليلات في مكان واحد — لتجربة تعليمية لا مثيل لها'}
          </p>

          {/* CTAs */}
          <div className="hero-cta flex items-center justify-center gap-4 flex-wrap">
            <Link to="/login"
              className="flex items-center gap-2.5 bg-gradient-to-l from-orange-500 to-orange-400 hover:from-orange-400 hover:to-orange-300 text-white font-black text-base px-8 py-4 rounded-2xl transition-all duration-300 hover:shadow-2xl hover:shadow-orange-500/40 hover:-translate-y-1 active:scale-95">
              ابدأ الآن مجاناً
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <button onClick={() => scrollTo('courses')}
              className="flex items-center gap-2.5 bg-white/8 hover:bg-white/15 border border-white/15 text-white font-bold text-base px-8 py-4 rounded-2xl transition-all duration-300 hover:-translate-y-1">
              <BookOpen className="w-5 h-5 text-orange-400" />
              اكتشف الكورسات
            </button>
          </div>

          {/* Scroll hint */}
          <button onClick={() => scrollTo('stats')}
            className="hero-scroll mt-16 flex flex-col items-center gap-2 mx-auto text-white/30 hover:text-white/60 transition-colors">
            <span className="text-xs font-semibold">اكتشف أكثر</span>
            <ChevronDown className="w-5 h-5 animate-bounce" />
          </button>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          STATS
      ══════════════════════════════════════════ */}
      <section id="stats" ref={statsRef} className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#060d1a] via-[#0a1628] to-[#060d1a]" />
        <div className="relative z-10 max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { label: 'طالب مسجّل',   value: studentsCount, icon: Users,     color: 'text-blue-400',    bg: 'from-blue-500/20 to-blue-600/5',    border: 'border-blue-500/20' },
              { label: 'كورس تعليمي',  value: coursesCount,  icon: BookOpen,  color: 'text-orange-400',  bg: 'from-orange-500/20 to-orange-600/5', border: 'border-orange-500/20' },
              { label: 'امتحان متاح',  value: examsCount,    icon: Target,    color: 'text-emerald-400', bg: 'from-emerald-500/20 to-emerald-600/5',border: 'border-emerald-500/20' },
              { label: 'نتيجة محللة',  value: resultsCount,  icon: BarChart3, color: 'text-purple-400',  bg: 'from-purple-500/20 to-purple-600/5', border: 'border-purple-500/20' },
            ].map(({ label, value, icon: Icon, color, bg, border }, i) => (
              <Reveal key={label} delay={i * 0.1}
                className={`bg-gradient-to-br ${bg} border ${border} rounded-3xl p-6 text-center card-glow hover:-translate-y-2 transition-all duration-500`}>
                <Icon className={`w-8 h-8 mx-auto mb-3 ${color}`} />
                <p className={`text-4xl font-black mb-1 ${color}`}>{value.toLocaleString('ar-EG')}+</p>
                <p className="text-white/50 text-sm font-semibold">{label}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          ABOUT TEACHER
      ══════════════════════════════════════════ */}
      <section id="about" className="relative py-24 overflow-hidden">
        <div className="absolute inset-0 bg-[#0a1628]" />
        <Orb size="400px" top="0"    left="-200px" color="radial-gradient(#1A2E4A,transparent)" delay={0} duration={10} />
        <Orb size="300px" top="50%"  left="70%"   color="radial-gradient(#FF8C00,transparent)"  delay={2} duration={8} />

        <div className="relative z-10 max-w-6xl mx-auto px-6">
          <Reveal className="text-center mb-16">
            <p className="text-orange-400 font-bold text-sm mb-3 tracking-widest uppercase">معلومات عن</p>
            <h2 className="font-black text-4xl text-white mb-4">
              <span className="gradient-text-blue">عن المعلم</span>
            </h2>
            <div className="w-24 h-1 bg-gradient-to-l from-orange-500 to-transparent rounded-full mx-auto" />
          </Reveal>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Avatar side */}
            <Reveal delay={0.1}>
              <div className="relative">
                {/* Glow circle */}
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-orange-500/20 to-blue-500/10 blur-2xl" />
                <div className="relative bg-gradient-to-br from-white/5 to-white/0 border border-white/10 rounded-3xl p-8 text-center">
                  {/* Avatar */}
                  <div className="relative inline-block mb-6">
                    <div className="w-32 h-32 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-5xl font-black text-white shadow-2xl shadow-orange-500/30 mx-auto">
                      {teacher?.name?.charAt(0) || 'م'}
                    </div>
                    <div className="absolute -bottom-2 -left-2 w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
                      <CheckCircle className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <h3 className="font-black text-2xl text-white mb-1">{teacher?.name || '—'}</h3>
                  <p className="text-orange-400 font-bold text-sm mb-4">{teacher?.classification || '—'}</p>

                  {/* Quick info */}
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    {[
                      { label: 'الطلاب',   value: stats?.total_students || '—', icon: Users },
                      { label: 'الكورسات', value: stats?.total_courses  || '—', icon: BookOpen },
                      { label: 'الامتحانات',value: stats?.total_exams    || '—', icon: Target },
                      { label: 'النتائج',  value: stats?.total_results  || '—', icon: BarChart3 },
                    ].map(({ label, value, icon: Icon }) => (
                      <div key={label} className="bg-white/5 rounded-2xl p-3 text-center border border-white/8">
                        <Icon className="w-4 h-4 mx-auto text-orange-400 mb-1" />
                        <p className="font-black text-white text-lg">{value}</p>
                        <p className="text-white/40 text-[11px] font-semibold">{label}</p>
                      </div>
                    ))}
                  </div>

                  {teacher?.whatsapp_phone && (
                    <a href={`https://wa.me/${teacher.whatsapp_phone.replace(/\D/g,'')}`}
                      target="_blank" rel="noopener noreferrer"
                      className="mt-5 flex items-center justify-center gap-2 bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-400 font-bold text-sm px-4 py-2.5 rounded-xl transition-all duration-300">
                      <MessageCircle className="w-4 h-4" />
                      تواصل عبر واتساب
                    </a>
                  )}
                </div>
              </div>
            </Reveal>

            {/* Bio side */}
            <div className="space-y-6">
              <Reveal delay={0.2}>
                <div className="bg-white/5 border border-white/10 rounded-3xl p-7">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-2xl bg-orange-500/20 flex items-center justify-center">
                      <Star className="w-5 h-5 text-orange-400" />
                    </div>
                    <h4 className="font-black text-white text-lg">من أنا؟</h4>
                  </div>
                  <p className="text-white/65 leading-relaxed text-base">
                    {teacher?.bio || 'معلم متخصص بخبرة طويلة في التدريس، يهتم بتقديم المحتوى التعليمي بأسلوب مبسط ومشوق لمساعدة الطلاب على التفوق وتحقيق أعلى الدرجات.'}
                  </p>
                </div>
              </Reveal>

              {/* Timeline / experience points */}
              {[
                { icon: GraduationCap, title: 'خبرة تعليمية متميزة',    desc: 'سنوات من التدريس الاحترافي لطلاب الثانوية العامة والمراحل المختلفة',       color: 'bg-blue-500/20 text-blue-400', delay: 0.25 },
                { icon: Zap,           title: 'أسلوب تعليمي مبتكر',     desc: 'طريقة تدريس عصرية تجمع بين الشرح الواضح والتدريب المكثف على المسائل',       color: 'bg-orange-500/20 text-orange-400', delay: 0.3 },
                { icon: Trophy,        title: 'نتائج طلاب مشرّفة',       desc: 'عدد كبير من الطلاب حققوا درجات امتياز وتفوق في المراحل الدراسية المختلفة',   color: 'bg-emerald-500/20 text-emerald-400', delay: 0.35 },
                { icon: Clock,         title: 'متابعة مستمرة',           desc: 'متابعة دورية لأداء كل طالب مع إرسال تقارير منتظمة لأولياء الأمور',          color: 'bg-purple-500/20 text-purple-400', delay: 0.4 },
              ].map(({ icon: Icon, title, desc, color, delay }) => (
                <Reveal key={title} delay={delay}>
                  <div className="flex items-start gap-4 bg-white/3 border border-white/8 rounded-2xl p-4 hover:bg-white/6 transition-all duration-300">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-black text-white text-sm mb-0.5">{title}</p>
                      <p className="text-white/50 text-xs leading-relaxed">{desc}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          COURSES
      ══════════════════════════════════════════ */}
      <section id="courses" className="relative py-24 overflow-hidden">
        <div className="absolute inset-0 bg-[#060d1a] grid-bg" />
        <Orb size="500px" top="30%" left="50%" color="radial-gradient(#FF8C00,transparent)" delay={0} duration={11} />

        <div className="relative z-10 max-w-7xl mx-auto px-6">
          <Reveal className="text-center mb-14">
            <p className="text-orange-400 font-bold text-sm mb-3 tracking-widest uppercase">تعلّم معنا</p>
            <h2 className="font-black text-4xl text-white mb-4">
              أبرز <span className="gradient-text">الكورسات المتاحة</span>
            </h2>
            <p className="text-white/50 text-base max-w-xl mx-auto">كورسات مصممة بعناية لتغطي جميع المواضيع وتساعدك على التفوق</p>
            <div className="w-24 h-1 bg-gradient-to-l from-orange-500 to-transparent rounded-full mx-auto mt-4" />
          </Reveal>

          {isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-60 rounded-3xl bg-white/5 animate-pulse border border-white/8" />
              ))}
            </div>
          ) : courses.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map((c, i) => <CourseCard key={c.id} course={c} index={i} delay={i * 0.08} />)}
            </div>
          ) : (
            <div className="text-center py-20 text-white/30">
              <BookOpen className="w-16 h-16 mx-auto mb-3" />
              <p className="font-semibold">لا توجد كورسات بعد</p>
            </div>
          )}

          <Reveal delay={0.3} className="text-center mt-10">
            <Link to="/login"
              className="inline-flex items-center gap-2 bg-white/8 hover:bg-white/15 border border-white/15 text-white font-bold px-8 py-3.5 rounded-2xl transition-all duration-300 hover:-translate-y-1">
              عرض جميع الكورسات
              <ArrowLeft className="w-4 h-4 text-orange-400" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          FEATURES
      ══════════════════════════════════════════ */}
      <section id="features" className="relative py-24 overflow-hidden">
        <div className="absolute inset-0 bg-[#0a1628]" />
        <Orb size="600px" top="-100px" left="-200px" color="radial-gradient(#1A2E4A,transparent)" delay={0} duration={9} />
        <Orb size="400px" top="60%"    left="70%"   color="radial-gradient(#6366f1,transparent)" delay={1} duration={11} />

        <div className="relative z-10 max-w-7xl mx-auto px-6">
          <Reveal className="text-center mb-14">
            <p className="text-orange-400 font-bold text-sm mb-3 tracking-widest uppercase">لماذا وثبة؟</p>
            <h2 className="font-black text-4xl text-white mb-4">
              مميزات <span className="gradient-text">المنصة</span>
            </h2>
            <p className="text-white/50 text-base max-w-xl mx-auto">كل الأدوات التي يحتاجها المعلم والطالب في مكان واحد</p>
            <div className="w-24 h-1 bg-gradient-to-l from-orange-500 to-transparent rounded-full mx-auto mt-4" />
          </Reveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map(f => <FeatureCard key={f.title} {...f} />)}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          CTA BANNER
      ══════════════════════════════════════════ */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-bl from-orange-600/25 via-[#060d1a] to-blue-900/25" />
        <Orb size="600px" top="50%"  left="50%"   color="radial-gradient(#FF8C00,transparent)" delay={0} duration={8} />

        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          <Reveal>
            <div className="inline-flex items-center gap-2 bg-orange-500/15 border border-orange-500/30 text-orange-300 text-sm font-bold px-4 py-2 rounded-full mb-8">
              <Sparkles className="w-4 h-4" />
              انضم الآن
            </div>
            <h2 className="font-black leading-tight text-white mb-6" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
              جاهز تبدأ رحلتك
              <br />
              <span className="gradient-text">التعليمية؟</span>
            </h2>
            <p className="text-white/55 text-lg mb-10 leading-relaxed">
              سجّل دخولك الآن وابدأ رحلتك في التعلم مع أفضل المحتوى التعليمي والامتحانات التفاعلية
            </p>
            <Link to="/login"
              className="inline-flex items-center gap-3 bg-gradient-to-l from-orange-500 to-orange-400 hover:from-orange-400 hover:to-orange-300 text-white font-black text-lg px-10 py-5 rounded-2xl transition-all duration-300 hover:shadow-2xl hover:shadow-orange-500/40 hover:-translate-y-2 active:scale-95">
              <GraduationCap className="w-6 h-6" />
              تسجيل الدخول الآن
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════ */}
      <footer className="border-t border-white/8 py-10 bg-[#060d1a]">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={wathbaLogo} alt="وثبة" className="h-10 w-auto drop-shadow-lg" />
            <span className="text-white/30 text-sm">— المنصة التعليمية المتكاملة</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-white/40 font-semibold">
            {[['about','عن المعلم'],['courses','الكورسات'],['features','المميزات']].map(([id, label]) => (
              <button key={id} onClick={() => scrollTo(id)}
                className="hover:text-orange-400 transition-colors">{label}</button>
            ))}
          </div>
          <p className="text-white/25 text-xs">© {new Date().getFullYear()} منصة وثبة التعليمية</p>
        </div>
      </footer>
    </div>
  );
}
