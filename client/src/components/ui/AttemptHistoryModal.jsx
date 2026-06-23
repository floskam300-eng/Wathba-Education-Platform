import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { X, CheckCircle, XCircle, Eye, Clock, RotateCcw, Loader2, History } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';

/**
 * Shared modal showing every attempt a student made for a specific exam
 * (latest + archived). Each attempt links to its own review page so neither
 * the teacher nor the student loses access to a previous grade/answers.
 *
 * Props:
 *   examId, studentId, studentName?, examTitle?, onClose
 */
export default function AttemptHistoryModal({ examId, studentId, studentName, examTitle, onClose }) {
  const { dark } = useTheme();
  const navigate = useNavigate();
  const { user } = useAuth();

  const roleBase = user?.role === 'assistant' ? 'assistant'
    : user?.role === 'student' ? 'student' : 'teacher';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['exam-attempts', examId, studentId],
    queryFn: () =>
      api.get(`/exams/results/by-exam-student/${examId}/${studentId}`).then(r => r.data),
    enabled: !!examId && !!studentId,
  });

  const attempts = data?.attempts || [];

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const openReview = (resultId) => {
    onClose();
    navigate(`/${roleBase}/exam-review/${resultId}`);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" dir="rtl">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className={`relative w-full max-w-lg rounded-3xl shadow-2xl flex flex-col overflow-hidden ${
        dark ? 'bg-[var(--dk-surface)] border border-[var(--dk-border)]' : 'bg-white'
      }`} style={{ maxHeight: '88vh' }}>

        {/* Header */}
        <div className={`px-5 py-4 flex items-start justify-between gap-3 border-b ${dark ? 'border-[var(--dk-border)]' : 'border-gray-100'}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-navy-500">
              <History className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className={`font-black text-base leading-tight truncate ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
                سجل المحاولات
              </h2>
              <p className={`text-xs truncate ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
                {examTitle || 'الاختبار'}
                {studentName ? ` — ${studentName}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors border ${
              dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] hover:bg-[var(--dk-border)]'
                   : 'bg-white border-gray-200 hover:bg-gray-100'
            }`}>
            <X className={`w-4 h-4 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className={`w-8 h-8 animate-spin ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-300'}`} />
              <p className={`mt-2 text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>جاري التحميل...</p>
            </div>
          )}

          {isError && (
            <div className="text-center py-10">
              <XCircle className="w-10 h-10 text-red-300 mx-auto mb-2" />
              <p className={`text-sm font-medium ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>تعذّر تحميل المحاولات</p>
            </div>
          )}

          {!isLoading && !isError && attempts.length === 0 && (
            <div className="text-center py-10">
              <History className={`w-10 h-10 mx-auto mb-2 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-300'}`} />
              <p className={`text-sm font-medium ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>لا توجد محاولات مسجّلة</p>
            </div>
          )}

          {!isLoading && !isError && attempts.map((a, idx) => {
            const isAbsent = a.is_absent === true || a.is_absent === 'true';
            const passed = !isAbsent && Number(a.score) >= Number(a.pass_score);
            const pct = (!isAbsent && a.total_score > 0)
              ? Math.round((a.score / a.total_score) * 100) : 0;
            // Use the DB attempt_number (authoritative) rather than the array
            // index — attempts come back DESC, so idx+1 ≠ the real attempt number.
            const attemptNo = Number(a.attempt_number) > 0 ? Number(a.attempt_number) : (idx + 1);

            return (
              <div key={a.id} className={`rounded-2xl border-2 p-4 transition-all ${
                a.is_latest && !isAbsent
                  ? (dark ? 'border-navy-500/60 bg-navy-900/20' : 'border-navy-300 bg-navy-50/40')
                  : (dark ? 'border-[var(--dk-border)] bg-[var(--dk-elevated)]' : 'border-gray-200 bg-gray-50/50')
              }`}>
                <div className="flex items-center gap-3">
                  {/* Attempt index badge */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-black text-white ${
                    isAbsent ? 'bg-gray-400' : passed ? 'bg-green-500' : 'bg-red-500'
                  }`}>
                    {isAbsent ? '—' : attemptNo}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`text-xs font-bold ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
                        المحاولة #{attemptNo}
                      </span>
                      {a.is_latest && !isAbsent && (
                        <span className="text-[10px] bg-navy-100 dark:bg-navy-900/40 text-navy-700 dark:text-navy-300 rounded-full px-1.5 py-0.5 font-black">
                          الأخيرة
                        </span>
                      )}
                      {isAbsent && (
                        <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-black ${dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-gray-100 text-gray-500'}`}>
                          غائب
                        </span>
                      )}
                      {!isAbsent && (
                        <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-black ${
                          passed
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                        }`}>
                          {passed ? 'ناجح' : 'راسب'}
                        </span>
                      )}
                    </div>
                    <div className={`flex items-center gap-3 mt-1 text-[11px] ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(a.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                      {!isAbsent && (
                        <>
                          <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle className="w-3 h-3" /> {a.correct_count}
                          </span>
                          <span className="flex items-center gap-1 text-red-500">
                            <XCircle className="w-3 h-3" /> {a.wrong_count}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Score + review */}
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    {isAbsent ? (
                      <span className={`text-sm font-black ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>غائب</span>
                    ) : (
                      <span className={`text-lg font-black ${passed ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                        {a.score}<span className={`text-[10px] font-semibold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>/{a.total_score}</span>
                      </span>
                    )}
                    {!isAbsent && (
                      <button onClick={() => openReview(a.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors bg-white dark:bg-[var(--dk-surface)] border border-gray-200 dark:border-[var(--dk-border)] hover:border-navy-400 dark:hover:bg-[var(--dk-elevated)] text-navy-700 dark:text-[var(--dk-text)]">
                        <Eye className="w-3 h-3" /> مراجعة
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className={`px-5 py-3 border-t flex justify-between items-center ${dark ? 'border-[var(--dk-border)] bg-[var(--dk-elevated)]' : 'border-gray-100 bg-gray-50'}`}>
          {!isLoading && attempts.length > 0 && (
            <p className={`text-[11px] font-semibold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
              {attempts.filter(a => !(a.is_absent === true || a.is_absent === 'true')).length} محاولة فعلية
            </p>
          )}
          <button onClick={onClose}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold transition-colors ml-auto ${
              dark ? 'bg-[var(--dk-surface)] text-[var(--dk-text)] hover:bg-[var(--dk-border)] border border-[var(--dk-border)]'
                   : 'bg-white text-navy-700 hover:bg-navy-50 border border-gray-200'
            }`}>
            <RotateCcw className="w-3.5 h-3.5" /> إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
