import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../context/ThemeContext';
import MathText from '../../components/MathText';
import {
  BarChart3, TrendingUp, Users, Award, Target, GraduationCap,
  CheckCircle2, XCircle, Clock, Star, ChevronUp, ChevronDown,
  Minus, Eye, Search, Filter, X as XIcon, Download, Calendar,
  Activity, Zap, Trophy, AlertTriangle, ChevronLeft, ChevronRight,
  BookOpen, ShieldAlert, Flame, PieChart, Layers
} from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import StudentProfileModal from '../../components/ui/StudentProfileModal';

const CHART_COLORS = ['#6366f1','#f97316','#10b981','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#f43f5e'];
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const TREND_PERIODS = [
  { label: 'شهر',    value: 1  },
  { label: '3 أشهر', value: 3  },
  { label: '6 أشهر', value: 6  },
  { label: 'سنة',    value: 12 },
  { label: 'الكل',   value: 0  },
];

const STAGES = ['الكل', 'الصف الأول الثانوي', 'الصف الثاني الثانوي', 'الصف الثالث الثانوي', 'الصف الأول الإعدادي', 'الصف الثاني الإعدادي', 'الصف الثالث الإعدادي', 'جامعي'];
const GENDERS = ['الكل', 'ذكر', 'أنثى'];
const PERF_LEVELS = [
  { label: 'الكل',   min: 0,  max: 100 },
  { label: 'ممتاز',  min: 80, max: 100 },
  { label: 'جيد',    min: 60, max: 79  },
  { label: 'متوسط',  min: 40, max: 59  },
  { label: 'ضعيف',   min: 0,  max: 39  },
];

const EmptyState = ({ icon: Icon, text }) => (
  <div className="h-52 flex flex-col items-center justify-center gap-3 text-gray-300">
    <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center">
      <Icon className="w-8 h-8 text-gray-300" />
    </div>
    <p className="text-sm font-bold text-gray-400">{text}</p>
  </div>
);

