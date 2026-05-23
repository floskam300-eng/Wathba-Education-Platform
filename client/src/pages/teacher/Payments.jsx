import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard, Plus, CheckCircle, XCircle, Printer, TrendingUp,
  AlertCircle, Search, Filter, Calendar, GraduationCap
} from 'lucide-react';
import { validatePaymentForm, hasErrors } from '../../lib/validation';

function FieldError({ error }) {
  if (!error) return null;
  return (
    <p className="flex items-center gap-1 text-red-600 text-xs font-semibold mt-1">
      <AlertCircle className="w-3 h-3 flex-shrink-0" />{error}
    </p>
  );
}

import ReactECharts from 'echarts-for-react';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { generatePDFReport } from '../../lib/pdfReport';

const METHOD_LABELS = {
  'Vodafone Cash': '📱 فودافون كاش',
  'Instapay': '💳 إنستاباي',
  'Cash': '💵 كاش',
  'Bank Transfer': '🏦 تحويل بنكي',
};
const STATUS_MAP = {
  pending:  { label: 'قيد الانتظار', variant: 'warning' },
  verified: { label: 'مؤكدة',        variant: 'success' },
  rejected: { label: 'مرفوضة',       variant: 'danger'  },
};

const ACADEMIC_STAGES = [
  'الكل',
  'الصف الأول الثانوي',
  'الصف الثاني الثانوي',
  'الصف الثالث الثانوي',
  'الصف الأول الإعدادي',
  'الصف الثاني الإعدادي',
  'الصف الثالث الإعدادي',
  'جامعي',
];

const ARABIC_MONTHS = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
];

const emptyForm = { student_id: '', course_id: '', amount: '', reference_number: '', notes: '' };
const emptyVerify = { method: '', reference_number: '' };

