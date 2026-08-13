import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, ShieldAlert, Search, Filter, Printer, Users,
  XCircle, AlertTriangle, Clock, Eye, X as XIcon, BookOpen
} from 'lucide-react';
import api from '../../lib/api';
import StudentProfileModal from '../../components/ui/StudentProfileModal';
import { useAuth } from '../../context/AuthContext';

const STAGES = [
  'الكل',
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
  const { user } = useAuth();

  const isAssistant = user?.role === 'assistant';
  const backPath    = isAssistant ? '/assistant/analytics' : '/teacher/analytics';

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

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) { alert('يرجى السماح بالنوافذ المنبثقة لاستخدام ميزة الطباعة'); return; }

    const now = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
    const esc = s => String(s ?? '—').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const rows = filtered.map((s, i) => {
      const examPct  = s.avg_exam_pct !== null ? Math.round(parseFloat(s.avg_exam_pct)) : null;
      const videoPct = Math.round(parseFloat(s.avg_video_pct) || 0);
      const lastAct  = s.last_activity ? new Date(s.last_activity).toLocaleDateString('ar-EG') : 'لا يوجد';
      const risks = [
        s.exam_risk     ? `<span style="color:#ef4444">⚠ ضعف اختبارات (${examPct !== null ? examPct+'%' : ''})</span>` : '',
        s.video_risk    ? `<span style="color:#f59e0b">⚠ ضعف مشاهدة (${videoPct}%)</span>`  : '',
        s.inactive_risk ? `<span style="color:#6b7280">⏱ غياب طويل</span>` : '',
      ].filter(Boolean).join(' · ');
      return `<tr>
        <td style="color:#94a3b8;font-size:11px;font-weight:700;text-align:center">${i+1}</td>
        <td><strong>${esc(s.name)}</strong><br><span style="color:#94a3b8;font-size:11px">${esc(s.academic_stage||'')}</span></td>
        <td style="text-align:center;font-family:monospace;font-size:12px">${esc(s.username)}</td>
        <td style="text-align:center">${s.enrolled_courses}</td>
        <td style="text-align:center">${s.exams_taken}</td>
        <td style="text-align:center;font-size:11px">${risks || '—'}</td>
        <td style="text-align:center;font-size:11px;color:#64748b">${lastAct}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head>
      <meta charset="UTF-8"><title>تقرير الطلاب في خطر</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Cairo',Arial,sans-serif;padding:24px;direction:rtl;color:#1e293b;background:#fff}
        .header{display:flex;align-items:center;gap:16px;border-bottom:3px solid #1e3a5f;padding-bottom:16px;margin-bottom:20px}
        .logo{width:44px;height:44px;background:linear-gradient(135deg,#1e3a5f,#2d5080);border-radius:10px;display:flex;align-items:center;justify-content:center;color:#f97316;font-size:20px;font-weight:900;flex-shrink:0}
        .title{font-size:18px;font-weight:900;color:#1e3a5f}
        .meta{margin-right:auto;text-align:left;font-size:11px;color:#94a3b8}
        .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
        .stat{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px;text-align:center}
        .stat-val{font-size:20px;font-weight:900;color:#ef4444}
        .stat-lbl{font-size:11px;color:#94a3b8;margin-top:3px}
        table{width:100%;border-collapse:collapse;border-radius:12px;overflow:hidden}
        thead tr{background:linear-gradient(135deg,#7f1d1d,#b91c1c)}
        th{color:#fff;padding:10px 12px;font-size:12px;font-weight:700;text-align:center;font-family:'Cairo',sans-serif}
        td{padding:9px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;vertical-align:middle}
        tr:nth-child(even) td{background:#fef2f2}
        .footer{margin-top:20px;padding-top:12px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px}
        .no-print{text-align:center;padding:16px 0 8px}
        .btn{padding:10px 28px;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700;font-family:'Cairo',sans-serif;margin:0 6px}
        @media print{.no-print{display:none}body{padding:12px}}
      </style></head><body>
      <div class="header">
        <div class="logo">و</div>
        <div><div class="title">تقرير الطلاب في خطر</div><div style="font-size:12px;color:#64748b;margin-top:3px">منصة وثبة التعليمية</div></div>
        <div class="meta"><div style="font-weight:900;color:#f97316;font-size:13px">منصة وثبة</div><div>${now}</div></div>
      </div>
      <div class="stats">
        <div class="stat"><div class="stat-val">${filtered.length}</div><div class="stat-lbl">إجمالي الطلاب في خطر</div></div>
        <div class="stat"><div class="stat-val" style="color:#ef4444">${examRiskCount}</div><div class="stat-lbl">ضعف في الاختبارات</div></div>
        <div class="stat"><div class="stat-val" style="color:#f59e0b">${videoRiskCount}</div><div class="stat-lbl">ضعف في المشاهدة</div></div>
        <div class="stat"><div class="stat-val" style="color:#6b7280">${inactiveRiskCount}</div><div class="stat-lbl">غياب طويل</div></div>
      </div>
      <table>
        <thead><tr><th>#</th><th>الطالب</th><th>كود الطالب</th><th>كورسات</th><th>اختبارات</th><th>أسباب الخطر</th><th>آخر نشاط</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer">تقرير صادر آلياً من منصة وثبة التعليمية — ${now}</div>
      <div class="no-print">
        <button id="print-report-btn" class="btn" style="background:#ef4444;color:#fff">🖨️ طباعة / حفظ PDF</button>
        <button id="close-report-btn" class="btn" style="background:#64748b;color:#fff">إغلاق</button>
      </div>
    </body></html>`;

    printWindow.document.write(html);
    printWindow.document.close();

    // Attach handlers AFTER document is parsed
    const wireButtons = () => {
      try {
        const printBtn = printWindow.document.getElementById('print-report-btn');
        const closeBtn = printWindow.document.getElementById('close-report-btn');
        if (printBtn) printBtn.addEventListener('click', () => printWindow.print());
        if (closeBtn) closeBtn.addEventListener('click', () => printWindow.close());
      } catch (_) { /* ignore */ }
    };
    if (printWindow.document.readyState === 'complete') wireButtons();
    else printWindow.addEventListener('load', wireButtons);
  };

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
        <div className="flex items-center justify-between flex-wrap gap-2 no-print">
          <div className="flex items-center gap-2.5 min-w-0">
            <button onClick={() => navigate(backPath)}
              className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-all flex-shrink-0">
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-black text-gray-800 dark:text-gray-100 flex items-center gap-2 truncate">
                <ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6 text-rose-500 flex-shrink-0" />
                <span className="truncate">الطلاب في خطر<span className="hidden sm:inline"> — تقرير تفصيلي</span></span>
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {filtered.length} طالب · {atRiskData.length} إجمالي
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-900/30 hover:bg-rose-100 border border-rose-100 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-sm font-bold transition-all">
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">طباعة</span>
            </button>
            <button onClick={() => setShowFilters(f => !f)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-bold transition-all
                ${showFilters || hasActiveFilter
                  ? 'bg-rose-600 border-rose-600 text-white'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-rose-300'
                }`}>
              <Filter className="w-4 h-4" />
              <span className="hidden sm:inline">فلاتر</span>
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          {[
            { label: 'إجمالي في خطر',     value: atRiskData.length,   color: '#f43f5e', bg: 'bg-rose-50 dark:bg-rose-900/30',   icon: ShieldAlert },
            { label: 'ضعف اختبارات',       value: examRiskCount,       color: '#f43f5e', bg: 'bg-red-50 dark:bg-red-900/30',     icon: XCircle },
            { label: 'ضعف مشاهدة',         value: videoRiskCount,      color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-900/30', icon: AlertTriangle },
            { label: 'غياب / خمول',        value: inactiveRiskCount,   color: '#94a3b8', bg: 'bg-gray-100 dark:bg-gray-700',    icon: Clock },
          ].map(({ label, value, color, bg, icon: Icon }) => (
            <div key={label} className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
              <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color }} />
              </div>
              <div className="min-w-0">
                <p className="text-lg sm:text-xl font-black leading-none" style={{ color }}>{value}</p>
                <p className="text-[10px] sm:text-[11px] text-gray-400 dark:text-gray-500 font-semibold mt-0.5 leading-tight">{label}</p>
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
                    className="flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-4 hover:bg-gray-50/70 dark:hover:bg-gray-700/40 transition-colors cursor-pointer">
                    {/* Rank */}
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black text-white flex-shrink-0 bg-rose-400">
                      {i+1}
                    </span>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{s.name}</p>
                        {s.academic_stage && (
                          <span className="text-[10px] font-medium text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full hidden sm:inline">
                            {s.academic_stage}
                          </span>
                        )}
                        {riskCount >= 2 && (
                          <span className="text-[10px] font-black text-white bg-rose-500 px-1.5 py-0.5 rounded-full">
                            خطر مرتفع
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {s.exam_risk    && examPct !== null && <RiskBadge type="exam"     value={examPct} />}
                        {s.video_risk                       && <RiskBadge type="video"    value={videoPct} />}
                        {s.inactive_risk                    && <RiskBadge type="inactive" />}
                      </div>
                      {/* Stats visible on mobile */}
                      <div className="flex items-center gap-2 mt-1 sm:hidden flex-wrap">
                        <span className="text-[10px] text-gray-400 font-medium">{s.exams_taken} اختبار</span>
                        <span className="text-gray-200 dark:text-gray-600">·</span>
                        <span className="text-[10px] text-gray-400 font-medium">{s.enrolled_courses} كورس</span>
                        <span className="text-gray-200 dark:text-gray-600">·</span>
                        <span className="text-[10px] text-gray-400 font-medium">{lastAct}</span>
                      </div>
                    </div>
                    {/* Stats — desktop only */}
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
