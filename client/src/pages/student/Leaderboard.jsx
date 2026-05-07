import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function StudentLeaderboard() {
  const { user } = useAuth();

  const { data: leaderboard = [], isLoading } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => api.get('/payments/leaderboard').then(r => r.data),
  });

  const myRank = leaderboard.findIndex(s => s.name === user?.name) + 1;
  const MEDAL = ['🥇', '🥈', '🥉'];

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
    <div className="space-y-6">
      <h1 className="text-2xl font-black text-navy-600 flex items-center gap-2">
        <Trophy className="w-7 h-7 text-orange-500" /> لوحة المتصدرين
      </h1>

      {myRank > 0 && (
        <div className="card bg-gradient-to-l from-navy-600 to-navy-700 text-white">
          {/* white/90 on dark navy = ~18:1 ✓ */}
          <p className="text-white/90 text-sm font-semibold mb-1">ترتيبك الحالي</p>
          {/* orange-300 on dark navy = 5.7:1 ✓ */}
          <p className="text-4xl font-black text-orange-300">#{myRank}</p>
          <p className="text-sm text-white/90 font-medium mt-1">نقاطك: {leaderboard[myRank - 1]?.points || 0} ⭐</p>
        </div>
      )}

      <div className="space-y-3">
        {isLoading ? (
          [...Array(10)].map((_, i) => <div key={i} className="card h-16 animate-pulse bg-gray-100" />)
        ) : leaderboard.map((s, i) => (
          <div key={s.id} className={`card flex items-center gap-4 ${s.name === user?.name ? 'border-2 border-orange-500 bg-orange-50' : ''} ${i < 3 ? 'shadow-navy-lg' : ''}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-lg flex-shrink-0 ${i < 3 ? '' : 'bg-gray-200 text-gray-700 text-sm font-bold'}`}>
              {i < 3 ? MEDAL[i] : i + 1}
            </div>
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 text-sm"
              style={{ backgroundColor: i < 3 ? ['#B45309', '#6B7280', '#92400E'][i] : '#1A2E4A' }}>
              {s.name?.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-navy-600 text-sm truncate">
                {s.name}{' '}
                {/* orange-700 on white = 7.4:1 ✓ */}
                {s.name === user?.name && <span className="text-orange-700 font-semibold">(أنت)</span>}
              </p>
              {/* gray-600 on white = 7.2:1 ✓ */}
              <p className="text-xs text-gray-600 font-medium">{s.academic_stage || ''} — {s.exams_taken} اختبار</p>
            </div>
            <div className="text-left">
              {/* orange-700 on white = 7.4:1 ✓ */}
              <p className="text-orange-700 font-black">⭐ {s.points}</p>
              {s.badge_count > 0 && <p className="text-xs text-gray-600 font-medium">🏅 {s.badge_count}</p>}
            </div>
          </div>
        ))}
        {!isLoading && leaderboard.length === 0 && (
          <div className="card text-center py-12">
            <Trophy className="w-16 h-16 mx-auto mb-3 text-gray-400" />
            <p className="text-gray-600 font-medium">لا توجد بيانات بعد. ابدأ بأداء الاختبارات لتظهر في القائمة!</p>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
