import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import {
  Search, ArrowLeft, GraduationCap, BookOpen, FileText,
  Trophy, Star, CheckCircle, XCircle, Clock, Play,
  TrendingUp, Award, Users, ChevronRight, AlertCircle,
  Sparkles, Phone, BarChart3, Target
} from 'lucide-react';
import wathbaLogo from '../assets/wathba_logo_transparent.png';
import { useTeacher } from '../context/TeacherContext';

/* ─── Scroll Reveal ─── */
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

function Reveal({ children, className = '', delay = 0 }) {
  const [ref, visible] = useReveal();
  return (
    <div ref={ref} className={className} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(32px)',
      transition: `opacity 0.65s ease ${delay}s, transform 0.65s ease ${delay}s`,
    }}>
      {children}
    </div>
  );
}

/* ─── Stat Card (Light) ─── */
function StatCard({ icon: Icon, label, value, color, delay = 0 }) {
  return (
    <Reveal delay={delay}
      className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 hover:border-orange-300 hover:shadow-md transition-all duration-300"
      style={{ boxShadow: '0 2px 8px rgba(11,60,93,0.06)' }}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-[#0B3C5D]/50 text-xs mb-0.5">{label}</p>
        <p className="text-[#0B3C5D] font-black text-xl">{value}</p>
      </div>
    </Reveal>
  );
}

/* ─── Exam Result Row (Light) ─── */
function ExamRow({ result, index }) {
  const pct = result.total_score > 0 ? Math.round((result.score / result.total_score) * 100) : 0;
  const passed = result.score >= result.pass_score;
  const barColor = passed
    ? pct >= 85 ? 'bg-emerald-500' : 'bg-blue-500'
    : 'bg-red-400';

  return (
    <Reveal delay={index * 0.06}
      className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-orange-300 hover:shadow-sm transition-all duration-300"
      style={{ boxShadow: '0 1px 4px rgba(11,60,93,0.05)' }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-[#0B3C5D] font-bold text-sm leading-snug">{result.exam_title}</p>
          {result.course_name && (
            <p className="text-[#0B3C5D]/40 text-xs mt-0.5">{result.course_name}</p>
          )}
        </div>
        <div className={`shrink-0 flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${passed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
          {passed ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {passed ? 'ناجح' : 'راسب'}
        </div>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[#0B3C5D] font-black text-sm shrink-0">
          {result.score}<span className="text-[#0B3C5D]/40 font-normal text-xs">/{result.total_score}</span>
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs text-[#0B3C5D]/40">
        <span className="flex items-center gap-1 text-emerald-600">
          <CheckCircle className="w-3 h-3" />{result.correct_count} صح
        </span>
        <span className="flex items-center gap-1 text-red-500">
          <XCircle className="w-3 h-3" />{result.wrong_count} غلط
        </span>
        <span className="mr-auto">
          {new Date(result.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })}
        </span>
      </div>
    </Reveal>
  );
}

/* ─── Course Row (Light) ─── */
function CourseRow({ course, index }) {
  return (
    <Reveal delay={index * 0.06}
      className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4 hover:border-orange-300 hover:shadow-sm transition-all duration-300"
      style={{ boxShadow: '0 1px 4px rgba(11,60,93,0.05)' }}>
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-100 to-orange-200 border border-orange-200 flex items-center justify-center shrink-0">
        <BookOpen className="w-5 h-5 text-orange-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[#0B3C5D] font-bold text-sm truncate">{course.name}</p>
        {course.target_stage && (
          <p className="text-[#0B3C5D]/40 text-xs mt-0.5">{course.target_stage}</p>
        )}
      </div>
      <div className={`text-xs font-bold px-2.5 py-1 rounded-full ${course.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
        {course.status === 'active' ? 'نشط' : 'غير نشط'}
      </div>
    </Reveal>
  );
}

/* ════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════ */
export default function ParentPortal() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const resultsRef = useRef(null);
  const { platformName, logoUrl } = useTeacher();
  const displayLogo = logoUrl || wathbaLogo;

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setLoading(true);
    setError('');
    setData(null);
    try {
      const res = await api.get('/public/parent-lookup', { params: { phone: phone.trim() } });
      setData(res.data);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      setError(err.response?.data?.error || 'حدث خطأ، حاول مرة أخرى');
    } finally {
      setLoading(false);
    }
  };

  const student = data?.student;
  const exams = data?.exam_results || [];
  const courses = data?.courses || [];
  const vp = data?.video_progress;

  const avgScore = exams.length > 0
    ? Math.round(exams.reduce((acc, r) => acc + (r.total_score > 0 ? (r.score / r.total_score) * 100 : 0), 0) / exams.length)
    : 0;
  const passedCount = exams.filter(r => r.score >= r.pass_score).length;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0B3C5D]" dir="rtl">
      <style>{`
        @keyframes ppFloatOrb {
          from { transform: translate(0,0) scale(1); }
          to   { transform: translate(25px,20px) scale(1.06); }
        }
        @keyframes ppFadeIn {
          from { opacity:0; transform:translateY(24px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes ppFloat {
          0%   { transform: translateY(0); }
          100% { transform: translateY(-18px); }
        }
        .pp-fade-in { animation: ppFadeIn 0.8s ease both; }
        .pp-gradient-text {
          background: linear-gradient(135deg, #0B3C5D 0%, #f97316 70%, #ffb347 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .pp-nav-blur { backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }
        .pp-input-focus:focus { box-shadow: 0 0 0 3px rgba(249,115,22,0.2); outline: none; }
        .pp-orb { position:absolute; border-radius:50%; filter:blur(90px); pointer-events:none; }
        .pp-dot-grid {
          background-image: radial-gradient(rgba(11,60,93,.06) 1px, transparent 1px);
          background-size: 28px 28px;
        }
      `}</style>

      {/* ── NAVBAR ── */}
      <nav className="fixed top-0 inset-x-0 z-50 pp-nav-blur border-b border-[#0B3C5D]/10 bg-white/85">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/"
              className="flex items-center gap-2 bg-[#0B3C5D]/5 border border-[#0B3C5D]/15 hover:bg-[#0B3C5D]/10 hover:border-[#0B3C5D]/25 text-[#0B3C5D]/70 hover:text-[#0B3C5D] font-bold text-sm px-4 py-2 rounded-xl transition-all duration-200 active:scale-95">
              <ArrowLeft className="w-4 h-4 rotate-180" />
              رجوع
            </Link>
            <Link to="/" className="flex items-center">
              <img src={displayLogo} alt={platformName} className="h-10 w-auto rounded-xl shadow-sm" />
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-[#0B3C5D]/50 text-sm font-semibold">بوابة أولياء الأمور</span>
            <Link to="/login"
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-black text-sm px-5 py-2.5 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-orange-500/30 active:scale-95">
              تسجيل الدخول
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO / SEARCH ── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16 pp-dot-grid">
        <div className="absolute inset-0 bg-gradient-to-br from-white via-[#F4F8FC] to-[#E8EFF8]" />

        {/* Orbs */}
        <div className="pp-orb" style={{ width:600, height:600, top:-150, left:-150, background:'radial-gradient(circle,rgba(11,60,93,0.08),transparent 70%)', animation:'ppFloatOrb 10s ease-in-out infinite alternate' }} />
        <div className="pp-orb" style={{ width:500, height:500, top:'30%', left:'60%', background:'radial-gradient(circle,rgba(249,115,22,0.07),transparent 70%)', animation:'ppFloatOrb 12s ease-in-out 2s infinite alternate' }} />
        <div className="pp-orb" style={{ width:400, height:400, top:'70%', left:'5%', background:'radial-gradient(circle,rgba(124,58,237,0.05),transparent 70%)', animation:'ppFloatOrb 9s ease-in-out 1s infinite alternate' }} />

        {/* SVG side deco left */}
        <svg style={{ position:'absolute', left:0, top:0, bottom:0, height:'100%', width:'22%', opacity:0.5, pointerEvents:'none' }} viewBox="0 0 200 900" fill="none" preserveAspectRatio="none">
          <path d="M-70,0 Q70,220 -20,440 T20,730 Q-60,830 -180,900 L-180,0 Z" fill="#0B3C5D" fillOpacity="0.05" />
          <path d="M-50,0 Q90,240 0,450 T40,700 Q-50,800 -180,900 L-180,0 Z" fill="#f97316" fillOpacity="0.06" />
          <path d="M5,0 Q130,230 10,460 T25,780 Q-60,860 -110,900" stroke="#0B3C5D" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
        </svg>
        {/* SVG side deco right */}
        <svg style={{ position:'absolute', right:0, top:0, bottom:0, height:'100%', width:'22%', opacity:0.5, pointerEvents:'none' }} viewBox="0 0 200 900" fill="none" preserveAspectRatio="none">
          <path d="M270,0 Q140,220 240,440 T200,730 Q280,830 400,900 L400,0 Z" fill="#0B3C5D" fillOpacity="0.05" />
          <path d="M250,0 Q110,240 220,450 T180,700 Q280,800 400,900 L400,0 Z" fill="#f97316" fillOpacity="0.06" />
          <path d="M195,0 Q70,230 190,460 T175,780 Q260,860 310,900" stroke="#0B3C5D" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
        </svg>

        <div className="relative z-10 w-full max-w-2xl mx-auto px-6 text-center">
          {/* Badge */}
          <div className="pp-fade-in inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-600 text-sm font-bold px-4 py-2 rounded-full mb-8"
            style={{ animationDelay: '0.1s' }}>
            <Sparkles className="w-4 h-4" />
            بوابة أولياء الأمور
          </div>

          <h1 className="pp-fade-in font-black mb-4 leading-tight"
            style={{ fontSize: 'clamp(2rem,5vw,3.2rem)', animationDelay: '0.2s' }}>
            تابع مسيرة<br />
            <span className="pp-gradient-text">ابنك التعليمية</span>
          </h1>

          <p className="pp-fade-in text-[#0B3C5D]/55 text-base mb-10 leading-relaxed max-w-md mx-auto"
            style={{ animationDelay: '0.35s' }}>
            أدخل رقم هاتفك المسجّل لدينا وستظهر لك نتائج امتحانات ابنك، كورساته، وكل إنجازاته في المنصة.
          </p>

          {/* Search form */}
          <form onSubmit={handleSearch}
            className="pp-fade-in relative" style={{ animationDelay: '0.5s' }}>
            <div className="bg-white border border-[#0B3C5D]/12 rounded-2xl p-2 flex items-center gap-2 focus-within:border-orange-400 transition-all duration-300"
              style={{ boxShadow: '0 8px 32px rgba(11,60,93,0.10)' }}>
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-orange-500/10 shrink-0 mr-1">
                <Phone className="w-5 h-5 text-orange-500" />
              </div>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="أدخل رقم هاتف ولي الأمر..."
                className="flex-1 bg-transparent text-[#0B3C5D] placeholder-[#0B3C5D]/30 text-base font-semibold outline-none py-3 px-2 pp-input-focus"
                dir="ltr"
              />
              <button type="submit" disabled={loading || !phone.trim()}
                className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black px-6 py-3 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-orange-500/25 active:scale-95 shrink-0">
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Search className="w-5 h-5" />
                )}
                <span className="hidden sm:block">{loading ? 'جارٍ البحث...' : 'بحث'}</span>
              </button>
            </div>
          </form>

          {/* Error */}
          {error && (
            <div className="mt-4 pp-fade-in flex items-center gap-3 bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Hint */}
          {!data && !error && (
            <p className="pp-fade-in text-[#0B3C5D]/30 text-xs mt-5" style={{ animationDelay: '0.7s' }}>
              الرقم المسجَّل هو رقم ولي الأمر الذي أضافه المعلم عند تسجيل الطالب
            </p>
          )}
        </div>
      </section>

      {/* ── RESULTS ── */}
      {data && (
        <div ref={resultsRef} className="relative pb-24 bg-[#F0F4F8]">
          <div className="relative z-10 max-w-4xl mx-auto px-6 pt-16">

            {/* ── Student Header ── */}
            <Reveal className="bg-gradient-to-l from-orange-50 via-white to-blue-50 border border-slate-200 rounded-3xl p-6 mb-8"
              style={{ boxShadow: '0 4px 20px rgba(11,60,93,0.08)' }}>
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-2xl font-black text-white shadow-lg shadow-orange-500/25 shrink-0">
                  {student.name?.charAt(0) || '؟'}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-[#0B3C5D] font-black text-2xl leading-tight">{student.name}</h2>
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    {student.academic_stage && (
                      <span className="flex items-center gap-1.5 text-orange-600 text-sm font-bold bg-orange-50 px-3 py-1 rounded-full border border-orange-200">
                        <GraduationCap className="w-3.5 h-3.5" />
                        {student.academic_stage}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5 text-purple-600 text-sm font-bold bg-purple-50 px-3 py-1 rounded-full border border-purple-200">
                      <Trophy className="w-3.5 h-3.5" />
                      المركز #{student.rank}
                    </span>
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <p className="text-[#0B3C5D]/40 text-xs mb-1">النقاط الكلية</p>
                  <p className="text-orange-500 font-black text-3xl">{student.points?.toLocaleString('ar-EG')}</p>
                </div>
              </div>
            </Reveal>

            {/* ── Stats Grid ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
              <StatCard icon={FileText}   label="الامتحانات"     value={exams.length}      color="bg-blue-500"    delay={0}    />
              <StatCard icon={CheckCircle} label="ناجح في"       value={`${passedCount}`}  color="bg-emerald-500" delay={0.08} />
              <StatCard icon={BarChart3}  label="متوسط الدرجات" value={`${avgScore}%`}    color="bg-orange-500"  delay={0.16} />
              <StatCard icon={BookOpen}   label="الكورسات"       value={courses.length}    color="bg-purple-500"  delay={0.24} />
            </div>

            {/* ── Video Progress ── */}
            {vp && parseInt(vp.videos_started) > 0 && (
              <Reveal className="bg-white border border-slate-200 rounded-2xl p-5 mb-8 flex items-center gap-4"
                style={{ boxShadow: '0 2px 8px rgba(11,60,93,0.06)' }}>
                <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
                  <Play className="w-6 h-6 text-blue-500" />
                </div>
                <div className="flex-1">
                  <p className="text-[#0B3C5D] font-bold text-sm mb-1">
                    شاهد <span className="text-blue-600">{vp.videos_started}</span> فيديو
                    {' '}— إجمالي <span className="text-orange-500">{Math.round(vp.total_watched_minutes)} دقيقة</span> مشاهدة
                  </p>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-l from-blue-400 to-blue-600 rounded-full"
                      style={{ width: `${Math.min(100, Math.round(parseFloat(vp.avg_progress)))}%` }} />
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <p className="text-[#0B3C5D]/40 text-xs">متوسط التقدم</p>
                  <p className="text-blue-500 font-black text-xl">{Math.round(parseFloat(vp.avg_progress))}%</p>
                </div>
              </Reveal>
            )}

            <div className="grid lg:grid-cols-2 gap-8">
              {/* ── Exam Results ── */}
              <div>
                <Reveal className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 rounded-xl bg-orange-100 border border-orange-200 flex items-center justify-center">
                    <Target className="w-5 h-5 text-orange-500" />
                  </div>
                  <h3 className="text-[#0B3C5D] font-black text-lg">نتائج الامتحانات</h3>
                  <span className="mr-auto text-[#0B3C5D]/40 text-sm bg-[#0B3C5D]/5 px-3 py-1 rounded-full">{exams.length}</span>
                </Reveal>

                {exams.length === 0 ? (
                  <Reveal className="text-center py-12 text-[#0B3C5D]/30">
                    <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">لا توجد نتائج امتحانات حتى الآن</p>
                  </Reveal>
                ) : (
                  <div className="flex flex-col gap-3">
                    {exams.map((r, i) => <ExamRow key={r.id} result={r} index={i} />)}
                  </div>
                )}
              </div>

              {/* ── Courses ── */}
              <div>
                <Reveal className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 rounded-xl bg-purple-100 border border-purple-200 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-purple-500" />
                  </div>
                  <h3 className="text-[#0B3C5D] font-black text-lg">الكورسات المسجّلة</h3>
                  <span className="mr-auto text-[#0B3C5D]/40 text-sm bg-[#0B3C5D]/5 px-3 py-1 rounded-full">{courses.length}</span>
                </Reveal>

                {courses.length === 0 ? (
                  <Reveal className="text-center py-12 text-[#0B3C5D]/30">
                    <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">لم يُسجَّل في أي كورس بعد</p>
                  </Reveal>
                ) : (
                  <div className="flex flex-col gap-3">
                    {courses.map((c, i) => <CourseRow key={c.id} course={c} index={i} />)}
                  </div>
                )}

                {/* Performance Summary */}
                {exams.length > 0 && (
                  <Reveal delay={0.2} className="mt-6 bg-white border border-slate-200 rounded-2xl p-5"
                    style={{ boxShadow: '0 2px 8px rgba(11,60,93,0.06)' }}>
                    <p className="text-[#0B3C5D]/50 text-xs font-bold mb-4 uppercase tracking-widest">ملخص الأداء</p>
                    <div className="space-y-3">
                      {[
                        { label: 'نسبة النجاح', value: exams.length > 0 ? Math.round((passedCount / exams.length) * 100) : 0, color: 'from-emerald-400 to-emerald-600' },
                        { label: 'متوسط الدرجات', value: avgScore, color: 'from-orange-400 to-orange-600' },
                      ].map(item => (
                        <div key={item.label}>
                          <div className="flex justify-between text-xs text-[#0B3C5D]/50 mb-1">
                            <span>{item.label}</span>
                            <span className="text-[#0B3C5D] font-bold">{item.value}%</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full bg-gradient-to-l ${item.color} rounded-full transition-all duration-1000`}
                              style={{ width: `${item.value}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </Reveal>
                )}
              </div>
            </div>

            {/* New search */}
            <Reveal className="mt-12 text-center">
              <button onClick={() => { setData(null); setError(''); setPhone(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="inline-flex items-center gap-2 text-[#0B3C5D]/50 hover:text-orange-500 text-sm font-bold transition-colors duration-200">
                <Search className="w-4 h-4" />
                بحث جديد
              </button>
            </Reveal>
          </div>
        </div>
      )}

      {/* ── FOOTER ── */}
      <footer className="border-t border-[#0B3C5D]/10 py-8 bg-white">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={displayLogo} alt={platformName} className="h-10 w-auto rounded-xl shadow-sm" />
            <span className="text-[#0B3C5D]/40 text-sm">— المنصة التعليمية المتكاملة</span>
          </div>
          <div className="flex items-center gap-5 text-sm text-[#0B3C5D]/50 font-semibold">
            <Link to="/" className="hover:text-orange-500 transition-colors">الصفحة الرئيسية</Link>
            <Link to="/login" className="hover:text-orange-500 transition-colors">تسجيل الدخول</Link>
          </div>
          <p className="text-[#0B3C5D]/30 text-xs">© {new Date().getFullYear()} {platformName}</p>
        </div>
      </footer>
    </div>
  );
}
