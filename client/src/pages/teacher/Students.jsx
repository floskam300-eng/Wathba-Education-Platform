import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import {
  Users, Plus, Pencil, Trash2, Search, Eye, EyeOff, Printer,
  GraduationCap, Upload, FileSpreadsheet, Download, X, Loader2,
  Copy, CheckCircle, AlertCircle, Ban, Lock, Unlock, ShieldAlert,
  Smartphone, Monitor, RefreshCw, AlertTriangle, ChevronRight,
  Layers, Trash, ArrowLeft,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Badge from '../../components/ui/Badge';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { generatePDFReport } from '../../lib/pdfReport';
import { validateStudentForm, hasErrors } from '../../lib/validation';

function FieldError({ error }) {
  if (!error) return null;
  return (
    <p className="flex items-center gap-1 text-red-600 text-xs font-semibold mt-1">
      <AlertCircle className="w-3 h-3 flex-shrink-0" />{error}
    </p>
  );
}

const STAGES = ['الصف الأول الثانوي', 'الصف الثاني الثانوي', 'الصف الثالث الثانوي', 'الصف الأول الإعدادي', 'الصف الثاني الإعدادي', 'الصف الثالث الإعدادي'];

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
      <button onClick={() => setVisible(v => !v)} className="text-gray-400 hover:text-navy-600 transition-colors" title={visible ? 'إخفاء' : 'إظهار'}>
        {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
      {visible && (
        <button onClick={() => onCopy(password)} className="text-gray-400 hover:text-green-600 transition-colors" title="نسخ">
          <Copy className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

const emptyForm = { name: '', phone: '', parent_phone: '', academic_stage: '', gender: '' };

const STAGE_PREFIX_LABELS = {
  'الصف الأول الثانوي':   'H',
  'الصف الثاني الثانوي':  'N',
  'الصف الثالث الثانوي':  'T',
  'الصف الأول الإعدادي':  'A',
  'الصف الثاني الإعدادي': 'B',
  'الصف الثالث الإعدادي': 'C',
};

// ── Device Alerts Panel ───────────────────────────────────────────────────────
function DeviceAlertsPanel({ canEdit }) {
  const qc = useQueryClient();
  const [devicesModal, setDevicesModal] = useState(null); // student object for viewing devices
  const [actionAlert, setActionAlert]   = useState(null); // alert being actioned

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['device-alerts'],
    queryFn: () => api.get('/students/device-alerts').then(r => r.data),
    refetchInterval: 30000,
  });

  const { data: devices = [] } = useQuery({
    queryKey: ['student-devices', devicesModal?.student_id || devicesModal?.id],
    queryFn: () => api.get(`/students/${devicesModal?.student_id || devicesModal?.id}/devices`).then(r => r.data),
    enabled: !!devicesModal,
  });

  const actionMut = useMutation({
    mutationFn: ({ alertId, action }) => api.post(`/students/device-alerts/${alertId}/action`, { action }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['device-alerts'] });
      qc.invalidateQueries({ queryKey: ['students'] });
      toast.success('تم تنفيذ الإجراء بنجاح');
      setActionAlert(null);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const pending   = alerts.filter(a => a.status === 'pending');
  const resolved  = alerts.filter(a => a.status !== 'pending');

  const statusLabel = (s) => {
    if (s === 'pending')     return { text: 'معلّق', cls: 'bg-red-100 text-red-700' };
    if (s === 'reactivated') return { text: 'تم السماح بجهاز جديد', cls: 'bg-green-100 text-green-700' };
    if (s === 'dismissed')   return { text: 'تم التجاهل', cls: 'bg-gray-100 text-gray-600' };
    return { text: s, cls: 'bg-gray-100 text-gray-600' };
  };

  if (isLoading) return (
    <div className="card flex items-center justify-center py-16">
      <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card !p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="text-2xl font-black text-red-600">{pending.length}</p>
            <p className="text-xs text-gray-500 font-semibold">محاولات دخول من جهاز جديد</p>
          </div>
        </div>
        <div className="card !p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-black text-blue-600">
              {alerts.filter(a => a.is_suspended).length}
            </p>
            <p className="text-xs text-gray-500 font-semibold">حسابات موقوفة يدوياً</p>
          </div>
        </div>
        <div className="card !p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-black text-green-600">{resolved.length}</p>
            <p className="text-xs text-gray-500 font-semibold">تم معالجتها</p>
          </div>
        </div>
      </div>

      {/* Pending Alerts */}
      {pending.length > 0 && (
        <div className="card !p-0 overflow-hidden">
          <div className="p-4 border-b border-red-100 bg-red-50 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-600" />
            <span className="font-black text-red-700 text-sm">محاولات دخول من جهاز جديد</span>
            <span className="bg-red-600 text-white text-xs font-black px-2 py-0.5 rounded-full">{pending.length}</span>
          </div>
          <div className="divide-y divide-gray-100">
            {pending.map(alert => (
              <div key={alert.id} className="p-4 hover:bg-orange-50/30 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                    </div>
                    <div>
                      <p className="font-black text-navy-700 text-sm">
                        {alert.student_name}
                        <span className="font-mono text-xs text-gray-500 mr-2">({alert.student_username})</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{alert.academic_stage}</p>
                      <p className="text-xs text-orange-700 font-semibold mt-1">
                        محاولة دخول من جهاز جديد: {alert.device_name}
                      </p>
                      <p className="text-[10px] text-blue-600 font-medium mt-0.5">
                        ✓ جهازه الأصلي لا يزال يعمل بشكل طبيعي
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(alert.created_at).toLocaleString('ar-EG')}
                        {alert.ip_address && <span className="mr-2 font-mono">IP: {alert.ip_address}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 flex-shrink-0">
                    <button
                      onClick={() => setDevicesModal({ id: alert.student_id, student_id: alert.student_id, name: alert.student_name })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition-colors"
                    >
                      <Smartphone className="w-3.5 h-3.5" /> الأجهزة
                    </button>
                    {canEdit && (
                      <>
                        <button
                          onClick={() => actionMut.mutate({ alertId: alert.id, action: 'reset_devices' })}
                          disabled={actionMut.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 text-xs font-bold hover:bg-orange-100 transition-colors"
                          title="مسح الجهاز المسجّل والسماح للطالب بتسجيل جهاز جديد"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> السماح بجهاز جديد
                        </button>
                        <button
                          onClick={() => actionMut.mutate({ alertId: alert.id, action: 'dismiss' })}
                          disabled={actionMut.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 text-gray-600 text-xs font-bold hover:bg-gray-100 transition-colors"
                          title="تجاهل التنبيه مع إبقاء الجهاز الأصلي مسجّلاً"
                        >
                          <X className="w-3.5 h-3.5" /> تجاهل
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
      {resolved.length > 0 && (
        <div className="card !p-0 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-gray-500" />
            <span className="font-black text-gray-600 text-sm">السجل السابق</span>
          </div>
          <div className="divide-y divide-gray-100">
            {resolved.slice(0, 20).map(alert => {
              const st = statusLabel(alert.status);
              return (
                <div key={alert.id} className="p-4 flex items-center justify-between gap-3 opacity-75">
                  <div>
                    <p className="font-bold text-navy-700 text-sm">{alert.student_name}
                      <span className="font-mono text-xs text-gray-500 mr-2">({alert.student_username})</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{new Date(alert.created_at).toLocaleString('ar-EG')} — {alert.device_name}</p>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${st.cls}`}>{st.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {alerts.length === 0 && (
        <div className="card flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center">
            <CheckCircle className="w-7 h-7 text-green-500" />
          </div>
          <p className="font-bold text-gray-600">لا توجد تحذيرات حتى الآن</p>
          <p className="text-xs text-gray-400">ستظهر هنا أي محاولات تسجيل دخول مشبوهة</p>
        </div>
      )}

      {/* Devices Modal */}
      <Modal open={!!devicesModal} onClose={() => setDevicesModal(null)} title={`الأجهزة المسجّلة — ${devicesModal?.name}`}>
        <div className="space-y-3">
          {devices.length === 0 ? (
            <p className="text-center text-gray-500 py-6 text-sm">لم يُسجَّل أي جهاز بعد</p>
          ) : devices.map((d, i) => (
            <div key={d.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                {d.device_name?.includes('Android') || d.device_name?.includes('iOS') || d.device_name?.includes('iPhone')
                  ? <Smartphone className="w-4 h-4 text-blue-600" />
                  : <Monitor className="w-4 h-4 text-blue-600" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-navy-700">{d.device_name || 'جهاز غير معروف'}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  أول دخول: {new Date(d.first_seen).toLocaleDateString('ar-EG')}
                  &nbsp;·&nbsp;آخر دخول: {new Date(d.last_seen).toLocaleDateString('ar-EG')}
                </p>
                {d.ip_address && <p className="text-xs text-gray-400 font-mono mt-0.5">IP: {d.ip_address}</p>}
              </div>
              <span className="text-xs bg-navy-100 text-navy-700 font-black px-2 py-0.5 rounded-full flex-shrink-0">جهاز {i + 1}</span>
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
  const [mainView, setMainView]           = useState('students'); // 'students' | 'alerts'
  const [search, setSearch]               = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [stageFilter, setStageFilter]     = useState('الكل');
  const [page, setPage]                   = useState(1);
  const [totalCount, setTotalCount]       = useState(0);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [stageFilter]);

  const [modal, setModal]               = useState(false);
  const [editData, setEditData]         = useState(null);
  const [form, setForm]                 = useState(emptyForm);
  const [deleteId, setDeleteId]         = useState(null);
  const [importModal, setImportModal]   = useState(false);
  const [importRows, setImportRows]     = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const importFileRef                   = useRef();
  const [previewUsername, setPreviewUsername] = useState('');
  const [previewLoading, setPreviewLoading]   = useState(false);
  const [createdStudent, setCreatedStudent]   = useState(null);

  // Suspend / unsuspend state
  const [suspendTarget, setSuspendTarget] = useState(null); // { id, name, is_suspended }

  // ── Import Model state ────────────────────────────────────────────────────
  const [modelModal, setModelModal]             = useState(false);
  const [modelStep, setModelStep]               = useState(1);
  const [modelHeaders, setModelHeaders]         = useState([]);
  const [modelSample, setModelSample]           = useState({});
  const [modelMappings, setModelMappings]       = useState({});
  const [modelSaving, setModelSaving]           = useState(false);
  const [deleteModelConfirm, setDeleteModelConfirm] = useState(false);
  const modelFileRef                            = useRef();

  const PAGE_SIZE = 20;

  const { data: students = [], isLoading, isFetching } = useQuery({
    queryKey: ['students', debouncedSearch, page],
    queryFn: () => api.get('/students', { params: { page, pageSize: PAGE_SIZE, ...(debouncedSearch ? { search: debouncedSearch } : {}) } }).then(r => { setTotalCount(r.data.total); return r.data.students || []; }),
    placeholderData: (prev) => prev,
  });

  // Pending alerts count for badge
  const { data: deviceAlerts = [] } = useQuery({
    queryKey: ['device-alerts'],
    queryFn: () => api.get('/students/device-alerts').then(r => r.data),
    refetchInterval: 60000,
  });
  const pendingAlertsCount = deviceAlerts.filter(a => a.status === 'pending').length;

  const createMut = useMutation({
    mutationFn: (data) => api.post('/students', data),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ['students'] }); setCreatedStudent(res.data); closeModal(); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/students/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['students'] }); toast.success('تم تحديث بيانات الطالب'); closeModal(); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/students/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['students'] }); toast.success('تم حذف الطالب'); setDeleteId(null); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  // ── Import Model query & mutations ────────────────────────────────────────
  const { data: importModelData } = useQuery({
    queryKey: ['import-model'],
    queryFn: () => api.get('/students/import-model').then(r => r.data.model),
    staleTime: 5 * 60 * 1000,
  });
  const activeModel = importModelData || null;

  const SYSTEM_FIELDS = [
    { key: 'name',           label: 'اسم الطالب *',     required: true },
    { key: 'phone',          label: 'رقم الهاتف',        required: false },
    { key: 'parent_phone',   label: 'هاتف ولي الأمر',   required: false },
    { key: 'username',       label: 'اسم المستخدم',      required: false },
    { key: 'password',       label: 'كلمة المرور',       required: false },
    { key: 'gender',         label: 'الجنس',             required: false },
    { key: 'academic_stage', label: 'المرحلة الدراسية',  required: false },
  ];

  const FIELD_KEYWORDS = {
    name:           ['اسم', 'name', 'student', 'طالب'],
    phone:          ['هاتف', 'موبايل', 'phone', 'mobile', 'تليفون'],
    parent_phone:   ['ولي', 'parent', 'أب', 'أم', 'guardian'],
    username:       ['username', 'user', 'يوزر', 'مستخدم'],
    password:       ['password', 'pass', 'كلمة', 'سر', 'باسورد', 'رمز', 'مرور', 'دخول', 'pin', 'code'],
    gender:         ['جنس', 'gender', 'نوع'],
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
  const parseSheetSmart = (ws) => {
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
        const sourceCell  = ws[topLeftAddr];
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

  const handleModelFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        // Use ArrayBuffer (same as handleExcelFile) so both parse identically
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const { headers, headerMap, dataRows } = parseSheetSmart(ws);
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
      qc.invalidateQueries(['import-model']);
      toast.success('تم حفظ نموذج الاستيراد بنجاح');
      setModelModal(false);
      setModelStep(1);
    } catch (e) { toast.error(e.response?.data?.error || 'حدث خطأ في الحفظ'); }
    finally { setModelSaving(false); }
  };

  const handleDeleteModel = async () => {
    try {
      await api.delete('/students/import-model');
      qc.invalidateQueries(['import-model']);
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
          const normVal  = normalizedRow[normKey(col)];
          const val      = exactVal !== undefined ? exactVal : normVal;
          if (val !== undefined) mapped[field] = String(val ?? '').trim();
        }
      }
      return mapped;
    };

    // First pass: map all rows
    const mapped = rows.map((row) => mapRow(row));

    // Fill-down: Excel merged cells only store the value in the first cell of the merge.
    // XLSX returns '' for the subsequent merged cells. We carry forward the last seen
    // non-empty value for ALL identifying fields so every sub-row gets the student's info.
    const FILL_FIELDS = ['name', 'phone', 'parent_phone', 'username', 'password', 'gender', 'academic_stage'];
    const lastSeen = {};
    const filled = mapped.map(row => {
      const out = { ...row };
      for (const f of FILL_FIELDS) {
        if (out[f] && out[f].trim()) {
          lastSeen[f] = out[f].trim();  // update carry
        } else if (lastSeen[f]) {
          out[f] = lastSeen[f];         // fill from carry
        }
      }
      return out;
    });

    const result = filled.filter(r => r.name && r.name.trim());
    return result;
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

  const handleExcelFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const { headers, headerMap, dataRows } = parseSheetSmart(ws);
        if (!headers.length) { toast.error('لم يتم العثور على أعمدة صالحة في الملف'); return; }
        const rows = dataRowsToObjects(headerMap, dataRows);

        if (activeModel?.mappings) {
          const mapped = applyModelToRows(rows, activeModel.mappings);
          if (mapped.length) {
            setImportRows(mapped);
          } else {
            // النموذج غير متطابق — نحاول الكشف التلقائي للأعمدة كبديل
            const autoMappings = autoDetectMappings(headers);
            if (autoMappings.name) {
              const autoMapped = applyModelToRows(rows, autoMappings);
              if (autoMapped.length) {
                toast(`تنبيه: أعمدة الملف تختلف عن النموذج المحفوظ — تم الاستيراد بالكشف التلقائي`, { icon: '⚠️', duration: 5000 });
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
          const mapped = applyModelToRows(rows, autoMappings);
          if (!mapped.length) { toast.error('لم يُعثر على بيانات طلاب في الملف'); return; }
          setImportRows(mapped);
        }
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
    if (/^(ذكر|male|m|boy)$/i.test(g))                       return 'ذكر';
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
      if (success > 0) { qc.invalidateQueries({ queryKey: ['students'] }); toast.success(`تم إضافة ${success} طالب بنجاح${failed > 0 ? ` (${failed} فشل)` : ''}`); }
      if (failed > 0 && success === 0) toast.error(`فشل استيراد جميع الصفوف (${failed})`);
      if (errors?.length) errors.slice(0, 3).forEach(e => toast.error(e, { duration: 4000 }));
      if (created?.length) {
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

  const handleExportExcel = () => {
    const exportData = filtered.map(s => ({
      'الاسم': sanitizeCell(s.name),
      'الهاتف': sanitizeCell(s.phone || ''),
      'هاتف ولي الأمر': sanitizeCell(s.parent_phone || ''),
      'المرحلة': sanitizeCell(s.academic_stage || ''),
      'الجنس': sanitizeCell(s.gender || ''),
      'النقاط': s.points ?? 0,
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 18 }, { wch: 28 }, { wch: 10 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الطلاب');
    XLSX.writeFile(wb, `students_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`تم تصدير ${exportData.length} طالب`);
  };

  const canAdd    = user?.role === 'teacher' || user?.can_add_students;
  const canEdit   = user?.role === 'teacher' || user?.can_edit_students;
  const canDelete = user?.role === 'teacher' || user?.can_delete_students;
  const canPrint  = user?.role === 'teacher' || user?.can_view_analytics;

  const openAdd  = () => { setEditData(null); setForm(emptyForm); setPreviewUsername(''); setFormErrors({}); setModal(true); };
  const openEdit = (s) => { setEditData(s); setForm({ ...s, password: '' }); setPreviewUsername(''); setFormErrors({}); setModal(true); };
  const closeModal = () => { setModal(false); setEditData(null); setForm(emptyForm); setPreviewUsername(''); setFormErrors({}); };

  // Auto-open add modal when navigating from Dashboard quick action
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (location.state?.openAdd) {
      openAdd();
      // Clear navigation state so re-renders don't re-trigger the modal
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []); // intentionally empty — runs once on mount to consume route state
  const copyToClipboard = (text) => { navigator.clipboard.writeText(text).then(() => toast.success('تم النسخ!')); };

  useEffect(() => {
    if (editData || !modal) return;
    if (!form.academic_stage) { setPreviewUsername(''); return; }
    let cancelled = false;
    setPreviewLoading(true);
    api.get('/students/next-username', { params: { stage: form.academic_stage } })
      .then(r => { if (!cancelled) setPreviewUsername(r.data.username); })
      .catch(() => { if (!cancelled) { const p = STAGE_PREFIX_LABELS[form.academic_stage] || 'S'; setPreviewUsername(`${p}???`); } })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [form.academic_stage, editData, modal]);

  const [formErrors, setFormErrors] = useState({});
  const clearError = (field) => setFormErrors(prev => { const n = { ...prev }; delete n[field]; return n; });

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validateStudentForm(form, !!editData);
    if (hasErrors(errs)) { setFormErrors(errs); return; }
    setFormErrors({});
    if (editData) updateMut.mutate({ id: editData.id, data: form });
    else createMut.mutate(form);
  };

  const stageCounts = ['الكل', ...STAGES].reduce((acc, s) => {
    acc[s] = s === 'الكل' ? totalCount : students.filter(st => st.academic_stage === s).length;
    return acc;
  }, {});

  const filtered = students.filter(s => stageFilter === 'الكل' || s.academic_stage === stageFilter);

  const handlePrint = () => {
    const headers = ['الاسم', 'اسم المستخدم', 'الهاتف', 'هاتف ولي الأمر', 'المرحلة', 'الجنس', 'الكورسات المسجّلة', 'النقاط'];
    const data = filtered.map(s => [
      s.name || '—', s.username || '—', s.phone || '—', s.parent_phone || '—',
      s.academic_stage || '—', s.gender || '—',
      (s.enrolled_courses ?? 0).toString(), (s.points ?? 0).toString(),
    ]);
    generatePDFReport('تقرير الطلاب', headers, data, 'students_report.pdf', {
      stats: [
        { label: 'إجمالي الطلاب', value: filtered.length, color: '#1e3a5f' },
        { label: 'إجمالي النقاط', value: filtered.reduce((a, s) => a + (s.points ?? 0), 0), color: '#f97316' },
      ],
    });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-navy-600 flex items-center gap-2">
          <Users className="w-7 h-7 text-orange-500" /> الطلاب
          <span className="text-sm font-semibold text-gray-600">({totalCount})</span>
        </h1>
        <div className="flex gap-2 flex-wrap items-center">
          {canPrint && (
            <button onClick={handlePrint} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold transition-all">
              <Printer className="w-4 h-4" /> طباعة
            </button>
          )}
          {canPrint && (
            <button onClick={handleExportExcel} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-semibold transition-all">
              <Download className="w-4 h-4" /> تصدير
            </button>
          )}
          {canAdd && (
            <>
              <input ref={importFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelFile} />
              <input ref={modelFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleModelFile} />

              {/* Divider */}
              <div className="w-px h-6 bg-slate-200 mx-1" />

              <button onClick={openModelModal} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-navy-600 hover:bg-navy-700 text-white text-sm font-semibold transition-all relative shadow-sm">
                <Layers className="w-4 h-4" />
                نموذج
                {activeModel && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-orange-400 rounded-full border-2 border-white shadow" />
                )}
              </button>
              <button onClick={() => importFileRef.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-all shadow-sm">
                <FileSpreadsheet className="w-4 h-4" /> استيراد Excel
              </button>
              <button onClick={openAdd} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold transition-all shadow-sm">
                <Plus className="w-4 h-4" /> إضافة طالب
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main view tabs: Students | Alerts */}
      <div className="flex gap-2">
        <button
          onClick={() => setMainView('students')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            mainView === 'students'
              ? 'bg-navy-600 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Users className="w-4 h-4" /> قائمة الطلاب
        </button>
        <button
          onClick={() => setMainView('alerts')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all relative ${
            mainView === 'alerts'
              ? 'bg-red-600 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-gray-600 hover:bg-red-50'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          التحذيرات الأمنية
          {pendingAlertsCount > 0 && (
            <span className={`text-xs font-black px-1.5 py-0.5 rounded-full ${
              mainView === 'alerts' ? 'bg-white text-red-600' : 'bg-red-600 text-white'
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
                  <button onClick={() => { setImportModal(false); setImportRows([]); }} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="overflow-auto flex-1 p-4">
                  {(() => {
                    const hasUsername = importRows.some(r => r.username?.trim());
                    const hasPassword = importRows.some(r => r.password?.trim());
                    const fromFile    = hasUsername || hasPassword;
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
                      <tr className="bg-gray-50">
                        {cols.map(k => (
                          <th key={k} className="border border-gray-200 px-2 py-1.5 text-right font-semibold text-gray-600">
                            {FIELD_LABELS_MAP[k] || k}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.slice(0, 10).map((row, i) => (
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
                  {importRows.length > 10 && (
                    <p className="text-center text-xs text-gray-400 mt-2">... و {importRows.length - 10} صف آخر</p>
                  )}
                </div>
                <div className="p-4 border-t border-gray-100 flex gap-3 justify-end">
                  <button onClick={() => { setImportModal(false); setImportRows([]); }} className="btn-secondary">إلغاء</button>
                  <button onClick={handleBulkImport} disabled={importLoading} className="btn-primary flex items-center gap-2">
                    {importLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> جاري الاستيراد...</> : <><Upload className="w-4 h-4" /> استيراد {importRows.length} طالب</>}
                  </button>
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
              {['الكل', ...STAGES].map(stage => (
                <button
                  key={stage}
                  onClick={() => setStageFilter(stage)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 ${
                    stageFilter === stage
                      ? 'bg-navy-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {stage}
                  {stageCounts[stage] > 0 && (
                    <span className={`text-xs rounded-full px-1.5 py-0.5 font-black ${
                      stageFilter === stage ? 'bg-white/20 text-white' : 'bg-white text-gray-700'
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
                    <th className="table-header rounded-r-lg hidden sm:table-cell">#</th>
                    <th className="table-header">الاسم</th>
                    <th className="table-header">اسم المستخدم</th>
                    <th className="table-header hidden md:table-cell">كلمة المرور</th>
                    <th className="table-header hidden md:table-cell">الهاتف</th>
                    <th className="table-header hidden lg:table-cell">رقم ولي الأمر</th>
                    <th className="table-header hidden sm:table-cell">المرحلة</th>
                    <th className="table-header hidden sm:table-cell">النقاط</th>
                    <th className="table-header hidden lg:table-cell">الكورسات</th>
                    <th className="table-header rounded-l-lg">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i}><td colSpan={10} className="table-cell"><div className="h-8 bg-gray-100 rounded animate-pulse" /></td></tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={10} className="table-cell text-center py-14 col-span-all">
                      <Users className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                      <p className="font-medium text-gray-500">
                        {search || stageFilter !== 'الكل' ? 'لا توجد نتائج مطابقة' : 'لا يوجد طلاب بعد'}
                      </p>
                    </td></tr>
                  ) : filtered.map((s, i) => (
                    <tr key={s.id} className={`table-row ${s.is_suspended ? 'bg-red-50/40' : ''}`}>
                      <td data-label="#" className="table-cell text-gray-600 font-semibold hidden sm:table-cell">{i + 1}</td>
                      <td data-label="الاسم" className="table-cell font-bold text-navy-600">
                        <div className="flex items-center gap-2">
                          {s.is_suspended && (
                            <span title="الحساب موقوف">
                              <Ban className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                            </span>
                          )}
                          {s.name}
                        </div>
                      </td>
                      <td data-label="المستخدم" className="table-cell font-mono text-sm text-gray-700">{s.username}</td>
                      <td data-label="كلمة المرور" className="table-cell hidden md:table-cell">
                        {s.plain_password
                          ? <PasswordCell password={s.plain_password} onCopy={copyToClipboard} />
                          : <span className="text-gray-400 text-xs">—</span>}
                      </td>
                      <td data-label="الهاتف" className="table-cell text-gray-700 hidden md:table-cell">{s.phone || '—'}</td>
                      <td data-label="ولي الأمر" className="table-cell text-gray-700 hidden lg:table-cell">{s.parent_phone || '—'}</td>
                      <td data-label="المرحلة" className="table-cell hidden sm:table-cell">
                        <span className="text-xs bg-blue-50 text-blue-700 font-semibold px-2 py-1 rounded-full">
                          {s.academic_stage || '—'}
                        </span>
                      </td>
                      <td data-label="النقاط" className="table-cell hidden sm:table-cell"><span className="text-orange-700 font-bold">⭐ {s.points}</span></td>
                      <td data-label="الكورسات" className="table-cell hidden lg:table-cell"><Badge variant="info">{s.enrolled_courses || 0} كورس</Badge></td>
                      <td data-label="إجراءات" className="table-cell">
                        <div className="flex items-center gap-1.5">
                          {/* Suspend / Reactivate button (replaces old Eye/results button) */}
                          {canEdit && (
                            <button
                              onClick={() => setSuspendTarget(s)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                s.is_suspended
                                  ? 'text-green-700 hover:bg-green-50'
                                  : 'text-red-600 hover:bg-red-50'
                              }`}
                              title={s.is_suspended ? 'إعادة تفعيل الحساب' : 'إيقاف الحساب'}
                            >
                              {s.is_suspended ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                            </button>
                          )}
                          {canEdit && (
                            <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg text-navy-600 hover:bg-navy-50"><Pencil className="w-4 h-4" /></button>
                          )}
                          {canDelete && (
                            <button onClick={() => setDeleteId(s.id)} className="p-1.5 rounded-lg text-red-700 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
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
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
              <span className="text-xs font-bold text-slate-500">كود الطالب</span>
              <span className="font-mono font-black text-navy-700 tracking-widest text-lg">{editData.username}</span>
            </div>
          ) : (
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
          )}

          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">الاسم *</label>
            <input value={form.name} onChange={e => { setForm({ ...form, name: e.target.value }); clearError('name'); }}
              className={`input-field ${formErrors.name ? 'border-red-400 focus:ring-red-300' : ''}`} placeholder="الاسم الكامل" />
            <FieldError error={formErrors.name} />
          </div>

          {editData && (
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1">كلمة المرور (اتركها فارغة للإبقاء)</label>
              <input type="password" value={form.password || ''} onChange={e => { setForm({ ...form, password: e.target.value }); clearError('password'); }}
                className={`input-field ${formErrors.password ? 'border-red-400 focus:ring-red-300' : ''}`} placeholder="••••••" dir="ltr" />
              <FieldError error={formErrors.password} />
            </div>
          )}
          {!editData && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-orange-500 flex-shrink-0" />
              <p className="text-sm text-orange-700">سيتم توليد كلمة مرور من 6 أرقام تلقائياً وعرضها بعد الحفظ</p>
            </div>
          )}

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
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 ${
              suspendTarget.is_suspended ? 'bg-green-100' : 'bg-red-100'
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
                  className="w-full btn-primary flex items-center justify-center gap-2"
                >
                  <Unlock className="w-4 h-4" /> إعادة التفعيل (مع الأجهزة المسجّلة)
                </button>
                <button
                  onClick={() => suspendMut.mutate({ id: suspendTarget.id, action: 'reactivate_reset_devices' })}
                  disabled={suspendMut.isPending}
                  className="w-full btn-secondary flex items-center justify-center gap-2 !border-orange-300 !text-orange-700"
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
              <div className="mx-6 mt-4 p-3 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-between gap-3">
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
    </div>
  );
}
