import React, { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, BookMarked, HelpCircle, Plus, Pencil, Trash2,
  Upload, Link, FileDown,
} from 'lucide-react';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import MathText from '../../components/MathText';
import RichTextPalette, { CompactOptionFormatter } from '../../components/RichTextPalette';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import CsvImportModal from '../../components/CsvImportModal';
import { withToken } from '../../lib/mediaAccess';

const emptyQ = { question_text: '', question_image_url: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer_letter: 'A', points: 1, question_type: 'mcq', difficulty: 'medium', sub_questions: [], option_labels: null };

const DIFFICULTIES = [
  { value: 'easy',   label: 'سهل',   color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'medium', label: 'متوسط', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'hard',   label: 'صعب',   color: 'bg-red-100 text-red-700 border-red-300' },
];

const difficultyBadge = (d) => {
  const map = { easy: { label: 'سهل 🟢', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' }, medium: { label: 'متوسط 🟡', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' }, hard: { label: 'صعب 🔴', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' } };
  return map[d] || map['medium'];
};

const Q_TYPES = [
  { value: 'mcq', label: '🔘 اختيار متعدد (MCQ)' },
  { value: 'true_false', label: '✅ صح / خطأ' },
  { value: 'image_multi', label: '🖼 صورة مع أسئلة' },
];

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

export default function QuestionBankQuestions() {
  const { bankId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const baseRole = user?.role === 'assistant' ? 'assistant' : 'teacher';

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

  const [imgMultiCount, setImgMultiCount] = useState(5);
  const [showImport, setShowImport] = useState(false);

  const updateSubQuestions = (newSubs) => {
    const totalPts = newSubs.reduce((sum, s) => sum + (parseInt(s.points) || 1), 0);
    setQForm(f => ({ ...f, sub_questions: newSubs, points: totalPts }));
  };

  const { data: banks = [] } = useQuery({
    queryKey: ['question-banks'],
    queryFn: () => api.get('/question-banks').then(r => r.data),
  });
  const bank = banks.find(b => String(b.id) === String(bankId));

  const { data: bankQuestions = [], isLoading } = useQuery({
    queryKey: ['bank-questions', bankId],
    queryFn: () => api.get(`/question-banks/${bankId}/questions`).then(r => r.data),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Sync preferred option labels from existing questions if not explicitly customized yet
  React.useEffect(() => {
    if (bankQuestions?.length > 0 && preferredOptionLabels === null) {
      for (let i = bankQuestions.length - 1; i >= 0; i--) {
        if (bankQuestions[i]?.option_labels) {
          setPreferredOptionLabels(bankQuestions[i].option_labels);
          setQForm(f => f.option_labels === null && !editQ ? { ...f, option_labels: bankQuestions[i].option_labels } : f);
          break;
        }
      }
    }
  }, [bankQuestions]);

  const handleOptionLabelsChange = (labels) => {
    setQForm(f => ({ ...f, option_labels: labels }));
    setPreferredOptionLabels(labels);
    try {
      localStorage.setItem(PREF_LABELS_KEY, JSON.stringify(labels));
    } catch {}
  };

  const addQMut = useMutation({
    mutationFn: (data) => api.post(`/question-banks/${bankId}/questions`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-questions', bankId] });
      qc.invalidateQueries({ queryKey: ['question-banks'] });
      toast.success('تمت إضافة السؤال للبنك ✅');
      resetQForm();
    },
    onError: (err) => toast.error(err.response?.data?.error || 'فشل إضافة السؤال'),
  });

  const updateQMut = useMutation({
    mutationFn: ({ qid, data }) => api.put(`/question-banks/${bankId}/questions/${qid}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-questions', bankId] });
      qc.invalidateQueries({ queryKey: ['question-banks'] });
      toast.success('تم تعديل السؤال ✅');
      resetQForm();
    },
    onError: (err) => toast.error(err.response?.data?.error || 'فشل تعديل السؤال'),
  });

  const deleteQMut = useMutation({
    mutationFn: (qid) => api.delete(`/question-banks/${bankId}/questions/${qid}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-questions', bankId] });
      qc.invalidateQueries({ queryKey: ['question-banks'] });
      toast.success('تم حذف السؤال');
      setDeleteQId(null);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'فشل حذف السؤال'),
  });

  const resetQForm = () => {
    setQForm({ ...emptyQ, option_labels: preferredOptionLabels });
    setEditQ(null);
    setImageInputMode('url');
    setImageFile(null);
    setImagePreview('');
    setUploadProgress(0);
    if (imageFileRef.current) imageFileRef.current.value = '';
  };

  const startEditQ = (q) => {
    setEditQ(q);
    setQForm({
      question_text: q.question_text || '',
      question_image_url: q.question_image_url || '',
      option_a: q.option_a || '',
      option_b: q.option_b || '',
      option_c: q.option_c || '',
      option_d: q.option_d || '',
      correct_answer_letter: q.correct_answer_letter || 'A',
      points: q.points || 1,
      question_type: q.question_type || 'mcq',
      difficulty: q.difficulty || 'medium',
      sub_questions: q.sub_questions || [],
      option_labels: q.option_labels || null,
    });
    setImageFile(null);
    setImagePreview('');
    setImageInputMode(q.question_image_url?.startsWith('/uploads') ? 'file' : 'url');
    if (imageFileRef.current) imageFileRef.current.value = '';
    formScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleQSubmit = async (e) => {
    e.preventDefault();
    let finalImageUrl = qForm.question_image_url;

    if (imageInputMode === 'file' && imageFile) {
      try {
        const fd = new FormData();
        fd.append('image', imageFile);
        const res = await api.post('/question-banks/upload-image', fd, {
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

    if (!finalForm.question_text && !finalImageUrl) return toast.error('أدخل نص السؤال أو صورة');
    if (finalForm.question_type === 'mcq' && (!finalForm.option_a || !finalForm.option_b)) {
      return toast.error('الخياران الأول والثاني مطلوبان');
    }
    if (finalForm.question_type === 'true_false') {
      finalForm.option_a = 'صح';
      finalForm.option_b = 'خطأ';
    }
    if (finalForm.question_type === 'image_multi') {
      if (!finalForm.sub_questions || finalForm.sub_questions.length === 0) {
        return toast.error('يجب توليد الأسئلة الفرعية أولاً');
      }
      finalForm.option_a = 'A'; finalForm.option_b = 'B'; finalForm.option_c = 'C'; finalForm.option_d = 'D';
    }

    if (editQ) {
      updateQMut.mutate({ qid: editQ.id, data: finalForm });
    } else {
      addQMut.mutate(finalForm);
    }
  };

  const isTF = qForm.question_type === 'true_false';

  return (
    <div className="-m-4 lg:-m-6 h-[calc(100%+2rem)] lg:h-[calc(100%+3rem)] flex flex-col overflow-hidden" dir="rtl">
      {/* Fixed Header */}
      <div className="flex-shrink-0 bg-white dark:bg-[var(--dk-surface)] border-b border-gray-200 dark:border-[var(--dk-border)] shadow-sm">
        <div className="px-4 lg:px-6 py-3 flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => navigate(`/${baseRole}/question-banks`)}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-gray-600 dark:text-[var(--dk-text-2)] hover:bg-gray-100 dark:hover:bg-[var(--dk-elevated)] transition-all font-bold text-sm flex-shrink-0">
            <ArrowRight className="w-4 h-4" />
            <span className="hidden sm:inline">رجوع لبنوك الأسئلة</span>
          </button>
          <div className="h-5 w-px bg-gray-200 dark:bg-[var(--dk-border)] flex-shrink-0" />
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <BookMarked className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs text-gray-400 dark:text-[var(--dk-text-3)] font-medium">إدارة أسئلة بنك الأسئلة</p>
              <h1 className="font-black text-navy-700 dark:text-[var(--dk-text-1)] text-xs sm:text-sm truncate">{bank?.title || '...'}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs font-bold text-gray-500 dark:text-[var(--dk-text-2)] flex items-center gap-1">
              <HelpCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">{bankQuestions.length} سؤال</span>
              <span className="sm:hidden">{bankQuestions.length}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-4 lg:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6 items-start">

          {/* Questions List */}
          <div className="lg:col-span-3 space-y-3 order-2 lg:order-1">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-purple-500" />
              <h2 className="font-black text-navy-700 dark:text-[var(--dk-text-1)] text-base">
                الأسئلة
                <span className="mr-2 text-sm font-semibold text-gray-500 dark:text-[var(--dk-text-2)]">({bankQuestions.length})</span>
              </h2>
            </div>

            {isLoading ? (
              [...Array(3)].map((_, i) => <div key={i} className="h-24 bg-white dark:bg-[var(--dk-surface)] rounded-xl animate-pulse border border-gray-100 dark:border-[var(--dk-border)]" />)
            ) : bankQuestions.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-[var(--dk-surface)] rounded-2xl border border-dashed border-gray-200 dark:border-[var(--dk-border)]">
                <HelpCircle className="w-14 h-14 mx-auto mb-3 text-gray-300 dark:text-[var(--dk-text-3)]" />
                <p className="text-gray-400 dark:text-[var(--dk-text-2)] font-medium">لا توجد أسئلة بعد — أضف أول سؤال من النموذج</p>
              </div>
            ) : (
              bankQuestions.map((q, idx) => {
                const d = difficultyBadge(q.difficulty);
                const num = idx + 1;
                return (
                  <div key={q.id} className={`bg-white dark:bg-[var(--dk-surface)] rounded-xl p-4 shadow-sm border transition-all ${editQ?.id === q.id ? 'border-purple-400 ring-2 ring-purple-100 dark:ring-purple-900/40' : 'border-gray-100 dark:border-[var(--dk-border)] hover:border-gray-200 dark:hover:border-[var(--dk-border-md)]'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="text-xs font-black bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded-full">{num}</span>
                          <span className="text-xs text-gray-500 dark:text-[var(--dk-text-2)] font-medium">{qTypeLabel(q.question_type)} · {q.points} نقطة</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${d.cls}`}>{d.label}</span>
                        </div>
                        {q.question_image_url && <img src={withToken(q.question_image_url)} alt="" className="max-h-32 rounded-lg mb-2 border border-gray-200 dark:border-[var(--dk-border)]" loading="lazy" decoding="async" />}
                        {q.question_text && (
                          <p className="font-semibold text-navy-700 dark:text-[var(--dk-text-1)] text-sm mb-2">
                            <MathText text={q.question_text} />
                          </p>
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
                          <div className="grid grid-cols-2 gap-1.5">
                            {['a','b','c','d'].map((opt, oidx) => q[`option_${opt}`] && (
                              <div key={opt} className={`px-2 py-1 rounded-lg text-xs font-medium border flex items-center gap-1 ${q.correct_answer_letter?.toUpperCase() === opt.toUpperCase() ? 'border-green-400 bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300 font-bold' : 'border-gray-200 dark:border-[var(--dk-border)] text-gray-600 dark:text-[var(--dk-text-2)] dark:bg-[var(--dk-elevated)]'}`}>
                                <span className="font-black ml-1 flex-shrink-0">{q.option_labels?.[oidx] || opt.toUpperCase()}.</span>
                                <span className="flex-1 leading-snug"><MathText text={q[`option_${opt}`]} /></span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <button onClick={() => startEditQ(q)} className="p-1.5 text-gray-400 hover:text-navy-600 dark:hover:text-[var(--dk-text-1)] hover:bg-white dark:hover:bg-[var(--dk-elevated)] rounded-lg transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setDeleteQId(q.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Add/Edit Question Form */}
          <div ref={formScrollRef} className="lg:col-span-2 order-1 lg:order-2 lg:sticky lg:top-4 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:overscroll-contain lg:pl-1">
            <div className="bg-white dark:bg-[var(--dk-surface)] rounded-2xl border-2 border-dashed border-purple-300 dark:border-[var(--dk-border-md)] p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-navy-700 dark:text-[var(--dk-text-1)] flex items-center gap-2">
                  <Plus className="w-4 h-4 text-purple-500" />
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

                <div>
                  <label className="block text-xs font-bold text-navy-700 dark:text-[var(--dk-text-1)] mb-1">مستوى الصعوبة</label>
                  <div className="flex gap-2">
                    {DIFFICULTIES.map(d => (
                      <button key={d.value} type="button" onClick={() => setQForm({ ...qForm, difficulty: d.value })}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-lg border-2 transition-all ${qForm.difficulty === d.value ? `${d.color} shadow-sm` : 'border-gray-200 dark:border-[var(--dk-border)] text-gray-500 dark:text-[var(--dk-text-3)] hover:border-gray-300'}`}>{d.label}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-navy-700 dark:text-[var(--dk-text-1)] mb-1">نوع السؤال</label>
                  <select value={qForm.question_type} onChange={e => { setQForm({ ...qForm, question_type: e.target.value, option_a: '', option_b: '', correct_answer_letter: 'A' }); }}
                    className="input-field text-sm">
                    {Q_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-navy-700 dark:text-[var(--dk-text-1)] mb-1">
                    نص السؤال <span className="text-gray-400 dark:text-[var(--dk-text-3)] font-normal">(اختياري إذا وُجدت صورة)</span>
                  </label>
                  <RichTextPalette
                    textareaRef={questionTextRef}
                    value={qForm.question_text}
                    onChange={v => setQForm({ ...qForm, question_text: v })}
                    placeholder="اكتب نص السؤال هنا... (حدد أي جزء من النص لتغيير لونه أو تنسيقه)"
                    minHeight={70}
                    accentColor="purple"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-navy-700 dark:text-[var(--dk-text-1)] mb-1">صورة السؤال (اختياري)</label>
                  <div className="flex gap-2 mb-2">
                    <button type="button" onClick={() => setImageInputMode('url')} className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all flex items-center gap-1 ${imageInputMode === 'url' ? 'bg-navy-600 text-white border-navy-600' : 'bg-white dark:bg-[var(--dk-elevated)] text-gray-600 dark:text-[var(--dk-text-2)] border-gray-300 dark:border-[var(--dk-border)] hover:border-navy-400'}`}>
                      <Link className="w-3 h-3" /> رابط
                    </button>
                    <button type="button" onClick={() => setImageInputMode('file')} className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all flex items-center gap-1 ${imageInputMode === 'file' ? 'bg-navy-600 text-white border-navy-600' : 'bg-white dark:bg-[var(--dk-elevated)] text-gray-600 dark:text-[var(--dk-text-2)] border-gray-300 dark:border-[var(--dk-border)] hover:border-navy-400'}`}>
                      <Upload className="w-3 h-3" /> رفع ملف
                    </button>
                  </div>
                  {imageInputMode === 'url' ? (
                    <input value={qForm.question_image_url} onChange={e => { setQForm({ ...qForm, question_image_url: e.target.value }); setImagePreview(e.target.value); }}
                      className="input-field text-sm" placeholder="https://..." />
                  ) : (
                    <div className="space-y-2">
                      <input type="file" accept="image/*" ref={imageFileRef}
                        onChange={e => { const f = e.target.files[0]; if (f) { setImageFile(f); setImagePreview(URL.createObjectURL(f)); } }}
                        className="input-field text-sm" />
                      {uploadProgress > 0 && uploadProgress < 100 && (
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div className="bg-purple-500 h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                        </div>
                      )}
                    </div>
                  )}
                  {imagePreview && <img src={imagePreview} alt="" className="mt-2 max-h-32 rounded-lg border border-gray-200" />}
                </div>

                {isTF ? (
                  <div>
                    <label className="block text-xs font-bold text-navy-700 dark:text-[var(--dk-text-1)] mb-1">الإجابة الصحيحة</label>
                    <div className="flex gap-2">
                      {[{ v: 'A', l: 'صح ✅' }, { v: 'B', l: 'خطأ ❌' }].map(({ v, l }) => (
                        <button key={v} type="button" onClick={() => setQForm({ ...qForm, correct_answer_letter: v })}
                          className={`flex-1 py-2 rounded-xl border-2 font-bold text-sm transition-all ${qForm.correct_answer_letter === v ? 'border-green-500 bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300' : 'border-gray-200 dark:border-[var(--dk-border)] text-gray-600 dark:text-[var(--dk-text-2)] hover:border-gray-300'}`}>{l}</button>
                      ))}
                    </div>
                  </div>
                ) : qForm.question_type === 'image_multi' ? (
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
                                        ? 'bg-purple-600 text-white border-purple-600'
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
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-navy-700 dark:text-[var(--dk-text-1)]">الخيارات (حدد الصحيح ✅)</label>
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
                            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-black flex-shrink-0 transition-all ${qForm.correct_answer_letter === opt ? 'border-green-500 bg-green-500 text-white' : 'border-gray-300 dark:border-[var(--dk-border)] hover:border-green-400 text-gray-600 dark:text-[var(--dk-text-2)]'}`}>
                            {displayLabel}
                          </button>
                          <CompactOptionFormatter
                            value={qForm[`option_${opt.toLowerCase()}`] || ''}
                            onChange={v => setQForm({ ...qForm, [`option_${opt.toLowerCase()}`]: v })}
                            placeholder={`الخيار ${displayLabel}${opt === 'A' || opt === 'B' ? ' *' : ' (اختياري)'}`}
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
                              className="w-full text-center text-xs rounded border border-gray-300 dark:border-[var(--dk-border)] py-1 bg-white dark:bg-[var(--dk-elevated)] dark:text-[var(--dk-text-1)] focus:outline-none focus:ring-1 focus:ring-purple-500"
                              maxLength={20}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-navy-700 dark:text-[var(--dk-text-1)] mb-1">النقاط</label>
                  <input type="number" min={1} value={qForm.points}
                    onChange={e => setQForm({ ...qForm, points: parseInt(e.target.value) || 1 })}
                    className="input-field text-sm" disabled={qForm.question_type === 'image_multi'} />
                </div>

                <div className="flex gap-2 pt-1 border-t border-gray-100 dark:border-[var(--dk-border)]">
                  {editQ && (
                    <button type="button" onClick={resetQForm}
                      className="btn-secondary px-4 py-2 text-sm flex-shrink-0">
                      إلغاء
                    </button>
                  )}
                  <button type="submit"
                    disabled={addQMut.isPending || updateQMut.isPending}
                    className="btn-primary flex-1 flex items-center justify-center gap-2">
                    {editQ ? 'تعديل السؤال' : <><Plus className="w-4 h-4" /> إضافة السؤال</>}
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
        message="هل أنت متأكد من حذف هذا السؤال من البنك نهائياً؟"
        danger
      />

      <CsvImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        mode="bank"
        targetId={bankId}
        onSuccess={() => qc.invalidateQueries({ queryKey: ['bank-questions', bankId] })}
      />
    </div>
  );
}
