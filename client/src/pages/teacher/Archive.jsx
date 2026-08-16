import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useTheme } from '../../context/ThemeContext';
import {
  Archive, Search, ChevronDown, ChevronUp, Users,
  FileText, GraduationCap, ChevronRight, ChevronLeft,
  Eye, RotateCcw, Printer, Filter, Layers, CheckCircle,
  XCircle, AlertTriangle, Clock, Award, ArrowLeft
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { generatePDFReport } from '../../lib/pdfReport';
import StudentArchiveModal from '../../components/ui/StudentArchiveModal';
import ItemArchiveDetailView from '../../components/ui/ItemArchiveDetailView';

const SORT_OPTIONS = [
  { value: 'name',        label: 'الاسم (أ–ي)' },
  { value: 'exams',       label: 'عدد الاختبارات' },
  { value: 'recitations', label: 'عدد التسميع' },
  { value: 'score',       label: 'متوسط الدرجات' },
];
const PAGE_SIZES = [25, 50, 100];

const HAS_TYPE_OPTIONS = [
  { value: '',             label: 'الكل' },
  { value: 'exams',        label: '📄 لديه اختبارات' },
  { value: 'recitations',  label: '📚 لديه تسميع' },
  { value: 'both',         label: '📄📚 لديهما معاً' },
];

const ITEM_TYPE_OPTIONS = [
  { value: 'all',        label: 'الكل (اختبارات وتسميعات)' },
  { value: 'exam',       label: '📄 الاختبارات فقط' },
  { value: 'recitation', label: '📚 التسميعات فقط' },
];

const ITEM_PUBLISHED_OPTIONS = [
  { value: 'all',   label: 'كل الحالات' },
  { value: 'true',  label: '● منشور حالياً' },
  { value: 'false', label: '○ غير منشور / مغلق' },
];

const PassBar = ({ passed, total, dark }) => {
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
  const color = pct >= 60 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';
  const text  = pct >= 60 ? 'text-green-600' : pct >= 40 ? 'text-amber-500' : 'text-red-500';
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className={`w-14 h-1.5 rounded-full overflow-hidden flex-shrink-0 ${dark ? 'bg-gray-700' : 'bg-gray-200'}`}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={`text-[10px] font-bold whitespace-nowrap ${text}`}>{passed}/{total}</span>
    </div>
  );
};

const StageBadge = ({ stage, dark }) => {
  if (!stage) return <span className={`text-xs ${dark ? 'text-gray-600' : 'text-gray-400'}`}>—</span>;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${dark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
      {stage}
    </span>
  );
};

