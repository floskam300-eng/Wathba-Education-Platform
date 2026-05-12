import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Pencil, Trash2, HelpCircle, ChevronDown, ChevronUp, Printer, Filter, Calendar, User, Eye, Search, AlertCircle, Globe, EyeOff, Upload, Link } from 'lucide-react';
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

const STAGES = ['الصف الأول الثانوي', 'الصف الثاني الثانوي', 'الصف الثالث الثانوي', 'الصف الأول الإعدادي', 'الصف الثاني الإعدادي', 'الصف الثالث الإعدادي', 'جامعي'];

const emptyExam = { title: '', duration_minutes: 60, total_score: 100, course_id: '', pass_score: 50, badge_name: '', badge_color: '#995400', start_date: '', end_date: '' };
const emptyQ = { question_text: '', question_image_url: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer_letter: 'A', points: 1, question_type: 'mcq', essay_answer_key: '' };

const QUESTION_TYPES = [
  { value: 'mcq', label: '🔘 اختيار متعدد (MCQ)' },
  { value: 'true_false', label: '✅ صح / خطأ' },
  { value: 'essay', label: '📝 مقالي' },
];

const fmtDateLocal = (iso) => {
  if (!iso) return '';
  return iso.slice(0, 16);
};

export default function TeacherExams() {
  const qc = useQueryClient();
  const navigate = useNavigate();
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
  const imageFileRef = useRef(null);

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
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/exams/${id}`),
    onSuccess: () => { qc.invalidateQueries(['exams']); toast.success('تم حذف الاختبار'); },
  });

  const publishMut = useMutation({
    mutationFn: (id) => api.put(`/exams/${id}/publish`),
    onSuccess: () => { qc.invalidateQueries(['exams']); },
    onError: () => toast.error('حدث خطأ'),
  });

  const addQMut = useMutation({
    mutationFn: ({ id, data }) => api.post(`/exams/${id}/questions`, data),
    onSuccess: () => {
      qc.invalidateQueries(['questions', expandedExam]);
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
    onSuccess: () => { qc.invalidateQueries(['questions', expandedExam]); toast.success('تم حذف السؤال'); },
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
        const res = await api.post('/exams/upload-question-image', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        finalImageUrl = res.data.url;
      } catch {
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
    const headers = ['العنوان', 'الكورس', 'المدة', 'الأسئلة', 'المجموع', 'المحاولات'];
    const data = exams.map(ex => [
      ex.title, ex.course_name || 'عام', ex.duration_minutes.toString(),
      ex.question_count.toString(), ex.total_score.toString(), ex.attempt_count.toString()
    ]);
    generatePDFReport('تقرير الاختبارات', headers, data, 'exams_report.pdf');
  };

  const courseStageMap = {};
  courses.forEach(c => { if (c.id) courseStageMap[c.id] = c.target_stage; });

  const stageCounts = ['الكل', ...STAGES].reduce((acc, s) => {
    if (s === 'الكل') { acc[s] = exams.length; return acc; }
    acc[s] = exams.filter(ex => courseStageMap[ex.course_id] === s).length;
    return acc;
  }, {});

  const filteredExams = stageFilter === 'الكل'
    ? exams
    : exams.filter(ex => courseStageMap[ex.course_id] === stageFilter);

  const getScheduleStatus = (ex) => {
    const now = new Date();
    if (ex.start_date && new Date(ex.start_date) > now) return { label: '⏳ لم يبدأ', cls: 'bg-yellow-100 text-yellow-800' };
    if (ex.end_date && new Date(ex.end_date) < now) return { label: '🔒 انتهى', cls: 'bg-red-100 text-red-800' };
    if (ex.start_date || ex.end_date) return { label: '🟢 مفتوح', cls: 'bg-green-100 text-green-800' };
    return null;
  };

  const qTypeLabel = (t) => ({ mcq: 'MCQ', true_false: 'صح/خطأ', essay: 'مقالي' })[t] || 'MCQ';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-navy-600 flex items-center gap-2">
          <FileText className="w-7 h-7 text-orange-500" /> الاختبارات
          <span className="text-sm font-semibold text-gray-600">({exams.length})</span>
        </h1>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="btn-secondary flex items-center gap-2">
            <Printer className="w-4 h-4" /> طباعة
          </button>
          <button onClick={openAdd} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> إضافة اختبار
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-xs font-bold text-gray-500">تصفية حسب المرحلة الدراسية</span>
        </div>
        <div className="flex flex-wrap gap-2">
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
              <div className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-700 rounded-xl flex items-center justify-center flex-shrink-0">
                  <FileText className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-navy-600">{ex.title}</h3>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {ex.course_name && <Badge variant="info">{ex.course_name}</Badge>}
                    {courseStageMap[ex.course_id] && <span className="text-xs bg-purple-50 text-purple-700 font-bold px-2 py-0.5 rounded-full">{courseStageMap[ex.course_id]}</span>}
                    <Badge variant="navy">⏱ {ex.duration_minutes} دقيقة</Badge>
                    <Badge variant="warning">📝 {ex.question_count} سؤال</Badge>
                    <Badge variant="gray">المجموع: {ex.total_score}</Badge>
                    <Badge variant="success">محاولات: {ex.attempt_count}</Badge>
                    {scheduleStatus && <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scheduleStatus.cls}`}>{scheduleStatus.label}</span>}
                  </div>
                  {(ex.start_date || ex.end_date) && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                      <Calendar className="w-3 h-3" />
                      {ex.start_date && <span>من: {new Date(ex.start_date).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</span>}
                      {ex.end_date && <span>· حتى: {new Date(ex.end_date).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</span>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => publishMut.mutate(ex.id)}
                    disabled={publishMut.isPending}
                    title={ex.is_published ? 'إلغاء النشر' : 'نشر للطلاب'}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${ex.is_published ? 'bg-green-50 border-green-300 text-green-700 hover:bg-red-50 hover:border-red-300 hover:text-red-600' : 'bg-gray-100 border-gray-200 text-gray-500 hover:bg-green-50 hover:border-green-300 hover:text-green-700'}`}>
                    {ex.is_published ? <><Globe className="w-3.5 h-3.5" /> منشور</> : <><EyeOff className="w-3.5 h-3.5" /> غير منشور</>}
                  </button>
                  <button onClick={() => openEdit(ex)} className="p-2 text-navy-600 hover:bg-navy-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => setDeleteId(ex.id)} className="p-2 text-red-700 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  <button onClick={() => setExpandedExam(expandedExam === ex.id ? null : ex.id)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg">
                    {expandedExam === ex.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
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
                  <h4 className="font-bold text-navy-600 flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-orange-500" /> بنك الأسئلة ({questions.length})
                  </h4>

                  {questions.map((q, qi) => (
                    <div key={q.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${q.question_type === 'essay' ? 'bg-blue-100 text-blue-700' : q.question_type === 'true_false' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
                              {qTypeLabel(q.question_type)}
                            </span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">
                              {q.points} درجة
                            </span>
                          </div>
                          <p className="font-semibold text-navy-600 text-sm mb-2">س{qi + 1}: {q.question_text}</p>
                          {q.question_image_url && <img src={q.question_image_url} alt="question" className="w-40 h-24 object-cover rounded-lg mb-2" />}
                          {q.question_type === 'essay' ? (
                            <div className="bg-blue-50 rounded-lg p-2 text-xs text-blue-700">
                              <span className="font-bold">نموذج الإجابة: </span>{q.essay_answer_key || '(لم يُحدد)'}
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-1 text-xs">
                              {(q.question_type === 'true_false' ? ['A', 'B'] : ['A', 'B', 'C', 'D']).map(opt => q[`option_${opt.toLowerCase()}`] && q[`option_${opt.toLowerCase()}`] !== '-' && (
                                <div key={opt} className={`p-1.5 rounded-lg font-semibold ${q.correct_answer_letter === opt ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                                  {opt}. {q[`option_${opt.toLowerCase()}`]}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => {
                            setEditQ(q);
                            setQForm({ ...q, question_type: q.question_type || 'mcq' });
                            setImageFile(null);
                            setImagePreview('');
                            setImageInputMode(q.question_image_url ? 'url' : 'url');
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

                      {qForm.question_type === 'essay' && (
                        <div>
                          <label className="block text-xs font-bold text-navy-700 mb-1">نموذج الإجابة (للمراجعة)</label>
                          <textarea value={qForm.essay_answer_key || ''} onChange={e => setQForm({ ...qForm, essay_answer_key: e.target.value })}
                            className="input-field h-16 resize-none text-sm" placeholder="اكتب نموذج الإجابة المتوقعة هنا..." />
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
          <div className="grid grid-cols-3 gap-3">
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
    </div>
  );
}
