import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, ShieldAlert, Search, Filter, Printer, Users,
  XCircle, AlertTriangle, Clock, Eye, X as XIcon, BookOpen
} from 'lucide-react';
import api from '../../lib/api';
import StudentProfileModal from '../../components/ui/StudentProfileModal';

const STAGES = [
  'الكل',
  'الصف الأول الثانوي','الصف الثاني الثانوي','الصف الثالث الثانوي',
  'الصف الأول الإعدادي','الصف الثاني الإعدادي','الصف الثالث الإعدادي',
  'جامعي'
];

const RISK_TYPES = [
  { value: 'all',      label: 'كل المخاطر' },
  { value: 'exam',     label: 'ضعف في الاختبارات' },
  { value: 'video',    label: 'ضعف في المشاهدة' },
  { value: 'inactive', label: 'غياب / خمول' },
];

const SORT_OPTIONS = [
  { value: 'exam_asc',  label: 'أدنى أداء اختبارات' },
  { value: 'exam_desc', label: 'أعلى أداء اختبارات' },
  { value: 'video_asc', label: 'أدنى مشاهدة' },
  { value: 'name',      label: 'الاسم' },
  { value: 'courses',   label: 'الأكثر كورسات' },
];

function RiskBadge({ type, value }) {
  if (type === 'exam')
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-rose-500 bg-rose-50 dark:bg-rose-900/30 px-2 py-0.5 rounded-full">
        <XCircle className="w-3 h-3" />اختبارات: {value}%
      </span>
    );
  if (type === 'video')
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-amber-500 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
        <AlertTriangle className="w-3 h-3" />مشاهدة: {value}%
      </span>
    );
  if (type === 'inactive')
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
        <Clock className="w-3 h-3" />خامل
      </span>
    );
  return null;
}

