import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookMarked, Plus, Pencil, Trash2, ChevronDown, ChevronUp, Upload, Link, BookOpen, Layers, X } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import MathText from '../../components/MathText';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const emptyBank = { name: '', course_id: '' };
const emptyQ = { question_text: '', question_image_url: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer_letter: 'A', points: 1, question_type: 'mcq', difficulty: 'medium', group_id: null, group_context: '', group_context_image: '', sub_questions: [] };

const DIFFICULTIES = [
  { value: 'easy',   label: 'سهل',   color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'medium', label: 'متوسط', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'hard',   label: 'صعب',   color: 'bg-red-100 text-red-700 border-red-300' },
];

const difficultyBadge = (d) => {
  const map = { easy: { label: 'سهل 🟢', cls: 'bg-green-100 text-green-700' }, medium: { label: 'متوسط 🟡', cls: 'bg-yellow-100 text-yellow-700' }, hard: { label: 'صعب 🔴', cls: 'bg-red-100 text-red-700' } };
  return map[d] || map['medium'];
};

const Q_TYPES = [
  { value: 'mcq', label: '🔘 اختيار متعدد (MCQ)' },
  { value: 'true_false', label: '✅ صح / خطأ' },
  { value: 'image_multi', label: '🖼 صورة مع أسئلة' },
];

