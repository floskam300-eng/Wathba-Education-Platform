import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, Plus, Pencil, Trash2, Video, FileText, Users,
  ChevronDown, ChevronUp, GraduationCap, Filter,
  X, Play, FolderOpen, FolderPlus, Check, AlertCircle, Link, ExternalLink
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Badge from '../../components/ui/Badge';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { validateCourseForm, hasErrors } from '../../lib/validation';

function FieldError({ error }) {
  if (!error) return null;
  return (
    <p className="flex items-center gap-1 text-red-600 text-xs font-semibold mt-1">
      <AlertCircle className="w-3 h-3 flex-shrink-0" />{error}
    </p>
  );
}

const STAGES = ['الصف الأول الثانوي', 'الصف الثاني الثانوي', 'الصف الثالث الثانوي', 'الصف الأول الإعدادي', 'الصف الثاني الإعدادي', 'الصف الثالث الإعدادي', 'جامعي'];
const emptyForm = { name: '', description: '', price: '', thumbnail_url: '', target_stage: '', is_free: false };

const COVER_GRADIENTS = [
  'from-navy-600 to-indigo-700',
  'from-orange-500 to-rose-600',
  'from-teal-500 to-cyan-600',
  'from-purple-600 to-pink-600',
  'from-emerald-500 to-green-700',
  'from-blue-500 to-sky-600',
];

function ThumbnailImg({ url, name }) {
  const [err, setErr] = React.useState(false);
  const src = (!err && url) ? url : '/default-course.svg';
  return (
    <img
      key={url || 'default'}
      src={src}
      alt={name}
      onError={() => setErr(true)}
      className="absolute inset-0 w-full h-full object-cover"
    />
  );
}

const STAGE_COLORS = {
  'الصف الأول الثانوي': 'bg-blue-50 text-blue-700',
  'الصف الثاني الثانوي': 'bg-indigo-50 text-indigo-700',
  'الصف الثالث الثانوي': 'bg-purple-50 text-purple-700',
  'الصف الأول الإعدادي': 'bg-green-50 text-green-700',
  'الصف الثاني الإعدادي': 'bg-teal-50 text-teal-700',
  'الصف الثالث الإعدادي': 'bg-cyan-50 text-cyan-700',
  'جامعي': 'bg-orange-50 text-orange-700',
};

