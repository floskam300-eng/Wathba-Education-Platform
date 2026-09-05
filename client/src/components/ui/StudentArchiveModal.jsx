import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../context/ThemeContext';
import {
  X, FileText, GraduationCap, CheckCircle2, XCircle,
  Printer, ChevronDown, ChevronUp, Eye, Clock, FileSpreadsheet
} from 'lucide-react';
import api from '../../lib/api';
import { generatePDFReport } from '../../lib/pdfReport';
import { generateExcelReport } from '../../lib/excelReport';
import { formatDuration } from '../../lib/format';
import toast from 'react-hot-toast';
import ExamReviewModal from './ExamReviewModal';
import RecitationReviewModal from './RecitationReviewModal';

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

// mode: 'exams' | 'recitations' | 'both'
// When mode is 'exams' or 'recitations', only that tab is shown (no tab switcher).
export default function StudentArchiveModal({ student, onClose, mode = 'both' }) {
  const { dark } = useTheme();
  const [tab, setTab] = useState(mode === 'recitations' ? 'recitations' : 'exams');
  const [expandedExam, setExpandedExam] = useState(null);
  const [expandedRec, setExpandedRec] = useState(null);
  const [reviewResultId, setReviewResultId] = useState(null);
  const [recReviewResultId, setRecReviewResultId] = useState(null);

  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: ['archive-student-summary', student.id],
    queryFn: () => api.get(`/archive/student/${student.id}/summary`).then(r => r.data),
  });

  const { data: examResults, isLoading: examLoading } = useQuery({
    queryKey: ['archive-student-exams', student.id],
    queryFn: () => api.get(`/archive/student/${student.id}/exam-results`).then(r => r.data),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: recResults, isLoading: recLoading } = useQuery({
    queryKey: ['archive-student-recs', student.id],
    queryFn: () => api.get(`/archive/student/${student.id}/recitation-results`).then(r => r.data),
  });

  const card = dark ? 'bg-[var(--dk-surface)] border-[var(--dk-border)]' : 'bg-white border-gray-100';
  const textPrimary = dark ? 'text-[var(--dk-text-1)]' : 'text-gray-800';
  const textSec = dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500';
  const divider = dark ? 'border-[var(--dk-border)]' : 'border-gray-100';

  const examRows = examResults?.map(r => {
    const isAbsent = r.is_absent === true || r.is_absent === 'true';
    return [
      r.course_name,
      r.exam_title,
      isAbsent ? 'غائب' : `${r.score}/${r.total_score}`,
      isAbsent ? '—' : `${pct(r.score, r.total_score)}%`,
      isAbsent ? 'غائب' : Number(r.score) >= Number(r.pass_score) ? 'ناجح' : 'راسب',
      isAbsent ? '—' : r.attempt_number > 1 ? `إعادة (${r.attempt_number})` : 'أول محاولة',
      isAbsent ? '—' : formatDuration(r),
      isAbsent ? '—' : `${r.correct_count} صح / ${r.wrong_count} خطأ / ${r.unanswered_count} بلا إجابة`,
      isAbsent ? '—' : r.points_earned > 0 ? `+${r.points_earned}` : '—',
      fmt(r.created_at),
    ];
  }) || [];

  const recRows = recResults?.map(r => {
    const isAbsent = r.is_absent === true || r.is_absent === 'true';
    const attemptNum = Number(r.attempt_number) || 1;
    return [
      r.recitation_title,
      isAbsent ? 'غائب' : `${r.score}/${r.total_score}`,
      isAbsent ? '—' : `${pct(r.score, r.total_score)}%`,
      isAbsent ? 'غائب' : r.passed ? 'ناجح' : 'راسب',
      isAbsent ? '—' : attemptNum > 1 ? `إعادة (${attemptNum})` : 'أول محاولة',
      isAbsent ? '—' : formatDuration(r),
      isAbsent ? '—' : `${r.correct_count} صح / ${r.wrong_count} خطأ`,
      isAbsent ? '—' : r.points_earned > 0 ? `+${r.points_earned}` : '—',
      fmt(r.created_at),
    ];
  }) || [];

  const handlePrintFull = () => {
    const hasExams = examRows.length > 0;
    const hasRecs  = recRows.length > 0;
    if (!hasExams && !hasRecs) { toast.error('لا توجد بيانات للطباعة'); return; }
    const s = summary?.student;
    const subtitle = `المرحلة: ${s?.academic_stage || '—'} | كود الدخول: ${s?.username || '—'} | النقاط: ${s?.points || 0}`;
    generatePDFReport(
      `التقرير الكامل للطالب: ${student.name}`,
      [], [], `student-full-${student.id}.pdf`,
      {
        subtitle,
        stats: [
          { label: 'الاختبارات',       value: summary?.exams?.total_exams || 0,          color: '#f97316' },
          { label: 'ناجح (اختبارات)', value: summary?.exams?.passed_exams || 0,          color: '#16a34a' },
          { label: 'متوسط الاختبارات',value: `${summary?.exams?.avg_score || 0}%`,        color: '#7c3aed' },
          { label: 'التسميع',          value: summary?.recitations?.total_recitations || 0, color: '#3b82f6' },
          { label: 'ناجح (تسميع)',    value: summary?.recitations?.passed_recitations || 0, color: '#16a34a' },
          { label: 'متوسط التسميع',   value: `${summary?.recitations?.avg_score || 0}%`,   color: '#8b5cf6' },
        ],
        sections: [
          {
            title: '📄 نتائج الاختبارات',
            headers: ['الكورس', 'الاختبار', 'الدرجة', 'النسبة', 'الحالة', 'المحاولة', 'المدة', 'الإجابات', 'النقاط', 'التاريخ'],
            data: examRows,
          },
          {
            title: '📚 نتائج التسميع',
            headers: ['التسميع', 'الدرجة', 'النسبة', 'الحالة', 'المحاولة', 'المدة', 'الإجابات', 'النقاط', 'التاريخ'],
            data: recRows,
          },
        ],
      }
    );
  };

  const handlePrintExams = () => {
    if (!examRows.length) { toast.error('لا توجد بيانات'); return; }
    const s = summary?.student;
    generatePDFReport(
      `نتائج اختبارات الطالب: ${student.name}`,
      ['الكورس', 'الاختبار', 'الدرجة', 'النسبة', 'الحالة', 'المحاولة', 'المدة', 'الإجابات', 'النقاط', 'التاريخ'],
      examRows,
      `student-exams-${student.id}.pdf`,
      {
        subtitle: `المرحلة: ${s?.academic_stage || '—'} | كود: ${s?.username || '—'} | النقاط: ${s?.points || 0}`,
        stats: [
          { label: 'إجمالي الاختبارات', value: summary?.exams?.total_exams || 0,  color: '#1e3a5f' },
          { label: 'ناجح',              value: summary?.exams?.passed_exams || 0,  color: '#16a34a' },
          { label: 'راسب',              value: summary?.exams?.failed_exams || 0,  color: '#dc2626' },
          { label: 'متوسط الدرجات',    value: `${summary?.exams?.avg_score || 0}%`, color: '#7c3aed' },
        ],
      }
    );
  };

  const handlePrintRecs = () => {
    if (!recRows.length) { toast.error('لا توجد بيانات'); return; }
    const s = summary?.student;
    generatePDFReport(
      `نتائج تسميع الطالب: ${student.name}`,
      ['التسميع', 'الدرجة', 'النسبة', 'الحالة', 'المحاولة', 'المدة', 'الإجابات', 'النقاط', 'التاريخ'],
      recRows,
      `student-recs-${student.id}.pdf`,
      {
        subtitle: `المرحلة: ${s?.academic_stage || '—'} | كود: ${s?.username || '—'} | النقاط: ${s?.points || 0}`,
        stats: [
          { label: 'إجمالي التسميع', value: summary?.recitations?.total_recitations || 0,  color: '#1e3a5f' },
          { label: 'ناجح',           value: summary?.recitations?.passed_recitations || 0,  color: '#16a34a' },
          { label: 'راسب',           value: summary?.recitations?.failed_recitations || 0,  color: '#dc2626' },
          { label: 'متوسط الدرجات', value: `${summary?.recitations?.avg_score || 0}%`,        color: '#7c3aed' },
        ],
      }
    );
  };

  // Export Full Student History (Multi-sheet Excel)
  const handleExportExcelFull = async () => {
    const hasExams = examRows.length > 0;
    const hasRecs  = recRows.length > 0;
    if (!hasExams && !hasRecs) { toast.error('لا توجد بيانات للتصدير'); return; }
    try {
      toast.loading('جاري تجهيز ملف Excel...', { id: 'st-excel-full' });
      const s = summary?.student;
      const subtitle = `المرحلة: ${s?.academic_stage || '—'} | كود الدخول: ${s?.username || '—'} | النقاط: ${s?.points || 0}`;

      await generateExcelReport(
        `التقرير الكامل للطالب: ${student.name}`,
        [],
        [],
        `student-full-${student.id}.xlsx`,
        {
          subtitle,
          stats: [
            { label: 'الاختبارات',       value: summary?.exams?.total_exams || 0 },
            { label: 'ناجح (اختبارات)', value: summary?.exams?.passed_exams || 0 },
            { label: 'متوسط الاختبارات',value: `${summary?.exams?.avg_score || 0}%` },
            { label: 'التسميع',          value: summary?.recitations?.total_recitations || 0 },
            { label: 'ناجح (تسميع)',    value: summary?.recitations?.passed_recitations || 0 },
            { label: 'متوسط التسميع',   value: `${summary?.recitations?.avg_score || 0}%` },
          ],
          sections: [
            {
              title: `نتائج الاختبارات — الطالب: ${student.name}`,
              sheetName: 'الاختبارات',
              headers: ['الكورس', 'الاختبار', 'الدرجة', 'النسبة', 'الحالة', 'المحاولة', 'المدة', 'الإجابات', 'النقاط', 'التاريخ'],
              data: examRows,
            },
            {
              title: `نتائج التسميع — الطالب: ${student.name}`,
              sheetName: 'التسميع',
              headers: ['التسميع', 'الدرجة', 'النسبة', 'الحالة', 'المحاولة', 'المدة', 'الإجابات', 'النقاط', 'التاريخ'],
              data: recRows,
            },
          ],
          note: `تقرير صادر آلياً من منصة وثبة التعليمية للطالب ${student.name}.`,
        }
      );
      toast.dismiss('st-excel-full');
      toast.success('تم تصدير ملف Excel الشامل للطالب بنجاح');
    } catch (err) {
      toast.dismiss('st-excel-full');
      toast.error('حدث خطأ أثناء تصدير ملف Excel');
    }
  };

  // Export Exams to Excel
  const handleExportExcelExams = async () => {
    if (!examRows.length) { toast.error('لا توجد بيانات للاختبارات'); return; }
    try {
      toast.loading('جاري تجهيز ملف Excel...', { id: 'st-excel-exams' });
      const s = summary?.student;
      await generateExcelReport(
        `نتائج اختبارات الطالب: ${student.name}`,
        ['الكورس', 'الاختبار', 'الدرجة', 'النسبة', 'الحالة', 'المحاولة', 'المدة', 'الإجابات', 'النقاط', 'التاريخ'],
        examRows,
        `student-exams-${student.id}.xlsx`,
        {
          subtitle: `المرحلة: ${s?.academic_stage || '—'} | كود: ${s?.username || '—'} | النقاط: ${s?.points || 0}`,
          sheetName: 'نتائج الاختبارات',
          stats: [
            { label: 'إجمالي الاختبارات', value: summary?.exams?.total_exams || 0 },
            { label: 'ناجح',              value: summary?.exams?.passed_exams || 0 },
            { label: 'راسب',              value: summary?.exams?.failed_exams || 0 },
            { label: 'متوسط الدرجات',    value: `${summary?.exams?.avg_score || 0}%` },
          ],
          note: `سجل اختبارات الطالب ${student.name}.`,
        }
      );
      toast.dismiss('st-excel-exams');
      toast.success('تم تصدير ملف Excel للاختبارات بنجاح');
    } catch (err) {
      toast.dismiss('st-excel-exams');
      toast.error('حدث خطأ أثناء تصدير ملف Excel');
    }
  };

  // Export Recitations to Excel
  const handleExportExcelRecs = async () => {
    if (!recRows.length) { toast.error('لا توجد بيانات للتسميع'); return; }
    try {
      toast.loading('جاري تجهيز ملف Excel...', { id: 'st-excel-recs' });
      const s = summary?.student;
      await generateExcelReport(
        `نتائج تسميع الطالب: ${student.name}`,
        ['التسميع', 'الدرجة', 'النسبة', 'الحالة', 'المحاولة', 'المدة', 'الإجابات', 'النقاط', 'التاريخ'],
        recRows,
        `student-recs-${student.id}.xlsx`,
        {
          subtitle: `المرحلة: ${s?.academic_stage || '—'} | كود: ${s?.username || '—'} | النقاط: ${s?.points || 0}`,
          sheetName: 'نتائج التسميع',
          stats: [
            { label: 'إجمالي التسميع', value: summary?.recitations?.total_recitations || 0 },
            { label: 'ناجح',           value: summary?.recitations?.passed_recitations || 0 },
            { label: 'راسب',           value: summary?.recitations?.failed_recitations || 0 },
            { label: 'متوسط الدرجات', value: `${summary?.recitations?.avg_score || 0}%` },
          ],
          note: `سجل تسميع الطالب ${student.name}.`,
        }
      );
      toast.dismiss('st-excel-recs');
      toast.success('تم تصدير ملف Excel للتسميع بنجاح');
    } catch (err) {
      toast.dismiss('st-excel-recs');
      toast.error('حدث خطأ أثناء تصدير ملف Excel');
    }
  };

  const exE = summary?.exams;
  const exR = summary?.recitations;

  return (
    <>
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
            className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary Stats — shows only relevant section based on active tab */}
        {!sumLoading && summary && (
          <div className={`px-5 py-4 border-b flex-shrink-0 ${divider} ${dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-50'}`}>
            {tab === 'exams' ? (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <FileText className="w-3.5 h-3.5 text-orange-500" />
                  <p className={`text-xs font-black ${textPrimary}`}>إحصائيات الاختبارات</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <StatPill label="إجمالي" value={exE?.total_exams || 0} color={dark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-700'} />
                  <StatPill label="ناجح" value={exE?.passed_exams || 0} color={dark ? 'bg-green-900/40 text-green-300' : 'bg-green-50 text-green-700'} />
                  <StatPill label="راسب" value={exE?.failed_exams || 0} color={dark ? 'bg-red-900/40 text-red-300' : 'bg-red-50 text-red-700'} />
                  {Number(exE?.absent_exams) > 0 && (
                    <StatPill label="غائب" value={exE.absent_exams} color={dark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-500'} />
                  )}
                  <StatPill label="متوسط" value={`${exE?.avg_score || 0}%`} color={dark ? 'bg-orange-950/40 text-orange-300' : 'bg-orange-50 text-orange-700'} />
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <GraduationCap className="w-3.5 h-3.5 text-orange-500" />
                  <p className={`text-xs font-black ${textPrimary}`}>إحصائيات التسميع</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <StatPill label="إجمالي" value={exR?.total_recitations || 0} color={dark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-700'} />
                  <StatPill label="ناجح" value={exR?.passed_recitations || 0} color={dark ? 'bg-green-900/40 text-green-300' : 'bg-green-50 text-green-700'} />
                  <StatPill label="راسب" value={exR?.failed_recitations || 0} color={dark ? 'bg-red-900/40 text-red-300' : 'bg-red-50 text-red-700'} />
                  <StatPill label="متوسط" value={`${exR?.avg_score || 0}%`} color={dark ? 'bg-orange-950/40 text-orange-300' : 'bg-orange-50 text-orange-700'} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tabs + Export / Print Actions */}
        <div className={`flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b flex-shrink-0 ${divider}`}>
          {/* When mode is fixed, show a plain label instead of a tab switcher */}
          {mode === 'both' ? (
            <div className={`flex rounded-xl p-0.5 gap-0.5 ${dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-100'}`}>
              <button
                onClick={() => setTab('exams')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${tab === 'exams'
                  ? 'bg-amber-500 text-navy-900 font-bold shadow-sm'
                  : (dark ? 'text-[var(--dk-text-2)] hover:text-[var(--dk-text-1)]' : 'text-gray-500 hover:text-gray-700')
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                الاختبارات
                {examResults && (
                  <span className={`text-[10px] px-1 rounded font-black ${tab === 'exams' ? 'bg-navy-900/15 text-navy-900' : (dark ? 'bg-[var(--dk-surface)]' : 'bg-white')}`}>
                    {examResults.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setTab('recitations')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${tab === 'recitations'
                  ? 'bg-navy-700 text-white shadow-sm'
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
          ) : (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold ${mode === 'exams' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300' : 'bg-navy-100 text-navy-600 dark:bg-navy-900/30 dark:text-navy-300'}`}>
              {mode === 'exams'
                ? <><FileText className="w-3.5 h-3.5" />نتائج الاختبارات{examResults && <span className="font-black">({examResults.length})</span>}</>
                : <><GraduationCap className="w-3.5 h-3.5" />نتائج التسميع{recResults && <span className="font-black">({recResults.length})</span>}</>
              }
            </div>
          )}
          {mode === 'both' ? (
            <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
              {/* Tab specific export */}
              <button
                onClick={tab === 'exams' ? handleExportExcelExams : handleExportExcelRecs}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all border border-emerald-600/40 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer"
                title={tab === 'exams' ? 'تصدير نتائج الاختبارات إلى Excel' : 'تصدير نتائج التسميع إلى Excel'}
              >
                <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                {tab === 'exams' ? 'Excel اختبارات' : 'Excel تسميع'}
              </button>
              <button
                onClick={tab === 'exams' ? handlePrintExams : handlePrintRecs}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all border cursor-pointer ${
                  tab === 'exams'
                    ? (dark ? 'border-orange-700 text-orange-300 hover:bg-orange-900/30' : 'border-orange-200 text-orange-600 hover:bg-orange-50')
                    : (dark ? 'border-navy-700 text-navy-300 hover:bg-navy-900/30' : 'border-navy-200 text-navy-600 hover:bg-navy-50')
                }`}
                title={tab === 'exams' ? 'طباعة تقرير الاختبارات بصيغة PDF' : 'طباعة تقرير التسميع بصيغة PDF'}
              >
                <Printer className="w-3 h-3" />
                {tab === 'exams' ? 'PDF اختبارات' : 'PDF تسميع'}
              </button>

              {/* Full student report buttons */}
              <button
                onClick={handleExportExcelFull}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-sm cursor-pointer"
                title="تصدير السجل الشامل للطالب (شامل الاختبارات والتسميع) إلى ملف Excel"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Excel شامل
              </button>
              <button
                onClick={handlePrintFull}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-navy-900 transition-all shadow-sm cursor-pointer active:scale-95"
                title="طباعة التقرير الشامل للطالب بصيغة PDF"
              >
                <Printer className="w-3.5 h-3.5" />
                PDF شامل
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={tab === 'exams' ? handleExportExcelExams : handleExportExcelRecs}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-sm cursor-pointer"
                title="تصدير النتائج إلى ملف Excel"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                تصدير Excel
              </button>
              <button
                onClick={tab === 'exams' ? handlePrintExams : handlePrintRecs}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${tab === 'exams'
                  ? 'bg-amber-500 hover:bg-amber-600 text-navy-900 shadow-sm active:scale-95'
                  : 'bg-navy-700 hover:bg-navy-800 text-white'
                }`}
                title="طباعة التقرير بصيغة PDF"
              >
                <Printer className="w-3.5 h-3.5" />
                طباعة PDF
              </button>
            </div>
          )}
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
                  const passed = Number(r.score) >= Number(r.pass_score);
                  const isExpanded = expandedExam === r.id;

                  const isAbsent = r.is_absent === true || r.is_absent === 'true';
                  const borderClass = isAbsent
                    ? (dark ? 'border-l-2 border-l-gray-500' : 'border-l-2 border-l-gray-400')
                    : passed
                      ? (dark ? 'border-l-2 border-l-green-500' : 'border-l-2 border-l-green-400')
                      : (dark ? 'border-l-2 border-l-red-500' : 'border-l-2 border-l-red-400');

                  return (
                    <div
                      key={r.id}
                      className={`rounded-xl border overflow-hidden transition-all ${dark ? 'border-[var(--dk-border)]' : 'border-gray-100'} ${borderClass}`}
                    >
                      <button
                        onClick={() => !isAbsent && setExpandedExam(isExpanded ? null : r.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-right transition-colors ${isAbsent ? 'cursor-default' : (dark ? 'hover:bg-[var(--dk-elevated)]' : 'hover:bg-gray-50')} cursor-pointer`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-black ${isAbsent ? 'bg-gray-400 text-white' : passed ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                          {isAbsent ? <Clock className="w-4 h-4" /> : passed ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0 text-right">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-xs font-black truncate ${textPrimary}`}>{r.exam_title}</p>
                            {r.course_name && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-gray-100 text-gray-500'}`}>
                                {r.course_name}
                              </span>
                            )}
                            {isAbsent && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-gray-100 text-gray-500">
                                غائب
                              </span>
                            )}
                            {!isAbsent && !r.is_latest && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${dark ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-50 text-amber-600'}`}>
                                محاولة قديمة
                              </span>
                            )}
                            {!isAbsent && r.attempt_number > 1 && r.is_latest && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${dark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-600'}`}>
                                إعادة {r.attempt_number}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            {!isAbsent && (
                              <div className="flex items-center gap-1.5">
                                <MiniBar value={r.score} max={r.total_score} color={passed ? 'bg-green-500' : 'bg-red-500'} />
                                <span className={`text-[10px] font-bold ${passed ? 'text-green-600' : 'text-red-500'}`}>{p}%</span>
                              </div>
                            )}
                            <span className={`text-[10px] flex items-center gap-1 ${textSec}`} title="وقت أداء المحاولة">
                              <Clock className="w-2.5 h-2.5" />
                              {formatDuration(r)}
                            </span>
                            <span className={`text-[10px] ${textSec}`}>{fmt(r.created_at)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-xs font-black ${isAbsent ? 'text-gray-400' : passed ? 'text-green-500' : 'text-red-500'}`}>
                            {isAbsent ? 'غائب' : `${r.score}/${r.total_score}`}
                          </span>
                          {!isAbsent && (isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />)}
                        </div>
                      </button>

                      {!isAbsent && isExpanded && (
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
                          <div className="pt-2 flex justify-end">
                            <button
                              onClick={() => setReviewResultId(r.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-navy-900 transition-all shadow-sm cursor-pointer active:scale-95"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              مراجعة الإجابات
                            </button>
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
                <div className="animate-spin w-6 h-6 border-4 border-orange-500 border-t-transparent rounded-full" />
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
                  const isExpanded = expandedRec === r.id;
                  const borderClass = r.passed
                    ? (dark ? 'border-l-2 border-l-green-500' : 'border-l-2 border-l-green-400')
                    : (dark ? 'border-l-2 border-l-red-500' : 'border-l-2 border-l-red-400');

                  return (
                    <div
                      key={r.id}
                      className={`rounded-xl border overflow-hidden transition-all ${dark ? 'border-[var(--dk-border)]' : 'border-gray-100'} ${borderClass}`}
                    >
                      <button
                        onClick={() => setExpandedRec(isExpanded ? null : r.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-right transition-colors ${dark ? 'hover:bg-[var(--dk-elevated)]' : 'hover:bg-orange-50/30'} cursor-pointer`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-black ${r.passed ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                          {r.passed ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0 text-right">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-xs font-black truncate ${textPrimary}`}>{r.recitation_title}</p>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${r.passed ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300'}`}>
                              {r.passed ? 'ناجح' : 'راسب'}
                            </span>
                            {r.points_earned > 0 && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${dark ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-50 text-amber-600'}`}>
                                +{r.points_earned} نقطة
                              </span>
                            )}
                            {Number(r.attempt_number) > 1 && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${dark ? 'bg-orange-950/40 text-orange-300' : 'bg-orange-50 text-orange-600'}`}>
                                إعادة {r.attempt_number}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <MiniBar value={r.score} max={r.total_score} color={r.passed ? 'bg-green-500' : 'bg-red-500'} />
                              <span className={`text-[10px] font-bold ${r.passed ? 'text-green-600' : 'text-red-500'}`}>{p}%</span>
                            </div>
                            <span className={`text-[10px] flex items-center gap-1 ${textSec}`} title="وقت أداء المحاولة">
                              <Clock className="w-2.5 h-2.5" />
                              {formatDuration(r)}
                            </span>
                            <span className={`text-[10px] ${textSec}`}>{fmt(r.created_at)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-xs font-black ${r.passed ? 'text-green-500' : 'text-red-500'}`}>
                            {r.score}/{r.total_score}
                          </span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className={`px-4 pb-3 border-t ${divider} ${dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-50'}`}>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3">
                            {[
                              { label: 'صحيح', value: r.correct_count, color: 'text-green-500' },
                              { label: 'خطأ', value: r.wrong_count, color: 'text-red-500' },
                              { label: 'الدرجة الكلية', value: r.total_score, color: textSec },
                              { label: 'النقاط المكتسبة', value: r.points_earned || 0, color: 'text-amber-500' },
                            ].map(({ label, value, color }) => (
                              <div key={label} className={`text-center rounded-lg p-2 ${dark ? 'bg-[var(--dk-surface)]' : 'bg-white'} border ${dark ? 'border-[var(--dk-border)]' : 'border-gray-100'}`}>
                                <p className={`text-sm font-black ${color}`}>{value}</p>
                                <p className={`text-[10px] font-bold ${textSec} mt-0.5`}>{label}</p>
                              </div>
                            ))}
                          </div>
                          <div className="pt-2 flex justify-end">
                            <button
                              onClick={() => setRecReviewResultId(r.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-navy-900 transition-all shadow-sm cursor-pointer active:scale-95"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              مراجعة الإجابات
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>
    </div>

    {reviewResultId && (
      <ExamReviewModal
        resultId={reviewResultId}
        onClose={() => setReviewResultId(null)}
      />
    )}

    {recReviewResultId && (
      <RecitationReviewModal
        resultId={recReviewResultId}
        onClose={() => setRecReviewResultId(null)}
      />
    )}
    </>
  );
}
