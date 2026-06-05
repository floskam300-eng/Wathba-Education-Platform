import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  FileText, Plus, Pencil, Trash2, HelpCircle, ChevronDown, ChevronUp,
  Printer, Filter, Calendar, User, Eye, Search, AlertCircle,
  Globe, EyeOff, CheckCircle, XCircle,
} from 'lucide-react';
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

const emptyExam = {
  title: '', duration_minutes: 60, total_score: 100, course_id: '', pass_score: 50,
  badge_name: '', badge_color: '#995400', start_date: '', end_date: '',
  shuffle_questions: false, shuffle_options: false,
  question_source: 'manual', bank_id: '', bank_question_count: 10,
  points_on_attempt: 0, points_on_pass: 0,
  bank_easy_count: 0, bank_medium_count: 0, bank_hard_count: 0, use_difficulty_split: false,
};

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
  const baseRole = user?.role === 'assistant' ? 'assistant' : 'teacher';

  const [modal, setModal] = useState(false);
  const [editData, setEditData] = useState(null);
  const [form, setForm] = useState(emptyExam);
  const [deleteId, setDeleteId] = useState(null);
  const [expandedExam, setExpandedExam] = useState(null);
  const [stageFilter, setStageFilter] = useState('الكل');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  const [publishConfirm, setPublishConfirm] = useState(null);
  const [forceResetConfirm, setForceResetConfirm] = useState(null);
  const [formErrors, setFormErrors] = useState({});

  const { data: exams = [], isLoading } = useQuery({
    queryKey: ['exams'],
    queryFn: () => api.get('/exams').then(r => r.data),
  });

  const { data: courses = [] } = useQuery({
    queryKey: ['courses'],
    queryFn: () => api.get('/courses').then(r => r.data),
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
    if (ex.course_id) {
      const linkedCourse = courses.find(c => c.id === ex.course_id);
      if (linkedCourse && !linkedCourse.is_published) {
        toast.error('لا يمكن نشر الاختبار لأن الكورس المرتبط به غير منشور — انشر الكورس أولاً');
        return;
      }
    }
    if (ex.question_source !== 'bank' && parseInt(ex.question_count || 0) === 0) {
      toast.error('لا يمكن نشر اختبار بدون أسئلة — أضف أسئلة أولاً');
      return;
    }
    setPublishConfirm(ex);
  };

  const clearError = (field) => setFormErrors(prev => { const n = { ...prev }; delete n[field]; return n; });

  const openAdd = () => { setEditData(null); setForm(emptyExam); setFormErrors({}); setModal(true); };
  const openEdit = (e) => {
    setEditData(e);
    const easyC   = parseInt(e.bank_easy_count)   || 0;
    const mediumC = parseInt(e.bank_medium_count) || 0;
    const hardC   = parseInt(e.bank_hard_count)   || 0;
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
      bank_easy_count: easyC,
      bank_medium_count: mediumC,
      bank_hard_count: hardC,
      use_difficulty_split: (easyC + mediumC + hardC) > 0,
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
    acc[s] = exams.filter(ex => !ex.course_id || courseStageMap[ex.course_id] === s).length;
    return acc;
  }, {});

  const filteredExams = stageFilter === 'الكل'
    ? exams
    : exams.filter(ex => !ex.course_id || courseStageMap[ex.course_id] === stageFilter);

  const getScheduleStatus = (ex) => {
    const now = new Date();
    if (ex.start_date && new Date(ex.start_date) > now) return { label: '⏳ لم يبدأ', cls: 'bg-yellow-100 text-yellow-800' };
    if (ex.end_date && new Date(ex.end_date) < now) return { label: '🔒 انتهى', cls: 'bg-red-100 text-red-800' };
    if (ex.start_date || ex.end_date) return { label: '🟢 مفتوح', cls: 'bg-green-100 text-green-800' };
    return null;
  };

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

      {/* Stage filter */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-xs font-bold text-gray-500">تصفية حسب المرحلة الدراسية</span>
        </div>
        <div className="filter-scroll">
          {['الكل', ...STAGES].map(stage => (
            <button key={stage} onClick={() => setStageFilter(stage)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                stageFilter === stage ? 'bg-orange-500 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {stage}
              <span className={`text-xs rounded-full px-1.5 font-black ${stageFilter === stage ? 'bg-white/20 text-white' : 'bg-white text-gray-600'}`}>
                {stageCounts[stage] || 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Student filter */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <User className="w-4 h-4 text-gray-500" />
          <span className="text-xs font-bold text-gray-500">عرض نتائج طالب محدد</span>
          {selectedStudent && (
            <button onClick={() => { setSelectedStudent(null); setStudentSearch(''); }}
              className="mr-auto text-xs text-red-600 font-bold hover:underline">
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
                    <button key={s.id}
                      onMouseDown={() => { setSelectedStudent(s); setStudentSearch(''); setShowStudentDropdown(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-right transition-colors">
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

      {/* Exams list */}
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
          const isManual = ex.question_source !== 'bank';
          const isExpanded = expandedExam === ex.id;

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
                        {canManageExams && (
                          <button onClick={() => openEdit(ex)} className="p-1.5 text-navy-600 hover:bg-navy-50 rounded-lg" title="تعديل">
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {canManageExams && (
                          <button onClick={() => setDeleteId(ex.id)} className="p-1.5 text-red-700 hover:bg-red-50 rounded-lg" title="حذف">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        {/* For bank exams: toggle to show bank info inline */}
                        {!isManual && (
                          <button
                            onClick={() => setExpandedExam(isExpanded ? null : ex.id)}
                            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg"
                            title="معلومات البنك">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Badges */}
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {ex.course_name && <Badge variant="info">{ex.course_name}</Badge>}
                      {courseStageMap[ex.course_id] && (
                        <span className="text-xs bg-purple-50 text-purple-700 font-bold px-2 py-0.5 rounded-full">{courseStageMap[ex.course_id]}</span>
                      )}
                      <Badge variant="navy">⏱ {ex.duration_minutes} د</Badge>
                      <Badge variant="warning">📝 {ex.question_count} س</Badge>
                      <Badge variant="gray">{ex.total_score} درجة</Badge>
                      <Badge variant="success">{ex.attempt_count} محاولة</Badge>
                      {scheduleStatus && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scheduleStatus.cls}`}>{scheduleStatus.label}</span>
                      )}
                      {!isManual && (
                        <span className="text-xs bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded-full">🏦 بنك أسئلة</span>
                      )}
                    </div>

                    {(ex.start_date || ex.end_date) && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                        <Calendar className="w-3 h-3 flex-shrink-0" />
                        {ex.start_date && <span className="truncate">من: {new Date(ex.start_date).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</span>}
                        {ex.end_date && <span className="truncate">· حتى: {new Date(ex.end_date).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</span>}
                      </div>
                    )}

                    {/* Publish toggle */}
                    <div className="mt-2">
                      <button
                        onClick={() => handlePublishClick(ex)}
                        disabled={publishMut.isPending}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                          ex.is_published
                            ? 'bg-green-50 hover:bg-red-50 text-green-700 hover:text-red-600 border border-green-200 hover:border-red-200'
                            : 'bg-gray-100 hover:bg-green-600 text-gray-600 hover:text-white border border-gray-200 hover:border-green-600'
                        }`}>
                        {ex.is_published
                          ? <><EyeOff className="w-3 h-3" /> منشور — اضغط لإلغاء النشر</>
                          : <><Globe className="w-3 h-3" /> نشر للطلاب</>}
                      </button>
                    </div>

                    {/* Manage Questions button — manual exams only */}
                    {isManual && canManageExams && (
                      <div className="mt-2">
                        <button
                          onClick={() => navigate(`/${baseRole}/exams/${ex.id}/questions`)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all bg-orange-50 hover:bg-orange-500 hover:text-white text-orange-700 border border-orange-200 hover:border-orange-500">
                          <HelpCircle className="w-3.5 h-3.5" />
                          إدارة الأسئلة
                          {parseInt(ex.question_count || 0) > 0 && (
                            <span className="bg-orange-200 hover:bg-white/20 text-orange-800 hover:text-white px-1.5 rounded-full font-black text-[10px] transition-colors">
                              {ex.question_count}
                            </span>
                          )}
                        </button>
                      </div>
                    )}
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
                      : <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />}
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
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-navy-700 hover:bg-navy-50 transition-colors flex-shrink-0">
                      <Eye className="w-3.5 h-3.5" /> مراجعة
                    </button>
                  </div>
                );
              })()}

              {/* Bank info — only for bank exams when expanded */}
              {!isManual && isExpanded && (
                <div className="border-t border-gray-200 p-4 bg-gray-50">
                  <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-2">
                    <h4 className="font-black text-blue-800 flex items-center gap-2 text-sm">
                      🏦 هذا الاختبار يسحب أسئلته من بنك الأسئلة
                    </h4>
                    {(() => {
                      const bank = questionBanks.find(b => String(b.id) === String(ex.bank_id));
                      const easyC   = parseInt(ex.bank_easy_count)   || 0;
                      const mediumC = parseInt(ex.bank_medium_count) || 0;
                      const hardC   = parseInt(ex.bank_hard_count)   || 0;
                      const useDiff = (easyC + mediumC + hardC) > 0;
                      return bank ? (
                        <div className="text-sm text-blue-700 space-y-1">
                          <p><span className="font-bold">البنك:</span> {bank.name}{bank.subject ? ` (${bank.subject})` : ''}</p>
                          <p>
                            <span className="font-bold">عدد الأسئلة في البنك:</span> {bank.question_count} سؤال
                            {' '}(<span className="text-green-600">{bank.easy_count || 0} سهل</span> · <span className="text-yellow-600">{bank.medium_count || 0} متوسط</span> · <span className="text-red-600">{bank.hard_count || 0} صعب</span>)
                          </p>
                          {useDiff ? (
                            <p>
                              <span className="font-bold">توزيع الأسئلة لكل طالب:</span>
                              {' '}<span className="text-green-700 font-bold">{easyC} سهل</span> +
                              {' '}<span className="text-yellow-700 font-bold">{mediumC} متوسط</span> +
                              {' '}<span className="text-red-700 font-bold">{hardC} صعب</span>
                              {' '}= {easyC + mediumC + hardC} سؤال
                            </p>
                          ) : (
                            <p><span className="font-bold">عدد الأسئلة لكل طالب:</span> {ex.bank_question_count} سؤال عشوائي</p>
                          )}
                          <p className="text-xs text-blue-500 mt-2">💡 كل طالب يحصل على مجموعة مختلفة من الأسئلة بشكل تلقائي وعشوائي</p>
                        </div>
                      ) : (
                        <p className="text-sm text-red-600 font-semibold">⚠️ البنك المرتبط لم يُعثر عليه — قد يكون محذوفاً، يُرجى تعديل الاختبار وإعادة ربطه ببنك</p>
                      );
                    })()}
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
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl border-2 font-bold text-sm transition-all ${
                  form.question_source !== 'bank'
                    ? 'border-blue-500 bg-blue-100 text-blue-800'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'
                }`}>
                <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${form.question_source !== 'bank' ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                  {form.question_source !== 'bank' && <span className="w-2.5 h-2.5 rounded-full bg-white block" />}
                </span>
                <div className="text-right flex-1">
                  <p className="font-bold">✍️ إضافة أسئلة يدوياً</p>
                  <p className="text-xs font-normal text-gray-500 mt-0.5">أنت تضيف الأسئلة بنفسك داخل الاختبار</p>
                </div>
              </button>
              <button type="button" onClick={() => setForm({ ...form, question_source: 'bank', shuffle_questions: false })}
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl border-2 font-bold text-sm transition-all ${
                  form.question_source === 'bank'
                    ? 'border-blue-500 bg-blue-100 text-blue-800'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'
                }`}>
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

                {/* Difficulty split toggle */}
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!form.use_difficulty_split}
                      onChange={e => setForm({ ...form, use_difficulty_split: e.target.checked, bank_easy_count: 0, bank_medium_count: 0, bank_hard_count: 0, bank_question_count: 10 })}
                      className="w-4 h-4 accent-blue-600" />
                    <span className="text-xs font-bold text-blue-800">توزيع حسب المستوى (سهل / متوسط / صعب)</span>
                  </label>
                </div>

                {form.use_difficulty_split ? (
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'bank_easy_count', label: '🟢 سهل', color: 'text-green-700' },
                      { key: 'bank_medium_count', label: '🟡 متوسط', color: 'text-yellow-700' },
                      { key: 'bank_hard_count', label: '🔴 صعب', color: 'text-red-700' },
                    ].map(({ key, label, color }) => (
                      <div key={key}>
                        <label className={`block text-xs font-bold mb-1 ${color}`}>{label}</label>
                        <input type="number" min="0" value={form[key]}
                          onChange={e => setForm({ ...form, [key]: parseInt(e.target.value) || 0 })}
                          className="input-field text-sm" placeholder="0" />
                      </div>
                    ))}
                    {(form.bank_easy_count + form.bank_medium_count + form.bank_hard_count) > 0 && (
                      <div className="col-span-3 text-xs text-blue-700 font-bold bg-blue-100 rounded-lg px-3 py-1.5">
                        إجمالي الأسئلة لكل طالب: {form.bank_easy_count + form.bank_medium_count + form.bank_hard_count}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-blue-800 mb-1">عدد الأسئلة لكل طالب *</label>
                    <input type="number" min="1" value={form.bank_question_count}
                      onChange={e => setForm({ ...form, bank_question_count: parseInt(e.target.value) || 10 })}
                      className="input-field text-sm" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Shuffle options (only for manual) — nice toggle cards */}
          {form.question_source !== 'bank' && (
            <div>
              <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">خيارات الخلط</p>
              <div className="grid grid-cols-2 gap-3">
                {/* Shuffle Questions Card */}
                <button type="button"
                  onClick={() => setForm({ ...form, shuffle_questions: !form.shuffle_questions })}
                  className={`flex items-start gap-3 p-3 sm:p-4 rounded-2xl border-2 text-right transition-all ${
                    form.shuffle_questions
                      ? 'border-orange-400 bg-orange-50 shadow-sm shadow-orange-100'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}>
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 transition-all ${
                    form.shuffle_questions ? 'bg-orange-500' : 'bg-gray-100'
                  }`}>🔀</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <span className={`font-black text-xs sm:text-sm leading-tight ${form.shuffle_questions ? 'text-orange-800' : 'text-navy-700'}`}>
                        خلط الأسئلة
                      </span>
                      <span className={`text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none ${
                        form.shuffle_questions ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-500'
                      }`}>
                        {form.shuffle_questions ? 'مفعّل' : 'معطّل'}
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-gray-500 leading-relaxed hidden sm:block">
                      كل طالب يشوف الأسئلة بترتيب مختلف
                    </p>
                  </div>
                </button>

                {/* Shuffle Options Card */}
                <button type="button"
                  onClick={() => setForm({ ...form, shuffle_options: !form.shuffle_options })}
                  className={`flex items-start gap-3 p-3 sm:p-4 rounded-2xl border-2 text-right transition-all ${
                    form.shuffle_options
                      ? 'border-indigo-400 bg-indigo-50 shadow-sm shadow-indigo-100'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}>
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 transition-all ${
                    form.shuffle_options ? 'bg-indigo-500' : 'bg-gray-100'
                  }`}>🎲</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <span className={`font-black text-xs sm:text-sm leading-tight ${form.shuffle_options ? 'text-indigo-800' : 'text-navy-700'}`}>
                        خلط الإجابات
                      </span>
                      <span className={`text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none ${
                        form.shuffle_options ? 'bg-indigo-500 text-white' : 'bg-gray-200 text-gray-500'
                      }`}>
                        {form.shuffle_options ? 'مفعّل' : 'معطّل'}
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-gray-500 leading-relaxed hidden sm:block">
                      ترتيب الخيارات يتغير لكل طالب
                    </p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1">تاريخ البداية</label>
              <input type="datetime-local" value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })}
                className="input-field text-sm" />
            </div>
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1">تاريخ النهاية</label>
              <input type="datetime-local" value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })}
                className="input-field text-sm" />
            </div>
          </div>

          {/* Points */}
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

          {/* Badge */}
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

      {/* Publish Confirmation Dialog */}
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
                  className={`flex-1 font-bold py-2.5 rounded-xl transition-all ${isExpired ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600 text-white active:scale-95'}`}>
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
                className="flex-1 font-bold py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white transition-all active:scale-95">
                {publishMut.isPending ? 'جاري...' : 'نعم، امسح النتائج وأعد النشر'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
