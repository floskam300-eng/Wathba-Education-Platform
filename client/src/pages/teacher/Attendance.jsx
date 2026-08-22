import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Users, Video, CheckCircle2, Circle, XCircle, BookOpen, Download, Info,
  Search, ChevronLeft, ChevronRight, ArrowUpDown, SlidersHorizontal,
  TrendingUp, TrendingDown, SortAsc, SortDesc, Hash, RotateCcw,
  GraduationCap, PlayCircle, Eye, Check, X, Filter,
} from 'lucide-react';
import api from '../../lib/api';
import { useTheme } from '../../context/ThemeContext';
import useUrlState from '../../hooks/useUrlState';

const PRESENT_THRESHOLD = 70;
const PARTIAL_THRESHOLD = 20;

/**
 * الحساب الصحيح لنسبة المشاهدة الفعلية لفيديو واحد.
 *
 * الأولوية:
 *  1. actual_watched_seconds ÷ مدة الفيديو بالثواني (مقيّد بـ 100%)
 *     — يعكس الوقت الفعلي الذي أمضاه الطالب في المشاهدة
 *     — لا يكافئ التخطي السريع (skip)
 *  2. progress_percentage (أعلى موضع وصل إليه)
 *     — احتياطي إذا لم تتوفر بيانات actual_watched_seconds
 */
function effectivePct(videoId, p, durMap) {
  if (!p) return 0;
  const durSec = (durMap?.[videoId] || 0) * 60;
  const actualSec = p.actual_watched_seconds || 0;
  if (durSec > 0 && actualSec > 0) {
    return Math.min(100, Math.round((actualSec / durSec) * 100));
  }
  return Math.min(100, Math.round(p.progress_percentage || 0));
}

function getStatus(pct) {
  if (pct >= PRESENT_THRESHOLD) return 'present';
  if (pct >= PARTIAL_THRESHOLD) return 'partial';
  return 'absent';
}

const StatusIcon = ({ status }) => {
  if (status === 'present') return <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto" />;
  if (status === 'partial') return <Circle className="w-5 h-5 text-yellow-500 mx-auto" />;
  return <XCircle className="w-5 h-5 text-red-400 mx-auto" />;
};

