import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import ConfirmModal from '../../components/ConfirmModal';
import { Search, Plus, Eye, Edit, Trash2, ShieldAlert, X, ShieldCheck, LayoutGrid } from 'lucide-react';
import toast from 'react-hot-toast';

/* ── All controllable page/feature definitions ───────────────────────────── */
const ALL_FEATURE_PAGES = [
  // Teacher + Student (both roles see these)
  { key: 'courses',        label: 'الكورسات',           icon: '📚', badge: 'معلم + طالب' },
  { key: 'exams',          label: 'الاختبارات',          icon: '📝', badge: 'معلم + طالب' },
  { key: 'leaderboard',    label: 'المتصدرون',          icon: '🏆', badge: 'معلم + طالب' },
  { key: 'live_streaming', label: 'البث المباشر',       icon: '📡', badge: 'معلم + طالب' },
  // Teacher pages only
  { key: 'students',       label: 'الطلاب',             icon: '👥', badge: 'معلم' },
  { key: 'recitations',    label: 'التسميع',            icon: '🎓', badge: 'معلم' },
  { key: 'archive',        label: 'أرشيف النتائج',      icon: '🗄️', badge: 'معلم' },
  { key: 'question_banks', label: 'بنوك الأسئلة',      icon: '📖', badge: 'معلم' },
  { key: 'requests',       label: 'صفحة الطلبات',      icon: '📬', badge: 'معلم' },
  { key: 'attendance',     label: 'الحضور والغياب',     icon: '✅', badge: 'معلم' },
  { key: 'assistants',     label: 'المساعدون',          icon: '🤝', badge: 'معلم' },
  { key: 'analytics',      label: 'التحليلات',          icon: '📊', badge: 'معلم' },
  { key: 'payments',       label: 'المدفوعات',          icon: '💳', badge: 'معلم' },
  { key: 'notifications',  label: 'الإشعارات',          icon: '🔔', badge: 'معلم' },
  { key: 'backup',         label: 'النسخ الاحتياطي',   icon: '💾', badge: 'معلم' },
  { key: 'activity_log',   label: 'سجل النشاط',        icon: '📋', badge: 'معلم' },
  { key: 'settings',       label: 'الإعدادات',          icon: '⚙️', badge: 'معلم' },
  // Student pages only
  { key: 'student_stats',  label: 'إحصائياتي',         icon: '📈', badge: 'طالب' },
  { key: 'stickman_run',   label: 'الفعاليات 🎮',       icon: '🎮', badge: 'طالب' },
];

/* ── Feature value helper — default true unless explicitly false ─────────── */
function getFeat(features, key) {
  return features?.[key] !== false;
}

