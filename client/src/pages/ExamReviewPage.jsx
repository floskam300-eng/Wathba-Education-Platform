import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import {
  ArrowRight, CheckCircle, XCircle, Minus, Clock,
  FileText, Award, BarChart2, Edit3, Save, AlertCircle
} from 'lucide-react';
import api from '../lib/api';
import toast from 'react-hot-toast';

const OPTS = ['A', 'B', 'C', 'D'];
const optLabel = { A: 'أ', B: 'ب', C: 'ج', D: 'د' };

function optStyle(opt, studentAnswer, correctAnswer) {
  const isCorrect      = opt === correctAnswer;
  const isStudentChoice = opt === studentAnswer;
  if (isCorrect && isStudentChoice) return 'border-green-500 bg-green-50';
  if (isCorrect)                    return 'border-green-400 bg-green-50';
  if (isStudentChoice && !isCorrect)return 'border-red-400 bg-red-50';
  return 'border-gray-200 bg-white';
}

function optBadge(opt, studentAnswer, correctAnswer) {
  const isCorrect      = opt === correctAnswer;
  const isStudentChoice = opt === studentAnswer;
  if (isCorrect && isStudentChoice) return 'bg-green-500 text-white';
  if (isCorrect)                    return 'bg-green-400 text-white';
  if (isStudentChoice && !isCorrect)return 'bg-red-400 text-white';
  return 'bg-gray-100 text-gray-500';
}

function optTextColor(opt, studentAnswer, correctAnswer) {
  const isCorrect      = opt === correctAnswer;
  const isStudentChoice = opt === studentAnswer;
  if (isCorrect)                    return 'text-green-800 font-semibold';
  if (isStudentChoice && !isCorrect)return 'text-red-800 font-semibold';
  return 'text-gray-600';
}

function optIcon(opt, studentAnswer, correctAnswer) {
  const isCorrect      = opt === correctAnswer;
  const isStudentChoice = opt === studentAnswer;
  if (isCorrect && isStudentChoice) return <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />;
  if (isCorrect)                    return <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />;
  if (isStudentChoice && !isCorrect)return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
  return null;
}

