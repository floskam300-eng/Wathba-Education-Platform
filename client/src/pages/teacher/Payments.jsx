import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Plus, CheckCircle, XCircle, Printer, TrendingUp } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { generatePDFReport } from '../../lib/pdfReport';

const METHOD_LABELS = {
  'Vodafone Cash': '📱 فودافون كاش',
  'Instapay': '💳 إنستاباي',
  'Cash': '💵 كاش',
  'Bank Transfer': '🏦 تحويل بنكي',
};
const STATUS_MAP = {
  pending:  { label: 'قيد الانتظار', variant: 'warning' },
  verified: { label: 'مؤكدة',        variant: 'success' },
  rejected: { label: 'مرفوضة',       variant: 'danger'  },
};

const emptyForm = { student_id: '', course_id: '', amount: '', method: 'Vodafone Cash', reference_number: '', notes: '' };

export default function TeacherPayments() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: () => api.get('/payments').then(r => r.data),
  });

  const { data: students = [] } = useQuery({
    queryKey: ['students'],
    queryFn: () => api.get('/students').then(r => r.data),
  });

  const { data: courses = [] } = useQuery({
    queryKey: ['courses'],
    queryFn: () => api.get('/courses').then(r => r.data),
  });

  const createMut = useMutation({
    mutationFn: (data) => api.post('/payments', data),
    onSuccess: () => { qc.invalidateQueries(['payments']); toast.success('تم تسجيل الدفعة'); setModal(false); setForm(emptyForm); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const verifyMut = useMutation({
    mutationFn: ({ id, status }) => api.put(`/payments/${id}/verify`, { status }),
    onSuccess: () => { qc.invalidateQueries(['payments']); toast.success('تم تحديث حالة الدفعة'); },
  });

  const filtered = statusFilter === 'all' ? payments : payments.filter(p => p.status === statusFilter);
  const totals = {
    verified: payments.filter(p => p.status === 'verified').reduce((s, p) => s + parseFloat(p.amount), 0),
    pending:  payments.filter(p => p.status === 'pending').length,
  };

  const monthlyRevenue = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const yr = d.getFullYear();
      const mo = d.getMonth();
      const label = d.toLocaleDateString('ar-EG', { month: 'short', year: '2-digit' });
      const amount = payments
        .filter(p => {
          const pd = new Date(p.payment_date);
          return p.status === 'verified' && pd.getFullYear() === yr && pd.getMonth() === mo;
        })
        .reduce((s, p) => s + parseFloat(p.amount || 0), 0);
      return { name: label, 'الإيرادات': amount };
    });
  }, [payments]);

  const handlePrint = () => {
    const headers = ['الطالب', 'الكورس', 'المبلغ', 'الطريقة', 'المرجع', 'الحالة'];
    const data = filtered.map(p => [
      p.student_name,
      p.course_name || '—',
      `${parseFloat(p.amount).toLocaleString()} ج`,
      p.method,
      p.reference_number || '—',
      STATUS_MAP[p.status]?.label || p.status
    ]);
    generatePDFReport('تقرير المدفوعات', headers, data, 'payments_report.pdf');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-navy-600 flex items-center gap-2">
          <CreditCard className="w-7 h-7 text-orange-500" /> المدفوعات
        </h1>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="btn-secondary flex items-center gap-2">
            <Printer className="w-4 h-4" /> طباعة التقارير
          </button>
          <button onClick={() => setModal(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> تسجيل دفعة
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* green-700 on green-50 = 7.4:1 ✓ */}
        <div className="card bg-green-50 border border-green-200">
          <p className="text-green-800 text-sm font-bold mb-1">إجمالي المؤكد</p>
          <p className="text-2xl font-black text-green-800">{totals.verified.toLocaleString()} ج</p>
        </div>
        {/* orange-800 on orange-50 = 6.5:1 ✓ */}
        <div className="card bg-orange-50 border border-orange-200">
          <p className="text-orange-800 text-sm font-bold mb-1">قيد الانتظار</p>
          <p className="text-2xl font-black text-orange-800">{totals.pending} دفعة</p>
        </div>
        <div className="card">
          {/* gray-600 on white = 7.2:1 ✓ */}
          <p className="text-gray-600 text-sm font-bold mb-1">إجمالي الدفعات</p>
          <p className="text-2xl font-black text-navy-600">{payments.length}</p>
        </div>
        <div className="card">
          <p className="text-gray-600 text-sm font-bold mb-1">هذا الشهر</p>
          <p className="text-2xl font-black text-navy-600">
            {payments.filter(p => new Date(p.payment_date).getMonth() === new Date().getMonth()).length}
          </p>
        </div>
      </div>

      {/* Monthly Revenue Chart */}
      <div className="card">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-black text-gray-800 text-sm">الإيرادات الشهرية</h2>
            <p className="text-[11px] text-gray-400 font-medium">المدفوعات المؤكدة خلال آخر 6 أشهر</p>
          </div>
          <div className="mr-auto bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-1.5">
            <span className="text-emerald-700 font-black text-sm">{totals.verified.toLocaleString()} ج</span>
            <span className="text-emerald-600 text-[11px] font-semibold mr-1">إجمالي مؤكد</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={monthlyRevenue} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: 'Cairo', fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fontFamily: 'Cairo', fill: '#94a3b8' }} axisLine={false} tickLine={false} width={55}
              tickFormatter={v => v > 0 ? `${v.toLocaleString()}` : '0'} />
            <Tooltip
              contentStyle={{ fontFamily: 'Cairo', borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.10)', fontSize: '12px' }}
              formatter={(val) => [`${val.toLocaleString()} جنيه`, 'الإيرادات']}
            />
            <Area type="monotone" dataKey="الإيرادات" stroke="#10b981" strokeWidth={2.5}
              fill="url(#revenueGradient)" dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 6, fill: '#10b981' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['all', 'pending', 'verified', 'rejected'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${statusFilter === s ? 'bg-navy-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'}`}>
            {s === 'all' ? 'الكل' : STATUS_MAP[s]?.label}
          </button>
        ))}
      </div>

      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr>
                <th className="table-header rounded-r-lg">الطالب</th>
                <th className="table-header">الكورس</th>
                <th className="table-header">المبلغ</th>
                <th className="table-header">طريقة الدفع</th>
                <th className="table-header">المرجع</th>
                <th className="table-header">الحالة</th>
                <th className="table-header rounded-l-lg">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => <tr key={i}><td colSpan={7}><div className="h-10 bg-gray-100 animate-pulse m-2 rounded" /></td></tr>)
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="table-cell text-center text-gray-600 py-12">
                  <CreditCard className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p className="font-medium">لا توجد دفعات</p>
                </td></tr>
              ) : filtered.map(p => (
                <tr key={p.id} className="table-row">
                  <td className="table-cell font-bold text-navy-700">{p.student_name}</td>
                  {/* gray-700 on white = 10:1 ✓ */}
                  <td className="table-cell text-gray-700 font-medium">{p.course_name || '—'}</td>
                  <td className="table-cell font-bold text-navy-700">{parseFloat(p.amount).toLocaleString()} ج</td>
                  <td className="table-cell text-gray-700">{METHOD_LABELS[p.method] || p.method}</td>
                  <td className="table-cell font-mono text-xs text-gray-700">{p.reference_number || '—'}</td>
                  <td className="table-cell"><Badge variant={STATUS_MAP[p.status]?.variant || 'gray'}>{STATUS_MAP[p.status]?.label}</Badge></td>
                  <td className="table-cell">
                    {p.status === 'pending' && (
                      <div className="flex gap-1">
                        <button onClick={() => verifyMut.mutate({ id: p.id, status: 'verified' })}
                          className="p-1.5 text-green-700 hover:bg-green-50 rounded-lg" title="تأكيد">
                          <CheckCircle className="w-4 h-4" />
                        </button>
                        <button onClick={() => verifyMut.mutate({ id: p.id, status: 'rejected' })}
                          className="p-1.5 text-red-700 hover:bg-red-50 rounded-lg" title="رفض">
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    {/* gray-600 on white = 7.2:1 ✓ */}
                    {p.status !== 'pending' && <span className="text-xs text-gray-600 font-medium">{new Date(p.payment_date).toLocaleDateString('ar-EG')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal} onClose={() => { setModal(false); setForm(emptyForm); }} title="تسجيل دفعة جديدة">
        <form onSubmit={(e) => { e.preventDefault(); if (!form.student_id || !form.amount) return toast.error('الطالب والمبلغ مطلوبان'); createMut.mutate(form); }} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">الطالب *</label>
            <select value={form.student_id} onChange={e => setForm({ ...form, student_id: e.target.value })} className="input-field">
              <option value="">اختر الطالب</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">الكورس (اختياري)</label>
            <select value={form.course_id} onChange={e => setForm({ ...form, course_id: e.target.value })} className="input-field">
              <option value="">—</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1">المبلغ (جنيه) *</label>
              <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="input-field" placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1">طريقة الدفع</label>
              <select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })} className="input-field">
                <option value="Vodafone Cash">فودافون كاش</option>
                <option value="Instapay">إنستاباي</option>
                <option value="Cash">كاش</option>
                <option value="Bank Transfer">تحويل بنكي</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">رقم المرجع / الإيصال</label>
            <input value={form.reference_number} onChange={e => setForm({ ...form, reference_number: e.target.value })} className="input-field" dir="ltr" />
          </div>
          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">ملاحظات</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input-field h-16 resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => { setModal(false); setForm(emptyForm); }} className="flex-1 btn-secondary">إلغاء</button>
            <button type="submit" disabled={createMut.isPending} className="flex-1 btn-primary">تسجيل الدفعة</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