const StatCard = ({ label, value, icon: Icon, gradient, lightBg, textColor }) => (
  <div className="relative bg-white rounded-2xl border border-gray-100 p-5 shadow-sm overflow-hidden group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-default">
    <div className="absolute inset-0 opacity-0 group-hover:opacity-[0.03] transition-opacity rounded-2xl" style={{ background: gradient }} />
    <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-[0.06] transition-all group-hover:opacity-[0.10] group-hover:scale-110 duration-500" style={{ background: gradient }} />
    <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110 duration-300 ${lightBg}`} style={{ color: textColor }}>
      <Icon className="w-5 h-5" />
    </div>
    <p className="text-2xl font-black text-gray-800 leading-none tracking-tight">{value}</p>
    <p className="text-xs font-semibold text-gray-400 mt-1.5">{label}</p>
  </div>
);

const ChartCard = ({ title, subtitle, icon: Icon, iconBg, iconColor, children, headerAction }) => (
  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 hover:shadow-md transition-shadow duration-300">
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <div>
          <h2 className="font-black text-gray-800 dark:text-gray-200 text-sm">{title}</h2>
          {subtitle && <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {headerAction}
    </div>
    {children}
  </div>
);

const tooltipBase = {
  backgroundColor: '#ffffff',
  borderColor: '#f1f5f9',
  borderWidth: 1,
  textStyle: { fontFamily: 'Cairo', fontSize: 12, color: '#1e293b' },
  extraCssText: 'box-shadow:0 20px 60px rgba(0,0,0,0.12);border-radius:12px;padding:10px 14px',
};

export default function TeacherAnalytics() {
  const navigate = useNavigate();
  const { dark } = useTheme();
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
  const [trendMonths, setTrendMonths]   = useState(6);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['teacher-analytics'],
    queryFn: () => api.get('/teachers/analytics').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const { data: trendData = [], isFetching: trendLoading } = useQuery({
    queryKey: ['teacher-analytics-trend', trendMonths],
    queryFn: () => api.get(`/teachers/analytics/trend?months=${trendMonths}`).then(r => r.data),
    keepPreviousData: true,
    staleTime: 5 * 60 * 1000,
  });

  const { data: wrongQData = [] } = useQuery({
    queryKey: ['teacher-wrong-questions'],
    queryFn: () => api.get('/teachers/analytics/wrong-questions').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const [wrongQExamIdx, setWrongQExamIdx] = useState(0);

  const { data: atRiskData = [], isLoading: atRiskLoading } = useQuery({
    queryKey: ['teacher-at-risk'],
    queryFn: () => api.get('/teachers/at-risk-students').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const { data: recData, isLoading: recLoading } = useQuery({
    queryKey: ['teacher-recitations-analytics'],
    queryFn: () => api.get('/recitations/analytics').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const { data: courseStatsData = [], isLoading: courseStatsLoading } = useQuery({
    queryKey: ['teacher-course-stats'],
    queryFn: () => api.get('/teachers/course-stats').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const examChartData = useMemo(() => (data?.examResults || []).map(e => ({
    name: e.title?.length > 14 ? e.title.substring(0, 14) + '…' : e.title,
    fullName: e.title,
    avg: Math.round(parseFloat(e.avg_pct) || 0),
    max: Math.round(parseFloat(e.max_pct)  || 0),
    min: Math.round(parseFloat(e.min_pct)  || 0),
    attempts: parseInt(e.attempt_count) || 0,
  })), [data]);

  const stageDistData = useMemo(() => {
    const counts = {};
    (data?.topStudents || []).forEach(s => {
      const stage = (s.academic_stage || 'غير محدد')
        .replace('الصف ', '').replace(' الثانوي', ' ث').replace(' الإعدادي', ' إع');
      counts[stage] = (counts[stage] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [data]);

  const genderDistData = useMemo(() => {
    const counts = {};
    (data?.topStudents || []).forEach(s => { const g = s.gender || 'غير محدد'; counts[g] = (counts[g] || 0) + 1; });
    return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [data]);

  const recRecentChartData = useMemo(() => (recData?.recent_recitations || []).map(r => ({
    name: r.title?.length > 16 ? r.title.substring(0, 16) + '…' : r.title,
    avg: Math.round(parseFloat(r.avg_score) || 0),
    pass: Math.round(parseFloat(r.pass_rate) || 0),
    count: parseInt(r.participant_count) || 0,
  })).reverse(), [recData]);

  const pieData = useMemo(() => (data?.examResults || [])
    .map(e => ({ name: e.title?.substring(0, 16), value: parseInt(e.attempt_count) || 0 }))
    .filter(e => e.value > 0), [data]);

  const totalAttempts = useMemo(() => (data?.examResults || []).reduce((s, e) => s + parseInt(e.attempt_count || 0), 0), [data]);

  const avgScore = useMemo(() => {
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
  }, [data]);

  const passRate = useMemo(() => {
    const results = data?.recentResults || [];
    if (!results.length) return 0;
    return Math.round((results.filter(r => r.score >= r.pass_score).length / results.length) * 100);
  }, [data]);

  const passFailData = useMemo(() => {
    const results = data?.recentResults || [];
    const pass = results.filter(r => r.score >= r.pass_score).length;
    const fail = results.length - pass;
    if (!results.length) return [];
    return [
      { name: 'ناجح', value: pass,  fill: '#10b981' },
      { name: 'راسب', value: fail,  fill: '#f43f5e' },
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

  const trendChartData = useMemo(() => {
    if (trendMonths === 0) {
      return trendData.map(d => ({
        name: d.label,
        avg: parseFloat(d.avg_pct) || 0,
        attempts: d.exam_count,
        students: d.student_count,
        pass: d.pass_count,
      }));
    }
    const dataMap = {};
    trendData.forEach(d => { dataMap[d.month] = d; });
    const result = [];
    for (let i = trendMonths - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const found = dataMap[key];
      const shortMonth = d.toLocaleDateString('ar-EG', { month: 'short' });
      const shortYear = String(d.getFullYear()).slice(-2);
      result.push({
        name: found ? found.label : `${shortMonth} ${shortYear}`,
        avg: found ? parseFloat(found.avg_pct) || 0 : 0,
        attempts: found ? found.exam_count : 0,
        students: found ? found.student_count : 0,
        pass: found ? found.pass_count : 0,
      });
    }
    return result;
  }, [trendData, trendMonths]);

  const stats = [
    { label: 'الاختبارات النشطة',  value: data?.examResults?.length || 0,  icon: BarChart3,  gradient: 'linear-gradient(135deg,#3b82f6,#6366f1)', lightBg: 'bg-blue-50',    textColor: '#3b82f6' },
    { label: 'إجمالي المحاولات',   value: totalAttempts,                    icon: Target,    gradient: 'linear-gradient(135deg,#f97316,#ef4444)', lightBg: 'bg-orange-50',  textColor: '#f97316' },
    { label: 'متوسط الدرجات',      value: `${avgScore}%`,                   icon: TrendingUp,gradient: 'linear-gradient(135deg,#10b981,#06b6d4)', lightBg: 'bg-emerald-50', textColor: '#10b981' },
    { label: 'نسبة النجاح',         value: `${passRate}%`,                   icon: Award,     gradient: 'linear-gradient(135deg,#8b5cf6,#ec4899)', lightBg: 'bg-purple-50',  textColor: '#8b5cf6' },
    { label: 'إجمالي الطلاب',       value: data?.totalStudents ?? 0,          icon: Users,     gradient: 'linear-gradient(135deg,#f59e0b,#f97316)', lightBg: 'bg-amber-50',   textColor: '#f59e0b' },
  ];

  const exportCSV = () => {
    const headers = ['الاسم', 'كود الطالب', 'المرحلة الدراسية', 'الجنس', 'النقاط', 'عدد الاختبارات', 'متوسط الدرجات%'];
    const rows = filteredStudents.map(s => [
      s.name, s.student_code || '—', s.academic_stage || '—', s.gender || '—', s.points, s.exams_taken,
      Math.round(parseFloat(s.avg_score) || 0),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `students_analytics_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

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
    if (perfFilter !== 'الكل')   list = list.filter(s => {
      const avg = Math.round(parseFloat(s.avg_score) || 0);
      return avg >= selectedPerf.min && avg <= selectedPerf.max;
    });
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(s => s.name?.toLowerCase().includes(q) || s.username?.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const valA = parseFloat(a[sortField]) || 0, valB = parseFloat(b[sortField]) || 0;
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
        let s = `<div style="font-family:Cairo;font-weight:900;color:#1e293b;border-bottom:1px solid #f1f5f9;padding-bottom:6px;margin-bottom:6px">${esc(params[0]?.name)}</div>`;
        params.forEach(p => { const c = p.seriesName === 'متوسط الدرجات' ? '#6366f1' : p.seriesName === 'أعلى درجة' ? '#10b981' : '#f43f5e'; s += `<div style="font-family:Cairo;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:2px 0">${p.marker}${esc(p.seriesName)}: <b style="color:${c}">${p.value}%</b></div>`; });
        return s;
      }
    },
    grid: { left: 8, right: 8, top: 12, bottom: 4, containLabel: true },
    xAxis: {
      type: 'category',
      data: examChartData.map(e => e.name),
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
        name: 'متوسط الدرجات',
        type: 'bar', barMaxWidth: 18,
        data: examChartData.map(e => e.avg),
        itemStyle: { borderRadius: [6,6,0,0], color: { type:'linear',x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:'#6366f1'},{offset:1,color:'#4f46e5'}] } },
        emphasis: { itemStyle: { color: { type:'linear',x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:'#818cf8'},{offset:1,color:'#6366f1'}] } } }
      },
      {
        name: 'أعلى درجة',
        type: 'bar', barMaxWidth: 18,
        data: examChartData.map(e => e.max),
        itemStyle: { borderRadius: [6,6,0,0], color: { type:'linear',x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:'#10b981'},{offset:1,color:'#059669'}] } },
        emphasis: { itemStyle: { color: { type:'linear',x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:'#34d399'},{offset:1,color:'#10b981'}] } } }
      },
      {
        name: 'أدنى درجة',
        type: 'bar', barMaxWidth: 18,
        data: examChartData.map(e => e.min),
        itemStyle: { borderRadius: [6,6,0,0], color: { type:'linear',x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:'#f43f5e'},{offset:1,color:'#e11d48'}] } },
        emphasis: { itemStyle: { color: { type:'linear',x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:'#fb7185'},{offset:1,color:'#f43f5e'}] } } }
      }
    ]
  }), [examChartData]);

  const stageBarOption = useMemo(() => ({
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: params => {
        const p = params[0];
        return `<div style="font-family:Cairo"><b style="color:#1e293b">${p.name}</b><br/>${p.marker} عدد الطلاب: <b style="color:${p.color}">${p.value}</b></div>`;
      }
    },
    grid: { left: 8, right: 8, top: 8, bottom: 4, containLabel: true },
    xAxis: { type: 'value', minInterval: 1, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } }, axisLabel: { fontFamily: 'Cairo', color: '#94a3b8', fontSize: 10 } },
    yAxis: { type: 'category', data: stageDistData.map(d => d.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { fontFamily: 'Cairo', color: '#64748b', fontSize: 10 } },
    series: [{
      type: 'bar', name: 'طلاب', barMaxWidth: 20,
      data: stageDistData.map((d, i) => ({
        value: d.value,
        itemStyle: { borderRadius: [0,6,6,0], color: { type:'linear',x:0,y:0,x2:1,y2:0, colorStops:[{offset:0,color:CHART_COLORS[i%CHART_COLORS.length]+'99'},{offset:1,color:CHART_COLORS[i%CHART_COLORS.length]}] } }
      })),
      label: { show: true, position: 'right', fontFamily: 'Cairo', fontSize: 10, fontWeight: 'bold', color: '#64748b', formatter: '{c}' }
    }]
  }), [stageDistData]);

  const genderDonutOption = useMemo(() => ({
    tooltip: {
      ...tooltipBase,
      trigger: 'item',
      formatter: params => `<div style="font-family:Cairo"><b>${params.name}</b><br/>${params.marker} ${params.value} طالب <b style="color:${params.color}">(${params.percent}%)</b></div>`,
    },
    series: [{
      type: 'pie', radius: ['50%','78%'], center: ['50%','50%'], padAngle: 4,
      data: genderDistData.map((d, i) => ({
        value: d.value, name: d.name,
        itemStyle: { color: d.name === 'ذكر' ? '#6366f1' : d.name === 'أنثى' ? '#ec4899' : '#94a3b8' }
      })),
      label: { show: false }, labelLine: { show: false },
      emphasis: { scale: true, scaleSize: 6, itemStyle: { shadowBlur: 16, shadowColor: 'rgba(0,0,0,0.15)' } },
      animationType: 'scale', animationEasing: 'elasticOut',
    }]
  }), [genderDistData]);

  const recBarOption = useMemo(() => ({
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(16,185,129,0.06)' } },
      formatter: params => {
        let s = `<div style="font-family:Cairo;font-weight:900;color:#1e293b;border-bottom:1px solid #f1f5f9;padding-bottom:6px;margin-bottom:6px">${params[0]?.name}</div>`;
        params.forEach(p => { s += `<div style="font-family:Cairo;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:2px 0">${p.marker}${p.seriesName}: <b style="color:${p.color}">${p.value}%</b></div>`; });
        return s;
      }
    },
    grid: { left: 8, right: 8, top: 12, bottom: 4, containLabel: true },
    xAxis: {
      type: 'category', data: recRecentChartData.map(r => r.name),
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
        data: recRecentChartData.map(r => r.avg),
        itemStyle: { borderRadius: [6,6,0,0], color: { type:'linear',x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:'#10b981'},{offset:1,color:'#059669'}] } },
        emphasis: { itemStyle: { color: { type:'linear',x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:'#34d399'},{offset:1,color:'#10b981'}] } } }
      },
      {
        name: 'نسبة النجاح', type: 'line',
        data: recRecentChartData.map(r => r.pass),
        smooth: true, symbol: 'circle', symbolSize: 7,
        lineStyle: { color: '#f97316', width: 2 },
        itemStyle: { color: '#f97316', borderColor: '#fff', borderWidth: 2 },
      }
    ]
  }), [recRecentChartData]);

  const courseEnrollOption = useMemo(() => {
    // BUG-3 FIX: reverse so highest-enrolled course appears at TOP of horizontal bar chart
    // (ECharts renders category axis bottom-to-top, so first item = bottom)
    const top = [...courseStatsData.slice(0, 8)].reverse();
    return {
      tooltip: {
        ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' },
        // BUG-7 FIX: d.color is a gradient object when using itemStyle gradient → use fixed hex
        formatter: p => {
          const d = p[0];
          return `<div style="font-family:Cairo"><b style="color:#1e293b">${d.name}</b><br/>${d.marker} الطلاب المشتركون: <b style="color:#6366f1">${d.value}</b></div>`;
        }
      },
      grid: { left: 8, right: 32, top: 6, bottom: 4, containLabel: true },
      xAxis: { type: 'value', minInterval: 1, axisLine:{ show:false }, axisTick:{ show:false }, splitLine:{ lineStyle:{ color:'#f1f5f9', type:'dashed' } }, axisLabel:{ fontFamily:'Cairo', color:'#94a3b8', fontSize:10 } },
      yAxis: { type: 'category', data: top.map(c => c.name?.length > 18 ? c.name.substring(0,18)+'…' : c.name), axisLine:{ show:false }, axisTick:{ show:false }, axisLabel:{ fontFamily:'Cairo', color:'#64748b', fontSize:10 } },
      series: [{
        type: 'bar', name: 'طلاب', barMaxWidth: 20,
        data: top.map((c, i) => ({
          value: c.enrolled_count,
          itemStyle: { borderRadius:[0,6,6,0], color:{ type:'linear',x:0,y:0,x2:1,y2:0, colorStops:[{offset:0,color:CHART_COLORS[i%CHART_COLORS.length]+'70'},{offset:1,color:CHART_COLORS[i%CHART_COLORS.length]}] } }
        })),
        label: { show: true, position:'right', fontFamily:'Cairo', fontSize:10, fontWeight:'bold', color:'#64748b', formatter:'{c}' }
      }]
    };
  }, [courseStatsData]);

  const courseProgressOption = useMemo(() => {
    // BUG-3 FIX: reverse so highest-progress course appears at TOP
    const top = [...courseStatsData.slice(0, 8)].reverse();
    return {
      tooltip: {
        ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' },
        // BUG-7 FIX: compute color from value instead of using gradient object d.color
        formatter: p => {
          const d = p[0];
          const color = d.value >= 70 ? '#10b981' : d.value >= 40 ? '#f59e0b' : '#f43f5e';
          return `<div style="font-family:Cairo"><b style="color:#1e293b">${d.name}</b><br/>${d.marker} متوسط التقدم: <b style="color:${color}">${d.value}%</b></div>`;
        }
      },
      grid: { left: 8, right: 40, top: 6, bottom: 4, containLabel: true },
      xAxis: { type: 'value', max: 100, axisLine:{ show:false }, axisTick:{ show:false }, splitLine:{ lineStyle:{ color:'#f1f5f9', type:'dashed' } }, axisLabel:{ fontFamily:'Cairo', color:'#94a3b8', formatter:'{value}%', fontSize:10 } },
      yAxis: { type: 'category', data: top.map(c => c.name?.length > 18 ? c.name.substring(0,18)+'…' : c.name), axisLine:{ show:false }, axisTick:{ show:false }, axisLabel:{ fontFamily:'Cairo', color:'#64748b', fontSize:10 } },
      series: [{
        type: 'bar', name: 'تقدم', barMaxWidth: 20,
        data: top.map(c => {
          const v = c.avg_progress;
          const color = v >= 70 ? '#10b981' : v >= 40 ? '#f59e0b' : '#f43f5e';
          return { value: v, itemStyle: { borderRadius:[0,6,6,0], color:{ type:'linear',x:0,y:0,x2:1,y2:0, colorStops:[{offset:0,color:color+'70'},{offset:1,color}] } } };
        }),
        label: { show: true, position:'right', fontFamily:'Cairo', fontSize:10, fontWeight:'bold', color:'#64748b', formatter:'{c}%' }
      }]
    };
  }, [courseStatsData]);

  const attemptsDonutOption = useMemo(() => ({
    tooltip: {
      ...tooltipBase,
      trigger: 'item',
      formatter: params => `<div style="font-family:Cairo"><b>${params.name}</b><br/>${params.marker} ${params.value} محاولة <b style="color:${params.color}">(${params.percent}%)</b></div>`,
    },
    series: [{
      type: 'pie',
      radius: ['52%','80%'],
      center: ['50%','50%'],
      padAngle: 3,
      data: pieData.map((item, i) => ({ value: item.value, name: item.name, itemStyle: { color: CHART_COLORS[i % CHART_COLORS.length] } })),
      label: { show: false },
      labelLine: { show: false },
      emphasis: { scale: true, scaleSize: 6, itemStyle: { shadowBlur: 16, shadowColor: 'rgba(0,0,0,0.15)' } },
      animationType: 'scale',
      animationEasing: 'elasticOut',
      animationDelay: 100,
    }]
  }), [pieData]);

  const passFailOption = useMemo(() => ({
    tooltip: {
      ...tooltipBase,
      trigger: 'item',
      formatter: params => `<div style="font-family:Cairo"><b>${params.name}</b><br/>${params.marker} ${params.value} طالب <b style="color:${params.color}">(${params.percent}%)</b></div>`,
    },
    series: [{
      type: 'pie',
      radius: ['50%','78%'],
      center: ['50%','50%'],
      padAngle: 4,
      data: passFailData.map(d => ({ value: d.value, name: d.name, itemStyle: { color: d.fill } })),
      label: { show: false },
      labelLine: { show: false },
      emphasis: { scale: true, scaleSize: 6, itemStyle: { shadowBlur: 16, shadowColor: 'rgba(0,0,0,0.15)' } },
      animationType: 'scale',
      animationEasing: 'elasticOut',
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
      type: 'category',
      data: scoreDistData.map(d => d.name),
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

  const trendOption = useMemo(() => ({
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      formatter: params => {
        let s = `<div style="font-family:Cairo;font-weight:900;color:#1e293b;border-bottom:1px solid #f1f5f9;padding-bottom:6px;margin-bottom:6px">${params[0]?.axisValue}</div>`;
        params.forEach(p => { s += `<div style="font-family:Cairo;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:2px 0">${p.marker}${p.seriesName}: <b style="color:${p.color}">${p.value}${p.seriesName.includes('%') ? '%' : ''}</b></div>`; });
        return s;
      }
    },
    legend: {
      bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8,
      textStyle: { fontFamily: 'Cairo', fontSize: 11, color: '#64748b' }
    },
    grid: { left: 8, right: 8, top: 12, bottom: 32, containLabel: true },
    xAxis: {
      type: 'category',
      data: trendChartData.map(d => d.name),
      boundaryGap: false,
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { fontFamily: 'Cairo', color: '#94a3b8', fontSize: 11 }
    },
    yAxis: [
      {
        type: 'value', max: 100,
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
        axisLabel: { fontFamily: 'Cairo', color: '#94a3b8', fontSize: 10, formatter: '{value}%' },
        axisLine: { show: false }, axisTick: { show: false }
      },
      {
        type: 'value',
        splitLine: { show: false },
        axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }
      }
    ],
    series: [
      {
        name: 'متوسط %', type: 'line', yAxisIndex: 0,
        data: trendChartData.map(d => d.avg),
        smooth: true, symbol: 'circle', symbolSize: 8,
        lineStyle: { color: '#6366f1', width: 2.5 },
        itemStyle: { color: '#6366f1', borderColor: '#fff', borderWidth: 2.5 },
        areaStyle: { color: { type:'linear',x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:'rgba(99,102,241,0.22)'},{offset:1,color:'rgba(99,102,241,0.01)'}] } }
      },
      {
        name: 'محاولات', type: 'line', yAxisIndex: 1,
        data: trendChartData.map(d => d.attempts),
        smooth: true, symbol: 'circle', symbolSize: 7,
        lineStyle: { color: '#f97316', width: 2 },
        itemStyle: { color: '#f97316', borderColor: '#fff', borderWidth: 2 },
        areaStyle: { color: { type:'linear',x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:'rgba(249,115,22,0.16)'},{offset:1,color:'rgba(249,115,22,0.01)'}] } }
      }
    ]
  }), [trendChartData]);
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
    <div className="space-y-3">
      {selectedStudentId && (
        <StudentProfileModal studentId={selectedStudentId} onClose={() => setSelectedStudentId(null)} />
      )}

      {/* Page Title */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-black text-navy-700 flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-md">
            <Activity className="w-5 h-5 text-white" />
          </div>
          التحليلات والإحصائيات
        </h1>
      </div>

      {/* Stat Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {[...Array(5)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {stats.map((s, i) => <StatCard key={i} {...s} />)}
        </div>
      )}

      {/* Row 1: Exam Bar + Attempts Donut */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[...Array(2)].map((_, i) => <div key={i} className="h-72 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">

          {/* Exam Performance Card */}
          {examChartData.length > 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-300 flex flex-col">
              <div className="h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 flex-shrink-0" />
              <div className="p-5 pb-3 flex-shrink-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm flex-shrink-0">
                      <BarChart3 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="font-black text-gray-800 dark:text-gray-200 text-sm">أداء الاختبارات</h2>
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">متوسط وأعلى درجة % لكل اختبار</p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <div className="text-center px-2.5 py-1.5 bg-slate-50 dark:bg-gray-700/50 rounded-xl border border-slate-100 dark:border-gray-600">
                      <p className="text-xs font-black text-slate-700 dark:text-gray-200">{totalAttempts}</p>
                      <p className="text-[9px] text-slate-400 dark:text-gray-400 font-semibold">محاولة</p>
                    </div>
                    <div className="text-center px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl border border-emerald-100 dark:border-emerald-800">
                      <p className="text-xs font-black text-emerald-600 dark:text-emerald-400">{examChartData.length ? Math.max(...examChartData.map(e => e.avg)) : 0}%</p>
                      <p className="text-[9px] text-emerald-400 dark:text-emerald-300 font-semibold">أعلى متوسط</p>
                    </div>
                    <div className="text-center px-2.5 py-1.5 bg-rose-50 dark:bg-rose-900/30 rounded-xl border border-rose-100 dark:border-rose-800">
                      <p className="text-xs font-black text-rose-500 dark:text-rose-400">{examChartData.length ? Math.min(...examChartData.map(e => e.avg)) : 0}%</p>
                      <p className="text-[9px] text-rose-300 dark:text-rose-200 font-semibold">أدنى متوسط</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-3 pb-1 flex-shrink-0">
                <ReactECharts option={examBarOption} style={{ height: '210px' }} notMerge opts={{ renderer: 'svg' }} />
              </div>

              <div className="px-5 pb-3 flex items-center gap-4 flex-shrink-0 flex-wrap">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                  <span className="w-3 h-3 rounded-sm" style={{ background: '#6366f1' }} />متوسط الدرجات
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                  <span className="w-3 h-3 rounded-sm" style={{ background: '#10b981' }} />أعلى درجة
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                  <span className="w-3 h-3 rounded-sm" style={{ background: '#f43f5e' }} />أدنى درجة
                </span>
              </div>

              <div className="border-t border-gray-50 dark:border-gray-700 flex-1 overflow-y-auto">
                {examChartData.map((e, i) => {
                  const avg = e.avg;
                  const sc = avg >= 70 ? { text:'#10b981', bg: dark ? 'rgba(16,185,129,0.15)' : '#dcfce7' } : avg >= 50 ? { text:'#6366f1', bg: dark ? 'rgba(99,102,241,0.15)' : '#ede9fe' } : { text:'#f43f5e', bg: dark ? 'rgba(244,63,94,0.15)' : '#ffe4e6' };
                  return (
                    <div key={i} className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-50/70 dark:hover:bg-gray-700/40 transition-colors border-b border-gray-50 dark:border-gray-700 last:border-0">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black text-white flex-shrink-0"
                          style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}>
                          {i + 1}
                        </span>
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">{e.fullName}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 mr-2">
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">{e.attempts} محاولة</span>
                        <span className="text-[11px] font-black px-2 py-0.5 rounded-lg" style={{ color: sc.text, background: sc.bg }}>
                          {avg}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-8 flex items-center justify-center">
              <EmptyState icon={BarChart3} text="لا توجد بيانات اختبارات بعد" />
            </div>
          )}

          {/* Right column: Attempts Donut + Top Students */}
          <div className="flex flex-col gap-3">

            {/* Attempts Distribution Donut */}
            <ChartCard title="توزيع المحاولات" subtitle="نسبة المحاولات لكل اختبار"
              icon={Target} iconBg="bg-orange-50" iconColor="text-orange-500">
              {pieData.length > 0 ? (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="flex-shrink-0 relative w-[160px] sm:w-[180px]">
                    <ReactECharts option={attemptsDonutOption} style={{ height: '160px', width: '160px' }} notMerge opts={{ renderer: 'svg' }} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <p className="text-base font-black text-gray-700">{totalAttempts}</p>
                      <p className="text-[10px] text-gray-400 font-semibold">محاولة</p>
                    </div>
                  </div>
                  <div className="flex-1 w-full space-y-2 overflow-y-auto max-h-[200px] pl-1">
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
              ) : <EmptyState icon={Target} text="لا توجد محاولات بعد" />}
            </ChartCard>

            {/* Top Students by Avg Score */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-300">
              <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 flex-shrink-0" />
              <div className="p-5 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                    <Star className="w-4 h-4 text-amber-500" />
                  </div>
                  <div>
                    <h2 className="font-black text-gray-800 dark:text-gray-200 text-sm">أفضل الطلاب أداءً</h2>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium mt-0.5">ترتيب الطلاب حسب متوسط الدرجات</p>
                  </div>
                </div>
              </div>
              {(data?.topStudents?.length > 0) ? (() => {
                const top5 = [...(data.topStudents)]
                  .sort((a, b) => parseFloat(b.avg_score) - parseFloat(a.avg_score))
                  .slice(0, 5);
                return (
                  <div className="border-t border-gray-50 dark:border-gray-700">
                    {top5.map((s, i) => {
                      const avg = Math.round(parseFloat(s.avg_score) || 0);
                      const sc = avg >= 70 ? { text: '#10b981', bg: dark ? 'rgba(16,185,129,0.15)' : '#dcfce7' } : avg >= 50 ? { text: '#6366f1', bg: dark ? 'rgba(99,102,241,0.15)' : '#ede9fe' } : { text: '#f43f5e', bg: dark ? 'rgba(244,63,94,0.15)' : '#ffe4e6' };
                      return (
                        <div key={s.id}
                          className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-50/70 dark:hover:bg-gray-700/40 transition-colors border-b border-gray-50 dark:border-gray-700 last:border-0 cursor-pointer"
                          onClick={() => setSelectedStudentId(s.id)}>
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <span className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black text-white flex-shrink-0"
                              style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}>
                              {i + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">{s.name}</p>
                              <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">{s.exams_taken} اختبار · {s.points} نقطة</p>
                            </div>
                          </div>
                          <span className="text-[11px] font-black px-2 py-0.5 rounded-lg flex-shrink-0 mr-2"
                            style={{ color: sc.text, background: sc.bg }}>
                            {avg}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })() : (
                <div className="p-5 pt-0">
                  <EmptyState icon={Star} text="لا توجد بيانات طلاب بعد" />
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Row 2: Pass/Fail + Score Distribution */}
      {!isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Pass vs Fail */}
          <ChartCard title="نجاح مقابل رسوب" subtitle="توزيع النتائج الكلية"
            icon={Trophy} iconBg="bg-emerald-50" iconColor="text-emerald-500">
            {passFailData.length > 0 ? (
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 relative" style={{ width: '200px' }}>
                  <ReactECharts option={passFailOption} style={{ height: '200px', width: '200px' }} notMerge opts={{ renderer: 'svg' }} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-lg font-black text-gray-700">{passFailData.reduce((s,x)=>s+x.value,0)}</p>
                    <p className="text-[10px] text-gray-400 font-semibold">نتيجة</p>
                  </div>
                </div>
                <div className="flex-1 space-y-3">
                  {passFailData.map((d, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/30">
                      <span className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300">
                        <span className="w-3 h-3 rounded-full" style={{ background: d.fill }} />
                        {d.name}
                      </span>
                      <div className="text-left">
                        <p className="text-lg font-black" style={{ color: d.fill }}>{d.value}</p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
                          {passFailData.reduce((s,x)=>s+x.value,0) > 0
                            ? Math.round(d.value / passFailData.reduce((s,x)=>s+x.value,0) * 100) : 0}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : <EmptyState icon={Trophy} text="لا توجد نتائج بعد" />}
          </ChartCard>

          {/* Score Distribution */}
          <ChartCard title="توزيع الدرجات" subtitle="تصنيف النتائج حسب مستوى الأداء"
            icon={Zap} iconBg="bg-purple-50" iconColor="text-purple-500">
            {scoreDistData.some(d => d.count > 0) ? (
              <ReactECharts option={scoreDistOption} style={{ height: '200px' }} notMerge opts={{ renderer: 'svg' }} />
            ) : <EmptyState icon={Zap} text="لا توجد بيانات كافية" />}
          </ChartCard>
        </div>
      )}

      {/* Trend Chart */}
      <ChartCard
        title="تطور الأداء عبر الزمن"
        subtitle={`متوسط الدرجات والمحاولات — ${TREND_PERIODS.find(p => p.value === trendMonths)?.label}`}
        icon={TrendingUp}
        iconBg="bg-indigo-50"
        iconColor="text-indigo-500"
        headerAction={
          <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-700/50 rounded-xl p-1">
            {TREND_PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setTrendMonths(p.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                  trendMonths === p.value
                    ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-indigo-400 shadow-sm border border-indigo-100 dark:border-indigo-800'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        }>
        <div className={`transition-opacity duration-300 ${trendLoading ? 'opacity-50' : 'opacity-100'}`}>
          {trendChartData.length > 0 ? (
            <ReactECharts option={trendOption} style={{ height: '260px' }} notMerge opts={{ renderer: 'svg' }} />
          ) : (
            <EmptyState icon={TrendingUp} text={trendLoading ? 'جاري تحميل البيانات…' : 'لا توجد بيانات للفترة المختارة'} />
          )}
        </div>
      </ChartCard>

      {/* ── Course Stats Section ──────────────────────────────────────── */}
      {(courseStatsLoading || courseStatsData.length > 0) && (
        <div className="space-y-3">
          {/* header */}
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-400 to-violet-600 flex items-center justify-center shadow-md flex-shrink-0">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-800 dark:text-gray-200">إحصائيات الكورسات</h2>
              <p className="text-xs text-gray-400 font-medium">أداء ومتابعة الكورسات ومستوى تقدم الطلاب</p>
            </div>
          </div>

          {/* summary stat cards */}
          {courseStatsLoading ? (
            <div className="grid grid-cols-3 gap-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: 'إجمالي الكورسات',
                  value: courseStatsData.length,
                  icon: Layers,
                  color: '#6366f1',
                  bg: 'bg-indigo-50',
                },
                {
                  label: 'إجمالي المشتركين',
                  value: courseStatsData.reduce((s, c) => s + (c.enrolled_count || 0), 0),
                  icon: Users,
                  color: '#f97316',
                  bg: 'bg-orange-50',
                },
                {
                  label: 'متوسط التقدم',
                  value: courseStatsData.length
                    ? `${Math.round(courseStatsData.reduce((s, c) => s + (c.avg_progress || 0), 0) / courseStatsData.length)}%`
                    : '0%',
                  icon: TrendingUp,
                  color: '#10b981',
                  bg: 'bg-emerald-50',
                },
              ].map((s, i) => (
                <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm hover:shadow-md transition-all">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${s.bg}`} style={{ color: s.color }}>
                    <s.icon className="w-4 h-4" />
                  </div>
                  <p className="text-xl font-black text-gray-800 dark:text-gray-200 leading-none">{s.value}</p>
                  <p className="text-[10px] font-semibold text-gray-400 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* charts */}
          {!courseStatsLoading && courseStatsData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* enrollment bar */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="h-1 bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400" />
                <div className="p-5 pb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                      <Users className="w-4 h-4 text-indigo-500" />
                    </div>
                    <div>
                      <h3 className="font-black text-gray-800 dark:text-gray-200 text-sm">عدد المشتركين بالكورس</h3>
                      <p className="text-[11px] text-gray-400 font-medium mt-0.5">عدد الطلاب المسجلين في كل كورس</p>
                    </div>
                  </div>
                </div>
                <div className="pb-3">
                  <ReactECharts
                    option={courseEnrollOption}
                    style={{ height: `${Math.max(180, Math.min(courseStatsData.length, 8) * 36)}px` }}
                    notMerge opts={{ renderer: 'svg' }}
                  />
                </div>
              </div>

              {/* progress bar */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="h-1 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400" />
                <div className="p-5 pb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div>
                      <h3 className="font-black text-gray-800 dark:text-gray-200 text-sm">متوسط تقدم الفيديوهات</h3>
                      <p className="text-[11px] text-gray-400 font-medium mt-0.5">متوسط نسبة مشاهدة الفيديوهات</p>
                    </div>
                  </div>
                </div>
                <div className="pb-3">
                  <ReactECharts
                    option={courseProgressOption}
                    style={{ height: `${Math.max(180, Math.min(courseStatsData.length, 8) * 36)}px` }}
                    notMerge opts={{ renderer: 'svg' }}
                  />
                </div>
                <div className="px-5 pb-3 flex items-center gap-3 flex-wrap border-t border-gray-50 dark:border-gray-700">
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />≥ 70% ممتاز
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />40–69% متوسط
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />&lt; 40% ضعيف
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* course cards list */}
          {!courseStatsLoading && courseStatsData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-violet-400 via-fuchsia-400 to-pink-400" />
              <div className="p-5 pb-3 border-b border-gray-50 dark:border-gray-700">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
                    <GraduationCap className="w-4 h-4 text-violet-500" />
                  </div>
                  <div>
                    <h3 className="font-black text-gray-800 dark:text-gray-200 text-sm">تفاصيل الكورسات</h3>
                    <p className="text-[11px] text-gray-400 font-medium mt-0.5">ملخص أداء كل كورس</p>
                  </div>
                </div>
              </div>
              <div className="divide-y divide-gray-50 dark:divide-gray-700">
                {courseStatsData.slice(0, 10).map((c, i) => {
                  const prog = c.avg_progress || 0;
                  const progColor = prog >= 70 ? '#10b981' : prog >= 40 ? '#f59e0b' : '#f43f5e';
                  const progBg = prog >= 70 ? (dark ? 'rgba(16,185,129,0.15)' : '#dcfce7') : prog >= 40 ? (dark ? 'rgba(245,158,11,0.15)' : '#fef3c7') : (dark ? 'rgba(244,63,94,0.15)' : '#ffe4e6');
                  return (
                    <div key={c.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/70 dark:hover:bg-gray-700/40 transition-colors">
                      <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white flex-shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">{c.name}</p>
                          {c.target_stage && (
                            <span className="text-[10px] font-medium text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full flex-shrink-0">{c.target_stage}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1.5">
                          <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${prog}%`, background: progColor }} />
                          </div>
                          <span className="text-[10px] font-black flex-shrink-0 px-1.5 py-0.5 rounded-md" style={{ color: progColor, background: progBg }}>{prog}%</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 text-right">
                        <div className="text-center hidden sm:block">
                          <p className="text-sm font-black text-indigo-500">{c.enrolled_count}</p>
                          <p className="text-[9px] text-gray-400 font-medium">مشترك</p>
                        </div>
                        <div className="text-center hidden sm:block">
                          <p className="text-sm font-black text-emerald-500">{c.active_students}</p>
                          <p className="text-[9px] text-gray-400 font-medium">نشط</p>
                        </div>
                        <div className="text-center hidden sm:block">
                          <p className="text-sm font-black text-gray-500">{c.total_videos}</p>
                          <p className="text-[9px] text-gray-400 font-medium">فيديو</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {courseStatsData.length > 10 && (
                <div className="px-5 py-3 border-t border-gray-50 dark:border-gray-700 bg-gray-50/50 text-center">
                  <p className="text-xs text-gray-400 font-medium">يُعرض 10 من {courseStatsData.length} كورس</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Recitations Analytics Section ─────────────────────────────── */}
      {(recLoading || (recData?.summary?.total_recitations > 0)) && (
        <div className="space-y-3">
          {/* Recitations header */}
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-md flex-shrink-0">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-800 dark:text-gray-200">تحليلات المذاكرة</h2>
              <p className="text-xs text-gray-400 font-medium">إحصائيات جلسات التسميع والتحفيظ</p>
            </div>
          </div>

          {/* Recitations stat mini-cards */}
          {recLoading ? (
            <div className="grid grid-cols-3 gap-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'إجمالي المذاكرات', value: recData?.summary?.total_recitations ?? 0, icon: BookOpen, color: '#10b981', bg: 'bg-emerald-50' },
                { label: 'إجمالي الجلسات', value: recData?.summary?.total_results ?? 0, icon: Target, color: '#6366f1', bg: 'bg-indigo-50' },
                { label: 'متوسط الدرجات', value: `${Math.round(recData?.summary?.avg_score ?? 0)}%`, icon: TrendingUp, color: '#f97316', bg: 'bg-orange-50' },
              ].map((s, i) => (
                <div key={i} className="relative bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm overflow-hidden hover:shadow-md transition-all duration-300">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${s.bg}`} style={{ color: s.color }}>
                    <s.icon className="w-4 h-4" />
                  </div>
                  <p className="text-xl font-black text-gray-800 dark:text-gray-200 leading-none">{s.value}</p>
                  <p className="text-[10px] font-semibold text-gray-400 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Recitations charts row */}
          {!recLoading && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Recent recitations bar */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="h-1 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400" />
                <div className="p-5 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <BarChart3 className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div>
                      <h3 className="font-black text-gray-800 dark:text-gray-200 text-sm">أداء المذاكرات الأخيرة</h3>
                      <p className="text-[11px] text-gray-400 font-medium mt-0.5">متوسط الدرجات ونسبة النجاح</p>
                    </div>
                  </div>
                </div>
                {recRecentChartData.length > 0 ? (
                  <>
                    <div className="px-2">
                      <ReactECharts option={recBarOption} style={{ height: '220px' }} notMerge opts={{ renderer: 'svg' }} />
                    </div>
                    <div className="px-5 pb-3 flex items-center gap-4">
                      <span className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500">
                        <span className="w-3 h-3 rounded-sm bg-emerald-500" />متوسط الدرجات
                      </span>
                      <span className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500">
                        <span className="w-3 h-3 rounded-full bg-orange-400" />نسبة النجاح
                      </span>
                    </div>
                  </>
                ) : <div className="p-5 pt-0"><EmptyState icon={BookOpen} text="لا توجد مذاكرات بعد" /></div>}
              </div>

              {/* Top students by streak */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400" />
                <div className="p-5 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                      <Flame className="w-4 h-4 text-amber-500" />
                    </div>
                    <div>
                      <h3 className="font-black text-gray-800 dark:text-gray-200 text-sm">أعلى الطلاب في الاستمرارية</h3>
                      <p className="text-[11px] text-gray-400 font-medium mt-0.5">ترتيب حسب Streak المذاكرة</p>
                    </div>
                  </div>
                </div>
                {(recData?.top_students?.length > 0) ? (
                  <div className="border-t border-gray-50 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700">
                    {recData.top_students.slice(0, 6).map((s, i) => {
                      const avg = Math.round(parseFloat(s.avg_score) || 0);
                      const sc = avg >= 70 ? { text: '#10b981', bg: dark ? 'rgba(16,185,129,0.15)' : '#dcfce7' } : avg >= 50 ? { text: '#6366f1', bg: dark ? 'rgba(99,102,241,0.15)' : '#ede9fe' } : { text: '#f43f5e', bg: dark ? 'rgba(244,63,94,0.15)' : '#ffe4e6' };
                      return (
                        <div key={s.id} onClick={() => setSelectedStudentId(s.id)} className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-50/70 dark:hover:bg-gray-700/40 transition-colors cursor-pointer">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <span className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black text-white flex-shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}>{i + 1}</span>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">{s.name}</p>
                              <p className="text-[10px] text-gray-400 font-medium">{s.total_completed} جلسة</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {parseInt(s.current_streak) > 0 && (
                              <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-lg">
                                🔥 {s.current_streak}
                              </span>
                            )}
                            <span className="text-[11px] font-black px-2 py-0.5 rounded-lg" style={{ color: sc.text, background: sc.bg }}>{avg}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : <div className="p-5 pt-0"><EmptyState icon={Flame} text="لا توجد بيانات مذاكرة بعد" /></div>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── At-Risk Students Section ───────────────────────────────────── */}
      {!atRiskLoading && atRiskData.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-rose-400 via-orange-400 to-amber-400" />
          <div className="p-5 border-b border-gray-50 dark:border-gray-700">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center flex-shrink-0">
                  <ShieldAlert className="w-4 h-4 text-rose-500" />
                </div>
                <div>
                  <h2 className="font-black text-gray-800 dark:text-gray-200 text-sm">الطلاب في خطر</h2>
                  <p className="text-[11px] text-gray-400 font-medium mt-0.5">طلاب يحتاجون انتباهاً خاصاً — ضعف أداء أو غياب</p>
                </div>
              </div>
              <span className="text-xs font-black text-rose-500 bg-rose-50 px-3 py-1.5 rounded-full border border-rose-100">{atRiskData.length} طالب</span>
            </div>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {atRiskData.slice(0, 10).map(s => {
              const examPct = s.avg_exam_pct !== null ? Math.round(parseFloat(s.avg_exam_pct)) : null;
              const videoPct = Math.round(parseFloat(s.avg_video_pct) || 0);
              const lastAct = s.last_activity ? new Date(s.last_activity).toLocaleDateString('ar-EG') : 'لا يوجد';
              return (
                <div key={s.id} onClick={() => setSelectedStudentId(s.id)} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/70 dark:hover:bg-gray-700/40 transition-colors cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{s.name}</p>
                      {s.academic_stage && <span className="text-[10px] font-medium text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">{s.academic_stage}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {s.exam_risk && examPct !== null && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-rose-500 bg-rose-50 dark:bg-rose-900/30 px-2 py-0.5 rounded-full">
                          <XCircle className="w-3 h-3" />اختبارات: {examPct}%
                        </span>
                      )}
                      {s.video_risk && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-500 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
                          <AlertTriangle className="w-3 h-3" />مشاهدة: {videoPct}%
                        </span>
                      )}
                      {s.inactive_risk && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                          <Clock className="w-3 h-3" />آخر نشاط: {lastAct}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-[10px] text-gray-400 font-medium">{s.exams_taken} اختبار</p>
                    <p className="text-[10px] text-gray-400 font-medium">{s.enrolled_courses} كورس</p>
                  </div>
                  <Eye className="w-4 h-4 text-gray-300 flex-shrink-0" />
                </div>
              );
            })}
          </div>
          {atRiskData.length > 10 && (
            <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50 text-center">
              <p className="text-xs text-gray-400 font-medium">يُعرض 10 من {atRiskData.length} طالب في خطر</p>
            </div>
          )}
        </div>
      )}

      {/* ── Student Distribution Charts ────────────────────────────────── */}
      {!isLoading && (data?.topStudents?.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* By Stage */}
          <ChartCard title="توزيع الطلاب بالمرحلة الدراسية" subtitle="عدد الطلاب في كل مرحلة"
            icon={GraduationCap} iconBg="bg-blue-50" iconColor="text-blue-500">
            {stageDistData.length > 0 ? (
              <ReactECharts option={stageBarOption} style={{ height: `${Math.max(160, stageDistData.length * 34)}px` }} notMerge opts={{ renderer: 'svg' }} />
            ) : <EmptyState icon={GraduationCap} text="لا توجد بيانات" />}
          </ChartCard>

          {/* By Gender */}
          <ChartCard title="توزيع الطلاب بالجنس" subtitle="نسبة الذكور والإناث"
            icon={PieChart} iconBg="bg-pink-50" iconColor="text-pink-500">
            {genderDistData.length > 0 ? (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="flex-shrink-0 relative w-[160px] sm:w-[180px]">
                  <ReactECharts option={genderDonutOption} style={{ height: '160px', width: '160px' }} notMerge opts={{ renderer: 'svg' }} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-base font-black text-gray-700 dark:text-gray-200">{genderDistData.reduce((s,d)=>s+d.value,0)}</p>
                    <p className="text-[10px] text-gray-400 font-semibold">طالب</p>
                  </div>
                </div>
                <div className="flex-1 w-full space-y-2.5">
                  {genderDistData.map((d, i) => {
                    const total = genderDistData.reduce((s, x) => s + x.value, 0);
                    const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
                    const color = d.name === 'ذكر' ? '#6366f1' : d.name === 'أنثى' ? '#ec4899' : '#94a3b8';
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="flex items-center gap-1.5 text-xs font-bold text-gray-600 dark:text-gray-300">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />{d.name}
                          </span>
                          <span className="text-xs font-black" style={{ color }}>{d.value} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : <EmptyState icon={PieChart} text="لا توجد بيانات" />}
          </ChartCard>
        </div>
      )}

      {/* Wrong Questions Section */}
      {wrongQData.length > 0 && (() => {
        const currentExam = wrongQData[wrongQExamIdx];
        const letterColors = { A: '#6366f1', B: '#f59e0b', C: '#10b981', D: '#f43f5e' };
        return (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400" />
            <div className="p-5 border-b border-gray-50 dark:border-gray-700">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  </div>
                  <div>
                    <h2 className="font-black text-gray-800 text-sm">أكثر الأسئلة خطأً</h2>
                    <p className="text-[11px] text-gray-400 font-medium mt-0.5">الأسئلة التي أخطأ فيها الطلاب بأعلى نسبة — أعلى 5 لكل امتحان</p>
                  </div>
                </div>
                {wrongQData.length > 1 && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => setWrongQExamIdx(i => Math.max(0, i - 1))} disabled={wrongQExamIdx === 0}
                      className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 disabled:opacity-30 transition-all">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-bold text-gray-500">
                      {wrongQExamIdx + 1} / {wrongQData.length}
                    </span>
                    <button onClick={() => setWrongQExamIdx(i => Math.min(wrongQData.length - 1, i + 1))} disabled={wrongQExamIdx === wrongQData.length - 1}
                      className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 disabled:opacity-30 transition-all">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-3 px-3 py-2 bg-orange-50 rounded-xl border border-orange-100">
                <p className="text-xs font-black text-orange-700">📝 {currentExam.exam_title}</p>
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {currentExam.questions.map((q, idx) => {
                const pct = parseFloat(q.wrong_pct) || 0;
                const barColor = pct >= 70 ? '#f43f5e' : pct >= 40 ? '#f59e0b' : '#10b981';
                const optionLetters = ['A', 'B', 'C', 'D'];
                const optionTexts = [q.option_a, q.option_b, q.option_c, q.option_d];
                return (
                  <div key={q.question_id} className="p-4 hover:bg-gray-50/60 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-50 border border-red-100 flex items-center justify-center">
                        <span className="text-[10px] font-black text-red-500">{idx + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 leading-relaxed mb-2"><MathText text={q.question_text} /></p>
                        <div className="grid grid-cols-2 gap-1.5 mb-3">
                          {optionLetters.map((letter, li) => (
                            optionTexts[li] ? (
                              <div key={letter}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                  letter === q.correct_answer_letter?.toUpperCase()
                                    ? 'bg-green-50 border-green-200 text-green-700'
                                    : 'bg-gray-50 border-gray-100 text-gray-600'
                                }`}>
                                <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0"
                                  style={{ background: letterColors[letter] || '#94a3b8', color: '#fff' }}>
                                  {letter}
                                </span>
                                <span className="truncate">{optionTexts[li]}</span>
                                {letter === q.correct_answer_letter?.toUpperCase() && (
                                  <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0 mr-auto" />
                                )}
                              </div>
                            ) : null
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: barColor }} />
                          </div>
                          <span className="text-xs font-black flex-shrink-0" style={{ color: barColor }}>{pct}% خطأ</span>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">({q.wrong_count}/{q.total_attempts})</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50/50">
              <button
                onClick={() => navigate('/teacher/wrong-questions')}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-red-50 hover:bg-red-100 border border-red-100 hover:border-red-200 text-red-600 text-sm font-black transition-all group">
                <AlertTriangle className="w-4 h-4" />
                عرض المزيد — تقرير كامل لجميع الامتحانات
                <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        );
      })()}

      {/* Search + Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="ابحث عن طالب بالاسم..."
              className="w-full pr-9 pl-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 placeholder-gray-400 focus:outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 transition" />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 hover:text-gray-600">
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
                      stageFilter === stage
                        ? 'bg-indigo-600 text-white shadow'
                        : 'bg-gray-50 border border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600'
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
        <div className="p-5 border-b border-gray-50 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <h2 className="font-black text-gray-800 text-sm">تحليل أداء الطلاب</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {filteredStudents.length} طالب
                {activeFiltersCount > 0 || searchQuery ? ' (بعد الفلترة)' : ''}
              </p>
            </div>
          </div>
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-all">
            <Download className="w-3.5 h-3.5" /> تصدير CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: '600px' }}>
            <thead>
              <tr className="bg-gray-50/50">
                {[
                  { key: 'name', label: 'الطالب' },
                  { key: 'username', label: 'كود الطالب' },
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
                  <tr key={i}><td colSpan={7}><div className="h-10 bg-gray-100 animate-pulse m-2 rounded" /></td></tr>
                ))
              ) : filteredStudents.slice(0, studentsPage).map((s, i) => {
                const avg = Math.round(parseFloat(s.avg_score) || 0);
                const sc = avg >= 70 ? { text:'#10b981', bg: dark ? 'rgba(16,185,129,0.15)' : '#dcfce7' } : avg >= 50 ? { text:'#6366f1', bg: dark ? 'rgba(99,102,241,0.15)' : '#ede9fe' } : { text:'#f43f5e', bg: dark ? 'rgba(244,63,94,0.15)' : '#ffe4e6' };
                return (
                  <tr key={s.id} className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                          style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}>{i + 1}</span>
                        <p className="text-sm font-bold text-gray-800">{s.name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-xs text-orange-600">{s.username}</span>
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
                <tr><td colSpan={7} className="text-center py-10 text-gray-400 text-sm font-semibold">لا توجد نتائج</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filteredStudents.length > studentsPage && (
          <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50 flex items-center justify-between">
            <p className="text-xs text-gray-500 font-medium">يُعرض {studentsPage} من {filteredStudents.length}</p>
            <button onClick={() => setStudentsPage(p => p + 10)}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition">
              عرض المزيد
            </button>
          </div>
        )}
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-50 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
              <Award className="w-4 h-4 text-purple-500" />
            </div>
            <div>
              <h2 className="font-black text-gray-800 text-sm">سجل النتائج</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">{filteredResults.length} نتيجة</p>
            </div>
          </div>
        </div>

        {/* Results Filters */}
        <div className="px-5 py-3 border-b border-gray-50 flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input type="text" value={resultsSearch} onChange={e => setResultsSearch(e.target.value)}
              placeholder="بحث في النتائج..."
              className="w-full pr-8 pl-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 placeholder-gray-400 focus:outline-none focus:border-orange-300 transition" />
          </div>
          <select value={resultsExamFilter} onChange={e => setResultsExamFilter(e.target.value)}
            className="py-2 px-3 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 focus:outline-none focus:border-orange-300 transition">
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
          <table className="w-full" style={{ minWidth: '560px' }}>
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-4 py-3 text-right text-[11px] font-black text-gray-500">الطالب</th>
                <th className="px-4 py-3 text-right text-[11px] font-black text-gray-500">كود الطالب</th>
                <th className="px-4 py-3 text-right text-[11px] font-black text-gray-500">الاختبار</th>
                <th className="px-4 py-3 text-center text-[11px] font-black text-gray-500">الدرجة</th>
                <th className="px-4 py-3 text-center text-[11px] font-black text-gray-500">الحالة</th>
                <th className="px-4 py-3 text-center text-[11px] font-black text-gray-500 hidden sm:table-cell">صواب / خطأ</th>
                <th className="px-4 py-3 text-center text-[11px] font-black text-gray-500 hidden sm:table-cell">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.slice(0, resultsPage).map(r => {
                const passed = r.score >= r.pass_score;
                const pct = r.total_score ? Math.round((r.score / r.total_score) * 100) : 0;
                return (
                  <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors group">
                    <td className="px-4 py-3 font-bold text-gray-800 text-sm">{r.student_name}</td>
                    <td className="px-4 py-3 font-mono font-bold text-xs text-orange-600">{r.student_username || '—'}</td>
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
                    <td className="px-4 py-3 text-center text-[11px] text-gray-400 font-medium hidden sm:table-cell">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString('ar-EG') : '—'}
                    </td>
                  </tr>
                );
              })}
              {filteredResults.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400 text-sm font-semibold">لا توجد نتائج</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filteredResults.length > resultsPage && (
          <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50 flex items-center justify-between">
            <p className="text-xs text-gray-500 font-medium">يُعرض {resultsPage} من {filteredResults.length}</p>
            <button onClick={() => setResultsPage(p => p + 10)}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition">
              عرض المزيد
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
