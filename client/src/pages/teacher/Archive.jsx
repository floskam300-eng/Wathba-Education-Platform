import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useTheme } from '../../context/ThemeContext';
import {
  Archive, Search, ChevronDown, ChevronUp, Users,
  FileText, GraduationCap, BarChart3,
  CheckCircle2, XCircle, SlidersHorizontal,
  ChevronRight, ChevronLeft, Eye, RotateCcw,
} from 'lucide-react';
import api from '../../lib/api';
import StudentArchiveModal from '../../components/ui/StudentArchiveModal';

const SORT_OPTIONS = [
  { value: 'name',        label: 'الاسم أبجدياً' },
  { value: 'exams',       label: 'عدد الاختبارات' },
  { value: 'recitations', label: 'عدد التسميع' },
  { value: 'score',       label: 'متوسط الدرجات' },
];
const PAGE_SIZES = [25, 50, 100];

const PassBar = ({ passed, total, dark }) => {
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
  const color = pct >= 60 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className={`w-16 h-1.5 rounded-full overflow-hidden flex-shrink-0 ${dark ? 'bg-gray-700' : 'bg-gray-200'}`}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={`text-[10px] font-bold whitespace-nowrap ${pct >= 60 ? 'text-green-600' : pct >= 40 ? 'text-amber-500' : 'text-red-500'}`}>
        {passed}/{total}
      </span>
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

export default function ArchivePage() {
  const { dark } = useTheme();
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [filters, setFilters] = useState({
    q: '', stage: '', sort: 'name', order: 'asc', page: 1, limit: 50,
  });

  const setF = useCallback((key, val) => {
    setFilters(f => ({ ...f, [key]: val, page: key !== 'page' ? 1 : val }));
  }, []);

  const { data: filterOptions } = useQuery({
    queryKey: ['archive-filters'],
    queryFn: () => api.get('/archive/filters').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const params = useMemo(() => {
    const p = { sort: filters.sort, order: filters.order, page: filters.page, limit: filters.limit };
    if (filters.q.trim()) p.q = filters.q.trim();
    if (filters.stage) p.stage = filters.stage;
    return p;
  }, [filters]);

  const { data, isLoading } = useQuery({
    queryKey: ['archive-students', params],
    queryFn: () => api.get('/archive/students', { params }).then(r => r.data),
    placeholderData: keepPreviousData,
  });

  const students    = data?.students || [];
  const totalCount  = data?.total ?? 0;
  const totalPages  = data ? Math.ceil(data.total / filters.limit) : 1;

  const totalExams = useMemo(() =>
    students.reduce((s, st) => s + Number(st.total_exams), 0), [students]);
  const totalRecs = useMemo(() =>
    students.reduce((s, st) => s + Number(st.total_recitations), 0), [students]);

  const card       = dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border)]' : 'bg-white border-gray-100';
  const textPrimary = dark ? 'text-[var(--dk-text-1)]' : 'text-gray-800';
  const textSec    = dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500';
  const inputCls   = dark
    ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text-1)] placeholder-gray-500 focus:ring-orange-400'
    : 'bg-white border-gray-200 text-gray-800 placeholder-gray-400 focus:ring-orange-400';

  return (
    <div className="space-y-5" dir="rtl">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-orange-500 flex items-center justify-center flex-shrink-0">
          <Archive className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className={`text-xl font-black ${textPrimary}`}>أرشيف النتائج</h1>
          <p className={`text-xs font-medium ${textSec}`}>دليل طلابك — كل طالب مرة واحدة مع كامل سجله</p>
        </div>
      </div>

      {/* ── Quick Stats ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'طالب لديه نتائج', value: totalCount, icon: Users,          color: 'from-blue-500 to-blue-600' },
          { label: 'اختبار مؤدّى',    value: totalExams, icon: FileText,        color: 'from-orange-500 to-orange-600' },
          { label: 'تسميع مؤدّى',     value: totalRecs,  icon: GraduationCap,   color: 'from-purple-500 to-purple-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className={`relative overflow-hidden rounded-2xl border p-4 ${card} shadow-sm`}>
            <div className={`absolute -top-5 -left-5 w-16 h-16 rounded-full opacity-10 bg-gradient-to-br ${color}`} />
            <p className={`text-2xl font-black ${textPrimary}`}>{isLoading ? '…' : value}</p>
            <p className={`text-[11px] font-semibold mt-0.5 ${textSec}`}>{label}</p>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className={`rounded-2xl border shadow-sm overflow-hidden ${card}`}>
        <button
          onClick={() => setFiltersOpen(v => !v)}
          className={`w-full flex items-center justify-between px-5 py-4 text-sm font-bold transition-colors ${dark ? 'hover:bg-[var(--dk-elevated)]' : 'hover:bg-gray-50'}`}
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-orange-500" />
            <span className={textPrimary}>البحث والفلاتر</span>
          </div>
          {filtersOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {filtersOpen && (
          <div className={`px-5 pb-5 pt-3 border-t ${dark ? 'border-[var(--dk-border)]' : 'border-gray-100'}`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

              {/* Search */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-gray-500 mb-1">بحث باسم الطالب</label>
                <div className="relative">
                  <Search className="absolute top-1/2 -translate-y-1/2 right-3 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="اكتب اسم الطالب أو كود الدخول..."
                    value={filters.q}
                    onChange={e => setF('q', e.target.value)}
                    className={`w-full pr-9 pl-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-2 ${inputCls}`}
                  />
                </div>
              </div>

              {/* Stage */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">المرحلة الدراسية</label>
                <select
                  value={filters.stage}
                  onChange={e => setF('stage', e.target.value)}
                  className={`w-full text-xs rounded-xl border px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-orange-400 ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text-1)]' : 'bg-white border-gray-200 text-gray-700'}`}
                >
                  <option value="">كل المراحل</option>
                  {(filterOptions?.stages || []).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Sort */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">ترتيب حسب</label>
                <div className="flex gap-1">
                  <select
                    value={filters.sort}
                    onChange={e => setF('sort', e.target.value)}
                    className={`flex-1 text-xs rounded-xl border px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-orange-400 ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text-1)]' : 'bg-white border-gray-200 text-gray-700'}`}
                  >
                    {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <button
                    onClick={() => setF('order', filters.order === 'asc' ? 'desc' : 'asc')}
                    title={filters.order === 'asc' ? 'تصاعدي' : 'تنازلي'}
                    className={`px-2 rounded-xl border transition ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text-1)]' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    {filters.order === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Reset + page size row */}
            <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
              <button
                onClick={() => setFilters({ q: '', stage: '', sort: 'name', order: 'asc', page: 1, limit: 50 })}
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition ${dark ? 'text-gray-400 hover:text-red-400 hover:bg-red-900/20' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}
              >
                <RotateCcw className="w-3 h-3" /> إعادة الضبط
              </button>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${textSec}`}>عدد في الصفحة:</span>
                <select
                  value={String(filters.limit)}
                  onChange={e => setF('limit', Number(e.target.value))}
                  className={`text-xs rounded-xl border px-2 py-1 focus:outline-none ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text-1)]' : 'bg-white border-gray-200 text-gray-700'}`}
                >
                  {PAGE_SIZES.map(n => <option key={n} value={n}>{n} طالب</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Results Table ── */}
      <div className={`rounded-2xl border shadow-sm overflow-hidden ${card}`}>
        <div className={`px-5 py-4 flex items-center justify-between border-b ${dark ? 'border-[var(--dk-border)]' : 'border-gray-100'}`}>
          <p className={`text-sm font-bold ${textPrimary}`}>
            {isLoading ? 'جاري التحميل...' : `${students.length} طالب معروض من أصل ${totalCount}`}
          </p>
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
            <p className="text-sm font-bold text-gray-400">لا يوجد طلاب بنتائج تطابق البحث</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className={dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-50'}>
                    {['الطالب', 'المرحلة', 'الاختبارات', 'التسميع', 'متوسط الاختبارات', 'متوسط التسميع', ''].map(h => (
                      <th key={h} className={`px-4 py-3 text-right font-black ${textSec}`}>{h}</th>
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
                        className={`border-t transition-colors cursor-pointer ${dark ? 'border-[var(--dk-border)] hover:bg-[var(--dk-elevated)]' : 'border-gray-50 hover:bg-orange-50/30'}`}
                        onClick={() => setSelectedStudent({ id: st.id, name: st.name })}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-purple-500 flex items-center justify-center text-white text-xs font-black flex-shrink-0">
                              {st.name?.charAt(0)}
                            </div>
                            <div>
                              <p className={`font-bold ${textPrimary}`}>{st.name}</p>
                              <p className={`text-[10px] ${textSec}`}>{st.username}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StageBadge stage={st.academic_stage} dark={dark} />
                        </td>
                        <td className="px-4 py-3">
                          {Number(st.total_exams) > 0
                            ? <PassBar passed={Number(st.passed_exams)} total={Number(st.total_exams)} dark={dark} />
                            : <span className={`text-[10px] ${textSec}`}>لا يوجد</span>}
                        </td>
                        <td className="px-4 py-3">
                          {Number(st.total_recitations) > 0
                            ? <PassBar passed={Number(st.passed_recitations)} total={Number(st.total_recitations)} dark={dark} />
                            : <span className={`text-[10px] ${textSec}`}>لا يوجد</span>}
                        </td>
                        <td className="px-4 py-3">
                          {Number(st.total_exams) > 0 ? (
                            <span className={`font-bold text-xs ${examPct >= 60 ? 'text-green-600' : 'text-red-500'}`}>{examPct}%</span>
                          ) : <span className={`text-[10px] ${textSec}`}>—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {Number(st.total_recitations) > 0 ? (
                            <span className={`font-bold text-xs ${recPct >= 60 ? 'text-green-600' : 'text-red-500'}`}>{recPct}%</span>
                          ) : <span className={`text-[10px] ${textSec}`}>—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={e => { e.stopPropagation(); setSelectedStudent({ id: st.id, name: st.name }); }}
                            className={`p-1.5 rounded-lg transition-colors ${dark ? 'hover:bg-[var(--dk-surface)] text-gray-400 hover:text-orange-400' : 'hover:bg-orange-50 text-gray-400 hover:text-orange-500'}`}
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
                    className={`w-full px-4 py-4 text-right flex items-center gap-3 transition-colors ${dark ? 'hover:bg-[var(--dk-elevated)]' : 'hover:bg-orange-50/30'}`}
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
                        {Number(st.total_exams) > 0 && (
                          <div className="flex items-center gap-1">
                            <FileText className="w-3 h-3 text-orange-400 flex-shrink-0" />
                            <span className={`text-[10px] font-bold ${examPct >= 60 ? 'text-green-600' : 'text-red-500'}`}>
                              {st.passed_exams}/{st.total_exams} اختبار ({examPct}%)
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => setF('page', filters.page - 1)}
                disabled={filters.page <= 1}
                className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${dark ? 'hover:bg-[var(--dk-elevated)] text-[var(--dk-text-1)]' : 'hover:bg-gray-100 text-gray-600'}`}
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
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${pg === filters.page
                      ? 'bg-orange-500 text-white'
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
                className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${dark ? 'hover:bg-[var(--dk-elevated)] text-[var(--dk-text-1)]' : 'hover:bg-gray-100 text-gray-600'}`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Student Archive Modal — always opens in 'both' mode (full student profile) */}
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