/* ── Pages Popup Modal ───────────────────────────────────────────────────── */
function FeaturesPopup({ teacher, onToggle, onClose }) {
  const overlayRef = useRef(null);
  const features = teacher?.features_enabled || {};
  const enabledCount = ALL_FEATURE_PAGES.filter(p => getFeat(features, p.key)).length;

  // Close on backdrop click
  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-700 shadow-2xl overflow-hidden"
        style={{ backgroundColor: '#0f172a' }}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 flex-shrink-0">
          <div>
            <h2 className="text-white font-black text-lg font-cairo">صلاحيات الصفحات</h2>
            <p className="text-slate-400 text-xs mt-0.5 font-cairo">
              {teacher?.name} — {enabledCount} من {ALL_FEATURE_PAGES.length} صفحة مفعّلة
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Pages grid */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ALL_FEATURE_PAGES.map(({ key, label, icon, badge }) => {
              const enabled = getFeat(features, key);
              return (
                <button
                  key={key}
                  onClick={() => onToggle(teacher.id, key, enabled)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-right transition-all duration-150 group
                    ${enabled
                      ? 'border-amber-500/30 bg-amber-500/8 hover:bg-amber-500/15'
                      : 'border-slate-700 bg-slate-900/40 hover:bg-slate-800/60'
                    }`}
                >
                  <span className="text-xl flex-shrink-0">{icon}</span>
                  <div className="flex-1 min-w-0 text-right">
                    <p className={`text-sm font-bold font-cairo truncate ${enabled ? 'text-white' : 'text-slate-500'}`}>
                      {label}
                    </p>
                    <p className="text-xs text-slate-600 font-cairo">{badge}</p>
                  </div>
                  {/* Toggle pill */}
                  <div className={`relative w-9 h-5 rounded-full flex-shrink-0 transition-colors duration-200 ${enabled ? 'bg-amber-500' : 'bg-slate-700'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${enabled ? 'right-0.5' : 'left-0.5'}`} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-700 flex-shrink-0 flex items-center justify-between">
          <p className="text-slate-500 text-xs font-cairo">التغييرات تُحفظ فوراً ✓</p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold font-cairo transition"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TeachersList() {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all, active, suspended

  // Modal states
  const [deleteId, setDeleteId] = useState(null);
  const [deleteSlug, setDeleteSlug] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const [suspendId, setSuspendId] = useState(null);
  const [suspendCurrentState, setSuspendCurrentState] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');

  const [featuresPopupId, setFeaturesPopupId] = useState(null);

  const fetchTeachers = async () => {
    try {
      const res = await api.get('/teachers');
      setTeachers(res.data.teachers);
    } catch (err) {
      console.error(err);
      toast.error('فشل تحميل قائمة المدرسين');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeachers();
  }, []);

  const handleToggleFeature = async (id, feature, currentValue) => {
    const newValue = !currentValue;
    // Optimistic update in local state
    setTeachers(prev =>
      prev.map(t => t.id === id
        ? { ...t, features_enabled: { ...(t.features_enabled || {}), [feature]: newValue } }
        : t
      )
    );
    try {
      // Send only the changed key — backend merges with existing
      await api.put(`/teachers/${id}/features`, { [feature]: newValue });
    } catch (err) {
      console.error(err);
      // Rollback on failure
      setTeachers(prev =>
        prev.map(t => t.id === id
          ? { ...t, features_enabled: { ...(t.features_enabled || {}), [feature]: currentValue } }
          : t
        )
      );
      toast.error('فشل تحديث صلاحيات الصفحة');
    }
  };

  const handleSuspendConfirm = async () => {
    try {
      const res = await api.post(`/teachers/${suspendId}/suspend`, {
        suspend: !suspendCurrentState,
        reason: suspendReason,
      });
      setTeachers(
        teachers.map((t) =>
          t.id === suspendId
            ? {
                ...t,
                is_platform_suspended: !suspendCurrentState,
                platform_suspended_reason: suspendReason,
              }
            : t
        )
      );
      toast.success(
        !suspendCurrentState ? 'تم إيقاف حساب المدرس بنجاح' : 'تم تنشيط حساب المدرس بنجاح'
      );
      setSuspendId(null);
      setSuspendReason('');
    } catch (err) {
      console.error(err);
      toast.error('فشل تغيير حالة الحساب للمدرس');
    }
  };

  const handleDeleteConfirm = async () => {
    if (deleteConfirmText.trim() !== deleteSlug) {
      return toast.error('يرجى كتابة اسم الرابط بشكل صحيح للتأكيد');
    }

    try {
      await api.delete(`/teachers/${deleteId}`);
      setTeachers(teachers.filter((t) => t.id !== deleteId));
      toast.success('تم حذف المدرس وجميع بياناته بنجاح');
      setDeleteId(null);
      setDeleteSlug('');
      setDeleteConfirmText('');
    } catch (err) {
      console.error(err);
      toast.error('فشل حذف حساب المدرس');
    }
  };

  const filteredTeachers = teachers.filter((t) => {
    // F6 FIX: null-guard each field before calling .toLowerCase() to prevent crash
    const q = search.toLowerCase();
    const matchSearch =
      (t.name || '').toLowerCase().includes(q) ||
      (t.username || '').toLowerCase().includes(q) ||
      (t.slug || '').toLowerCase().includes(q);

    const matchStatus =
      filterStatus === 'all' ||
      (filterStatus === 'suspended' && t.is_platform_suspended) ||
      (filterStatus === 'active' && !t.is_platform_suspended);

    return matchSearch && matchStatus;
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
          <h1 className="text-3xl font-bold text-white font-cairo">إدارة المدرسين</h1>
          <p className="text-slate-400 mt-1 font-cairo">إدارة حسابات المدرسين المشتركين، صلاحياتهم، وحالات الحسابات</p>
        </div>
        <Link
          to="/teachers/new"
          className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600 transition font-cairo"
        >
          <Plus size={16} />
          <span>إضافة مدرس جديد</span>
        </Link>
      </div>

      {/* Filters Area */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="relative max-w-md flex-1">
          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500">
            <Search size={18} />
          </span>
          <input
            type="text"
            placeholder="البحث بالاسم أو اسم المستخدم أو الرابط..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full rounded-xl border border-slate-800 bg-slate-950/50 py-2.5 pr-10 pl-4 text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition text-sm font-cairo"
          />
        </div>

        <div className="flex gap-2">
          {['all', 'active', 'suspended'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`rounded-lg px-4 py-2 text-xs font-semibold font-cairo transition ${
                filterStatus === status
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              {status === 'all' && 'الكل'}
              {status === 'active' && 'النشطين'}
              {status === 'suspended' && 'الموقوفين'}
            </button>
          ))}
        </div>
      </div>

      {/* Teachers Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/20 shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-900/80 text-xs font-bold text-slate-300 font-cairo border-b border-slate-800">
              <tr>
                <th className="px-6 py-4">المدرس</th>
                <th className="px-6 py-4">الرابط الفرعي (Subdomain)</th>
                <th className="px-6 py-4">الباقة الحالية</th>
                <th className="px-6 py-4">الطلاب النشطين</th>
                <th className="px-6 py-4">صلاحيات الصفحات</th>
                <th className="px-6 py-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300 font-cairo">
              {filteredTeachers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-slate-500 font-cairo">
                    لا يوجد أي مدرسين مطابقين لمعايير البحث.
                  </td>
                </tr>
              ) : (
                filteredTeachers.map((t) => {
                  const features = t.features_enabled || { live_streaming: true, stickman_run: true };
                  const planName = t.active_subscription?.plan_name || 'لا يوجد باقة نشطة';
                  const isSuspended = t.is_platform_suspended;
                  const currentStudents = t.stats?.total_students || 0;
                  const maxStudents = t.active_subscription?.max_students;
                  const limitWarning = maxStudents && currentStudents >= maxStudents;

                  return (
                    <tr
                      key={t.id}
                      className={`hover:bg-slate-900/30 transition ${
                        isSuspended ? 'bg-red-950/5' : ''
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={t.logo_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(t.name) + '&background=f97316&color=fff&size=64'}
                            alt={t.name}
                            className="h-10 w-10 rounded-lg object-cover border border-slate-800 bg-slate-800"
                          />
                          <div>
                            <div className="font-semibold text-white">{t.name}</div>
                            <div className="text-xs text-slate-500">{t.whatsapp_phone || 'لا يوجد هاتف'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <a
                          href={`https://${t.slug}.wathba.site`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-amber-500 hover:underline font-mono text-xs"
                        >
                          {t.slug}.wathba.site
                        </a>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold leading-5 ${
                            t.active_subscription
                              ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                              : 'bg-red-500/10 text-red-500 border border-red-500/20'
                          }`}
                        >
                          {planName}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className={`font-semibold ${limitWarning ? 'text-red-400 font-bold' : ''}`}>
                            {currentStudents} طالب
                          </span>
                          <span className="text-xs text-slate-500">
                            {maxStudents ? `من حد ${maxStudents}` : 'غير محدود'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {(() => {
                          const enabledCount = ALL_FEATURE_PAGES.filter(p => getFeat(features, p.key)).length;
                          const totalCount   = ALL_FEATURE_PAGES.length;
                          return (
                            <button
                              onClick={() => setFeaturesPopupId(t.id)}
                              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm font-semibold text-slate-300 hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-white transition-all duration-150 font-cairo"
                              title="إدارة صلاحيات الصفحات"
                            >
                              <LayoutGrid size={15} className="text-amber-500 flex-shrink-0" />
                              <span>{enabledCount}/{totalCount} صفحة</span>
                            </button>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            to={`/teachers/${t.id}`}
                            className="rounded-lg bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 hover:text-white transition"
                            title="تفاصيل وإحصاءات"
                          >
                            <Eye size={16} />
                          </Link>
                          <Link
                            to={`/teachers/edit/${t.id}`}
                            className="rounded-lg bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 hover:text-white transition"
                            title="تعديل البيانات"
                          >
                            <Edit size={16} />
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              setSuspendId(t.id);
                              setSuspendCurrentState(isSuspended);
                            }}
                            className={`rounded-lg p-2 transition ${
                              isSuspended
                                ? 'bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/60'
                                : 'bg-orange-950/40 text-orange-400 hover:bg-orange-900/60'
                            }`}
                            title={isSuspended ? 'تفعيل الحساب' : 'تعليق الحساب'}
                          >
                            {isSuspended ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteId(t.id);
                              setDeleteSlug(t.slug);
                            }}
                            className="rounded-lg bg-red-950/40 p-2 text-red-400 hover:bg-red-900/60 transition"
                            title="حذف المدرس نهائياً"
                          >
                            <Trash2 size={16} />
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

      {/* Suspend Confirmation Modal */}
      <ConfirmModal
        isOpen={suspendId !== null}
        title={suspendCurrentState ? 'تفعيل حساب المدرس' : 'تعليق حساب المدرس'}
        message={
          <div>
            <p className="font-cairo text-sm">
              {suspendCurrentState
                ? 'هل أنت متأكد من تفعيل الحساب؟ سيتمكن المدرس ومساعدوه وطلابه من استخدام المنصة فوراً.'
                : 'هل أنت متأكد من تعليق هذا الحساب؟ سيتم منع المدرس ومساعديه وطلابه بالكامل من الدخول للمنصة واللوحات.'}
            </p>
            {!suspendCurrentState && (
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
        confirmText={suspendCurrentState ? 'تفعيل الحساب' : 'تعليق الحساب'}
        cancelText="إلغاء"
        isDanger={!suspendCurrentState}
        onConfirm={handleSuspendConfirm}
        onCancel={() => {
          setSuspendId(null);
          setSuspendReason('');
        }}
      />

      {/* Delete Confirmation Modal (Requires typing slug) */}
      <ConfirmModal
        isOpen={deleteId !== null}
        title="حذف حساب مدرس نهائياً"
        message={
          <div className="space-y-4">
            <div className="text-red-400 bg-red-950/20 p-3 rounded-lg border border-red-500/20 text-xs font-cairo">
              تحذير: سيؤدي هذا الإجراء لحذف المدرس وجميع كورساته وطلابه وامتحاناته ومرفوعاته نهائياً من قاعدة البيانات. لا يمكن التراجع عن هذا الإجراء!
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 font-cairo mb-1">
                لتأكيد الحذف، يرجى كتابة اسم رابط المدرس <span className="font-mono text-amber-500">{deleteSlug}</span> أدناه:
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={deleteSlug}
                className="block w-full rounded-lg border border-slate-800 bg-slate-950 py-2 px-3 text-sm text-white placeholder-slate-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 text-center font-mono"
              />
            </div>
          </div>
        }
        confirmText="حذف نهائي للمنصة"
        cancelText="إلغاء"
        isDanger={true}
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteId(null);
          setDeleteSlug('');
          setDeleteConfirmText('');
        }}
      />

      {/* Features Pages Popup */}
      {featuresPopupId !== null && (() => {
        const popupTeacher = teachers.find(t => t.id === featuresPopupId);
        if (!popupTeacher) return null;
        return (
          <FeaturesPopup
            teacher={popupTeacher}
            onToggle={handleToggleFeature}
            onClose={() => setFeaturesPopupId(null)}
          />
        );
      })()}
    </div>
  );
}
