import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Pencil, Trash2, Search, Eye, EyeOff, Printer, GraduationCap, Upload, FileSpreadsheet, Download, X, Loader2, Copy, CheckCircle, AlertCircle } from 'lucide-react';
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

export default function TeacherStudents() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('الكل');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);
  const [modal, setModal] = useState(false);
  const [editData, setEditData] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState(null);
  const [viewStudent, setViewStudent] = useState(null);
  const [importModal, setImportModal] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const importFileRef = useRef();
  const [previewUsername, setPreviewUsername] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [createdStudent, setCreatedStudent] = useState(null);

  const { data: students = [], isLoading, isFetching } = useQuery({
    queryKey: ['students', debouncedSearch],
    queryFn: () => api.get('/students', { params: debouncedSearch ? { search: debouncedSearch } : {} }).then(r => r.data),
    placeholderData: (prev) => prev,
  });

  const { data: results = [] } = useQuery({
    queryKey: ['student-results', viewStudent?.id],
    queryFn: () => api.get(`/students/${viewStudent?.id}/results`).then(r => r.data),
    enabled: !!viewStudent,
  });

  const createMut = useMutation({
    mutationFn: (data) => api.post('/students', data),
    onSuccess: (res) => {
      qc.invalidateQueries(['students']);
      setCreatedStudent(res.data);
      closeModal();
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/students/${id}`, data),
    onSuccess: () => { qc.invalidateQueries(['students']); toast.success('تم تحديث بيانات الطالب'); closeModal(); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/students/${id}`),
    onSuccess: () => { qc.invalidateQueries(['students']); toast.success('تم حذف الطالب'); setDeleteId(null); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const handleExcelFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        setImportRows(rows);
        setImportModal(true);
      } catch {
        toast.error('تعذّر قراءة الملف — تأكد أنه Excel أو CSV');
      }
    };
    reader.readAsArrayBuffer(file);
    if (importFileRef.current) importFileRef.current.value = '';
  };

  const handleBulkImport = async () => {
    if (!importRows.length) return;
    setImportLoading(true);
    try {
      const res = await api.post('/students/bulk', { students: importRows });
      const { success, failed, errors, created } = res.data;
      if (success > 0) {
        qc.invalidateQueries(['students']);
        toast.success(`تم إضافة ${success} طالب بنجاح${failed > 0 ? ` (${failed} فشل)` : ''}`);
      }
      if (failed > 0 && success === 0) toast.error(`فشل استيراد جميع الصفوف (${failed})`);
      if (errors?.length) errors.slice(0, 3).forEach(e => toast.error(e, { duration: 4000 }));
      // If any credentials were auto-generated, download them as Excel
      if (created?.length) {
        const exportData = created.map(s => ({
          'الاسم': s.name,
          'اسم المستخدم': s.username,
          'كلمة المرور': s.generated_password,
        }));
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

  const handleExportExcel = () => {
    const exportData = filtered.map(s => ({
      'الاسم': s.name,
      'اسم المستخدم': s.username,
      'كلمة المرور': s.plain_password || '',
      'الهاتف': s.phone || '',
      'هاتف ولي الأمر': s.parent_phone || '',
      'المرحلة': s.academic_stage || '',
      'الجنس': s.gender || '',
      'النقاط': s.points ?? 0,
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الطلاب');
    XLSX.writeFile(wb, `students_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`تم تصدير ${exportData.length} طالب`);
  };

  const canAdd = user?.role === 'teacher' || user?.can_add_students;
  const canEdit = user?.role === 'teacher' || user?.can_edit_students;
  const canDelete = user?.role === 'teacher' || user?.can_delete_students;
  const canPrint = user?.role === 'teacher' || user?.can_send_reports;

  const openAdd = () => { setEditData(null); setForm(emptyForm); setPreviewUsername(''); setFormErrors({}); setModal(true); };
  const openEdit = (s) => { setEditData(s); setForm({ ...s, password: '' }); setPreviewUsername(''); setFormErrors({}); setModal(true); };
  const closeModal = () => { setModal(false); setEditData(null); setForm(emptyForm); setPreviewUsername(''); setFormErrors({}); };
  const copyToClipboard = (text) => { navigator.clipboard.writeText(text).then(() => toast.success('تم النسخ!')); };

  // Fetch preview username when stage changes (only when adding a new student)
  useEffect(() => {
    if (editData || !modal) return;
    if (!form.academic_stage) { setPreviewUsername(''); return; }
    let cancelled = false;
    setPreviewLoading(true);
    api.get('/students/next-username', { params: { stage: form.academic_stage } })
      .then(r => { if (!cancelled) setPreviewUsername(r.data.username); })
      .catch(() => {
        if (!cancelled) {
          const p = STAGE_PREFIX_LABELS[form.academic_stage] || 'S';
          setPreviewUsername(`${p}???`);
        }
      })
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

  // Stage counts for tabs
  const stageCounts = ['الكل', ...STAGES].reduce((acc, s) => {
    acc[s] = s === 'الكل' ? students.length : students.filter(st => st.academic_stage === s).length;
    return acc;
  }, {});

  const filtered = students.filter(s => {
    return stageFilter === 'الكل' || s.academic_stage === stageFilter;
  });

  const handlePrint = () => {
    const headers = ['الاسم', 'اسم المستخدم', 'الهاتف', 'هاتف ولي الأمر', 'المرحلة', 'الجنس', 'الكورسات المسجّلة', 'النقاط'];
    const data = filtered.map(s => [
      s.name || '—',
      s.username || '—',
      s.phone || '—',
      s.parent_phone || '—',
      s.academic_stage || '—',
      s.gender || '—',
      (s.enrolled_courses ?? 0).toString(),
      (s.points ?? 0).toString(),
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-navy-600 flex items-center gap-2">
          <Users className="w-7 h-7 text-orange-500" /> الطلاب
          <span className="text-sm font-semibold text-gray-600">({students.length})</span>
        </h1>
        <div className="flex gap-2 flex-wrap">
          {canPrint && (
            <button onClick={handlePrint} className="btn-secondary flex items-center gap-2">
              <Printer className="w-4 h-4" /> طباعة
            </button>
          )}
          {canPrint && (
            <button onClick={handleExportExcel} className="btn-secondary flex items-center gap-2 !border-blue-300 !text-blue-700 hover:!bg-blue-50">
              <Download className="w-4 h-4" /> تصدير Excel
            </button>
          )}
          {canAdd && (
            <>
              <input ref={importFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelFile} />
              <button onClick={() => importFileRef.current?.click()} className="btn-secondary flex items-center gap-2 !border-green-300 !text-green-700 hover:!bg-green-50">
                <FileSpreadsheet className="w-4 h-4" /> استيراد Excel
              </button>
              <button onClick={openAdd} className="btn-primary flex items-center gap-2">
                <Plus className="w-4 h-4" /> إضافة طالب
              </button>
            </>
          )}
        </div>
      </div>

      {/* Created Student Password Modal */}
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

      {/* Import Preview Modal */}
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
              <div className="text-xs text-gray-600 mb-3 bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
                <p><strong>الأعمدة المدعومة:</strong> الاسم، اسم المستخدم، كلمة المرور، الهاتف، هاتف ولي الأمر، المرحلة، الجنس</p>
                <p className="text-blue-700">✨ <strong>الاسم فقط مطلوب</strong> — اسم المستخدم وكلمة المرور يُولَّدان تلقائياً إن لم يُحدَّدا. بعد الاستيراد ستُنزَّل بيانات الدخول تلقائياً.</p>
              </div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    {importRows[0] && Object.keys(importRows[0]).map(k => (
                      <th key={k} className="border border-gray-200 px-2 py-1.5 text-right font-semibold text-gray-600">{k}</th>
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
                <tr key={s.id} className="table-row">
                  <td data-label="#" className="table-cell text-gray-600 font-semibold hidden sm:table-cell">{i + 1}</td>
                  <td data-label="الاسم" className="table-cell font-bold text-navy-600">{s.name}</td>
                  <td data-label="المستخدم" className="table-cell font-mono text-sm text-gray-700">{s.username}</td>
                  <td data-label="كلمة المرور" className="table-cell hidden md:table-cell">
                    {s.plain_password ? (
                      <PasswordCell password={s.plain_password} onCopy={copyToClipboard} />
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
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
                      <button onClick={() => setViewStudent(s)} className="p-1.5 rounded-lg text-blue-700 hover:bg-blue-50"><Eye className="w-4 h-4" /></button>
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

      {/* Add/Edit Modal */}
      <Modal open={modal} onClose={closeModal} title={editData ? 'تعديل بيانات طالب' : 'إضافة طالب جديد'}>
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Username display */}
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

      {/* View Results Modal */}
      <Modal open={!!viewStudent} onClose={() => setViewStudent(null)} title={`نتائج ${viewStudent?.name}`} size="lg">
        <div className="space-y-3">
          {results.length === 0 ? (
            <p className="text-center text-gray-600 font-medium py-8">لم يؤدِ هذا الطالب أي اختبارات بعد</p>
          ) : results.map(r => (
            <div key={r.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
              <div>
                <p className="font-semibold text-navy-600">{r.exam_title}</p>
                <p className="text-xs text-gray-600 font-medium mt-0.5">{new Date(r.created_at).toLocaleDateString('ar-EG')}</p>
              </div>
              <div className="text-left">
                <p className={`text-lg font-black ${r.score >= r.pass_score ? 'text-green-700' : 'text-red-700'}`}>
                  {r.score}/{r.total_score}
                </p>
                <p className="text-xs text-gray-600 font-medium">✓{r.correct_count} ✗{r.wrong_count}</p>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteMut.mutate(deleteId)}
        title="حذف الطالب"
        message="سيتم إخفاء الطالب من القوائم ولن يتمكن من تسجيل الدخول. بياناته ونتائجه محفوظة في قاعدة البيانات ويمكن استرجاعها عند الحاجة."
        danger
      />
    </div>
  );
}
