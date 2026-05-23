import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FileText, Plus, Pencil, Trash2, HelpCircle, ChevronDown, ChevronUp, Printer, Filter, Calendar, User, Eye, Search, AlertCircle, Globe, EyeOff, Upload, Link, CheckCircle, XCircle } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Badge from '../../components/ui/Badge';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { generatePDFReport } from '../../lib/pdfReport';
import { validateExamForm, hasErrors } from '../../lib/validation';

function FieldError({ error }) {
  if (!error) return null;
  return (
    <p className="flex items-center gap-1 text-red-600 text-xs font-semibold mt-1">
      <AlertCircle className="w-3 h-3 flex-shrink-0" />{error}
    </p>
  );
}

const STAGES = ['الصف الأول الثانوي', 'الصف الثاني الثانوي', 'الصف الثالث الثانوي', 'الصف الأول الإعدادي', 'الصف الثاني الإعدادي', 'الصف الثالث الإعدادي'];

const emptyExam = { title: '', duration_minutes: 60, total_score: 100, course_id: '', pass_score: 50, badge_name: '', badge_color: '#995400', start_date: '', end_date: '', shuffle_questions: false, shuffle_options: false, question_source: 'manual', bank_id: '', bank_question_count: 10, points_on_attempt: 0, points_on_pass: 0 };
const emptyQ = { question_text: '', question_image_url: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer_letter: 'A', points: 1, question_type: 'mcq' };

const QUESTION_TYPES = [
  { value: 'mcq', label: '🔘 اختيار متعدد (MCQ)' },
  { value: 'true_false', label: '✅ صح / خطأ' },
];

const fmtDateLocal = (iso) => {
  if (!iso) return '';
  return iso.slice(0, 16);
};

