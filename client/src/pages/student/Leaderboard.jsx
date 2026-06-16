import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trophy, History, ChevronDown, ChevronUp, Clock, Globe, GraduationCap } from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const MEDAL = ['🥇', '🥈', '🥉'];

function CountdownBadge({ nextResetAt, onExpire }) {
  const [now, setNow] = React.useState(new Date());
  const firedRef = React.useRef(false);
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  if (!nextResetAt) return null;
  const diff = new Date(nextResetAt) - now;
  if (diff <= 0) {
    if (!firedRef.current) {
      firedRef.current = true;
      if (onExpire) setTimeout(onExpire, 0);
    }
    return <span className="text-xs text-red-500 font-bold">التصفير قريب!</span>;
  }
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

function RankCard({ rank, points, label, icon: Icon, isTop3 }) {
  return (
    <div className={`rounded-2xl p-4 text-center flex-1 min-w-0 border ${
      isTop3 ? 'bg-gradient-to-b from-yellow-50 to-orange-50 border-yellow-300' : 'bg-white border-slate-200'
    }`}>
      <Icon className={`w-4 h-4 mx-auto mb-1 ${isTop3 ? 'text-yellow-600' : 'text-navy-600'}`} />
      <p className="text-[11px] text-gray-500 font-semibold mb-0.5">{label}</p>
      <p className={`text-3xl font-black ${isTop3 ? 'text-yellow-700' : 'text-navy-700'}`}>
        {rank > 0 ? `#${rank}` : '—'}
      </p>
      {points != null && (
        <p className="text-xs text-orange-600 font-bold mt-0.5">⭐ {points}</p>
      )}
    </div>
  );
}

function LeaderboardList({ students, myName, emptyMsg }) {
  if (students.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 text-center py-10 px-6">
        <Trophy className="w-10 h-10 mx-auto mb-2 text-gray-200" />
        <p className="text-gray-400 text-sm font-semibold">{emptyMsg}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {students.map((s, i) => (
        <div
          key={s.id}
          className={`flex items-center gap-3 rounded-2xl px-4 py-3 border transition-all ${
            s.name === myName
              ? 'border-orange-400 bg-orange-50 shadow-sm'
              : i < 3
                ? 'border-yellow-200 bg-yellow-50/40'
                : 'border-slate-100 bg-white'
          }`}
        >
          {/* Rank */}
          <div className="w-9 h-9 flex items-center justify-center flex-shrink-0 font-black text-lg">
            {i < 3 ? MEDAL[i] : <span className="text-gray-500 text-sm font-bold">{i + 1}</span>}
          </div>

          {/* Avatar */}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ backgroundColor: i < 3 ? ['#B45309', '#6B7280', '#92400E'][i] : '#1A2E4A' }}
          >
            {s.name?.charAt(0)}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-navy-600 text-sm truncate">
              {s.name}
              {s.name === myName && (
                <span className="text-orange-600 font-semibold"> (أنت)</span>
              )}
            </p>
            <p className="text-[11px] text-gray-500 font-medium">{s.academic_stage || ''}</p>
          </div>

          {/* Points */}
          <div className="text-left flex-shrink-0">
            <p className="text-orange-700 font-black text-sm">⭐ {s.points}</p>
            {s.badge_count > 0 && (
              <p className="text-[11px] text-gray-500 font-medium">🏅 {s.badge_count}</p>
            )}
          </div>
        </div>
      ))}
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
            <p className="text-xs text-gray-500 font-medium">{date}</p>
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
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
          {/* My result banner */}
          {myEntry && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5 flex items-center justify-between">
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

          {/* Top 10 only */}
          <LeaderboardList
            students={(record.rankings || []).slice(0, 10)}
            myName={myName}
            emptyMsg="لا توجد بيانات"
          />
        </div>
      )}
    </div>
  );
}

