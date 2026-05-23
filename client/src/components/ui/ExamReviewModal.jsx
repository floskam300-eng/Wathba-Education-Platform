import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, CheckCircle, XCircle, Minus, Clock, Award, FileText } from 'lucide-react';
import api from '../../lib/api';

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
  if (isCorrect && isStudentChoice) return 'border-green-500 bg-green-50 text-green-800';
  if (isCorrect)                    return 'border-green-400 bg-green-50 text-green-800';
  if (isStudentChoice && !isCorrect)return 'border-red-400 bg-red-50 text-red-800';
  return 'border-gray-200 bg-white text-gray-600';
}

function optBadge(opt, studentAnswer, correctAnswer) {
  const isCorrect       = opt === correctAnswer;
  const isStudentChoice = opt === studentAnswer;
  if (isCorrect && isStudentChoice) return 'bg-green-500 text-white';
  if (isCorrect)                    return 'bg-green-400 text-white';
  if (isStudentChoice && !isCorrect)return 'bg-red-400 text-white';
  return 'bg-gray-100 text-gray-500';
}

function optIcon(opt, studentAnswer, correctAnswer) {
  const isCorrect       = opt === correctAnswer;
  const isStudentChoice = opt === studentAnswer;
  if (isCorrect && isStudentChoice) return <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />;
  if (isCorrect)                    return <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />;
  if (isStudentChoice && !isCorrect)return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
  return null;
}

