import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, CheckCircle, XCircle, Minus, Clock, Award, GraduationCap } from 'lucide-react';
import api from '../../lib/api';
import ImageLightbox from '../ImageLightbox';
import QuestionImage from './QuestionImage';
import MathText from '../MathText';

function optStyle(opt, studentAnswer, correctAnswer) {
  const isCorrect       = opt === correctAnswer;
  const isStudentChoice = opt === studentAnswer;
  if (isCorrect && isStudentChoice)
    return 'border-green-500 bg-green-50 text-green-800 dark:bg-green-900/30 dark:border-green-600 dark:text-green-300';
  if (isCorrect)
    return 'border-green-400 bg-green-50 text-green-800 dark:bg-green-900/20 dark:border-green-700/70 dark:text-green-300';
  if (isStudentChoice && !isCorrect)
    return 'border-red-400 bg-red-50 text-red-800 dark:bg-red-900/25 dark:border-red-600/70 dark:text-red-300';
  return 'border-gray-200 bg-white text-gray-600 dark:bg-gray-700/40 dark:border-gray-600 dark:text-gray-300';
}

function optBadge(opt, studentAnswer, correctAnswer) {
  const isCorrect       = opt === correctAnswer;
  const isStudentChoice = opt === studentAnswer;
  if (isCorrect && isStudentChoice) return 'bg-green-500 text-white';
  if (isCorrect)                    return 'bg-green-400 text-white';
  if (isStudentChoice && !isCorrect)return 'bg-red-400 text-white';
  return 'bg-gray-100 text-gray-500 dark:bg-gray-600 dark:text-gray-300';
}

function optIcon(opt, studentAnswer, correctAnswer) {
  const isCorrect       = opt === correctAnswer;
  const isStudentChoice = opt === studentAnswer;
  if (isCorrect && isStudentChoice) return <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />;
  if (isCorrect)                    return <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400 flex-shrink-0" />;
  if (isStudentChoice && !isCorrect)return <XCircle    className="w-4 h-4 text-red-500   dark:text-red-400   flex-shrink-0" />;
  return null;
}

