import React, { useState, useMemo, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, BarChart3, Users, Award, Target, TrendingUp,
  CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp,
  Search, Minus, AlertTriangle, Zap, Trophy, Eye,
  Timer, Hash, HelpCircle
} from 'lucide-react';
const _EChartsCore = lazy(() => import('echarts-for-react'));
const ReactECharts = (props) => (
  <Suspense fallback={<div className="animate-pulse bg-gray-50 rounded-xl" style={{ height: props.style?.height || '200px' }} />}>
    <_EChartsCore {...props} />
  </Suspense>
);
import MathText from '../../components/MathText';
import StudentProfileModal from '../../components/ui/StudentProfileModal';
import api from '../../lib/api';

const CHART_COLORS = ['#6366f1','#f97316','#10b981','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#f43f5e'];
const LETTER_COLORS = { A: '#6366f1', B: '#f59e0b', C: '#10b981', D: '#f43f5e', T: '#10b981', F: '#f43f5e' };
const DIST_COLORS = { '0-39': '#f43f5e', '40-59': '#f59e0b', '60-74': '#06b6d4', '75-89': '#6366f1', '90-100': '#10b981' };

const tooltipBase = {
  backgroundColor: '#ffffff',
  borderColor: '#f1f5f9',
  borderWidth: 1,
  textStyle: { fontFamily: 'Cairo', fontSize: 12, color: '#1e293b' },
  extraCssText: 'box-shadow:0 20px 60px rgba(0,0,0,0.12);border-radius:12px;padding:10px 14px',
};

