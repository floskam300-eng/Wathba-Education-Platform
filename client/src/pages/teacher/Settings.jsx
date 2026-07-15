import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle, Plus, Trash2, Pencil, X, Phone, User } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

/* ─────────────────────────── PASSWORD TAB ─────────────────────────── */
function PasswordTab() {
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [loading, setLoading]         = useState(false);
  const [done, setDone]               = useState(false);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (!currentPw || !newPw || !confirmPw)
      return toast.error('يرجى ملء جميع الحقول');
    if (newPw !== confirmPw)
      return toast.error('كلمة المرور الجديدة وتأكيدها غير متطابقتين');
    if (newPw.length < 8)
      return toast.error('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل');
    setLoading(true);
    try {
      await api.put('/teachers/profile/password', {
        current_password: currentPw,
        new_password: newPw,
      });
      toast.success('تم تغيير كلمة المرور بنجاح');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setDone(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'حدث خطأ أثناء تغيير كلمة المرور');
    } finally {
      setLoading(false);
    }
  };

  if (done) return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <CheckCircle size={48} className="text-green-500" />
      <p className="text-lg font-bold text-gray-800 dark:text-white">تم تغيير كلمة المرور بنجاح!</p>
      <p className="text-sm text-gray-500">يمكنك الآن الاستمرار في استخدام المنصة.</p>
      <button onClick={() => setDone(false)} className="mt-2 text-sm text-orange-500 hover:underline">
        تغيير كلمة مرور أخرى
      </button>
    </div>
  );

  return (
    <form onSubmit={handlePasswordChange} className="flex flex-col gap-5">
      <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-xl p-4 text-sm text-orange-800 dark:text-orange-300">
        🔑 يرجى تغيير كلمة المرور الافتراضية لتأمين حسابك.
      </div>

      <div>
        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">كلمة المرور الحالية</label>
        <div className="relative">
          <Lock size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type={showCurrent ? 'text' : 'password'} value={currentPw} onChange={e => setCurrentPw(e.target.value)}
            className="w-full pr-9 pl-9 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            placeholder="أدخل كلمة المرور الحالية" autoComplete="current-password" />
          <button type="button" onClick={() => setShowCurrent(v => !v)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">كلمة المرور الجديدة</label>
        <div className="relative">
          <Lock size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type={showNew ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)}
            className="w-full pr-9 pl-9 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            placeholder="8 أحرف على الأقل" autoComplete="new-password" />
          <button type="button" onClick={() => setShowNew(v => !v)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {newPw && newPw.length < 8 && <p className="mt-1 text-xs text-red-500">كلمة المرور قصيرة جداً (أقل من 8 أحرف)</p>}
      </div>

      <div>
        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">تأكيد كلمة المرور الجديدة</label>
        <div className="relative">
          <Lock size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
            className="w-full pr-9 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            placeholder="أعد إدخال كلمة المرور الجديدة" autoComplete="new-password" />
        </div>
        {confirmPw && newPw !== confirmPw && <p className="mt-1 text-xs text-red-500">كلمتا المرور غير متطابقتين</p>}
      </div>

      <button type="submit" disabled={loading}
        className="w-full py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2">
        {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Lock size={16} />}
        {loading ? 'جارٍ الحفظ...' : 'حفظ كلمة المرور الجديدة'}
      </button>
    </form>
  );
}

/* ─────────────────────────── SUPPORT CONTACTS TAB ─────────────────────────── */
const EMPTY_FORM = { name: '', phone: '', photo_url: '' };

