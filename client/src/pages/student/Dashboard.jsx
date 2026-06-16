import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BookOpen, FileText, Award, Star, Eye, Search, ChevronLeft, CheckCircle, XCircle } from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

export default function StudentDashboard() {
  const { user } = useAuth();
  const { dark } = useTheme();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: () => api.get('/students/me/dashboard').then(r => r.data),
    staleTime: 60_000,
  });

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <div className="space-y-5">

        {/* ── Hero Card ── */}
        <div className="card bg-gradient-to-l from-navy-700 to-navy-500 text-white !p-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-orange-500 rounded-2xl flex items-center justify-center text-2xl font-black shadow-lg flex-shrink-0">
              {user?.name?.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-black text-white leading-tight">مرحباً، {user?.name}!</h1>
              <p className="text-white/80 text-xs font-medium mt-0.5">{data?.student?.academic_stage || 'طالب'}</p>
              <div className="flex items-center gap-1 mt-2">
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                <span className="text-yellow-300 font-bold text-sm">{data?.student?.points || 0} نقطة</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Stats Grid ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              icon: BookOpen, label: 'كورساتي',
              value: data?.enrollments?.length || 0,
              gradient: 'from-blue-500 to-blue-600',
              bg: dark ? 'bg-blue-900/30 border-blue-700/50' : 'bg-blue-50 border-blue-200',
              val: dark ? 'text-blue-300' : 'text-blue-700',
            },
            {
              icon: FileText, label: 'اختباراتي',
              value: data?.totalExams ?? data?.recentResults?.length ?? 0,
              gradient: 'from-emerald-500 to-green-600',
              bg: dark ? 'bg-green-900/30 border-green-700/50' : 'bg-green-50 border-green-200',
              val: dark ? 'text-green-300' : 'text-green-700',
            },
            {
              icon: Award, label: 'شاراتي',
              value: data?.badges?.length || 0,
              gradient: 'from-orange-500 to-amber-500',
              bg: dark ? 'bg-orange-900/30 border-orange-700/50' : 'bg-orange-50 border-orange-200',
              val: dark ? 'text-orange-300' : 'text-orange-700',
            },
          ].map(({ icon: Icon, label, value, gradient, bg, val }) => (
            <div key={label} className={`rounded-2xl border p-3 sm:p-4 text-center ${bg}`}>
              <div className={`w-9 h-9 sm:w-11 sm:h-11 bg-gradient-to-br ${gradient} rounded-xl flex items-center justify-center mx-auto mb-2 shadow-sm`}>
                <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <p className={`text-xl sm:text-2xl font-black ${val}`}>{value}</p>
              <p className={`text-[11px] sm:text-xs font-semibold mt-0.5 leading-tight ${dark ? 'text-gray-400' : 'text-gray-600'}`}>{label}</p>
            </div>
          ))}
        </div>

        {/* ── Browse CTA ── */}
        <button
          onClick={() => navigate('/student/courses', { state: { tab: 'browse' } })}
          className={`w-full flex items-center gap-3 p-4 rounded-2xl border transition-all duration-200 group ${
            dark
              ? 'bg-orange-500/10 border-orange-600/30 hover:border-orange-500/60 hover:bg-orange-500/15'
              : 'bg-gradient-to-l from-orange-500/10 to-orange-400/5 border-orange-300/40 hover:border-orange-400/70 hover:from-orange-500/15'
          }`}
        >
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
            dark ? 'bg-orange-500/20 group-hover:bg-orange-500/30' : 'bg-orange-500/20 group-hover:bg-orange-500/30'
          }`}>
            <Search className="w-5 h-5 text-orange-500" />
          </div>
          <div className="flex-1 text-right">
            <p className={`font-black text-sm ${dark ? 'text-orange-300' : 'text-navy-600'}`}>تصفح الكورسات المتاحة</p>
            <p className={`text-xs mt-0.5 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>اكتشف الكورسات وانضم قبل الشراء</p>
          </div>
          <ChevronLeft className="w-5 h-5 text-orange-400 group-hover:-translate-x-1 transition-transform" />
        </button>

        {/* ── Badges ── */}
        {data?.badges?.length > 0 && (
          <div className="card">
            <h2 className="section-title mb-4"><Award className="w-5 h-5 text-orange-500" /> شاراتي</h2>
            <div className="flex flex-wrap gap-2">
              {data.badges.map(b => (
                <div
                  key={b.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-xs font-bold shadow-md"
                  style={{ backgroundColor: b.badge_color || '#f97316' }}
                >
                  🏅 {b.badge_name}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Recent Results ── */}
        <div className="card">
          <h2 className="section-title mb-4"><FileText className="w-5 h-5 text-orange-500" /> آخر النتائج</h2>
          <div className="space-y-2.5">
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className={`h-16 animate-pulse rounded-xl ${dark ? 'bg-gray-700' : 'bg-gray-100'}`} />
              ))
            ) : data?.recentResults?.length > 0 ? (
              data.recentResults.map(r => {
                const passed = r.score >= r.pass_score;
                const pct = r.total_score > 0 ? Math.round((r.score / r.total_score) * 100) : 0;
                return (
                  <div
                    key={r.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-colors ${
                      passed
                        ? dark ? 'border-green-700/60 bg-green-950/25 hover:bg-green-950/40' : 'border-green-200 bg-green-50/60 hover:bg-green-50'
                        : dark ? 'border-red-700/60 bg-red-950/25 hover:bg-red-950/40'       : 'border-red-200 bg-red-50/60 hover:bg-red-50'
                    }`}
                  >
                    {/* Pass/Fail icon */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      passed ? 'bg-green-500/20' : 'bg-red-500/20'
                    }`}>
                      {passed
                        ? <CheckCircle className="w-5 h-5 text-green-500" />
                        : <XCircle className="w-5 h-5 text-red-500" />}
                    </div>

                    {/* Exam info */}
                    <div className="flex-1 min-w-0">
                      <p className={`font-bold text-sm truncate ${dark ? 'text-white' : 'text-navy-700'}`}>{r.exam_title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {/* Progress bar */}
                        <div className={`flex-1 h-1.5 rounded-full overflow-hidden max-w-[80px] ${dark ? 'bg-gray-700' : 'bg-gray-200'}`}>
                          <div
                            className={`h-1.5 rounded-full ${passed ? 'bg-green-500' : 'bg-red-400'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className={`text-[11px] font-bold ${passed ? (dark ? 'text-green-400' : 'text-green-700') : (dark ? 'text-red-400' : 'text-red-600')}`}>
                          {pct}%
                        </span>
                        <span className={`text-[11px] ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                          {new Date(r.created_at).toLocaleDateString('ar-EG')}
                        </span>
                      </div>
                    </div>

                    {/* Score + status + review */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="text-left">
                        <p className={`text-base font-black ${passed ? (dark ? 'text-green-400' : 'text-green-700') : (dark ? 'text-red-400' : 'text-red-600')}`}>
                          {r.score}<span className={`text-xs font-semibold ${dark ? 'text-gray-500' : 'text-gray-400'}`}>/{r.total_score}</span>
                        </p>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          passed
                            ? dark ? 'bg-green-900/60 text-green-300' : 'bg-green-100 text-green-700'
                            : dark ? 'bg-red-900/60 text-red-300'    : 'bg-red-100 text-red-700'
                        }`}>
                          {passed ? '✓ ناجح' : '✗ راسب'}
                        </span>
                      </div>
                      <button
                        onClick={() => navigate(`/student/exam-review/${r.id}`)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                          dark
                            ? 'bg-navy-700 hover:bg-navy-600 text-white border border-navy-600'
                            : 'bg-navy-600 hover:bg-navy-700 text-white'
                        }`}
                        title="مراجعة الإجابات"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        مراجعة
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className={`text-center py-10 rounded-xl ${dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-50'}`}>
                <FileText className={`w-10 h-10 mx-auto mb-2 ${dark ? 'text-gray-600' : 'text-gray-300'}`} />
                <p className={`font-medium text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>لم تؤدِ أي اختبارات بعد</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
