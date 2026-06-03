import React, { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Upload, Database, Users, BookOpen, FileText, CreditCard, BarChart3, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export default function Backup() {
  const qc = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const [lastExport, setLastExport] = useState(null);

  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const importFileRef = useRef(null);

  const [csvExporting, setCsvExporting] = useState(null); // key of currently exporting CSV

  const { data: stats } = useQuery({
    queryKey: ['teacher-dashboard'],
    queryFn: () => api.get('/teachers/dashboard').then(r => r.data),
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await api.get('/teachers/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `wathba-backup-${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setLastExport(new Date());
      toast.success('تم تصدير البيانات بنجاح!');
    } catch (err) {
      toast.error('حدث خطأ أثناء التصدير');
    } finally {
      setExporting(false);
    }
  };

  const handleImportFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        if (!parsed.exported_at) {
          toast.error('الملف غير صالح — تأكد أنه ملف JSON صادر من وثبة');
          return;
        }
        setImportFile(parsed);
        setImportPreview({
          exported_at: parsed.exported_at,
          courses:  (parsed.courses  || []).length,
          students: (parsed.students || []).length,
          exams:    (parsed.exams    || []).length,
          questions:(parsed.questions|| []).length,
          videos:   (parsed.videos   || []).length,
          pdfs:     (parsed.pdfs     || []).length,
          payments: (parsed.payments || []).length,
          results:  (parsed.exam_results || []).length,
        });
      } catch {
        toast.error('تعذّر قراءة الملف — تأكد أنه ملف JSON صحيح');
      }
    };
    reader.readAsText(file, 'utf-8');
    if (importFileRef.current) importFileRef.current.value = '';
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await api.post('/teachers/import', importFile);
      setImportResult(res.data);
      toast.success('تم استيراد البيانات بنجاح!');
      setImportFile(null);
      setImportPreview(null);
      // Refresh cached data so stats and student lists update
      qc.invalidateQueries(['teacher-dashboard']);
      qc.invalidateQueries(['students']);
      qc.invalidateQueries(['courses']);
      qc.invalidateQueries(['exams']);
    } catch (err) {
      toast.error(err.response?.data?.error || 'حدث خطأ أثناء الاستيراد');
    } finally {
      setImporting(false);
    }
  };

  const sanitizeCell = (val) => {
    const str = String(val ?? '');
    if (str.length > 0 && /^[=+\-@|]/.test(str)) return `'${str}`;
    return str;
  };

  const downloadCSV = (rows, filename) => {
    const csvContent = '\uFEFF' + rows
      .map(r => r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleExportCSV = async (type) => {
    if (csvExporting) return;
    setCsvExporting(type);
    try {
      const res = await api.get('/teachers/export');
      const data = res.data;

      // Build lookup maps for human-readable names
      const studentById = {};
      (data.students || []).forEach(s => { studentById[s.id] = s.name; });
      const examById = {};
      (data.exams || []).forEach(e => { examById[e.id] = e.title; });
      const courseById = {};
      (data.courses || []).forEach(c => { courseById[c.id] = c.name; });

      if (type === 'students') {
        const headers = ['الاسم', 'الهاتف', 'هاتف ولي الأمر', 'المرحلة الدراسية', 'الجنس', 'النقاط', 'تاريخ التسجيل'];
        const rows = [
          headers,
          ...(data.students || []).map(s => [
            sanitizeCell(s.name),
            sanitizeCell(s.phone || ''),
            sanitizeCell(s.parent_phone || ''),
            sanitizeCell(s.academic_stage || ''),
            sanitizeCell(s.gender || ''),
            s.points ?? 0,
            new Date(s.created_at).toLocaleDateString('ar-EG'),
          ]),
        ];
        downloadCSV(rows, `students_${new Date().toISOString().slice(0, 10)}.csv`);
        toast.success(`تم تصدير ${data.students?.length ?? 0} طالب`);

      } else if (type === 'results') {
        const headers = ['اسم الطالب', 'الاختبار', 'الدرجة', 'إجمالي الدرجات', 'صحيح', 'خطأ', 'لم يُجب', 'التاريخ'];
        const rows = [
          headers,
          ...(data.exam_results || []).map(r => [
            sanitizeCell(studentById[r.student_id] || r.student_id),
            sanitizeCell(examById[r.exam_id] || r.exam_id),
            r.score ?? 0,
            r.total_score ?? '',
            r.correct_count ?? 0,
            r.wrong_count ?? 0,
            r.unanswered_count ?? 0,
            new Date(r.created_at).toLocaleDateString('ar-EG'),
          ]),
        ];
        downloadCSV(rows, `exam_results_${new Date().toISOString().slice(0, 10)}.csv`);
        toast.success(`تم تصدير ${data.exam_results?.length ?? 0} نتيجة`);

      } else if (type === 'payments') {
        const headers = ['اسم الطالب', 'الكورس', 'المبلغ (جنيه)', 'طريقة الدفع', 'الحالة', 'رقم مرجعي', 'التاريخ'];
        const rows = [
          headers,
          ...(data.payments || []).map(p => [
            sanitizeCell(studentById[p.student_id] || p.student_id),
            sanitizeCell(p.course_id ? (courseById[p.course_id] || p.course_id) : '—'),
            p.amount ?? 0,
            sanitizeCell(p.method || ''),
            sanitizeCell(
              p.status === 'verified' ? 'مُحقَّق' :
              p.status === 'pending'  ? 'معلّق'   :
              p.status === 'rejected' ? 'مرفوض'   : p.status
            ),
            sanitizeCell(p.reference_number || ''),
            new Date(p.payment_date).toLocaleDateString('ar-EG'),
          ]),
        ];
        downloadCSV(rows, `payments_${new Date().toISOString().slice(0, 10)}.csv`);
        toast.success(`تم تصدير ${data.payments?.length ?? 0} عملية دفع`);
      }
    } catch {
      toast.error('حدث خطأ أثناء التصدير');
    } finally {
      setCsvExporting(null);
    }
  };

  const statCards = [
    { icon: Users,    label: 'الطلاب',            value: stats?.totalStudents,             color: 'text-blue-600 bg-blue-50'   },
    { icon: BookOpen, label: 'الكورسات',           value: stats?.totalCourses,              color: 'text-purple-600 bg-purple-50'},
    { icon: FileText, label: 'الاختبارات',         value: stats?.totalExams,                color: 'text-orange-600 bg-orange-50'},
    { icon: CreditCard, label: 'الإيرادات (جنيه)', value: stats?.totalRevenue?.toLocaleString(), color: 'text-green-600 bg-green-50'},
  ];

  const csvExports = [
    { key: 'students', label: 'قائمة الطلاب',     desc: 'الاسم، الهاتف، رقم ولي الأمر، المرحلة، الجنس، النقاط', icon: Users      },
    { key: 'results',  label: 'نتائج الاختبارات', desc: 'جميع نتائج الاختبارات مع أسماء الطلاب والاختبارات',     icon: BarChart3   },
    { key: 'payments', label: 'سجل المدفوعات',    desc: 'جميع عمليات الدفع مع أسماء الطلاب والكورسات',           icon: CreditCard  },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black text-navy-600 flex items-center gap-2">
        <Database className="w-7 h-7 text-navy-500" /> النسخ الاحتياطي وتصدير البيانات
      </h1>

      {/* Stats overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center mb-3`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-black text-navy-700">{value ?? '…'}</p>
            <p className="text-sm text-gray-500 font-medium mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Full JSON backup - Export */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 bg-navy-100 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Database className="w-7 h-7 text-navy-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-black text-navy-700 mb-1">نسخة احتياطية كاملة (JSON)</h2>
            <p className="text-sm text-gray-500 mb-4">
              تصدير جميع بياناتك — الطلاب، الكورسات، الفيديوهات، الملفات، الاختبارات، النتائج، والمدفوعات — في ملف JSON واحد يمكنك استعادته لاحقاً بالكامل.
            </p>
            <div className="flex items-center gap-4">
              <button
                onClick={handleExport}
                disabled={exporting}
                className="btn-primary flex items-center gap-2 px-6 py-3 disabled:opacity-50"
              >
                {exporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                {exporting ? 'جاري التصدير...' : 'تنزيل النسخة الاحتياطية'}
              </button>
              {lastExport && (
                <div className="flex items-center gap-2 text-green-700 text-sm font-bold">
                  <CheckCircle className="w-4 h-4" />
                  آخر تصدير: {lastExport.toLocaleTimeString('ar-EG')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Full JSON backup - Import */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Upload className="w-7 h-7 text-green-700" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-black text-navy-700 mb-1">استعادة نسخة احتياطية (JSON)</h2>
            <p className="text-sm text-gray-500 mb-1">
              ارفع ملف JSON صادر من وثبة لاستعادة جميع بياناتك — الكورسات، الطلاب، الاختبارات، النتائج، والمدفوعات.
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              ⚠️ سيتم إضافة البيانات المستوردة إلى حسابك الحالي. الطلاب ذوو أسماء المستخدمين المكررة سيُتجاهلون تلقائياً.
            </p>

            <input ref={importFileRef} type="file" accept=".json" className="hidden" onChange={handleImportFileChange} />

            {!importPreview && !importResult && (
              <button
                onClick={() => importFileRef.current?.click()}
                className="flex items-center gap-2 px-5 py-3 border-2 border-dashed border-green-400 text-green-700 font-bold rounded-xl hover:bg-green-50 transition-all text-sm"
              >
                <Upload className="w-4 h-4" /> اختر ملف النسخة الاحتياطية
              </button>
            )}

            {/* Preview */}
            {importPreview && (
              <div className="space-y-3">
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-bold text-navy-700 text-sm">محتويات الملف</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">تاريخ التصدير: {new Date(importPreview.exported_at).toLocaleString('ar-EG')}</span>
                      <button onClick={() => { setImportFile(null); setImportPreview(null); }} className="p-1 text-gray-400 hover:text-gray-700 rounded">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: 'الكورسات',  value: importPreview.courses   },
                      { label: 'الطلاب',    value: importPreview.students   },
                      { label: 'الفيديوهات',value: importPreview.videos     },
                      { label: 'الملفات PDF',value: importPreview.pdfs     },
                      { label: 'الاختبارات',value: importPreview.exams      },
                      { label: 'الأسئلة',   value: importPreview.questions  },
                      { label: 'النتائج',   value: importPreview.results    },
                      { label: 'المدفوعات', value: importPreview.payments   },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-white border border-gray-100 rounded-lg p-2 text-center">
                        <p className="text-lg font-black text-navy-700">{value}</p>
                        <p className="text-xs text-gray-500">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => importFileRef.current?.click()}
                    className="btn-secondary flex items-center gap-2 text-sm"
                  >
                    <Upload className="w-4 h-4" /> تغيير الملف
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={importing}
                    className="btn-primary flex items-center gap-2 px-6 disabled:opacity-50"
                  >
                    {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {importing ? 'جاري الاستيراد...' : 'بدء الاستيراد'}
                  </button>
                </div>
              </div>
            )}

            {/* Result */}
            {importResult && (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="w-5 h-5 text-green-700" />
                    <p className="font-bold text-green-800">تم الاستيراد بنجاح!</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: 'كورسات جديدة',   value: importResult.stats?.courses    },
                      { label: 'طلاب جدد',        value: importResult.stats?.students   },
                      { label: 'فيديوهات',        value: importResult.stats?.videos     },
                      { label: 'ملفات PDF',       value: importResult.stats?.pdfs       },
                      { label: 'اختبارات',        value: importResult.stats?.exams      },
                      { label: 'أسئلة',           value: importResult.stats?.questions  },
                      { label: 'نتائج',           value: importResult.stats?.results    },
                      { label: 'مدفوعات',         value: importResult.stats?.payments   },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-white border border-green-100 rounded-lg p-2 text-center">
                        <p className="text-lg font-black text-green-800">{value ?? 0}</p>
                        <p className="text-xs text-gray-600">{label}</p>
                      </div>
                    ))}
                  </div>
                  {importResult.stats?.skipped_students > 0 && (
                    <p className="text-xs text-amber-700 mt-2">
                      ⚠️ تم تجاهل {importResult.stats.skipped_students} طالب بسبب تكرار اسم المستخدم.
                    </p>
                  )}
                  {importResult.stats?.errors?.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {importResult.stats.errors.slice(0, 5).map((e, i) => (
                        <p key={i} className="text-xs text-red-700 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 flex-shrink-0" /> {e}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => { setImportResult(null); setImportFile(null); setImportPreview(null); }}
                  className="btn-secondary text-sm"
                >
                  استيراد ملف آخر
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CSV exports */}
      <div>
        <h2 className="text-lg font-black text-navy-600 mb-3">تصدير CSV مخصص</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {csvExports.map(({ key, label, desc, icon: Icon }) => (
            <div key={key} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center mb-3">
                <Icon className="w-5 h-5 text-orange-600" />
              </div>
              <h3 className="font-black text-navy-700 mb-1">{label}</h3>
              <p className="text-sm text-gray-500 mb-4">{desc}</p>
              <button
                onClick={() => handleExportCSV(key)}
                disabled={!!csvExporting}
                className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-orange-300 text-orange-700 font-bold rounded-xl hover:bg-orange-50 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {csvExporting === key
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> جاري التصدير...</>
                  : <><Download className="w-4 h-4" /> تحميل CSV</>
                }
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-800">
        <p className="font-bold mb-1">💡 نصيحة</p>
        <p>ننصح بعمل نسخة احتياطية أسبوعياً على الأقل لضمان عدم فقدان أي بيانات. النسخة الاحتياطية JSON هي الوحيدة التي تدعم الاستعادة الكاملة.</p>
      </div>
    </div>
  );
}