function SupportContactsTab() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [editId, setEditId]     = useState(null); // null = add new, number = editing existing
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/teachers/support-contacts');
      setContacts(data);
    } catch {
      toast.error('حدث خطأ في تحميل بيانات الدعم');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (c) => {
    setEditId(c.id);
    setForm({ name: c.name || '', phone: c.phone || '', photo_url: c.photo_url || '' });
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditId(null); setForm(EMPTY_FORM); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('الاسم مطلوب');
    setSaving(true);
    try {
      if (editId) {
        const { data } = await api.put(`/teachers/support-contacts/${editId}`, form);
        setContacts(prev => prev.map(c => c.id === editId ? data : c));
        toast.success('تم التعديل بنجاح');
      } else {
        const { data } = await api.post('/teachers/support-contacts', { ...form, sort_order: contacts.length });
        setContacts(prev => [...prev, data]);
        toast.success('تمت الإضافة بنجاح');
      }
      closeForm();
    } catch (err) {
      toast.error(err.response?.data?.error || 'حدث خطأ');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل تريد حذف جهة الاتصال هذه؟')) return;
    try {
      await api.delete(`/teachers/support-contacts/${id}`);
      setContacts(prev => prev.filter(c => c.id !== id));
      toast.success('تم الحذف');
    } catch {
      toast.error('حدث خطأ أثناء الحذف');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          جهات الاتصال دي بتظهر في قسم «فريق الدعم» في الـ landing page — مستقلة عن حسابات المساعدين.
        </p>
        <button onClick={openAdd}
          className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors shrink-0">
          <Plus size={15} /> إضافة
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <span className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <Phone size={36} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">لا توجد جهات اتصال بعد</p>
          <p className="text-xs mt-1">اضغط «إضافة» لإضافة أول جهة دعم</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {contacts.map((c) => (
            <div key={c.id}
              className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                {c.photo_url ? (
                  <img src={c.photo_url.startsWith('http') ? c.photo_url : `/uploads/${c.photo_url}`}
                    alt={c.name} className="w-10 h-10 rounded-lg object-cover shrink-0 border border-gray-200 dark:border-gray-600"
                    loading="lazy" decoding="async"
                    onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} />
                ) : null}
                <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 items-center justify-center shrink-0"
                  style={{ display: c.photo_url ? 'none' : 'flex' }}>
                  <User size={18} className="text-orange-400" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm text-gray-800 dark:text-white truncate">{c.name}</p>
                  <p className="text-xs text-gray-400 truncate">{c.phone || 'بدون رقم'}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => openEdit(c)}
                  className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-300 transition-colors">
                  <Pencil size={15} />
                </button>
                <button onClick={() => handleDelete(c.id)}
                  className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-400 transition-colors">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => e.target === e.currentTarget && closeForm()}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6" dir="rtl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-800 dark:text-white text-base">
                {editId ? 'تعديل جهة الاتصال' : 'إضافة جهة اتصال جديدة'}
              </h3>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">
                  الاسم <span className="text-red-500">*</span>
                </label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  maxLength={100} placeholder="مثال: أحمد للدعم الفني"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">
                  رقم الواتساب <span className="text-gray-400 font-normal">(اختياري)</span>
                </label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="مثال: 201012345678" dir="ltr"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                <p className="mt-1 text-xs text-gray-400">أدخل الرقم بالصيغة الدولية بدون +</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">
                  رابط الصورة <span className="text-gray-400 font-normal">(اختياري)</span>
                </label>
                <input value={form.photo_url} onChange={e => setForm(f => ({ ...f, photo_url: e.target.value }))}
                  placeholder="https://..." dir="ltr"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>

              <div className="flex gap-2 mt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2">
                  {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
                  {saving ? 'جارٍ الحفظ...' : 'حفظ'}
                </button>
                <button type="button" onClick={closeForm}
                  className="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-bold hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── MAIN PAGE ─────────────────────────── */
export default function TeacherSettings() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'password');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  const tabs = [
    { id: 'password', label: 'تغيير كلمة المرور' },
    { id: 'support',  label: 'فريق الدعم' },
  ];

  return (
    <div dir="rtl" className="p-4 md:p-8 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">الإعدادات</h1>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 pt-4 flex gap-4">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`pb-3 text-sm font-bold border-b-2 transition-colors ${
                activeTab === t.id
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'password' && <PasswordTab />}
          {activeTab === 'support'  && <SupportContactsTab />}
        </div>
      </div>
    </div>
  );
}
