import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import MathText from '../components/MathText';
import ImageLightbox from '../components/ImageLightbox';
import {
  ArrowRight, CheckCircle, XCircle, Minus, Clock,
  Award
} from 'lucide-react';
import api from '../lib/api';

import { withToken } from '../lib/mediaAccess';

function seededShuffle(arr, seed) {
  const result = [...arr];
  let s = seed >>> 0;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function getShuffledOpts(q, studentId, shuffleOptions) {
  const allOpts = ['A', 'B', 'C', 'D'].filter(o => q[`option_${o.toLowerCase()}`]);
  if (!shuffleOptions) return allOpts;
  const seed = (((studentId || 1) * 1000003) ^ ((q.id || 1) * 999983)) >>> 0;
  return seededShuffle(allOpts, seed || 1);
}

function optStyle(opt, studentAnswer, correctAnswer) {
  const isCorrect       = opt === correctAnswer;
  const isStudentChoice = opt === studentAnswer;
  if (isCorrect && isStudentChoice) return 'border-green-500 bg-green-50 dark:bg-green-900/30 dark:border-green-600/60';
  if (isCorrect)                    return 'border-green-400 bg-green-50 dark:bg-green-900/20 dark:border-green-700/50';
  if (isStudentChoice && !isCorrect)return 'border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-600/60';
  return 'border-gray-200 bg-white dark:bg-[var(--dk-elevated)] dark:border-[var(--dk-border)]';
}

function optBadge(opt, studentAnswer, correctAnswer) {
  const isCorrect       = opt === correctAnswer;
  const isStudentChoice = opt === studentAnswer;
  if (isCorrect && isStudentChoice) return 'bg-green-500 text-white';
  if (isCorrect)                    return 'bg-green-400 text-white';
  if (isStudentChoice && !isCorrect)return 'bg-red-400 text-white';
  return 'bg-gray-100 dark:bg-[var(--dk-surface)] text-gray-500 dark:text-[var(--dk-text-2)]';
}

function optTextColor(opt, studentAnswer, correctAnswer) {
  const isCorrect       = opt === correctAnswer;
  const isStudentChoice = opt === studentAnswer;
  if (isCorrect)                    return 'text-green-800 dark:text-green-300 font-semibold';
  if (isStudentChoice && !isCorrect)return 'text-red-800 dark:text-red-300 font-semibold';
  return 'text-gray-600 dark:text-[var(--dk-text-2)]';
}

function optIcon(opt, studentAnswer, correctAnswer) {
  const isCorrect       = opt === correctAnswer;
  const isStudentChoice = opt === studentAnswer;
  if (isCorrect && isStudentChoice) return <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />;
  if (isCorrect)                    return <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400 flex-shrink-0" />;
  if (isStudentChoice && !isCorrect)return <XCircle className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0" />;
  return null;
}

export default function ExamReviewPage() {
  const { resultId } = useParams();
  const navigate     = useNavigate();
  const { user }     = useAuth();
  const { dark }     = useTheme();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['exam-review', resultId],
    queryFn: () => api.get(`/exams/results/${resultId}/review`).then(r => r.data),
    enabled: !!resultId,
  });

  const { result, questions = [] } = data || {};

  const passed = result && result.score >= result.pass_score;
  // [ERP-2 FIX] Guard against total_score=0 to prevent pct=NaN
  const pct    = result && result.total_score > 0 ? Math.round((result.score / result.total_score) * 100) : 0;

  const shuffleOptions = result?.shuffle_options || false;
  const studentId      = result?.student_id || 0;
  const [lightboxSrc, setLightboxSrc] = useState(null);

  // Use the authoritative DB-stored counts (computed at submission time).
  // Recomputing from the questions array can diverge for image_multi questions
  // (where a JSON string student_answer is truthy even if no sub-answers were given)
  // and for exams where per-question point values differ.
  const correctCount  = result?.correct_count   ?? 0;
  const wrongCount    = result?.wrong_count      ?? 0;
  const skippedCount  = result?.unanswered_count ?? 0;

  const isTeacher = user?.role === 'teacher' || user?.role === 'assistant';

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else if (user?.role === 'student') navigate('/student/exams');
    else if (user?.role === 'assistant') navigate('/assistant/exams');
    else navigate('/teacher/exams');
  };

  return (
    <>
    <div className={`h-full overflow-y-auto font-cairo ${dark ? 'bg-[var(--dk-bg)]' : 'bg-gray-50'}`} dir="rtl">

      <div className="max-w-3xl mx-auto px-4 pt-6 pb-2">
        <button onClick={goBack}
          className={`flex items-center gap-2 text-sm font-bold transition-colors mb-4 ${dark ? 'text-[var(--dk-text-2)] hover:text-[var(--dk-text)]' : 'text-gray-500 hover:text-navy-700'}`}>
          <ArrowRight className="w-4 h-4" />
          رجوع
        </button>

        {!isLoading && result && (
          <div className={`rounded-2xl p-5 mb-2 flex items-center justify-between gap-4 shadow-sm border-2 ${passed ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700/50' : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700/50'}`}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">مراجعة الاختبار</p>
              <h1 className={`font-black text-lg leading-tight ${passed ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                {result.exam_title}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {result.attempt_number > 1 && (
                  <span className="text-xs text-orange-600 dark:text-orange-400 font-bold">المحاولة #{result.attempt_number}</span>
                )}
                {/* Distinguish an archived (previous) attempt from the current/latest one
                    so the viewer immediately knows this isn't the student's active grade. */}
                {result.is_latest === false && (
                  <span className="text-[10px] bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 rounded-full px-1.5 py-0.5 font-bold">محاولة سابقة</span>
                )}
                {result.is_latest === true && result.attempt_number > 1 && (
                  <span className="text-[10px] bg-navy-50 dark:bg-navy-900/30 text-navy-600 dark:text-navy-300 rounded-full px-1.5 py-0.5 font-bold">الأخيرة</span>
                )}
              </div>
            </div>
            <div className="text-center flex-shrink-0">
              <div className={`text-3xl font-black ${passed ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {result.score}
                <span className="text-base font-semibold text-gray-400 dark:text-gray-500">/{result.total_score}</span>
              </div>
              <span className={`text-xs font-black px-3 py-1 rounded-full ${passed ? 'bg-green-600 text-white dark:bg-green-500/80' : 'bg-red-600 text-white dark:bg-red-500/80'}`}>
                {passed ? '✓ ناجح' : '✗ راسب'}
              </span>
            </div>
          </div>
        )}
        {isLoading && <div className={`h-20 rounded-2xl animate-pulse mb-2 ${dark ? 'bg-[var(--dk-surface)]' : 'bg-white'}`} />}
      </div>

      <div className="max-w-3xl mx-auto px-4 pb-6 space-y-6">

        {isLoading && (
          <div className="space-y-4">
            <div className={`h-28 rounded-2xl animate-pulse ${dark ? 'bg-[var(--dk-surface)]' : 'bg-white'}`} />
            {[...Array(3)].map((_, i) => (
              <div key={i} className={`h-52 rounded-2xl animate-pulse ${dark ? 'bg-[var(--dk-surface)]' : 'bg-white'}`} />
            ))}
          </div>
        )}

        {isError && (
          <div className={`rounded-2xl p-10 text-center shadow-sm border ${dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border)]' : 'bg-white border-gray-100'}`}>
            <XCircle className="w-14 h-14 text-red-300 mx-auto mb-3" />
            <p className={`font-bold text-lg ${dark ? 'text-[var(--dk-text)]' : 'text-gray-700'}`}>تعذّر تحميل المراجعة</p>
            <p className={`text-sm mt-1 mb-4 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>تحقق من الاتصال أو حاول مجدداً</p>
            <button onClick={goBack} className="btn-primary px-6 py-2">رجوع</button>
          </div>
        )}

        {!isLoading && !isError && result && (
          <>
            {/* ── Stats row ── */}
            <div className={`rounded-2xl border shadow-sm p-4 ${dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border)]' : 'bg-white border-gray-100'}`}>
              {result.student_name && user?.role !== 'student' && (
                <p className={`text-sm font-medium mb-3 pb-3 border-b ${dark ? 'text-[var(--dk-text-2)] border-[var(--dk-border)]' : 'text-gray-500 border-gray-100'}`}>
                  الطالب: <span className={`font-bold ${dark ? 'text-[var(--dk-text)]' : 'text-gray-800'}`}>{result.student_name}</span>
                </p>
              )}
              <div className="mb-3">
                <div className={`flex justify-between text-xs font-medium mb-1.5 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
                  <span>نسبة الإجابات الصحيحة</span>
                  <span className="font-bold">{pct}%</span>
                </div>
                <div className={`h-3 rounded-full overflow-hidden ${dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-100'}`}>
                  <div className={`h-3 rounded-full transition-all ${passed ? 'bg-green-500' : 'bg-red-400'}`}
                    style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="grid gap-2 grid-cols-4">
                <div className={`flex flex-col items-center gap-1 border rounded-xl py-3 ${dark ? 'bg-green-900/20 border-green-700/40' : 'bg-green-50 border-green-100'}`}>
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <span className={`text-xl font-black ${dark ? 'text-green-400' : 'text-green-800'}`}>{correctCount}</span>
                  <span className={`text-xs font-semibold ${dark ? 'text-green-500' : 'text-green-700'}`}>صحيح</span>
                </div>
                <div className={`flex flex-col items-center gap-1 border rounded-xl py-3 ${dark ? 'bg-red-900/20 border-red-700/40' : 'bg-red-50 border-red-100'}`}>
                  <XCircle className="w-5 h-5 text-red-500 dark:text-red-400" />
                  <span className={`text-xl font-black ${dark ? 'text-red-400' : 'text-red-700'}`}>{wrongCount}</span>
                  <span className={`text-xs font-semibold ${dark ? 'text-red-500' : 'text-red-600'}`}>خاطئ</span>
                </div>
                <div className={`flex flex-col items-center gap-1 border rounded-xl py-3 ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)]' : 'bg-gray-50 border-gray-100'}`}>
                  <Minus className={`w-5 h-5 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`} />
                  <span className={`text-xl font-black ${dark ? 'text-[var(--dk-text)]' : 'text-gray-600'}`}>{skippedCount}</span>
                  <span className={`text-xs font-semibold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>متروك</span>
                </div>
                <div className={`flex flex-col items-center gap-1 border rounded-xl py-3 ${dark ? 'bg-orange-900/20 border-orange-700/40' : 'bg-orange-50 border-orange-100'}`}>
                  <Award className="w-5 h-5 text-orange-500 dark:text-orange-400" />
                  <span className={`text-xl font-black ${dark ? 'text-orange-400' : 'text-orange-700'}`}>+{result.points_earned || 0}</span>
                  <span className={`text-xs font-semibold ${dark ? 'text-orange-500' : 'text-orange-600'}`}>نقطة</span>
                </div>
              </div>
            </div>

            {/* ── Legend ── */}
            <div className="flex flex-wrap gap-3 text-xs font-semibold">
              <span className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-full ${dark ? 'bg-green-900/20 border-green-700/40 text-green-400' : 'bg-green-50 border-green-200 text-green-800'}`}>
                <CheckCircle className="w-3.5 h-3.5" /> إجابة صحيحة
              </span>
              <span className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-full ${dark ? 'bg-red-900/20 border-red-700/40 text-red-400' : 'bg-red-50 border-red-200 text-red-800'}`}>
                <XCircle className="w-3.5 h-3.5" /> إجابتك الخاطئة
              </span>
              <span className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-full ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text-2)]' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                <Minus className="w-3.5 h-3.5" /> لم تُجَب
              </span>
              {shuffleOptions && (
                <span className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-full ${dark ? 'bg-blue-900/20 border-blue-700/40 text-blue-400' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                  🔀 الخيارات بنفس ترتيب الاختبار
                </span>
              )}
            </div>

            {/* ── Questions ── */}
            <div className="space-y-5">
              {questions.map((q, qi) => {
                const studentAns  = q.student_answer;
                const correctAns  = q.correct_answer;
                const answered    = !!studentAns;
                const isTrueFalse = q.question_type === 'true_false';
                const isImgMulti  = q.question_type === 'image_multi';

                const displayOpts = isImgMulti
                  ? []
                  : isTrueFalse
                    ? ['A', 'B']
                    : getShuffledOpts(q, studentId, shuffleOptions);

                const displayLabels = isTrueFalse
                  ? { A: '✅ صح', B: '❌ خطأ' }
                  : (() => {
                      const labels = ['أ', 'ب', 'ج', 'د'];
                      return Object.fromEntries(displayOpts.map((o, i) => [o, labels[i]]));
                    })();

                return (
                  <div key={q.id} className={`rounded-2xl border-2 shadow-sm overflow-hidden ${
                    !answered
                      ? dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border)]' : 'bg-white border-gray-200'
                      : q.is_correct
                        ? dark ? 'bg-[var(--dk-surface)] border-green-700/50' : 'bg-white border-green-300'
                        : dark ? 'bg-[var(--dk-surface)] border-red-700/50' : 'bg-white border-red-300'
                  }`}>
                    {/* Question header */}
                    <div className={`px-5 py-3 flex items-center gap-3 border-b ${
                      !answered
                        ? dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)]' : 'bg-gray-50 border-gray-100'
                        : q.is_correct
                          ? dark ? 'bg-green-900/20 border-green-700/30' : 'bg-green-50 border-green-100'
                          : dark ? 'bg-red-900/20 border-red-700/30' : 'bg-red-50 border-red-100'
                    }`}>
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-black text-white shadow-sm ${
                        !answered ? 'bg-gray-400 dark:bg-gray-600' : q.is_correct ? 'bg-green-500' : 'bg-red-500'
                      }`}>
                        {qi + 1}
                      </div>
                      <div className="flex items-center gap-2 text-xs font-bold">
                        <span className={dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}>{q.points} نقطة</span>
                        {isTrueFalse && (
                          <span className={`px-2 py-0.5 rounded-full ${dark ? 'text-blue-300 bg-blue-900/30' : 'text-blue-700 bg-blue-100'}`}>صح/خطأ</span>
                        )}
                        {!answered && (
                          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${dark ? 'text-[var(--dk-text-2)] bg-[var(--dk-elevated)]' : 'text-gray-400 bg-gray-100'}`}>
                            <Clock className="w-3 h-3" /> لم تُجَب
                          </span>
                        )}
                        {answered && q.is_correct === true && (
                          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${dark ? 'text-green-400 bg-green-900/30' : 'text-green-700 bg-green-100'}`}>
                            <CheckCircle className="w-3 h-3" /> صحيحة ✓
                          </span>
                        )}
                        {answered && q.is_correct === false && (
                          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${dark ? 'text-red-400 bg-red-900/30' : 'text-red-600 bg-red-100'}`}>
                            <XCircle className="w-3 h-3" /> خاطئة ✗
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Question body */}
                    <div className="px-5 py-4">
                      {/* ── Group context (shown once per group) ── */}
                      {q.group_id && (q.group_context || q.group_context_image) && (() => {
                        const idx = questions.indexOf(q);
                        const isFirst = idx === 0 || questions[idx - 1]?.group_id !== q.group_id;
                        if (!isFirst) return null;
                        return (
                          <div className={`mb-4 rounded-xl border-2 overflow-hidden ${dark ? 'border-blue-700/40 bg-blue-900/20' : 'border-blue-200 bg-blue-50'}`}>
                            <div className={`px-3 py-2 border-b ${dark ? 'bg-blue-900/30 border-blue-700/30' : 'bg-blue-100 border-blue-200'}`}>
                              <span className={`text-xs font-black ${dark ? 'text-blue-300' : 'text-blue-800'}`}>📎 السياق المشترك للمجموعة</span>
                            </div>
                            <div className="p-3 space-y-2">
                              {q.group_context_image && (
                                <img
                                  src={withToken(q.group_context_image)}
                                  alt=""
                                  className={`w-full max-h-56 object-contain rounded-lg border cursor-zoom-in ${dark ? 'border-blue-700/30' : 'border-blue-200'}`}
                                  onClick={() => setLightboxSrc(withToken(q.group_context_image))}
                                />
                              )}
                              {q.group_context && (
                                <p className={`text-sm leading-relaxed whitespace-pre-wrap ${dark ? 'text-[var(--dk-text)]' : 'text-navy-800'}`}><MathText text={q.group_context} /></p>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                      {q.question_text && <p className={`font-bold text-base leading-relaxed mb-1 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}><MathText text={q.question_text} /></p>}
                      {q.question_image_url && (
                        <img
                          src={withToken(q.question_image_url)}
                          alt=""
                          className={`mt-2 mb-3 w-full max-w-sm rounded-xl border object-contain cursor-zoom-in ${dark ? 'border-[var(--dk-border)]' : 'border-gray-200'}`}
                          onClick={() => setLightboxSrc(withToken(q.question_image_url))}
                        />
                      )}

                      {/* image_multi sub-questions */}
                      {isImgMulti && (
                        <div className="space-y-1.5 mt-3">
                          {(q.sub_results || q.sub_questions || []).map(sub => {
                            const subResult = q.sub_results ? sub : null;
                            const subSa = subResult?.student_answer || null;
                            const subCorrect = subResult?.correct || sub.correct;
                            const subIsCorrect = subResult?.is_correct ?? false;
                            const hasSubAnswer = !!subSa;
                            return (
                              <div key={sub.label} className={`flex items-center gap-2 p-2.5 rounded-xl border-2 ${
                                !hasSubAnswer
                                  ? dark ? 'border-[var(--dk-border)] bg-[var(--dk-elevated)]' : 'border-gray-200 bg-gray-50'
                                  : subIsCorrect
                                    ? dark ? 'border-green-700/50 bg-green-900/20' : 'border-green-300 bg-green-50'
                                    : dark ? 'border-red-700/50 bg-red-900/20' : 'border-red-300 bg-red-50'
                              }`}>
                                <span className={`text-xs font-black w-6 flex-shrink-0 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-600'}`}>{sub.label}</span>
                                <div className="flex gap-1 flex-1">
                                  {['A','B','C','D'].map(letter => (
                                    <span key={letter} className={`flex-1 text-center py-0.5 rounded text-xs font-bold border ${
                                      letter === subCorrect && letter === subSa ? 'bg-green-600 text-white border-green-600'
                                      : letter === subSa && !subIsCorrect ? 'bg-red-500 text-white border-red-500'
                                      : letter === subCorrect
                                        ? dark ? 'bg-green-900/30 text-green-300 border-green-700/50' : 'bg-green-100 text-green-800 border-green-300'
                                        : dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)] border-[var(--dk-border)]' : 'bg-white text-gray-400 border-gray-200'
                                    }`}>{letter}</span>
                                  ))}
                                </div>
                                {!hasSubAnswer && <span className={`text-[10px] flex-shrink-0 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>لم تُجَب</span>}
                                {hasSubAnswer && subIsCorrect && <CheckCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />}
                                {hasSubAnswer && !subIsCorrect && <XCircle className="w-3.5 h-3.5 text-red-500 dark:text-red-400 flex-shrink-0" />}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* MCQ / True-False options */}
                      {!isImgMulti && (
                        <div className={`grid gap-2.5 mt-4 ${isTrueFalse ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
                          {displayOpts.map(opt => {
                            const text = isTrueFalse
                              ? (opt === 'A' ? 'صح' : 'خطأ')
                              : q[`option_${opt.toLowerCase()}`];
                            if (!text || text === '-') return null;
                            const label = displayLabels[opt];
                            return (
                              <div key={opt}
                                className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all ${optStyle(opt, studentAns, correctAns)}`}>
                                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${optBadge(opt, studentAns, correctAns)}`}>
                                  {isTrueFalse ? (opt === 'A' ? '✓' : '✗') : label}
                                </span>
                                <span className={`text-sm flex-1 leading-snug ${optTextColor(opt, studentAns, correctAns)}`}>
                                  {isTrueFalse ? label : text}
                                </span>
                                {optIcon(opt, studentAns, correctAns)}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Correction note — unanswered */}
                      {!isImgMulti && !answered && correctAns && (
                        <div className={`mt-3 flex flex-wrap items-center gap-4 text-xs font-semibold border rounded-xl px-4 py-2.5 ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)]' : 'bg-gray-50 border-gray-200'}`}>
                          <span className={`flex items-center gap-1.5 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
                            <Minus className="w-3.5 h-3.5" />
                            لم تُجِب على هذا السؤال
                          </span>
                          <span className={`flex items-center gap-1.5 ${dark ? 'text-green-400' : 'text-green-800'}`}>
                            <CheckCircle className="w-3.5 h-3.5" />
                            الصحيح: <strong>{displayLabels[correctAns] || correctAns}{!isTrueFalse && ` — ${q[`option_${correctAns?.toLowerCase()}`] || ''}`}</strong>
                          </span>
                        </div>
                      )}
                      {/* Correction note — wrong answer */}
                      {!isImgMulti && answered && !q.is_correct && (
                        <div className={`mt-3 flex flex-wrap items-center gap-4 text-xs font-semibold border rounded-xl px-4 py-2.5 ${dark ? 'bg-orange-900/20 border-orange-700/40' : 'bg-orange-50 border-orange-200'}`}>
                          <span className={`flex items-center gap-1.5 ${dark ? 'text-red-400' : 'text-red-700'}`}>
                            <XCircle className="w-3.5 h-3.5" />
                            اخترت: <strong>{displayLabels[studentAns] || studentAns}{!isTrueFalse && ` — ${q[`option_${studentAns?.toLowerCase()}`] || ''}`}</strong>
                          </span>
                          <span className={`flex items-center gap-1.5 ${dark ? 'text-green-400' : 'text-green-800'}`}>
                            <CheckCircle className="w-3.5 h-3.5" />
                            الصحيح: <strong>{displayLabels[correctAns] || correctAns}{!isTrueFalse && ` — ${q[`option_${correctAns?.toLowerCase()}`] || ''}`}</strong>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Bottom CTA ── */}
            <div className="flex justify-center py-4">
              <button onClick={goBack}
                className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-navy-500 hover:bg-navy-600 text-white font-bold transition-colors shadow-md">
                <ArrowRight className="w-5 h-5" />
                العودة للخلف
              </button>
            </div>
          </>
        )}
      </div>
    </div>

    {lightboxSrc && (
      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    )}
    </>
  );
}
