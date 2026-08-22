import React, { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, FileText, HelpCircle, Plus, Pencil, Trash2,
  AlertCircle, Link, Upload, Layers, X, FileDown,
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import MathText from '../../components/MathText';
import RichTextPalette, { CompactOptionFormatter } from '../../components/RichTextPalette';
import CsvImportModal from '../../components/CsvImportModal';
import { withToken } from '../../lib/mediaAccess';

const QUESTION_TYPES = [
  { value: 'mcq', label: '🔘 اختيار متعدد (MCQ)' },
  { value: 'true_false', label: '✅ صح / خطأ' },
  { value: 'image_multi', label: '🖼 صورة مع أسئلة' },
];

const emptyQ = {
  question_text: '', question_image_url: '',
  option_a: '', option_b: '', option_c: '', option_d: '',
  correct_answer_letter: 'A', points: 1, question_type: 'mcq',
  sub_questions: [], option_labels: null,
};

const qTypeLabel = (t) => ({ mcq: 'MCQ', true_false: 'صح/خطأ', image_multi: 'صورة+أسئلة' })[t] || 'MCQ';

const PREF_LABELS_KEY = 'wathba_preferred_option_labels';

function getSavedPreferredLabels() {
  try {
    const saved = localStorage.getItem(PREF_LABELS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) || parsed === null) return parsed;
    }
  } catch {}
  return null;
}