export default function TeacherExams() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canPrint = user?.role === 'teacher' || user?.can_view_analytics;
  const canManageExams = user?.role === 'teacher' || user?.can_manage_exams;
  const [modal, setModal] = useState(false);
  const [editData, setEditData] = useState(null);
  const [form, setForm] = useState(emptyExam);
  const [deleteId, setDeleteId] = useState(null);
  const [expandedExam, setExpandedExam] = useState(null);
  const [qForm, setQForm] = useState(emptyQ);
  const [editQ, setEditQ] = useState(null);
  const [stageFilter, setStageFilter] = useState('الكل');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  const [imageInputMode, setImageInputMode] = useState('url');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const imageFileRef = useRef(null);
  const [publishConfirm, setPublishConfirm] = useState(null);
  const [forceResetConfirm, setForceResetConfirm] = useState(null);

  const { data: exams = [], isLoading } = useQuery({
    queryKey: ['exams'],
    queryFn: () => api.get('/exams').then(r => r.data),
  });

  const { data: courses = [] } = useQuery({
    queryKey: ['courses'],
    queryFn: () => api.get('/courses').then(r => r.data),
  });

  const { data: questions = [] } = useQuery({
    queryKey: ['questions', expandedExam],
    queryFn: () => api.get(`/exams/${expandedExam}/questions`).then(r => r.data),
    enabled: !!expandedExam,
  });

  const { data: students = [] } = useQuery({
    queryKey: ['students'],
    queryFn: () => api.get('/students').then(r => r.data),
  });

  const { data: questionBanks = [] } = useQuery({
    queryKey: ['question-banks'],
    queryFn: () => api.get('/question-banks').then(r => r.data),
  });

  const { data: studentResults = [] } = useQuery({
    queryKey: ['student-results', selectedStudent?.id],
    queryFn: () => api.get(`/students/${selectedStudent.id}/results`).then(r => r.data),
    enabled: !!selectedStudent,
  });


  const studentResultMap = useMemo(() => {
    const map = {};
    studentResults.forEach(r => { map[r.exam_id] = r; });
    return map;
  }, [studentResults]);

  const filteredStudents = useMemo(() =>
    students.filter(s => !studentSearch || s.name.includes(studentSearch) || s.username.includes(studentSearch)),
    [students, studentSearch]
  );

  const createMut = useMutation({
    mutationFn: (data) => api.post('/exams', data),
    onSuccess: () => { qc.invalidateQueries(['exams']); toast.success('تم إنشاء الاختبار'); closeModal(); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/exams/${id}`, data),
    onSuccess: () => { qc.invalidateQueries(['exams']); toast.success('تم تحديث الاختبار'); closeModal(); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ في تحديث الاختبار'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/exams/${id}`),
    onSuccess: () => { qc.invalidateQueries(['exams']); toast.success('تم حذف الاختبار'); },
  });

  const publishMut = useMutation({
    mutationFn: ({ id, force_reset }) => api.put(`/exams/${id}/publish`, { force_reset: !!force_reset }),
    onSuccess: (res) => {
      qc.invalidateQueries(['exams']);
      setPublishConfirm(null);
      setForceResetConfirm(null);
      if (res.data.is_published) {
        toast.success('تم نشر الاختبار وإشعار الطلاب 📢');
      } else {
        toast('تم إلغاء نشر الاختبار', { icon: '🔕' });
      }
    },
    onError: (e, variables) => {
      const data = e.response?.data;
      if (data?.code === 'RESULTS_EXIST') {
        setPublishConfirm(null);
        setForceResetConfirm({ id: variables.id, count: data.count });
        return;
      }
      setPublishConfirm(null);
      setForceResetConfirm(null);
      toast.error(data?.error || 'حدث خطأ');
    },
  });

  const handlePublishClick = (ex) => {
    if (ex.is_published) {
      publishMut.mutate({ id: ex.id });
      return;
    }
    // Check if linked course is published
    if (ex.course_id) {
      const linkedCourse = courses.find(c => c.id === ex.course_id);
      if (linkedCourse && !linkedCourse.is_published) {
        toast.error('لا يمكن نشر الاختبار لأن الكورس المرتبط به غير منشور — انشر الكورس أولاً');
        return;
      }
    }
    // Check if exam has questions (for manual source)
    if (ex.question_source !== 'bank' && parseInt(ex.question_count || 0) === 0) {
      toast.error('لا يمكن نشر اختبار بدون أسئلة — أضف أسئلة أولاً');
      return;
    }
    // Block publish if question points sum ≠ total_score (only when questions are loaded for this exam)
    if (ex.question_source !== 'bank' && expandedExam === ex.id && questions.length > 0) {
      const pointsSum = questions.reduce((s, q) => s + (parseInt(q.points) || 0), 0);
      if (pointsSum !== parseInt(ex.total_score)) {
        toast.error(`مجموع نقاط الأسئلة (${pointsSum}) لا يساوي الدرجة الكلية (${ex.total_score}) — عدّل النقاط أو الدرجة الكلية قبل النشر`);
        return;
      }
    }
    // Show confirmation before publishing
    setPublishConfirm(ex);
  };

  const addQMut = useMutation({
    mutationFn: ({ id, data }) => api.post(`/exams/${id}/questions`, data),
    onSuccess: () => {
      qc.invalidateQueries(['questions', expandedExam]);
      qc.invalidateQueries(['exams']);
      toast.success('تم إضافة السؤال');
      setQForm(emptyQ);
      setImageFile(null);
      setImagePreview('');
      setImageInputMode('url');
      if (imageFileRef.current) imageFileRef.current.value = '';
    },
  });

  const updateQMut = useMutation({
    mutationFn: ({ qid, data }) => api.put(`/exams/questions/${qid}`, data),
    onSuccess: () => {
      qc.invalidateQueries(['questions', expandedExam]);
      qc.invalidateQueries(['exams']);
      toast.success('تم تحديث السؤال');
      setEditQ(null);
      setQForm(emptyQ);
      setImageFile(null);
      setImagePreview('');
      setImageInputMode('url');
      if (imageFileRef.current) imageFileRef.current.value = '';
    },
  });

  const deleteQMut = useMutation({
    mutationFn: (qid) => api.delete(`/exams/questions/${qid}`),
    onSuccess: () => {
      qc.invalidateQueries(['questions', expandedExam]);
      qc.invalidateQueries(['exams']);
      toast.success('تم حذف السؤال');
    },
  });

  const [formErrors, setFormErrors] = useState({});
  const clearError = (field) => setFormErrors(prev => { const n = { ...prev }; delete n[field]; return n; });

  const openAdd = () => { setEditData(null); setForm(emptyExam); setFormErrors({}); setModal(true); };
  const openEdit = (e) => {
    setEditData(e);
    setForm({
      title: e.title, duration_minutes: e.duration_minutes, total_score: e.total_score,
      course_id: e.course_id || '', pass_score: e.pass_score,
      badge_name: e.badge_name || '', badge_color: e.badge_color || '#995400',
      start_date: fmtDateLocal(e.start_date), end_date: fmtDateLocal(e.end_date),
      shuffle_questions: !!e.shuffle_questions, shuffle_options: !!e.shuffle_options,
      question_source: e.question_source || 'manual',
      bank_id: e.bank_id || '',
      bank_question_count: e.bank_question_count || 10,
      points_on_attempt: e.points_on_attempt || 0,
      points_on_pass: e.points_on_pass || 0,
    });
    setFormErrors({});
    setModal(true);
  };
  const closeModal = () => { setModal(false); setEditData(null); setForm(emptyExam); setFormErrors({}); };

  const toUTCIso = (localStr) => {
    if (!localStr) return null;
    return new Date(localStr).toISOString();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validateExamForm(form);
    if (hasErrors(errs)) { setFormErrors(errs); return; }
    setFormErrors({});
    const payload = {
      ...form,
      start_date: toUTCIso(form.start_date),
      end_date: toUTCIso(form.end_date),
    };
    if (editData) updateMut.mutate({ id: editData.id, data: payload });
    else createMut.mutate(payload);
  };

  const handleQSubmit = async (e) => {
    e.preventDefault();
    let finalImageUrl = qForm.question_image_url || '';

    if (imageFile) {
      const fd = new FormData();
      fd.append('image', imageFile);
      try {
        setUploadProgress(1);
        const res = await api.post('/exams/upload-question-image', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (evt) => {
            if (evt.total) setUploadProgress(Math.round((evt.loaded / evt.total) * 100));
          },
        });
        finalImageUrl = res.data.url;
        setUploadProgress(100);
        setTimeout(() => setUploadProgress(0), 800);
      } catch {
        setUploadProgress(0);
        return toast.error('فشل رفع الصورة، حاول مرة أخرى');
      }
    }

    const finalForm = { ...qForm, question_image_url: finalImageUrl };

    if (!finalForm.question_text && !finalImageUrl) return toast.error('أدخل نص السؤال أو ارفع صورة السؤال');
    if (finalForm.question_type === 'mcq' && (!finalForm.option_a || !finalForm.option_b)) return toast.error('الخياران الأول والثاني مطلوبان');
    if (editQ) updateQMut.mutate({ qid: editQ.id, data: finalForm });
    else addQMut.mutate({ id: expandedExam, data: finalForm });
  };

  const handlePrint = () => {
    const headers = ['العنوان', 'الكورس', 'المدة (دقيقة)', 'عدد الأسئلة', 'المجموع الكلي', 'درجة النجاح', 'المحاولات', 'الحالة'];
    const data = exams.map(ex => [
      ex.title || '—',
      ex.course_name || 'عام',
      (ex.duration_minutes ?? 0).toString(),
      (ex.question_count ?? 0).toString(),
      (ex.total_score ?? 0).toString(),
      (ex.pass_score ?? 0).toString(),
      (ex.attempt_count ?? 0).toString(),
      ex.is_published ? 'منشور' : 'مسودة',
    ]);
    generatePDFReport('تقرير الاختبارات', headers, data, 'exams_report.pdf', {
      stats: [
        { label: 'إجمالي الاختبارات', value: exams.length, color: '#1e3a5f' },
        { label: 'منشور', value: exams.filter(e => e.is_published).length, color: '#16a34a' },
        { label: 'مسودة', value: exams.filter(e => !e.is_published).length, color: '#64748b' },
        { label: 'إجمالي المحاولات', value: exams.reduce((a, e) => a + (parseInt(e.attempt_count) || 0), 0), color: '#f97316' },
      ],
    });
  };

  const courseStageMap = {};
  courses.forEach(c => { if (c.id) courseStageMap[c.id] = c.target_stage; });

  const stageCounts = ['الكل', ...STAGES].reduce((acc, s) => {
    if (s === 'الكل') { acc[s] = exams.length; return acc; }
    // Include general exams (no course) in every stage count
    acc[s] = exams.filter(ex => !ex.course_id || courseStageMap[ex.course_id] === s).length;
    return acc;
  }, {});

  const filteredExams = stageFilter === 'الكل'
    ? exams
    // Include general exams (no course_id) in every stage filter so they are always visible
    : exams.filter(ex => !ex.course_id || courseStageMap[ex.course_id] === stageFilter);

  const getScheduleStatus = (ex) => {
    const now = new Date();
    if (ex.start_date && new Date(ex.start_date) > now) return { label: '⏳ لم يبدأ', cls: 'bg-yellow-100 text-yellow-800' };
    if (ex.end_date && new Date(ex.end_date) < now) return { label: '🔒 انتهى', cls: 'bg-red-100 text-red-800' };
    if (ex.start_date || ex.end_date) return { label: '🟢 مفتوح', cls: 'bg-green-100 text-green-800' };
    return null;
  };

  const qTypeLabel = (t) => ({ mcq: 'MCQ', true_false: 'صح/خطأ' })[t] || 'MCQ';

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h1 className="text-xl sm:text-2xl font-black text-navy-600 flex items-center gap-2">
          <FileText className="w-6 h-6 sm:w-7 sm:h-7 text-orange-500 flex-shrink-0" /> الاختبارات
          <span className="text-sm font-semibold text-gray-600">({exams.length})</span>
        </h1>
        <div className="page-header-actions">
          {canPrint && (
            <button onClick={handlePrint} className="btn-secondary flex items-center gap-2">
              <Printer className="w-4 h-4" /> <span className="hidden sm:inline">طباعة</span>
            </button>
          )}
          {canManageExams && (
            <button onClick={openAdd} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> إضافة اختبار
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-xs font-bold text-gray-500">تصفية حسب المرحلة الدراسية</span>
        </div>
        <div className="filter-scroll">
          {['الكل', ...STAGES].map(stage => (
            <button key={stage} onClick={() => setStageFilter(stage)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${stageFilter === stage ? 'bg-orange-500 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {stage}
              <span className={`text-xs rounded-full px-1.5 font-black ${stageFilter === stage ? 'bg-white/20 text-white' : 'bg-white text-gray-600'}`}>
                {stageCounts[stage] || 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Student Filter */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <User className="w-4 h-4 text-gray-500" />
          <span className="text-xs font-bold text-gray-500">عرض نتائج طالب محدد</span>
          {selectedStudent && (
            <button
              onClick={() => { setSelectedStudent(null); setStudentSearch(''); }}
              className="mr-auto text-xs text-red-600 font-bold hover:underline"
            >
              إلغاء التحديد ✕
            </button>
          )}
        </div>
        <div className="relative">
          {selectedStudent ? (
            <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-black flex-shrink-0">
                {selectedStudent.name.charAt(0)}
              </div>
              <div>
                <p className="font-bold text-blue-800 text-sm">{selectedStudent.name}</p>
                <p className="text-xs text-blue-600">{selectedStudent.academic_stage || 'بدون مرحلة'} · أدى {studentResults.length} اختبار</p>
              </div>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={studentSearch}
                  onChange={e => { setStudentSearch(e.target.value); setShowStudentDropdown(true); }}
                  onFocus={() => setShowStudentDropdown(true)}
                  onBlur={() => setTimeout(() => setShowStudentDropdown(false), 200)}
                  placeholder="ابحث باسم الطالب لعرض نتائجه..."
                  className="input-field pr-9 text-sm"
                />
              </div>
              {showStudentDropdown && filteredStudents.length > 0 && (
                <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                  {filteredStudents.slice(0, 15).map(s => (
                    <button
                      key={s.id}
                      onMouseDown={() => { setSelectedStudent(s); setStudentSearch(''); setShowStudentDropdown(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-right transition-colors"
                    >
                      <div className="w-7 h-7 bg-navy-600 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0">
                        {s.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-navy-700 text-sm">{s.name}</p>
                        <p className="text-xs text-gray-500">{s.academic_stage || '—'}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          [...Array(3)].map((_, i) => <div key={i} className="card h-20 animate-pulse bg-gray-100" />)
        ) : filteredExams.length === 0 ? (
          <div className="card text-center py-16">
            <FileText className="w-16 h-16 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium">لا توجد اختبارات بعد</p>
          </div>
        ) : filteredExams.map(ex => {
          const scheduleStatus = getScheduleStatus(ex);
          return (
            <div key={ex.id} className="card !p-0 overflow-hidden">
              <div className="p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-orange-500 to-orange-700 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-navy-600 text-sm leading-snug flex-1 min-w-0">{ex.title}</h3>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => openEdit(ex)} className="p-1.5 text-navy-600 hover:bg-navy-50 rounded-lg" title="تعديل"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => setDeleteId(ex.id)} className="p-1.5 text-red-700 hover:bg-red-50 rounded-lg" title="حذف"><Trash2 className="w-4 h-4" /></button>
                        <button onClick={() => setExpandedExam(expandedExam === ex.id ? null : ex.id)} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg">
                          {expandedExam === ex.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {ex.course_name && <Badge variant="info">{ex.course_name}</Badge>}
                      {courseStageMap[ex.course_id] && <span className="text-xs bg-purple-50 text-purple-700 font-bold px-2 py-0.5 rounded-full">{courseStageMap[ex.course_id]}</span>}
                      <Badge variant="navy">⏱ {ex.duration_minutes} د</Badge>
                      <Badge variant="warning">📝 {ex.question_count} س</Badge>
                      <Badge variant="gray">{ex.total_score} درجة</Badge>
                      <Badge variant="success">{ex.attempt_count} محاولة</Badge>
                      {scheduleStatus && <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scheduleStatus.cls}`}>{scheduleStatus.label}</span>}
                    </div>
                    {(ex.start_date || ex.end_date) && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                        <Calendar className="w-3 h-3 flex-shrink-0" />
                        {ex.start_date && <span className="truncate">من: {new Date(ex.start_date).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</span>}
                        {ex.end_date && <span className="truncate">· حتى: {new Date(ex.end_date).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</span>}
                      </div>
                    )}
                    <div className="mt-2">
                      <button
                        onClick={() => handlePublishClick(ex)}
                        disabled={publishMut.isPending}
                        title={ex.is_published ? 'إلغاء النشر' : 'نشر للطلاب'}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${ex.is_published ? 'bg-green-50 border-green-300 text-green-700 hover:bg-red-50 hover:border-red-300 hover:text-red-600' : 'bg-gray-100 border-gray-200 text-gray-500 hover:bg-green-50 hover:border-green-300 hover:text-green-700'}`}>
                        {ex.is_published ? <><Globe className="w-3.5 h-3.5" /> منشور</> : <><EyeOff className="w-3.5 h-3.5" /> غير منشور</>}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Student result strip */}
              {selectedStudent && (() => {
                const res = studentResultMap[ex.id];
                if (!res) {
                  return (
                    <div className="mx-4 mb-4 flex items-center gap-2 px-4 py-2.5 bg-gray-50 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 font-medium">
                      <span className="text-base">—</span>
                      لم يؤدِ <span className="font-bold text-gray-700">{selectedStudent.name}</span> هذا الاختبار بعد
                    </div>
                  );
                }
                const passed = res.score >= res.pass_score;
                const pct = res.total_score > 0 ? Math.round((res.score / res.total_score) * 100) : 0;
                return (
                  <div className={`mx-4 mb-4 flex items-center gap-3 px-4 py-2.5 rounded-xl border ${passed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    {passed
                      ? <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                      : <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold ${passed ? 'text-green-800' : 'text-red-800'}`}>
                        {selectedStudent.name} — {passed ? 'ناجح ✓' : 'راسب ✗'}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        الدرجة: <span className="font-black">{res.score}/{res.total_score}</span>
                        {' '}({pct}%) · ✓{res.correct_count} صح · ✗{res.wrong_count} خطأ
                        {' '}· {new Date(res.created_at).toLocaleDateString('ar-EG')}
                      </p>
                    </div>
                    <button
                      onClick={() => navigate(`/teacher/exam-review/${res.id}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-navy-700 hover:bg-navy-50 transition-colors flex-shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5" /> مراجعة
                    </button>
                  </div>
                );
              })()}

              {expandedExam === ex.id && (
                <div className="border-t border-gray-200 p-4 bg-gray-50 space-y-4">
                  {ex.question_source === 'bank' ? (
                    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-2">
                      <h4 className="font-black text-blue-800 flex items-center gap-2 text-sm">
                        🏦 هذا الاختبار يسحب أسئلته من بنك الأسئلة
                      </h4>
                      {(() => {
                        const bank = questionBanks.find(b => String(b.id) === String(ex.bank_id));
                        return bank ? (
                          <div className="text-sm text-blue-700 space-y-1">
                            <p><span className="font-bold">البنك:</span> {bank.name}{bank.subject ? ` (${bank.subject})` : ''}</p>
                            <p><span className="font-bold">عدد الأسئلة في البنك:</span> {bank.question_count} سؤال</p>
                            <p><span className="font-bold">عدد الأسئلة لكل طالب:</span> {ex.bank_question_count} سؤال عشوائي</p>
                            <p className="text-xs text-blue-500 mt-2">💡 كل طالب يحصل على مجموعة مختلفة من الأسئلة بشكل تلقائي وعشوائي</p>
                          </div>
                        ) : (
                          <p className="text-sm text-red-600 font-semibold">⚠️ البنك المرتبط لم يُعثر عليه — قد يكون محذوفاً، يُرجى تعديل الاختبار وإعادة ربطه ببنك</p>
                        );
                      })()}
                    </div>
                  ) : (
                  <>
                  <h4 className="font-bold text-navy-600 flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-orange-500" /> بنك الأسئلة ({questions.length})
                  </h4>

                  {questions.length > 0 && (() => {
                    const sum = questions.reduce((s, q) => s + (parseInt(q.points) || 0), 0);
                    if (sum !== parseInt(ex.total_score)) {
                      return (
                        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-300 rounded-xl text-sm text-amber-800 font-semibold">
                          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                          <span>⚠️ مجموع درجات الأسئلة (<span className="font-black">{sum}</span>) لا يساوي المجموع الكلي للاختبار (<span className="font-black">{ex.total_score}</span>) — تحقق من درجات الأسئلة</span>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {questions.map((q, qi) => (
                    <div key={q.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${q.question_type === 'true_false' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
                              {qTypeLabel(q.question_type)}
                            </span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">
                              {q.points} درجة
                            </span>
                          </div>
                          <p className="font-semibold text-navy-600 text-sm mb-2">س{qi + 1}: {q.question_text}</p>
                          {q.question_image_url && <img src={q.question_image_url} alt="question" className="w-40 h-24 object-cover rounded-lg mb-2" />}
                          <div className="grid grid-cols-2 gap-1 text-xs">
                              {(q.question_type === 'true_false' ? ['A', 'B'] : ['A', 'B', 'C', 'D']).map(opt => q[`option_${opt.toLowerCase()}`] && q[`option_${opt.toLowerCase()}`] !== '-' && (
                                <div key={opt} className={`p-1.5 rounded-lg font-semibold ${q.correct_answer_letter === opt ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                                  {opt}. {q[`option_${opt.toLowerCase()}`]}
                                </div>
                              ))}
                            </div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => {
                            setEditQ(q);
                            setQForm({ ...q, question_type: q.question_type || 'mcq' });
                            setImageFile(null);
                            setImagePreview('');
                            setImageInputMode(q.question_image_url?.startsWith('/uploads') ? 'file' : 'url');
                            if (imageFileRef.current) imageFileRef.current.value = '';
                          }} className="p-1.5 text-navy-600 hover:bg-navy-50 rounded-lg"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteQMut.mutate(q.id)} className="p-1.5 text-red-700 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Question form */}
                  <div className="bg-white rounded-xl p-4 shadow-sm border-2 border-dashed border-orange-300">
                    <h5 className="font-bold text-navy-600 mb-3 text-sm">{editQ ? 'تعديل السؤال' : '+ إضافة سؤال جديد'}</h5>
                    <form onSubmit={handleQSubmit} className="space-y-3">
                      {/* Question type selector */}
                      <div>
                        <label className="block text-xs font-bold text-navy-700 mb-1">نوع السؤال</label>
                        <div className="flex gap-2 flex-wrap">
                          {QUESTION_TYPES.map(t => (
                            <button key={t.value} type="button"
                              onClick={() => setQForm({ ...qForm, question_type: t.value, correct_answer_letter: 'A' })}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${qForm.question_type === t.value ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-navy-700 mb-1">نص السؤال <span className="text-gray-400 font-normal">(اختياري إذا وُجدت صورة)</span></label>
                        <textarea value={qForm.question_text} onChange={e => setQForm({ ...qForm, question_text: e.target.value })}
                          className="input-field h-16 resize-none text-sm" placeholder="اكتب نص السؤال هنا..." />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-navy-700 mb-1">صورة السؤال <span className="text-gray-400 font-normal">(اختياري)</span></label>
                        <div className="flex gap-2 mb-2">
                          <button type="button" onClick={() => { setImageInputMode('url'); setImageFile(null); setImagePreview(''); if (imageFileRef.current) imageFileRef.current.value = ''; }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${imageInputMode === 'url' ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-gray-200 text-gray-600'}`}>
                            <Link className="w-3.5 h-3.5" /> رابط URL
                          </button>
                          <button type="button" onClick={() => { setImageInputMode('file'); setQForm({ ...qForm, question_image_url: '' }); }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${imageInputMode === 'file' ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-gray-200 text-gray-600'}`}>
                            <Upload className="w-3.5 h-3.5" /> رفع صورة
                          </button>
                        </div>
                        {imageInputMode === 'url' ? (
                          <>
                            <input value={qForm.question_image_url || ''} onChange={e => setQForm({ ...qForm, question_image_url: e.target.value })}
                              className="input-field text-sm" placeholder="الصق رابط الصورة هنا..." dir="ltr" />
                            {qForm.question_image_url && (
                              <img src={qForm.question_image_url} alt="preview" className="mt-2 h-28 rounded-lg object-contain border border-gray-200" onError={e => e.target.style.display='none'} />
                            )}
                          </>
                        ) : (
                          <>
                            <input
                              ref={imageFileRef}
                              type="file"
                              accept="image/*"
                              onChange={e => {
                                const f = e.target.files[0];
                                if (f) {
                                  setImageFile(f);
                                  setImagePreview(URL.createObjectURL(f));
                                } else {
                                  setImageFile(null);
                                  setImagePreview('');
                                }
                              }}
                              className="block w-full text-sm text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 border border-gray-200 rounded-xl p-2 cursor-pointer"
                            />
                            {uploadProgress > 0 && uploadProgress < 100 && (
                              <div className="mt-2">
                                <div className="flex justify-between text-xs text-gray-500 mb-1">
                                  <span>جاري رفع الصورة...</span>
                                  <span className="font-bold text-orange-600">{uploadProgress}%</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                  <div
                                    className="h-2 bg-gradient-to-r from-orange-400 to-orange-600 rounded-full transition-all duration-300"
                                    style={{ width: `${uploadProgress}%` }}
                                  />
                                </div>
                              </div>
                            )}
                            {uploadProgress === 100 && (
                              <p className="mt-1 text-xs text-green-600 font-bold">✓ تم الرفع بنجاح</p>
                            )}
                            {imagePreview && (
                              <img src={imagePreview} alt="preview" className="mt-2 h-28 rounded-lg object-contain border border-gray-200" />
                            )}
                          </>
                        )}
                      </div>

                      {qForm.question_type === 'mcq' && (
                        <div className="grid grid-cols-2 gap-2">
                          {['A', 'B', 'C', 'D'].map(opt => (
                            <div key={opt} className="flex items-center gap-2">
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${qForm.correct_answer_letter === opt ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'}`}>{opt}</span>
                              <input value={qForm[`option_${opt.toLowerCase()}`] || ''} onChange={e => setQForm({ ...qForm, [`option_${opt.toLowerCase()}`]: e.target.value })}
                                className="input-field text-sm" placeholder={`الخيار ${opt}${opt === 'A' || opt === 'B' ? ' *' : ''}`} />
                            </div>
                          ))}
                        </div>
                      )}

                      {qForm.question_type === 'true_false' && (
                        <div className="flex gap-3">
                          {['A', 'B'].map((opt, i) => (
                            <button key={opt} type="button"
                              onClick={() => setQForm({ ...qForm, correct_answer_letter: opt })}
                              className={`flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition-all ${qForm.correct_answer_letter === opt ? 'border-green-500 bg-green-50 text-green-800' : 'border-gray-200 text-gray-600'}`}>
                              {i === 0 ? '✅ صح' : '❌ خطأ'}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-3">
                        {qForm.question_type === 'mcq' && (
                          <div className="flex items-center gap-2">
                            <label className="text-sm font-bold text-navy-700">الإجابة:</label>
                            <select value={qForm.correct_answer_letter} onChange={e => setQForm({ ...qForm, correct_answer_letter: e.target.value })} className="input-field w-20">
                              {['A', 'B', 'C', 'D'].map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <label className="text-sm font-bold text-navy-700">درجة:</label>
                          <input type="number" value={qForm.points} onChange={e => setQForm({ ...qForm, points: parseInt(e.target.value) || 1 })} className="input-field w-16" min={1} />
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {editQ && <button type="button" onClick={() => { setEditQ(null); setQForm(emptyQ); }} className="btn-secondary px-3 py-2 text-sm">إلغاء</button>}
                        <button type="submit" className="btn-primary text-sm" disabled={addQMut.isPending || updateQMut.isPending}>
                          {editQ ? 'تحديث السؤال' : 'إضافة السؤال'}
                        </button>
                      </div>
                    </form>
                  </div>
                  </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Exam modal */}
      <Modal open={modal} onClose={closeModal} title={editData ? 'تعديل الاختبار' : 'إنشاء اختبار جديد'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">عنوان الاختبار *</label>
            <input value={form.title} onChange={e => { setForm({ ...form, title: e.target.value }); clearError('title'); }}
              className={`input-field ${formErrors.title ? 'border-red-400 focus:ring-red-300' : ''}`} placeholder="مثال: اختبار الفصل الأول" />
            <FieldError error={formErrors.title} />
          </div>
          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">الكورس (اختياري)</label>
            <select value={form.course_id} onChange={e => setForm({ ...form, course_id: e.target.value })} className="input-field">
              <option value="">اختبار عام</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}{c.target_stage ? ` — ${c.target_stage}` : ''}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1">المدة (دقيقة) *</label>
              <input type="number" value={form.duration_minutes} onChange={e => { setForm({ ...form, duration_minutes: e.target.value }); clearError('duration_minutes'); }}
                className={`input-field ${formErrors.duration_minutes ? 'border-red-400 focus:ring-red-300' : ''}`} min="1" max="600" />
              <FieldError error={formErrors.duration_minutes} />
            </div>
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1">المجموع *</label>
              <input type="number" value={form.total_score} onChange={e => { setForm({ ...form, total_score: e.target.value }); clearError('total_score'); clearError('pass_score'); }}
                className={`input-field ${formErrors.total_score ? 'border-red-400 focus:ring-red-300' : ''}`} min="1" max="1000" />
              <FieldError error={formErrors.total_score} />
            </div>
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1">درجة النجاح *</label>
              <input type="number" value={form.pass_score} onChange={e => { setForm({ ...form, pass_score: e.target.value }); clearError('pass_score'); }}
                className={`input-field ${formErrors.pass_score ? 'border-red-400 focus:ring-red-300' : ''}`} min="0" />
              <FieldError error={formErrors.pass_score} />
            </div>
          </div>

          {/* Question source */}
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 space-y-3">
            <p className="text-sm font-black text-blue-800 flex items-center gap-1.5">📚 مصدر الأسئلة</p>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => setForm({ ...form, question_source: 'manual' })}
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl border-2 font-bold text-sm transition-all ${form.question_source !== 'bank' ? 'border-blue-500 bg-blue-100 text-blue-800' : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'}`}>
                <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${form.question_source !== 'bank' ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                  {form.question_source !== 'bank' && <span className="w-2.5 h-2.5 rounded-full bg-white block" />}
                </span>
                <div className="text-right flex-1">
                  <p className="font-bold">✍️ إضافة أسئلة يدوياً</p>
                  <p className="text-xs font-normal text-gray-500 mt-0.5">أنت تضيف الأسئلة بنفسك داخل الاختبار</p>
                </div>
              </button>
              <button type="button" onClick={() => setForm({ ...form, question_source: 'bank', shuffle_questions: false })}
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl border-2 font-bold text-sm transition-all ${form.question_source === 'bank' ? 'border-blue-500 bg-blue-100 text-blue-800' : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'}`}>
                <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${form.question_source === 'bank' ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                  {form.question_source === 'bank' && <span className="w-2.5 h-2.5 rounded-full bg-white block" />}
                </span>
                <div className="text-right flex-1">
                  <p className="font-bold">🏦 سحب عشوائي من بنك أسئلة</p>
                  <p className="text-xs font-normal text-gray-500 mt-0.5">كل طالب يحصل على أسئلة مختلفة من البنك تلقائياً</p>
                </div>
              </button>
            </div>
            {form.question_source === 'bank' && (
              <div className="space-y-3 pt-2 border-t border-blue-200">
                <div>
                  <label className="block text-xs font-bold text-blue-800 mb-1">اختر بنك الأسئلة *</label>
                  {questionBanks.length === 0 ? (
                    <p className="text-xs text-red-600 font-semibold bg-red-50 rounded-lg px-3 py-2">لا توجد بنوك أسئلة بعد — اذهب إلى صفحة "بنوك الأسئلة" أولاً لإنشاء بنك</p>
                  ) : (
                    <select value={form.bank_id} onChange={e => setForm({ ...form, bank_id: e.target.value })} className="input-field text-sm">
                      <option value="">— اختر بنكاً —</option>
                      {questionBanks.map(b => (
                        <option key={b.id} value={b.id}>{b.name}{b.subject ? ` (${b.subject})` : ''} — {b.question_count} سؤال</option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-blue-800 mb-1">عدد الأسئلة المسحوبة لكل طالب *</label>
                  <input type="number" min="1" max="200" value={form.bank_question_count}
                    onChange={e => setForm({ ...form, bank_question_count: parseInt(e.target.value) || 10 })}
                    className="input-field text-sm w-28" />
                  {form.bank_id && (() => {
                    const bank = questionBanks.find(b => String(b.id) === String(form.bank_id));
                    if (bank && form.bank_question_count > bank.question_count) {
                      return <p className="text-xs text-amber-600 font-semibold mt-1">⚠️ البنك يحتوي على {bank.question_count} سؤال فقط — سيتم سحب الكل</p>;
                    }
                    return null;
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Scheduling */}
          <div className="bg-orange-50 rounded-xl p-4 space-y-3 border border-orange-200">
            <p className="text-sm font-black text-orange-800 flex items-center gap-1.5">
              <Calendar className="w-4 h-4" /> جدولة الاختبار <span className="font-normal text-orange-600">(اختياري)</span>
            </p>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-xs font-bold text-navy-700 mb-1">📅 تاريخ وموعد البدء</label>
                <input
                  type="datetime-local"
                  dir="ltr"
                  value={form.start_date}
                  onChange={e => { setForm({ ...form, start_date: e.target.value }); clearError('end_date'); clearError('start_date'); }}
                  className="input-field text-sm"
                  style={{ colorScheme: 'light' }}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-navy-700 mb-1">🔒 تاريخ وموعد الانتهاء</label>
                <input
                  type="datetime-local"
                  dir="ltr"
                  value={form.end_date}
                  onChange={e => { setForm({ ...form, end_date: e.target.value }); clearError('end_date'); }}
                  className={`input-field text-sm ${formErrors.end_date ? 'border-red-400 focus:ring-red-300' : ''}`}
                  style={{ colorScheme: 'light' }}
                  min={form.start_date || undefined}
                />
                <FieldError error={formErrors.end_date} />
              </div>
            </div>
            {(form.start_date || form.end_date) && (
              <div className="bg-white rounded-lg px-3 py-2 border border-orange-200 text-xs text-orange-700 space-y-1">
                {form.start_date && <p>▶️ يبدأ: <span className="font-bold">{new Date(form.start_date).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}</span></p>}
                {form.end_date && <p>⏹️ ينتهي: <span className="font-bold">{new Date(form.end_date).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}</span></p>}
              </div>
            )}
            <p className="text-xs text-orange-600">إذا تركتها فارغة، سيكون الاختبار متاحاً في أي وقت</p>
          </div>

          {/* Anti-cheat shuffle options */}
          <div className="bg-purple-50 rounded-xl p-4 border border-purple-200 space-y-3">
            <p className="text-sm font-black text-purple-800 flex items-center gap-1.5">
              🔀 خيارات منع الغش <span className="font-normal text-purple-600">(اختياري)</span>
            </p>
            <div className="flex flex-col gap-2">
              {form.question_source !== 'bank' && (
              <button
                type="button"
                onClick={() => setForm({ ...form, shuffle_questions: !form.shuffle_questions })}
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl border-2 font-bold text-sm transition-all ${form.shuffle_questions ? 'border-purple-500 bg-purple-100 text-purple-800' : 'border-gray-200 bg-white text-gray-600 hover:border-purple-300'}`}
              >
                <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${form.shuffle_questions ? 'border-purple-500 bg-purple-500' : 'border-gray-300'}`}>
                  {form.shuffle_questions && <span className="text-white text-xs font-black">✓</span>}
                </span>
                <div className="text-right flex-1">
                  <p className="font-bold">🔀 عشوائية ترتيب الأسئلة</p>
                  <p className="text-xs font-normal text-gray-500 mt-0.5">كل طالب يشوف الأسئلة بترتيب مختلف — يمنع الغش بالترتيب</p>
                </div>
              </button>
              )}
              <button
                type="button"
                onClick={() => setForm({ ...form, shuffle_options: !form.shuffle_options })}
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl border-2 font-bold text-sm transition-all ${form.shuffle_options ? 'border-purple-500 bg-purple-100 text-purple-800' : 'border-gray-200 bg-white text-gray-600 hover:border-purple-300'}`}
              >
                <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${form.shuffle_options ? 'border-purple-500 bg-purple-500' : 'border-gray-300'}`}>
                  {form.shuffle_options && <span className="text-white text-xs font-black">✓</span>}
                </span>
                <div className="text-right flex-1">
                  <p className="font-bold">🔀 عشوائية ترتيب الإجابات</p>
                  <p className="text-xs font-normal text-gray-500 mt-0.5">كل طالب يشوف الإجابات بترتيب مختلف — يمنع الغش بحرف الإجابة</p>
                </div>
              </button>
            </div>
          </div>

          <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 space-y-3">
            <p className="text-sm font-black text-amber-800 flex items-center gap-1.5">⭐ نقاط المكافأة</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-amber-800 mb-1">نقاط لو قفل الامتحان ✅</label>
                <input type="number" min="0" max="9999" value={form.points_on_attempt}
                  onChange={e => setForm({ ...form, points_on_attempt: parseInt(e.target.value) || 0 })}
                  className="input-field text-sm" placeholder="0" />
                <p className="text-xs text-gray-500 mt-1">الطالب يكسبها لما يسلّم الامتحان — سواء نجح أو رسب</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-amber-800 mb-1">نقاط لو نجح في الامتحان 🏆</label>
                <input type="number" min="0" max="9999" value={form.points_on_pass}
                  onChange={e => setForm({ ...form, points_on_pass: parseInt(e.target.value) || 0 })}
                  className="input-field text-sm" placeholder="0" />
                <p className="text-xs text-gray-500 mt-1">تُضاف بس لو الطالب عدّى درجة النجاح</p>
              </div>
            </div>
            {(form.points_on_attempt > 0 || form.points_on_pass > 0) && (
              <div className="bg-amber-100 rounded-lg p-2.5 text-xs text-amber-800 font-bold space-y-1">
                {form.points_on_attempt > 0 && <p>✅ سلّم الامتحان (سواء نجح أو لأ) ← يكسب <span className="text-amber-900">{form.points_on_attempt} نقطة</span></p>}
                {form.points_on_pass > 0 && <p>🏆 نجح في الامتحان ← يكسب <span className="text-amber-900">{(form.points_on_attempt || 0) + form.points_on_pass} نقطة</span> إجمالاً</p>}
                {form.points_on_attempt === 0 && form.points_on_pass > 0 && <p className="text-gray-500 font-normal">مجرد التسليم بدون نجاح = 0 نقطة</p>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1">اسم الشارة</label>
              <input value={form.badge_name} onChange={e => setForm({ ...form, badge_name: e.target.value })} className="input-field" placeholder="مثال: متميز" />
            </div>
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1">لون الشارة</label>
              <input type="color" value={form.badge_color} onChange={e => setForm({ ...form, badge_color: e.target.value })} className="input-field h-10 p-1 cursor-pointer" />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={closeModal} className="flex-1 btn-secondary">إلغاء</button>
            <button type="submit" disabled={createMut.isPending || updateMut.isPending} className="flex-1 btn-primary">
              {editData ? 'حفظ التعديلات' : 'إنشاء الاختبار'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)}
        onConfirm={() => { deleteMut.mutate(deleteId); setDeleteId(null); }}
        title="حذف الاختبار" message="هل أنت متأكد من حذف هذا الاختبار وجميع أسئلته؟" danger />

      {/* ── Publish Confirmation Dialog ── */}
      {publishConfirm && (() => {
        const now = new Date();
        const endDate = publishConfirm.end_date ? new Date(publishConfirm.end_date) : null;
        const startDate = publishConfirm.start_date ? new Date(publishConfirm.start_date) : null;
        const isExpired = endDate && endDate < now;
        const hasResults = publishConfirm.attempt_count > 0;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setPublishConfirm(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Globe className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-black text-gray-900 text-lg">تأكيد نشر الاختبار</h3>
                  <p className="text-gray-500 text-sm">{publishConfirm.title}</p>
                </div>
              </div>

              {isExpired && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-red-700 text-sm font-bold">تاريخ انتهاء الاختبار مر بالفعل! يرجى تعديل تاريخ النهاية أولاً قبل النشر.</p>
                </div>
              )}

              {hasResults && !isExpired && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-amber-700 text-sm font-bold">سيتم مسح نتائج الطلاب السابقة ({publishConfirm.attempt_count} محاولة) حتى يتمكنوا من إعادة الاختبار.</p>
                </div>
              )}

              <div className="bg-gray-50 rounded-xl p-3 space-y-2 text-sm">
                {startDate && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">تاريخ البداية</span>
                    <span className="font-bold text-gray-700">{startDate.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                )}
                {endDate && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">تاريخ النهاية</span>
                    <span className={`font-bold ${isExpired ? 'text-red-600' : 'text-gray-700'}`}>{endDate.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                )}
                {!startDate && !endDate && (
                  <p className="text-gray-500 text-center">الاختبار بدون تاريخ محدد — متاح دائماً للطلاب</p>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setPublishConfirm(null)} className="flex-1 btn-secondary">إلغاء</button>
                <button
                  onClick={() => { if (!isExpired) publishMut.mutate({ id: publishConfirm.id }); }}
                  disabled={isExpired || publishMut.isPending}
                  className={`flex-1 font-bold py-2.5 rounded-xl transition-all ${isExpired ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600 text-white active:scale-95'}`}
                >
                  {publishMut.isPending ? 'جاري النشر...' : 'نشر الاختبار'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {forceResetConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center">
            <div className="text-5xl mb-3">⚠️</div>
            <h3 className="text-xl font-black text-red-700 mb-2">تحذير: مسح النتائج</h3>
            <p className="text-gray-600 mb-4">
              يوجد <span className="font-black text-red-600">{forceResetConfirm.count}</span> طالب أدوا هذا الاختبار بالفعل.
              إعادة النشر ستمسح نتائجهم نهائياً ولا يمكن التراجع عن ذلك.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setForceResetConfirm(null)} className="flex-1 btn-secondary">إلغاء</button>
              <button
                onClick={() => publishMut.mutate({ id: forceResetConfirm.id, force_reset: true })}
                disabled={publishMut.isPending}
                className="flex-1 font-bold py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white transition-all active:scale-95"
              >
                {publishMut.isPending ? 'جاري...' : 'نعم، امسح النتائج وأعد النشر'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
