import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookMarked, Plus, Pencil, Trash2, BookOpen, FolderOpen } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

const emptyBank = { name: '', course_id: '' };

export default function QuestionBanks() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const baseRole = user?.role === 'assistant' ? 'assistant' : 'teacher';

  const [bankModal, setBankModal] = useState(false);
  const [editBank, setEditBank] = useState(null);
  const [bankForm, setBankForm] = useState(emptyBank);
  const [deleteBankId, setDeleteBankId] = useState(null);

  const { data: banks = [], isLoading } = useQuery({
    queryKey: ['question-banks'],
    queryFn: () => api.get('/question-banks').then(r => r.data),
  });

  const { data: courses = [] } = useQuery({
    queryKey: ['courses'],
    queryFn: () => api.get('/courses').then(r => r.data),
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
    onSuccess: () => { qc.invalidateQueries(['question-banks']); toast.success('تم حذف البنك'); setDeleteBankId(null); },
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
              <div className="p-3 sm:p-4 flex items-start sm:items-center gap-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-purple-500 to-purple-700 rounded-xl flex items-center justify-center flex-shrink-0">
                  <BookMarked className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-navy-700 text-base sm:text-lg">{bank.name}</h3>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {bank.course_name && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">
                        <BookOpen className="w-3 h-3" />{bank.course_name}
                      </span>
                    )}
                    <span className="text-xs text-gray-500 font-medium">{bank.question_count} سؤال</span>
                    <span className="text-xs font-bold px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full">{bank.easy_count || 0} سهل</span>
                    <span className="text-xs font-bold px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">{bank.medium_count || 0} متوسط</span>
                    <span className="text-xs font-bold px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full">{bank.hard_count || 0} صعب</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => openEditBank(bank)} className="p-1.5 sm:p-2 text-gray-500 hover:text-navy-600 hover:bg-navy-50 rounded-lg transition-colors">
                    <Pencil className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                  <button onClick={() => setDeleteBankId(bank.id)} className="p-1.5 sm:p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                  <button
                    onClick={() => navigate(`/${baseRole}/question-banks/${bank.id}/questions`)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-black transition-all bg-purple-50 hover:bg-purple-600 hover:text-white text-purple-700 flex-shrink-0">
                    <FolderOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">إدارة الأسئلة</span>
                  </button>
                </div>
              </div>
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
    </div>
  );
}
