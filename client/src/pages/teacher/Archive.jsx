import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useTheme } from '../../context/ThemeContext';
import {
  Archive, FileText, GraduationCap, Search,
  ChevronDown, ChevronUp,
  CheckCircle2, XCircle, RotateCcw, SlidersHorizontal,
  ChevronRight, ChevronLeft, Printer, Eye, BarChart3,
} from 'lucide-react';
import api from '../../lib/api';
import { generatePDFReport } from '../../lib/pdfReport';
import toast from 'react-hot-toast';
import StudentArchiveModal from '../../components/ui/StudentArchiveModal';

const SORT_OPTIONS_EXAM = [
  { value: 'date', label: 'التاريخ' },
  { value: 'score', label: 'الدرجة' },
  { value: 'name', label: 'اسم الطالب' },
  { value: 'exam', label: 'اسم الاختبار' },
];
const SORT_OPTIONS_REC = [
  { value: 'date', label: 'التاريخ' },
  { value: 'score', label: 'الدرجة' },
  { value: 'name', label: 'اسم الطالب' },
  { value: 'recitation', label: 'اسم التسميع' },
];

const STATUS_LABELS_EXAM = [
  { value: '', label: 'الكل' },
  { value: 'pass', label: 'ناجح' },
  { value: 'fail', label: 'راسب' },
];
const STATUS_LABELS_REC = [
  { value: '', label: 'الكل' },
  { value: 'pass', label: 'ناجح' },
  { value: 'fail', label: 'راسب' },
];
const ATTEMPT_LABELS = [
  { value: '', label: 'الكل' },
  { value: 'first', label: 'أول محاولة' },
  { value: 'retry', label: 'إعادة محاولة' },
];

const fmt = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
};

// FIX-F5: Use percentage score not raw score
const scorePct = (score, total) =>
  total > 0 ? Math.round((Number(score || 0) / Number(total)) * 100) : 0;

const ScoreBadge = ({ score, total, passScore, dark }) => {
  const pct = scorePct(score, total);
  const passed = Number(score) >= Number(passScore);
  const color = passed
    ? (dark ? 'bg-green-900/40 text-green-300' : 'bg-green-50 text-green-700')
    : (dark ? 'bg-red-900/40 text-red-300' : 'bg-red-50 text-red-700');
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${color}`}>
      {passed ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {score}/{total} ({pct}%)
    </span>
  );
};

const FilterRow = ({ label, children }) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-bold text-gray-500 dark:text-gray-400">{label}</label>
    {children}
  </div>
);

const SelectFilter = ({ value, onChange, options, dark }) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    className={`text-xs rounded-xl border px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-orange-400 transition ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text-1)]' : 'bg-white border-gray-200 text-gray-700'}`}
  >
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

const PAGE_SIZES = [25, 50, 100];

