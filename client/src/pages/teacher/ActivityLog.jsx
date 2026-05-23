import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useTheme } from '../../context/ThemeContext';
import {
  Activity, User, Users, BookOpen, FileText, CreditCard,
  UserCog, Bell, Filter, ChevronLeft, ChevronRight,
  RefreshCw, Trash2, Search, Calendar
} from 'lucide-react';

const ACTION_COLORS = {
  add_student:          { bg: 'bg-green-500/20',  text: 'text-green-400',  border: 'border-green-500/30'  },
  edit_student:         { bg: 'bg-blue-500/20',   text: 'text-blue-400',   border: 'border-blue-500/30'   },
  delete_student:       { bg: 'bg-red-500/20',    text: 'text-red-400',    border: 'border-red-500/30'    },
  bulk_import_students: { bg: 'bg-teal-500/20',   text: 'text-teal-400',   border: 'border-teal-500/30'   },
  create_course:        { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
  edit_course:          { bg: 'bg-indigo-500/20', text: 'text-indigo-400', border: 'border-indigo-500/30' },
  delete_course:        { bg: 'bg-red-500/20',    text: 'text-red-400',    border: 'border-red-500/30'    },
  publish_course:       { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
  create_exam:          { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
  edit_exam:            { bg: 'bg-indigo-500/20', text: 'text-indigo-400', border: 'border-indigo-500/30' },
  delete_exam:          { bg: 'bg-red-500/20',    text: 'text-red-400',    border: 'border-red-500/30'    },
  publish_exam:         { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
  approve_retry:        { bg: 'bg-green-500/20',  text: 'text-green-400',  border: 'border-green-500/30'  },
  reject_retry:         { bg: 'bg-red-500/20',    text: 'text-red-400',    border: 'border-red-500/30'    },
  verify_payment:       { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  add_payment:          { bg: 'bg-green-500/20',  text: 'text-green-400',  border: 'border-green-500/30'  },
  create_assistant:     { bg: 'bg-cyan-500/20',   text: 'text-cyan-400',   border: 'border-cyan-500/30'   },
  edit_assistant_perms: { bg: 'bg-blue-500/20',   text: 'text-blue-400',   border: 'border-blue-500/30'   },
  delete_assistant:     { bg: 'bg-red-500/20',    text: 'text-red-400',    border: 'border-red-500/30'    },
  send_notification:    { bg: 'bg-pink-500/20',   text: 'text-pink-400',   border: 'border-pink-500/30'   },
  reset_leaderboard:    { bg: 'bg-amber-500/20',  text: 'text-amber-400',  border: 'border-amber-500/30'  },
};

const ENTITY_ICONS = {
  student:   <Users className="w-4 h-4" />,
  course:    <BookOpen className="w-4 h-4" />,
  exam:      <FileText className="w-4 h-4" />,
  payment:   <CreditCard className="w-4 h-4" />,
  assistant: <UserCog className="w-4 h-4" />,
  notification: <Bell className="w-4 h-4" />,
};

const ACTION_LABELS = {
  add_student:          'إضافة طالب',
  edit_student:         'تعديل طالب',
  delete_student:       'حذف طالب',
  bulk_import_students: 'استيراد جماعي',
  create_course:        'إنشاء كورس',
  edit_course:          'تعديل كورس',
  delete_course:        'حذف كورس',
  publish_course:       'نشر كورس',
  upload_video:         'رفع فيديو',
  add_video_url:        'إضافة رابط فيديو',
  upload_pdf:           'رفع PDF',
  delete_video:         'حذف فيديو',
  delete_pdf:           'حذف PDF',
  create_exam:          'إنشاء اختبار',
  edit_exam:            'تعديل اختبار',
  delete_exam:          'حذف اختبار',
  publish_exam:         'نشر اختبار',
  grade_essay:          'تصحيح مقالية',
  approve_retry:        'قبول إعادة',
  reject_retry:         'رفض إعادة',
  verify_payment:       'تحقق من دفعة',
  add_payment:          'إضافة دفعة',
  create_assistant:     'إضافة مساعد',
  edit_assistant_perms: 'تعديل صلاحيات',
  delete_assistant:     'حذف مساعد',
  send_notification:    'إرسال إشعار',
  reset_leaderboard:    'تصفير المتصدرين',
};

const ENTITY_TYPE_LABELS = {
  student:   'طالب',
  course:    'كورس',
  exam:      'اختبار',
  payment:   'دفعة',
  assistant: 'مساعد',
};

function formatDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString('ar-EG', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function ActionBadge({ action, dark }) {
  const c = ACTION_COLORS[action] || { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30' };
  const label = ACTION_LABELS[action] || action;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${c.bg} ${c.text} ${c.border}`}>
      {label}
    </span>
  );
}

export default function ActivityLog() {
  const { dark } = useTheme();

  const [filters, setFilters] = useState({
    actor_type: '',
    action: '',
    entity_type: '',
    from: '',
    to: '',
    search: '',
  });
  const [page, setPage] = useState(1);
  const LIMIT = 30;

  const queryParams = {
    ...Object.fromEntries(Object.entries(filters).filter(([k, v]) => v && k !== 'search')),
    page,
    limit: LIMIT,
  };

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['activity-logs', queryParams],
    queryFn: () => api.get('/activity-logs', { params: queryParams }).then(r => r.data),
    keepPreviousData: true,
  });

  const logs = data?.logs || [];
  const total = data?.total || 0;
  const pages = data?.pages || 1;

  const filteredLogs = filters.search.trim()
    ? logs.filter(l =>
        (l.actor_name || '').includes(filters.search) ||
        (l.entity_name || '').includes(filters.search) ||
        (ACTION_LABELS[l.action] || l.action).includes(filters.search)
      )
    : logs;

  const handleFilterChange = useCallback((key, val) => {
    setFilters(f => ({ ...f, [key]: val }));
    setPage(1);
  }, []);

  const handleClearFilters = () => {
    setFilters({ actor_type: '', action: '', entity_type: '', from: '', to: '', search: '' });
    setPage(1);
  };

  const hasFilters = Object.values(filters).some(v => v);

  const cardBg  = dark ? 'bg-[var(--dk-surface)]' : 'bg-white';
  const border  = dark ? 'border-[var(--dk-border)]' : 'border-gray-200';
  const textPrimary = dark ? 'text-[var(--dk-text)]' : 'text-gray-900';
  const textSecondary = dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500';
  const inputCls = `w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${
    dark
      ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)] placeholder:text-[var(--dk-text-2)] focus:border-orange-500'
      : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-orange-500 focus:bg-white'
  }`;

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className={`text-xl font-black ${textPrimary}`}>سجل النشاط</h1>
            <p className={`text-sm ${textSecondary}`}>
              {total > 0 ? `${total.toLocaleString('ar-EG')} إجراء مسجّل` : 'لا توجد سجلات بعد'}
            </p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text)] hover:bg-[var(--dk-border)]' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          تحديث
        </button>
      </div>

      {/* Filters */}
      <div className={`rounded-2xl border p-4 ${cardBg} ${border}`}>
        <div className="flex items-center gap-2 mb-3">
          <Filter className={`w-4 h-4 ${textSecondary}`} />
          <span className={`text-sm font-semibold ${textSecondary}`}>الفلاتر</span>
          {hasFilters && (
            <button onClick={handleClearFilters}
              className="mr-auto text-xs text-orange-500 hover:text-orange-400 font-semibold">
              مسح الكل
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Search */}
          <div className="col-span-2 relative">
            <Search className={`absolute top-2.5 right-3 w-4 h-4 ${textSecondary}`} />
            <input
              type="text"
              placeholder="بحث بالاسم أو الإجراء..."
              value={filters.search}
              onChange={e => handleFilterChange('search', e.target.value)}
              className={`${inputCls} pr-9`}
            />
          </div>

          {/* Actor type */}
          <select value={filters.actor_type} onChange={e => handleFilterChange('actor_type', e.target.value)} className={inputCls}>
            <option value="">كل المنفذين</option>
            <option value="teacher">المعلم</option>
            <option value="assistant">المساعد</option>
          </select>

          {/* Action */}
          <select value={filters.action} onChange={e => handleFilterChange('action', e.target.value)} className={inputCls}>
            <option value="">كل الإجراءات</option>
            <optgroup label="الطلاب">
              <option value="add_student">إضافة طالب</option>
              <option value="edit_student">تعديل طالب</option>
              <option value="delete_student">حذف طالب</option>
              <option value="bulk_import_students">استيراد جماعي</option>
            </optgroup>
            <optgroup label="الكورسات">
              <option value="create_course">إنشاء كورس</option>
              <option value="edit_course">تعديل كورس</option>
              <option value="delete_course">حذف كورس</option>
              <option value="publish_course">نشر كورس</option>
            </optgroup>
            <optgroup label="الاختبارات">
              <option value="create_exam">إنشاء اختبار</option>
              <option value="edit_exam">تعديل اختبار</option>
              <option value="delete_exam">حذف اختبار</option>
              <option value="publish_exam">نشر اختبار</option>
              <option value="approve_retry">قبول إعادة</option>
              <option value="reject_retry">رفض إعادة</option>
            </optgroup>
            <optgroup label="المدفوعات">
              <option value="add_payment">إضافة دفعة</option>
              <option value="verify_payment">تحقق من دفعة</option>
            </optgroup>
            <optgroup label="المساعدون">
              <option value="create_assistant">إضافة مساعد</option>
              <option value="edit_assistant_perms">تعديل صلاحيات</option>
              <option value="delete_assistant">حذف مساعد</option>
            </optgroup>
            <optgroup label="أخرى">
              <option value="send_notification">إرسال إشعار</option>
              <option value="reset_leaderboard">تصفير المتصدرين</option>
            </optgroup>
          </select>

          {/* Entity type */}
          <select value={filters.entity_type} onChange={e => handleFilterChange('entity_type', e.target.value)} className={inputCls}>
            <option value="">كل الكيانات</option>
            <option value="student">طالب</option>
            <option value="course">كورس</option>
            <option value="exam">اختبار</option>
            <option value="payment">دفعة</option>
            <option value="assistant">مساعد</option>
          </select>

          {/* Date from */}
          <input
            type="date"
            value={filters.from}
            onChange={e => handleFilterChange('from', e.target.value)}
            className={inputCls}
            title="من تاريخ"
          />
        </div>
      </div>

      {/* Table */}
      <div className={`rounded-2xl border overflow-hidden ${cardBg} ${border}`}>
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Activity className={`w-12 h-12 ${textSecondary} opacity-30`} />
            <p className={`text-sm ${textSecondary}`}>لا توجد سجلات تطابق الفلاتر المحددة</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className={`border-b text-xs font-semibold ${textSecondary} ${border}`}
                    style={{ backgroundColor: dark ? 'rgba(255,255,255,0.03)' : '#f9fafb' }}>
                  <th className="text-right px-4 py-3">التوقيت</th>
                  <th className="text-right px-4 py-3">المنفِّذ</th>
                  <th className="text-right px-4 py-3">الإجراء</th>
                  <th className="text-right px-4 py-3">الكيان</th>
                  <th className="text-right px-4 py-3">تفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-transparent">
                {filteredLogs.map((log, i) => (
                  <LogRow key={log.id} log={log} dark={dark} textPrimary={textPrimary} textSecondary={textSecondary} border={border} i={i} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className={`text-sm ${textSecondary}`}>
            صفحة {page} من {pages} — إجمالي {total.toLocaleString('ar-EG')} سجل
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className={`p-2 rounded-lg transition-colors disabled:opacity-40 ${
                dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text)] hover:bg-[var(--dk-border)]' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(5, pages) }, (_, i) => {
              const p = page <= 3 ? i + 1 : page - 2 + i;
              if (p < 1 || p > pages) return null;
              return (
                <button key={p} onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-sm font-semibold transition-colors ${
                    p === page
                      ? 'bg-orange-500 text-white'
                      : dark
                        ? 'bg-[var(--dk-elevated)] text-[var(--dk-text)] hover:bg-[var(--dk-border)]'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page >= pages}
              className={`p-2 rounded-lg transition-colors disabled:opacity-40 ${
                dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text)] hover:bg-[var(--dk-border)]' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LogRow({ log, dark, textPrimary, textSecondary, border, i }) {
  const rowBg = dark
    ? i % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.02]'
    : i % 2 === 0 ? 'bg-transparent' : 'bg-gray-50/70';

  let detailsText = null;
  if (log.details) {
    const d = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
    const parts = [];
    if (d.count)         parts.push(`${d.count} طالب`);
    if (d.amount)        parts.push(`${parseFloat(d.amount).toLocaleString('ar-EG')} ج.م`);
    if (d.status)        parts.push(d.status === 'verified' ? '✓ تم التحقق' : d.status === 'rejected' ? '✗ مرفوض' : d.status);
    if (d.is_published !== undefined) parts.push(d.is_published ? 'تم النشر' : 'إلغاء النشر');
    if (d.student_name)  parts.push(d.student_name);
    detailsText = parts.join(' · ') || null;
  }

  return (
    <tr className={`${rowBg} hover:bg-orange-500/5 transition-colors`}>
      {/* Time */}
      <td className={`px-4 py-3 text-xs whitespace-nowrap ${textSecondary}`}>
        {formatDateTime(log.created_at)}
      </td>

      {/* Actor */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold ${
            log.actor_type === 'teacher' ? 'bg-gradient-to-br from-orange-500 to-orange-600' : 'bg-gradient-to-br from-purple-500 to-purple-700'
          }`}>
            {log.actor_name?.charAt(0) || '?'}
          </div>
          <div className="min-w-0">
            <p className={`text-xs font-semibold truncate max-w-[100px] ${textPrimary}`}>{log.actor_name || '—'}</p>
            <p className={`text-[10px] ${textSecondary}`}>{log.actor_type === 'teacher' ? 'معلم' : 'مساعد'}</p>
          </div>
        </div>
      </td>

      {/* Action */}
      <td className="px-4 py-3">
        <ActionBadge action={log.action} dark={dark} />
      </td>

      {/* Entity */}
      <td className="px-4 py-3">
        {log.entity_type ? (
          <div className="flex items-center gap-1.5">
            <span className={`${textSecondary} opacity-70`}>{ENTITY_ICONS[log.entity_type]}</span>
            <div className="min-w-0">
              <p className={`text-xs font-semibold truncate max-w-[120px] ${textPrimary}`}>
                {log.entity_name || '—'}
              </p>
              <p className={`text-[10px] ${textSecondary}`}>{ENTITY_TYPE_LABELS[log.entity_type] || log.entity_type}</p>
            </div>
          </div>
        ) : (
          <span className={`text-xs ${textSecondary}`}>—</span>
        )}
      </td>

      {/* Details */}
      <td className={`px-4 py-3 text-xs max-w-[160px] ${textSecondary}`}>
        {detailsText || '—'}
      </td>
    </tr>
  );
}
