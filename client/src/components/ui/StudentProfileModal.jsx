import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X, User, Phone, BookOpen, Award, CreditCard,
  CheckCircle2, XCircle, Star, GraduationCap, Calendar, Clock,
  Trophy, Wallet, Play, FileText, AlertCircle, ChevronDown, ChevronUp
} from 'lucide-react';
import api from '../../lib/api';

const fmt = (date) => date ? new Date(date).toLocaleDateString('ar-EG', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtShort = (date) => date ? new Date(date).toLocaleDateString('ar-EG', { day: '2-digit', month: 'short' }) : '—';

const STATUS_COLORS = {
  verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  rejected: 'bg-red-50 text-red-600 border-red-200',
};
const STATUS_LABELS = { verified: 'مؤكد', pending: 'معلق', rejected: 'مرفوض' };

function Section({ title, icon: Icon, iconBg, iconColor, count, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-100/70 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${iconBg}`}>
            <Icon className={`w-4 h-4 ${iconColor}`} />
          </div>
          <span className="font-black text-gray-800 text-sm">{title}</span>
          {count !== undefined && (
            <span className="text-xs font-bold bg-white border border-gray-200 text-gray-500 px-2 py-0.5 rounded-full">{count}</span>
          )}
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-gray-400" />
          : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function QuickStat({ label, value, color, bg }) {
  return (
    <div className={`${bg} rounded-2xl p-4 text-center flex-1`}>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 font-semibold mt-1">{label}</p>
    </div>
  );
}

export default function StudentProfileModal({ studentId, onClose }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['student-profile', studentId],
    queryFn: () => api.get(`/students/${studentId}/profile`).then(r => r.data),
    enabled: !!studentId,
  });

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const s = data?.student;
  const courses = data?.courses || [];
  const exams = data?.examResults || [];
  const payments = data?.payments || [];
  const badges = data?.badges || [];
  const recitations = data?.recitationResults || [];

  const passedExams = exams.filter(e => e.score >= e.pass_score).length;
  const avgScore = exams.length
    ? Math.round(exams.reduce((a, e) => a + (e.score / Math.max(e.total_score, 1)) * 100, 0) / exams.length)
    : 0;
  const totalPaid = payments.filter(p => p.status === 'verified').reduce((a, p) => a + parseFloat(p.amount), 0);
  const initial = s?.name?.charAt(0) || '؟';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        style={{ animation: 'fadeIn 0.2s ease' }}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '92vh', animation: 'modalIn 0.25s cubic-bezier(0.34,1.56,0.64,1)' }}
      >
        {/* ── Header ── */}
        <div className="bg-gradient-to-l from-[#1A2E4A] to-[#0f1e32] px-6 pt-6 pb-0 flex-shrink-0">
          {/* Top row */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-3xl font-black text-white border-2 border-white/20 flex-shrink-0">
                {isLoading ? '؟' : initial}
              </div>
              <div>
                {isLoading ? (
                  <div className="space-y-2">
                    <div className="h-5 w-40 bg-white/20 rounded-lg animate-pulse" />
                    <div className="h-3 w-28 bg-white/10 rounded-lg animate-pulse" />
                  </div>
                ) : (
                  <>
                    <h2 className="text-white font-black text-xl leading-tight">{s?.name}</h2>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {s?.academic_stage && (
                        <span className="text-xs font-semibold bg-white/15 text-white/90 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                          <GraduationCap className="w-3 h-3" /> {s.academic_stage}
                        </span>
                      )}
                      <span className="text-xs font-semibold bg-amber-400/20 text-amber-200 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                        <Star className="w-3 h-3 fill-amber-300 stroke-amber-300" /> {s?.points || 0} نقطة
                      </span>
                      {s?.gender && (
                        <span className="text-xs font-semibold bg-white/10 text-white/80 px-2.5 py-1 rounded-full">
                          {s.gender === 'male' ? '👦 ذكر' : s.gender === 'female' ? '👧 أنثى' : s.gender}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-colors flex-shrink-0 mt-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Stats Strip */}
          {!isLoading && !isError && (
            <div className="grid grid-cols-4 gap-2 bg-white/10 rounded-2xl p-3 mb-0">
              {[
                { label: 'الكورسات',      value: courses.length,          color: 'text-white' },
                { label: 'الاختبارات',    value: exams.length,            color: 'text-white' },
                { label: 'متوسط النتائج', value: `${avgScore}%`,          color: avgScore >= 50 ? 'text-emerald-300' : 'text-red-300' },
                { label: 'إجمالي الدفع',  value: `${totalPaid.toFixed(0)}ج`, color: 'text-amber-300' },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center py-1">
                  <p className={`text-lg font-black ${color}`}>{value}</p>
                  <p className="text-[11px] text-white/60 font-medium mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Tabs bar illusion - curved bottom */}
          <div className="h-4 bg-white mt-3 rounded-t-[20px]" />
        </div>

        {/* ── Scrollable Body ── */}
        <div className="flex-1 overflow-y-auto bg-white px-6 pb-6 space-y-4">
          {isLoading ? (
            <div className="space-y-4 pt-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-28 rounded-2xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : isError ? (
            <div className="text-center py-16">
              <AlertCircle className="w-14 h-14 mx-auto text-red-300 mb-3" />
              <p className="text-gray-500 font-semibold text-base">تعذّر تحميل بيانات الطالب</p>
            </div>
          ) : (
            <>
              {/* ── Personal Info ── */}
              <Section title="البيانات الشخصية" icon={User} iconBg="bg-blue-100" iconColor="text-blue-600" defaultOpen>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {[
                    { label: 'اسم المستخدم',   value: s?.username,                icon: User },
                    { label: 'رقم الهاتف',      value: s?.phone || '—',            icon: Phone },
                    { label: 'هاتف ولي الأمر',  value: s?.parent_phone || '—',     icon: Phone },
                    { label: 'تاريخ التسجيل',   value: fmt(s?.created_at),         icon: Calendar },
                    { label: 'الشارات',          value: `${badges.length} شارة`,    icon: Trophy },
                    { label: 'الكورسات',         value: `${courses.length} كورس`,   icon: BookOpen },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="bg-white border border-gray-100 rounded-xl p-3 flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-3.5 h-3.5 text-gray-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-gray-400 font-semibold">{label}</p>
                        <p className="text-xs font-bold text-gray-700 truncate">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {badges.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {badges.map(b => (
                      <span key={b.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black text-white shadow-sm"
                        style={{ background: b.badge_color || '#FF8C00' }}>
                        <Trophy className="w-3 h-3" /> {b.badge_name}
                      </span>
                    ))}
                  </div>
                )}
              </Section>

              {/* ── Courses ── */}
              <Section title="الكورسات المسجّل بها" icon={BookOpen} iconBg="bg-navy-50" iconColor="text-navy-600" count={courses.length}>
                {courses.length === 0 ? (
                  <p className="text-gray-400 text-sm font-medium text-center py-6">لم يُسجَّل في أي كورس بعد</p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {courses.map(c => {
                      const watchPct = parseInt(c.total_videos) > 0
                        ? Math.min(Math.round((parseInt(c.watched_videos) / parseInt(c.total_videos)) * 100), 100) : 0;
                      return (
                        <div key={c.id} className="bg-white border border-gray-100 rounded-2xl p-4">
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <p className="font-black text-sm text-gray-800 leading-snug">{c.name}</p>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${
                              c.status === 'active'
                                ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                                : 'bg-gray-100 text-gray-500 border-gray-200'
                            }`}>
                              {c.status === 'active' ? 'نشط' : c.status}
                            </span>
                          </div>
                          <div className="mb-3">
                            <div className="flex justify-between text-[10px] text-gray-400 font-semibold mb-1">
                              <span>تقدم المشاهدة</span>
                              <span className="font-black text-[#1A2E4A]">{watchPct}%</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                              <div className="h-2 rounded-full transition-all duration-700"
                                style={{ width: `${watchPct}%`, background: 'linear-gradient(90deg,#1A2E4A,#FF8C00)' }} />
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-gray-500 font-semibold">
                            <span className="flex items-center gap-1">
                              <Play className="w-3 h-3 text-[#1A2E4A]" />
                              {c.watched_videos}/{c.total_videos} فيديو
                            </span>
                            <span className="flex items-center gap-1">
                              <FileText className="w-3 h-3 text-orange-400" />
                              {c.total_pdfs} ملف
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-gray-400" />
                              {parseInt(c.total_watched_minutes || 0)} د
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>

              {/* ── Exam Results ── */}
              <Section title="نتائج الاختبارات" icon={Award} iconBg="bg-purple-100" iconColor="text-purple-600" count={exams.length}>
                {exams.length === 0 ? (
                  <p className="text-gray-400 text-sm font-medium text-center py-6">لم يحل أي اختبار بعد</p>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <QuickStat label="ناجح" value={passedExams} color="text-emerald-600" bg="bg-emerald-50" />
                      <QuickStat label="راسب" value={exams.length - passedExams} color="text-red-500" bg="bg-red-50" />
                      <QuickStat label="المتوسط" value={`${avgScore}%`} color={avgScore >= 50 ? 'text-blue-600' : 'text-orange-500'} bg="bg-blue-50" />
                    </div>
                    <div className="space-y-2.5">
                      {exams.map(e => {
                        const passed = e.score >= e.pass_score;
                        const pct = Math.min(Math.round((e.score / Math.max(e.total_score, 1)) * 100), 100);
                        return (
                          <div key={e.id} className="flex items-center gap-3 p-3.5 bg-white border border-gray-100 rounded-2xl">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${passed ? 'bg-emerald-100' : 'bg-red-100'}`}>
                              {passed
                                ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                : <XCircle className="w-5 h-5 text-red-500" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm text-gray-800 truncate">{e.exam_title}</p>
                              {e.course_name && <p className="text-[10px] text-gray-400 mt-0.5">{e.course_name}</p>}
                              <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                                <span className="flex items-center gap-1 text-emerald-500">
                                  <CheckCircle2 className="w-3 h-3" /> {e.correct_count}
                                </span>
                                <span className="flex items-center gap-1 text-red-400">
                                  <XCircle className="w-3 h-3" /> {e.wrong_count}
                                </span>
                                <span>{fmtShort(e.created_at)}</span>
                              </div>
                            </div>
                            <div className="text-left flex-shrink-0 min-w-[60px]">
                              <p className={`text-base font-black text-left ${passed ? 'text-emerald-600' : 'text-red-500'}`}>
                                {e.score}<span className="text-xs font-semibold text-gray-400">/{e.total_score}</span>
                              </p>
                              <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1 overflow-hidden">
                                <div className={`h-1.5 rounded-full ${passed ? 'bg-emerald-500' : 'bg-red-400'}`}
                                  style={{ width: `${pct}%` }} />
                              </div>
                              <p className={`text-[10px] font-bold text-left mt-0.5 ${passed ? 'text-emerald-500' : 'text-red-400'}`}>{pct}%</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </Section>

              {/* ── Recitation Results ── */}
              <Section title="آخر التسميعات" icon={FileText} iconBg="bg-indigo-100" iconColor="text-indigo-600"
                count={recitations.length} defaultOpen={false}>
                {recitations.length === 0 ? (
                  <p className="text-gray-400 text-sm font-medium text-center py-6">لا توجد تسميعات بعد</p>
                ) : (
                  <div className="space-y-2.5">
                    {recitations.map(r => {
                      const pct = Math.min(Math.round(r.score ?? 0), 100);
                      const passed = pct >= 50;
                      return (
                        <div key={r.id} className="flex items-center gap-3 p-3.5 bg-white border border-gray-100 rounded-2xl">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${passed ? 'bg-indigo-100' : 'bg-red-100'}`}>
                            <FileText className={`w-5 h-5 ${passed ? 'text-indigo-600' : 'text-red-500'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm text-gray-800 truncate">{r.recitation_title || 'تسميع'}</p>
                            <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                              <span className="flex items-center gap-1 text-emerald-500">
                                <CheckCircle2 className="w-3 h-3" /> {r.correct_count ?? '—'}
                              </span>
                              <span className="flex items-center gap-1 text-red-400">
                                <XCircle className="w-3 h-3" /> {r.wrong_count ?? '—'}
                              </span>
                              <span>{fmtShort(r.created_at)}</span>
                            </div>
                          </div>
                          <div className="text-left flex-shrink-0 min-w-[48px]">
                            <p className={`text-base font-black text-left ${passed ? 'text-indigo-600' : 'text-red-500'}`}>{pct}%</p>
                            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1 overflow-hidden">
                              <div className={`h-1.5 rounded-full ${passed ? 'bg-indigo-500' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>

              {/* ── Payments ── */}
              <Section title="سجل المدفوعات" icon={Wallet} iconBg="bg-amber-100" iconColor="text-amber-600"
                count={payments.length} defaultOpen={payments.length > 0}>
                {payments.length === 0 ? (
                  <p className="text-gray-400 text-sm font-medium text-center py-6">لا توجد مدفوعات مسجلة</p>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <QuickStat label="مؤكد" value={`${totalPaid.toFixed(0)}ج`} color="text-emerald-600" bg="bg-emerald-50" />
                      <QuickStat
                        label="معلق"
                        value={`${payments.filter(p => p.status === 'pending').reduce((a, p) => a + parseFloat(p.amount), 0).toFixed(0)}ج`}
                        color="text-amber-600" bg="bg-amber-50"
                      />
                      <QuickStat
                        label="الإجمالي"
                        value={`${payments.reduce((a, p) => a + parseFloat(p.amount), 0).toFixed(0)}ج`}
                        color="text-gray-700" bg="bg-gray-100"
                      />
                    </div>
                    <div className="space-y-2">
                      {payments.map(p => (
                        <div key={p.id} className="flex items-center gap-3 p-3.5 bg-white border border-gray-100 rounded-2xl">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            p.status === 'verified' ? 'bg-emerald-100' : p.status === 'pending' ? 'bg-amber-100' : 'bg-red-100'
                          }`}>
                            <CreditCard className={`w-4 h-4 ${
                              p.status === 'verified' ? 'text-emerald-600' : p.status === 'pending' ? 'text-amber-600' : 'text-red-500'
                            }`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm text-gray-800">{parseFloat(p.amount).toFixed(0)} جنيه</p>
                            <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5 flex-wrap">
                              <span>{p.method}</span>
                              {p.course_name && <><span>·</span><span className="truncate">{p.course_name}</span></>}
                              {p.reference_number && <><span>·</span><span>#{p.reference_number}</span></>}
                            </div>
                            {p.notes && <p className="text-[10px] text-gray-400 mt-0.5">{p.notes}</p>}
                          </div>
                          <div className="flex-shrink-0 text-left">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border block text-center ${STATUS_COLORS[p.status] || 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                              {STATUS_LABELS[p.status] || p.status}
                            </span>
                            <p className="text-[10px] text-gray-400 mt-1 text-center">{fmtShort(p.payment_date)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Section>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.93) translateY(12px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
      `}</style>
    </div>
  );
}
