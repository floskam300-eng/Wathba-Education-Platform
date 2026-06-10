import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../context/ThemeContext';
import {
  X, FileText, GraduationCap, CheckCircle2, XCircle,
  Printer, ChevronDown, ChevronUp,
} from 'lucide-react';
import api from '../../lib/api';
import { generatePDFReport } from '../../lib/pdfReport';
import toast from 'react-hot-toast';

const fmt = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
};

const pct = (score, total) => total > 0 ? Math.round((Number(score) / Number(total)) * 100) : 0;

const MiniBar = ({ value, max, color }) => (
  <div className="w-16 h-1.5 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 flex-shrink-0">
    <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, max > 0 ? (value / max) * 100 : 0)}%` }} />
  </div>
);

const StatPill = ({ label, value, color }) => (
  <div className={`flex flex-col items-center justify-center rounded-xl px-3 py-2 min-w-[64px] ${color}`}>
    <span className="text-lg font-black leading-none">{value}</span>
    <span className="text-[10px] font-bold mt-0.5 opacity-80">{label}</span>
  </div>
);

// FIX-F2: removed unused baseRole prop from signature
export default function StudentArchiveModal({ student, onClose }) {
  const { dark } = useTheme();
  const [tab, setTab] = useState('exams');
  const [expandedExam, setExpandedExam] = useState(null);

  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: ['archive-student-summary', student.id],
    queryFn: () => api.get(`/archive/student/${student.id}/summary`).then(r => r.data),
  });

  const { data: examResults, isLoading: examLoading } = useQuery({
    queryKey: ['archive-student-exams', student.id],
    queryFn: () => api.get(`/archive/student/${student.id}/exam-results`).then(r => r.data),
  });

  const { data: recResults, isLoading: recLoading } = useQuery({
    queryKey: ['archive-student-recs', student.id],
    queryFn: () => api.get(`/archive/student/${student.id}/recitation-results`).then(r => r.data),
  });

  const card = dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border)]' : 'bg-white border-gray-100';
  const textPrimary = dark ? 'text-[var(--dk-text-1)]' : 'text-gray-800';
  const textSec = dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500';
  const divider = dark ? 'border-[var(--dk-border)]' : 'border-gray-100';

  const handlePrintExams = () => {
    if (!examResults?.length) { toast.error('لا توجد بيانات'); return; }
    const s = summary?.student;
    generatePDFReport(
      `نتائج اختبارات الطالب: ${student.name}`,
      ['الكورس', 'الاختبار', 'الدرجة', 'النسبة', 'الحالة', 'المحاولة', 'التاريخ'],
      examResults.map(r => [
        r.course_name,
        r.exam_title,
        `${r.score}/${r.total_score}`,
        `${pct(r.score, r.total_score)}%`,
        r.score >= r.pass_score ? 'ناجح' : 'راسب',
        r.attempt_number > 1 ? `إعادة (${r.attempt_number})` : 'أول محاولة',
        fmt(r.created_at),
      ]),
      `student-exams-${student.id}.pdf`,
      {
        subtitle: `المرحلة: ${s?.academic_stage || '—'} | النقاط: ${s?.points || 0}`,
        stats: [
          { label: 'إجمالي الاختبارات', value: summary?.exams?.total_exams || 0, color: '#1e3a5f' },
          { label: 'ناجح', value: summary?.exams?.passed_exams || 0, color: '#16a34a' },
          { label: 'راسب', value: summary?.exams?.failed_exams || 0, color: '#dc2626' },
          { label: 'متوسط الدرجات', value: `${summary?.exams?.avg_score || 0}%`, color: '#7c3aed' },
        ],
      }
    );
  };

  const handlePrintRecs = () => {
    if (!recResults?.length) { toast.error('لا توجد بيانات'); return; }
    const s = summary?.student;
    generatePDFReport(
      `نتائج تسميع الطالب: ${student.name}`,
      ['التسميع', 'الدرجة', 'النسبة', 'الحالة', 'التاريخ'],
      recResults.map(r => [
        r.recitation_title,
        `${r.score}/${r.total_score}`,
        `${pct(r.score, r.total_score)}%`,
        r.passed ? 'ناجح' : 'راسب',
        fmt(r.created_at),
      ]),
      `student-recs-${student.id}.pdf`,
      {
        subtitle: `المرحلة: ${s?.academic_stage || '—'} | النقاط: ${s?.points || 0}`,
        stats: [
          { label: 'إجمالي التسميع', value: summary?.recitations?.total_recitations || 0, color: '#1e3a5f' },
          { label: 'ناجح', value: summary?.recitations?.passed_recitations || 0, color: '#16a34a' },
          { label: 'راسب', value: summary?.recitations?.failed_recitations || 0, color: '#dc2626' },
          { label: 'متوسط الدرجات', value: `${summary?.recitations?.avg_score || 0}%`, color: '#7c3aed' },
        ],
      }
    );
  };

  const exE = summary?.exams;
  const exR = summary?.recitations;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div
        className={`w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl border overflow-hidden ${card}`}
        style={dark ? { background: 'var(--dk-surface)', border: '1px solid var(--dk-border)' } : {}}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b flex-shrink-0 ${divider}`}
          style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #f97316 100%)' }}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-white/25 flex items-center justify-center text-white text-lg font-black flex-shrink-0">
              {student.name?.charAt(0)}
            </div>
            <div>
              <h2 className="text-white font-black text-base leading-tight">{student.name}</h2>
              {summary?.student && (
                <p className="text-white/80 text-xs font-medium mt-0.5">
                  {summary.student.academic_stage || '—'} · {summary.student.username}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary Stats */}
        {!sumLoading && summary && (
          <div className={`grid grid-cols-2 gap-3 px-5 py-4 border-b flex-shrink-0 ${divider} ${dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-50'}`}>
            {/* Exams stats */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <FileText className="w-3.5 h-3.5 text-orange-500" />
                <p className={`text-xs font-black ${textPrimary}`}>الاختبارات</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <StatPill label="إجمالي" value={exE?.total_exams || 0} color={dark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-700'} />
                <StatPill label="ناجح" value={exE?.passed_exams || 0} color={dark ? 'bg-green-900/40 text-green-300' : 'bg-green-50 text-green-700'} />
                <StatPill label="راسب" value={exE?.failed_exams || 0} color={dark ? 'bg-red-900/40 text-red-300' : 'bg-red-50 text-red-700'} />
                <StatPill label="متوسط" value={`${exE?.avg_score || 0}%`} color={dark ? 'bg-purple-900/40 text-purple-300' : 'bg-purple-50 text-purple-700'} />
              </div>
            </div>
            {/* Recitations stats */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <GraduationCap className="w-3.5 h-3.5 text-purple-500" />
                <p className={`text-xs font-black ${textPrimary}`}>التسميع</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <StatPill label="إجمالي" value={exR?.total_recitations || 0} color={dark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-700'} />
                <StatPill label="ناجح" value={exR?.passed_recitations || 0} color={dark ? 'bg-green-900/40 text-green-300' : 'bg-green-50 text-green-700'} />
                <StatPill label="راسب" value={exR?.failed_recitations || 0} color={dark ? 'bg-red-900/40 text-red-300' : 'bg-red-50 text-red-700'} />
                <StatPill label="متوسط" value={`${exR?.avg_score || 0}%`} color={dark ? 'bg-purple-900/40 text-purple-300' : 'bg-purple-50 text-purple-700'} />
              </div>
            </div>
          </div>
        )}

        {/* Tabs + Print */}
        <div className={`flex items-center justify-between px-5 py-3 border-b flex-shrink-0 ${divider}`}>
          <div className={`flex rounded-xl p-0.5 gap-0.5 ${dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-100'}`}>
            <button
              onClick={() => setTab('exams')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === 'exams'
                ? 'bg-orange-500 text-white shadow-sm'
                : (dark ? 'text-[var(--dk-text-2)] hover:text-[var(--dk-text-1)]' : 'text-gray-500 hover:text-gray-700')
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              الاختبارات
              {examResults && (
                <span className={`text-[10px] px-1 rounded font-black ${tab === 'exams' ? 'bg-white/25' : (dark ? 'bg-[var(--dk-surface)]' : 'bg-white')}`}>
                  {examResults.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab('recitations')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === 'recitations'
                ? 'bg-purple-600 text-white shadow-sm'
                : (dark ? 'text-[var(--dk-text-2)] hover:text-[var(--dk-text-1)]' : 'text-gray-500 hover:text-gray-700')
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              التسميع
              {recResults && (
                <span className={`text-[10px] px-1 rounded font-black ${tab === 'recitations' ? 'bg-white/25' : (dark ? 'bg-[var(--dk-surface)]' : 'bg-white')}`}>
                  {recResults.length}
                </span>
              )}
            </button>
          </div>
          <button
            onClick={tab === 'exams' ? handlePrintExams : handlePrintRecs}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${tab === 'exams'
              ? 'bg-orange-500 hover:bg-orange-600 text-white'
              : 'bg-purple-600 hover:bg-purple-700 text-white'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            طباعة التقرير الفردي
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'exams' && (
            examLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin w-6 h-6 border-4 border-orange-500 border-t-transparent rounded-full" />
              </div>
            ) : !examResults?.length ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <FileText className="w-10 h-10 text-gray-300" />
                <p className="text-sm font-bold text-gray-400">لا توجد نتائج اختبارات</p>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                {examResults.map(r => {
                  const p = pct(r.score, r.total_score);
                  // FIX-F5: Explicit Number() conversion for type-safe comparison
                  const passed = Number(r.score) >= Number(r.pass_score);
                  const isExpanded = expandedExam === r.id;

                  return (
                    <div
                      key={r.id}
                      className={`rounded-xl border overflow-hidden transition-all ${dark ? 'border-[var(--dk-border)]' : 'border-gray-100'} ${passed ? (dark ? 'border-l-2 border-l-green-500' : 'border-l-2 border-l-green-400') : (dark ? 'border-l-2 border-l-red-500' : 'border-l-2 border-l-red-400')}`}
                    >
                      <button
                        onClick={() => setExpandedExam(isExpanded ? null : r.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-right transition-colors ${dark ? 'hover:bg-[var(--dk-elevated)]' : 'hover:bg-gray-50'}`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-black ${passed ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                          {passed ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0 text-right">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-xs font-black truncate ${textPrimary}`}>{r.exam_title}</p>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-gray-100 text-gray-500'}`}>
                              {r.course_name}
                            </span>
                            {r.attempt_number > 1 && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${dark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-600'}`}>
                                إعادة {r.attempt_number}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <div className="flex items-center gap-1.5">
                              {/* FIX-F1: removed undeclared `pending` variable — was causing ReferenceError crash */}
                              <MiniBar value={r.score} max={r.total_score} color={passed ? 'bg-green-500' : 'bg-red-500'} />
                              <span className={`text-[10px] font-bold ${passed ? 'text-green-600' : 'text-red-500'}`}>{p}%</span>
                            </div>
                            <span className={`text-[10px] ${textSec}`}>{fmt(r.created_at)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-xs font-black ${passed ? 'text-green-500' : 'text-red-500'}`}>
                            {r.score}/{r.total_score}
                          </span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className={`px-4 pb-3 border-t ${divider} ${dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-50'}`}>
                          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 pt-3">
                            {[
                              { label: 'صحيح', value: r.correct_count, color: 'text-green-500' },
                              { label: 'خطأ', value: r.wrong_count, color: 'text-red-500' },
                              { label: 'لم يجب', value: r.unanswered_count, color: 'text-gray-400' },
                              { label: 'درجة النجاح', value: r.pass_score, color: textSec },
                              { label: 'النقاط المكتسبة', value: r.points_earned || 0, color: 'text-amber-500' },
                            ].map(({ label, value, color }) => (
                              <div key={label} className={`text-center rounded-lg p-2 ${dark ? 'bg-[var(--dk-surface)]' : 'bg-white'} border ${dark ? 'border-[var(--dk-border)]' : 'border-gray-100'}`}>
                                <p className={`text-sm font-black ${color}`}>{value}</p>
                                <p className={`text-[10px] font-bold ${textSec} mt-0.5`}>{label}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}

          {tab === 'recitations' && (
            recLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin w-6 h-6 border-4 border-purple-500 border-t-transparent rounded-full" />
              </div>
            ) : !recResults?.length ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <GraduationCap className="w-10 h-10 text-gray-300" />
                <p className="text-sm font-bold text-gray-400">لا توجد نتائج تسميع</p>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                {recResults.map(r => {
                  const p = pct(r.score, r.total_score);
                  return (
                    <div
                      key={r.id}
                      className={`rounded-xl border px-4 py-3 flex items-center gap-3 transition-colors ${dark ? 'border-[var(--dk-border)] hover:bg-[var(--dk-elevated)]' : 'border-gray-100 hover:bg-purple-50/30'} ${r.passed ? (dark ? 'border-l-2 border-l-green-500' : 'border-l-2 border-l-green-400') : (dark ? 'border-l-2 border-l-red-500' : 'border-l-2 border-l-red-400')}`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${r.passed ? 'bg-green-500' : 'bg-red-500'} text-white`}>
                        {r.passed ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-black ${textPrimary}`}>{r.recitation_title}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <div className="flex items-center gap-1.5">
                            <MiniBar value={r.score} max={r.total_score} color={r.passed ? 'bg-green-500' : 'bg-red-500'} />
                            <span className={`text-[10px] font-bold ${r.passed ? 'text-green-600' : 'text-red-500'}`}>{p}%</span>
                          </div>
                          <span className={`text-[10px] ${textSec}`}>{fmt(r.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                        <span className={`text-xs font-black ${r.passed ? 'text-green-500' : 'text-red-500'}`}>
                          {r.score}/{r.total_score}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] ${textSec}`}>صح: {r.correct_count}</span>
                          <span className={`text-[10px] text-red-400`}>خطأ: {r.wrong_count}</span>
                        </div>
                        {(r.points_earned > 0) && (
                          <span className="text-[10px] text-amber-500 font-bold">+{r.points_earned} نقطة</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