export default function QuestionBanks() {
  const qc = useQueryClient();
  const [bankModal, setBankModal] = useState(false);
  const [editBank, setEditBank] = useState(null);
  const [bankForm, setBankForm] = useState(emptyBank);
  const [deleteBankId, setDeleteBankId] = useState(null);
  const [expandedBank, setExpandedBank] = useState(null);
  const [qForm, setQForm] = useState(emptyQ);
  const [editQ, setEditQ] = useState(null);
  const [deleteQId, setDeleteQId] = useState(null);
  const [imageInputMode, setImageInputMode] = useState('url');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const imageFileRef = useRef(null);

  // grouped-question state (kept for rendering existing grouped questions)
  const [isGrouped] = useState(false);
  const [nextGroupId, setNextGroupId] = useState(() => Date.now());
  const [ctxImageInputMode, setCtxImageInputMode] = useState('url');
  const [ctxImageFile, setCtxImageFile] = useState(null);
  const [ctxImagePreview, setCtxImagePreview] = useState('');
  const [ctxUploadProgress, setCtxUploadProgress] = useState(0);
  const ctxImageFileRef = useRef(null);

  // image_multi sub-questions count
  const [imgMultiCount, setImgMultiCount] = useState(5);

  const { data: banks = [], isLoading } = useQuery({
    queryKey: ['question-banks'],
    queryFn: () => api.get('/question-banks').then(r => r.data),
  });

  const { data: courses = [] } = useQuery({
    queryKey: ['courses'],
    queryFn: () => api.get('/courses').then(r => r.data),
  });

  const { data: bankQuestions = [] } = useQuery({
    queryKey: ['bank-questions', expandedBank],
    queryFn: () => api.get(`/question-banks/${expandedBank}/questions`).then(r => r.data),
    enabled: !!expandedBank,
  });

  const createBankMut = useMutation({
    mutationFn: (data) => api.post('/question-banks', data),
    onSuccess: () => { qc.invalidateQueries(['question-banks']); toast.success('تم إنشاء البنك'); closeBankModal(); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const updateBankMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/question-banks/${id}`, data),
    onSuccess: () => { qc.invalidateQueries(['question-banks']); toast.success('تم تحديث البنك'); closeBankModal(); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const deleteBankMut = useMutation({
    mutationFn: (id) => api.delete(`/question-banks/${id}`),
    onSuccess: () => { qc.invalidateQueries(['question-banks']); toast.success('تم حذف البنك'); setDeleteBankId(null); if (expandedBank === deleteBankId) setExpandedBank(null); },
  });

  const addQMut = useMutation({
    mutationFn: ({ bankId, data }) => api.post(`/question-banks/${bankId}/questions`, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries(['bank-questions', expandedBank]);
      qc.invalidateQueries(['question-banks']);
      toast.success('تم إضافة السؤال');
      if (vars.data.group_id) {
        // keep context and group_id so sibling questions can be added
        setQForm(prev => ({
          ...emptyQ,
          group_id: prev.group_id,
          group_context: prev.group_context,
          group_context_image: prev.group_context_image,
        }));
        setEditQ(null);
        setImageFile(null); setImagePreview(''); setImageInputMode('url');
        if (imageFileRef.current) imageFileRef.current.value = '';
        setCtxImageFile(null);
        if (ctxImageFileRef.current) ctxImageFileRef.current.value = '';
      } else {
        resetQForm();
      }
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const updateQMut = useMutation({
    mutationFn: ({ qid, data }) => api.put(`/question-banks/questions/${qid}`, data),
    onSuccess: () => { qc.invalidateQueries(['bank-questions', expandedBank]); toast.success('تم تحديث السؤال'); resetQForm(); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const deleteQMut = useMutation({
    mutationFn: (qid) => api.delete(`/question-banks/questions/${qid}`),
    onSuccess: () => { qc.invalidateQueries(['bank-questions', expandedBank]); qc.invalidateQueries(['question-banks']); toast.success('تم حذف السؤال'); setDeleteQId(null); },
  });

  const openAddBank = () => { setEditBank(null); setBankForm(emptyBank); setBankModal(true); };
  const openEditBank = (bank) => { setEditBank(bank); setBankForm({ name: bank.name, course_id: bank.course_id ? String(bank.course_id) : '' }); setBankModal(true); };
  const closeBankModal = () => { setBankModal(false); setEditBank(null); setBankForm(emptyBank); };

  const handleBankSubmit = (e) => {
    e.preventDefault();
    if (!bankForm.name.trim()) return toast.error('اسم البنك مطلوب');
    if (editBank) updateBankMut.mutate({ id: editBank.id, data: bankForm });
    else createBankMut.mutate(bankForm);
  };

  const resetQForm = () => {
    setQForm(emptyQ);
    setEditQ(null);
    setImageFile(null);
    setImagePreview('');
    setImageInputMode('url');
    setCtxImageFile(null);
    setCtxImagePreview('');
    setCtxImageInputMode('url');
    if (imageFileRef.current) imageFileRef.current.value = '';
    if (ctxImageFileRef.current) ctxImageFileRef.current.value = '';
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
      group_id: q.group_id || null,
      group_context: q.group_context || '',
      group_context_image: q.group_context_image || '',
      sub_questions: Array.isArray(q.sub_questions) ? q.sub_questions : [],
    });
    setImagePreview(q.question_image_url || '');
    setImageInputMode('url');
    setCtxImagePreview(q.group_context_image || '');
    setCtxImageInputMode('url');
    if (q.sub_questions?.length) setImgMultiCount(q.sub_questions.length);
  };

  const handleQSubmit = async (e) => {
    e.preventDefault();
    let finalImageUrl = qForm.question_image_url || '';
    let finalCtxImageUrl = qForm.group_context_image || '';

    if (imageFile) {
      const fd = new FormData();
      fd.append('image', imageFile);
      try {
        setUploadProgress(1);
        const res = await api.post('/question-banks/upload-image', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (evt) => { if (evt.total) setUploadProgress(Math.round((evt.loaded / evt.total) * 100)); },
        });
        finalImageUrl = res.data.url;
        setUploadProgress(100);
        setTimeout(() => setUploadProgress(0), 800);
      } catch {
        setUploadProgress(0);
        return toast.error('فشل رفع الصورة');
      }
    }

    if (ctxImageFile) {
      const fd = new FormData();
      fd.append('image', ctxImageFile);
      try {
        setCtxUploadProgress(1);
        const res = await api.post('/question-banks/upload-image', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (evt) => { if (evt.total) setCtxUploadProgress(Math.round((evt.loaded / evt.total) * 100)); },
        });
        finalCtxImageUrl = res.data.url;
        setCtxUploadProgress(100);
        setTimeout(() => setCtxUploadProgress(0), 800);
      } catch {
        setCtxUploadProgress(0);
        return toast.error('فشل رفع صورة السياق');
      }
    }

    let finalGroupId = qForm.group_id;
    if (isGrouped && !finalGroupId && !editQ) {
      finalGroupId = nextGroupId;
      setNextGroupId(Date.now());
    }

    const finalForm = { ...qForm, question_image_url: finalImageUrl, group_context_image: finalCtxImageUrl, group_id: finalGroupId };
    if (!finalForm.question_text && !finalImageUrl) return toast.error('أدخل نص السؤال أو صورة');
    if (finalForm.question_type === 'image_multi') {
      if (!Array.isArray(finalForm.sub_questions) || finalForm.sub_questions.length === 0)
        return toast.error('يجب توليد الأسئلة الفرعية أولاً');
      finalForm.option_a = 'A'; finalForm.option_b = 'B'; finalForm.option_c = 'C'; finalForm.option_d = 'D';
      finalForm.correct_answer_letter = 'A';
    } else if (finalForm.question_type === 'mcq' && (!finalForm.option_a || !finalForm.option_b)) {
      return toast.error('الخيار الأول والثاني مطلوبان');
    }
    if (editQ) updateQMut.mutate({ qid: editQ.id, data: finalForm });
    else addQMut.mutate({ bankId: expandedBank, data: finalForm });
  };

  const toggleBank = (id) => {
    if (id !== expandedBank) resetQForm();
    setExpandedBank(expandedBank === id ? null : id);
  };

  const isTF = qForm.question_type === 'true_false';

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h1 className="text-xl sm:text-2xl font-black text-navy-600 flex items-center gap-2">
          <BookMarked className="w-6 h-6 sm:w-7 sm:h-7 text-purple-500 flex-shrink-0" /> بنوك الأسئلة
          <span className="text-sm font-semibold text-gray-600">({banks.length})</span>
        </h1>
        <button onClick={openAddBank} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> إضافة بنك
        </button>
      </div>

      <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 text-sm text-purple-800 font-medium">
        💡 <strong>ما هو بنك الأسئلة؟</strong> — بنك أسئلة هو مجموعة كبيرة من الأسئلة يمكنك ربطها بأي اختبار؛ عند إنشاء اختبار، تختار بنكاً وتحدد كم سؤال يُسحب منه عشوائياً لكل طالب.
      </div>

      {isLoading ? (
        [...Array(2)].map((_, i) => <div key={i} className="card h-20 animate-pulse bg-gray-100" />)
      ) : banks.length === 0 ? (
        <div className="card text-center py-16">
          <BookMarked className="w-16 h-16 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium">لا توجد بنوك أسئلة بعد</p>
          <button onClick={openAddBank} className="btn-primary mt-4 mx-auto flex items-center gap-2">
            <Plus className="w-4 h-4" /> إضافة أول بنك
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {banks.map(bank => (
            <div key={bank.id} className="card !p-0 overflow-hidden">
              <div className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-700 rounded-xl flex items-center justify-center flex-shrink-0">
                  <BookMarked className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-navy-700 text-lg">{bank.name}</h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {bank.course_name && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">
                        <BookOpen className="w-3 h-3" />{bank.course_name}
                      </span>
                    )}
                    <span className="text-xs text-gray-500 font-medium">{bank.question_count} سؤال</span>
                    <span className="text-xs font-bold px-2 py-0.5 bg-green-100 text-green-700 rounded-full">{bank.easy_count || 0} سهل</span>
                    <span className="text-xs font-bold px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">{bank.medium_count || 0} متوسط</span>
                    <span className="text-xs font-bold px-2 py-0.5 bg-red-100 text-red-700 rounded-full">{bank.hard_count || 0} صعب</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEditBank(bank)} className="p-2 text-gray-500 hover:text-navy-600 hover:bg-navy-50 rounded-lg transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeleteBankId(bank.id)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => toggleBank(bank.id)} className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors">
                    {expandedBank === bank.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {expandedBank === bank.id && (
                <div className="border-t border-gray-100 p-4 space-y-4">
                  {bankQuestions.length > 0 && (
                    <div className="space-y-3">
                      {(() => {
                        // Build display list: singles + groups
                        const groups = {};
                        const displayList = [];
                        bankQuestions.forEach(q => {
                          if (q.group_id) {
                            if (!groups[q.group_id]) {
                              groups[q.group_id] = { type: 'group', group_id: q.group_id, questions: [], context: q.group_context, contextImage: q.group_context_image };
                              displayList.push(groups[q.group_id]);
                            }
                            groups[q.group_id].questions.push(q);
                          } else {
                            displayList.push({ type: 'single', q });
                          }
                        });

                        let counter = 0;
                        return displayList.map((entry, ei) => {
                          if (entry.type === 'single') {
                            counter++;
                            const q = entry.q;
                            const num = counter;
                            const d = difficultyBadge(q.difficulty);
                            return (
                              <div key={q.id} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                                      <span className="text-xs font-black bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{num}</span>
                                      <span className="text-xs text-gray-500 font-medium">{q.question_type === 'true_false' ? 'صح/خطأ' : q.question_type === 'image_multi' ? 'صورة+أسئلة' : 'MCQ'} · {q.points} نقطة</span>
                                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${d.cls}`}>{d.label}</span>
                                    </div>
                                    {q.question_image_url && <img src={q.question_image_url} alt="" className="max-h-32 rounded-lg mb-2 border border-gray-200" />}
                                    {q.question_text && <p className="font-semibold text-navy-700 text-sm mb-2"><MathText text={q.question_text} /></p>}
                                    <div className="grid grid-cols-2 gap-1.5">
                                      {['a','b','c','d'].map(opt => q[`option_${opt}`] && (
                                        <div key={opt} className={`px-2 py-1 rounded-lg text-xs font-medium border ${q.correct_answer_letter?.toUpperCase() === opt.toUpperCase() ? 'border-green-400 bg-green-50 text-green-800 font-bold' : 'border-gray-200 text-gray-600'}`}>
                                          <span className="font-black ml-1">{opt.toUpperCase()}.</span>{q[`option_${opt}`]}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="flex gap-1 flex-shrink-0">
                                    <button onClick={() => startEditQ(q)} className="p-1.5 text-gray-400 hover:text-navy-600 hover:bg-white rounded-lg transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => setDeleteQId(q.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          // group entry
                          const startNum = counter + 1;
                          counter += entry.questions.length;
                          return (
                            <div key={`grp-${entry.group_id}`} className="rounded-xl border-2 border-blue-200 bg-blue-50/30 overflow-hidden">
                              <div className="px-3 py-2 bg-blue-100 border-b border-blue-200 flex items-center gap-2">
                                <Layers className="w-3.5 h-3.5 text-blue-700" />
                                <span className="text-xs font-black text-blue-800">مجموعة أسئلة — {entry.questions.length} سؤال</span>
                                <span className="text-[10px] text-blue-600 mr-auto">س{startNum} – س{startNum + entry.questions.length - 1}</span>
                              </div>
                              {(entry.context || entry.contextImage) && (
                                <div className="px-3 pt-2 pb-2 border-b border-blue-200">
                                  {entry.contextImage && <img src={entry.contextImage} alt="" className="max-h-32 rounded-lg border border-blue-200 w-full object-contain mb-2" />}
                                  {entry.context && <p className="text-xs text-navy-700 leading-relaxed whitespace-pre-wrap bg-white rounded-lg px-2 py-1.5 border border-blue-100"><MathText text={entry.context} /></p>}
                                </div>
                              )}
                              <div className="p-2 space-y-2">
                                {entry.questions.map((q, si) => {
                                  const d = difficultyBadge(q.difficulty);
                                  return (
                                    <div key={q.id} className="bg-white rounded-lg p-3 border border-blue-100">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                            <span className="text-xs font-black text-blue-700">س{startNum + si}</span>
                                            <span className="text-xs text-gray-500 font-medium">{q.question_type === 'true_false' ? 'صح/خطأ' : q.question_type === 'image_multi' ? 'صورة+أسئلة' : 'MCQ'} · {q.points} نقطة</span>
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${d.cls}`}>{d.label}</span>
                                          </div>
                                          {q.question_image_url && <img src={q.question_image_url} alt="" className="max-h-24 rounded-lg mb-1.5 border border-gray-200" />}
                                          {q.question_text && <p className="font-semibold text-navy-700 text-sm mb-1.5"><MathText text={q.question_text} /></p>}
                                          <div className="grid grid-cols-2 gap-1">
                                            {['a','b','c','d'].map(opt => q[`option_${opt}`] && (
                                              <div key={opt} className={`px-2 py-0.5 rounded-lg text-xs font-medium border ${q.correct_answer_letter?.toUpperCase() === opt.toUpperCase() ? 'border-green-400 bg-green-50 text-green-800 font-bold' : 'border-gray-200 text-gray-600'}`}>
                                                <span className="font-black ml-1">{opt.toUpperCase()}.</span>{q[`option_${opt}`]}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                        <div className="flex gap-1 flex-shrink-0">
                                          <button onClick={() => startEditQ(q)} className="p-1.5 text-gray-400 hover:text-navy-600 hover:bg-gray-100 rounded-lg transition-colors"><Pencil className="w-3 h-3" /></button>
                                          <button onClick={() => setDeleteQId(q.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3 h-3" /></button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}

                  <div className="bg-white border-2 border-dashed border-purple-300 rounded-2xl p-4 space-y-3">
                    <h4 className="font-black text-purple-700 text-sm flex items-center gap-1.5">
                      <Plus className="w-4 h-4" /> {editQ ? 'تعديل السؤال' : 'إضافة سؤال جديد'}
                    </h4>
                    <form onSubmit={handleQSubmit} className="space-y-3">


                      {/* ── Group context ── */}
                      {(isGrouped || (editQ && editQ.group_id)) && (
                        <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-3 space-y-2">
                          <p className="text-xs font-black text-blue-800 flex items-center gap-1">
                            <Layers className="w-3 h-3" /> السياق المشترك للمجموعة
                          </p>
                          <textarea value={qForm.group_context}
                            onChange={e => setQForm({ ...qForm, group_context: e.target.value })}
                            className="input-field text-xs resize-none h-16" placeholder="النص المشترك (اختياري)..." />
                          <div className="flex gap-2 mb-1">
                            <button type="button"
                              onClick={() => { setCtxImageInputMode('url'); setCtxImageFile(null); setCtxImagePreview(''); }}
                              className={`px-2 py-1 text-[10px] font-bold rounded-lg border transition-all flex items-center gap-1 ${ctxImageInputMode === 'url' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}>
                              <Link className="w-2.5 h-2.5" /> رابط
                            </button>
                            <button type="button"
                              onClick={() => { setCtxImageInputMode('file'); setQForm({ ...qForm, group_context_image: '' }); }}
                              className={`px-2 py-1 text-[10px] font-bold rounded-lg border transition-all flex items-center gap-1 ${ctxImageInputMode === 'file' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}>
                              <Upload className="w-2.5 h-2.5" /> رفع صورة
                            </button>
                          </div>
                          {ctxImageInputMode === 'url' ? (
                            <input value={qForm.group_context_image || ''} onChange={e => setQForm({ ...qForm, group_context_image: e.target.value })}
                              className="input-field text-xs" placeholder="رابط صورة السياق..." dir="ltr" />
                          ) : (
                            <input ref={ctxImageFileRef} type="file" accept="image/*"
                              onChange={e => { const f = e.target.files[0]; if (f) { setCtxImageFile(f); setCtxImagePreview(URL.createObjectURL(f)); } else { setCtxImageFile(null); setCtxImagePreview(''); } }}
                              className="block w-full text-xs text-gray-600 file:mr-1 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-blue-100 file:text-blue-700 border border-gray-200 rounded-xl p-1.5 cursor-pointer" />
                          )}
                          {ctxUploadProgress > 0 && ctxUploadProgress < 100 && (
                            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                              <div className="h-1.5 bg-blue-500 rounded-full transition-all" style={{ width: `${ctxUploadProgress}%` }} />
                            </div>
                          )}
                          {(ctxImagePreview || qForm.group_context_image) && (
                            <img src={ctxImagePreview || qForm.group_context_image} alt="" className="max-h-24 rounded-lg border border-blue-200 w-full object-contain" onError={e => e.target.style.display='none'} />
                          )}
                          {!editQ && qForm.group_id && (
                            <div className="flex items-center gap-2 pt-1">
                              <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-1 rounded-lg flex-1 text-center">📎 تضيف إلى نفس المجموعة</span>
                              <button type="button"
                                onClick={() => { setQForm(prev => ({ ...emptyQ, group_context: prev.group_context, group_context_image: prev.group_context_image })); setNextGroupId(Date.now()); }}
                                className="text-[10px] font-bold text-orange-700 bg-orange-100 px-2 py-1 rounded-lg flex items-center gap-1">
                                <X className="w-2.5 h-2.5" /> مجموعة جديدة
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">نوع السؤال</label>
                        <select value={qForm.question_type} onChange={e => { setQForm({ ...qForm, question_type: e.target.value, option_a: '', option_b: '', correct_answer_letter: 'A' }); }}
                          className="input-field text-sm">
                          {Q_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">نص السؤال</label>
                        <textarea value={qForm.question_text} onChange={e => setQForm({ ...qForm, question_text: e.target.value })}
                          className="input-field text-sm resize-none" rows={2} placeholder="اكتب نص السؤال هنا..." />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">صورة السؤال (اختياري)</label>
                        <div className="flex gap-2 mb-2">
                          <button type="button" onClick={() => setImageInputMode('url')} className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all flex items-center gap-1 ${imageInputMode === 'url' ? 'bg-navy-600 text-white border-navy-600' : 'bg-white text-gray-600 border-gray-300 hover:border-navy-400'}`}>
                            <Link className="w-3 h-3" /> رابط
                          </button>
                          <button type="button" onClick={() => setImageInputMode('file')} className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all flex items-center gap-1 ${imageInputMode === 'file' ? 'bg-navy-600 text-white border-navy-600' : 'bg-white text-gray-600 border-gray-300 hover:border-navy-400'}`}>
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
                          <label className="block text-xs font-bold text-gray-600 mb-1">الإجابة الصحيحة</label>
                          <div className="flex gap-2">
                            {[{ v: 'A', l: 'صح ✅' }, { v: 'B', l: 'خطأ ❌' }].map(({ v, l }) => (
                              <button key={v} type="button" onClick={() => setQForm({ ...qForm, correct_answer_letter: v })}
                                className={`flex-1 py-2 rounded-xl border-2 font-bold text-sm transition-all ${qForm.correct_answer_letter === v ? 'border-green-500 bg-green-50 text-green-800' : 'border-gray-200 hover:border-gray-300'}`}>{l}</button>
                            ))}
                          </div>
                        </div>
                      ) : qForm.question_type === 'image_multi' ? (
                        <div>
                          <label className="block text-xs font-bold text-navy-700 mb-2">الأسئلة الفرعية</label>
                          <div className="flex items-center gap-2 mb-3">
                            <input type="number" min={1} max={50} value={imgMultiCount}
                              onChange={e => setImgMultiCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                              className="input-field w-20 text-sm" placeholder="العدد" />
                            <button type="button"
                              onClick={() => {
                                const subs = Array.from({ length: imgMultiCount }, (_, i) => ({
                                  label: String(i + 1), correct: 'A'
                                }));
                                setQForm(f => ({ ...f, sub_questions: subs }));
                              }}
                              className="btn-primary px-3 py-1.5 text-sm">توليد</button>
                            {(qForm.sub_questions || []).length > 0 && (
                              <span className="text-xs text-gray-500 font-semibold">{(qForm.sub_questions || []).length} سؤال</span>
                            )}
                          </div>
                          {(qForm.sub_questions || []).length > 0 && (
                            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                              {(qForm.sub_questions || []).map((sub, idx) => (
                                <div key={sub.label} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
                                  <span className="text-xs font-black text-navy-600 w-5 flex-shrink-0">{sub.label}</span>
                                  <div className="flex gap-1 flex-1">
                                    {['A', 'B', 'C', 'D'].map(letter => (
                                      <button key={letter} type="button"
                                        onClick={() => {
                                          const updated = [...qForm.sub_questions];
                                          updated[idx] = { ...updated[idx], correct: letter };
                                          setQForm(f => ({ ...f, sub_questions: updated }));
                                        }}
                                        className={`flex-1 py-1 rounded text-xs font-bold border transition-all ${
                                          sub.correct === letter
                                            ? 'bg-green-600 text-white border-green-600'
                                            : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                                        }`}>
                                        {letter}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-gray-600">الخيارات (حدد الصحيح ✅)</label>
                          {['A', 'B', 'C', 'D'].map(opt => (
                            <div key={opt} className="flex items-center gap-2">
                              <button type="button" onClick={() => setQForm({ ...qForm, correct_answer_letter: opt })}
                                className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-black flex-shrink-0 transition-all ${qForm.correct_answer_letter === opt ? 'border-green-500 bg-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}>
                                {opt}
                              </button>
                              <input value={opt === 'A' ? qForm.option_a : opt === 'B' ? qForm.option_b : opt === 'C' ? qForm.option_c : qForm.option_d}
                                onChange={e => setQForm({ ...qForm, [`option_${opt.toLowerCase()}`]: e.target.value })}
                                className="input-field text-sm flex-1" placeholder={`الخيار ${opt}${opt === 'A' || opt === 'B' ? ' *' : ' (اختياري)'}`} />
                            </div>
                          ))}
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">مستوى الصعوبة</label>
                        <div className="flex gap-2">
                          {DIFFICULTIES.map(d => (
                            <button key={d.value} type="button"
                              onClick={() => setQForm({ ...qForm, difficulty: d.value })}
                              className={`flex-1 py-2 rounded-xl border-2 font-bold text-sm transition-all ${qForm.difficulty === d.value ? `${d.color} border-current` : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                              {d.value === 'easy' ? '🟢' : d.value === 'medium' ? '🟡' : '🔴'} {d.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">النقاط</label>
                        <input type="number" min="1" value={qForm.points} onChange={e => setQForm({ ...qForm, points: parseInt(e.target.value) || 1 })} className="input-field text-sm w-24" />
                      </div>

                      <div className="flex gap-2">
                        <button type="submit" disabled={addQMut.isPending || updateQMut.isPending} className="btn-primary text-sm">
                          {editQ ? 'حفظ التعديل' : '+ إضافة سؤال'}
                        </button>
                        {editQ && (
                          <button type="button" onClick={resetQForm} className="btn-secondary text-sm">إلغاء</button>
                        )}
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={bankModal} onClose={closeBankModal} title={editBank ? 'تعديل بنك الأسئلة' : 'إضافة بنك أسئلة جديد'}>
        <form onSubmit={handleBankSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">اسم البنك *</label>
            <input value={bankForm.name} onChange={e => setBankForm({ ...bankForm, name: e.target.value })} className="input-field" placeholder="مثال: بنك أسئلة الجبر — الصف الثالث الثانوي" />
          </div>
          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">الكورس (اختياري)</label>
            {courses.length === 0 ? (
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">لا توجد كورسات بعد — يمكنك إنشاء البنك بدون كورس</p>
            ) : (
              <select value={bankForm.course_id} onChange={e => setBankForm({ ...bankForm, course_id: e.target.value })} className="input-field">
                <option value="">— بدون كورس محدد —</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.name}{c.target_stage ? ` — ${c.target_stage}` : ''}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={createBankMut.isPending || updateBankMut.isPending} className="btn-primary flex-1">
              {editBank ? 'حفظ التعديلات' : 'إنشاء البنك'}
            </button>
            <button type="button" onClick={closeBankModal} className="btn-secondary flex-1">إلغاء</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteBankId} onClose={() => setDeleteBankId(null)}
        onConfirm={() => deleteBankMut.mutate(deleteBankId)}
        title="حذف بنك الأسئلة"
        message="سيتم حذف البنك وجميع أسئلته نهائياً. هل أنت متأكد؟"
        confirmLabel="حذف" danger />

      <ConfirmDialog open={!!deleteQId} onClose={() => setDeleteQId(null)}
        onConfirm={() => deleteQMut.mutate(deleteQId)}
        title="حذف السؤال"
        message="سيتم حذف هذا السؤال من البنك نهائياً. هل أنت متأكد؟"
        confirmLabel="حذف" danger />
    </div>
  );
}
