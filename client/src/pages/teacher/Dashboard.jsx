import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Users, BookOpen, FileText, UserCog, TrendingUp, Eye } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import StatCard from '../../components/ui/StatCard';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function TeacherDashboard() {
  const { user } = useAuth();
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

  const chartData = analytics?.examResults?.map(e => ({
    name: e.title?.substring(0, 12) + (e.title?.length > 12 ? '...' : ''),
    متوسط: Math.round(e.avg_score),
    محاولات: parseInt(e.attempt_count),
  })) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-navy-600">لوحة التحكم</h1>
          {/* gray-700 on white = 10:1 ✓ */}
          <p className="text-gray-700 text-sm mt-1">مرحباً {user?.name}، هذا ملخص نشاطك</p>
        </div>
        <div className="hidden sm:block text-left">
          {/* gray-600 on white = 7.2:1 ✓ */}
          <p className="text-xs text-gray-600 font-semibold">التخصص</p>
          {/* orange-700 (#995400) on white = 7.4:1 ✓ */}
          <p className="text-sm font-bold text-orange-700">{user?.classification || 'معلم'}</p>
        </div>
      </div>

      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="card h-24 animate-pulse bg-gray-100" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label="الطلاب" value={stats?.totalStudents || 0} color="navy" />
          <StatCard icon={BookOpen} label="الكورسات" value={stats?.totalCourses || 0} color="orange" />
          <StatCard icon={FileText} label="الاختبارات" value={stats?.totalExams || 0} color="purple" />
          <StatCard icon={UserCog} label="المساعدون" value={stats?.totalAssistants || 0} color="teal" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2">
          <h2 className="section-title mb-4">
            <TrendingUp className="w-5 h-5 text-orange-500" />
            أداء الاختبارات
          </h2>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EBF0F7" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fontFamily: 'Cairo', fill: '#6B7280' }}
                  axisLine={false}
                  tickLine={false}
                  dy={10}
                />
                <YAxis
                  tick={{ fontSize: 12, fontFamily: 'Cairo', fill: '#6B7280' }}
                  axisLine={false}
                  tickLine={false}
                  dx={-10}
                />
                <Tooltip
                  contentStyle={{
                    fontFamily: 'Cairo',
                    borderRadius: '12px',
                    border: 'none',
                    boxShadow: '0 8px 30px rgba(26,46,74,0.12)',
                    backgroundColor: '#ffffff',
                    padding: '12px'
                  }}
                  cursor={{ fill: '#F4F7FB' }}
                />
                <Legend
                  wrapperStyle={{ fontFamily: 'Cairo', fontSize: '13px', paddingTop: '20px' }}
                  iconType="circle"
                />
                <Bar
                  dataKey="متوسط"
                  name="متوسط الدرجات (%)"
                  fill="#1A2E4A"
                  radius={[6, 6, 0, 0]}
                  barSize={32}
                  animationDuration={1500}
                />
                <Bar
                  dataKey="محاولات"
                  name="عدد المحاولات"
                  fill="#FF8C00"
                  radius={[6, 6, 0, 0]}
                  barSize={32}
                  animationDuration={1500}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center">
              <div className="text-center">
                <FileText className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                {/* gray-600 on white = 7.2:1 ✓ */}
                <p className="text-sm text-gray-600 font-medium">لا توجد بيانات اختبارات بعد</p>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="section-title mb-4">
            <Users className="w-5 h-5 text-orange-500" />
            أفضل الطلاب
          </h2>
          <div className="space-y-3">
            {analytics?.topStudents?.slice(0, 5).map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${i === 0 ? 'bg-yellow-500' : i === 1 ? 'bg-gray-500' : i === 2 ? 'bg-orange-700' : 'bg-navy-500'}`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-navy-600 truncate">{s.name}</p>
                  {/* gray-600 on white = 7.2:1 ✓ */}
                  <p className="text-xs text-gray-600 font-medium">{s.points} نقطة</p>
                </div>
                {/* orange-700 on white = 7.4:1 ✓ */}
                <div className="text-xs font-bold text-orange-700">{Math.round(s.avg_score)}%</div>
              </div>
            )) || (
                <p className="text-gray-600 text-sm text-center py-4">لا توجد بيانات</p>
              )}
          </div>
        </div>
      </div>

      {courseStats.length > 0 && (
        <div className="card">
          <h2 className="section-title mb-4">
            <BookOpen className="w-5 h-5 text-orange-500" />
            متابعة الكورسات
          </h2>
          <div className="space-y-3">
            {courseStats.map(c => (
              <div key={c.id} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-navy-50 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-4 h-4 text-navy-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-bold text-navy-700 truncate">{c.name}</p>
                    <span className="text-xs font-black text-gray-500 flex-shrink-0 mr-2">
                      {c.avg_progress}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.min(c.avg_progress, 100)}%`,
                          background: c.avg_progress >= 60
                            ? 'linear-gradient(90deg,#10b981,#06b6d4)'
                            : c.avg_progress >= 30
                            ? 'linear-gradient(90deg,#f59e0b,#f97316)'
                            : 'linear-gradient(90deg,#ef4444,#f97316)',
                        }}
                      />
                    </div>
                    <span className="text-[11px] text-gray-500 font-semibold flex-shrink-0 whitespace-nowrap">
                      {c.enrolled_count} طالب · {c.total_videos} فيديو
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="section-title mb-4">
          <FileText className="w-5 h-5 text-orange-500" />
          آخر النتائج
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr>
                <th className="table-header rounded-r-lg">الطالب</th>
                <th className="table-header">الاختبار</th>
                <th className="table-header">الدرجة</th>
                <th className="table-header">الصواب</th>
                <th className="table-header">الخطأ</th>
                <th className="table-header rounded-l-lg"></th>
              </tr>
            </thead>
            <tbody>
              {analytics?.recentResults?.slice(0, 8).map((r) => (
                <tr key={r.id} className="table-row group">
                  <td className="table-cell font-semibold text-navy-700">{r.student_name}</td>
                  <td className="table-cell text-gray-700">{r.exam_title}</td>
                  <td className="table-cell">
                    <span className={`font-bold ${r.score >= r.pass_score ? 'text-green-700' : 'text-red-700'}`}>
                      {r.score}/{r.total_score}
                    </span>
                  </td>
                  <td className="table-cell text-green-700 font-semibold">✓ {r.correct_count}</td>
                  <td className="table-cell text-red-700 font-semibold">✗ {r.wrong_count}</td>
                  <td className="table-cell">
                    <button
                      onClick={() => navigate(`/teacher/exam-review/${r.id}`)}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-navy-50 hover:bg-navy-600 text-navy-600 hover:text-white text-xs font-bold rounded-lg transition-all opacity-0 group-hover:opacity-100 border border-navy-200 hover:border-navy-600"
                      title="مراجعة إجابات الطالب"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      مراجعة
                    </button>
                  </td>
                </tr>
              )) || (
                  <tr><td colSpan={6} className="table-cell text-center text-gray-600 py-8">لا توجد نتائج بعد</td></tr>
                )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