export default function ExamQuestions() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const baseRole = user?.role === 'assistant' ? 'assistant' : 'teacher';

  // ── form state ────────────────────────────────────────────────────────────
  const [preferredOptionLabels, setPreferredOptionLabels] = useState(() => getSavedPreferredLabels());
  const [qForm, setQForm] = useState(() => ({ ...emptyQ, option_labels: getSavedPreferredLabels() }));
  const [editQ, setEditQ] = useState(null);
  const [deleteQId, setDeleteQId] = useState(null);
  const [imageInputMode, setImageInputMode] = useState('url');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const imageFileRef = useRef(null);
  const formScrollRef = useRef(null);
  const questionTextRef = useRef(null);

  // CSV import modal
  const [showImport, setShowImport] = useState(false);

  // image_multi sub-questions count
  const [imgMultiCount, setImgMultiCount] = useState(5);

  const updateSubQuestions = (newSubs) => {
    const totalPts = newSubs.reduce((sum, s) => sum + (parseInt(s.points) || 1), 0);
    setQForm(f => ({ ...f, sub_questions: newSubs, points: totalPts }));
  };

  // ── queries ───────────────────────────────────────────────────────────────
  const { data: exam } = useQuery({
    queryKey: ['exam', examId],
    queryFn: () => api.get(`/exams/${examId}`).then(r => r.data),
  });

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ['questions', examId],
    queryFn: () => api.get(`/exams/${examId}/questions`).then(r => r.data),
  });

  // Sync preferred option labels from existing questions if not explicitly customized yet
  React.useEffect(() => {
    if (questions?.length > 0 && preferredOptionLabels === null) {
      for (let i = questions.length - 1; i >= 0; i--) {
        if (questions[i]?.option_labels) {
          setPreferredOptionLabels(questions[i].option_labels);
          setQForm(f => f.option_labels === null && !editQ ? { ...f, option_labels: questions[i].option_labels } : f);
          break;
        }
      }
    }
  }, [questions]);

  const handleOptionLabelsChange = (labels) => {
    setQForm(f => ({ ...f, option_labels: labels }));
    setPreferredOptionLabels(labels);
    try {
      localStorage.setItem(PREF_LABELS_KEY, JSON.stringify(labels));
    } catch {}
  };

  // ── mutations ─────────────────────────────────────────────────────────────
  const addQMut = useMutation({
    mutationFn: (d) => api.post(`/exams/${examId}/questions`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['questions', examId] });
      qc.invalidateQueries({ queryKey: ['exams'] });
      qc.invalidateQueries({ queryKey: ['exam', examId] });
      toast.success('تمت إضافة السؤال بنجاح');
      resetQForm();
    },
    onError: (err) => toast.error(err.response?.data?.error || 'حدث خطأ أثناء إضافة السؤال'),
  });

  const updateQMut = useMutation({
    mutationFn: ({ qid, d }) => api.put(`/exams/${examId}/questions/${qid}`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['questions', examId] });
      qc.invalidateQueries({ queryKey: ['exams'] });
      qc.invalidateQueries({ queryKey: ['exam', examId] });
      toast.success('تم تعديل السؤال بنجاح');
      resetQForm();
    },
    onError: (err) => toast.error(err.response?.data?.error || 'حدث خطأ أثناء تعديل السؤال'),
  });

  const deleteQMut = useMutation({
    mutationFn: (qid) => api.delete(`/exams/${examId}/questions/${qid}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['questions', examId] });
      qc.invalidateQueries({ queryKey: ['exams'] });
      qc.invalidateQueries({ queryKey: ['exam', examId] });
      toast.success('تم حذف السؤال');
      setDeleteQId(null);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'حدث خطأ أثناء الحذف'),
  });

  const resetQForm = () => {
    setQForm({
      ...emptyQ,
      option_labels: preferredOptionLabels,
    });
    setEditQ(null);
    setImageInputMode('url');
    setImageFile(null);
    setImagePreview('');
    setUploadProgress(0);
    if (imageFileRef.current) imageFileRef.current.value = '';
  };

  // ── submit (handles image upload if needed) ───────────────────────────────
  const handleQSubmit = async (e) => {
    e.preventDefault();
    let finalImageUrl = qForm.question_image_url;

    if (imageInputMode === 'file' && imageFile) {
      try {
        const fd = new FormData();
        fd.append('image', imageFile);
        const res = await api.post('/exams/upload-image', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (p) => {
            const pct = Math.round((p.loaded * 100) / p.total);
            setUploadProgress(pct);
          },
        });
        finalImageUrl = res.data.url;
      } catch (err) {
        toast.error(err.response?.data?.error || 'فشل رفع الصورة');
        setUploadProgress(0);
        return;
      }
    }

    const finalForm = {
      ...qForm,
      question_image_url: finalImageUrl,
    };

    if (!finalForm.question_text && !finalImageUrl) return toast.error('أدخل نص السؤال أو ارفع صورة السؤال');
    if (finalForm.question_type === 'mcq' && (!finalForm.option_a || !finalForm.option_b)) {
      return toast.error('الخياران الأول والثاني مطلوبان في أسئلة الاختيار');
    }
    if (finalForm.question_type === 'true_false') {
      finalForm.option_a = 'صح';
      finalForm.option_b = 'خطأ';
    }
    if (finalForm.question_type === 'image_multi') {
      if (!finalForm.sub_questions || finalForm.sub_questions.length === 0) {
        return toast.error('يجب توليد الأسئلة الفرعية أولاً');
      }
      finalForm.option_a = 'A';
      finalForm.option_b = 'B';
      finalForm.option_c = 'C';
      finalForm.option_d = 'D';
    }

    if (editQ) {
      updateQMut.mutate({ qid: editQ.id, d: finalForm });
    } else {
      addQMut.mutate(finalForm);
    }
  };

  const totalPoints = questions.reduce((acc, q) => acc + (parseInt(q.points) || 0), 0);
  const examTotal = parseInt(exam?.total_score) || 0;
  const pointsMismatch = questions.length > 0 && examTotal > 0 && totalPoints !== examTotal;

  return (
    <div className="-m-4 lg:-m-6 h-[calc(100%+2rem)] lg:h-[calc(100%+3rem)] flex flex-col overflow-hidden" dir="rtl">
      {/* Fixed Header */}
      <div className="flex-shrink-0 bg-white dark:bg-[var(--dk-surface)] border-b border-gray-200 dark:border-[var(--dk-border)] shadow-sm">
        <div className="px-4 lg:px-6 py-3 flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => {
              // Preserve the exams list state (?q/&stage/…) by going back
              // through history when possible; deep links fall back.
              if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
              else navigate(`/${baseRole}/exams`);
            }}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-gray-600 dark:text-[var(--dk-text-2)] hover:bg-gray-100 dark:hover:bg-[var(--dk-elevated)] transition-all font-bold text-sm flex-shrink-0">
            <ArrowRight className="w-4 h-4" />
            <span className="hidden sm:inline">رجوع للاختبارات</span>
          </button>
          <div className="h-5 w-px bg-gray-200 dark:bg-[var(--dk-border)] flex-shrink-0" />
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs text-gray-400 dark:text-[var(--dk-text-3)] font-medium">إدارة أسئلة الاختبار</p>
              <h1 className="font-black text-navy-700 dark:text-[var(--dk-text-1)] text-xs sm:text-sm truncate">{exam?.title || '...'}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs font-bold text-gray-500 dark:text-[var(--dk-text-2)] flex items-center gap-1">
              <HelpCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">{questions.length} سؤال</span>
              <span className="sm:hidden">{questions.length}</span>
            </span>
            {examTotal > 0 && (
              <span className={`text-xs font-black px-2 py-1 rounded-lg ${
                pointsMismatch ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              }`}>
                {totalPoints}/{examTotal}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-4 lg:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6 items-start">

          {/* Questions List */}
          <div className="lg:col-span-3 space-y-4 order-2 lg:order-1">
            {pointsMismatch && (
              <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700/50 rounded-xl text-sm text-amber-800 dark:text-amber-400 font-semibold">
                <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <span>
                  ⚠️ مجموع درجات الأسئلة (<span className="font-black">{totalPoints}</span>) لا يساوي المجموع الكلي (<span className="font-black">{examTotal}</span>) — عدّل الدرجات قبل نشر الاختبار
                </span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-orange-500" />
              <h2 className="font-black text-navy-700 dark:text-[var(--dk-text-1)] text-base">
                الأسئلة
                <span className="mr-2 text-sm font-semibold text-gray-500 dark:text-[var(--dk-text-2)]">({questions.length})</span>
              </h2>
            </div>

            {isLoading ? (
              [...Array(3)].map((_, i) => <div key={i} className="h-24 bg-white dark:bg-[var(--dk-surface)] rounded-xl animate-pulse border border-gray-100 dark:border-[var(--dk-border)]" />)
            ) : questions.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-[var(--dk-surface)] rounded-2xl border border-dashed border-gray-200 dark:border-[var(--dk-border)]">
                <HelpCircle className="w-14 h-14 mx-auto mb-3 text-gray-300 dark:text-[var(--dk-text-3)]" />
                <p className="text-gray-400 dark:text-[var(--dk-text-2)] font-medium">لا توجد أسئلة بعد — أضف أول سؤال من النموذج</p>
              </div>
            ) : (
              questions.map((q, idx) => {
                const qNum = idx + 1;
                return (
                  <SingleQuestionCard
                    key={q.id}
                    q={q}
                    qNum={qNum}
                    editQ={editQ}
                    onEdit={() => {
                      setEditQ(q);
                      setQForm({ ...q, question_type: q.question_type || 'mcq' });
                      setImageFile(null); setImagePreview(''); setImageInputMode(q.question_image_url?.startsWith('/uploads') ? 'file' : 'url');
                      if (imageFileRef.current) imageFileRef.current.value = '';
                      formScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    onDelete={() => setDeleteQId(q.id)}
                  />
                );
              })
            )}
          </div>

          {/* Add/Edit Question Form */}
          <div ref={formScrollRef} className="lg:col-span-2 order-1 lg:order-2 lg:sticky lg:top-4 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:overscroll-contain lg:pl-1">
            <div className="bg-white dark:bg-[var(--dk-surface)] rounded-2xl border-2 border-dashed border-orange-300 dark:border-[var(--dk-border-md)] p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-navy-700 dark:text-[var(--dk-text-1)] flex items-center gap-2">
                  <Plus className="w-4 h-4 text-orange-500" />
                  {editQ ? 'تعديل السؤال' : 'إضافة سؤال جديد'}
                </h3>
                {!editQ && (
                  <button
                    type="button"
                    onClick={() => setShowImport(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border-2 border-purple-300 text-purple-700 bg-purple-50 hover:bg-purple-100 hover:border-purple-400 transition-all dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    استيراد CSV
                  </button>
                )}
              </div>
              <form onSubmit={handleQSubmit} className="space-y-4">

                {/* Question type */}
                <div>
                  <label className="block text-xs font-bold text-navy-700 dark:text-[var(--dk-text-1)] mb-1.5">نوع السؤال</label>
                  <div className="flex gap-2 flex-wrap">
                    {QUESTION_TYPES.map(t => (
                      <button key={t.value} type="button"
                        onClick={() => setQForm({ ...qForm, question_type: t.value, correct_answer_letter: 'A' })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                          qForm.question_type === t.value
                            ? 'border-orange-500 bg-orange-50 text-orange-800 dark:bg-orange-950/30 dark:text-orange-300'
                            : 'border-gray-200 dark:border-[var(--dk-border)] text-gray-600 dark:text-[var(--dk-text-2)] hover:border-gray-300'
                        }`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Question text */}
                <div>
                  <label className="block text-xs font-bold text-navy-700 dark:text-[var(--dk-text-1)] mb-1">
                    نص السؤال <span className="text-gray-400 dark:text-[var(--dk-text-3)] font-normal">(اختياري إذا وُجدت صورة)</span>
                  </label>
                  <RichTextPalette
                    textareaRef={questionTextRef}
                    value={qForm.question_text}
                    onChange={v => setQForm({ ...qForm, question_text: v })}
                    placeholder="اكتب نص السؤال هنا... (حدد أي جزء من النص لتغيير لونه أو تنسيقه)"
                    minHeight={80}
                    accentColor="orange"
                  />
                </div>

                {/* Question image */}
                <div>
                  <label className="block text-xs font-bold text-navy-700 dark:text-[var(--dk-text-1)] mb-1.5">
                    صورة السؤال <span className="text-gray-400 dark:text-[var(--dk-text-3)] font-normal">(اختياري)</span>
                  </label>
                  <div className="flex gap-2 mb-2">
                    <button type="button"
                      onClick={() => { setImageInputMode('url'); setImageFile(null); setImagePreview(''); if (imageFileRef.current) imageFileRef.current.value = ''; }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                        imageInputMode === 'url' ? 'border-orange-500 bg-orange-50 text-orange-800 dark:bg-orange-950/30 dark:text-orange-300' : 'border-gray-200 dark:border-[var(--dk-border)] text-gray-600 dark:text-[var(--dk-text-2)]'
                      }`}>
                      <Link className="w-3.5 h-3.5" /> رابط URL
                    </button>
                    <button type="button"
                      onClick={() => { setImageInputMode('file'); setQForm({ ...qForm, question_image_url: '' }); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                        imageInputMode === 'file' ? 'border-orange-500 bg-orange-50 text-orange-800 dark:bg-orange-950/30 dark:text-orange-300' : 'border-gray-200 dark:border-[var(--dk-border)] text-gray-600 dark:text-[var(--dk-text-2)]'
                      }`}>
                      <Upload className="w-3.5 h-3.5" /> رفع صورة
                    </button>
                  </div>
                  {imageInputMode === 'url' ? (
                    <>
                      <input value={qForm.question_image_url || ''} onChange={e => setQForm({ ...qForm, question_image_url: e.target.value })}
                        className="input-field text-sm" placeholder="الصق رابط الصورة هنا..." dir="ltr" />
                      {qForm.question_image_url && (
                        <img src={withToken(qForm.question_image_url)} alt="preview" className="mt-2 h-24 rounded-lg object-contain border border-gray-200 dark:border-[var(--dk-border)] w-full" loading="lazy" decoding="async" onError={e => e.target.style.display = 'none'} />
                      )}
                    </>
                  ) : (
                    <>
                      <input ref={imageFileRef} type="file" accept="image/*"
                        onChange={e => { const f = e.target.files[0]; if (f) { setImageFile(f); setImagePreview(URL.createObjectURL(f)); } else { setImageFile(null); setImagePreview(''); } }}
                        className="block w-full text-sm text-gray-600 dark:text-[var(--dk-text-2)] file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 border border-gray-200 dark:border-[var(--dk-border)] rounded-xl p-2 cursor-pointer"
                      />
                      {uploadProgress > 0 && uploadProgress < 100 && (
                        <div className="mt-2">
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>جاري رفع الصورة...</span>
                            <span className="font-bold text-orange-600">{uploadProgress}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div className="h-2 bg-gradient-to-r from-orange-400 to-orange-600 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                          </div>
                        </div>
                      )}
                      {uploadProgress === 100 && <p className="mt-1 text-xs text-green-600 font-bold">✓ تم الرفع بنجاح</p>}
                      {imagePreview && <img src={imagePreview} alt="preview" className="mt-2 h-24 rounded-lg object-contain border border-gray-200 dark:border-[var(--dk-border)] w-full" />}
                    </>
                  )}
                </div>

                {/* MCQ options */}
                {qForm.question_type === 'mcq' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-navy-700 dark:text-[var(--dk-text-1)]">الخيارات</label>
                      <select
                        value={
                          !qForm.option_labels ? 'default' :
                          JSON.stringify(qForm.option_labels) === JSON.stringify(['أ', 'ب', 'ج', 'د']) ? 'arabic' :
                          JSON.stringify(qForm.option_labels) === JSON.stringify(['1', '2', '3', '4']) ? 'numbers' : 'custom'
                        }
                        onChange={e => {
                          const val = e.target.value;
                          if (val === 'default') handleOptionLabelsChange(null);
                          else if (val === 'arabic') handleOptionLabelsChange(['أ', 'ب', 'ج', 'د']);
                          else if (val === 'numbers') handleOptionLabelsChange(['1', '2', '3', '4']);
                          else handleOptionLabelsChange(['A', 'B', 'C', 'D']);
                        }}
                        className="text-[10px] rounded border border-gray-300 dark:border-[var(--dk-border)] px-1.5 py-0.5 bg-white dark:bg-[var(--dk-elevated)] text-gray-700 dark:text-[var(--dk-text-2)] focus:outline-none"
                      >
                        <option value="default">افتراضي (A, B, C, D)</option>
                        <option value="arabic">عربي (أ، ب، ج، د)</option>
                        <option value="numbers">أرقام (1، 2، 3، 4)</option>
                        <option value="custom">تخصيص مخصص...</option>
                      </select>
                    </div>
                    {['A', 'B', 'C', 'D'].map((opt, idx) => {
                      const displayLabel = qForm.option_labels?.[idx] || opt;
                      return (
                        <div key={opt} className="flex items-center gap-2">
                          <button type="button" onClick={() => setQForm({ ...qForm, correct_answer_letter: opt })}
                            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-black flex-shrink-0 transition-all ${
                              qForm.correct_answer_letter === opt ? 'border-green-500 bg-green-500 text-white' : 'border-gray-300 dark:border-[var(--dk-border)] hover:border-green-400 text-gray-600 dark:text-[var(--dk-text-2)]'
                            }`}>
                            {displayLabel}
                          </button>
                          <CompactOptionFormatter
                            value={qForm[`option_${opt.toLowerCase()}`] || ''}
                            onChange={v => setQForm({ ...qForm, [`option_${opt.toLowerCase()}`]: v })}
                            placeholder={`الخيار ${displayLabel}${opt === 'A' || opt === 'B' ? ' *' : ''}`}
                          />
                        </div>
                      );
                    })}
                    
                    {qForm.option_labels && (
                      <div className="grid grid-cols-4 gap-2 border-t border-gray-150 dark:border-[var(--dk-border)] pt-2 bg-gray-50/50 dark:bg-gray-900/20 p-2 rounded-xl border border-gray-100 dark:border-[var(--dk-border)]">
                        {['A', 'B', 'C', 'D'].map((letter, idx) => (
                          <div key={letter} className="flex flex-col gap-0.5">
                            <span className="text-[9px] text-gray-400 dark:text-[var(--dk-text-3)] text-center font-bold">تسمية {letter}</span>
                            <input
                              type="text"
                              value={qForm.option_labels[idx] || ''}
                              onChange={e => {
                                const newLabels = [...(qForm.option_labels || ['A', 'B', 'C', 'D'])];
                                newLabels[idx] = e.target.value;
                                handleOptionLabelsChange(newLabels);
                              }}
                              className="w-full text-center text-xs rounded border border-gray-300 dark:border-[var(--dk-border)] py-1 bg-white dark:bg-[var(--dk-elevated)] dark:text-[var(--dk-text-1)] focus:outline-none focus:ring-1 focus:ring-orange-500"
                              maxLength={20}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* True/False */}
                {qForm.question_type === 'true_false' && (
                  <div>
                    <label className="block text-xs font-bold text-navy-700 dark:text-[var(--dk-text-1)] mb-1.5">الإجابة الصحيحة</label>
                    <div className="flex gap-3">
                      {['A', 'B'].map((opt, i) => (
                        <button key={opt} type="button"
                          onClick={() => setQForm({ ...qForm, correct_answer_letter: opt })}
                          className={`flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition-all ${
                            qForm.correct_answer_letter === opt ? 'border-green-500 bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300' : 'border-gray-200 dark:border-[var(--dk-border)] text-gray-600 dark:text-[var(--dk-text-2)] hover:border-gray-300'
                          }`}>
                          {i === 0 ? '✅ صح' : '❌ خطأ'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* image_multi sub-questions */}
                {qForm.question_type === 'image_multi' && (
                  <div>
                    <label className="block text-xs font-bold text-navy-700 dark:text-[var(--dk-text-1)] mb-2">الأسئلة الفرعية</label>
                    <div className="flex items-center gap-2 mb-3">
                      <input type="number" min={1} max={50} value={imgMultiCount}
                        onChange={e => setImgMultiCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                        className="input-field w-20 text-sm" placeholder="العدد" />
                      <button type="button"
                        onClick={() => {
                          const subs = Array.from({ length: imgMultiCount }, (_, i) => ({
                            label: String(i + 1), correct: 'A', type: 'mcq', points: 1,
                            option_labels: preferredOptionLabels || qForm.option_labels || null,
                          }));
                          updateSubQuestions(subs);
                        }}
                        className="btn-primary px-3 py-1.5 text-sm">توليد</button>
                      {(qForm.sub_questions || []).length > 0 && (
                        <span className="text-xs text-gray-500 dark:text-[var(--dk-text-2)] font-semibold">{(qForm.sub_questions || []).length} سؤال</span>
                      )}
                    </div>
                    {(qForm.sub_questions || []).length > 0 && (
                      <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                        {(qForm.sub_questions || []).map((sub, idx) => (
                          <div key={sub.label} className="flex flex-col gap-2 bg-gray-50 dark:bg-[var(--dk-elevated)] rounded-xl p-3 border border-gray-100 dark:border-[var(--dk-border)]">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-black text-navy-600 dark:text-[var(--dk-text-1)]">فرع {sub.label}</span>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <select
                                  value={sub.type || 'mcq'}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const updated = [...qForm.sub_questions];
                                    let correct = sub.correct;
                                    if (val === 'true_false' && !['A', 'B'].includes(correct)) {
                                      correct = 'A';
                                    }
                                    updated[idx] = { ...updated[idx], type: val, correct };
                                    updateSubQuestions(updated);
                                  }}
                                  className="text-[10px] rounded border border-gray-300 dark:border-[var(--dk-border)] px-1 py-0.5 bg-white dark:bg-[var(--dk-surface)] text-gray-700 dark:text-[var(--dk-text-1)] focus:outline-none"
                                >
                                  <option value="mcq">MCQ</option>
                                  <option value="true_false">صح/خطأ</option>
                                </select>

                                {sub.type !== 'true_false' && (
                                  <select
                                    value={
                                      !sub.option_labels ? 'default' :
                                      JSON.stringify(sub.option_labels) === JSON.stringify(['أ', 'ب', 'ج', 'د']) ? 'arabic' :
                                      JSON.stringify(sub.option_labels) === JSON.stringify(['1', '2', '3', '4']) ? 'numbers' : 'custom'
                                    }
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const updated = [...qForm.sub_questions];
                                      let labels = null;
                                      if (val === 'arabic') labels = ['أ', 'ب', 'ج', 'د'];
                                      else if (val === 'numbers') labels = ['1', '2', '3', '4'];
                                      else if (val === 'custom') labels = ['A', 'B', 'C', 'D'];
                                      updated[idx] = { ...updated[idx], option_labels: labels };
                                      updateSubQuestions(updated);
                                      if (labels) handleOptionLabelsChange(labels);
                                    }}
                                    className="text-[9px] rounded border border-gray-300 dark:border-[var(--dk-border)] px-1 py-0.5 bg-white dark:bg-[var(--dk-surface)] text-gray-700 dark:text-[var(--dk-text-1)] focus:outline-none"
                                  >
                                    <option value="default">الافتراضي (A-D)</option>
                                    <option value="arabic">عربي (أ-د)</option>
                                    <option value="numbers">أرقام (1-4)</option>
                                    <option value="custom">مخصص...</option>
                                  </select>
                                )}

                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] text-gray-500 dark:text-[var(--dk-text-3)] font-semibold">الدرجة:</span>
                                  <input
                                    type="number"
                                    min={1}
                                    value={sub.points !== undefined ? sub.points : 1}
                                    onChange={(e) => {
                                      const val = Math.max(1, parseInt(e.target.value) || 1);
                                      const updated = [...qForm.sub_questions];
                                      updated[idx] = { ...updated[idx], points: val };
                                      updateSubQuestions(updated);
                                    }}
                                    className="w-10 text-center text-xs rounded border border-gray-300 dark:border-[var(--dk-border)] py-0.5 bg-white dark:bg-[var(--dk-surface)] dark:text-[var(--dk-text-1)] focus:outline-none"
                                  />
                                </div>
                              </div>
                            </div>

                            {sub.option_labels && sub.type !== 'true_false' && (
                              <div className="grid grid-cols-4 gap-1.5 pt-1">
                                {['A', 'B', 'C', 'D'].map((letter, lIdx) => (
                                  <div key={letter} className="flex flex-col gap-0.5">
                                    <input
                                      type="text"
                                      value={sub.option_labels[lIdx] || ''}
                                      onChange={(e) => {
                                        const updated = [...qForm.sub_questions];
                                        const newLabels = [...(sub.option_labels || ['A', 'B', 'C', 'D'])];
                                        newLabels[lIdx] = e.target.value;
                                        updated[idx] = { ...updated[idx], option_labels: newLabels };
                                        updateSubQuestions(updated);
                                      }}
                                      className="w-full text-center text-[10px] rounded border border-gray-300 dark:border-[var(--dk-border)] py-0.5 bg-white dark:bg-[var(--dk-surface)] dark:text-[var(--dk-text-1)] focus:outline-none"
                                      placeholder={letter}
                                      maxLength={20}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="flex gap-1">
                              {(sub.type === 'true_false' ? ['A', 'B'] : ['A', 'B', 'C', 'D']).map(letter => {
                                const displayLetter = sub.type === 'true_false'
                                  ? (letter === 'A' ? 'صح' : 'خطأ')
                                  : (sub.option_labels?.[['A', 'B', 'C', 'D'].indexOf(letter)] || letter);
                                return (
                                  <button key={letter} type="button"
                                    onClick={() => {
                                      const updated = [...qForm.sub_questions];
                                      updated[idx] = { ...updated[idx], correct: letter };
                                      updateSubQuestions(updated);
                                    }}
                                    className={`flex-1 py-1 rounded text-xs font-bold border transition-all ${
                                      sub.correct === letter
                                        ? 'bg-green-600 text-white border-green-600'
                                        : 'bg-white dark:bg-[var(--dk-surface)] text-gray-600 dark:text-[var(--dk-text-2)] border-gray-300 dark:border-[var(--dk-border)] hover:border-gray-400'
                                    }`}>
                                    {displayLetter}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Points */}
                <div className="flex items-center gap-4 pt-1">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-bold text-navy-700 dark:text-[var(--dk-text-1)] whitespace-nowrap">الدرجة:</label>
                    <input type="number" value={qForm.points}
                      onChange={e => setQForm({ ...qForm, points: parseInt(e.target.value) || 1 })}
                      className="input-field w-20" min={1}
                      disabled={qForm.question_type === 'image_multi'} />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1 border-t border-gray-100 dark:border-[var(--dk-border)]">
                  {editQ && (
                    <button type="button" onClick={resetQForm} className="btn-secondary px-4 py-2 text-sm flex-shrink-0">
                      إلغاء
                    </button>
                  )}
                  <button type="submit" className="btn-primary flex-1 flex items-center justify-center gap-2"
                    disabled={addQMut.isPending || updateQMut.isPending}>
                    {editQ ? 'تحديث السؤال' : <><Plus className="w-4 h-4" /> إضافة السؤال</>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteQId}
        onClose={() => setDeleteQId(null)}
        onConfirm={() => deleteQMut.mutate(deleteQId)}
        title="حذف السؤال"
        message="هل أنت متأكد من حذف هذا السؤال نهائياً؟"
        danger
      />

      <CsvImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        mode="exam"
        targetId={examId}
        onSuccess={() => qc.invalidateQueries({ queryKey: ['questions', examId] })}
      />
    </div>
  );
}

// ── Single question card ───────────────────────────────────────────────────
function SingleQuestionCard({ q, qNum, editQ, onEdit, onDelete }) {
  return (
    <div className={`bg-white dark:bg-[var(--dk-surface)] rounded-xl p-4 shadow-sm border transition-all ${editQ?.id === q.id ? 'border-orange-400 ring-2 ring-orange-100 dark:ring-orange-900/40' : 'border-gray-100 dark:border-[var(--dk-border)] hover:border-gray-200 dark:hover:border-[var(--dk-border-md)]'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs font-black text-gray-500 dark:text-[var(--dk-text-2)]">س{qNum}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              q.question_type === 'true_false' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
            }`}>{qTypeLabel(q.question_type)}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
              {q.points} درجة
            </span>
          </div>
          {q.question_text && (
            <p className="font-semibold text-navy-600 dark:text-[var(--dk-text-1)] text-sm mb-2 leading-relaxed">
              <MathText text={q.question_text} />
            </p>
          )}
          {q.question_image_url && (
            <img src={withToken(q.question_image_url)} alt="question" className="w-40 h-24 object-cover rounded-lg mb-2 border border-gray-100 dark:border-[var(--dk-border)]" loading="lazy" decoding="async" />
          )}
          {q.question_type === 'image_multi' ? (
            <div className="space-y-1.5 w-full">
              <div className="inline-flex items-center gap-1 text-[11px] font-bold bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800 rounded-lg px-2 py-1">
                🖼 {Array.isArray(q.sub_questions) ? q.sub_questions.length : 0} سؤال فرعي
              </div>
              <div className="flex flex-wrap gap-1">
                {Array.isArray(q.sub_questions) && q.sub_questions.map((sub, sidx) => (
                  <span key={sidx} className="text-[10px] px-1.5 py-0.5 rounded-lg bg-gray-100 dark:bg-[var(--dk-elevated)] border border-gray-200 dark:border-[var(--dk-border)] text-gray-600 dark:text-[var(--dk-text-2)] font-medium">
                    {sub.label}: {sub.type === 'true_false' ? (sub.correct === 'A' ? 'صح' : 'خطأ') : sub.correct} ({sub.points || 1} د)
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1 text-xs">
              {(q.question_type === 'true_false' ? ['A', 'B'] : ['A', 'B', 'C', 'D']).map((opt, oidx) =>
                q[`option_${opt.toLowerCase()}`] && q[`option_${opt.toLowerCase()}`] !== '-' && (
                  <div key={opt} className={`p-1.5 rounded-lg font-semibold flex items-center gap-1 ${
                    q.correct_answer_letter === opt ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-gray-100 dark:bg-[var(--dk-elevated)] text-gray-700 dark:text-[var(--dk-text-2)]'
                  }`}>
                    <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-black flex-shrink-0 ${
                      q.correct_answer_letter === opt ? 'bg-green-600 text-white' : 'bg-gray-300 dark:bg-[var(--dk-hover)] text-gray-600 dark:text-[var(--dk-text-2)]'
                    }`}>{q.option_labels?.[oidx] || opt}</span>
                    <span className="flex-1 leading-snug"><MathText text={q[`option_${opt.toLowerCase()}`]} /></span>
                  </div>
                )
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          <button onClick={onEdit} className="p-1.5 text-navy-600 dark:text-[var(--dk-text-2)] hover:bg-navy-50 dark:hover:bg-[var(--dk-elevated)] rounded-lg transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