export default function StudentLeaderboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState('current');

  const { data: lbData = {}, isLoading, refetch: refetchLb } = useQuery({
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

  // Overall top 10
  const top10Overall = useMemo(() => leaderboard.slice(0, 10), [leaderboard]);

  // My stage top 10 — only students in the same academic_stage as the logged-in student
  const myStage = user?.academic_stage || null;
  const top10MyStage = useMemo(() => {
    if (!myStage) return [];
    return leaderboard.filter(s => s.academic_stage === myStage).slice(0, 10);
  }, [leaderboard, myStage]);

  // My ranks
  const myRankOverall = useMemo(() => {
    const idx = leaderboard.findIndex(s => s.name === user?.name);
    return idx >= 0 ? idx + 1 : 0;
  }, [leaderboard, user]);

  const myRankStage = useMemo(() => {
    const stageList = myStage
      ? leaderboard.filter(s => s.academic_stage === myStage)
      : [];
    const idx = stageList.findIndex(s => s.name === user?.name);
    return idx >= 0 ? idx + 1 : 0;
  }, [leaderboard, myStage, user]);

  const myData = leaderboard.find(s => s.name === user?.name);

  // Whether the student appears in the top 10 list (to show "outside top 10" row)
  const myInOverall = top10Overall.some(s => s.name === user?.name);
  const myInStage   = top10MyStage.some(s => s.name === user?.name);

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-black text-navy-600 flex items-center gap-2">
            <Trophy className="w-7 h-7 text-orange-500" /> لوحة المتصدرين
            <span className="text-xs font-semibold text-orange-500 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">أعلى 10</span>
          </h1>
          {tracker && (
            <CountdownBadge
              nextResetAt={tracker.next_reset_at}
              onExpire={() => { refetchLb(); qc.invalidateQueries(['leaderboard']); }}
            />
          )}
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
            {/* My rank summary cards */}
            {myData && (
              <div className="flex gap-3">
                <RankCard
                  rank={myRankOverall}
                  points={myData.points}
                  label="ترتيبك العام"
                  icon={Globe}
                  isTop3={myRankOverall > 0 && myRankOverall <= 3}
                />
                {myStage && (
                  <RankCard
                    rank={myRankStage}
                    points={null}
                    label={`ترتيبك في ${myStage}`}
                    icon={GraduationCap}
                    isTop3={myRankStage > 0 && myRankStage <= 3}
                  />
                )}
              </div>
            )}

            {isLoading ? (
              <div className="space-y-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-2xl" />
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {/* Overall top 10 */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center flex-shrink-0">
                      <Globe className="w-4 h-4 text-white" />
                    </div>
                    <h2 className="text-sm font-black text-navy-700">الترتيب العام على المنصة</h2>
                    <span className="text-[11px] text-gray-400 font-semibold bg-gray-100 px-2 py-0.5 rounded-full">أعلى 10</span>
                  </div>

                  <LeaderboardList
                    students={top10Overall}
                    myName={user?.name}
                    emptyMsg="لا توجد بيانات بعد"
                  />

                  {/* Show student's own row if outside top 10 overall */}
                  {myData && !myInOverall && myRankOverall > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 border-t border-dashed border-gray-200" />
                      <span className="text-[10px] text-gray-400 font-semibold">ترتيبك</span>
                      <div className="flex-1 border-t border-dashed border-gray-200" />
                    </div>
                  )}
                  {myData && !myInOverall && myRankOverall > 0 && (
                    <div className="flex items-center gap-3 rounded-2xl px-4 py-3 border-2 border-orange-400 bg-orange-50 mt-1">
                      <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
                        <span className="text-gray-500 text-sm font-bold">#{myRankOverall}</span>
                      </div>
                      <div className="w-9 h-9 rounded-full bg-navy-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                        {myData.name?.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-navy-600 text-sm truncate">{myData.name} <span className="text-orange-600">(أنت)</span></p>
                        <p className="text-[11px] text-gray-500">{myData.academic_stage || ''}</p>
                      </div>
                      <p className="text-orange-700 font-black text-sm flex-shrink-0">⭐ {myData.points}</p>
                    </div>
                  )}
                </div>

                {/* My stage top 10 — only shown when student has a stage */}
                {myStage && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-navy-600 to-navy-700 flex items-center justify-center flex-shrink-0">
                        <GraduationCap className="w-4 h-4 text-white" />
                      </div>
                      <h2 className="text-sm font-black text-navy-700">ترتيب {myStage}</h2>
                      <span className="text-[11px] text-gray-400 font-semibold bg-gray-100 px-2 py-0.5 rounded-full">أعلى 10</span>
                    </div>

                    <LeaderboardList
                      students={top10MyStage}
                      myName={user?.name}
                      emptyMsg={`لا توجد بيانات لـ${myStage} بعد`}
                    />

                    {/* Show student's own row if outside top 10 in stage */}
                    {myData && !myInStage && myRankStage > 0 && (
                      <>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 border-t border-dashed border-gray-200" />
                          <span className="text-[10px] text-gray-400 font-semibold">ترتيبك في صفك</span>
                          <div className="flex-1 border-t border-dashed border-gray-200" />
                        </div>
                        <div className="flex items-center gap-3 rounded-2xl px-4 py-3 border-2 border-orange-400 bg-orange-50 mt-1">
                          <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
                            <span className="text-gray-500 text-sm font-bold">#{myRankStage}</span>
                          </div>
                          <div className="w-9 h-9 rounded-full bg-navy-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                            {myData.name?.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-navy-600 text-sm truncate">{myData.name} <span className="text-orange-600">(أنت)</span></p>
                            <p className="text-[11px] text-gray-500">{myStage}</p>
                          </div>
                          <p className="text-orange-700 font-black text-sm flex-shrink-0">⭐ {myData.points}</p>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {tab === 'history' && (
          <div className="space-y-3">
            {histLoading ? (
              [...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-2xl" />)
            ) : history.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 text-center py-16 px-6">
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
