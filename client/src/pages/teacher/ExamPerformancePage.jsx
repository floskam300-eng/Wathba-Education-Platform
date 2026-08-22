import React, { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, BarChart3, Search, Filter, Printer, TrendingUp,
  TrendingDown, Minus, ChevronUp, ChevronDown, X as XIcon,
  Award, Users, CheckCircle2, XCircle, Target, BookOpen
} from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import api from '../../lib/api';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import useUrlState from '../../hooks/useUrlState';

const CHART_COLORS = ['#6366f1','#f97316','#10b981','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#f43f5e'];



const SORT_OPTIONS = [
  { value: 'newest',    label: 'الأحدث أولاً' },
  { value: 'oldest',   label: 'الأقدم أولاً' },
  { value: 'avg_desc', label: 'أعلى متوسط' },
  { value: 'avg_asc',  label: 'أدنى متوسط' },
  { value: 'attempts', label: 'الأكثر محاولات' },
  { value: 'success',  label: 'أعلى نجاح' },
  { value: 'failure',  label: 'أعلى رسوب' },
];

const AVG_FILTERS = [
  { label: 'الكل',   min: 0,  max: 100 },
  { label: 'ممتاز ≥ 80%', min: 80, max: 100 },
  { label: 'جيد 60-79%', min: 60, max: 79 },
  { label: 'متوسط 40-59%', min: 40, max: 59 },
  { label: 'ضعيف < 40%', min: 0,  max: 39 },
];

function ScoreBadge({ value }) {
  const v = Math.round(parseFloat(value) || 0);
  const color = v >= 70 ? { text: '#10b981', bg: '#dcfce7' }
    : v >= 50 ? { text: '#6366f1', bg: '#ede9fe' }
    : { text: '#f43f5e', bg: '#ffe4e6' };
  return (
    <span className="text-xs font-black px-2.5 py-1 rounded-lg"
      style={{ color: color.text, background: color.bg }}>
      {v}%
    </span>
  );
}

