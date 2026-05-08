import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, Plus, Pencil, Trash2, Video, FileText, Users,
  ChevronDown, ChevronUp, GraduationCap, Filter, Upload,
  X, Loader2, Play, FolderOpen, FolderPlus, Check,
  Bell, CheckCircle, XCircle, Clock
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Badge from '../../components/ui/Badge';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import axios from 'axios';

const STAGES = ['الصف الأول الثانوي', 'الصف الثاني الثانوي', 'الصف الثالث الثانوي', 'الصف الأول الإعدادي', 'الصف الثاني الإعدادي', 'الصف الثالث الإعدادي', 'جامعي'];
const emptyForm = { name: '', description: '', price: '', thumbnail_url: '', target_stage: '' };

const STAGE_COLORS = {
  'الصف الأول الثانوي': 'bg-blue-50 text-blue-700',
  'الصف الثاني الثانوي': 'bg-indigo-50 text-indigo-700',
  'الصف الثالث الثانوي': 'bg-purple-50 text-purple-700',
  'الصف الأول الإعدادي': 'bg-green-50 text-green-700',
  'الصف الثاني الإعدادي': 'bg-teal-50 text-teal-700',
  'الصف الثالث الإعدادي': 'bg-cyan-50 text-cyan-700',
  'جامعي': 'bg-orange-50 text-orange-700',
};

function UploadProgress({ progress, fileName, onCancel }) {
  return (
    <div className="bg-navy-50 border border-navy-200 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-navy-700 truncate flex-1 ml-2">{fileName}</p>
        {onCancel && <button onClick={onCancel}><X className="w-4 h-4 text-gray-500" /></button>}
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div className="h-2 rounded-full bg-gradient-to-r from-navy-500 to-orange-500 transition-all duration-300"
          style={{ width: `${progress}%` }} />
      </div>
      <p className="text-[11px] text-gray-500 mt-1 text-left">{progress}%</p>
    </div>
  );
}