export default function ArchivePage() {
  const { dark } = useTheme();

  const [tab, setTab] = useState('exams');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState(null);

  // FIX-F6: search is now part of server-side params (q) — no client-side filtering
  const [examFilters, setExamFilters] = useState({
    q: '', course_id: '', exam_id: '', stage: '', status: '',
    attempt: '', date_from: '', date_to: '', sort: 'date', order: 'desc',
    page: 1, limit: 50,
  });
  const [recFilters, setRecFilters] = useState({
    q: '', recitation_id: '', stage: '', status: '',
    date_from: '', date_to: '', sort: 'date', order: 'desc',
    page: 1, limit: 50,
  });

  const setEF = useCallback((key, val) => {
    setExamFilters(f => ({ ...f, [key]: val, page: key !== 'page' ? 1 : val }));
  }, []);
  const setRF = useCallback((key, val) => {
    setRecFilters(f => ({ ...f, [key]: val, page: key !== 'page' ? 1 : val }));
  }, []);

  // FIX-F7: Validate date_from <= date_to before setting
  const setDateFilter = useCallback((which, key, val) => {
    const setter = which === 'exam' ? setExamFilters : setRecFilters;
    const other = which === 'exam' ? examFilters : recFilters;
    if (key === 'date_from' && other.date_to && val > other.date_to) {
      toast.error('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
      return;
    }
    if (key === 'date_to' && other.date_from && val < other.date_from) {
      toast.error('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
      return;
    }
    setter(f => ({ ...f, [key]: val, page: 1 }));
  }, [examFilters, recFilters]);

  const { data: filters } = useQuery({
    queryKey: ['archive-filters'],
    queryFn: () => api.get('/archive/filters').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });

  // FIX-F6: All filters (including search q) are server-side params
  const examParams = useMemo(() => {
    const p = {
      stage: examFilters.stage, status: examFilters.status,
      attempt: examFilters.attempt, sort: examFilters.sort, order: examFilters.order,
      page: examFilters.page, limit: examFilters.limit,
    };
    if (examFilters.q.trim()) p.q = examFilters.q.trim();
    if (examFilters.course_id) p.course_id = examFilters.course_id;
    if (examFilters.exam_id) p.exam_id = examFilters.exam_id;
    if (examFilters.date_from) p.date_from = examFilters.date_from;
    if (examFilters.date_to) p.date_to = examFilters.date_to;
    return p;
  }, [examFilters]);

  const recParams = useMemo(() => {
    const p = {
      stage: recFilters.stage, status: recFilters.status,
      sort: recFilters.sort, order: recFilters.order,
      page: recFilters.page, limit: recFilters.limit,
    };
    if (recFilters.q.trim()) p.q = recFilters.q.trim();
    if (recFilters.recitation_id) p.recitation_id = recFilters.recitation_id;
    if (recFilters.date_from) p.date_from = recFilters.date_from;
    if (recFilters.date_to) p.date_to = recFilters.date_to;
    return p;
  }, [recFilters]);

  // FIX-F1: keepPreviousData removed in React Query v5 — use placeholderData instead
  const { data: examData, isLoading: examLoading } = useQuery({
    queryKey: ['archive-exams', examParams],
    queryFn: () => api.get('/archive/exam-results', { params: examParams }).then(r => r.data),
    placeholderData: keepPreviousData,
    enabled: tab === 'exams',
  });

  const { data: recData, isLoading: recLoading } = useQuery({
    queryKey: ['archive-recs', recParams],
    queryFn: () => api.get('/archive/recitation-results', { params: recParams }).then(r => r.data),
    placeholderData: keepPreviousData,
    enabled: tab === 'recitations',
  });

  // FIX-F6: Results come directly from server (already filtered by q)
  const examResults = examData?.results || [];
  const recResults = recData?.results || [];

  const filteredExams = useMemo(() => {
    if (!filters?.exams) return [];
    if (!examFilters.course_id) return filters.exams;
    return filters.exams.filter(e => String(e.course_id) === String(examFilters.course_id));
  }, [filters, examFilters.course_id]);

  const handlePrintExams = () => {
    if (!examResults.length) { toast.error('لا توجد نتائج للطباعة'); return; }
    const passCount = examResults.filter(r => Number(r.score) >= Number(r.pass_score)).length;
    const failCount = examResults.filter(r => Number(r.score) < Number(r.pass_score)).length;
    // FIX-F5: Average score as percentage, not raw score
    const avgScore = examResults.length > 0
      ? Math.round(examResults.reduce((s, r) => s + scorePct(r.score, r.total_score), 0) / examResults.length)
      : 0;

    generatePDFReport(
      'أرشيف نتائج الاختبارات',
      ['الطالب', 'المرحلة', 'الكورس', 'الاختبار', 'الدرجة', 'الحالة', 'المحاولة', 'التاريخ'],
      examResults.map(r => [
        r.student_name,
        r.academic_stage || '—',
        r.course_name,
        r.exam_title,
        `${r.score}/${r.total_score} (${scorePct(r.score, r.total_score)}%)`,
        Number(r.score) >= Number(r.pass_score) ? 'ناجح' : 'راسب',
        r.attempt_number > 1 ? `إعادة (${r.attempt_number})` : 'أول محاولة',
        fmt(r.created_at),
      ]),
      'archive-exams.pdf',
      {
        subtitle: 'نتائج الاختبارات المفلترة',
        stats: [
          { label: 'إجمالي النتائج', value: examData?.total ?? examResults.length, color: '#1e3a5f' },
          { label: 'ناجح', value: passCount, color: '#16a34a' },
          { label: 'راسب', value: failCount, color: '#dc2626' },
          { label: 'متوسط الدرجات', value: `${avgScore}%`, color: '#7c3aed' },
        ],
      }
    );
  };

  const handlePrintRecs = () => {
    if (!recResults.length) { toast.error('لا توجد نتائج للطباعة'); return; }
    const passCount = recResults.filter(r => r.passed).length;
    const failCount = recResults.filter(r => !r.passed).length;
    // FIX-F5: Average score as percentage
    const avgScore = recResults.length > 0
      ? Math.round(recResults.reduce((s, r) => s + scorePct(r.score, r.total_score), 0) / recResults.length)
      : 0;

    generatePDFReport(
      'أرشيف نتائج التسميع',
      ['الطالب', 'المرحلة', 'التسميع', 'الدرجة', 'الحالة', 'التاريخ'],
      recResults.map(r => [
        r.student_name,
        r.academic_stage || '—',
        r.recitation_title,
        `${r.score}/${r.total_score} (${scorePct(r.score, r.total_score)}%)`,
        r.passed ? 'ناجح' : 'راسب',
        fmt(r.created_at),
      ]),
      'archive-recitations.pdf',
      {
        subtitle: 'نتائج التسميع المفلترة',
        stats: [
          { label: 'إجمالي النتائج', value: recData?.total ?? recResults.length, color: '#1e3a5f' },
          { label: 'ناجح', value: passCount, color: '#16a34a' },
          { label: 'راسب', value: failCount, color: '#dc2626' },
          { label: 'متوسط الدرجات', value: `${avgScore}%`, color: '#7c3aed' },
        ],
      }
    );
  };

  const card = dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border)]' : 'bg-white border-gray-100';
  const inputCls = dark
    ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text-1)] placeholder-gray-500 focus:ring-orange-400'
    : 'bg-white border-gray-200 text-gray-800 placeholder-gray-400 focus:ring-orange-400';
  const textPrimary = dark ? 'text-[var(--dk-text-1)]' : 'text-gray-800';
  const textSec = dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500';

  const isExam = tab === 'exams';
  const activeData = isExam ? examData : recData;
  const activeLoading = isExam ? examLoading : recLoading;
  const activeResults = isExam ? examResults : recResults;
  const totalPages = activeData ? Math.ceil(activeData.total / (isExam ? examFilters.limit : recFilters.limit)) : 1;
  const currentPage = isExam ? examFilters.page : recFilters.page;

  // FIX-F8: totalCount, passCount, failCount based on server total and current page slice
  const totalCount = activeData?.total ?? 0;
  const passCount = isExam
    ? activeResults.filter(r => Number(r.score) >= Number(r.pass_score)).length
    : activeResults.filter(r => r.passed).length;
  const failCount = isExam
    ? activeResults.filter(r => Number(r.score) < Number(r.pass_score)).length
    : activeResults.filter(r => !r.passed).length;

  // FIX-F5: Avg score as percentage
  const avgScoreDisplay = activeResults.length > 0
    ? `${Math.round(activeResults.reduce((s, r) => s + scorePct(r.score, r.total_score), 0) / activeResults.length)}%`
    : '—';

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-orange-500 flex items-center justify-center">
            <Archive className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className={`text-xl font-black ${textPrimary}`}>أرشيف النتائج</h1>
            <p className={`text-xs font-medium ${textSec}`}>كل نتائج الاختبارات والتسميع في مكان واحد</p>
          </div>
        </div>
        <button
          onClick={isExam ? handlePrintExams : handlePrintRecs}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-l from-orange-500 to-purple-600 text-white text-sm font-bold shadow hover:opacity-90 transition"
        >
          <Printer className="w-4 h-4" />
          طباعة التقرير الجماعي
        </button>
      </div>

      {/* Tabs */}
      <div className={`flex rounded-2xl p-1 gap-1 ${dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-100'}`} style={{ width: 'fit-content' }}>
        <button
          onClick={() => setTab('exams')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === 'exams'
            ? 'bg-orange-500 text-white shadow'
            : (dark ? 'text-[var(--dk-text-2)] hover:text-[var(--dk-text-1)]' : 'text-gray-500 hover:text-gray-700')
          }`}
        >
          <FileText className="w-4 h-4" />
          نتائج الاختبارات
          {examData && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-black ${tab === 'exams' ? 'bg-white/25 text-white' : (dark ? 'bg-[var(--dk-surface)] text-[var(--dk-text-2)]' : 'bg-white text-gray-500')}`}>
              {examData.total}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('recitations')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === 'recitations'
            ? 'bg-purple-600 text-white shadow'
            : (dark ? 'text-[var(--dk-text-2)] hover:text-[var(--dk-text-1)]' : 'text-gray-500 hover:text-gray-700')
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          نتائج التسميع
          {recData && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-black ${tab === 'recitations' ? 'bg-white/25 text-white' : (dark ? 'bg-[var(--dk-surface)] text-[var(--dk-text-2)]' : 'bg-white text-gray-500')}`}>
              {recData.total}
            </span>
          )}
        </button>
      </div>

      {/* Quick Stats — based on current page results */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي النتائج', value: totalCount, color: 'from-blue-500 to-blue-600', icon: BarChart3 },
          { label: 'ناجح (هذه الصفحة)', value: passCount, color: 'from-green-500 to-emerald-600', icon: CheckCircle2 },
          { label: 'راسب (هذه الصفحة)', value: failCount, color: 'from-red-500 to-rose-600', icon: XCircle },
          { label: 'متوسط الدرجة', value: avgScoreDisplay, color: 'from-purple-500 to-violet-600', icon: Archive },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className={`relative overflow-hidden rounded-2xl border p-4 ${card} shadow-sm`}>
            <div className={`absolute -top-6 -left-6 w-20 h-20 rounded-full opacity-10 bg-gradient-to-br ${color}`} />
            <p className={`text-2xl font-black ${textPrimary}`}>{value}</p>
            <p className={`text-xs font-semibold mt-0.5 ${textSec}`}>{label}</p>
          </div>
        ))}
      </div>

      {/* Filters Panel */}
      <div className={`rounded-2xl border shadow-sm overflow-hidden ${card}`}>
        <button
          onClick={() => setFiltersOpen(v => !v)}
          className={`w-full flex items-center justify-between px-5 py-4 text-sm font-bold transition-colors ${dark ? 'hover:bg-[var(--dk-elevated)]' : 'hover:bg-gray-50'}`}
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-orange-500" />
            <span className={textPrimary}>الفلاتر</span>
          </div>
          {filtersOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {filtersOpen && (
          <div className={`px-5 pb-5 border-t ${dark ? 'border-[var(--dk-border)]' : 'border-gray-100'}`}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pt-4">
              {/* Search — server-side FIX-F6 */}
              <div className="col-span-2 sm:col-span-3 lg:col-span-4 xl:col-span-2">
                <FilterRow label="بحث">
                  <div className="relative">
                    <Search className="absolute top-1/2 -translate-y-1/2 right-3 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="text"
                      placeholder={isExam ? 'ابحث باسم الطالب أو الاختبار...' : 'ابحث باسم الطالب أو التسميع...'}
                      value={isExam ? examFilters.q : recFilters.q}
                      onChange={e => isExam ? setEF('q', e.target.value) : setRF('q', e.target.value)}
                      className={`w-full pr-9 pl-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-2 ${inputCls}`}
                    />
                  </div>
                </FilterRow>
              </div>

              {/* Stage */}
              <FilterRow label="المرحلة الدراسية">
                <SelectFilter
                  dark={dark}
                  value={isExam ? examFilters.stage : recFilters.stage}
                  onChange={v => isExam ? setEF('stage', v) : setRF('stage', v)}
                  options={[{ value: '', label: 'كل المراحل' }, ...(filters?.stages || []).map(s => ({ value: s, label: s }))]}
                />
              </FilterRow>

              {/* Status */}
              <FilterRow label="الحالة">
                <SelectFilter
                  dark={dark}
                  value={isExam ? examFilters.status : recFilters.status}
                  onChange={v => isExam ? setEF('status', v) : setRF('status', v)}
                  options={isExam ? STATUS_LABELS_EXAM : STATUS_LABELS_REC}
                />
              </FilterRow>

              {/* Exam-only filters */}
              {isExam && (
                <>
                  <FilterRow label="الكورس">
                    <SelectFilter
                      dark={dark}
                      value={examFilters.course_id}
                      onChange={v => { setEF('course_id', v); setEF('exam_id', ''); }}
                      options={[{ value: '', label: 'كل الكورسات' }, ...(filters?.courses || []).map(c => ({ value: String(c.id), label: c.name }))]}
                    />
                  </FilterRow>
                  <FilterRow label="الاختبار">
                    <SelectFilter
                      dark={dark}
                      value={examFilters.exam_id}
                      onChange={v => setEF('exam_id', v)}
                      options={[{ value: '', label: 'كل الاختبارات' }, ...filteredExams.map(e => ({ value: String(e.id), label: e.title }))]}
                    />
                  </FilterRow>
                  <FilterRow label="المحاولة">
                    <SelectFilter
                      dark={dark}
                      value={examFilters.attempt}
                      onChange={v => setEF('attempt', v)}
                      options={ATTEMPT_LABELS}
                    />
                  </FilterRow>
                </>
              )}

              {/* Rec-only */}
              {!isExam && (
                <FilterRow label="التسميع">
                  <SelectFilter
                    dark={dark}
                    value={recFilters.recitation_id}
                    onChange={v => setRF('recitation_id', v)}
                    options={[{ value: '', label: 'كل التسميع' }, ...(filters?.recitations || []).map(r => ({ value: String(r.id), label: r.title }))]}
                  />
                </FilterRow>
              )}

              {/* Date range — FIX-F7: validated */}
              <FilterRow label="من تاريخ">
                <input
                  type="date"
                  value={isExam ? examFilters.date_from : recFilters.date_from}
                  onChange={e => setDateFilter(isExam ? 'exam' : 'rec', 'date_from', e.target.value)}
                  max={isExam ? examFilters.date_to || undefined : recFilters.date_to || undefined}
                  className={`text-xs rounded-xl border px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-orange-400 ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text-1)]' : 'bg-white border-gray-200 text-gray-700'}`}
                />
              </FilterRow>
              <FilterRow label="إلى تاريخ">
                <input
                  type="date"
                  value={isExam ? examFilters.date_to : recFilters.date_to}
                  onChange={e => setDateFilter(isExam ? 'exam' : 'rec', 'date_to', e.target.value)}
                  min={isExam ? examFilters.date_from || undefined : recFilters.date_from || undefined}
                  className={`text-xs rounded-xl border px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-orange-400 ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text-1)]' : 'bg-white border-gray-200 text-gray-700'}`}
                />
              </FilterRow>

              {/* Sort */}
              <FilterRow label="ترتيب حسب">
                <div className="flex gap-1">
                  <SelectFilter
                    dark={dark}
                    value={isExam ? examFilters.sort : recFilters.sort}
                    onChange={v => isExam ? setEF('sort', v) : setRF('sort', v)}
                    options={isExam ? SORT_OPTIONS_EXAM : SORT_OPTIONS_REC}
                  />
                  <button
                    onClick={() => isExam
                      ? setEF('order', examFilters.order === 'desc' ? 'asc' : 'desc')
                      : setRF('order', recFilters.order === 'desc' ? 'asc' : 'desc')
                    }
                    className={`px-2 rounded-xl border transition ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text-1)] hover:bg-[var(--dk-surface)]' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    title="عكس الترتيب"
                  >
                    {(isExam ? examFilters.order : recFilters.order) === 'desc'
                      ? <ChevronDown className="w-4 h-4" />
                      : <ChevronUp className="w-4 h-4" />}
                  </button>
                </div>
              </FilterRow>

              {/* Page size */}
              <FilterRow label="عدد في الصفحة">
                <SelectFilter
                  dark={dark}
                  value={String(isExam ? examFilters.limit : recFilters.limit)}
                  onChange={v => isExam ? setEF('limit', Number(v)) : setRF('limit', Number(v))}
                  options={PAGE_SIZES.map(n => ({ value: String(n), label: `${n} نتيجة` }))}
                />
              </FilterRow>
            </div>

            {/* Reset */}
            <div className="flex justify-end mt-3">
              <button
                onClick={() => isExam
                  ? setExamFilters({ q: '', course_id: '', exam_id: '', stage: '', status: '', attempt: '', date_from: '', date_to: '', sort: 'date', order: 'desc', page: 1, limit: 50 })
                  : setRecFilters({ q: '', recitation_id: '', stage: '', status: '', date_from: '', date_to: '', sort: 'date', order: 'desc', page: 1, limit: 50 })
                }
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition ${dark ? 'text-gray-400 hover:text-red-400 hover:bg-red-900/20' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}
              >
                <RotateCcw className="w-3 h-3" /> إعادة ضبط الفلاتر
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Results Table */}
      <div className={`rounded-2xl border shadow-sm overflow-hidden ${card}`}>
        <div className={`px-5 py-4 flex items-center justify-between border-b ${dark ? 'border-[var(--dk-border)]' : 'border-gray-100'}`}>
          <p className={`text-sm font-bold ${textPrimary}`}>
            {activeLoading ? 'جاري التحميل...' : `${activeResults.length} نتيجة معروضة من أصل ${totalCount}`}
          </p>
        </div>

        {activeLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
          </div>
        ) : activeResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-50'}`}>
              <Archive className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-sm font-bold text-gray-400">لا توجد نتائج تطابق الفلاتر المحددة</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {isExam ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className={dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-50'}>
                    {['الطالب', 'المرحلة', 'الكورس', 'الاختبار', 'الدرجة', 'الحالة', 'المحاولة', 'التاريخ', ''].map(h => (
                      <th key={h} className={`px-4 py-3 text-right font-black ${textSec}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeResults.map(r => (
                    <tr
                      key={r.id}
                      className={`border-t transition-colors ${dark ? 'border-[var(--dk-border)] hover:bg-[var(--dk-elevated)]' : 'border-gray-50 hover:bg-orange-50/30'}`}
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedStudent({ id: r.student_id, name: r.student_name })}
                          className="flex items-center gap-2 group"
                        >
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-purple-500 flex items-center justify-center text-white text-xs font-black flex-shrink-0">
                            {r.student_name?.charAt(0)}
                          </div>
                          <div className="text-right">
                            <p className={`font-bold group-hover:text-orange-500 transition-colors ${textPrimary}`}>{r.student_name}</p>
                            <p className={`text-[10px] ${textSec}`}>{r.student_username}</p>
                          </div>
                        </button>
                      </td>
                      <td className={`px-4 py-3 ${textSec}`}>{r.academic_stage || '—'}</td>
                      <td className={`px-4 py-3 font-medium ${textPrimary}`}>{r.course_name}</td>
                      <td className={`px-4 py-3 font-medium ${textPrimary}`}>{r.exam_title}</td>
                      <td className="px-4 py-3">
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <span className={`font-black ${textPrimary}`}>{r.score}/{r.total_score}</span>
                            <span className={textSec}>
                              ({scorePct(r.score, r.total_score)}%)
                            </span>
                          </div>
                          <div className={`w-20 h-1.5 rounded-full overflow-hidden ${dark ? 'bg-gray-700' : 'bg-gray-200'}`}>
                            <div
                              className={`h-full rounded-full ${Number(r.score) >= Number(r.pass_score) ? 'bg-green-500' : 'bg-red-500'}`}
                              style={{ width: `${Math.min(100, scorePct(r.score, r.total_score))}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <ScoreBadge score={Number(r.score)} total={Number(r.total_score)} passScore={Number(r.pass_score)} dark={dark} />
                      </td>
                      <td className={`px-4 py-3 ${textSec}`}>
                        {r.attempt_number > 1
                          ? <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${dark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
                              <RotateCcw className="w-2.5 h-2.5 inline ml-0.5" />إعادة ({r.attempt_number})
                            </span>
                          : <span className={`text-xs ${textSec}`}>أول محاولة</span>
                        }
                      </td>
                      <td className={`px-4 py-3 ${textSec} whitespace-nowrap`}>{fmt(r.created_at)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedStudent({ id: r.student_id, name: r.student_name })}
                          className={`p-1.5 rounded-lg transition-colors ${dark ? 'hover:bg-[var(--dk-surface)] text-gray-400 hover:text-orange-400' : 'hover:bg-orange-50 text-gray-400 hover:text-orange-500'}`}
                          title="عرض ملف الطالب"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className={dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-50'}>
                    {['الطالب', 'المرحلة', 'التسميع', 'الدرجة', 'الحالة', 'التاريخ', ''].map(h => (
                      <th key={h} className={`px-4 py-3 text-right font-black ${textSec}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeResults.map(r => (
                    <tr
                      key={r.id}
                      className={`border-t transition-colors ${dark ? 'border-[var(--dk-border)] hover:bg-[var(--dk-elevated)]' : 'border-gray-50 hover:bg-purple-50/30'}`}
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedStudent({ id: r.student_id, name: r.student_name })}
                          className="flex items-center gap-2 group"
                        >
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-orange-500 flex items-center justify-center text-white text-xs font-black flex-shrink-0">
                            {r.student_name?.charAt(0)}
                          </div>
                          <div className="text-right">
                            <p className={`font-bold group-hover:text-purple-500 transition-colors ${textPrimary}`}>{r.student_name}</p>
                            <p className={`text-[10px] ${textSec}`}>{r.student_username}</p>
                          </div>
                        </button>
                      </td>
                      <td className={`px-4 py-3 ${textSec}`}>{r.academic_stage || '—'}</td>
                      <td className={`px-4 py-3 font-medium ${textPrimary}`}>{r.recitation_title}</td>
                      <td className="px-4 py-3">
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <span className={`font-black ${textPrimary}`}>{r.score}/{r.total_score}</span>
                            <span className={textSec}>
                              ({scorePct(r.score, r.total_score)}%)
                            </span>
                          </div>
                          <div className={`w-20 h-1.5 rounded-full overflow-hidden ${dark ? 'bg-gray-700' : 'bg-gray-200'}`}>
                            <div
                              className={`h-full rounded-full ${r.passed ? 'bg-green-500' : 'bg-red-500'}`}
                              style={{ width: `${Math.min(100, scorePct(r.score, r.total_score))}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${r.passed
                          ? (dark ? 'bg-green-900/40 text-green-300' : 'bg-green-50 text-green-700')
                          : (dark ? 'bg-red-900/40 text-red-300' : 'bg-red-50 text-red-700')
                        }`}>
                          {r.passed ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {r.passed ? 'ناجح' : 'راسب'}
                        </span>
                      </td>
                      <td className={`px-4 py-3 ${textSec} whitespace-nowrap`}>{fmt(r.created_at)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedStudent({ id: r.student_id, name: r.student_name })}
                          className={`p-1.5 rounded-lg transition-colors ${dark ? 'hover:bg-[var(--dk-surface)] text-gray-400 hover:text-purple-400' : 'hover:bg-purple-50 text-gray-400 hover:text-purple-500'}`}
                          title="عرض ملف الطالب"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className={`flex items-center justify-between px-5 py-4 border-t ${dark ? 'border-[var(--dk-border)]' : 'border-gray-100'}`}>
            <p className={`text-xs ${textSec}`}>
              صفحة {currentPage} من {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => isExam ? setEF('page', currentPage - 1) : setRF('page', currentPage - 1)}
                disabled={currentPage <= 1}
                className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${dark ? 'hover:bg-[var(--dk-elevated)] text-[var(--dk-text-1)]' : 'hover:bg-gray-100 text-gray-600'}`}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pg = currentPage <= 3 ? i + 1 : currentPage + i - 2;
                if (pg < 1 || pg > totalPages) return null;
                return (
                  <button
                    key={pg}
                    onClick={() => isExam ? setEF('page', pg) : setRF('page', pg)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${pg === currentPage
                      ? 'bg-orange-500 text-white'
                      : (dark ? 'hover:bg-[var(--dk-elevated)] text-[var(--dk-text-1)]' : 'hover:bg-gray-100 text-gray-600')
                    }`}
                  >
                    {pg}
                  </button>
                );
              })}
              <button
                onClick={() => isExam ? setEF('page', currentPage + 1) : setRF('page', currentPage + 1)}
                disabled={currentPage >= totalPages}
                className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${dark ? 'hover:bg-[var(--dk-elevated)] text-[var(--dk-text-1)]' : 'hover:bg-gray-100 text-gray-600'}`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Student Archive Modal — FIX-F2/F7: removed unused baseRole prop */}
      {selectedStudent && (
        <StudentArchiveModal
          student={selectedStudent}
          onClose={() => setSelectedStudent(null)}
        />
      )}
    </div>
  );
}
