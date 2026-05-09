import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trophy, GraduationCap } from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function StudentLeaderboard() {
  const { user } = useAuth();
  const [stageFilter, setStageFilter] = useState('الكل');

  const { data: leaderboard = [], isLoading } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => api.get('/payments/leaderboard').then(r => r.data),
  });

  const stages = useMemo(() => {
    const s = new Set(leaderboard.map(s => s.academic_stage).filter(Boolean));
    return ['الكل', ...Array.from(s)];
  }, [leaderboard]);

  const filtered = useMemo(() =>
    stageFilter === 'الكل' ? leaderboard : leaderboard.filter(s => s.academic_stage === stageFilter),
    [leaderboard, stageFilter]
  );

  const stageCounts = useMemo(() =>
    stages.reduce((acc, s) => {
      acc[s] = s === 'الكل' ? leaderboard.length : leaderboard.filter(x => x.academic_stage === s).length;
      return acc;
    }, {}),
    [stages, leaderboard]
  );

  const myRankAll = leaderboard.findIndex(s => s.name === user?.name) + 1;
  const myRankFiltered = filtered.findIndex(s => s.name === user?.name) + 1;
  const myRank = stageFilter === 'الكل' ? myRankAll : myRankFiltered;
  const myData = leaderboard.find(s => s.name === user?.name);

  const MEDAL = ['🥇', '🥈', '🥉'];

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <div className="space-y-6">
        <h1 className="text-2xl font-black text-navy-600 flex items-center gap-2">
          <Trophy className="w-7 h-7 text-orange-500" /> لوحة المتصدرين
        </h1>

        {/* Stage Tabs */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <GraduationCap className="w-4 h-4 text-gray-500" />
            <span className="text-xs font-bold text-gray-500">تصفية حسب السنة الدراسية</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {stages.map(stage => (
              <button
                key={stage}
                onClick={() => setStageFilter(stage)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 ${
                  stageFilter === stage
                    ? 'bg-navy-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {stage}
                <span className={`text-xs rounded-full px-1.5 font-black ${
                  stageFilter === stage ? 'bg-white/20 text-white' : 'bg-white text-gray-600'
                }`}>
                  {stageCounts[stage] || 0}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* My rank card */}
        {myRank > 0 && (
          <div className="card bg-gradient-to-l from-navy-600 to-navy-700 text-white">
            <p className="text-white/90 text-sm font-semibold mb-1">
              ترتيبك {stageFilter !== 'الكل' ? `في ${stageFilter}` : 'العام'}
            </p>
            <p className="text-4xl font-black text-orange-300">#{myRank}</p>
            <p className="text-sm text-white/90 font-medium mt-1">
              نقاطك: {myData?.points || 0} ⭐
              {stageFilter !== 'الكل' && myRankAll > 0 && (
                <span className="text-white/60 mr-2">(ترتيبك العام: #{myRankAll})</span>
              )}
            </p>
          </div>
        )}

        {/* List */}
        <div className="space-y-3">
          {isLoading ? (
            [...Array(10)].map((_, i) => <div key={i} className="card h-16 animate-pulse bg-gray-100" />)
          ) : filtered.length === 0 ? (
            <div className="card text-center py-12">
              <Trophy className="w-16 h-16 mx-auto mb-3 text-gray-400" />
              <p className="text-gray-600 font-medium">لا توجد بيانات لهذه المرحلة</p>
            </div>
          ) : filtered.map((s, i) => (
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
                  {s.name === user?.name && <span className="text-orange-700 font-semibold">(أنت)</span>}
                </p>
                <p className="text-xs text-gray-600 font-medium">{s.academic_stage || ''} — {s.exams_taken} اختبار</p>
              </div>
              <div className="text-left">
                <p className="text-orange-700 font-black">⭐ {s.points}</p>
                {s.badge_count > 0 && <p className="text-xs text-gray-600 font-medium">🏅 {s.badge_count}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
