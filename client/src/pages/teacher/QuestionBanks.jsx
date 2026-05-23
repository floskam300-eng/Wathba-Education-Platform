import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookMarked, Plus, Pencil, Trash2, ChevronDown, ChevronUp, Upload, Link, AlertCircle, BookOpen } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const emptyBank = { name: '', course_id: '' };
const emptyQ = { question_text: '', question_image_url: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer_letter: 'A', points: 1, question_type: 'mcq' };

const Q_TYPES = [
  { value: 'mcq', label: '🔘 اختيار متعدد (MCQ)' },
  { value: 'true_false', label: '✅ صح / خطأ' },
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
    onSuccess: () => { qc.invalidateQueries(['bank-questions', expandedBank]); qc.invalidateQueries(['question-banks']); toast.success('تم إضافة السؤال'); resetQForm(); },
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
    });
    setImagePreview(q.question_image_url || '');
    setImageInputMode('url');
  };

  const handleQSubmit = async (e) => {
    e.preventDefault();
    let finalImageUrl = qForm.question_image_url || '';

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

    const finalForm = { ...qForm, question_image_url: finalImageUrl };
    if (!finalForm.question_text && !finalImageUrl) return toast.error('أدخل نص السؤال أو صورة');
    if (finalForm.question_type === 'mcq' && (!finalForm.option_a || !finalForm.option_b)) return toast.error('الخيار الأول والثاني مطلوبان');
    if (editQ) updateQMut.mutate({ qid: editQ.id, data: finalForm });
    else addQMut.mutate({ bankId: expandedBank, data: finalForm });
  };

  const toggleBank = (id) => setExpandedBank(expandedBank === id ? null : id);

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
                      {bankQuestions.map((q, idx) => (
                        <div key={q.id} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-black bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{idx + 1}</span>
                                <span className="text-xs text-gray-500 font-medium">{q.question_type === 'true_false' ? 'صح/خطأ' : 'MCQ'} · {q.points} نقطة</span>
                              </div>
                              {q.question_image_url && <img src={q.question_image_url} alt="" className="max-h-32 rounded-lg mb-2 border border-gray-200" />}
                              {q.question_text && <p className="font-semibold text-navy-700 text-sm mb-2">{q.question_text}</p>}
                              <div className="grid grid-cols-2 gap-1.5">
                                {['a','b','c','d'].map(opt => q[`option_${opt}`] && (
                                  <div key={opt} className={`px-2 py-1 rounded-lg text-xs font-medium border ${q.correct_answer_letter?.toUpperCase() === opt.toUpperCase() ? 'border-green-400 bg-green-50 text-green-800 font-bold' : 'border-gray-200 text-gray-600'}`}>
                                    <span className="font-black ml-1">{opt.toUpperCase()}.</span>{q[`option_${opt}`]}
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <button onClick={() => startEditQ(q)} className="p-1.5 text-gray-400 hover:text-navy-600 hover:bg-white rounded-lg transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setDeleteQId(q.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="bg-white border-2 border-dashed border-purple-300 rounded-2xl p-4 space-y-3">
                    <h4 className="font-black text-purple-700 text-sm flex items-center gap-1.5">
                      <Plus className="w-4 h-4" /> {editQ ? 'تعديل السؤال' : 'إضافة سؤال جديد'}
                    </h4>
                    <form onSubmit={handleQSubmit} className="space-y-3">
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