export default function Attendance() {
  const { dark } = useTheme();
  const [selectedCourse, setSelectedCourse] = useUrlState('course', '');

  // ── Filters & Sorting State (URL-synced so they survive back-navigation) ──
  const [searchQ, setSearchQ] = useUrlState('q', '');
  const [sortBy, setSortBy] = useUrlState('sort', 'most_watched');
  const [statusFilter, setStatusFilter] = useUrlState('status', 'all');
  const [stageFilter, setStageFilter] = useUrlState('stage', 'الكل');
  const [selectedVideoFilter, setSelectedVideoFilter] = useUrlState('video', 'all');
  const [videoStatusFilter, setVideoStatusFilter] = useUrlState('vstatus', 'all');
  const [pageSize, setPageSize] = useState(25); // 25 | 50 | 100 | -1 (all)
  const [page, setPage] = useUrlState('page', 1, { parse: Number });

  const { data: courses, isLoading: loadingCourses } = useQuery({
    queryKey: ['courses-list'],
    queryFn: () => api.get('/courses').then(r => r.data),
  });

  const { data: attendance, isLoading: loadingAttendance } = useQuery({
    queryKey: ['attendance', selectedCourse],
    queryFn: () => api.get(`/students/attendance/${selectedCourse}`).then(r => r.data),
    enabled: !!selectedCourse,
  });

  /* خريطة مدد الفيديوهات: { videoId → duration_minutes } */
  const durMap = useMemo(() => {
    const m = {};
    attendance?.videos?.forEach(v => { m[v.id] = v.duration_minutes || 0; });
    return m;
  }, [attendance?.videos]);

  /**
   * متوسط نسبة المشاهدة الفعلية للطالب على كل فيديوهات الكورس.
   */
  const getStudentAttendancePct = (studentId) => {
    if (!attendance?.videos?.length) return 0;
    const total = attendance.videos.reduce((sum, v) => {
      const p = attendance.progressMap[studentId]?.[v.id];
      return sum + effectivePct(v.id, p, durMap);
    }, 0);
    return Math.round(total / attendance.videos.length);
  };

  /**
   * إجمالي الدقائق الفعلية التي شاهدها الطالب في الكورس
   */
  const getStudentWatchedMinutes = (studentId) => {
    if (!attendance?.videos?.length) return 0;
    return attendance.videos.reduce((sum, v) => {
      const p = attendance.progressMap[studentId]?.[v.id];
      const actualSec = p?.actual_watched_seconds || 0;
      return sum + Math.round(actualSec / 60);
    }, 0);
  };

  /* قائمة المراحل الدراسية المتوفرة للطلاب في هذا الكورس */
  const availableStages = useMemo(() => {
    if (!attendance?.students) return ['الكل'];
    const stages = Array.from(new Set(attendance.students.map(s => s.academic_stage).filter(Boolean)));
    return ['الكل', ...stages];
  }, [attendance?.students]);

  /* إحصائيات عامة لكامل الكورس */
  const avgAttendance = useMemo(() => {
    if (!attendance?.students?.length) return 0;
    const sum = attendance.students.reduce((s, st) => s + getStudentAttendancePct(st.id), 0);
    return Math.round(sum / attendance.students.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendance, durMap]);

  const fullyPresentCount = useMemo(() => {
    if (!attendance?.students?.length) return 0;
    return attendance.students.filter(st => getStudentAttendancePct(st.id) >= PRESENT_THRESHOLD).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendance, durMap]);

  const partialCount = useMemo(() => {
    if (!attendance?.students?.length) return 0;
    return attendance.students.filter(st => {
      const pct = getStudentAttendancePct(st.id);
      return pct >= PARTIAL_THRESHOLD && pct < PRESENT_THRESHOLD;
    }).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendance, durMap]);

  const zeroWatchCount = useMemo(() => {
    if (!attendance?.students?.length) return 0;
    return attendance.students.filter(st => getStudentAttendancePct(st.id) === 0).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendance, durMap]);

  /* ── تطبيق الفلاتر والترتيب ── */
  const filteredStudents = useMemo(() => {
    if (!attendance?.students) return [];
    let list = [...attendance.students];

    // 1. البحث بالنص (الاسم، كود الطالب، المرحلة)
    const q = searchQ.trim().toLowerCase();
    if (q) {
      list = list.filter(s =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.username || '').toLowerCase().includes(q) ||
        (s.academic_stage || '').toLowerCase().includes(q)
      );
    }

    // 2. فلتر المرحلة الدراسية
    if (stageFilter !== 'الكل') {
      list = list.filter(s => s.academic_stage === stageFilter);
    }

    // 3. فلتر حالة الحضور الإجمالية
    if (statusFilter !== 'all') {
      list = list.filter(s => {
        const pct = getStudentAttendancePct(s.id);
        if (statusFilter === 'present') return pct >= PRESENT_THRESHOLD;
        if (statusFilter === 'partial') return pct >= PARTIAL_THRESHOLD && pct < PRESENT_THRESHOLD;
        if (statusFilter === 'absent') return pct < PARTIAL_THRESHOLD;
        if (statusFilter === 'zero') return pct === 0;
        return true;
      });
    }

    // 4. فلتر فيديو محدد
    if (selectedVideoFilter !== 'all') {
      const vId = parseInt(selectedVideoFilter, 10);
      list = list.filter(s => {
        const p = attendance.progressMap[s.id]?.[vId];
        const pct = effectivePct(vId, p, durMap);
        if (videoStatusFilter === 'present') return pct >= PRESENT_THRESHOLD;
        if (videoStatusFilter === 'partial') return pct >= PARTIAL_THRESHOLD && pct < PRESENT_THRESHOLD;
        if (videoStatusFilter === 'absent') return pct < PARTIAL_THRESHOLD;
        if (videoStatusFilter === 'zero') return pct === 0;
        return true;
      });
    }

    // 5. الترتيب
    list.sort((a, b) => {
      const pctA = getStudentAttendancePct(a.id);
      const pctB = getStudentAttendancePct(b.id);

      if (sortBy === 'most_watched') {
        if (pctB !== pctA) return pctB - pctA; // الأكثر مشاهدة أولاً
        return (a.name || '').localeCompare(b.name || '', 'ar');
      }
      if (sortBy === 'least_watched') {
        if (pctA !== pctB) return pctA - pctB; // الأقل مشاهدة أولاً
        return (a.name || '').localeCompare(b.name || '', 'ar');
      }
      if (sortBy === 'name_asc') {
        return (a.name || '').localeCompare(b.name || '', 'ar');
      }
      if (sortBy === 'name_desc') {
        return (b.name || '').localeCompare(a.name || '', 'ar');
      }
      if (sortBy === 'code_asc') {
        return (a.username || '').localeCompare(b.username || '', 'ar', { numeric: true });
      }
      return 0; // Default
    });

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendance, searchQ, stageFilter, statusFilter, selectedVideoFilter, videoStatusFilter, sortBy, durMap]);

  // هل توجد فلاتر نشطة؟
  const hasActiveFilters = Boolean(
    searchQ.trim() ||
    sortBy !== 'most_watched' ||
    statusFilter !== 'all' ||
    stageFilter !== 'الكل' ||
    selectedVideoFilter !== 'all' ||
    videoStatusFilter !== 'all' ||
    pageSize !== 25
  );

  const resetAllFilters = () => {
    setSearchQ('');
    setSortBy('most_watched');
    setStatusFilter('all');
    setStageFilter('الكل');
    setSelectedVideoFilter('all');
    setVideoStatusFilter('all');
    setPageSize(25);
    setPage(1);
  };

  /* التصفح Pagination */
  const effectivePageSize = pageSize === -1 ? (filteredStudents.length || 1) : pageSize;
  const totalPages = Math.ceil(filteredStudents.length / effectivePageSize) || 1;
  const currentPage = Math.min(page, totalPages);
  const pagedStudents = pageSize === -1
    ? filteredStudents
    : filteredStudents.slice((currentPage - 1) * effectivePageSize, currentPage * effectivePageSize);

  // Reset page when filters change
  const handleCourseChange = (val) => {
    setSelectedCourse(val);
    resetAllFilters();
  };

  const handleSearch = (val) => {
    setSearchQ(val);
    setPage(1);
  };

  /* متوسط المشاهدة للطلاب المعروضين بعد الفلترة */
  const filteredAvg = useMemo(() => {
    if (!filteredStudents.length) return 0;
    const sum = filteredStudents.reduce((s, st) => s + getStudentAttendancePct(st.id), 0);
    return Math.round(sum / filteredStudents.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredStudents, durMap]);

  /* تصدير CSV مع دعم الفلترة */
  const exportCSV = (onlyFiltered = false) => {
    if (!attendance) return;
    const { videos, progressMap } = attendance;
    const exportList = onlyFiltered ? filteredStudents : attendance.students;
    const header = ['م', 'الطالب', 'كود الطالب', 'المرحلة', ...videos.map(v => v.title), 'إجمالي الدقائق', 'متوسط المشاهدة %', 'الحالة'];
    const rows = exportList.map((s, i) => {
      const pcts = videos.map(v => {
        const p = progressMap[s.id]?.[v.id];
        return effectivePct(v.id, p, durMap);
      });
      const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
      const labels = pcts.map(pct => {
        const st = getStatus(pct);
        return st === 'present' ? 'حاضر' : st === 'partial' ? 'جزئي' : 'غائب';
      });
      const overallStatus = avg >= PRESENT_THRESHOLD ? 'حاضر' : avg >= PARTIAL_THRESHOLD ? 'جزئي' : 'غائب';
      const watchedMins = getStudentWatchedMinutes(s.id);
      return [i + 1, s.name, s.username || '', s.academic_stage || '', ...labels, `${watchedMins} د`, `${avg}%`, overallStatus];
    });
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const courseStage = attendance.course?.target_stage || courses?.find(c => String(c.id) === String(selectedCourse))?.target_stage;
    const courseStageLabel = courseStage ? `_${courseStage}` : '';
    a.download = `سجل_مشاهدة_${attendance.course?.name || 'كورس'}${courseStageLabel}${onlyFiltered ? '_مصفى' : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* ── عنوان الصفحة ── */}
      <div className="page-header flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-navy-700 dark:text-gray-100 flex items-center gap-2">
            <Video className="w-6 h-6 text-orange-600" />
            سجل مشاهدة الكورسات
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">تتبع تقدم الطلاب في مشاهدة فيديوهات كل كورس مع فلاتر وإحصائيات متقدمة</p>
        </div>
        {attendance && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportCSV(hasActiveFilters)}
              className="btn-secondary flex items-center gap-2 text-xs sm:text-sm font-bold shadow-sm"
              title="تصدير بيانات المشاهدة الحالية إلى ملف Excel / CSV"
            >
              <Download className="w-4 h-4" />
              <span>تصدير CSV {hasActiveFilters && '(المصفى)'}</span>
            </button>
            {hasActiveFilters && (
              <button
                onClick={() => exportCSV(false)}
                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-navy-700 hover:bg-gray-50 dark:hover:bg-navy-800 text-xs font-semibold text-gray-600 dark:text-gray-300 transition-colors"
                title="تصدير جميع طلاب الكورس بالكامل"
              >
                تصدير الكل
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── اختيار الكورس ── */}
      <div className="card">
        <label className="block text-sm font-bold text-navy-700 dark:text-gray-200 mb-2">
          <BookOpen className="w-4 h-4 inline ml-1.5 text-orange-600" />
          اختر الكورس
        </label>
        {loadingCourses ? (
          <div className="h-11 bg-gray-100 dark:bg-navy-800 animate-pulse rounded-xl" />
        ) : (
          <select
            value={selectedCourse}
            onChange={e => handleCourseChange(e.target.value)}
            className="input-field cursor-pointer font-bold text-sm"
          >
            <option value="">— اختر كورساً لعرض سجل مشاهدة الفيديوهات —</option>
            {courses?.map(c => {
              const stage = c.target_stage || c.academic_stage;
              return (
                <option key={c.id} value={c.id}>
                  {c.name}{stage ? ` (${stage})` : ''} — {c.enrolled_count || 0} طالب
                </option>
              );
            })}
          </select>
        )}
      </div>

      {!selectedCourse && (
        <div className="card text-center py-16 text-gray-500 dark:text-gray-400">
          <div className="w-16 h-16 rounded-2xl bg-orange-50 dark:bg-navy-800 text-orange-600 mx-auto flex items-center justify-center mb-3">
            <Video className="w-8 h-8" />
          </div>
          <p className="font-bold text-lg text-navy-700 dark:text-gray-200">اختر كورساً لعرض سجل الحضور والمشاهدات</p>
          <p className="text-xs text-gray-400 mt-1">ستتمكن من فلترة الطلاب بحسب الأكثر مشاهدة، الأقل، أو الترتيب الأبجدي ومتابعة تفاعلهم</p>
        </div>
      )}

      {selectedCourse && loadingAttendance && (
        <div className="card">
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 dark:bg-navy-800 animate-pulse rounded-xl" />
            ))}
          </div>
        </div>
      )}

      {attendance && !loadingAttendance && (
        <>
          {/* ── كروت الإحصائيات ── */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <div className="card text-center !p-3 sm:!p-4 bg-gradient-to-br from-navy-50 to-navy-100/50 dark:from-navy-900/60 dark:to-navy-800/40 border-navy-200/60 dark:border-navy-700">
              <div className="flex items-center justify-center gap-1.5 text-navy-700 dark:text-navy-300 mb-1">
                <Users className="w-4 h-4" />
                <span className="text-[11px] sm:text-xs font-bold">إجمالي الطلاب</span>
              </div>
              <p className="text-xl sm:text-2xl font-black text-navy-800 dark:text-white">
                {attendance.students.length}
              </p>
              {hasActiveFilters && filteredStudents.length !== attendance.students.length && (
                <p className="text-[10px] text-navy-600 dark:text-navy-400 font-semibold mt-0.5">
                  (المعروض: {filteredStudents.length})
                </p>
              )}
            </div>

            <div className="card text-center !p-3 sm:!p-4 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/40 dark:to-blue-900/30 border-blue-200/60 dark:border-blue-800/40">
              <div className="flex items-center justify-center gap-1.5 text-blue-700 dark:text-blue-300 mb-1">
                <PlayCircle className="w-4 h-4" />
                <span className="text-[11px] sm:text-xs font-bold">الفيديوهات</span>
              </div>
              <p className="text-xl sm:text-2xl font-black text-blue-700 dark:text-blue-300">
                {attendance.videos.length}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                {attendance.videos.reduce((s, v) => s + (v.duration_minutes || 0), 0)} دقيقة إجمالية
              </p>
            </div>

            <div className="card text-center !p-3 sm:!p-4 bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/40 dark:to-green-900/30 border-green-200/60 dark:border-green-800/40">
              <div className="flex items-center justify-center gap-1.5 text-green-700 dark:text-green-300 mb-1">
                <TrendingUp className="w-4 h-4" />
                <span className="text-[11px] sm:text-xs font-bold">متوسط المشاهدة</span>
              </div>
              <p className="text-xl sm:text-2xl font-black text-green-700 dark:text-green-300">
                {hasActiveFilters ? `${filteredAvg}%` : `${avgAttendance}%`}
              </p>
              {hasActiveFilters && (
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                  (الكلي: {avgAttendance}%)
                </p>
              )}
            </div>

            <div className="card text-center !p-3 sm:!p-4 bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/40 dark:to-emerald-900/30 border-emerald-200/60 dark:border-emerald-800/40">
              <div className="flex items-center justify-center gap-1.5 text-emerald-700 dark:text-emerald-300 mb-1">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-[11px] sm:text-xs font-bold">حضور كامل (≥70%)</span>
              </div>
              <p className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-300">
                {fullyPresentCount}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                {attendance.students.length ? Math.round((fullyPresentCount / attendance.students.length) * 100) : 0}% من الطلاب
              </p>
            </div>

            <div className="card text-center !p-3 sm:!p-4 bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/40 dark:to-red-900/30 border-red-200/60 dark:border-red-800/40 col-span-2 lg:col-span-1">
              <div className="flex items-center justify-center gap-1.5 text-red-700 dark:text-red-300 mb-1">
                <XCircle className="w-4 h-4" />
                <span className="text-[11px] sm:text-xs font-bold">لم يشاهدوا (0%)</span>
              </div>
              <p className="text-xl sm:text-2xl font-black text-red-700 dark:text-red-300">
                {zeroWatchCount}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                يحتاجون لمتابعة وتنبيه
              </p>
            </div>
          </div>

          {/* ── لوحة الفلاتر والترتيب المتقدمة ── */}
          <div className="card space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 dark:border-navy-700 pb-3">
              <div className="flex items-center gap-2 text-navy-700 dark:text-gray-200">
                <SlidersHorizontal className="w-4 h-4 text-orange-600" />
                <span className="font-black text-sm">فلاتر وخيارات الترتيب</span>
                <span className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 font-bold px-2 py-0.5 rounded-full">
                  {filteredStudents.length} طالب
                </span>
              </div>
              {hasActiveFilters && (
                <button
                  onClick={resetAllFilters}
                  className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-red-700 dark:text-red-400 transition-colors self-end sm:self-auto"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  إعادة تعيين الفلاتر
                </button>
              )}
            </div>

            {/* صف الفلاتر الأساسية */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* البحث */}
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQ}
                  onChange={e => handleSearch(e.target.value)}
                  placeholder="ابحث بالاسم أو الكود..."
                  className="w-full pr-9 pl-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-navy-700 bg-gray-50 dark:bg-navy-900 focus:outline-none focus:ring-2 focus:ring-orange-400 text-navy-700 dark:text-gray-100 placeholder-gray-400"
                  dir="rtl"
                />
                {searchQ && (
                  <button
                    onClick={() => handleSearch('')}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* الترتيب (أكثر مشاهدة / أقل / أبجدي) */}
              <div>
                <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1">
                  <ArrowUpDown className="w-3 h-3 inline ml-1 text-orange-600" />
                  ترتيب حسب:
                </label>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  className="w-full py-2 px-3 text-xs font-bold rounded-xl border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-900 text-navy-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-400 cursor-pointer"
                  dir="rtl"
                >
                  <option value="most_watched">🔥 أكثر الطلاب مشاهدة (من الأعلى للأقل)</option>
                  <option value="least_watched">📉 أقل الطلاب مشاهدة (من الأقل للأعلى)</option>
                  <option value="name_asc">🔤 أبجدياً (أ ← ي)</option>
                  <option value="name_desc">🔤 أبجدياً عكسي (ي ← أ)</option>
                  <option value="code_asc">🔢 حسب كود الطالب (A ← Z)</option>
                  <option value="default">📋 الترتيب الافتراضي (قائمة الكورس)</option>
                </select>
              </div>

              {/* فلتر حالة المشاهدة */}
              <div>
                <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1">
                  <CheckCircle2 className="w-3 h-3 inline ml-1 text-green-600" />
                  حالة المشاهدة الإجمالية:
                </label>
                <select
                  value={statusFilter}
                  onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                  className="w-full py-2 px-3 text-xs font-bold rounded-xl border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-900 text-navy-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-400 cursor-pointer"
                  dir="rtl"
                >
                  <option value="all">الكل (جميع الطلاب)</option>
                  <option value="present">🟢 حضور كامل (≥ 70% مشاهدة)</option>
                  <option value="partial">🟡 مشاهدة جزئية (20% - 69%)</option>
                  <option value="absent">🔴 غياب أو مشاهدة ضعيفة (&lt; 20%)</option>
                  <option value="zero">⛔ لم يشاهد أي دقيقة (0%)</option>
                </select>
              </div>

              {/* فلتر المرحلة الدراسية (إن وجدت مراحل متعددة) */}
              <div>
                <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1">
                  <GraduationCap className="w-3 h-3 inline ml-1 text-blue-600" />
                  المرحلة الدراسية:
                </label>
                <select
                  value={stageFilter}
                  onChange={e => { setStageFilter(e.target.value); setPage(1); }}
                  className="w-full py-2 px-3 text-xs font-bold rounded-xl border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-900 text-navy-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-400 cursor-pointer"
                  dir="rtl"
                >
                  {availableStages.map(st => (
                    <option key={st} value={st}>{st === 'الكل' ? 'الكل (جميع المراحل)' : st}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* صف الفلاتر الإضافية (فيديو محدد + عدد العناصر بالصفحة) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2 border-t border-gray-50 dark:border-navy-800">
              {/* فلتر حسب فيديو محدد */}
              <div>
                <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1">
                  <Video className="w-3 h-3 inline ml-1 text-purple-600" />
                  فلترة حسب فيديو محدد:
                </label>
                <select
                  value={selectedVideoFilter}
                  onChange={e => { setSelectedVideoFilter(e.target.value); setPage(1); }}
                  className="w-full py-2 px-3 text-xs font-bold rounded-xl border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-900 text-navy-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-400 cursor-pointer"
                  dir="rtl"
                >
                  <option value="all">جميع فيديوهات الكورس</option>
                  {attendance.videos?.map((v, i) => (
                    <option key={v.id} value={v.id}>
                      فيديو {i + 1}: {v.title} ({v.duration_minutes || 0} د)
                    </option>
                  ))}
                </select>
              </div>

              {/* حالة مشاهدة الفيديو المحدد (تظهر عند اختيار فيديو) */}
              {selectedVideoFilter !== 'all' ? (
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1">
                    حالة مشاهدة هذا الفيديو:
                  </label>
                  <select
                    value={videoStatusFilter}
                    onChange={e => { setVideoStatusFilter(e.target.value); setPage(1); }}
                    className="w-full py-2 px-3 text-xs font-bold rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/30 text-purple-900 dark:text-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400 cursor-pointer"
                    dir="rtl"
                  >
                    <option value="all">الكل لهذا الفيديو</option>
                    <option value="present">🟢 شاهد الفيديو بالكامل (≥ 70%)</option>
                    <option value="partial">🟡 شاهد جزئياً (20% - 69%)</option>
                    <option value="absent">🔴 لم يكمل الفيديو (&lt; 20%)</option>
                    <option value="zero">⛔ لم يفتح هذا الفيديو (0%)</option>
                  </select>
                </div>
              ) : (
                /* عدد الطلاب في الصفحة */
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1">
                    عدد الطلاب في الصفحة:
                  </label>
                  <select
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                    className="w-full py-2 px-3 text-xs font-bold rounded-xl border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-900 text-navy-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-400 cursor-pointer"
                    dir="rtl"
                  >
                    <option value={25}>25 طالب لكل صفحة</option>
                    <option value={50}>50 طالب لكل صفحة</option>
                    <option value={100}>100 طالب لكل صفحة</option>
                    <option value={-1}>عرض جميع الطلاب في صفحة واحدة</option>
                  </select>
                </div>
              )}

              {/* أزرار سريعة للفلترة (Quick Chips) */}
              <div className="sm:col-span-2 lg:col-span-1 flex flex-col justify-end">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => { setSortBy('most_watched'); setStatusFilter('all'); }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      sortBy === 'most_watched' && statusFilter === 'all'
                        ? 'bg-orange-500 text-white shadow-sm'
                        : 'bg-gray-100 dark:bg-navy-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                    }`}
                  >
                    الأكثر مشاهدة
                  </button>
                  <button
                    onClick={() => { setSortBy('least_watched'); setStatusFilter('all'); }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      sortBy === 'least_watched' && statusFilter === 'all'
                        ? 'bg-orange-500 text-white shadow-sm'
                        : 'bg-gray-100 dark:bg-navy-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                    }`}
                  >
                    الأقل مشاهدة
                  </button>
                  <button
                    onClick={() => { setSortBy('name_asc'); }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      sortBy === 'name_asc'
                        ? 'bg-orange-500 text-white shadow-sm'
                        : 'bg-gray-100 dark:bg-navy-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                    }`}
                  >
                    أبجدياً
                  </button>
                  <button
                    onClick={() => { setStatusFilter('zero'); }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      statusFilter === 'zero'
                        ? 'bg-red-600 text-white shadow-sm'
                        : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100'
                    }`}
                  >
                    0% مشاهدة
                  </button>
                </div>
              </div>
            </div>

            {/* شريط الفلاتر النشطة */}
            {hasActiveFilters && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-gray-100 dark:border-navy-700 text-xs">
                <span className="text-gray-400 font-semibold ml-1">الفلاتر المطبقة:</span>
                {searchQ && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 font-bold">
                    بحث: "{searchQ}"
                    <X className="w-3 h-3 cursor-pointer" onClick={() => handleSearch('')} />
                  </span>
                )}
                {sortBy !== 'most_watched' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-bold">
                    ترتيب: {
                      sortBy === 'least_watched' ? 'الأقل مشاهدة' :
                      sortBy === 'name_asc' ? 'أبجدياً أ-ي' :
                      sortBy === 'name_desc' ? 'أبجدياً ي-أ' :
                      sortBy === 'code_asc' ? 'حسب الكود' : 'الافتراضي'
                    }
                    <X className="w-3 h-3 cursor-pointer" onClick={() => setSortBy('most_watched')} />
                  </span>
                )}
                {statusFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-300 font-bold">
                    الحالة: {
                      statusFilter === 'present' ? 'حضور كامل (≥70%)' :
                      statusFilter === 'partial' ? 'مشاهدة جزئية' :
                      statusFilter === 'absent' ? 'مشاهدة ضعيفة' : '0% مشاهدة'
                    }
                    <X className="w-3 h-3 cursor-pointer" onClick={() => setStatusFilter('all')} />
                  </span>
                )}
                {stageFilter !== 'الكل' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 font-bold">
                    المرحلة: {stageFilter}
                    <X className="w-3 h-3 cursor-pointer" onClick={() => setStageFilter('الكل')} />
                  </span>
                )}
                {selectedVideoFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold">
                    فيديو محدد: {attendance.videos?.find(v => v.id === parseInt(selectedVideoFilter, 10))?.title || selectedVideoFilter}
                    <X className="w-3 h-3 cursor-pointer" onClick={() => { setSelectedVideoFilter('all'); setVideoStatusFilter('all'); }} />
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── مفتاح الألوان والإرشادات ── */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <span className="flex items-center gap-1.5 font-bold text-green-700 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4" /> حاضر (≥{PRESENT_THRESHOLD}% مشاهدة فعلية)
            </span>
            <span className="flex items-center gap-1.5 font-bold text-yellow-600 dark:text-yellow-400">
              <Circle className="w-4 h-4" /> جزئي ({PARTIAL_THRESHOLD}–{PRESENT_THRESHOLD - 1}%)
            </span>
            <span className="flex items-center gap-1.5 font-bold text-red-500 dark:text-red-400">
              <XCircle className="w-4 h-4" /> غائب أو لم يشاهد ({'<'}{PARTIAL_THRESHOLD}%)
            </span>
            <span className="flex items-center gap-1.5 text-gray-400 mr-auto">
              <Info className="w-3.5 h-3.5 flex-shrink-0" />
              النسبة = وقت المشاهدة الفعلي الموثّق ÷ مدة الفيديو الأصلية
            </span>
          </div>

          {/* ── جدول نتائج المشاهدات ── */}
          {attendance.students.length === 0 ? (
            <div className="card text-center py-14 text-gray-500 dark:text-gray-400">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-bold text-base">لا يوجد طلاب مسجلون في هذا الكورس بعد</p>
            </div>
          ) : attendance.videos.length === 0 ? (
            <div className="card text-center py-14 text-gray-500 dark:text-gray-400">
              <Video className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-bold text-base">لا يوجد فيديوهات في هذا الكورس بعد</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-14 h-14 rounded-2xl bg-gray-50 dark:bg-navy-800 flex items-center justify-center">
                <Search className="w-7 h-7 text-gray-400" />
              </div>
              <p className="font-bold text-navy-700 dark:text-gray-200">لا توجد نتائج تطابق الفلاتر المحددة</p>
              <p className="text-xs text-gray-400">جرّب تغيير كلمات البحث أو إعادة ضبط خيارات الفلترة</p>
              <button
                onClick={resetAllFilters}
                className="mt-1 text-xs font-bold text-orange-600 hover:underline flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" /> مسح جميع الفلاتر
              </button>
            </div>
          ) : (
            <div className="card !p-0 overflow-visible">
              {/* شريط معلومات الجدول */}
              <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b rounded-t-2xl ${dark ? 'border-[var(--dk-border)] bg-[var(--dk-elevated)]' : 'border-gray-100 bg-gray-50/70'}`}>
                <div className="flex items-center gap-2">
                  <span className="font-black text-xs text-navy-700 dark:text-gray-200">
                    عرض {pagedStudents.length} طالب
                  </span>
                  {filteredStudents.length !== attendance.students.length && (
                    <span className="text-xs text-gray-400 font-semibold">
                      (مصفى من إجمالي {attendance.students.length} طالب)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span>الترتيب: <strong className="text-navy-700 dark:text-gray-200">
                    {sortBy === 'most_watched' ? 'الأكثر مشاهدة' :
                     sortBy === 'least_watched' ? 'الأقل مشاهدة' :
                     sortBy === 'name_asc' ? 'أبجدياً (أ-ي)' :
                     sortBy === 'name_desc' ? 'أبجدياً (ي-أ)' :
                     sortBy === 'code_asc' ? 'كود الطالب' : 'الافتراضي'}
                  </strong></span>
                  {totalPages > 1 && (
                    <span>صفحة {currentPage} من {totalPages}</span>
                  )}
                </div>
              </div>

              <p className="text-[10px] text-gray-400 font-semibold px-4 pt-2 text-center sm:hidden">
                ← اسحب للجانب لرؤية كل الفيديوهات →
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-max">
                  <thead className="bg-navy-600 text-white">
                    <tr>
                      <th className="py-3 px-3 text-center font-bold text-xs w-12">#</th>
                      <th className="py-3 px-4 text-right font-bold sticky right-0 bg-navy-600 z-10 min-w-[170px]">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          الطالب
                        </div>
                      </th>
                      {attendance.videos.map((v, i) => (
                        <th
                          key={v.id}
                          className={`py-3 px-3 text-center font-semibold min-w-[100px] max-w-[140px] transition-colors ${
                            selectedVideoFilter === String(v.id) ? 'bg-purple-700 text-yellow-200' : ''
                          }`}
                        >
                          <div className="truncate text-xs" title={v.title}>
                            {i + 1}. {v.title}
                          </div>
                          {v.duration_minutes > 0 && (
                            <div className="text-navy-200 text-[11px] font-normal">{v.duration_minutes} د</div>
                          )}
                        </th>
                      ))}
                      <th className="py-3 px-4 text-center font-bold min-w-[110px] bg-navy-700 whitespace-nowrap">
                        متوسط المشاهدة
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedStudents.map((student, idx) => {
                      const globalIndex = pageSize === -1 ? idx + 1 : (currentPage - 1) * pageSize + idx + 1;
                      const avgPct = getStudentAttendancePct(student.id);
                      const watchedMins = getStudentWatchedMinutes(student.id);
                      const overallStatus = getStatus(avgPct);

                      return (
                        <tr
                          key={student.id}
                          className={`border-b transition-colors ${
                            dark
                              ? 'border-[var(--dk-border)] hover:bg-[var(--dk-hover)]'
                              : `border-gray-100 hover:bg-orange-50/30 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`
                          }`}
                        >
                          {/* رقم الترتيب */}
                          <td className="py-3 px-3 text-center text-xs font-mono font-bold text-gray-400">
                            {globalIndex}
                          </td>

                          {/* اسم وبيانات الطالب */}
                          <td className={`py-3 px-4 sticky right-0 z-10 ${
                            dark ? 'bg-[var(--dk-surface)]' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                          }`}>
                            <div className="font-bold text-navy-700 dark:text-gray-100 text-sm">
                              {student.name}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {student.username && (
                                <span className="text-[10px] font-mono font-bold text-orange-600 dark:text-orange-400">
                                  {student.username}
                                </span>
                              )}
                              {student.academic_stage && (
                                <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                                  · {student.academic_stage}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* خلايا الفيديوهات */}
                          {attendance.videos.map(v => {
                            const p = attendance.progressMap[student.id]?.[v.id];
                            const pct = effectivePct(v.id, p, durMap);
                            const status = getStatus(pct);
                            const isHighlighted = selectedVideoFilter === String(v.id);

                            return (
                              <td
                                key={v.id}
                                className={`py-3 px-3 text-center transition-colors ${
                                  isHighlighted ? 'bg-purple-50/60 dark:bg-purple-950/20' : ''
                                }`}
                                title={p
                                  ? `مشاهدة فعلية: ${pct}%${p.actual_watched_seconds > 0 ? ` (${Math.round(p.actual_watched_seconds / 60)} دقيقة فعلية)` : ''} · مرات التشغيل: ${p.watch_count || 1}`
                                  : 'لم يشاهد هذا الفيديو بعد'}
                              >
                                <StatusIcon status={status} />
                                {p ? (
                                  <div className="text-[11px] font-bold text-gray-600 dark:text-gray-300 mt-0.5 font-mono">
                                    {pct}%
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-gray-400 mt-0.5">0%</div>
                                )}
                              </td>
                            );
                          })}

                          {/* عمود المتوسط الكلي وشريط التقدم */}
                          <td className={`py-3 px-4 text-center font-bold ${dark ? '' : 'bg-gray-50/80'}`}>
                            <div className="flex flex-col items-center gap-1">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-base font-black font-mono ${
                                  overallStatus === 'present'
                                    ? 'text-green-600 dark:text-green-400'
                                    : overallStatus === 'partial'
                                    ? 'text-yellow-600 dark:text-yellow-400'
                                    : 'text-red-500 dark:text-red-400'
                                }`}>
                                  {avgPct}%
                                </span>
                              </div>

                              {/* شريط تقدم مصغر */}
                              <div className="w-16 h-1.5 rounded-full bg-gray-200 dark:bg-navy-700 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    overallStatus === 'present'
                                      ? 'bg-green-500'
                                      : overallStatus === 'partial'
                                      ? 'bg-yellow-400'
                                      : 'bg-red-400'
                                  }`}
                                  style={{ width: `${avgPct}%` }}
                                />
                              </div>

                              {watchedMins > 0 && (
                                <span className="text-[10px] text-gray-400 font-medium">
                                  {watchedMins} د مشاهدة
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── Pagination ── */}
              {pageSize !== -1 && totalPages > 1 && (
                <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4 border-t ${
                  dark ? 'border-[var(--dk-border)]' : 'border-gray-100'
                }`}>
                  <p className={`text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
                    صفحة <strong className="text-navy-700 dark:text-gray-200">{currentPage}</strong> من <strong>{totalPages}</strong> ({filteredStudents.length} طالب)
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                        dark ? 'hover:bg-[var(--dk-elevated)] text-[var(--dk-text-1)]' : 'hover:bg-gray-100 text-gray-600'
                      }`}
                      title="الصفحة السابقة"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const pg = currentPage <= 3 ? i + 1 : currentPage + i - 2;
                      if (pg < 1 || pg > totalPages) return null;
                      return (
                        <button
                          key={pg}
                          onClick={() => setPage(pg)}
                          className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                            pg === currentPage
                              ? 'bg-orange-500 text-white shadow-sm scale-105'
                              : (dark ? 'hover:bg-[var(--dk-elevated)] text-[var(--dk-text-1)]' : 'hover:bg-gray-100 text-gray-600')
                          }`}
                        >
                          {pg}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                      className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                        dark ? 'hover:bg-[var(--dk-elevated)] text-[var(--dk-text-1)]' : 'hover:bg-gray-100 text-gray-600'
                      }`}
                      title="الصفحة التالية"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
