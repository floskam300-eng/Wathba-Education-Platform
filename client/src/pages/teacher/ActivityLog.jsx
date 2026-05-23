import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useTheme } from '../../context/ThemeContext';
import {
  Activity, User, Users, BookOpen, FileText, CreditCard,
  UserCog, Bell, Filter, ChevronLeft, ChevronRight,
  RefreshCw, Trash2, Search, Calendar, Download, LogIn,
  Video, FileImage, Trophy
} from 'lucide-react';

const ACTION_COLORS = {
  add_student:               { bg: 'bg-green-500/20',   text: 'text-green-400',   border: 'border-green-500/30'   },
  edit_student:              { bg: 'bg-blue-500/20',    text: 'text-blue-400',    border: 'border-blue-500/30'    },
  delete_student:            { bg: 'bg-red-500/20',     text: 'text-red-400',     border: 'border-red-500/30'     },
  bulk_import_students:      { bg: 'bg-teal-500/20',    text: 'text-teal-400',    border: 'border-teal-500/30'    },
  create_course:             { bg: 'bg-purple-500/20',  text: 'text-purple-400',  border: 'border-purple-500/30'  },
  edit_course:               { bg: 'bg-indigo-500/20',  text: 'text-indigo-400',  border: 'border-indigo-500/30'  },
  delete_course:             { bg: 'bg-red-500/20',     text: 'text-red-400',     border: 'border-red-500/30'     },
  publish_course:            { bg: 'bg-orange-500/20',  text: 'text-orange-400',  border: 'border-orange-500/30'  },
  upload_video:              { bg: 'bg-sky-500/20',     text: 'text-sky-400',     border: 'border-sky-500/30'     },
  add_video_url:             { bg: 'bg-sky-500/20',     text: 'text-sky-400',     border: 'border-sky-500/30'     },
  upload_pdf:                { bg: 'bg-rose-500/20',    text: 'text-rose-400',    border: 'border-rose-500/30'    },
  delete_video:              { bg: 'bg-red-500/20',     text: 'text-red-400',     border: 'border-red-500/30'     },
  delete_pdf:                { bg: 'bg-red-500/20',     text: 'text-red-400',     border: 'border-red-500/30'     },
  create_exam:               { bg: 'bg-purple-500/20',  text: 'text-purple-400',  border: 'border-purple-500/30'  },
  edit_exam:                 { bg: 'bg-indigo-500/20',  text: 'text-indigo-400',  border: 'border-indigo-500/30'  },
  delete_exam:               { bg: 'bg-red-500/20',     text: 'text-red-400',     border: 'border-red-500/30'     },
  publish_exam:              { bg: 'bg-orange-500/20',  text: 'text-orange-400',  border: 'border-orange-500/30'  },
  force_reset_exam_results:  { bg: 'bg-red-600/20',     text: 'text-red-500',     border: 'border-red-600/30'     },
  approve_retry:             { bg: 'bg-green-500/20',   text: 'text-green-400',   border: 'border-green-500/30'   },
  reject_retry:              { bg: 'bg-red-500/20',     text: 'text-red-400',     border: 'border-red-500/30'     },
  approve_payment:           { bg: 'bg-green-500/20',   text: 'text-green-400',   border: 'border-green-500/30'   },
  reject_payment:            { bg: 'bg-red-500/20',     text: 'text-red-400',     border: 'border-red-500/30'     },
  verify_payment:            { bg: 'bg-yellow-500/20',  text: 'text-yellow-400',  border: 'border-yellow-500/30'  },
  add_payment:               { bg: 'bg-green-500/20',   text: 'text-green-400',   border: 'border-green-500/30'   },
  create_assistant:          { bg: 'bg-cyan-500/20',    text: 'text-cyan-400',    border: 'border-cyan-500/30'    },
  edit_assistant_perms:      { bg: 'bg-blue-500/20',    text: 'text-blue-400',    border: 'border-blue-500/30'    },
  delete_assistant:          { bg: 'bg-red-500/20',     text: 'text-red-400',     border: 'border-red-500/30'     },
  send_notification:         { bg: 'bg-pink-500/20',    text: 'text-pink-400',    border: 'border-pink-500/30'    },
  reset_leaderboard:         { bg: 'bg-amber-500/20',   text: 'text-amber-400',   border: 'border-amber-500/30'   },
  login_teacher:             { bg: 'bg-slate-500/20',   text: 'text-slate-400',   border: 'border-slate-500/30'   },
  login_assistant:           { bg: 'bg-violet-500/20',  text: 'text-violet-400',  border: 'border-violet-500/30'  },
};

