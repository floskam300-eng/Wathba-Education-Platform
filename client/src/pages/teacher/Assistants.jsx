import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserCog, Plus, Trash2, Settings } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const PERMISSIONS = [
  { key: 'can_add_students', label: 'إضافة طلاب' },
  { key: 'can_edit_students', label: 'تعديل بيانات الطلاب' },
  { key: 'can_delete_students', label: 'حذف الطلاب' },
  { key: 'can_manage_exams', label: 'إدارة الاختبارات' },
  { key: 'can_view_analytics', label: 'عرض التحليلات' },
  { key: 'can_send_reports', label: 'إرسال التقارير' },
  { key: 'can_manage_payments', label: 'إدارة المدفوعات' },
  { key: 'can_manage_courses', label: 'إدارة الكورسات' },
];

const emptyForm = { username: '', password: '', name: '', phone: '', can_add_students: true, can_edit_students: true, can_delete_students: false, can_manage_exams: true, can_view_analytics: true, can_send_reports: true, can_manage_payments: false, can_manage_courses: false };

export default function TeacherAssistants() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [permModal, setPermModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [permForm, setPermForm] = useState({});
  const [deleteId, setDeleteId] = useState(null);

  const { data: assistants = [], isLoading } = useQuery({
    queryKey: ['assistants'],
    queryFn: () => api.get('/assistants').then(r => r.data),
  });

  const createMut = useMutation({
    mutationFn: (data) => api.post('/assistants', data),
    onSuccess: () => { qc.invalidateQueries(['assistants']); toast.success('تم إضافة المساعد'); setModal(false); setForm(emptyForm); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const permMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/assistants/${id}/permissions`, data),
    onSuccess: () => { qc.invalidateQueries(['assistants']); toast.success('تم تحديث الصلاحيات'); setPermModal(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/assistants/${id}`),
    onSuccess: () => { qc.invalidateQueries(['assistants']); toast.success('تم حذف المساعد'); },
  });

  const openPerm = (a) => {
    setPermModal(a);
    setPermForm({ can_add_students: a.can_add_students, can_edit_students: a.can_edit_students, can_delete_students: a.can_delete_students, can_manage_exams: a.can_manage_exams, can_view_analytics: a.can_view_analytics, can_send_reports: a.can_send_reports, can_manage_payments: a.can_manage_payments || false, can_manage_courses: a.can_manage_courses || false });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-navy-600 flex items-center gap-2">
          <UserCog className="w-7 h-7 text-orange-500" /> المساعدون
          <span className="text-sm font-semibold text-gray-600">({assistants.length})</span>
        </h1>
        <button onClick={() => setModal(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> إضافة مساعد
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          [...Array(3)].map((_, i) => <div key={i} className="card h-40 animate-pulse bg-gray-100" />)
        ) : assistants.length === 0 ? (
          <div className="card col-span-3 text-center py-16">
            <UserCog className="w-16 h-16 mx-auto mb-3 text-gray-400" />
            <p className="text-gray-600 font-medium">لا يوجد مساعدون بعد</p>
          </div>
        ) : assistants.map(a => (
          <div key={a.id} className="card">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-navy-500 to-navy-700 rounded-xl flex items-center justify-center text-white font-bold text-lg">
                  {a.name?.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-navy-600">{a.name}</h3>
                  {/* gray-600 on white = 7.2:1 ✓ */}
                  <p className="text-gray-600 text-xs font-mono font-semibold">{a.username}</p>
                  {a.phone && <p className="text-gray-600 text-xs font-medium">{a.phone}</p>}
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openPerm(a)} className="p-2 text-navy-600 hover:bg-navy-50 rounded-lg"><Settings className="w-4 h-4" /></button>
                <button onClick={() => setDeleteId(a.id)} className="p-2 text-red-700 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="space-y-1.5">
              {PERMISSIONS.map(p => (
                <div key={p.key} className="flex items-center justify-between">
                  <span className="text-xs text-gray-700 font-medium">{p.label}</span>
                  {/* green-700 / red-700 on white = 7.2:1 / 7.4:1 ✓ */}
                  <span className={`text-xs font-bold ${a[p.key] ? 'text-green-700' : 'text-red-700'}`}>
                    {a[p.key] ? '✓ مسموح' : '✗ ممنوع'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Modal open={modal} onClose={() => { setModal(false); setForm(emptyForm); }} title="إضافة مساعد جديد">
        <form onSubmit={(e) => { e.preventDefault(); if (!form.username || !form.password || !form.name) return toast.error('جميع الحقول المطلوبة'); createMut.mutate(form); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1">الاسم *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1">اسم المستخدم *</label>
              <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} className="input-field" dir="ltr" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1">كلمة المرور *</label>
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="input-field" dir="ltr" />
            </div>
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1">الهاتف</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input-field" dir="ltr" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-navy-700 mb-2">الصلاحيات الأولية</label>
            <div className="space-y-2 bg-gray-50 rounded-xl p-3">
              {PERMISSIONS.map(p => (
                <label key={p.key} className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={form[p.key]} onChange={e => setForm({ ...form, [p.key]: e.target.checked })}
                    className="w-4 h-4 accent-orange-600" />
                  <span className="text-sm text-gray-800 font-medium">{p.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => { setModal(false); setForm(emptyForm); }} className="flex-1 btn-secondary">إلغاء</button>
            <button type="submit" disabled={createMut.isPending} className="flex-1 btn-primary">إضافة المساعد</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!permModal} onClose={() => setPermModal(null)} title={`صلاحيات ${permModal?.name}`}>
        <div className="space-y-3">
          {PERMISSIONS.map(p => (
            <label key={p.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
              <span className="font-semibold text-navy-700 text-sm">{p.label}</span>
              <input type="checkbox" checked={permForm[p.key] || false} onChange={e => setPermForm({ ...permForm, [p.key]: e.target.checked })}
                className="w-5 h-5 accent-orange-600" />
            </label>
          ))}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setPermModal(null)} className="flex-1 btn-secondary">إلغاء</button>
            <button onClick={() => permMut.mutate({ id: permModal.id, data: permForm })}
              disabled={permMut.isPending} className="flex-1 btn-primary">حفظ الصلاحيات</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)}
        onConfirm={() => { deleteMut.mutate(deleteId); setDeleteId(null); }}
        title="حذف المساعد" message="هل أنت متأكد من حذف هذا المساعد؟" danger />
    </div>
  );
}