function VideoUploadSection({ courseId, onSuccess, sections = [] }) {
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const fileRef = useRef();
  const controllerRef = useRef(null);

  const MAX_SIZE_MB = 300;

  const handleUpload = async () => {
    if (!file) return toast.error('اختر ملف فيديو');
    if (!title.trim()) return toast.error('أدخل عنوان الفيديو');
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return toast.error(`حجم الفيديو يجب أن يكون أقل من ${MAX_SIZE_MB} MB`);
    }
    const fd = new FormData();
    fd.append('video', file);
    fd.append('title', title);
    fd.append('duration_minutes', duration || '0');
    if (sectionId) fd.append('section_id', sectionId);
    setUploading(true);
    setProcessing(false);
    setProgress(0);
    controllerRef.current = new AbortController();
    try {
      const token = localStorage.getItem('wathba_token');
      await axios.post(`/api/courses/${courseId}/videos/upload`, fd, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controllerRef.current.signal,
        onUploadProgress: e => {
          const pct = Math.round((e.loaded / e.total) * 100);
          setProgress(pct);
          if (pct >= 100) setProcessing(true);
        },
      });
      toast.success('تم رفع الفيديو بنجاح ✅');
      setTitle(''); setDuration(''); setFile(null); setProgress(0); setProcessing(false);
      if (fileRef.current) fileRef.current.value = '';
      onSuccess();
    } catch (e) {
      if (axios.isCancel(e)) {
        toast('تم إلغاء الرفع', { icon: '⚠️' });
      } else {
        toast.error(e.response?.data?.error || 'فشل رفع الفيديو — تحقق من حجم الملف والاتصال');
      }
      setProgress(0);
      setProcessing(false);
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = () => {
    controllerRef.current?.abort();
  };

  return (
    <div className="space-y-3 bg-gray-50 rounded-xl p-4 border border-dashed border-gray-300">
      <p className="text-xs font-black text-gray-500 uppercase tracking-wide">رفع فيديو جديد</p>
      <div className="grid grid-cols-2 gap-2">
        <input value={title} onChange={e => setTitle(e.target.value)}
          className="input-field col-span-2" placeholder="عنوان الفيديو *" disabled={uploading} />
        <input type="number" value={duration} onChange={e => setDuration(e.target.value)}
          className="input-field" placeholder="المدة (دقائق)" disabled={uploading} />
        {sections.length > 0 && (
          <select value={sectionId} onChange={e => setSectionId(e.target.value)} className="input-field" disabled={uploading}>
            <option value="">— بدون فصل —</option>
            {sections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        )}
        <label className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 cursor-pointer transition-all text-sm font-bold
          ${uploading ? 'opacity-50 cursor-not-allowed' : ''}
          ${file ? 'border-green-400 bg-green-50 text-green-700' : 'border-dashed border-gray-300 bg-white text-gray-500 hover:border-orange-400 hover:text-orange-500'}`}>
          <Video className="w-4 h-4 flex-shrink-0" />
          <span className="truncate text-xs">{file ? `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)` : 'اختر فيديو (max 300 MB)'}</span>
          <input ref={fileRef} type="file" accept="video/*" className="hidden" disabled={uploading}
            onChange={e => setFile(e.target.files[0] || null)} />
        </label>
      </div>
      {uploading && (
        <div className="bg-navy-50 border border-navy-200 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-navy-700 truncate flex-1 ml-2">
              {processing ? '⚙️ جارٍ المعالجة والحفظ...' : file?.name}
            </p>
            <button onClick={handleCancel} className="text-gray-400 hover:text-red-500 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
            <div className={`h-2.5 rounded-full transition-all duration-500 ${processing ? 'animate-pulse bg-orange-400' : 'bg-gradient-to-r from-navy-500 to-orange-500'}`}
              style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[11px] text-gray-500 mt-1.5 flex justify-between">
            <span>{processing ? 'تم الإرسال، انتظر قليلاً...' : `${progress}% مُرفوع`}</span>
            <span className="font-bold text-navy-600">{processing ? '✓ 100%' : `${progress}%`}</span>
          </p>
        </div>
      )}
      <button onClick={handleUpload} disabled={uploading || !file}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
        {uploading
          ? <><Loader2 className="w-4 h-4 animate-spin" /> {processing ? 'جارٍ المعالجة...' : 'جارٍ الرفع...'}</>
          : <><Upload className="w-4 h-4" /> رفع الفيديو</>}
      </button>
    </div>
  );
}

function PdfUploadSection({ courseId, onSuccess, sections = [] }) {
  const [title, setTitle] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const fileRef = useRef();
  const controllerRef = useRef(null);

  const handleUpload = async () => {
    if (!file) return toast.error('اختر ملف PDF');
    if (!title.trim()) return toast.error('أدخل عنوان الملف');
    if (file.size > 50 * 1024 * 1024) return toast.error('حجم الملف يجب أن يكون أقل من 50 MB');
    const fd = new FormData();
    fd.append('pdf', file);
    fd.append('title', title);
    if (sectionId) fd.append('section_id', sectionId);
    setUploading(true);
    setProcessing(false);
    setProgress(0);
    controllerRef.current = new AbortController();
    try {
      const token = localStorage.getItem('wathba_token');
      await axios.post(`/api/courses/${courseId}/pdfs/upload`, fd, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controllerRef.current.signal,
        onUploadProgress: e => {
          const pct = Math.round((e.loaded / e.total) * 100);
          setProgress(pct);
          if (pct >= 100) setProcessing(true);
        },
      });
      toast.success('تم رفع الملف بنجاح ✅');
      setTitle(''); setFile(null); setProgress(0); setProcessing(false);
      if (fileRef.current) fileRef.current.value = '';
      onSuccess();
    } catch (e) {
      if (axios.isCancel(e)) {
        toast('تم إلغاء الرفع', { icon: '⚠️' });
      } else {
        toast.error(e.response?.data?.error || 'فشل رفع الملف');
      }
      setProgress(0);
      setProcessing(false);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3 bg-gray-50 rounded-xl p-4 border border-dashed border-gray-300">
      <p className="text-xs font-black text-gray-500 uppercase tracking-wide">رفع ملف PDF جديد</p>
      <div className="grid grid-cols-2 gap-2">
        <input value={title} onChange={e => setTitle(e.target.value)}
          className="input-field col-span-2" placeholder="عنوان الملف *" disabled={uploading} />
        {sections.length > 0 && (
          <select value={sectionId} onChange={e => setSectionId(e.target.value)} className="input-field col-span-2" disabled={uploading}>
            <option value="">— بدون فصل —</option>
            {sections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        )}
        <label className={`col-span-2 flex items-center gap-2 px-3 py-2 rounded-xl border-2 cursor-pointer transition-all text-sm font-bold
          ${uploading ? 'opacity-50 cursor-not-allowed' : ''}
          ${file ? 'border-green-400 bg-green-50 text-green-700' : 'border-dashed border-gray-300 bg-white text-gray-500 hover:border-orange-400 hover:text-orange-500'}`}>
          <FileText className="w-4 h-4 flex-shrink-0" />
          <span className="truncate text-xs">{file ? `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)` : 'اختر ملف PDF (max 50 MB)'}</span>
          <input ref={fileRef} type="file" accept="application/pdf" className="hidden" disabled={uploading}
            onChange={e => setFile(e.target.files[0] || null)} />
        </label>
      </div>
      {uploading && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-orange-700 truncate flex-1 ml-2">
              {processing ? '⚙️ جارٍ المعالجة...' : file?.name}
            </p>
            <button onClick={() => controllerRef.current?.abort()} className="text-gray-400 hover:text-red-500">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div className={`h-2 rounded-full transition-all duration-500 ${processing ? 'animate-pulse bg-orange-300' : 'bg-orange-500'}`}
              style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[11px] text-gray-500 mt-1 text-left">{processing ? 'تم الإرسال، جارٍ الحفظ...' : `${progress}%`}</p>
        </div>
      )}
      <button onClick={handleUpload} disabled={uploading || !file}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
        {uploading
          ? <><Loader2 className="w-4 h-4 animate-spin" /> {processing ? 'جارٍ المعالجة...' : 'جارٍ الرفع...'}</>
          : <><Upload className="w-4 h-4" /> رفع الملف</>}
      </button>
    </div>
  );
}

export default function TeacherCourses() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [editData, setEditData] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState(null);
  const [expandedCourse, setExpandedCourse] = useState(null);
  const [contentTab, setContentTab] = useState('videos');
  const [stageFilter, setStageFilter] = useState('الكل');
  const [deleteVideoId, setDeleteVideoId] = useState(null);
  const [deletePdfId, setDeletePdfId] = useState(null);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [editingSectionTitle, setEditingSectionTitle] = useState('');

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['courses'],
    queryFn: () => api.get('/courses').then(r => r.data),
  });

  const { data: content } = useQuery({
    queryKey: ['course-content', expandedCourse],
    queryFn: () => api.get(`/courses/${expandedCourse}/content`).then(r => r.data),
    enabled: !!expandedCourse,
  });

  const { data: enrollRequests = [] } = useQuery({
    queryKey: ['enrollment-requests'],
    queryFn: () => api.get('/courses/enrollment-requests').then(r => r.data),
  });

  const handleRequestMut = useMutation({
    mutationFn: ({ id, action }) => api.put(`/courses/enrollment-requests/${id}`, { action }),
    onSuccess: (_, { action }) => {
      qc.invalidateQueries(['enrollment-requests']);
      toast.success(action === 'approve' ? 'تم قبول الطالب في الكورس' : 'تم رفض الطلب');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const createMut = useMutation({
    mutationFn: (data) => api.post('/courses', data),
    onSuccess: () => { qc.invalidateQueries(['courses']); toast.success('تم إنشاء الكورس'); closeModal(); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/courses/${id}`, data),
    onSuccess: () => { qc.invalidateQueries(['courses']); toast.success('تم تحديث الكورس'); closeModal(); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/courses/${id}`),
    onSuccess: () => { qc.invalidateQueries(['courses']); toast.success('تم حذف الكورس'); },
  });

  const deleteVideoMut = useMutation({
    mutationFn: ({ courseId, videoId }) => api.delete(`/courses/${courseId}/videos/${videoId}`),
    onSuccess: () => { qc.invalidateQueries(['course-content', expandedCourse]); qc.invalidateQueries(['courses']); toast.success('تم حذف الفيديو'); setDeleteVideoId(null); },
  });

  const deletePdfMut = useMutation({
    mutationFn: ({ courseId, pdfId }) => api.delete(`/courses/${courseId}/pdfs/${pdfId}`),
    onSuccess: () => { qc.invalidateQueries(['course-content', expandedCourse]); qc.invalidateQueries(['courses']); toast.success('تم حذف الملف'); setDeletePdfId(null); },
  });

  const createSectionMut = useMutation({
    mutationFn: ({ courseId, title }) => api.post(`/courses/${courseId}/sections`, { title }),
    onSuccess: () => { qc.invalidateQueries(['course-content', expandedCourse]); toast.success('تم إضافة الفصل'); setNewSectionTitle(''); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const updateSectionMut = useMutation({
    mutationFn: ({ courseId, sectionId, title }) => api.put(`/courses/${courseId}/sections/${sectionId}`, { title }),
    onSuccess: () => { qc.invalidateQueries(['course-content', expandedCourse]); toast.success('تم تحديث الفصل'); setEditingSectionId(null); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const deleteSectionMut = useMutation({
    mutationFn: ({ courseId, sectionId }) => api.delete(`/courses/${courseId}/sections/${sectionId}`),
    onSuccess: () => { qc.invalidateQueries(['course-content', expandedCourse]); toast.success('تم حذف الفصل'); },
  });

  const openAdd = () => { setEditData(null); setForm(emptyForm); setModal(true); };
  const openEdit = (c) => {
    setEditData(c);
    setForm({ name: c.name, description: c.description || '', price: c.price, thumbnail_url: c.thumbnail_url || '', target_stage: c.target_stage || '' });
    setModal(true);
  };
  const closeModal = () => { setModal(false); setEditData(null); setForm(emptyForm); };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name) return toast.error('اسم الكورس مطلوب');
    if (editData) updateMut.mutate({ id: editData.id, data: form });
    else createMut.mutate(form);
  };

  const stageCounts = ['الكل', ...STAGES].reduce((acc, s) => {
    acc[s] = s === 'الكل' ? courses.length : courses.filter(c => c.target_stage === s).length;
    return acc;
  }, {});

  const filteredCourses = stageFilter === 'الكل' ? courses : courses.filter(c => c.target_stage === stageFilter);

  const refreshContent = () => {
    qc.invalidateQueries(['course-content', expandedCourse]);
    qc.invalidateQueries(['courses']);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-navy-600 flex items-center gap-2">
          <BookOpen className="w-7 h-7 text-orange-500" /> الكورسات
          <span className="text-sm font-semibold text-gray-600">({courses.length})</span>
        </h1>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> إضافة كورس
        </button>
      </div>

      {/* ── Enrollment Requests ── */}
      {enrollRequests.filter(r => r.status === 'pending').length > 0 && (
        <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-5">
          <h2 className="font-black text-yellow-800 flex items-center gap-2 mb-4">
            <Bell className="w-5 h-5" />
            طلبات الانضمام للكورسات
            <span className="text-xs font-bold bg-yellow-400 text-white px-2 py-0.5 rounded-full">
              {enrollRequests.filter(r => r.status === 'pending').length}
            </span>
          </h2>
          <div className="space-y-3">
            {enrollRequests.filter(r => r.status === 'pending').map(r => (
              <div key={r.id} className="bg-white rounded-xl p-4 border border-yellow-200 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-bold text-navy-700 text-sm">{r.student_name}</p>
                  <p className="text-xs text-gray-500 font-medium">{r.academic_stage}</p>
                  <p className="text-xs text-orange-600 font-bold mt-0.5">كورس: {r.course_name}</p>
                  {r.message && <p className="text-xs text-gray-400 mt-1 italic">"{r.message}"</p>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRequestMut.mutate({ id: r.id, action: 'approve' })}
                    disabled={handleRequestMut.isPending}
                    className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-xl transition-colors">
                    <CheckCircle className="w-3.5 h-3.5" /> قبول
                  </button>
                  <button
                    onClick={() => handleRequestMut.mutate({ id: r.id, action: 'reject' })}
                    disabled={handleRequestMut.isPending}
                    className="flex items-center gap-1.5 px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold rounded-xl transition-colors">
                    <XCircle className="w-3.5 h-3.5" /> رفض
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stage Filter */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-xs font-bold text-gray-500">تصفية حسب المرحلة الدراسية</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {['الكل', ...STAGES].map(stage => (
            <button key={stage} onClick={() => setStageFilter(stage)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 ${
                stageFilter === stage ? 'bg-navy-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {stage}
              <span className={`text-xs rounded-full px-1.5 font-black ${stageFilter === stage ? 'bg-white/20 text-white' : 'bg-white text-gray-600'}`}>
                {stageCounts[stage]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          [...Array(3)].map((_, i) => <div key={i} className="card h-24 animate-pulse bg-gray-100" />)
        ) : filteredCourses.length === 0 ? (
          <div className="card text-center py-16">
            <BookOpen className="w-16 h-16 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium">
              {stageFilter === 'الكل' ? 'لا توجد كورسات بعد. أضف كورسك الأول!' : `لا توجد كورسات لـ ${stageFilter}`}
            </p>
          </div>
        ) : filteredCourses.map(c => (
          <div key={c.id} className="card !p-0 overflow-hidden">
            <div className="p-4 flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-navy-500 to-navy-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-navy-600 text-lg truncate">{c.name}</h3>
                  {c.target_stage && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${STAGE_COLORS[c.target_stage] || 'bg-gray-100 text-gray-600'}`}>
                      <GraduationCap className="w-3 h-3 inline ml-1" />{c.target_stage}
                    </span>
                  )}
                </div>
                <p className="text-gray-600 text-sm truncate font-medium">{c.description || 'لا يوجد وصف'}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="info"><Users className="w-3 h-3 ml-1" />{c.enrolled_count} طالب</Badge>
                  <Badge variant="navy"><Video className="w-3 h-3 ml-1" />{c.video_count} فيديو</Badge>
                  <Badge variant="warning"><FileText className="w-3 h-3 ml-1" />{c.pdf_count} ملف</Badge>
                  <Badge variant="success">{c.price > 0 ? `${c.price} جنيه` : 'مجاني'}</Badge>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => openEdit(c)} className="p-2 text-navy-600 hover:bg-navy-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => setDeleteId(c.id)} className="p-2 text-red-700 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                <button onClick={() => { setExpandedCourse(expandedCourse === c.id ? null : c.id); setContentTab('videos'); }}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg">
                  {expandedCourse === c.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {expandedCourse === c.id && (
              <div className="border-t border-gray-200 p-4 bg-gray-50">
                <div className="flex gap-2 mb-4 flex-wrap">
                  {[
                    { key: 'videos', label: '🎬 الفيديوهات' },
                    { key: 'pdfs',   label: '📄 الملفات' },
                    { key: 'sections', label: '📂 الفصول' },
                  ].map(tab => (
                    <button key={tab.key} onClick={() => setContentTab(tab.key)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${contentTab === tab.key ? 'bg-navy-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'}`}>
                      {tab.label}
                      {tab.key === 'sections' && content?.sections?.length > 0 && (
                        <span className="mr-1.5 text-xs bg-white/20 rounded-full px-1.5">{content.sections.length}</span>
                      )}
                    </button>
                  ))}
                </div>

                {contentTab === 'videos' && (() => {
                  const sections = content?.sections || [];
                  const grouped = {};
                  sections.forEach(s => { grouped[s.id] = []; });
                  grouped['_none'] = [];
                  (content?.videos || []).forEach(v => {
                    const key = v.section_id ? v.section_id : '_none';
                    if (!grouped[key]) grouped[key] = [];
                    grouped[key].push(v);
                  });
                  const VideoItem = ({ v }) => (
                    <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                      <div className="w-10 h-10 bg-navy-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Play className="w-5 h-5 text-navy-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-navy-600 text-sm truncate">{v.title}</p>
                        <p className="text-xs text-gray-500 font-medium">{v.duration_minutes} دقيقة</p>
                      </div>
                      <button onClick={() => setDeleteVideoId(v.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg flex-shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                  return (
                    <div className="space-y-4">
                      {sections.length > 0 ? (
                        <>
                          {sections.map(s => (
                            grouped[s.id]?.length > 0 && (
                              <div key={s.id}>
                                <div className="flex items-center gap-2 mb-2">
                                  <FolderOpen className="w-4 h-4 text-indigo-500" />
                                  <span className="text-xs font-black text-indigo-600 uppercase tracking-wide">{s.title}</span>
                                  <span className="text-xs text-gray-400">({grouped[s.id].length})</span>
                                </div>
                                <div className="space-y-2 pr-5 border-r-2 border-indigo-100">
                                  {grouped[s.id].map(v => <VideoItem key={v.id} v={v} />)}
                                </div>
                              </div>
                            )
                          ))}
                          {grouped['_none']?.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <FolderOpen className="w-4 h-4 text-gray-400" />
                                <span className="text-xs font-black text-gray-400 uppercase tracking-wide">بدون فصل</span>
                              </div>
                              <div className="space-y-2 pr-5 border-r-2 border-gray-100">
                                {grouped['_none'].map(v => <VideoItem key={v.id} v={v} />)}
                              </div>
                            </div>
                          )}
                          {content?.videos?.length === 0 && <p className="text-gray-400 text-sm text-center py-4">لا توجد فيديوهات بعد</p>}
                        </>
                      ) : (
                        <div className="space-y-2">
                          {(content?.videos || []).map(v => <VideoItem key={v.id} v={v} />)}
                        </div>
                      )}
                      <VideoUploadSection courseId={c.id} onSuccess={refreshContent} sections={content?.sections || []} />
                    </div>
                  );
                })()}

                {contentTab === 'pdfs' && (() => {
                  const sections = content?.sections || [];
                  const grouped = {};
                  sections.forEach(s => { grouped[s.id] = []; });
                  grouped['_none'] = [];
                  (content?.pdfs || []).forEach(p => {
                    const key = p.section_id ? p.section_id : '_none';
                    if (!grouped[key]) grouped[key] = [];
                    grouped[key].push(p);
                  });
                  const PdfItem = ({ p }) => (
                    <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                      <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-orange-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-navy-600 text-sm truncate">{p.title}</p>
                      </div>
                      <button onClick={() => setDeletePdfId(p.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg flex-shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                  return (
                    <div className="space-y-4">
                      {sections.length > 0 ? (
                        <>
                          {sections.map(s => (
                            grouped[s.id]?.length > 0 && (
                              <div key={s.id}>
                                <div className="flex items-center gap-2 mb-2">
                                  <FolderOpen className="w-4 h-4 text-orange-400" />
                                  <span className="text-xs font-black text-orange-500 uppercase tracking-wide">{s.title}</span>
                                </div>
                                <div className="space-y-2 pr-5 border-r-2 border-orange-100">
                                  {grouped[s.id].map(p => <PdfItem key={p.id} p={p} />)}
                                </div>
                              </div>
                            )
                          ))}
                          {grouped['_none']?.length > 0 && (
                            <div className="space-y-2 pr-5 border-r-2 border-gray-100">
                              {grouped['_none'].map(p => <PdfItem key={p.id} p={p} />)}
                            </div>
                          )}
                          {content?.pdfs?.length === 0 && <p className="text-gray-400 text-sm text-center py-4">لا توجد ملفات بعد</p>}
                        </>
                      ) : (
                        <div className="space-y-2">
                          {(content?.pdfs || []).map(p => <PdfItem key={p.id} p={p} />)}
                        </div>
                      )}
                      <PdfUploadSection courseId={c.id} onSuccess={refreshContent} sections={content?.sections || []} />
                    </div>
                  );
                })()}

                {contentTab === 'sections' && (
                  <div className="space-y-3">
                    {(content?.sections || []).length === 0 && (
                      <p className="text-gray-400 text-sm text-center py-6">لا توجد فصول بعد — أضف فصلاً لتنظيم المحتوى</p>
                    )}
                    {(content?.sections || []).map(s => (
                      <div key={s.id} className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                        <FolderOpen className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                        {editingSectionId === s.id ? (
                          <>
                            <input autoFocus value={editingSectionTitle}
                              onChange={e => setEditingSectionTitle(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') updateSectionMut.mutate({ courseId: c.id, sectionId: s.id, title: editingSectionTitle }); if (e.key === 'Escape') setEditingSectionId(null); }}
                              className="input-field flex-1 !py-1 text-sm" />
                            <button onClick={() => updateSectionMut.mutate({ courseId: c.id, sectionId: s.id, title: editingSectionTitle })}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditingSectionId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 font-semibold text-navy-600 text-sm">{s.title}</span>
                            <span className="text-xs text-gray-400 ml-2">
                              {(content?.videos || []).filter(v => v.section_id === s.id).length} فيديو
                            </span>
                            <button onClick={() => { setEditingSectionId(s.id); setEditingSectionTitle(s.title); }}
                              className="p-1.5 text-navy-500 hover:bg-navy-50 rounded-lg">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteSectionMut.mutate({ courseId: c.id, sectionId: s.id })}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <input value={newSectionTitle} onChange={e => setNewSectionTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && newSectionTitle.trim()) createSectionMut.mutate({ courseId: c.id, title: newSectionTitle }); }}
                        className="input-field flex-1 !py-2 text-sm" placeholder="اسم الفصل الجديد..." />
                      <button onClick={() => newSectionTitle.trim() && createSectionMut.mutate({ courseId: c.id, title: newSectionTitle })}
                        disabled={!newSectionTitle.trim() || createSectionMut.isPending}
                        className="btn-primary flex items-center gap-2 !py-2 disabled:opacity-50">
                        <FolderPlus className="w-4 h-4" /> إضافة فصل
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Course Modal */}
      <Modal open={modal} onClose={closeModal} title={editData ? 'تعديل الكورس' : 'إضافة كورس جديد'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">اسم الكورس *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="مثال: الرياضيات للثانوية العامة" />
          </div>
          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">المرحلة الدراسية المستهدفة</label>
            <select value={form.target_stage || ''} onChange={e => setForm({ ...form, target_stage: e.target.value })} className="input-field">
              <option value="">كل المراحل (عام)</option>
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">وصف الكورس</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input-field h-24 resize-none" placeholder="نبذة عن الكورس..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1">السعر (جنيه)</label>
              <input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className="input-field" placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1">صورة الغلاف (رابط)</label>
              <input value={form.thumbnail_url} onChange={e => setForm({ ...form, thumbnail_url: e.target.value })} className="input-field" placeholder="https://..." dir="ltr" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={closeModal} className="flex-1 btn-secondary">إلغاء</button>
            <button type="submit" disabled={createMut.isPending || updateMut.isPending} className="flex-1 btn-primary">
              {editData ? 'حفظ التعديلات' : 'إنشاء الكورس'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)}
        onConfirm={() => { deleteMut.mutate(deleteId); setDeleteId(null); }}
        title="حذف الكورس" message="هل أنت متأكد من حذف هذا الكورس؟ سيتم حذف جميع محتوياته نهائياً." danger />

      <ConfirmDialog open={!!deleteVideoId} onClose={() => setDeleteVideoId(null)}
        onConfirm={() => deleteVideoMut.mutate({ courseId: expandedCourse, videoId: deleteVideoId })}
        title="حذف الفيديو" message="هل أنت متأكد من حذف هذا الفيديو؟ سيتم حذفه نهائياً من الخادم." danger />

      <ConfirmDialog open={!!deletePdfId} onClose={() => setDeletePdfId(null)}
        onConfirm={() => deletePdfMut.mutate({ courseId: expandedCourse, pdfId: deletePdfId })}
        title="حذف الملف" message="هل أنت متأكد من حذف هذا الملف؟ سيتم حذفه نهائياً من الخادم." danger />
    </div>
  );
}
