import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Users, BookOpen, FileText, UserCog, TrendingUp, Eye, Star, Activity,
  UserPlus, Bell, Inbox, CreditCard, RotateCcw, ArrowLeft,
} from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import StatCard from '../../components/ui/StatCard';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useTeacher } from '../../context/TeacherContext';


export default function TeacherDashboard() {
  const { user } = useAuth();
  const { teacherSlug } = useTeacher();
  const navigate = useNavigate();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['teacher-dashboard'],
    queryFn: () => api.get('/teachers/dashboard').then(r => r.data),
  });

  const { data: analytics } = useQuery({
    queryKey: ['teacher-analytics'],
    queryFn: () => api.get('/teachers/analytics').then(r => r.data),
  });

  const { data: courseStats = [] } = useQuery({
    queryKey: ['teacher-course-stats'],
    queryFn: () => api.get('/teachers/course-stats').then(r => r.data),
  });

  const chartData = useMemo(() => (
    analytics?.examResults?.map(e => ({
      name: e.title || `#${e.id}`,
      'متوسط الدرجات': Math.round(parseFloat(e.avg_pct) || 0),
      'محاولات': parseInt(e.attempt_count) || 0,
    })) || []
  ), [analytics]);

  const totalPending = (stats?.pendingRequests || 0) + (stats?.pendingPayments || 0) + (stats?.pendingRetries || 0);

  const quickActions = [
    {
      icon: UserPlus,
      label: 'أضف طالب جديد',
      desc: 'تسجيل طالب يدوياً',
      color: 'from-blue-500 to-blue-600',
      bg: 'bg-blue-50 hover:bg-blue-100',
      border: 'border-blue-200 hover:border-blue-400',
      text: 'text-blue-700',
      badge: null,
      onClick: () => navigate(`/${teacherSlug}/teacher/students`, { state: { openAdd: true } }),
    },
    {
      icon: Bell,
      label: 'أرسل إشعاراً',
      desc: 'إشعار للطلاب أو الأهالي',
      color: 'from-amber-500 to-orange-500',
      bg: 'bg-amber-50 hover:bg-amber-100',
      border: 'border-amber-200 hover:border-amber-400',
      text: 'text-amber-700',
      badge: null,
      onClick: () => navigate(`/${teacherSlug}/teacher/notifications`),
    },
    {
      icon: Inbox,
      label: 'طلبات التسجيل',
      desc: 'طلبات الانضمام للكورسات',
      color: 'from-purple-500 to-purple-600',
      bg: 'bg-purple-50 hover:bg-purple-100',
      border: 'border-purple-200 hover:border-purple-400',
      text: 'text-purple-700',
      badge: stats?.pendingRequests || null,
      badgeColor: 'bg-purple-600',
      onClick: () => navigate(`/${teacherSlug}/teacher/requests`),
    },
    {
      icon: CreditCard,
      label: 'المدفوعات',
      desc: 'إيصالات تنتظر التحقق',
      color: 'from-emerald-500 to-teal-500',
      bg: 'bg-emerald-50 hover:bg-emerald-100',
      border: 'border-emerald-200 hover:border-emerald-400',
      text: 'text-emerald-700',
      badge: stats?.pendingPayments || null,
      badgeColor: 'bg-emerald-600',
      onClick: () => navigate(`/${teacherSlug}/teacher/payments`),
    },
    {
      icon: RotateCcw,
      label: 'طلبات الإعادة',
      desc: 'طلبات إعادة الاختبار',
      color: 'from-rose-500 to-pink-500',
      bg: 'bg-rose-50 hover:bg-rose-100',
      border: 'border-rose-200 hover:border-rose-400',
      text: 'text-rose-700',
      badge: stats?.pendingRetries || null,
      badgeColor: 'bg-rose-500',
      onClick: () => navigate(`/${teacherSlug}/teacher/exams`),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-navy-600 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-navy-600 to-navy-400 flex items-center justify-center shadow-md flex-shrink-0">
              <Activity className="w-4 h-4 text-white" />
            </div>
            لوحة التحكم
          </h1>
          <p className="text-gray-600 text-sm mt-1 mr-11">مرحباً {user?.name}، هذا ملخص نشاطك</p>
        </div>
        <div className="hidden sm:block text-left">
          <p className="text-xs text-gray-500 font-semibold">التخصص</p>
          <p className="text-sm font-bold text-orange-600">{user?.classification || 'معلم'}</p>
        </div>
      </div>

      {/* Stat Cards */}
      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users}   label="الطلاب"      value={stats?.totalStudents   || 0} color="navy"   />
          <StatCard icon={BookOpen} label="الكورسات"    value={stats?.totalCourses    || 0} color="orange" />
          <StatCard icon={FileText} label="الاختبارات"  value={stats?.totalExams      || 0} color="purple" />
          <StatCard icon={UserCog}  label="المساعدون"   value={stats?.totalAssistants || 0} color="teal"   />
        </div>
      )}

      {/* ── Quick Actions ───────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-black text-gray-800 text-sm flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
              <ArrowLeft className="w-4 h-4 text-orange-500" />
            </div>
            إجراءات سريعة
            {totalPending > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-black">
                {totalPending}
              </span>
            )}
          </h2>
          <span className="text-[11px] text-gray-400 font-medium">وصول مباشر للمهام اليومية</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              className={`relative flex flex-col items-center gap-2.5 p-4 rounded-xl border-2 transition-all duration-200 group cursor-pointer ${action.bg} ${action.border}`}
            >
              {/* Badge for pending count */}
              {action.badge > 0 && (
                <span className={`absolute -top-2 -left-2 min-w-[22px] h-[22px] px-1.5 rounded-full ${action.badgeColor} text-white text-[11px] font-black flex items-center justify-center shadow-md ring-2 ring-white`}>
                  {action.badge}
                </span>
              )}

              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-200`}>
                <action.icon className="w-5 h-5 text-white" />
              </div>

              <div className="text-center">
                <p className={`text-xs font-black leading-tight ${action.text}`}>{action.label}</p>
                <p className="text-[10px] text-gray-400 font-medium mt-0.5 leading-tight hidden sm:block">{action.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Bar Chart */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 lg:col-span-2 hover:shadow-md transition-shadow">
          <h2 className="font-black text-gray-800 text-sm flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-blue-500" />
            </div>
            أداء الاختبارات
            <span className="text-[11px] font-medium text-gray-400 mr-1">— متوسط الدرجات والمحاولات</span>
          </h2>
          {chartData.length > 0 ? (
            <ReactECharts
              option={{
                tooltip: {
                  trigger: 'axis',
                  axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(99,102,241,0.06)' } },
                  backgroundColor: '#fff',
                  borderColor: '#f1f5f9',
                  borderWidth: 1,
                  textStyle: { fontFamily: 'Cairo', fontSize: 12, color: '#1e293b' },
                  extraCssText: 'box-shadow:0 20px 60px rgba(0,0,0,0.12);border-radius:12px;padding:10px 14px',
                  formatter: params => {
                    let s = `<div style="font-family:Cairo;font-weight:900;color:#1e293b;border-bottom:1px solid #f1f5f9;padding-bottom:6px;margin-bottom:6px">${params[0]?.name}</div>`;
                    params.forEach(p => { s += `<div style="font-family:Cairo;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:2px 0">${p.marker}${p.seriesName}: <b style="color:${p.color}">${p.value}</b></div>`; });
                    return s;
                  }
                },
                legend: {
                  bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8,
                  textStyle: { fontFamily: 'Cairo', fontSize: 11, color: '#64748b' }
                },
                grid: { left: 8, right: 8, top: 10, bottom: 32, containLabel: true },
                xAxis: {
                  type: 'category',
                  data: chartData.map(d => d.name),
                  axisLine: { show: false }, axisTick: { show: false },
                  axisLabel: { fontFamily: 'Cairo', color: '#94a3b8', fontSize: 10, interval: 0 }
                },
                yAxis: {
                  type: 'value',
                  splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
                  axisLabel: { fontFamily: 'Cairo', color: '#94a3b8', fontSize: 10 },
                  axisLine: { show: false }, axisTick: { show: false }
                },
                series: [
                  {
                    name: 'متوسط الدرجات', type: 'bar', barMaxWidth: 26,
                    data: chartData.map(d => d['متوسط الدرجات']),
                    itemStyle: { borderRadius: [6,6,0,0], color: { type:'linear',x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:'#6366f1'},{offset:1,color:'#4f46e5'}] } },
                    emphasis: { itemStyle: { color: { type:'linear',x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:'#818cf8'},{offset:1,color:'#6366f1'}] } } }
                  },
                  {
                    name: 'محاولات', type: 'bar', barMaxWidth: 26,
                    data: chartData.map(d => d['محاولات']),
                    itemStyle: { borderRadius: [6,6,0,0], color: { type:'linear',x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:'#f97316'},{offset:1,color:'#ea580c'}] } },
                    emphasis: { itemStyle: { color: { type:'linear',x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:'#fb923c'},{offset:1,color:'#f97316'}] } } }
                  }
                ]
              }}
              style={{ height: '260px' }}
              notMerge
              opts={{ renderer: 'svg' }}
            />
          ) : (
            <div className="h-52 flex flex-col items-center justify-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center">
                <FileText className="w-7 h-7 text-gray-300" />
              </div>
              <p className="text-sm text-gray-400 font-semibold">لا توجد بيانات اختبارات بعد</p>
            </div>
          )}
        </div>

        {/* Top Students */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
          <h2 className="font-black text-gray-800 text-sm flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <Star className="w-4 h-4 text-amber-500" />
            </div>
            أفضل الطلاب
          </h2>
          <div className="space-y-3">
            {analytics?.topStudents?.slice(0, 5).map((s, i) => {
              const avg = Math.round(parseFloat(s.avg_score) || 0);
              const avgColor = avg >= 80 ? '#10b981' : avg >= 60 ? '#6366f1' : '#f59e0b';
              const rankBg = i === 0 ? 'bg-gradient-to-br from-yellow-400 to-amber-500'
                : i === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-400'
                : i === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-500'
                : 'bg-gradient-to-br from-navy-400 to-navy-600';
              return (
                <div key={i} className="flex items-center gap-3 group hover:bg-orange-50/40 rounded-xl p-1.5 -mx-1.5 transition-colors cursor-default">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0 shadow-sm ${rankBg}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-navy-700 truncate group-hover:text-orange-600 transition-colors">{s.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-1.5 rounded-full transition-all duration-700"
                          style={{ width: `${avg}%`, background: avgColor }} />
                      </div>
                      <span className="text-[10px] font-black" style={{ color: avgColor }}>{avg}%</span>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-amber-500 flex items-center gap-0.5 flex-shrink-0">
                    <Star className="w-3 h-3 fill-amber-400 stroke-amber-400" /> {s.points}
                  </span>
                </div>
              );
            }) || <p className="text-gray-400 text-sm text-center py-4">لا توجد بيانات</p>}
          </div>
        </div>
      </div>

      {/* Course Progress */}
      {courseStats.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
          <h2 className="font-black text-gray-800 text-sm flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-emerald-500" />
            </div>
            متابعة الكورسات
          </h2>
          <div className="space-y-3">
            {courseStats.map(c => {
              const prog = Math.min(c.avg_progress, 100);
              const barColor = prog >= 60
                ? 'linear-gradient(90deg,#10b981,#06b6d4)'
                : prog >= 30
                ? 'linear-gradient(90deg,#f59e0b,#f97316)'
                : 'linear-gradient(90deg,#ef4444,#f97316)';
              return (
                <div key={c.id} className="flex items-center gap-3 group hover:bg-gray-50/70 rounded-xl p-2 -mx-2 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-navy-50 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-4 h-4 text-navy-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-bold text-navy-700 truncate">{c.name}</p>
                      <span className="text-xs font-black text-gray-600 flex-shrink-0 mr-2">{prog}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div className="h-2 rounded-full transition-all duration-700" style={{ width: `${prog}%`, background: barColor }} />
                      </div>
                      <span className="text-[11px] text-gray-400 font-semibold flex-shrink-0 whitespace-nowrap">
                        {c.enrolled_count} طالب · {c.total_videos} فيديو
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Results */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
        <div className="p-5 border-b border-gray-50 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
            <FileText className="w-4 h-4 text-indigo-500" />
          </div>
          <div>
            <h2 className="font-black text-gray-800 text-sm">آخر النتائج</h2>
            <p className="text-[11px] text-gray-400">أحدث نتائج الطلاب</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full mobile-card-table" style={{ minWidth: 0 }}>
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-4 py-3 text-right text-[11px] font-black text-gray-500">الطالب</th>
                <th className="px-4 py-3 text-right text-[11px] font-black text-gray-500">الاختبار</th>
                <th className="px-4 py-3 text-center text-[11px] font-black text-gray-500">الدرجة</th>
                <th className="px-4 py-3 text-center text-[11px] font-black text-gray-500">الحالة</th>
                <th className="px-4 py-3 text-center text-[11px] font-black text-gray-500 hidden sm:table-cell">صواب / خطأ</th>
                <th className="px-4 py-3 text-center text-[11px] font-black text-gray-500 hidden sm:table-cell"></th>
              </tr>
            </thead>
            <tbody>
              {analytics?.recentResults?.slice(0, 8).map(r => {
                const passed = r.score >= r.pass_score;
                const pct = r.total_score ? Math.round((r.score / r.total_score) * 100) : 0;
                return (
                  <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors group">
                    <td data-label="الطالب" className="px-4 py-3 font-bold text-gray-800 text-sm">{r.student_name}</td>
                    <td data-label="الاختبار" className="px-4 py-3 text-gray-600 text-sm max-w-[160px] truncate">{r.exam_title}</td>
                    <td data-label="الدرجة" className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={`font-black text-sm ${passed ? 'text-emerald-600' : 'text-rose-500'}`}>{r.score}/{r.total_score}</span>
                        <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: passed ? '#10b981' : '#f43f5e' }} />
                        </div>
                      </div>
                    </td>
                    <td data-label="الحالة" className="px-4 py-3 text-center">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${passed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                        {passed ? '✓ ناجح' : '✗ راسب'}
                      </span>
                    </td>
                    <td data-label="صواب/خطأ" className="px-4 py-3 text-center text-xs font-semibold hidden sm:table-cell">
                      <span className="text-emerald-600">✓ {r.correct_count}</span>
                      <span className="mx-1.5 text-gray-300">|</span>
                      <span className="text-rose-500">✗ {r.wrong_count}</span>
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      <button onClick={() => navigate(`/teacher/exam-review/${r.id}`)}
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-2.5 py-1 bg-navy-50 hover:bg-navy-600 text-navy-600 hover:text-white text-xs font-bold rounded-lg transition-all border border-navy-200 hover:border-navy-600 mx-auto">
                        <Eye className="w-3.5 h-3.5" /> مراجعة
                      </button>
                    </td>
                  </tr>
                );
              }) || (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400 text-sm font-semibold col-span-all">لا توجد نتائج بعد</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
