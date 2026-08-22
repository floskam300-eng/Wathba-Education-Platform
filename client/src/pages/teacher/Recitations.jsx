import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BookOpen, Plus, Trash2, Settings, ChevronDown, ChevronUp,
  CheckCircle, XCircle, Clock, Users, BarChart2, Edit3,
  AlertCircle, Eye, FileText, RefreshCw, Flame, Image as ImageIcon, Upload, ZoomIn,
  Gift, X, Loader2, Search
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { withToken } from '../../lib/mediaAccess';
import useUrlState from '../../hooks/useUrlState';
import { fmtDateLocal, toUTCDate, getServerNow, formatEgyptDateTime, parseEgyptDateTimeToUTC } from '../../lib/dateUtils';
import MathText from '../../components/MathText';
import RichTextPalette, { CompactOptionFormatter } from '../../components/RichTextPalette';
import RecitationReviewModal from '../../components/ui/RecitationReviewModal';

const PG_STAGES = [
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
  'الصف الأول الثانوي بكالوريا',
  'الصف الثاني الثانوي عام',
  'الصف الثاني الثانوي بكالوريا',
  'الصف الثالث الثانوي',
];

const SCHED_LABELS = { once: 'مرة واحدة', daily: 'يومي', weekly: 'أسبوعي' };
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function getStatus(rec) {
  const now = getServerNow();
  if (!rec.is_published) return { label: 'مسودة', color: 'gray', icon: Edit3 };
  const sDate = toUTCDate(rec.start_date);
  const eDate = toUTCDate(rec.end_date);
  if (sDate && sDate > now) return { label: 'قادم', color: 'blue', icon: Clock };
  if (eDate && eDate < now) return { label: 'منتهي', color: 'red', icon: XCircle };
  return { label: 'مفتوح', color: 'green', icon: CheckCircle };
}

function validateRecitationForm(f) {
  const errors = {};
  if (!f.title || !f.title.trim()) errors.title = 'عنوان التسميع مطلوب';
  const dur = parseInt(f.duration_minutes, 10);
  if (isNaN(dur) || dur < 1 || dur > 60) errors.duration_minutes = 'المدة يجب أن تكون بين 1 و60 دقيقة';
  const tot = parseInt(f.total_score, 10);
  if (isNaN(tot) || tot < 1) errors.total_score = 'الدرجة الكلية يجب أن تكون 1 على الأقل';
  const pass = parseInt(f.pass_score, 10);
  if (isNaN(pass) || pass < 0) errors.pass_score = 'درجة النجاح غير صالحة';
  if (!isNaN(tot) && !isNaN(pass) && pass > tot) errors.pass_score = 'درجة النجاح لا يمكن أن تتجاوز الدرجة الكلية';

  if (f.end_date) {
    const eDate = new Date(f.end_date);
    if (isNaN(eDate.getTime())) {
      errors.end_date = 'تاريخ الانتهاء غير صالح';
    } else if (eDate.getTime() <= Date.now()) {
      errors.end_date = 'تاريخ الانتهاء يجب أن يكون في المستقبل ولا يمكن تحديد موعد قد فات';
    }
  }

  if (f.start_date && f.end_date) {
    const sDate = new Date(f.start_date);
    const eDate = new Date(f.end_date);
    if (!isNaN(sDate.getTime()) && !isNaN(eDate.getTime()) && eDate <= sDate) {
      errors.end_date = 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية';
    }
  }

  return errors;
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
  course_id: '', section_id: '',
  allow_retry: true,
  max_retry_attempts: '',
};

const emptyQ = { question_text: '', question_image_url: '', question_type: 'mcq', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer_letter: 'A', points: 1, sub_questions: [] };

const PARTICIPANT_PAGE_SIZE = 50;

function useDebouncedValue(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

function useRecitationParticipants(recitationId, search, refetchInterval = 15000) {
  const debouncedSearch = useDebouncedValue(search);

  return useInfiniteQuery({
    queryKey: ['recitation-participants', recitationId, debouncedSearch],
    queryFn: ({ pageParam = 1 }) => api.get(`/recitations/${recitationId}/participants`, {
      params: {
        page: pageParam,
        limit: PARTICIPANT_PAGE_SIZE,
        ...(debouncedSearch.trim() ? { q: debouncedSearch.trim() } : {}),
      },
    }).then(r => r.data),
    enabled: !!recitationId,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.page * lastPage.limit;
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
    refetchInterval: recitationId ? refetchInterval : false,
    refetchIntervalInBackground: false,
  });
}

function useLoadMoreOnIntersect({ hasNextPage, isFetchingNextPage, fetchNextPage, rootRef = null }) {
  const sentinelRef = useRef(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage || isFetchingNextPage) return undefined;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage();
    }, { root: rootRef?.current || null, rootMargin: '300px' });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, rootRef]);

  return sentinelRef;
}

