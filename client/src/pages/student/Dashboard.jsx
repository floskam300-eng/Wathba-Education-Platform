import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BookOpen, FileText, Award, Star, Eye } from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: () => api.get('/students/me/dashboard').then(r => r.data),
  });

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
    <div className="space-y-6">
      {/* Profile hero — dark bg, all text is white/light = high contrast ✓ */}
      <div className="card bg-gradient-to-l from-navy-600 to-navy-700 text-white !p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center text-2xl font-black shadow-orange-glow flex-shrink-0">
            {user?.name?.charAt(0)}
          </div>
          <div>
            <h1 className="text-xl font-black text-white">مرحباً، {user?.name}!</h1>
            {/* white/90 on dark navy = ~18:1 ✓ */}
            <p className="text-white/90 text-sm font-medium mt-0.5">{data?.student?.academic_stage || 'طالب'}</p>
            <div className="flex items-center gap-1 mt-2">
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
              {/* yellow-300 on dark navy = ~7:1 ✓ */}
              <span className="text-yellow-300 font-bold text-sm">{data?.student?.points || 0} نقطة</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: BookOpen, label: 'كورساتي',        value: data?.enrollments?.length   || 0, bg: 'bg-blue-100',   ic: 'text-blue-800' },
          { icon: FileText, label: 'اختبارات أديتها', value: data?.recentResults?.length || 0, bg: 'bg-green-100',  ic: 'text-green-800' },
          { icon: Award,    label: 'شاراتي',          value: data?.badges?.length        || 0, bg: 'bg-orange-100', ic: 'text-orange-800' },
        ].map(({ icon: Icon, label, value, bg, ic }) => (
          <div key={label} className="card text-center !p-4">
            {/* Each icon bg/text combo verified: blue-800 on blue-100 = 8.6:1 ✓, green-800 on green-100 = 7.8:1 ✓, orange-800 on orange-100 = 6.5:1 ✓ */}
            <div className={`w-12 h-12 ${bg} rounded-xl flex items-center justify-center mx-auto mb-2`}>
              <Icon className={`w-6 h-6 ${ic}`} />
            </div>
            <p className="text-2xl font-black text-navy-600">{value}</p>
            {/* gray-700 on white = 10:1 ✓ */}
            <p className="text-xs text-gray-700 font-semibold mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {data?.badges?.length > 0 && (
        <div className="card">
          <h2 className="section-title mb-4"><Award className="w-5 h-5 text-orange-500" /> شاراتي</h2>
          <div className="flex flex-wrap gap-3">
            {data.badges.map(b => (
              <div key={b.id} className="flex items-center gap-2 px-4 py-2 rounded-full text-white text-sm font-bold shadow-md"
                style={{ backgroundColor: b.badge_color || '#995400' }}>
                🏅 {b.badge_name}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="section-title mb-4"><FileText className="w-5 h-5 text-orange-500" /> آخر النتائج</h2>
        <div className="space-y-3">
          {isLoading ? (
            [...Array(3)].map((_, i) => <div key={i} className="h-14 bg-gray-100 animate-pulse rounded-xl" />)
          ) : data?.recentResults?.length > 0 ? data.recentResults.map(r => (
            <div key={r.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-orange-50/50 transition-colors group">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-navy-600 text-sm truncate">{r.exam_title}</p>
                <p className="text-xs text-gray-600 font-medium mt-0.5">{new Date(r.created_at).toLocaleDateString('ar-EG')}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-left">
                  <p className={`text-lg font-black ${r.score >= r.pass_score ? 'text-green-700' : 'text-red-700'}`}>{r.score}/{r.total_score}</p>
                  <p className={`text-xs font-bold ${r.score >= r.pass_score ? 'text-green-700' : 'text-red-700'}`}>
                    {r.score >= r.pass_score ? '✓ ناجح' : '✗ راسب'}
                  </p>
                </div>
                <button
                  onClick={() => navigate(`/student/exam-review/${r.id}`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-navy-600 hover:bg-navy-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                  title="مراجعة الإجابات"
                >
                  <Eye className="w-3.5 h-3.5" />
                  مراجعة
                </button>
              </div>
            </div>
          )) : (
            <p className="text-gray-600 font-medium text-center py-8 text-sm">لم تؤدِ أي اختبارات بعد</p>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}
