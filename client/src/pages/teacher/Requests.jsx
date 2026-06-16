import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ClipboardList, RotateCcw, Bell, CheckCircle, XCircle,
  Clock, Eye, CreditCard, AlertCircle, Gift, Filter,
  ChevronDown, User, BookOpen, GraduationCap, Banknote,
  CheckCheck, XOctagon, MessageSquare, Calendar
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useTheme } from '../../context/ThemeContext';

const METHOD_LABELS = {
  'Vodafone Cash': 'فودافون كاش',
  'Instapay': 'إنستاباي',
  'Cash': 'كاش',
  'Bank Transfer': 'تحويل بنكي',
};

function PaymentBadge({ r }) {
  const price = parseFloat(r.course_price) || 0;
  if (r.course_is_free || price === 0) {
    return (
      <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-full">
        <Gift className="w-3 h-3" /> مجاني
      </span>
    );
  }
  if (r.payment_status === 'verified') {
    const paid = parseFloat(r.paid_amount) || 0;
    const remaining = Math.max(0, price - paid);
    const fullyPaid = remaining === 0;
    return fullyPaid ? (
      <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-[10px] font-black px-2 py-0.5 rounded-full">
        <CreditCard className="w-3 h-3" /> دفع كامل
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-700 text-[10px] font-black px-2 py-0.5 rounded-full">
        <CreditCard className="w-3 h-3" /> دفع جزئي — باقي {remaining.toLocaleString()} ج
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-[10px] font-black px-2 py-0.5 rounded-full">
      <AlertCircle className="w-3 h-3" /> لم يدفع
    </span>
  );
}

function PaymentDetail({ r }) {
  const price = parseFloat(r.course_price) || 0;
  if (r.course_is_free || price === 0) return null;
  if (r.payment_status !== 'verified') return (
    <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mt-2">
      <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
      <div>
        <p className="text-xs font-black text-red-700">لم يدفع بعد</p>
        <p className="text-[10px] text-red-500">سعر الكورس: {price.toLocaleString()} ج</p>
      </div>
    </div>
  );
  const paid = parseFloat(r.paid_amount) || 0;
  const remaining = Math.max(0, price - paid);
  const fullyPaid = remaining === 0;
  return (
    <div className={`flex items-center gap-2 rounded-xl px-3 py-2 mt-2 border ${fullyPaid ? 'bg-green-50 border-green-100' : 'bg-yellow-50 border-yellow-100'}`}>
      <CreditCard className={`w-3.5 h-3.5 flex-shrink-0 ${fullyPaid ? 'text-green-600' : 'text-yellow-600'}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-black ${fullyPaid ? 'text-green-700' : 'text-yellow-700'}`}>
          {fullyPaid ? 'دفع المبلغ كاملاً' : `دفع جزئي — باقي ${remaining.toLocaleString()} ج`}
        </p>
        <p className="text-[10px] text-gray-500 mt-0.5">
          المدفوع: <span className="font-bold">{paid.toLocaleString()} ج</span> من {price.toLocaleString()} ج
          {r.payment_method && ` — ${METHOD_LABELS[r.payment_method] || r.payment_method}`}
          {r.payment_date && ` — ${new Date(r.payment_date).toLocaleDateString('ar-EG')}`}
        </p>
      </div>
    </div>
  );
}

function FilterChips({ label, icon: Icon, options, value, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {Icon && <span className="text-[10px] font-black text-gray-400 flex items-center gap-1"><Icon className="w-3 h-3" />{label}</span>}
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all border ${
            value === opt.value
              ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
              : 'bg-white border-gray-200 text-gray-600 hover:border-orange-300 hover:text-orange-600'
          }`}
        >
          {opt.label}
          {opt.count != null && (
            <span className={`mr-1 text-[10px] ${value === opt.value ? 'opacity-80' : 'opacity-50'}`}>
              ({opt.count})
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function StatCard({ value, label, colorClass, bgClass }) {
  return (
    <div className={`${bgClass} rounded-2xl p-3 text-center border`}>
      <p className={`text-2xl font-black ${colorClass}`}>{value}</p>
      <p className={`text-[11px] font-bold mt-0.5 ${colorClass} opacity-75`}>{label}</p>
    </div>
  );
}

export default function TeacherRequests() {
  const { dark } = useTheme();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState(location.state?.tab === 'retry' ? 'retry' : 'enrollment');

  const [enrollFilters, setEnrollFilters] = useState({ status: 'الكل', course: 'الكل', payment: 'الكل', stage: 'الكل' });
  const [retryFilters, setRetryFilters] = useState({ status: 'الكل', exam: 'الكل' });

  const [confirmBulk, setConfirmBulk] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  const [retryNoteModal, setRetryNoteModal] = useState(null);
  const [retryNote, setRetryNote] = useState('');

  const card = dark
    ? 'bg-[var(--dk-surface)] border border-[var(--dk-border)]'
    : 'bg-white border border-gray-100';

  const { data: enrollRequests = [], isLoading: loadingEnroll } = useQuery({
    queryKey: ['enrollment-requests'],
    queryFn: () => api.get('/courses/enrollment-requests').then(r => r.data),
    refetchInterval: 30000,
  });

  const { data: retryRequests = [], isLoading: loadingRetry } = useQuery({
    queryKey: ['retry-requests'],
    queryFn: () => api.get('/exams/retry-requests').then(r => r.data),
    refetchInterval: 30000,
  });

  const handleRequestMut = useMutation({
    mutationFn: ({ id, action }) => api.put(`/courses/enrollment-requests/${id}`, { action }),
    onSuccess: (_, { action }) => {
      qc.invalidateQueries(['enrollment-requests']);
      toast.success(action === 'approve' ? 'تم قبول الطالب في الكورس' : 'تم رفض الطلب');
    },
    onError: e => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const approveMut = useMutation({
    mutationFn: ({ reqId, note }) => api.put(`/exams/retry-requests/${reqId}/approve`, { teacher_note: note }),
    onSuccess: () => {
      qc.invalidateQueries(['retry-requests']);
      toast.success('تمت الموافقة على الطلب');
      setRetryNoteModal(null);
      setRetryNote('');
    },
    onError: e => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const rejectMut = useMutation({
    mutationFn: ({ reqId, note }) => api.put(`/exams/retry-requests/${reqId}/reject`, { teacher_note: note }),
    onSuccess: () => {
      qc.invalidateQueries(['retry-requests']);
      toast.success('تم رفض الطلب');
      setRetryNoteModal(null);
      setRetryNote('');
    },
    onError: e => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const pendingEnroll = enrollRequests.filter(r => r.status === 'pending');
  const pendingRetry = retryRequests.filter(r => r.status === 'pending');

  const getPaymentCategory = (r) => {
    const price = parseFloat(r.course_price) || 0;
    if (r.course_is_free || price === 0) return 'مجاني';
    if (r.payment_status === 'verified') {
      const paid = parseFloat(r.paid_amount) || 0;
      return Math.max(0, price - paid) === 0 ? 'مدفوع' : 'جزئي';
    }
    return 'غير مدفوع';
  };

  const visibleEnrollRequests = useMemo(() => {
    return enrollRequests.filter(r => {
      if (enrollFilters.status !== 'الكل' && r.status !== enrollFilters.status) return false;
      if (enrollFilters.course !== 'الكل' && r.course_name !== enrollFilters.course) return false;
      if (enrollFilters.payment !== 'الكل' && getPaymentCategory(r) !== enrollFilters.payment) return false;
      if (enrollFilters.stage !== 'الكل' && r.academic_stage !== enrollFilters.stage) return false;
      return true;
    });
  }, [enrollRequests, enrollFilters]);

  const visibleRetryRequests = useMemo(() => {
    return retryRequests.filter(r => {
      if (retryFilters.status !== 'الكل' && r.status !== retryFilters.status) return false;
      if (retryFilters.exam !== 'الكل' && r.exam_title !== retryFilters.exam) return false;
      return true;
    });
  }, [retryRequests, retryFilters]);

  const visiblePendingEnroll = visibleEnrollRequests.filter(r => r.status === 'pending');
  const visiblePendingRetry = visibleRetryRequests.filter(r => r.status === 'pending');

  const courseOptions = useMemo(() => {
    const names = [...new Set(enrollRequests.map(r => r.course_name).filter(Boolean))];
    return [
      { value: 'الكل', label: 'كل الكورسات' },
      ...names.map(n => ({
        value: n, label: n,
        count: enrollRequests.filter(r => r.course_name === n && r.status === 'pending').length || undefined
      }))
    ];
  }, [enrollRequests]);

  const stageOptions = useMemo(() => {
    const stages = [...new Set(enrollRequests.map(r => r.academic_stage).filter(Boolean))];
    return [
      { value: 'الكل', label: 'كل المراحل' },
      ...stages.map(s => ({ value: s, label: s }))
    ];
  }, [enrollRequests]);

  const examOptions = useMemo(() => {
    const names = [...new Set(retryRequests.map(r => r.exam_title).filter(Boolean))];
    return [
      { value: 'الكل', label: 'كل الاختبارات' },
      ...names.map(n => ({
        value: n, label: n,
        count: retryRequests.filter(r => r.exam_title === n && r.status === 'pending').length || undefined
      }))
    ];
  }, [retryRequests]);

  const handleBulkEnroll = async (action) => {
    setBulkLoading(true);
    let ok = 0, fail = 0;
    for (const r of visiblePendingEnroll) {
      try {
        await api.put(`/courses/enrollment-requests/${r.id}`, { action });
        ok++;
      } catch { fail++; }
    }
    await qc.invalidateQueries(['enrollment-requests']);
    setBulkLoading(false);
    setConfirmBulk(null);
    if (ok > 0) toast.success(`تم ${action === 'approve' ? 'قبول' : 'رفض'} ${ok} طلب`);
    if (fail > 0) toast.error(`فشل ${fail} طلب`);
  };

  const handleBulkRetry = async (action) => {
    setBulkLoading(true);
    let ok = 0, fail = 0;
    for (const r of visiblePendingRetry) {
      try {
        await api[action === 'approve' ? 'put' : 'put'](`/exams/retry-requests/${r.id}/${action}`, { teacher_note: '' });
        ok++;
      } catch { fail++; }
    }
    await qc.invalidateQueries(['retry-requests']);
    setBulkLoading(false);
    setConfirmBulk(null);
    if (ok > 0) toast.success(`تم ${action === 'approve' ? 'قبول' : 'رفض'} ${ok} طلب`);
    if (fail > 0) toast.error(`فشل ${fail} طلب`);
  };

  const statusBadge = (status) => {
    const map = {
      pending:  'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
      used:     'bg-blue-100 text-blue-700',
    };
    const labels = { pending: '⏳ معلق', approved: '✅ مقبول', rejected: '❌ مرفوض', used: '🔄 مُستخدم' };
    return <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${map[status] || 'bg-gray-100 text-gray-600'}`}>{labels[status] || status}</span>;
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg flex-shrink-0">
          <ClipboardList className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className={`text-xl font-black ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>صفحة الطلبات</h1>
          <p className={`text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>إدارة طلبات الانضمام وإعادة الاختبارات</p>
        </div>
        {(pendingEnroll.length + pendingRetry.length) > 0 && (
          <span className="mr-auto bg-red-500 text-white text-xs font-black px-3 py-1 rounded-full animate-pulse shadow-sm">
            {pendingEnroll.length + pendingRetry.length} طلب جديد
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className={`flex gap-1.5 p-1.5 rounded-2xl w-full sm:w-fit ${dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-100'}`}>
        {[
          { key: 'enrollment', label: 'طلبات الانضمام', icon: Bell, count: pendingEnroll.length, countColor: 'bg-yellow-500' },
          { key: 'retry',      label: 'طلبات الإعادة',  icon: RotateCcw, count: pendingRetry.length, countColor: 'bg-orange-500' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`relative flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === t.key
                ? dark ? 'bg-[var(--dk-surface)] text-[var(--dk-text)] shadow-sm' : 'bg-white text-navy-700 shadow-sm'
                : dark ? 'text-[var(--dk-text-2)] hover:text-[var(--dk-text)]' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{t.label}</span>
            {t.count > 0 && (
              <span className={`${t.countColor} text-white text-[10px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ENROLLMENT TAB                                             */}
      {/* ══════════════════════════════════════════════════════════ */}
      {activeTab === 'enrollment' && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <StatCard value={pendingEnroll.length}
              label="معلق" colorClass="text-yellow-700"
              bgClass="bg-yellow-50 border-yellow-200" />
            <StatCard value={enrollRequests.filter(r => r.status === 'approved').length}
              label="مقبول" colorClass="text-green-700"
              bgClass="bg-green-50 border-green-200" />
            <StatCard value={enrollRequests.filter(r => r.status === 'rejected').length}
              label="مرفوض" colorClass="text-red-700"
              bgClass="bg-red-50 border-red-200" />
          </div>

          {/* Filters */}
          <div className={`${card} rounded-2xl p-3 space-y-2.5`}>
            <div className="flex items-center gap-2 mb-1">
              <Filter className="w-3.5 h-3.5 text-orange-500" />
              <span className={`text-xs font-black ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>الفلاتر</span>
            </div>

            <FilterChips
              label="الحالة" icon={Clock}
              options={[
                { value: 'الكل', label: 'الكل', count: enrollRequests.length },
                { value: 'pending', label: 'معلق', count: enrollRequests.filter(r => r.status === 'pending').length },
                { value: 'approved', label: 'مقبول', count: enrollRequests.filter(r => r.status === 'approved').length },
                { value: 'rejected', label: 'مرفوض', count: enrollRequests.filter(r => r.status === 'rejected').length },
              ]}
              value={enrollFilters.status}
              onChange={v => setEnrollFilters(f => ({ ...f, status: v }))}
            />

            {courseOptions.length > 2 && (
              <FilterChips
                label="الكورس" icon={BookOpen}
                options={courseOptions}
                value={enrollFilters.course}
                onChange={v => setEnrollFilters(f => ({ ...f, course: v }))}
              />
            )}

            <FilterChips
              label="الدفع" icon={Banknote}
              options={[
                { value: 'الكل', label: 'الكل' },
                { value: 'مدفوع', label: '✅ مدفوع كامل', count: enrollRequests.filter(r => getPaymentCategory(r) === 'مدفوع').length },
                { value: 'جزئي', label: '⚠️ دفع جزئي', count: enrollRequests.filter(r => getPaymentCategory(r) === 'جزئي').length },
                { value: 'غير مدفوع', label: '❌ لم يدفع', count: enrollRequests.filter(r => getPaymentCategory(r) === 'غير مدفوع').length },
                { value: 'مجاني', label: '🎁 مجاني', count: enrollRequests.filter(r => getPaymentCategory(r) === 'مجاني').length },
              ]}
              value={enrollFilters.payment}
              onChange={v => setEnrollFilters(f => ({ ...f, payment: v }))}
            />

            {stageOptions.length > 2 && (
              <FilterChips
                label="المرحلة" icon={GraduationCap}
                options={stageOptions}
                value={enrollFilters.stage}
                onChange={v => setEnrollFilters(f => ({ ...f, stage: v }))}
              />
            )}
          </div>

          {/* Bulk actions */}
          {visiblePendingEnroll.length > 1 && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`text-xs font-bold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
                {visiblePendingEnroll.length} طلب معلق في العرض الحالي:
              </span>
              <button
                onClick={() => setConfirmBulk({ type: 'enroll', action: 'approve' })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs font-black transition-all shadow-sm"
              >
                <CheckCheck className="w-3.5 h-3.5" /> قبول الكل ({visiblePendingEnroll.length})
              </button>
              <button
                onClick={() => setConfirmBulk({ type: 'enroll', action: 'reject' })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-black transition-all shadow-sm"
              >
                <XOctagon className="w-3.5 h-3.5" /> رفض الكل ({visiblePendingEnroll.length})
              </button>
            </div>
          )}

          {/* Results count */}
          {(enrollFilters.status !== 'الكل' || enrollFilters.course !== 'الكل' || enrollFilters.payment !== 'الكل' || enrollFilters.stage !== 'الكل') && (
            <p className={`text-xs font-bold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
              يعرض {visibleEnrollRequests.length} من {enrollRequests.length} طلب
            </p>
          )}

          {/* Cards */}
          {loadingEnroll ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-gray-100 animate-pulse" />)}
            </div>
          ) : visibleEnrollRequests.length === 0 ? (
            <div className={`${card} rounded-2xl text-center py-16 px-6`}>
              <Bell className={`w-14 h-14 mx-auto mb-3 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-200'}`} />
              <p className={`font-bold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>لا توجد طلبات تطابق الفلاتر المحددة</p>
              <button
                onClick={() => setEnrollFilters({ status: 'الكل', course: 'الكل', payment: 'الكل', stage: 'الكل' })}
                className="mt-3 text-xs text-orange-500 font-bold hover:underline"
              >
                مسح كل الفلاتر
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleEnrollRequests.map(r => (
                <div key={r.id} className={`${card} rounded-2xl overflow-hidden`}>
                  {/* Status stripe */}
                  <div className={`h-1 w-full ${
                    r.status === 'pending' ? 'bg-yellow-400' :
                    r.status === 'approved' ? 'bg-green-400' : 'bg-red-400'
                  }`} />

                  <div className="px-4 py-3">
                    {/* Top row */}
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-base font-black flex-shrink-0 mt-0.5 ${
                        r.status === 'pending' ? 'bg-gradient-to-br from-navy-600 to-navy-700' :
                        r.status === 'approved' ? 'bg-gradient-to-br from-green-500 to-green-600' :
                        'bg-gradient-to-br from-red-400 to-red-500'
                      }`}>
                        {r.student_name?.charAt(0)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className={`font-black text-sm ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{r.student_name}</p>
                          {statusBadge(r.status)}
                          {r.academic_stage && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-gray-100 text-gray-600'}`}>
                              {r.academic_stage}
                            </span>
                          )}
                          <PaymentBadge r={r} />
                        </div>

                        <div className="flex items-center gap-1 mt-0.5">
                          <BookOpen className="w-3 h-3 text-orange-500 flex-shrink-0" />
                          <p className="text-xs text-orange-600 font-semibold truncate">{r.course_name}</p>
                        </div>

                        {r.message && (
                          <div className={`flex items-start gap-1 mt-1.5 ${dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-50'} rounded-lg px-2 py-1.5`}>
                            <MessageSquare className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" />
                            <p className={`text-[11px] ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>"{r.message}"</p>
                          </div>
                        )}

                        <div className="flex items-center gap-1 mt-1">
                          <Calendar className="w-3 h-3 text-gray-400" />
                          <p className="text-[10px] text-gray-400">{new Date(r.created_at).toLocaleString('ar-EG')}</p>
                        </div>
                      </div>
                    </div>

                    <PaymentDetail r={r} />

                    {r.status === 'pending' && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-dashed border-gray-100">
                        <button
                          onClick={() => handleRequestMut.mutate({ id: r.id, action: 'approve' })}
                          disabled={handleRequestMut.isPending}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 text-xs font-black transition-all disabled:opacity-50"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> قبول
                        </button>
                        <button
                          onClick={() => handleRequestMut.mutate({ id: r.id, action: 'reject' })}
                          disabled={handleRequestMut.isPending}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-black transition-all disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" /> رفض
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* RETRY TAB                                                   */}
      {/* ══════════════════════════════════════════════════════════ */}
      {activeTab === 'retry' && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-2">
            <StatCard value={pendingRetry.length} label="معلق" colorClass="text-yellow-700" bgClass="bg-yellow-50 border-yellow-200" />
            <StatCard value={retryRequests.filter(r => r.status === 'approved').length} label="مقبول" colorClass="text-green-700" bgClass="bg-green-50 border-green-200" />
            <StatCard value={retryRequests.filter(r => r.status === 'rejected').length} label="مرفوض" colorClass="text-red-700" bgClass="bg-red-50 border-red-200" />
            <StatCard value={retryRequests.filter(r => r.status === 'used').length} label="مُستخدم" colorClass="text-blue-700" bgClass="bg-blue-50 border-blue-200" />
          </div>

          {/* Filters */}
          <div className={`${card} rounded-2xl p-3 space-y-2.5`}>
            <div className="flex items-center gap-2 mb-1">
              <Filter className="w-3.5 h-3.5 text-orange-500" />
              <span className={`text-xs font-black ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>الفلاتر</span>
            </div>

            <FilterChips
              label="الحالة" icon={Clock}
              options={[
                { value: 'الكل', label: 'الكل', count: retryRequests.length },
                { value: 'pending', label: '⏳ معلق', count: retryRequests.filter(r => r.status === 'pending').length },
                { value: 'approved', label: '✅ مقبول', count: retryRequests.filter(r => r.status === 'approved').length },
                { value: 'rejected', label: '❌ مرفوض', count: retryRequests.filter(r => r.status === 'rejected').length },
                { value: 'used', label: '🔄 مُستخدم', count: retryRequests.filter(r => r.status === 'used').length },
              ]}
              value={retryFilters.status}
              onChange={v => setRetryFilters(f => ({ ...f, status: v }))}
            />

            {examOptions.length > 2 && (
              <FilterChips
                label="الاختبار" icon={ClipboardList}
                options={examOptions}
                value={retryFilters.exam}
                onChange={v => setRetryFilters(f => ({ ...f, exam: v }))}
              />
            )}
          </div>

          {/* Bulk actions */}
          {visiblePendingRetry.length > 1 && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`text-xs font-bold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
                {visiblePendingRetry.length} طلب معلق في العرض الحالي:
              </span>
              <button
                onClick={() => setConfirmBulk({ type: 'retry', action: 'approve' })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs font-black transition-all shadow-sm"
              >
                <CheckCheck className="w-3.5 h-3.5" /> قبول الكل ({visiblePendingRetry.length})
              </button>
              <button
                onClick={() => setConfirmBulk({ type: 'retry', action: 'reject' })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-black transition-all shadow-sm"
              >
                <XOctagon className="w-3.5 h-3.5" /> رفض الكل ({visiblePendingRetry.length})
              </button>
            </div>
          )}

          {/* Results count */}
          {(retryFilters.status !== 'الكل' || retryFilters.exam !== 'الكل') && (
            <p className={`text-xs font-bold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
              يعرض {visibleRetryRequests.length} من {retryRequests.length} طلب
            </p>
          )}

          {/* Cards */}
          {loadingRetry ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-gray-100 animate-pulse" />)}
            </div>
          ) : visibleRetryRequests.length === 0 ? (
            <div className={`${card} rounded-2xl text-center py-16 px-6`}>
              <RotateCcw className={`w-14 h-14 mx-auto mb-3 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-200'}`} />
              <p className={`font-bold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>لا توجد طلبات تطابق الفلاتر</p>
              <button
                onClick={() => setRetryFilters({ status: 'الكل', exam: 'الكل' })}
                className="mt-3 text-xs text-orange-500 font-bold hover:underline"
              >
                مسح كل الفلاتر
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleRetryRequests.map(rr => (
                <div key={rr.id} className={`${card} rounded-2xl overflow-hidden`}>
                  <div className={`h-1 w-full ${
                    rr.status === 'pending' ? 'bg-orange-400' :
                    rr.status === 'approved' ? 'bg-green-400' :
                    rr.status === 'used' ? 'bg-blue-400' : 'bg-red-400'
                  }`} />
                  <div className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-base font-black flex-shrink-0 mt-0.5 bg-gradient-to-br ${
                        rr.status === 'pending' ? 'from-orange-500 to-amber-500' :
                        rr.status === 'approved' ? 'from-green-500 to-green-600' :
                        rr.status === 'used' ? 'from-blue-500 to-blue-600' : 'from-red-400 to-red-500'
                      }`}>
                        {rr.student_name?.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className={`font-black text-sm ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{rr.student_name}</p>
                          {statusBadge(rr.status)}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <ClipboardList className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          <p className={`text-xs font-semibold truncate ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-600'}`}>{rr.exam_title}</p>
                        </div>
                        {rr.message && (
                          <div className={`flex items-start gap-1 mt-1.5 ${dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-50'} rounded-lg px-2 py-1.5`}>
                            <MessageSquare className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" />
                            <p className={`text-[11px] ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>"{rr.message}"</p>
                          </div>
                        )}
                        {rr.teacher_note && (
                          <p className={`text-[11px] mt-1 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
                            <span className="font-bold">ملاحظتك:</span> {rr.teacher_note}
                          </p>
                        )}
                        <div className="flex items-center gap-1 mt-1">
                          <Calendar className="w-3 h-3 text-gray-400" />
                          <p className="text-[10px] text-gray-400">{new Date(rr.created_at).toLocaleString('ar-EG')}</p>
                        </div>
                      </div>
                    </div>

                    {(rr.result_id || rr.status === 'pending') && (
                      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-dashed border-gray-100">
                        {rr.result_id && (
                          <button
                            onClick={() => navigate(`/${location.pathname.startsWith('/assistant') ? 'assistant' : 'teacher'}/exam-review/${rr.result_id}`)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text)] hover:bg-[var(--dk-border)]' : 'bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700'}`}
                          >
                            <Eye className="w-3.5 h-3.5" /> عرض الاختبار
                          </button>
                        )}
                        {rr.status === 'pending' && (
                          <>
                            <button
                              onClick={() => { setRetryNoteModal({ rr, action: 'approve' }); setRetryNote(''); }}
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 text-xs font-black transition-all"
                            >
                              <CheckCircle className="w-3.5 h-3.5" /> موافقة
                            </button>
                            <button
                              onClick={() => { setRetryNoteModal({ rr, action: 'reject' }); setRetryNote(''); }}
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-black transition-all"
                            >
                              <XCircle className="w-3.5 h-3.5" /> رفض
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ Retry Note Modal ══ */}
      {retryNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className={`${dark ? 'bg-[var(--dk-surface)] border border-[var(--dk-border)]' : 'bg-white'} rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4`}>
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${retryNoteModal.action === 'approve' ? 'bg-green-100' : 'bg-red-100'}`}>
                {retryNoteModal.action === 'approve'
                  ? <CheckCircle className="w-6 h-6 text-green-600" />
                  : <XCircle className="w-6 h-6 text-red-600" />}
              </div>
              <div>
                <h3 className={`font-black ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
                  {retryNoteModal.action === 'approve' ? 'الموافقة على طلب الإعادة' : 'رفض طلب الإعادة'}
                </h3>
                <p className={`text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
                  {retryNoteModal.rr.student_name} — {retryNoteModal.rr.exam_title}
                </p>
              </div>
            </div>
            <div>
              <label className={`block text-sm font-bold mb-1 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>ملاحظة للطالب (اختياري)</label>
              <textarea
                value={retryNote}
                onChange={e => setRetryNote(e.target.value)}
                className={`w-full border rounded-xl px-3 py-2 text-sm h-20 resize-none focus:outline-none focus:border-orange-400 ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'border-gray-200'}`}
                placeholder="أضف ملاحظة سترسل للطالب..."
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setRetryNoteModal(null)}
                className={`flex-1 py-2.5 rounded-xl border font-bold transition-all ${dark ? 'border-[var(--dk-border)] text-[var(--dk-text)] hover:bg-[var(--dk-elevated)]' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  if (retryNoteModal.action === 'approve') approveMut.mutate({ reqId: retryNoteModal.rr.id, note: retryNote });
                  else rejectMut.mutate({ reqId: retryNoteModal.rr.id, note: retryNote });
                }}
                disabled={approveMut.isPending || rejectMut.isPending}
                className={`flex-1 font-black py-2.5 rounded-xl text-white transition-all disabled:opacity-50 shadow-sm ${retryNoteModal.action === 'approve' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}`}
              >
                {(approveMut.isPending || rejectMut.isPending) ? 'جاري...' : (retryNoteModal.action === 'approve' ? 'تأكيد الموافقة' : 'تأكيد الرفض')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Bulk Confirm Modal ══ */}
      {confirmBulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className={`${dark ? 'bg-[var(--dk-surface)] border border-[var(--dk-border)]' : 'bg-white'} rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4`}>
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${confirmBulk.action === 'approve' ? 'bg-green-100' : 'bg-red-100'}`}>
                {confirmBulk.action === 'approve'
                  ? <CheckCheck className="w-6 h-6 text-green-600" />
                  : <XOctagon className="w-6 h-6 text-red-600" />}
              </div>
              <div>
                <h3 className={`font-black ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
                  تأكيد {confirmBulk.action === 'approve' ? 'قبول' : 'رفض'} الكل
                </h3>
                <p className={`text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
                  سيتم {confirmBulk.action === 'approve' ? 'قبول' : 'رفض'} {
                    confirmBulk.type === 'enroll' ? visiblePendingEnroll.length : visiblePendingRetry.length
                  } طلب معلق
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmBulk(null)}
                disabled={bulkLoading}
                className={`flex-1 py-2.5 rounded-xl border font-bold transition-all ${dark ? 'border-[var(--dk-border)] text-[var(--dk-text)] hover:bg-[var(--dk-elevated)]' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
              >
                إلغاء
              </button>
              <button
                onClick={() => confirmBulk.type === 'enroll' ? handleBulkEnroll(confirmBulk.action) : handleBulkRetry(confirmBulk.action)}
                disabled={bulkLoading}
                className={`flex-1 font-black py-2.5 rounded-xl text-white transition-all disabled:opacity-50 shadow-sm ${confirmBulk.action === 'approve' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}`}
              >
                {bulkLoading ? 'جاري التنفيذ...' : `تأكيد ${confirmBulk.action === 'approve' ? 'القبول' : 'الرفض'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
