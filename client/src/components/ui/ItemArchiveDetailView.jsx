import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../context/ThemeContext';
import {
  ArrowRight, Search, Printer, Users, CheckCircle, XCircle,
  AlertTriangle, RotateCcw, Eye, ChevronDown, ChevronUp,
  FileText, GraduationCap, Clock, Award, History, X
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { generatePDFReport } from '../../lib/pdfReport';
import StudentArchiveModal from './StudentArchiveModal';

const SORT_OPTIONS = [
  { value: 'name',     label: 'الاسم (أ–ي)' },
  { value: 'score',    label: 'الدرجة' },
  { value: 'status',   label: 'الحالة' },
  { value: 'attempts', label: 'عدد المحاولات' },
  { value: 'date',     label: 'تاريخ الأداء' },
];

export default function ItemArchiveDetailView({ item, onBack, onOpenStudent }) {
  const { dark } = useTheme();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [viewingAttemptsStudent, setViewingAttemptsStudent] = useState(null);
  const [selectedStudentModal, setSelectedStudentModal] = useState(null);

  const handleOpenStudent = (st) => {
    const studentPayload = { id: st.student_id || st.id, name: st.student_name || st.name };
    setSelectedStudentModal(studentPayload);
    if (onOpenStudent) {
      onOpenStudent(studentPayload);
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['archive-item-students', item.item_type, item.id, { search, statusFilter, sortBy, sortOrder }],
    queryFn: () => api.get(`/archive/item/${item.item_type}/${item.id}/students`, {
      params: {
        q: search,
        status: statusFilter,
        sort: sortBy,
        order: sortOrder,
      }
    }).then(r => r.data),
    staleTime: 60 * 1000,
  });

  const fullItem = data?.item || item;
  const students = data?.students || [];

  const isExam = item.item_type === 'exam';

  // Handle Full Print Report
  const handlePrintReport = () => {
    if (!students.length) {
      toast.error('لا توجد بيانات للطباعة');
      return;
    }

    const typeLabel = isExam ? 'اختبار' : 'تسميع';
    const courseOrStage = fullItem.course_name && fullItem.course_name !== '—'
      ? fullItem.course_name
      : (fullItem.academic_stage || fullItem.course_target_stage || 'كل المراحل');
    const pubLabel = fullItem.is_published ? 'منشور' : 'غير منشور / مغلق';

    generatePDFReport(
      `تقرير نتائج ${typeLabel}: ${fullItem.title}`,
      ['اسم الطالب', 'كود الطالب', 'المرحلة الدراسية', 'الحالة', 'الدرجة', 'النسبة', 'المحاولات', 'تاريخ الأداء'],
      students.map(st => {
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
      `${fullItem.item_type}-${fullItem.id}-report.pdf`,
      {
        subtitle: `المرحلة / الكورس: ${courseOrStage} | درجة النجاح: ${fullItem.pass_score}/${fullItem.total_score} | الحالة: ${pubLabel} | إجمالي المستهدفين: ${fullItem.total_targeted} طالب`,
        stats: [
          { label: 'الطلاب المستهدفون', value: fullItem.total_targeted || students.length, color: '#1e3a5f' },
          { label: 'حضروا / أدوا', value: fullItem.attended_count || 0, color: '#0284c7' },
          { label: 'الناجحون', value: fullItem.passed_count || 0, color: '#16a34a' },
          { label: 'الراسبون', value: fullItem.failed_count || 0, color: '#dc2626' },
          { label: 'الغائبون', value: fullItem.absent_count || 0, color: '#d97706' },
          { label: 'متوسط الدرجات', value: `${fullItem.avg_pct || 0}%`, color: '#7c3aed' },
        ],
        note: `تم استخراج هذا التقرير لجميع الطلاب الموجه إليهم هذا ال${typeLabel}. الطلاب الذين لم يؤدوا أو تم إلغاء النشر يظهرون بحالة "غائب".`,
      }
    );
  };

  const card = dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border)]' : 'bg-white border-gray-100';
  const textPrimary = dark ? 'text-[var(--dk-text-1)]' : 'text-gray-800';
  const textSec = dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500';
  const inputCls = dark
    ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text-1)] placeholder-gray-500 focus:ring-orange-400'
    : 'bg-white border-gray-200 text-gray-800 placeholder-gray-400 focus:ring-orange-400';
  const selectCls = dark
    ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text-1)]'
    : 'bg-white border-gray-200 text-gray-700';

  const courseOrStage = fullItem.course_name && fullItem.course_name !== '—'
    ? fullItem.course_name
    : (fullItem.academic_stage || fullItem.course_target_stage || 'عام');

  return (
    <div className="space-y-5" dir="rtl">
      {/* ── Top Bar & Actions ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={onBack}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition ${
            dark
              ? 'bg-[var(--dk-surface)] border-[var(--dk-border)] text-[var(--dk-text-1)] hover:bg-[var(--dk-elevated)]'
              : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
          }`}
        >
          <ArrowRight className="w-4 h-4" />
          العودة لقائمة الاختبارات والتسميعات
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrintReport}
            disabled={isLoading || students.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-orange-500 to-purple-600 text-white hover:opacity-90 transition disabled:opacity-40 shadow-sm cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            طباعة تقرير شامل (PDF)
          </button>
        </div>
      </div>

      {/* ── Item Header Banner ── */}
      <div className={`rounded-2xl border p-5 ${card} shadow-sm relative overflow-hidden`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white flex-shrink-0 ${
              isExam ? 'bg-gradient-to-br from-orange-500 to-amber-600' : 'bg-gradient-to-br from-purple-500 to-indigo-600'
            }`}>
              {isExam ? <FileText className="w-6 h-6" /> : <GraduationCap className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                  isExam ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300' : 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300'
                }`}>
                  {isExam ? '📄 اختبار' : '📚 تسميع'}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                  fullItem.is_published ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                }`}>
                  {fullItem.is_published ? '● منشور حالياً' : '○ غير منشور / مغلق'}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${dark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
                  {courseOrStage}
                </span>
              </div>
              <h2 className={`text-lg font-black ${textPrimary}`}>{fullItem.title}</h2>
              <div className="flex items-center gap-3 text-xs mt-1 text-gray-500 flex-wrap">
                <span>الدرجة الكلية: <strong className={textPrimary}>{fullItem.total_score}</strong></span>
                <span>•</span>
                <span>درجة النجاح: <strong className="text-green-600">{fullItem.pass_score}</strong></span>
                {fullItem.duration_minutes && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-gray-400" />
                      {fullItem.duration_minutes} دقيقة
                    </span>
                  </>
                )}
                {fullItem.created_at && (
                  <>
                    <span>•</span>
                    <span>تاريخ الإنشاء: {new Date(fullItem.created_at).toLocaleDateString('ar-EG')}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 5 Stats KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'الطلاب المستهدفون', value: fullItem.total_targeted ?? '…', icon: Users, color: 'from-blue-500 to-blue-600', text: 'text-blue-600', sub: 'إجمالي الموجه لهم' },
          { label: 'الناجحون', value: fullItem.passed_count ?? '…', icon: CheckCircle, color: 'from-green-500 to-green-600', text: 'text-green-600', sub: fullItem.total_targeted > 0 ? `${Math.round(((fullItem.passed_count || 0) / fullItem.total_targeted) * 100)}% من المستهدفين` : '—' },
          { label: 'الراسبون', value: fullItem.failed_count ?? '…', icon: XCircle, color: 'from-red-500 to-red-600', text: 'text-red-600', sub: fullItem.total_targeted > 0 ? `${Math.round(((fullItem.failed_count || 0) / fullItem.total_targeted) * 100)}% من المستهدفين` : '—' },
          { label: 'الغائبون', value: fullItem.absent_count ?? '…', icon: AlertTriangle, color: 'from-amber-500 to-amber-600', text: 'text-amber-600', sub: fullItem.total_targeted > 0 ? `${Math.round(((fullItem.absent_count || 0) / fullItem.total_targeted) * 100)}% من المستهدفين` : '—' },
          { label: 'متوسط الدرجات', value: `${fullItem.avg_pct ?? 0}%`, icon: Award, color: 'from-purple-500 to-purple-600', text: 'text-purple-600', sub: `المتوسط: ${fullItem.avg_score ?? 0} / ${fullItem.total_score}` },
        ].map(({ label, value, icon: Icon, color, text, sub }) => (
          <div key={label} className={`relative overflow-hidden rounded-2xl border p-4 ${card} shadow-sm`}>
            <div className={`absolute -top-4 -left-4 w-12 h-12 rounded-full opacity-10 bg-gradient-to-br ${color}`} />
            <Icon className={`w-4 h-4 mb-1.5 ${text}`} />
            <p className={`text-xl font-black ${textPrimary}`}>{isLoading ? '…' : value}</p>
            <p className={`text-[11px] font-bold mt-0.5 ${textSec}`}>{label}</p>
            <p className={`text-[10px] mt-0.5 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Filters & Search ── */}
      <div className={`rounded-2xl border p-4 shadow-sm space-y-3 ${card}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Status Filter Pills */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'all',     label: `الكل (${fullItem.total_targeted || students.length})` },
              { id: 'passed',  label: `✅ الناجحون (${fullItem.passed_count || 0})` },
              { id: 'failed',  label: `❌ الراسبون (${fullItem.failed_count || 0})` },
              { id: 'absent',  label: `⚠️ الغائبون (${fullItem.absent_count || 0})` },
              { id: 'retried', label: `🔄 أعادوا الاختبار (${fullItem.retried_count || 0})` },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border whitespace-nowrap cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                    : dark
                      ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text-2)] hover:text-[var(--dk-text-1)]'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-orange-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Reset Filters */}
          {(search || statusFilter !== 'all' || sortBy !== 'name') && (
            <button
              onClick={() => { setSearch(''); setStatusFilter('all'); setSortBy('name'); }}
              className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-xl border transition cursor-pointer ${
                dark ? 'border-red-900/40 text-red-400 hover:bg-red-950/20' : 'border-red-200 text-red-500 hover:bg-red-50'
              }`}
            >
              <RotateCcw className="w-3 h-3" />
              إعادة ضبط الفلاتر
            </button>
          )}
        </div>

        {/* Search & Sort Row */}
        <div className="flex items-center gap-3 flex-wrap pt-1">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute top-1/2 -translate-y-1/2 right-3 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="بحث باسم الطالب أو كود الدخول..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`w-full pr-9 pl-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-2 ${inputCls}`}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute top-1/2 -translate-y-1/2 left-3 text-gray-400 hover:text-red-400">
                ×
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span className={`text-[11px] font-bold whitespace-nowrap ${textSec}`}>ترتيب:</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className={`text-xs rounded-xl border px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-orange-400 ${selectCls}`}
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button
              onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
              title={sortOrder === 'asc' ? 'تصاعدي' : 'تنازلي'}
              className={`w-8 h-8 rounded-xl border flex items-center justify-center transition ${selectCls} hover:border-orange-400 cursor-pointer`}
            >
              {sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* ── Students Results Table ── */}
      <div className={`rounded-2xl border shadow-sm overflow-hidden ${card}`}>
        <div className={`px-5 py-3.5 flex items-center justify-between gap-2 border-b ${dark ? 'border-[var(--dk-border)]' : 'border-gray-100'}`}>
          <p className={`text-sm font-bold ${textPrimary}`}>
            {isLoading ? 'جاري التحميل...' : `عرض ${students.length} طالب`}
          </p>
          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
            dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-gray-100 text-gray-600'
          }`}>
            الدرجة الكلية: {fullItem.total_score} | درجة النجاح: {fullItem.pass_score}
          </span>
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
            <p className="text-sm font-bold text-gray-400">لا يوجد طلاب يطابقون الفلاتر المحددة</p>
            {(search || statusFilter !== 'all') && (
              <button
                onClick={() => { setSearch(''); setStatusFilter('all'); }}
                className="text-xs font-bold text-orange-500 hover:underline cursor-pointer"
              >
                إزالة الفلاتر
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className={dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-50'}>
                    {['#', 'الطالب', 'كود الطالب', 'المرحلة الدراسية', 'الحالة والنتيجة', 'الدرجة', 'المحاولات', 'تاريخ الأداء', ''].map(h => (
                      <th key={h} className={`px-4 py-3 text-right font-black text-[10px] uppercase tracking-wide ${textSec}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-[var(--dk-border)]">
                  {students.map((st, idx) => {
                    const isAbsent = st.status === 'absent';
                    const isPassed = st.status === 'passed';
                    const isFailed = st.status === 'failed';
                    const hasRetried = st.attempts_count > 1;

                    return (
                      <tr
                        key={st.student_id}
                        onClick={() => handleOpenStudent(st)}
                        className={`transition-colors group cursor-pointer ${
                          dark ? 'hover:bg-[var(--dk-elevated)]' : 'hover:bg-orange-50/20'
                        }`}
                      >
                        <td className={`px-4 py-3 font-mono text-[11px] ${textSec}`}>{idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-purple-500 flex items-center justify-center text-white text-xs font-black flex-shrink-0">
                              {st.student_name?.charAt(0) || 'ط'}
                            </div>
                            <div>
                              <p className={`font-bold group-hover:text-orange-500 transition-colors ${textPrimary}`}>{st.student_name}</p>
                              {st.phone && <p className={`text-[10px] ${textSec}`}>{st.phone}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-mono font-bold text-xs ${textPrimary}`}>{st.student_username || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[11px] font-medium ${textSec}`}>{st.academic_stage || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          {isPassed && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300">
                              <CheckCircle className="w-3 h-3" />
                              ناجح
                            </span>
                          )}
                          {isFailed && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300">
                              <XCircle className="w-3 h-3" />
                              راسب
                            </span>
                          )}
                          {isAbsent && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                              <AlertTriangle className="w-3 h-3" />
                              غائب
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {!isAbsent && st.score !== null ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className={`font-black text-xs ${isPassed ? 'text-green-600' : 'text-red-500'}`}>
                                  {st.score} / {fullItem.total_score}
                                </span>
                                <span className={`text-[10px] font-bold ${textSec}`}>({st.percentage}%)</span>
                              </div>
                              <div className={`w-20 h-1.5 rounded-full overflow-hidden ${dark ? 'bg-gray-700' : 'bg-gray-200'}`}>
                                <div
                                  className={`h-full rounded-full ${isPassed ? 'bg-green-500' : 'bg-red-500'}`}
                                  style={{ width: `${Math.min(100, Math.max(0, st.percentage || 0))}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className={`text-[11px] ${textSec}`}>—</span>
                          )}
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          {!isAbsent ? (
                            hasRetried ? (
                              <button
                                onClick={() => setViewingAttemptsStudent(st)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black border transition cursor-pointer ${
                                  dark
                                    ? 'bg-purple-950/40 border-purple-800 text-purple-300 hover:bg-purple-900/40'
                                    : 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100'
                                }`}
                                title="عرض تفاصيل المحاولات"
                              >
                                <History className="w-3 h-3 text-purple-500" />
                                أعاد ({st.attempts_count} محاولات)
                              </button>
                            ) : (
                              <span className={`text-[11px] font-semibold ${textSec}`}>محاولة 1</span>
                            )
                          ) : (
                            <span className={`text-[11px] ${textSec}`}>—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {st.submitted_at ? (
                            <span className={`text-[11px] ${textSec}`}>
                              {new Date(st.submitted_at).toLocaleDateString('ar-EG')}
                            </span>
                          ) : (
                            <span className={`text-[11px] ${textSec}`}>—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenStudent(st);
                            }}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              dark ? 'text-gray-500 hover:text-orange-400 hover:bg-[var(--dk-elevated)]' : 'text-gray-400 hover:text-orange-500 hover:bg-orange-50'
                            }`}
                            title="عرض سجل الطالب الشامل"
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
            <div className="md:hidden divide-y divide-gray-100 dark:divide-[var(--dk-border)]">
              {students.map((st) => {
                const isAbsent = st.status === 'absent';
                const isPassed = st.status === 'passed';
                const isFailed = st.status === 'failed';
                const hasRetried = st.attempts_count > 1;

                return (
                  <div
                    key={st.student_id}
                    onClick={() => handleOpenStudent(st)}
                    className="p-4 space-y-3 cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-purple-500 flex items-center justify-center text-white text-xs font-black flex-shrink-0">
                          {st.student_name?.charAt(0) || 'ط'}
                        </div>
                        <div>
                          <p className={`font-black text-sm ${textPrimary}`}>{st.student_name}</p>
                          <p className={`text-[10px] font-mono ${textSec}`}>{st.student_username || '—'}</p>
                        </div>
                      </div>

                      <div>
                        {isPassed && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300">
                            <CheckCircle className="w-3 h-3" />
                            ناجح
                          </span>
                        )}
                        {isFailed && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300">
                            <XCircle className="w-3 h-3" />
                            راسب
                          </span>
                        )}
                        {isAbsent && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                            <AlertTriangle className="w-3 h-3" />
                            غائب
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                      <div className={`p-2 rounded-xl border ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)]' : 'bg-gray-50 border-gray-100'}`}>
                        <p className={`text-[10px] ${textSec}`}>الدرجة والنسبة</p>
                        <p className={`font-bold mt-0.5 ${!isAbsent && st.score !== null ? (isPassed ? 'text-green-600' : 'text-red-500') : textSec}`}>
                          {!isAbsent && st.score !== null ? `${st.score}/${fullItem.total_score} (${st.percentage}%)` : '—'}
                        </p>
                      </div>

                      <div className={`p-2 rounded-xl border ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)]' : 'bg-gray-50 border-gray-100'}`}>
                        <p className={`text-[10px] ${textSec}`}>عدد المحاولات</p>
                        <div className="mt-0.5">
                          {hasRetried ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewingAttemptsStudent(st);
                              }}
                              className="text-[10px] font-black text-purple-600 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <History className="w-2.5 h-2.5" />
                              أعاد ({st.attempts_count} مرات)
                            </button>
                          ) : (
                            <p className={`font-bold ${textPrimary}`}>{!isAbsent ? 'محاولة 1' : '—'}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1">
                      <span className={textSec}>المرحلة: {st.academic_stage || '—'}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenStudent(st);
                        }}
                        className="text-xs font-bold text-orange-500 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        عرض السجل الكامل
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Attempts History Modal ── */}
      {viewingAttemptsStudent && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className={`w-full max-w-md rounded-2xl border shadow-2xl p-5 ${card} space-y-4`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-purple-500" />
                <div>
                  <h3 className={`text-sm font-black ${textPrimary}`}>سجل محاولات الطالب</h3>
                  <p className={`text-xs font-semibold ${textSec}`}>{viewingAttemptsStudent.student_name}</p>
                </div>
              </div>
              <button
                onClick={() => setViewingAttemptsStudent(null)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-[var(--dk-border)] max-h-72 overflow-y-auto">
              {(viewingAttemptsStudent.attempts || []).map((att, idx) => (
                <div key={att.id || idx} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="font-black text-orange-500">
                        محاولة #{att.attempt_number || idx + 1}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        att.passed ? 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                      }`}>
                        {att.passed ? 'ناجح' : 'راسب'}
                      </span>
                    </div>
                    <p className={`text-[10px] ${textSec}`}>
                      {att.created_at ? new Date(att.created_at).toLocaleString('ar-EG') : '—'}
                    </p>
                  </div>
                  <div className="text-left">
                    <p className={`text-sm font-black ${att.passed ? 'text-green-600' : 'text-red-500'}`}>
                      {att.score} / {fullItem.total_score}
                    </p>
                    <p className={`text-[10px] font-bold ${textSec}`}>{att.percentage}%</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setViewingAttemptsStudent(null)}
              className="w-full py-2.5 rounded-xl text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:opacity-80 transition cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* ── Student Profile Modal ── */}
      {selectedStudentModal && (
        <StudentArchiveModal
          student={selectedStudentModal}
          onClose={() => setSelectedStudentModal(null)}
          mode="both"
        />
      )}
    </div>
  );
}
