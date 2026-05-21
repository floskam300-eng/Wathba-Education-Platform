import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';

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
