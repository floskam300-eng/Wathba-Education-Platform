import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trophy, GraduationCap } from 'lucide-react';
import api from '../../lib/api';

const MEDAL = ['🥇', '🥈', '🥉'];

export default function TeacherLeaderboard() {
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

  const top3 = filtered.slice(0, 3);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black text-navy-600 flex items-center gap-2">
        <Trophy className="w-7 h-7 text-orange-500" /> لوحة المتصدرين
        <span className="text-sm font-semibold text-gray-500">({filtered.length})</span>
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
                  ? 'bg-orange-500 text-white shadow-sm'
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

      {/* Top 3 Podium */}
      {top3.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[filtered[1], filtered[0], filtered[2]].map((s, i) => s && (
            <div key={s.id} className={`card text-center ${i === 1 ? 'bg-gradient-to-b from-yellow-50 to-white border-2 border-yellow-300' : ''}`}>
              <div className="text-4xl mb-2">{i === 1 ? '🥇' : i === 0 ? '🥈' : '🥉'}</div>
              <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black text-white mx-auto mb-3 ${i === 1 ? 'bg-yellow-500' : i === 0 ? 'bg-gray-500' : 'bg-orange-700'}`}>
                {s.name?.charAt(0)}
              </div>
              <h3 className="font-bold text-navy-600 text-sm">{s.name}</h3>
              <p className="text-orange-700 font-black text-xl mt-1">{s.points} ⭐</p>
              <p className="text-gray-600 text-xs font-medium mt-0.5">{s.exams_taken} اختبار</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px]">
            <thead>
              <tr>
                <th className="table-header rounded-r-lg">#</th>
                <th className="table-header">الطالب</th>
                <th className="table-header">النقاط</th>
                <th className="table-header">الاختبارات</th>
                <th className="table-header">متوسط الدرجات</th>
                <th className="table-header rounded-l-lg">الشارات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(8)].map((_, i) => <tr key={i}><td colSpan={6}><div className="h-10 bg-gray-100 animate-pulse m-2 rounded" /></td></tr>)
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="table-cell text-center py-12">
                  <Trophy className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p className="font-medium text-gray-500">لا توجد بيانات لهذه المرحلة</p>
                </td></tr>
              ) : filtered.map((s, i) => (
                <tr key={s.id} className={`table-row ${i < 3 ? 'bg-orange-50/50' : ''}`}>
                  <td className="table-cell">
                    {i < 3
                      ? <span className="text-xl">{MEDAL[i]}</span>
                      : <span className="text-gray-700 font-bold">{i + 1}</span>}
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-navy-600 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                        {s.name?.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-navy-600 text-sm">{s.name}</p>
                        <p className="text-xs text-gray-600 font-medium">{s.academic_stage || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell"><span className="text-orange-700 font-black">⭐ {s.points}</span></td>
                  <td className="table-cell text-center text-gray-700 font-semibold">{s.exams_taken}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-1.5 max-w-[80px]">
                        <div className="bg-orange-500 h-1.5 rounded-full" style={{ width: `${Math.min(s.avg_score, 100)}%` }} />
                      </div>
                      <span className="text-sm font-bold text-navy-600">{Math.round(s.avg_score)}%</span>
                    </div>
                  </td>
                  <td className="table-cell text-center">
                    <span className="text-base font-semibold text-gray-700">{s.badge_count > 0 ? `🏅 ${s.badge_count}` : '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
