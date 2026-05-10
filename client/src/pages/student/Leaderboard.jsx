import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trophy, GraduationCap, History, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const MEDAL = ['🥇', '🥈', '🥉'];

function CountdownBadge({ nextResetAt }) {
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  if (!nextResetAt) return null;
  const diff = new Date(nextResetAt) - now;
  if (diff <= 0) return <span className="text-xs text-red-500 font-bold">التصفير قريب!</span>;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  return (
    <div className="flex items-center gap-1.5 bg-navy-600/10 border border-navy-600/20 rounded-full px-3 py-1.5">
      <Clock className="w-3.5 h-3.5 text-navy-600" />
      <span className="text-xs font-bold text-navy-600">
        التصفير بعد {days > 0 ? `${days} يوم` : `${hours} ساعة`}
      </span>
    </div>
  );
}

function HistoryCard({ record, myName }) {
  const [open, setOpen] = useState(false);
  const top3 = (record.rankings || []).slice(0, 3);
  const date = new Date(record.reset_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  const myEntry = (record.rankings || []).find(r => r.name === myName);

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${myEntry && myEntry.rank <= 3 ? 'border-yellow-300' : 'border-slate-200'}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center flex-shrink-0">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2">
              <p className="font-black text-navy-600">{record.month_label}</p>
              {myEntry && (
                <span className={`text-xs rounded-full px-2 py-0.5 font-bold ${myEntry.rank <= 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                  ترتيبك #{myEntry.rank}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 font-medium">{date} — {record.rankings?.length || 0} طالب</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex gap-1">
            {top3.map((r, i) => (
              <div key={i} className="flex items-center gap-1 bg-gray-100 rounded-full px-2 py-0.5">
                <span className="text-sm">{MEDAL[i]}</span>
                <span className={`text-xs font-bold max-w-[70px] truncate ${r.name === myName ? 'text-orange-600' : 'text-gray-700'}`}>{r.name}</span>
              </div>
            ))}
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100">
          {myEntry && (
            <div className="mx-4 my-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5 flex items-center justify-between">
              <div>
                <p className="text-xs text-orange-600 font-semibold">نتيجتك في هذا الشهر</p>
                <p className="font-black text-navy-600">{myEntry.name}</p>
              </div>
              <div className="text-left">
                <p className="text-2xl font-black text-orange-600">#{myEntry.rank}</p>
                <p className="text-xs text-gray-600 font-semibold">⭐ {myEntry.points} نقطة</p>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[350px]">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-right text-xs font-bold text-gray-500">#</th>
                  <th className="px-4 py-2 text-right text-xs font-bold text-gray-500">الطالب</th>
                  <th className="px-4 py-2 text-right text-xs font-bold text-gray-500">النقاط</th>
                  <th className="px-4 py-2 text-right text-xs font-bold text-gray-500">المرحلة</th>
                </tr>
              </thead>
              <tbody>
                {(record.rankings || []).map((r) => (
                  <tr key={r.student_id} className={`border-t border-slate-50 ${r.name === myName ? 'bg-orange-50/60' : r.rank <= 3 ? 'bg-yellow-50/30' : ''}`}>
                    <td className="px-4 py-2.5 text-center">
                      {r.rank <= 3
                        ? <span className="text-xl">{MEDAL[r.rank - 1]}</span>
                        : <span className="text-gray-600 font-bold text-sm">{r.rank}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-navy-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {r.name?.charAt(0)}
                        </div>
                        <span className={`font-semibold text-sm ${r.name === myName ? 'text-orange-600' : 'text-navy-600'}`}>
                          {r.name}{r.name === myName && ' (أنت)'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-orange-700 font-black">⭐ {r.points}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 text-sm">{r.academic_stage || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StudentLeaderboard() {
  const { user } = useAuth();
  const [stageFilter, setStageFilter] = useState('الكل');
  const [tab, setTab] = useState('current');

  const { data: lbData = {}, isLoading } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => api.get('/payments/leaderboard').then(r => r.data),
  });

  const { data: history = [], isLoading: histLoading } = useQuery({
    queryKey: ['leaderboard-history'],
    queryFn: () => api.get('/payments/leaderboard/history').then(r => r.data),
    enabled: tab === 'history',
  });

  const leaderboard = lbData.students || [];
  const tracker = lbData.tracker || null;

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

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-black text-navy-600 flex items-center gap-2">
            <Trophy className="w-7 h-7 text-orange-500" /> لوحة المتصدرين
          </h1>
          {tracker && <CountdownBadge nextResetAt={tracker.next_reset_at} />}
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setTab('current')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              tab === 'current' ? 'bg-orange-500 text-white shadow-sm' : 'bg-white border border-slate-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Trophy className="w-4 h-4" /> الشهر الحالي
          </button>
          <button
            onClick={() => setTab('history')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              tab === 'history' ? 'bg-navy-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <History className="w-4 h-4" /> شهور سابقة
            {history.length > 0 && (
              <span className={`text-xs rounded-full px-1.5 font-black ${tab === 'history' ? 'bg-white/20' : 'bg-gray-200 text-gray-600'}`}>
                {history.length}
              </span>
            )}
          </button>
        </div>

        {tab === 'current' && (
          <>
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
          </>
        )}

        {tab === 'history' && (
          <div className="space-y-3">
            {histLoading ? (
              [...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-2xl" />)
            ) : history.length === 0 ? (
              <div className="card text-center py-16">
                <History className="w-16 h-16 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-500 font-semibold text-lg">لا يوجد سجل بعد</p>
                <p className="text-gray-400 text-sm mt-1">سيظهر هنا ترتيب كل شهر بعد التصفير</p>
              </div>
            ) : history.map(record => (
              <HistoryCard key={record.id} record={record} myName={user?.name} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
