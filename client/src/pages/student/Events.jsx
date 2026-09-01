import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { PlayCircle, Trophy, Zap, Shield, Timer, Star, ChevronLeft, Sparkles, Gamepad2, Award, Flame, Info, Lock } from 'lucide-react';
import api from '../../lib/api';

const GAME_THEMES = {
  stickman_run: {
    badgeBg: 'bg-violet-500/25 text-violet-200 border-violet-400/40',
    iconBg: 'from-violet-500/30 to-purple-600/30 border-violet-400/50',
    btnPlay: 'bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-600/40 border border-violet-400/40 hover:shadow-purple-500/60',
    cardBorder: 'border-violet-500/30 hover:border-violet-400/60',
    glowColor: 'bg-violet-500/15',
    accentText: 'text-violet-300'
  },
  space_blaster: {
    badgeBg: 'bg-cyan-500/25 text-cyan-200 border-cyan-400/40',
    iconBg: 'from-cyan-500/30 to-blue-600/30 border-cyan-400/50',
    btnPlay: 'bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-lg shadow-cyan-600/40 border border-cyan-400/40 hover:shadow-cyan-500/60',
    cardBorder: 'border-cyan-500/30 hover:border-cyan-400/60',
    glowColor: 'bg-cyan-500/15',
    accentText: 'text-cyan-300'
  },
  tower_of_riddles: {
    badgeBg: 'bg-amber-500/25 text-amber-200 border-amber-400/40',
    iconBg: 'from-amber-500/30 to-orange-600/30 border-amber-400/50',
    btnPlay: 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-400 text-white shadow-lg shadow-amber-600/40 border border-amber-400/40 hover:shadow-amber-500/60',
    cardBorder: 'border-amber-500/30 hover:border-amber-400/60',
    glowColor: 'bg-amber-500/15',
    accentText: 'text-amber-300'
  },
  bubble_blitz: {
    badgeBg: 'bg-emerald-500/25 text-emerald-200 border-emerald-400/40',
    iconBg: 'from-emerald-500/30 to-teal-600/30 border-emerald-400/50',
    btnPlay: 'bg-gradient-to-r from-emerald-500 via-teal-600 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white shadow-lg shadow-emerald-600/40 border border-emerald-400/40 hover:shadow-emerald-500/60',
    cardBorder: 'border-emerald-500/30 hover:border-emerald-400/60',
    glowColor: 'bg-emerald-500/15',
    accentText: 'text-emerald-300'
  }
};

