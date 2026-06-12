import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, Plus, Trash2, Settings, ChevronDown, ChevronUp,
  CheckCircle, XCircle, Clock, Users, BarChart2, Edit3,
  AlertCircle, Eye, FileText, RefreshCw, Flame, Image as ImageIcon, Upload
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

const PG_STAGES = ['الصف الأول الثانوي', 'الصف الثاني الثانوي', 'الصف الثالث الثانوي',
  'الصف الأول الإعدادي', 'الصف الثاني الإعدادي', 'الصف الثالث الإعدادي',
  'الصف الرابع الابتدائي', 'الصف الخامس الابتدائي', 'الصف السادس الابتدائي'];

const SCHED_LABELS = { once: 'مرة واحدة', daily: 'يومي', weekly: 'أسبوعي' };
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function getStatus(rec) {
  const now = new Date();
  if (!rec.is_published) return { label: 'مسودة', color: 'gray', icon: Edit3 };
  if (rec.start_date && new Date(rec.start_date) > now) return { label: 'قادم', color: 'blue', icon: Clock };
  if (rec.end_date && new Date(rec.end_date) < now) return { label: 'منتهي', color: 'red', icon: XCircle };
  return { label: 'مفتوح', color: 'green', icon: CheckCircle };
}

function StatusBadge({ rec }) {
  const s = getStatus(rec);
  const colors = {
    gray: 'bg-gray-100 text-gray-600',
    blue: 'bg-blue-100 text-blue-700',
    red: 'bg-red-100 text-red-700',
    green: 'bg-green-100 text-green-700',
  };
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${colors[s.color]}`}>
      <Icon className="w-3 h-3" />{s.label}
    </span>
  );
}

const emptyForm = {
  title: '', description: '', academic_stage: '',
  duration_minutes: 10, total_score: 10, pass_score: 5,
  points_on_attempt: 0, points_on_pass: 5,
  schedule_type: 'once', schedule_day: 0,
  start_date: '', end_date: '',
  shuffle_questions: false, shuffle_options: false,
};

const emptyQ = { question_text: '', question_image_url: '', question_type: 'mcq', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer_letter: 'A', points: 1, sub_questions: [] };

export default function Recitations() {
  const { dark } = useTheme();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const baseRole = user?.role === 'assistant' ? 'assistant' : 'teacher';

  const [tab, setTab] = useState('list');
  const [modal, setModal] = useState(false);
  const [editRec, setEditRec] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedId, setSelectedId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');

  const { data: recitations = [], isLoading } = useQuery({
    queryKey: ['recitations'],
    queryFn: () => api.get('/recitations').then(r => r.data),
  });

  const { data: results = [] } = useQuery({
    queryKey: ['recitation-results', selectedId],
    queryFn: () => selectedId ? api.get(`/recitations/${selectedId}/results`).then(r => r.data) : [],
    enabled: !!selectedId,
  });

  const { data: analytics } = useQuery({
    queryKey: ['recitations-analytics'],
    queryFn: () => api.get('/recitations/analytics').then(r => r.data),
    enabled: tab === 'analytics',
  });

  const createMut = useMutation({
    mutationFn: (d) => editRec ? api.put(`/recitations/${editRec.id}`, d) : api.post('/recitations', d),
    onSuccess: () => {
      qc.invalidateQueries(['recitations']);
      toast.success(editRec ? 'تم تحديث التسميع' : 'تم إنشاء التسميع');
      setModal(false); setEditRec(null); setForm(emptyForm);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/recitations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries(['recitations']);
      toast.success('تم حذف التسميع');
      if (selectedId === deleteId) setSelectedId(null);
      setDeleteId(null);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const publishMut = useMutation({
    mutationFn: (id) => api.put(`/recitations/${id}/publish`),
    onSuccess: () => { qc.invalidateQueries(['recitations']); toast.success('تم تحديث حالة النشر'); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const openEdit = (rec) => {
    setEditRec(rec);
    setForm({
      title: rec.title,
      description: rec.description || '',
      academic_stage: rec.academic_stage || '',
      duration_minutes: rec.duration_minutes,
      total_score: rec.total_score,
      pass_score: rec.pass_score,
      points_on_attempt: rec.points_on_attempt,
      points_on_pass: rec.points_on_pass,
      schedule_type: rec.schedule_type || 'once',
      schedule_day: rec.schedule_day ?? 0,
      start_date: rec.start_date ? rec.start_date.slice(0, 16) : '',
      end_date: rec.end_date ? rec.end_date.slice(0, 16) : '',
      shuffle_questions: rec.shuffle_questions,
      shuffle_options: rec.shuffle_options,
    });
    setModal(true);
  };

  const filtered = useMemo(() => recitations.filter(r => {
    const q = search.toLowerCase();
    const matchQ = !q || r.title.toLowerCase().includes(q);
    const matchS = !stageFilter || r.academic_stage === stageFilter || (!r.academic_stage && stageFilter === '__all__');
    return matchQ && matchS;
  }), [recitations, search, stageFilter]);

  const selectedRec = recitations.find(r => r.id === selectedId);

  const cardCls = dark
    ? 'bg-[var(--dk-surface)] border border-[var(--dk-border)] rounded-2xl p-4'
    : 'bg-white border border-gray-100 rounded-2xl p-4 shadow-sm';

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={`text-xl sm:text-2xl font-black flex items-center gap-2 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
          <BookOpen className="w-7 h-7 text-purple-500 flex-shrink-0" />
          التسميع
          <span className={`text-sm font-semibold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>({recitations.length})</span>
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setTab('list'); setSelectedId(null); }}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${tab === 'list'
              ? 'bg-purple-500 text-white'
              : dark ? 'text-[var(--dk-text-2)] hover:bg-[var(--dk-elevated)]' : 'text-gray-600 hover:bg-gray-100'}`}>
            القائمة
          </button>
          <button
            onClick={() => setTab('analytics')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${tab === 'analytics'
              ? 'bg-purple-500 text-white'
              : dark ? 'text-[var(--dk-text-2)] hover:bg-[var(--dk-elevated)]' : 'text-gray-600 hover:bg-gray-100'}`}>
            <BarChart2 className="w-4 h-4 inline ml-1" />التحليلات
          </button>
          <button
            onClick={() => { setEditRec(null); setForm(emptyForm); setModal(true); }}
            className="flex items-center gap-2 bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors shadow">
            <Plus className="w-4 h-4" /> تسميع جديد
          </button>
        </div>
      </div>

      {tab === 'analytics' && <AnalyticsTab analytics={analytics} dark={dark} cardCls={cardCls} />}

      {tab === 'list' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Left: list */}
          <div className="lg:col-span-2 space-y-3">
            {/* Filters */}
            <div className="flex gap-2">
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="بحث عن تسميع..."
                className={`flex-1 rounded-xl px-3 py-2 text-sm border transition-colors ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)] placeholder-[var(--dk-text-2)]' : 'bg-white border-gray-200 text-gray-800'}`} />
              <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
                className={`rounded-xl px-3 py-2 text-sm border ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'}`}>
                <option value="">كل المراحل</option>
                {PG_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {isLoading
              ? [...Array(3)].map((_, i) => <div key={i} className={`${cardCls} h-24 animate-pulse`} />)
              : filtered.length === 0
                ? <div className={`${cardCls} text-center py-10`}>
                    <BookOpen className={`w-12 h-12 mx-auto mb-2 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-300'}`} />
                    <p className={`text-sm ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>لا توجد تسميعات بعد</p>
                  </div>
                : filtered.map(rec => (
                  <div key={rec.id}
                    onClick={() => { setSelectedId(rec.id); setViewMode('questions'); }}
                    className={`${cardCls} cursor-pointer transition-all border-2 ${selectedId === rec.id ? 'border-purple-400' : dark ? 'border-transparent' : 'border-transparent hover:border-purple-200'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <StatusBadge rec={rec} />
                          {rec.academic_stage && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">
                              {rec.academic_stage}
                            </span>
                          )}
                          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">
                            {SCHED_LABELS[rec.schedule_type] || 'مرة واحدة'}
                          </span>
                        </div>
                        <h3 className={`font-bold text-sm truncate ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{rec.title}</h3>
                        <div className={`flex items-center gap-3 mt-1 text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
                          <span><FileText className="w-3 h-3 inline ml-1" />{rec.question_count} سؤال</span>
                          <span><Users className="w-3 h-3 inline ml-1" />{rec.result_count} نتيجة</span>
                          <span><Clock className="w-3 h-3 inline ml-1" />{rec.duration_minutes} د</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        {/* [N5-FIX] Hide edit button for published recitations —
                            server rejects edits anyway (409) but showing the button
                            misleads the teacher. */}
                        {!rec.is_published && (
                          <button onClick={e => { e.stopPropagation(); openEdit(rec); }}
                            className={`p-1.5 rounded-lg transition-colors ${dark ? 'text-[var(--dk-text-2)] hover:bg-[var(--dk-elevated)]' : 'text-gray-400 hover:bg-gray-100'}`}>
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={e => { e.stopPropagation(); setDeleteId(rec.id); }}
                          className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
            }
          </div>

          {/* Right: detail panel */}
          <div className="lg:col-span-3">
            {!selectedRec ? (
              <div className={`${cardCls} text-center py-20`}>
                <BookOpen className={`w-16 h-16 mx-auto mb-3 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-300'}`} />
                <p className={`font-semibold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>اختر تسميعاً لعرض تفاصيله</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Detail header */}
                <div className={cardCls}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <StatusBadge rec={selectedRec} />
                        {selectedRec.academic_stage && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">{selectedRec.academic_stage}</span>
                        )}
                      </div>
                      <h2 className={`text-lg font-black ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{selectedRec.title}</h2>
                      {selectedRec.description && (
                        <p className={`text-sm mt-1 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>{selectedRec.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => publishMut.mutate(selectedRec.id)}
                      disabled={publishMut.isPending}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors flex-shrink-0 ${
                        selectedRec.is_published
                          ? 'bg-red-100 text-red-600 hover:bg-red-200'
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                      }`}>
                      {selectedRec.is_published ? 'إلغاء النشر' : 'نشر التسميع'}
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: 'المدة', value: `${selectedRec.duration_minutes} د` },
                      { label: 'الدرجة', value: selectedRec.total_score },
                      { label: 'النجاح', value: selectedRec.pass_score },
                      { label: 'النتائج', value: selectedRec.result_count },
                    ].map(({ label, value }) => (
                      <div key={label} className={`rounded-xl p-2 text-center ${dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-50'}`}>
                        <div className={`text-lg font-black ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{value}</div>
                        <div className={`text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions row */}
                <div className="flex flex-wrap gap-2">
                  {!selectedRec.is_published && (
                    <button
                      onClick={() => navigate(`/${baseRole}/recitations/${selectedRec.id}/questions`)}
                      className="flex items-center gap-2 bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors shadow-sm">
                      <FileText className="w-4 h-4" />
                      إدارة الأسئلة ({selectedRec.question_count})
                    </button>
                  )}
                  {selectedRec.is_published && (
                    <button
                      onClick={() => navigate(`/${baseRole}/recitations/${selectedRec.id}/questions`)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)] hover:bg-[var(--dk-surface)]' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      <Eye className="w-4 h-4" />
                      عرض الأسئلة ({selectedRec.question_count})
                    </button>
                  )}
                </div>

                {/* Results */}
                <ResultsPanel results={results} rec={selectedRec} dark={dark} cardCls={cardCls} navigate={navigate} baseRole={baseRole} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" dir="rtl">
          <div className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl ${dark ? 'bg-[var(--dk-surface)]' : 'bg-white'}`}>
            <div className={`sticky top-0 flex items-center justify-between px-6 py-4 border-b ${dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border)]' : 'bg-white border-gray-100'}`}>
              <h2 className={`font-black text-lg ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
                {editRec ? 'تعديل التسميع' : 'تسميع جديد'}
              </h2>
              <button onClick={() => { setModal(false); setEditRec(null); setForm(emptyForm); }}
                className={`p-2 rounded-xl ${dark ? 'hover:bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'hover:bg-gray-100 text-gray-400'}`}>✕</button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className={`block text-sm font-bold mb-1 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>العنوان *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="مثال: تسميع الأحكام النحوية"
                  className={`w-full rounded-xl px-3 py-2.5 border text-sm ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'}`} />
              </div>

              <div>
                <label className={`block text-sm font-bold mb-1 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>وصف (اختياري)</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} placeholder="وصف مختصر..."
                  className={`w-full rounded-xl px-3 py-2.5 border text-sm resize-none ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'}`} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-sm font-bold mb-1 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>المرحلة الدراسية</label>
                  <select value={form.academic_stage} onChange={e => setForm(f => ({ ...f, academic_stage: e.target.value }))}
                    className={`w-full rounded-xl px-3 py-2.5 border text-sm ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'}`}>
                    <option value="">كل الطلاب</option>
                    {PG_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-bold mb-1 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>الجدولة</label>
                  <select value={form.schedule_type} onChange={e => setForm(f => ({ ...f, schedule_type: e.target.value }))}
                    className={`w-full rounded-xl px-3 py-2.5 border text-sm ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'}`}>
                    <option value="once">مرة واحدة</option>
                    <option value="daily">يومي (تلقائي)</option>
                    <option value="weekly">أسبوعي (تلقائي)</option>
                  </select>
                </div>
              </div>

              {form.schedule_type === 'weekly' && (
                <div>
                  <label className={`block text-sm font-bold mb-1 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>يوم التسميع الأسبوعي</label>
                  <select value={form.schedule_day} onChange={e => setForm(f => ({ ...f, schedule_day: parseInt(e.target.value) }))}
                    className={`w-full rounded-xl px-3 py-2.5 border text-sm ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'}`}>
                    {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-sm font-bold mb-1 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>تاريخ البداية</label>
                  <input type="datetime-local" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className={`w-full rounded-xl px-3 py-2.5 border text-sm ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'}`} />
                </div>
                <div>
                  <label className={`block text-sm font-bold mb-1 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>تاريخ الانتهاء</label>
                  <input type="datetime-local" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                    className={`w-full rounded-xl px-3 py-2.5 border text-sm ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'}`} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={`block text-sm font-bold mb-1 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>المدة (دقائق)</label>
                  <input type="number" min="1" max="60" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || 10 }))}
                    className={`w-full rounded-xl px-3 py-2.5 border text-sm ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'}`} />
                </div>
                <div>
                  <label className={`block text-sm font-bold mb-1 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>الدرجة الكلية</label>
                  <input type="number" min="1" value={form.total_score} onChange={e => setForm(f => ({ ...f, total_score: parseInt(e.target.value) || 10 }))}
                    className={`w-full rounded-xl px-3 py-2.5 border text-sm ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'}`} />
                </div>
                <div>
                  <label className={`block text-sm font-bold mb-1 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>درجة النجاح</label>
                  <input type="number" min="0" value={form.pass_score} onChange={e => setForm(f => ({ ...f, pass_score: parseInt(e.target.value) || 5 }))}
                    className={`w-full rounded-xl px-3 py-2.5 border text-sm ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'}`} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-sm font-bold mb-1 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>نقاط للمحاولة</label>
                  <input type="number" min="0" value={form.points_on_attempt} onChange={e => setForm(f => ({ ...f, points_on_attempt: parseInt(e.target.value) || 0 }))}
                    className={`w-full rounded-xl px-3 py-2.5 border text-sm ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'}`} />
                </div>
                <div>
                  <label className={`block text-sm font-bold mb-1 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>نقاط للنجاح</label>
                  <input type="number" min="0" value={form.points_on_pass} onChange={e => setForm(f => ({ ...f, points_on_pass: parseInt(e.target.value) || 5 }))}
                    className={`w-full rounded-xl px-3 py-2.5 border text-sm ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'}`} />
                </div>
              </div>

              <div>
                <p className={`text-xs font-black uppercase tracking-wide mb-2 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>خيارات الخلط العشوائي</p>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, shuffle_questions: !f.shuffle_questions }))}
                    className={`flex items-start gap-3 p-3 rounded-2xl border-2 text-right transition-all ${
                      form.shuffle_questions
                        ? 'border-orange-400 bg-orange-50 shadow-sm shadow-orange-100'
                        : dark ? 'border-[var(--dk-border)] bg-[var(--dk-elevated)] hover:border-purple-400' : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 transition-all ${
                      form.shuffle_questions ? 'bg-orange-500' : dark ? 'bg-gray-700' : 'bg-gray-100'
                    }`}>🔀</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span className={`font-black text-xs sm:text-sm leading-tight ${form.shuffle_questions ? 'text-orange-800' : dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
                          خلط الأسئلة
                        </span>
                        <span className={`text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none ${
                          form.shuffle_questions ? 'bg-orange-500 text-white' : dark ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500'
                        }`}>
                          {form.shuffle_questions ? 'مفعّل' : 'معطّل'}
                        </span>
                      </div>
                      <p className={`text-[10px] sm:text-xs leading-relaxed hidden sm:block ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
                        كل طالب يشوف الأسئلة بترتيب مختلف
                      </p>
                    </div>
                  </button>

                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, shuffle_options: !f.shuffle_options }))}
                    className={`flex items-start gap-3 p-3 rounded-2xl border-2 text-right transition-all ${
                      form.shuffle_options
                        ? 'border-indigo-400 bg-indigo-50 shadow-sm shadow-indigo-100'
                        : dark ? 'border-[var(--dk-border)] bg-[var(--dk-elevated)] hover:border-purple-400' : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 transition-all ${
                      form.shuffle_options ? 'bg-indigo-500' : dark ? 'bg-gray-700' : 'bg-gray-100'
                    }`}>🎲</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span className={`font-black text-xs sm:text-sm leading-tight ${form.shuffle_options ? 'text-indigo-800' : dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
                          خلط الخيارات
                        </span>
                        <span className={`text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none ${
                          form.shuffle_options ? 'bg-indigo-500 text-white' : dark ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500'
                        }`}>
                          {form.shuffle_options ? 'مفعّل' : 'معطّل'}
                        </span>
                      </div>
                      <p className={`text-[10px] sm:text-xs leading-relaxed hidden sm:block ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
                        ترتيب الخيارات يتغير لكل طالب
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => createMut.mutate(form)} disabled={createMut.isPending || !form.title.trim()}
                  className="flex-1 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white py-2.5 rounded-xl font-bold text-sm transition-colors">
                  {createMut.isPending ? 'جاري الحفظ...' : editRec ? 'حفظ التعديلات' : 'إنشاء التسميع'}
                </button>
                <button onClick={() => { setModal(false); setEditRec(null); setForm(emptyForm); }}
                  className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-colors ${dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-gray-100 text-gray-600'}`}>
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" dir="rtl">
          <div className={`rounded-2xl p-6 max-w-sm w-full shadow-2xl ${dark ? 'bg-[var(--dk-surface)]' : 'bg-white'}`}>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6 text-red-500" />
            </div>
            <h3 className={`text-center font-black text-lg mb-2 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>حذف التسميع؟</h3>
            <p className={`text-center text-sm mb-4 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>سيتم حذف التسميع وكل نتائجه نهائياً</p>
            <div className="flex gap-3">
              <button onClick={() => deleteMut.mutate(deleteId)} disabled={deleteMut.isPending}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl font-bold text-sm">
                {deleteMut.isPending ? 'جاري الحذف...' : 'حذف'}
              </button>
              <button onClick={() => setDeleteId(null)}
                className={`flex-1 py-2.5 rounded-xl font-bold text-sm ${dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-gray-100 text-gray-600'}`}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionsPanel({ rec, questions, qForm, setQForm, editQId, setEditQId, addQMut, deleteQMut, dark, cardCls }) {
  const [imgUploading, setImgUploading] = useState(false);
  const [imgMultiCount, setImgMultiCount] = useState(5);
  const imgInputRef = useRef();

  const tf = qForm.question_type === 'true_false';
  const isImgMulti = qForm.question_type === 'image_multi';

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);
    setImgUploading(true);
    try {
      const { data } = await api.post('/recitations/upload-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setQForm(f => ({ ...f, question_image_url: data.url }));
    } catch (err) {
      toast.error(err.response?.data?.error || 'فشل رفع الصورة');
    } finally {
      setImgUploading(false);
      if (imgInputRef.current) imgInputRef.current.value = '';
    }
  };

  const canSubmit = () => {
    if (!qForm.question_text?.trim() && !qForm.question_image_url) return false;
    if (isImgMulti && (!qForm.sub_questions || qForm.sub_questions.length === 0)) return false;
    return true;
  };

  return (
    <div className="space-y-3">
      {!rec.is_published && (
        <div className={cardCls}>
          <h3 className={`font-bold text-sm mb-3 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
            {editQId ? 'تعديل السؤال' : 'إضافة سؤال'}
          </h3>
          <div className="space-y-3">
            {/* Question type */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'mcq', label: 'اختيار متعدد' },
                { key: 'true_false', label: 'صح / خطأ' },
                { key: 'image_multi', label: '🖼 صورة مع أسئلة' },
              ].map(t => (
                <button key={t.key}
                  onClick={() => {
                    if (t.key === 'true_false') {
                      setQForm(f => ({ ...f, question_type: 'true_false', option_a: 'صح', option_b: 'خطأ', option_c: '', option_d: '', correct_answer_letter: 'A', sub_questions: [] }));
                    } else if (t.key === 'image_multi') {
                      setQForm(f => ({ ...f, question_type: 'image_multi', option_a: 'A', option_b: 'B', option_c: 'C', option_d: 'D', correct_answer_letter: 'A', sub_questions: f.sub_questions || [] }));
                    } else {
                      setQForm(f => ({ ...f, question_type: 'mcq', option_a: f.option_a === 'صح' ? '' : f.option_a, option_b: f.option_b === 'خطأ' ? '' : f.option_b, correct_answer_letter: 'A', sub_questions: [] }));
                    }
                  }}
                  className={`py-2 rounded-xl text-sm font-bold transition-colors ${qForm.question_type === t.key ? 'bg-purple-500 text-white' : dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-gray-100 text-gray-600'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Question text */}
            <textarea value={qForm.question_text} onChange={e => setQForm(f => ({ ...f, question_text: e.target.value }))}
              placeholder={isImgMulti ? 'تعليمات / وصف (اختياري)' : 'نص السؤال *'}
              rows={2}
              className={`w-full rounded-xl px-3 py-2.5 border text-sm resize-none ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'}`} />

            {/* Image upload (all types) */}
            <div>
              <input ref={imgInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              {qForm.question_image_url ? (
                <div className="relative rounded-xl overflow-hidden border">
                  <img src={qForm.question_image_url} alt="question" className="w-full max-h-48 object-contain" />
                  <div className="absolute top-2 left-2 flex gap-1.5">
                    <button onClick={() => imgInputRef.current?.click()}
                      className="px-2.5 py-1.5 bg-white/95 text-gray-700 text-xs rounded-lg font-bold shadow-sm hover:bg-white flex items-center gap-1">
                      <Upload className="w-3 h-3" /> تغيير
                    </button>
                    <button onClick={() => setQForm(f => ({ ...f, question_image_url: '' }))}
                      className="px-2.5 py-1.5 bg-red-500/90 text-white text-xs rounded-lg font-bold shadow-sm hover:bg-red-500">
                      حذف
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => imgInputRef.current?.click()} disabled={imgUploading}
                  className={`w-full border-2 border-dashed rounded-xl py-3.5 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${dark ? 'border-[var(--dk-border)] text-[var(--dk-text-2)] hover:border-purple-400 hover:text-purple-400' : 'border-gray-200 text-gray-400 hover:border-purple-300 hover:text-purple-500'}`}>
                  {imgUploading ? <><RefreshCw className="w-4 h-4 animate-spin" />جاري الرفع...</> : <><ImageIcon className="w-4 h-4" />إضافة صورة (اختياري)</>}
                </button>
              )}
            </div>

            {/* MCQ options */}
            {!isImgMulti && !tf && (
              <div className="grid grid-cols-2 gap-2">
                {['A','B','C','D'].map((letter, i) => (
                  <div key={letter} className="relative">
                    <input
                      value={[qForm.option_a, qForm.option_b, qForm.option_c, qForm.option_d][i]}
                      onChange={e => { const keys = ['option_a','option_b','option_c','option_d']; setQForm(f => ({ ...f, [keys[i]]: e.target.value })); }}
                      placeholder={`الخيار ${letter}${i >= 2 ? ' (اختياري)' : ''}`}
                      className={`w-full rounded-xl px-3 py-2 pr-8 border text-sm ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'}`} />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-black text-purple-500">{letter}</span>
                  </div>
                ))}
              </div>
            )}

            {/* image_multi: count-based auto-generate sub-questions */}
            {isImgMulti && (
              <div className={`rounded-xl p-3 border space-y-3 ${dark ? 'border-[var(--dk-border)]' : 'border-purple-100 bg-purple-50/40'}`}>
                <p className={`text-xs font-black ${dark ? 'text-purple-400' : 'text-purple-600'}`}>الأسئلة الفرعية — اختر الإجابة الصحيحة لكل بند</p>

                {/* Count + Generate */}
                <div className="flex items-center gap-2">
                  <input type="number" min="1" max="50"
                    value={imgMultiCount}
                    onChange={e => setImgMultiCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                    className={`w-20 rounded-xl px-3 py-2 border text-sm text-center ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-purple-200'}`} />
                  <button type="button"
                    onClick={() => {
                      const count = Math.max(1, Math.min(50, parseInt(imgMultiCount) || 1));
                      setQForm(f => ({
                        ...f,
                        option_a: 'A', option_b: 'B', option_c: 'C', option_d: 'D',
                        sub_questions: Array.from({ length: count }, (_, i) => ({
                          label: String(i + 1),
                          correct: (f.sub_questions?.[i]?.correct) || 'A',
                        })),
                      }));
                    }}
                    className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl text-sm font-bold flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5" /> توليد
                  </button>
                  {(qForm.sub_questions || []).length > 0 && (
                    <span className={`text-xs font-semibold ${dark ? 'text-[var(--dk-text-2)]' : 'text-purple-600'}`}>
                      {(qForm.sub_questions || []).length} سؤال
                    </span>
                  )}
                </div>

                {/* Generated rows — click A/B/C/D to set correct answer */}
                {(qForm.sub_questions || []).length > 0 && (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {(qForm.sub_questions || []).map((sub, i) => (
                      <div key={i} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${dark ? 'bg-[var(--dk-elevated)]' : 'bg-white border border-purple-100'}`}>
                        <span className={`w-7 text-center text-xs font-black flex-shrink-0 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>{sub.label}</span>
                        <div className="flex gap-1 flex-1">
                          {['A','B','C','D'].map(letter => (
                            <button key={letter} type="button"
                              onClick={() => setQForm(f => ({
                                ...f,
                                sub_questions: (f.sub_questions || []).map((s, j) =>
                                  j === i ? { ...s, correct: letter } : s
                                ),
                              }))}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                sub.correct === letter
                                  ? 'bg-purple-500 text-white border-purple-500 shadow-sm'
                                  : dark
                                    ? 'bg-[var(--dk-surface)] border-[var(--dk-border)] text-[var(--dk-text-2)] hover:border-purple-400'
                                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-purple-300 hover:bg-purple-50'
                              }`}>
                              {letter}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Correct answer + points */}
            <div className="flex items-end gap-3">
              {!isImgMulti && (
                <div>
                  <label className={`block text-xs font-bold mb-1 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>الإجابة الصحيحة</label>
                  {tf ? (
                    <select value={qForm.correct_answer_letter} onChange={e => setQForm(f => ({ ...f, correct_answer_letter: e.target.value }))}
                      className={`rounded-xl px-3 py-2 border text-sm ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'}`}>
                      <option value="A">صح (A)</option>
                      <option value="B">خطأ (B)</option>
                    </select>
                  ) : (
                    <select value={qForm.correct_answer_letter} onChange={e => setQForm(f => ({ ...f, correct_answer_letter: e.target.value }))}
                      className={`rounded-xl px-3 py-2 border text-sm ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'}`}>
                      {['A','B','C','D'].map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  )}
                </div>
              )}
              <div>
                <label className={`block text-xs font-bold mb-1 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
                  {isImgMulti ? 'الدرجة الكلية (توزع على الفروع)' : 'الدرجة'}
                </label>
                <input type="number" min="1" value={qForm.points} onChange={e => setQForm(f => ({ ...f, points: parseInt(e.target.value) || 1 }))}
                  className={`w-20 rounded-xl px-3 py-2 border text-sm ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'}`} />
              </div>
              <button onClick={() => addQMut.mutate(qForm)} disabled={addQMut.isPending || !canSubmit()}
                className="flex items-center gap-1.5 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-bold">
                {addQMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {editQId ? 'حفظ' : 'إضافة'}
              </button>
              {editQId && (
                <button onClick={() => { setEditQId(null); setQForm(emptyQ); }}
                  className={`px-4 py-2 rounded-xl text-sm font-bold ${dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-gray-100 text-gray-500'}`}>
                  إلغاء
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Questions list */}
      {questions.length === 0 ? (
        <div className={`${cardCls} text-center py-8`}>
          <FileText className={`w-10 h-10 mx-auto mb-2 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-300'}`} />
          <p className={`text-sm ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>لا توجد أسئلة بعد</p>
        </div>
      ) : questions.map((q, idx) => (
        <div key={q.id} className={cardCls}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-black flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  q.question_type === 'mcq' ? 'bg-blue-100 text-blue-700' :
                  q.question_type === 'image_multi' ? 'bg-orange-100 text-orange-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {q.question_type === 'mcq' ? 'MCQ' : q.question_type === 'image_multi' ? '🖼 صورة' : 'صح/خطأ'}
                </span>
                <span className={`text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>{q.points} درجة</span>
              </div>

              {q.question_image_url && (
                <img src={q.question_image_url} alt="question" className="w-full max-h-32 object-contain rounded-xl border mb-2" />
              )}
              {q.question_text && (
                <p className={`text-sm font-semibold mb-2 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{q.question_text}</p>
              )}

              {q.question_type === 'image_multi' ? (
                <div>
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {[['A', q.option_a],['B', q.option_b],['C', q.option_c],['D', q.option_d]].filter(([,v]) => v).map(([l, v]) => (
                      <span key={l} className={`text-xs px-2 py-0.5 rounded-lg ${dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-gray-100 text-gray-600'}`}>{l}: {v}</span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(q.sub_questions || []).map(sub => (
                      <span key={sub.label} className="text-xs px-2 py-1 rounded-lg bg-purple-100 text-purple-700 font-bold">
                        {sub.label} → {sub.correct}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {[['A', q.option_a],['B', q.option_b],['C', q.option_c],['D', q.option_d]].filter(([,v]) => v).map(([letter, val]) => (
                    <span key={letter} className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${
                      q.correct_answer_letter === letter
                        ? 'bg-green-100 text-green-700 ring-1 ring-green-400'
                        : dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {letter}: {val}{q.correct_answer_letter === letter && ' ✓'}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {!rec.is_published && (
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => {
                  setEditQId(q.id);
                  setQForm({ question_text: q.question_text || '', question_image_url: q.question_image_url || '', question_type: q.question_type, option_a: q.option_a || '', option_b: q.option_b || '', option_c: q.option_c || '', option_d: q.option_d || '', correct_answer_letter: q.correct_answer_letter, points: q.points, sub_questions: q.sub_questions || [] });
                }}
                  className={`p-1.5 rounded-lg transition-colors ${dark ? 'text-[var(--dk-text-2)] hover:bg-[var(--dk-elevated)]' : 'text-gray-400 hover:bg-gray-100'}`}>
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => deleteQMut.mutate(q.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ResultsPanel({ results, rec, dark, cardCls, navigate, baseRole = 'teacher' }) {
  if (results.length === 0)
    return (
      <div className={`${cardCls} text-center py-8`}>
        <Users className={`w-10 h-10 mx-auto mb-2 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-300'}`} />
        <p className={`text-sm ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>لا توجد نتائج بعد</p>
      </div>
    );

  const avg = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
  const passed = results.filter(r => r.passed).length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'شاركوا', value: results.length, color: 'purple' },
          { label: 'متوسط الدرجة', value: `${avg}/${rec.total_score}`, color: 'blue' },
          { label: 'نسبة النجاح', value: `${Math.round(passed/results.length*100)}%`, color: 'green' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-xl p-3 text-center ${dark ? 'bg-[var(--dk-elevated)]' : `bg-${color}-50`}`}>
            <div className={`text-xl font-black text-${color}-600`}>{value}</div>
            <div className={`text-xs mt-0.5 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>{label}</div>
          </div>
        ))}
      </div>
      {results.map(r => (
        <div key={r.id} className={`${cardCls} flex items-center justify-between gap-3`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white ${r.passed ? 'bg-green-500' : 'bg-red-400'}`}>
              {r.student_name?.charAt(0)}
            </div>
            <div>
              <p className={`font-bold text-sm ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{r.student_name}</p>
              <p className={`text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
                {r.academic_stage} · {new Date(r.created_at).toLocaleDateString('ar-EG')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-left">
              <span className={`font-black text-lg ${r.passed ? 'text-green-600' : 'text-red-500'}`}>
                {r.score}/{rec.total_score}
              </span>
              <p className={`text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
                {r.correct_count}✓ {r.wrong_count}✗
              </p>
            </div>
            {navigate && (
              <button onClick={() => navigate(`/${baseRole}/recitation-review/${r.id}`)}
                className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-colors flex-shrink-0"
                title="مراجعة مفصّلة">
                <Eye className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function AnalyticsTab({ analytics, dark, cardCls }) {
  if (!analytics) return (
    <div className="text-center py-16">
      <RefreshCw className={`w-8 h-8 mx-auto animate-spin mb-3 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-300'}`} />
    </div>
  );

  const { summary, by_stage, top_students, recent_recitations } = analytics;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: 'إجمالي التسميعات', value: summary.total_recitations, icon: BookOpen, color: 'purple' },
          { label: 'إجمالي النتائج', value: summary.total_results, icon: FileText, color: 'blue' },
          { label: 'متوسط الدرجات', value: `${summary.avg_score}%`, icon: BarChart2, color: 'green' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className={cardCls}>
            <div className={`w-10 h-10 rounded-xl bg-${color}-100 flex items-center justify-center mb-3`}>
              <Icon className={`w-5 h-5 text-${color}-600`} />
            </div>
            <div className={`text-2xl font-black ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{value}</div>
            <div className={`text-sm mt-1 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By stage */}
        <div className={cardCls}>
          <h3 className={`font-black mb-4 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>أداء كل مرحلة دراسية</h3>
          {by_stage.length === 0 ? (
            <p className={`text-sm ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>لا بيانات بعد</p>
          ) : by_stage.map(s => (
            <div key={s.stage} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: dark ? 'var(--dk-border)' : '#f1f5f9' }}>
              <span className={`text-sm font-semibold ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{s.stage}</span>
              <div className={`text-xs flex items-center gap-3 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
                <span><Users className="w-3 h-3 inline ml-1" />{s.participants}</span>
                <span className="font-black text-purple-600">{s.avg_score}%</span>
              </div>
            </div>
          ))}
        </div>

        {/* Top students */}
        <div className={cardCls}>
          <h3 className={`font-black mb-4 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>الطلاب الأكثر انتظاماً 🔥</h3>
          {top_students.length === 0 ? (
            <p className={`text-sm ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>لا بيانات بعد</p>
          ) : top_students.slice(0, 8).map((s, i) => (
            <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: dark ? 'var(--dk-border)' : '#f1f5f9' }}>
              <div className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full text-xs font-black flex items-center justify-center ${i < 3 ? 'bg-amber-100 text-amber-700' : dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-gray-100 text-gray-500'}`}>{i + 1}</span>
                <div>
                  <p className={`text-sm font-bold ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{s.name}</p>
                  <p className={`text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>{s.academic_stage}</p>
                </div>
              </div>
              <div className={`text-xs flex items-center gap-2 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
                <span className="flex items-center gap-0.5 text-orange-500 font-black"><Flame className="w-3 h-3" />{s.current_streak}</span>
                <span>{s.total_completed} تسميع</span>
                <span className="font-black text-purple-600">{s.avg_score}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
