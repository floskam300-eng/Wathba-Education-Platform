import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export default function TeacherSettings() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'password');

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [loading, setLoading]         = useState(false);
  const [done, setDone]               = useState(false);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setActiveTab(tab);
  }, [searchParams]);

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

  return (
    <div dir="rtl" className="p-4 md:p-8 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">الإعدادات</h1>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 pt-4 flex gap-4">
          <button
            onClick={() => setActiveTab('password')}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'password' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
          >
            تغيير كلمة المرور
          </button>
        </div>

        <div className="p-6">
          {done ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <CheckCircle size={48} className="text-green-500" />
              <p className="text-lg font-bold text-gray-800 dark:text-white">تم تغيير كلمة المرور بنجاح!</p>
              <p className="text-sm text-gray-500">يمكنك الآن الاستمرار في استخدام المنصة.</p>
              <button
                onClick={() => setDone(false)}
                className="mt-2 text-sm text-orange-500 hover:underline"
              >تغيير كلمة مرور أخرى</button>
            </div>
          ) : (
            <form onSubmit={handlePasswordChange} className="flex flex-col gap-5">
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-xl p-4 text-sm text-orange-800 dark:text-orange-300">
                🔑 يرجى تغيير كلمة المرور الافتراضية لتأمين حسابك.
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">كلمة المرور الحالية</label>
                <div className="relative">
                  <Lock size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPw}
                    onChange={e => setCurrentPw(e.target.value)}
                    className="w-full pr-9 pl-9 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    placeholder="أدخل كلمة المرور الحالية"
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShowCurrent(v => !v)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">كلمة المرور الجديدة</label>
                <div className="relative">
                  <Lock size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                    className="w-full pr-9 pl-9 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    placeholder="8 أحرف على الأقل"
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setShowNew(v => !v)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {newPw && newPw.length < 8 && (
                  <p className="mt-1 text-xs text-red-500">كلمة المرور قصيرة جداً (أقل من 8 أحرف)</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">تأكيد كلمة المرور الجديدة</label>
                <div className="relative">
                  <Lock size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="password"
                    value={confirmPw}
                    onChange={e => setConfirmPw(e.target.value)}
                    className="w-full pr-9 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    placeholder="أعد إدخال كلمة المرور الجديدة"
                    autoComplete="new-password"
                  />
                </div>
                {confirmPw && newPw !== confirmPw && (
                  <p className="mt-1 text-xs text-red-500">كلمتا المرور غير متطابقتين</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
              >
                {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Lock size={16} />}
                {loading ? 'جارٍ الحفظ...' : 'حفظ كلمة المرور الجديدة'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
