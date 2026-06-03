import React, { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, FileText, HelpCircle, Plus, Pencil, Trash2,
  AlertCircle, Link, Upload, Layers, X,
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import MathText from '../../components/MathText';
import MathToolbar from '../../components/MathToolbar';

const QUESTION_TYPES = [
  { value: 'mcq', label: '🔘 اختيار متعدد (MCQ)' },
  { value: 'true_false', label: '✅ صح / خطأ' },
];

const emptyQ = {
  question_text: '', question_image_url: '',
  option_a: '', option_b: '', option_c: '', option_d: '',
  correct_answer_letter: 'A', points: 1, question_type: 'mcq',
  group_id: null, group_context: '', group_context_image: '',
};

const qTypeLabel = (t) => ({ mcq: 'MCQ', true_false: 'صح/خطأ' })[t] || 'MCQ';


export default function ExamQuestions() {
  const { teacherSlug, examId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const baseRole = user?.role === 'assistant' ? 'assistant' : 'teacher';

  // ── form state ────────────────────────────────────────────────────────────
  const [qForm, setQForm] = useState(emptyQ);
  const [editQ, setEditQ] = useState(null);
  const [deleteQId, setDeleteQId] = useState(null);
  const [imageInputMode, setImageInputMode] = useState('url');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const imageFileRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const questionTextRef = useRef(null);

  // context image upload state
  const [ctxImageInputMode, setCtxImageInputMode] = useState('url');
  const [ctxImageFile, setCtxImageFile] = useState(null);
  const [ctxImagePreview, setCtxImagePreview] = useState('');
  const [ctxUploadProgress, setCtxUploadProgress] = useState(0);
  const ctxImageFileRef = useRef(null);

  // grouped-question mode
  const [isGrouped, setIsGrouped] = useState(false);
  // nextGroupId is kept across submissions so sibling questions share the same group_id
  const [nextGroupId, setNextGroupId] = useState(() => Date.now());

  const { data: exam } = useQuery({
    queryKey: ['exam-single', examId],
    queryFn: () => api.get('/exams').then(r => (r.data || []).find(e => String(e.id) === String(examId))),
  });

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ['questions', examId],
    queryFn: () => api.get(`/exams/${examId}/questions`).then(r => r.data),
  });

  const resetQForm = () => {
    setEditQ(null);
    setQForm(emptyQ);
    setImageFile(null);
    setImagePreview('');
    setImageInputMode('url');
    setCtxImageFile(null);
    setCtxImagePreview('');
    setCtxImageInputMode('url');
    setIsGrouped(false);
    if (imageFileRef.current) imageFileRef.current.value = '';
    if (ctxImageFileRef.current) ctxImageFileRef.current.value = '';
  };

  const addQMut = useMutation({
    mutationFn: (data) => api.post(`/exams/${examId}/questions`, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries(['questions', examId]);
      qc.invalidateQueries(['exams']);
      toast.success('تم إضافة السؤال ✅');
      // if grouped: keep context fields & group_id, only clear per-question fields
      if (vars.group_id) {
        setQForm(prev => ({
          ...emptyQ,
          group_id: prev.group_id,
          group_context: prev.group_context,
          group_context_image: prev.group_context_image,
        }));
        setImageFile(null); setImagePreview(''); setImageInputMode('url');
        if (imageFileRef.current) imageFileRef.current.value = '';
        // don't reset isGrouped — teacher is still adding sibling questions
      } else {
        resetQForm();
      }
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const updateQMut = useMutation({
    mutationFn: ({ qid, data }) => api.put(`/exams/questions/${qid}`, data),
    onSuccess: () => {
      qc.invalidateQueries(['questions', examId]);
      qc.invalidateQueries(['exams']);
      toast.success('تم تحديث السؤال ✅');
      resetQForm();
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const deleteQMut = useMutation({
    mutationFn: (qid) => api.delete(`/exams/questions/${qid}`),
    onSuccess: () => {
      qc.invalidateQueries(['questions', examId]);
      qc.invalidateQueries(['exams']);
      toast.success('تم حذف السؤال');
      setDeleteQId(null);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  // upload a question image (per-question)
  const uploadQuestionImage = async () => {
    if (!imageFile) return qForm.question_image_url || '';
    const fd = new FormData();
    fd.append('image', imageFile);
    setUploadProgress(1);
    const res = await api.post('/exams/upload-question-image', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (evt) => { if (evt.total) setUploadProgress(Math.round((evt.loaded / evt.total) * 100)); },
    });
    setUploadProgress(100);
    setTimeout(() => setUploadProgress(0), 800);
    return res.data.url;
  };

  // upload group context image
  const uploadCtxImage = async () => {
    if (!ctxImageFile) return qForm.group_context_image || '';
    const fd = new FormData();
    fd.append('image', ctxImageFile);
    setCtxUploadProgress(1);
    const res = await api.post('/exams/upload-question-image', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (evt) => { if (evt.total) setCtxUploadProgress(Math.round((evt.loaded / evt.total) * 100)); },
    });
    setCtxUploadProgress(100);
    setTimeout(() => setCtxUploadProgress(0), 800);
    return res.data.url;
  };

  const handleQSubmit = async (e) => {
    e.preventDefault();

    let finalImageUrl = '';
    let finalCtxImageUrl = '';
    try {
      finalImageUrl = await uploadQuestionImage();
      if (isGrouped || qForm.group_id) finalCtxImageUrl = await uploadCtxImage();
    } catch {
      setUploadProgress(0);
      setCtxUploadProgress(0);
      return toast.error('فشل رفع الصورة، حاول مرة أخرى');
    }

    const finalForm = { ...qForm, question_image_url: finalImageUrl, group_context_image: finalCtxImageUrl };

    if (!finalForm.question_text && !finalImageUrl) return toast.error('أدخل نص السؤال أو ارفع صورة السؤال');
    if (finalForm.question_type === 'mcq' && (!finalForm.option_a || !finalForm.option_b))
      return toast.error('الخياران الأول والثاني مطلوبان');

    if (isGrouped && !finalForm.group_id) {
      // first question of a new group — assign group_id
      const gid = nextGroupId;
      setNextGroupId(Date.now());
      finalForm.group_id = gid;
    }

    if (editQ) updateQMut.mutate({ qid: editQ.id, data: finalForm });
    else addQMut.mutate(finalForm);
  };

  const totalPoints = questions.reduce((s, q) => s + (parseInt(q.points) || 0), 0);
  const examTotal = parseInt(exam?.total_score) || 0;
  const pointsMismatch = questions.length > 0 && examTotal > 0 && totalPoints !== examTotal;

  // ── Group the questions list for display ─────────────────────────────────
  // Each entry is either { type:'single', q } or { type:'group', group_id, questions[] }
  const displayList = (() => {
    const groups = {};
    const result = [];
    questions.forEach(q => {
      if (q.group_id) {
        if (!groups[q.group_id]) {
          groups[q.group_id] = { type: 'group', group_id: q.group_id, questions: [], context: q.group_context, contextImage: q.group_context_image };
          result.push(groups[q.group_id]);
        }
        groups[q.group_id].questions.push(q);
      } else {
        result.push({ type: 'single', q });
      }
    });
    return result;
  })();

  let qCounter = 0;

  return (
    <div className="-m-4 lg:-m-6 h-[calc(100%+2rem)] lg:h-[calc(100%+3rem)] flex flex-col overflow-hidden" dir="rtl">
      {/* Fixed Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 lg:px-6 py-3 flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => navigate(`/${teacherSlug}/${baseRole}/exams`)}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-all font-bold text-sm flex-shrink-0">
            <ArrowRight className="w-4 h-4" />
            <span className="hidden sm:inline">رجوع للاختبارات</span>
          </button>
          <div className="h-5 w-px bg-gray-200 flex-shrink-0" />
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs text-gray-400 font-medium">إدارة أسئلة الاختبار</p>
              <h1 className="font-black text-navy-700 text-xs sm:text-sm truncate">{exam?.title || '...'}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs font-bold text-gray-500 flex items-center gap-1">
              <HelpCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">{questions.length} سؤال</span>
              <span className="sm:hidden">{questions.length}</span>
            </span>
            {examTotal > 0 && (
              <span className={`text-xs font-black px-2 py-1 rounded-lg ${
                pointsMismatch ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
              }`}>
                {totalPoints}/{examTotal}
              </span>
            )}
          </div>
        </div>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0 p-4 lg:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6 items-start">

        {/* Questions List */}
        <div className="lg:col-span-3 space-y-4 order-2 lg:order-1">
          {pointsMismatch && (
            <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-300 rounded-xl text-sm text-amber-800 font-semibold">
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <span>
                ⚠️ مجموع درجات الأسئلة (<span className="font-black">{totalPoints}</span>) لا يساوي المجموع الكلي (<span className="font-black">{examTotal}</span>) — عدّل الدرجات قبل نشر الاختبار
              </span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-orange-500" />
            <h2 className="font-black text-navy-700 text-base">
              الأسئلة
              <span className="mr-2 text-sm font-semibold text-gray-500">({questions.length})</span>
            </h2>
          </div>

          {isLoading ? (
            [...Array(3)].map((_, i) => <div key={i} className="h-24 bg-white rounded-xl animate-pulse border border-gray-100" />)
          ) : questions.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
              <HelpCircle className="w-14 h-14 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-400 font-medium">لا توجد أسئلة بعد — أضف أول سؤال من النموذج</p>
            </div>
          ) : (
            displayList.map((entry, ei) => {
              if (entry.type === 'single') {
                const q = entry.q;
                qCounter++;
                const qNum = qCounter;
                return (
                  <SingleQuestionCard
                    key={q.id}
                    q={q}
                    qNum={qNum}
                    editQ={editQ}
                    onEdit={() => {
                      setEditQ(q);
                      setQForm({ ...q, question_type: q.question_type || 'mcq', group_context: q.group_context || '', group_context_image: q.group_context_image || '' });
                      setIsGrouped(!!q.group_id);
                      setImageFile(null); setImagePreview(''); setImageInputMode(q.question_image_url?.startsWith('/uploads') ? 'file' : 'url');
                      setCtxImageFile(null); setCtxImagePreview(q.group_context_image || ''); setCtxImageInputMode('url');
                      if (imageFileRef.current) imageFileRef.current.value = '';
                      if (ctxImageFileRef.current) ctxImageFileRef.current.value = '';
                      scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    onDelete={() => setDeleteQId(q.id)}
                  />
                );
              }

              // group entry
              const groupStartNum = qCounter + 1;
              qCounter += entry.questions.length;
              return (
                <GroupQuestionCard
                  key={`group-${entry.group_id}`}
                  entry={entry}
                  startNum={groupStartNum}
                  editQ={editQ}
                  onEdit={(q) => {
                    setEditQ(q);
                    setQForm({ ...q, question_type: q.question_type || 'mcq', group_context: q.group_context || '', group_context_image: q.group_context_image || '' });
                    setIsGrouped(true);
                    setImageFile(null); setImagePreview(''); setImageInputMode(q.question_image_url?.startsWith('/uploads') ? 'file' : 'url');
                    setCtxImageFile(null); setCtxImagePreview(q.group_context_image || ''); setCtxImageInputMode('url');
                    if (imageFileRef.current) imageFileRef.current.value = '';
                    if (ctxImageFileRef.current) ctxImageFileRef.current.value = '';
                    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  onDelete={(qid) => setDeleteQId(qid)}
                />
              );
            })
          )}
        </div>

        {/* Add/Edit Question Form */}
        <div className="lg:col-span-2 order-1 lg:order-2 lg:sticky lg:top-4">
          <div className="bg-white rounded-2xl border-2 border-dashed border-orange-300 p-5 shadow-sm">
            <h3 className="font-black text-navy-700 mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4 text-orange-500" />
              {editQ ? 'تعديل السؤال' : 'إضافة سؤال جديد'}
            </h3>
            <form onSubmit={handleQSubmit} className="space-y-4">

              {/* ── Grouped toggle ─────────────────────────────────────── */}
              {!editQ && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 border border-blue-200">
                  <Layers className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-blue-800">سؤال مجمّع (متعدد الأجزاء)</p>
                    <p className="text-[10px] text-blue-600 mt-0.5">صورة أو نص مشترك فوق عدة أسئلة</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isGrouped;
                      setIsGrouped(next);
                      if (!next) {
                        setQForm(prev => ({ ...prev, group_id: null, group_context: '', group_context_image: '' }));
                        setCtxImageFile(null); setCtxImagePreview(''); setCtxImageInputMode('url');
                        if (ctxImageFileRef.current) ctxImageFileRef.current.value = '';
                      }
                    }}
                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${isGrouped ? 'bg-blue-600' : 'bg-gray-300'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${isGrouped ? 'right-0.5' : 'left-0.5'}`} />
                  </button>
                </div>
              )}

              {/* ── Group context fields (shown when grouped) ───────── */}
              {(isGrouped || (editQ && editQ.group_id)) && (
                <div className="rounded-xl border-2 border-blue-300 bg-blue-50 p-3 space-y-3">
                  <p className="text-xs font-black text-blue-800 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" /> السياق المشترك للمجموعة
                  </p>
                  <p className="text-[10px] text-blue-600">النص/الصورة اللي هيظهر فوق كل سؤال في المجموعة دي</p>

                  {/* context text */}
                  <div>
                    <label className="block text-xs font-bold text-blue-800 mb-1">النص المشترك <span className="font-normal text-blue-500">(اختياري)</span></label>
                    <textarea
                      value={qForm.group_context}
                      onChange={e => setQForm({ ...qForm, group_context: e.target.value })}
                      className="input-field h-20 resize-none text-sm"
                      placeholder="مثلاً: اقرأ الفقرة التالية ثم أجب عن الأسئلة..." />
                  </div>

                  {/* context image */}
                  <div>
                    <label className="block text-xs font-bold text-blue-800 mb-1">الصورة المشتركة <span className="font-normal text-blue-500">(اختياري)</span></label>
                    <div className="flex gap-2 mb-2">
                      <button type="button"
                        onClick={() => { setCtxImageInputMode('url'); setCtxImageFile(null); setCtxImagePreview(''); if (ctxImageFileRef.current) ctxImageFileRef.current.value = ''; }}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${ctxImageInputMode === 'url' ? 'border-blue-500 bg-blue-100 text-blue-800' : 'border-gray-200 text-gray-600'}`}>
                        <Link className="w-3 h-3" /> رابط
                      </button>
                      <button type="button"
                        onClick={() => { setCtxImageInputMode('file'); setQForm({ ...qForm, group_context_image: '' }); }}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${ctxImageInputMode === 'file' ? 'border-blue-500 bg-blue-100 text-blue-800' : 'border-gray-200 text-gray-600'}`}>
                        <Upload className="w-3 h-3" /> رفع صورة
                      </button>
                    </div>
                    {ctxImageInputMode === 'url' ? (
                      <>
                        <input value={qForm.group_context_image || ''} onChange={e => setQForm({ ...qForm, group_context_image: e.target.value })}
                          className="input-field text-sm" placeholder="الصق رابط الصورة هنا..." dir="ltr" />
                        {qForm.group_context_image && (
                          <img src={qForm.group_context_image} alt="ctx preview" className="mt-2 h-24 rounded-lg object-contain border border-blue-200 w-full" onError={e => e.target.style.display = 'none'} />
                        )}
                      </>
                    ) : (
                      <>
                        <input ref={ctxImageFileRef} type="file" accept="image/*"
                          onChange={e => { const f = e.target.files[0]; if (f) { setCtxImageFile(f); setCtxImagePreview(URL.createObjectURL(f)); } else { setCtxImageFile(null); setCtxImagePreview(''); } }}
                          className="block w-full text-sm text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200 border border-gray-200 rounded-xl p-2 cursor-pointer"
                        />
                        {ctxUploadProgress > 0 && ctxUploadProgress < 100 && (
                          <div className="mt-2 w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div className="h-2 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all" style={{ width: `${ctxUploadProgress}%` }} />
                          </div>
                        )}
                        {ctxImagePreview && <img src={ctxImagePreview} alt="ctx preview" className="mt-2 h-24 rounded-lg object-contain border border-blue-200 w-full" />}
                      </>
                    )}
                  </div>

                  {/* continue group OR start new group buttons */}
                  {!editQ && qForm.group_id && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-1 rounded-lg flex-1 text-center">
                        📎 أنت تضيف إلى نفس المجموعة
                      </span>
                      <button type="button"
                        onClick={() => { setQForm(prev => ({ ...emptyQ, group_context: prev.group_context, group_context_image: prev.group_context_image })); setNextGroupId(Date.now()); }}
                        className="text-[10px] font-bold text-orange-700 bg-orange-100 px-2 py-1 rounded-lg hover:bg-orange-200 transition-colors flex items-center gap-1">
                        <X className="w-3 h-3" /> مجموعة جديدة
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Question type */}
              <div>
                <label className="block text-xs font-bold text-navy-700 mb-1.5">نوع السؤال</label>
                <div className="flex gap-2 flex-wrap">
                  {QUESTION_TYPES.map(t => (
                    <button key={t.value} type="button"
                      onClick={() => setQForm({ ...qForm, question_type: t.value, correct_answer_letter: 'A' })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                        qForm.question_type === t.value
                          ? 'border-orange-500 bg-orange-50 text-orange-800'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Question text */}
              <div>
                <label className="block text-xs font-bold text-navy-700 mb-1">
                  نص السؤال <span className="text-gray-400 font-normal">(اختياري إذا وُجدت صورة)</span>
                </label>
                <MathToolbar
                  textareaRef={questionTextRef}
                  value={qForm.question_text}
                  onChange={v => setQForm({ ...qForm, question_text: v })}
                />
                <textarea
                  ref={questionTextRef}
                  value={qForm.question_text}
                  onChange={e => setQForm({ ...qForm, question_text: e.target.value })}
                  className="input-field h-20 resize-none text-sm"
                  placeholder="اكتب نص السؤال هنا... (استخدم $...$ للمعادلات)" />
              </div>

              {/* Question image */}
              <div>
                <label className="block text-xs font-bold text-navy-700 mb-1.5">
                  صورة السؤال <span className="text-gray-400 font-normal">(اختياري)</span>
                </label>
                <div className="flex gap-2 mb-2">
                  <button type="button"
                    onClick={() => { setImageInputMode('url'); setImageFile(null); setImagePreview(''); if (imageFileRef.current) imageFileRef.current.value = ''; }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                      imageInputMode === 'url' ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-gray-200 text-gray-600'
                    }`}>
                    <Link className="w-3.5 h-3.5" /> رابط URL
                  </button>
                  <button type="button"
                    onClick={() => { setImageInputMode('file'); setQForm({ ...qForm, question_image_url: '' }); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                      imageInputMode === 'file' ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-gray-200 text-gray-600'
                    }`}>
                    <Upload className="w-3.5 h-3.5" /> رفع صورة
                  </button>
                </div>
                {imageInputMode === 'url' ? (
                  <>
                    <input value={qForm.question_image_url || ''} onChange={e => setQForm({ ...qForm, question_image_url: e.target.value })}
                      className="input-field text-sm" placeholder="الصق رابط الصورة هنا..." dir="ltr" />
                    {qForm.question_image_url && (
                      <img src={qForm.question_image_url} alt="preview" className="mt-2 h-24 rounded-lg object-contain border border-gray-200 w-full" onError={e => e.target.style.display = 'none'} />
                    )}
                  </>
                ) : (
                  <>
                    <input ref={imageFileRef} type="file" accept="image/*"
                      onChange={e => { const f = e.target.files[0]; if (f) { setImageFile(f); setImagePreview(URL.createObjectURL(f)); } else { setImageFile(null); setImagePreview(''); } }}
                      className="block w-full text-sm text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 border border-gray-200 rounded-xl p-2 cursor-pointer"
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
                    {imagePreview && <img src={imagePreview} alt="preview" className="mt-2 h-24 rounded-lg object-contain border border-gray-200 w-full" />}
                  </>
                )}
              </div>

              {/* MCQ options */}
              {qForm.question_type === 'mcq' && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-navy-700">الخيارات</label>
                  {['A', 'B', 'C', 'D'].map(opt => (
                    <div key={opt} className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        qForm.correct_answer_letter === opt ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'
                      }`}>{opt}</span>
                      <input value={qForm[`option_${opt.toLowerCase()}`] || ''}
                        onChange={e => setQForm({ ...qForm, [`option_${opt.toLowerCase()}`]: e.target.value })}
                        className="input-field text-sm flex-1"
                        placeholder={`الخيار ${opt}${opt === 'A' || opt === 'B' ? ' *' : ''}`} />
                    </div>
                  ))}
                </div>
              )}

              {/* True/False */}
              {qForm.question_type === 'true_false' && (
                <div>
                  <label className="block text-xs font-bold text-navy-700 mb-1.5">الإجابة الصحيحة</label>
                  <div className="flex gap-3">
                    {['A', 'B'].map((opt, i) => (
                      <button key={opt} type="button"
                        onClick={() => setQForm({ ...qForm, correct_answer_letter: opt })}
                        className={`flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition-all ${
                          qForm.correct_answer_letter === opt ? 'border-green-500 bg-green-50 text-green-800' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}>
                        {i === 0 ? '✅ صح' : '❌ خطأ'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Correct answer + Points */}
              <div className="flex items-center gap-4 pt-1">
                {qForm.question_type === 'mcq' && (
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-bold text-navy-700 whitespace-nowrap">الإجابة:</label>
                    <select value={qForm.correct_answer_letter}
                      onChange={e => setQForm({ ...qForm, correct_answer_letter: e.target.value })}
                      className="input-field w-20">
                      {['A', 'B', 'C', 'D'].map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <label className="text-sm font-bold text-navy-700 whitespace-nowrap">الدرجة:</label>
                  <input type="number" value={qForm.points}
                    onChange={e => setQForm({ ...qForm, points: parseInt(e.target.value) || 1 })}
                    className="input-field w-20" min={1} />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1 border-t border-gray-100">
                {editQ && (
                  <button type="button" onClick={resetQForm} className="btn-secondary px-4 py-2 text-sm flex-shrink-0">
                    إلغاء
                  </button>
                )}
                <button type="submit" className="btn-primary flex-1 flex items-center justify-center gap-2"
                  disabled={addQMut.isPending || updateQMut.isPending}>
                  {editQ ? 'تحديث السؤال' : (
                    isGrouped && qForm.group_id
                      ? <><Layers className="w-4 h-4" /> إضافة للمجموعة</>
                      : <><Plus className="w-4 h-4" /> إضافة السؤال</>
                  )}
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
    </div>
  );
}

// ── Single question card ───────────────────────────────────────────────────
function SingleQuestionCard({ q, qNum, editQ, onEdit, onDelete }) {
  return (
    <div className={`bg-white rounded-xl p-4 shadow-sm border transition-all ${editQ?.id === q.id ? 'border-orange-400 ring-2 ring-orange-100' : 'border-gray-100 hover:border-gray-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs font-black text-gray-500">س{qNum}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              q.question_type === 'true_false' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'
            }`}>{qTypeLabel(q.question_type)}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">
              {q.points} درجة
            </span>
          </div>
          {q.question_text && (
            <p className="font-semibold text-navy-600 text-sm mb-2 leading-relaxed"><MathText text={q.question_text} /></p>
          )}
          {q.question_image_url && (
            <img src={q.question_image_url} alt="question" className="w-40 h-24 object-cover rounded-lg mb-2 border border-gray-100" />
          )}
          <div className="grid grid-cols-2 gap-1 text-xs">
            {(q.question_type === 'true_false' ? ['A', 'B'] : ['A', 'B', 'C', 'D']).map(opt =>
              q[`option_${opt.toLowerCase()}`] && q[`option_${opt.toLowerCase()}`] !== '-' && (
                <div key={opt} className={`p-1.5 rounded-lg font-semibold flex items-center gap-1 ${
                  q.correct_answer_letter === opt ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                }`}>
                  <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-black flex-shrink-0 ${
                    q.correct_answer_letter === opt ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-600'
                  }`}>{opt}</span>
                  {q[`option_${opt.toLowerCase()}`]}
                </div>
              )
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          <button onClick={onEdit} className="p-1.5 text-navy-600 hover:bg-navy-50 rounded-lg transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Grouped question card ──────────────────────────────────────────────────
function GroupQuestionCard({ entry, startNum, editQ, onEdit, onDelete }) {
  return (
    <div className="rounded-xl border-2 border-blue-200 bg-blue-50/30 overflow-hidden shadow-sm">
      {/* Group header */}
      <div className="px-4 py-2.5 bg-blue-100 border-b border-blue-200 flex items-center gap-2">
        <Layers className="w-4 h-4 text-blue-700 flex-shrink-0" />
        <span className="text-xs font-black text-blue-800">مجموعة أسئلة — {entry.questions.length} سؤال</span>
        <span className="text-[10px] font-semibold text-blue-600 mr-auto">س{startNum} – س{startNum + entry.questions.length - 1}</span>
      </div>

      {/* Shared context */}
      {(entry.context || entry.contextImage) && (
        <div className="px-4 pt-3 pb-2 border-b border-blue-200">
          <p className="text-[10px] font-bold text-blue-600 mb-2 uppercase tracking-wide">السياق المشترك</p>
          {entry.contextImage && (
            <img src={entry.contextImage} alt="context" className="max-h-48 rounded-xl border border-blue-200 w-full object-contain mb-2" />
          )}
          {entry.context && (
            <p className="text-sm text-navy-700 leading-relaxed whitespace-pre-wrap bg-white rounded-xl px-3 py-2 border border-blue-100">{entry.context}</p>
          )}
        </div>
      )}

      {/* Sub-questions */}
      <div className="p-3 space-y-2">
        {entry.questions.map((q, si) => (
          <div key={q.id} className={`bg-white rounded-xl p-3 border transition-all ${editQ?.id === q.id ? 'border-orange-400 ring-2 ring-orange-100' : 'border-blue-100 hover:border-blue-200'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-xs font-black text-blue-600">س{startNum + si}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    q.question_type === 'true_false' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'
                  }`}>{qTypeLabel(q.question_type)}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">{q.points} درجة</span>
                </div>
                {q.question_text && <p className="font-semibold text-navy-600 text-sm mb-1.5 leading-relaxed"><MathText text={q.question_text} /></p>}
                {q.question_image_url && <img src={q.question_image_url} alt="q" className="w-32 h-20 object-cover rounded-lg mb-1.5 border border-gray-100" />}
                <div className="grid grid-cols-2 gap-1 text-xs">
                  {(q.question_type === 'true_false' ? ['A', 'B'] : ['A', 'B', 'C', 'D']).map(opt =>
                    q[`option_${opt.toLowerCase()}`] && (
                      <div key={opt} className={`p-1 rounded-lg font-semibold flex items-center gap-1 ${
                        q.correct_answer_letter === opt ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                      }`}>
                        <span className={`w-3.5 h-3.5 rounded-full text-[9px] flex items-center justify-center font-black flex-shrink-0 ${
                          q.correct_answer_letter === opt ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-600'
                        }`}>{opt}</span>
                        {q[`option_${opt.toLowerCase()}`]}
                      </div>
                    )
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1 flex-shrink-0">
                <button onClick={() => onEdit(q)} className="p-1.5 text-navy-600 hover:bg-navy-50 rounded-lg transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => onDelete(q.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
