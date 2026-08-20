import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import {
  Search, ArrowLeft, GraduationCap, BookOpen, FileText,
  Trophy, Star, CheckCircle, XCircle, Clock, Play,
  TrendingUp, Award, Users, ChevronRight, AlertCircle,
  Sparkles, Phone, BarChart3, Target, Mic, CalendarCheck, CalendarDays,
  Video, Eye, AlertTriangle, Check, Layers, Tv
} from 'lucide-react';
import wathbaLogo from '../assets/wathba_logo_transparent.png';
import { useTeacher } from '../context/TeacherContext';
import { useForceLightMode } from '../hooks/useForceLightMode';

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
      className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 flex items-center gap-2.5 sm:gap-4 hover:border-orange-300 hover:shadow-md transition-all duration-300 min-w-0"
      style={{ boxShadow: '0 2px 8px rgba(11,60,93,0.06)' }}>
      <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-white shrink-0" />
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="text-[#0B3C5D]/60 text-[11px] sm:text-xs font-semibold mb-0.5 leading-tight truncate" title={label}>{label}</p>
        <p className="text-[#0B3C5D] font-black text-base sm:text-lg truncate">{value}</p>
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
      className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 hover:border-orange-300 hover:shadow-sm transition-all duration-300 min-w-0"
      style={{ boxShadow: '0 1px 4px rgba(11,60,93,0.05)' }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-[#0B3C5D] font-bold text-xs sm:text-sm leading-snug break-words">{result.exam_title}</p>
          {result.course_name && (
            <p className="text-[#0B3C5D]/50 text-xs mt-0.5 break-words">{result.course_name}</p>
          )}
        </div>
        <div className={`shrink-0 flex items-center gap-1 text-[11px] sm:text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${passed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
          {passed ? <CheckCircle className="w-3 h-3 shrink-0" /> : <XCircle className="w-3 h-3 shrink-0" />}
          {passed ? 'ناجح' : 'راسب'}
        </div>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3 mb-2.5">
        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[#0B3C5D] font-black text-xs sm:text-sm shrink-0">
          {result.score}<span className="text-[#0B3C5D]/40 font-normal text-xs">/{result.total_score}</span>
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#0B3C5D]/50">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-emerald-600 font-semibold">
            <CheckCircle className="w-3 h-3 shrink-0" />{result.correct_count} صح
          </span>
          <span className="flex items-center gap-1 text-red-500 font-semibold">
            <XCircle className="w-3 h-3 shrink-0" />{result.wrong_count} غلط
          </span>
        </div>
        <span className="text-[#0B3C5D]/40 text-[11px] sm:text-xs">
          {new Date(result.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })}
        </span>
      </div>
    </Reveal>
  );
}

/* ─── Recitation Result Row (Light) ─── */
function RecitationRow({ result, index }) {
  const pct = result.total_score > 0 ? Math.round((result.score / result.total_score) * 100) : 0;
  const passed = result.passed;
  const barColor = passed
    ? pct >= 85 ? 'bg-emerald-500' : 'bg-blue-500'
    : 'bg-red-400';

  return (
    <Reveal delay={index * 0.06}
      className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 hover:border-orange-300 hover:shadow-sm transition-all duration-300 min-w-0"
      style={{ boxShadow: '0 1px 4px rgba(11,60,93,0.05)' }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-[#0B3C5D] font-bold text-xs sm:text-sm leading-snug break-words">{result.recitation_title}</p>
        </div>
        <div className={`shrink-0 flex items-center gap-1 text-[11px] sm:text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${passed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
          {passed ? <CheckCircle className="w-3 h-3 shrink-0" /> : <XCircle className="w-3 h-3 shrink-0" />}
          {passed ? 'ناجح' : 'راسب'}
        </div>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3 mb-2.5">
        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[#0B3C5D] font-black text-xs sm:text-sm shrink-0">
          {result.score}<span className="text-[#0B3C5D]/40 font-normal text-xs">/{result.total_score}</span>
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#0B3C5D]/50">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-emerald-600 font-semibold">
            <CheckCircle className="w-3 h-3 shrink-0" />{result.correct_count} صح
          </span>
          <span className="flex items-center gap-1 text-red-500 font-semibold">
            <XCircle className="w-3 h-3 shrink-0" />{result.wrong_count} غلط
          </span>
        </div>
        <span className="text-[#0B3C5D]/40 text-[11px] sm:text-xs">
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
      className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 hover:border-orange-300 hover:shadow-sm transition-all duration-300 min-w-0"
      style={{ boxShadow: '0 1px 4px rgba(11,60,93,0.05)' }}>
      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-orange-100 to-orange-200 border border-orange-200 flex items-center justify-center shrink-0">
        <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 shrink-0" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[#0B3C5D] font-bold text-xs sm:text-sm break-words">{course.name}</p>
        {course.target_stage && (
          <p className="text-[#0B3C5D]/50 text-xs mt-0.5 break-words">{course.target_stage}</p>
        )}
      </div>
      <div className={`shrink-0 text-[11px] sm:text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${course.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
        {course.status === 'active' ? 'نشط' : 'غير نشط'}
      </div>
    </Reveal>
  );
}

/* ─── Video Progress Detail Row (Light) ─── */
function VideoRow({ video, index }) {
  const pct = Math.min(100, Math.round(parseFloat(video.progress_percentage || 0)));
  const isCompleted = pct >= 90;
  const watchedMins = Math.round(video.watched_minutes || 0);
  const totalMins = video.duration_minutes || 0;

  return (
    <Reveal delay={index * 0.04}
      className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 hover:border-blue-300 hover:shadow-sm transition-all duration-300 min-w-0"
      style={{ boxShadow: '0 1px 4px rgba(11,60,93,0.05)' }}>
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex-1 min-w-0">
          <p className="text-[#0B3C5D] font-bold text-xs sm:text-sm leading-snug break-words">{video.video_title}</p>
          {video.course_name && (
            <p className="text-[#0B3C5D]/50 text-xs mt-0.5 break-words">{video.course_name}</p>
          )}
        </div>
        <div className={`shrink-0 flex items-center gap-1 text-[11px] sm:text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${isCompleted ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
          {isCompleted ? <CheckCircle className="w-3 h-3 shrink-0" /> : <Clock className="w-3 h-3 shrink-0" />}
          {isCompleted ? 'مكتمل' : 'قيد المشاهدة'}
        </div>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3 mb-2">
        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${isCompleted ? 'bg-emerald-500' : 'bg-blue-500'}`}
            style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[#0B3C5D] font-black text-xs sm:text-sm shrink-0">
          {pct}%
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#0B3C5D]/50">
        <span className="flex items-center gap-1 text-blue-600 font-semibold">
          <Clock className="w-3 h-3 shrink-0 text-blue-500" />
          شاهد {watchedMins} دقيقة {totalMins > 0 ? `من ${totalMins} دقيقة` : ''}
        </span>
        {video.watch_count > 1 && (
          <span className="text-purple-600 bg-purple-50 border border-purple-200 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full">
            شوهد {video.watch_count} مرات
          </span>
        )}
        {video.last_watched_at && (
          <span className="text-[#0B3C5D]/40 text-[11px] sm:text-xs mr-auto">
            آخر مشاهدة: {new Date(video.last_watched_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
    </Reveal>
  );
}

/* ════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════ */
export default function ParentPortal() {
  useForceLightMode();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectingId, setSelectingId] = useState(null);
  const [data, setData] = useState(null);
  const [multiStudents, setMultiStudents] = useState(null);
  const [error, setError] = useState('');
  const [showAllVideos, setShowAllVideos] = useState(false);
  const resultsRef = useRef(null);
  const { platformName, logoUrl } = useTeacher();
  const displayLogo = logoUrl || wathbaLogo;

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!phone.trim()) return;
    setLoading(true);
    setError('');
    setData(null);
    setMultiStudents(null);
    try {
      const res = await api.get('/public/parent-lookup', { params: { phone: phone.trim() } });
      if (res.data.multiple) {
        setMultiStudents(res.data.students);
        setData(null);
      } else {
        setData(res.data);
        if (res.data.available_students) {
          setMultiStudents(res.data.available_students);
        }
      }
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      setError(err.response?.data?.error || 'حدث خطأ، حاول مرة أخرى');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectStudent = async (studentId) => {
    if (!phone.trim() || !studentId) return;
    setSelectingId(studentId);
    setError('');
    try {
      const res = await api.get('/public/parent-lookup', {
        params: { phone: phone.trim(), student_id: studentId }
      });
      setData(res.data);
      if (res.data.available_students) {
        setMultiStudents(res.data.available_students);
      }
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      setError(err.response?.data?.error || 'حدث خطأ، حاول مرة أخرى');
    } finally {
      setSelectingId(null);
    }
  };

  const student = data?.student;
  const exams = data?.exam_results || [];
  const recitations = data?.recitation_results || [];
  const courses = data?.courses || [];
  const vp = data?.video_progress;
  const videoDetails = data?.video_details || [];
  const classAttendance = data?.class_attendance || [];
  const attendanceEnabled = data?.attendance_enabled === true;

  const passedCount = exams.filter(r => r.score >= r.pass_score).length;
  const failedCount = exams.length - passedCount;

  const recitationPassedCount = recitations.filter(r => r.passed).length;
  const recitationFailedCount = recitations.length - recitationPassedCount;

  const avgScore = exams.length > 0
    ? Math.round(exams.reduce((acc, r) => acc + (r.total_score > 0 ? (r.score / r.total_score) * 100 : 0), 0) / exams.length)
    : 0;

  const recitationAvgScore = recitations.length > 0
    ? Math.round(recitations.reduce((acc, r) => acc + (r.total_score > 0 ? (r.score / r.total_score) * 100 : 0), 0) / recitations.length)
    : 0;

  // Overall combined score percentage
  const totalEvaluations = exams.length + recitations.length;
  const overallAvg = totalEvaluations > 0
    ? Math.round(((avgScore * exams.length) + (recitationAvgScore * recitations.length)) / totalEvaluations)
    : (avgScore || recitationAvgScore || 0);

  // Performance Rating Level
  let perfLevel = {
    title: 'مستقر 👍',
    color: 'text-blue-600',
    bg: 'bg-blue-50 border-blue-200',
    note: 'مستوى الطالب جيد ويستمر في التقدّم بالدروس والأنشطة.'
  };
  if (totalEvaluations > 0) {
    if (overallAvg >= 85) {
      perfLevel = {
        title: 'ممتاز 🌟',
        color: 'text-emerald-700',
        bg: 'bg-emerald-50 border-emerald-200',
        note: 'أداء ممتاز ومشرّف! ننصح بالاستمرار والمحافظة على هذا المستوى المتميز.'
      };
    } else if (overallAvg >= 75) {
      perfLevel = {
        title: 'جيد جداً 👏',
        color: 'text-blue-700',
        bg: 'bg-blue-50 border-blue-200',
        note: 'أداء جيد جداً، مع قليل من المتابعة والتركيز يمكن الوصول إلى الدرجة النهائية.'
      };
    } else if (overallAvg >= 60) {
      perfLevel = {
        title: 'جيد 👌',
        color: 'text-amber-700',
        bg: 'bg-amber-50 border-amber-200',
        note: 'مستوى مقبول، ولكنه يحتاج إلى مزيد من المراجعة والالتزام بحل الامتحانات والتسميعات.'
      };
    } else {
      perfLevel = {
        title: 'يحتاج إلى متابعة ⚠️',
        color: 'text-red-700',
        bg: 'bg-red-50 border-red-200',
        note: 'ينصح بمتابعة الطالب بشكل مباشر ومراجعة الدروس والاختبارات الراسب بها.'
      };
    }
  }

  // Format watched time in hours & minutes
  const totalWatchedMins = Math.round(vp?.total_watched_minutes || 0);
  const watchedHours = Math.floor(totalWatchedMins / 60);
  const remMins = totalWatchedMins % 60;
  const timeFormatted = watchedHours > 0
    ? `${watchedHours} ساعة ${remMins > 0 ? `و ${remMins} دقيقة` : ''}`
    : `${totalWatchedMins} دقيقة`;

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#F8FAFC] text-[#0B3C5D]" dir="rtl">
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
      <nav className="fixed top-0 inset-x-0 z-50 pp-nav-blur border-b border-[#0B3C5D]/10 bg-white/90">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Link to="/"
              className="flex items-center gap-1.5 bg-[#0B3C5D]/5 border border-[#0B3C5D]/15 hover:bg-[#0B3C5D]/10 hover:border-[#0B3C5D]/25 text-[#0B3C5D]/70 hover:text-[#0B3C5D] font-bold text-xs sm:text-sm px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl transition-all duration-200 active:scale-95">
              <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 rotate-180 shrink-0" />
              <span>رجوع</span>
            </Link>
            <Link to="/" className="flex items-center shrink-0">
              <img src={displayLogo} alt={platformName} className="h-8 sm:h-10 w-auto rounded-xl shadow-sm max-w-[120px] sm:max-w-none object-contain" />
            </Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <span className="hidden sm:block text-[#0B3C5D]/50 text-sm font-semibold">بوابة أولياء الأمور</span>
            <Link to="/login"
              className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white font-black text-xs sm:text-sm px-3 py-1.5 sm:px-5 sm:py-2.5 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-orange-500/30 active:scale-95 shrink-0">
              <span>تسجيل الدخول</span>
              <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO / SEARCH ── */}
      <section className="relative min-h-[calc(100vh-3.5rem)] flex items-center justify-center overflow-hidden pt-20 pb-12 pp-dot-grid w-full">
        <div className="absolute inset-0 bg-gradient-to-br from-white via-[#F4F8FC] to-[#E8EFF8]" />

        {/* Orbs */}
        <div className="pp-orb hidden sm:block" style={{ width:600, height:600, top:-150, left:-150, background:'radial-gradient(circle,rgba(11,60,93,0.08),transparent 70%)', animation:'ppFloatOrb 10s ease-in-out infinite alternate' }} />
        <div className="pp-orb hidden sm:block" style={{ width:500, height:500, top:'30%', left:'60%', background:'radial-gradient(circle,rgba(249,115,22,0.07),transparent 70%)', animation:'ppFloatOrb 12s ease-in-out 2s infinite alternate' }} />

        {/* SVG side deco left */}
        <svg style={{ position:'absolute', left:0, top:0, bottom:0, height:'100%', width:'22%', opacity:0.3, pointerEvents:'none' }} viewBox="0 0 200 900" fill="none" preserveAspectRatio="none" className="hidden md:block">
          <path d="M-70,0 Q70,220 -20,440 T20,730 Q-60,830 -180,900 L-180,0 Z" fill="#0B3C5D" fillOpacity="0.05" />
          <path d="M-50,0 Q90,240 0,450 T40,700 Q-50,800 -180,900 L-180,0 Z" fill="#f97316" fillOpacity="0.06" />
          <path d="M5,0 Q130,230 10,460 T25,780 Q-60,860 -110,900" stroke="#0B3C5D" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
        </svg>
        {/* SVG side deco right */}
        <svg style={{ position:'absolute', right:0, top:0, bottom:0, height:'100%', width:'22%', opacity:0.3, pointerEvents:'none' }} viewBox="0 0 200 900" fill="none" preserveAspectRatio="none" className="hidden md:block">
          <path d="M270,0 Q140,220 240,440 T200,730 Q280,830 400,900 L400,0 Z" fill="#0B3C5D" fillOpacity="0.05" />
          <path d="M250,0 Q110,240 220,450 T180,700 Q280,800 400,900 L400,0 Z" fill="#f97316" fillOpacity="0.06" />
          <path d="M195,0 Q70,230 190,460 T175,780 Q260,860 310,900" stroke="#0B3C5D" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
        </svg>

        <div className="relative z-10 w-full max-w-2xl mx-auto px-4 sm:px-6 text-center">
          {/* Badge */}
          <div className="pp-fade-in inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-600 text-xs sm:text-sm font-bold px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full mb-6 sm:mb-8"
            style={{ animationDelay: '0.1s' }}>
            <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            بوابة أولياء الأمور
          </div>

          <h1 className="pp-fade-in font-black mb-4 leading-tight break-words"
            style={{ fontSize: 'clamp(1.75rem,5vw,3.2rem)', animationDelay: '0.2s' }}>
            تابع مسيرة<br />
            <span className="pp-gradient-text">ابنك التعليمية</span>
          </h1>

          <p className="pp-fade-in text-[#0B3C5D]/60 text-sm sm:text-base mb-8 sm:mb-10 leading-relaxed max-w-md mx-auto px-2"
            style={{ animationDelay: '0.35s' }}>
            أدخل رقم هاتفك المسجّل لدينا وستظهر لك نتائج امتحانات ابنك، كورساته، وكل إنجازاته في المنصة.
          </p>

          {/* Search form */}
          <form onSubmit={handleSearch}
            className="pp-fade-in relative w-full" style={{ animationDelay: '0.5s' }}>
            <div className="bg-white border border-[#0B3C5D]/12 rounded-2xl p-1.5 sm:p-2 flex items-center gap-1.5 sm:gap-2 focus-within:border-orange-400 transition-all duration-300 shadow-lg shadow-[#0B3C5D]/5 max-w-full">
              <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-orange-500/10 shrink-0">
                <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" />
              </div>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="أدخل رقم هاتف ولي الأمر..."
                className="w-full min-w-0 flex-1 bg-transparent text-[#0B3C5D] placeholder-[#0B3C5D]/35 text-sm sm:text-base font-semibold outline-none py-2.5 sm:py-3 px-1 sm:px-2 pp-input-focus"
                dir="ltr"
              />
              <button type="submit" disabled={loading || !phone.trim()}
                className="flex items-center gap-1.5 sm:gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black px-3.5 py-2.5 sm:px-6 sm:py-3 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-orange-500/25 active:scale-95 shrink-0 text-xs sm:text-base">
                {loading ? (
                  <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Search className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
                <span>{loading ? 'بحث...' : 'بحث'}</span>
              </button>
            </div>
          </form>

          {/* Error */}
          {error && (
            <div className="mt-4 pp-fade-in flex items-center gap-2.5 sm:gap-3 bg-red-50 border border-red-200 text-red-600 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-right">
              <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
              <span className="break-words flex-1 min-w-0">{error}</span>
            </div>
          )}

          {/* Hint */}
          {!data && !multiStudents && !error && (
            <p className="pp-fade-in text-[#0B3C5D]/40 text-xs mt-5 leading-normal px-4" style={{ animationDelay: '0.7s' }}>
              الرقم المسجَّل هو رقم ولي الأمر الذي أضافه المعلم عند تسجيل الطالب
            </p>
          )}
        </div>
      </section>

      {/* ── MULTI-STUDENT SELECTOR STEP (الحل الثاني: اختيار الطالب) ── */}
      {!data && multiStudents && multiStudents.length > 0 && (
        <div ref={resultsRef} className="relative pb-24 bg-[#F0F4F8] w-full">
          <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 pt-10 sm:pt-14">
            <Reveal className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl p-5 sm:p-8 mb-8 shadow-xl shadow-[#0B3C5D]/5 text-center">
              <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-600 text-xs sm:text-sm font-bold px-4 py-1.5 rounded-full mb-4">
                <Users className="w-4 h-4 text-orange-500" />
                <span>تم العثور على {multiStudents.length} طلاب مسجلين برقمك</span>
              </div>
              <h2 className="text-[#0B3C5D] font-black text-xl sm:text-2xl mb-2">اختر الطالب لعرض تقريره التعليمي</h2>
              <p className="text-[#0B3C5D]/60 text-xs sm:text-sm max-w-lg mx-auto mb-8 leading-relaxed">
                يرجى اختيار الابن / الابنة التي تود متابعة نتائج امتحاناتها، تسميعاتها، ونسب المشاهدة ومستوى أدائها العام.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 text-right">
                {multiStudents.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleSelectStudent(s.id)}
                    disabled={selectingId !== null}
                    className="group relative bg-gradient-to-br from-white to-slate-50 hover:to-orange-50/50 border-2 border-slate-200 hover:border-orange-400 rounded-2xl p-5 sm:p-6 transition-all duration-300 hover:shadow-lg hover:shadow-orange-500/10 text-right flex flex-col justify-between gap-4 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:border-orange-500"
                  >
                    <div className="flex items-center gap-3.5 sm:gap-4">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 text-white font-black text-lg sm:text-xl flex items-center justify-center shadow-md shadow-orange-500/20 shrink-0 group-hover:scale-105 transition-transform duration-300">
                        {s.name?.charAt(0) || '؟'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[#0B3C5D] font-black text-base sm:text-lg group-hover:text-orange-600 transition-colors duration-200 truncate">
                          {s.name}
                        </h3>
                        {s.academic_stage && (
                          <div className="flex items-center gap-1.5 text-xs text-[#0B3C5D]/60 mt-1 font-semibold">
                            <GraduationCap className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                            <span className="truncate">{s.academic_stage}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-200/60 mt-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200/60 px-2.5 py-1 rounded-full">
                        <Trophy className="w-3.5 h-3.5 shrink-0" />
                        <span>{s.points?.toLocaleString('ar-EG') || 0} نقطة</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs sm:text-sm font-black text-orange-600 group-hover:translate-x-[-4px] transition-transform duration-200">
                        {selectingId === s.id ? (
                          <div className="flex items-center gap-2">
                            <div className="w-3.5 h-3.5 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
                            <span>جاري الفتح...</span>
                          </div>
                        ) : (
                          <>
                            <span>عرض التقرير</span>
                            <ArrowLeft className="w-4 h-4" />
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      )}

      {/* ── RESULTS ── */}
      {data && (
        <div ref={resultsRef} className="relative pb-24 bg-[#F0F4F8] w-full">
          <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16">

            {/* Back to students selection banner (when multiple students exist) */}
            {multiStudents && multiStudents.length > 1 && (
              <Reveal className="mb-6 flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-orange-500/10 text-orange-600 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs text-[#0B3C5D]/60 font-semibold">متابعة تقرير</p>
                    <p className="text-sm font-black text-[#0B3C5D]">{student.name} {student.academic_stage ? `(${student.academic_stage})` : ''}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setData(null);
                    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
                  }}
                  className="flex items-center gap-1.5 bg-slate-100 hover:bg-orange-50 border border-slate-200 hover:border-orange-300 text-[#0B3C5D] hover:text-orange-600 text-xs sm:text-sm font-bold px-3.5 py-2 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
                >
                  <Users className="w-4 h-4 text-orange-500" />
                  <span>اختيار طالب آخر ({multiStudents.length} طلاب)</span>
                  <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                </button>
              </Reveal>
            )}

            {/* ── Student Header Card ── */}
            <Reveal className="bg-gradient-to-l from-orange-50 via-white to-blue-50 border border-slate-200 rounded-2xl sm:rounded-3xl p-4 sm:p-6 mb-6 min-w-0"
              style={{ boxShadow: '0 4px 20px rgba(11,60,93,0.08)' }}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-5">
                <div className="flex items-center gap-3.5 sm:gap-5 min-w-0">
                  <div className="w-13 h-13 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-xl sm:text-2xl font-black text-white shadow-lg shadow-orange-500/25 shrink-0">
                    {student.name?.charAt(0) || '؟'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-[#0B3C5D] font-black text-lg sm:text-2xl leading-tight break-words">{student.name}</h2>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2">
                      {student.academic_stage && (
                        <span className="flex items-center gap-1.5 text-orange-600 text-xs sm:text-sm font-bold bg-orange-50 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full border border-orange-200">
                          <GraduationCap className="w-3.5 h-3.5 shrink-0" />
                          <span className="break-words">{student.academic_stage}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1.5 text-purple-600 text-xs sm:text-sm font-bold bg-purple-50 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full border border-purple-200">
                        <Trophy className="w-3.5 h-3.5 shrink-0" />
                        المركز #{student.rank}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex sm:flex-col items-center justify-between sm:items-end pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-200/60 shrink-0">
                  <p className="text-[#0B3C5D]/50 text-xs sm:mb-1 font-semibold">النقاط الكلية</p>
                  <p className="text-orange-500 font-black text-2xl sm:text-3xl">{student.points?.toLocaleString('ar-EG')}</p>
                </div>
              </div>
            </Reveal>

            {/* ── Student Overall Performance Rating Banner ── */}
            {totalEvaluations > 0 && (
              <Reveal delay={0.05} className={`border rounded-2xl p-4 sm:p-5 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${perfLevel.bg}`}
                style={{ boxShadow: '0 2px 10px rgba(11,60,93,0.04)' }}>
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                    <Award className="w-5 h-5 text-orange-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-[#0B3C5D] font-bold text-xs sm:text-sm">مستوى الطالب العام:</span>
                      <span className={`font-black text-sm sm:text-base px-2.5 py-0.5 rounded-lg bg-white border border-slate-200 shadow-sm ${perfLevel.color}`}>
                        {perfLevel.title}
                      </span>
                    </div>
                    <p className="text-[#0B3C5D]/70 text-xs sm:text-sm leading-relaxed break-words">
                      {perfLevel.note}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-slate-200/60 w-full sm:w-auto justify-between sm:justify-end">
                  <span className="text-[#0B3C5D]/50 text-xs font-semibold">المعدل الإجمالي:</span>
                  <span className="text-[#0B3C5D] font-black text-xl bg-white px-3 py-1 rounded-xl border border-slate-200 shadow-sm">
                    {overallAvg}%
                  </span>
                </div>
              </Reveal>
            )}

            {/* ── Expanded Stats Grid ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 mb-8 sm:mb-10">
              <StatCard icon={FileText}   label="إجمالي الامتحانات"    value={exams.length}             color="bg-blue-500"    delay={0}    />
              <StatCard icon={CheckCircle} label="ناجح (امتحانات)"   value={`${passedCount}`}         color="bg-emerald-500" delay={0.05} />
              <StatCard icon={XCircle}    label="راسب (امتحانات)"   value={`${failedCount}`}         color="bg-red-500"     delay={0.10} />
              <StatCard icon={BarChart3}  label="متوسط الامتحانات"   value={`${avgScore}%`}           color="bg-orange-500"  delay={0.15} />

              <StatCard icon={Mic}        label="إجمالي التسميعات"    value={recitations.length}       color="bg-indigo-500"  delay={0.20} />
              <StatCard icon={CheckCircle} label="ناجح (تسميعات)"    value={`${recitationPassedCount}`} color="bg-teal-500"  delay={0.25} />
              <StatCard icon={XCircle}    label="راسب (تسميعات)"    value={`${recitationFailedCount}`} color="bg-rose-500"  delay={0.30} />
              <StatCard icon={Tv}         label="فيديوهات المشاهدة"   value={`${vp?.videos_started || 0}${vp?.total_course_videos ? ` / ${vp.total_course_videos}` : ''}`} color="bg-purple-500" delay={0.35} />
            </div>

            {/* ── Video Watching Analytics ── */}
            {vp && (parseInt(vp.videos_started) > 0 || videoDetails.length > 0) && (
              <Reveal className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 mb-8 min-w-0"
                style={{ boxShadow: '0 2px 12px rgba(11,60,93,0.06)' }}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
                      <Video className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <h3 className="text-[#0B3C5D] font-black text-base sm:text-lg">متابعة مشاهدة فيديوهات الدروس</h3>
                      <p className="text-[#0B3C5D]/50 text-xs mt-0.5">تفاصيل مشاهدة الفيديوهات المسجّلة في الكورسات</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-blue-50/80 border border-blue-200/80 text-blue-700 font-bold text-xs px-3 py-1.5 rounded-full shrink-0 self-start sm:self-auto">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>إجمالي المشاهدة: {timeFormatted}</span>
                  </div>
                </div>

                {/* Progress Stats Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  <div className="bg-slate-50/80 border border-slate-200/60 rounded-2xl p-4 text-center sm:text-right">
                    <p className="text-[#0B3C5D]/50 text-xs font-semibold mb-1">الفيديوهات المشاهدة</p>
                    <p className="text-[#0B3C5D] font-black text-xl">
                      {vp.videos_started} <span className="text-[#0B3C5D]/40 text-xs font-normal">{vp.total_course_videos > 0 ? `من أصل ${vp.total_course_videos} فيديو` : 'فيديو'}</span>
                    </p>
                  </div>
                  <div className="bg-slate-50/80 border border-slate-200/60 rounded-2xl p-4 text-center sm:text-right">
                    <p className="text-[#0B3C5D]/50 text-xs font-semibold mb-1">إجمالي وقت المشاهدة</p>
                    <p className="text-orange-500 font-black text-xl">{timeFormatted}</p>
                  </div>
                  <div className="bg-slate-50/80 border border-slate-200/60 rounded-2xl p-4 text-center sm:text-right">
                    <p className="text-[#0B3C5D]/50 text-xs font-semibold mb-1">متوسط نسبة الإكمال</p>
                    <p className="text-blue-600 font-black text-xl">{Math.round(parseFloat(vp.avg_progress || 0))}%</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mb-6">
                  <div className="flex justify-between text-xs text-[#0B3C5D]/60 font-semibold mb-1.5">
                    <span>التقدم العام في مشاهدة الكورسات</span>
                    <span className="text-blue-600 font-bold">{Math.round(parseFloat(vp.avg_progress || 0))}%</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-l from-blue-500 via-indigo-500 to-orange-500 rounded-full transition-all duration-1000"
                      style={{ width: `${Math.min(100, Math.round(parseFloat(vp.avg_progress || 0)))}%` }} />
                  </div>
                </div>

                {/* Detailed Video List */}
                {videoDetails.length > 0 && (
                  <div>
                    <h4 className="text-[#0B3C5D] font-bold text-sm mb-3 flex items-center justify-between">
                      <span>سجل الفيديوهات المشاهدة ({videoDetails.length})</span>
                      {videoDetails.length > 4 && (
                        <button onClick={() => setShowAllVideos(!showAllVideos)}
                          className="text-xs text-orange-500 hover:text-orange-600 font-bold transition-colors">
                          {showAllVideos ? 'عرض أقل' : `عرض الكل (${videoDetails.length})`}
                        </button>
                      )}
                    </h4>
                    <div className="flex flex-col gap-3">
                      {(showAllVideos ? videoDetails : videoDetails.slice(0, 4)).map((v, i) => (
                        <VideoRow key={v.video_id} video={v} index={i} />
                      ))}
                    </div>
                  </div>
                )}
              </Reveal>
            )}

            <div className="grid lg:grid-cols-2 gap-6 sm:gap-8">
              {/* ── Exam Results ── */}
              <div>
                <Reveal className="flex items-center gap-3 mb-4 sm:mb-5">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-orange-100 border border-orange-200 flex items-center justify-center shrink-0">
                    <Target className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" />
                  </div>
                  <h3 className="text-[#0B3C5D] font-black text-base sm:text-lg">نتائج الامتحانات</h3>
                  <span className="mr-auto text-[#0B3C5D]/40 text-xs sm:text-sm bg-[#0B3C5D]/5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full shrink-0">{exams.length}</span>
                </Reveal>

                {exams.length === 0 ? (
                  <Reveal className="text-center py-10 sm:py-12 text-[#0B3C5D]/30 bg-white border border-slate-200 rounded-2xl">
                    <FileText className="w-9 h-9 sm:w-10 sm:h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-xs sm:text-sm">لا توجد نتائج امتحانات حتى الآن</p>
                  </Reveal>
                ) : (
                  <div className="flex flex-col gap-3">
                    {exams.map((r, i) => <ExamRow key={r.id} result={r} index={i} />)}
                  </div>
                )}
              </div>

              {/* ── Recitation Results ── */}
              <div>
                <Reveal className="flex items-center gap-3 mb-4 sm:mb-5">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-indigo-100 border border-indigo-200 flex items-center justify-center shrink-0">
                    <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500" />
                  </div>
                  <h3 className="text-[#0B3C5D] font-black text-base sm:text-lg">نتائج التسميعات</h3>
                  <span className="mr-auto text-[#0B3C5D]/40 text-xs sm:text-sm bg-[#0B3C5D]/5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full shrink-0">{recitations.length}</span>
                </Reveal>

                {recitations.length === 0 ? (
                  <Reveal className="text-center py-10 sm:py-12 text-[#0B3C5D]/30 bg-white border border-slate-200 rounded-2xl">
                    <Mic className="w-9 h-9 sm:w-10 sm:h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-xs sm:text-sm">لا توجد نتائج تسميعات حتى الآن</p>
                  </Reveal>
                ) : (
                  <div className="flex flex-col gap-3">
                    {recitations.map((r, i) => <RecitationRow key={r.id} result={r} index={i} />)}
                  </div>
                )}
              </div>
            </div>

            {/* ── Courses + Performance Summary ── */}
            <div className="grid lg:grid-cols-2 gap-6 sm:gap-8 mt-6 sm:mt-8">
              {/* ── Courses ── */}
              <div>
                <Reveal className="flex items-center gap-3 mb-4 sm:mb-5">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-purple-100 border border-purple-200 flex items-center justify-center shrink-0">
                    <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500" />
                  </div>
                  <h3 className="text-[#0B3C5D] font-black text-base sm:text-lg">الكورسات المسجّلة</h3>
                  <span className="mr-auto text-[#0B3C5D]/40 text-xs sm:text-sm bg-[#0B3C5D]/5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full shrink-0">{courses.length}</span>
                </Reveal>

                {courses.length === 0 ? (
                  <Reveal className="text-center py-10 sm:py-12 text-[#0B3C5D]/30 bg-white border border-slate-200 rounded-2xl">
                    <BookOpen className="w-9 h-9 sm:w-10 sm:h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-xs sm:text-sm">لم يُسجَّل في أي كورس بعد</p>
                  </Reveal>
                ) : (
                  <div className="flex flex-col gap-3">
                    {courses.map((c, i) => <CourseRow key={c.id} course={c} index={i} />)}
                  </div>
                )}
              </div>

              {/* Performance Summary */}
              {(exams.length > 0 || recitations.length > 0) && (
                <div>
                  <Reveal className="flex items-center gap-3 mb-4 sm:mb-5">
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-orange-100 border border-orange-200 flex items-center justify-center shrink-0">
                      <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" />
                    </div>
                    <h3 className="text-[#0B3C5D] font-black text-base sm:text-lg">ملخص الأداء والنسب</h3>
                  </Reveal>
                  <Reveal delay={0.1} className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5"
                    style={{ boxShadow: '0 2px 8px rgba(11,60,93,0.06)' }}>
                    <div className="space-y-4">
                      {exams.length > 0 && (
                        <div>
                          <div className="flex justify-between text-xs text-[#0B3C5D]/60 font-semibold mb-1">
                            <span className="break-words">نسبة نجاح الامتحانات ({passedCount} ناجح من {exams.length})</span>
                            <span className="text-[#0B3C5D] font-bold shrink-0">{Math.round((passedCount / exams.length) * 100)}%</span>
                          </div>
                          <div className="h-2 bg-red-100 rounded-full overflow-hidden flex">
                            <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000"
                              style={{ width: `${(passedCount / exams.length) * 100}%` }} />
                          </div>
                          <div className="flex justify-between text-[11px] text-[#0B3C5D]/50 mt-1">
                            <span className="text-emerald-600 font-semibold">ناجح: {passedCount}</span>
                            <span className="text-red-500 font-semibold">راسب: {failedCount}</span>
                          </div>
                        </div>
                      )}

                      {exams.length > 0 && (
                        <div>
                          <div className="flex justify-between text-xs text-[#0B3C5D]/60 font-semibold mb-1">
                            <span>متوسط درجات الامتحانات</span>
                            <span className="text-[#0B3C5D] font-bold shrink-0">{avgScore}%</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-l from-orange-400 to-orange-600 rounded-full transition-all duration-1000"
                              style={{ width: `${avgScore}%` }} />
                          </div>
                        </div>
                      )}

                      {recitations.length > 0 && (
                        <div>
                          <div className="flex justify-between text-xs text-[#0B3C5D]/60 font-semibold mb-1">
                            <span className="break-words">نسبة نجاح التسميعات ({recitationPassedCount} ناجح من {recitations.length})</span>
                            <span className="text-[#0B3C5D] font-bold shrink-0">{Math.round((recitationPassedCount / recitations.length) * 100)}%</span>
                          </div>
                          <div className="h-2 bg-red-100 rounded-full overflow-hidden flex">
                            <div className="h-full bg-teal-500 rounded-full transition-all duration-1000"
                              style={{ width: `${(recitationPassedCount / recitations.length) * 100}%` }} />
                          </div>
                          <div className="flex justify-between text-[11px] text-[#0B3C5D]/50 mt-1">
                            <span className="text-teal-600 font-semibold">ناجح: {recitationPassedCount}</span>
                            <span className="text-rose-500 font-semibold">راسب: {recitationFailedCount}</span>
                          </div>
                        </div>
                      )}

                      {recitations.length > 0 && (
                        <div>
                          <div className="flex justify-between text-xs text-[#0B3C5D]/60 font-semibold mb-1">
                            <span>متوسط درجات التسميعات</span>
                            <span className="text-[#0B3C5D] font-bold shrink-0">{recitationAvgScore}%</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-l from-teal-400 to-teal-600 rounded-full transition-all duration-1000"
                              style={{ width: `${recitationAvgScore}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </Reveal>
                </div>
              )}
            </div>

            {/* ── Class Attendance Section (only if feature enabled and has records) ── */}
            {attendanceEnabled && classAttendance.length > 0 && (() => {
              // Group by subject_name
              const bySubject = {};
              classAttendance.forEach(r => {
                if (!bySubject[r.subject_name]) bySubject[r.subject_name] = [];
                bySubject[r.subject_name].push(r);
              });
              return (
                <Reveal className="mt-8">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-9 h-9 rounded-xl bg-cyan-100 border border-cyan-200 flex items-center justify-center shrink-0">
                      <CalendarCheck className="w-5 h-5 text-cyan-600" />
                    </div>
                    <h3 className="text-[#0B3C5D] font-black text-lg">سجل الحضور والغياب</h3>
                    <span className="mr-auto text-[#0B3C5D]/40 text-sm bg-[#0B3C5D]/5 px-3 py-1 rounded-full shrink-0">{classAttendance.length} سجل</span>
                  </div>
                  <div className="space-y-4">
                    {Object.entries(bySubject).map(([subjectName, records]) => {
                      const presentCount = records.filter(r => r.status === 'present').length;
                      const pct = records.length > 0 ? Math.round((presentCount / records.length) * 100) : 0;
                      return (
                        <Reveal key={subjectName}
                          className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-cyan-300 hover:shadow-sm transition-all duration-300 min-w-0"
                          style={{ boxShadow: '0 1px 4px rgba(11,60,93,0.05)' }}>
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-[#0B3C5D] font-black text-sm break-words">{subjectName}</p>
                              {records[0]?.academic_stage && (
                                <p className="text-[#0B3C5D]/40 text-xs break-words">{records[0].academic_stage}</p>
                              )}
                            </div>
                            <div className="text-left shrink-0">
                              <p className={`font-black text-lg ${pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>{pct}%</p>
                              <p className="text-[#0B3C5D]/40 text-xs">نسبة الحضور</p>
                            </div>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                            <div className={`h-full rounded-full transition-all duration-700 ${pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                              style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-[#0B3C5D]/50 mb-3">
                            <span className="text-emerald-600 font-bold">{presentCount} حاضر</span>
                            <span className="text-red-500 font-bold">{records.length - presentCount} غائب</span>
                            <span className="mr-auto text-[#0B3C5D]/40">{records.length} حصة إجمالي</span>
                          </div>
                          {/* Last 5 records */}
                          <div className="space-y-1.5">
                            {records.slice(0, 6).map((rec, i) => (
                              <div key={i} className="flex items-center justify-between text-xs gap-2 min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  {rec.status === 'present'
                                    ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                    : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                                  <span className={`shrink-0 ${rec.status === 'present' ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold'}`}>
                                    {rec.status === 'present' ? 'حاضر' : 'غائب'}
                                  </span>
                                  <span className="text-[#0B3C5D]/40 truncate">{rec.date}</span>
                                </div>
                                {rec.exam_score !== null && (
                                  <span className="font-bold text-[#0B3C5D] shrink-0">
                                    {rec.exam_score}{rec.exam_total ? `/${rec.exam_total}` : ''}
                                  </span>
                                )}
                              </div>
                            ))}
                            {records.length > 6 && (
                              <p className="text-[#0B3C5D]/30 text-center text-xs pt-1">+ {records.length - 6} سجل قديم</p>
                            )}
                          </div>
                        </Reveal>
                      );
                    })}
                  </div>
                </Reveal>
              );
            })()}

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
      <footer className="border-t border-[#0B3C5D]/10 py-6 sm:py-8 bg-white w-full">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-right">
          <div className="flex items-center gap-3">
            <img src={displayLogo} alt={platformName} className="h-8 sm:h-10 w-auto rounded-xl shadow-sm" />
            <span className="text-[#0B3C5D]/40 text-xs sm:text-sm">— المنصة التعليمية المتكاملة</span>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-4 sm:gap-5 text-xs sm:text-sm text-[#0B3C5D]/50 font-semibold">
            <Link to="/" className="hover:text-orange-500 transition-colors">الصفحة الرئيسية</Link>
            <Link to="/login" className="hover:text-orange-500 transition-colors">تسجيل الدخول</Link>
          </div>
          <p className="text-[#0B3C5D]/30 text-xs">© {new Date().getFullYear()} {platformName}</p>
        </div>
      </footer>
    </div>
  );
}
