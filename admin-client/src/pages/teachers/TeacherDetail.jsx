import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import ConfirmModal from '../../components/ConfirmModal';
import { ArrowRight, Edit, ShieldAlert, ShieldCheck, Trash2, Calendar, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

// Helper: Format Bytes to human-readable size
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export default function TeacherDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modals
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');

  const fetchData = async () => {
    try {
      const res = await api.get(`/teachers/${id}`);
      setData(res.data);
    } catch (err) {
      console.error(err);
      toast.error('فشل تحميل تفاصيل المدرس');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const handleSuspendToggle = async () => {
    try {
      const isSusp = data.teacher.is_platform_suspended;
      await api.post(`/teachers/${id}/suspend`, {
        suspend: !isSusp,
        reason: suspendReason,
      });

      setData({
        ...data,
        teacher: {
          ...data.teacher,
          is_platform_suspended: !isSusp,
          platform_suspended_reason: suspendReason,
        },
      });

      toast.success(!isSusp ? 'تم إيقاف حساب المدرس بنجاح' : 'تم تنشيط حساب المدرس بنجاح');
      setSuspendOpen(false);
      setSuspendReason('');
    } catch (err) {
      console.error(err);
      toast.error('فشل تعليق/تفعيل المدرس');
    }
  };

  const handleDeleteTeacher = async () => {
    if (deleteConfirmText.trim() !== data.teacher.slug) {
      return toast.error('يرجى كتابة اسم الرابط بشكل صحيح للتأكيد');
    }

    try {
      await api.delete(`/teachers/${id}`);
      toast.success('تم حذف حساب المدرس بنجاح');
      navigate('/teachers');
    } catch (err) {
      console.error(err);
      toast.error('فشل حذف حساب المدرس');
    }
  };

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400 font-cairo">المدرس غير موجود.</p>
        <Link to="/teachers" className="mt-4 inline-flex items-center gap-2 text-amber-500 hover:underline font-cairo">
          <ArrowRight size={16} /> العودة لقائمة المدرسين
        </Link>
      </div>
    );
  }

  const { teacher, stats, subscriptions, payments } = data;
  const isSuspended = teacher.is_platform_suspended;
  const activeSub = subscriptions.find((s) => s.status === 'active');

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link to="/teachers" className="text-slate-400 hover:text-white transition">
            <ArrowRight size={24} />
          </Link>
          <div className="flex items-center gap-3">
            <img
              src={teacher.logo_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(teacher.name) + '&background=f97316&color=fff&size=64'}
              alt={teacher.name}
              className="h-12 w-12 rounded-xl object-cover border border-slate-800 bg-slate-800"
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-3xl font-bold text-white font-cairo">{teacher.name}</h1>
                {isSuspended && (
                  <span className="inline-flex rounded-full bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 text-xs font-semibold leading-5 font-cairo">
                    موقوف إدارياً
                  </span>
                )}
              </div>
              <p className="text-slate-400 mt-1 font-mono text-sm">@{teacher.slug}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Link
            to={`/teachers/edit/${teacher.id}`}
            className="flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-2.5 text-sm font-semibold text-white transition font-cairo"
          >
            <Edit size={16} />
            <span>تعديل الملف</span>
          </Link>
          <button
            onClick={() => setSuspendOpen(true)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition font-cairo ${
              isSuspended
                ? 'bg-emerald-600 hover:bg-emerald-500'
                : 'bg-orange-600 hover:bg-orange-500'
            }`}
          >
            {isSuspended ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
            <span>{isSuspended ? 'تفعيل الحساب' : 'تعليق الحساب'}</span>
          </button>
          <button
            onClick={() => setDeleteOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 px-4 py-2.5 text-sm font-semibold text-red-400 transition font-cairo"
          >
            <Trash2 size={16} />
            <span>حذف الحساب</span>
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left Side: Stats & Current Subscription */}
        <div className="space-y-8 lg:col-span-1">
          {/* Card: Stats */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-6">
            <h3 className="text-lg font-bold text-white font-cairo border-b border-slate-800 pb-3">الإحصاءات والتحليلات</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/60">
                <div className="text-xs text-slate-500 font-cairo">الطلاب المقيدين</div>
                <div className="mt-1 text-2xl font-bold text-white">{stats.total_students}</div>
              </div>
              <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/60">
                <div className="text-xs text-slate-500 font-cairo">الكورسات المفعلة</div>
                <div className="mt-1 text-2xl font-bold text-white">{stats.total_courses}</div>
              </div>
              <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/60">
                <div className="text-xs text-slate-500 font-cairo">الامتحانات والتقييمات</div>
                <div className="mt-1 text-2xl font-bold text-white">{stats.total_exams}</div>
              </div>
              <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/60">
                <div className="text-xs text-slate-500 font-cairo">التخزين المستهلك</div>
                <div className="mt-1 text-sm font-bold text-amber-500 mt-2">{formatBytes(stats.storage_bytes)}</div>
              </div>
            </div>
          </div>

          {/* Card: Current Active Subscription */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white font-cairo border-b border-slate-800 pb-3">الاشتراك الحالي</h3>
            {activeSub ? (
              <div className="space-y-3 font-cairo text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">الباقة المشتركة:</span>
                  <span className="font-semibold text-white">{activeSub.plan_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">نظام الفوترة:</span>
                  <span className="text-slate-200">
                    {activeSub.billing_type === 'monthly' ? 'شهري' : activeSub.billing_type === 'annual' ? 'سنوي' : 'مرة واحدة'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">السعر المتفق عليه:</span>
                  <span className="text-amber-500 font-semibold">{activeSub.price_override || activeSub.plan_price} EGP</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">تاريخ بدء الباقة:</span>
                  <span className="text-slate-300 font-mono text-xs">{activeSub.start_date.split('T')[0]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">تاريخ انتهاء الباقة:</span>
                  <span className="text-slate-300 font-mono text-xs">
                    {activeSub.end_date ? activeSub.end_date.split('T')[0] : 'غير محدد (مستمر)'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-sm text-red-400 font-cairo">لا يوجد باقة اشتراك مفعلة حالياً للمنصة</p>
                <Link
                  to="/subscriptions"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs text-white font-semibold hover:bg-amber-600 transition font-cairo"
                >
                  ربط المدرس بباقة جديدة
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Subscriptions & Payments logs */}
        <div className="space-y-8 lg:col-span-2">
          {/* Subscriptions History */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white font-cairo border-b border-slate-800 pb-3">سجل الباقات والاشتراكات</h3>
            
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="text-slate-400 border-b border-slate-800 font-cairo">
                  <tr>
                    <th className="pb-3">الباقة</th>
                    <th className="pb-3">تاريخ البدء</th>
                    <th className="pb-3">تاريخ الانتهاء</th>
                    <th className="pb-3">التكلفة</th>
                    <th className="pb-3">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-slate-300 font-cairo font-medium">
                  {subscriptions.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-6 text-center text-slate-500">لا يوجد أي سجل اشتراكات سابق.</td>
                    </tr>
                  ) : (
                    subscriptions.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-950/20">
                        <td className="py-3 font-semibold text-white">{s.plan_name}</td>
                        <td className="py-3 font-mono text-xs">{s.start_date.split('T')[0]}</td>
                        <td className="py-3 font-mono text-xs">{s.end_date ? s.end_date.split('T')[0] : 'لا يوجد'}</td>
                        <td className="py-3 font-semibold text-amber-500">{s.price_override || s.plan_price} EGP</td>
                        <td className="py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            s.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
                          }`}>
                            {s.status === 'active' ? 'نشط' : s.status === 'cancelled' ? 'ملغي' : 'منتهي'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payments Logs */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white font-cairo border-b border-slate-800 pb-3">سجل الدفعات والتحصيل المالي</h3>
            
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="text-slate-400 border-b border-slate-800 font-cairo">
                  <tr>
                    <th className="pb-3">الباقة</th>
                    <th className="pb-3">تاريخ الدفع</th>
                    <th className="pb-3">طريقة الدفع</th>
                    <th className="pb-3">الفترة المدفوعة</th>
                    <th className="pb-3">المبلغ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-slate-300 font-cairo">
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-6 text-center text-slate-500">لا يوجد أي دفعات مسجلة للمدرس.</td>
                    </tr>
                  ) : (
                    payments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-950/20">
                        <td className="py-3 font-medium text-white">{p.plan_name}</td>
                        <td className="py-3 font-mono text-xs">{p.paid_at.split('T')[0]}</td>
                        <td className="py-3 font-medium">{p.payment_method}</td>
                        <td className="py-3 font-mono text-xs">
                          {p.period_start && p.period_end
                            ? `${p.period_start.split('T')[0]} إلى ${p.period_end.split('T')[0]}`
                            : 'لا يوجد'}
                        </td>
                        <td className="py-3 font-semibold text-emerald-500">{p.amount} EGP</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Suspend Modal */}
      <ConfirmModal
        isOpen={suspendOpen}
        title={isSuspended ? 'تفعيل حساب المدرس' : 'تعليق حساب المدرس'}
        message={
          <div>
            <p className="font-cairo text-sm">
              {isSuspended
                ? 'هل أنت متأكد من تفعيل الحساب؟ سيتمكن المدرس ومساعدوه وطلابه من استخدام المنصة فوراً.'
                : 'هل أنت متأكد من تعليق هذا الحساب؟ سيتم منع المدرس ومساعديه وطلابه بالكامل من الدخول للمنصة واللوحات.'}
            </p>
            {!isSuspended && (
              <div className="mt-4">
                <label className="block text-xs font-semibold text-slate-300 font-cairo mb-1">
                  سبب التعليق (سيظهر للمستخدمين عند محاولة الدخول):
                </label>
                <input
                  type="text"
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder="مثال: انتهاء الاشتراك وعدم التجديد"
                  className="block w-full rounded-lg border border-slate-800 bg-slate-950 py-2 px-3 text-sm text-white placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
            )}
          </div>
        }
        confirmText={isSuspended ? 'تفعيل الحساب' : 'تعليق الحساب'}
        cancelText="إلغاء"
        isDanger={!isSuspended}
        onConfirm={handleSuspendToggle}
        onCancel={() => {
          setSuspendOpen(false);
          setSuspendReason('');
        }}
      />

      {/* Delete Modal */}
      <ConfirmModal
        isOpen={deleteOpen}
        title="حذف حساب مدرس نهائياً"
        message={
          <div className="space-y-4">
            <div className="text-red-400 bg-red-950/20 p-3 rounded-lg border border-red-500/20 text-xs font-cairo">
              تحذير: سيؤدي هذا الإجراء لحذف المدرس وجميع كورساته وطلابه وامتحاناته ومرفوعاته نهائياً من قاعدة البيانات. لا يمكن التراجع عن هذا الإجراء!
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 font-cairo mb-1">
                لتأكيد الحذف، يرجى كتابة اسم رابط المدرس <span className="font-mono text-amber-500">{teacher.slug}</span> أدناه:
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={teacher.slug}
                className="block w-full rounded-lg border border-slate-800 bg-slate-950 py-2 px-3 text-sm text-white placeholder-slate-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 text-center font-mono"
              />
            </div>
          </div>
        }
        confirmText="حذف نهائي للمنصة"
        cancelText="إلغاء"
        isDanger={true}
        onConfirm={handleDeleteTeacher}
        onCancel={() => {
          setDeleteOpen(false);
          setDeleteConfirmText('');
        }}
      />
    </div>
  );
}