export default function TeacherPayments() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});

  const [verifyModal, setVerifyModal] = useState(null);
  const [verifyForm, setVerifyForm] = useState(emptyVerify);

  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('الكل');
  const [monthFilter, setMonthFilter] = useState('');

  const clearError = (field) => setFormErrors(prev => { const n = { ...prev }; delete n[field]; return n; });

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: () => api.get('/payments').then(r => r.data),
    refetchInterval: 30000,
    staleTime: 0,
  });

  const { data: students = [] } = useQuery({
    queryKey: ['students'],
    queryFn: () => api.get('/students').then(r => r.data),
  });

  const { data: courses = [] } = useQuery({
    queryKey: ['courses'],
    queryFn: () => api.get('/courses').then(r => r.data),
  });

  const createMut = useMutation({
    mutationFn: (data) => api.post('/payments', data),
    onSuccess: () => {
      qc.invalidateQueries(['payments']);
      toast.success('تم تسجيل الدفعة');
      setModal(false);
      setForm(emptyForm);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const verifyMut = useMutation({
    mutationFn: ({ id, status, method, reference_number }) =>
      api.put(`/payments/${id}/verify`, { status, method: method || undefined, reference_number: reference_number || undefined }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries(['payments']);
      if (vars.status === 'verified') toast.success('✅ تم تأكيد الدفعة وفتح الكورس للطالب');
      else toast.success('تم رفض الدفعة');
      setVerifyModal(null);
      setVerifyForm(emptyVerify);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const studentMap = useMemo(() => {
    const m = {};
    students.forEach(s => { m[s.id] = s; });
    return m;
  }, [students]);

  const filtered = useMemo(() => {
    let list = payments;
    if (statusFilter !== 'all') list = list.filter(p => p.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(p =>
        p.student_name?.toLowerCase().includes(q) ||
        p.course_name?.toLowerCase().includes(q) ||
        (p.reference_number || '').toLowerCase().includes(q)
      );
    }
    if (stageFilter !== 'الكل') {
      list = list.filter(p => {
        const s = studentMap[p.student_id];
        return s?.academic_stage === stageFilter;
      });
    }
    if (monthFilter) {
      const [yr, mo] = monthFilter.split('-').map(Number);
      list = list.filter(p => {
        const d = new Date(p.payment_date);
        return d.getFullYear() === yr && d.getMonth() + 1 === mo;
      });
    }
    return list;
  }, [payments, statusFilter, searchQuery, stageFilter, monthFilter, studentMap]);

  const totals = {
    verified: payments.filter(p => p.status === 'verified').reduce((s, p) => s + parseFloat(p.amount), 0),
    pending:  payments.filter(p => p.status === 'pending').length,
  };

  const monthlyRevenue = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const yr = d.getFullYear();
      const mo = d.getMonth();
      const label = d.toLocaleDateString('ar-EG', { month: 'short', year: '2-digit' });
      const amount = payments
        .filter(p => {
          const pd = new Date(p.payment_date);
          return p.status === 'verified' && pd.getFullYear() === yr && pd.getMonth() === mo;
        })
        .reduce((s, p) => s + parseFloat(p.amount || 0), 0);
      return { name: label, 'الإيرادات': amount };
    });
  }, [payments]);

  const availableMonths = useMemo(() => {
    const set = new Set();
    payments.filter(p => p.status === 'verified').forEach(p => {
      const d = new Date(p.payment_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      set.add(key);
    });
    return Array.from(set).sort().reverse();
  }, [payments]);

  const handlePrint = () => {
    const headers = ['الطالب', 'هاتف الطالب', 'الكورس', 'المبلغ', 'طريقة الدفع', 'المرجع', 'الحالة', 'التاريخ'];
    const data = filtered.map(p => [
      p.student_name || '—',
      p.student_phone || '—',
      p.course_name || '—',
      p.amount != null ? `${parseFloat(p.amount).toLocaleString()} ج` : '—',
      p.method ? (METHOD_LABELS[p.method] || p.method) : '—',
      p.reference_number || '—',
      STATUS_MAP[p.status]?.label || p.status,
      p.payment_date ? new Date(p.payment_date).toLocaleDateString('ar-EG') : '—',
    ]);
    const total = filtered.reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
    const verified = filtered.filter(p => p.status === 'verified' || p.status === 'confirmed');
    generatePDFReport('تقرير المدفوعات', headers, data, 'payments_report.pdf', {
      stats: [
        { label: 'إجمالي الدفعات', value: filtered.length, color: '#1e3a5f' },
        { label: 'مؤكدة', value: verified.length, color: '#16a34a' },
        { label: 'قيد الانتظار', value: filtered.filter(p => p.status === 'pending').length, color: '#d97706' },
        { label: 'إجمالي المبالغ', value: `${total.toLocaleString()} ج`, color: '#f97316' },
      ],
    });
  };

  const openVerify = (payment) => {
    setVerifyModal(payment);
    setVerifyForm({ method: payment.method || '', reference_number: payment.reference_number || '' });
  };

  const hasActiveFilters = searchQuery || stageFilter !== 'الكل' || monthFilter;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="text-xl sm:text-2xl font-black text-navy-600 flex items-center gap-2">
          <CreditCard className="w-6 h-6 sm:w-7 sm:h-7 text-orange-500 flex-shrink-0" /> المدفوعات
        </h1>
        <div className="page-header-actions">
          <button onClick={handlePrint} className="btn-secondary flex items-center gap-2">
            <Printer className="w-4 h-4" /> <span className="hidden sm:inline">طباعة</span>
          </button>
          <button onClick={() => setModal(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> تسجيل دفعة
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card bg-green-50 border border-green-200">
          <p className="text-green-800 text-sm font-bold mb-1">إجمالي المؤكد</p>
          <p className="text-2xl font-black text-green-800">{totals.verified.toLocaleString()} ج</p>
        </div>
        <div className="card bg-orange-50 border border-orange-200">
          <p className="text-orange-800 text-sm font-bold mb-1">قيد الانتظار</p>
          <p className="text-2xl font-black text-orange-800">{totals.pending} دفعة</p>
        </div>
        <div className="card">
          <p className="text-gray-600 text-sm font-bold mb-1">إجمالي الدفعات</p>
          <p className="text-2xl font-black text-navy-600">{payments.length}</p>
        </div>
        <div className="card">
          <p className="text-gray-600 text-sm font-bold mb-1">هذا الشهر</p>
          <p className="text-2xl font-black text-navy-600">
            {payments.filter(p => new Date(p.payment_date).getMonth() === new Date().getMonth()).length}
          </p>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-black text-gray-800 text-sm">الإيرادات الشهرية</h2>
            <p className="text-[11px] text-gray-400 font-medium">المدفوعات المؤكدة خلال آخر 6 أشهر</p>
          </div>
          <div className="mr-auto bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-1.5">
            <span className="text-emerald-700 font-black text-sm">{totals.verified.toLocaleString()} ج</span>
          </div>
        </div>
        <ReactECharts
          option={{
            tooltip: {
              trigger: 'axis',
              backgroundColor: '#fff',
              borderColor: '#f1f5f9',
              borderWidth: 1,
              textStyle: { fontFamily: 'Cairo', fontSize: 12, color: '#1e293b' },
              extraCssText: 'box-shadow:0 20px 60px rgba(0,0,0,0.12);border-radius:12px;padding:10px 14px',
              formatter: params => {
                const p = params[0];
                return `<div style="font-family:Cairo"><b style="color:#1e293b">${p.axisValue}</b><br/>${p.marker} الإيرادات: <b style="color:#10b981">${(p.value||0).toLocaleString()} جنيه</b></div>`;
              }
            },
            grid: { left: 10, right: 10, top: 10, bottom: 4, containLabel: true },
            xAxis: {
              type: 'category',
              data: monthlyRevenue.map(d => d.name),
              boundaryGap: false,
              axisLine: { show: false }, axisTick: { show: false },
              axisLabel: { fontFamily: 'Cairo', color: '#94a3b8', fontSize: 11 }
            },
            yAxis: {
              type: 'value',
              splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
              axisLabel: { fontFamily: 'Cairo', color: '#94a3b8', fontSize: 10, formatter: v => v > 0 ? v.toLocaleString() : '0' },
              axisLine: { show: false }, axisTick: { show: false }
            },
            series: [{
              name: 'الإيرادات', type: 'line',
              data: monthlyRevenue.map(d => d['الإيرادات']),
              smooth: true, symbol: 'circle', symbolSize: 8,
              lineStyle: { color: '#10b981', width: 2.5 },
              itemStyle: { color: '#10b981', borderColor: '#fff', borderWidth: 2.5 },
              areaStyle: { color: { type:'linear',x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:'rgba(16,185,129,0.25)'},{offset:1,color:'rgba(16,185,129,0.02)'}] } }
            }]
          }}
          style={{ height: '200px' }}
          notMerge
          opts={{ renderer: 'svg' }}
        />
      </div>

      {/* ── Filters ── */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-black text-gray-600">فلاتر البحث</span>
          {hasActiveFilters && (
            <button onClick={() => { setSearchQuery(''); setStageFilter('الكل'); setMonthFilter(''); }}
              className="mr-auto text-xs text-red-500 font-bold hover:underline">
              مسح الفلاتر
            </button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم أو الكورس أو رقم الوصل..."
            className="input-field pr-9"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">
              <GraduationCap className="w-3.5 h-3.5" /> فلتر بالسنة الدراسية
            </label>
            <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} className="input-field">
              {ACADEMIC_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> المدفوعات المؤكدة في شهر
            </label>
            <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="input-field">
              <option value="">— كل الأوقات —</option>
              {availableMonths.map(m => {
                const [yr, mo] = m.split('-').map(Number);
                return <option key={m} value={m}>{ARABIC_MONTHS[mo - 1]} {yr}</option>;
              })}
            </select>
          </div>
        </div>

        <div className="filter-scroll">
          {['all', 'pending', 'verified', 'rejected'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${statusFilter === s ? 'bg-navy-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'}`}>
              {s === 'all' ? `الكل (${payments.length})` : `${STATUS_MAP[s]?.label} (${payments.filter(p => p.status === s).length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full mobile-card-table min-w-0 sm:min-w-[700px]">
            <thead>
              <tr>
                <th className="table-header rounded-r-lg">الطالب</th>
                <th className="table-header hidden sm:table-cell">الكورس</th>
                <th className="table-header">المبلغ</th>
                <th className="table-header hidden md:table-cell">طريقة الدفع</th>
                <th className="table-header hidden lg:table-cell">رقم الوصل</th>
                <th className="table-header">الحالة</th>
                <th className="table-header rounded-l-lg">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => <tr key={i}><td colSpan={7}><div className="h-10 bg-gray-100 animate-pulse m-2 rounded" /></td></tr>)
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="table-cell text-center text-gray-600 py-12 col-span-all">
                  <CreditCard className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p className="font-medium">لا توجد دفعات تطابق الفلاتر المحددة</p>
                </td></tr>
              ) : filtered.map(p => (
                <tr key={p.id} className="table-row">
                  <td data-label="الطالب" className="table-cell">
                    <div>
                      <p className="font-bold text-navy-700">{p.student_name}</p>
                      {studentMap[p.student_id]?.academic_stage && (
                        <p className="text-[10px] text-gray-500 font-medium">{studentMap[p.student_id].academic_stage}</p>
                      )}
                    </div>
                  </td>
                  <td data-label="الكورس" className="table-cell text-gray-700 font-medium hidden sm:table-cell">{p.course_name || '—'}</td>
                  <td data-label="المبلغ" className="table-cell font-bold text-navy-700">{parseFloat(p.amount).toLocaleString()} ج</td>
                  <td data-label="طريقة الدفع" className="table-cell text-gray-700 hidden md:table-cell">{p.method ? (METHOD_LABELS[p.method] || p.method) : <span className="text-gray-400 text-xs">—</span>}</td>
                  <td data-label="رقم الوصل" className="table-cell font-mono text-xs text-gray-700 hidden lg:table-cell">{p.reference_number || '—'}</td>
                  <td data-label="الحالة" className="table-cell"><Badge variant={STATUS_MAP[p.status]?.variant || 'gray'}>{STATUS_MAP[p.status]?.label}</Badge></td>
                  <td data-label="إجراءات" className="table-cell">
                    {p.status === 'pending' && (
                      <div className="flex gap-1">
                        <button onClick={() => openVerify(p)}
                          className="p-1.5 text-green-700 hover:bg-green-50 rounded-lg" title="تأكيد الدفعة">
                          <CheckCircle className="w-4 h-4" />
                        </button>
                        <button onClick={() => verifyMut.mutate({ id: p.id, status: 'rejected' })}
                          className="p-1.5 text-red-700 hover:bg-red-50 rounded-lg" title="رفض">
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    {p.status !== 'pending' && (
                      <span className="text-xs text-gray-600 font-medium">{new Date(p.payment_date).toLocaleDateString('ar-EG')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500 font-medium">
            يُعرض {filtered.length} من {payments.length} دفعة
          </div>
        )}
      </div>

      {/* Add Payment Modal */}
      <Modal open={modal} onClose={() => { setModal(false); setForm(emptyForm); setFormErrors({}); }} title="تسجيل دفعة جديدة">
        <form onSubmit={(e) => {
          e.preventDefault();
          const errs = validatePaymentForm(form);
          if (hasErrors(errs)) { setFormErrors(errs); return; }
          setFormErrors({});
          createMut.mutate(form);
        }} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">الطالب *</label>
            <select value={form.student_id} onChange={e => { setForm({ ...form, student_id: e.target.value }); clearError('student_id'); }}
              className={`input-field ${formErrors.student_id ? 'border-red-400 focus:ring-red-300' : ''}`}>
              <option value="">اختر الطالب</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.name} {s.academic_stage ? `(${s.academic_stage})` : ''}</option>)}
            </select>
            <FieldError error={formErrors.student_id} />
          </div>
          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">الكورس (اختياري)</label>
            <select value={form.course_id} onChange={e => setForm({ ...form, course_id: e.target.value })} className="input-field">
              <option value="">—</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">المبلغ (جنيه) *</label>
            <input type="number" value={form.amount} onChange={e => { setForm({ ...form, amount: e.target.value }); clearError('amount'); }}
              className={`input-field ${formErrors.amount ? 'border-red-400 focus:ring-red-300' : ''}`} placeholder="0" min="0.01" step="0.01" />
            <FieldError error={formErrors.amount} />
          </div>
          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">ملاحظات</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input-field h-16 resize-none" />
          </div>
          <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            💡 طريقة الدفع ورقم الوصل سيتم إدخالهما عند تأكيد عملية السداد
          </p>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => { setModal(false); setForm(emptyForm); setFormErrors({}); }} className="flex-1 btn-secondary">إلغاء</button>
            <button type="submit" disabled={createMut.isPending} className="flex-1 btn-primary">تسجيل الدفعة</button>
          </div>
        </form>
      </Modal>

      {/* Verify Payment Modal */}
      {verifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-black text-navy-700 text-base">تأكيد سداد الدفعة</h3>
                <p className="text-xs text-gray-500">
                  {verifyModal.student_name} — {parseFloat(verifyModal.amount).toLocaleString()} جنيه
                  {verifyModal.course_name ? ` · ${verifyModal.course_name}` : ''}
                </p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <p className="text-xs text-amber-700 font-bold">
                {verifyModal.course_name
                  ? `✅ سيتم فتح كورس "${verifyModal.course_name}" للطالب تلقائياً عند التأكيد`
                  : 'سيتم تسجيل الدفعة كمؤكدة'}
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-bold text-navy-700 mb-1">طريقة الدفع <span className="text-gray-400 font-normal text-xs">(اختياري)</span></label>
                <select value={verifyForm.method} onChange={e => setVerifyForm({ ...verifyForm, method: e.target.value })} className="input-field">
                  <option value="">— غير محدد —</option>
                  <option value="Vodafone Cash">📱 فودافون كاش</option>
                  <option value="Instapay">💳 إنستاباي</option>
                  <option value="Cash">💵 كاش</option>
                  <option value="Bank Transfer">🏦 تحويل بنكي</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-navy-700 mb-1">رقم الوصل / المرجع <span className="text-gray-400 font-normal text-xs">(اختياري)</span></label>
                <input
                  value={verifyForm.reference_number}
                  onChange={e => setVerifyForm({ ...verifyForm, reference_number: e.target.value })}
                  className="input-field"
                  placeholder="أدخل رقم الوصل إن وجد"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setVerifyModal(null); setVerifyForm(emptyVerify); }}
                className="flex-1 btn-secondary">
                إلغاء
              </button>
              <button
                onClick={() => verifyMut.mutate({
                  id: verifyModal.id,
                  status: 'verified',
                  method: verifyForm.method || undefined,
                  reference_number: verifyForm.reference_number || undefined,
                })}
                disabled={verifyMut.isPending}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-4 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4" />
                {verifyMut.isPending ? 'جارٍ...' : 'تأكيد السداد'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