export default function ExamReviewPage() {
  const { resultId } = useParams();
  const navigate     = useNavigate();
  const { user }     = useAuth();
  const qc           = useQueryClient();

  const [essayScores, setEssayScores] = useState({});
  const [gradingMode, setGradingMode] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['exam-review', resultId],
    queryFn: () => api.get(`/exams/results/${resultId}/review`).then(r => r.data),
    enabled: !!resultId,
  });

  const gradeMut = useMutation({
    mutationFn: (scores) => api.put(`/exams/results/${resultId}/grade-essay`, { essay_scores: scores }),
    onSuccess: (res) => {
      qc.invalidateQueries(['exam-review', resultId]);
      toast.success(`تم تصحيح الأسئلة المقالية — الدرجة الجديدة: ${res.data.new_score}`);
      setGradingMode(false);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const { result, questions = [] } = data || {};

  const passed       = result && result.score >= result.pass_score;
  const pct          = result ? Math.round((result.score / result.total_score) * 100) : 0;
  const correctCount = questions.filter(q => q.is_correct).length;
  const wrongCount   = questions.filter(q => !q.is_correct && q.student_answer && q.question_type !== 'essay').length;
  const skippedCount = questions.filter(q => !q.student_answer && q.question_type !== 'essay').length;
  const essayQuestions = questions.filter(q => q.question_type === 'essay');

  const isTeacher = user?.role === 'teacher' || user?.role === 'assistant';
  const hasEssay  = result?.has_essay || essayQuestions.length > 0;
  const isGraded  = result?.essay_graded;

  const goBack = () => navigate(-1);

  return (
    <div className="min-h-screen bg-gray-50 font-cairo" dir="rtl">

      <div className="max-w-3xl mx-auto px-4 pt-6 pb-2">
        <button onClick={goBack}
          className="flex items-center gap-2 text-gray-500 hover:text-navy-700 text-sm font-bold transition-colors mb-4">
          <ArrowRight className="w-4 h-4" />
          رجوع
        </button>

        {!isLoading && result && (
          <div className={`rounded-2xl p-5 mb-2 flex items-center justify-between gap-4 shadow-sm border-2 ${passed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-500 mb-1">مراجعة الاختبار</p>
              <h1 className={`font-black text-lg leading-tight ${passed ? 'text-green-800' : 'text-red-800'}`}>
                {result.exam_title}
              </h1>
              {/* Essay grading status badge */}
              {hasEssay && (
                isGraded ? (
                  <span className="inline-flex items-center gap-1 mt-2 text-xs font-bold px-2 py-1 rounded-full bg-blue-100 text-blue-800">
                    <CheckCircle className="w-3 h-3" /> تم التصحيح المقالي
                    {result.essay_score_adjustment > 0 && <span>(+{result.essay_score_adjustment} درجة)</span>}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 mt-2 text-xs font-bold px-2 py-1 rounded-full bg-yellow-100 text-yellow-800">
                    <Clock className="w-3 h-3" /> بانتظار التصحيح المقالي
                  </span>
                )
              )}
            </div>
            <div className="text-center flex-shrink-0">
              <div className={`text-3xl font-black ${passed ? 'text-green-700' : 'text-red-600'}`}>
                {result.score}
                <span className="text-base font-semibold text-gray-400">/{result.total_score}</span>
              </div>
              <span className={`text-xs font-black px-3 py-1 rounded-full ${passed ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-700'}`}>
                {passed ? '✓ ناجح' : '✗ راسب'}
              </span>
            </div>
          </div>
        )}
        {isLoading && <div className="h-20 bg-white rounded-2xl animate-pulse mb-2" />}
      </div>

      <div className="max-w-3xl mx-auto px-4 pb-6 space-y-6">

        {isLoading && (
          <div className="space-y-4">
            <div className="h-28 bg-white rounded-2xl animate-pulse" />
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-52 bg-white rounded-2xl animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-gray-100">
            <XCircle className="w-14 h-14 text-red-300 mx-auto mb-3" />
            <p className="text-gray-700 font-bold text-lg">تعذّر تحميل المراجعة</p>
            <p className="text-gray-400 text-sm mt-1 mb-4">تحقق من الاتصال أو حاول مجدداً</p>
            <button onClick={goBack} className="btn-primary px-6 py-2">رجوع</button>
          </div>
        )}

        {!isLoading && !isError && result && (
          <>
            {/* ── Stats row ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              {result.student_name && user?.role !== 'student' && (
                <p className="text-sm text-gray-500 font-medium mb-3 pb-3 border-b border-gray-100">
                  الطالب: <span className="font-bold text-gray-800">{result.student_name}</span>
                </p>
              )}
              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-500 font-medium mb-1.5">
                  <span>نسبة الإجابات الصحيحة</span>
                  <span className="font-bold">{pct}%</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-3 rounded-full transition-all ${passed ? 'bg-green-500' : 'bg-red-400'}`}
                    style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div className="flex flex-col items-center gap-1 bg-green-50 border border-green-100 rounded-xl py-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-green-800 text-xl font-black">{correctCount}</span>
                  <span className="text-green-700 text-xs font-semibold">صحيح</span>
                </div>
                <div className="flex flex-col items-center gap-1 bg-red-50 border border-red-100 rounded-xl py-3">
                  <XCircle className="w-5 h-5 text-red-500" />
                  <span className="text-red-700 text-xl font-black">{wrongCount}</span>
                  <span className="text-red-600 text-xs font-semibold">خاطئ</span>
                </div>
                <div className="flex flex-col items-center gap-1 bg-gray-50 border border-gray-100 rounded-xl py-3">
                  <Minus className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-600 text-xl font-black">{skippedCount}</span>
                  <span className="text-gray-500 text-xs font-semibold">متروك</span>
                </div>
                <div className="flex flex-col items-center gap-1 bg-orange-50 border border-orange-100 rounded-xl py-3">
                  <Award className="w-5 h-5 text-orange-500" />
                  <span className="text-orange-700 text-xl font-black">+{result.points_earned || 0}</span>
                  <span className="text-orange-600 text-xs font-semibold">نقطة</span>
                </div>
              </div>
            </div>

            {/* ── Teacher: essay grading panel ── */}
            {isTeacher && hasEssay && !isGraded && (
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-black text-yellow-800 flex items-center gap-2">
                    <Edit3 className="w-5 h-5" /> تصحيح الأسئلة المقالية
                  </h2>
                  {!gradingMode ? (
                    <button onClick={() => setGradingMode(true)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-bold rounded-xl transition-colors">
                      <Edit3 className="w-4 h-4" /> ابدأ التصحيح
                    </button>
                  ) : (
                    <button onClick={() => gradeMut.mutate(essayScores)}
                      disabled={gradeMut.isPending}
                      className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-xl transition-colors">
                      <Save className="w-4 h-4" /> حفظ الدرجات
                    </button>
                  )}
                </div>
                {gradingMode && (
                  <div className="space-y-3">
                    {essayQuestions.map((q, i) => (
                      <div key={q.id} className="bg-white rounded-xl p-4 border border-yellow-200">
                        <p className="font-bold text-navy-700 text-sm mb-2">س{i + 1}: {q.question_text} <span className="text-gray-400 font-normal">({q.points} درجة)</span></p>
                        <div className="bg-gray-50 rounded-lg p-3 mb-3 text-sm text-gray-700 border border-gray-200">
                          <p className="text-xs text-gray-400 font-bold mb-1">إجابة الطالب:</p>
                          {q.student_answer || <span className="italic text-gray-400">لم يُجِب</span>}
                        </div>
                        {q.correct_answer && (
                          <div className="bg-green-50 rounded-lg p-3 mb-3 text-sm text-green-800 border border-green-200">
                            <p className="text-xs text-green-600 font-bold mb-1">الإجابة النموذجية:</p>
                            {q.correct_answer}
                          </div>
                        )}
                        <div className="flex items-center gap-3">
                          <label className="text-sm font-bold text-gray-700">الدرجة (من {q.points}):</label>
                          <input
                            type="number" min="0" max={q.points}
                            value={essayScores[q.id] ?? ''}
                            onChange={e => setEssayScores(prev => ({ ...prev, [q.id]: e.target.value }))}
                            className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-bold focus:outline-none focus:border-orange-400"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!gradingMode && (
                  <p className="text-sm text-yellow-700 font-medium">
                    يوجد {essayQuestions.length} سؤال مقالي يحتاج تصحيحاً يدوياً
                  </p>
                )}
              </div>
            )}

            {/* ── Teacher: already graded ── */}
            {isTeacher && hasEssay && isGraded && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <div>
                  <p className="font-bold text-blue-800 text-sm">تم تصحيح الأسئلة المقالية</p>
                  {result.essay_score_adjustment > 0 && (
                    <p className="text-blue-600 text-xs font-medium">تم إضافة {result.essay_score_adjustment} درجة إضافية</p>
                  )}
                </div>
              </div>
            )}

            {/* ── Legend ── */}
            <div className="flex flex-wrap gap-3 text-xs font-semibold">
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 text-green-800 rounded-full">
                <CheckCircle className="w-3.5 h-3.5 text-green-600" /> إجابة صحيحة
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 text-red-800 rounded-full">
                <XCircle className="w-3.5 h-3.5 text-red-500" /> إجابتك الخاطئة
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-600 rounded-full">
                <Minus className="w-3.5 h-3.5 text-gray-400" /> لم تُجَب
              </span>
              {hasEssay && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 border border-purple-200 text-purple-800 rounded-full">
                  <FileText className="w-3.5 h-3.5 text-purple-500" /> سؤال مقالي
                </span>
              )}
            </div>

            {/* ── Questions ── */}
            <div className="space-y-5">
              {questions.map((q, qi) => {
                const isEssay     = q.question_type === 'essay';
                const studentAns  = q.student_answer;
                const correctAns  = q.correct_answer;
                const answered    = !!studentAns;

                if (isEssay) {
                  return (
                    <div key={q.id} className="bg-white rounded-2xl border-2 border-purple-200 shadow-sm overflow-hidden">
                      <div className="px-5 py-3 flex items-center gap-3 border-b bg-purple-50 border-purple-100">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-black text-white shadow-sm bg-purple-500">
                          {qi + 1}
                        </div>
                        <div className="flex items-center gap-2 text-xs font-bold">
                          <span className="text-gray-500">{q.points} نقطة</span>
                          <span className="flex items-center gap-1 text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                            <FileText className="w-3 h-3" /> مقالي
                          </span>
                          {!isGraded && (
                            <span className="flex items-center gap-1 text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">
                              <Clock className="w-3 h-3" /> بانتظار التصحيح
                            </span>
                          )}
                          {isGraded && (
                            <span className="flex items-center gap-1 text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                              <CheckCircle className="w-3 h-3" /> تم التصحيح
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="px-5 py-4">
                        <p className="font-bold text-navy-700 text-base leading-relaxed mb-3">{q.question_text}</p>
                        {q.question_image_url && (
                          <img src={q.question_image_url} alt="" className="mt-2 mb-3 max-w-sm rounded-xl border border-gray-200" />
                        )}
                        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                          <p className="text-xs font-bold text-gray-500 mb-2">إجابة الطالب:</p>
                          <p className="text-sm text-gray-700 font-medium leading-relaxed">
                            {studentAns || <span className="italic text-gray-400">لم يُجِب على هذا السؤال</span>}
                          </p>
                        </div>
                        {isTeacher && correctAns && (
                          <div className="mt-3 bg-green-50 rounded-xl p-4 border border-green-200">
                            <p className="text-xs font-bold text-green-600 mb-2">الإجابة النموذجية:</p>
                            <p className="text-sm text-green-800 font-medium leading-relaxed">{correctAns}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={q.id} className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden ${
                    !answered       ? 'border-gray-200'
                    : q.is_correct  ? 'border-green-300'
                    :                  'border-red-300'
                  }`}>
                    {/* Question header */}
                    <div className={`px-5 py-3 flex items-center gap-3 border-b ${
                      !answered       ? 'bg-gray-50 border-gray-100'
                      : q.is_correct  ? 'bg-green-50 border-green-100'
                      :                  'bg-red-50 border-red-100'
                    }`}>
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-black text-white shadow-sm ${
                        !answered ? 'bg-gray-400' : q.is_correct ? 'bg-green-500' : 'bg-red-500'
                      }`}>
                        {qi + 1}
                      </div>
                      <div className="flex items-center gap-2 text-xs font-bold">
                        <span className="text-gray-500">{q.points} نقطة</span>
                        {q.question_type === 'true_false' && (
                          <span className="text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">صح/خطأ</span>
                        )}
                        {!answered && (
                          <span className="flex items-center gap-1 text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                            <Clock className="w-3 h-3" /> لم تُجَب
                          </span>
                        )}
                        {answered && q.is_correct && (
                          <span className="flex items-center gap-1 text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                            <CheckCircle className="w-3 h-3" /> صحيحة ✓
                          </span>
                        )}
                        {answered && !q.is_correct && (
                          <span className="flex items-center gap-1 text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                            <XCircle className="w-3 h-3" /> خاطئة ✗
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Question body */}
                    <div className="px-5 py-4">
                      <p className="font-bold text-navy-700 text-base leading-relaxed mb-1">{q.question_text}</p>
                      {q.question_image_url && (
                        <img src={q.question_image_url} alt="" className="mt-2 mb-3 max-w-sm rounded-xl border border-gray-200" />
                      )}

                      {/* Options */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-4">
                        {OPTS.map(opt => {
                          const text = q[`option_${opt.toLowerCase()}`];
                          if (!text || text === '-') return null;
                          return (
                            <div key={opt}
                              className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all ${optStyle(opt, studentAns, correctAns)}`}>
                              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${optBadge(opt, studentAns, correctAns)}`}>
                                {optLabel[opt]}
                              </span>
                              <span className={`text-sm flex-1 leading-snug ${optTextColor(opt, studentAns, correctAns)}`}>
                                {text}
                              </span>
                              {optIcon(opt, studentAns, correctAns)}
                            </div>
                          );
                        })}
                      </div>

                      {/* Correction note */}
                      {answered && !q.is_correct && (
                        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-semibold bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5">
                          <span className="flex items-center gap-1.5 text-red-700">
                            <XCircle className="w-3.5 h-3.5" />
                            اخترت: <strong>{optLabel[studentAns]} — {q[`option_${studentAns?.toLowerCase()}`] || studentAns}</strong>
                          </span>
                          <span className="flex items-center gap-1.5 text-green-800">
                            <CheckCircle className="w-3.5 h-3.5" />
                            الصحيح: <strong>{optLabel[correctAns]} — {q[`option_${correctAns?.toLowerCase()}`] || correctAns}</strong>
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
  );
}
