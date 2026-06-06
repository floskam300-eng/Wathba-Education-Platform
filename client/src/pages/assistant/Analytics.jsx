import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3, TrendingUp, Users, Award, Target, GraduationCap,
  CheckCircle2, XCircle, Clock, Star, ChevronUp, ChevronDown,
  Minus, Eye, Search, Filter, X as XIcon, Zap, Trophy, Activity
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import StudentProfileModal from '../../components/ui/StudentProfileModal';
import api from '../../lib/api';

const CHART_COLORS = ['#6366f1','#f97316','#10b981','#f59e0b','#8b5cf6','#06b6d4','#ec4899'];
const STAGES = ['الكل', 'الصف الأول الثانوي', 'الصف الثاني الثانوي', 'الصف الثالث الثانوي', 'الصف الأول الإعدادي', 'الصف الثاني الإعدادي', 'الصف الثالث الإعدادي', 'جامعي'];
const GENDERS = ['الكل', 'ذكر', 'أنثى'];
const PERF_LEVELS = [
  { label: 'الكل',   min: 0,  max: 100 },
  { label: 'ممتاز', min: 80, max: 100 },
  { label: 'جيد',   min: 60, max: 79  },
  { label: 'متوسط', min: 40, max: 59  },
  { label: 'ضعيف',  min: 0,  max: 39  },
];

const tooltipBase = {
  backgroundColor: '#ffffff',
  borderColor: '#f1f5f9',
  borderWidth: 1,
  textStyle: { fontFamily: 'Cairo', fontSize: 12, color: '#1e293b' },
  extraCssText: 'box-shadow:0 20px 60px rgba(0,0,0,0.12);border-radius:12px;padding:10px 14px',
};

const EmptyState = ({ icon: Icon, text }) => (
  <div className="h-52 flex flex-col items-center justify-center gap-3 text-gray-300">
    <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center">
      <Icon className="w-8 h-8 text-gray-300" />
    </div>
    <p className="text-sm font-bold text-gray-400">{text}</p>
  </div>
);

