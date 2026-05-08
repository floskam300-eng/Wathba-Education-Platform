import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart2, BookOpen, FileText, Award, Star, CreditCard,
  CheckCircle, XCircle, Clock, Play, TrendingUp, Trophy,
  Calendar, Video, Target, Wallet, AlertCircle, ChevronDown, ChevronUp
} from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const fmt = (n) => new Intl.NumberFormat('ar-EG').format(n);
const fmtDate = (d) => new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
const fmtMins = (m) => m >= 60 ? `${Math.floor(m / 60)}س ${m % 60}د` : `${m} دقيقة`;

const methodLabel = { instapay: 'إنستاباي', vodafone_cash: 'فودافون كاش', cash: 'كاش', bank: 'تحويل بنكي' };
const statusConfig = {
  completed: { label: 'مدفوع',    cls: 'bg-green-100 text-green-800' },
  verified:  { label: 'موثّق',    cls: 'bg-blue-100 text-blue-800' },
  pending:   { label: 'في الانتظار', cls: 'bg-yellow-100 text-yellow-800' },
  rejected:  { label: 'مرفوض',   cls: 'bg-red-100 text-red-800' },
};

function SummaryCard({ icon: Icon, label, value, sub, iconBg, iconColor, accent }) {
  return (
    <div className={`card !p-4 border-r-4 ${accent}`}>
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-2xl font-black text-navy-700 leading-tight">{value}</p>
          <p className="text-xs text-gray-600 font-semibold mt-0.5">{label}</p>
          {sub && <p className="text-xs text-gray-400 font-medium mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card !p-0 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <h2 className="text-base font-black text-navy-700 flex items-center gap-2">
          <Icon className="w-5 h-5 text-orange-500" />
          {title}
        </h2>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

function ScoreBar({ score, total, passScore }) {
  const pct = Math.round((score / total) * 100);
  const passed = score >= passScore;
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all ${passed ? 'bg-green-500' : 'bg-red-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-black w-8 text-right ${passed ? 'text-green-700' : 'text-red-600'}`}>{pct}%</span>
    </div>
  );
}

function ProgressRing({ value, max, size = 80, stroke = 8, color = '#f97316' }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  const dash = pct * circ;
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
        strokeWidth={stroke} strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
    </svg>
  );
}

export default function StudentMyStats() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['student-my-stats'],
    queryFn: () => api.get('/students/me/stats').then(r => r.data),
  });

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto p-4 lg:p-6 space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="card h-24 animate-pulse bg-gray-100" />
        ))}
      </div>
    );
  }

  const { student, courses = [], examResults = [], payments = [], badges = [], videoProgress = [], summary = {} } = data || {};

  const passRate = summary.totalExams > 0 ? Math.round((summary.passCount / summary.totalExams) * 100) : 0;

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <div className="space-y-5 max-w-4xl mx-auto">

        {/* ── Hero ── */}
        <div className="card bg-gradient-to-l from-navy-700 to-navy-500 text-white !p-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center text-2xl font-black shadow-lg flex-shrink-0">
              {user?.name?.charAt(0)}
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-black text-white">{student?.name}</h1>
              <p className="text-white/80 text-sm font-medium mt-0.5">{student?.academic_stage}</p>
              <div className="flex flex-wrap items-center gap-3 mt-3">
                <span className="flex items-center gap-1 bg-white/15 rounded-full px-3 py-1 text-sm font-bold text-yellow-300">
                  <Star className="w-4 h-4 fill-yellow-300" /> {fmt(student?.points || 0)} نقطة
                </span>
                {summary.rank && (
                  <span className="flex items-center gap-1 bg-white/15 rounded-full px-3 py-1 text-sm font-bold text-white">
                    <Trophy className="w-4 h-4 text-yellow-300" /> المركز #{summary.rank} من {summary.totalStudents}
                  </span>
                )}
                <span className="flex items-center gap-1 bg-white/15 rounded-full px-3 py-1 text-sm font-bold text-white/80">
                  <Calendar className="w-4 h-4" /> منذ {fmtDate(student?.created_at)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <SummaryCard icon={BookOpen}    label="الكورسات"         value={summary.totalCourses || 0}  iconBg="bg-blue-100"   iconColor="text-blue-700"   accent="border-blue-500" />
          <SummaryCard icon={FileText}    label="الامتحانات"        value={summary.totalExams || 0}    iconBg="bg-purple-100" iconColor="text-purple-700" accent="border-purple-500" />
          <SummaryCard icon={CheckCircle} label="ناجح"             value={summary.passCount || 0}     sub={`من ${summary.totalExams || 0} امتحان`} iconBg="bg-green-100" iconColor="text-green-700" accent="border-green-500" />
          <SummaryCard icon={Award}       label="الشارات"           value={summary.totalBadges || 0}   iconBg="bg-orange-100" iconColor="text-orange-700" accent="border-orange-500" />
          <SummaryCard icon={Video}       label="دقائق مشاهدة"     value={fmtMins(summary.totalWatchedMinutes || 0)} iconBg="bg-teal-100"   iconColor="text-teal-700"   accent="border-teal-500" />
          <SummaryCard icon={TrendingUp}  label="متوسط الدرجات"    value={`${summary.avgScore || 0}%`} iconBg="bg-indigo-100" iconColor="text-indigo-700" accent="border-indigo-500" />
          <SummaryCard icon={Wallet}      label="مدفوع"            value={`${fmt(summary.totalPaid || 0)} ج`}    iconBg="bg-emerald-100" iconColor="text-emerald-700" accent="border-emerald-500" />
          <SummaryCard icon={AlertCircle} label="معلّق"            value={`${fmt(summary.totalPending || 0)} ج`} iconBg="bg-yellow-100"  iconColor="text-yellow-700"  accent="border-yellow-500" />
        </div>

        {/* ── Performance Overview ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Pass Rate Ring */}
          <div className="card text-center !py-6 flex flex-col items-center gap-2">
            <p className="text-xs font-bold text-gray-500 mb-1">نسبة النجاح</p>
            <div className="relative">
              <ProgressRing value={passRate} max={100} size={90} stroke={9} color={passRate >= 50 ? '#22c55e' : '#ef4444'} />
              <span className={`absolute inset-0 flex items-center justify-center text-xl font-black ${passRate >= 50 ? 'text-green-600' : 'text-red-500'}`}>
                {passRate}%
              </span>
            </div>
            <p className="text-xs text-gray-500 font-medium">{summary.passCount} نجاح / {summary.failCount} رسوب</p>
          </div>

          {/* Avg Score Ring */}
          <div className="card text-center !py-6 flex flex-col items-center gap-2">
            <p className="text-xs font-bold text-gray-500 mb-1">متوسط الأداء</p>
            <div className="relative">
              <ProgressRing value={summary.avgScore || 0} max={100} size={90} stroke={9} color="#6366f1" />
              <span className="absolute inset-0 flex items-center justify-center text-xl font-black text-indigo-600">
                {summary.avgScore || 0}%
              </span>
            </div>
            <p className="text-xs text-gray-500 font-medium">من {summary.totalExams} امتحان</p>
          </div>

          {/* Rank */}
          <div className="card text-center !py-6 flex flex-col items-center gap-2">
            <p className="text-xs font-bold text-gray-500 mb-1">ترتيبي</p>
            <div className="relative">
              <ProgressRing
                value={summary.totalStudents ? summary.totalStudents - summary.rank + 1 : 1}
                max={summary.totalStudents || 1}
                size={90} stroke={9} color="#f59e0b"
              />
              <span className="absolute inset-0 flex items-center justify-center text-xl font-black text-amber-600">
                #{summary.rank || '-'}
              </span>
            </div>
            <p className="text-xs text-gray-500 font-medium">من {summary.totalStudents} طالب</p>
          </div>
        </div>

        {/* ── Badges ── */}
        {badges.length > 0 && (
          <Section title="شاراتي" icon={Award}>
            <div className="flex flex-wrap gap-3 pt-1">
              {badges.map(b => (
                <div key={b.id}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-white text-sm font-bold shadow-md"
                  style={{ backgroundColor: b.badge_color || '#f97316' }}>
                  🏅 {b.badge_name}
                  <span className="text-white/70 text-xs font-medium">· {b.exam_title}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── Exam Results ── */}
        <Section title={`نتائج الامتحانات (${examResults.length})`} icon={FileText}>
          {examResults.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-6">لم تؤدِ أي امتحانات بعد</p>
          ) : (
            <div className="space-y-3 pt-1">
              {examResults.map(r => {
                const pct = Math.round((r.score / r.total_score) * 100);
                const passed = r.score >= r.pass_score;
                return (
                  <div key={r.id} className={`rounded-xl border-2 p-4 ${passed ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-navy-700 text-sm leading-tight">{r.exam_title}</p>
                        {r.course_name && <p className="text-xs text-gray-500 font-medium mt-0.5">{r.course_name}</p>}
                        <div className="flex flex-wrap gap-3 mt-2 text-xs font-semibold text-gray-600">
                          <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-green-600" /> {r.correct_count} صواب</span>
                          <span className="flex items-center gap-1"><XCircle className="w-3.5 h-3.5 text-red-500" /> {r.wrong_count} خطأ</span>
                          {r.unanswered_count > 0 && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-gray-400" /> {r.unanswered_count} بدون إجابة</span>}
                          {r.points_earned > 0 && <span className="text-orange-600">+{r.points_earned} نقطة ⭐</span>}
                        </div>
                      </div>
                      <div className="text-center flex-shrink-0">
                        <p className={`text-2xl font-black ${passed ? 'text-green-700' : 'text-red-600'}`}>{r.score}<span className="text-sm font-semibold text-gray-400">/{r.total_score}</span></p>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${passed ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-700'}`}>
                          {passed ? '✓ ناجح' : '✗ راسب'}
                        </span>
                      </div>
                    </div>
                    <ScoreBar score={r.score} total={r.total_score} passScore={r.pass_score} />
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-gray-400">{fmtDate(r.created_at)}</p>
                      {r.badge_name && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: r.badge_color || '#f97316' }}>🏅 {r.badge_name}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* ── Courses & Video Progress ── */}
        <Section title={`الكورسات والتقدم (${courses.length})`} icon={BookOpen}>
          {courses.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-6">لم تنضم لأي كورس بعد</p>
          ) : (
            <div className="space-y-4 pt-1">
              {courses.map(c => {
                const progress = c.total_videos > 0 ? Math.round((c.watched_videos / c.total_videos) * 100) : 0;
                return (
                  <div key={c.id} className="rounded-xl border border-gray-200 p-4 bg-gray-50/50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-navy-700 text-sm">{c.name}</p>
                        {c.target_stage && <p className="text-xs text-gray-500 mt-0.5">{c.target_stage}</p>}
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${c.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {c.status === 'active' ? 'نشط' : c.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                      <div className="text-center bg-white rounded-lg p-2 border border-gray-100">
                        <p className="text-lg font-black text-navy-600">{c.watched_videos}<span className="text-xs text-gray-400">/{c.total_videos}</span></p>
                        <p className="text-xs text-gray-500 font-medium">فيديو شاهدته</p>
                      </div>
                      <div className="text-center bg-white rounded-lg p-2 border border-gray-100">
                        <p className="text-lg font-black text-orange-600">{fmtMins(c.total_watched_minutes)}</p>
                        <p className="text-xs text-gray-500 font-medium">وقت المشاهدة</p>
                      </div>
                      <div className="text-center bg-white rounded-lg p-2 border border-gray-100">
                        <p className="text-lg font-black text-indigo-600">{c.total_pdfs}</p>
                        <p className="text-xs text-gray-500 font-medium">ملفات PDF</p>
                      </div>
                      <div className="text-center bg-white rounded-lg p-2 border border-gray-100">
                        <p className="text-lg font-black text-teal-600">{progress}%</p>
                        <p className="text-xs text-gray-500 font-medium">الإنجاز</p>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-gray-500 font-medium mb-1">
                        <span>التقدم في الكورس</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-2.5 rounded-full transition-all bg-gradient-to-r from-navy-500 to-orange-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* ── Video Progress Detail ── */}
        {videoProgress.length > 0 && (
          <Section title={`سجل مشاهدة الفيديوهات (${videoProgress.length})`} icon={Play} defaultOpen={false}>
            <div className="space-y-2 pt-1">
              {videoProgress.map(vp => (
                <div key={vp.video_id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="w-9 h-9 bg-navy-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Play className="w-4 h-4 text-navy-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-navy-700 truncate">{vp.video_title}</p>
                    <p className="text-xs text-gray-500 font-medium">{vp.course_name}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-1.5 bg-orange-400 rounded-full" style={{ width: `${vp.progress_percentage}%` }} />
                      </div>
                      <span className="text-xs font-bold text-gray-500 w-8">{Math.round(vp.progress_percentage)}%</span>
                    </div>
                  </div>
                  <div className="text-left flex-shrink-0">
                    <p className="text-xs font-bold text-gray-700">{fmtMins(vp.watched_minutes)}</p>
                    <p className="text-xs text-gray-400">شاهدت {vp.watch_count}× </p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── Payments ── */}
        <Section title={`سجل المدفوعات (${payments.length})`} icon={CreditCard} defaultOpen={false}>
          {payments.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-6">لا توجد مدفوعات مسجّلة</p>
          ) : (
            <>
              {/* Totals */}
              <div className="grid grid-cols-2 gap-3 mb-4 pt-1">
                <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-center">
                  <p className="text-xl font-black text-green-700">{fmt(summary.totalPaid)} ج.م</p>
                  <p className="text-xs text-green-600 font-semibold mt-0.5">إجمالي المدفوع</p>
                </div>
                <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-3 text-center">
                  <p className="text-xl font-black text-yellow-700">{fmt(summary.totalPending)} ج.م</p>
                  <p className="text-xs text-yellow-600 font-semibold mt-0.5">في الانتظار</p>
                </div>
              </div>

              <div className="space-y-2">
                {payments.map(p => {
                  const sc = statusConfig[p.status] || { label: p.status, cls: 'bg-gray-100 text-gray-600' };
                  return (
                    <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center flex-shrink-0 border border-gray-200">
                        <CreditCard className="w-4 h-4 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-navy-700 truncate">{p.course_name || 'غير محدد'}</p>
                        <p className="text-xs text-gray-500 font-medium">
                          {methodLabel[p.method] || p.method} · {fmtDate(p.payment_date)}
                        </p>
                        {p.reference_number && (
                          <p className="text-xs text-gray-400 font-mono mt-0.5">{p.reference_number}</p>
                        )}
                      </div>
                      <div className="text-left flex-shrink-0">
                        <p className="text-base font-black text-navy-700">{fmt(p.amount)} ج</p>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${sc.cls}`}>{sc.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Section>

      </div>
    </div>
  );
}