const DEFAULT_THEME = {
  badgeBg: 'bg-purple-500/25 text-purple-200 border-purple-400/40',
  iconBg: 'from-purple-500/30 to-indigo-600/30 border-purple-400/50',
  btnPlay: 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-600/40 border border-purple-400/40',
  cardBorder: 'border-purple-500/30 hover:border-purple-400/60',
  glowColor: 'bg-purple-500/15',
  accentText: 'text-purple-300'
};

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

  // Filter logic: correctly match 'all' or category or game id
  const filteredGames = games.filter(g => {
    if (selectedFilter === 'all') return true;
    if (selectedFilter === g.category) return true;
    if (selectedFilter === g.id) return true;
    return false;
  });

  const filterTabs = [
    { id: 'all', label: 'جميع الألعاب 🎯' },
    { id: 'runner', label: 'مغامرة الستيكمان 🏃' },
    { id: 'arcade', label: 'حرب البط الفضائي 🦆' },
    { id: 'puzzle', label: 'برج الفوازير 🏰' },
    { id: 'action', label: 'فرقعة الفقاعات 🫧' }
  ];

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
          <div className="flex items-center gap-3 bg-white/10 border border-purple-400/30 px-5 py-3 rounded-2xl backdrop-blur-md shadow-lg shadow-purple-900/40">
            <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-amber-400 font-bold shadow-inner">
              <Trophy size={22} className="animate-bounce" />
            </div>
            <div>
              <div className="text-xs text-purple-200 font-bold">نقاطك الحالية</div>
              <div className="text-xl font-black text-amber-300 font-mono">
                {pts.toLocaleString('ar-EG')} <span className="text-xs font-sans text-amber-300/80">نقطة</span>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="relative z-10 max-w-6xl mx-auto flex items-center gap-2 overflow-x-auto mt-6 pt-4 border-t border-white/10 pb-1 scrollbar-none">
          {filterTabs.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSelectedFilter(f.id)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all whitespace-nowrap active:scale-95 flex items-center gap-1.5 ${
                selectedFilter === f.id
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/50 border border-purple-300 scale-105'
                  : 'bg-white/10 text-white/80 hover:bg-white/15 hover:text-white border border-white/15'
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
            <h3 className="text-lg font-bold text-white mb-1">لا توجد ألعاب في هذا التصنيف حالياً</h3>
            <p className="text-sm text-white/50">اختر "جميع الألعاب" لعرض كامل الألعاب المتاحة.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredGames.map(game => {
              const theme = GAME_THEMES[game.id] || DEFAULT_THEME;
              const isPlayable = game.isPlayable;

              return (
                <div
                  key={game.id}
                  className={`group relative rounded-3xl overflow-hidden bg-gradient-to-b from-[#180e30] via-[#120a24] to-[#0c0618] border ${theme.cardBorder} shadow-2xl transition-all duration-300 hover:-translate-y-1.5 flex flex-col justify-between`}
                >
                  {/* Glowing background flare */}
                  <div className={`absolute top-0 right-0 w-36 h-36 ${theme.glowColor} rounded-full blur-3xl group-hover:scale-125 transition-all pointer-events-none`} />

                  {/* Card Body */}
                  <div className="p-6 sm:p-7 relative z-10">
                    {/* Top Row: Icon + Badges */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3.5">
                        <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${theme.iconBg} border flex items-center justify-center text-3xl shadow-xl flex-shrink-0 group-hover:scale-110 transition-transform`}>
                          {game.icon}
                        </div>
                        <div>
                          <span className={`inline-block px-2.5 py-0.5 rounded-md ${theme.badgeBg} border text-[11px] font-black mb-1`}>
                            {game.badge}
                          </span>
                          <h3 className="text-lg sm:text-xl font-black text-white group-hover:text-purple-100 transition-colors">
                            {game.title}
                          </h3>
                        </div>
                      </div>

                      {/* Status Tag */}
                      <div>
                        {game.scheduleNotice ? (
                          <span className="px-3 py-1.5 rounded-xl bg-amber-500/25 border border-amber-400/50 text-amber-300 text-xs font-black whitespace-nowrap shadow-sm">
                            ⏳ {game.scheduleNotice}
                          </span>
                        ) : isPlayable ? (
                          <span className="px-3 py-1.5 rounded-xl bg-emerald-500/25 border border-emerald-400/50 text-emerald-300 text-xs font-black whitespace-nowrap animate-pulse shadow-sm">
                            متاح الآن ⚡
                          </span>
                        ) : (
                          <span className="px-3 py-1.5 rounded-xl bg-red-500/25 border border-red-400/50 text-red-300 text-xs font-black whitespace-nowrap shadow-sm">
                            مكتمل / غير متاح 🔒
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm text-white/70 leading-relaxed mb-5 min-h-[42px]">
                      {game.subtitle}
                    </p>

                    {/* Stats pills */}
                    <div className="grid grid-cols-3 gap-2.5 bg-black/50 border border-white/10 rounded-2xl p-3.5 mb-5 text-center backdrop-blur-sm">
                      <div>
                        <div className="text-[11px] text-white/50 font-bold mb-0.5">أقصى مكافأة</div>
                        <div className="text-base font-black text-amber-400 font-mono">+{game.maxPossiblePoints}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-white/50 font-bold mb-0.5">الأسئلة</div>
                        <div className="text-base font-black text-cyan-300 font-mono">{game.questionsPerPlay}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-white/50 font-bold mb-0.5">أعلى سكور</div>
                        <div className="text-base font-black text-emerald-400 font-mono">{game.stats?.high_score || 0}</div>
                      </div>
                    </div>

                    {/* Rules Bullet Preview */}
                    {Array.isArray(game.rules) && (
                      <div className="space-y-1.5 mb-5 bg-white/5 border border-white/10 rounded-xl p-3 text-[11px] text-white/80">
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
                      className={`w-full py-4 px-6 rounded-2xl font-black text-base flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-98 cursor-pointer ${
                        isPlayable
                          ? `${theme.btnPlay} cursor-pointer`
                          : 'bg-slate-800/80 border border-white/10 text-slate-400 cursor-not-allowed shadow-none'
                      }`}
                    >
                      {isPlayable ? <PlayCircle size={22} className="text-white" /> : <Lock size={20} className="text-slate-400" />}
                      <span>{isPlayable ? 'العب دلوقتي واكسب النقاط' : 'غير متاح حالياً'}</span>
                      {game.remainingAttempts !== null && isPlayable && (
                        <span className="text-xs bg-black/30 px-2.5 py-1 rounded-lg mr-1 font-mono font-bold border border-white/20">
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
        <div className="bg-gradient-to-b from-[#140b2b] to-[#0c061a] border border-purple-500/25 rounded-3xl p-6 sm:p-8 shadow-2xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 pb-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 shadow-md">
                <Trophy size={22} />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-black text-white">لوحة شرف الأبطال</h3>
                <p className="text-xs text-white/60">أفضل الطلاب تفوقاً في الألعاب والفعاليات التعليمية</p>
              </div>
            </div>

            {/* Game Selector for Leaderboard */}
            <div className="flex items-center gap-1.5 bg-black/50 border border-white/15 p-1.5 rounded-xl overflow-x-auto max-w-full">
              {games.map(g => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setActiveLeaderboardGame(g.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all whitespace-nowrap flex items-center gap-1 ${
                    activeLeaderboardGame === g.id
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md border border-purple-400/40'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>{g.icon}</span>
                  <span>{g.title}</span>
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
                        <td className="py-3 pr-3 font-black text-sm">
                          {isTop1 ? '🥇 الأول' : isTop2 ? '🥈 الثاني' : isTop3 ? '🥉 الثالث' : `#${idx + 1}`}
                        </td>
                        <td className="py-3 font-bold text-white flex items-center gap-2">
                          <span>{row.name}</span>
                          {isMe && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500 text-white font-black">
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