function VideoUrlSection({ courseId, onSuccess, sections = [] }) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [duration, setDuration] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!title.trim()) return toast.error('أدخل عنوان الفيديو');
    if (!url.trim()) return toast.error('أدخل رابط الفيديو');
    setLoading(true);
    try {
      const token = localStorage.getItem('wathba_token');
      const { default: axios } = await import('axios');
      await axios.post(`/api/courses/${courseId}/videos/url`, {
        title: title.trim(),
        url: url.trim(),
        duration_minutes: duration || '0',
        section_id: sectionId || undefined,
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('تم إضافة الفيديو بنجاح ✅');
      setTitle(''); setUrl(''); setDuration(''); setSectionId('');
      onSuccess();
    } catch (e) {
      toast.error(e.response?.data?.error || 'فشل إضافة الفيديو');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 bg-gray-50 rounded-xl p-4 border border-dashed border-gray-300">
      <p className="text-xs font-black text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
        <Link className="w-3.5 h-3.5" /> إضافة فيديو برابط
      </p>
      <div className="grid grid-cols-2 gap-2">
        <input value={title} onChange={e => setTitle(e.target.value)}
          className="input-field col-span-2" placeholder="عنوان الفيديو *" disabled={loading} />
        <input value={url} onChange={e => setUrl(e.target.value)}
          className="input-field col-span-2" placeholder="رابط الفيديو * (YouTube, Drive, أو أي رابط مباشر)" dir="ltr" disabled={loading} />
        <input type="number" value={duration} onChange={e => setDuration(e.target.value)}
          className="input-field" placeholder="المدة (دقائق)" disabled={loading} />
        {sections.length > 0 && (
          <select value={sectionId} onChange={e => setSectionId(e.target.value)} className="input-field" disabled={loading}>
            <option value="">— بدون فصل —</option>
            {sections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        )}
      </div>
      <button onClick={handleAdd} disabled={loading || !title.trim() || !url.trim()}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
        {loading ? 'جارٍ الإضافة...' : <><Plus className="w-4 h-4" /> إضافة الفيديو</>}
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
      const { default: axios } = await import('axios');
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
      const { default: axios } = await import('axios');
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
        {uploading ? (processing ? 'جارٍ المعالجة...' : 'جارٍ الرفع...') : 'رفع الملف'}
      </button>
    </div>
  );
}

function VideoPreviewModal({ video, onClose }) {
  if (!video) return null;
  const isYoutube = /youtube\.com|youtu\.be/.test(video.file_path_or_url || '');
  const isDrive = /drive\.google\.com/.test(video.file_path_or_url || '');
  const isLocal = (video.file_path_or_url || '').startsWith('/uploads/');

  let embedUrl = video.file_path_or_url;
  if (isYoutube) {
    const match = video.file_path_or_url.match(/(?:v=|youtu\.be\/)([^&?/]+)/);
    if (match) embedUrl = `https://www.youtube.com/embed/${match[1]}`;
  } else if (isDrive) {
    const match = video.file_path_or_url.match(/\/d\/([^/]+)/);
    if (match) embedUrl = `https://drive.google.com/file/d/${match[1]}/preview`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="bg-black rounded-2xl overflow-hidden w-full max-w-3xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900">
          <p className="text-white font-bold text-sm truncate">{video.title}</p>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="relative" style={{ paddingTop: '56.25%' }}>
          {(isYoutube || isDrive) ? (
            <iframe
              src={embedUrl}
              className="absolute inset-0 w-full h-full"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              title={video.title}
            />
          ) : isLocal ? (
            <video
              src={video.file_path_or_url}
              className="absolute inset-0 w-full h-full object-contain bg-black"
              controls
              autoPlay
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 gap-4">
              <p className="text-gray-400 text-sm text-center px-6">لا يمكن تشغيل هذا الرابط مباشرة — افتحه في نافذة جديدة</p>
              <a href={video.file_path_or_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-2.5 rounded-xl transition-all">
                <ExternalLink className="w-4 h-4" /> فتح الرابط
              </a>
            </div>
          )}
        </div>
      </div>
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
  const [previewVideo, setPreviewVideo] = useState(null);

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['courses'],
    queryFn: () => api.get('/courses').then(r => r.data),
  });

  const { data: content } = useQuery({
    queryKey: ['course-content', expandedCourse],
    queryFn: () => api.get(`/courses/${expandedCourse}/content`).then(r => r.data),
    enabled: !!expandedCourse,
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

  const [formErrors, setFormErrors] = useState({});
  const clearError = (field) => setFormErrors(prev => { const n = { ...prev }; delete n[field]; return n; });

  const openAdd = () => { setEditData(null); setForm(emptyForm); setFormErrors({}); setModal(true); };
  const openEdit = (c) => {
    setEditData(c);
    setForm({ name: c.name, description: c.description || '', price: c.price, thumbnail_url: c.thumbnail_url || '', target_stage: c.target_stage || '', is_free: !!c.is_free });
    setFormErrors({});
    setModal(true);
  };
  const closeModal = () => { setModal(false); setEditData(null); setForm(emptyForm); setFormErrors({}); };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validateCourseForm(form);
    if (hasErrors(errs)) { setFormErrors(errs); return; }
    setFormErrors({});
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
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-2xl overflow-hidden border border-gray-100 bg-white">
                <div className="bg-gray-200 animate-pulse" style={{ paddingTop: '56.25%' }} />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-gray-200 animate-pulse rounded" />
                  <div className="h-3 bg-gray-100 animate-pulse rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="card text-center py-16">
            <BookOpen className="w-16 h-16 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium">
              {stageFilter === 'الكل' ? 'لا توجد كورسات بعد. أضف كورسك الأول!' : `لا توجد كورسات لـ ${stageFilter}`}
            </p>
          </div>
        ) : (
          <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCourses.map(c => {
              const grad = COVER_GRADIENTS[(c.id || 0) % COVER_GRADIENTS.length];
              const isExpanded = expandedCourse === c.id;
              return (
                <div key={c.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col transition-all duration-200 ${isExpanded ? 'border-orange-400 ring-2 ring-orange-200 shadow-lg' : 'border-gray-100 hover:shadow-md hover:border-orange-200'}`}>
                  {/* Thumbnail */}
                  <div className={`relative w-full bg-gradient-to-br ${grad} overflow-hidden`} style={{ paddingTop: '56.25%' }}>
                    <ThumbnailImg url={c.thumbnail_url} name={c.name} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                    {/* Price badge — top start (right in RTL) */}
                    <div className="absolute top-2 right-2">
                      {c.is_free || !c.price || parseFloat(c.price) === 0 ? (
                        <span className="text-[10px] font-black bg-green-500 text-white px-2 py-0.5 rounded-full shadow">مجاني</span>
                      ) : (
                        <span className="text-[10px] font-black bg-orange-500 text-white px-2 py-0.5 rounded-full shadow">{parseFloat(c.price).toLocaleString()} ج</span>
                      )}
                    </div>
                    {c.target_stage && (
                      <div className="absolute bottom-2 right-2">
                        <span className="text-[9px] font-bold bg-black/50 text-white px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                          {c.target_stage}
                        </span>
                      </div>
                    )}
                  </div>
                  {/* Details */}
                  <div className="p-3 flex-1 flex flex-col">
                    <h3 className="font-black text-navy-700 text-sm leading-snug line-clamp-2 mb-1">{c.name}</h3>
                    {c.description && (
                      <p className="text-gray-400 text-[11px] line-clamp-1 mb-2">{c.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full">
                        <Users className="w-2.5 h-2.5" />{c.enrolled_count} طالب
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-navy-50 text-navy-700 px-1.5 py-0.5 rounded-full">
                        <Video className="w-2.5 h-2.5" />{c.video_count} فيديو
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded-full">
                        <FileText className="w-2.5 h-2.5" />{c.pdf_count} ملف
                      </span>
                    </div>
                    {/* Action buttons row */}
                    <div className="flex gap-1.5 pt-2 border-t border-gray-100 mb-1.5">
                      <button
                        onClick={() => openEdit(c)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-navy-50 hover:bg-navy-100 text-navy-600 text-xs font-bold transition-all">
                        <Pencil className="w-3 h-3" /> تعديل
                      </button>
                      <button
                        onClick={() => setDeleteId(c.id)}
                        className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 text-xs font-bold transition-all">
                        <Trash2 className="w-3 h-3" /> حذف
                      </button>
                    </div>
                    <button
                      onClick={() => { setExpandedCourse(isExpanded ? null : c.id); setContentTab('videos'); }}
                      className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black transition-all ${isExpanded ? 'bg-orange-500 text-white' : 'bg-gray-100 hover:bg-navy-600 hover:text-white text-gray-700'}`}>
                      {isExpanded ? <><ChevronUp className="w-3.5 h-3.5" /> إغلاق المحتوى</> : <><ChevronDown className="w-3.5 h-3.5" /> إدارة المحتوى</>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Expanded Content Management ── */}
          {expandedCourse && filteredCourses.find(c => c.id === expandedCourse) && (() => {
            const c = filteredCourses.find(c => c.id === expandedCourse);
            return (
          <div className="border border-orange-200 rounded-2xl bg-gray-50 overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-orange-100">
              <p className="font-black text-navy-700 text-sm flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-orange-500" /> إدارة محتوى: <span className="text-orange-600">{c.name}</span>
              </p>
              <button onClick={() => setExpandedCourse(null)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
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
                      <button
                        onClick={() => setPreviewVideo(v)}
                        className="w-10 h-10 bg-navy-100 rounded-lg flex items-center justify-center flex-shrink-0 hover:bg-navy-200 transition-colors group"
                        title="معاينة الفيديو"
                      >
                        <Play className="w-5 h-5 text-navy-700 group-hover:text-navy-900" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-navy-600 text-sm truncate">{v.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {v.duration_minutes > 0 && (
                            <p className="text-xs text-gray-500 font-medium">{v.duration_minutes} دقيقة</p>
                          )}
                          {v.file_path_or_url && !v.file_path_or_url.startsWith('/uploads/') && (
                            <span className="text-[10px] bg-blue-50 text-blue-600 font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1">
                              <Link className="w-2.5 h-2.5" /> رابط
                            </span>
                          )}
                        </div>
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
                      <VideoUrlSection courseId={c.id} onSuccess={refreshContent} sections={content?.sections || []} />
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
          </div>
        );
      })()}
      </>
      )}
      </div>

      <Modal open={modal} onClose={closeModal} title={editData ? 'تعديل الكورس' : 'إضافة كورس جديد'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">اسم الكورس *</label>
            <input value={form.name} onChange={e => { setForm({ ...form, name: e.target.value }); clearError('name'); }}
              className={`input-field ${formErrors.name ? 'border-red-400 focus:ring-red-300' : ''}`} placeholder="مثال: الرياضيات للثانوية العامة" />
            <FieldError error={formErrors.name} />
          </div>
          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">صورة الغلاف (رابط)</label>
            <input value={form.thumbnail_url} onChange={e => setForm({ ...form, thumbnail_url: e.target.value })}
              className="input-field" placeholder="https://example.com/image.jpg" dir="ltr" />
            {form.thumbnail_url && (
              <div className="mt-2">
                <img src={form.thumbnail_url} alt="معاينة" className="h-20 rounded-xl object-cover border border-gray-200"
                  onError={e => { e.target.style.display = 'none'; }} />
              </div>
            )}
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
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input-field h-20 resize-none" placeholder="نبذة عن الكورس..." />
          </div>
          <div className="rounded-xl border border-gray-200 p-3 bg-gray-50">
            <p className="text-sm font-bold text-navy-700 mb-3">نوع الكورس</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setForm({ ...form, is_free: false })}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all border-2 ${!form.is_free ? 'bg-navy-600 text-white border-navy-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                💰 مدفوع
              </button>
              <button type="button" onClick={() => setForm({ ...form, is_free: true, price: 0 })}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all border-2 ${form.is_free ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                🎁 مجاني
              </button>
            </div>
            {form.is_free && form.target_stage && (
              <p className="text-xs text-green-700 font-bold mt-2 bg-green-50 rounded-lg px-3 py-2">
                ✅ سيُضاف تلقائياً لجميع طلاب {form.target_stage}
              </p>
            )}
          </div>
          {!form.is_free && (
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1">السعر (جنيه)</label>
              <input type="number" value={form.price} onChange={e => { setForm({ ...form, price: e.target.value }); clearError('price'); }}
                className={`input-field ${formErrors.price ? 'border-red-400 focus:ring-red-300' : ''}`} placeholder="0" min="0" step="0.01" />
              <FieldError error={formErrors.price} />
            </div>
          )}
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
        title="حذف الفيديو" message="هل أنت متأكد من حذف هذا الفيديو؟" danger />

      <ConfirmDialog open={!!deletePdfId} onClose={() => setDeletePdfId(null)}
        onConfirm={() => deletePdfMut.mutate({ courseId: expandedCourse, pdfId: deletePdfId })}
        title="حذف الملف" message="هل أنت متأكد من حذف هذا الملف؟" danger />

      <VideoPreviewModal video={previewVideo} onClose={() => setPreviewVideo(null)} />
    </div>
  );
}
