import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Gamepad2, Plus, Settings, Trophy, BarChart3, BookOpen, Trash2, Edit3,
  Calendar, CheckCircle, XCircle, Clock, Zap, Sparkles, Filter, Search,
  Download, HelpCircle, AlertCircle, Play, Eye
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const STAGES = [
  'جميع المراحل',
  'الصف الأول الابتدائي',
  'الصف الثاني الابتدائي',
  'الصف الثالث الابتدائي',
  'الصف الرابع الابتدائي',
  'الصف الخامس الابتدائي',
  'الصف السادس الابتدائي',
  'الصف الأول الإعدادي',
  'الصف الثاني الإعدادي',
  'الصف الثالث الإعدادي',
  'الصف الأول الثانوي عام',
  'الصف الثاني الثانوي عام',
  'الصف الثالث الثانوي'
];

const emptyQuestionForm = {
  game_id: 'all',
  academic_stage: 'جميع المراحل',
  level_number: 1,
  question_text: '',
  choices: ['', '', '', ''],
  correct_index: 0,
  time_limit_sec: 45,
  enemy_label: 'تحدي المعرفة'
};

export default function EventsManagement() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('games'); // 'games', 'questions', 'analytics'

  // Question Filter states
  const [filterGame, setFilterGame] = useState('all');
  const [filterStage, setFilterStage] = useState('all');
  const [filterLevel, setFilterLevel] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [questionModal, setQuestionModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [questionForm, setQuestionForm] = useState(emptyQuestionForm);
  const [deleteQuestionId, setDeleteQuestionId] = useState(null);
  const [configModalGame, setConfigModalGame] = useState(null);
  const [configForm, setConfigForm] = useState({});

  // 1. Fetch Game Configurations
  const { data: gameConfigs = [], isLoading: loadingConfigs } = useQuery({
    queryKey: ['teacher-game-configs'],
    queryFn: () => api.get('/events/teacher/config').then(r => r.data)
  });

  // 2. Fetch Questions
  const { data: questions = [], isLoading: loadingQuestions } = useQuery({
    queryKey: ['teacher-game-questions', filterGame, filterStage, filterLevel, searchQuery],
    queryFn: () => api.get('/events/teacher/questions', {
      params: {
        game_id: filterGame,
        academic_stage: filterStage,
        level_number: filterLevel,
        search: searchQuery
      }
    }).then(r => r.data)
  });

  // 3. Fetch Analytics
  const { data: analytics = { overall: {}, perGame: [], topStudents: [], recentPlays: [] }, isLoading: loadingAnalytics } = useQuery({
    queryKey: ['teacher-game-analytics'],
    queryFn: () => api.get('/events/teacher/analytics').then(r => r.data),
    enabled: activeTab === 'analytics'
  });

  // Mutations
  const updateConfigMut = useMutation({
    mutationFn: ({ gameId, data }) => api.put(`/events/teacher/config/${gameId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teacher-game-configs'] });
      toast.success('تم حفظ إعدادات اللعبة بنجاح');
      setConfigModalGame(null);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'حدث خطأ في حفظ الإعدادات')
  });

  const saveQuestionMut = useMutation({
    mutationFn: (data) => {
      if (editingQuestion) {
        return api.put(`/events/teacher/questions/${editingQuestion.id}`, data);
      }
      return api.post('/events/teacher/questions', data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teacher-game-questions'] });
      toast.success(editingQuestion ? 'تم تعديل السؤال بنجاح' : 'تم إضافة السؤال بنجاح');
      setQuestionModal(false);
      setEditingQuestion(null);
      setQuestionForm(emptyQuestionForm);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'حدث خطأ في حفظ السؤال')
  });

  const deleteQuestionMut = useMutation({
    mutationFn: (id) => api.delete(`/events/teacher/questions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teacher-game-questions'] });
      toast.success('تم حذف السؤال');
      setDeleteQuestionId(null);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'حدث خطأ أثناء الحذف')
  });

  const seedDefaultsMut = useMutation({
    mutationFn: (stage) => api.post('/events/teacher/questions/seed-defaults', { academic_stage: stage }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['teacher-game-questions'] });
      toast.success(`تم استيراد ${res.data.insertedCount} سؤال بنجاح`);
    },
    onError: () => toast.error('حدث خطأ في استيراد الأسئلة الافتراضية')
  });

  const handleOpenEditQuestion = (q) => {
    setEditingQuestion(q);
    setQuestionForm({
      game_id: q.game_id || 'all',
      academic_stage: q.academic_stage || 'جميع المراحل',
      level_number: q.level_number || 1,
      question_text: q.question_text || '',
      choices: Array.isArray(q.choices) ? q.choices : ['', '', '', ''],
      correct_index: q.correct_index || 0,
      time_limit_sec: q.time_limit_sec || 45,
      enemy_label: q.enemy_label || 'تحدي المعرفة'
    });
    setQuestionModal(true);
  };

  const handleOpenConfig = (g) => {
    setConfigModalGame(g);
    setConfigForm({
      title: g.title,
      description: g.description,
      is_enabled: g.is_enabled,
      points_per_question: g.points_per_question,
      completion_bonus_points: g.completion_bonus_points,
      allowed_attempts: g.allowed_attempts,
      reset_frequency: g.reset_frequency,
      question_pull_mode: g.question_pull_mode,
      questions_per_play: g.questions_per_play,
      start_time: g.start_time ? new Date(g.start_time).toISOString().slice(0, 16) : '',
      end_time: g.end_time ? new Date(g.end_time).toISOString().slice(0, 16) : ''
    });
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* ── PAGE HEADER ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-navy-700 dark:text-white flex items-center gap-2.5">
            <Gamepad2 className="w-7 h-7 text-purple-600 dark:text-purple-400" />
            إدارة الفعاليات والألعاب التعليمية
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-1">
            خصص ألعاب المنصة، تحكم في الأسئلة ونقاط المكافآت والمواعيد وتابع إحصائيات الطلاب
          </p>
        </div>

        {/* Tab Switcher Buttons */}
        <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-slate-800 p-1.5 rounded-2xl border border-gray-200 dark:border-slate-700">
          {[
            { id: 'games', label: 'الألعاب والقواعد 🎮', icon: Gamepad2 },
            { id: 'questions', label: 'بنك أسئلة الألعاب 📚', icon: BookOpen },
            { id: 'analytics', label: 'الإحصائيات والنتائج 📊', icon: BarChart3 }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === tab.id
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-gray-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 1: GAMES & RULES ─────────────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'games' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {loadingConfigs ? (
              [1, 2, 3, 4].map(i => <div key={i} className="h-60 rounded-3xl bg-gray-100 dark:bg-slate-800 animate-pulse" />)
            ) : (
              gameConfigs.map(game => (
                <div
                  key={game.id}
                  className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 flex items-center justify-center text-2xl">
                          {game.icon}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base sm:text-lg font-black text-navy-700 dark:text-white">
                              {game.title}
                            </h3>
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-extrabold">
                              {game.badge}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                            {game.description}
                          </p>
                        </div>
                      </div>

                      {/* Enable/Disable status badge */}
                      <span className={`text-xs px-2.5 py-1 rounded-xl font-bold ${
                        game.is_enabled
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-800'
                      }`}>
                        {game.is_enabled ? 'مفعلة للطالب' : 'معطلة'}
                      </span>
                    </div>

                    {/* Quick Config Badges */}
                    <div className="grid grid-cols-3 gap-2 bg-gray-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-gray-100 dark:border-slate-800 text-center text-xs mb-5">
                      <div>
                        <div className="text-gray-400 dark:text-slate-500 text-[10px]">النقاط لكل سؤال</div>
                        <div className="font-mono font-black text-purple-600 dark:text-purple-400">+{game.points_per_question}</div>
                      </div>
                      <div>
                        <div className="text-gray-400 dark:text-slate-500 text-[10px]">بونص الإكمال</div>
                        <div className="font-mono font-black text-amber-500">+{game.completion_bonus_points}</div>
                      </div>
                      <div>
                        <div className="text-gray-400 dark:text-slate-500 text-[10px]">المحاولات</div>
                        <div className="font-mono font-black text-emerald-600 dark:text-emerald-400">
                          {game.allowed_attempts === 0 ? 'غير محدودة' : `${game.allowed_attempts} (${game.reset_frequency})`}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleOpenConfig(game)}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
                    >
                      <Settings className="w-4 h-4" />
                      <span>تعديل القواعد والنقاط والجدول</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 2: QUESTIONS MANAGER ─────────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'questions' && (
        <div className="space-y-5">
          {/* Controls row */}
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setEditingQuestion(null);
                    setQuestionForm(emptyQuestionForm);
                    setQuestionModal(true);
                  }}
                  className="btn-primary py-2 px-4 text-xs flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة سؤال جديد</span>
                </button>

                <button
                  type="button"
                  onClick={() => seedDefaultsMut.mutate('جميع المراحل')}
                  disabled={seedDefaultsMut.isPending}
                  className="px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-bold hover:bg-amber-100 transition-all flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>استيراد أسئلة عامة جاهزة</span>
                </button>
              </div>

              <span className="text-xs font-bold text-gray-500 dark:text-slate-400">
                إجمالي الأسئلة: {questions.length}
              </span>
            </div>

            {/* Filter Row */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-3 border-t border-gray-100 dark:border-slate-800">
              {/* Game select */}
              <select
                value={filterGame}
                onChange={e => setFilterGame(e.target.value)}
                className="input-field text-xs py-2"
              >
                <option value="all">كل الألعاب</option>
                {gameConfigs.map(g => (
                  <option key={g.id} value={g.id}>{g.title}</option>
                ))}
              </select>

              {/* Stage select */}
              <select
                value={filterStage}
                onChange={e => setFilterStage(e.target.value)}
                className="input-field text-xs py-2"
              >
                <option value="all">كل المراحل الدراسية</option>
                {STAGES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              {/* Level select */}
              <select
                value={filterLevel}
                onChange={e => setFilterLevel(e.target.value)}
                className="input-field text-xs py-2"
              >
                <option value="all">كل المستويات</option>
                <option value="1">المستوى 1 (سهل / زعيم 1)</option>
                <option value="2">المستوى 2 (متوسط / زعيم 2)</option>
                <option value="3">المستوى 3 (صعب / زعيم 3)</option>
              </select>

              {/* Search input */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="بحث في نص السؤال..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="input-field text-xs py-2 pl-8"
                />
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          </div>

          {/* Questions List */}
          <div className="space-y-3">
            {loadingQuestions ? (
              [1, 2, 3].map(i => <div key={i} className="h-28 rounded-2xl bg-gray-100 dark:bg-slate-800 animate-pulse" />)
            ) : questions.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6">
                <BookOpen className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-gray-700 dark:text-slate-200">لا توجد أسئلة تطابق الفلتر</h3>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                  أضف أسئلة جديدة أو اضغط على "استيراد أسئلة عامة جاهزة" لبدء تشغيل الألعاب فوراً.
                </p>
              </div>
            ) : (
              questions.map(q => {
                const choices = Array.isArray(q.choices) ? q.choices : [];
                return (
                  <div
                    key={q.id}
                    className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm hover:border-purple-300 dark:hover:border-purple-700 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-bold">
                          {q.academic_stage || 'جميع المراحل'}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-bold">
                          المستوى {q.level_number || 1}
                        </span>
                        {q.enemy_label && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold">
                            {q.enemy_label}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400">
                          ⏱️ {q.time_limit_sec || 45} ثانية
                        </span>
                      </div>

                      <h4 className="text-sm sm:text-base font-bold text-navy-700 dark:text-white">
                        {q.question_text}
                      </h4>

                      {/* Choices preview */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                        {choices.map((c, idx) => (
                          <div
                            key={idx}
                            className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 truncate ${
                              idx === q.correct_index
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-bold'
                                : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300'
                            }`}
                          >
                            <span className="font-mono text-[10px] opacity-60">[{idx + 1}]</span>
                            <span className="truncate">{c}</span>
                            {idx === q.correct_index && <CheckCircle className="w-3 h-3 text-emerald-600 ml-auto flex-shrink-0" />}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleOpenEditQuestion(q)}
                        className="p-2 rounded-lg text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/50 transition-colors"
                        title="تعديل السؤال"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteQuestionId(q.id)}
                        className="p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                        title="حذف السؤال"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 3: ANALYTICS & STATS ─────────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'إجمالي مرات اللعب', val: analytics.overall?.total_plays || 0, icon: Play, col: 'text-purple-600' },
              { label: 'الطلاب المشاركون', val: analytics.overall?.unique_students || 0, icon: BarChart3, col: 'text-blue-600' },
              { label: 'إجمالي النقاط الموزعة', val: `+${analytics.overall?.total_points_awarded || 0}`, icon: Zap, col: 'text-amber-500' },
              { label: 'نسبة إكمال الألعاب', val: `${analytics.overall?.completion_rate || 0}%`, icon: CheckCircle, col: 'text-emerald-500' }
            ].map((kpi, idx) => (
              <div key={idx} className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm text-center">
                <kpi.icon className={`w-6 h-6 mx-auto mb-2 ${kpi.col}`} />
                <div className="text-xs text-gray-500 dark:text-slate-400 font-bold mb-1">{kpi.label}</div>
                <div className="text-xl sm:text-2xl font-black text-navy-700 dark:text-white font-mono">{kpi.val}</div>
              </div>
            ))}
          </div>

          {/* Top Students */}
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
            <h3 className="text-base font-black text-navy-700 dark:text-white mb-4 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" />
              أفضل الطلاب في الألعاب والفعاليات
            </h3>

            {analytics.topStudents?.length === 0 ? (
              <div className="text-center py-8 text-xs text-gray-400">لا توجد محاولات مسجلة بعد</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-slate-800 text-gray-400 pb-2">
                      <th className="pb-2 pr-2">#</th>
                      <th className="pb-2">اسم الطالب</th>
                      <th className="pb-2">المرحلة</th>
                      <th className="pb-2 text-center">الألعاب المكتملة</th>
                      <th className="pb-2 text-center">إجمالي النقاط المكتسبة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {analytics.topStudents?.map((s, idx) => (
                      <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                        <td className="py-2.5 pr-2 font-bold font-mono">#{idx + 1}</td>
                        <td className="py-2.5 font-bold text-navy-700 dark:text-white">{s.name}</td>
                        <td className="py-2.5 text-gray-500">{s.academic_stage || '—'}</td>
                        <td className="py-2.5 text-center font-mono font-bold">{s.games_played}</td>
                        <td className="py-2.5 text-center font-mono font-black text-emerald-600">+{s.total_game_points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL: EDIT / ADD QUESTION ── */}
      <Modal
        isOpen={questionModal}
        onClose={() => setQuestionModal(false)}
        title={editingQuestion ? 'تعديل سؤال اللعبة' : 'إضافة سؤال جديد للألعاب'}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveQuestionMut.mutate(questionForm);
          }}
          className="space-y-4 text-right"
        >
          {/* Question Text */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
              نص السؤال *
            </label>
            <textarea
              required
              rows={3}
              value={questionForm.question_text}
              onChange={e => setQuestionForm({ ...questionForm, question_text: e.target.value })}
              className="input-field text-sm"
              placeholder="مثال: ما هو أكبر كوكب في المجموعة الشمسية؟"
            />
          </div>

          {/* Choices Grid */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-700 dark:text-slate-300">
              الاختيارات (اختر الإجابة الصحيحة عبر النقطة) *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {questionForm.choices.map((choice, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-gray-50 dark:bg-slate-800 p-2 rounded-xl border border-gray-200 dark:border-slate-700">
                  <input
                    type="radio"
                    name="correct_choice"
                    checked={questionForm.correct_index === idx}
                    onChange={() => setQuestionForm({ ...questionForm, correct_index: idx })}
                    className="w-4 h-4 text-purple-600 cursor-pointer"
                  />
                  <input
                    type="text"
                    required
                    value={choice}
                    onChange={e => {
                      const updated = [...questionForm.choices];
                      updated[idx] = e.target.value;
                      setQuestionForm({ ...questionForm, choices: updated });
                    }}
                    placeholder={`اختيار ${idx + 1}`}
                    className="flex-1 bg-transparent border-none text-xs font-bold focus:outline-none dark:text-white"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Settings Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                اللعبة المحددة
              </label>
              <select
                value={questionForm.game_id}
                onChange={e => setQuestionForm({ ...questionForm, game_id: e.target.value })}
                className="input-field text-xs"
              >
                <option value="all">متاح لكل الألعاب 🎯</option>
                {gameConfigs.map(g => (
                  <option key={g.id} value={g.id}>{g.title}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                المرحلة الدراسية
              </label>
              <select
                value={questionForm.academic_stage}
                onChange={e => setQuestionForm({ ...questionForm, academic_stage: e.target.value })}
                className="input-field text-xs"
              >
                {STAGES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                مستوى الصعوبة / الزعيم
              </label>
              <select
                value={questionForm.level_number}
                onChange={e => setQuestionForm({ ...questionForm, level_number: parseInt(e.target.value, 10) })}
                className="input-field text-xs"
              >
                <option value={1}>المستوى 1 (سهل / زعيم 1)</option>
                <option value={2}>المستوى 2 (متوسط / زعيم 2)</option>
                <option value={3}>المستوى 3 (صعب / زعيم 3)</option>
              </select>
            </div>
          </div>

          {/* Question Timer & Challenge Title */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                وقت الإجابة على السؤال ⏱️
              </label>
              <select
                value={questionForm.time_limit_sec || 45}
                onChange={e => setQuestionForm({ ...questionForm, time_limit_sec: parseInt(e.target.value, 10) })}
                className="input-field text-xs font-bold"
              >
                <option value={15}>⚡ 15 ثانية (سريع جداً)</option>
                <option value={30}>⏱️ 30 ثانية (سريع)</option>
                <option value={45}>⏱️ 45 ثانية (افتراضي متوازن)</option>
                <option value={60}>⏳ 60 ثانية (دقيقة كاملة)</option>
                <option value={90}>⏳ 90 ثانية (دقيقة ونصف)</option>
                <option value={120}>⌛ 120 ثانية (دقيقتان - للمسائل والرياضيات)</option>
                <option value={180}>⌛ 180 ثانية (3 دقائق - أسئلة مركبة)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                عنوان التحدي / لقب الزعيم (اختياري)
              </label>
              <input
                type="text"
                value={questionForm.enemy_label || ''}
                onChange={e => setQuestionForm({ ...questionForm, enemy_label: e.target.value })}
                placeholder="مثال: تحدي النجوم، لغز البوابة السحرية..."
                className="input-field text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setQuestionModal(false)}
              className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 text-xs font-bold"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saveQuestionMut.isPending}
              className="btn-primary py-2 px-5 text-xs font-bold"
            >
              {saveQuestionMut.isPending ? 'جاري الحفظ...' : 'حفظ السؤال'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL: CONFIGURE GAME RULES ── */}
      <Modal
        isOpen={!!configModalGame}
        onClose={() => setConfigModalGame(null)}
        title={`إعدادات وقواعد: ${configModalGame?.title || ''}`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateConfigMut.mutate({
              gameId: configModalGame.id,
              data: configForm
            });
          }}
          className="space-y-4 text-right"
        >
          {/* Active Toggle */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700">
            <div>
              <div className="text-xs font-bold text-navy-700 dark:text-white">تفعيل اللعبة للطلاب</div>
              <div className="text-[10px] text-gray-400">عند التعطيل لن تظهر اللعبة في قائمة الفعاليات للطلاب</div>
            </div>
            <input
              type="checkbox"
              checked={configForm.is_enabled !== false}
              onChange={e => setConfigForm({ ...configForm, is_enabled: e.target.checked })}
              className="w-5 h-5 text-purple-600 rounded cursor-pointer"
            />
          </div>

          {/* Points config */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                النقاط لكل سؤال صحيح
              </label>
              <input
                type="number"
                min={0}
                max={500}
                value={configForm.points_per_question ?? 20}
                onChange={e => setConfigForm({ ...configForm, points_per_question: e.target.value })}
                className="input-field text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                بونص إكمال اللعبة كاملة
              </label>
              <input
                type="number"
                min={0}
                max={1000}
                value={configForm.completion_bonus_points ?? 50}
                onChange={e => setConfigForm({ ...configForm, completion_bonus_points: e.target.value })}
                className="input-field text-xs font-mono"
              />
            </div>
          </div>

          {/* Attempts & Question Count */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                عدد المحاولات المسموحة
              </label>
              <select
                value={configForm.allowed_attempts ?? 0}
                onChange={e => setConfigForm({ ...configForm, allowed_attempts: parseInt(e.target.value, 10) })}
                className="input-field text-xs"
              >
                <option value={0}>لا نهائي (بدون حد)</option>
                <option value={1}>محاولة واحدة فقط</option>
                <option value={2}>محاولتان</option>
                <option value={3}>3 محاولات</option>
                <option value={5}>5 محاولات</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                تكرار تجديد المحاولات
              </label>
              <select
                value={configForm.reset_frequency || 'weekly'}
                onChange={e => setConfigForm({ ...configForm, reset_frequency: e.target.value })}
                className="input-field text-xs"
              >
                <option value="unlimited">مستمر دائماً</option>
                <option value="daily">يومياً (تتجدد كل يوم)</option>
                <option value="weekly">أسبوعياً (كل يوم إثنين)</option>
                <option value="monthly">شهرياً</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                عدد الأسئلة في الجلسة
              </label>
              <input
                type="number"
                min={1}
                max={15}
                value={configForm.questions_per_play ?? 3}
                onChange={e => setConfigForm({ ...configForm, questions_per_play: e.target.value })}
                className="input-field text-xs font-mono"
              />
            </div>
          </div>

          {/* Question Pull Mode Strategy */}
          <div className="p-3 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 space-y-2">
            <div className="text-xs font-bold text-purple-900 dark:text-purple-300">
              آلية سحب الأسئلة من البنك:
            </div>
            <div className="space-y-1.5 text-xs text-purple-800 dark:text-purple-200">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="pull_mode"
                  checked={configForm.question_pull_mode === 'unseen_first'}
                  onChange={() => setConfigForm({ ...configForm, question_pull_mode: 'unseen_first' })}
                  className="text-purple-600"
                />
                <span><strong>ذكي (Unseen First):</strong> يسحب أسئلة لم يرها الطالب في محاولاته السابقة لضمان عدم التكرار.</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="pull_mode"
                  checked={configForm.question_pull_mode === 'pure_random'}
                  onChange={() => setConfigForm({ ...configForm, question_pull_mode: 'pure_random' })}
                  className="text-purple-600"
                />
                <span><strong>عشوائي تماماً:</strong> سحب عشوائي من بنك الأسئلة في كل مرة.</span>
              </label>
            </div>
          </div>

          {/* Schedule Window (Optional) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                تاريخ ووقت الفتح (اختياري)
              </label>
              <input
                type="datetime-local"
                value={configForm.start_time || ''}
                onChange={e => setConfigForm({ ...configForm, start_time: e.target.value })}
                className="input-field text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                تاريخ ووقت الإغلاق (اختياري)
              </label>
              <input
                type="datetime-local"
                value={configForm.end_time || ''}
                onChange={e => setConfigForm({ ...configForm, end_time: e.target.value })}
                className="input-field text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setConfigModalGame(null)}
              className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 text-xs font-bold"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={updateConfigMut.isPending}
              className="btn-primary py-2 px-5 text-xs font-bold"
            >
              {updateConfigMut.isPending ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteQuestionId}
        onClose={() => setDeleteQuestionId(null)}
        onConfirm={() => deleteQuestionMut.mutate(deleteQuestionId)}
        title="حذف سؤال اللعبة"
        message="هل أنت متأكد من رغبتك في حذف هذا السؤال من بنك أسئلة الألعاب؟"
      />
    </div>
  );
}