export default function AtRiskStudentsPage() {
  const navigate = useNavigate();
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('الكل');
  const [riskType, setRiskType] = useState('all');
  const [sortBy, setSortBy] = useState('exam_asc');
  const [showFilters, setShowFilters] = useState(false);

  const { data: atRiskData = [], isLoading } = useQuery({
    queryKey: ['teacher-at-risk'],
    queryFn: () => api.get('/teachers/at-risk-students').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    let list = [...atRiskData];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(s => s.name?.toLowerCase().includes(q));
    }
    if (stageFilter !== 'الكل') {
      list = list.filter(s => s.academic_stage === stageFilter);
    }
    if (riskType === 'exam')     list = list.filter(s => s.exam_risk);
    if (riskType === 'video')    list = list.filter(s => s.video_risk);
    if (riskType === 'inactive') list = list.filter(s => s.inactive_risk);

    list.sort((a, b) => {
      if (sortBy === 'exam_asc')  return (parseFloat(a.avg_exam_pct)||100) - (parseFloat(b.avg_exam_pct)||100);
      if (sortBy === 'exam_desc') return (parseFloat(b.avg_exam_pct)||0)   - (parseFloat(a.avg_exam_pct)||0);
      if (sortBy === 'video_asc') return (parseFloat(a.avg_video_pct)||100) - (parseFloat(b.avg_video_pct)||100);
      if (sortBy === 'name')      return (a.name||'').localeCompare(b.name||'', 'ar');
      if (sortBy === 'courses')   return (parseInt(b.enrolled_courses)||0) - (parseInt(a.enrolled_courses)||0);
      return 0;
    });
    return list;
  }, [atRiskData, search, stageFilter, riskType, sortBy]);

  // Risk type counts
  const examRiskCount     = atRiskData.filter(s => s.exam_risk).length;
  const videoRiskCount    = atRiskData.filter(s => s.video_risk).length;
  const inactiveRiskCount = atRiskData.filter(s => s.inactive_risk).length;

  const hasActiveFilter = search || stageFilter !== 'الكل' || riskType !== 'all' || sortBy !== 'exam_asc';

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6 print:overflow-visible print:h-auto">
      <style>{`
        @media print {
          nav, aside, button, .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <div className="space-y-5 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 no-print">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/teacher/analytics')}
              className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-all">
              <ArrowRight className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-xl font-black text-gray-800 dark:text-gray-100 flex items-center gap-2">
                <ShieldAlert className="w-6 h-6 text-rose-500" />
                الطلاب في خطر — تقرير تفصيلي
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {filtered.length} طالب من أصل {atRiskData.length} يحتاجون انتباهاً خاصاً
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-900/30 hover:bg-rose-100 border border-rose-100 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-sm font-bold transition-all">
              <Printer className="w-4 h-4" />
              طباعة التقرير
            </button>
            <button onClick={() => setShowFilters(f => !f)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-bold transition-all
                ${showFilters || hasActiveFilter
                  ? 'bg-rose-600 border-rose-600 text-white'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-rose-300'
                }`}>
              <Filter className="w-4 h-4" />
              فلاتر
              {hasActiveFilter && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
            </button>
          </div>
        </div>

        {/* Print header */}
        <div className="hidden print:block mb-4">
          <h1 className="text-2xl font-black text-gray-800">تقرير الطلاب في خطر</h1>
          <p className="text-sm text-gray-500">{new Date().toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' })}</p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'إجمالي في خطر',     value: atRiskData.length,   color: '#f43f5e', bg: 'bg-rose-50 dark:bg-rose-900/30',   icon: ShieldAlert },
            { label: 'ضعف اختبارات',       value: examRiskCount,       color: '#f43f5e', bg: 'bg-red-50 dark:bg-red-900/30',     icon: XCircle },
            { label: 'ضعف مشاهدة',         value: videoRiskCount,      color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-900/30', icon: AlertTriangle },
            { label: 'غياب / خمول',        value: inactiveRiskCount,   color: '#94a3b8', bg: 'bg-gray-100 dark:bg-gray-700',    icon: Clock },
          ].map(({ label, value, color, bg, icon: Icon }) => (
            <div key={label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
              <div>
                <p className="text-xl font-black" style={{ color }}>{value}</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 font-semibold">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 space-y-4 no-print">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ابحث باسم الطالب..."
                className="w-full pr-9 pl-10 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100 dark:focus:ring-rose-900/30 transition"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <XIcon className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">نوع الخطر</label>
                <select value={riskType} onChange={e => setRiskType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 focus:outline-none focus:border-rose-300 transition">
                  {RISK_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">المرحلة الدراسية</label>
                <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 focus:outline-none focus:border-rose-300 transition">
                  {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">ترتيب حسب</label>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 focus:outline-none focus:border-rose-300 transition">
                  {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            {hasActiveFilter && (
              <button onClick={() => { setSearch(''); setStageFilter('الكل'); setRiskType('all'); setSortBy('exam_asc'); }}
                className="flex items-center gap-1.5 text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors">
                <XIcon className="w-3.5 h-3.5" />مسح الفلاتر
              </button>
            )}
          </div>
        )}

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_,i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-1/3 mb-2" />
                <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded animate-pulse w-1/4" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 text-center py-16 px-6">
            <ShieldAlert className="w-14 h-14 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-700 dark:text-gray-300 font-bold text-lg mb-1">لا توجد نتائج</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              {hasActiveFilter ? 'جرّب تغيير الفلاتر' : 'لا يوجد طلاب في خطر حالياً — أداء ممتاز!'}
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-rose-400 via-orange-400 to-amber-400" />
            <div className="divide-y divide-gray-50 dark:divide-gray-700">
              {filtered.map((s, i) => {
                const examPct  = s.avg_exam_pct  !== null ? Math.round(parseFloat(s.avg_exam_pct))  : null;
                const videoPct = Math.round(parseFloat(s.avg_video_pct) || 0);
                const lastAct  = s.last_activity
                  ? new Date(s.last_activity).toLocaleDateString('ar-EG', { year:'numeric', month:'short', day:'numeric' })
                  : 'لا يوجد';
                const riskCount = (s.exam_risk ? 1 : 0) + (s.video_risk ? 1 : 0) + (s.inactive_risk ? 1 : 0);
                return (
                  <div key={s.id}
                    onClick={() => setSelectedStudentId(s.id)}
                    className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50/70 dark:hover:bg-gray-700/40 transition-colors cursor-pointer">
                    {/* Rank */}
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black text-white flex-shrink-0 bg-rose-400">
                      {i+1}
                    </span>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{s.name}</p>
                        {s.academic_stage && (
                          <span className="text-[10px] font-medium text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                            {s.academic_stage}
                          </span>
                        )}
                        {riskCount >= 2 && (
                          <span className="text-[10px] font-black text-white bg-rose-500 px-2 py-0.5 rounded-full">
                            خطر مرتفع
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {s.exam_risk    && examPct !== null && <RiskBadge type="exam"     value={examPct} />}
                        {s.video_risk                       && <RiskBadge type="video"    value={videoPct} />}
                        {s.inactive_risk                    && <RiskBadge type="inactive" />}
                      </div>
                    </div>
                    {/* Stats */}
                    <div className="flex-shrink-0 text-right hidden sm:block">
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 font-bold">{s.exams_taken} اختبار</p>
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">{s.enrolled_courses} كورس</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">آخر نشاط: {lastAct}</p>
                    </div>
                    <Eye className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-3 bg-gray-50/50 dark:bg-gray-700/30 border-t border-gray-100 dark:border-gray-700 text-center">
              <p className="text-xs text-gray-400 font-medium">يُعرض {filtered.length} طالب</p>
            </div>
          </div>
        )}
      </div>

      {selectedStudentId && (
        <StudentProfileModal
          studentId={selectedStudentId}
          onClose={() => setSelectedStudentId(null)}
        />
      )}
    </div>
  );
}
