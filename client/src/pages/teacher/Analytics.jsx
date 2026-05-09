import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../context/ThemeContext';
import {
  BarChart3, TrendingUp, Users, Award, Target, GraduationCap,
  CheckCircle2, XCircle, Clock, Star, ChevronUp, ChevronDown,
  Minus, Eye, Search, Filter, X as XIcon, Download, Calendar,
  Activity, Zap, Trophy
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line, Area, AreaChart, RadialBarChart, RadialBar,
  ComposedChart,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import StudentProfileModal from '../../components/ui/StudentProfileModal';

const PALETTE = {
  navy:    '#1A2E4A',
  orange:  '#FF8C00',
  indigo:  '#6366f1',
  emerald: '#10b981',
  amber:   '#f59e0b',
  purple:  '#8b5cf6',
  rose:    '#f43f5e',
  cyan:    '#06b6d4',
};
const CHART_COLORS = Object.values(PALETTE);

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

const CustomTooltip = ({ active, payload, label }) => {
  const { dark } = useTheme();
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-2xl shadow-2xl p-4 text-sm font-cairo min-w-[160px] border"
      style={{
        backgroundColor: dark ? 'var(--dk-elevated)' : 'rgba(255,255,255,0.97)',
        borderColor: dark ? 'var(--dk-border-md)' : '#f1f5f9',
        backdropFilter: 'blur(8px)',
        boxShadow: dark ? '0 20px 60px rgba(0,0,0,0.60)' : '0 20px 60px rgba(0,0,0,0.12)',
      }}>
      {label && (
        <p className="font-black mb-2 text-xs pb-2"
          style={{ color: dark ? 'var(--dk-text-1)' : '#1e293b', borderBottom: `1px solid ${dark ? 'var(--dk-border)' : '#f1f5f9'}` }}>
          {label}
        </p>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-xs font-semibold"
            style={{ color: dark ? 'var(--dk-text-2)' : '#475569' }}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-black text-xs" style={{ color: p.color }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

const EmptyState = ({ icon: Icon, text }) => (
  <div className="h-52 flex flex-col items-center justify-center gap-3 text-gray-300">
    <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center">
      <Icon className="w-8 h-8 text-gray-300" />
    </div>
    <p className="text-sm font-bold text-gray-400">{text}</p>
  </div>
);

const StatCard = ({ label, value, icon: Icon, gradient, lightBg, textColor, delta }) => (
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
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow duration-300">
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <div>
          <h2 className="font-black text-gray-800 text-sm">{title}</h2>
          {subtitle && <p className="text-[11px] text-gray-400 font-medium mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {headerAction}
    </div>
    {children}
  </div>
);

const GradientDefs = () => (
  <defs>
    <linearGradient id="gradIndigo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stopColor="#6366f1" stopOpacity={0.25} />
      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
    </linearGradient>
    <linearGradient id="gradOrange" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stopColor="#FF8C00" stopOpacity={0.25} />
      <stop offset="100%" stopColor="#FF8C00" stopOpacity={0.02} />
    </linearGradient>
    <linearGradient id="gradEmerald" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stopColor="#10b981" stopOpacity={0.25} />
      <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
    </linearGradient>
    <linearGradient id="gradNavy" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stopColor="#1A2E4A" stopOpacity={0.30} />
      <stop offset="100%" stopColor="#1A2E4A" stopOpacity={0.02} />
    </linearGradient>
    <linearGradient id="barNavy" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#1A2E4A" />
      <stop offset="100%" stopColor="#2d4a7a" />
    </linearGradient>
    <linearGradient id="barOrange" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#FF8C00" />
      <stop offset="100%" stopColor="#f97316" />
    </linearGradient>
    <linearGradient id="barEmerald" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#10b981" />
      <stop offset="100%" stopColor="#059669" />
    </linearGradient>
    <linearGradient id="barIndigo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#6366f1" />
      <stop offset="100%" stopColor="#4f46e5" />
    </linearGradient>
  </defs>
);

export default function TeacherAnalytics() {
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
  const [trendMonths, setTrendMonths]   = useState(6);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['teacher-analytics'],
    queryFn: () => api.get('/teachers/analytics').then(r => r.data),
  });

  const { data: trendData = [], isFetching: trendLoading } = useQuery({
    queryKey: ['teacher-analytics-trend', trendMonths],
    queryFn: () => api.get(`/teachers/analytics/trend?months=${trendMonths}`).then(r => r.data),
    keepPreviousData: true,
  });

  const examChartData = (data?.examResults || []).map(e => ({
    name: e.title?.length > 14 ? e.title.substring(0, 14) + '…' : e.title,
    fullName: e.title,
    'متوسط': Math.round(parseFloat(e.avg_pct) || 0),
    'أعلى':  Math.round(parseFloat(e.max_pct)  || 0),
    'محاولات': parseInt(e.attempt_count) || 0,
    passScore: Math.round(parseFloat(e.pass_score || 0) / parseFloat(e.total_score || 1) * 100),
  }));

  const pieData = (data?.examResults || [])
    .map(e => ({ name: e.title?.substring(0, 14), value: parseInt(e.attempt_count) || 0 }))
    .filter(e => e.value > 0);

  const totalAttempts = (data?.examResults || []).reduce((s, e) => s + parseInt(e.attempt_count || 0), 0);
  const avgScore = data?.examResults?.length
    ? Math.round((data.examResults || []).reduce((s, e) => s + parseFloat(e.avg_pct || 0), 0) / data.examResults.length) : 0;

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
      { name: 'ناجح', value: pass,  fill: PALETTE.emerald },
      { name: 'راسب', value: fail,  fill: PALETTE.rose    },
    ];
  }, [data]);

  const scoreDistData = useMemo(() => {
    const results = data?.recentResults || [];
    const bands = [
      { name: '0–39',   min: 0,  max: 39,  fill: PALETTE.rose    },
      { name: '40–59',  min: 40, max: 59,  fill: PALETTE.amber   },
      { name: '60–74',  min: 60, max: 74,  fill: PALETTE.cyan    },
      { name: '75–89',  min: 75, max: 89,  fill: PALETTE.indigo  },
      { name: '90–100', min: 90, max: 100, fill: PALETTE.emerald },
    ];
    return bands.map(b => ({
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
        'متوسط %': parseFloat(d.avg_pct) || 0,
        'محاولات': d.exam_count,
        'طلاب':    d.student_count,
        'ناجح':    d.pass_count,
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
        'متوسط %': found ? parseFloat(found.avg_pct) || 0 : 0,
        'محاولات': found ? found.exam_count : 0,
        'طلاب':    found ? found.student_count : 0,
        'ناجح':    found ? found.pass_count : 0,
      });
    }
    return result;
  }, [trendData, trendMonths]);

  const stats = [
    { label: 'الاختبارات النشطة',  value: data?.examResults?.length || 0,  icon: BarChart3,  gradient: 'linear-gradient(135deg,#3b82f6,#6366f1)', lightBg: 'bg-blue-50',    textColor: '#3b82f6' },
    { label: 'إجمالي المحاولات',   value: totalAttempts,                    icon: Target,    gradient: 'linear-gradient(135deg,#f97316,#ef4444)', lightBg: 'bg-orange-50',  textColor: '#f97316' },
    { label: 'متوسط الدرجات',      value: `${avgScore}%`,                   icon: TrendingUp,gradient: 'linear-gradient(135deg,#10b981,#06b6d4)', lightBg: 'bg-emerald-50', textColor: '#10b981' },
    { label: 'نسبة النجاح',         value: `${passRate}%`,                   icon: Award,     gradient: 'linear-gradient(135deg,#8b5cf6,#ec4899)', lightBg: 'bg-purple-50',  textColor: '#8b5cf6' },
    { label: 'إجمالي الطلاب',       value: data?.topStudents?.length || 0,   icon: Users,     gradient: 'linear-gradient(135deg,#f59e0b,#f97316)', lightBg: 'bg-amber-50',   textColor: '#f59e0b' },
  ];

  const exportCSV = () => {
    const headers = ['الاسم', 'المرحلة الدراسية', 'الجنس', 'النقاط', 'عدد الاختبارات', 'متوسط الدرجات%'];
    const rows = filteredStudents.map(s => [
      s.name, s.academic_stage || '—', s.gender || '—', s.points, s.exams_taken,
      Math.round(parseFloat(s.avg_score) || 0),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
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
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
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
          {/* Exam Performance Card — Redesigned */}
          {examChartData.length > 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-300 flex flex-col">
              {/* Top accent */}
              <div className="h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 flex-shrink-0" />

              {/* Header */}
              <div className="p-5 pb-3 flex-shrink-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm flex-shrink-0">
                      <BarChart3 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="font-black text-gray-800 text-sm">أداء الاختبارات</h2>
                      <p className="text-[11px] text-gray-400 mt-0.5">متوسط وأعلى درجة % لكل اختبار</p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <div className="text-center px-2.5 py-1.5 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-xs font-black text-slate-700">{totalAttempts}</p>
                      <p className="text-[9px] text-slate-400 font-semibold">محاولة</p>
                    </div>
                    <div className="text-center px-2.5 py-1.5 bg-emerald-50 rounded-xl border border-emerald-100">
                      <p className="text-xs font-black text-emerald-600">{examChartData.length ? Math.max(...examChartData.map(e => e['متوسط'])) : 0}%</p>
                      <p className="text-[9px] text-emerald-400 font-semibold">أعلى متوسط</p>
                    </div>
                    <div className="text-center px-2.5 py-1.5 bg-rose-50 rounded-xl border border-rose-100">
                      <p className="text-xs font-black text-rose-500">{examChartData.length ? Math.min(...examChartData.map(e => e['متوسط'])) : 0}%</p>
                      <p className="text-[9px] text-rose-300 font-semibold">أدنى متوسط</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Chart */}
              <div className="px-2 pb-1 flex-shrink-0">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={examChartData} margin={{ top: 4, right: 8, left: -14, bottom: 0 }} barGap={2} barCategoryGap="18%">
                    <GradientDefs />
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fontFamily: 'Cairo', fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis tick={{ fontSize: 9, fontFamily: 'Cairo', fill: '#94a3b8' }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} tickCount={5} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.05)', radius: 8 }} />
                    <Bar dataKey="متوسط" fill="#1A2E4A" radius={[5,5,0,0]} animationDuration={1200} animationEasing="ease-out" />
                    <Bar dataKey="أعلى"  fill="#FF8C00" radius={[5,5,0,0]} animationDuration={1400} animationEasing="ease-out" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Legend */}
              <div className="px-5 pb-3 flex items-center gap-4 flex-shrink-0">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500">
                  <span className="w-3 h-3 rounded-sm" style={{ background: '#1A2E4A' }} />متوسط الدرجات
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500">
                  <span className="w-3 h-3 rounded-sm" style={{ background: '#FF8C00' }} />أعلى درجة
                </span>
              </div>

              {/* Exam rows — use fullName so nothing is cut off */}
              <div className="border-t border-gray-50 flex-1 overflow-y-auto">
                {examChartData.map((e, i) => {
                  const avg = e['متوسط'];
                  const sc = avg >= 70 ? { text:'#10b981', bg:'#dcfce7' } : avg >= 50 ? { text:'#6366f1', bg:'#ede9fe' } : { text:'#f43f5e', bg:'#ffe4e6' };
                  return (
                    <div key={i} className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-50/70 transition-colors border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black text-white flex-shrink-0"
                          style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}>
                          {i + 1}
                        </span>
                        <span className="text-xs font-semibold text-gray-700 truncate">{e.fullName}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 mr-2">
                        <span className="text-[10px] text-gray-400 font-medium">{e['محاولات']} محاولة</span>
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
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 flex items-center justify-center">
              <EmptyState icon={BarChart3} text="لا توجد بيانات اختبارات بعد" />
            </div>
          )}

          {/* Right column: Attempts Donut + Top Students */}
          <div className="flex flex-col gap-3">

            {/* Attempts Distribution Donut */}
            <ChartCard title="توزيع المحاولات" subtitle="نسبة المحاولات لكل اختبار"
              icon={Target} iconBg="bg-orange-50" iconColor="text-orange-500">
              {pieData.length > 0 ? (
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-[180px]">
                    <ResponsiveContainer width={180} height={180}>
                      <PieChart>
                        <GradientDefs />
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={82}
                          paddingAngle={3} dataKey="value"
                          animationBegin={100} animationDuration={1200} animationEasing="ease-out"
                          stroke="none">
                          {pieData.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <p className="text-center -mt-2 text-[11px] font-bold text-gray-400">
                      {totalAttempts} محاولة إجمالاً
                    </p>
                  </div>
                  <div className="flex-1 space-y-2 overflow-y-auto max-h-[200px] pl-1">
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
                              <div className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${pct}%`, background: color }} />
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
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-300">
              <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 flex-shrink-0" />
              <div className="p-5 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                    <Star className="w-4 h-4 text-amber-500" />
                  </div>
                  <div>
                    <h2 className="font-black text-gray-800 text-sm">أفضل الطلاب أداءً</h2>
                    <p className="text-[11px] text-gray-400 font-medium mt-0.5">ترتيب الطلاب حسب متوسط الدرجات</p>
                  </div>
                </div>
              </div>
              {(data?.topStudents?.length > 0) ? (() => {
                const top5 = [...(data.topStudents)]
                  .sort((a, b) => parseFloat(b.avg_score) - parseFloat(a.avg_score))
                  .slice(0, 5);
                return (
                  <div className="border-t border-gray-50">
                    {top5.map((s, i) => {
                      const avg = Math.round(parseFloat(s.avg_score) || 0);
                      const sc = avg >= 70
                        ? { text: '#10b981', bg: '#dcfce7' }
                        : avg >= 50
                        ? { text: '#6366f1', bg: '#ede9fe' }
                        : { text: '#f43f5e', bg: '#ffe4e6' };
                      return (
                        <div key={s.id}
                          className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-50/70 transition-colors border-b border-gray-50 last:border-0 cursor-pointer"
                          onClick={() => setSelectedStudentId(s.id)}>
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <span className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black text-white flex-shrink-0"
                              style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}>
                              {i + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-gray-700 truncate">{s.name}</p>
                              <p className="text-[10px] text-gray-400 font-medium">{s.exams_taken} اختبار · {s.points} نقطة</p>
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
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie data={passFailData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                      dataKey="value" paddingAngle={4}
                      animationBegin={200} animationDuration={1200} animationEasing="ease-out"
                      stroke="none">
                      {passFailData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
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
            ) : <EmptyState icon={Trophy} text="لا توجد نتائج بعد" />}
          </ChartCard>

          {/* Score Distribution */}
          <ChartCard title="توزيع الدرجات" subtitle="تصنيف النتائج حسب مستوى الأداء"
            icon={Zap} iconBg="bg-purple-50" iconColor="text-purple-500">
            {scoreDistData.some(d => d.count > 0) ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={scoreDistData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }} barCategoryGap="30%">
                  <GradientDefs />
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: 'Cairo', fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fontFamily: 'Cairo', fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(139,92,246,0.05)', radius: 8 }} />
                  <Bar dataKey="count" name="عدد الطلاب" radius={[8, 8, 0, 0]} maxBarSize={40}
                    animationDuration={1300} animationEasing="ease-out">
                    {scoreDistData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState icon={Zap} text="لا توجد بيانات كافية" />}
          </ChartCard>
        </div>
      )}

      {/* Trend Chart */}
      <ChartCard
        title="تطور الأداء عبر الزمن"
        subtitle={`متوسط الدرجات والمحاولات - ${TREND_PERIODS.find(p => p.value === trendMonths)?.label}`}
        icon={TrendingUp}
        iconBg="bg-indigo-50"
        iconColor="text-indigo-500"
        headerAction={
          <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1">
            {TREND_PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setTrendMonths(p.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                  trendMonths === p.value
                    ? 'bg-white text-indigo-600 shadow-sm border border-indigo-100'
                    : 'text-gray-500 hover:text-gray-700'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        }>
        <div className={`transition-opacity duration-300 ${trendLoading ? 'opacity-50' : 'opacity-100'}`}>
          {trendChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={trendChartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <GradientDefs />
                <defs>
                  <linearGradient id="trendGradIndigo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#6366f1" stopOpacity={0.20} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.01} />
                  </linearGradient>
                  <linearGradient id="trendGradOrange" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#FF8C00" stopOpacity={0.20} />
                    <stop offset="100%" stopColor="#FF8C00" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: 'Cairo', fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="pct" tick={{ fontSize: 11, fontFamily: 'Cairo', fill: '#94a3b8' }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <YAxis yAxisId="cnt" orientation="left" tick={{ fontSize: 11, fontFamily: 'Cairo', fill: '#94a3b8' }} axisLine={false} tickLine={false} hide />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontFamily: 'Cairo', fontSize: '11px', paddingTop: '8px' }} />
                <Area yAxisId="pct" type="monotone" dataKey="متوسط %" stroke="#6366f1" strokeWidth={2.5}
                  fill="url(#trendGradIndigo)"
                  dot={{ r: 4, fill: '#6366f1', strokeWidth: 2.5, stroke: '#fff' }}
                  activeDot={{ r: 7, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }}
                  animationDuration={1500} animationEasing="ease-out" />
                <Area yAxisId="cnt" type="monotone" dataKey="محاولات" stroke="#FF8C00" strokeWidth={2}
                  fill="url(#trendGradOrange)"
                  dot={{ r: 3.5, fill: '#FF8C00', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 6, fill: '#FF8C00', stroke: '#fff', strokeWidth: 2 }}
                  animationDuration={1700} animationEasing="ease-out" />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={TrendingUp} text={trendLoading ? 'جاري تحميل البيانات…' : 'لا توجد بيانات للفترة المختارة'} />
          )}
        </div>
      </ChartCard>

      {/* Search + Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="ابحث عن طالب بالاسم..."
              className="w-full pr-9 pl-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 placeholder-gray-400 focus:outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 transition" />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 hover:text-gray-600">
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
                        ? 'bg-[#1A2E4A] text-white shadow'
                        : 'bg-gray-50 border border-gray-200 text-gray-500 hover:border-[#1A2E4A]/30 hover:text-[#1A2E4A]'
                    }`}>{stage}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-black text-gray-400 mb-2 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-blue-500" /> الجنس
                </p>
                <div className="flex gap-2">
                  {GENDERS.map(g => (
                    <button key={g} onClick={() => setGenderFilter(g)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex-1 ${
                        genderFilter === g
                          ? 'bg-blue-500 text-white shadow'
                          : 'bg-gray-50 border border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-500'
                      }`}>{g}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-black text-gray-400 mb-2 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> مستوى الأداء
                </p>
                <div className="flex gap-2 flex-wrap">
                  {PERF_LEVELS.map(p => (
                    <button key={p.label} onClick={() => setPerfFilter(p.label)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                        perfFilter === p.label
                          ? 'bg-emerald-500 text-white shadow'
                          : 'bg-gray-50 border border-gray-200 text-gray-500 hover:border-emerald-300 hover:text-emerald-600'
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
        <div className="p-5 border-b border-gray-50 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Users className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <h2 className="font-black text-gray-800 text-sm">أداء الطلاب</h2>
              <p className="text-[11px] text-gray-400">
                {filteredStudents.length} طالب
                {stageFilter !== 'الكل' && <span className="text-orange-500 mr-1">· {stageFilter}</span>}
                {searchQuery && <span className="text-blue-500 mr-1">· نتائج البحث</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-orange-500 bg-orange-50 px-2 py-1 rounded-full flex items-center gap-1">
              <Eye className="w-3 h-3" /> اضغط على الطالب لعرض ملفه
            </span>
            {filteredStudents.length > 0 && (
              <button onClick={exportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-sm">
                <Download className="w-3.5 h-3.5" /> تصدير CSV
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-4 py-3 text-right text-[11px] font-black text-gray-500 w-10">#</th>
                <th className="px-4 py-3 text-right text-[11px] font-black text-gray-500">الطالب</th>
                <th className="px-4 py-3 text-right text-[11px] font-black text-gray-500">المرحلة</th>
                <th className="px-4 py-3 text-[11px] font-black text-gray-500 cursor-pointer hover:text-orange-500 transition-colors" onClick={() => handleSort('points')}>
                  <span className="flex items-center justify-center gap-1">النقاط <SortIcon field="points" /></span>
                </th>
                <th className="px-4 py-3 text-[11px] font-black text-gray-500 cursor-pointer hover:text-orange-500 transition-colors" onClick={() => handleSort('exams_taken')}>
                  <span className="flex items-center justify-center gap-1">الاختبارات <SortIcon field="exams_taken" /></span>
                </th>
                <th className="px-4 py-3 text-[11px] font-black text-gray-500 cursor-pointer hover:text-orange-500 transition-colors" onClick={() => handleSort('avg_score')}>
                  <span className="flex items-center justify-center gap-1">المتوسط <SortIcon field="avg_score" /></span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredStudents.length > 0 ? filteredStudents.slice(0, studentsPage).map((s, i) => {
                const avg = Math.round(parseFloat(s.avg_score) || 0);
                const avgColor = avg >= 80 ? '#10b981' : avg >= 60 ? '#6366f1' : avg >= 40 ? '#f59e0b' : '#f43f5e';
                const rankColors = ['from-yellow-400 to-yellow-500', 'from-gray-300 to-gray-400', 'from-orange-400 to-orange-500'];
                return (
                  <tr key={s.id} onClick={() => setSelectedStudentId(s.id)}
                    className="hover:bg-orange-50/40 transition-colors cursor-pointer group">
                    <td className="px-4 py-3.5">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black text-white mx-auto bg-gradient-to-b ${rankColors[i] || 'from-navy-400 to-navy-600'}`}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-bold text-gray-800 text-sm group-hover:text-orange-600 transition-colors flex items-center gap-2">
                        {s.name}
                        <Eye className="w-3.5 h-3.5 text-orange-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-[11px] bg-blue-50 text-blue-600 font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
                        {s.academic_stage || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="flex items-center justify-center gap-1 text-amber-500 font-bold text-sm">
                        <Star className="w-3.5 h-3.5 fill-amber-400 stroke-amber-400" /> {s.points}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center font-semibold text-gray-600 text-sm">{s.exams_taken}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2 min-w-[100px]">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div className="h-1.5 rounded-full transition-all duration-700"
                            style={{ width: `${avg}%`, background: avgColor }} />
                        </div>
                        <span className="text-xs font-black w-8 text-right" style={{ color: avgColor }}>{avg}%</span>
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400 text-sm font-semibold">لا توجد نتائج مطابقة</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filteredStudents.length > studentsPage && (
          <div className="p-4 border-t border-gray-50 text-center">
            <button onClick={() => setStudentsPage(p => p + 10)}
              className="px-6 py-2 rounded-xl border-2 border-dashed border-gray-200 text-gray-500 text-sm font-bold hover:border-orange-300 hover:text-orange-500 hover:bg-orange-50/50 transition-all">
              عرض المزيد ({filteredStudents.length - studentsPage} طالب آخر)
            </button>
          </div>
        )}
      </div>

      {/* Recent Results */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-50 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Clock className="w-4 h-4 text-indigo-500" />
            </div>
            <div>
              <h2 className="font-black text-gray-800 text-sm">آخر النتائج</h2>
              <p className="text-[11px] text-gray-400">{filteredResults.length} نتيجة</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input type="text" value={resultsSearch} onChange={e => setResultsSearch(e.target.value)}
                placeholder="بحث..." className="pr-8 pl-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold w-36 focus:outline-none focus:border-indigo-300 transition" />
            </div>
            <select value={resultsExamFilter} onChange={e => setResultsExamFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 focus:outline-none focus:border-indigo-300 transition bg-white">
              {examOptions.map(o => <option key={o}>{o}</option>)}
            </select>
            {['الكل', 'ناجح', 'راسب'].map(s => (
              <button key={s} onClick={() => setResultsStatus(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  resultsStatus === s
                    ? s === 'ناجح' ? 'bg-emerald-500 text-white' : s === 'راسب' ? 'bg-rose-500 text-white' : 'bg-indigo-500 text-white'
                    : 'bg-gray-50 border border-gray-200 text-gray-500 hover:border-indigo-200'
                }`}>{s}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-4 py-3 text-right text-[11px] font-black text-gray-500">الطالب</th>
                <th className="px-4 py-3 text-right text-[11px] font-black text-gray-500">الاختبار</th>
                <th className="px-4 py-3 text-center text-[11px] font-black text-gray-500">الدرجة</th>
                <th className="px-4 py-3 text-center text-[11px] font-black text-gray-500">الحالة</th>
                <th className="px-4 py-3 text-center text-[11px] font-black text-gray-500">الصواب / الخطأ</th>
                <th className="px-4 py-3 text-center text-[11px] font-black text-gray-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredResults.length > 0 ? filteredResults.slice(0, resultsPage).map(r => {
                const passed = r.score >= r.pass_score;
                const pct = r.total_score ? Math.round((r.score / r.total_score) * 100) : 0;
                return (
                  <tr key={r.id} className="hover:bg-gray-50/70 transition-colors group">
                    <td className="px-4 py-3.5 font-bold text-gray-800 text-sm">{r.student_name}</td>
                    <td className="px-4 py-3.5 text-gray-600 text-sm max-w-[160px] truncate">{r.exam_title}</td>
                    <td className="px-4 py-3.5 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={`font-black text-sm ${passed ? 'text-emerald-600' : 'text-rose-500'}`}>{r.score}/{r.total_score}</span>
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: passed ? '#10b981' : '#f43f5e' }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                        passed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                        {passed ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {passed ? 'ناجح' : 'راسب'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="text-xs font-semibold text-emerald-600">✓ {r.correct_count}</span>
                      <span className="mx-1.5 text-gray-300">|</span>
                      <span className="text-xs font-semibold text-rose-500">✗ {r.wrong_count}</span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <button onClick={() => navigate(`/teacher/exam-review/${r.id}`)}
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white text-xs font-bold rounded-lg transition-all border border-indigo-200 hover:border-indigo-600 mx-auto">
                        <Eye className="w-3.5 h-3.5" /> مراجعة
                      </button>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400 text-sm font-semibold">لا توجد نتائج مطابقة</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filteredResults.length > resultsPage && (
          <div className="p-4 border-t border-gray-50 text-center">
            <button onClick={() => setResultsPage(p => p + 10)}
              className="px-6 py-2 rounded-xl border-2 border-dashed border-gray-200 text-gray-500 text-sm font-bold hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/50 transition-all">
              عرض المزيد ({filteredResults.length - resultsPage} نتيجة أخرى)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
