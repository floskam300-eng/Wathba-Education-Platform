import React, { useState, useEffect } from 'react';
import api from '../../api/axios';
import ConfirmModal from '../../components/ConfirmModal';
import { Plus, Edit, Trash2, ShieldCheck, Check, X, Info } from 'lucide-react';
import toast from 'react-hot-toast';

export default function PlansList() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal form states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('platform'); // platform, social_media, service
  const [maxStudents, setMaxStudents] = useState('');
  const [price, setPrice] = useState('');
  const [firstMonthPrice, setFirstMonthPrice] = useState('');
  const [billingType, setBillingType] = useState('monthly'); // monthly, annual, one_time
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);

  // Delete modal state
  const [deleteId, setDeleteId] = useState(null);

  const fetchPlans = async () => {
    try {
      const res = await api.get('/plans');
      setPlans(res.data.plans);
    } catch (err) {
      console.error(err);
      toast.error('فشل تحميل باقات الاشتراك');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const openAddModal = () => {
    setEditingPlanId(null);
    setName('');
    setDescription('');
    setCategory('platform');
    setMaxStudents('');
    setPrice('');
    setFirstMonthPrice('');
    setBillingType('monthly');
    setIsActive(true);
    setSortOrder(0);
    setModalOpen(true);
  };

  const openEditModal = (plan) => {
    setEditingPlanId(plan.id);
    setName(plan.name);
    setDescription(plan.description || '');
    setCategory(plan.category);
    setMaxStudents(plan.max_students !== null ? plan.max_students.toString() : '');
    setPrice(plan.price.toString());
    setFirstMonthPrice(plan.first_month_price !== null ? plan.first_month_price.toString() : '');
    setBillingType(plan.billing_type);
    setIsActive(plan.is_active);
    setSortOrder(plan.sort_order);
    setModalOpen(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!name || !price || !billingType) {
      return toast.error('يرجى ملء الحقول الأساسية المطلوبة');
    }

    const payload = {
      name,
      description,
      category,
      max_students: maxStudents ? parseInt(maxStudents) : null,
      price: parseFloat(price),
      first_month_price: firstMonthPrice ? parseFloat(firstMonthPrice) : null,
      billing_type: billingType,
      is_active: isActive,
      sort_order: parseInt(sortOrder) || 0,
    };

    try {
      if (editingPlanId) {
        await api.put(`/plans/${editingPlanId}`, payload);
        toast.success('تم تحديث الباقة بنجاح');
      } else {
        await api.post('/plans', payload);
        toast.success('تم إضافة الباقة الجديدة بنجاح');
      }
      setModalOpen(false);
      fetchPlans();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'حدث خطأ أثناء حفظ الباقة');
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      await api.delete(`/plans/${deleteId}`);
      toast.success('تم حذف الباقة بنجاح');
      setDeleteId(null);
      fetchPlans();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'فشل حذف الباقة');
    }
  };

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
          <h1 className="text-2xl sm:text-3xl font-bold text-white font-cairo">إدارة الباقات (Plans)</h1>
          <p className="text-slate-400 mt-1 font-cairo text-sm">تخصيص الباقات التعليمية، خدمات السوشيال ميديا، والإنتاج الفني للمشتركين</p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600 transition font-cairo whitespace-nowrap"
        >
          <Plus size={16} />
          <span>إنشاء باقة جديدة</span>
        </button>
      </div>

      {/* Plans List Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/20 shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-900/80 text-xs font-bold text-slate-300 font-cairo border-b border-slate-800">
              <tr>
                <th className="px-6 py-4">اسم الباقة</th>
                <th className="px-6 py-4">الفئة</th>
                <th className="px-6 py-4">دورة الفوترة</th>
                <th className="px-6 py-4">السعر الأساسي</th>
                <th className="px-6 py-4">سعر الشهر الأول</th>
                <th className="px-6 py-4">سقف الطلاب</th>
                <th className="px-6 py-4">المشتركين النشطين</th>
                <th className="px-6 py-4">الحالة</th>
                <th className="px-6 py-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300 font-cairo">
              {plans.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-6 py-12 text-center text-slate-500 font-cairo">
                    لا توجد أي باقات مسجلة حالياً. انقر على "إنشاء باقة جديدة" للبدء.
                  </td>
                </tr>
              ) : (
                plans.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-900/30 transition">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-white">{p.name}</div>
                      {p.description && <div className="text-xs text-slate-500 max-w-xs truncate">{p.description}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs">
                        {p.category === 'platform' && 'استضافة منصة'}
                        {p.category === 'social_media' && 'سوشيال ميديا'}
                        {p.category === 'service' && 'خدمات ومونتاج'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs text-slate-400">
                        {p.billing_type === 'monthly' && 'شهري'}
                        {p.billing_type === 'annual' && 'سنوي'}
                        {p.billing_type === 'one_time' && 'مرة واحدة'}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-white">{p.price} EGP</td>
                    <td className="px-6 py-4 text-slate-400 font-mono text-xs">
                      {p.first_month_price ? `${p.first_month_price} EGP` : 'لا يوجد'}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs">
                      {p.max_students !== null ? `${p.max_students} طالب` : 'غير محدود'}
                    </td>
                    <td className="px-6 py-4 text-center font-bold text-amber-500">{p.subscribers_count} مدرس</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold leading-5 ${
                        p.is_active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-500'
                      }`}>
                        {p.is_active ? 'نشطة' : 'معطلة'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(p)}
                          className="rounded-lg bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 hover:text-white transition"
                          title="تعديل الباقة"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteId(p.id)}
                          className="rounded-lg bg-red-950/40 p-2 text-red-400 hover:bg-red-900/60 transition"
                          title="حذف الباقة"
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

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-xl font-bold text-white font-cairo border-b border-slate-800 pb-3">
              {editingPlanId ? 'تعديل باقة الاشتراك' : 'إنشاء باقة جديدة'}
            </h3>

            <form onSubmit={handleFormSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 font-cairo">اسم الباقة (عربي) *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مثال: باقة البداية من منصة وثبة"
                    className="mt-1.5 block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white placeholder-slate-600 focus:outline-none text-sm font-cairo"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 font-cairo">فئة الباقة *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1.5 block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white focus:outline-none text-sm font-cairo"
                  >
                    <option value="platform">استضافة منصة تعليمية</option>
                    <option value="social_media">إدارة السوشيال ميديا</option>
                    <option value="service">مونتاج / خدمات إنتاج</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 font-cairo">نظام الفوترة *</label>
                  <select
                    value={billingType}
                    onChange={(e) => setBillingType(e.target.value)}
                    className="mt-1.5 block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white focus:outline-none text-sm font-cairo"
                  >
                    <option value="monthly">شهري</option>
                    <option value="annual">سنوي</option>
                    <option value="one_time">مرة واحدة (شراء فردي)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 font-cairo">السعر الأساسي (EGP) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="699.00"
                    className="mt-1.5 block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white placeholder-slate-600 focus:outline-none text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 font-cairo">سعر الشهر الأول (اختياري)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={firstMonthPrice}
                    onChange={(e) => setFirstMonthPrice(e.target.value)}
                    placeholder="1500.00"
                    className="mt-1.5 block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white placeholder-slate-600 focus:outline-none text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 font-cairo">الحد الأقصى للطلاب (اختياري)</label>
                  <input
                    type="number"
                    min="1"
                    value={maxStudents}
                    onChange={(e) => setMaxStudents(e.target.value)}
                    placeholder="ترك فارغاً لعدد غير محدود"
                    className="mt-1.5 block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white placeholder-slate-600 focus:outline-none text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 font-cairo">ترتيب العرض</label>
                  <input
                    type="number"
                    min="0"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    placeholder="0"
                    className="mt-1.5 block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white text-center focus:outline-none text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 font-cairo">الوصف البسيط للباقة</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="مثال: باقة تشمل استضافة وحصص متزامنة بث مباشر لحد 100 طالب مقيد..."
                  rows="2"
                  className="mt-1.5 block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-white placeholder-slate-600 focus:outline-none text-xs font-cairo resize-none"
                ></textarea>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="planActive"
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-slate-800 bg-slate-950 text-amber-500 focus:ring-amber-500 h-4 w-4"
                />
                <label htmlFor="planActive" className="text-xs text-slate-300 font-cairo cursor-pointer select-none">الباقة مفعلة ويمكن استخدامها الآن في ربط الاشتراكات</label>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-800 pt-4 mt-6">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition font-cairo"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm text-white font-medium hover:bg-amber-600 transition font-cairo"
                >
                  حفظ الباقة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteId !== null}
        title="حذف باقة الاشتراك"
        message="هل أنت متأكد من حذف هذه الباقة بالكامل؟ لن تتمكن من استرجاعها، ولن يُسمح بحذفها إذا كان هناك مدرسون مشتركون عليها حالياً."
        confirmText="حذف الباقة"
        cancelText="إلغاء"
        isDanger={true}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
