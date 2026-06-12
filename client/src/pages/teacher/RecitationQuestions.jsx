import React, { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, BookOpen, HelpCircle, Plus, Edit3, Trash2,
  AlertCircle, Upload, RefreshCw, Image as ImageIcon,
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const QUESTION_TYPES = [
  { value: 'mcq', label: '🔘 اختيار متعدد' },
  { value: 'true_false', label: '✅ صح / خطأ' },
  { value: 'image_multi', label: '🖼 صورة مع أسئلة' },
];

const emptyQ = {
  question_text: '', question_image_url: '',
  option_a: '', option_b: '', option_c: '', option_d: '',
  correct_answer_letter: 'A', points: 1, question_type: 'mcq',
  sub_questions: [],
};

const qTypeLabel = (t) => ({ mcq: 'MCQ', true_false: 'صح/خطأ', image_multi: 'صورة+أسئلة' })[t] || 'MCQ';

export default function RecitationQuestions() {
  const { recitationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const baseRole = user?.role === 'assistant' ? 'assistant' : 'teacher';

  const [qForm, setQForm] = useState(emptyQ);
  const [editQ, setEditQ] = useState(null);
  const [deleteQId, setDeleteQId] = useState(null);
  const [imgUploading, setImgUploading] = useState(false);
  const [imgMultiCount, setImgMultiCount] = useState(5);
  const imgInputRef = useRef(null);
  const formTopRef = useRef(null);

  const { data: recitation } = useQuery({
    queryKey: ['recitation-single', recitationId],
    queryFn: () => api.get('/recitations').then(r => (r.data || []).find(rec => String(rec.id) === String(recitationId))),
  });

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ['recitation-questions', recitationId],
    queryFn: () => api.get(`/recitations/${recitationId}/questions`).then(r => r.data),
  });

  const resetForm = () => {
    setEditQ(null);
    setQForm(emptyQ);
    if (imgInputRef.current) imgInputRef.current.value = '';
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    setImgUploading(true);
    try {
      const { data } = await api.post('/recitations/upload-image', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setQForm(f => ({ ...f, question_image_url: data.url }));
    } catch (err) {
      toast.error(err.response?.data?.error || 'فشل رفع الصورة');
    } finally {
      setImgUploading(false);
      if (imgInputRef.current) imgInputRef.current.value = '';
    }
  };

  const addQMut = useMutation({
    mutationFn: (d) => editQ
      ? api.put(`/recitations/${recitationId}/questions/${editQ.id}`, d)
      : api.post(`/recitations/${recitationId}/questions`, d),
    onSuccess: () => {
      qc.invalidateQueries(['recitation-questions', recitationId]);
      qc.invalidateQueries(['recitation-single', recitationId]);
      qc.invalidateQueries(['recitations']);
      toast.success(editQ ? 'تم تعديل السؤال ✅' : 'تم إضافة السؤال ✅');
      resetForm();
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const deleteQMut = useMutation({
    mutationFn: (qid) => api.delete(`/recitations/${recitationId}/questions/${qid}`),
    onSuccess: () => {
      qc.invalidateQueries(['recitation-questions', recitationId]);
      qc.invalidateQueries(['recitation-single', recitationId]);
      qc.invalidateQueries(['recitations']);
      toast.success('تم حذف السؤال');
      setDeleteQId(null);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const f = { ...qForm };
    if (!f.question_text?.trim() && !f.question_image_url) return toast.error('أدخل نص السؤال أو أضف صورة');
    if (f.question_type === 'image_multi') {
      if (!f.sub_questions || f.sub_questions.length === 0) return toast.error('يجب توليد الأسئلة الفرعية أولاً');
      f.option_a = 'A'; f.option_b = 'B'; f.option_c = 'C'; f.option_d = 'D';
    } else if (f.question_type === 'mcq' && (!f.option_a || !f.option_b)) {
      return toast.error('الخياران الأول والثاني مطلوبان');
    }
    addQMut.mutate(f);
  };

  const startEdit = (q) => {
    setEditQ(q);
    setQForm({
      question_text: q.question_text || '',
      question_image_url: q.question_image_url || '',
      question_type: q.question_type || 'mcq',
      option_a: q.option_a || '',
      option_b: q.option_b || '',
      option_c: q.option_c || '',
      option_d: q.option_d || '',
      correct_answer_letter: q.correct_answer_letter || 'A',
      points: q.points || 1,
      sub_questions: q.sub_questions || [],
    });
    formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const totalPoints = questions.reduce((s, q) => s + (parseInt(q.points) || 0), 0);
  const recTotal = parseInt(recitation?.total_score) || 0;
  const pointsMismatch = questions.length > 0 && recTotal > 0 && totalPoints !== recTotal;

  const tf = qForm.question_type === 'true_false';
  const isImgMulti = qForm.question_type === 'image_multi';

  return (
    <div className="-m-4 lg:-m-6 h-[calc(100%+2rem)] lg:h-[calc(100%+3rem)] flex flex-col overflow-hidden" dir="rtl">

      {/* Fixed Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 lg:px-6 py-3 flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => navigate(`/${baseRole}/recitations`)}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-all font-bold text-sm flex-shrink-0">
            <ArrowRight className="w-4 h-4" />
            <span className="hidden sm:inline">رجوع للتسميعات</span>
          </button>
          <div className="h-5 w-px bg-gray-200 flex-shrink-0" />
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs text-gray-400 font-medium">إدارة أسئلة التسميع</p>
              <h1 className="font-black text-navy-700 text-xs sm:text-sm truncate">{recitation?.title || '...'}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs font-bold text-gray-500 flex items-center gap-1">
              <HelpCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">{questions.length} سؤال</span>
              <span className="sm:hidden">{questions.length}</span>
            </span>
            {recTotal > 0 && (
              <span className={`text-xs font-black px-2 py-1 rounded-lg ${
                pointsMismatch ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
              }`}>
                {totalPoints}/{recTotal}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 lg:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6 items-start">

          {/* ── Questions list ─────────────────────────────────────────── */}
          <div className="lg:col-span-3 space-y-3 order-2 lg:order-1">
            {pointsMismatch && (
              <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-300 rounded-xl text-sm text-amber-800 font-semibold">
                <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <span>
                  ⚠️ مجموع درجات الأسئلة (<span className="font-black">{totalPoints}</span>) لا يساوي المجموع الكلي (<span className="font-black">{recTotal}</span>) — عدّل الدرجات قبل نشر التسميع
                </span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-purple-500" />
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
            ) : questions.map((q, idx) => (
              <QuestionCard
                key={q.id}
                q={q}
                idx={idx}
                isPublished={recitation?.is_published}
                isEditing={editQ?.id === q.id}
                onEdit={() => startEdit(q)}
                onDelete={() => setDeleteQId(q.id)}
              />
            ))}
          </div>

          {/* ── Add / Edit form ────────────────────────────────────────── */}
          <div ref={formTopRef} className="lg:col-span-2 order-1 lg:order-2 lg:sticky lg:top-4">
            {recitation?.is_published ? (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 text-center">
                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                <p className="font-bold text-amber-800 text-sm">التسميع منشور</p>
                <p className="text-amber-700 text-xs mt-1">لا يمكن تعديل الأسئلة بعد النشر</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border-2 border-dashed border-purple-300 p-5 shadow-sm">
                <h3 className="font-black text-navy-700 mb-4 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-purple-500" />
                  {editQ ? 'تعديل السؤال' : 'إضافة سؤال جديد'}
                </h3>

                <form onSubmit={handleSubmit} className="space-y-4">

                  {/* Question type */}
                  <div>
                    <label className="block text-xs font-bold text-navy-700 mb-1.5">نوع السؤال</label>
                    <div className="flex gap-2 flex-wrap">
                      {QUESTION_TYPES.map(t => (
                        <button key={t.value} type="button"
                          onClick={() => {
                            if (t.value === 'true_false') {
                              setQForm(f => ({ ...f, question_type: 'true_false', option_a: 'صح', option_b: 'خطأ', option_c: '', option_d: '', correct_answer_letter: 'A', sub_questions: [] }));
                            } else if (t.value === 'image_multi') {
                              setQForm(f => ({ ...f, question_type: 'image_multi', option_a: 'A', option_b: 'B', option_c: 'C', option_d: 'D', correct_answer_letter: 'A', sub_questions: f.sub_questions || [] }));
                            } else {
                              setQForm(f => ({ ...f, question_type: 'mcq', option_a: f.option_a === 'صح' ? '' : f.option_a, option_b: f.option_b === 'خطأ' ? '' : f.option_b, correct_answer_letter: 'A', sub_questions: [] }));
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                            qForm.question_type === t.value
                              ? 'border-purple-500 bg-purple-50 text-purple-800'
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
                      نص السؤال <span className="text-gray-400 font-normal">{isImgMulti ? '(تعليمات اختياري)' : '(اختياري إذا وُجدت صورة)'}</span>
                    </label>
                    <textarea
                      value={qForm.question_text}
                      onChange={e => setQForm(f => ({ ...f, question_text: e.target.value }))}
                      rows={2}
                      className="w-full rounded-xl px-3 py-2.5 border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-300"
                      placeholder="اكتب نص السؤال هنا..." />
                  </div>

                  {/* Image upload */}
                  <div>
                    <label className="block text-xs font-bold text-navy-700 mb-1.5">
                      صورة السؤال <span className="text-gray-400 font-normal">(اختياري)</span>
                    </label>
                    <input ref={imgInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    {qForm.question_image_url ? (
                      <div className="relative rounded-xl overflow-hidden border border-gray-200">
                        <img src={qForm.question_image_url} alt="question" className="w-full max-h-48 object-contain bg-gray-50" />
                        <div className="absolute top-2 left-2 flex gap-1.5">
                          <button type="button" onClick={() => imgInputRef.current?.click()}
                            className="px-2.5 py-1.5 bg-white/95 text-gray-700 text-xs rounded-lg font-bold shadow-sm hover:bg-white flex items-center gap-1">
                            <Upload className="w-3 h-3" /> تغيير
                          </button>
                          <button type="button" onClick={() => setQForm(f => ({ ...f, question_image_url: '' }))}
                            className="px-2.5 py-1.5 bg-red-500/90 text-white text-xs rounded-lg font-bold shadow-sm hover:bg-red-500">
                            حذف
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => imgInputRef.current?.click()} disabled={imgUploading}
                        className="w-full border-2 border-dashed border-gray-200 rounded-xl py-3.5 text-sm font-semibold flex items-center justify-center gap-2 text-gray-400 hover:border-purple-300 hover:text-purple-500 transition-colors">
                        {imgUploading
                          ? <><RefreshCw className="w-4 h-4 animate-spin" />جاري الرفع...</>
                          : <><ImageIcon className="w-4 h-4" />إضافة صورة (اختياري)</>
                        }
                      </button>
                    )}
                  </div>

                  {/* MCQ options */}
                  {qForm.question_type === 'mcq' && (
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-navy-700">الخيارات</label>
                      {['A', 'B', 'C', 'D'].map((opt, i) => (
                        <div key={opt} className="flex items-center gap-2">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                            qForm.correct_answer_letter === opt ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700'
                          }`}>{opt}</span>
                          <input
                            value={qForm[`option_${opt.toLowerCase()}`] || ''}
                            onChange={e => setQForm(f => ({ ...f, [`option_${opt.toLowerCase()}`]: e.target.value }))}
                            className="flex-1 rounded-xl px-3 py-2 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                            placeholder={`الخيار ${opt}${i < 2 ? ' *' : ''}`} />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* True/False */}
                  {qForm.question_type === 'true_false' && (
                    <div>
                      <label className="block text-xs font-bold text-navy-700 mb-1.5">الإجابة الصحيحة</label>
                      <div className="flex gap-3">
                        {[{ opt: 'A', label: '✅ صح' }, { opt: 'B', label: '❌ خطأ' }].map(({ opt, label }) => (
                          <button key={opt} type="button"
                            onClick={() => setQForm(f => ({ ...f, correct_answer_letter: opt }))}
                            className={`flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition-all ${
                              qForm.correct_answer_letter === opt
                                ? 'border-purple-500 bg-purple-50 text-purple-800'
                                : 'border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* image_multi sub-questions */}
                  {isImgMulti && (
                    <div>
                      <label className="block text-xs font-bold text-navy-700 mb-2">الأسئلة الفرعية</label>
                      <div className="flex items-center gap-2 mb-3">
                        <input type="number" min={1} max={50} value={imgMultiCount}
                          onChange={e => setImgMultiCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                          className="w-20 rounded-xl px-3 py-2 border border-gray-200 text-sm text-center focus:outline-none focus:ring-2 focus:ring-purple-300"
                          placeholder="العدد" />
                        <button type="button"
                          onClick={() => {
                            const subs = Array.from({ length: imgMultiCount }, (_, i) => ({
                              label: String(i + 1), correct: 'A'
                            }));
                            setQForm(f => ({ ...f, sub_questions: subs }));
                          }}
                          className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors">
                          <RefreshCw className="w-3.5 h-3.5" /> توليد
                        </button>
                        {(qForm.sub_questions || []).length > 0 && (
                          <span className="text-xs font-semibold text-purple-600">
                            {(qForm.sub_questions || []).length} سؤال
                          </span>
                        )}
                      </div>
                      {(qForm.sub_questions || []).length > 0 && (
                        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                          {(qForm.sub_questions || []).map((sub, i) => (
                            <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-1.5 bg-purple-50 border border-purple-100">
                              <span className="w-7 text-center text-xs font-black text-gray-500 flex-shrink-0">{sub.label}</span>
                              <div className="flex gap-1 flex-1">
                                {['A', 'B', 'C', 'D'].map(letter => (
                                  <button key={letter} type="button"
                                    onClick={() => setQForm(f => ({
                                      ...f,
                                      sub_questions: (f.sub_questions || []).map((s, j) =>
                                        j === i ? { ...s, correct: letter } : s
                                      ),
                                    }))}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                      sub.correct === letter
                                        ? 'bg-purple-500 text-white border-purple-500 shadow-sm'
                                        : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300 hover:bg-purple-50'
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
                  )}

                  {/* Correct answer + Points row */}
                  <div className="flex items-end gap-3 pt-1">
                    {qForm.question_type === 'mcq' && (
                      <div>
                        <label className="block text-xs font-bold text-navy-700 mb-1">الإجابة الصحيحة</label>
                        <select value={qForm.correct_answer_letter}
                          onChange={e => setQForm(f => ({ ...f, correct_answer_letter: e.target.value }))}
                          className="rounded-xl px-3 py-2 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300">
                          {['A', 'B', 'C', 'D'].map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-bold text-navy-700 mb-1">
                        {isImgMulti ? 'الدرجة الكلية' : 'الدرجة'}
                      </label>
                      <input type="number" min={1} value={qForm.points}
                        onChange={e => setQForm(f => ({ ...f, points: parseInt(e.target.value) || 1 }))}
                        className="w-20 rounded-xl px-3 py-2 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1 border-t border-gray-100">
                    {editQ && (
                      <button type="button" onClick={resetForm}
                        className="px-4 py-2.5 rounded-xl text-sm font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors flex-shrink-0">
                        إلغاء
                      </button>
                    )}
                    <button type="submit"
                      disabled={addQMut.isPending}
                      className="flex-1 flex items-center justify-center gap-2 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white py-2.5 rounded-xl font-bold text-sm transition-colors">
                      {addQMut.isPending
                        ? <RefreshCw className="w-4 h-4 animate-spin" />
                        : <Plus className="w-4 h-4" />
                      }
                      {editQ ? 'حفظ التعديل' : 'إضافة السؤال'}
                    </button>
                  </div>

                </form>
              </div>
            )}
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

function QuestionCard({ q, idx, isPublished, isEditing, onEdit, onDelete }) {
  const isImgMulti = q.question_type === 'image_multi';
  const isTF = q.question_type === 'true_false';

  return (
    <div className={`bg-white rounded-xl p-4 shadow-sm border transition-all ${
      isEditing ? 'border-purple-400 ring-2 ring-purple-100' : 'border-gray-100 hover:border-gray-200'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-black flex items-center justify-center flex-shrink-0">
              {idx + 1}
            </span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              isTF ? 'bg-green-100 text-green-700' :
              isImgMulti ? 'bg-orange-100 text-orange-700' :
              'bg-blue-100 text-blue-700'
            }`}>{qTypeLabel(q.question_type)}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">
              {q.points} درجة
            </span>
            {isImgMulti && (q.sub_questions || []).length > 0 && (
              <span className="text-xs text-gray-400">({(q.sub_questions || []).length} فرع)</span>
            )}
          </div>

          {q.question_image_url && (
            <img src={q.question_image_url} alt="question" className="w-full max-h-40 object-contain rounded-xl border border-gray-100 mb-2 bg-gray-50" />
          )}
          {q.question_text && (
            <p className="font-semibold text-navy-600 text-sm mb-2 leading-relaxed">{q.question_text}</p>
          )}

          {isImgMulti ? (
            <div className="flex flex-wrap gap-1.5">
              {(q.sub_questions || []).map(sub => (
                <span key={sub.label} className="text-xs px-2 py-1 rounded-lg bg-purple-100 text-purple-700 font-bold">
                  {sub.label} → {sub.correct}
                </span>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1 text-xs">
              {(isTF ? ['A', 'B'] : ['A', 'B', 'C', 'D']).map(opt =>
                q[`option_${opt.toLowerCase()}`] && q[`option_${opt.toLowerCase()}`] !== '-' && (
                  <div key={opt} className={`p-1.5 rounded-lg font-semibold flex items-center gap-1 ${
                    q.correct_answer_letter === opt
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-black flex-shrink-0 ${
                      q.correct_answer_letter === opt ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-600'
                    }`}>{opt}</span>
                    {q[`option_${opt.toLowerCase()}`]}
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {!isPublished && (
          <div className="flex flex-col gap-1 flex-shrink-0">
            <button onClick={onEdit} className="p-1.5 text-navy-600 hover:bg-purple-50 rounded-lg transition-colors">
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
