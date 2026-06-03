import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronUp, Search } from 'lucide-react';
import api from '../../lib/api';
import MathText from '../../components/MathText';

const LETTER_COLORS = { A: '#6366f1', B: '#f59e0b', C: '#10b981', D: '#f43f5e' };
const OPTION_KEYS = ['option_a', 'option_b', 'option_c', 'option_d'];
const LETTERS = ['A', 'B', 'C', 'D'];

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

function ExamSection({ exam }) {
  const [collapsed, setCollapsed] = useState(false);
  const pctAvg = exam.questions.length > 0
    ? Math.round(exam.questions.reduce((s, q) => s + parseFloat(q.wrong_pct || 0), 0) / exam.questions.length)
    : 0;
  const labelColor = pctAvg >= 70 ? 'text-red-500 bg-red-50 dark:bg-red-900/30'
    : pctAvg >= 40 ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/30'
    : 'text-green-600 bg-green-50 dark:bg-green-900/30';
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors text-right">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
          </div>
          <div>
            <p className="text-sm font-black text-gray-800 dark:text-gray-100">{exam.exam_title}</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
              {exam.questions.length} سؤال بيانات
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${labelColor}`}>
            متوسط خطأ {pctAvg}%
          </span>
          {collapsed
            ? <ChevronDown className="w-4 h-4 text-gray-400" />
            : <ChevronUp className="w-4 h-4 text-gray-400" />}
        </div>
      </button>
      {!collapsed && (
        <div className="border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700">
          {exam.questions.map((q, idx) => (
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

  const { data: exams = [], isLoading } = useQuery({
    queryKey: ['wrong-questions-full'],
    queryFn: () => api.get('/teachers/analytics/wrong-questions?full=true').then(r => r.data),
  });

  const filtered = search.trim()
    ? exams.filter(e => e.exam_title?.toLowerCase().includes(search.toLowerCase()) ||
        e.questions.some(q => q.question_text?.includes(search)))
    : exams;

  const totalQ = filtered.reduce((s, e) => s + e.questions.length, 0);

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => navigate(-1)}
            className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-all">
            <ArrowRight className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-black text-gray-800 dark:text-gray-100 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-red-500" />
              أكثر الأسئلة خطأً — تقرير كامل
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              كل الامتحانات · {filtered.length} امتحان · {totalQ} سؤال
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ابحث باسم الامتحان أو نص السؤال..."
            className="w-full pr-9 pl-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-semibold text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-orange-300 dark:focus:border-orange-600 focus:ring-2 focus:ring-orange-100 dark:focus:ring-orange-900/30 transition"
          />
        </div>

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
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 text-center py-16 px-6">
            <AlertTriangle className="w-14 h-14 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-700 dark:text-gray-300 font-bold text-lg mb-1">
              {search ? 'لا توجد نتائج مطابقة' : 'لا توجد بيانات بعد'}
            </p>
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              {search ? 'جرّب كلمة بحث أخرى' : 'ستظهر البيانات بعد تأدية الطلاب للامتحانات'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(exam => (
              <ExamSection key={exam.exam_id} exam={exam} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
