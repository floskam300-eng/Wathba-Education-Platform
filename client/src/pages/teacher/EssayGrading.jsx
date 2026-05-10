import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { PenLine, ChevronDown, ChevronUp, CheckCircle, Clock, User, FileText, Save, Loader2, AlertCircle, BookOpen } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

function ScoreInput({ value, max, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number" min={0} max={max} value={value}
        onChange={e => onChange(Math.min(max, Math.max(0, parseInt(e.target.value) || 0)))}
        className="w-16 text-center border-2 border-orange-300 rounded-lg py-1 font-black text-orange-700 text-sm focus:outline-none focus:border-orange-500"
      />
      <span className="text-xs text-gray-500">/ {max} درجة</span>
    </div>
  );
}

function ResultCard({ item, onGraded }) {
  const [open, setOpen] = useState(false);
  const [scores, setScores] = useState({});
  const qc = useQueryClient();

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['essay-detail', item.id],
    queryFn: () => api.get(`/exams/results/${item.id}/essay-detail`).then(r => r.data),
    enabled: open,
  });

  const gradeMut = useMutation({
    mutationFn: () => api.put(`/exams/results/${item.id}/grade-essay`, { essay_scores: scores }),
    onSuccess: () => {
      toast.success('تم حفظ التصحيح بنجاح');
      qc.invalidateQueries(['essay-pending']);
      onGraded?.();
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const handleSubmit = () => {
    if (!detail?.essay_questions?.length) return;
    const ungraded = detail.essay_questions.filter(q => scores[q.id] === undefined);
    if (ungraded.length) {
      toast.error('يرجى إدخال درجة لجميع الأسئلة المقالية');
      return;
    }
    gradeMut.mutate();
  };

  const totalAwarded = Object.values(scores).reduce((s, v) => s + (v || 0), 0);
  const maxEssayPoints = detail?.essay_questions?.reduce((s, q) => s + q.points, 0) || 0;

  const passPercent = item.total_score > 0 ? Math.round((item.pass_score / item.total_score) * 100) : 50;
  const currentPercent = item.total_score > 0 ? Math.round((item.score / item.total_score) * 100) : 0;

  return (
    <div className="card !p-0 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-right"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
            <User className="w-5 h-5 text-orange-600" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-navy-700 text-sm">{item.student_name}</p>
            <p className="text-xs text-gray-500 truncate">{item.exam_title}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-left hidden sm:block">
            <p className="text-xs text-gray-400">الدرجة الحالية</p>
            <p className="font-bold text-sm" style={{ color: currentPercent >= passPercent ? '#16a34a' : '#dc2626' }}>
              {item.score} / {item.total_score}
            </p>
          </div>
          <span className="text-xs bg-amber-100 text-amber-700 font-bold px-2 py-1 rounded-full">
            في انتظار التصحيح
          </span>
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 p-4 space-y-4 bg-gray-50">
          {detailLoading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">جاري التحميل...</span>
            </div>
          ) : detail?.essay_questions?.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">لا توجد أسئلة مقالية</div>
          ) : (
            <>
              <div className="space-y-4">
                {detail?.essay_questions?.map((q, qi) => (
                  <div key={q.id} className="bg-white rounded-xl p-4 border border-gray-200 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-xs font-bold text-gray-400 mb-1">السؤال {qi + 1}</p>
                        {q.question_text && (
                          <p className="font-semibold text-navy-700 text-sm">{q.question_text}</p>
                        )}
                        {q.question_image_url && (
                          <img src={q.question_image_url} alt="question" className="mt-2 max-h-40 rounded-lg object-contain border border-gray-200" />
                        )}
                      </div>
                      <span className="text-xs bg-navy-100 text-navy-700 font-bold px-2 py-1 rounded-full flex-shrink-0">
                        {q.points} درجة
                      </span>
                    </div>

                    {q.essay_answer_key && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <p className="text-xs font-bold text-green-700 mb-1">نموذج الإجابة:</p>
                        <p className="text-sm text-green-800">{q.essay_answer_key}</p>
                      </div>
                    )}

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs font-bold text-blue-700 mb-1">إجابة الطالب:</p>
                      {q.student_answer ? (
                        <p className="text-sm text-blue-800 leading-relaxed">{q.student_answer}</p>
                      ) : (
                        <p className="text-sm text-gray-400 italic">لم يجب الطالب على هذا السؤال</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-gray-600">الدرجة الممنوحة:</p>
                      <ScoreInput
                        value={scores[q.id] ?? 0}
                        max={q.points}
                        onChange={val => setScores(prev => ({ ...prev, [q.id]: val }))}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-xl p-4 border border-orange-200 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">إجمالي درجات التصحيح</p>
                  <p className="font-black text-orange-700 text-lg">{totalAwarded} / {maxEssayPoints} درجة</p>
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={gradeMut.isPending}
                  className="btn-primary flex items-center gap-2"
                >
                  {gradeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  حفظ التصحيح
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function EssayGrading() {
  const { user } = useAuth();
  const canGrade = user?.role === 'teacher' || user?.can_manage_exams;

  const { data: pending = [], isLoading } = useQuery({
    queryKey: ['essay-pending'],
    queryFn: () => api.get('/exams/essay-pending').then(r => r.data),
    refetchInterval: 30000,
  });

  if (!canGrade) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <AlertCircle className="w-12 h-12 mb-3 text-red-300" />
        <p className="font-semibold">ليس لديك صلاحية الوصول لهذه الصفحة</p>
      </div>
    );
  }

  const grouped = pending.reduce((acc, item) => {
    const key = item.exam_title;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-navy-600 flex items-center gap-2">
          <PenLine className="w-7 h-7 text-orange-500" />
          تصحيح الامتحانات المقالية
          {pending.length > 0 && (
            <span className="bg-orange-500 text-white text-sm font-black px-2.5 py-0.5 rounded-full">
              {pending.length}
            </span>
          )}
        </h1>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card h-20 animate-pulse bg-gray-100" />
          ))}
        </div>
      ) : pending.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h3 className="font-black text-navy-700 text-lg mb-1">لا توجد امتحانات تحتاج تصحيحاً</h3>
          <p className="text-gray-400 text-sm">جميع الإجابات المقالية تم تصحيحها</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([examTitle, items]) => (
            <div key={examTitle}>
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-4 h-4 text-navy-500" />
                <h2 className="font-bold text-navy-700 text-sm">{examTitle}</h2>
                <span className="text-xs bg-navy-100 text-navy-600 font-bold px-2 py-0.5 rounded-full">
                  {items.length} طالب
                </span>
              </div>
              <div className="space-y-3">
                {items.map(item => (
                  <ResultCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
