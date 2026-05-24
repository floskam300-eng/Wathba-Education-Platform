import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, BookOpen, Video, FileText, FolderOpen, FolderPlus,
  Plus, Trash2, Pencil, Play, X, Check, Link, Upload, ExternalLink,
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

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
      await api.post(`/courses/${courseId}/videos/url`, {
        title: title.trim(),
        url: url.trim(),
        duration_minutes: duration || '0',
        section_id: sectionId || undefined,
      });
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

  useEffect(() => {
    return () => { controllerRef.current?.abort(); };
  }, []);

  const handleUpload = async () => {
    if (!file) return toast.error('اختر ملف PDF');
    if (!title.trim()) return toast.error('أدخل عنوان الملف');
    if (file.size > 50 * 1024 * 1024) return toast.error('حجم الملف يجب أن يكون أقل من 50 MB');
    const fd = new FormData();
    fd.append('pdf', file);
    fd.append('title', title);
    if (sectionId) fd.append('section_id', sectionId);
    setUploading(true); setProcessing(false); setProgress(0);
    controllerRef.current = new AbortController();
    try {
      await api.post(`/courses/${courseId}/pdfs/upload`, fd, {
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
      setProgress(0); setProcessing(false);
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
            <iframe src={embedUrl} className="absolute inset-0 w-full h-full" allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" title={video.title} />
          ) : isLocal ? (
            <video src={video.file_path_or_url} className="absolute inset-0 w-full h-full object-contain bg-black" controls autoPlay />
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

export default function CourseContent() {
  const { teacherSlug, courseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const baseRole = user?.role === 'assistant' ? 'assistant' : 'teacher';

  const [contentTab, setContentTab] = useState('videos');
  const [deleteVideoId, setDeleteVideoId] = useState(null);
  const [deletePdfId, setDeletePdfId] = useState(null);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [editingSectionTitle, setEditingSectionTitle] = useState('');
  const [previewVideo, setPreviewVideo] = useState(null);

  const { data: course } = useQuery({
    queryKey: ['course-single', courseId],
    queryFn: () => api.get('/courses').then(r => (r.data || []).find(c => String(c.id) === String(courseId))),
  });

  const { data: content, isLoading } = useQuery({
    queryKey: ['course-content', courseId],
    queryFn: () => api.get(`/courses/${courseId}/content`).then(r => r.data),
  });

  const refreshContent = useCallback(() => {
    qc.invalidateQueries(['course-content', courseId]);
    qc.invalidateQueries(['courses']);
    qc.invalidateQueries(['course-single', courseId]);
  }, [qc, courseId]);

  const deleteVideoMut = useMutation({
    mutationFn: (videoId) => api.delete(`/courses/${courseId}/videos/${videoId}`),
    onSuccess: () => { refreshContent(); toast.success('تم حذف الفيديو'); setDeleteVideoId(null); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const deletePdfMut = useMutation({
    mutationFn: (pdfId) => api.delete(`/courses/${courseId}/pdfs/${pdfId}`),
    onSuccess: () => { refreshContent(); toast.success('تم حذف الملف'); setDeletePdfId(null); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const createSectionMut = useMutation({
    mutationFn: (title) => api.post(`/courses/${courseId}/sections`, { title }),
    onSuccess: () => { refreshContent(); toast.success('تم إضافة الفصل'); setNewSectionTitle(''); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const updateSectionMut = useMutation({
    mutationFn: ({ sectionId, title }) => api.put(`/courses/${courseId}/sections/${sectionId}`, { title }),
    onSuccess: () => { refreshContent(); toast.success('تم تحديث الفصل'); setEditingSectionId(null); },
    onError: (e) => { toast.error(e.response?.data?.error || 'حدث خطأ'); setEditingSectionId(null); },
  });

  const deleteSectionMut = useMutation({
    mutationFn: (sectionId) => api.delete(`/courses/${courseId}/sections/${sectionId}`),
    onSuccess: () => { refreshContent(); toast.success('تم حذف الفصل'); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const sections = content?.sections || [];
  const videos = content?.videos || [];
  const pdfs = content?.pdfs || [];

  const VideoItem = ({ v }) => (
    <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-gray-100 hover:border-gray-200 transition-all">
      <button onClick={() => setPreviewVideo(v)}
        className="w-10 h-10 bg-navy-100 rounded-lg flex items-center justify-center flex-shrink-0 hover:bg-navy-200 transition-colors group" title="معاينة الفيديو">
        <Play className="w-5 h-5 text-navy-700 group-hover:text-navy-900" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-navy-600 text-sm truncate">{v.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {v.duration_minutes > 0 && <p className="text-xs text-gray-500 font-medium">{v.duration_minutes} دقيقة</p>}
          {v.file_path_or_url && !v.file_path_or_url.startsWith('/uploads/') && (
            <span className="text-[10px] bg-blue-50 text-blue-600 font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1">
              <Link className="w-2.5 h-2.5" /> رابط
            </span>
          )}
        </div>
      </div>
      <button onClick={() => setDeleteVideoId(v.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg flex-shrink-0 transition-colors">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );

  const PdfItem = ({ p }) => (
    <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-gray-100 hover:border-gray-200 transition-all">
      <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
        <FileText className="w-5 h-5 text-orange-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-navy-600 text-sm truncate">{p.title}</p>
      </div>
      <button onClick={() => setDeletePdfId(p.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg flex-shrink-0 transition-colors">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );

  const buildGrouped = (items) => {
    const grouped = {};
    sections.forEach(s => { grouped[s.id] = []; });
    grouped['_none'] = [];
    items.forEach(item => {
      const key = item.section_id ? item.section_id : '_none';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });
    return grouped;
  };

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(`/${teacherSlug}/${baseRole}/courses`)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-all font-bold text-sm flex-shrink-0">
            <ArrowRight className="w-4 h-4" />
            <span className="hidden sm:inline">رجوع للكورسات</span>
          </button>
          <div className="h-5 w-px bg-gray-200 flex-shrink-0" />
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="w-5 h-5 text-orange-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-gray-400 font-medium">إدارة محتوى الكورس</p>
              <h1 className="font-black text-navy-700 text-sm truncate">{course?.name || '...'}</h1>
            </div>
          </div>
          <div className="mr-auto flex items-center gap-3 flex-shrink-0">
            <span className="text-xs text-gray-500 font-bold hidden sm:flex items-center gap-1">
              <Video className="w-3.5 h-3.5" /> {videos.length} فيديو
            </span>
            <span className="text-xs text-gray-500 font-bold hidden sm:flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" /> {pdfs.length} ملف
            </span>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex gap-1">
            {[
              { key: 'videos', label: '🎬 الفيديوهات', count: videos.length },
              { key: 'pdfs', label: '📄 الملفات', count: pdfs.length },
              { key: 'sections', label: '📂 الفصول', count: sections.length },
            ].map(tab => (
              <button key={tab.key} onClick={() => setContentTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-bold border-b-2 transition-all ${
                  contentTab === tab.key
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
                }`}>
                {tab.label}
                <span className={`text-xs rounded-full px-1.5 py-0.5 font-black ${
                  contentTab === tab.key ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
                }`}>{tab.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-white rounded-xl animate-pulse border border-gray-100" />
            ))}
          </div>
        ) : (
          <>
            {/* Videos Tab */}
            {contentTab === 'videos' && (() => {
              const grouped = buildGrouped(videos);
              return (
                <div className="space-y-6">
                  {/* Upload section at the top */}
                  <VideoUrlSection courseId={courseId} onSuccess={refreshContent} sections={sections} />

                  {/* List */}
                  {videos.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
                      <Video className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="text-gray-400 font-medium text-sm">لا توجد فيديوهات بعد — أضف أول فيديو من خلال الرابط أعلاه</p>
                    </div>
                  ) : sections.length > 0 ? (
                    <div className="space-y-5">
                      {sections.map(s => grouped[s.id]?.length > 0 && (
                        <div key={s.id}>
                          <div className="flex items-center gap-2 mb-2">
                            <FolderOpen className="w-4 h-4 text-indigo-500" />
                            <span className="text-xs font-black text-indigo-600 uppercase tracking-wide">{s.title}</span>
                            <span className="text-xs text-gray-400">({grouped[s.id].length})</span>
                          </div>
                          <div className="space-y-2 pr-4 border-r-2 border-indigo-100">
                            {grouped[s.id].map(v => <VideoItem key={v.id} v={v} />)}
                          </div>
                        </div>
                      ))}
                      {grouped['_none']?.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <FolderOpen className="w-4 h-4 text-gray-400" />
                            <span className="text-xs font-black text-gray-400 uppercase tracking-wide">بدون فصل</span>
                          </div>
                          <div className="space-y-2 pr-4 border-r-2 border-gray-100">
                            {grouped['_none'].map(v => <VideoItem key={v.id} v={v} />)}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {videos.map(v => <VideoItem key={v.id} v={v} />)}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* PDFs Tab */}
            {contentTab === 'pdfs' && (() => {
              const grouped = buildGrouped(pdfs);
              return (
                <div className="space-y-6">
                  <PdfUploadSection courseId={courseId} onSuccess={refreshContent} sections={sections} />

                  {pdfs.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
                      <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="text-gray-400 font-medium text-sm">لا توجد ملفات بعد — ارفع أول ملف PDF من الأعلى</p>
                    </div>
                  ) : sections.length > 0 ? (
                    <div className="space-y-5">
                      {sections.map(s => grouped[s.id]?.length > 0 && (
                        <div key={s.id}>
                          <div className="flex items-center gap-2 mb-2">
                            <FolderOpen className="w-4 h-4 text-orange-400" />
                            <span className="text-xs font-black text-orange-500 uppercase tracking-wide">{s.title}</span>
                          </div>
                          <div className="space-y-2 pr-4 border-r-2 border-orange-100">
                            {grouped[s.id].map(p => <PdfItem key={p.id} p={p} />)}
                          </div>
                        </div>
                      ))}
                      {grouped['_none']?.length > 0 && (
                        <div className="space-y-2 pr-4 border-r-2 border-gray-100">
                          {grouped['_none'].map(p => <PdfItem key={p.id} p={p} />)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pdfs.map(p => <PdfItem key={p.id} p={p} />)}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Sections Tab */}
            {contentTab === 'sections' && (
              <div className="space-y-4">
                {/* Add section */}
                <div className="bg-white rounded-2xl border border-gray-200 p-4">
                  <p className="text-sm font-black text-navy-700 mb-3 flex items-center gap-2">
                    <FolderPlus className="w-4 h-4 text-indigo-500" /> إضافة فصل جديد
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={newSectionTitle}
                      onChange={e => setNewSectionTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && newSectionTitle.trim()) createSectionMut.mutate(newSectionTitle.trim()); }}
                      className="input-field flex-1 !py-2 text-sm"
                      placeholder="اسم الفصل الجديد..." />
                    <button
                      onClick={() => newSectionTitle.trim() && createSectionMut.mutate(newSectionTitle.trim())}
                      disabled={!newSectionTitle.trim() || createSectionMut.isPending}
                      className="btn-primary flex items-center gap-2 !py-2 disabled:opacity-50">
                      <FolderPlus className="w-4 h-4" /> إضافة
                    </button>
                  </div>
                </div>

                {sections.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
                    <FolderOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-gray-400 font-medium text-sm">لا توجد فصول بعد — أضف فصلاً لتنظيم محتوى الكورس</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sections.map(s => (
                      <div key={s.id} className="flex items-center gap-3 p-4 bg-white rounded-xl shadow-sm border border-gray-100 hover:border-gray-200 transition-all">
                        <FolderOpen className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                        {editingSectionId === s.id ? (
                          <>
                            <input autoFocus value={editingSectionTitle}
                              onChange={e => setEditingSectionTitle(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') updateSectionMut.mutate({ sectionId: s.id, title: editingSectionTitle });
                                if (e.key === 'Escape') setEditingSectionId(null);
                              }}
                              className="input-field flex-1 !py-1.5 text-sm" />
                            <button onClick={() => updateSectionMut.mutate({ sectionId: s.id, title: editingSectionTitle })}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditingSectionId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors">
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 font-semibold text-navy-600 text-sm">{s.title}</span>
                            <span className="text-xs text-gray-400 font-medium">
                              {videos.filter(v => v.section_id === s.id).length} فيديو · {pdfs.filter(p => p.section_id === s.id).length} ملف
                            </span>
                            <button onClick={() => { setEditingSectionId(s.id); setEditingSectionTitle(s.title); }}
                              className="p-1.5 text-navy-500 hover:bg-navy-50 rounded-lg transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteSectionMut.mutate(s.id)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <VideoPreviewModal video={previewVideo} onClose={() => setPreviewVideo(null)} />

      <ConfirmDialog open={!!deleteVideoId} onClose={() => setDeleteVideoId(null)}
        onConfirm={() => deleteVideoMut.mutate(deleteVideoId)}
        title="حذف الفيديو" message="هل أنت متأكد من حذف هذا الفيديو نهائياً؟" danger />

      <ConfirmDialog open={!!deletePdfId} onClose={() => setDeletePdfId(null)}
        onConfirm={() => deletePdfMut.mutate(deletePdfId)}
        title="حذف الملف" message="هل أنت متأكد من حذف هذا الملف نهائياً؟" danger />
    </div>
  );
}