export default function RecitationReviewModal({ resultId, onClose }) {
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['recitation-review', resultId],
    queryFn: () => api.get(`/recitations/results/${resultId}/review`).then(r => r.data),
    enabled: !!resultId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { result, review: questions = [] } = data || {};
  const passed = result ? (result.passed ?? (result.total_score > 0 ? (result.score / result.total_score) >= 0.5 : false)) : false;
  const totalScore = result?.total_score || (questions.length > 0 ? questions.length : 0);
  const pct = result && totalScore > 0 ? Math.round((result.score / totalScore) * 100) : 0;

  const correctCount  = result?.correct_count  ?? questions.filter(q => q.is_correct === true).length;
  const wrongCount    = result?.wrong_count     ?? questions.filter(q => q.is_correct === false && !!q.student_answer).length;
  const skippedCount  = result?.unanswered_count ?? questions.filter(q => !q.student_answer).length;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm" dir="rtl">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-100 dark:border-gray-700">

        {/* Header */}
        <div className={`px-5 py-4 flex items-start justify-between gap-3 border-b ${
          passed
            ? 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800/40'
            : 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800/40'
        }`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${passed ? 'bg-green-500' : 'bg-red-500'}`}>
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0 text-right">
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300">
                  📚 مراجعة التسميع
                </span>
              </div>
              <h2 className="font-black text-gray-800 dark:text-gray-100 text-base leading-tight truncate mt-1">
                {result?.recitation_title || 'مراجعة نتيجة التسميع'}
              </h2>
              {result?.student_name && (
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">{result.student_name}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center justify-center flex-shrink-0 transition-colors border border-gray-200 dark:border-gray-600 cursor-pointer"
          >
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Score summary */}
        {result && (
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-700/30">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <div className={`text-2xl font-black ${passed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {result.score}<span className="text-sm text-gray-400 dark:text-gray-500 font-semibold">/{totalScore}</span>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  passed
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                }`}>
                  {passed ? '✓ ناجح' : '✗ راسب'}
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-xs font-bold flex-wrap">
                <span className="flex items-center gap-1 text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded-lg">
                  <CheckCircle className="w-3.5 h-3.5" /> {correctCount} صح
                </span>
                <span className="flex items-center gap-1 text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded-lg">
                  <XCircle className="w-3.5 h-3.5" /> {wrongCount} غلط
                </span>
                <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-lg">
                  <Minus className="w-3.5 h-3.5" /> {skippedCount} لم يُجب
                </span>
                {result.points_earned > 0 && (
                  <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30 px-2 py-1 rounded-lg">
                    ⭐ +{result.points_earned} نقطة
                  </span>
                )}
              </div>
              <div className="mr-auto flex-1 max-w-[120px]">
                <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                  <div className={`h-2 rounded-full ${passed ? 'bg-green-500' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 font-medium mt-0.5 text-left">{pct}%</p>
              </div>
            </div>
          </div>
        )}

        {/* Questions list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading && (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-100 dark:bg-gray-700 rounded-2xl animate-pulse" />
              ))}
            </div>
          )}

          {isError && (
            <div className="text-center py-10">
              <XCircle className="w-10 h-10 text-red-300 mx-auto mb-2" />
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">تعذّر تحميل بيانات مراجعة التسميع</p>
            </div>
          )}

          {!isLoading && !isError && questions.length === 0 && (
            <div className="text-center py-10">
              <p className="text-gray-400 dark:text-gray-500 text-sm font-medium">لا توجد أسئلة مسجلة لهذه النتيجة</p>
            </div>
          )}

          {!isLoading && !isError && questions.map((q, qi) => {
            const isImgMulti  = q.question_type === 'image_multi';
            const isTrueFalse = q.question_type === 'true_false';

            const studentAns = isTrueFalse
              ? (q.student_answer === 'T' ? 'A' : q.student_answer === 'F' ? 'B' : q.student_answer)
              : q.student_answer;
            const correctAns = isTrueFalse
              ? ((q.correct_answer_letter || q.correct_answer) === 'T' ? 'A' : (q.correct_answer_letter || q.correct_answer) === 'F' ? 'B' : (q.correct_answer_letter || q.correct_answer))
              : (q.correct_answer_letter || q.correct_answer);

            const answered = isImgMulti
              ? (Array.isArray(q.sub_results) && q.sub_results.some(s => !!s.student_answer))
              : !!studentAns;

            const opts = ['A', 'B', 'C', 'D'].filter(o => q[`option_${o.toLowerCase()}`]);
            const displayOpts = isImgMulti ? [] : isTrueFalse ? ['A', 'B'] : (opts.length > 0 ? opts : ['A', 'B', 'C', 'D'].filter(o => q[`option_${o.toLowerCase()}`]));

            const defaultArabic = ['أ', 'ب', 'ج', 'د'];
            const rawLabels = Array.isArray(q.option_labels) && q.option_labels.length > 0 ? q.option_labels : defaultArabic;
            const displayLabels = isTrueFalse
              ? { A: '✅ صح', B: '❌ خطأ' }
              : Object.fromEntries(
                  ['A', 'B', 'C', 'D'].map((letter, i) => [letter, rawLabels?.[i] || defaultArabic[i] || letter])
                );

            const cardCls = !answered
              ? 'border-gray-200 bg-gray-50/50 dark:border-gray-600/60 dark:bg-gray-700/25'
              : q.is_correct
                ? 'border-green-200 bg-green-50/30 dark:border-green-700/50 dark:bg-green-900/15'
                : 'border-red-200 bg-red-50/30 dark:border-red-700/50 dark:bg-red-900/15';

            return (
              <div key={q.id || qi} className={`rounded-2xl border-2 p-4 ${cardCls}`}>
                {/* Question header */}
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-black text-white ${
                    !answered ? 'bg-gray-400 dark:bg-gray-500' : q.is_correct ? 'bg-green-500' : 'bg-red-500'
                  }`}>
                    {qi + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    {q.question_text && (
                      <p className="font-bold text-gray-800 dark:text-gray-100 text-sm leading-relaxed mb-1">
                        <MathText text={q.question_text} />
                      </p>
                    )}
                    {q.question_image_url && (
                      <QuestionImage
                        src={q.question_image_url}
                        alt="سؤال"
                        maxHeightClass="max-h-56"
                        containerClassName="mt-2"
                        onImagePress={(url) => setLightboxSrc(url)}
                      />
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {q.points !== undefined && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{q.points} نقطة</span>
                      )}
                      {isTrueFalse && (
                        <span className="text-xs text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded-full font-bold">
                          صح/خطأ
                        </span>
                      )}
                      {isImgMulti && (
                        <span className="text-xs text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30 px-2 py-0.5 rounded-full font-bold">
                          صورة مع أسئلة
                        </span>
                      )}
                      {!answered && (
                        <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 font-bold">
                          <Clock className="w-3 h-3" /> لم تُجَب
                        </span>
                      )}
                      {answered && q.is_correct && (
                        <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full font-bold">
                          <CheckCircle className="w-3 h-3" /> صحيحة ✓
                        </span>
                      )}
                      {answered && !q.is_correct && (
                        <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full font-bold">
                          <XCircle className="w-3 h-3" /> خاطئة ✗
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* image_multi sub-results */}
                {isImgMulti && (
                  <div className="space-y-1.5 mt-2">
                    {(q.sub_results || q.sub_questions || []).map(sub => {
                      const subResult     = q.sub_results ? sub : null;
                      const rawSubSa      = subResult?.student_answer || null;
                      const rawSubCorrect = subResult?.correct || sub.correct;
                      const isTF          = sub.type === 'true_false' || String(rawSubCorrect).toUpperCase() === 'T' || String(rawSubCorrect).toUpperCase() === 'F';
                      const subSa = isTF
                        ? (rawSubSa === 'T' ? 'A' : rawSubSa === 'F' ? 'B' : rawSubSa)
                        : rawSubSa;
                      const subCorrect = isTF
                        ? (rawSubCorrect === 'T' ? 'A' : rawSubCorrect === 'F' ? 'B' : rawSubCorrect)
                        : rawSubCorrect;
                      const subIsCorrect = subResult?.is_correct ?? (String(subSa || '').toUpperCase() === String(subCorrect || '').toUpperCase());
                      const hasSubAnswer = !!subSa;
                      const listLetters  = isTF ? ['A', 'B'] : ['A', 'B', 'C', 'D'].slice(0, sub.option_labels?.length || 4);

                      const subRowCls = !hasSubAnswer
                        ? 'border-gray-200 bg-gray-50 dark:border-gray-600/50 dark:bg-gray-700/30'
                        : subIsCorrect
                          ? 'border-green-300 bg-green-50 dark:border-green-700/60 dark:bg-green-900/20'
                          : 'border-red-300 bg-red-50 dark:border-red-700/60 dark:bg-red-900/20';

                      return (
                        <div key={sub.label} className={`flex items-center gap-2 p-2.5 rounded-xl border-2 ${subRowCls}`}>
                          <span className="text-xs font-black w-24 flex-shrink-0 text-gray-700 dark:text-gray-200">
                            {sub.label} <span className="text-[10px] text-gray-400 dark:text-gray-500 font-normal">({sub.points || 1} د)</span>
                          </span>
                          <div className="flex gap-1 flex-1">
                            {listLetters.map(letter => {
                              const isLetterCorrect = letter === subCorrect;
                              const isLetterStudent = letter === subSa;
                              const letterCls = isLetterCorrect && isLetterStudent
                                ? 'bg-green-600 text-white border-green-600'
                                : isLetterStudent && !subIsCorrect
                                  ? 'bg-red-500 text-white border-red-500'
                                  : isLetterCorrect
                                    ? 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700/60'
                                    : 'bg-white text-gray-400 border-gray-200 dark:bg-gray-700/50 dark:text-gray-400 dark:border-gray-600';
                              return (
                                <span key={letter} className={`flex-1 text-center py-0.5 rounded text-xs font-bold border ${letterCls}`}>
                                  {isTF
                                    ? (letter === 'A' ? 'صح' : 'خطأ')
                                    : (sub.option_labels?.[['A','B','C','D'].indexOf(letter)] || ['أ', 'ب', 'ج', 'د'][['A','B','C','D'].indexOf(letter)] || letter)}
                                </span>
                              );
                            })}
                          </div>
                          {!hasSubAnswer && <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">لم تُجَب</span>}
                          {hasSubAnswer && subIsCorrect  && <CheckCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />}
                          {hasSubAnswer && !subIsCorrect && <XCircle    className="w-3.5 h-3.5 text-red-500 dark:text-red-400 flex-shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* MCQ / True-False options */}
                {!isImgMulti && displayOpts.length > 0 && (
                  <div className={`grid gap-2 mt-2.5 ${isTrueFalse ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
                    {displayOpts.map(opt => {
                      const text = isTrueFalse
                        ? (opt === 'A' ? 'صح' : 'خطأ')
                        : q[`option_${opt.toLowerCase()}`];
                      if (!text && !isTrueFalse) return null;
                      const label = displayLabels[opt] || opt;
                      return (
                        <div
                          key={opt}
                          className={`flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all ${optStyle(opt, studentAns, correctAns)}`}
                        >
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${optBadge(opt, studentAns, correctAns)}`}>
                            {isTrueFalse ? (opt === 'A' ? '✓' : '✗') : label}
                          </span>
                          <span className="text-sm font-medium flex-1">
                            {isTrueFalse ? label : <MathText text={text} />}
                          </span>
                          {optIcon(opt, studentAns, correctAns)}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Fallback for simple direct questions without option cards */}
                {!isImgMulti && displayOpts.length === 0 && (correctAns || studentAns) && (
                  <div className="flex gap-3 mt-3">
                    {[
                      { opt: correctAns, label: studentAns === correctAns ? '✅ صح — إجابة الطالب' : '✅ الإجابة الصحيحة' },
                      ...(studentAns && studentAns !== correctAns
                        ? [{ opt: studentAns, label: '❌ إجابة الطالب' }]
                        : [])
                    ].map(({ opt, label }) => (
                      <div key={opt} className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-center border-2 ${
                        label.includes('صح')
                          ? 'border-green-400 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-400'
                          : 'border-red-400 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-400'
                      }`}>
                        {label}: <strong>{displayLabels[opt] || opt}</strong>
                      </div>
                    ))}
                  </div>
                )}

                {/* Correction note for wrong MCQ/TF answers */}
                {!isImgMulti && answered && q.is_correct === false && (
                  <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">
                    <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                      <XCircle className="w-3.5 h-3.5" />
                      إجابة الطالب: {displayLabels[studentAns] || studentAns}
                    </span>
                    <span className="flex items-center gap-1 text-green-700 dark:text-green-400">
                      <CheckCircle className="w-3.5 h-3.5" />
                      الصحيح: {displayLabels[correctAns] || correctAns}
                    </span>
                  </div>
                )}

                {/* Correction note for unanswered questions */}
                {!isImgMulti && !answered && correctAns && (
                  <div className="mt-3 flex items-center gap-2 text-xs font-semibold bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-600/60 rounded-xl px-4 py-2.5">
                    <Minus className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-gray-500 dark:text-gray-400">لم يُجب الطالب</span>
                    <span className="mx-1 text-gray-300 dark:text-gray-600">—</span>
                    <CheckCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                    <span className="text-green-800 dark:text-green-400">الصحيح: <strong>{displayLabels[correctAns] || correctAns}</strong></span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>

      {/* Image lightbox */}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} alt="صورة السؤال" onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
}