const ENTITY_ICONS = {
  student:      <Users className="w-4 h-4" />,
  course:       <BookOpen className="w-4 h-4" />,
  exam:         <FileText className="w-4 h-4" />,
  payment:      <CreditCard className="w-4 h-4" />,
  assistant:    <UserCog className="w-4 h-4" />,
  notification: <Bell className="w-4 h-4" />,
  leaderboard:  <Trophy className="w-4 h-4" />,
  teacher:      <User className="w-4 h-4" />,
};

const ACTION_LABELS = {
  add_student:               'إضافة طالب',
  edit_student:              'تعديل طالب',
  delete_student:            'حذف طالب',
  bulk_import_students:      'استيراد جماعي',
  create_course:             'إنشاء كورس',
  edit_course:               'تعديل كورس',
  delete_course:             'حذف كورس',
  publish_course:            'نشر/إلغاء نشر كورس',
  upload_video:              'رفع فيديو',
  add_video_url:             'إضافة رابط فيديو',
  upload_pdf:                'رفع PDF',
  delete_video:              'حذف فيديو',
  delete_pdf:                'حذف PDF',
  create_exam:               'إنشاء اختبار',
  edit_exam:                 'تعديل اختبار',
  delete_exam:               'حذف اختبار',
  publish_exam:              'نشر/إلغاء نشر اختبار',
  force_reset_exam_results:  'إعادة تعيين نتائج اختبار',
  approve_retry:             'قبول إعادة',
  reject_retry:              'رفض إعادة',
  approve_payment:           'قبول دفعة',
  reject_payment:            'رفض دفعة',
  verify_payment:            'تحقق من دفعة',
  add_payment:               'إضافة دفعة',
  create_assistant:          'إضافة مساعد',
  edit_assistant_perms:      'تعديل صلاحيات',
  delete_assistant:          'حذف مساعد',
  send_notification:         'إرسال إشعار',
  reset_leaderboard:         'تصفير المتصدرين',
  login_teacher:             'تسجيل دخول معلم',
  login_assistant:           'تسجيل دخول مساعد',
};

const ENTITY_TYPE_LABELS = {
  student:      'طالب',
  course:       'كورس',
  exam:         'اختبار',
  payment:      'دفعة',
  assistant:    'مساعد',
  notification: 'إشعار',
  leaderboard:  'متصدرون',
  teacher:      'معلم',
};

function formatDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString('ar-EG', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function ActionBadge({ action }) {
  const c = ACTION_COLORS[action] || { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30' };
  const label = ACTION_LABELS[action] || action;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${c.bg} ${c.text} ${c.border}`}>
      {label}
    </span>
  );
}

function exportToCSV(logs) {
  const headers = ['التوقيت', 'المنفذ', 'النوع', 'الإجراء', 'الكيان', 'اسم الكيان', 'تفاصيل', 'IP'];
  const rows = logs.map(log => {
    let detailsText = '';
    if (log.details) {
      const d = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
      const parts = [];
      if (d.count !== undefined)      parts.push(`${d.count} طالب`);
      if (d.failed !== undefined)     parts.push(`${d.failed} فشل`);
      if (d.amount)                   parts.push(`${parseFloat(d.amount).toLocaleString('ar-EG')} ج.م`);
      if (d.status)                   parts.push(d.status === 'verified' ? 'تم التحقق' : d.status === 'rejected' ? 'مرفوض' : d.status);
      if (d.is_published !== undefined) parts.push(d.is_published ? 'نشر' : 'إلغاء نشر');
      if (d.recipients)               parts.push(`${d.recipients} مستلم`);
      if (d.granted?.length)          parts.push(`منحت: ${d.granted.join('، ')}`);
      if (d.revoked?.length)          parts.push(`سُحبت: ${d.revoked.join('، ')}`);
      detailsText = parts.join(' | ');
    }
    return [
      formatDateTime(log.created_at),
      log.actor_name || '',
      log.actor_type === 'teacher' ? 'معلم' : 'مساعد',
      ACTION_LABELS[log.action] || log.action,
      ENTITY_TYPE_LABELS[log.entity_type] || log.entity_type || '',
      log.entity_name || '',
      detailsText,
      log.ip_address || '',
    ];
  });

  const bom = '\uFEFF';
  const csvContent = bom + [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
  const [showClear, setShowClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const LIMIT = 30;

  const queryParams = {
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    page,
    limit: LIMIT,
  };

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['activity-logs', queryParams],
    queryFn: () => api.get('/activity-logs', { params: queryParams }).then(r => r.data),
    keepPreviousData: true,
  });

  const logs  = data?.logs  || [];
  const total = data?.total || 0;
  const pages = data?.pages || 1;

  const handleFilterChange = useCallback((key, val) => {
    setFilters(f => ({ ...f, [key]: val }));
    setPage(1);
  }, []);

  const handleClear = async () => {
    setClearing(true);
    try {
      await api.delete('/activity-logs/clear', { data: { older_than_days: 90 } });
      refetch();
      setShowClear(false);
    } catch {
    } finally {
      setClearing(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportParams = {
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
        page: 1,
        limit: 5000,
      };
      const res = await api.get('/activity-logs', { params: exportParams });
      exportToCSV(res.data.logs || []);
    } catch {
    } finally {
      setExporting(false);
    }
  };

  const cardBg      = dark ? 'bg-[var(--dk-card)]'     : 'bg-white';
  const border      = dark ? 'border-[var(--dk-border)]' : 'border-gray-200';
  const textPrimary = dark ? 'text-[var(--dk-text)]'   : 'text-gray-900';
  const textSecondary = dark ? 'text-[var(--dk-muted)]' : 'text-gray-500';
  const inputCls    = `w-full rounded-xl border text-sm px-3 py-2 outline-none transition-colors focus:ring-2 focus:ring-orange-500/40 ${
    dark
      ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]'
      : 'bg-white border-gray-200 text-gray-800'
  }`;

  const startItem = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const endItem   = Math.min(page * LIMIT, total);

  return (
    <div className="space-y-5 pb-10" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className={`text-2xl font-bold ${textPrimary}`}>سجل النشاط</h1>
          <p className={`text-sm mt-0.5 ${textSecondary}`}>
            تتبع كل إجراء نُفِّذ على المنصة بالتفصيل
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExport}
            disabled={exporting || total === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'جاري التصدير...' : 'تصدير CSV'}
          </button>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors border ${
              dark
                ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)] hover:bg-[var(--dk-border)]'
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            تحديث
          </button>
          <button
            onClick={() => setShowClear(v => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
          >
            <Trash2 className="w-4 h-4" />
            حذف القديم
          </button>
        </div>
      </div>

      {/* Clear confirmation */}
      {showClear && (
        <div className={`rounded-2xl border p-4 flex items-center justify-between gap-4 ${
          dark ? 'bg-red-900/20 border-red-500/30' : 'bg-red-50 border-red-200'
        }`}>
          <p className={`text-sm ${dark ? 'text-red-300' : 'text-red-700'}`}>
            سيتم حذف السجلات الأقدم من 90 يوماً. هذا الإجراء لا يمكن التراجع عنه.
          </p>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setShowClear(false)} className={`px-3 py-1.5 rounded-lg text-sm ${dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text)]' : 'bg-white text-gray-700'}`}>
              إلغاء
            </button>
            <button onClick={handleClear} disabled={clearing}
              className="px-3 py-1.5 rounded-lg text-sm bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 font-semibold">
              {clearing ? 'جاري الحذف...' : 'تأكيد الحذف'}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className={`rounded-2xl border p-4 space-y-3 ${cardBg} ${border}`}>
        <div className="flex items-center gap-2 mb-1">
          <Filter className={`w-4 h-4 ${textSecondary}`} />
          <span className={`text-sm font-semibold ${textSecondary}`}>فلترة السجلات</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
          {/* Search — server-side */}
          <div className="col-span-2 relative">
            <Search className={`absolute top-2.5 right-3 w-4 h-4 ${textSecondary}`} />
            <input
              type="text"
              placeholder="بحث بالاسم أو الكيان..."
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
              <option value="publish_course">نشر/إلغاء نشر كورس</option>
              <option value="upload_video">رفع فيديو</option>
              <option value="add_video_url">إضافة رابط فيديو</option>
              <option value="upload_pdf">رفع PDF</option>
              <option value="delete_video">حذف فيديو</option>
              <option value="delete_pdf">حذف PDF</option>
            </optgroup>
            <optgroup label="الاختبارات">
              <option value="create_exam">إنشاء اختبار</option>
              <option value="edit_exam">تعديل اختبار</option>
              <option value="delete_exam">حذف اختبار</option>
              <option value="publish_exam">نشر/إلغاء نشر اختبار</option>
              <option value="force_reset_exam_results">إعادة تعيين نتائج</option>
              <option value="approve_retry">قبول إعادة</option>
              <option value="reject_retry">رفض إعادة</option>
            </optgroup>
            <optgroup label="المدفوعات">
              <option value="add_payment">إضافة دفعة</option>
              <option value="approve_payment">قبول دفعة</option>
              <option value="reject_payment">رفض دفعة</option>
            </optgroup>
            <optgroup label="المساعدون">
              <option value="create_assistant">إضافة مساعد</option>
              <option value="edit_assistant_perms">تعديل صلاحيات</option>
              <option value="delete_assistant">حذف مساعد</option>
            </optgroup>
            <optgroup label="أخرى">
              <option value="send_notification">إرسال إشعار</option>
              <option value="reset_leaderboard">تصفير المتصدرين</option>
              <option value="login_teacher">تسجيل دخول معلم</option>
              <option value="login_assistant">تسجيل دخول مساعد</option>
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
            <option value="notification">إشعار</option>
          </select>

          {/* Date from */}
          <div className="relative">
            <Calendar className={`absolute top-2.5 right-3 w-4 h-4 ${textSecondary} pointer-events-none`} />
            <input
              type="date"
              value={filters.from}
              onChange={e => handleFilterChange('from', e.target.value)}
              className={`${inputCls} pr-9`}
              title="من تاريخ"
            />
          </div>

          {/* Date to */}
          <div className="relative">
            <Calendar className={`absolute top-2.5 right-3 w-4 h-4 ${textSecondary} pointer-events-none`} />
            <input
              type="date"
              value={filters.to}
              onChange={e => handleFilterChange('to', e.target.value)}
              className={`${inputCls} pr-9`}
              title="إلى تاريخ"
            />
          </div>
        </div>

        {/* Active filter tags + reset */}
        {Object.values(filters).some(Boolean) && (
          <div className="flex items-center justify-between pt-1">
            <span className={`text-xs ${textSecondary}`}>
              {total.toLocaleString('ar-EG')} نتيجة
            </span>
            <button
              onClick={() => { setFilters({ actor_type: '', action: '', entity_type: '', from: '', to: '', search: '' }); setPage(1); }}
              className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
            >
              مسح الفلاتر
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className={`rounded-2xl border overflow-hidden ${cardBg} ${border}`}>
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
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
                {logs.map((log, i) => (
                  <LogRow key={log.id} log={log} dark={dark}
                    textPrimary={textPrimary} textSecondary={textSecondary}
                    border={border} i={i} />
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
            {startItem}–{endItem} من {total.toLocaleString('ar-EG')} سجل (صفحة {page} / {pages})
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

            {(() => {
              const windowSize = 5;
              let start = Math.max(1, page - Math.floor(windowSize / 2));
              let end   = Math.min(pages, start + windowSize - 1);
              if (end - start < windowSize - 1) start = Math.max(1, end - windowSize + 1);
              return Array.from({ length: end - start + 1 }, (_, idx) => start + idx).map(p => (
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
              ));
            })()}

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
    if (d.count !== undefined)          parts.push(`${d.count} طالب`);
    if (d.failed !== undefined && d.failed > 0) parts.push(`${d.failed} فشل`);
    if (d.amount)                        parts.push(`${parseFloat(d.amount).toLocaleString('ar-EG')} ج.م`);
    if (d.status)                        parts.push(d.status === 'verified' ? '✓ تم التحقق' : d.status === 'rejected' ? '✗ مرفوض' : d.status);
    if (d.is_published !== undefined)    parts.push(d.is_published ? '🟢 نشر' : '⭕ إلغاء نشر');
    if (d.recipients)                    parts.push(`${d.recipients} مستلم`);
    if (d.granted?.length)               parts.push(`✓ ${d.granted.join('، ')}`);
    if (d.revoked?.length)               parts.push(`✗ ${d.revoked.join('، ')}`);
    if (d.deleted_results)               parts.push(`حُذف ${d.deleted_results} نتيجة`);
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
            log.actor_type === 'teacher'
              ? 'bg-gradient-to-br from-orange-500 to-orange-600'
              : 'bg-gradient-to-br from-purple-500 to-purple-700'
          }`}>
            {log.actor_name?.charAt(0) || '?'}
          </div>
          <div className="min-w-0">
            <p className={`text-xs font-semibold truncate max-w-[100px] ${textPrimary}`}>
              {log.actor_name || '—'}
            </p>
            <p className={`text-[10px] ${textSecondary}`}>
              {log.actor_type === 'teacher' ? 'معلم' : 'مساعد'}
            </p>
          </div>
        </div>
      </td>

      {/* Action */}
      <td className="px-4 py-3">
        <ActionBadge action={log.action} />
      </td>

      {/* Entity */}
      <td className="px-4 py-3">
        {log.entity_type ? (
          <div className="flex items-center gap-1.5">
            <span className={`${textSecondary} opacity-70`}>
              {ENTITY_ICONS[log.entity_type] || <Activity className="w-4 h-4" />}
            </span>
            <div className="min-w-0">
              <p className={`text-xs font-semibold truncate max-w-[120px] ${textPrimary}`}>
                {log.entity_name || '—'}
              </p>
              <p className={`text-[10px] ${textSecondary}`}>
                {ENTITY_TYPE_LABELS[log.entity_type] || log.entity_type}
              </p>
            </div>
          </div>
        ) : (
          <span className={`text-xs ${textSecondary}`}>—</span>
        )}
      </td>

      {/* Details */}
      <td className={`px-4 py-3 text-xs max-w-[180px] leading-relaxed ${textSecondary}`}>
        {detailsText || '—'}
      </td>
    </tr>
  );
}
