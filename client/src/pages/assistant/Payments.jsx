import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, CheckCircle, XCircle, Clock, Search, Filter, Printer } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { generatePDFReport } from '../../lib/pdfReport';
import { useAuth } from '../../context/AuthContext';

const METHOD_LABELS = {
  'Vodafone Cash': '📱 فودافون كاش',
  'Instapay': '💳 إنستاباي',
  'Cash': '💵 كاش',
  'Bank Transfer': '🏦 تحويل بنكي',
};

const STATUS_MAP = {
  pending:  { label: 'قيد الانتظار', variant: 'warning' },
  verified: { label: 'مؤكدة',        variant: 'success' },
  confirmed: { label: 'مؤكدة',       variant: 'success' },
  rejected: { label: 'مرفوضة',       variant: 'danger'  },
};

export default function AssistantPayments() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canPrint = user?.role === 'teacher' || user?.can_manage_payments;
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: () => api.get('/payments').then(r => r.data),
  });

  const verifyMut = useMutation({
    mutationFn: ({ id, status }) => api.put(`/payments/${id}/verify`, { status }),
    onSuccess: () => {
      qc.invalidateQueries(['payments']);
      toast.success('تم تحديث حالة الدفعة');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const pendingCount  = payments.filter(p => p.status === 'pending').length;
  const verifiedCount = payments.filter(p => p.status === 'verified' || p.status === 'confirmed').length;
  const rejectedCount = payments.filter(p => p.status === 'rejected').length;

  const filtered = payments
    .filter(p => statusFilter === 'all' || p.status === statusFilter)
    .filter(p => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        p.student_name?.toLowerCase().includes(q) ||
        p.course_name?.toLowerCase().includes(q) ||
        p.reference_number?.toLowerCase().includes(q)
      );
    });

  const handlePrint = () => {
    const headers = ['الطالب', 'الكورس', 'المبلغ', 'طريقة الدفع', 'المرجع', 'الحالة', 'التاريخ'];
    const data = filtered.map(p => [
      p.student_name || '—',
      p.course_name || '—',
      p.amount != null ? `${parseFloat(p.amount).toLocaleString()} ج` : '—',
      METHOD_LABELS[p.method] || p.method || '—',
      p.reference_number || '—',
      STATUS_MAP[p.status]?.label || p.status,
      p.payment_date ? new Date(p.payment_date).toLocaleDateString('ar-EG') : '—',
    ]);
    generatePDFReport('تقرير المدفوعات', headers, data, 'payments_report.pdf', {
      stats: [
        { label: 'إجمالي الدفعات', value: filtered.length, color: '#1e3a5f' },
        { label: 'مؤكدة', value: filtered.filter(p => p.status === 'verified' || p.status === 'confirmed').length, color: '#16a34a' },
        { label: 'قيد الانتظار', value: filtered.filter(p => p.status === 'pending').length, color: '#d97706' },
        { label: 'مرفوضة', value: filtered.filter(p => p.status === 'rejected').length, color: '#dc2626' },
      ],
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-black text-navy-600 flex items-center gap-2">
          <CreditCard className="w-7 h-7 text-orange-500" />
          المدفوعات
        </h1>
        {canPrint && (
          <button onClick={handlePrint} className="btn-secondary flex items-center gap-2">
            <Printer className="w-4 h-4" /> طباعة التقارير
          </button>
        )}
      </div>

      {/* Operational counters only — no financial totals */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <p className="text-orange-800 text-xs font-bold mb-0.5">قيد الانتظار</p>
            <p className="text-2xl font-black text-orange-700">{pendingCount}</p>
            <p className="text-[10px] text-orange-400 font-semibold">دفعة تنتظر التأكيد</p>
          </div>
        </div>

        <div className="card flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <p className="text-green-800 text-xs font-bold mb-0.5">مؤكدة</p>
            <p className="text-2xl font-black text-green-700">{verifiedCount}</p>
            <p className="text-[10px] text-green-400 font-semibold">دفعة تم تأكيدها</p>
          </div>
        </div>

        <div className="card flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
            <XCircle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <p className="text-red-800 text-xs font-bold mb-0.5">مرفوضة</p>
            <p className="text-2xl font-black text-red-700">{rejectedCount}</p>
            <p className="text-[10px] text-red-400 font-semibold">دفعة تم رفضها</p>
          </div>
        </div>
      </div>

      {/* Search + Filter bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو الكورس أو رقم المرجع..."
              className="w-full pr-9 pl-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 placeholder-gray-400 focus:outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 transition"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-gray-400" />
            {['all', 'pending', 'verified', 'rejected'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  statusFilter === s
                    ? 'bg-navy-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s === 'all'      ? `الكل (${payments.length})`
                 : s === 'pending'  ? `انتظار (${pendingCount})`
                 : s === 'verified' ? `مؤكدة (${verifiedCount})`
                 :                    `مرفوضة (${rejectedCount})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Payments table */}
      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px]">
            <thead>
              <tr>
                <th className="table-header rounded-r-lg">الطالب</th>
                <th className="table-header">الكورس</th>
                <th className="table-header">طريقة الدفع</th>
                <th className="table-header">رقم المرجع</th>
                <th className="table-header">التاريخ</th>
                <th className="table-header">الحالة</th>
                <th className="table-header rounded-l-lg">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7}>
                      <div className="h-10 bg-gray-100 animate-pulse m-2 rounded" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-cell text-center py-16">
                    <CreditCard className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-semibold text-gray-500">لا توجد دفعات</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {search ? 'جرب تغيير كلمة البحث' : 'لم يتم تسجيل أي دفعات بعد'}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map(p => (
                  <tr key={p.id} className="table-row">
                    <td className="table-cell font-bold text-navy-700">{p.student_name}</td>
                    <td className="table-cell text-gray-700 font-medium">{p.course_name || '—'}</td>
                    <td className="table-cell text-gray-700">{METHOD_LABELS[p.method] || p.method}</td>
                    <td className="table-cell font-mono text-xs text-gray-600">{p.reference_number || '—'}</td>
                    <td className="table-cell text-gray-600 text-xs font-medium">
                      {new Date(p.payment_date).toLocaleDateString('ar-EG')}
                    </td>
                    <td className="table-cell">
                      <Badge variant={STATUS_MAP[p.status]?.variant || 'gray'}>
                        {STATUS_MAP[p.status]?.label || p.status}
                      </Badge>
                    </td>
                    <td className="table-cell">
                      {p.status === 'pending' ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => verifyMut.mutate({ id: p.id, status: 'verified' })}
                            disabled={verifyMut.isPending}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition"
                            title="تأكيد الدفعة"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            تأكيد
                          </button>
                          <button
                            onClick={() => verifyMut.mutate({ id: p.id, status: 'rejected' })}
                            disabled={verifyMut.isPending}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition"
                            title="رفض الدفعة"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            رفض
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 font-medium">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500">
              عرض {filtered.length} من {payments.length} دفعة
            </p>
            {pendingCount > 0 && (
              <p className="text-xs font-bold text-orange-600 bg-orange-50 px-3 py-1 rounded-full">
                {pendingCount} دفعة تنتظر تأكيدك
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
