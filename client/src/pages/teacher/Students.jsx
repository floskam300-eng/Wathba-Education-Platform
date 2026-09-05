import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Users, Plus, Pencil, Trash2, Search, Eye, EyeOff, Printer,
  GraduationCap, Upload, FileSpreadsheet, Download, X, Loader2,
  Copy, CheckCircle, AlertCircle, Ban, Lock, Unlock, ShieldAlert,
  Smartphone, Monitor, Tablet, RefreshCw, AlertTriangle,
  Layers, Trash, ArrowLeft, ShieldCheck, PlusCircle,
} from 'lucide-react';
// Removed static XLSX import to decrease initial chunk size
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Badge from '../../components/ui/Badge';
import StudentDevicesModal from '../../components/ui/StudentDevicesModal';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { generatePDFReport } from '../../lib/pdfReport';
import { validateStudentForm, hasErrors } from '../../lib/validation';
import useUrlState from '../../hooks/useUrlState';

function FieldError({ error }) {
  if (!error) return null;
  return (
    <p className="flex items-center gap-1 text-red-600 text-xs font-semibold mt-1">
      <AlertCircle className="w-3 h-3 flex-shrink-0" />{error}
    </p>
  );
}

const STAGES = [
  'الصف الأول الابتدائي',
  'الصف الثاني الابتدائي',
  'الصف الثالث الابتدائي',
  'الصف الرابع الابتدائي',
  'الصف الخامس الابتدائي',
  'الصف السادس الابتدائي',
  'الصف الأول الإعدادي',
  'الصف الثاني الإعدادي',
  'الصف الثالث الإعدادي',
  'الصف الأول الثانوي عام',
  'الصف الأول الثانوي بكالوريا',
  'الصف الثاني الثانوي عام',
  'الصف الثاني الثانوي بكالوريا',
  'الصف الثالث الثانوي',
];

