import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList, RotateCcw, Bell, CheckCircle, XCircle,
  Clock, Eye, CreditCard, AlertCircle, Gift
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

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
      <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mt-2">
        <Gift className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
        <span className="text-xs font-bold text-blue-700">كورس مجاني — لا يتطلب دفعاً</span>
      </div>
    );
  }

  if (r.payment_status === 'verified') {
    const paid = parseFloat(r.paid_amount) || 0;
    const remaining = Math.max(0, price - paid);
    const fullyPaid = remaining === 0;
    return (
      <div className={`flex items-center gap-1.5 rounded-xl px-3 py-2 mt-2 border ${fullyPaid ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
        <CreditCard className={`w-3.5 h-3.5 flex-shrink-0 ${fullyPaid ? 'text-green-600' : 'text-yellow-600'}`} />
        <div className="flex-1 min-w-0">
          <span className={`text-xs font-black ${fullyPaid ? 'text-green-700' : 'text-yellow-700'}`}>
            {fullyPaid ? '✅ دفع المبلغ كاملاً' : `⚠️ دفع جزئي — باقي ${remaining.toLocaleString()} ج`}
          </span>
          <span className="text-[10px] text-gray-500 block mt-0.5">
            المدفوع: <span className="font-bold">{paid.toLocaleString()} ج</span> من {price.toLocaleString()} ج
            {r.payment_method && ` — ${METHOD_LABELS[r.payment_method] || r.payment_method}`}
            {r.payment_date && ` — ${new Date(r.payment_date).toLocaleDateString('ar-EG')}`}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-2">
      <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
      <div>
        <span className="text-xs font-black text-red-700">❌ لم يدفع بعد</span>
        <span className="text-[10px] text-gray-500 block mt-0.5">سعر الكورس: {price.toLocaleString()} ج</span>
      </div>
    </div>
  );
}

export default function TeacherRequests() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('enrollment');
  const [retryNoteModal, setRetryNoteModal] = useState(null);
  const [retryNote, setRetryNote] = useState('');
  const [requestsCourseFilter, setRequestsCourseFilter] = useState('الكل');

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
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const approveMut = useMutation({
    mutationFn: ({ reqId, note }) => api.put(`/exams/retry-requests/${reqId}/approve`, { teacher_note: note }),
    onSuccess: () => {
      qc.invalidateQueries(['retry-requests']);
      toast.success('تمت الموافقة على الطلب');
      setRetryNoteModal(null);
      setRetryNote('');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const rejectMut = useMutation({
    mutationFn: ({ reqId, note }) => api.put(`/exams/retry-requests/${reqId}/reject`, { teacher_note: note }),
    onSuccess: () => {
      qc.invalidateQueries(['retry-requests']);
      toast.success('تم رفض الطلب');
      setRetryNoteModal(null);
      setRetryNote('');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const pendingEnroll = enrollRequests.filter(r => r.status === 'pending');
  const pendingRetry = retryRequests.filter(r => r.status === 'pending');

  const courseNames = ['الكل', ...Array.from(new Set(pendingEnroll.map(r => r.course_name).filter(Boolean)))];
  const visibleEnrollRequests = requestsCourseFilter === 'الكل'
    ? enrollRequests
    : enrollRequests.filter(r => r.course_name === requestsCourseFilter);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="text-xl sm:text-2xl font-black text-navy-600 flex items-center gap-2">
          <ClipboardList className="w-6 h-6 sm:w-7 sm:h-7 text-orange-500" /> صفحة الطلبات
        </h1>
        {(pendingEnroll.length + pendingRetry.length) > 0 && (
          <span className="bg-red-500 text-white text-xs font-black px-2.5 py-1 rounded-full animate-pulse">
            {pendingEnroll.length + pendingRetry.length} طلب جديد
          </span>
        )}
      </div>

      {/* Tabs — full-width on mobile */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-full sm:w-fit">
        <button
          onClick={() => setActiveTab('enrollment')}
          className={`relative flex-1 sm:flex-none px-3 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 sm:gap-2 ${activeTab === 'enrollment' ? 'bg-white text-navy-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Bell className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
          <span className="truncate">طلبات الانضمام</span>
          {pendingEnroll.length > 0 && (
            <span className="bg-yellow-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0">
              {pendingEnroll.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('retry')}
          className={`relative flex-1 sm:flex-none px-3 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 sm:gap-2 ${activeTab === 'retry' ? 'bg-white text-navy-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
          <span className="truncate">طلبات الإعادة</span>
          {pendingRetry.length > 0 && (
            <span className="bg-orange-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0">
              {pendingRetry.length}
            </span>
          )}
        </button>
      </div>

      {/* ── ENROLLMENT REQUESTS TAB ── */}
      {activeTab === 'enrollment' && (
        <div className="space-y-4">
          {/* Stats bar */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-2.5 sm:p-3 text-center">
              <p className="text-xl sm:text-2xl font-black text-yellow-700">{pendingEnroll.length}</p>
              <p className="text-[11px] sm:text-xs text-yellow-600 font-bold mt-0.5">معلق</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-2.5 sm:p-3 text-center">
              <p className="text-xl sm:text-2xl font-black text-green-700">{enrollRequests.filter(r => r.status === 'approved').length}</p>
              <p className="text-[11px] sm:text-xs text-green-600 font-bold mt-0.5">مقبول</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 sm:p-3 text-center">
              <p className="text-xl sm:text-2xl font-black text-red-700">{enrollRequests.filter(r => r.status === 'rejected').length}</p>
              <p className="text-[11px] sm:text-xs text-red-600 font-bold mt-0.5">مرفوض</p>
            </div>
          </div>

          {/* Course filter chips */}
          {courseNames.length > 2 && (
            <div className="filter-scroll">
              {courseNames.map(cn => (
                <button
                  key={cn}
                  onClick={() => setRequestsCourseFilter(cn)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                    requestsCourseFilter === cn
                      ? 'bg-navy-600 text-white shadow-sm'
                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {cn}
                  {cn !== 'الكل' && (
                    <span className="mr-1 opacity-70">
                      ({enrollRequests.filter(r => r.course_name === cn && r.status === 'pending').length})
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {loadingEnroll ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-2xl bg-gray-100 animate-pulse" />)}
            </div>
          ) : visibleEnrollRequests.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm text-center py-16 px-6">
              <Bell className="w-14 h-14 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 font-bold">لا توجد طلبات انضمام</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleEnrollRequests.map(r => (
                <div
                  key={r.id}
                  className={`bg-white rounded-2xl border shadow-sm px-4 py-3 ${
                    r.status === 'pending' ? 'border-yellow-200' : r.status === 'approved' ? 'border-green-200' : 'border-red-200'
                  }`}
                >
                  {/* Top row: avatar + info */}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-navy-600 flex items-center justify-center text-white text-base font-black flex-shrink-0 mt-0.5">
                      {r.student_name?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-black text-navy-700 text-sm">{r.student_name}</p>
                        {r.academic_stage && (
                          <span className="text-[10px] bg-gray-100 text-gray-600 font-bold px-1.5 py-0.5 rounded-full">
                            {r.academic_stage}
                          </span>
                        )}
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                          r.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          r.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {r.status === 'pending' ? '⏳ معلق' : r.status === 'approved' ? '✅ مقبول' : '❌ مرفوض'}
                        </span>
                      </div>
                      <p className="text-xs text-orange-600 font-semibold truncate mt-0.5">{r.course_name}</p>
                      {r.message && (
                        <p className="text-[11px] text-gray-400 truncate mt-0.5">"{r.message}"</p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-0.5">{new Date(r.created_at).toLocaleString('ar-EG')}</p>
                    </div>
                  </div>

                  {/* Payment status indicator */}
                  <PaymentBadge r={r} />

                  {/* Action buttons — full width below on mobile */}
                  {r.status === 'pending' && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                      <button
                        onClick={() => handleRequestMut.mutate({ id: r.id, action: 'approve' })}
                        disabled={handleRequestMut.isPending}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-green-100 hover:bg-green-200 text-green-800 text-xs font-bold transition-all disabled:opacity-50"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> قبول
                      </button>
                      <button
                        onClick={() => handleRequestMut.mutate({ id: r.id, action: 'reject' })}
                        disabled={handleRequestMut.isPending}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-100 hover:bg-red-200 text-red-800 text-xs font-bold transition-all disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" /> رفض
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── RETRY REQUESTS TAB ── */}
      {activeTab === 'retry' && (
        <div className="space-y-4">
          {/* Stats bar */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-2.5 sm:p-3 text-center">
              <p className="text-xl sm:text-2xl font-black text-yellow-700">{pendingRetry.length}</p>
              <p className="text-[11px] sm:text-xs text-yellow-600 font-bold mt-0.5">معلق</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-2.5 sm:p-3 text-center">
              <p className="text-xl sm:text-2xl font-black text-green-700">{retryRequests.filter(r => r.status === 'approved').length}</p>
              <p className="text-[11px] sm:text-xs text-green-600 font-bold mt-0.5">مقبول</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 sm:p-3 text-center">
              <p className="text-xl sm:text-2xl font-black text-blue-700">{retryRequests.filter(r => r.status === 'used').length}</p>
              <p className="text-[11px] sm:text-xs text-blue-600 font-bold mt-0.5">مُستخدم</p>
            </div>
          </div>

          {loadingRetry ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-2xl bg-gray-100 animate-pulse" />)}
            </div>
          ) : retryRequests.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm text-center py-16 px-6">
              <RotateCcw className="w-14 h-14 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 font-bold">لا توجد طلبات إعادة اختبار</p>
            </div>
          ) : (
            <div className="space-y-3">
              {retryRequests.map(rr => (
                <div
                  key={rr.id}
                  className={`bg-white rounded-2xl border shadow-sm px-4 py-3 ${
                    rr.status === 'pending' ? 'border-orange-200' :
                    rr.status === 'approved' ? 'border-green-200' :
                    rr.status === 'used' ? 'border-blue-200' : 'border-red-200'
                  }`}
                >
                  {/* Top row: avatar + info */}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-white text-base font-black flex-shrink-0 mt-0.5">
                      {rr.student_name?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-black text-navy-700 text-sm">{rr.student_name}</p>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                          rr.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          rr.status === 'approved' ? 'bg-green-100 text-green-700' :
                          rr.status === 'used' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {rr.status === 'pending' ? '⏳ معلق' : rr.status === 'approved' ? '✅ موافق' : rr.status === 'used' ? '🔄 مُستخدم' : '❌ مرفوض'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{rr.exam_title}</p>
                      {rr.message && (
                        <p className="text-[11px] text-gray-500 bg-gray-50 rounded px-2 py-1 mt-1">"{rr.message}"</p>
                      )}
                      {rr.teacher_note && (
                        <p className="text-[11px] text-gray-500 mt-1">ملاحظة: {rr.teacher_note}</p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-0.5">{new Date(rr.created_at).toLocaleString('ar-EG')}</p>
                    </div>
                  </div>

                  {/* Action row — full width below on mobile */}
                  {(rr.result_id || rr.status === 'pending') && (
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                      {rr.result_id && (
                        <button
                          onClick={() => navigate(`/teacher/exam-review/${rr.result_id}`)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-100 hover:bg-blue-200 text-blue-800 text-xs font-bold transition-all"
                        >
                          <Eye className="w-3.5 h-3.5" /> عرض الاختبار
                        </button>
                      )}
                      {rr.status === 'pending' && (
                        <>
                          <button
                            onClick={() => { setRetryNoteModal({ rr, action: 'approve' }); setRetryNote(''); }}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-green-100 hover:bg-green-200 text-green-800 text-xs font-bold transition-all"
                          >
                            <CheckCircle className="w-3.5 h-3.5" /> موافقة
                          </button>
                          <button
                            onClick={() => { setRetryNoteModal({ rr, action: 'reject' }); setRetryNote(''); }}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-100 hover:bg-red-200 text-red-800 text-xs font-bold transition-all"
                          >
                            <XCircle className="w-3.5 h-3.5" /> رفض
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Retry Note Modal */}
      {retryNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${retryNoteModal.action === 'approve' ? 'bg-green-100' : 'bg-red-100'}`}>
                {retryNoteModal.action === 'approve'
                  ? <CheckCircle className="w-6 h-6 text-green-600" />
                  : <XCircle className="w-6 h-6 text-red-600" />}
              </div>
              <div>
                <h3 className="font-black text-navy-700">
                  {retryNoteModal.action === 'approve' ? 'الموافقة على طلب الإعادة' : 'رفض طلب الإعادة'}
                </h3>
                <p className="text-xs text-gray-500">{retryNoteModal.rr.student_name} — {retryNoteModal.rr.exam_title}</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1">ملاحظة للطالب (اختياري)</label>
              <textarea
                value={retryNote}
                onChange={e => setRetryNote(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm h-20 resize-none focus:outline-none focus:border-orange-400"
                placeholder="أضف ملاحظة سترسل للطالب..."
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setRetryNoteModal(null)} className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-700 font-bold hover:bg-gray-50">إلغاء</button>
              <button
                onClick={() => {
                  if (retryNoteModal.action === 'approve') approveMut.mutate({ reqId: retryNoteModal.rr.id, note: retryNote });
                  else rejectMut.mutate({ reqId: retryNoteModal.rr.id, note: retryNote });
                }}
                disabled={approveMut.isPending || rejectMut.isPending}
                className={`flex-1 font-bold py-2 rounded-xl text-white transition-all disabled:opacity-50 ${retryNoteModal.action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
              >
                {(approveMut.isPending || rejectMut.isPending) ? 'جاري...' : (retryNoteModal.action === 'approve' ? 'تأكيد الموافقة' : 'تأكيد الرفض')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