export default function Recitations() {
  const { dark } = useTheme();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const { user } = useAuth();
  const baseRole = user?.role === 'assistant' ? 'assistant' : 'teacher';

  const toUTCIso = (localStr) => {
    if (!localStr) return null;
    const d = new Date(localStr);
    return isNaN(d.getTime()) ? null : d.toISOString();
  };

  const [tab, setTab] = useUrlState('tab', 'list');
  const [modal, setModal] = useState(false);
  const [editRec, setEditRec] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [search, setSearch] = useUrlState('q', '');
  const [stageFilter, setStageFilter] = useUrlState('stage', '');
  // [retake-grant] Modal showing every student who took the selected recitation
  // with a "grant retake" button next to each name.
  const [grantModalRecId, setGrantModalRecId] = useState(null);

  const { data: recitations = [], isLoading } = useQuery({
    queryKey: ['recitations'],
    queryFn: () => api.get('/recitations').then(r => r.data),
  });

  const { data: courses = [] } = useQuery({
    queryKey: ['teacher-courses-list'],
    queryFn: () => api.get('/courses').then(r => r.data),
  });

  const availableFilterStages = useMemo(() => {
    const set = new Set(recitations.map(r => r.academic_stage).filter(Boolean));
    return Array.from(set);
  }, [recitations]);

  const filteredCourses = useMemo(() => {
    if (!form.academic_stage) return courses;
    return courses.filter(c => !c.target_stage || c.target_stage === form.academic_stage);
  }, [courses, form.academic_stage]);

  // [Phase-7] Fetch the sections of the currently selected course so the
  // teacher can pick which section this recitation "gates" (unlocks when passed).
  const { data: courseSections = [] } = useQuery({
    queryKey: ['course-sections-for-rec', form.course_id],
    queryFn: () => form.course_id
      ? api.get(`/courses/${form.course_id}/content`).then(r => r.data.sections || [])
      : Promise.resolve([]),
    enabled: !!form.course_id,
  });

  const { data: analytics } = useQuery({
    queryKey: ['recitations-analytics'],
    queryFn: () => api.get('/recitations/analytics').then(r => r.data),
    enabled: tab === 'analytics',
  });

  const createMut = useMutation({
    mutationFn: (d) => editRec ? api.put(`/recitations/${editRec.id}`, d) : api.post('/recitations', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recitations'] });
      toast.success(editRec ? 'تم تحديث التسميع' : 'تم إنشاء التسميع');
      setModal(false); setEditRec(null); setForm(emptyForm); setFormErrors({});
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/recitations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recitations'] });
      toast.success('تم حذف التسميع');
      if (selectedId === deleteId) setSelectedId(null);
      setDeleteId(null);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const publishMut = useMutation({
    mutationFn: (id) => api.put(`/recitations/${id}/publish`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recitations'] }); toast.success('تم تحديث حالة النشر'); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  // [retake-grant] Shared mutation used by both the modal AND the right-side
  // ResultsPanel so a single request triggers consistent cache invalidation
  // and toast feedback regardless of which surface issued it.
  const grantMut = useMutation({
    mutationFn: ({ recitation_id, student_id, note }) =>
      api.post(`/recitations/${recitation_id}/grant-retake`, { student_id, note }),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ['recitations'] });
      qc.invalidateQueries({ queryKey: ['recitation-participants', vars.recitation_id] });
      qc.invalidateQueries({ queryKey: ['recitation-retake-grants', vars.recitation_id] });
      toast.success('تم منح محاولة إضافية للطالب 🎁');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ أثناء المنح'),
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
      start_date: fmtDateLocal(rec.start_date),
      end_date: fmtDateLocal(rec.end_date),
      shuffle_questions: rec.shuffle_questions,
      shuffle_options: rec.shuffle_options,
      course_id: rec.course_id ? String(rec.course_id) : '',
      section_id: rec.section_id ? String(rec.section_id) : '',
      allow_retry: rec.allow_retry !== false,
      max_retry_attempts: rec.max_retry_attempts != null ? String(rec.max_retry_attempts) : '',
    });
    setFormErrors({});
    setModal(true);
  };

  // [B6] Auto-open the edit modal when navigated here with ?edit=<id>.
  // CourseContent passes the recitation ID via URL when the teacher clicks
  // the "open" (pencil) icon next to a recitation in the content manager.
  useEffect(() => {
    if (!recitations.length) return;
    const editId = parseInt(searchParams.get('edit'), 10);
    if (!editId) return;
    const target = recitations.find(r => r.id === editId);
    if (target) {
      openEdit(target);
      // Strip the ?edit= param so it doesn't re-trigger on every refetch.
      const next = new URLSearchParams(searchParams);
      next.delete('edit');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recitations, searchParams]);

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
            <div className="flex flex-col sm:flex-row gap-2">
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="بحث عن تسميع..."
                className={`flex-1 rounded-xl px-3 py-2 text-sm border transition-colors ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)] placeholder-[var(--dk-text-2)]' : 'bg-white border-gray-200 text-gray-800'}`} />
              <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
                className={`rounded-xl px-3 py-2 text-sm border sm:max-w-[160px] ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'}`}>
                <option value="">كل المراحل</option>
                {availableFilterStages.map(s => <option key={s} value={s}>{s}</option>)}
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
                    onClick={() => setSelectedId(rec.id)}
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
                          {/* [L2-FIX] Show indicator when recitation is linked to a course as a gatekeeper */}
                          {rec.course_id && (
                            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold flex items-center gap-0.5">
                              🔗 مرتبط بكورس
                            </span>
                          )}
                        </div>
                        <h3 className={`font-bold text-sm truncate ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{rec.title}</h3>
                        <div className={`flex items-center gap-3 mt-1 text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
                          <span><FileText className="w-3 h-3 inline ml-1" />{rec.question_count} سؤال</span>
                          <span><Users className="w-3 h-3 inline ml-1" />{rec.result_count} نتيجة</span>
                          <span><Clock className="w-3 h-3 inline ml-1" />{rec.duration_minutes} د</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={e => { e.stopPropagation(); navigate(`/${baseRole}/recitations/${rec.id}/questions`); }}
                          title="إدارة الأسئلة"
                          className={`p-1.5 rounded-lg transition-colors ${dark ? 'text-purple-400 hover:bg-[var(--dk-elevated)]' : 'text-purple-500 hover:bg-purple-50'}`}>
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                        {/* [retake-grant] Opens the modal that lists every student
                            who took this recitation with a per-student grant button. */}
                        <button onClick={e => { e.stopPropagation(); setGrantModalRecId(rec.id); }}
                          title="منح محاولة إضافية لطالب"
                          className={`p-1.5 rounded-lg transition-colors ${dark ? 'text-emerald-400 hover:bg-[var(--dk-elevated)]' : 'text-emerald-500 hover:bg-emerald-50'}`}>
                          <Gift className="w-3.5 h-3.5" />
                        </button>
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
                <ResultsPanel key={selectedRec.id} rec={selectedRec} dark={dark} cardCls={cardCls} navigate={navigate} baseRole={baseRole} grantMut={grantMut} />
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
                <input value={form.title} onChange={e => {
                  setForm(f => ({ ...f, title: e.target.value }));
                  if (formErrors.title) setFormErrors(prev => { const n = { ...prev }; delete n.title; return n; });
                }}
                  placeholder="مثال: تسميع الأحكام النحوية"
                  className={`w-full rounded-xl px-3 py-2.5 border text-sm transition-colors ${
                    formErrors.title
                      ? 'border-red-500 bg-red-50/10'
                      : dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'
                  }`} />
                {formErrors.title && <p className="text-xs text-red-500 font-bold mt-1">{formErrors.title}</p>}
              </div>

              <div>
                <label className={`block text-sm font-bold mb-1 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>وصف (اختياري)</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} placeholder="وصف مختصر..."
                  className={`w-full rounded-xl px-3 py-2.5 border text-sm resize-none ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'}`} />
              </div>

              {/* Target Stage + Course + Video linking */}
              <div className={`rounded-2xl border p-4 space-y-3 ${dark ? 'border-[var(--dk-border)] bg-[var(--dk-elevated)]' : 'border-purple-100 bg-purple-50/40'}`}>
                <p className={`text-xs font-black uppercase tracking-wide ${dark ? 'text-purple-400' : 'text-purple-600'}`}>🎯 النطاق الموجه له التسميع والربط الكورسي</p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-xs font-bold mb-1 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-600'}`}>السنة الدراسية / المرحلة</label>
                    <select
                      value={form.academic_stage}
                      onChange={e => {
                        const newStage = e.target.value;
                        setForm(f => {
                          const selectedCourse = courses.find(c => String(c.id) === String(f.course_id));
                          const isCourseValid = !newStage || !selectedCourse || !selectedCourse.target_stage || selectedCourse.target_stage === newStage;
                          return {
                            ...f,
                            academic_stage: newStage,
                            course_id: isCourseValid ? f.course_id : '',
                            section_id: isCourseValid ? f.section_id : '',
                          };
                        });
                      }}
                      className={`w-full rounded-xl px-3 py-2 border text-sm ${dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'}`}
                    >
                      <option value="">كل المراحل الدراسية</option>
                      {PG_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className={`block text-xs font-bold mb-1 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-600'}`}>الكورس (اختياري)</label>
                    <select
                      value={form.course_id}
                      onChange={e => {
                        const selectedCourseId = e.target.value;
                        const selectedCourse = courses.find(c => String(c.id) === String(selectedCourseId));
                        setForm(f => ({
                          ...f,
                          course_id: selectedCourseId,
                          section_id: '',
                          academic_stage: selectedCourse?.target_stage || f.academic_stage,
                        }));
                      }}
                      className={`w-full rounded-xl px-3 py-2 border text-sm ${dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'}`}
                    >
                      <option value="">بدون ربط بكورس</option>
                      {filteredCourses.map(c => (
                        <option key={c.id} value={String(c.id)}>
                          {c.name}{c.target_stage ? ` (${c.target_stage})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {form.course_id && (
                  <div>
                    <label className={`block text-xs font-bold mb-1.5 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-600'}`}>
                      الفصل الذي سيفتح عند اجتياز هذا التسميع
                      <span className={`mr-1.5 font-normal text-[11px] ${dark ? 'text-[var(--dk-text-2)]' : 'text-purple-600'}`}>
                        (التسميعات في الفصل الأول عادةً تكون مربوطة بالفصل الثاني)
                      </span>
                    </label>
                    {courseSections.length === 0 ? (
                      <p className={`text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
                        لا توجد فصول في هذا الكورس — أنشئ فصولاً من صفحة "إدارة محتوى الكورس" أولاً.
                      </p>
                    ) : (
                      <select
                        value={form.section_id || ''}
                        onChange={e => setForm(f => ({ ...f, section_id: e.target.value }))}
                        className={`w-full rounded-xl px-3 py-2 border text-sm ${dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'}`}
                      >
                        <option value="">بدون ربط بفصل</option>
                        {courseSections.map(s => (
                          <option key={s.id} value={String(s.id)}>
                            {s.title}{s.id === courseSections[0]?.id ? '  (الفصل الأول — مفتوح تلقائياً)' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    <p className={`text-[11px] mt-2 leading-relaxed ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                      💡 <strong>توضيح:</strong> التسميعات في الفصل N عادةً تربط بالفصل N+1 — اجتيازها يفتح محتوى الفصل التالي (فيديوهاته + ملفاته + تسميعاته).
                    </p>
                  </div>
                )}
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
                  <input type="datetime-local"
                    value={form.start_date}
                    onChange={e => {
                      setForm(f => ({ ...f, start_date: e.target.value }));
                      if (formErrors.start_date || formErrors.end_date) setFormErrors(prev => { const n = { ...prev }; delete n.start_date; delete n.end_date; return n; });
                    }}
                    className={`w-full rounded-xl px-3 py-2.5 border text-sm transition-colors ${
                      formErrors.start_date
                        ? 'border-red-500 bg-red-50/10'
                        : dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'
                    }`} />
                  {formErrors.start_date && <p className="text-xs text-red-500 font-bold mt-1">{formErrors.start_date}</p>}
                </div>
                <div>
                  <label className={`block text-sm font-bold mb-1 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>تاريخ الانتهاء</label>
                  <input type="datetime-local"
                    min={fmtDateLocal(new Date().toISOString())}
                    value={form.end_date}
                    onChange={e => {
                      setForm(f => ({ ...f, end_date: e.target.value }));
                      if (formErrors.end_date) setFormErrors(prev => { const n = { ...prev }; delete n.end_date; return n; });
                    }}
                    className={`w-full rounded-xl px-3 py-2.5 border text-sm transition-colors ${
                      formErrors.end_date
                        ? 'border-red-500 bg-red-50/10'
                        : dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'
                    }`} />
                  {formErrors.end_date && <p className="text-xs text-red-500 font-bold mt-1">{formErrors.end_date}</p>}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={`block text-sm font-bold mb-1 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>المدة (دقائق)</label>
                  <input type="number" min="1" max="60" value={form.duration_minutes}
                    onChange={e => {
                      setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || 10 }));
                      if (formErrors.duration_minutes) setFormErrors(prev => { const n = { ...prev }; delete n.duration_minutes; return n; });
                    }}
                    className={`w-full rounded-xl px-3 py-2.5 border text-sm transition-colors ${
                      formErrors.duration_minutes
                        ? 'border-red-500 bg-red-50/10'
                        : dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'
                    }`} />
                  {formErrors.duration_minutes && <p className="text-xs text-red-500 font-bold mt-1">{formErrors.duration_minutes}</p>}
                </div>
                <div>
                  <label className={`block text-sm font-bold mb-1 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>الدرجة الكلية</label>
                  <input type="number" min="1" value={form.total_score}
                    onChange={e => {
                      setForm(f => ({ ...f, total_score: parseInt(e.target.value) || 10 }));
                      if (formErrors.total_score || formErrors.pass_score) setFormErrors(prev => { const n = { ...prev }; delete n.total_score; delete n.pass_score; return n; });
                    }}
                    className={`w-full rounded-xl px-3 py-2.5 border text-sm transition-colors ${
                      formErrors.total_score
                        ? 'border-red-500 bg-red-50/10'
                        : dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'
                    }`} />
                  {formErrors.total_score && <p className="text-xs text-red-500 font-bold mt-1">{formErrors.total_score}</p>}
                </div>
                <div>
                  <label className={`block text-sm font-bold mb-1 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>درجة النجاح</label>
                  <input type="number" min="0" value={form.pass_score}
                    onChange={e => {
                      setForm(f => ({ ...f, pass_score: parseInt(e.target.value) || 0 }));
                      if (formErrors.pass_score) setFormErrors(prev => { const n = { ...prev }; delete n.pass_score; return n; });
                    }}
                    className={`w-full rounded-xl px-3 py-2.5 border text-sm transition-colors ${
                      formErrors.pass_score
                        ? 'border-red-500 bg-red-50/10'
                        : dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'
                    }`} />
                  {formErrors.pass_score && <p className="text-xs text-red-500 font-bold mt-1">{formErrors.pass_score}</p>}
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

              <button type="button"
                onClick={() => setForm(f => ({ ...f, allow_retry: !f.allow_retry }))}
                className={`flex items-start gap-3 p-3 rounded-2xl border-2 text-right transition-all ${
                  form.allow_retry
                    ? 'border-green-400 bg-green-50 shadow-sm shadow-green-100'
                    : dark ? 'border-[var(--dk-border)] bg-[var(--dk-elevated)] hover:border-purple-400' : 'border-gray-200 bg-white hover:border-gray-300'
                }`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 transition-all ${
                  form.allow_retry ? 'bg-green-500' : dark ? 'bg-gray-700' : 'bg-gray-100'
                }`}>🔄</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <span className={`font-black text-xs sm:text-sm leading-tight ${form.allow_retry ? 'text-green-800' : dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
                      إعادة التسميع
                    </span>
                    <span className={`text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none ${
                      form.allow_retry ? 'bg-green-500 text-white' : dark ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500'
                    }`}>
                      {form.allow_retry ? 'مفعّل' : 'معطّل'}
                    </span>
                  </div>
                  <p className={`text-[10px] sm:text-xs leading-relaxed hidden sm:block ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
                    الطالب يقدر يعيد التسميع بدون إذن
                  </p>
                </div>
              </button>

              {/* Max retry attempts — shown only when allow_retry is enabled */}
              {form.allow_retry && (
                <div className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl border ${dark ? 'border-[var(--dk-border)] bg-[var(--dk-elevated)]' : 'border-green-200 bg-green-50/50'}`}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 bg-green-100">🔢</div>
                  <div className="flex-1 min-w-0">
                    <label className={`block text-xs sm:text-sm font-black mb-0.5 ${dark ? 'text-[var(--dk-text)]' : 'text-green-800'}`}>
                      عدد المحاولات المسموحة
                    </label>
                    <p className={`text-[10px] sm:text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
                      فارغ = غير محدود — مثال: 2 = محاولة أولى + إعادة واحدة
                    </p>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    placeholder="∞"
                    value={form.max_retry_attempts}
                    onChange={e => setForm(f => ({ ...f, max_retry_attempts: e.target.value }))}
                    className={`w-16 text-center rounded-xl px-2 py-1.5 border text-sm font-bold ${dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-green-300 text-navy-700'}`}
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => {
                  const errs = validateRecitationForm(form);
                  if (Object.keys(errs).length > 0) {
                    setFormErrors(errs);
                    toast.error(Object.values(errs)[0]);
                    return;
                  }
                  setFormErrors({});
                  const rawMax = parseInt(form.max_retry_attempts, 10);
                  // [Phase-7] Coerce string <select> values to integers / null
                  // so the backend doesn't reject them with "Invalid section_id".
                  const rawSection = parseInt(form.section_id, 10);
                  const payload = {
                    ...form,
                    course_id: form.course_id ? parseInt(form.course_id, 10) || null : null,
                    section_id: Number.isFinite(rawSection) && rawSection > 0 ? rawSection : null,
                    start_date: parseEgyptDateTimeToUTC(form.start_date),
                    end_date: parseEgyptDateTimeToUTC(form.end_date),
                    max_retry_attempts: form.allow_retry && !isNaN(rawMax) && rawMax >= 1 ? rawMax : null,
                  };
                  createMut.mutate(payload);
                }} disabled={createMut.isPending || !form.title.trim()}
                  className="flex-1 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white py-2.5 rounded-xl font-bold text-sm transition-colors">
                  {createMut.isPending ? 'جاري الحفظ...' : editRec ? 'حفظ التعديلات' : 'إنشاء التسميع'}
                </button>
                <button onClick={() => { setModal(false); setEditRec(null); setForm(emptyForm); setFormErrors({}); }}
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

      {/* Retake-grant modal — lists every student who submitted the recitation
          with a "grant retake" button next to each name. */}
      {grantModalRecId && (
        <RetakeGrantModal
          recitationId={grantModalRecId}
          onClose={() => setGrantModalRecId(null)}
          dark={dark}
        />
      )}
    </div>
  );
}

function QuestionsPanel({ rec, questions, qForm, setQForm, editQId, setEditQId, addQMut, deleteQMut, dark, cardCls }) {
  const [imgUploading, setImgUploading] = useState(false);
  const [imgMultiCount, setImgMultiCount] = useState(5);
  const [imgPreviewBlob, setImgPreviewBlob] = useState(null);
  const imgInputRef = useRef();

  const tf = qForm.question_type === 'true_false';
  const isImgMulti = qForm.question_type === 'image_multi';

  const updateSubQuestions = (newSubs) => {
    const totalPts = newSubs.reduce((sum, s) => sum + (parseInt(s.points) || 1), 0);
    setQForm(f => ({ ...f, sub_questions: newSubs, points: totalPts }));
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const blobUrl = URL.createObjectURL(file);
    setImgPreviewBlob(blobUrl);
    const formData = new FormData();
    formData.append('image', file);
    setImgUploading(true);
    try {
      const { data } = await api.post('/recitations/upload-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setQForm(f => ({ ...f, question_image_url: data.url }));
    } catch (err) {
      URL.revokeObjectURL(blobUrl);
      setImgPreviewBlob(null);
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
            <RichTextPalette
              value={qForm.question_text}
              onChange={v => setQForm(f => ({ ...f, question_text: v }))}
              placeholder={isImgMulti ? 'تعليمات / وصف (اختياري)' : 'نص السؤال * (حدد النص لتنسيقه)'}
              minHeight={60}
              accentColor="purple"
            />

            {/* Image upload (all types) */}
            <div>
              <input ref={imgInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              {qForm.question_image_url ? (
                <div className="relative rounded-xl overflow-hidden border">
                  <img src={imgPreviewBlob || withToken(qForm.question_image_url)} alt="question" className="w-full max-h-48 object-contain" loading="lazy" decoding="async" />
                  <div className="absolute top-2 left-2 flex gap-1.5">
                    <button onClick={() => imgInputRef.current?.click()}
                      className="px-2.5 py-1.5 bg-white/95 text-gray-700 text-xs rounded-lg font-bold shadow-sm hover:bg-white flex items-center gap-1">
                      <Upload className="w-3 h-3" /> تغيير
                    </button>
                    <button onClick={() => { if (imgPreviewBlob) { URL.revokeObjectURL(imgPreviewBlob); setImgPreviewBlob(null); } setQForm(f => ({ ...f, question_image_url: '' })); }}
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
                  <div key={letter} className="flex items-center gap-1.5">
                    <span className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 flex items-center justify-center text-xs font-black flex-shrink-0">{letter}</span>
                    <CompactOptionFormatter
                      value={[qForm.option_a, qForm.option_b, qForm.option_c, qForm.option_d][i]}
                      onChange={v => { const keys = ['option_a','option_b','option_c','option_d']; setQForm(f => ({ ...f, [keys[i]]: v })); }}
                      placeholder={`الخيار ${letter}${i >= 2 ? ' (اختياري)' : ''}`}
                    />
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
                  <input type="number" min={1} max={50}
                    value={imgMultiCount}
                    onChange={e => setImgMultiCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                    className={`w-20 rounded-xl px-3 py-2 border text-sm text-center ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-purple-200'}`} />
                  <button type="button"
                    onClick={() => {
                      const count = Math.max(1, Math.min(50, parseInt(imgMultiCount) || 1));
                      const subs = Array.from({ length: count }, (_, i) => ({
                        label: String(i + 1),
                        correct: 'A',
                        type: 'mcq',
                        points: 1
                      }));
                      updateSubQuestions(subs);
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
                  <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                    {(qForm.sub_questions || []).map((sub, i) => (
                      <div key={i} className={`flex flex-col gap-2 rounded-xl p-3 ${dark ? 'bg-[var(--dk-elevated)]' : 'bg-white border border-purple-100'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-black flex-shrink-0 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>فرع {sub.label}</span>
                          <div className="flex items-center gap-2">
                            <select
                              value={sub.type || 'mcq'}
                              onChange={(e) => {
                                const val = e.target.value;
                                const updated = [...qForm.sub_questions];
                                let correct = sub.correct;
                                if (val === 'true_false' && !['A', 'B'].includes(correct)) {
                                  correct = 'A';
                                }
                                updated[i] = { ...updated[i], type: val, correct };
                                updateSubQuestions(updated);
                              }}
                              className="text-[10px] rounded border border-gray-300 px-1 py-0.5 bg-white text-gray-700 dark:bg-[var(--dk-surface)] dark:text-[var(--dk-text-1)] dark:border-[var(--dk-border)] focus:outline-none"
                            >
                              <option value="mcq">MCQ</option>
                              <option value="true_false">صح/خطأ</option>
                            </select>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-gray-500 dark:text-[var(--dk-text-3)] font-semibold">الدرجة:</span>
                              <input
                                type="number"
                                min={1}
                                value={sub.points !== undefined ? sub.points : 1}
                                onChange={(e) => {
                                  const val = Math.max(1, parseInt(e.target.value) || 1);
                                  const updated = [...qForm.sub_questions];
                                  updated[i] = { ...updated[i], points: val };
                                  updateSubQuestions(updated);
                                }}
                                className="w-10 text-center text-xs rounded border border-gray-300 py-0.5 bg-white dark:bg-[var(--dk-surface)] dark:text-[var(--dk-text-1)] dark:border-[var(--dk-border)] focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {(sub.type === 'true_false' ? ['A', 'B'] : ['A', 'B', 'C', 'D']).map(letter => (
                            <button key={letter} type="button"
                              onClick={() => {
                                const updated = [...qForm.sub_questions];
                                updated[i] = { ...updated[i], correct: letter };
                                updateSubQuestions(updated);
                              }}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                sub.correct === letter
                                  ? 'bg-purple-500 text-white border-purple-500 shadow-sm'
                                  : dark
                                    ? 'bg-[var(--dk-surface)] border-[var(--dk-border)] text-[var(--dk-text-2)] hover:border-purple-400'
                                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-purple-300 hover:bg-purple-50'
                              }`}>
                              {sub.type === 'true_false' ? (letter === 'A' ? 'صح' : 'خطأ') : letter}
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
                  className={`w-20 rounded-xl px-3 py-2 border text-sm ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'}`}
                  disabled={isImgMulti} />
              </div>
              <button onClick={() => { addQMut.mutate(qForm); if (imgPreviewBlob) { URL.revokeObjectURL(imgPreviewBlob); setImgPreviewBlob(null); } }} disabled={addQMut.isPending || !canSubmit()}
                className="flex items-center gap-1.5 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-bold">
                {addQMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {editQId ? 'حفظ' : 'إضافة'}
              </button>
              {editQId && (
                <button onClick={() => { setEditQId(null); setQForm(emptyQ); if (imgPreviewBlob) { URL.revokeObjectURL(imgPreviewBlob); setImgPreviewBlob(null); } }}
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
                <div className="relative mb-2">
                  <img src={withToken(q.question_image_url)} alt="question" className="w-full max-h-32 object-contain rounded-xl border cursor-zoom-in" loading="lazy" decoding="async" onClick={() => window.open(withToken(q.question_image_url), '_blank')} />
                  <button onClick={() => window.open(withToken(q.question_image_url), '_blank')} className="absolute top-1 left-1 bg-black/50 hover:bg-black/70 text-white rounded p-1 transition-colors" title="تكبير">
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {q.question_text && (
                <p className={`text-sm font-semibold mb-2 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
                  <MathText text={q.question_text} />
                </p>
              )}

              {q.question_type === 'image_multi' ? (
                <div>
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {[['A', q.option_a],['B', q.option_b],['C', q.option_c],['D', q.option_d]].filter(([,v]) => v).map(([l, v]) => (
                      <span key={l} className={`text-xs px-2 py-0.5 rounded-lg inline-flex items-center gap-1 ${dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-gray-100 text-gray-600'}`}>
                        <span className="font-black">{l}:</span> <MathText text={v} />
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(q.sub_questions || []).map(sub => (
                      <span key={sub.label} className="text-xs px-2 py-1 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-bold">
                        {sub.label}: {sub.type === 'true_false' ? (sub.correct === 'A' ? 'صح' : 'خطأ') : sub.correct} ({sub.points || 1} د)
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {[['A', q.option_a],['B', q.option_b],['C', q.option_c],['D', q.option_d]].filter(([,v]) => v).map(([letter, val]) => (
                    <span key={letter} className={`text-xs px-2.5 py-1 rounded-lg font-semibold inline-flex items-center gap-1 ${
                      q.correct_answer_letter === letter
                        ? 'bg-green-100 text-green-700 ring-1 ring-green-400 dark:bg-green-900/30 dark:text-green-300'
                        : dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-gray-100 text-gray-600'
                    }`}>
                      <span className="font-black">{letter}:</span> <MathText text={val} />{q.correct_answer_letter === letter && ' ✓'}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {!rec.is_published && (
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => {
                  if (imgPreviewBlob) { URL.revokeObjectURL(imgPreviewBlob); setImgPreviewBlob(null); }
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

function ParticipantAttemptHistory({ recitationId, studentId, rec, dark, onReview, navigate, baseRole }) {
  const { data: attempts = [], isLoading } = useQuery({
    queryKey: ['recitation-participant-attempts', recitationId, studentId],
    queryFn: () => api.get(`/recitations/${recitationId}/participants/${studentId}/attempts`).then(r => r.data),
    enabled: !!recitationId && !!studentId,
  });

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center py-3 text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
        <Loader2 className="w-4 h-4 animate-spin ml-1" /> جار تحميل سجل المحاولات...
      </div>
    );
  }

  if (attempts.length === 0) return null;

  return (
    <div className={`rounded-xl overflow-hidden border ${dark ? 'border-[var(--dk-border)]' : 'border-gray-100'}`}>
      {attempts.map((attempt, idx) => (
        <div key={attempt.id} className={`flex items-center justify-between px-3 py-2 gap-3 ${idx > 0 ? (dark ? 'border-t border-[var(--dk-border)]' : 'border-t border-gray-100') : ''} ${dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-50'}`}>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${attempt.is_absent ? 'bg-gray-100 text-gray-600' : attempt.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {attempt.is_absent ? 'غائب' : `محاولة ${attempts.length - idx}`}
            </span>
            <span className={`text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
              {new Date(attempt.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`font-bold text-sm ${attempt.is_absent ? 'text-gray-400' : attempt.passed ? 'text-green-600' : 'text-red-500'}`}>
              {attempt.score}/{rec.total_score}
            </span>
            <button
              onClick={() => onReview ? onReview(attempt.id) : (navigate && navigate(`/${baseRole}/recitation-review/${attempt.id}`))}
              className="p-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-colors"
              title="مراجعة">
              <Eye className="w-3 h-3" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ResultsPanel({ rec, dark, cardCls, navigate, baseRole = 'teacher', grantMut }) {
  const [expandedStudent, setExpandedStudent] = useState(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [reviewResultId, setReviewResultId] = useState(null);
  const {
    data,
    isLoading,
    isError,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useRecitationParticipants(rec.id, studentSearch);
  const students = useMemo(() => data?.pages?.flatMap(page => page.students || []) || [], [data]);
  const firstPage = data?.pages?.[0];
  const stats = firstPage?.stats || { participated: 0, absent: 0, avg_score: 0, passed_count: 0 };
  const total = firstPage?.total || 0;
  const sentinelRef = useLoadMoreOnIntersect({ hasNextPage, isFetchingNextPage, fetchNextPage });

  const searchInput = (
    <div className="relative">
      <Search className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`} />
      {isFetching && !isFetchingNextPage && (
        <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-500 animate-spin" />
      )}
      <input
        value={studentSearch}
        onChange={e => setStudentSearch(e.target.value)}
        placeholder="بحث باسم الطالب أو الكود أو الهاتف..."
        aria-label="بحث في طلاب التسميع"
        className={`w-full rounded-xl px-3 py-2.5 pr-10 text-sm border transition-colors ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)] placeholder-[var(--dk-text-2)]' : 'bg-white border-gray-200 text-gray-800'}`}
      />
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {searchInput}
        {[...Array(3)].map((_, i) => <div key={i} className={`${cardCls} h-20 animate-pulse`} />)}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-3">
        {searchInput}
        <div className={`${cardCls} text-center py-8`}>
          <AlertCircle className="w-10 h-10 mx-auto mb-2 text-red-400" />
          <p className={`text-sm ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>تعذر تحميل نتائج الطلاب</p>
        </div>
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="space-y-3">
        {searchInput}
        <div className={`${cardCls} text-center py-8`}>
          <Users className={`w-10 h-10 mx-auto mb-2 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-300'}`} />
          <p className={`text-sm ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
            {studentSearch.trim() ? 'لا توجد نتائج مطابقة' : 'لا توجد نتائج بعد'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {searchInput}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'شاركوا', value: stats.participated, color: 'purple' },
          { label: 'متوسط الدرجة', value: stats.participated > 0 ? `${stats.avg_score}/${rec.total_score}` : '-', color: 'blue' },
          { label: 'نسبة النجاح', value: stats.participated > 0 ? `${Math.round(stats.passed_count / stats.participated * 100)}%` : '-', color: 'green' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-xl p-3 text-center ${dark ? 'bg-[var(--dk-elevated)]' : `bg-${color}-50`}`}>
            <div className={`text-xl font-black text-${color}-600`}>{value}</div>
            <div className={`text-xs mt-0.5 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>{label}</div>
          </div>
        ))}
      </div>
      {stats.absent > 0 && (
        <div className={`text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1.5 ${dark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
          <span>⚠️</span> {stats.absent} طالب غائب (مستبعد من الإحصائيات)
        </div>
      )}
      {students.map(r => {
        const attemptCount = parseInt(r.attempt_count, 10) || 1;
        const isExpanded = expandedStudent === r.student_id;
        const hasMultiple = attemptCount > 1;
        const firstScore = parseFloat(r.first_score);
        const latestScore = Number(r.score) || 0;
        const scoreDiff = latestScore - firstScore;
        const unusedGrants = parseInt(r.unused_grants, 10) || 0;
        const isAbsent = r.is_absent === true || r.is_absent === 'true';

        return (
          <div key={r.student_id} className={`${cardCls} space-y-2`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm text-white ${isAbsent ? 'bg-gray-400' : r.passed ? 'bg-green-500' : 'bg-red-400'}`}>
                  {r.student_name?.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`font-bold text-sm ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{r.student_name}</p>
                    {isAbsent && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">غائب</span>
                    )}
                    {hasMultiple && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">
                        {attemptCount} محاولات
                      </span>
                    )}
                    {unusedGrants > 0 && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 inline-flex items-center gap-1"
                            title={`منحت ${unusedGrants} محاولة إضافية لم تستخدم بعد`}>
                        🎁 {unusedGrants > 1 ? `${unusedGrants} منح` : 'منحة'}
                      </span>
                    )}
                  </div>
                  <p className={`text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
                    {r.academic_stage} · {new Date(r.created_at).toLocaleDateString('ar-EG')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="text-left">
                  <span className={`font-black text-lg ${isAbsent ? 'text-gray-400' : r.passed ? 'text-green-600' : 'text-red-500'}`}>
                    {latestScore}/{rec.total_score}
                  </span>
                  {hasMultiple && !isNaN(firstScore) && firstScore !== latestScore && (
                    <p className={`text-[10px] ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
                      الأولى: {firstScore}/{rec.total_score}
                      <span className={`mr-1 font-bold ${scoreDiff > 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {scoreDiff > 0 ? `+${scoreDiff}` : scoreDiff}
                      </span>
                    </p>
                  )}
                  <p className={`text-[10px] ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
                    {r.correct_count}✓ {r.wrong_count}✗
                  </p>
                </div>
                {grantMut && !isAbsent && (
                  <button
                    onClick={() => grantMut.mutate({ recitation_id: rec.id, student_id: r.student_id })}
                    disabled={grantMut.isPending}
                    title={unusedGrants > 0 ? 'منح محاولة إضافية أخرى' : 'منح محاولة إضافية'}
                    className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                      unusedGrants > 0
                        ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                        : (dark ? 'text-[var(--dk-text-2)] hover:bg-[var(--dk-elevated)] hover:text-emerald-400'
                                : 'text-gray-400 hover:bg-emerald-50 hover:text-emerald-600')
                    }`}>
                    <Gift className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => setReviewResultId(r.id)}
                  className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-colors"
                  title="مراجعة مفصّلة">
                  <Eye className="w-4 h-4" />
                </button>
                {hasMultiple && (
                  <button
                    onClick={() => setExpandedStudent(isExpanded ? null : r.student_id)}
                    className={`p-1.5 rounded-lg transition-colors ${dark ? 'hover:bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'hover:bg-gray-100 text-gray-500'}`}
                    title="سجل المحاولات"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>

            {isExpanded && hasMultiple && (
              <ParticipantAttemptHistory
                recitationId={rec.id}
                studentId={r.student_id}
                rec={rec}
                dark={dark}
                onReview={setReviewResultId}
                navigate={navigate}
                baseRole={baseRole}
              />
            )}
          </div>
        );
      })}
      <div ref={sentinelRef} className={`flex items-center justify-center min-h-8 text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
        {isFetchingNextPage && <><Loader2 className="w-4 h-4 animate-spin ml-1" /> جار تحميل المزيد...</>}
        {!hasNextPage && total > PARTICIPANT_PAGE_SIZE && <span>تم تحميل جميع الطلاب المطابقين</span>}
      </div>

      {reviewResultId && (
        <RecitationReviewModal
          resultId={reviewResultId}
          onClose={() => setReviewResultId(null)}
        />
      )}
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
          <h3 className={`font-black mb-4 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>الطلاب الأكثر نشاطاً</h3>
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
                <span>{s.total_completed} تسميع</span>
                <span className="font-black text-purple-600">{s.avg_score}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent recitations performance */}
      {recent_recitations && recent_recitations.length > 0 && (
        <div className={cardCls}>
          <h3 className={`font-black mb-4 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>أداء التسميعات الأخيرة 📊</h3>
          <div className="space-y-2">
            {recent_recitations.map(r => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b last:border-0 gap-2" style={{ borderColor: dark ? 'var(--dk-border)' : '#f1f5f9' }}>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-bold truncate ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{r.title}</p>
                  <p className={`text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>{r.academic_stage || '—'}</p>
                </div>
                <div className="flex items-center gap-3 text-xs flex-shrink-0">
                  <span className={dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}>
                    <Users className="w-3 h-3 inline ml-0.5" />{r.participant_count}
                  </span>
                  <span className="font-black text-green-600">نجاح {r.pass_rate}%</span>
                  <span className="font-black text-purple-600">متوسط {r.avg_score}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── [retake-grant] Modal listing every student who submitted a recitation ──
// Each row has a "منح محاولة إضافية" button next to the student's name and an
// inline confirm step to prevent accidental grants. Successful grants show a
// green confirmation row that disappears after a few seconds.
function RetakeGrantModal({ recitationId, onClose, dark }) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [confirmId, setConfirmId] = useState(null);
  const [successIds, setSuccessIds] = useState(new Set());
  const [studentSearch, setStudentSearch] = useState('');
  const listRef = useRef(null);
  const {
    data,
    isLoading,
    isError,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useRecitationParticipants(recitationId, studentSearch, 10000);
  const students = useMemo(() => data?.pages?.flatMap(page => page.students || []) || [], [data]);
  const firstPage = data?.pages?.[0];
  const total = firstPage?.total || 0;
  const activeGrants = firstPage?.stats?.active_grants || 0;
  const sentinelRef = useLoadMoreOnIntersect({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    rootRef: listRef,
  });

  const grantMut = useMutation({
    mutationFn: ({ student_id, note }) =>
      api.post(`/recitations/${recitationId}/grant-retake`, { student_id, note: note || null }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['recitations'] });
      qc.invalidateQueries({ queryKey: ['recitation-participants', recitationId] });
      setConfirmId(null);
      setNote('');
      setSuccessIds(prev => new Set(prev).add(vars.student_id));
      toast.success('تم منح محاولة إضافية 🎁');
      setTimeout(() => {
        setSuccessIds(prev => {
          const n = new Set(prev);
          n.delete(vars.student_id);
          return n;
        });
      }, 3500);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ أثناء المنح'),
  });

  const overlay = dark ? 'bg-black/70' : 'bg-black/50';
  const surface = dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border)]' : 'bg-white border-gray-100';
  const elev = dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-50';
  const textPrimary = dark ? 'text-[var(--dk-text)]' : 'text-navy-700';
  const textSec = dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500';
  const inputCls = dark
    ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)] placeholder-gray-500'
    : 'bg-white border-gray-200 text-gray-800';
  const searchCls = dark
    ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)] placeholder-[var(--dk-text-2)]'
    : 'bg-white border-gray-200 text-gray-800';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className={`${overlay} absolute inset-0`} onClick={onClose} />
      <div className={`relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl shadow-2xl border ${surface}`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${dark ? 'border-[var(--dk-border)]' : 'border-gray-100'}`}>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Gift className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className={`font-black text-base ${textPrimary}`}>منح محاولة إضافية</h3>
              <p className={`text-xs ${textSec}`}>
                اختر طالباً لمنحه محاولة إضافية — حتى لو التسميع مغلق أو استنفد الطالب محاولاته
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className={`p-2 rounded-xl ${dark ? 'hover:bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'hover:bg-gray-100 text-gray-400'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Optional note (applies to the next grant; reset after each successful submit) */}
        <div className={`px-5 py-3 border-b ${dark ? 'border-[var(--dk-border)]' : 'border-gray-100'}`}>
          <label className={`block text-[11px] font-bold mb-1 ${textSec}`}>ملاحظة (اختياري — تُحفظ مع المنحة)</label>
          <input
            value={note}
            onChange={e => setNote(e.target.value.slice(0, 500))}
            placeholder="مثال: مشكلة تقنية، إعادة بسبب خطأ في السؤال…"
            className={`w-full rounded-xl px-3 py-2 text-sm border ${inputCls}`}
          />
        </div>

        {/* Search only the students returned by this recitation. */}
        <div className={`px-5 py-3 border-b ${dark ? 'border-[var(--dk-border)]' : 'border-gray-100'}`}>
          <div className="relative">
            <Search className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 ${textSec}`} />
            {isFetching && !isFetchingNextPage && (
              <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500 animate-spin" />
            )}
            <input
              value={studentSearch}
              onChange={e => setStudentSearch(e.target.value)}
              placeholder="بحث باسم الطالب أو الكود أو الهاتف..."
              aria-label="بحث في طلاب التسميع لمنح محاولة إضافية"
              className={`w-full rounded-xl px-3 py-2 text-sm border pr-10 ${searchCls}`}
            />
          </div>
        </div>

        {/* Student list */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className={`w-6 h-6 animate-spin ${textSec}`} />
            </div>
          ) : isError ? (
            <div className="text-center py-12">
              <AlertCircle className="w-10 h-10 mx-auto mb-2 text-red-400" />
              <p className={`text-sm ${textSec}`}>تعذر تحميل قائمة الطلاب</p>
            </div>
          ) : students.length === 0 ? (
            <div className="text-center py-12">
              <Users className={`w-10 h-10 mx-auto mb-2 ${textSec}`} />
              <p className={`text-sm ${textSec}`}>
                {studentSearch.trim() ? 'لا توجد نتائج مطابقة' : 'لا يوجد طلاب سلّموا هذا التسميع بعد'}
              </p>
            </div>
          ) : students.map(r => {
            const attemptCount = parseInt(r.attempt_count, 10) || 1;
            const isAbsent = r.is_absent === true || r.is_absent === 'true';
            const unusedGrants = parseInt(r.unused_grants, 10) || 0;
            const isConfirming = confirmId === r.student_id;
            const justSucceeded = successIds.has(r.student_id);

            return (
              <div key={r.student_id}
                className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 border ${elev} ${dark ? 'border-[var(--dk-border)]' : 'border-gray-100'}`}>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm text-white ${isAbsent ? 'bg-gray-400' : r.passed ? 'bg-green-500' : 'bg-red-400'}`}>
                    {r.student_name?.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-bold text-sm truncate ${textPrimary}`}>{r.student_name}</p>
                      {isAbsent && (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-700">غائب</span>
                      )}
                      {attemptCount > 1 && (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">
                          {attemptCount} محاولات
                        </span>
                      )}
                      {unusedGrants > 0 && (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          🎁 {unusedGrants > 1 ? `${unusedGrants} منح` : 'منحة'}
                        </span>
                      )}
                    </div>
                    <p className={`text-[11px] truncate ${textSec}`}>
                      {r.academic_stage} · {isAbsent ? 'غائب' : `${r.score}/${r.total_score} (${r.passed ? 'ناجح' : 'راسب'})`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {justSucceeded ? (
                    <span className="text-emerald-600 font-black text-xs inline-flex items-center gap-1">
                      <CheckCircle className="w-4 h-4" /> تم
                    </span>
                  ) : isAbsent ? (
                    <span className={`text-[11px] ${textSec}`}>—</span>
                  ) : isConfirming ? (
                    <>
                      <button onClick={() => setConfirmId(null)} disabled={grantMut.isPending}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold ${dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-gray-100 text-gray-600'}`}>
                        إلغاء
                      </button>
                      <button onClick={() => grantMut.mutate({ student_id: r.student_id, note })}
                        disabled={grantMut.isPending}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white inline-flex items-center gap-1 disabled:opacity-50">
                        {grantMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Gift className="w-3 h-3" />}
                        تأكيد
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmId(r.student_id)}
                      title={unusedGrants > 0 ? 'منح محاولة إضافية أخرى' : 'منح محاولة إضافية'}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white inline-flex items-center gap-1">
                      <Gift className="w-3 h-3" />
                      منح محاولة
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {students.length > 0 && (
            <div ref={sentinelRef} className={`flex items-center justify-center min-h-8 text-xs ${textSec}`}>
              {isFetchingNextPage && <><Loader2 className="w-4 h-4 animate-spin ml-1" /> جار تحميل المزيد...</>}
              {!hasNextPage && total > PARTICIPANT_PAGE_SIZE && <span>تم تحميل جميع الطلاب المطابقين</span>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between px-5 py-3 border-t text-xs ${dark ? 'border-[var(--dk-border)] text-[var(--dk-text-2)]' : 'border-gray-100 text-gray-500'}`}>
          <span>{studentSearch.trim() ? 'الطلاب المطابقون' : 'إجمالي الطلاب الذين سلّموا'}: <strong className={textPrimary}>{total}</strong></span>
          <span>منح نشطة: <strong className="text-emerald-600">{activeGrants}</strong></span>
        </div>
      </div>
    </div>
  );
}
