import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trophy, GraduationCap, History, RotateCcw, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useTheme } from '../../context/ThemeContext';

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
    <span className="flex items-center gap-1 text-xs font-semibold text-gray-500">
      <Clock className="w-3.5 h-3.5" />
      التصفير القادم بعد {days > 0 ? `${days} يوم` : `${hours} ساعة`}
    </span>
  );
}

function HistoryCard({ record }) {
  const [open, setOpen] = useState(false);
  const { dark } = useTheme();
  const top3 = (record.rankings || []).slice(0, 3);
  const date = new Date(record.reset_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className={`rounded-2xl border shadow-sm overflow-hidden ${dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border-md)]' : 'bg-white border-slate-200'}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-5 py-4 transition-colors ${dark ? 'hover:bg-[var(--dk-elevated)]' : 'hover:bg-gray-50'}`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <div className="text-right">
            <p className="font-black text-navy-600">{record.month_label}</p>
            <p className="text-xs text-gray-500 font-medium">{date} — {record.rankings?.length || 0} طالب</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex gap-1">
            {top3.map((r, i) => (
              <div key={i} className="flex items-center gap-1 bg-gray-100 rounded-full px-2 py-0.5">
                <span className="text-sm">{MEDAL[i]}</span>
                <span className="text-xs font-bold text-gray-700 max-w-[70px] truncate">{r.name}</span>
              </div>
            ))}
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 overflow-x-auto">
          <table className="w-full min-w-[400px]">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-2 text-right text-xs font-bold text-gray-500">#</th>
                <th className="px-4 py-2 text-right text-xs font-bold text-gray-500">الطالب</th>
                <th className="px-4 py-2 text-right text-xs font-bold text-gray-500">النقاط</th>
                <th className="px-4 py-2 text-right text-xs font-bold text-gray-500">المرحلة</th>
                <th className="px-4 py-2 text-right text-xs font-bold text-gray-500">الشارات</th>
              </tr>
            </thead>
            <tbody>
              {(record.rankings || []).map((r) => (
                <tr key={r.student_id} className={`border-t border-slate-50 ${r.rank <= 3 ? 'bg-orange-50/40' : ''}`}>
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
                      <span className="font-semibold text-navy-600 text-sm">{r.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-orange-700 font-black">⭐ {r.points}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 text-sm">{r.academic_stage || '—'}</td>
                  <td className="px-4 py-2.5 text-center text-sm">
                    {r.badge_count > 0 ? `🏅 ${r.badge_count}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function TeacherLeaderboard() {
  const { dark } = useTheme();
  const [stageFilter, setStageFilter] = useState('الكل');
  const [tab, setTab] = useState('current');
  const queryClient = useQueryClient();

  const { data: lbData = {}, isLoading } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => api.get('/payments/leaderboard').then(r => r.data),
  });

  const { data: history = [], isLoading: histLoading } = useQuery({
    queryKey: ['leaderboard-history'],
    queryFn: () => api.get('/payments/leaderboard/history').then(r => r.data),
    enabled: tab === 'history',
  });

  const resetMutation = useMutation({
    mutationFn: () => api.post('/payments/leaderboard/reset'),
    onSuccess: () => {
      toast.success('تم تصفير اللوحة وحفظ سجل الشهر ✅');
      queryClient.invalidateQueries(['leaderboard']);
      queryClient.invalidateQueries(['leaderboard-history']);
    },
    onError: () => toast.error('حدث خطأ أثناء التصفير'),
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

  const top3 = filtered.slice(0, 3);

  const handleReset = () => {
    if (!window.confirm('هل أنت متأكد؟ سيتم حفظ ترتيب الشهر الحالي ثم تصفير جميع نقاط الطلاب.')) return;
    resetMutation.mutate();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-black text-navy-600 flex items-center gap-2">
          <Trophy className="w-7 h-7 text-orange-500" /> لوحة المتصدرين
          <span className="text-xs font-semibold text-orange-500 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">أعلى 10</span>
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          {tracker && <CountdownBadge nextResetAt={tracker.next_reset_at} />}
          <button
            onClick={handleReset}
            disabled={resetMutation.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            {resetMutation.isPending ? 'جاري التصفير...' : 'تصفير الشهر'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('current')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            tab === 'current' ? 'bg-orange-500 text-white shadow-sm' : dark ? 'bg-[var(--dk-surface)] border border-[var(--dk-border-md)] text-gray-300 hover:bg-[var(--dk-elevated)]' : 'bg-white border border-slate-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Trophy className="w-4 h-4" /> الشهر الحالي
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            tab === 'history' ? 'bg-navy-600 text-white shadow-sm' : dark ? 'bg-[var(--dk-surface)] border border-[var(--dk-border-md)] text-gray-300 hover:bg-[var(--dk-elevated)]' : 'bg-white border border-slate-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <History className="w-4 h-4" /> سجل الشهور السابقة
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
          <div className={`rounded-2xl border p-4 shadow-sm ${dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border-md)]' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center gap-2 mb-3">
              <GraduationCap className="w-4 h-4 text-gray-500" />
              <span className={`text-xs font-bold ${dark ? 'text-gray-400' : 'text-gray-500'}`}>تصفية حسب السنة الدراسية</span>
            </div>
            <div className="filter-scroll">
              {stages.map(stage => (
                <button
                  key={stage}
                  onClick={() => setStageFilter(stage)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 ${
                    stageFilter === stage
                      ? 'bg-orange-500 text-white shadow-sm'
                      : dark ? 'bg-[var(--dk-elevated)] text-gray-300 hover:bg-[var(--dk-hover)]' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {stage}
                  <span className={`text-xs rounded-full px-1.5 font-black ${
                    stageFilter === stage ? 'bg-white/20 text-white' : dark ? 'bg-[var(--dk-bg)] text-gray-400' : 'bg-white text-gray-600'
                  }`}>
                    {stageCounts[stage] || 0}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Top 3 Podium */}
          {top3.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              {[filtered[1], filtered[0], filtered[2]].map((s, i) => s && (
                <div key={s.id} className={`card text-center !p-3 sm:!p-5 ${i === 1 ? 'bg-gradient-to-b from-yellow-50 to-white border-2 border-yellow-300' : ''}`}>
                  <div className="text-2xl sm:text-4xl mb-1 sm:mb-2">{i === 1 ? '🥇' : i === 0 ? '🥈' : '🥉'}</div>
                  <div className={`w-10 h-10 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-lg sm:text-2xl font-black text-white mx-auto mb-2 sm:mb-3 ${i === 1 ? 'bg-yellow-500' : i === 0 ? 'bg-gray-500' : 'bg-orange-700'}`}>
                    {s.name?.charAt(0)}
                  </div>
                  <h3 className="font-bold text-navy-600 text-xs sm:text-sm truncate">{s.name}</h3>
                  <p className="text-orange-700 font-black text-base sm:text-xl mt-1">{s.points} ⭐</p>
                  <p className="text-gray-600 text-[10px] sm:text-xs font-medium mt-0.5">{s.exams_taken} اختبار</p>
                </div>
              ))}
            </div>
          )}

          {/* Table */}
          <div className="card !p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full mobile-card-table min-w-0 sm:min-w-[500px]">
                <thead>
                  <tr>
                    <th className="table-header rounded-r-lg">#</th>
                    <th className="table-header">الطالب</th>
                    <th className="table-header">النقاط</th>
                    <th className="table-header hidden sm:table-cell">الاختبارات</th>
                    <th className="table-header hidden md:table-cell">متوسط الدرجات</th>
                    <th className="table-header rounded-l-lg hidden sm:table-cell">الشارات</th>
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
                      <td data-label="#" className="table-cell">
                        {i < 3
                          ? <span className="text-xl">{MEDAL[i]}</span>
                          : <span className="text-gray-700 font-bold">{i + 1}</span>}
                      </td>
                      <td data-label="الطالب" className="table-cell">
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
                      <td data-label="النقاط" className="table-cell"><span className="text-orange-700 font-black">⭐ {s.points}</span></td>
                      <td data-label="الاختبارات" className="table-cell text-center text-gray-700 font-semibold hidden sm:table-cell">{s.exams_taken}</td>
                      <td data-label="متوسط الدرجات" className="table-cell hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-1.5 max-w-[80px]">
                            <div className="bg-orange-500 h-1.5 rounded-full" style={{ width: `${Math.min(s.avg_score, 100)}%` }} />
                          </div>
                          <span className="text-sm font-bold text-navy-600">{Math.round(s.avg_score)}%</span>
                        </div>
                      </td>
                      <td data-label="الشارات" className="table-cell text-center hidden sm:table-cell">
                        <span className="text-base font-semibold text-gray-700">{s.badge_count > 0 ? `🏅 ${s.badge_count}` : '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
              <p className="text-gray-400 text-sm mt-1">سيتم حفظ ترتيب كل شهر هنا تلقائياً عند التصفير</p>
            </div>
          ) : history.map(record => (
            <HistoryCard key={record.id} record={record} />
          ))}
        </div>
      )}
    </div>
  );
}
