import React, { useState, useEffect } from 'react';
import api from '../../api/axios';
import ConfirmModal from '../../components/ConfirmModal';
import useUrlState from '../../hooks/useUrlState';
import { Plus, Edit, Trash2, Search, Filter, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SubscriptionsList() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterTeacher, setFilterTeacher] = useUrlState('teacher', '');
  const [filterStatus, setFilterStatus] = useUrlState('status', '');
  const [search, setSearch] = useUrlState('q', '');

  // Add/Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSubId, setEditingSubId] = useState(null);
  
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [billingType, setBillingType] = useState('monthly');
  const [priceOverride, setPriceOverride] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState('active');
  const [notes, setNotes] = useState('');

  // Delete modal
  const [deleteId, setDeleteId] = useState(null);

  const fetchData = async () => {
    try {
      const [subRes, teacherRes, planRes] = await Promise.all([
        api.get('/subscriptions'),
        api.get('/teachers'),
        api.get('/plans'),
      ]);
      setSubscriptions(subRes.data.subscriptions);
      setTeachers(teacherRes.data.teachers);
      setPlans(planRes.data.plans.filter((p) => p.is_active));
    } catch (err) {
      console.error(err);
      toast.error('فشل تحميل الاشتراكات والبيانات المساعدة');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // When selectedPlanId changes in modal, auto-populate billing_type, price, and end_date
  useEffect(() => {
    if (!selectedPlanId || editingSubId) return;
    const plan = plans.find((p) => p.id === parseInt(selectedPlanId, 10));
    if (plan) {
      setBillingType(plan.billing_type);
      setPriceOverride(plan.price.toString());

      // Calculate end date based on billing type
      const start = new Date(startDate);
      if (plan.billing_type === 'monthly') {
        start.setMonth(start.getMonth() + 1);
        setEndDate(start.toISOString().split('T')[0]);
      } else if (plan.billing_type === 'annual') {
        start.setFullYear(start.getFullYear() + 1);
        setEndDate(start.toISOString().split('T')[0]);
      } else {
        setEndDate(''); // one_time has no expiration
      }
    }
  }, [selectedPlanId, plans, startDate, editingSubId]);

  const openAddModal = () => {
    setEditingSubId(null);
    // F1 FIX: stringify IDs so <select value> matches option value (HTML always coerces to string)
    setSelectedTeacherId(teachers[0]?.id ? String(teachers[0].id) : '');
    setSelectedPlanId(plans[0]?.id ? String(plans[0].id) : '');
    setNotes('');
    setStatus('active');
    setStartDate(new Date().toISOString().split('T')[0]);
    setModalOpen(true);
  };

  const openEditModal = (sub) => {
    setEditingSubId(sub.id);
    // F1 FIX: stringify IDs so <select value> matches option value
    setSelectedTeacherId(String(sub.teacher_id));
    setSelectedPlanId(String(sub.plan_id));
    setBillingType(sub.billing_type);
    setPriceOverride(sub.price_override?.toString() || '');
    setStartDate(sub.start_date.split('T')[0]);
    setEndDate(sub.end_date ? sub.end_date.split('T')[0] : '');
    setStatus(sub.status);
    setNotes(sub.notes || '');
    setModalOpen(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTeacherId || !selectedPlanId || !startDate) {
      return toast.error('يرجى ملء جميع الحقول المطلوبة');
    }

    const payload = {
      teacher_id: parseInt(selectedTeacherId, 10),
      plan_id: parseInt(selectedPlanId, 10),
      billing_type: billingType,
      price_override: priceOverride ? parseFloat(priceOverride) : null,
      start_date: startDate,
      end_date: endDate || null,
      status,
      notes,
    };

    try {
      if (editingSubId) {
        await api.put(`/subscriptions/${editingSubId}`, payload);
        toast.success('تم تعديل الاشتراك بنجاح');
      } else {
        await api.post('/subscriptions', payload);
        toast.success('تم ربط المدرس بالباقة وتفعيل الاشتراك');
      }
      setModalOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'حدث خطأ أثناء حفظ الاشتراك');
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      await api.delete(`/subscriptions/${deleteId}`);
      toast.success('تم حذف الاشتراك بنجاح');
      setDeleteId(null);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('فشل إلغاء الاشتراك');
    }
  };

  const getDaysRemainingText = (endDateStr, status) => {
    if (status !== 'active') return '';
    if (!endDateStr) return 'مستمر';
    const end = new Date(endDateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = end.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'منتهي';
    if (diffDays === 0) return 'ينتهي اليوم';
    return `${diffDays} يوم متبقي`;
  };

  const filteredSubscriptions = subscriptions.filter((s) => {
    const matchSearch =
      s.teacher_name.toLowerCase().includes(search.toLowerCase()) ||
      s.plan_name.toLowerCase().includes(search.toLowerCase());

    const matchTeacher = !filterTeacher || s.teacher_id === parseInt(filterTeacher, 10);
    const matchStatus = !filterStatus || s.status === filterStatus;

    return matchSearch && matchTeacher && matchStatus;
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white font-cairo">إدارة اشتراكات المدرسين</h1>
          <p className="text-slate-400 mt-1 font-cairo text-sm">متابعة وتمديد وتعديل اشتراكات المدرسين بالمنصة والخدمات</p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600 transition font-cairo whitespace-nowrap"
        >
          <Plus size={16} />
          <span>إضافة اشتراك جديد</span>
        </button>
      </div>

      {/* Filters Area */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between rounded-xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="relative max-w-sm flex-1">
          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500">
            <Search size={18} />
          </span>
          <input
            type="text"
            placeholder="البحث بالمدرس أو الباقة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full rounded-xl border border-slate-800 bg-slate-950/50 py-2 px-10 pl-4 text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none text-xs font-cairo"
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            value={filterTeacher}
            onChange={(e) => setFilterTeacher(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-950/50 py-2 px-4 text-slate-300 text-xs focus:outline-none font-cairo"
          >
            <option value="">تصفية بالمدرس (الكل)</option>
            {teachers.map((t) => (
              <option key={t.id} value={String(t.id)}>{t.name}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-950/50 py-2 px-4 text-slate-300 text-xs focus:outline-none font-cairo"
          >
            <option value="">تصفية بالحالة (الكل)</option>
            <option value="active">نشط</option>
            <option value="expired">منتهي</option>
            <option value="cancelled">ملغي</option>
          </select>
        </div>
      </div>

      {/* Subscriptions Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/20 shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-900/80 text-xs font-bold text-slate-300 font-cairo border-b border-slate-800">
              <tr>
                <th className="px-6 py-4">المدرس</th>
                <th className="px-6 py-4">الباقة المشتركة</th>
                <th className="px-6 py-4">دورة الفوترة</th>
                <th className="px-6 py-4">تاريخ البدء والانتهاء</th>
                <th className="px-6 py-4">سعر الاشتراك</th>
                <th className="px-6 py-4">الوقت المتبقي</th>
                <th className="px-6 py-4">الحالة</th>
                <th className="px-6 py-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300 font-cairo">
              {filteredSubscriptions.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-12 text-center text-slate-500 font-cairo">
                    لا توجد أي اشتراكات مطابقة.
                  </td>
                </tr>
              ) : (
                filteredSubscriptions.map((s) => {
                  const daysLeftText = getDaysRemainingText(s.end_date, s.status);
                  const isExpiringSoon = daysLeftText && daysLeftText.includes('يوم متبقي') && parseInt(daysLeftText) <= 7;

                  return (
                    <tr key={s.id} className="hover:bg-slate-900/30 transition">
                      <td className="px-6 py-4">
                        <span className="font-semibold text-white">{s.teacher_name}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-200">{s.plan_name}</span>
                          <span className="text-[10px] text-slate-500">
                            {s.plan_category === 'platform' && 'استضافة منصة'}
                            {s.plan_category === 'social_media' && 'سوشيال ميديا'}
                            {s.plan_category === 'service' && 'إنتاج وخدمات'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-400">
                        {s.billing_type === 'monthly' ? 'شهري' : s.billing_type === 'annual' ? 'سنوي' : 'مرة واحدة'}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs">
                        <div className="flex flex-col">
                          <span>بدء: {s.start_date.split('T')[0]}</span>
                          <span className="text-slate-500">انتهاء: {s.end_date ? s.end_date.split('T')[0] : 'مستمر'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-semibold text-white">
                        {s.price_override || s.plan_price} EGP
                      </td>
                      <td className="px-6 py-4">
                        {daysLeftText && (
                          <span className={`font-semibold ${isExpiringSoon ? 'text-red-400 animate-pulse' : 'text-slate-300'}`}>
                            {daysLeftText}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold leading-5 ${
                          s.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : s.status === 'cancelled'
                            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                            : 'bg-slate-800 text-slate-500 border border-slate-700/50'
                        }`}>
                          {s.status === 'active' && 'نشط'}
                          {s.status === 'cancelled' && 'ملغي'}
                          {s.status === 'expired' && 'منتهي'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(s)}
                            className="rounded-lg bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 hover:text-white transition"
                            title="تعديل الاشتراك"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteId(s.id)}
                            className="rounded-lg bg-red-950/40 p-2 text-red-400 hover:bg-red-900/60 transition"
                            title="إلغاء الاشتراك"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-xl font-bold text-white font-cairo border-b border-slate-800 pb-3">
              {editingSubId ? 'تعديل وتمديد الاشتراك' : 'ربط مدرس باشتراك باقة'}
            </h3>

            <form onSubmit={handleFormSubmit} className="mt-4 space-y-4 font-cairo">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">المدرس المشترك *</label>
                  <select
                    disabled={!!editingSubId}
                    value={selectedTeacherId}
                    onChange={(e) => setSelectedTeacherId(e.target.value)}
                    className="mt-1.5 block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white focus:outline-none text-sm disabled:opacity-50"
                  >
                    {teachers.map((t) => (
                      <option key={t.id} value={String(t.id)}>{t.name} (@{t.slug})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300">الباقة المطلوبة *</label>
                  <select
                    disabled={!!editingSubId}
                    value={selectedPlanId}
                    onChange={(e) => setSelectedPlanId(e.target.value)}
                    className="mt-1.5 block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white focus:outline-none text-sm disabled:opacity-50"
                  >
                    {plans.map((p) => (
                      <option key={p.id} value={String(p.id)}>{p.name} ({p.price} EGP)</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300">نوع الفوترة</label>
                  <select
                    value={billingType}
                    onChange={(e) => setBillingType(e.target.value)}
                    className="mt-1.5 block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white focus:outline-none text-sm"
                  >
                    <option value="monthly">شهري</option>
                    <option value="annual">سنوي</option>
                    <option value="one_time">مرة واحدة</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300">السعر المتفق عليه (اختلاف اختياري)</label>
                  <input
                    type="number"
                    value={priceOverride}
                    onChange={(e) => setPriceOverride(e.target.value)}
                    placeholder="السعر الفعلي المتفق عليه"
                    className="mt-1.5 block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white focus:outline-none text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300">تاريخ بدء الاشتراك *</label>
                  <div className="relative mt-1.5">
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white focus:outline-none text-sm font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300">تاريخ انتهاء الاشتراك</label>
                  <div className="relative mt-1.5">
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white focus:outline-none text-sm font-mono"
                    />
                  </div>
                </div>

                {editingSubId && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300">حالة الاشتراك</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="mt-1.5 block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white focus:outline-none text-sm"
                    >
                      <option value="active">نشط</option>
                      <option value="expired">منتهي</option>
                      <option value="cancelled">ملغي</option>
                    </select>
                  </div>
                )}

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300">ملاحظات إضافية</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="اكتب هنا أي ملاحظات حول السعر، الخصم أو شروط الدعم المتفق عليها..."
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
                  حفظ الاشتراك
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteId !== null}
        title="إلغاء الاشتراك وحذفه"
        message="هل أنت متأكد من إلغاء وحذف هذا الاشتراك تماماً للمدرس؟ لن تظهر الباقة أو طلابها كنشطين بالنسبة له."
        confirmText="حذف الاشتراك"
        cancelText="إلغاء"
        isDanger={true}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
