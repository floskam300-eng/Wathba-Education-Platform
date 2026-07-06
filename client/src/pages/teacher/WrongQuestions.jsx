import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronUp,
  Search, Filter, Printer, X as XIcon, SlidersHorizontal
} from 'lucide-react';
import api from '../../lib/api';
import MathText from '../../components/MathText';

const LETTER_COLORS = { A: '#6366f1', B: '#f59e0b', C: '#10b981', D: '#f43f5e' };
const OPTION_KEYS = ['option_a', 'option_b', 'option_c', 'option_d'];
const LETTERS = ['A', 'B', 'C', 'D'];

const WRONG_PCT_FILTERS = [
  { label: 'الكل',        min: 0,  max: 100 },
  { label: 'حرج ≥ 70%',  min: 70, max: 100 },
  { label: 'متوسط 40-69%', min: 40, max: 69 },
  { label: 'منخفض < 40%', min: 0,  max: 39  },
];

const SORT_OPTIONS = [
  { value: 'wrong_desc', label: 'أعلى نسبة خطأ' },
  { value: 'wrong_asc',  label: 'أدنى نسبة خطأ' },
  { value: 'attempts',   label: 'الأكثر محاولات' },
  { value: 'exam',       label: 'حسب الاختبار' },
];

function QuestionCard({ q, idx }) {
  const pct = parseFloat(q.wrong_pct) || 0;
  const barColor = pct >= 70 ? '#f43f5e' : pct >= 40 ? '#f59e0b' : '#10b981';
  return (
    <div className="p-4 border-b border-gray-100 dark:border-gray-700 last:border-0 hover:bg-gray-50/60 dark:hover:bg-gray-700/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 flex items-center justify-center">
          <span className="text-[10px] font-black text-red-500">{idx + 1}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 leading-relaxed mb-2">
            <MathText text={q.question_text} />
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-3">
            {LETTERS.map((letter, li) =>
              q[OPTION_KEYS[li]] ? (
                <div key={letter}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    letter === q.correct_answer_letter?.toUpperCase()
                      ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700 text-green-700 dark:text-green-400'
                      : 'bg-gray-50 dark:bg-gray-700/50 border-gray-100 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                  }`}>
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0 text-white"
                    style={{ background: LETTER_COLORS[letter] || '#94a3b8' }}>
                    {letter}
                  </span>
                  <span className="truncate">{q[OPTION_KEYS[li]]}</span>
                  {letter === q.correct_answer_letter?.toUpperCase() && (
                    <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0 mr-auto" />
                  )}
                </div>
              ) : null
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, background: barColor }} />
            </div>
            <span className="text-xs font-black flex-shrink-0" style={{ color: barColor }}>
              {pct}% خطأ
            </span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
              ({q.wrong_count}/{q.total_attempts})
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExamSection({ exam, wrongPctFilter, sortQuestionsBy }) {
  const [collapsed, setCollapsed] = useState(false);

  // Apply per-question filters
  const activeFilter = WRONG_PCT_FILTERS.find(f => f.label === wrongPctFilter) || WRONG_PCT_FILTERS[0];
  let questions = exam.questions.filter(q => {
    const pct = parseFloat(q.wrong_pct) || 0;
    return pct >= activeFilter.min && pct <= activeFilter.max;
  });

  if (sortQuestionsBy === 'wrong_desc') questions = [...questions].sort((a,b) => (parseFloat(b.wrong_pct)||0) - (parseFloat(a.wrong_pct)||0));
  if (sortQuestionsBy === 'wrong_asc')  questions = [...questions].sort((a,b) => (parseFloat(a.wrong_pct)||0) - (parseFloat(b.wrong_pct)||0));
  if (sortQuestionsBy === 'attempts')   questions = [...questions].sort((a,b) => (parseInt(b.total_attempts)||0) - (parseInt(a.total_attempts)||0));

  // Don't render this exam block if no questions pass the current filter
  if (questions.length === 0) return null;

  const pctAvg = questions.length > 0
    ? Math.round(questions.reduce((s, q) => s + parseFloat(q.wrong_pct || 0), 0) / questions.length)
    : 0;
  const labelColor = pctAvg >= 70 ? 'text-red-500 bg-red-50 dark:bg-red-900/30'
    : pctAvg >= 40 ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/30'
    : 'text-green-600 bg-green-50 dark:bg-green-900/30';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden print:break-inside-avoid">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors text-right">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-gray-800 dark:text-gray-100 truncate">{exam.exam_title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-[11px] text-gray-400 dark:text-gray-500">{questions.length} سؤال</p>
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md sm:hidden ${labelColor}`}>
                {pctAvg}% خطأ
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 mr-2">
          <span className={`hidden sm:inline text-xs font-black px-2.5 py-1 rounded-lg ${labelColor}`}>
            متوسط خطأ {pctAvg}%
          </span>
          {collapsed
            ? <ChevronDown className="w-4 h-4 text-gray-400" />
            : <ChevronUp className="w-4 h-4 text-gray-400" />}
        </div>
      </button>
      {!collapsed && (
        <div className="border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700">
          {questions.map((q, idx) => (
            <QuestionCard key={q.question_id} q={q} idx={idx} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function WrongQuestionsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [wrongPctFilter, setWrongPctFilter] = useState('الكل');
  const [sortExamsBy, setSortExamsBy] = useState('wrong_desc');
  const [sortQuestionsBy, setSortQuestionsBy] = useState('wrong_desc');
  const [examFilter, setExamFilter] = useState('الكل');

  const { data: exams = [], isLoading } = useQuery({
    queryKey: ['wrong-questions-full'],
    queryFn: () => api.get('/teachers/analytics/wrong-questions?full=true').then(r => r.data),
  });

  // Exam options for filter
  const examOptions = useMemo(() => ['الكل', ...exams.map(e => e.exam_title)], [exams]);

  const filtered = useMemo(() => {
    let list = [...exams];

    // Filter by selected exam
    if (examFilter !== 'الكل') {
      list = list.filter(e => e.exam_title === examFilter);
    }

    // Filter by search
    if (search.trim()) {
      list = list.filter(e =>
        e.exam_title?.toLowerCase().includes(search.toLowerCase()) ||
        e.questions.some(q => q.question_text?.includes(search))
      );
    }

    // Sort exams
    if (sortExamsBy === 'wrong_desc') {
      list = [...list].sort((a, b) => {
        const avgA = a.questions.length ? a.questions.reduce((s,q)=>s+(parseFloat(q.wrong_pct)||0),0)/a.questions.length : 0;
        const avgB = b.questions.length ? b.questions.reduce((s,q)=>s+(parseFloat(q.wrong_pct)||0),0)/b.questions.length : 0;
        return avgB - avgA;
      });
    } else if (sortExamsBy === 'wrong_asc') {
      list = [...list].sort((a, b) => {
        const avgA = a.questions.length ? a.questions.reduce((s,q)=>s+(parseFloat(q.wrong_pct)||0),0)/a.questions.length : 0;
        const avgB = b.questions.length ? b.questions.reduce((s,q)=>s+(parseFloat(q.wrong_pct)||0),0)/b.questions.length : 0;
        return avgA - avgB;
      });
    } else if (sortExamsBy === 'attempts') {
      list = [...list].sort((a, b) => {
        const attA = a.questions.reduce((s,q)=>s+(parseInt(q.total_attempts)||0),0);
        const attB = b.questions.reduce((s,q)=>s+(parseInt(q.total_attempts)||0),0);
        return attB - attA;
      });
    }

    return list;
  }, [exams, search, examFilter, sortExamsBy]);

  const totalQ = filtered.reduce((s, e) => {
    const activeFilter = WRONG_PCT_FILTERS.find(f => f.label === wrongPctFilter) || WRONG_PCT_FILTERS[0];
    return s + e.questions.filter(q => {
      const pct = parseFloat(q.wrong_pct) || 0;
      return pct >= activeFilter.min && pct <= activeFilter.max;
    }).length;
  }, 0);

  // Highest wrong pct question across all
  const criticalCount = exams.reduce((s,e) => s + e.questions.filter(q => parseFloat(q.wrong_pct||0) >= 70).length, 0);

  const hasActiveFilter = search || wrongPctFilter !== 'الكل' || sortExamsBy !== 'wrong_desc' || sortQuestionsBy !== 'wrong_desc' || examFilter !== 'الكل';

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) { alert('يرجى السماح بالنوافذ المنبثقة لاستخدام ميزة الطباعة'); return; }

    const now = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
    const esc = s => String(s ?? '—').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const activeFilter = WRONG_PCT_FILTERS.find(f => f.label === wrongPctFilter) || WRONG_PCT_FILTERS[0];

    const sections = filtered.map((exam, ei) => {
      const visibleQs = exam.questions
        .filter(q => { const pct = parseFloat(q.wrong_pct)||0; return pct >= activeFilter.min && pct <= activeFilter.max; })
        .sort((a,b) => sortQuestionsBy === 'wrong_desc'
          ? (parseFloat(b.wrong_pct)||0) - (parseFloat(a.wrong_pct)||0)
          : (parseFloat(a.wrong_pct)||0) - (parseFloat(b.wrong_pct)||0));
      if (!visibleQs.length) return '';

      const qRows = visibleQs.map((q, qi) => {
        const pct = Math.round(parseFloat(q.wrong_pct) || 0);
        const color = pct >= 70 ? '#ef4444' : pct >= 50 ? '#f97316' : '#f59e0b';
        return `<tr>
          <td style="color:#94a3b8;font-size:11px;text-align:center">${qi+1}</td>
          <td>${esc(q.question_text)}</td>
          <td style="text-align:center">${q.total_answered || 0}</td>
          <td style="text-align:center"><span style="background:${color}22;color:${color};font-weight:900;padding:2px 10px;border-radius:8px">${pct}%</span></td>
        </tr>`;
      }).join('');

      return `<div style="margin-bottom:24px;page-break-inside:avoid">
        <div style="background:#1e3a5f;color:#fff;padding:10px 14px;border-radius:10px 10px 0 0;font-weight:900;font-size:13px">
          ${ei+1}. ${esc(exam.exam_title)} <span style="opacity:.6;font-size:11px;font-weight:500;margin-right:8px">${visibleQs.length} سؤال</span>
        </div>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;overflow:hidden">
          <thead><tr style="background:#f8fafc">
            <th style="padding:8px 12px;font-size:11px;color:#475569;text-align:center">#</th>
            <th style="padding:8px 12px;font-size:11px;color:#475569;text-align:right">نص السؤال</th>
            <th style="padding:8px 12px;font-size:11px;color:#475569;text-align:center">إجابات</th>
            <th style="padding:8px 12px;font-size:11px;color:#475569;text-align:center">نسبة الخطأ</th>
          </tr></thead>
          <tbody>${qRows}</tbody>
        </table>
      </div>`;
    }).join('');

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head>
      <meta charset="UTF-8"><title>تقرير أكثر الأسئلة خطأً</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Cairo',Arial,sans-serif;padding:24px;direction:rtl;color:#1e293b;background:#fff}
        .header{display:flex;align-items:center;gap:16px;border-bottom:3px solid #1e3a5f;padding-bottom:16px;margin-bottom:20px}
        .logo{width:44px;height:44px;background:linear-gradient(135deg,#1e3a5f,#2d5080);border-radius:10px;display:flex;align-items:center;justify-content:center;color:#f97316;font-size:20px;font-weight:900;flex-shrink:0}
        .title{font-size:18px;font-weight:900;color:#1e3a5f}
        .meta{margin-right:auto;text-align:left;font-size:11px;color:#94a3b8}
        .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}
        .stat{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px;text-align:center}
        .stat-val{font-size:20px;font-weight:900;color:#dc2626}
        .stat-lbl{font-size:11px;color:#94a3b8;margin-top:3px}
        td{padding:9px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;vertical-align:middle}
        tr:nth-child(even) td{background:#fef2f2}
        .footer{margin-top:20px;padding-top:12px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px}
        .no-print{text-align:center;padding:16px 0 8px}
        .btn{padding:10px 28px;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700;font-family:'Cairo',sans-serif;margin:0 6px}
        @media print{.no-print{display:none}body{padding:12px}}
      </style></head><body>
      <div class="header">
        <div class="logo">و</div>
        <div><div class="title">تقرير أكثر الأسئلة خطأً</div><div style="font-size:12px;color:#64748b;margin-top:3px">منصة وثبة التعليمية</div></div>
        <div class="meta"><div style="font-weight:900;color:#f97316;font-size:13px">منصة وثبة</div><div>${now}</div></div>
      </div>
      <div class="stats">
        <div class="stat"><div class="stat-val">${filtered.length}</div><div class="stat-lbl">اختبار</div></div>
        <div class="stat"><div class="stat-val">${totalQ}</div><div class="stat-lbl">سؤال في التقرير</div></div>
        <div class="stat"><div class="stat-val" style="color:#dc2626">${criticalCount}</div><div class="stat-lbl">سؤال بنسبة خطأ ≥ 70%</div></div>
      </div>
      ${sections || '<p style="text-align:center;color:#94a3b8;padding:40px">لا توجد أسئلة تطابق الفلتر الحالي</p>'}
      <div class="footer">تقرير صادر آلياً من منصة وثبة التعليمية — ${now}</div>
      <div class="no-print">
        <button class="btn" style="background:#dc2626;color:#fff" onclick="window.print()">🖨️ طباعة / حفظ PDF</button>
        <button class="btn" style="background:#64748b;color:#fff" onclick="window.close()">إغلاق</button>
      </div>
    </body></html>`;

    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.focus(), 200);
  };

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6 print:overflow-visible print:h-auto">
      <style>{`
        @media print {
          nav, aside, .no-print { display: none !important; }
          body { background: white !important; }
          .print\\:break-inside-avoid { break-inside: avoid; }
        }
      `}</style>

      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2 no-print">
          <div className="flex items-center gap-2.5 min-w-0">
            <button onClick={() => navigate(-1)}
              className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-all flex-shrink-0">
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-black text-gray-800 dark:text-gray-100 flex items-center gap-2 truncate">
                <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-red-500 flex-shrink-0" />
                <span className="truncate">أكثر الأسئلة خطأً<span className="hidden sm:inline"> — تقرير كامل</span></span>
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {filtered.length} امتحان · {totalQ} سؤال
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/30 hover:bg-red-100 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-bold transition-all">
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">طباعة</span>
            </button>
            <button onClick={() => setShowFilters(f => !f)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-bold transition-all
                ${showFilters || hasActiveFilter
                  ? 'bg-orange-500 border-orange-500 text-white'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-orange-300'
                }`}>
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">فلاتر</span>
              {hasActiveFilter && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
            </button>
          </div>
        </div>

        {/* Print header */}
        <div className="hidden print:block mb-4">
          <h1 className="text-2xl font-black text-gray-800">تقرير أكثر الأسئلة خطأً</h1>
          <p className="text-sm text-gray-500">{new Date().toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' })}</p>
        </div>

        {/* Summary badges */}
        {!isLoading && exams.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
              <span className="text-sm font-black text-gray-700 dark:text-gray-200">{exams.length}</span>
              <span className="text-xs text-gray-400 font-semibold">امتحان</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
              <span className="text-sm font-black text-gray-700 dark:text-gray-200">{exams.reduce((s,e)=>s+e.questions.length,0)}</span>
              <span className="text-xs text-gray-400 font-semibold">سؤال إجمالي</span>
            </div>
            {criticalCount > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/30 rounded-xl border border-red-100 dark:border-red-800">
                <span className="text-sm font-black text-red-500">{criticalCount}</span>
                <span className="text-xs text-red-400 font-semibold">سؤال حرج (≥70% خطأ)</span>
              </div>
            )}
          </div>
        )}

        {/* Filters panel */}
        {showFilters && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 space-y-4 no-print">
            {/* Search */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ابحث باسم الامتحان أو نص السؤال..."
                className="w-full pr-9 pl-10 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:border-orange-300 dark:focus:border-orange-600 focus:ring-2 focus:ring-orange-100 dark:focus:ring-orange-900/30 transition"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <XIcon className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Exam filter */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">تصفية حسب الامتحان</label>
                <select value={examFilter} onChange={e => setExamFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 focus:outline-none focus:border-orange-300 transition">
                  {examOptions.map(o => <option key={o} value={o}>{o.length > 30 ? o.slice(0,30)+'…' : o}</option>)}
                </select>
              </div>

              {/* Wrong pct range */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">نطاق نسبة الخطأ</label>
                <select value={wrongPctFilter} onChange={e => setWrongPctFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 focus:outline-none focus:border-orange-300 transition">
                  {WRONG_PCT_FILTERS.map(f => <option key={f.label} value={f.label}>{f.label}</option>)}
                </select>
              </div>

              {/* Sort exams */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">ترتيب الامتحانات</label>
                <select value={sortExamsBy} onChange={e => setSortExamsBy(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 focus:outline-none focus:border-orange-300 transition">
                  {SORT_OPTIONS.filter(o => o.value !== 'exam').map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {/* Sort questions */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">ترتيب الأسئلة</label>
                <select value={sortQuestionsBy} onChange={e => setSortQuestionsBy(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 focus:outline-none focus:border-orange-300 transition">
                  {SORT_OPTIONS.filter(o => o.value !== 'exam').map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            {hasActiveFilter && (
              <button onClick={() => { setSearch(''); setWrongPctFilter('الكل'); setSortExamsBy('wrong_desc'); setSortQuestionsBy('wrong_desc'); setExamFilter('الكل'); }}
                className="flex items-center gap-1.5 text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors">
                <XIcon className="w-3.5 h-3.5" />مسح الفلاتر
              </button>
            )}
          </div>
        )}

        {/* Search (always visible, compact) */}
        {!showFilters && (
          <div className="relative no-print">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ابحث باسم الامتحان أو نص السؤال..."
              className="w-full pr-9 pl-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-semibold text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-orange-300 dark:focus:border-orange-600 focus:ring-2 focus:ring-orange-100 dark:focus:ring-orange-900/30 transition"
            />
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
                <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-1/2 mb-2" />
                <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded animate-pulse w-1/4" />
              </div>
            ))}
          </div>
        ) : (filtered.length === 0 || totalQ === 0) ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 text-center py-16 px-6">
            <AlertTriangle className="w-14 h-14 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-700 dark:text-gray-300 font-bold text-lg mb-1">
              {hasActiveFilter ? 'لا توجد نتائج مطابقة للفلاتر الحالية' : 'لا توجد بيانات بعد'}
            </p>
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              {hasActiveFilter ? 'جرّب تغيير الفلاتر أو مسحها' : 'ستظهر البيانات بعد تأدية الطلاب للامتحانات'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(exam => (
              <ExamSection
                key={exam.exam_id}
                exam={exam}
                wrongPctFilter={wrongPctFilter}
                sortQuestionsBy={sortQuestionsBy}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