export default function ExamReviewModal({ resultId, onClose }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['exam-review', resultId],
    queryFn: () => api.get(`/exams/results/${resultId}/review`).then(r => r.data),
    enabled: !!resultId,
  });

  const { result, questions = [] } = data || {};
  const passed = result && result.score >= result.pass_score;
  const pct = result ? Math.round((result.score / result.total_score) * 100) : 0;
  const correctCount  = questions.filter(q => q.is_correct === true).length;
  const wrongCount    = questions.filter(q => q.is_correct === false && q.student_answer).length;
  const skippedCount  = questions.filter(q => !q.student_answer).length;

  const shuffleOptions = result?.shuffle_options || false;
  const studentId      = result?.student_id || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className={`px-5 py-4 flex items-start justify-between gap-3 border-b ${passed ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${passed ? 'bg-green-500' : 'bg-red-500'}`}>
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="font-black text-navy-700 text-base leading-tight truncate">
                {result?.exam_title || 'مراجعة الاختبار'}
              </h2>
              {result?.student_name && (
                <p className="text-xs text-gray-500 font-medium mt-0.5">{result.student_name}</p>
              )}
              {result?.attempt_number > 1 && (
                <p className="text-xs text-orange-600 font-bold mt-0.5">المحاولة #{result.attempt_number}</p>
              )}
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white hover:bg-gray-100 flex items-center justify-center flex-shrink-0 transition-colors border border-gray-200">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Score summary */}
        {result && (
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <div className={`text-2xl font-black ${passed ? 'text-green-600' : 'text-red-600'}`}>
                  {result.score}<span className="text-sm text-gray-400 font-semibold">/{result.total_score}</span>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {passed ? '✓ ناجح' : '✗ راسب'}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs font-bold flex-wrap">
                <span className="flex items-center gap-1 text-green-700 bg-green-100 px-2 py-1 rounded-lg">
                  <CheckCircle className="w-3.5 h-3.5" /> {correctCount} صح
                </span>
                <span className="flex items-center gap-1 text-red-600 bg-red-100 px-2 py-1 rounded-lg">
                  <XCircle className="w-3.5 h-3.5" /> {wrongCount} غلط
                </span>
                {skippedCount > 0 && (
                  <span className="flex items-center gap-1 text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">
                    <Minus className="w-3.5 h-3.5" /> {skippedCount} متروك
                  </span>
                )}
                {result.points_earned > 0 && (
                  <span className="flex items-center gap-1 text-orange-600 bg-orange-100 px-2 py-1 rounded-lg">
                    ⭐ +{result.points_earned} نقطة
                  </span>
                )}
              </div>
              <div className="mr-auto flex-1 max-w-[120px]">
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className={`h-2 rounded-full ${passed ? 'bg-green-500' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-gray-400 font-medium mt-0.5 text-left">{pct}%</p>
              </div>
            </div>
          </div>
        )}

        {/* Questions list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {isLoading && (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          )}

          {isError && (
            <div className="text-center py-10">
              <XCircle className="w-10 h-10 text-red-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm font-medium">تعذّر تحميل بيانات المراجعة</p>
            </div>
          )}

          {!isLoading && !isError && questions.map((q, qi) => {
            const studentAns  = q.student_answer;
            const correctAns  = q.correct_answer;
            const answered    = !!studentAns;
            const isTrueFalse = q.question_type === 'true_false';

            const displayOpts = isTrueFalse
              ? ['A', 'B']
              : getShuffledOpts(q, studentId, shuffleOptions);

            const displayLabels = isTrueFalse
              ? { A: '✅ صح', B: '❌ خطأ' }
              : (() => {
                  const labels = ['أ', 'ب', 'ج', 'د'];
                  return Object.fromEntries(displayOpts.map((o, i) => [o, labels[i]]));
                })();

            return (
              <div key={q.id} className={`rounded-2xl border-2 p-4 ${
                !answered     ? 'border-gray-200 bg-gray-50/50'
                : q.is_correct  ? 'border-green-200 bg-green-50/30'
                :                  'border-red-200 bg-red-50/30'
              }`}>
                {/* Question header */}
                <div className="flex items-start gap-3 mb-4">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-black text-white ${
                    !answered ? 'bg-gray-400' : q.is_correct ? 'bg-green-500' : 'bg-red-500'
                  }`}>
                    {qi + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-navy-700 text-sm leading-relaxed">{q.question_text}</p>
                    {q.question_image_url && (
                      <img src={q.question_image_url} alt="" className="mt-2 max-w-xs rounded-xl border" />
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs text-gray-400 font-medium">{q.points} نقطة</span>
                      {isTrueFalse && (
                        <span className="text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full font-bold">صح/خطأ</span>
                      )}
                      {!answered && (
                        <span className="flex items-center gap-1 text-xs text-gray-400 font-bold">
                          <Clock className="w-3 h-3" /> لم تُجَب
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className={`grid gap-2 ${isTrueFalse ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
                  {displayOpts.map(opt => {
                    const text = isTrueFalse
                      ? (opt === 'A' ? 'صح' : 'خطأ')
                      : q[`option_${opt.toLowerCase()}`];
                    if (!text || text === '-') return null;
                    const label = displayLabels[opt];
                    return (
                      <div key={opt}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all ${optStyle(opt, studentAns, correctAns)}`}>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${optBadge(opt, studentAns, correctAns)}`}>
                          {isTrueFalse ? (opt === 'A' ? '✓' : '✗') : label}
                        </span>
                        <span className="text-sm font-medium flex-1">{isTrueFalse ? label : text}</span>
                        {optIcon(opt, studentAns, correctAns)}
                      </div>
                    );
                  })}
                </div>

                {/* Correction note for wrong answers */}
                {answered && q.is_correct === false && (
                  <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">
                    <span className="flex items-center gap-1 text-red-600">
                      <XCircle className="w-3.5 h-3.5" />
                      إجابتك: {displayLabels[studentAns] || studentAns}
                    </span>
                    <span className="flex items-center gap-1 text-green-700">
                      <CheckCircle className="w-3.5 h-3.5" />
                      الصحيح: {displayLabels[correctAns] || correctAns}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button onClick={onClose} className="btn-primary px-6 py-2 text-sm">إغلاق</button>
        </div>
      </div>
    </div>
  );
}