const StatCard = ({ label, value, sub, icon: Icon, gradient, lightBg, textColor }) => (
  <div className="relative bg-white rounded-2xl border border-gray-100 p-5 shadow-sm overflow-hidden group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-default">
    <div className="absolute inset-0 opacity-0 group-hover:opacity-[0.03] transition-opacity rounded-2xl" style={{ background: gradient }} />
    <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-[0.06] transition-all group-hover:opacity-[0.10] group-hover:scale-110 duration-500" style={{ background: gradient }} />
    <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110 duration-300 ${lightBg}`} style={{ color: textColor }}>
      <Icon className="w-5 h-5" />
    </div>
    <p className="text-2xl font-black text-gray-800 leading-none tracking-tight">{value}</p>
    <p className="text-xs font-semibold text-gray-400 mt-1.5">{label}</p>
    {sub && <p className="text-[10px] font-medium text-gray-300 mt-0.5">{sub}</p>}
  </div>
);

export default function ExamAnalytics() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [sortField, setSortField] = useState('score');
  const [sortDir, setSortDir] = useState('desc');
  const [questionsView, setQuestionsView] = useState('hardest'); // 'hardest' | 'easiest'
  const [expandedQ, setExpandedQ] = useState(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['exam-analytics', examId],
    queryFn: () => api.get(`/teachers/analytics/exam/${examId}`).then(r => r.data),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 30_000,
  });

  const exam = data?.exam;
  const ov = data?.overview || {};
  const scoreDist = data?.score_distribution || [];
  const qStats = data?.question_stats || [];
  const studentResults = data?.student_results || [];

  // Sorted questions
  const sortedQuestions = useMemo(() => {
    if (!qStats.length) return [];
    const sorted = [...qStats];
    if (questionsView === 'hardest') {
      sorted.sort((a, b) => b.wrong_pct - a.wrong_pct || b.wrong_count - a.wrong_count);
    } else {
      sorted.sort((a, b) => b.correct_pct - a.correct_pct || b.correct_count - a.correct_count);
    }
    return sorted;
  }, [qStats, questionsView]);

  // Filtered & sorted students
  const filteredStudents = useMemo(() => {
    let list = [...studentResults];
    if (studentSearch.trim()) {
      const q = studentSearch.trim().toLowerCase();
      list = list.filter(s => s.student_name?.toLowerCase().includes(q));
    }
    return list.sort((a, b) => {
      const valA = parseFloat(a[sortField]) || 0;
      const valB = parseFloat(b[sortField]) || 0;
      return sortDir === 'desc' ? valB - valA : valA - valB;
    });
  }, [studentResults, studentSearch, sortField, sortDir]);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };
  const SortIcon = ({ field }) => {
    if (sortField !== field) return <Minus className="w-3 h-3 opacity-30" />;
    return sortDir === 'desc' ? <ChevronDown className="w-3 h-3 text-orange-500" /> : <ChevronUp className="w-3 h-3 text-orange-500" />;
  };

  // ── ECharts Options ───────────────────────────────────────────────────────
  const passFailOption = useMemo(() => ({
    tooltip: {
      ...tooltipBase,
      trigger: 'item',
      formatter: params => `<div style="font-family:Cairo"><b>${params.name}</b><br/>${params.marker} ${params.value} طالب <b style="color:${params.color}">(${params.percent}%)</b></div>`,
    },
    series: [{
      type: 'pie', radius: ['52%', '80%'], center: ['50%', '50%'], padAngle: 4,
      data: [
        { value: ov.pass_count || 0, name: 'ناجح', itemStyle: { color: '#10b981' } },
        { value: ov.fail_count || 0, name: 'راسب', itemStyle: { color: '#f43f5e' } },
      ],
      label: { show: false }, labelLine: { show: false },
      emphasis: { scale: true, scaleSize: 6, itemStyle: { shadowBlur: 16, shadowColor: 'rgba(0,0,0,0.15)' } },
      animationType: 'scale', animationEasing: 'elasticOut',
    }]
  }), [ov]);

  const scoreDistOption = useMemo(() => ({
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: params => {
        const p = params[0];
        return `<div style="font-family:Cairo"><b style="color:#1e293b">${p.name}</b><br/>${p.marker} عدد الطلاب: <b style="color:${DIST_COLORS[p.name] || '#6366f1'}">${p.value}</b></div>`;
      }
    },
    grid: { left: 8, right: 8, top: 12, bottom: 4, containLabel: true },
    xAxis: {
      type: 'category',
      data: scoreDist.map(d => d.range),
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
      data: scoreDist.map(d => ({
        value: d.count,
        itemStyle: {
          borderRadius: [8, 8, 0, 0],
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: DIST_COLORS[d.range] || '#6366f1' },
              { offset: 1, color: (DIST_COLORS[d.range] || '#6366f1') + '99' }
            ]
          }
        }
      })),
      emphasis: { itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0,0,0,0.12)' } }
    }]
  }), [scoreDist]);

  // ── Answer distribution chart for a specific question ─────────────────────
  const getAnswerDistOption = (q) => {
    const letters = q.question_type === 'true_false' ? ['T', 'F'] : ['A', 'B', 'C', 'D'];
    const dist = q.answer_distribution;
    const total = q.total_attempts || 1;
    return {
      tooltip: {
        ...tooltipBase,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: params => {
          const p = params[0];
          const letter = p.name;
          const isCorrect = letter === q.correct_answer?.toUpperCase();
          return `<div style="font-family:Cairo"><b style="color:#1e293b">${letter}${isCorrect ? ' ✓' : ''}</b><br/>${p.marker} ${p.value} طالب <b style="color:${p.color}">(${Math.round(p.value / total * 100)}%)</b></div>`;
        }
      },
      grid: { left: 8, right: 8, top: 8, bottom: 4, containLabel: true },
      xAxis: {
        type: 'category', data: letters,
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: {
          fontFamily: 'Cairo', color: '#64748b', fontSize: 12, fontWeight: 'bold',
          formatter: val => val === q.correct_answer?.toUpperCase() ? val + ' ✓' : val
        }
      },
      yAxis: {
        type: 'value', minInterval: 1,
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
        axisLabel: { fontFamily: 'Cairo', color: '#94a3b8', fontSize: 10 },
        axisLine: { show: false }, axisTick: { show: false }
      },
      series: [{
        type: 'bar', barMaxWidth: 48,
        data: letters.map(l => {
          const isCorrect = l === q.correct_answer?.toUpperCase();
          const color = isCorrect ? '#10b981' : LETTER_COLORS[l] || '#94a3b8';
          return {
            value: dist[l] || 0,
            itemStyle: {
              borderRadius: [6, 6, 0, 0],
              color: {
                type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color },
                  { offset: 1, color: color + '80' }
                ]
              }
            }
          };
        })
      }]
    };
  };

  // ─────────────────────────────────────────────────────────────────────────

  if (isError) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
      <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
        <XCircle className="w-8 h-8 text-red-400" />
      </div>
      <p className="text-gray-500 font-semibold">تعذّر تحميل بيانات الاختبار</p>
    </div>
  );

  if (isLoading) return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gray-200 animate-pulse" />
        <div className="h-6 w-48 bg-gray-200 rounded-lg animate-pulse" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[...Array(6)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50 animate-pulse" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {[...Array(2)].map((_, i) => <div key={i} className="h-72 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50 animate-pulse" />)}
      </div>
    </div>
  );

  const stats = [
    { label: 'عدد الطلاب', value: ov.total_students, icon: Users, gradient: 'linear-gradient(135deg,#3b82f6,#6366f1)', lightBg: 'bg-blue-50', textColor: '#3b82f6' },
    { label: 'إجمالي المحاولات', value: ov.total_attempts, icon: Target, gradient: 'linear-gradient(135deg,#f97316,#ef4444)', lightBg: 'bg-orange-50', textColor: '#f97316' },
    { label: 'متوسط الدرجات', value: `${ov.avg_pct || 0}%`, icon: TrendingUp, gradient: 'linear-gradient(135deg,#10b981,#06b6d4)', lightBg: 'bg-emerald-50', textColor: '#10b981' },
    { label: 'نسبة النجاح', value: `${ov.pass_rate || 0}%`, icon: Award, gradient: 'linear-gradient(135deg,#8b5cf6,#ec4899)', lightBg: 'bg-purple-50', textColor: '#8b5cf6' },
    { label: 'أعلى درجة', value: `${ov.max_score || 0}/${exam?.total_score}`, icon: Trophy, gradient: 'linear-gradient(135deg,#10b981,#34d399)', lightBg: 'bg-green-50', textColor: '#10b981' },
    { label: 'أدنى درجة', value: `${ov.min_score || 0}/${exam?.total_score}`, icon: AlertTriangle, gradient: 'linear-gradient(135deg,#f43f5e,#e11d48)', lightBg: 'bg-rose-50', textColor: '#f43f5e' },
  ];

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <div className="space-y-4">
        {selectedStudentId && (
          <StudentProfileModal studentId={selectedStudentId} onClose={() => setSelectedStudentId(null)} />
        )}

        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => navigate(-1)}
            className="p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition-all">
            <ArrowRight className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-gray-800 flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md flex-shrink-0">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <span className="truncate">{exam?.title}</span>
            </h1>
            <p className="text-xs text-gray-400 mt-0.5 mr-[52px]">
              الدرجة الكلية: {exam?.total_score} · درجة النجاح: {exam?.pass_score} · المدة: {exam?.duration_minutes} دقيقة
            </p>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {stats.map((s, i) => <StatCard key={i} {...s} />)}
        </div>

        {/* Time Analysis */}
        {ov.avg_time_minutes && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'متوسط الوقت', value: `${Math.round(ov.avg_time_minutes)} د`, icon: Clock, color: '#6366f1', bg: 'bg-indigo-50' },
              { label: 'أسرع طالب', value: `${Math.round(ov.fastest_time_minutes || 0)} د`, icon: Zap, color: '#10b981', bg: 'bg-emerald-50' },
              { label: 'أبطأ طالب', value: `${Math.round(ov.slowest_time_minutes || 0)} د`, icon: Timer, color: '#f59e0b', bg: 'bg-amber-50' },
            ].map((s, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-all">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${s.bg}`} style={{ color: s.color }}>
                  <s.icon className="w-4 h-4" />
                </div>
                <p className="text-xl font-black text-gray-800 leading-none">{s.value}</p>
                <p className="text-[10px] font-semibold text-gray-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Row: Pass/Fail + Score Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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
                  <p className="text-[11px] text-gray-400 font-medium mt-0.5">توزيع النتائج في هذا الاختبار</p>
                </div>
              </div>
            </div>
            {(ov.pass_count > 0 || ov.fail_count > 0) ? (
              <div className="flex items-center gap-4 px-5 pb-5">
                <div className="flex-shrink-0 relative" style={{ width: '180px' }}>
                  <ReactECharts option={passFailOption} style={{ height: '180px', width: '180px' }} notMerge opts={{ renderer: 'svg' }} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-lg font-black text-gray-700">{ov.total_attempts}</p>
                    <p className="text-[10px] text-gray-400 font-semibold">محاولة</p>
                  </div>
                </div>
                <div className="flex-1 space-y-3">
                  {[
                    { name: 'ناجح', value: ov.pass_count, fill: '#10b981' },
                    { name: 'راسب', value: ov.fail_count, fill: '#f43f5e' },
                  ].map((d, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50/50">
                      <span className="flex items-center gap-2 text-sm font-bold text-gray-700">
                        <span className="w-3 h-3 rounded-full" style={{ background: d.fill }} />
                        {d.name}
                      </span>
                      <div className="text-left">
                        <p className="text-lg font-black" style={{ color: d.fill }}>{d.value}</p>
                        <p className="text-[10px] text-gray-400 font-medium">
                          {ov.total_attempts > 0 ? Math.round(d.value / ov.total_attempts * 100) : 0}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-5 pt-0 h-44 flex items-center justify-center">
                <p className="text-gray-400 text-sm font-semibold">لا توجد نتائج بعد</p>
              </div>
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
            {scoreDist.some(d => d.count > 0) ? (
              <div className="px-2 pb-3">
                <ReactECharts option={scoreDistOption} style={{ height: '210px' }} notMerge opts={{ renderer: 'svg' }} />
              </div>
            ) : (
              <div className="p-5 pt-0 h-44 flex items-center justify-center">
                <p className="text-gray-400 text-sm font-semibold">لا توجد بيانات كافية</p>
              </div>
            )}
          </div>
        </div>

        {/* Questions Analysis */}
        {qStats.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-orange-400 via-red-400 to-rose-500" />
            <div className="p-5 pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                    <HelpCircle className="w-4 h-4 text-orange-500" />
                  </div>
                  <div>
                    <h2 className="font-black text-gray-800 text-sm">تحليل الأسئلة</h2>
                    <p className="text-[11px] text-gray-400 font-medium mt-0.5">{qStats.length} سؤال · ترتيب حسب نسبة {questionsView === 'hardest' ? 'الخطأ' : 'الصحة'}</p>
                  </div>
                </div>
                <div className="flex bg-gray-100 rounded-xl p-0.5">
                  <button
                    onClick={() => setQuestionsView('hardest')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${questionsView === 'hardest' ? 'bg-white shadow-sm text-red-600' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    <AlertTriangle className="w-3 h-3 inline-block ml-1" />
                    الأصعب
                  </button>
                  <button
                    onClick={() => setQuestionsView('easiest')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${questionsView === 'easiest' ? 'bg-white shadow-sm text-green-600' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    <CheckCircle2 className="w-3 h-3 inline-block ml-1" />
                    الأسهل
                  </button>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 divide-y divide-gray-50">
              {sortedQuestions.map((q, idx) => {
                const isExpanded = expandedQ === q.question_id;
                const wrongPct = q.wrong_pct || 0;
                const correctPct = q.correct_pct || 0;
                const barColor = wrongPct >= 70 ? '#f43f5e' : wrongPct >= 40 ? '#f59e0b' : '#10b981';
                const correctBarColor = correctPct >= 70 ? '#10b981' : correctPct >= 40 ? '#f59e0b' : '#f43f5e';

                return (
                  <div key={q.question_id} className="hover:bg-gray-50/60 transition-colors">
                    <button
                      onClick={() => setExpandedQ(isExpanded ? null : q.question_id)}
                      className="w-full flex items-start gap-3 px-5 py-3.5 text-right"
                    >
                      <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center mt-0.5">
                        <span className="text-[10px] font-black text-gray-500">{idx + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 leading-relaxed text-right">
                          <MathText text={q.question_text || '(سؤال بالصورة)'} />
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${questionsView === 'hardest' ? wrongPct : correctPct}%`, background: questionsView === 'hardest' ? barColor : correctBarColor }} />
                          </div>
                          <span className="text-xs font-black flex-shrink-0" style={{ color: questionsView === 'hardest' ? barColor : correctBarColor }}>
                            {questionsView === 'hardest' ? `${wrongPct}% خطأ` : `${correctPct}% صح`}
                          </span>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">
                            ({questionsView === 'hardest' ? q.wrong_count : q.correct_count}/{q.total_attempts})
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1.5">
                          <span className="text-[10px] font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-md">
                            ✓ {q.correct_count} صح
                          </span>
                          <span className="text-[10px] font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-md">
                            ✗ {q.wrong_count} خطأ
                          </span>
                          {q.unanswered_count > 0 && (
                            <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">
                              — {q.unanswered_count} لم يجب
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0 mt-1">
                        {isExpanded
                          ? <ChevronUp className="w-4 h-4 text-gray-400" />
                          : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-5 pb-4 mr-10 space-y-3">
                        {/* Options */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {(q.question_type === 'true_false' ? ['T', 'F'] : ['A', 'B', 'C', 'D']).map(letter => {
                            const optKey = letter === 'T' ? 'صح' : letter === 'F' ? 'خطأ' : q.options?.[letter];
                            if (!optKey && letter !== 'T' && letter !== 'F') return null;
                            const isCorrect = letter === q.correct_answer?.toUpperCase();
                            return (
                              <div key={letter}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                  isCorrect
                                    ? 'bg-green-50 border-green-200 text-green-700'
                                    : 'bg-gray-50 border-gray-100 text-gray-600'
                                }`}>
                                <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0 text-white"
                                  style={{ background: LETTER_COLORS[letter] || '#94a3b8' }}>
                                  {letter}
                                </span>
                                <span className="truncate">{optKey}</span>
                                {isCorrect && <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0 mr-auto" />}
                              </div>
                            );
                          })}
                        </div>

                        {/* Answer Distribution Chart */}
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-[11px] font-bold text-gray-500 mb-1">توزيع إجابات الطلاب</p>
                          <ReactECharts option={getAnswerDistOption(q)} style={{ height: '160px' }} notMerge opts={{ renderer: 'svg' }} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Students Table */}
        {studentResults.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-blue-400 via-indigo-400 to-violet-500" />
            <div className="p-5 pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Users className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <h2 className="font-black text-gray-800 text-sm">نتائج الطلاب</h2>
                    <p className="text-[11px] text-gray-400 font-medium mt-0.5">{studentResults.length} طالب · مرتب حسب الدرجة</p>
                  </div>
                </div>
                {/* Search */}
                <div className="relative">
                  <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={e => setStudentSearch(e.target.value)}
                    placeholder="بحث بالاسم..."
                    className="pr-8 pl-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 placeholder-gray-400 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition w-44"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="bg-gray-50/80">
                    <th className="text-right text-[10px] font-bold text-gray-400 uppercase px-5 py-2.5 w-8">#</th>
                    <th className="text-right text-[10px] font-bold text-gray-400 uppercase px-3 py-2.5">الطالب</th>
                    <th className="text-center text-[10px] font-bold text-gray-400 uppercase px-3 py-2.5 cursor-pointer select-none" onClick={() => handleSort('score')}>
                      <span className="inline-flex items-center gap-1">الدرجة <SortIcon field="score" /></span>
                    </th>
                    <th className="text-center text-[10px] font-bold text-gray-400 uppercase px-3 py-2.5 cursor-pointer select-none" onClick={() => handleSort('pct')}>
                      <span className="inline-flex items-center gap-1">النسبة <SortIcon field="pct" /></span>
                    </th>
                    <th className="text-center text-[10px] font-bold text-gray-400 uppercase px-3 py-2.5">صح/خطأ</th>
                    <th className="text-center text-[10px] font-bold text-gray-400 uppercase px-3 py-2.5 cursor-pointer select-none" onClick={() => handleSort('time_minutes')}>
                      <span className="inline-flex items-center gap-1">الوقت <SortIcon field="time_minutes" /></span>
                    </th>
                    <th className="text-center text-[10px] font-bold text-gray-400 uppercase px-3 py-2.5">الحالة</th>
                    <th className="text-center text-[10px] font-bold text-gray-400 uppercase px-3 py-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredStudents.map((s, i) => {
                    const pct = s.pct || 0;
                    const passed = s.passed;
                    const sc = pct >= 70 ? { text: '#10b981', bg: '#dcfce7' } : pct >= 50 ? { text: '#6366f1', bg: '#ede9fe' } : { text: '#f43f5e', bg: '#ffe4e6' };
                    return (
                      <tr key={s.student_id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="px-5 py-2.5 text-right">
                          <span className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black text-white inline-flex"
                            style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}>
                            {i + 1}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <button onClick={() => setSelectedStudentId(s.student_id)} className="text-right hover:text-indigo-600 transition-colors">
                            <p className="text-xs font-semibold text-gray-700 truncate max-w-[180px]">{s.student_name}</p>
                            {s.academic_stage && <p className="text-[10px] text-gray-400 font-medium">{s.academic_stage}</p>}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="text-sm font-black text-gray-800">{s.score}<span className="text-[10px] text-gray-400 font-medium">/{exam?.total_score}</span></span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="text-xs font-black px-2 py-0.5 rounded-lg" style={{ color: sc.text, background: sc.bg }}>
                            {pct}%
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="text-[10px] font-semibold text-green-600">{s.correct_count}✓</span>
                          <span className="text-gray-300 mx-0.5">/</span>
                          <span className="text-[10px] font-semibold text-red-500">{s.wrong_count}✗</span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="text-[11px] font-semibold text-gray-500">
                            {s.time_minutes ? `${Math.round(s.time_minutes)} د` : '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${passed ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                            {passed ? 'ناجح' : 'راسب'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button onClick={() => setSelectedStudentId(s.student_id)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-500 transition-colors">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredStudents.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-gray-400 text-sm font-semibold">لا توجد نتائج مطابقة للبحث</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty state if no data at all */}
        {ov.total_attempts === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm text-center py-16 px-6">
            <BarChart3 className="w-14 h-14 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-700 font-bold text-lg mb-1">لا توجد نتائج بعد</p>
            <p className="text-gray-400 text-sm">ستظهر الإحصائيات بعد تأدية الطلاب لهذا الاختبار</p>
          </div>
        )}
      </div>
    </div>
  );
}