function PasswordCell({ password, onCopy }) {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setVisible(false), 10000);
    return () => clearTimeout(t);
  }, [visible]);
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-sm font-bold text-green-700 tracking-widest">
        {visible ? password : '••••••'}
      </span>
      <button onClick={() => setVisible(v => !v)} className="text-gray-400 hover:text-navy-600 transition-colors" title={visible ? 'إخفاء' : 'إظهار'} aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>
        {visible ? <EyeOff className="w-3.5 h-3.5" aria-hidden="true" /> : <Eye className="w-3.5 h-3.5" aria-hidden="true" />}
      </button>
      {visible && (
        <button onClick={() => onCopy(password)} className="text-gray-400 hover:text-green-600 transition-colors" title="نسخ" aria-label="نسخ كلمة المرور">
          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

const emptyForm = { name: '', phone: '', parent_phone: '', academic_stage: '', gender: '', manualUsername: '', manualPassword: '' };

const STAGE_PREFIX_LABELS = {
  'الصف الأول الابتدائي': 'P1',
  'الصف الثاني الابتدائي': 'P2',
  'الصف الثالث الابتدائي': 'P3',
  'الصف الرابع الابتدائي': 'P4',
  'الصف الخامس الابتدائي': 'P5',
  'الصف السادس الابتدائي': 'P6',
  'الصف الأول الإعدادي': 'A',
  'الصف الثاني الإعدادي': 'B',
  'الصف الثالث الإعدادي': 'C',
  'الصف الأول الثانوي عام': 'HA',
  'الصف الأول الثانوي بكالوريا': 'HB',
  'الصف الثاني الثانوي عام': 'NA',
  'الصف الثاني الثانوي بكالوريا': 'NB',
  'الصف الثالث الثانوي': 'T',
};

// ── Device Alerts Panel ───────────────────────────────────────────────────────
function DeviceAlertsPanel({ canEdit }) {
  const qc = useQueryClient();
  const [devicesModal, setDevicesModal] = useState(null); // student object for viewing devices
  const [actionAlert, setActionAlert] = useState(null); // alert being actioned

  // Search & filter state
  const [alertSearch, setAlertSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');   // 'all' | 'pending' | 'resolved'
  const [stageFilterA, setStageFilterA] = useState('الكل');

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['device-alerts'],
    queryFn: () => api.get('/students/device-alerts').then(r => r.data),
    refetchInterval: 10000,
  });

  const { data: devices = [] } = useQuery({
    queryKey: ['student-devices', devicesModal?.student_id || devicesModal?.id],
    queryFn: () => api.get(`/students/${devicesModal?.student_id || devicesModal?.id}/devices`).then(r => r.data),
    enabled: !!devicesModal,
  });

  const { data: limitData } = useQuery({
    queryKey: ['teacher-device-limit'],
    queryFn: () => api.get('/students/device-limit').then(r => r.data),
  });
  const [selectedLimit, setSelectedLimit] = useState(null);
  const activeLimit = selectedLimit !== null ? selectedLimit : (limitData?.max_allowed_devices ?? 1);
  const isDirty = limitData?.max_allowed_devices !== undefined && activeLimit !== limitData.max_allowed_devices;

  const updateLimitMut = useMutation({
    mutationFn: (newLimit) => api.put('/students/device-limit', { max_allowed_devices: newLimit }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['teacher-device-limit'] });
      setSelectedLimit(res.data.max_allowed_devices);
      toast.success(`تم حفظ الحد الأقصى للأجهزة: ${res.data.max_allowed_devices} ${res.data.max_allowed_devices === 1 ? 'جهاز' : res.data.max_allowed_devices === 2 ? 'جهازان' : 'أجهزة'}`);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ أثناء تحديث الحد الأقصى للأجهزة'),
  });

  const actionMut = useMutation({
    mutationFn: ({ alertId, action }) => api.post(`/students/device-alerts/${alertId}/action`, { action }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['device-alerts'] });
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['student-devices'] });
      toast.success('تم تنفيذ الإجراء بنجاح');
      setActionAlert(null);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const deleteDeviceMut = useMutation({
    mutationFn: ({ studentId, deviceId }) => api.delete(`/students/${studentId}/devices/${deviceId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student-devices'] });
      qc.invalidateQueries({ queryKey: ['device-alerts'] });
      toast.success('تم حذف الجهاز بنجاح');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ أثناء حذف الجهاز'),
  });

  const pending = alerts.filter(a => a.status === 'pending');
  const resolved = alerts.filter(a => a.status !== 'pending');

  // Group pending alerts by student so the same student never appears twice.
  // Each group uses the latest alert's id (for the action) and collects all device names.
  const pendingByStudent = Object.values(
    pending.reduce((acc, alert) => {
      if (!acc[alert.student_id]) {
        acc[alert.student_id] = { ...alert, devices: [alert.device_name], count: 1 };
      } else {
        // Keep the latest alert's id and timestamp for the action
        if (new Date(alert.created_at) > new Date(acc[alert.student_id].created_at)) {
          const existing = acc[alert.student_id];
          acc[alert.student_id] = {
            ...alert,
            devices: [...existing.devices, alert.device_name].filter(Boolean),
            count: existing.count + 1,
          };
        } else {
          if (alert.device_name) acc[alert.student_id].devices.push(alert.device_name);
          acc[alert.student_id].count += 1;
        }
      }
      return acc;
    }, {})
  );

  // Apply search & stage filter to pending groups
  const q = alertSearch.trim().toLowerCase();
  const filteredPending = pendingByStudent.filter(a => {
    if (stageFilterA !== 'الكل' && a.academic_stage !== stageFilterA) return false;
    if (!q) return true;
    return (
      (a.student_name || '').toLowerCase().includes(q) ||
      (a.student_username || '').toLowerCase().includes(q) ||
      a.devices.some(d => (d || '').toLowerCase().includes(q)) ||
      (a.ip_address || '').includes(q)
    );
  });

  // Apply search & stage filter to resolved list
  const filteredResolved = resolved.filter(a => {
    if (stageFilterA !== 'الكل' && a.academic_stage !== stageFilterA) return false;
    if (!q) return true;
    return (
      (a.student_name || '').toLowerCase().includes(q) ||
      (a.student_username || '').toLowerCase().includes(q) ||
      (a.device_name || '').toLowerCase().includes(q) ||
      (a.ip_address || '').includes(q)
    );
  });

  // Available stages from actual data
  const availableStages = ['الكل', ...Array.from(new Set(alerts.map(a => a.academic_stage).filter(Boolean)))];

  const statusLabel = (s) => {
    if (s === 'pending') return { text: 'معلّق', cls: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300' };
    if (s === 'reactivated') return { text: 'تمت الموافقة والسماح', cls: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300' };
    if (s === 'dismissed') return { text: 'تم إبقاء القديم ورفض الجديد', cls: 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-[var(--dk-text-2)]' };
    return { text: s, cls: 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-[var(--dk-text-2)]' };
  };

  // Short hardware identifiers that survive random device_id changes — helps
  // the teacher recognize that several alerts come from the same machine.
  const gpuRenderer = (a) => {
    const r = a?.hardware_profile?.gpu?.renderer;
    return typeof r === 'string' && r.trim() ? r.trim().slice(0, 60) : '';
  };
  const hwTag = (a) => {
    const gpu = gpuRenderer(a);
    const hash = a?.hardware_hash ? `HW:${String(a.hardware_hash).slice(0, 10)}` : '';
    return [gpu, hash].filter(Boolean).join(' · ');
  };

  const hasActiveFilters = alertSearch.trim() || stageFilterA !== 'الكل' || statusFilter !== 'all';

  if (isLoading) return (
    <div className="card flex items-center justify-center py-16 bg-white dark:bg-[var(--dk-surface)] border border-gray-200/80 dark:border-[var(--dk-border)]">
      <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
    </div>
  );

  return (
    <div className="space-y-5 max-w-full overflow-hidden">
      {/* Device Limit Policy Box */}
      <div className="card !p-4 sm:!p-5 bg-gradient-to-br from-white to-orange-50/40 dark:from-[var(--dk-surface)] dark:to-[var(--dk-elevated)] border border-orange-200/80 dark:border-orange-500/20 rounded-2xl shadow-xs max-w-full overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-orange-100/80 dark:bg-orange-500/15 border border-orange-200 dark:border-orange-500/30 flex items-center justify-center flex-shrink-0 text-orange-600 dark:text-orange-400 mt-0.5">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-navy-800 dark:text-[var(--dk-text-1)] text-sm sm:text-base leading-tight break-words">
                  الحد الأقصى للأجهزة المسموح بها لكل طالب
                </h3>
                <span className="bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 text-[11px] sm:text-xs font-black px-2.5 py-0.5 rounded-full border border-orange-200 dark:border-orange-500/30 whitespace-nowrap flex-shrink-0">
                  الحالي: {limitData?.max_allowed_devices || 1} {(limitData?.max_allowed_devices || 1) === 1 ? 'جهاز واحد' : (limitData?.max_allowed_devices || 1) === 2 ? 'جهازان' : 'أجهزة'}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-[var(--dk-text-2)] mt-1.5 leading-relaxed break-words">
                حدد عدد الأجهزة التي يمكن لكل طالب تسجيل الدخول منها تلقائياً بدون حظر. إذا حاول الطالب تسجيل الدخول من جهاز جديد بعد استهلاك هذا العدد، سيتم حظره وإرسال تحذير أمني هنا للمراجعة والموافقة.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-shrink-0 w-full lg:w-auto">
            {/* Options pills: 1, 2, 3, 4, 5 */}
            <div className="grid grid-cols-5 sm:flex sm:items-center p-1 bg-gray-100/90 dark:bg-[var(--dk-elevated)] rounded-xl border border-gray-200/70 dark:border-[var(--dk-border-md)] gap-1 w-full sm:w-auto">
              {[1, 2, 3, 4, 5].map((num) => {
                const isSelected = activeLimit === num;
                return (
                  <button
                    key={num}
                    type="button"
                    disabled={!canEdit || updateLimitMut.isPending}
                    onClick={() => setSelectedLimit(num)}
                    className={`px-2 sm:px-3 py-1.5 rounded-lg text-xs font-black transition-all text-center flex items-center justify-center ${
                      isSelected
                        ? 'bg-white dark:bg-orange-600 text-orange-600 dark:text-white shadow-xs'
                        : 'text-gray-600 dark:text-[var(--dk-text-2)] hover:text-navy-800 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/5'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={`${num} ${num === 1 ? 'جهاز واحد' : num === 2 ? 'جهازان' : 'أجهزة'}`}
                  >
                    <span className="sm:hidden">{num}</span>
                    <span className="hidden sm:inline">{num === 1 ? '1 جهاز (افتراضي)' : `${num} أجهزة`}</span>
                  </button>
                );
              })}
            </div>

            {canEdit && (
              <button
                type="button"
                disabled={!isDirty || updateLimitMut.isPending}
                onClick={() => updateLimitMut.mutate(activeLimit)}
                className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs w-full sm:w-auto ${
                  isDirty
                    ? 'bg-orange-600 hover:bg-orange-700 text-white cursor-pointer ring-2 ring-orange-400/30'
                    : 'bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-500 cursor-not-allowed border border-gray-200 dark:border-white/10'
                }`}
              >
                {updateLimitMut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                <span>{updateLimitMut.isPending ? 'جارٍ الحفظ...' : 'حفظ التعديل'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="card !p-4 flex items-center gap-3 bg-white dark:bg-[var(--dk-surface)] border border-gray-200/80 dark:border-[var(--dk-border)]">
          <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-500/15 flex items-center justify-center flex-shrink-0">
            <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="text-2xl font-black text-red-600 dark:text-red-400 leading-none">{pendingByStudent.length}</p>
            <p className="text-xs text-gray-500 dark:text-[var(--dk-text-2)] font-semibold mt-1 truncate">محاولات دخول من جهاز جديد</p>
          </div>
        </div>
        <div className="card !p-4 flex items-center gap-3 bg-white dark:bg-[var(--dk-surface)] border border-gray-200/80 dark:border-[var(--dk-border)]">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-500/15 flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="text-2xl font-black text-blue-600 dark:text-blue-400 leading-none">
              {alerts.filter(a => a.is_suspended).length}
            </p>
            <p className="text-xs text-gray-500 dark:text-[var(--dk-text-2)] font-semibold mt-1 truncate">حسابات موقوفة يدوياً</p>
          </div>
        </div>
        <div className="card !p-4 flex items-center gap-3 bg-white dark:bg-[var(--dk-surface)] border border-gray-200/80 dark:border-[var(--dk-border)]">
          <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-500/15 flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="text-2xl font-black text-green-600 dark:text-green-400 leading-none">{resolved.length}</p>
            <p className="text-xs text-gray-500 dark:text-[var(--dk-text-2)] font-semibold mt-1 truncate">تم معالجتها</p>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      {alerts.length > 0 && (
        <div className="card !p-4 space-y-3 bg-white dark:bg-[var(--dk-surface)] border border-gray-200/80 dark:border-[var(--dk-border)]">
          {/* Search */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-[var(--dk-text-3)] pointer-events-none" />
            <input
              type="text"
              value={alertSearch}
              onChange={e => setAlertSearch(e.target.value)}
              placeholder="ابحث باسم الطالب أو اليوزر أو الجهاز أو IP..."
              className="w-full pr-9 pl-9 py-2.5 rounded-xl border border-gray-200 dark:border-[var(--dk-border-md)] bg-gray-50 dark:bg-[var(--dk-elevated)] text-gray-900 dark:text-[var(--dk-text-1)] text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-all placeholder:text-gray-400 dark:placeholder:text-[var(--dk-text-3)]"
              dir="rtl"
            />
            {alertSearch && (
              <button
                onClick={() => setAlertSearch('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter pills */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Status filter */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-[var(--dk-elevated)] rounded-xl p-1 border border-transparent dark:border-[var(--dk-border)]">
              {[
                { value: 'all', label: 'الكل' },
                { value: 'pending', label: 'معلّقة' },
                { value: 'resolved', label: 'تم معالجتها' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setStatusFilter(opt.value)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${statusFilter === opt.value
                    ? 'bg-white dark:bg-orange-600 text-orange-600 dark:text-white shadow-xs'
                    : 'text-gray-500 dark:text-[var(--dk-text-2)] hover:text-gray-700 dark:hover:text-white'
                    }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Stage filter */}
            {availableStages.length > 1 && (
              <select
                value={stageFilterA}
                onChange={e => setStageFilterA(e.target.value)}
                className="text-xs font-bold border border-gray-200 dark:border-[var(--dk-border-md)] rounded-xl px-3 py-1.5 bg-white dark:bg-[var(--dk-elevated)] text-gray-800 dark:text-[var(--dk-text-1)] focus:outline-none focus:ring-2 focus:ring-orange-400 cursor-pointer"
                dir="rtl"
              >
                {availableStages.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}

            {/* Clear all */}
            {hasActiveFilters && (
              <button
                onClick={() => { setAlertSearch(''); setStatusFilter('all'); setStageFilterA('الكل'); }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
              >
                <X className="w-3.5 h-3.5" /> مسح الفلاتر
              </button>
            )}
          </div>
        </div>
      )}

      {/* Pending Alerts */}
      {(statusFilter === 'all' || statusFilter === 'pending') && filteredPending.length > 0 && (
        <div className="card !p-0 overflow-hidden bg-white dark:bg-[var(--dk-surface)] border border-gray-200/80 dark:border-[var(--dk-border)]">
          <div className="p-3.5 sm:p-4 border-b border-red-100 dark:border-red-900/40 bg-red-50/90 dark:bg-red-950/30 flex items-center gap-2 rounded-t-2xl flex-wrap">
            <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
            <span className="font-black text-red-700 dark:text-red-300 text-sm">محاولات دخول من جهاز جديد</span>
            <span className="bg-red-600 text-white text-xs font-black px-2 py-0.5 rounded-full">{filteredPending.length}</span>
            {hasActiveFilters && filteredPending.length !== pendingByStudent.length && (
              <span className="text-red-400 dark:text-red-400/70 text-xs font-semibold">من أصل {pendingByStudent.length}</span>
            )}
          </div>
          <div className="divide-y divide-gray-100 dark:divide-[var(--dk-border)]">
            {filteredPending.map(alert => (
              <div key={alert.student_id} className="p-3.5 sm:p-4 hover:bg-orange-50/30 dark:hover:bg-white/[0.02] transition-colors">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3.5">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                    </div>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p className="font-black text-navy-700 dark:text-[var(--dk-text-1)] text-sm flex items-center flex-wrap gap-1.5 break-words">
                        <span>{alert.student_name}</span>
                        <span className="font-mono text-xs text-gray-500 dark:text-[var(--dk-text-3)]" dir="ltr">({alert.student_username})</span>
                        {alert.count > 1 && (
                          <span className="bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300 text-[10px] font-black px-1.5 py-0.5 rounded-full">
                            {alert.count} محاولة
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-[var(--dk-text-2)] mt-0.5">{alert.academic_stage}</p>
                      <div className="text-xs text-orange-700 dark:text-orange-400 font-semibold mt-1 flex items-center flex-wrap gap-1.5 break-words">
                        <span>
                          {alert.count > 1
                            ? `أجهزة جديدة: ${[...new Set(alert.devices)].join(' · ')}`
                            : `محاولة دخول من جهاز جديد: ${alert.device_name}`}
                        </span>
                        {typeof alert.similarity_score === 'number' && alert.similarity_score > 0 && (
                          <span className="bg-navy-100 dark:bg-navy-900/40 text-navy-800 dark:text-navy-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            تطابق عتادي: {alert.similarity_score}%
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium mt-0.5">
                        ✓ جهازه الأصلي لا يزال يعمل بشكل طبيعي
                      </p>
                      <p className="text-xs text-gray-400 dark:text-[var(--dk-text-3)] mt-0.5 flex items-center flex-wrap gap-2">
                        <span>{new Date(alert.created_at).toLocaleString('ar-EG')}</span>
                        {alert.ip_address && <span className="font-mono" dir="ltr">IP: {alert.ip_address}</span>}
                      </p>
                      {hwTag(alert) && (
                        <p className="text-[10px] font-mono text-gray-400 dark:text-[var(--dk-text-3)] mt-0.5 truncate max-w-full block" dir="ltr" title="بصمة العتاد — نفس القيمة تعني نفس الجهاز الفعلي">
                          {hwTag(alert)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 flex-shrink-0 w-full xl:w-auto pt-2.5 xl:pt-0 border-t xl:border-t-0 border-gray-100 dark:border-[var(--dk-border)]">
                    <button
                      onClick={() => setDevicesModal({ id: alert.student_id, student_id: alert.student_id, name: alert.student_name })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-500/20 border border-blue-100 dark:border-blue-500/20 transition-colors"
                      title="عرض الأجهزة المسجّلة للطالب حالياً"
                    >
                      <Smartphone className="w-3.5 h-3.5" /> الأجهزة
                    </button>
                    {canEdit && (
                      <>
                        <button
                          onClick={() => actionMut.mutate({ alertId: alert.id, action: 'add_new_device' })}
                          disabled={actionMut.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300 text-xs font-bold hover:bg-green-100 dark:hover:bg-green-500/20 border border-green-200 dark:border-green-500/30 transition-colors"
                          title="إضافة الجهاز الجديد كجهاز مصرّح به مع الاحتفاظ بالأجهزة القديمة"
                        >
                          <PlusCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-400" /> إضافة جهاز إضافي
                        </button>

                        <button
                          onClick={() => actionMut.mutate({ alertId: alert.id, action: 'switch_to_new_device' })}
                          disabled={actionMut.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300 text-xs font-bold hover:bg-orange-100 dark:hover:bg-orange-500/20 border border-orange-200 dark:border-orange-500/30 transition-colors"
                          title="مسح الأجهزة القديمة وتعيين الجهاز الجديد فقط كجهاز وحيد للطالب"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" /> استبدال بالجديد
                        </button>

                        <button
                          onClick={() => actionMut.mutate({ alertId: alert.id, action: 'keep_original_device' })}
                          disabled={actionMut.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-white/5 text-gray-700 dark:text-[var(--dk-text-2)] text-xs font-bold hover:bg-gray-100 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 transition-colors"
                          title="رفض محاولة الدخول من الجهاز الجديد وإبقاء الجهاز القديم فقط"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" /> إبقاء القديم فقط
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resolved History */}
      {(statusFilter === 'all' || statusFilter === 'resolved') && filteredResolved.length > 0 && (
        <div className="card !p-0 overflow-hidden bg-white dark:bg-[var(--dk-surface)] border border-gray-200/80 dark:border-[var(--dk-border)]">
          <div className="p-3.5 sm:p-4 border-b border-gray-100 dark:border-[var(--dk-border)] bg-gray-50/60 dark:bg-[var(--dk-elevated)]/40 flex items-center gap-2 rounded-t-2xl flex-wrap">
            <CheckCircle className="w-4 h-4 text-gray-500 dark:text-[var(--dk-text-3)] flex-shrink-0" />
            <span className="font-black text-gray-600 dark:text-[var(--dk-text-2)] text-sm">السجل السابق</span>
            <span className="bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-[var(--dk-text-2)] text-xs font-black px-2 py-0.5 rounded-full">{filteredResolved.length}</span>
            {hasActiveFilters && filteredResolved.length !== resolved.length && (
              <span className="text-gray-400 dark:text-[var(--dk-text-3)] text-xs font-semibold">من أصل {resolved.length}</span>
            )}
          </div>
          <div className="divide-y divide-gray-100 dark:divide-[var(--dk-border)]">
            {filteredResolved.slice(0, 20).map(alert => {
              const st = statusLabel(alert.status);
              return (
                <div key={alert.id} className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 opacity-80 hover:opacity-100 transition-opacity">
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <p className="font-bold text-navy-700 dark:text-[var(--dk-text-1)] text-sm flex items-center flex-wrap gap-1.5 break-words">
                      <span>{alert.student_name}</span>
                      <span className="font-mono text-xs text-gray-500 dark:text-[var(--dk-text-3)]" dir="ltr">({alert.student_username})</span>
                    </p>
                    <p className="text-xs text-gray-400 dark:text-[var(--dk-text-3)] mt-0.5 break-words">
                      {alert.academic_stage && <span className="ml-2 text-gray-500 dark:text-[var(--dk-text-2)]">{alert.academic_stage}</span>}
                      {new Date(alert.created_at).toLocaleString('ar-EG')} — {alert.device_name}
                    </p>
                    {hwTag(alert) && (
                      <p className="text-[10px] font-mono text-gray-400 dark:text-[var(--dk-text-3)] mt-0.5 truncate max-w-full block" dir="ltr" title="بصمة العتاد — نفس القيمة تعني نفس الجهاز الفعلي">
                        {hwTag(alert)}
                      </p>
                    )}
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 self-start sm:self-center ${st.cls}`}>{st.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No results from filters */}
      {alerts.length > 0 && hasActiveFilters && filteredPending.length === 0 && filteredResolved.length === 0 && (
        <div className="card flex flex-col items-center justify-center py-14 gap-3 bg-white dark:bg-[var(--dk-surface)] border border-gray-200/80 dark:border-[var(--dk-border)]">
          <div className="w-14 h-14 rounded-2xl bg-gray-50 dark:bg-white/5 flex items-center justify-center">
            <Search className="w-7 h-7 text-gray-400 dark:text-[var(--dk-text-3)]" />
          </div>
          <p className="font-bold text-gray-600 dark:text-[var(--dk-text-1)]">لا توجد نتائج مطابقة</p>
          <p className="text-xs text-gray-400 dark:text-[var(--dk-text-3)]">جرّب تغيير كلمة البحث أو الفلاتر</p>
          <button
            onClick={() => { setAlertSearch(''); setStatusFilter('all'); setStageFilterA('الكل'); }}
            className="mt-1 text-xs font-bold text-orange-600 dark:text-orange-400 hover:underline"
          >
            مسح الفلاتر
          </button>
        </div>
      )}

      {alerts.length === 0 && (
        <div className="card flex flex-col items-center justify-center py-16 gap-3 bg-white dark:bg-[var(--dk-surface)] border border-gray-200/80 dark:border-[var(--dk-border)]">
          <div className="w-14 h-14 rounded-2xl bg-green-50 dark:bg-green-500/10 flex items-center justify-center">
            <CheckCircle className="w-7 h-7 text-green-500 dark:text-green-400" />
          </div>
          <p className="font-bold text-gray-600 dark:text-[var(--dk-text-1)]">لا توجد تحذيرات حتى الآن</p>
          <p className="text-xs text-gray-400 dark:text-[var(--dk-text-3)]">ستظهر هنا أي محاولات تسجيل دخول مشبوهة</p>
        </div>
      )}

      {/* Devices Modal */}
      <Modal open={!!devicesModal} onClose={() => setDevicesModal(null)} title={`الأجهزة المسجّلة — ${devicesModal?.name}`}>
        <div className="space-y-3">
          {devices.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-[var(--dk-text-3)] py-6 text-sm">لم يُسجَّل أي جهاز بعد</p>
          ) : devices.map((d, i) => (
            <div key={d.id || d.device_id} className="flex items-center justify-between gap-3 p-3 bg-gray-50 dark:bg-white/[0.03] rounded-xl border border-gray-100 dark:border-white/10">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  {/iPad|Tab|Tablet/i.test(d.device_name || '') ? (
                    <Tablet className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  ) : /Android|iOS|iPhone|Samsung|Xiaomi|Redmi|POCO|Oppo|Realme|Infinix|Tecno|Vivo|Huawei|Honor|Pixel/i.test(d.device_name || '') ? (
                    <Smartphone className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <Monitor className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <p className="font-bold text-sm text-navy-700 dark:text-[var(--dk-text-1)] break-words">{d.device_name || 'جهاز غير معروف'}</p>
                  <p className="text-xs text-gray-500 dark:text-[var(--dk-text-2)] mt-0.5 break-words">
                    أول دخول: {new Date(d.first_seen).toLocaleDateString('ar-EG')}
                    &nbsp;·&nbsp;آخر دخول: {new Date(d.last_seen).toLocaleDateString('ar-EG')}
                  </p>
                  {d.ip_address && <p className="text-xs text-gray-400 dark:text-[var(--dk-text-3)] font-mono mt-0.5" dir="ltr">IP: {d.ip_address}</p>}
                  {hwTag(d) && (
                    <p className="text-[10px] font-mono text-gray-400 dark:text-[var(--dk-text-3)] mt-0.5 truncate max-w-full block" dir="ltr" title="بصمة العتاد">
                      {hwTag(d)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs bg-navy-100 dark:bg-white/10 text-navy-700 dark:text-[var(--dk-text-1)] font-black px-2 py-0.5 rounded-full">جهاز {i + 1}</span>
                {canEdit && (
                  <button
                    onClick={() => deleteDeviceMut.mutate({ studentId: devicesModal.student_id || devicesModal.id, deviceId: d.device_id || d.id })}
                    disabled={deleteDeviceMut.isPending}
                    className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20 hover:text-red-700 dark:hover:text-red-300 rounded-lg transition-colors"
                    title="حذف هذا الجهاز من حساب الطالب"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function TeacherStudents() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const baseRole = user?.role === 'assistant' ? 'assistant' : 'teacher';
  // Filter/search/page state lives in the URL so it survives back-navigation
  const [mainView, setMainView] = useUrlState('view', 'students');
  const [search, setSearch] = useUrlState('q', '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [stageFilter, setStageFilter] = useUrlState('stage', 'الكل');
  const [page, setPage] = useUrlState('page', 1, { parse: Number });
  const [totalCount, setTotalCount] = useState(0);
  const [reportLoading, setReportLoading] = useState(false);

  // Reset page to 1 only when search/stage actually change after mount —
  // never on mount, so a restored URL (?q=…&stage=…&page=3) keeps its page.
  const prevSearch = useRef(search);
  useEffect(() => {
    if (prevSearch.current === search) return;
    prevSearch.current = search;
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search, setPage]);

  const prevStage = useRef(stageFilter);
  useEffect(() => {
    if (prevStage.current === stageFilter) return;
    prevStage.current = stageFilter;
    setPage(1);
  }, [stageFilter, setPage]);

  // Instantly refresh alerts when switching to the alerts tab
  useEffect(() => {
    if (mainView === 'alerts') {
      qc.invalidateQueries({ queryKey: ['device-alerts'] });
    }
  }, [mainView, qc]);

  const [modal, setModal] = useState(false);
  const [editData, setEditData] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState(null);
  const [importModal, setImportModal] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [confirmFixedStage, setConfirmFixedStage] = useState(false);
  const [importResults, setImportResults] = useState(null); // { success, failed, errors } shown after a bulk import
  const importFileRef = useRef();
  const [previewUsername, setPreviewUsername] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [createdStudent, setCreatedStudent] = useState(null);
  const [credMode, setCredMode] = useState('auto'); // 'auto' | 'manual'

  // Suspend / unsuspend state
  const [suspendTarget, setSuspendTarget] = useState(null); // { id, name, is_suspended }

  // Devices-overview modal: shows registered devices + active sessions + recent
  // logins for a single student. View-only (no kick / suspend actions inside).
  const [devicesOverviewModal, setDevicesOverviewModal] = useState(null); // { id, name }

  // Bulk delete-by-stage modal state
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteStage, setBulkDeleteStage] = useState(stageFilter !== 'الكل' ? stageFilter : '');
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState('');

  // Active-student count per stage — drives the bulk-delete picker.
  // Query is declared before canDelete intentionally so the count list is
  // available as soon as the page mounts; the delete button itself is gated
  // by canDelete so non-permitted users can never trigger the modal.
  const { data: stageCountsData = [] } = useQuery({
    queryKey: ['stage-counts'],
    queryFn: () => api.get('/students/stage-counts').then(r => r.data.counts || []),
  });
  const stageCountFor = (stage) => stageCountsData.find(s => s.stage === stage)?.count ?? 0;

  // ── Import Model state ────────────────────────────────────────────────────
  const [modelModal, setModelModal] = useState(false);
  const [modelStep, setModelStep] = useState(1);
  const [modelHeaders, setModelHeaders] = useState([]);
  const [modelSample, setModelSample] = useState({});
  const [modelMappings, setModelMappings] = useState({});
  const [modelSaving, setModelSaving] = useState(false);
  const [deleteModelConfirm, setDeleteModelConfirm] = useState(false);
  const modelFileRef = useRef();

  const PAGE_SIZE = 20;

  const { data: students = [], isLoading, isFetching } = useQuery({
    queryKey: ['students', debouncedSearch, page, stageFilter],
    queryFn: () => api.get('/students', { params: { page, pageSize: PAGE_SIZE, ...(debouncedSearch ? { search: debouncedSearch } : {}), ...(stageFilter !== 'الكل' ? { stage: stageFilter } : {}) } }).then(r => { setTotalCount(r.data.total); return r.data.students || []; }),
    placeholderData: (prev) => prev,
  });

  // Pending alerts count for badge
  const { data: deviceAlerts = [] } = useQuery({
    queryKey: ['device-alerts'],
    queryFn: () => api.get('/students/device-alerts').then(r => r.data),
    refetchInterval: 15000,
  });
  // Count unique students with pending alerts (not raw alert rows) to avoid inflated badge numbers
  const pendingAlertsCount = new Set(deviceAlerts.filter(a => a.status === 'pending').map(a => a.student_id)).size;

  const createMut = useMutation({
    mutationFn: (data) => api.post('/students', data),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ['students'] }); qc.invalidateQueries({ queryKey: ['stage-counts'] }); setCreatedStudent(res.data); closeModal(); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/students/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['students'] }); qc.invalidateQueries({ queryKey: ['stage-counts'] }); toast.success('تم تحديث بيانات الطالب'); closeModal(); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/students/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['students'] }); qc.invalidateQueries({ queryKey: ['stage-counts'] }); toast.success('تم حذف الطالب'); setDeleteId(null); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  // Bulk delete every active student in one academic stage. Requires a stage
  // selected in the modal; the modal itself enforces type-to-confirm before
  // firing the mutation.
  const bulkDeleteMut = useMutation({
    mutationFn: (stage) => api.post('/students/bulk-delete-stage', { stage }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['stage-counts'] });
      qc.invalidateQueries({ queryKey: ['device-alerts'] });
      toast.success(`تم حذف ${res.data.count} طالب من مرحلة «${res.data.stage}»`);
      setBulkDeleteOpen(false);
      setBulkDeleteStage('');
      setBulkDeleteConfirm('');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ في الحذف'),
  });

  // ── Import Model query & mutations ────────────────────────────────────────
  const { data: importModelData } = useQuery({
    queryKey: ['import-model'],
    queryFn: () => api.get('/students/import-model').then(r => r.data.model),
    staleTime: 5 * 60 * 1000,
  });
  const activeModel = importModelData || null;

  const SYSTEM_FIELDS = [
    { key: 'name', label: 'اسم الطالب *', required: true },
    { key: 'phone', label: 'رقم الهاتف', required: false },
    { key: 'parent_phone', label: 'هاتف ولي الأمر', required: false },
    { key: 'username', label: 'اسم المستخدم', required: false },
    { key: 'password', label: 'كلمة المرور', required: false },
    { key: 'gender', label: 'الجنس', required: false },
    { key: 'academic_stage', label: 'المرحلة الدراسية', required: false },
  ];

  const FIELD_KEYWORDS = {
    name: ['اسم', 'name', 'student', 'طالب'],
    phone: ['هاتف', 'موبايل', 'phone', 'mobile', 'تليفون'],
    parent_phone: ['ولي', 'parent', 'أب', 'أم', 'guardian'],
    username: ['username', 'user', 'يوزر', 'مستخدم'],
    password: ['password', 'pass', 'كلمة', 'سر', 'باسورد', 'رمز', 'مرور', 'دخول', 'pin', 'code'],
    gender: ['جنس', 'gender', 'نوع'],
    academic_stage: ['مرحلة', 'stage', 'grade', 'صف', 'سنة'],
  };

  const autoDetectMappings = (headers) => {
    const result = {};
    for (const [field, kws] of Object.entries(FIELD_KEYWORDS)) {
      const match = headers.find(h => kws.some(kw => h.toLowerCase().includes(kw)));
      if (match) result[field] = match;
    }
    return result;
  };

  // Detect the real header row in sheets that have metadata rows at the top.
  // Returns { headers: string[], headerMap: {idx,name}[], dataRows: any[][] }
  // headerMap preserves the ORIGINAL column index so dataRowsToObjects can
  // correctly align data even when the sheet has empty/gap columns.
  const parseSheetSmart = (ws, XLSX) => {
    // ── Pass 1: detect header row on the UNMODIFIED sheet ─────────────────
    // Expanding merged cells BEFORE this step would inflate metadata rows
    // (school name, date banners, etc.) and cause the wrong row to be chosen.
    const rawFirst = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!rawFirst.length) return { headers: [], headerMap: [], dataRows: [] };

    const nonEmptyCount = (row) =>
      row.filter(cell => {
        if (cell === null || cell === undefined || cell === '') return false;
        const s = String(cell).trim();
        return s !== '' && !/^__EMPTY/.test(s);
      }).length;

    let headerRowIdx = 0;
    let maxCells = 0;
    for (let i = 0; i < Math.min(rawFirst.length, 25); i++) {
      const count = nonEmptyCount(rawFirst[i]);
      if (count > maxCells) {
        maxCells = count;
        headerRowIdx = i;
      }
    }

    // ── Pass 2: expand merged cells ONLY in data rows (> headerRowIdx) ────
    // XLSX stores the value only in the top-left cell of a merged range; the
    // rest are absent (read as ''). Expanding here lets the data rows carry
    // the real value without corrupting header-row detection above.
    if (ws['!merges']) {
      for (const merge of ws['!merges']) {
        if (merge.s.r <= headerRowIdx) continue; // skip header & metadata rows
        const topLeftAddr = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c });
        const sourceCell = ws[topLeftAddr];
        if (!sourceCell) continue;
        for (let r = merge.s.r; r <= merge.e.r; r++) {
          for (let c = merge.s.c; c <= merge.e.c; c++) {
            const addr = XLSX.utils.encode_cell({ r, c });
            if (!ws[addr]) ws[addr] = { ...sourceCell };
          }
        }
      }
    }

    // ── Re-read with merges expanded in the data area ─────────────────────
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (maxCells < 1) return { headers: [], headerMap: [], dataRows: [] };

    // Build headerMap retaining original column indices — critical for
    // correct alignment when the sheet has empty leading/gap columns.
    const headerMap = [];
    raw[headerRowIdx].forEach((h, i) => {
      const s = String(h ?? '').trim();
      if (s && !/^__EMPTY/.test(s)) headerMap.push({ idx: i, name: s });
    });

    if (!headerMap.length) return { headers: [], headerMap: [], dataRows: [] };

    const headers = headerMap.map(h => h.name);

    const dataRows = raw
      .slice(headerRowIdx + 1)
      .filter(row => row.some(cell => cell !== '' && cell !== null && cell !== undefined));

    return { headers, headerMap, dataRows };
  };

  // Convert raw 2-D data rows into array-of-objects.
  // Uses headerMap (with original column idx) so gap columns don't shift values.
  const dataRowsToObjects = (headerMap, dataRows) =>
    dataRows.map(row => {
      const obj = {};
      headerMap.forEach(({ idx, name }) => { if (name) obj[name] = row[idx] ?? ''; });
      return obj;
    });

  const handleModelFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const XLSX = await import('xlsx');
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        // Use ArrayBuffer (same as handleExcelFile) so both parse identically
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const { headers, headerMap, dataRows } = parseSheetSmart(ws, XLSX);
        if (!headers.length) { toast.error('لم يتم العثور على أعمدة صالحة في الملف'); return; }
        // Build sample using headerMap so column indices are correctly aligned
        const sampleRow = dataRows[0] || [];
        const sample = {};
        headerMap.forEach(({ idx, name }) => { sample[name] = String(sampleRow[idx] ?? ''); });
        setModelHeaders(headers);
        setModelSample(sample);
        setModelMappings(autoDetectMappings(headers));
        setModelStep(2);
      } catch { toast.error('تعذّر قراءة الملف'); }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSaveModel = async () => {
    if (!modelMappings.name) { toast.error('يجب ربط عمود اسم الطالب على الأقل'); return; }
    setModelSaving(true);
    try {
      await api.post('/students/import-model', { headers: modelHeaders, sample_row: modelSample, mappings: modelMappings });
      qc.invalidateQueries({ queryKey: ['import-model'] });
      toast.success('تم حفظ نموذج الاستيراد بنجاح');
      setModelModal(false);
      setModelStep(1);
    } catch (e) { toast.error(e.response?.data?.error || 'حدث خطأ في الحفظ'); }
    finally { setModelSaving(false); }
  };

  const handleDeleteModel = async () => {
    try {
      await api.delete('/students/import-model');
      qc.invalidateQueries({ queryKey: ['import-model'] });
      toast.success('تم حذف نموذج الاستيراد');
      setDeleteModelConfirm(false);
      setModelModal(false);
    } catch {
      toast.error('حدث خطأ في الحذف');
    }
  };

  const openModelModal = () => {
    setModelStep(1);
    setModelHeaders([]);
    setModelSample({});
    setModelMappings({});
    setModelModal(true);
  };

  // Fixed-value prefix used when a field is hardcoded (not mapped from a column)
  const FIXED_PREFIX = '__fixed__:';

  // Surfaced whenever the saved model pins academic_stage to a fixed value —
  // reusing that model for a different class/grade file would silently
  // mislabel every imported student with the stale stage, so the UI must warn.
  const fixedStageValue = activeModel?.mappings?.academic_stage?.startsWith(FIXED_PREFIX)
    ? activeModel.mappings.academic_stage.slice(FIXED_PREFIX.length)
    : null;

  const applyModelToRows = (rows, mappings) => {
    const normKey = (s) => String(s).trim().normalize('NFC');

    // Build normalized row lookup for a given row
    const buildNorm = (row) => {
      const n = {};
      for (const [k, v] of Object.entries(row)) n[normKey(k)] = v;
      return n;
    };

    const mapRow = (row) => {
      const normalizedRow = buildNorm(row);
      const mapped = {};
      for (const [field, col] of Object.entries(mappings)) {
        if (!col) continue;
        if (col.startsWith(FIXED_PREFIX)) {
          mapped[field] = col.slice(FIXED_PREFIX.length);
        } else {
          const exactVal = row[col];
          const normVal = normalizedRow[normKey(col)];
          const val = exactVal !== undefined ? exactVal : normVal;
          if (val !== undefined) mapped[field] = String(val ?? '').trim();
        }
      }
      return mapped;
    };

    // Map every row independently — do NOT carry values down from the row above.
    // True Excel-merged cells are already expanded onto every cell they cover by
    // parseSheetSmart() (via ws['!merges']) before we ever reach this function, so
    // a field that is still blank here is genuinely blank for THIS student, not a
    // merge continuation. An earlier version of this function filled such blanks
    // from the previous row's value, which silently copied one student's name,
    // phone, username or academic_stage onto the next unrelated student whenever
    // their sheet simply had an empty cell — misassigning academic stages and
    // causing duplicate-username failures that looked like students disappearing.
    const mapped = rows.map((row) => mapRow(row));
    const withName = mapped.filter(r => r.name && r.name.trim());
    return { rows: withName, skipped: mapped.length - withName.length };
  };

  const suspendMut = useMutation({
    mutationFn: ({ id, action }) => api.post(`/students/${id}/suspend`, { action }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['device-alerts'] });
      toast.success(vars.action === 'suspend' ? 'تم إيقاف الحساب' : 'تم إعادة تفعيل الحساب');
      setSuspendTarget(null);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const EXCLUDED_IMPORT_COLS = new Set([
    'اسم المستخدم', 'username', 'كلمة المرور', 'password',
    'اسم_المستخدم', 'كلمة_المرور',
  ]);

  const stripAutoFields = (rows) =>
    rows.map(row => {
      const clean = {};
      for (const [k, v] of Object.entries(row)) {
        if (!EXCLUDED_IMPORT_COLS.has(k.trim())) clean[k] = v;
      }
      return clean;
    });

  const handleExcelFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const XLSX = await import('xlsx');
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const { headers, headerMap, dataRows } = parseSheetSmart(ws, XLSX);
        if (!headers.length) { toast.error('لم يتم العثور على أعمدة صالحة في الملف'); return; }
        const rows = dataRowsToObjects(headerMap, dataRows);

        const notifySkipped = (skipped) => {
          if (skipped > 0) {
            toast(`تم تجاهل ${skipped} صف بلا اسم طالب — لن يُستورد لتفادي خلطه ببيانات طالب آخر`, { icon: 'ℹ️', duration: 6000 });
          }
        };

        if (activeModel?.mappings) {
          const { rows: mapped, skipped } = applyModelToRows(rows, activeModel.mappings);
          if (mapped.length) {
            notifySkipped(skipped);
            setImportRows(mapped);
          } else {
            // النموذج غير متطابق — نحاول الكشف التلقائي للأعمدة كبديل
            const autoMappings = autoDetectMappings(headers);
            if (autoMappings.name) {
              const { rows: autoMapped, skipped: autoSkipped } = applyModelToRows(rows, autoMappings);
              if (autoMapped.length) {
                toast(`تنبيه: أعمدة الملف تختلف عن النموذج المحفوظ — تم الاستيراد بالكشف التلقائي`, { icon: '⚠️', duration: 5000 });
                notifySkipped(autoSkipped);
                setImportRows(autoMapped);
              } else {
                toast.error('لم يُعثر على بيانات طلاب صالحة في الملف', { duration: 5000 });
                return;
              }
            } else {
              const expectedCols = Object.values(activeModel.mappings)
                .filter(v => v && !v.startsWith(FIXED_PREFIX))
                .slice(0, 3);
              toast.error(
                `أعمدة الملف لا تطابق النموذج المحفوظ (يتوقع: ${expectedCols.join('، ')})`,
                { duration: 6000 }
              );
              return;
            }
          }
        } else {
          // BUG-2 FIX: auto-detect & normalize columns to system field keys so server
          // always receives { name, phone, … } regardless of the file's original headers.
          const autoMappings = autoDetectMappings(headers);
          if (!autoMappings.name) {
            toast.error(
              'تعذّر تحديد عمود الاسم تلقائياً — أنشئ نموذج استيراد لربط الأعمدة',
              { duration: 5000 }
            );
            return;
          }
          const { rows: mapped, skipped } = applyModelToRows(rows, autoMappings);
          if (!mapped.length) { toast.error('لم يُعثر على بيانات طلاب في الملف'); return; }
          notifySkipped(skipped);
          setImportRows(mapped);
        }
        setConfirmFixedStage(false);
        setImportModal(true);
      } catch {
        toast.error('تعذّر قراءة الملف — تأكد أنه Excel أو CSV');
      }
    };
    reader.readAsArrayBuffer(file);
    if (importFileRef.current) importFileRef.current.value = '';
  };

  const normalizeGender = (raw) => {
    if (!raw) return '';
    const g = String(raw).trim().normalize('NFC').replace(/\s/g, '');
    if (/^(ذكر|male|m|boy)$/i.test(g)) return 'ذكر';
    if (/^(أنثى|انثى|أنثي|انثي|female|f|girl|انثي|أنثي)$/i.test(g)) return 'أنثى';
    return g; // pass through so server logs show the unrecognized value
  };

  const handleBulkImport = async () => {
    if (!importRows.length) return;
    setImportLoading(true);
    try {
      const normalized = importRows.map(r => ({
        ...r,
        gender: normalizeGender(r.gender),
      }));
      const res = await api.post('/students/bulk', { students: normalized });
      const { success, failed, errors, created } = res.data;
      if (success > 0) { qc.invalidateQueries({ queryKey: ['students'] }); qc.invalidateQueries({ queryKey: ['stage-counts'] }); toast.success(`تم إضافة ${success} طالب بنجاح${failed > 0 ? ` (${failed} فشل)` : ''}`); }
      if (failed > 0 && success === 0) toast.error(`فشل استيراد جميع الصفوف (${failed})`);
      // Show the FULL error list in a persistent panel instead of only the first
      // few toasts — with 100+ rows, silently-dropped students (e.g. duplicate
      // username) were easy to miss when only 3 error toasts flashed by.
      if (failed > 0) setImportResults({ success, failed, errors: errors || [] });
      if (created?.length) {
        const XLSX = await import('xlsx');
        const exportData = created.map(s => ({ 'الاسم': s.name, 'اسم المستخدم': s.username, 'كلمة المرور': s.generated_password }));
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'بيانات الدخول');
        XLSX.writeFile(wb, 'student_credentials.xlsx');
        toast.success('تم تنزيل بيانات الدخول المولّدة تلقائياً');
      }
      setImportModal(false);
      setImportRows([]);
    } catch (e) {
      toast.error(e.response?.data?.error || 'حدث خطأ في الاستيراد');
    } finally {
      setImportLoading(false);
    }
  };

  const sanitizeCell = (val) => {
    if (typeof val === 'string' && val.length > 0 && /^[=+\-@|\t\r]/.test(val)) return `'${val}`;
    return val;
  };

  const fetchAllStudents = () => api.get('/students', {
    params: {
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(stageFilter !== 'الكل' ? { stage: stageFilter } : {}),
    },
  }).then(r => r.data);

  const handleExportExcel = async () => {
    if (reportLoading) return;
    setReportLoading(true);
    try {
      const [XLSX, all] = await Promise.all([import('xlsx'), fetchAllStudents()]);
      const exportData = all.map(s => ({
        'الاسم': sanitizeCell(s.name),
        'اسم المستخدم': sanitizeCell(s.username || ''),
        'كلمة المرور': sanitizeCell(s.plain_password || ''),
        'الهاتف': sanitizeCell(s.phone || ''),
        'هاتف ولي الأمر': sanitizeCell(s.parent_phone || ''),
        'المرحلة': sanitizeCell(s.academic_stage || ''),
        'الجنس': sanitizeCell(s.gender || ''),
        'النقاط': s.points ?? 0,
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      ws['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 18 }, { wch: 28 }, { wch: 10 }, { wch: 8 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'الطلاب');
      XLSX.writeFile(wb, `students_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`تم تصدير ${exportData.length} طالب`);
    } catch {
      toast.error('فشل تصدير الطلاب');
    } finally {
      setReportLoading(false);
    }
  };

  const canAdd = user?.role === 'teacher' || user?.can_add_students;
  const canEdit = user?.role === 'teacher' || user?.can_edit_students;
  const canDelete = user?.role === 'teacher' || user?.can_delete_students;
  const canPrint = user?.role === 'teacher' || user?.can_view_analytics;

  const openAdd = () => { setEditData(null); setForm(emptyForm); setPreviewUsername(''); setFormErrors({}); setCredMode('auto'); setModal(true); };
  const openEdit = (s) => { setEditData(s); setForm({ ...s, username: s.username || '', password: '' }); setPreviewUsername(''); setFormErrors({}); setCredMode('auto'); setModal(true); };
  const closeModal = () => { setModal(false); setEditData(null); setForm(emptyForm); setPreviewUsername(''); setFormErrors({}); setCredMode('auto'); };

  // Auto-redirect to dedicated add page when navigating from Dashboard quick action
  useEffect(() => {
    if (location.state?.openAdd) {
      navigate(`/${baseRole}/students/add`, { replace: true });
    }
  }, [location.state, baseRole, navigate]);
  const copyToClipboard = (text) => { navigator.clipboard.writeText(text).then(() => toast.success('تم النسخ!')); };

  useEffect(() => {
    if (editData || !modal || credMode !== 'auto') { setPreviewUsername(''); return; }
    if (!form.academic_stage) { setPreviewUsername(''); return; }
    let cancelled = false;
    setPreviewLoading(true);
    api.get('/students/next-username', { params: { stage: form.academic_stage } })
      .then(r => { if (!cancelled) setPreviewUsername(r.data.username); })
      .catch(() => { if (!cancelled) { const p = STAGE_PREFIX_LABELS[form.academic_stage] || 'S'; setPreviewUsername(`${p}???`); } })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [form.academic_stage, editData, modal, credMode]);

  const [formErrors, setFormErrors] = useState({});
  const clearError = (field) => setFormErrors(prev => { const n = { ...prev }; delete n[field]; return n; });

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validateStudentForm(form, !!editData, credMode);
    if (hasErrors(errs)) { setFormErrors(errs); return; }
    setFormErrors({});
    if (editData) {
      updateMut.mutate({ id: editData.id, data: form });
    } else {
      // Always strip manual fields from base payload so stale values never leak
      const { manualUsername, manualPassword, ...baseForm } = form;
      const payload = credMode === 'manual'
        ? { ...baseForm, credMode: 'manual', manualUsername: manualUsername.trim(), manualPassword }
        : { ...baseForm, credMode: 'auto' };
      createMut.mutate(payload);
    }
  };

  const availableStages = React.useMemo(() => {
    const presentStages = stageCountsData.filter(sc => (sc.count ?? 0) > 0).map(sc => sc.stage);
    return ['الكل', ...presentStages];
  }, [stageCountsData]);

  const stageCounts = React.useMemo(() => {
    const acc = { 'الكل': stageCountsData.reduce((sum, sc) => sum + (sc.count ?? 0), 0) };
    for (const sc of stageCountsData) {
      acc[sc.stage] = sc.count ?? 0;
    }
    return acc;
  }, [stageCountsData]);

  const filtered = students;

  const handlePrint = async () => {
    if (reportLoading) return;
    setReportLoading(true);
    try {
      const all = await fetchAllStudents();
      const headers = ['الاسم', 'اسم المستخدم', 'كلمة المرور', 'الهاتف', 'هاتف ولي الأمر', 'المرحلة', 'الجنس', 'الكورسات المسجّلة', 'النقاط'];
      const data = all.map(s => [
        s.name || '—', s.username || '—', s.plain_password || '—', s.phone || '—', s.parent_phone || '—',
        s.academic_stage || '—', s.gender || '—',
        (s.enrolled_courses ?? 0).toString(), (s.points ?? 0).toString(),
      ]);
      generatePDFReport('تقرير الطلاب', headers, data, 'students_report.pdf', {
        stats: [
          { label: 'إجمالي الطلاب', value: all.length, color: '#1e3a5f' },
          { label: 'إجمالي النقاط', value: all.reduce((a, s) => a + (s.points ?? 0), 0), color: '#f97316' },
        ],
      });
    } catch {
      toast.error('فشل تحميل بيانات الطباعة');
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-navy-600 dark:text-[var(--dk-text-1)] flex items-center gap-2">
          <Users className="w-7 h-7 text-orange-500" /> الطلاب
          <span className="text-sm font-semibold text-gray-600 dark:text-[var(--dk-text-3)]">({totalCount})</span>
        </h1>
        <div className="flex gap-2 flex-wrap items-center">
          {canPrint && (
            <button onClick={handlePrint} disabled={reportLoading} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-[var(--dk-text-2)] text-sm font-semibold transition-all border border-transparent dark:border-[var(--dk-border)] disabled:opacity-50 disabled:cursor-not-allowed">
              <Printer className="w-4 h-4" /> طباعة
            </button>
          )}
          {canPrint && (
            <button onClick={handleExportExcel} disabled={reportLoading} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 text-sm font-semibold transition-all border border-transparent dark:border-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed">
              <Download className="w-4 h-4" /> تصدير
            </button>
          )}
          {canAdd && (
            <>
              <input ref={importFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelFile} />
              <input ref={modelFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleModelFile} />

              {/* Divider */}
              <div className="w-px h-6 bg-slate-200 dark:bg-[var(--dk-border)] mx-1" />

              <button onClick={openModelModal} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-navy-600 hover:bg-navy-700 text-white text-sm font-semibold transition-all relative shadow-sm">
                <Layers className="w-4 h-4" />
                نموذج
                {activeModel && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-orange-400 rounded-full border-2 border-white dark:border-[var(--dk-surface)] shadow" />
                )}
              </button>
              <button onClick={() => importFileRef.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-all shadow-sm">
                <FileSpreadsheet className="w-4 h-4" /> استيراد Excel
              </button>
              <button onClick={() => navigate(`/${baseRole}/students/add`)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold transition-all shadow-sm">
                <Plus className="w-4 h-4" /> إضافة طالب
              </button>
            </>
          )}
          {canDelete && (
            <button
              onClick={() => {
                setBulkDeleteStage(stageFilter !== 'الكل' ? stageFilter : '');
                setBulkDeleteConfirm('');
                setBulkDeleteOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-700 dark:text-red-300 text-sm font-semibold transition-all border border-red-200 dark:border-red-500/20"
              title="حذف كل طلاب مرحلة دراسية واحدة"
            >
              <Trash2 className="w-4 h-4" /> حذف دفعة
            </button>
          )}
        </div>
      </div>

      {/* Main view tabs: Students | Alerts */}
      <div className="flex gap-2">
        <button
          onClick={() => setMainView('students')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${mainView === 'students'
            ? 'bg-navy-600 dark:bg-orange-600 text-white shadow-sm'
            : 'bg-white dark:bg-[var(--dk-surface)] border border-slate-200 dark:border-[var(--dk-border-md)] text-gray-600 dark:text-[var(--dk-text-2)] hover:bg-gray-50 dark:hover:bg-[var(--dk-hover)] hover:text-navy-900 dark:hover:text-white'
            }`}
        >
          <Users className="w-4 h-4" /> قائمة الطلاب
        </button>
        <button
          onClick={() => setMainView('alerts')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all relative ${mainView === 'alerts'
            ? 'bg-red-600 text-white shadow-sm'
            : 'bg-white dark:bg-[var(--dk-surface)] border border-slate-200 dark:border-[var(--dk-border-md)] text-gray-600 dark:text-[var(--dk-text-2)] hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400'
            }`}
        >
          <ShieldAlert className="w-4 h-4" />
          التحذيرات الأمنية
          {pendingAlertsCount > 0 && (
            <span className={`text-xs font-black px-1.5 py-0.5 rounded-full ${mainView === 'alerts' ? 'bg-white text-red-600' : 'bg-red-600 text-white'
              }`}>
              {pendingAlertsCount}
            </span>
          )}
        </button>
      </div>

      {/* ─── Alerts view ─── */}
      {mainView === 'alerts' && (
        <DeviceAlertsPanel canEdit={canEdit} />
      )}

      {/* ─── Students view ─── */}
      {mainView === 'students' && (
        <>
          {/* Created Student Modal */}
          {createdStudent && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-lg font-black text-navy-700 mb-1">تم إضافة الطالب بنجاح!</h3>
                <p className="text-sm text-gray-500 mb-5">احتفظ بهذه البيانات وسلّمها للطالب</p>
                <div className="bg-gray-50 rounded-xl p-4 space-y-3 text-right mb-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">اسم الطالب</span>
                    <span className="font-bold text-navy-700 text-sm">{createdStudent.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">اسم المستخدم (الكود)</span>
                    <span className="font-mono font-black text-orange-600 tracking-widest text-sm">{createdStudent.username}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">كلمة المرور</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-green-700 tracking-widest text-xl">{createdStudent.generated_password}</span>
                      <button onClick={() => copyToClipboard(createdStudent.generated_password)} className="text-gray-400 hover:text-green-600 transition-colors">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
                <button onClick={() => setCreatedStudent(null)} className="btn-primary w-full">حسناً، تم الحفظ</button>
              </div>
            </div>
          )}

          {/* Import Modal */}
          {importModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                  <div>
                    <h2 className="font-black text-gray-800">معاينة الاستيراد</h2>
                    <p className="text-xs text-gray-500 mt-0.5">{importRows.length} صف سيتم استيراده</p>
                  </div>
                  <button onClick={() => { setImportModal(false); setImportRows([]); setConfirmFixedStage(false); }} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="overflow-auto flex-1 p-4">
                  {fixedStageValue && (
                    <div className="text-xs text-orange-800 mb-3 bg-orange-50 border border-orange-300 rounded-lg p-3 space-y-2">
                      <p className="font-bold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        النموذج المحفوظ يحدد المرحلة الدراسية بقيمة ثابتة: «{fixedStageValue}»
                      </p>
                      <p>سيتم تسجيل <strong>كل</strong> طلاب هذا الملف تحت هذه المرحلة، حتى لو كان الملف يحتوي على طلاب من مرحلة مختلفة. إذا كان هذا الملف لمرحلة أخرى، أغلق هذه النافذة وعدّل النموذج أولاً (زر "نموذج").</p>
                      <label className="flex items-center gap-2 font-bold cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={confirmFixedStage}
                          onChange={e => setConfirmFixedStage(e.target.checked)}
                          className="w-4 h-4 accent-orange-600"
                        />
                        أؤكد أن جميع طلاب هذا الملف فعلاً من مرحلة «{fixedStageValue}»
                      </label>
                    </div>
                  )}
                  {(() => {
                    const hasUsername = importRows.some(r => r.username?.trim());
                    const hasPassword = importRows.some(r => r.password?.trim());
                    const fromFile = hasUsername || hasPassword;
                    return (
                      <div className="text-xs text-gray-600 mb-3 bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1.5">
                        <p><strong>الأعمدة المدعومة:</strong> الاسم، الهاتف، هاتف ولي الأمر، المرحلة، الجنس</p>
                        {fromFile ? (
                          <p className="text-blue-700 font-semibold">
                            📋 <strong>بيانات الدخول مُستوردة من الملف</strong>
                            {hasUsername && hasPassword && ' — اسم المستخدم وكلمة المرور موجودان في الملف.'}
                            {hasUsername && !hasPassword && ' — اسم المستخدم من الملف، كلمة المرور ستُولَّد تلقائياً للطلاب الذين لا تمتلك لهم كلمة مرور.'}
                            {!hasUsername && hasPassword && ' — كلمة المرور من الملف، اسم المستخدم سيُولَّد تلقائياً.'}
                          </p>
                        ) : (
                          <p className="text-green-700 font-semibold">✅ <strong>الاسم فقط مطلوب</strong> — اسم المستخدم وكلمة المرور سيُولَّدان تلقائياً لكل طالب.</p>
                        )}
                        {!fromFile && (
                          <p className="text-amber-700">⬇️ بعد الاستيراد ستُنزَّل ملف Excel يحتوي على بيانات دخول كل طالب.</p>
                        )}
                      </div>
                    );
                  })()}
                  {/* BUG-4 FIX: map system field keys to readable Arabic labels */}
                  {(() => {
                    const FIELD_LABELS_MAP = {
                      name: 'اسم الطالب', phone: 'رقم الهاتف',
                      parent_phone: 'هاتف ولي الأمر', username: 'اسم المستخدم',
                      password: 'كلمة المرور', gender: 'الجنس', academic_stage: 'المرحلة الدراسية',
                    };
                    const cols = importRows[0] ? Object.keys(importRows[0]) : [];
                    return (
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-gray-50 sticky top-0">
                            {cols.map(k => (
                              <th key={k} className="border border-gray-200 px-2 py-1.5 text-right font-semibold text-gray-600">
                                {FIELD_LABELS_MAP[k] || k}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {/* Show every row (not just the first few) so mistakes like a wrong
                          fixed stage or a mis-mapped column are visible before confirming. */}
                          {importRows.map((row, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              {Object.values(row).map((v, j) => (
                                <td key={j} className="border border-gray-200 px-2 py-1.5 text-gray-700">{String(v)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
                <div className="p-4 border-t border-gray-100 flex gap-3 justify-end">
                  <button onClick={() => { setImportModal(false); setImportRows([]); setConfirmFixedStage(false); }} className="btn-secondary">إلغاء</button>
                  <button
                    onClick={handleBulkImport}
                    disabled={importLoading || importRows.length === 0 || (fixedStageValue && !confirmFixedStage)}
                    title={fixedStageValue && !confirmFixedStage ? 'أكّد أولاً أن الملف يخص هذه المرحلة' : undefined}
                    className="btn-primary flex items-center gap-2 disabled:opacity-50"
                  >
                    {importLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> جاري الاستيراد...</> : <><Upload className="w-4 h-4" /> استيراد {importRows.length} طالب</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Import Results Modal — full success/failure breakdown, not just a few toasts */}
          {importResults && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                  <h2 className="font-black text-gray-800">نتيجة الاستيراد</h2>
                  <button onClick={() => setImportResults(null)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="overflow-auto flex-1 p-5 space-y-4">
                  <div className="flex gap-3">
                    <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-green-700">{importResults.success}</p>
                      <p className="text-xs font-bold text-green-700">تمت إضافتهم</p>
                    </div>
                    <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-red-700">{importResults.failed}</p>
                      <p className="text-xs font-bold text-red-700">فشلوا</p>
                    </div>
                  </div>
                  {importResults.errors.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-gray-500 mb-2">تفاصيل الأخطاء ({importResults.errors.length}):</p>
                      <ul className="space-y-1.5">
                        {importResults.errors.map((e, i) => (
                          <li key={i} className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">{e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="p-4 border-t border-gray-100 flex justify-end">
                  <button onClick={() => setImportResults(null)} className="btn-primary">حسناً</button>
                </div>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="card !p-4">
            <div className="relative">
              {isFetching && !isLoading
                ? <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-500 animate-spin" />
                : <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              }
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو اسم المستخدم أو الهاتف..."
                className="input-field pr-10" />
            </div>
          </div>

          {/* Stage Filter Tabs */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <GraduationCap className="w-4 h-4 text-gray-500" />
              <span className="text-xs font-bold text-gray-500">تصفية حسب المرحلة الدراسية</span>
            </div>
            <div className="filter-scroll">
              {availableStages.map(stage => (
                <button
                  key={stage}
                  onClick={() => setStageFilter(stage)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 ${stageFilter === stage
                    ? 'bg-navy-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >
                  {stage}
                  {stageCounts[stage] > 0 && (
                    <span className={`text-xs rounded-full px-1.5 py-0.5 font-black ${stageFilter === stage ? 'bg-white/20 text-white' : 'bg-white text-gray-700'
                      }`}>
                      {stageCounts[stage]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="card !p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full mobile-card-table min-w-0 sm:min-w-[700px]">
                <thead>
                  <tr>
                    <th scope="col" className="table-header rounded-r-lg hidden sm:table-cell">#</th>
                    <th scope="col" className="table-header">الاسم</th>
                    <th scope="col" className="table-header">كود الطالب</th>
                    <th scope="col" className="table-header hidden md:table-cell">كلمة المرور</th>
                    <th scope="col" className="table-header hidden md:table-cell">الهاتف</th>
                    <th scope="col" className="table-header hidden lg:table-cell">رقم ولي الأمر</th>
                    <th scope="col" className="table-header hidden sm:table-cell">المرحلة</th>
                    <th scope="col" className="table-header hidden sm:table-cell">النقاط</th>
                    <th scope="col" className="table-header hidden lg:table-cell">الكورسات</th>
                    <th scope="col" className="table-header rounded-l-lg">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i}><td colSpan={10} className="td-cell"><div className="h-8 bg-gray-100 rounded animate-pulse" /></td></tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={10} className="td-cell text-center py-14 col-span-all">
                      <Users className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                      <p className="font-medium text-gray-500">
                        {search || stageFilter !== 'الكل' ? 'لا توجد نتائج مطابقة' : 'لا يوجد طلاب بعد'}
                      </p>
                    </td></tr>
                  ) : filtered.map((s, i) => (
                    <tr key={s.id} className={`table-row ${s.is_suspended ? 'bg-red-50/40' : ''}`}>
                      <td data-label="#" className="td-cell text-gray-600 font-semibold hidden sm:table-cell">{i + 1}</td>
                      <td data-label="الاسم" className="td-cell font-bold text-navy-600">
                        <div className="flex items-center gap-2">
                          {s.is_suspended && (
                            <span title="الحساب موقوف">
                              <Ban className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                            </span>
                          )}
                          {s.name}
                        </div>
                      </td>
                      <td data-label="كود الطالب" className="td-cell font-mono text-sm text-gray-700">{s.username}</td>
                      <td data-label="كلمة المرور" className="td-cell hidden md:table-cell">
                        {s.plain_password
                          ? <PasswordCell password={s.plain_password} onCopy={copyToClipboard} />
                          : <span className="text-gray-400 text-xs">—</span>}
                      </td>
                      <td data-label="الهاتف" className="td-cell text-gray-700 hidden md:table-cell">{s.phone || '—'}</td>
                      <td data-label="ولي الأمر" className="td-cell text-gray-700 hidden lg:table-cell">{s.parent_phone || '—'}</td>
                      <td data-label="المرحلة" className="td-cell hidden sm:table-cell">
                        <span className="text-xs bg-blue-50 text-blue-700 font-semibold px-2 py-1 rounded-full">
                          {s.academic_stage || '—'}
                        </span>
                      </td>
                      <td data-label="النقاط" className="td-cell hidden sm:table-cell"><span className="text-orange-700 font-bold">⭐ {s.points}</span></td>
                      <td data-label="الكورسات" className="td-cell hidden lg:table-cell"><Badge variant="info">{s.enrolled_courses || 0} كورس</Badge></td>
                      <td data-label="إجراءات" className="td-cell">
                        <div className="flex items-center gap-1.5">
                          {/* Devices overview (open sessions + registered devices + history) */}
                          {canPrint && (
                            <button
                              onClick={() => setDevicesOverviewModal({ id: s.id, name: s.name })}
                              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                              title="عرض الأجهزة والدخول"
                              aria-label={`عرض أجهزة ودخول الطالب ${s.name}`}
                            >
                              <Monitor className="w-4 h-4" aria-hidden="true" />
                            </button>
                          )}
                          {/* Suspend / Reactivate button (replaces old Eye/results button) */}
                          {canEdit && (
                            <button
                              onClick={() => setSuspendTarget(s)}
                              className={`p-1.5 rounded-lg transition-colors ${s.is_suspended
                                ? 'text-red-600 hover:bg-red-50'
                                : 'text-green-600 hover:bg-green-50'
                                }`}
                              title={s.is_suspended ? 'إعادة تفعيل الحساب' : 'إيقاف الحساب'}
                              aria-label={s.is_suspended ? `إعادة تفعيل حساب ${s.name}` : `إيقاف حساب ${s.name}`}
                            >
                              {s.is_suspended ? <Unlock className="w-4 h-4" aria-hidden="true" /> : <Lock className="w-4 h-4" aria-hidden="true" />}
                            </button>
                          )}
                          {canEdit && (
                            <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg text-navy-600 hover:bg-navy-50" aria-label={`تعديل بيانات ${s.name}`}><Pencil className="w-4 h-4" aria-hidden="true" /></button>
                          )}
                          {canDelete && (
                            <button onClick={() => setDeleteId(s.id)} className="p-1.5 rounded-lg text-red-700 hover:bg-red-50" aria-label={`حذف الطالب ${s.name}`}><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalCount > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-4 px-2">
              <p className="text-xs text-gray-500">
                الصفحة {page} من {Math.ceil(totalCount / PAGE_SIZE)} ({totalCount} طالب)
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="btn-secondary !py-1.5 !px-3 text-xs disabled:opacity-40"
                >
                  السابق
                </button>
                <span className="text-xs font-bold text-gray-600 min-w-[4rem] text-center">
                  {page} / {Math.ceil(totalCount / PAGE_SIZE)}
                </span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= Math.ceil(totalCount / PAGE_SIZE)}
                  className="btn-secondary !py-1.5 !px-3 text-xs disabled:opacity-40"
                >
                  التالي
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add/Edit Modal */}
      <Modal open={modal} onClose={closeModal} title={editData ? 'تعديل بيانات طالب' : 'إضافة طالب جديد'}>
        <form onSubmit={handleSubmit} className="space-y-4">

          {editData ? (
            /* ── Edit mode: editable student code / username ── */
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1">
                كود الطالب (اسم المستخدم) *
              </label>
              <input
                type="text"
                value={form.username || ''}
                onChange={e => { setForm({ ...form, username: e.target.value }); clearError('username'); }}
                className={`input-field font-mono font-bold text-navy-700 tracking-wider ${formErrors.username ? 'border-red-400 focus:ring-red-300' : ''}`}
                placeholder="مثال: HA001 أو أي كود تريده"
                dir="ltr"
                autoComplete="off"
              />
              <FieldError error={formErrors.username} />
              <p className="text-xs text-gray-400 mt-1">كود الطالب هو اسم المستخدم الذي يستخدمه الطالب لتسجيل الدخول</p>
            </div>
          ) : (
            <>
              {/* ── Mode toggle ── */}
              <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => { setCredMode('auto'); setFormErrors(prev => { const n = { ...prev }; delete n.manualUsername; delete n.manualPassword; return n; }); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold transition-colors ${credMode === 'auto'
                    ? 'bg-orange-500 text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                >
                  <RefreshCw className="w-4 h-4" /> توليد تلقائي
                </button>
                <button
                  type="button"
                  onClick={() => setCredMode('manual')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold transition-colors border-r border-gray-200 ${credMode === 'manual'
                    ? 'bg-navy-600 text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                >
                  <Pencil className="w-4 h-4" /> إدخال يدوي
                </button>
              </div>

              {/* ── Auto mode: preview username + password note ── */}
              {credMode === 'auto' && (
                <>
                  <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
                    <span className="text-xs font-bold text-orange-600">الكود التلقائي</span>
                    {form.academic_stage ? (
                      previewLoading ? (
                        <span className="font-mono text-sm text-orange-400 animate-pulse">جاري التوليد...</span>
                      ) : (
                        <span className="font-mono font-black text-orange-700 tracking-widest text-lg">{previewUsername}</span>
                      )
                    ) : (
                      <span className="text-xs text-orange-400">اختر المرحلة الدراسية أولاً لظهور الكود</span>
                    )}
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-orange-500 flex-shrink-0" />
                    <p className="text-sm text-orange-700">سيتم توليد كلمة مرور من 6 أرقام تلقائياً وعرضها بعد الحفظ</p>
                  </div>
                </>
              )}

              {/* ── Manual mode: username + password inputs ── */}
              {credMode === 'manual' && (
                <div className="space-y-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-blue-700 flex items-center gap-1.5">
                    <Pencil className="w-3.5 h-3.5" /> أدخل بيانات الدخول يدوياً
                  </p>
                  <div>
                    <label className="block text-sm font-bold text-navy-700 mb-1">اسم المستخدم (الكود) *</label>
                    <input
                      value={form.manualUsername}
                      onChange={e => { setForm({ ...form, manualUsername: e.target.value }); clearError('manualUsername'); }}
                      className={`input-field ${formErrors.manualUsername ? 'border-red-400 focus:ring-red-300' : ''}`}
                      placeholder="مثال: H050 أو أي كود تريده"
                      dir="ltr"
                      autoComplete="off"
                    />
                    <FieldError error={formErrors.manualUsername} />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-navy-700 mb-1">كلمة المرور *</label>
                    <input
                      type="text"
                      value={form.manualPassword}
                      onChange={e => { setForm({ ...form, manualPassword: e.target.value }); clearError('manualPassword'); }}
                      className={`input-field ${formErrors.manualPassword ? 'border-red-400 focus:ring-red-300' : ''}`}
                      placeholder="5 أحرف أو أرقام على الأقل"
                      dir="ltr"
                      autoComplete="new-password"
                    />
                    <FieldError error={formErrors.manualPassword} />
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Name ── */}
          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">الاسم *</label>
            <input value={form.name} onChange={e => { setForm({ ...form, name: e.target.value }); clearError('name'); }}
              className={`input-field ${formErrors.name ? 'border-red-400 focus:ring-red-300' : ''}`} placeholder="الاسم الكامل" />
            <FieldError error={formErrors.name} />
          </div>

          {/* ── Password (edit only) ── */}
          {editData && (
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1">كلمة المرور (اتركها فارغة للإبقاء)</label>
              <input type="password" value={form.password || ''} onChange={e => { setForm({ ...form, password: e.target.value }); clearError('password'); }}
                className={`input-field ${formErrors.password ? 'border-red-400 focus:ring-red-300' : ''}`} placeholder="••••••" dir="ltr" />
              <FieldError error={formErrors.password} />
            </div>
          )}

          {/* ── Stage + Gender ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1">المرحلة الدراسية</label>
              <select value={form.academic_stage || ''} onChange={e => setForm({ ...form, academic_stage: e.target.value })} className="input-field">
                <option value="">اختر المرحلة</option>
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1">الجنس</label>
              <select value={form.gender || ''} onChange={e => setForm({ ...form, gender: e.target.value })} className="input-field">
                <option value="">اختر</option>
                <option value="ذكر">ذكر</option>
                <option value="أنثى">أنثى</option>
              </select>
            </div>
          </div>

          {/* ── Phones ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1">هاتف الطالب</label>
              <input value={form.phone || ''} onChange={e => { setForm({ ...form, phone: e.target.value }); clearError('phone'); }}
                className={`input-field ${formErrors.phone ? 'border-red-400 focus:ring-red-300' : ''}`} placeholder="01xxxxxxxxx" dir="ltr" />
              <FieldError error={formErrors.phone} />
            </div>
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1">هاتف ولي الأمر</label>
              <input value={form.parent_phone || ''} onChange={e => { setForm({ ...form, parent_phone: e.target.value }); clearError('parent_phone'); }}
                className={`input-field ${formErrors.parent_phone ? 'border-red-400 focus:ring-red-300' : ''}`} placeholder="01xxxxxxxxx" dir="ltr" />
              <FieldError error={formErrors.parent_phone} />
            </div>
          </div>

          {/* ── Actions ── */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={closeModal} className="flex-1 btn-secondary">إلغاء</button>
            <button type="submit" disabled={createMut.isPending || updateMut.isPending} className="flex-1 btn-primary">
              {(createMut.isPending || updateMut.isPending) ? 'جاري الحفظ...' : editData ? 'حفظ التعديلات' : 'إضافة الطالب'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Suspend / Reactivate Dialog */}
      {suspendTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 ${suspendTarget.is_suspended ? 'bg-green-100' : 'bg-red-100'
              }`}>
              {suspendTarget.is_suspended
                ? <Unlock className="w-6 h-6 text-green-600" />
                : <Lock className="w-6 h-6 text-red-600" />
              }
            </div>
            <h3 className="text-lg font-black text-center text-navy-700 mb-1">
              {suspendTarget.is_suspended ? 'إعادة تفعيل الحساب' : 'إيقاف الحساب'}
            </h3>
            <p className="text-sm text-gray-500 text-center mb-5">
              الطالب: <strong>{suspendTarget.name}</strong>
            </p>

            {suspendTarget.is_suspended ? (
              <div className="space-y-2">
                <button
                  onClick={() => suspendMut.mutate({ id: suspendTarget.id, action: 'reactivate' })}
                  disabled={suspendMut.isPending}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Unlock className="w-4 h-4" /> إعادة التفعيل (مع الأجهزة المسجّلة)
                </button>
                <button
                  onClick={() => suspendMut.mutate({ id: suspendTarget.id, action: 'reactivate_reset_devices' })}
                  disabled={suspendMut.isPending}
                  className="w-full border-2 border-green-300 text-green-700 hover:bg-green-50 font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw className="w-4 h-4" /> إعادة التفعيل + مسح الأجهزة
                </button>
              </div>
            ) : (
              <button
                onClick={() => suspendMut.mutate({ id: suspendTarget.id, action: 'suspend' })}
                disabled={suspendMut.isPending}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" /> إيقاف الحساب
              </button>
            )}

            <button onClick={() => setSuspendTarget(null)} className="w-full mt-2 btn-secondary">إلغاء</button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteMut.mutate(deleteId)}
        title="حذف الطالب"
        message="سيتم إخفاء الطالب من القوائم ولن يتمكن من تسجيل الدخول. بياناته ونتائجه محفوظة في قاعدة البيانات ويمكن استرجاعها عند الحاجة."
        danger
      />

      {/* ── Import Model Modal ── */}
      {modelModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={() => setModelModal(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-navy-600 flex items-center justify-center">
                  <Layers className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="font-black text-navy-700 text-lg leading-tight">نموذج الاستيراد</h2>
                  <p className="text-xs text-gray-500">
                    {modelStep === 1 ? 'ارفع ملف من برنامجك لتعيين الأعمدة' : 'اربط أعمدة الملف بحقول الطلاب'}
                  </p>
                </div>
              </div>
              <button onClick={() => setModelModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Active model banner */}
            {activeModel && modelStep === 1 && (
              <div className="mx-6 mt-4 p-3 rounded-xl bg-orange-50 border border-orange-200 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-orange-800 font-semibold">
                    <CheckCircle className="w-4 h-4 text-orange-500 flex-shrink-0" />
                    يوجد نموذج محفوظ بـ {activeModel.headers?.length || 0} عمود
                  </div>
                  <button
                    onClick={() => { setModelModal(false); setDeleteModelConfirm(true); }}
                    className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-bold transition-colors"
                  >
                    <Trash className="w-3.5 h-3.5" /> حذف
                  </button>
                </div>
                {fixedStageValue && (
                  <p className="flex items-start gap-1.5 text-xs text-red-700 font-bold bg-red-50 border border-red-200 rounded-lg p-2">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    تنبيه: هذا النموذج يسجّل كل الطلاب المستوردين تحت مرحلة ثابتة «{fixedStageValue}» — لا تستخدمه لملف يخص مرحلة أخرى إلا بعد تعديله.
                  </p>
                )}
              </div>
            )}

            {/* Step 1 — Upload */}
            {modelStep === 1 && (
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div
                  onClick={() => modelFileRef.current?.click()}
                  className="border-2 border-dashed border-navy-300 rounded-2xl p-10 text-center cursor-pointer hover:bg-navy-50 transition-colors"
                >
                  <Upload className="w-10 h-10 text-navy-400 mx-auto mb-3" />
                  <p className="font-bold text-navy-700 text-base mb-1">اسحب ملف أو اضغط للاختيار</p>
                  <p className="text-sm text-gray-500">Excel أو CSV من برنامجك الخارجي</p>
                </div>

                {activeModel && (
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <p className="text-xs font-bold text-gray-500 mb-2">التعيينات الحالية:</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(activeModel.mappings || {}).map(([field, col]) => {
                        const sysField = SYSTEM_FIELDS.find(f => f.key === field);
                        return (
                          <span key={field} className="inline-flex items-center gap-1 bg-white border border-navy-200 rounded-lg px-2 py-1 text-xs font-semibold text-navy-700">
                            <span className="text-gray-500">{col}</span>
                            <ArrowLeft className="w-3 h-3 text-orange-400" />
                            <span>{sysField?.label || field}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                <p className="text-xs text-center text-gray-400">
                  ارفع ملف نموذجي من برنامجك (سطر واحد يكفي) لتعيين الأعمدة مرة واحدة فقط
                </p>
              </div>
            )}

            {/* Step 2 — Map columns */}
            {modelStep === 2 && (
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                {/* Sample preview */}
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                  <p className="text-xs font-bold text-gray-500 mb-2">معاينة أول صف:</p>
                  <div className="flex flex-wrap gap-2">
                    {modelHeaders.map(h => (
                      <span key={h} className="inline-flex flex-col items-start bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs">
                        <span className="font-bold text-navy-700">{h}</span>
                        <span className="text-gray-400 truncate max-w-[10rem]">{String(modelSample[h] || '—').slice(0, 30)}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Mappings */}
                <div className="space-y-2">
                  {SYSTEM_FIELDS.map(({ key, label, required }) => {
                    const currentVal = modelMappings[key] || '';
                    const isFixed = currentVal.startsWith(FIXED_PREFIX);
                    const fixedStage = isFixed ? currentVal.slice(FIXED_PREFIX.length) : '';

                    return (
                      <div key={key} className="flex flex-col gap-2 bg-gray-50 rounded-xl p-3 border border-gray-100">
                        {/* Top row: label + (for academic_stage: mode toggle) */}
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm font-bold ${required ? 'text-navy-700' : 'text-gray-600'}`}>
                            {label}
                            {required && <span className="text-orange-500 text-xs mr-1">(مطلوب)</span>}
                          </span>

                          {/* Mode toggle — only for academic_stage */}
                          {key === 'academic_stage' && (
                            <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs font-semibold">
                              <button
                                type="button"
                                onClick={() => setModelMappings(prev => ({ ...prev, academic_stage: '' }))}
                                className={`px-2.5 py-1 transition-colors ${!isFixed ? 'bg-navy-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                              >
                                من الملف
                              </button>
                              <button
                                type="button"
                                onClick={() => setModelMappings(prev => ({ ...prev, academic_stage: FIXED_PREFIX + (STAGES[0]) }))}
                                className={`px-2.5 py-1 transition-colors ${isFixed ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                              >
                                قيمة ثابتة
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Input row */}
                        <div className="flex items-center gap-2">
                          <ArrowLeft className="w-4 h-4 text-orange-400 rotate-180 flex-shrink-0" />

                          {key === 'academic_stage' && isFixed ? (
                            /* Fixed stage selector */
                            <select
                              value={fixedStage}
                              onChange={e => setModelMappings(prev => ({ ...prev, academic_stage: FIXED_PREFIX + e.target.value }))}
                              className="flex-1 text-sm border border-orange-300 rounded-lg px-2 py-1.5 bg-orange-50 focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none font-semibold text-orange-800"
                            >
                              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          ) : (
                            /* Column mapping selector */
                            <select
                              value={isFixed ? '' : currentVal}
                              onChange={e => setModelMappings(prev => ({ ...prev, [key]: e.target.value }))}
                              className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-navy-300 focus:border-navy-400 outline-none"
                            >
                              <option value="">— لا يوجد —</option>
                              {modelHeaders.map(h => (
                                <option key={h} value={h}>{h}{modelSample[h] ? ` (${String(modelSample[h]).slice(0, 20)})` : ''}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
              {modelStep === 2 ? (
                <>
                  <button
                    onClick={() => setModelStep(1)}
                    className="btn-secondary flex items-center gap-2 text-sm"
                  >
                    <ArrowLeft className="w-4 h-4" /> رجوع
                  </button>
                  <button
                    onClick={handleSaveModel}
                    disabled={!modelMappings.name || modelSaving}
                    className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
                  >
                    {modelSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    حفظ النموذج
                  </button>
                </>
              ) : (
                <button onClick={() => setModelModal(false)} className="btn-secondary text-sm mr-auto">
                  إغلاق
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete model confirm — placed AFTER model modal so it renders on top (same z-50) ── */}
      <ConfirmDialog
        open={deleteModelConfirm}
        onClose={() => setDeleteModelConfirm(false)}
        onConfirm={handleDeleteModel}
        title="حذف نموذج الاستيراد"
        message="سيتم حذف التعيينات المحفوظة. ستحتاج لرفع ملف نموذجي مرة أخرى لإعادة الضبط."
        danger
      />

      {/* ── Student devices overview: registered devices + active sessions + recent logins ── */}
      {devicesOverviewModal && (
        <StudentDevicesModal
          studentId={devicesOverviewModal.id}
          studentName={devicesOverviewModal.name}
          onClose={() => setDevicesOverviewModal(null)}
          canEdit={canEdit}
        />
      )}

      {/* Bulk delete by stage — soft delete every active student in a single stage */}
      {bulkDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <h2 className="font-black text-gray-800">حذف دفعة (مرحلة دراسية كاملة)</h2>
              </div>
              <button
                onClick={() => setBulkDeleteOpen(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-800 leading-relaxed">
                <p className="font-bold mb-1">⚠️ تحذير — هذا الإجراء لا يمكن التراجع عنه</p>
                <p>سيتم حذف <span className="font-black">جميع</span> طلاب المرحلة المختارة نهائياً (مع كل بياناتهم: كورسات، امتحانات، أجهزة). المرحلة فقط هي التي تُحذف — باقي المراحل تظل كما هي.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">المرحلة الدراسية</label>
                <select
                  value={bulkDeleteStage}
                  onChange={e => { setBulkDeleteStage(e.target.value); setBulkDeleteConfirm(''); }}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
                  dir="rtl"
                >
                  <option value="">— اختر المرحلة —</option>
                  {stageCountsData.length === 0 && (
                    <option value="" disabled>لا توجد مراحل فيها طلاب حالياً</option>
                  )}
                  {stageCountsData.map(s => (
                    <option key={s.stage} value={s.stage}>
                      {s.stage}  ({s.count} طالب)
                    </option>
                  ))}
                </select>
                {bulkDeleteStage && (
                  <p className="mt-2 text-xs font-bold text-red-700">
                    سيتم حذف {stageCountFor(bulkDeleteStage)} طالب من مرحلة «{bulkDeleteStage}»
                  </p>
                )}
              </div>

              {bulkDeleteStage && stageCountFor(bulkDeleteStage) > 0 && (
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">
                    للتأكيد: اكتب اسم المرحلة <span className="font-mono text-red-600">"{bulkDeleteStage}"</span> بالضبط
                  </label>
                  <input
                    type="text"
                    value={bulkDeleteConfirm}
                    onChange={e => setBulkDeleteConfirm(e.target.value)}
                    placeholder={bulkDeleteStage}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
                    dir="rtl"
                  />
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 flex gap-3 justify-end">
              <button
                onClick={() => setBulkDeleteOpen(false)}
                className="btn-secondary"
              >
                إلغاء
              </button>
              <button
                onClick={() => bulkDeleteMut.mutate(bulkDeleteStage)}
                disabled={
                  bulkDeleteMut.isPending
                  || !bulkDeleteStage
                  || stageCountFor(bulkDeleteStage) === 0
                  || bulkDeleteConfirm.trim() !== bulkDeleteStage
                }
                className="inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-4 py-2.5 rounded-lg transition-all"
              >
                {bulkDeleteMut.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> جاري الحذف...</>
                  : <><Trash2 className="w-4 h-4" /> حذف {stageCountFor(bulkDeleteStage)} طالب نهائياً</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