const StatCard = ({ label, value, icon: Icon, gradient, lightBg, textColor, sub }) => (
  <div className="relative bg-white rounded-2xl border border-gray-100 p-5 shadow-sm overflow-hidden hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 cursor-default">
    <div className="absolute inset-0 opacity-0 hover:opacity-[0.03] transition-opacity rounded-2xl" style={{ background: gradient }} />
    <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full opacity-[0.07]" style={{ background: gradient }} />
    <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${lightBg}`} style={{ color: textColor }}>
      <Icon className="w-5 h-5" />
    </div>
    <p className="text-2xl font-black text-gray-800 leading-none">{value}</p>
    <p className="text-xs font-semibold text-gray-400 mt-1.5">{label}</p>
    {sub && <p className="text-[10px] font-medium text-gray-300 mt-0.5">{sub}</p>}
  </div>
);

export default function AssistantAnalytics() {
  const navigate = useNavigate();
  const [stageFilter, setStageFilter]   = useState('الكل');
  const [sortField, setSortField]       = useState('points');
  const [sortDir, setSortDir]           = useState('desc');
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [searchQuery, setSearchQuery]   = useState('');
  const [genderFilter, setGenderFilter] = useState('الكل');
  const [perfFilter, setPerfFilter]     = useState('الكل');
  const [showFilters, setShowFilters]   = useState(false);
  const [resultsSearch, setResultsSearch]         = useState('');
  const [resultsExamFilter, setResultsExamFilter] = useState('الكل');
  const [resultsStatus, setResultsStatus]         = useState('الكل');
  const [resultsPage, setResultsPage]             = useState(10);
  const [studentsPage, setStudentsPage] = useState(10);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['assistant-analytics'],
    queryFn: () => api.get('/assistants/analytics').then(r => r.data),
  });

  const examChartData = (data?.examResults || []).map(e => ({
    name: e.title?.length > 14 ? e.title.substring(0, 14) + '…' : e.title,
    fullName: e.title,
    avg: Math.round(parseFloat(e.avg_pct) || 0),
    max: Math.round(parseFloat(e.max_pct)  || 0),
    attempts: parseInt(e.attempt_count) || 0,
  }));

  const pieData = (data?.examResults || [])
    .map(e => ({ name: e.title?.substring(0, 16), value: parseInt(e.attempt_count) || 0 }))
    .filter(e => e.value > 0);

  const totalAttempts = (data?.examResults || []).reduce((s, e) => s + parseInt(e.attempt_count || 0), 0);
  const avgScore = (() => {
    const results = data?.recentResults || [];
    if (results.length) {
      const total = results.reduce((s, r) => s + (r.total_score ? (r.score / r.total_score * 100) : 0), 0);
      return Math.round(total / results.length);
    }
    const exams = data?.examResults || [];
    if (!exams.length) return 0;
    const weighted = exams.reduce((s, e) => s + parseFloat(e.avg_pct || 0) * parseInt(e.attempt_count || 1), 0);
    const totalW = exams.reduce((s, e) => s + parseInt(e.attempt_count || 1), 0);
    return totalW ? Math.round(weighted / totalW) : 0;
  })();
  const passRate = (() => {
    const results = data?.recentResults || [];
    if (!results.length) return 0;
    return Math.round((results.filter(r => r.score >= r.pass_score).length / results.length) * 100);
  })();

  const passFailData = useMemo(() => {
    const results = data?.recentResults || [];
    const pass = results.filter(r => r.score >= r.pass_score).length;
    const fail = results.length - pass;
    if (!results.length) return [];
    return [
      { name: 'ناجح', value: pass, fill: '#10b981' },
      { name: 'راسب', value: fail, fill: '#f43f5e' },
    ];
  }, [data]);

  const scoreDistData = useMemo(() => {
    const results = data?.recentResults || [];
    return [
      { name: '0–39',   min: 0,  max: 39,  fill: '#f43f5e', count: 0 },
      { name: '40–59',  min: 40, max: 59,  fill: '#f59e0b', count: 0 },
      { name: '60–74',  min: 60, max: 74,  fill: '#06b6d4', count: 0 },
      { name: '75–89',  min: 75, max: 89,  fill: '#6366f1', count: 0 },
      { name: '90–100', min: 90, max: 100, fill: '#10b981', count: 0 },
    ].map(b => ({
      ...b,
      count: results.filter(r => {
        const pct = r.total_score ? Math.round((r.score / r.total_score) * 100) : 0;
        return pct >= b.min && pct <= b.max;
      }).length,
    }));
  }, [data]);

  const stats = [
    { label: 'الاختبارات النشطة', value: data?.examResults?.length || 0, icon: BarChart3,  gradient: 'linear-gradient(135deg,#3b82f6,#6366f1)', lightBg: 'bg-blue-50',    textColor: '#3b82f6' },
    { label: 'إجمالي المحاولات',  value: totalAttempts,                   icon: Target,    gradient: 'linear-gradient(135deg,#f97316,#ef4444)', lightBg: 'bg-orange-50',  textColor: '#f97316' },
    { label: 'متوسط الدرجات',     value: `${avgScore}%`,                  icon: TrendingUp,gradient: 'linear-gradient(135deg,#10b981,#06b6d4)', lightBg: 'bg-emerald-50', textColor: '#10b981' },
    { label: 'نسبة النجاح',        value: `${passRate}%`,                  icon: Award,     gradient: 'linear-gradient(135deg,#8b5cf6,#ec4899)', lightBg: 'bg-purple-50',  textColor: '#8b5cf6' },
    { label: 'إجمالي الطلاب',      value: data?.totalStudents ?? 0,         icon: Users,     gradient: 'linear-gradient(135deg,#f59e0b,#f97316)', lightBg: 'bg-amber-50',   textColor: '#f59e0b' },
  ];

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };
  const SortIcon = ({ field }) => {
    if (sortField !== field) return <Minus className="w-3 h-3 opacity-30" />;
    return sortDir === 'desc' ? <ChevronDown className="w-3 h-3 text-orange-500" /> : <ChevronUp className="w-3 h-3 text-orange-500" />;
  };

  const selectedPerf = PERF_LEVELS.find(p => p.label === perfFilter) || PERF_LEVELS[0];

  const filteredStudents = useMemo(() => {
    let list = data?.topStudents || [];
    if (stageFilter !== 'الكل')  list = list.filter(s => s.academic_stage === stageFilter);
    if (genderFilter !== 'الكل') list = list.filter(s => s.gender === genderFilter);
    if (perfFilter !== 'الكل') {
      list = list.filter(s => {
        const avg = Math.round(parseFloat(s.avg_score) || 0);
        return avg >= selectedPerf.min && avg <= selectedPerf.max;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(s => s.name?.toLowerCase().includes(q) || s.username?.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const valA = parseFloat(a[sortField]) || 0;
      const valB = parseFloat(b[sortField]) || 0;
      return sortDir === 'desc' ? valB - valA : valA - valB;
    });
  }, [data, stageFilter, genderFilter, perfFilter, searchQuery, sortField, sortDir, selectedPerf]);

  const filteredResults = useMemo(() => {
    let list = data?.recentResults || [];
    if (stageFilter !== 'الكل') list = list.filter(r => r.academic_stage === stageFilter);
    if (resultsSearch.trim()) {
      const q = resultsSearch.trim().toLowerCase();
      list = list.filter(r => r.student_name?.toLowerCase().includes(q) || r.exam_title?.toLowerCase().includes(q));
    }
    if (resultsExamFilter !== 'الكل') list = list.filter(r => r.exam_title === resultsExamFilter);
    if (resultsStatus === 'ناجح')  list = list.filter(r => r.score >= r.pass_score);
    if (resultsStatus === 'راسب') list = list.filter(r => r.score < r.pass_score);
    return list;
  }, [data, stageFilter, resultsSearch, resultsExamFilter, resultsStatus]);

  const examOptions = useMemo(() => {
    const titles = [...new Set((data?.recentResults || []).map(r => r.exam_title).filter(Boolean))];
    return ['الكل', ...titles];
  }, [data]);

  const activeFiltersCount = [genderFilter !== 'الكل', perfFilter !== 'الكل', stageFilter !== 'الكل'].filter(Boolean).length;
  const clearAllFilters = () => { setSearchQuery(''); setStageFilter('الكل'); setGenderFilter('الكل'); setPerfFilter('الكل'); };

  // ── ECharts Options ───────────────────────────────────────────────────────
  const examBarOption = useMemo(() => ({
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(99,102,241,0.06)' } },
      formatter: params => {
        let s = `<div style="font-family:Cairo;font-weight:900;color:#1e293b;border-bottom:1px solid #f1f5f9;padding-bottom:6px;margin-bottom:6px">${params[0]?.name}</div>`;
        params.forEach(p => { s += `<div style="font-family:Cairo;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:2px 0">${p.marker}${p.seriesName}: <b style="color:${p.color}">${p.value}%</b></div>`; });
        return s;
      }
    },
    grid: { left: 8, right: 8, top: 12, bottom: 4, containLabel: true },
    xAxis: {
      type: 'category', data: examChartData.map(e => e.name),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { fontFamily: 'Cairo', color: '#94a3b8', fontSize: 9 }
    },
    yAxis: {
      type: 'value', max: 100,
      splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
      axisLabel: { fontFamily: 'Cairo', color: '#94a3b8', formatter: '{value}%', fontSize: 9 },
      axisLine: { show: false }, axisTick: { show: false }
    },
    series: [
      {
        name: 'متوسط الدرجات', type: 'bar', barMaxWidth: 22,
        data: examChartData.map(e => e.avg),
        itemStyle: { borderRadius: [6,6,0,0], color: { type:'linear',x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:'#6366f1'},{offset:1,color:'#4f46e5'}] } },
        emphasis: { itemStyle: { color: { type:'linear',x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:'#818cf8'},{offset:1,color:'#6366f1'}] } } }
      },
      {
        name: 'أعلى درجة', type: 'bar', barMaxWidth: 22,
        data: examChartData.map(e => e.max),
        itemStyle: { borderRadius: [6,6,0,0], color: { type:'linear',x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:'#f97316'},{offset:1,color:'#ea580c'}] } }
      }
    ]
  }), [examChartData]);

  const attemptsDonutOption = useMemo(() => ({
    tooltip: {
      ...tooltipBase,
      trigger: 'item',
      formatter: params => `<div style="font-family:Cairo"><b>${params.name}</b><br/>${params.marker} ${params.value} محاولة <b style="color:${params.color}">(${params.percent}%)</b></div>`,
    },
    series: [{
      type: 'pie', radius: ['52%','80%'], center: ['50%','50%'], padAngle: 3,
      data: pieData.map((item, i) => ({ value: item.value, name: item.name, itemStyle: { color: CHART_COLORS[i % CHART_COLORS.length] } })),
      label: { show: false }, labelLine: { show: false },
      emphasis: { scale: true, scaleSize: 6, itemStyle: { shadowBlur: 16, shadowColor: 'rgba(0,0,0,0.15)' } },
      animationType: 'scale', animationEasing: 'elasticOut', animationDelay: 100,
    }]
  }), [pieData]);

  const passFailOption = useMemo(() => ({
    tooltip: {
      ...tooltipBase,
      trigger: 'item',
      formatter: params => `<div style="font-family:Cairo"><b>${params.name}</b><br/>${params.marker} ${params.value} طالب <b style="color:${params.color}">(${params.percent}%)</b></div>`,
    },
    series: [{
      type: 'pie', radius: ['50%','78%'], center: ['50%','50%'], padAngle: 4,
      data: passFailData.map(d => ({ value: d.value, name: d.name, itemStyle: { color: d.fill } })),
      label: { show: false }, labelLine: { show: false },
      emphasis: { scale: true, scaleSize: 6, itemStyle: { shadowBlur: 16, shadowColor: 'rgba(0,0,0,0.15)' } },
      animationType: 'scale', animationEasing: 'elasticOut',
    }]
  }), [passFailData]);

  const scoreDistOption = useMemo(() => ({
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: params => {
        const p = params[0];
        return `<div style="font-family:Cairo"><b style="color:#1e293b">${p.name}</b><br/>${p.marker} عدد الطلاب: <b style="color:${p.color}">${p.value}</b></div>`;
      }
    },
    grid: { left: 8, right: 8, top: 12, bottom: 4, containLabel: true },
    xAxis: {
      type: 'category', data: scoreDistData.map(d => d.name),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { fontFamily: 'Cairo', color: '#94a3b8', fontSize: 10 }
    },
    yAxis: {
      type: 'value', minInterval: 1,
      splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
      axisLabel: { fontFamily: 'Cairo', color: '#94a3b8', fontSize: 10 },
      axisLine: { show: false }, axisTick: { show: false }
    },
    series: [{
      type: 'bar', name: 'عدد الطلاب', barMaxWidth: 52,
      data: scoreDistData.map(d => ({
        value: d.count,
        itemStyle: { borderRadius: [8,8,0,0], color: { type:'linear',x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:d.fill},{offset:1,color:d.fill+'99'}] } }
      })),
      emphasis: { itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0,0,0,0.12)' } }
    }]
  }), [scoreDistData]);
  // ─────────────────────────────────────────────────────────────────────────

  if (isError) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
      <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
        <XCircle className="w-8 h-8 text-red-400" />
      </div>
      <p className="text-gray-500 font-semibold">تعذّر تحميل البيانات</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {selectedStudentId && (
        <StudentProfileModal studentId={selectedStudentId} onClose={() => setSelectedStudentId(null)} />
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-black text-navy-700 flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          التحليلات والإحصائيات
        </h1>
        <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full">لوحة المساعد</span>
      </div>

      {/* Stat Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-gray-100 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {stats.map((s, i) => <StatCard key={i} {...s} />)}
        </div>
      )}

      {/* Charts Row 1: Exam Bar + Attempts Donut */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => <div key={i} className="h-72 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Exam Performance */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            <div className="h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
            <div className="p-5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="font-black text-gray-800 text-sm">أداء الاختبارات</h2>
                  <p className="text-[11px] text-gray-400 font-medium mt-0.5">متوسط وأعلى درجة لكل اختبار</p>
                </div>
              </div>
            </div>
            {examChartData.length > 0 ? (
              <>
                <div className="px-2">
                  <ReactECharts option={examBarOption} style={{ height: '240px' }} notMerge opts={{ renderer: 'svg' }} />
                </div>
                <div className="px-5 pb-3 flex items-center gap-5">
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500">
                    <span className="w-3 h-3 rounded-sm" style={{ background: '#6366f1' }} />متوسط الدرجات
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500">
                    <span className="w-3 h-3 rounded-sm" style={{ background: '#f97316' }} />أعلى درجة
                  </span>
                </div>
              </>
            ) : (
              <div className="p-5 pt-0"><EmptyState icon={BarChart3} text="لا توجد بيانات اختبارات بعد" /></div>
            )}
          </div>

          {/* Attempts Donut */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            <div className="h-1 bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400" />
            <div className="p-5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center">
                  <Target className="w-4 h-4 text-orange-500" />
                </div>
                <div>
                  <h2 className="font-black text-gray-800 text-sm">توزيع المحاولات</h2>
                  <p className="text-[11px] text-gray-400 font-medium mt-0.5">نسبة المحاولات لكل اختبار</p>
                </div>
              </div>
            </div>
            {pieData.length > 0 ? (
              <div className="flex items-center gap-4 px-5 pb-5">
                <div className="flex-shrink-0 relative" style={{ width: '180px' }}>
                  <ReactECharts option={attemptsDonutOption} style={{ height: '180px', width: '180px' }} notMerge opts={{ renderer: 'svg' }} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-base font-black text-gray-700">{totalAttempts}</p>
                    <p className="text-[10px] text-gray-400 font-semibold">محاولة</p>
                  </div>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto max-h-[180px]">
                  {pieData.map((item, i) => {
                    const pct = totalAttempts > 0 ? Math.round((item.value / totalAttempts) * 100) : 0;
                    const color = CHART_COLORS[i % CHART_COLORS.length];
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[11px] font-semibold text-gray-600 truncate">{item.name}</span>
                            <span className="text-[11px] font-black flex-shrink-0 mr-1" style={{ color }}>{item.value}</span>
                          </div>
                          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-gray-400 flex-shrink-0 w-7 text-left">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-5 pt-0"><EmptyState icon={Target} text="لا توجد محاولات بعد" /></div>
            )}
          </div>
        </div>
      )}

      {/* Charts Row 2: Pass/Fail + Score Distribution */}
      {!isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Pass vs Fail */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            <div className="h-1 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400" />
            <div className="p-5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <Trophy className="w-4 h-4 text-emerald-500" />
                </div>
                <div>
                  <h2 className="font-black text-gray-800 text-sm">نجاح مقابل رسوب</h2>
                  <p className="text-[11px] text-gray-400 font-medium mt-0.5">توزيع النتائج الكلية</p>
                </div>
              </div>
            </div>
            {passFailData.length > 0 ? (
              <div className="flex items-center gap-4 px-5 pb-5">
                <div className="flex-shrink-0 relative" style={{ width: '190px' }}>
                  <ReactECharts option={passFailOption} style={{ height: '190px', width: '190px' }} notMerge opts={{ renderer: 'svg' }} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-lg font-black text-gray-700">{passFailData.reduce((s,x)=>s+x.value,0)}</p>
                    <p className="text-[10px] text-gray-400 font-semibold">نتيجة</p>
                  </div>
                </div>
                <div className="flex-1 space-y-3">
                  {passFailData.map((d, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50/50">
                      <span className="flex items-center gap-2 text-sm font-bold text-gray-700">
                        <span className="w-3 h-3 rounded-full" style={{ background: d.fill }} />
                        {d.name}
                      </span>
                      <div className="text-left">
                        <p className="text-lg font-black" style={{ color: d.fill }}>{d.value}</p>
                        <p className="text-[10px] text-gray-400 font-medium">
                          {passFailData.reduce((s,x)=>s+x.value,0) > 0
                            ? Math.round(d.value / passFailData.reduce((s,x)=>s+x.value,0) * 100) : 0}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-5 pt-0"><EmptyState icon={Trophy} text="لا توجد نتائج بعد" /></div>
            )}
          </div>

          {/* Score Distribution */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            <div className="h-1 bg-gradient-to-r from-purple-500 via-violet-500 to-indigo-500" />
            <div className="p-5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-purple-500" />
                </div>
                <div>
                  <h2 className="font-black text-gray-800 text-sm">توزيع الدرجات</h2>
                  <p className="text-[11px] text-gray-400 font-medium mt-0.5">تصنيف النتائج حسب مستوى الأداء</p>
                </div>
              </div>
            </div>
            {scoreDistData.some(d => d.count > 0) ? (
              <div className="px-2 pb-3">
                <ReactECharts option={scoreDistOption} style={{ height: '200px' }} notMerge opts={{ renderer: 'svg' }} />
              </div>
            ) : (
              <div className="p-5 pt-0"><EmptyState icon={Zap} text="لا توجد بيانات كافية" /></div>
            )}
          </div>
        </div>
      )}

      {/* Search + Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="ابحث عن طالب بالاسم..."
              className="w-full pr-9 pl-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 placeholder-gray-400 focus:outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 transition" />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </div>
          <button onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${
              showFilters || activeFiltersCount > 0
                ? 'bg-orange-500 border-orange-500 text-white shadow-md'
                : 'border-gray-200 text-gray-600 hover:border-orange-300 hover:text-orange-500'
            }`}>
            <Filter className="w-4 h-4" />
            فلاتر
            {activeFiltersCount > 0 && (
              <span className="bg-white text-orange-500 text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </button>
          {(activeFiltersCount > 0 || searchQuery) && (
            <button onClick={clearAllFilters}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-red-200 text-red-500 text-xs font-bold hover:bg-red-50 transition">
              <XIcon className="w-3.5 h-3.5" /> مسح الكل
            </button>
          )}
        </div>

        {showFilters && (
          <div className="space-y-3 pt-1 border-t border-gray-100">
            <div>
              <p className="text-[11px] font-black text-gray-400 mb-2 flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5 text-orange-500" /> المرحلة الدراسية
              </p>
              <div className="flex flex-wrap gap-2">
                {STAGES.map(stage => (
                  <button key={stage} onClick={() => setStageFilter(stage)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                      stageFilter === stage ? 'bg-indigo-600 text-white shadow' : 'bg-gray-50 border border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600'
                    }`}>{stage}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] font-black text-gray-400 mb-2">الجنس</p>
                <div className="flex gap-2">
                  {GENDERS.map(g => (
                    <button key={g} onClick={() => setGenderFilter(g)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        genderFilter === g ? 'bg-indigo-600 text-white shadow' : 'bg-gray-50 border border-gray-200 text-gray-500'
                      }`}>{g}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-black text-gray-400 mb-2">مستوى الأداء</p>
                <div className="flex flex-wrap gap-1.5">
                  {PERF_LEVELS.map(p => (
                    <button key={p.label} onClick={() => setPerfFilter(p.label)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        perfFilter === p.label ? 'bg-indigo-600 text-white shadow' : 'bg-gray-50 border border-gray-200 text-gray-500'
                      }`}>{p.label}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-50 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Users className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <h2 className="font-black text-gray-800 text-sm">تحليل أداء الطلاب</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">{filteredStudents.length} طالب{activeFiltersCount > 0 || searchQuery ? ' (بعد الفلترة)' : ''}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: '560px' }}>
            <thead>
              <tr className="bg-gray-50/50">
                {[
                  { key: 'name', label: 'الطالب' },
                  { key: 'academic_stage', label: 'المرحلة' },
                  { key: 'points', label: 'النقاط' },
                  { key: 'exams_taken', label: 'اختبارات' },
                  { key: 'avg_score', label: 'متوسط %' },
                ].map(col => (
                  <th key={col.key}
                    className="px-4 py-3 text-right text-[11px] font-black text-gray-500 cursor-pointer hover:text-indigo-600 select-none"
                    onClick={() => handleSort(col.key)}>
                    <span className="flex items-center gap-1">{col.label} <SortIcon field={col.key} /></span>
                  </th>
                ))}
                <th className="px-4 py-3 text-center text-[11px] font-black text-gray-500">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}><td colSpan={6}><div className="h-10 bg-gray-100 animate-pulse m-2 rounded" /></td></tr>
                ))
              ) : filteredStudents.slice(0, studentsPage).map((s, i) => {
                const avg = Math.round(parseFloat(s.avg_score) || 0);
                const sc = avg >= 70 ? { text:'#10b981', bg:'#dcfce7' } : avg >= 50 ? { text:'#6366f1', bg:'#ede9fe' } : { text:'#f43f5e', bg:'#ffe4e6' };
                return (
                  <tr key={s.id} className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                          style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}>{i + 1}</span>
                        <div>
                          <p className="text-sm font-bold text-gray-800">{s.name}</p>
                          <p className="text-[10px] text-gray-400">{s.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 font-medium">{s.academic_stage || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-sm font-black text-amber-500">
                        <Star className="w-3.5 h-3.5 fill-amber-400 stroke-amber-400" /> {s.points}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-gray-600 text-center">{s.exams_taken}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[40px]">
                          <div className="h-1.5 rounded-full" style={{ width: `${avg}%`, background: sc.text }} />
                        </div>
                        <span className="text-[11px] font-black px-2 py-0.5 rounded-lg flex-shrink-0"
                          style={{ color: sc.text, background: sc.bg }}>{avg}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => setSelectedStudentId(s.id)}
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white text-xs font-bold rounded-lg transition-all border border-indigo-200 hover:border-indigo-600 mx-auto">
                        <Eye className="w-3.5 h-3.5" /> عرض
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && filteredStudents.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400 text-sm font-semibold">لا توجد نتائج</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filteredStudents.length > studentsPage && (
          <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50 flex items-center justify-between">
            <p className="text-xs text-gray-500 font-medium">يُعرض {studentsPage} من {filteredStudents.length}</p>
            <button onClick={() => setStudentsPage(p => p + 10)}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition">عرض المزيد</button>
          </div>
        )}
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-50 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
            <Award className="w-4 h-4 text-purple-500" />
          </div>
          <div>
            <h2 className="font-black text-gray-800 text-sm">سجل النتائج</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">{filteredResults.length} نتيجة</p>
          </div>
        </div>
        <div className="px-5 py-3 border-b border-gray-50 flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input type="text" value={resultsSearch} onChange={e => setResultsSearch(e.target.value)}
              placeholder="بحث في النتائج..."
              className="w-full pr-8 pl-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 placeholder-gray-400 focus:outline-none focus:border-orange-300 transition" />
          </div>
          <select value={resultsExamFilter} onChange={e => setResultsExamFilter(e.target.value)}
            className="py-2 px-3 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 focus:outline-none">
            {examOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          {['الكل','ناجح','راسب'].map(s => (
            <button key={s} onClick={() => setResultsStatus(s)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                resultsStatus === s
                  ? s === 'ناجح' ? 'bg-emerald-500 text-white' : s === 'راسب' ? 'bg-rose-500 text-white' : 'bg-gray-700 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>{s}</button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: '520px' }}>
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-4 py-3 text-right text-[11px] font-black text-gray-500">الطالب</th>
                <th className="px-4 py-3 text-right text-[11px] font-black text-gray-500">الاختبار</th>
                <th className="px-4 py-3 text-center text-[11px] font-black text-gray-500">الدرجة</th>
                <th className="px-4 py-3 text-center text-[11px] font-black text-gray-500">الحالة</th>
                <th className="px-4 py-3 text-center text-[11px] font-black text-gray-500 hidden sm:table-cell">صواب / خطأ</th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.slice(0, resultsPage).map(r => {
                const passed = r.score >= r.pass_score;
                const pct = r.total_score ? Math.round((r.score / r.total_score) * 100) : 0;
                return (
                  <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 font-bold text-gray-800 text-sm">{r.student_name}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs max-w-[150px] truncate font-medium">{r.exam_title}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={`font-black text-sm ${passed ? 'text-emerald-600' : 'text-rose-500'}`}>{r.score}/{r.total_score}</span>
                        <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: passed ? '#10b981' : '#f43f5e' }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${passed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                        {passed ? '✓ ناجح' : '✗ راسب'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs font-semibold hidden sm:table-cell">
                      <span className="text-emerald-600">✓ {r.correct_count}</span>
                      <span className="mx-1.5 text-gray-300">|</span>
                      <span className="text-rose-500">✗ {r.wrong_count}</span>
                    </td>
                  </tr>
                );
              })}
              {filteredResults.length === 0 && (
                <tr><td colSpan={5} className="text-center py-10 text-gray-400 text-sm font-semibold">لا توجد نتائج</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filteredResults.length > resultsPage && (
          <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50 flex items-center justify-between">
            <p className="text-xs text-gray-500 font-medium">يُعرض {resultsPage} من {filteredResults.length}</p>
            <button onClick={() => setResultsPage(p => p + 10)}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition">عرض المزيد</button>
          </div>
        )}
      </div>
    </div>
  );
}