const PillGroup = ({ options, value, onChange, dark }) => (
  <div className="flex flex-wrap gap-1.5">
    {options.map(o => {
      const active = value === o.value;
      return (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border whitespace-nowrap cursor-pointer ${
            active
              ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
              : dark
                ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text-2)] hover:text-[var(--dk-text-1)]'
                : 'bg-white border-gray-200 text-gray-600 hover:border-orange-300 hover:text-orange-600'
          }`}
        >
          {o.label}
        </button>
      );
    })}
  </div>
);

const DEFAULT_FILTERS = { q: '', stage: '', has_type: '', sort: 'name', order: 'asc', page: 1, limit: 50 };

export default function ArchivePage() {
  const { dark } = useTheme();

  // Tab State: 'students' (سجل الطلاب) or 'items' (سجل الاختبارات والتسميعات)
  const [activeTab, setActiveTab] = useState('students');

  // Modals & Selected items
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);

  // Tab 1: Student Archive Filters
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });

  const setF = useCallback((key, val) => {
    setFilters(f => ({ ...f, [key]: val, page: key !== 'page' ? 1 : val }));
  }, []);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.q.trim())    n++;
    if (filters.stage)       n++;
    if (filters.has_type)    n++;
    if (filters.sort !== 'name' || filters.order !== 'asc') n++;
    return n;
  }, [filters]);

  const { data: filterOptions } = useQuery({
    queryKey: ['archive-filters'],
    queryFn: () => api.get('/archive/filters').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const params = useMemo(() => {
    const p = { sort: filters.sort, order: filters.order, page: filters.page, limit: filters.limit };
    if (filters.q.trim())  p.q        = filters.q.trim();
    if (filters.stage)     p.stage    = filters.stage;
    if (filters.has_type)  p.has_type = filters.has_type;
    return p;
  }, [filters]);

  const { data, isLoading } = useQuery({
    queryKey: ['archive-students', params],
    queryFn: () => api.get('/archive/students', { params }).then(r => r.data),
    placeholderData: keepPreviousData,
    enabled: activeTab === 'students',
  });

  const students   = data?.students || [];
  const totalCount = data?.total ?? 0;
  const totalPages = data ? Math.ceil(data.total / filters.limit) : 1;

  const totalExams = useMemo(() => students.reduce((s, st) => s + Number(st.total_exams), 0),       [students]);
  const totalRecs  = useMemo(() => students.reduce((s, st) => s + Number(st.total_recitations), 0), [students]);

  // Tab 2: Items (Exams & Recitations) Archive State & Query
  const [itemsSearch, setItemsSearch] = useState('');
  const [itemsType, setItemsType] = useState('all');
  const [itemsStage, setItemsStage] = useState('');
  const [itemsPublished, setItemsPublished] = useState('all');
  const [itemsSort, setItemsSort] = useState('date');
  const [itemsOrder, setItemsOrder] = useState('desc');

  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ['archive-items', { type: itemsType, q: itemsSearch, stage: itemsStage, published: itemsPublished, sort: itemsSort, order: itemsOrder }],
    queryFn: () => api.get('/archive/items', {
      params: {
        type: itemsType,
        q: itemsSearch,
        stage: itemsStage,
        published: itemsPublished,
        sort: itemsSort,
        order: itemsOrder,
      }
    }).then(r => r.data),
    enabled: activeTab === 'items' && !selectedItem,
    staleTime: 60 * 1000,
  });

  const itemsList = itemsData?.items || [];
  const totalItemsCount = itemsData?.total ?? 0;

  const totalItemsExamsCount = useMemo(() => itemsList.filter(i => i.item_type === 'exam').length, [itemsList]);
  const totalItemsRecsCount  = useMemo(() => itemsList.filter(i => i.item_type === 'recitation').length, [itemsList]);
  const totalItemsTargeted   = useMemo(() => itemsList.reduce((s, i) => s + (Number(i.total_targeted) || 0), 0), [itemsList]);
  const totalItemsAttended   = useMemo(() => itemsList.reduce((s, i) => s + (Number(i.attended_count) || 0), 0), [itemsList]);

  // Handle Group Print for Students Tab
  const handleGroupPrint = () => {
    if (!students.length) { toast.error('لا يوجد طلاب للطباعة'); return; }
    const stageLabel = filters.stage || 'كل المراحل';
    const hasLabel   = HAS_TYPE_OPTIONS.find(o => o.value === filters.has_type)?.label || 'الكل';
    generatePDFReport(
      'أرشيف النتائج — قائمة الطلاب',
      ['اسم الطالب', 'كود الطالب', 'المرحلة', 'الاختبارات', 'ناجح/راسب', 'متوسط الاختبارات', 'التسميع', 'ناجح/راسب (تسميع)', 'متوسط التسميع'],
      students.map(st => [
        st.name,
        st.username || '—',
        st.academic_stage || '—',
        Number(st.total_exams) > 0      ? `${st.total_exams}`       : '—',
        Number(st.total_exams) > 0      ? `${st.passed_exams} ناجح / ${Number(st.total_exams) - Number(st.passed_exams)} راسب` : '—',
        Number(st.total_exams) > 0      ? `${st.avg_exam_score}%`   : '—',
        Number(st.total_recitations) > 0 ? `${st.total_recitations}` : '—',
        Number(st.total_recitations) > 0 ? `${st.passed_recitations} ناجح / ${Number(st.total_recitations) - Number(st.passed_recitations)} راسب` : '—',
        Number(st.total_recitations) > 0 ? `${st.avg_rec_score}%`   : '—',
      ]),
      'archive-students.pdf',
      {
        subtitle: `المرحلة: ${stageLabel} | النوع: ${hasLabel} | إجمالي: ${totalCount} طالب`,
        stats: [
          { label: 'إجمالي الطلاب',  value: totalCount, color: '#1e3a5f' },
          { label: 'اختبارات مؤدّاة', value: totalExams, color: '#f97316' },
          { label: 'تسميع مؤدّى',    value: totalRecs,  color: '#7c3aed' },
        ],
        note: filters.page > 1
          ? `هذا التقرير يعرض الصفحة ${filters.page} فقط (${students.length} طالب). استخدم "الكل" في عدد الصفحة لطباعة كامل القائمة.`
          : undefined,
      }
    );
  };

  // Quick Print for a single item from the list
  const handleQuickPrintItem = async (e, it) => {
    e.stopPropagation();
    try {
      toast.loading('جاري تجهيز التقرير...', { id: 'quick-print' });
      const res = await api.get(`/archive/item/${it.item_type}/${it.id}/students`);
      const { item: fullItem, students: itemStudents } = res.data;
      toast.dismiss('quick-print');

      if (!itemStudents || !itemStudents.length) {
        toast.error('لا توجد بيانات للطباعة');
        return;
      }

      const typeLabel = it.item_type === 'exam' ? 'اختبار' : 'تسميع';
      const courseOrStage = fullItem.course_name && fullItem.course_name !== '—'
        ? fullItem.course_name
        : (fullItem.academic_stage || fullItem.course_target_stage || 'كل المراحل');
      const pubLabel = fullItem.is_published ? 'منشور' : 'غير منشور / مغلق';

      generatePDFReport(
        `تقرير نتائج ${typeLabel}: ${fullItem.title}`,
        ['اسم الطالب', 'كود الطالب', 'المرحلة الدراسية', 'الحالة', 'الدرجة', 'النسبة', 'المحاولات', 'تاريخ الأداء'],
        itemStudents.map(st => {
          let attemptsText = '—';
          if (st.status !== 'absent') {
            attemptsText = st.attempts_count > 1 ? `${st.attempts_count} محاولات (إعادة)` : 'محاولة 1';
          }
          return [
            st.student_name || '—',
            st.student_username || '—',
            st.academic_stage || '—',
            st.status_label || (st.status === 'passed' ? 'ناجح' : st.status === 'failed' ? 'راسب' : 'غائب'),
            st.score !== null ? `${st.score}/${fullItem.total_score}` : '—',
            st.percentage !== null ? `${st.percentage}%` : '—',
            attemptsText,
            st.submitted_at ? new Date(st.submitted_at).toLocaleDateString('ar-EG') : '—',
          ];
        }),
        `${it.item_type}-${it.id}-report.pdf`,
        {
          subtitle: `المرحلة / الكورس: ${courseOrStage} | درجة النجاح: ${fullItem.pass_score}/${fullItem.total_score} | الحالة: ${pubLabel} | إجمالي المستهدفين: ${fullItem.total_targeted} طالب`,
          stats: [
            { label: 'الطلاب المستهدفون', value: fullItem.total_targeted || itemStudents.length, color: '#1e3a5f' },
            { label: 'حضروا / أدوا', value: fullItem.attended_count || 0, color: '#0284c7' },
            { label: 'الناجحون', value: fullItem.passed_count || 0, color: '#16a34a' },
            { label: 'الراسبون', value: fullItem.failed_count || 0, color: '#dc2626' },
            { label: 'الغائبون', value: fullItem.absent_count || 0, color: '#d97706' },
            { label: 'متوسط الدرجات', value: `${fullItem.avg_pct || 0}%`, color: '#7c3aed' },
          ],
          note: `تم استخراج هذا التقرير لجميع الطلاب الموجه إليهم هذا ال${typeLabel}. الطلاب الذين لم يؤدوا أو تم إلغاء النشر يظهرون بحالة "غائب".`,
        }
      );
    } catch (err) {
      toast.dismiss('quick-print');
      toast.error('حدث خطأ أثناء تحميل التقرير');
    }
  };

  const card        = dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border)]' : 'bg-white border-gray-100';
  const textPrimary = dark ? 'text-[var(--dk-text-1)]' : 'text-gray-800';
  const textSec    = dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500';
  const inputCls   = dark
    ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text-1)] placeholder-gray-500 focus:ring-orange-400'
    : 'bg-white border-gray-200 text-gray-800 placeholder-gray-400 focus:ring-orange-400';
  const selectCls  = dark
    ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text-1)]'
    : 'bg-white border-gray-200 text-gray-700';

  return (
    <div className="space-y-5" dir="rtl">
      {activeTab === 'items' && selectedItem ? (
        <ItemArchiveDetailView
          item={selectedItem}
          onBack={() => setSelectedItem(null)}
          onOpenStudent={setSelectedStudent}
        />
      ) : (
        <>
          {/* ── Header ── */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-orange-500 flex items-center justify-center flex-shrink-0">
                <Archive className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className={`text-xl font-black ${textPrimary}`}>أرشيف النتائج</h1>
                <p className={`text-xs font-medium ${textSec}`}>
                  {activeTab === 'students' ? 'عرض نتائج كل طالب مع سجله الشامل' : 'سجل كافة الاختبارات والتسميعات ومتابعة الطلاب المستهدفين'}
                </p>
              </div>
            </div>

            {/* Tab 1 Action */}
            {activeTab === 'students' && (
              <button
                onClick={handleGroupPrint}
                disabled={isLoading || students.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 to-orange-500 text-white hover:opacity-90 transition disabled:opacity-40 shadow-sm cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                طباعة القائمة الجماعية
              </button>
            )}
          </div>

          {/* ── Navigation Tabs ── */}
          <div className={`p-1.5 rounded-2xl border flex items-center gap-2 ${card} shadow-sm`}>
            <button
              onClick={() => setActiveTab('students')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-black transition-all cursor-pointer ${
                activeTab === 'students'
                  ? 'bg-orange-500 text-white shadow-sm'
                  : dark
                    ? 'text-gray-400 hover:text-white hover:bg-[var(--dk-elevated)]'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>أرشيف الطلاب (سجل كل طالب)</span>
              {totalCount > 0 && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                  activeTab === 'students' ? 'bg-white/20 text-white' : (dark ? 'bg-gray-800 text-gray-300' : 'bg-gray-200 text-gray-700')
                }`}>
                  {totalCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('items')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-black transition-all cursor-pointer ${
                activeTab === 'items'
                  ? 'bg-gradient-to-r from-orange-500 to-purple-600 text-white shadow-sm'
                  : dark
                    ? 'text-gray-400 hover:text-white hover:bg-[var(--dk-elevated)]'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>أرشيف الاختبارات والتسميعات (المستهدفون والنتائج)</span>
              {totalItemsCount > 0 && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                  activeTab === 'items' ? 'bg-white/20 text-white' : (dark ? 'bg-gray-800 text-gray-300' : 'bg-gray-200 text-gray-700')
                }`}>
                  {totalItemsCount}
                </span>
              )}
            </button>
          </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 1: STUDENTS ARCHIVE ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'students' && (
        <>
          {/* ── Quick Stats ── */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'طالب لديه نتائج', value: totalCount, icon: Users,        color: 'from-blue-500 to-blue-600',   text: 'text-blue-600' },
              { label: 'اختبار مؤدّى',    value: totalExams, icon: FileText,      color: 'from-orange-500 to-orange-600', text: 'text-orange-600' },
              { label: 'تسميع مؤدّى',     value: totalRecs,  icon: GraduationCap, color: 'from-purple-500 to-purple-600', text: 'text-purple-600' },
            ].map(({ label, value, icon: Icon, color, text }) => (
              <div key={label} className={`relative overflow-hidden rounded-2xl border p-4 ${card} shadow-sm`}>
                <div className={`absolute -top-4 -left-4 w-14 h-14 rounded-full opacity-10 bg-gradient-to-br ${color}`} />
                <Icon className={`w-4 h-4 mb-1.5 ${text}`} />
                <p className={`text-2xl font-black ${textPrimary}`}>{isLoading ? '…' : value}</p>
                <p className={`text-[11px] font-semibold mt-0.5 ${textSec}`}>{label}</p>
              </div>
            ))}
          </div>

          {/* ── Filters ── */}
          <div className={`rounded-2xl border shadow-sm overflow-hidden ${card}`}>
            <button
              onClick={() => setFiltersOpen(v => !v)}
              className={`w-full flex items-center justify-between px-5 py-3.5 transition-colors cursor-pointer ${dark ? 'hover:bg-[var(--dk-elevated)]' : 'hover:bg-gray-50'}`}
            >
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-orange-500" />
                <span className={`text-sm font-bold ${textPrimary}`}>البحث والفلاتر</span>
                {activeFilterCount > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-black">
                    {activeFilterCount}
                  </span>
                )}
              </div>
              {filtersOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            {filtersOpen && (
              <div className={`px-5 pb-5 pt-4 border-t space-y-4 ${dark ? 'border-[var(--dk-border)]' : 'border-gray-100'}`}>

                {/* Row 1: Search */}
                <div>
                  <label className={`block text-[10px] font-black uppercase tracking-wide mb-1.5 ${textSec}`}>بحث باسم الطالب</label>
                  <div className="relative">
                    <Search className="absolute top-1/2 -translate-y-1/2 right-3 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="اكتب اسم الطالب أو كود الدخول..."
                      value={filters.q}
                      onChange={e => setF('q', e.target.value)}
                      className={`w-full pr-9 pl-3 py-2.5 text-xs rounded-xl border focus:outline-none focus:ring-2 ${inputCls}`}
                    />
                    {filters.q && (
                      <button onClick={() => setF('q', '')} className="absolute top-1/2 -translate-y-1/2 left-3 text-gray-400 hover:text-red-400 transition-colors">
                        ×
                      </button>
                    )}
                  </div>
                </div>

                {/* Row 2: Stage pills */}
                {filterOptions?.stages?.length > 0 && (
                  <div>
                    <label className={`block text-[10px] font-black uppercase tracking-wide mb-1.5 ${textSec}`}>المرحلة الدراسية</label>
                    <PillGroup
                      options={[{ value: '', label: 'كل المراحل' }, ...(filterOptions.stages.map(s => ({ value: s, label: s })))]}
                      value={filters.stage}
                      onChange={v => setF('stage', v)}
                      dark={dark}
                    />
                  </div>
                )}

                {/* Row 3: Has type pills */}
                <div>
                  <label className={`block text-[10px] font-black uppercase tracking-wide mb-1.5 ${textSec}`}>نوع النتائج</label>
                  <PillGroup options={HAS_TYPE_OPTIONS} value={filters.has_type} onChange={v => setF('has_type', v)} dark={dark} />
                </div>

                {/* Row 4: Sort + order + page size + reset */}
                <div className="flex items-end gap-3 flex-wrap">
                  <div className="flex-1 min-w-[160px]">
                    <label className={`block text-[10px] font-black uppercase tracking-wide mb-1.5 ${textSec}`}>ترتيب حسب</label>
                    <div className="flex gap-1">
                      <select
                        value={filters.sort}
                        onChange={e => setF('sort', e.target.value)}
                        className={`flex-1 text-xs rounded-xl border px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-orange-400 ${selectCls}`}
                      >
                        {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <button
                        onClick={() => setF('order', filters.order === 'asc' ? 'desc' : 'asc')}
                        title={filters.order === 'asc' ? 'تصاعدي → تنازلي' : 'تنازلي → تصاعدي'}
                        className={`w-9 h-9 rounded-xl border flex items-center justify-center transition ${selectCls} hover:border-orange-400 cursor-pointer`}
                      >
                        {filters.order === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="min-w-[110px]">
                    <label className={`block text-[10px] font-black uppercase tracking-wide mb-1.5 ${textSec}`}>عدد في الصفحة</label>
                    <select
                      value={String(filters.limit)}
                      onChange={e => setF('limit', Number(e.target.value))}
                      className={`w-full text-xs rounded-xl border px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-orange-400 ${selectCls}`}
                    >
                      {PAGE_SIZES.map(n => <option key={n} value={n}>{n} طالب</option>)}
                    </select>
                  </div>

                  <button
                    onClick={() => setFilters({ ...DEFAULT_FILTERS })}
                    className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition self-end cursor-pointer ${
                      activeFilterCount > 0
                        ? (dark ? 'border-red-800 text-red-400 hover:bg-red-900/20' : 'border-red-200 text-red-500 hover:bg-red-50')
                        : (dark ? 'border-[var(--dk-border)] text-gray-500' : 'border-gray-200 text-gray-400')
                    }`}
                  >
                    <RotateCcw className="w-3 h-3" />
                    {activeFilterCount > 0 ? `إزالة الفلاتر (${activeFilterCount})` : 'إعادة الضبط'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Results Table ── */}
          <div className={`rounded-2xl border shadow-sm overflow-hidden ${card}`}>
            <div className={`px-5 py-3.5 flex items-center justify-between gap-2 border-b ${dark ? 'border-[var(--dk-border)]' : 'border-gray-100'}`}>
              <p className={`text-sm font-bold ${textPrimary}`}>
                {isLoading ? 'جاري التحميل...' : `${students.length} طالب من أصل ${totalCount}`}
              </p>
              {activeFilterCount > 0 && !isLoading && (
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${dark ? 'bg-orange-900/30 text-orange-300' : 'bg-orange-50 text-orange-600'}`}>
                  {activeFilterCount} فلتر نشط
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
              </div>
            ) : students.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-50'}`}>
                  <Users className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-sm font-bold text-gray-400">لا يوجد طلاب يطابقون البحث</p>
                {activeFilterCount > 0 && (
                  <button onClick={() => setFilters({ ...DEFAULT_FILTERS })} className="text-xs font-bold text-orange-500 hover:underline cursor-pointer">
                    إزالة الفلاتر
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className={dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-50'}>
                        {['الطالب', 'كود الطالب', 'المرحلة', 'الاختبارات', 'التسميع', 'متوسط الاختبارات', 'متوسط التسميع', ''].map(h => (
                          <th key={h} className={`px-4 py-3 text-right font-black text-[10px] uppercase tracking-wide ${textSec}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {students.map(st => {
                        const examPct = Number(st.avg_exam_score) || 0;
                        const recPct  = Number(st.avg_rec_score)  || 0;
                        return (
                          <tr
                            key={st.id}
                            className={`border-t transition-colors cursor-pointer group ${dark ? 'border-[var(--dk-border)] hover:bg-[var(--dk-elevated)]' : 'border-gray-50 hover:bg-orange-50/30'}`}
                            onClick={() => setSelectedStudent({ id: st.id, name: st.name })}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-purple-500 flex items-center justify-center text-white text-xs font-black flex-shrink-0">
                                  {st.name?.charAt(0)}
                                </div>
                                <p className={`font-bold group-hover:text-orange-500 transition-colors ${textPrimary}`}>{st.name}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`font-mono font-bold text-xs ${textPrimary}`}>{st.username}</span>
                            </td>
                            <td className="px-4 py-3"><StageBadge stage={st.academic_stage} dark={dark} /></td>
                            <td className="px-4 py-3">
                              {(Number(st.total_exams) > 0 || Number(st.absent_exams) > 0)
                                ? <div className="space-y-0.5">
                                    <PassBar passed={Number(st.passed_exams)} total={Number(st.total_exams)} dark={dark} />
                                    {Number(st.absent_exams) > 0 && (
                                      <span className={`block text-[10px] font-bold ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                                        {st.absent_exams} غياب
                                      </span>
                                    )}
                                  </div>
                                : <span className={`text-[10px] ${textSec}`}>—</span>}
                            </td>
                            <td className="px-4 py-3">
                              {Number(st.total_recitations) > 0
                                ? <PassBar passed={Number(st.passed_recitations)} total={Number(st.total_recitations)} dark={dark} />
                                : <span className={`text-[10px] ${textSec}`}>—</span>}
                            </td>
                            <td className="px-4 py-3">
                              {Number(st.total_exams) > 0
                                ? <span className={`font-bold text-xs ${examPct >= 60 ? 'text-green-600' : 'text-red-500'}`}>{examPct}%</span>
                                : <span className={`text-[10px] ${textSec}`}>—</span>}
                            </td>
                            <td className="px-4 py-3">
                              {Number(st.total_recitations) > 0
                                ? <span className={`font-bold text-xs ${recPct >= 60 ? 'text-green-600' : 'text-red-500'}`}>{recPct}%</span>
                                : <span className={`text-[10px] ${textSec}`}>—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={e => { e.stopPropagation(); setSelectedStudent({ id: st.id, name: st.name }); }}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${dark ? 'text-gray-500 hover:text-orange-400 hover:bg-[var(--dk-surface)]' : 'text-gray-400 hover:text-orange-500 hover:bg-orange-50'}`}
                                title="عرض سجل الطالب"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="sm:hidden divide-y divide-gray-100 dark:divide-[var(--dk-border)]">
                  {students.map(st => {
                    const examPct = Number(st.avg_exam_score) || 0;
                    const recPct  = Number(st.avg_rec_score)  || 0;
                    return (
                      <button
                        key={st.id}
                        onClick={() => setSelectedStudent({ id: st.id, name: st.name })}
                        className={`w-full px-4 py-4 text-right flex items-center gap-3 transition-colors cursor-pointer ${dark ? 'hover:bg-[var(--dk-elevated)]' : 'hover:bg-orange-50/30'}`}
                      >
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-purple-500 flex items-center justify-center text-white text-sm font-black flex-shrink-0">
                          {st.name?.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <p className={`font-black text-sm ${textPrimary}`}>{st.name}</p>
                            <StageBadge stage={st.academic_stage} dark={dark} />
                          </div>
                          <p className={`text-[10px] mb-2 ${textSec}`}>{st.username}</p>
                          <div className="flex items-center gap-4 flex-wrap">
                            {(Number(st.total_exams) > 0 || Number(st.absent_exams) > 0) && (
                              <div className="flex items-center gap-1">
                                <FileText className="w-3 h-3 text-orange-400 flex-shrink-0" />
                                <span className={`text-[10px] font-bold ${examPct >= 60 ? 'text-green-600' : 'text-red-500'}`}>
                                  {st.passed_exams}/{st.total_exams} اختبار ({examPct}%)
                                  {Number(st.absent_exams) > 0 && <span className="text-gray-400"> · {st.absent_exams} غياب</span>}
                                </span>
                              </div>
                            )}
                            {Number(st.total_recitations) > 0 && (
                              <div className="flex items-center gap-1">
                                <GraduationCap className="w-3 h-3 text-purple-400 flex-shrink-0" />
                                <span className={`text-[10px] font-bold ${recPct >= 60 ? 'text-green-600' : 'text-red-500'}`}>
                                  {st.passed_recitations}/{st.total_recitations} تسميع ({recPct}%)
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        <ChevronLeft className={`w-4 h-4 flex-shrink-0 ${textSec}`} />
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className={`flex items-center justify-between px-5 py-4 border-t ${dark ? 'border-[var(--dk-border)]' : 'border-gray-100'}`}>
                <p className={`text-xs ${textSec}`}>صفحة {filters.page} من {totalPages}</p>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setF('page', filters.page - 1)}
                    disabled={filters.page <= 1}
                    className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 cursor-pointer ${dark ? 'hover:bg-[var(--dk-elevated)] text-[var(--dk-text-1)]' : 'hover:bg-gray-100 text-gray-600'}`}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pg = filters.page <= 3 ? i + 1 : filters.page + i - 2;
                    if (pg < 1 || pg > totalPages) return null;
                    return (
                      <button
                        key={pg}
                        onClick={() => setF('page', pg)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors cursor-pointer ${pg === filters.page
                          ? 'bg-orange-500 text-white shadow-sm'
                          : (dark ? 'hover:bg-[var(--dk-elevated)] text-[var(--dk-text-1)]' : 'hover:bg-gray-100 text-gray-600')
                        }`}
                      >
                        {pg}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setF('page', filters.page + 1)}
                    disabled={filters.page >= totalPages}
                    className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 cursor-pointer ${dark ? 'hover:bg-[var(--dk-elevated)] text-[var(--dk-text-1)]' : 'hover:bg-gray-100 text-gray-600'}`}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 2: EXAMS & RECITATIONS ARCHIVE (ITEMS) ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'items' && !selectedItem && (
        <div className="space-y-5">
          {/* Quick Summary KPIs for Items */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'إجمالي الاختبارات', value: totalItemsExamsCount, icon: FileText, color: 'from-orange-500 to-amber-500', text: 'text-orange-500' },
              { label: 'إجمالي التسميعات', value: totalItemsRecsCount,  icon: GraduationCap, color: 'from-purple-500 to-indigo-500', text: 'text-purple-500' },
              { label: 'الطلاب المستهدفون', value: totalItemsTargeted,   icon: Users, color: 'from-blue-500 to-blue-600', text: 'text-blue-500' },
              { label: 'الطلاب المؤدون', value: totalItemsAttended,   icon: Award, color: 'from-green-500 to-emerald-600', text: 'text-green-500' },
            ].map(({ label, value, icon: Icon, color, text }) => (
              <div key={label} className={`relative overflow-hidden rounded-2xl border p-4 ${card} shadow-sm`}>
                <div className={`absolute -top-4 -left-4 w-12 h-12 rounded-full opacity-10 bg-gradient-to-br ${color}`} />
                <Icon className={`w-4 h-4 mb-1.5 ${text}`} />
                <p className={`text-2xl font-black ${textPrimary}`}>{itemsLoading ? '…' : value}</p>
                <p className={`text-[11px] font-semibold mt-0.5 ${textSec}`}>{label}</p>
              </div>
            ))}
          </div>

          {/* Filters & Search for Items */}
          <div className={`rounded-2xl border p-5 shadow-sm space-y-4 ${card}`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-orange-500" />
                <span className={`text-sm font-bold ${textPrimary}`}>فلاتر الاختبارات والتسميعات</span>
              </div>
              {(itemsSearch || itemsType !== 'all' || itemsStage || itemsPublished !== 'all' || itemsSort !== 'date') && (
                <button
                  onClick={() => {
                    setItemsSearch('');
                    setItemsType('all');
                    setItemsStage('');
                    setItemsPublished('all');
                    setItemsSort('date');
                  }}
                  className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border transition cursor-pointer ${
                    dark ? 'border-red-900/40 text-red-400 hover:bg-red-950/20' : 'border-red-200 text-red-500 hover:bg-red-50'
                  }`}
                >
                  <RotateCcw className="w-3 h-3" />
                  إعادة ضبط الفلاتر
                </button>
              )}
            </div>

            {/* Row 1: Search */}
            <div>
              <label className={`block text-[10px] font-black uppercase tracking-wide mb-1.5 ${textSec}`}>بحث بالعنوان أو اسم الكورس</label>
              <div className="relative">
                <Search className="absolute top-1/2 -translate-y-1/2 right-3 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="ابحث عن اختبار أو تسميع..."
                  value={itemsSearch}
                  onChange={e => setItemsSearch(e.target.value)}
                  className={`w-full pr-9 pl-3 py-2.5 text-xs rounded-xl border focus:outline-none focus:ring-2 ${inputCls}`}
                />
                {itemsSearch && (
                  <button onClick={() => setItemsSearch('')} className="absolute top-1/2 -translate-y-1/2 left-3 text-gray-400 hover:text-red-400 transition-colors">
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Row 2: Type Filter */}
            <div>
              <label className={`block text-[10px] font-black uppercase tracking-wide mb-1.5 ${textSec}`}>النوع</label>
              <PillGroup options={ITEM_TYPE_OPTIONS} value={itemsType} onChange={setItemsType} dark={dark} />
            </div>

            {/* Row 3: Stage Filter */}
            {filterOptions?.stages?.length > 0 && (
              <div>
                <label className={`block text-[10px] font-black uppercase tracking-wide mb-1.5 ${textSec}`}>المرحلة الدراسية</label>
                <PillGroup
                  options={[{ value: '', label: 'كل المراحل' }, ...(filterOptions.stages.map(s => ({ value: s, label: s })))]}
                  value={itemsStage}
                  onChange={setItemsStage}
                  dark={dark}
                />
              </div>
            )}

            {/* Row 4: Publish Status & Sorting */}
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
              <div>
                <label className={`block text-[10px] font-black uppercase tracking-wide mb-1.5 ${textSec}`}>حالة النشر</label>
                <PillGroup options={ITEM_PUBLISHED_OPTIONS} value={itemsPublished} onChange={setItemsPublished} dark={dark} />
              </div>

              <div className="flex items-center gap-1.5 self-end">
                <span className={`text-[11px] font-bold whitespace-nowrap ${textSec}`}>ترتيب حسب:</span>
                <select
                  value={itemsSort}
                  onChange={e => setItemsSort(e.target.value)}
                  className={`text-xs rounded-xl border px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-orange-400 ${selectCls}`}
                >
                  <option value="date">تاريخ الإنشاء</option>
                  <option value="title">العنوان</option>
                  <option value="targeted">عدد المستهدفين</option>
                  <option value="score">متوسط الدرجات</option>
                </select>
                <button
                  onClick={() => setItemsOrder(o => o === 'asc' ? 'desc' : 'asc')}
                  title={itemsOrder === 'asc' ? 'تصاعدي' : 'تنازلي'}
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center transition ${selectCls} hover:border-orange-400 cursor-pointer`}
                >
                  {itemsOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Items Cards List / Grid */}
          {itemsLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
            </div>
          ) : itemsList.length === 0 ? (
            <div className={`rounded-2xl border p-12 flex flex-col items-center justify-center gap-3 ${card}`}>
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-50'}`}>
                <Layers className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-sm font-bold text-gray-400">لا توجد اختبارات أو تسميعات مطابقة للبحث</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {itemsList.map(it => {
                const isExam = it.item_type === 'exam';
                const courseOrStage = it.course_name && it.course_name !== '—'
                  ? it.course_name
                  : (it.academic_stage || it.course_target_stage || 'عام');

                const totalTargeted = Number(it.total_targeted) || 0;
                const attendedCount = Number(it.attended_count) || 0;
                const passedCount = Number(it.passed_count) || 0;
                const failedCount = Number(it.failed_count) || 0;
                const absentCount = Number(it.absent_count) || 0;

                const passPct = totalTargeted > 0 ? Math.round((passedCount / totalTargeted) * 100) : 0;
                const failPct = totalTargeted > 0 ? Math.round((failedCount / totalTargeted) * 100) : 0;
                const absPct  = totalTargeted > 0 ? Math.round((absentCount / totalTargeted) * 100) : 0;

                return (
                  <div
                    key={`${it.item_type}-${it.id}`}
                    onClick={() => setSelectedItem(it)}
                    className={`rounded-2xl border p-5 transition-all duration-200 cursor-pointer group flex flex-col justify-between ${card} hover:border-orange-400 hover:shadow-md`}
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                            isExam ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300' : 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300'
                          }`}>
                            {isExam ? '📄 اختبار' : '📚 تسميع'}
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            it.is_published ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                          }`}>
                            {it.is_published ? '● منشور' : '○ مغلق'}
                          </span>
                        </div>

                        <span className={`text-[10px] font-bold truncate max-w-[120px] ${dark ? 'text-blue-300' : 'text-blue-700'}`}>
                          {courseOrStage}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className={`text-sm font-black mb-2 group-hover:text-orange-500 transition-colors line-clamp-2 ${textPrimary}`}>
                        {it.title}
                      </h3>

                      {/* Meta Info */}
                      <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-4 flex-wrap">
                        <span>الدرجة: <strong className={textPrimary}>{it.pass_score}/{it.total_score}</strong></span>
                        <span>•</span>
                        <span>المستهدفون: <strong className={textPrimary}>{totalTargeted} طالب</strong></span>
                      </div>

                      {/* Mini Breakdown Stats */}
                      <div className={`p-3 rounded-xl border mb-3 space-y-2 ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)]' : 'bg-gray-50 border-gray-100'}`}>
                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div>
                            <p className="text-[10px] font-bold text-green-600">ناجح</p>
                            <p className={`font-black text-xs ${textPrimary}`}>{passedCount}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-red-500">راسب</p>
                            <p className={`font-black text-xs ${textPrimary}`}>{failedCount}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-amber-500">غائب</p>
                            <p className={`font-black text-xs ${textPrimary}`}>{absentCount}</p>
                          </div>
                        </div>

                        {/* Visual Breakdown Bar */}
                        <div className="w-full h-2 rounded-full overflow-hidden flex bg-gray-200 dark:bg-gray-700">
                          {passPct > 0 && <div className="bg-green-500 h-full" style={{ width: `${passPct}%` }} title={`ناجح: ${passPct}%`} />}
                          {failPct > 0 && <div className="bg-red-500 h-full" style={{ width: `${failPct}%` }} title={`راسب: ${failPct}%`} />}
                          {absPct > 0 && <div className="bg-amber-400 h-full" style={{ width: `${absPct}%` }} title={`غائب: ${absPct}%`} />}
                        </div>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between pt-2 border-t dark:border-[var(--dk-border)] border-gray-100">
                      <button
                        onClick={(e) => handleQuickPrintItem(e, it)}
                        className={`p-2 rounded-xl text-xs font-bold border transition flex items-center gap-1 cursor-pointer ${
                          dark ? 'border-[var(--dk-border)] text-[var(--dk-text-2)] hover:text-white hover:bg-[var(--dk-elevated)]' : 'border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                        title="طباعة تقرير هذا الاختبار"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span className="text-[10px]">طباعة</span>
                      </button>

                      <div className="flex items-center gap-1 text-xs font-bold text-orange-500 group-hover:translate-x-[-2px] transition-transform">
                        <span>عرض النتائج</span>
                        <ChevronLeft className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      </>
      )}

      {/* ── Student Profile Modal ── */}
      {selectedStudent && (
        <StudentArchiveModal
          student={selectedStudent}
          onClose={() => setSelectedStudent(null)}
          mode="both"
        />
      )}
    </div>
  );
}
