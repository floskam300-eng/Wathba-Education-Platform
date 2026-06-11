import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, CheckCircle, XCircle, Clock, User, FileText, MessageSquare, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useTheme } from '../../context/ThemeContext';

const STATUS_LABELS = {
  pending:  { label: 'معلقة',  color: 'amber',  bg: 'bg-amber-100',  text: 'text-amber-700',  icon: Clock },
  approved: { label: 'مقبولة', color: 'green',  bg: 'bg-green-100',  text: 'text-green-700',  icon: CheckCircle },
  rejected: { label: 'مرفوضة',color: 'red',    bg: 'bg-red-100',    text: 'text-red-700',    icon: XCircle },
  used:     { label: 'مُستخدمة',color: 'purple', bg: 'bg-purple-100', text: 'text-purple-700', icon: CheckCircle },
};

export default function TeacherRetryRequests() {
  const { dark } = useTheme();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [noteMap, setNoteMap] = useState({});

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

  const cardCls = dark
    ? 'bg-[var(--dk-surface)] border border-[var(--dk-border)] rounded-2xl'
    : 'bg-white border border-gray-100 rounded-2xl shadow-sm';

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);
  const pending = requests.filter(r => r.status === 'pending').length;

  const tabs = [
    { key: 'all',      label: 'الكل',    count: requests.length },
    { key: 'pending',  label: 'معلقة',   count: pending },
    { key: 'approved', label: 'مقبولة',  count: requests.filter(r => r.status === 'approved').length },
    { key: 'rejected', label: 'مرفوضة', count: requests.filter(r => r.status === 'rejected').length },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="page-header">
        <div>
          <h1 className={`text-xl sm:text-2xl font-black flex items-center gap-2.5 ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center shadow-md flex-shrink-0">
              <RotateCcw className="w-4 h-4 text-white" />
            </div>
            طلبات الإعادة
            {pending > 0 && (
              <span className="px-2 py-0.5 text-sm rounded-full bg-rose-100 text-rose-600 font-black">{pending}</span>
            )}
          </h1>
          <p className={`text-sm mt-1 mr-11 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
            طلبات الطلاب لإعادة تأدية الاختبارات
          </p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 ${
              filter === t.key
                ? 'bg-rose-500 text-white'
                : dark ? 'text-[var(--dk-text-2)] hover:bg-[var(--dk-elevated)]' : 'text-gray-600 hover:bg-gray-100'
            }`}>
            {t.label}
            {t.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-black ${
                filter === t.key ? 'bg-white/30 text-white' : dark ? 'bg-[var(--dk-elevated)] text-[var(--dk-text-2)]' : 'bg-gray-200 text-gray-500'
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className={`${cardCls} h-24 animate-pulse`} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className={`${cardCls} p-16 text-center`}>
          <RotateCcw className={`w-14 h-14 mx-auto mb-3 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-300'}`} />
          <p className={`font-bold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>لا توجد طلبات إعادة</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => {
            const s = STATUS_LABELS[req.status] || STATUS_LABELS.pending;
            const Icon = s.icon;
            const isExpanded = expandedId === req.id;
            const note = noteMap[req.id] || '';
            const isPending = req.status === 'pending';

            return (
              <div key={req.id} className={`${cardCls} overflow-hidden transition-all`}>
                <div
                  onClick={() => setExpandedId(isExpanded ? null : req.id)}
                  className={`flex items-start gap-4 p-4 cursor-pointer select-none`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${s.bg}`}>
                    <Icon className={`w-5 h-5 ${s.text}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
                        {s.label}
                      </span>
                      <span className={`text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
                        {new Date(req.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <FileText className={`w-3.5 h-3.5 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`} />
                        <span className={`text-sm font-black ${dark ? 'text-[var(--dk-text)]' : 'text-navy-700'}`}>{req.exam_title}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <User className={`w-3.5 h-3.5 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`} />
                        <span className={`text-sm font-semibold ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-600'}`}>{req.student_name}</span>
                      </div>
                    </div>

                    {req.message && (
                      <p className={`text-xs mt-1.5 line-clamp-2 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
                        <MessageSquare className="w-3 h-3 inline ml-1" />
                        {req.message}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 self-center">
                    {isPending && (
                      <div className="flex gap-2">
                        <button
                          onClick={e => { e.stopPropagation(); approveMut.mutate({ reqId: req.id, note }); }}
                          disabled={approveMut.isPending}
                          className="px-3 py-1.5 bg-green-100 hover:bg-green-200 text-green-700 text-xs font-black rounded-lg transition-colors">
                          قبول
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); rejectMut.mutate({ reqId: req.id, note }); }}
                          disabled={rejectMut.isPending}
                          className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-black rounded-lg transition-colors">
                          رفض
                        </button>
                      </div>
                    )}
                    {isExpanded ? (
                      <ChevronUp className={`w-4 h-4 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`} />
                    ) : (
                      <ChevronDown className={`w-4 h-4 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`} />
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className={`border-t px-4 pb-4 pt-3 space-y-3 ${dark ? 'border-[var(--dk-border)]' : 'border-gray-100'}`}>
                    {req.message && (
                      <div className={`p-3 rounded-xl text-sm ${dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-50'}`}>
                        <p className={`text-xs font-bold mb-1 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>رسالة الطالب:</p>
                        <p className={dark ? 'text-[var(--dk-text)]' : 'text-gray-700'}>{req.message}</p>
                      </div>
                    )}

                    {req.teacher_note && (
                      <div className={`p-3 rounded-xl text-sm ${dark ? 'bg-[var(--dk-elevated)]' : 'bg-blue-50'}`}>
                        <p className={`text-xs font-bold mb-1 ${dark ? 'text-[var(--dk-text-2)]' : 'text-blue-400'}`}>ملاحظتك:</p>
                        <p className={dark ? 'text-[var(--dk-text)]' : 'text-blue-800'}>{req.teacher_note}</p>
                      </div>
                    )}

                    {req.handled_at && (
                      <p className={`text-xs ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-400'}`}>
                        تمت المعالجة: {new Date(req.handled_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}

                    {isPending && (
                      <div>
                        <label className={`block text-xs font-bold mb-1 ${dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500'}`}>
                          ملاحظة للطالب (اختياري)
                        </label>
                        <input
                          value={note}
                          onChange={e => setNoteMap(m => ({ ...m, [req.id]: e.target.value }))}
                          placeholder="اكتب ملاحظة..."
                          className={`w-full rounded-xl px-3 py-2 border text-sm ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text)]' : 'bg-white border-gray-200'}`}
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => approveMut.mutate({ reqId: req.id, note })}
                            disabled={approveMut.isPending}
                            className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl text-sm font-black transition-colors">
                            <CheckCircle className="w-4 h-4" /> قبول الطلب
                          </button>
                          <button
                            onClick={() => rejectMut.mutate({ reqId: req.id, note })}
                            disabled={rejectMut.isPending}
                            className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-xl text-sm font-black transition-colors">
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
    </div>
  );
}
