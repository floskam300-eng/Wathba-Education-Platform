import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, ArrowRight, BellOff, BellRing, Smartphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { setupFCM } from '../../hooks/useFCM';
import toast from 'react-hot-toast';

const TYPE_ICON = {
  general:             '📢',
  exam_result:         '📊',
  new_exam:            '📝',
  new_course:          '📚',
  retry_approved:      '🔄',
  enrollment_approved: '🎓',
  reminder:            '⏰',
  announcement:        '📣',
  payment:             '💳',
  badge:               '🏅',
};

const fmtDate = (d) => {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'الآن';
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `منذ ${hrs} ساعة`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `منذ ${days} يوم`;
  return new Date(d).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' });
};

// ── Push permission banner ────────────────────────────────────────────────────
function PushBanner() {
  const [permission, setPermission] = useState(null);
  const [loading, setLoading]       = useState(false);
  const [done, setDone]             = useState(false);

  // Read current permission on mount
  useEffect(() => {
    if (!('Notification' in window)) { setPermission('unsupported'); return; }
    setPermission(Notification.permission);
  }, []);

  const handleEnable = useCallback(async () => {
    setLoading(true);
    const result = await setupFCM();
    setLoading(false);
    if (result === 'granted') {
      setPermission('granted');
      setDone(true);
      toast.success('✅ تم تفعيل إشعارات التليفون بنجاح!', {
        duration: 5000,
        style: { fontFamily: 'inherit', direction: 'rtl' },
      });
    } else if (result === 'denied') {
      setPermission('denied');
      toast.error('⛔ تم رفض الإذن — فعّل الإشعارات من إعدادات المتصفح', {
        duration: 6000,
        style: { fontFamily: 'inherit', direction: 'rtl' },
      });
    } else if (result === 'unsupported') {
      setPermission('unsupported');
      toast('⚠️ المتصفح لا يدعم الإشعارات', {
        duration: 5000,
        style: { fontFamily: 'inherit', direction: 'rtl' },
      });
    } else {
      toast.error('حدث خطأ أثناء تفعيل الإشعارات — تحقق من الكونسول', {
        duration: 6000,
        style: { fontFamily: 'inherit', direction: 'rtl' },
      });
    }
  }, []);

  // Nothing to show if already granted or not supported
  if (permission === null || permission === 'unsupported') return null;

  // ── Already granted ────────────────────────────────────────────────────────
  if (permission === 'granted') {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-green-50 border border-green-200 text-green-800">
        <BellRing className="w-5 h-5 text-green-600 flex-shrink-0" />
        <p className="text-sm font-bold flex-1">
          {done ? '✅ تم تفعيل الإشعارات! ستصلك كل إشعارات المعلم على تليفونك.' : 'إشعارات التليفون مفعّلة ✓'}
        </p>
      </div>
    );
  }

  // ── Permission denied ──────────────────────────────────────────────────────
  if (permission === 'denied') {
    return (
      <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-red-50 border border-red-200 text-red-800">
        <BellOff className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-black">الإشعارات محظورة في المتصفح</p>
          <p className="text-xs mt-1 font-medium text-red-600">
            افتح إعدادات المتصفح ← الإشعارات ← اسمح للموقع، ثم أعد تحميل الصفحة.
          </p>
        </div>
      </div>
    );
  }

  // ── Default: not asked yet ─────────────────────────────────────────────────
  return (
    <button
      onClick={handleEnable}
      disabled={loading}
      className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-right transition-all
        bg-indigo-600 hover:bg-indigo-700 active:scale-[.98] disabled:opacity-70"
    >
      <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
        {loading
          ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          : <Smartphone className="w-5 h-5 text-white" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-white">فعّل إشعارات التليفون</p>
        <p className="text-xs text-indigo-200 mt-0.5 font-medium">
          استلم كل إشعار من معلمك فوراً حتى لو التطبيق مغلق
        </p>
      </div>
      <Bell className="w-5 h-5 text-white/70 flex-shrink-0" />
    </button>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function StudentNotifications() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data = { notifications: [], unread: 0 }, isLoading } = useQuery({
    queryKey: ['my-notifications'],
    queryFn: () => api.get('/notifications/my').then(r => r.data),
    refetchInterval: 60000,
  });

  const readAllMut = useMutation({
    mutationFn: () => api.patch('/notifications/my/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-notifications'] }),
  });

  const readOneMut = useMutation({
    mutationFn: (id) => api.patch(`/notifications/my/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-notifications'] }),
  });

  const { notifications, unread } = data;

  return (
    <div className="min-h-full p-4 lg:p-6">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-start gap-2">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl hover:bg-gray-100 text-navy-600 transition-colors flex-shrink-0 mt-0.5"
            title="رجوع"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-navy-600 flex items-center gap-2">
                <Bell className="w-5 h-5 sm:w-6 sm:h-6 text-orange-500 flex-shrink-0" />
                الإشعارات
              </h1>
              {unread > 0 && (
                <span className="text-sm bg-red-100 text-red-600 font-black px-2 py-0.5 rounded-full flex-shrink-0">
                  {unread} جديد
                </span>
              )}
              {unread > 0 && (
                <button
                  onClick={() => readAllMut.mutate()}
                  disabled={readAllMut.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-navy-50 hover:bg-navy-100 text-navy-700 text-xs font-bold transition-colors border border-navy-200 flex-shrink-0 mr-auto"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  تحديد الكل كمقروء
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Push permission banner */}
        <PushBanner />

        {/* Notifications list */}
        {isLoading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="card h-20 animate-pulse bg-gray-100" />
          ))
        ) : notifications.length === 0 ? (
          <div className="card text-center py-16">
            <Bell className="w-14 h-14 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium">لا توجد إشعارات بعد</p>
          </div>
        ) : (
          <div className="card !p-0 overflow-hidden divide-y divide-gray-100">
            {notifications.map(n => (
              <div
                key={n.id}
                onClick={() => { if (!n.is_read) readOneMut.mutate(n.id); }}
                className={`flex gap-4 px-5 py-4 cursor-pointer transition-all ${
                  !n.is_read ? 'bg-indigo-50/70 hover:bg-indigo-100/60' : 'hover:bg-gray-50'
                }`}
              >
                <span className="text-2xl flex-shrink-0 mt-0.5">
                  {TYPE_ICON[n.type] || '📢'}
                </span>
                <div className="flex-1 min-w-0">
                  {n.title && (
                    <p className="text-xs font-black text-indigo-600 mb-0.5">{n.title}</p>
                  )}
                  <p className="text-sm text-navy-700 leading-snug">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-1 font-medium">{fmtDate(n.sent_at)}</p>
                </div>
                {!n.is_read && (
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 flex-shrink-0 mt-2" />
                )}
              </div>
            ))}
          </div>
        )}

        {notifications.length > 0 && (
          <p className="text-center text-xs text-gray-400 font-medium pb-2">
            يتم عرض آخر {notifications.length} إشعار
          </p>
        )}
      </div>
    </div>
  );
}