function MiniBar({ value, color }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(100, value)}%`, background: color }} />
      </div>
      <span className="text-[11px] font-bold w-8 text-left flex-shrink-0"
        style={{ color }}>{Math.round(value)}%</span>
    </div>
  );
}

export default function ExamPerformancePage() {
  const navigate = useNavigate();
  const { dark } = useTheme();
  const { user } = useAuth();
  const printRef = useRef(null);

  const isAssistant = user?.role === 'assistant';
  const apiPath   = isAssistant ? '/assistants/analytics' : '/teachers/analytics';
  const backPath  = isAssistant ? '/assistant/analytics'  : '/teacher/analytics';
  const queryKey  = isAssistant ? 'assistant-analytics'   : 'teacher-analytics';

  const [search, setSearch] = useUrlState('q', '');
  const [stageFilter, setStageFilter] = useUrlState('stage', 'الكل');
  const [sortBy, setSortBy] = useUrlState('sort', 'newest');
  const [avgFilter, setAvgFilter] = useUrlState('avg', 'الكل');
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useUrlState('view', 'table');

  const { data, isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: () => api.get(apiPath).then(r => r.data),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 30_000,
  });

  const exams = data?.examResults || [];

  const availableStages = useMemo(() => {
    const set = new Set(exams.map(e => e.target_stage).filter(Boolean));
    return ['الكل', ...Array.from(set)];
  }, [exams]);

  const activeAvgFilter = AVG_FILTERS.find(f => f.label === avgFilter) || AVG_FILTERS[0];

  const filtered = useMemo(() => {
    let list = [...exams];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(e =>
        e.title?.toLowerCase().includes(q) ||
        e.course_name?.toLowerCase().includes(q)
      );
    }
    if (stageFilter !== 'الكل') {
      list = list.filter(e => e.target_stage === stageFilter);
    }
    const avg = activeAvgFilter;
    if (avg.min > 0 || avg.max < 100) {
      list = list.filter(e => {
        const v = Math.round(parseFloat(e.avg_pct) || 0);
        return v >= avg.min && v <= avg.max;
      });
    }

    list.sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.created_at||0) - new Date(a.created_at||0);
      if (sortBy === 'oldest') return new Date(a.created_at||0) - new Date(b.created_at||0);
      if (sortBy === 'avg_desc') return (parseFloat(b.avg_pct)||0) - (parseFloat(a.avg_pct)||0);
      if (sortBy === 'avg_asc')  return (parseFloat(a.avg_pct)||0) - (parseFloat(b.avg_pct)||0);
      if (sortBy === 'attempts') return (parseInt(b.attempt_count)||0) - (parseInt(a.attempt_count)||0);
      if (sortBy === 'success') {
        const ra = a.attempt_count > 0 ? (parseInt(a.pass_count)||0)/(parseInt(a.attempt_count)||1) : 0;
        const rb = b.attempt_count > 0 ? (parseInt(b.pass_count)||0)/(parseInt(b.attempt_count)||1) : 0;
        return rb - ra;
      }
      if (sortBy === 'failure') {
        const ra = a.attempt_count > 0 ? (parseInt(a.fail_count)||0)/(parseInt(a.attempt_count)||1) : 0;
        const rb = b.attempt_count > 0 ? (parseInt(b.fail_count)||0)/(parseInt(b.attempt_count)||1) : 0;
        return rb - ra;
      }
      return 0;
    });
    return list;
  }, [exams, search, stageFilter, sortBy, avgFilter]);

  // Summary stats
  const totalAttempts = filtered.reduce((s,e)=> s + (parseInt(e.attempt_count)||0), 0);
  const totalPass     = filtered.reduce((s,e)=> s + (parseInt(e.pass_count)||0), 0);
  const totalFail     = filtered.reduce((s,e)=> s + (parseInt(e.fail_count)||0), 0);
  const avgOfAvgs     = filtered.length > 0
    ? Math.round(filtered.reduce((s,e)=> s + (parseFloat(e.avg_pct)||0), 0) / filtered.length)
    : 0;

  // Chart data (top 10 by attempts)
  const chartData = useMemo(() => {
    return [...filtered]
      .sort((a,b) => (parseInt(b.attempt_count)||0) - (parseInt(a.attempt_count)||0))
      .slice(0, 15)
      .map(e => ({
        name: e.title?.length > 12 ? e.title.substring(0,12)+'…' : e.title,
        avg: Math.round(parseFloat(e.avg_pct)||0),
        max: Math.round(parseFloat(e.max_pct)||0),
        min: Math.round(parseFloat(e.min_pct)||0),
        attempts: parseInt(e.attempt_count)||0,
      }));
  }, [filtered]);

  const barOption = {
    direction: 'rtl',
    backgroundColor: 'transparent',
    grid: { top: 40, right: 20, bottom: 60, left: 20, containLabel: true },
    legend: {
      top: 8,
      textStyle: { fontFamily: 'Tajawal', fontSize: 11, color: dark ? '#9ca3af' : '#6b7280' },
      itemWidth: 10, itemHeight: 10, borderRadius: 4,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#fff',
      borderColor: '#f1f5f9',
      borderWidth: 1,
      textStyle: { fontFamily: 'Tajawal', fontSize: 12, color: '#1e293b' },
    },
    xAxis: {
      type: 'category',
      data: chartData.map(e => e.name),
      axisLabel: { fontFamily: 'Tajawal', fontSize: 10, color: dark ? '#9ca3af' : '#94a3b8', rotate: 30 },
      axisLine: { lineStyle: { color: dark ? '#374151' : '#f1f5f9' } },
    },
    yAxis: {
      type: 'value', min: 0, max: 100,
      axisLabel: { fontFamily: 'Tajawal', fontSize: 10, color: dark ? '#9ca3af' : '#94a3b8', formatter: v => v + '%' },
      splitLine: { lineStyle: { color: dark ? '#374151' : '#f8fafc', type: 'dashed' } },
    },
    series: [
      { name: 'متوسط', type: 'bar', data: chartData.map(e => e.avg), itemStyle: { color: '#6366f1', borderRadius: [4,4,0,0] }, barMaxWidth: 24 },
      { name: 'أعلى درجة', type: 'bar', data: chartData.map(e => e.max), itemStyle: { color: '#10b981', borderRadius: [4,4,0,0] }, barMaxWidth: 24 },
      { name: 'أدنى درجة', type: 'bar', data: chartData.map(e => e.min), itemStyle: { color: '#f43f5e', borderRadius: [4,4,0,0] }, barMaxWidth: 24 },
    ],
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) { alert('يرجى السماح بالنوافذ المنبثقة لاستخدام ميزة الطباعة'); return; }

    const now = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
    const totalAttemptsPrint = filtered.reduce((s,e)=> s + (parseInt(e.attempt_count)||0), 0);
    const totalPassPrint     = filtered.reduce((s,e)=> s + (parseInt(e.pass_count)||0), 0);
    const avgOfAvgsPrint     = filtered.length > 0
      ? Math.round(filtered.reduce((s,e)=> s + (parseFloat(e.avg_pct)||0), 0) / filtered.length)
      : 0;

    const rows = filtered.map((e, i) => {
      const avg  = Math.round(parseFloat(e.avg_pct) || 0);
      const max  = Math.round(parseFloat(e.max_pct) || 0);
      const min  = Math.round(parseFloat(e.min_pct) || 0);
      const att  = parseInt(e.attempt_count) || 0;
      const pass = parseInt(e.pass_count) || 0;
      const fail = parseInt(e.fail_count) || 0;
      const passR = att > 0 ? Math.round((pass/att)*100) : 0;
      const esc = s => String(s ?? '—').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const scoreColor = avg >= 70 ? '#10b981' : avg >= 50 ? '#6366f1' : '#f43f5e';
      return `<tr>
        <td style="color:#94a3b8;font-size:11px;font-weight:700;text-align:center">${i+1}</td>
        <td><strong>${esc(e.title)}</strong><br><span style="color:#94a3b8;font-size:11px">${esc(e.course_name||'')} ${e.target_stage ? '· '+esc(e.target_stage) : ''}</span></td>
        <td style="text-align:center;font-weight:900">${att}</td>
        <td style="text-align:center;color:#10b981;font-weight:900">${pass} (${passR}%)</td>
        <td style="text-align:center;color:#f43f5e;font-weight:900">${fail}</td>
        <td style="text-align:center"><span style="background:${scoreColor}22;color:${scoreColor};font-weight:900;padding:3px 10px;border-radius:8px;font-size:13px">${avg}%</span></td>
        <td style="text-align:center"><span style="color:#10b981;font-weight:700">▲${max}%</span> / <span style="color:#f43f5e;font-weight:700">▼${min}%</span></td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head>
      <meta charset="UTF-8"><title>تقرير أداء الاختبارات</title>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;600;700;900&display=swap" rel="stylesheet">
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Tajawal',Arial,sans-serif;padding:24px;direction:rtl;color:#1e293b;background:#fff}
        .header{display:flex;align-items:center;gap:16px;border-bottom:3px solid #1e3a5f;padding-bottom:16px;margin-bottom:20px}
        .logo{width:44px;height:44px;background:linear-gradient(135deg,#1e3a5f,#2d5080);border-radius:10px;display:flex;align-items:center;justify-content:center;color:#f97316;font-size:20px;font-weight:900;flex-shrink:0}
        .title{font-size:18px;font-weight:900;color:#1e3a5f}
        .meta{margin-right:auto;text-align:left;font-size:11px;color:#94a3b8}
        .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
        .stat{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px;text-align:center}
        .stat-val{font-size:20px;font-weight:900;color:#1e3a5f}
        .stat-lbl{font-size:11px;color:#94a3b8;margin-top:3px}
        table{width:100%;border-collapse:collapse;border-radius:12px;overflow:hidden}
        thead tr{background:linear-gradient(135deg,#1e3a5f,#2d5080)}
        th{color:#fff;padding:10px 12px;font-size:12px;font-weight:700;text-align:center;font-family:'Tajawal',sans-serif}
        td{padding:9px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;vertical-align:middle}
        tr:nth-child(even) td{background:#f8fafc}
        .footer{margin-top:20px;padding-top:12px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px}
        .no-print{text-align:center;padding:16px 0 8px}
        .btn{padding:10px 28px;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700;font-family:'Tajawal',sans-serif;margin:0 6px}
        @media print{.no-print{display:none}body{padding:12px}}
      </style></head><body>
      <div class="header">
        <div class="logo">و</div>
        <div><div class="title">تقرير أداء الاختبارات</div><div style="font-size:12px;color:#64748b;margin-top:3px">منصة وثبة التعليمية</div></div>
        <div class="meta"><div style="font-weight:900;color:#f97316;font-size:13px">منصة وثبة</div><div>${now}</div></div>
      </div>
      <div class="stats">
        <div class="stat"><div class="stat-val">${filtered.length}</div><div class="stat-lbl">إجمالي الاختبارات</div></div>
        <div class="stat"><div class="stat-val">${totalAttemptsPrint}</div><div class="stat-lbl">إجمالي المحاولات</div></div>
        <div class="stat"><div class="stat-val">${avgOfAvgsPrint}%</div><div class="stat-lbl">متوسط الدرجات</div></div>
        <div class="stat"><div class="stat-val" style="color:#10b981">${totalAttemptsPrint > 0 ? Math.round((totalPassPrint/totalAttemptsPrint)*100) : 0}%</div><div class="stat-lbl">معدل النجاح</div></div>
      </div>
      <table>
        <thead><tr><th>#</th><th>الاختبار</th><th>محاولات</th><th>نجاح</th><th>رسوب</th><th>متوسط</th><th>أعلى / أدنى</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer">تقرير صادر آلياً من منصة وثبة التعليمية — ${now}</div>
      <div class="no-print">
        <button id="print-report-btn" class="btn" style="background:#f97316;color:#fff">🖨️ طباعة / حفظ PDF</button>
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

  const hasActiveFilter = search || stageFilter !== 'الكل' || avgFilter !== 'الكل' || sortBy !== 'newest';

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6 print:overflow-visible print:h-auto" ref={printRef}>
      <style>{`
        @media print {
          nav, aside, button, .no-print { display: none !important; }
          body { background: white !important; }
          .print\\:break-inside-avoid { break-inside: avoid; }
        }
      `}</style>

      <div className="space-y-5 max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2 no-print">
          <div className="flex items-center gap-2.5 min-w-0">
            <button onClick={() => navigate(backPath)}
              className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-all flex-shrink-0">
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-black text-gray-800 dark:text-gray-100 flex items-center gap-2 truncate">
                <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-500 flex-shrink-0" />
                <span className="truncate">أداء الاختبارات<span className="hidden sm:inline"> — تقرير تفصيلي</span></span>
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {filtered.length} اختبار · {totalAttempts} محاولة
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-100 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 text-sm font-bold transition-all">
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">طباعة</span>
            </button>
            <button onClick={() => setShowFilters(f => !f)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-bold transition-all
                ${showFilters || hasActiveFilter
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-300'
                }`}>
              <Filter className="w-4 h-4" />
              <span className="hidden sm:inline">فلاتر</span>
              {hasActiveFilter && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
            </button>
          </div>
        </div>

        {/* Print header */}
        <div className="hidden print:block mb-4">
          <h1 className="text-2xl font-black text-gray-800">تقرير أداء الاختبارات</h1>
          <p className="text-sm text-gray-500">{new Date().toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' })}</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'إجمالي الاختبارات', value: filtered.length, icon: BookOpen, color: '#6366f1', bg: 'bg-indigo-50 dark:bg-indigo-900/30' },
            { label: 'إجمالي المحاولات',  value: totalAttempts,   icon: Users,    color: '#f97316', bg: 'bg-orange-50 dark:bg-orange-900/30' },
            { label: 'متوسط الدرجات',     value: avgOfAvgs + '%', icon: Target,   color: '#10b981', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
            { label: 'معدل النجاح',       value: totalAttempts > 0 ? Math.round((totalPass/totalAttempts)*100) + '%' : '—', icon: Award, color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-900/30' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 flex items-center gap-3 print:break-inside-avoid">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
              <div>
                <p className="text-lg font-black text-gray-800 dark:text-gray-100">{value}</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 font-semibold">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 space-y-4 no-print">
            {/* Search */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ابحث باسم الاختبار أو الكورس..."
                className="w-full pr-9 pl-10 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/30 transition"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <XIcon className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Sort */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">ترتيب حسب</label>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 focus:outline-none focus:border-indigo-300 transition">
                  {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {/* Stage */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">المرحلة الدراسية</label>
                <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 focus:outline-none focus:border-indigo-300 transition">
                  {availableStages.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Avg range */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">نطاق متوسط الدرجات</label>
                <select value={avgFilter} onChange={e => setAvgFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 focus:outline-none focus:border-indigo-300 transition">
                  {AVG_FILTERS.map(f => <option key={f.label} value={f.label}>{f.label}</option>)}
                </select>
              </div>
            </div>

            {hasActiveFilter && (
              <button onClick={() => { setSearch(''); setStageFilter('الكل'); setSortBy('newest'); setAvgFilter('الكل'); }}
                className="flex items-center gap-1.5 text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors">
                <XIcon className="w-3.5 h-3.5" />مسح الفلاتر
              </button>
            )}
          </div>
        )}

        {/* View toggle */}
        <div className="flex items-center gap-2 no-print">
          {['table','chart'].map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all border
                ${viewMode === mode
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-indigo-300'
                }`}>
              {mode === 'table' ? '📋 جدول' : '📊 رسم بياني'}
            </button>
          ))}
        </div>

        {/* Chart view */}
        {viewMode === 'chart' && filtered.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden print:break-inside-avoid">
            <div className="h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
            <div className="p-5">
              <h2 className="font-black text-sm text-gray-800 dark:text-gray-200 mb-1">مقارنة الدرجات</h2>
              <p className="text-[11px] text-gray-400 mb-4">أعلى 15 اختباراً بالمحاولات</p>
              <ReactECharts option={barOption} style={{ height: '320px' }} notMerge opts={{ renderer: 'svg' }} />
              <div className="flex items-center gap-5 mt-2 flex-wrap">
                {[['متوسط','#6366f1'],['أعلى درجة','#10b981'],['أدنى درجة','#f43f5e']].map(([lbl,c]) => (
                  <span key={lbl} className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                    <span className="w-3 h-3 rounded-sm" style={{ background: c }} />{lbl}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Table view */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_,i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-1/2 mb-2" />
                <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded animate-pulse w-1/3" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 text-center py-16 px-6">
            <BarChart3 className="w-14 h-14 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-700 dark:text-gray-300 font-bold text-lg mb-1">لا توجد نتائج</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm">جرّب تغيير الفلاتر</p>
          </div>
        ) : viewMode === 'table' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden print:break-inside-avoid">
            <div className="h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
            {/* Table header */}
            <div className="hidden sm:grid grid-cols-[auto_1fr_repeat(5,auto)] gap-x-4 px-5 py-3 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700 text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-wide">
              <span>#</span>
              <span>الاختبار</span>
              <span className="text-center">محاولات</span>
              <span className="text-center">نجاح</span>
              <span className="text-center">رسوب</span>
              <span className="text-center">متوسط</span>
              <span className="text-center">أعلى / أدنى</span>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-700">
              {filtered.map((e, i) => {
                const avg   = Math.round(parseFloat(e.avg_pct)  || 0);
                const max   = Math.round(parseFloat(e.max_pct)  || 0);
                const min   = Math.round(parseFloat(e.min_pct)  || 0);
                const att   = parseInt(e.attempt_count) || 0;
                const pass  = parseInt(e.pass_count)    || 0;
                const fail  = parseInt(e.fail_count)    || 0;
                const passR = att > 0 ? Math.round((pass/att)*100) : 0;
                const failR = att > 0 ? Math.round((fail/att)*100) : 0;
                return (
                  <div key={e.id || i} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/40 transition-colors print:break-inside-avoid">

                    {/* ── Mobile card layout ── */}
                    <div className="sm:hidden px-4 py-3">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-black text-white flex-shrink-0"
                            style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}>{i+1}</span>
                          <p className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">{e.title}</p>
                        </div>
                        <ScoreBadge value={avg} />
                      </div>
                      {(e.course_name || e.target_stage) && (
                        <div className="flex items-center gap-1.5 mb-2 mr-7">
                          {e.course_name && <span className="text-[10px] text-gray-400 font-medium truncate">{e.course_name}</span>}
                          {e.target_stage && <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">{e.target_stage}</span>}
                        </div>
                      )}
                      <div className="grid grid-cols-4 gap-1 mr-7">
                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-1.5 text-center">
                          <p className="text-sm font-black text-gray-700 dark:text-gray-300">{att}</p>
                          <p className="text-[9px] text-gray-400 font-medium">محاولة</p>
                        </div>
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-1.5 text-center">
                          <p className="text-sm font-black text-emerald-600">{pass}</p>
                          <p className="text-[9px] text-emerald-500 font-medium">{passR}% نجاح</p>
                        </div>
                        <div className="bg-rose-50 dark:bg-rose-900/20 rounded-lg p-1.5 text-center">
                          <p className="text-sm font-black text-rose-500">{fail}</p>
                          <p className="text-[9px] text-rose-400 font-medium">{failR}% رسوب</p>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-1.5 text-center">
                          <p className="text-[10px] font-bold text-emerald-500">▲{max}%</p>
                          <p className="text-[10px] font-bold text-rose-500">▼{min}%</p>
                        </div>
                      </div>
                    </div>

                    {/* ── Desktop row layout ── */}
                    <div className="hidden sm:grid grid-cols-[auto_1fr_repeat(5,auto)] gap-x-4 px-5 py-3.5 items-center">
                      <span className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                        style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}>{i+1}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">{e.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {e.course_name && <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">{e.course_name}</span>}
                          {e.target_stage && <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-full font-medium">{e.target_stage}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-center">
                        <p className="text-sm font-black text-gray-700 dark:text-gray-300">{att}</p>
                        <p className="text-[10px] text-gray-400 font-medium">محاولة</p>
                      </div>
                      <div className="flex flex-col items-center">
                        <p className="text-sm font-black text-emerald-600">{pass}</p>
                        <p className="text-[10px] text-emerald-400 font-medium">{passR}%</p>
                      </div>
                      <div className="flex flex-col items-center">
                        <p className="text-sm font-black text-rose-500">{fail}</p>
                        <p className="text-[10px] text-rose-400 font-medium">{failR}%</p>
                      </div>
                      <div className="flex items-center justify-center"><ScoreBadge value={avg} /></div>
                      <div className="flex items-center gap-2 justify-center">
                        <span className="text-[11px] font-black text-emerald-500">▲{max}%</span>
                        <span className="text-[11px] font-black text-rose-500">▼{min}%</span>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
