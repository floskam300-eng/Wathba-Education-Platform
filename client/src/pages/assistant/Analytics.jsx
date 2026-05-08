import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3, TrendingUp, Users, Award, Target, GraduationCap,
  CheckCircle2, XCircle, Clock, Star, ChevronUp, ChevronDown,
  Minus, Eye, Search, Filter, X as XIcon
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import StudentProfileModal from '../../components/ui/StudentProfileModal';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import api from '../../lib/api';

const CHART_COLORS = ['#1A2E4A', '#FF8C00', '#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
const STAGES = ['الكل', 'الصف الأول الثانوي', 'الصف الثاني الثانوي', 'الصف الثالث الثانوي', 'الصف الأول الإعدادي', 'الصف الثاني الإعدادي', 'الصف الثالث الإعدادي', 'جامعي'];
const GENDERS = ['الكل', 'ذكر', 'أنثى'];
const PERF_LEVELS = [
  { label: 'الكل',   min: 0,  max: 100 },
  { label: 'ممتاز', min: 80, max: 100 },
  { label: 'جيد',   min: 60, max: 79  },
  { label: 'متوسط', min: 40, max: 59  },
  { label: 'ضعيف',  min: 0,  max: 39  },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-xl p-3 text-sm font-cairo min-w-[150px]">
      {label && <p className="font-bold text-gray-700 mb-2 text-xs border-b pb-1.5">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-semibold text-xs py-0.5 flex justify-between gap-4">
          <span>{p.name}</span><span className="font-black">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

const EmptyState = ({ icon: Icon, text }) => (
  <div className="h-52 flex flex-col items-center justify-center gap-2 text-gray-300">
    <Icon className="w-12 h-12" />
    <p className="text-sm font-semibold text-gray-400">{text}</p>
  </div>
);

const StatCard = ({ label, value, icon: Icon, gradient, lightBg, textColor, sub }) => (
  <div className="relative bg-white rounded-2xl border border-gray-100 p-5 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
    <div className="absolute inset-0 opacity-0 hover:opacity-5 transition-opacity rounded-2xl" style={{ background: gradient }} />
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

  // Search + extra filters
  const [searchQuery, setSearchQuery]   = useState('');
  const [genderFilter, setGenderFilter] = useState('الكل');
  const [perfFilter, setPerfFilter]     = useState('الكل');
  const [showFilters, setShowFilters]   = useState(false);

  // Results section independent filters
  const [resultsSearch, setResultsSearch]         = useState('');
  const [resultsExamFilter, setResultsExamFilter] = useState('الكل');
  const [resultsStatus, setResultsStatus]         = useState('الكل');
  const [resultsPage, setResultsPage]             = useState(10);

  // Students pagination
  const [studentsPage, setStudentsPage] = useState(10);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['assistant-analytics'],
    queryFn: () => api.get('/assistants/analytics').then(r => r.data),
  });

  const examChartData = (data?.examResults || []).map(e => ({
    name: e.title?.length > 12 ? e.title.substring(0, 12) + '…' : e.title,
    'متوسط': Math.round(parseFloat(e.avg_score) || 0),
    'أعلى':  Math.round(parseFloat(e.max_score)  || 0),
    'محاولات': parseInt(e.attempt_count) || 0,
  }));

  const pieData = (data?.examResults || [])
    .map(e => ({ name: e.title?.substring(0, 14), value: parseInt(e.attempt_count) || 0 }))
    .filter(e => e.value > 0);

  const totalAttempts = (data?.examResults || []).reduce((s, e) => s + parseInt(e.attempt_count || 0), 0);
  const avgScore      = data?.examResults?.length
    ? Math.round((data.examResults || []).reduce((s, e) => s + parseFloat(e.avg_score || 0), 0) / data.examResults.length) : 0;
  const passRate = (() => {
    const results = data?.recentResults || [];
    if (!results.length) return 0;
    return Math.round((results.filter(r => r.score >= r.pass_score).length / results.length) * 100);
  })();

  const stats = [
    { label: 'الاختبارات النشطة', value: data?.examResults?.length || 0, icon: BarChart3,  gradient: 'linear-gradient(135deg,#3b82f6,#6366f1)', lightBg: 'bg-blue-50',    textColor: '#3b82f6' },
    { label: 'إجمالي المحاولات',  value: totalAttempts,                   icon: Target,    gradient: 'linear-gradient(135deg,#f97316,#ef4444)', lightBg: 'bg-orange-50',  textColor: '#f97316' },
    { label: 'متوسط الدرجات',     value: `${avgScore}%`,                  icon: TrendingUp,gradient: 'linear-gradient(135deg,#10b981,#06b6d4)', lightBg: 'bg-emerald-50', textColor: '#10b981' },
    { label: 'نسبة النجاح',        value: `${passRate}%`,                  icon: Award,     gradient: 'linear-gradient(135deg,#8b5cf6,#ec4899)', lightBg: 'bg-purple-50',  textColor: '#8b5cf6' },
    { label: 'إجمالي الطلاب',      value: data?.topStudents?.length || 0,  icon: Users,     gradient: 'linear-gradient(135deg,#f59e0b,#f97316)', lightBg: 'bg-amber-50',   textColor: '#f59e0b' },
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
      list = list.filter(r =>
        r.student_name?.toLowerCase().includes(q) ||
        r.exam_title?.toLowerCase().includes(q)
      );
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

  const activeFiltersCount = [
    genderFilter !== 'الكل',
    perfFilter   !== 'الكل',
    stageFilter  !== 'الكل',
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearchQuery('');
    setStageFilter('الكل');
    setGenderFilter('الكل');
    setPerfFilter('الكل');
  };

  if (isError) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
      <XCircle className="w-12 h-12 text-red-400" />
      <p className="text-gray-500 font-semibold">تعذّر تحميل البيانات</p>
    </div>
  );

  return (
    <div className="space-y-6">
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

      {/* Charts */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[...Array(2)].map((_, i) => <div key={i} className="h-72 rounded-2xl bg-gray-100 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <h2 className="font-black text-gray-800 text-sm">أداء الاختبارات</h2>
                <p className="text-[11px] text-gray-400 font-medium">متوسط وأعلى درجة لكل اختبار</p>
              </div>
            </div>
            {examChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={examChartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: 'Cairo', fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fontFamily: 'Cairo', fill: '#94a3b8' }} axisLine={false} tickLine={false} domain={[0, 100]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ fontFamily: 'Cairo', fontSize: '11px', paddingTop: '10px' }} />
                  <Bar dataKey="متوسط" fill="#1A2E4A" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="أعلى"  fill="#FF8C00" radius={[6, 6, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState icon={BarChart3} text="لا توجد بيانات اختبارات بعد" />}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
                <Target className="w-4 h-4 text-orange-500" />
              </div>
              <div>
                <h2 className="font-black text-gray-800 text-sm">توزيع المحاولات</h2>
                <p className="text-[11px] text-gray-400 font-medium">عدد المحاولات لكل اختبار</p>
              </div>
            </div>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="45%" innerRadius={65} outerRadius={100}
                    paddingAngle={3} dataKey="value" animationBegin={0} animationDuration={800}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ fontFamily: 'Cairo', fontSize: '11px', paddingTop: '8px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyState icon={Target} text="لا توجد محاولات بعد" />}
          </div>
        </div>
      )}

      {/* ── Search + Filters Bar ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="ابحث عن طالب بالاسم..."
              className="w-full pr-9 pl-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 placeholder-gray-400 focus:outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 transition"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(f => !f)}
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
                    }`}>
                    {stage}
                  </button>
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
                      }`}>
                      {g}
                    </button>
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
                      }`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-50 flex items-center justify-between">
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
          <span className="text-[10px] font-semibold text-orange-500 bg-orange-50 px-2 py-1 rounded-full flex items-center gap-1">
            <Eye className="w-3 h-3" /> اضغط على الطالب لعرض ملفه
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-4 py-3 text-right text-[11px] font-black text-gray-500 w-10">#</th>
                <th className="px-4 py-3 text-right text-[11px] font-black text-gray-500">الطالب</th>
                <th className="px-4 py-3 text-right text-[11px] font-black text-gray-500">المرحلة</th>
                <th className="px-4 py-3 text-[11px] font-black text-gray-500 cursor-pointer hover:text-orange-500 transition-colors"
                  onClick={() => handleSort('points')}>
                  <span className="flex items-center justify-center gap-1">النقاط <SortIcon field="points" /></span>
                </th>
                <th className="px-4 py-3 text-[11px] font-black text-gray-500 cursor-pointer hover:text-orange-500 transition-colors"
                  onClick={() => handleSort('exams_taken')}>
                  <span className="flex items-center justify-center gap-1">الاختبارات <SortIcon field="exams_taken" /></span>
                </th>
                <th className="px-4 py-3 text-[11px] font-black text-gray-500 cursor-pointer hover:text-orange-500 transition-colors"
                  onClick={() => handleSort('avg_score')}>
                  <span className="flex items-center justify-center gap-1">المتوسط <SortIcon field="avg_score" /></span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredStudents.length > 0 ? filteredStudents.slice(0, studentsPage).map((s, i) => {
                const avg = Math.round(parseFloat(s.avg_score) || 0);
                const rankColors = ['from-yellow-400 to-yellow-500', 'from-gray-300 to-gray-400', 'from-orange-400 to-orange-500'];
                return (
                  <tr key={s.id} onClick={() => setSelectedStudentId(s.id)}
                    className="hover:bg-orange-50/60 transition-colors cursor-pointer group">
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
                            style={{ width: `${Math.min(avg, 100)}%`, background: avg >= 50 ? 'linear-gradient(90deg,#10b981,#06b6d4)' : 'linear-gradient(90deg,#ef4444,#f97316)' }} />
                        </div>
                        <span className={`text-xs font-black w-8 text-left ${avg >= 50 ? 'text-emerald-600' : 'text-red-500'}`}>{avg}%</span>
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={6} className="py-14 text-center">
                    <GraduationCap className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                    <p className="text-gray-400 font-medium text-sm">
                      {searchQuery ? `لا توجد نتائج للبحث عن "${searchQuery}"` : 'لا يوجد طلاب مطابقون'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filteredStudents.length > studentsPage && (
          <div className="px-5 py-4 border-t border-gray-50 flex items-center justify-between">
            <p className="text-xs text-gray-400 font-medium">
              يُعرض <span className="font-black text-gray-600">{Math.min(studentsPage, filteredStudents.length)}</span> من <span className="font-black text-gray-600">{filteredStudents.length}</span> طالب
            </p>
            <button
              onClick={() => setStudentsPage(p => p + 10)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold transition-colors border border-emerald-200">
              <ChevronDown className="w-4 h-4" /> عرض المزيد
            </button>
          </div>
        )}
        {filteredStudents.length > 0 && filteredStudents.length <= studentsPage && studentsPage > 10 && (
          <div className="px-5 py-3 border-t border-gray-50 text-center">
            <p className="text-xs text-gray-400 font-medium">تم عرض جميع الطلاب ({filteredStudents.length})</p>
          </div>
        )}
      </div>

      {/* Recent Results */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Results header + filters */}
        <div className="p-5 border-b border-gray-50 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                <Award className="w-4 h-4 text-purple-500" />
              </div>
              <div>
                <h2 className="font-black text-gray-800 text-sm">آخر النتائج</h2>
                <p className="text-[11px] text-gray-400">
                  يُعرض <span className="font-black text-gray-600">{Math.min(resultsPage, filteredResults.length)}</span> من <span className="font-black text-gray-600">{filteredResults.length}</span> نتيجة
                  {stageFilter !== 'الكل' && <span className="text-orange-500 mr-1">· {stageFilter}</span>}
                </p>
              </div>
            </div>
          </div>

          {/* Results search + filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={resultsSearch}
                onChange={e => { setResultsSearch(e.target.value); setResultsPage(10); }}
                placeholder="ابحث باسم الطالب أو الاختبار..."
                className="w-full pr-8 pl-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 placeholder-gray-400 focus:outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100 transition"
              />
              {resultsSearch && (
                <button onClick={() => { setResultsSearch(''); setResultsPage(10); }}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <select
              value={resultsExamFilter}
              onChange={e => { setResultsExamFilter(e.target.value); setResultsPage(10); }}
              className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 focus:outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100 transition bg-white cursor-pointer max-w-[180px]">
              {examOptions.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>

            <div className="flex gap-1.5">
              {['الكل', 'ناجح', 'راسب'].map(s => (
                <button key={s} onClick={() => { setResultsStatus(s); setResultsPage(10); }}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                    resultsStatus === s
                      ? s === 'ناجح' ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                        : s === 'راسب' ? 'bg-red-500 border-red-500 text-white shadow-sm'
                        : 'bg-purple-500 border-purple-500 text-white shadow-sm'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300 bg-white'
                  }`}>
                  {s === 'ناجح' ? '✓ ناجح' : s === 'راسب' ? '✗ راسب' : 'الكل'}
                </button>
              ))}
            </div>

            {(resultsSearch || resultsExamFilter !== 'الكل' || resultsStatus !== 'الكل') && (
              <button
                onClick={() => { setResultsSearch(''); setResultsExamFilter('الكل'); setResultsStatus('الكل'); setResultsPage(10); }}
                className="flex items-center gap-1 px-2.5 py-2 rounded-xl border border-red-200 text-red-500 text-xs font-bold hover:bg-red-50 transition">
                <XIcon className="w-3 h-3" /> مسح
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[740px]">
            <thead>
              <tr className="bg-gray-50/50">
                {['الطالب', 'المرحلة', 'الاختبار', 'الدرجة', 'صواب', 'خطأ', 'التاريخ', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-right text-[11px] font-black text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredResults.length > 0 ? filteredResults.slice(0, resultsPage).map(r => {
                const passed = r.score >= r.pass_score;
                const pct = Math.min(Math.round((r.score / Math.max(r.total_score, 1)) * 100), 100);
                return (
                  <tr key={r.id} className="hover:bg-orange-50/30 transition-colors">
                    <td className="px-4 py-3.5 font-bold text-gray-800 text-sm">{r.student_name}</td>
                    <td className="px-4 py-3.5">
                      <span className="text-[11px] bg-blue-50 text-blue-600 font-semibold px-2 py-0.5 rounded-full">{r.academic_stage || '—'}</span>
                    </td>
                    <td className="px-4 py-3.5 text-gray-600 font-medium text-xs max-w-[140px] truncate">{r.exam_title}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-14 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div className={`h-1.5 rounded-full ${passed ? 'bg-emerald-500' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className={`font-black text-xs ${passed ? 'text-emerald-600' : 'text-red-500'}`}>{r.score}/{r.total_score}</span>
                        {passed ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="flex items-center gap-1 text-emerald-600 font-bold text-sm">
                        <CheckCircle2 className="w-3.5 h-3.5" /> {r.correct_count}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="flex items-center gap-1 text-red-500 font-bold text-sm">
                        <XCircle className="w-3.5 h-3.5" /> {r.wrong_count}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-gray-400 text-xs font-medium whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString('ar-EG', { day: '2-digit', month: 'short' })}
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => navigate(`/assistant/exam-review/${r.id}`)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors border border-indigo-200 whitespace-nowrap">
                        <Eye className="w-3.5 h-3.5" /> مراجعة
                      </button>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={8} className="py-14 text-center">
                    <Clock className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                    <p className="text-gray-400 font-medium text-sm">لا توجد نتائج مطابقة</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filteredResults.length > resultsPage && (
          <div className="px-5 py-4 border-t border-gray-50 flex items-center justify-between">
            <p className="text-xs text-gray-400 font-medium">
              يُعرض <span className="font-black text-gray-600">{Math.min(resultsPage, filteredResults.length)}</span> من <span className="font-black text-gray-600">{filteredResults.length}</span> نتيجة
            </p>
            <button
              onClick={() => setResultsPage(p => p + 10)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold transition-colors border border-purple-200">
              <ChevronDown className="w-4 h-4" /> عرض المزيد
            </button>
          </div>
        )}
        {filteredResults.length > 0 && filteredResults.length <= resultsPage && resultsPage > 10 && (
          <div className="px-5 py-3 border-t border-gray-50 text-center">
            <p className="text-xs text-gray-400 font-medium">تم عرض جميع النتائج ({filteredResults.length})</p>
          </div>
        )}
      </div>
    </div>
  );
}
