import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  RotateCcw, CheckCircle, XCircle, Clock, User, FileText,
  MessageSquare, ChevronDown, ChevronUp, Filter, CheckCheck,
  XOctagon, Eye, Calendar, BookOpen, History
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useTheme } from '../../context/ThemeContext';
import AttemptHistoryModal from '../../components/ui/AttemptHistoryModal';

const STATUS_META = {
  pending:  { label: '⏳ معلق',    bg: 'bg-yellow-100', text: 'text-yellow-800', stripe: 'bg-yellow-400', avatarGrad: 'from-orange-400 to-amber-500' },
  approved: { label: '✅ مقبول',   bg: 'bg-green-100',  text: 'text-green-700',  stripe: 'bg-green-400',  avatarGrad: 'from-green-500 to-green-600' },
  rejected: { label: '❌ مرفوض',  bg: 'bg-red-100',    text: 'text-red-700',    stripe: 'bg-red-400',    avatarGrad: 'from-red-400 to-red-500' },
  used:     { label: '🔄 مُستخدم', bg: 'bg-blue-100',   text: 'text-blue-700',   stripe: 'bg-blue-400',   avatarGrad: 'from-blue-500 to-blue-600' },
};

function FilterChips({ label, icon: Icon, options, value, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {Icon && (
        <span className="text-[10px] font-black text-gray-400 flex items-center gap-1 flex-shrink-0">
          <Icon className="w-3 h-3" />{label}
        </span>
      )}
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
          {opt.count != null && opt.count > 0 && (
            <span className={`mr-1 text-[10px] ${value === opt.value ? 'opacity-80' : 'opacity-50'}`}>
              ({opt.count})
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function StatCard({ value, label, colorClass, bgClass, borderClass }) {
  return (
    <div className={`${bgClass} ${borderClass} rounded-2xl p-3 text-center border`}>
      <p className={`text-2xl font-black ${colorClass}`}>{value}</p>
      <p className={`text-[11px] font-bold mt-0.5 ${colorClass} opacity-75`}>{label}</p>
    </div>
  );
}

export default function TeacherRetryRequests() {
  const { dark } = useTheme();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [statusFilter, setStatusFilter] = useState('الكل');
  const [examFilter, setExamFilter] = useState('الكل');
  const [expandedId, setExpandedId] = useState(null);
  const [noteMap, setNoteMap] = useState({});
  const [confirmBulk, setConfirmBulk] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  // Attempt history modal: { examId, studentId, studentName, examTitle }
  const [attemptHistory, setAttemptHistory] = useState(null);

  const card = dark
    ? 'bg-[var(--dk-surface)] border border-[var(--dk-border)]'
    : 'bg-white border border-gray-100';

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['retry-requests'],
    queryFn: () => api.get('/exams/retry-requests').then(r => r.data),
    refetchInterval: 30000,
  });

  const approveMut = useMutation({
    mutationFn: ({ reqId, note }) =>
      api.put(`/exams/retry-requests/${reqId}/approve`, { teacher_note: note }),
    onSuccess: () => {
      qc.invalidateQueries(['retry-requests']);
      qc.invalidateQueries(['teacher-stats']);
      toast.success('تم قبول الطلب');
    },
    onError: e => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const rejectMut = useMutation({
    mutationFn: ({ reqId, note }) =>
      api.put(`/exams/retry-requests/${reqId}/reject`, { teacher_note: note }),
    onSuccess: () => {
      qc.invalidateQueries(['retry-requests']);
      qc.invalidateQueries(['teacher-stats']);
      toast.success('تم رفض الطلب');
    },
    onError: e => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  const examOptions = useMemo(() => {
    const names = [...new Set(requests.map(r => r.exam_title).filter(Boolean))];
    return [
      { value: 'الكل', label: 'كل الاختبارات' },
      ...names.map(n => ({
        value: n,
        label: n.length > 22 ? n.slice(0, 22) + '…' : n,
        count: requests.filter(r => r.exam_title === n && r.status === 'pending').length || undefined,
      })),
    ];
  }, [requests]);

  const statusOptions = useMemo(() => [
    { value: 'الكل',     label: 'الكل',        count: requests.length },
    { value: 'pending',  label: '⏳ معلق',      count: requests.filter(r => r.status === 'pending').length },
    { value: 'approved', label: '✅ مقبول',     count: requests.filter(r => r.status === 'approved').length },
    { value: 'rejected', label: '❌ مرفوض',    count: requests.filter(r => r.status === 'rejected').length },
    { value: 'used',     label: '🔄 مُستخدم',  count: requests.filter(r => r.status === 'used').length },
  ], [requests]);

  const filtered = useMemo(() => requests.filter(r => {
    if (statusFilter !== 'الكل' && r.status !== statusFilter) return false;
    if (examFilter !== 'الكل' && r.exam_title !== examFilter) return false;
    return true;
  }), [requests, statusFilter, examFilter]);

  const visiblePending = filtered.filter(r => r.status === 'pending');
  const hasActiveFilter = statusFilter !== 'الكل' || examFilter !== 'الكل';

  const handleBulkAction = async (action) => {
    setBulkLoading(true);
    let ok = 0, fail = 0;
    for (const r of visiblePending) {
      try {
        await api.put(`/exams/retry-requests/${r.id}/${action}`, { teacher_note: '' });
        ok++;
      } catch { fail++; }
    }
    await qc.invalidateQueries(['retry-requests']);
    await qc.invalidateQueries(['teacher-stats']);
    setBulkLoading(false);
    setConfirmBulk(null);
    if (ok > 0) toast.success(`تم ${action === 'approve' ? 'قبول' : 'رفض'} ${ok} طلب`);
    if (fail > 0) toast.error(`فشل في معالجة ${fail} طلب`);
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center shadow-lg flex-shrink-0">
          <RotateCcw className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className={`text-xl font-black ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
              طلبات الإعادة
            </h1>
            {pendingCount > 0 && (
              <span className="px-2.5 py-0.5 text-xs rounded-full bg-rose-100 text-rose-600 font-black animate-pulse">
                {pendingCount} جديد
              </span>
            )}
          </div>
          <p className={`text-xs mt-0.5 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
            طلبات الطلاب لإعادة تأدية الاختبارات
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <StatCard value={pendingCount}
          label="معلق" colorClass="text-yellow-700"
          bgClass="bg-yellow-50" borderClass="border-yellow-200" />
        <StatCard value={requests.filter(r => r.status === 'approved').length}
          label="مقبول" colorClass="text-green-700"
          bgClass="bg-green-50" borderClass="border-green-200" />
        <StatCard value={requests.filter(r => r.status === 'rejected').length}
          label="مرفوض" colorClass="text-red-700"
          bgClass="bg-red-50" borderClass="border-red-200" />
        <StatCard value={requests.filter(r => r.status === 'used').length}
          label="مُستخدم" colorClass="text-blue-700"
          bgClass="bg-blue-50" borderClass="border-blue-200" />
      </div>

      {/* Filters card */}
      <div className={`${card} rounded-2xl p-3.5 space-y-3`}>
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-orange-500" />
          <span className={`text-xs font-black ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>الفلاتر</span>
          {hasActiveFilter && (
            <button
              onClick={() => { setStatusFilter('الكل'); setExamFilter('الكل'); }}
              className="mr-auto text-[10px] font-bold text-orange-500 hover:underline"
            >
              مسح الكل
            </button>
          )}
        </div>

        <FilterChips
          label="الحالة" icon={Clock}
          options={statusOptions}
          value={statusFilter}
          onChange={setStatusFilter}
        />

        {examOptions.length > 2 && (
          <FilterChips
            label="الاختبار" icon={FileText}
            options={examOptions}
            value={examFilter}
            onChange={setExamFilter}
          />
        )}
      </div>

      {/* Bulk actions bar */}
      {visiblePending.length > 1 && (
        <div className={`flex items-center gap-3 flex-wrap px-4 py-3 rounded-2xl border ${
          dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)]' : 'bg-orange-50 border-orange-100'
        }`}>
          <span className={`text-xs font-bold ${dark ? 'text-[var(--dk-text-2)]' : 'text-orange-700'}`}>
            {visiblePending.length} طلب معلق في العرض الحالي:
          </span>
          <div className="flex gap-2 mr-auto">
            <button
              onClick={() => setConfirmBulk('approve')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs font-black transition-all shadow-sm"
            >
              <CheckCheck className="w-3.5 h-3.5" /> قبول الكل ({visiblePending.length})
            </button>
            <button
              onClick={() => setConfirmBulk('reject')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-black transition-all shadow-sm"
            >
              <XOctagon className="w-3.5 h-3.5" /> رفض الكل ({visiblePending.length})
            </button>
          </div>
        </div>
      )}

      {/* Results count */}
      {hasActiveFilter && (
        <p className={`text-xs font-bold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
          يعرض {filtered.length} من {requests.length} طلب
        </p>
      )}

      {/* Cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className={`${card} h-24 rounded-2xl animate-pulse`} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className={`${card} rounded-2xl p-16 text-center`}>
          <RotateCcw className={`w-14 h-14 mx-auto mb-3 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-200'}`} />
          <p className={`font-bold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
            {hasActiveFilter ? 'لا توجد طلبات تطابق الفلاتر المحددة' : 'لا توجد طلبات إعادة'}
          </p>
          {hasActiveFilter && (
            <button
              onClick={() => { setStatusFilter('الكل'); setExamFilter('الكل'); }}
              className="mt-3 text-xs text-orange-500 font-bold hover:underline"
            >
              مسح كل الفلاتر
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => {
            const s = STATUS_META[req.status] || STATUS_META.pending;
            const isExpanded = expandedId === req.id;
            const note = noteMap[req.id] || '';
            const isPending = req.status === 'pending';

            return (
              <div key={req.id} className={`${card} rounded-2xl overflow-hidden transition-all`}>
                {/* Status stripe */}
                <div className={`h-1 w-full ${s.stripe}`} />

                {/* Main row — clickable to expand */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : req.id)}
                  className="flex items-start gap-3 p-4 cursor-pointer select-none"
                >
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${s.avatarGrad} flex items-center justify-center text-white text-base font-black flex-shrink-0 mt-0.5 shadow-sm`}>
                    {req.student_name?.charAt(0)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`text-xs font-black px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
                        {s.label}
                      </span>
                      <span className={`text-[10px] ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
                        {new Date(req.created_at).toLocaleString('ar-EG', {
                          day: 'numeric', month: 'long', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <div className="flex items-center gap-1.5">
                        <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`} />
                        <span className={`text-sm font-black truncate max-w-[180px] ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
                          {req.exam_title}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <User className={`w-3 h-3 flex-shrink-0 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`} />
                        <span className={`text-xs font-semibold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-600'}`}>
                          {req.student_name}
                        </span>
                      </div>
                    </div>

                    {req.message && (
                      <div className="flex items-start gap-1 mt-1.5">
                        <MessageSquare className={`w-3 h-3 flex-shrink-0 mt-0.5 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`} />
                        <p className={`text-xs line-clamp-1 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
                          "{req.message}"
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Actions in row */}
                  <div className="flex items-center gap-2 flex-shrink-0 self-center">
                    {isPending && (
                      <div className="flex gap-1.5">
                        <button
                          onClick={e => { e.stopPropagation(); approveMut.mutate({ reqId: req.id, note }); }}
                          disabled={approveMut.isPending && approveMut.variables?.reqId === req.id}
                          className="px-3 py-1.5 bg-green-100 hover:bg-green-200 text-green-700 text-xs font-black rounded-xl transition-colors border border-green-200 disabled:opacity-50"
                        >
                          {approveMut.isPending && approveMut.variables?.reqId === req.id ? '...' : 'قبول'}
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); rejectMut.mutate({ reqId: req.id, note }); }}
                          disabled={rejectMut.isPending && rejectMut.variables?.reqId === req.id}
                          className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-black rounded-xl transition-colors border border-red-200 disabled:opacity-50"
                        >
                          {rejectMut.isPending && rejectMut.variables?.reqId === req.id ? '...' : 'رفض'}
                        </button>
                      </div>
                    )}
                    {isExpanded
                      ? <ChevronUp className={`w-4 h-4 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`} />
                      : <ChevronDown className={`w-4 h-4 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`} />
                    }
                  </div>
                </div>

                {/* Expanded panel */}
                {isExpanded && (
                  <div className={`border-t px-4 pb-4 pt-3 space-y-3 ${dark ? 'border-[var(--dk-border)]' : 'border-gray-100'}`}>
                    {req.message && (
                      <div className={`p-3 rounded-xl text-sm ${dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-50'}`}>
                        <p className={`text-xs font-bold mb-1 flex items-center gap-1 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
                          <MessageSquare className="w-3 h-3" /> رسالة الطالب
                        </p>
                        <p className={dark ? 'text-[var(--dk-text)]' : 'text-gray-700'}>{req.message}</p>
                      </div>
                    )}

                    {req.teacher_note && (
                      <div className={`p-3 rounded-xl text-sm ${dark ? 'bg-[var(--dk-elevated)]' : 'bg-blue-50 border border-blue-100'}`}>
                        <p className={`text-xs font-bold mb-1 ${dark ? 'text-[var(--dk-text-2)]' : 'text-blue-500'}`}>ملاحظتك للطالب</p>
                        <p className={dark ? 'text-[var(--dk-text)]' : 'text-blue-800'}>{req.teacher_note}</p>
                      </div>
                    )}

                    {req.handled_at && (
                      <div className="flex items-center gap-1.5">
                        <Calendar className={`w-3.5 h-3.5 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`} />
                        <p className={`text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
                          تمت المعالجة: {new Date(req.handled_at).toLocaleString('ar-EG', {
                            day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                      </div>
                    )}

                    {/* View exam result buttons — latest + full history */}
                    <div className="flex flex-wrap gap-2">
                      {req.result_id && (
                        <button
                          onClick={() => navigate(`/teacher/exam-review/${req.result_id}`)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                            dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text)] hover:bg-[var(--dk-border)]' : 'bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700'
                          }`}
                        >
                          <Eye className="w-3.5 h-3.5" /> عرض نتيجة الاختبار
                        </button>
                      )}
                      <button
                        onClick={() => setAttemptHistory({
                          examId: req.exam_id,
                          studentId: req.student_id,
                          studentName: req.student_name,
                          examTitle: req.exam_title,
                        })}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                          dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text)] hover:bg-[var(--dk-border)]' : 'bg-navy-50 hover:bg-navy-100 border border-navy-200 text-navy-700'
                        }`}
                      >
                        <History className="w-3.5 h-3.5" /> كل المحاولات
                      </button>
                    </div>

                    {/* Note + expanded action buttons */}
                    {isPending && (
                      <div className="space-y-2">
                        <label className={`block text-xs font-bold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
                          ملاحظة للطالب (اختياري)
                        </label>
                        <input
                          value={note}
                          onChange={e => setNoteMap(m => ({ ...m, [req.id]: e.target.value }))}
                          onClick={e => e.stopPropagation()}
                          placeholder="اكتب ملاحظة ترسل مع الرد..."
                          className={`w-full rounded-xl px-3 py-2 border text-sm focus:outline-none focus:border-orange-400 transition-colors ${
                            dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'
                          }`}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={e => { e.stopPropagation(); approveMut.mutate({ reqId: req.id, note }); }}
                            disabled={approveMut.isPending}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl text-sm font-black transition-colors shadow-sm"
                          >
                            <CheckCircle className="w-4 h-4" /> قبول الطلب
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); rejectMut.mutate({ reqId: req.id, note }); }}
                            disabled={rejectMut.isPending}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-xl text-sm font-black transition-colors shadow-sm"
                          >
                            <XCircle className="w-4 h-4" /> رفض الطلب
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══ Bulk Confirm Modal ══ */}
      {confirmBulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className={`${dark ? 'bg-[var(--dk-surface)] border border-[var(--dk-border)]' : 'bg-white'} rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4`}>
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${confirmBulk === 'approve' ? 'bg-green-100' : 'bg-red-100'}`}>
                {confirmBulk === 'approve'
                  ? <CheckCheck className="w-6 h-6 text-green-600" />
                  : <XOctagon className="w-6 h-6 text-red-600" />
                }
              </div>
              <div>
                <h3 className={`font-black ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
                  تأكيد {confirmBulk === 'approve' ? 'قبول' : 'رفض'} الكل
                </h3>
                <p className={`text-xs mt-0.5 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
                  سيتم {confirmBulk === 'approve' ? 'قبول' : 'رفض'} {visiblePending.length} طلب معلق
                  {hasActiveFilter ? ' (حسب الفلتر الحالي)' : ''}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmBulk(null)}
                disabled={bulkLoading}
                className={`flex-1 py-2.5 rounded-xl border font-bold transition-all ${
                  dark ? 'border-[var(--dk-border)] text-[var(--dk-text)] hover:bg-[var(--dk-elevated)]' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                إلغاء
              </button>
              <button
                onClick={() => handleBulkAction(confirmBulk)}
                disabled={bulkLoading}
                className={`flex-1 font-black py-2.5 rounded-xl text-white transition-all disabled:opacity-50 shadow-sm ${
                  confirmBulk === 'approve' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                {bulkLoading ? 'جاري التنفيذ...' : `تأكيد ${confirmBulk === 'approve' ? 'القبول' : 'الرفض'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attempt history modal — shows every attempt (latest + archived) */}
      {attemptHistory && (
        <AttemptHistoryModal
          examId={attemptHistory.examId}
          studentId={attemptHistory.studentId}
          studentName={attemptHistory.studentName}
          examTitle={attemptHistory.examTitle}
          onClose={() => setAttemptHistory(null)}
        />
      )}
    </div>
  );
}
