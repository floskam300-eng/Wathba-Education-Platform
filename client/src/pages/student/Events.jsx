import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { PlayCircle, Trophy, Zap, Shield, Timer, Star, ChevronLeft, Sparkles, Gamepad2, Award, Flame, Info } from 'lucide-react';
import api from '../../lib/api';

export default function StudentEvents() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [activeLeaderboardGame, setActiveLeaderboardGame] = useState('stickman_run');
  const [leaderboardData, setLeaderboardData] = useState([]);

  useEffect(() => {
    fetchEventsList();
  }, []);

  const fetchEventsList = () => {
    setLoading(true);
    api.get('/events/list')
      .then(res => {
        if (res.data.success) {
          setGames(res.data.games || []);
        }
      })
      .catch(err => console.error('[fetchEventsList error]', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (activeLeaderboardGame) {
      api.get(`/events/${activeLeaderboardGame}/leaderboard`)
        .then(res => setLeaderboardData(res.data || []))
        .catch(() => setLeaderboardData([]));
    }
  }, [activeLeaderboardGame]);

  const pts = user?.points || 0;

  const filteredGames = games.filter(g => {
    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'runner' && g.category === 'runner') return true;
    if (selectedFilter === 'arcade' && g.category === 'arcade') return true;
    if (selectedFilter === 'puzzle' && g.category === 'puzzle') return true;
    if (selectedFilter === 'action' && g.category === 'action') return true;
    return true;
  });

  return (
    <div className="min-h-full flex flex-col bg-[#070512] text-white font-sans selection:bg-purple-500/30" dir="rtl">
      {/* ── HERO HEADER ── */}
      <div className="relative overflow-hidden bg-gradient-to-r from-[#170938] via-[#2a084e] to-[#12072b] border-b border-purple-500/20 px-4 sm:px-8 py-6 sm:py-8">
        {/* Floating animated sparkles */}
        <div className="absolute inset-0 pointer-events-none opacity-30 bg-[radial-gradient(#8b5cf6_1px,transparent_1px)] [background-size:20px_20px]" />

        <div className="relative z-10 max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4 text-center sm:text-right">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 via-pink-500 to-amber-400 p-0.5 shadow-xl shadow-purple-500/30 flex-shrink-0 animate-pulse">
              <div className="w-full h-full bg-[#12082b] rounded-[14px] flex items-center justify-center text-3xl">
                🎮
              </div>
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-white via-purple-100 to-pink-200 bg-clip-text text-transparent mb-1">
                قسم الفعاليات والألعاب
              </h1>
              <p className="text-sm text-purple-200/70">
                العب، اختبر ذكاءك، واكسب نقاط ومكافآت حقيقية لحسابك ونافس أصدقاءك! ✨
              </p>
            </div>
          </div>

          {/* Student Points Pill */}
          <div className="flex items-center gap-3 bg-white/5 border border-purple-400/25 px-5 py-3 rounded-2xl backdrop-blur-md shadow-lg shadow-purple-900/30">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 font-bold">
              <Trophy size={20} className="animate-bounce" />
            </div>
            <div>
              <div className="text-xs text-white/50 font-bold">نقاطك الحالية</div>
              <div className="text-xl font-black text-amber-400 font-mono">
                {pts.toLocaleString('ar-EG')} <span className="text-xs font-sans text-amber-400/80">نقطة</span>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="relative z-10 max-w-6xl mx-auto flex items-center gap-2 overflow-x-auto mt-6 pt-4 border-t border-white/10 pb-1 scrollbar-none">
          {[
            { id: 'all', label: 'جميع الألعاب 🎯' },
            { id: 'runner', label: 'ركض وتخطي 🏃' },
            { id: 'arcade', label: 'مغامرات الفضاء 🚀' },
            { id: 'puzzle', label: 'فوازير وألغاز 🏰' },
            { id: 'action', label: 'فرقعة وسرعة 🫧' }
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSelectedFilter(f.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap active:scale-95 ${
                selectedFilter === f.id
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/40 border border-purple-400'
                  : 'bg-white/5 text-white/70 hover:bg-white/10 border border-white/10'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONTENT: GAME CARDS GRID ── */}
      <div className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-8 space-y-8">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-64 rounded-3xl bg-white/5 animate-pulse border border-white/10" />
            ))}
          </div>
        ) : filteredGames.length === 0 ? (
          <div className="text-center py-16 bg-white/5 border border-white/10 rounded-3xl p-8">
            <Gamepad2 size={48} className="mx-auto mb-3 text-purple-400 opacity-60" />
            <h3 className="text-lg font-bold text-white mb-1">لا توجد ألعاب متاحة حالياً في هذا القسم</h3>
            <p className="text-sm text-white/50">تابع الفعاليات الجديدة المضافة من قِبل معلمك قريباً!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredGames.map(game => {
              const isPlayable = game.isPlayable;
              const hasPlayed = game.stats?.total_plays > 0;

              return (
                <div
                  key={game.id}
                  className="group relative rounded-3xl overflow-hidden bg-gradient-to-b from-[#160c2b] to-[#0d071b] border border-purple-500/25 hover:border-purple-500/50 shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between"
                >
                  {/* Glowing corner flare */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-all pointer-events-none" />

                  {/* Card Body */}
                  <div className="p-6 sm:p-7 relative z-10">
                    {/* Top Row: Icon + Badges */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3.5">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-400/30 flex items-center justify-center text-3xl shadow-lg flex-shrink-0 group-hover:scale-110 transition-transform">
                          {game.icon}
                        </div>
                        <div>
                          <span className="inline-block px-2.5 py-0.5 rounded-md bg-purple-500/20 border border-purple-400/30 text-purple-300 text-[10px] font-extrabold mb-1">
                            {game.badge}
                          </span>
                          <h3 className="text-lg sm:text-xl font-black text-white group-hover:text-purple-200 transition-colors">
                            {game.title}
                          </h3>
                        </div>
                      </div>

                      {/* Status Tag */}
                      <div>
                        {game.scheduleNotice ? (
                          <span className="px-3 py-1 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold whitespace-nowrap">
                            ⏳ {game.scheduleNotice}
                          </span>
                        ) : isPlayable ? (
                          <span className="px-3 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold whitespace-nowrap animate-pulse">
                            متاح الآن ⚡
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-bold whitespace-nowrap">
                            مكتمل / غير متاح 🔒
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm text-white/60 leading-relaxed mb-5 min-h-[40px]">
                      {game.subtitle}
                    </p>

                    {/* Stats pills */}
                    <div className="grid grid-cols-3 gap-2.5 bg-black/40 border border-white/10 rounded-2xl p-3 mb-5 text-center">
                      <div>
                        <div className="text-[10px] text-white/40 font-bold mb-0.5">أقصى مكافأة</div>
                        <div className="text-sm font-black text-amber-400 font-mono">+{game.maxPossiblePoints}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-white/40 font-bold mb-0.5">الأسئلة</div>
                        <div className="text-sm font-black text-indigo-300 font-mono">{game.questionsPerPlay}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-white/40 font-bold mb-0.5">أعلى سكور</div>
                        <div className="text-sm font-black text-emerald-400 font-mono">{game.stats?.high_score || 0}</div>
                      </div>
                    </div>

                    {/* Rules Bullet Preview */}
                    {Array.isArray(game.rules) && (
                      <div className="space-y-1.5 mb-5 bg-white/5 border border-white/5 rounded-xl p-3 text-[11px] text-white/70">
                        {game.rules.map((rule, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
                            <span className="truncate">{rule}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Play Action Footer */}
                  <div className="p-6 pt-0 relative z-10">
                    <button
                      type="button"
                      disabled={!isPlayable}
                      onClick={() => navigate(`/student/events/${game.id.replace(/_/g, '-')}`)}
                      className={`w-full py-3.5 px-5 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-xl transition-all duration-200 active:scale-98 ${
                        isPlayable
                          ? `bg-gradient-to-r ${game.gradient} text-white hover:brightness-110 shadow-purple-600/40`
                          : 'bg-white/10 border border-white/10 text-white/40 cursor-not-allowed'
                      }`}
                    >
                      <PlayCircle size={20} />
                      <span>{isPlayable ? 'العب دلوقتي واكسب النقاط' : 'غير متاح حالياً'}</span>
                      {game.remainingAttempts !== null && isPlayable && (
                        <span className="text-xs bg-black/25 px-2 py-0.5 rounded-lg mr-1 font-mono">
                          (متبقي {game.remainingAttempts})
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── LEADERBOARD SECTION ── */}
        <div className="bg-gradient-to-b from-[#140b2b] to-[#0c061a] border border-purple-500/25 rounded-3xl p-6 sm:p-8 shadow-xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 pb-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400">
                <Trophy size={20} />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-black text-white">لوحة شرف الأبطال</h3>
                <p className="text-xs text-white/50">أفضل الطلاب تفوقاً في الألعاب والفعاليات التعليمية</p>
              </div>
            </div>

            {/* Game Selector for Leaderboard */}
            <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 p-1 rounded-xl overflow-x-auto max-w-full">
              {games.map(g => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setActiveLeaderboardGame(g.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    activeLeaderboardGame === g.id
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {g.icon} {g.title}
                </button>
              ))}
            </div>
          </div>

          {/* Leaderboard Table */}
          {leaderboardData.length === 0 ? (
            <div className="text-center py-10 text-white/40 text-sm font-medium">
              كن أول من يلعب ويحقق رقماً قياسياً في هذه اللعبة! 🌟
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-white/50 text-xs">
                    <th className="pb-3 pr-3">الترتيب</th>
                    <th className="pb-3">اسم البطل</th>
                    <th className="pb-3">المرحلة</th>
                    <th className="pb-3 text-center">أعلى سكور</th>
                    <th className="pb-3 text-center">النقاط المكتسبة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {leaderboardData.map((row, idx) => {
                    const isTop1 = idx === 0;
                    const isTop2 = idx === 1;
                    const isTop3 = idx === 2;
                    const isMe = row.id === user?.id;

                    return (
                      <tr key={row.id} className={`transition-colors ${isMe ? 'bg-purple-600/20' : 'hover:bg-white/5'}`}>
                        <td className="py-3 pr-3 font-bold">
                          {isTop1 ? '🥇 الأول' : isTop2 ? '🥈 الثاني' : isTop3 ? '🥉 الثالث' : `#${idx + 1}`}
                        </td>
                        <td className="py-3 font-bold text-white flex items-center gap-2">
                          <span>{row.name}</span>
                          {isMe && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500 text-white font-black">
                              أنت
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-xs text-white/60">{row.academic_stage || '—'}</td>
                        <td className="py-3 text-center font-mono font-black text-amber-400">
                          {row.high_score?.toLocaleString('ar-EG') || 0}
                        </td>
                        <td className="py-3 text-center font-mono font-bold text-emerald-400">
                          +{row.total_points_earned || 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
