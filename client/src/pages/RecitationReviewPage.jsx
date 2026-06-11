import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Clock, CheckCircle, XCircle, Minus, Award, BarChart2 } from 'lucide-react';
import api from '../lib/api';
import MathText from '../components/MathText';
import { withToken } from '../lib/mediaAccess';
import { useAuth } from '../context/AuthContext';

function fmt(date) {
  if (!date) return '—';
  return new Date(date).toLocaleString('ar-EG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function StatBadge({ label, value, color = 'text-gray-700', bg = 'bg-gray-50' }) {
  return (
    <div className={`rounded-2xl p-3.5 text-center ${bg}`}>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      <p className="text-xs font-semibold text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

export default function RecitationReviewPage() {
  const { resultId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['recitation-review', resultId],
    queryFn: () => api.get(`/recitations/results/${resultId}/review`).then(r => r.data),
    retry: false,
  });

  const result   = data?.result;
  const questions = data?.review || [];

  const correct   = questions.filter(q => q.is_correct).length;
  const wrong     = questions.filter(q => !q.is_correct && q.student_answer).length;
  const unanswered = questions.filter(q => !q.student_answer).length;
  const pct = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;

  const goBack = () => navigate(-1);

  return (
    <div className="min-h-screen bg-gray-50 pb-12" dir="rtl">
      {/* Header */}
      <div className="bg-gradient-to-l from-[#1A2E4A] to-[#0f1e32] px-4 py-5 sticky top-0 z-10 shadow-lg">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button onClick={goBack} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
            <ArrowRight className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-black text-base truncate">
              {isLoading ? 'جاري التحميل...' : result?.recitation_title || 'مراجعة التسميع'}
            </h1>
            {result?.student_name && (
              <p className="text-white/60 text-xs mt-0.5 truncate">{result.student_name}</p>
            )}
          </div>
          <div className={`text-2xl font-black px-4 py-1.5 rounded-2xl ${pct >= 50 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
            {pct}%
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-6">
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-navy-200 border-t-navy-600 rounded-full animate-spin" />
          </div>
        )}
        {isError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <XCircle className="w-10 h-10 text-red-400 mx-auto mb-2" />
            <p className="text-red-700 font-bold">تعذّر تحميل المراجعة</p>
          </div>
        )}

        {!isLoading && !isError && result && (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-4 gap-3">
              <StatBadge label="صحيح" value={correct} color="text-emerald-600" bg="bg-emerald-50" />
              <StatBadge label="خطأ" value={wrong} color="text-red-500" bg="bg-red-50" />
              <StatBadge label="لم يُجَب" value={unanswered} color="text-gray-500" bg="bg-gray-100" />
              <StatBadge label="النسبة" value={`${pct}%`} color={pct >= 50 ? 'text-emerald-600' : 'text-red-500'} bg={pct >= 50 ? 'bg-emerald-50' : 'bg-red-50'} />
            </div>

            {/* Info */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap gap-4 text-xs text-gray-500 font-semibold">
              {result.created_at && (
                <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {fmt(result.created_at)}</span>
              )}
              {result.score !== undefined && (
                <span className="flex items-center gap-1.5"><Award className="w-3.5 h-3.5 text-amber-500" /> الدرجة: {Math.round(result.score)}%</span>
              )}
              <span className="flex items-center gap-1.5"><BarChart2 className="w-3.5 h-3.5 text-blue-500" /> {questions.length} سؤال</span>
            </div>

            {/* Questions */}
            <div className="space-y-4">
              {questions.map((q, qi) => {
                const isImgMulti = q.question_type === 'image_multi';
                const answered   = !!q.student_answer;
                const opts = ['A','B','C','D'].filter(o => q[`option_${o.toLowerCase()}`]);

                return (
                  <div key={q.id || qi} className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden ${
                    !answered ? 'border-gray-200' : q.is_correct ? 'border-green-300' : 'border-red-300'
                  }`}>
                    {/* Question header */}
                    <div className={`px-5 py-3 flex items-center gap-3 border-b ${
                      !answered ? 'bg-gray-50 border-gray-100' : q.is_correct ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'
                    }`}>
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black text-white ${
                        !answered ? 'bg-gray-400' : q.is_correct ? 'bg-green-500' : 'bg-red-500'
                      }`}>{qi + 1}</div>
                      <div className="flex items-center gap-2 text-xs font-bold flex-wrap">
                        {isImgMulti && <span className="text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">صورة+أسئلة</span>}
                        {!answered && <span className="flex items-center gap-1 text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" /> لم تُجَب</span>}
                        {answered && q.is_correct && <span className="flex items-center gap-1 text-green-700 bg-green-100 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" /> صحيحة ✓</span>}
                        {answered && !q.is_correct && <span className="flex items-center gap-1 text-red-600 bg-red-100 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" /> خاطئة ✗</span>}
                      </div>
                    </div>

                    {/* Question body */}
                    <div className="px-5 py-4">
                      {q.question_text && (
                        <p className="font-bold text-navy-700 text-base leading-relaxed mb-2">
                          <MathText text={q.question_text} />
                        </p>
                      )}
                      {q.question_image_url && (
                        <img src={withToken(q.question_image_url)} alt="" className="mt-1 mb-3 w-full max-h-64 object-contain rounded-xl border border-gray-200" />
                      )}

                      {/* image_multi sub-results */}
                      {isImgMulti && (
                        <div className="space-y-1.5 mt-2">
                          {(q.sub_results || q.sub_questions || []).map(sub => {
                            const subResult = q.sub_results ? sub : null;
                            const subSa = subResult?.student_answer || null;
                            const subCorrect = subResult?.correct || sub.correct;
                            const subIsCorrect = subResult?.is_correct ?? false;
                            const hasSubAns = !!subSa;
                            return (
                              <div key={sub.label} className={`flex items-center gap-2 p-2.5 rounded-xl border-2 ${
                                !hasSubAns ? 'border-gray-200 bg-gray-50' : subIsCorrect ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
                              }`}>
                                <span className="text-xs font-black text-gray-600 w-6 flex-shrink-0">{sub.label}</span>
                                <div className="flex gap-1 flex-1">
                                  {['A','B','C','D'].map(letter => (
                                    <span key={letter} className={`flex-1 text-center py-0.5 rounded text-xs font-bold border ${
                                      letter === subCorrect && letter === subSa ? 'bg-green-600 text-white border-green-600'
                                      : letter === subSa && !subIsCorrect ? 'bg-red-500 text-white border-red-500'
                                      : letter === subCorrect ? 'bg-green-100 text-green-800 border-green-300'
                                      : 'bg-white text-gray-400 border-gray-200'
                                    }`}>{letter}</span>
                                  ))}
                                </div>
                                {!hasSubAns && <span className="text-[10px] text-gray-400 flex-shrink-0">لم تُجَب</span>}
                                {hasSubAns && subIsCorrect && <CheckCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />}
                                {hasSubAns && !subIsCorrect && <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* MCQ / True-False options */}
                      {!isImgMulti && opts.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                          {opts.map(opt => {
                            const text = q[`option_${opt.toLowerCase()}`];
                            if (!text) return null;
                            const isStudentChoice = q.student_answer === opt;
                            const isCorrectOpt = q.correct_answer === opt || q.correct_answer_letter === opt;
                            return (
                              <div key={opt} className={`flex items-center gap-3 p-3 rounded-xl border-2 ${
                                isCorrectOpt && isStudentChoice ? 'border-green-500 bg-green-50'
                                : isStudentChoice && !isCorrectOpt ? 'border-red-400 bg-red-50'
                                : isCorrectOpt ? 'border-green-300 bg-green-50/50'
                                : 'border-gray-100 bg-gray-50'
                              }`}>
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${
                                  isCorrectOpt && isStudentChoice ? 'bg-green-600 text-white'
                                  : isStudentChoice ? 'bg-red-500 text-white'
                                  : isCorrectOpt ? 'bg-green-200 text-green-800'
                                  : 'bg-gray-200 text-gray-600'
                                }`}>{opt}</span>
                                <span className={`text-sm flex-1 ${
                                  isCorrectOpt ? 'text-green-800 font-semibold' : isStudentChoice ? 'text-red-700 font-semibold' : 'text-gray-600'
                                }`}>{text}</span>
                                {isCorrectOpt && <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />}
                                {isStudentChoice && !isCorrectOpt && <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* True/False */}
                      {!isImgMulti && opts.length === 0 && (q.correct_answer || q.student_answer) && (
                        <div className="flex gap-3 mt-3">
                          {[{ opt: q.correct_answer || q.correct_answer_letter, label: q.student_answer === (q.correct_answer || q.correct_answer_letter) ? '✅ صح — إجابتك' : '✅ الإجابة الصحيحة' },
                            ...(q.student_answer && q.student_answer !== (q.correct_answer || q.correct_answer_letter) ? [{ opt: q.student_answer, label: '❌ إجابتك' }] : [])
                          ].map(({ opt, label }) => (
                            <div key={opt} className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-center border-2 ${
                              label.includes('صح') ? 'border-green-400 bg-green-50 text-green-800' : 'border-red-400 bg-red-50 text-red-800'
                            }`}>{label}</div>
                          ))}
                        </div>
                      )}

                      {/* Correction note */}
                      {!isImgMulti && !answered && q.correct_answer && (
                        <div className="mt-3 flex items-center gap-2 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
                          <Minus className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-gray-500">لم تُجِب</span>
                          <span className="mx-1">—</span>
                          <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                          <span className="text-green-800">الصحيح: <strong>{q.correct_answer}</strong></span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom CTA */}
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
  );
}
