import React, { useState, useEffect } from 'react';
import api from '../../api/axios';
import ConfirmModal from '../../components/ConfirmModal';
import { Plus, Trash2, Search, Calendar, Landmark } from 'lucide-react';
import toast from 'react-hot-toast';

export default function PaymentsList() {
  const [payments, setPayments] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterTeacher, setFilterTeacher] = useState('');

  // Add Payment Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [teacherSubs, setTeacherSubs] = useState([]);
  const [selectedSubId, setSelectedSubId] = useState('');
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().split('T')[0]);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('instapay'); // instapay, vodafone_cash, bank, cash, other
  const [notes, setNotes] = useState('');

  // Delete modal
  const [deleteId, setDeleteId] = useState(null);

  const fetchData = async () => {
    try {
      const [paymentsRes, teachersRes] = await Promise.all([
        api.get('/payments'),
        api.get('/teachers'),
      ]);
      setPayments(paymentsRes.data.payments);
      setTeachers(teachersRes.data.teachers);
    } catch (err) {
      console.error(err);
      toast.error('فشل تحميل قائمة المقبوضات والبيانات المساعدة');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Fetch teacher's active/past subscriptions when selected in the modal
  useEffect(() => {
    if (!selectedTeacherId) {
      setTeacherSubs([]);
      setSelectedSubId('');
      return;
    }
    const fetchTeacherSubs = async () => {
      try {
        const res = await api.get(`/subscriptions?teacher_id=${selectedTeacherId}`);
        setTeacherSubs(res.data.subscriptions);
        if (res.data.subscriptions.length > 0) {
          setSelectedSubId(res.data.subscriptions[0].id.toString());
          setAmount(res.data.subscriptions[0].price_override || res.data.subscriptions[0].plan_price);
        } else {
          setSelectedSubId('');
          setAmount('');
        }
      } catch (err) {
        console.error(err);
        toast.error('فشل جلب باقات المدرس المحددة');
      }
    };
    fetchTeacherSubs();
  }, [selectedTeacherId]);

  // Set default amount when subscription selection changes
  const handleSubChange = (subIdStr) => {
    setSelectedSubId(subIdStr);
    const sub = teacherSubs.find((s) => s.id === parseInt(subIdStr, 10));
    if (sub) {
      setAmount(sub.price_override || sub.plan_price);
    }
  };

  const openAddModal = () => {
    setSelectedTeacherId(teachers[0]?.id || '');
    setPaidAt(new Date().toISOString().split('T')[0]);
    setPeriodStart('');
    setPeriodEnd('');
    setPaymentMethod('instapay');
    setNotes('');
    setModalOpen(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSubId || !amount || !paidAt) {
      return toast.error('يرجى ملء جميع الحقول المطلوبة');
    }

    const payload = {
      subscription_id: parseInt(selectedSubId, 10),
      amount: parseFloat(amount),
      paid_at: paidAt,
      period_start: periodStart || null,
      period_end: periodEnd || null,
      payment_method: paymentMethod,
      notes,
    };

    try {
      await api.post('/payments', payload);
      toast.success('تم تسجيل الدفعة المالية بنجاح');
      setModalOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('فشل تسجيل الدفعة المالية');
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      await api.delete(`/payments/${deleteId}`);
      toast.success('تم حذف الدفعة المسجلة بنجاح');
      setDeleteId(null);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('فشل حذف الدفعة المالية');
    }
  };

  // Financial Sums calculations
  const calculateTotalThisMonth = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return payments
      .filter((p) => {
        const paidDate = new Date(p.paid_at);
        return paidDate.getMonth() === currentMonth && paidDate.getFullYear() === currentYear;
      })
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);
  };

  const calculateTotalThisYear = () => {
    const currentYear = new Date().getFullYear();

    return payments
      .filter((p) => new Date(p.paid_at).getFullYear() === currentYear)
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);
  };

  const filteredPayments = payments.filter((p) => {
    return !filterTeacher || p.teacher_id === parseInt(filterTeacher, 10);
  });

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white font-cairo">تحصيل مدفوعات المدرسين</h1>
          <p className="text-slate-400 mt-1 font-cairo">تسجيل وإدارة اشتراكات المنصة المجمعة من المدرسين</p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600 transition font-cairo"
        >
          <Plus size={16} />
          <span>تسجيل دفعة جديدة</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-md">
          <div className="text-xs text-slate-400 font-cairo">المحصل المالي هذا الشهر</div>
          <div className="mt-2 text-3xl font-bold text-emerald-500">{calculateTotalThisMonth()} EGP</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-md">
          <div className="text-xs text-slate-400 font-cairo">المحصل المالي هذا العام</div>
          <div className="mt-2 text-3xl font-bold text-amber-500">{calculateTotalThisYear()} EGP</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-md">
          <div className="text-xs text-slate-400 font-cairo">إجمالي الدفعات المسجلة</div>
          <div className="mt-2 text-3xl font-bold text-white">{payments.length} دفعة</div>
        </div>
      </div>

      {/* Filters Area */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="flex flex-wrap gap-3">
          <select
            value={filterTeacher}
            onChange={(e) => setFilterTeacher(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-950/50 py-2 px-4 text-slate-300 text-xs focus:outline-none font-cairo"
          >
            <option value="">كل المدرسين</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Payments List Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/20 shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-900/80 text-xs font-bold text-slate-300 font-cairo border-b border-slate-800">
              <tr>
                <th className="px-6 py-4">المدرس</th>
                <th className="px-6 py-4">الباقة المفوترة</th>
                <th className="px-6 py-4">تاريخ السداد</th>
                <th className="px-6 py-4">طريقة التحصيل</th>
                <th className="px-6 py-4">تغطية الفترة الماليّة</th>
                <th className="px-6 py-4">المبلغ المستلم</th>
                <th className="px-6 py-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300 font-cairo">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-slate-500 font-cairo">
                    لا توجد أي عمليات دفع مسجلة.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-900/30 transition">
                    <td className="px-6 py-4">
                      <span className="font-semibold text-white">{p.teacher_name}</span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-200">
                      {p.plan_name}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-400">
                      {p.paid_at.split('T')[0]}
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      {p.payment_method === 'instapay' && 'InstaPay'}
                      {p.payment_method === 'vodafone_cash' && 'فودافون كاش'}
                      {p.payment_method === 'bank' && 'حوالة بنكية'}
                      {p.payment_method === 'cash' && 'نقدي'}
                      {p.payment_method === 'other' && 'أخرى'}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">
                      {p.period_start && p.period_end ? (
                        <span>من {p.period_start.split('T')[0]} إلى {p.period_end.split('T')[0]}</span>
                      ) : (
                        <span>غير محدد</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-bold text-emerald-400">
                      {p.amount} EGP
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() => setDeleteId(p.id)}
                          className="rounded-lg bg-red-950/40 p-2 text-red-400 hover:bg-red-900/60 transition"
                          title="حذف الدفعة (تصحيح خطأ)"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Payment Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-xl font-bold text-white font-cairo border-b border-slate-800 pb-3">
              تسجيل دفعة إيراد جديدة
            </h3>

            <form onSubmit={handleFormSubmit} className="mt-4 space-y-4 font-cairo">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">المدرس *</label>
                  <select
                    value={selectedTeacherId}
                    onChange={(e) => setSelectedTeacherId(e.target.value)}
                    className="mt-1.5 block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white focus:outline-none text-sm"
                  >
                    <option value="">اختر المدرس...</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} (@{t.slug})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300">الاشتراك المستهدف *</label>
                  <select
                    disabled={teacherSubs.length === 0}
                    value={selectedSubId}
                    onChange={(e) => handleSubChange(e.target.value)}
                    className="mt-1.5 block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white focus:outline-none text-sm disabled:opacity-50"
                  >
                    {teacherSubs.length === 0 ? (
                      <option value="">اختر المدرس أولاً...</option>
                    ) : (
                      teacherSubs.map((s) => (
                        <option key={s.id} value={s.id}>{s.plan_name} ({s.status === 'active' ? 'نشط' : 'سابق'})</option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300">المبلغ المستلم (EGP) *</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="mt-1.5 block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white focus:outline-none text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300">تاريخ استلام الدفعة *</label>
                  <input
                    type="date"
                    required
                    value={paidAt}
                    onChange={(e) => setPaidAt(e.target.value)}
                    className="mt-1.5 block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white focus:outline-none text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300">طريقة التحصيل *</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="mt-1.5 block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white focus:outline-none text-sm"
                  >
                    <option value="instapay">InstaPay</option>
                    <option value="vodafone_cash">فودافون كاش</option>
                    <option value="bank">حوالة بنكية</option>
                    <option value="cash">نقدي</option>
                    <option value="other">أخرى</option>
                  </select>
                </div>

                <div className="hidden sm:block"></div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300">تغطية الفترة الماليّة من</label>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className="mt-1.5 block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white focus:outline-none text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300">إلى تاريخ</label>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className="mt-1.5 block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white focus:outline-none text-sm font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300">ملاحظات التحصيل</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="أضف هنا أي ملاحظات أو أرقام مراجع للتحويلات..."
                    rows="2"
                    className="mt-1.5 block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white placeholder-slate-600 focus:outline-none text-xs resize-none"
                  ></textarea>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-800 pt-4 mt-6">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm text-white font-medium hover:bg-amber-600 transition"
                >
                  تسجيل الدفعة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteId !== null}
        title="حذف الدفعة المسجلة"
        message="هل أنت متأكد من حذف هذه الدفعة نهائياً لتصحيح خطأ إدخال؟ سيتم تعديل المجموع المالي المسجل بالمنصة فوراً."
        confirmText="حذف الدفعة"
        cancelText="إلغاء"
        isDanger={true}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
