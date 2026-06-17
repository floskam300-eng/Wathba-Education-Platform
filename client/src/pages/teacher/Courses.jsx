import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, Plus, Pencil, Trash2, Video, FileText, Users,
  GraduationCap, Filter, X, Globe, EyeOff, Upload, Image,
  FolderOpen, AlertCircle,
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { validateCourseForm, hasErrors } from '../../lib/validation';

function FieldError({ error }) {
  if (!error) return null;
  return (
    <p className="flex items-center gap-1 text-red-600 text-xs font-semibold mt-1">
      <AlertCircle className="w-3 h-3 flex-shrink-0" />{error}
    </p>
  );
}

const STAGES = ['الصف الأول الثانوي', 'الصف الثاني الثانوي', 'الصف الثالث الثانوي', 'الصف الأول الإعدادي', 'الصف الثاني الإعدادي', 'الصف الثالث الإعدادي'];
const emptyForm = { name: '', description: '', price: '', thumbnail_url: '', target_stage: '', is_free: false, points_on_complete: 1 };

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
      className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ease-out"
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
};

export default function TeacherCourses() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const baseRole = user?.role === 'assistant' ? 'assistant' : 'teacher';

  const [modal, setModal] = useState(false);
  const [editData, setEditData] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState(null);
  const [stageFilter, setStageFilter] = useState('الكل');
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const thumbnailFileRef = useRef(null);
  const pendingThumbnailUrl = useRef(null);

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['courses'],
    queryFn: () => api.get('/courses').then(r => r.data),
  });

  const publishMut = useMutation({
    mutationFn: (id) => api.put(`/courses/${id}/publish`),
    onSuccess: (res) => {
      qc.invalidateQueries(['courses']);
      qc.invalidateQueries(['teacher-dashboard']);
      toast.success(res.data.is_published ? 'تم نشر الكورس للطلاب ✅' : 'تم إلغاء نشر الكورس 🔒');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const createMut = useMutation({
    mutationFn: (data) => api.post('/courses', data),
    onSuccess: () => {
      qc.invalidateQueries(['courses']);
      qc.invalidateQueries(['teacher-dashboard']);
      toast.success('تم إنشاء الكورس');
      closeModal();
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/courses/${id}`, data),
    onSuccess: () => { qc.invalidateQueries(['courses']); toast.success('تم تحديث الكورس'); closeModal(); },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/courses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries(['courses']);
      qc.invalidateQueries(['teacher-dashboard']);
      toast.success('تم حذف الكورس');
    },
  });

  const [formErrors, setFormErrors] = useState({});
  const clearError = (field) => setFormErrors(prev => { const n = { ...prev }; delete n[field]; return n; });

  const openAdd = () => { setEditData(null); setForm(emptyForm); setFormErrors({}); setThumbnailFile(null); setModal(true); };
  const openEdit = (c) => {
    setEditData(c);
    setForm({ name: c.name, description: c.description || '', price: c.price, thumbnail_url: c.thumbnail_url || '', target_stage: c.target_stage || '', is_free: !!c.is_free, points_on_complete: c.points_on_complete || 0 });
    setFormErrors({});
    setThumbnailFile(null);
    setModal(true);
  };
  const closeModal = () => {
    if (pendingThumbnailUrl.current) {
      api.delete('/courses/upload-thumbnail', { data: { url: pendingThumbnailUrl.current } }).catch(() => {});
      pendingThumbnailUrl.current = null;
    }
    setModal(false); setEditData(null); setForm(emptyForm); setFormErrors({}); setThumbnailFile(null);
  };

  const handleThumbnailUpload = async (file) => {
    if (!file) return;
    setThumbnailUploading(true);
    try {
      const fd = new FormData();
      fd.append('thumbnail', file);
      const res = await api.post('/courses/upload-thumbnail', fd);
      if (pendingThumbnailUrl.current && pendingThumbnailUrl.current !== res.data.url) {
        api.delete('/courses/upload-thumbnail', { data: { url: pendingThumbnailUrl.current } }).catch(() => {});
      }
      pendingThumbnailUrl.current = res.data.url;
      setForm(prev => ({ ...prev, thumbnail_url: res.data.url }));
      setThumbnailFile(file);
      toast.success('تم رفع الصورة ✅');
    } catch (e) {
      toast.error(e.response?.data?.error || 'فشل رفع الصورة');
    } finally {
      setThumbnailUploading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (thumbnailUploading) { toast.error('انتظر حتى ينتهي رفع الصورة أولاً'); return; }
    const errs = validateCourseForm(form);
    if (hasErrors(errs)) { setFormErrors(errs); return; }
    setFormErrors({});
    pendingThumbnailUrl.current = null;
    if (editData) updateMut.mutate({ id: editData.id, data: form });
    else createMut.mutate(form);
  };

  const stageCounts = ['الكل', ...STAGES].reduce((acc, s) => {
    acc[s] = s === 'الكل' ? courses.length : courses.filter(c => c.target_stage === s).length;
    return acc;
  }, {});

  const filteredCourses = stageFilter === 'الكل' ? courses : courses.filter(c => c.target_stage === stageFilter);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-navy-600 flex items-center gap-2">
          <BookOpen className="w-7 h-7 text-orange-500" /> الكورسات
          <span className="text-sm font-semibold text-gray-600">({courses.length})</span>
        </h1>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2 flex-shrink-0 text-sm">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">إضافة كورس</span>
        </button>
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

      {/* Courses Grid */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCourses.map(c => {
              const grad = COVER_GRADIENTS[(c.id || 0) % COVER_GRADIENTS.length];
              return (
                <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col transition-all duration-300 ease-out group hover:shadow-2xl hover:border-orange-300 hover:-translate-y-1">
                  {/* Thumbnail */}
                  <div className={`relative w-full bg-gradient-to-br ${grad} overflow-hidden`} style={{ paddingTop: '56.25%' }}>
                    <ThumbnailImg url={c.thumbnail_url} name={c.name} />
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                      style={{ background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.12) 50%, transparent 60%)' }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                    {/* Price badge */}
                    <div className="absolute top-2 end-2">
                      {c.is_free
                        ? <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-green-500 text-white shadow">مجاني</span>
                        : <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-orange-500 text-white shadow">{c.price} جنيه</span>}
                    </div>
                    {/* Published badge */}
                    {c.is_published && (
                      <div className="absolute top-2 start-2">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-600 text-white shadow flex items-center gap-1">
                          <Globe className="w-2.5 h-2.5" /> منشور
                        </span>
                      </div>
                    )}
                    {/* Stage badge */}
                    {c.target_stage && (
                      <div className="absolute bottom-2 start-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STAGE_COLORS[c.target_stage] || 'bg-gray-100 text-gray-700'} shadow-sm`}>
                          <GraduationCap className="w-2.5 h-2.5 inline ml-0.5" />{c.target_stage}
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

                    {/* Publish/Unpublish */}
                    <button
                      onClick={() => {
                        if (!c.is_published) {
                          const total = parseInt(c.video_count || 0) + parseInt(c.pdf_count || 0);
                          if (total === 0) {
                            toast.error('لا يمكن نشر كورس بدون محتوى — أضف فيديوهات أو ملفات PDF أولاً');
                            return;
                          }
                        }
                        publishMut.mutate(c.id);
                      }}
                      disabled={publishMut.isPending}
                      className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-black transition-all mb-1.5 ${
                        c.is_published
                          ? 'bg-green-50 hover:bg-red-50 text-green-700 hover:text-red-600 border border-green-200 hover:border-red-200'
                          : 'bg-gray-100 hover:bg-green-600 text-gray-600 hover:text-white border border-gray-200 hover:border-green-600'
                      }`}>
                      {c.is_published
                        ? <><EyeOff className="w-3 h-3" /> منشور — اضغط لإلغاء النشر</>
                        : <><Globe className="w-3 h-3" /> نشر للطلاب</>}
                    </button>

                    {/* Edit / Delete */}
                    <div className="flex gap-1.5 pt-2 border-t border-gray-100 mb-1.5">
                      <button onClick={() => openEdit(c)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-navy-50 hover:bg-navy-100 text-navy-600 text-xs font-bold transition-all">
                        <Pencil className="w-3 h-3" /> تعديل
                      </button>
                      <button onClick={() => setDeleteId(c.id)}
                        className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 text-xs font-bold transition-all">
                        <Trash2 className="w-3 h-3" /> حذف
                      </button>
                    </div>

                    {/* Manage Content — navigates to full page */}
                    <button
                      onClick={() => navigate(`/${baseRole}/courses/${c.id}/content`)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black transition-all bg-gray-100 hover:bg-orange-500 hover:text-white text-gray-700">
                      <FolderOpen className="w-3.5 h-3.5" /> إدارة المحتوى
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal open={modal} onClose={closeModal} title={editData ? 'تعديل الكورس' : 'إضافة كورس جديد'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">اسم الكورس *</label>
            <input value={form.name} onChange={e => { setForm({ ...form, name: e.target.value }); clearError('name'); }}
              className={`input-field ${formErrors.name ? 'border-red-400 focus:ring-red-300' : ''}`} placeholder="مثال: الرياضيات للثانوية العامة" />
            <FieldError error={formErrors.name} />
          </div>
          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">صورة الغلاف</label>
            <div className="flex gap-2">
              <input value={form.thumbnail_url} onChange={e => setForm({ ...form, thumbnail_url: e.target.value })}
                className="input-field flex-1" placeholder="الصق رابط صورة أو ارفع من جهازك" dir="ltr" />
              <button type="button" onClick={() => thumbnailFileRef.current?.click()}
                disabled={thumbnailUploading}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-bold text-gray-700 transition-all flex-shrink-0 border border-gray-200">
                {thumbnailUploading ? <span className="animate-spin inline-block">↻</span> : <Upload className="w-4 h-4" />}
                {thumbnailUploading ? 'جاري...' : 'رفع'}
              </button>
            </div>
            <input ref={thumbnailFileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { if (e.target.files[0]) handleThumbnailUpload(e.target.files[0]); e.target.value = ''; }} />
            {form.thumbnail_url && (
              <div className="mt-2">
                <img src={form.thumbnail_url} alt="معاينة" className="h-20 rounded-xl object-cover border border-gray-200"
                  onError={e => { e.target.style.display = 'none'; }} />
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">المرحلة الدراسية المستهدفة <span className="text-red-500">*</span></label>
            <select value={form.target_stage || ''} onChange={e => { setForm({ ...form, target_stage: e.target.value }); clearError('target_stage'); }}
              className={`input-field ${formErrors.target_stage ? 'border-red-400 focus:ring-red-300' : ''}`}>
              <option value="">— اختر المرحلة —</option>
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <FieldError error={formErrors.target_stage} />
          </div>
          <div>
            <label className="block text-sm font-bold text-navy-700 mb-1">وصف الكورس</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              className="input-field h-20 resize-none" placeholder="نبذة عن الكورس..." />
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
                ✅ عند نشر الكورس سيُضاف تلقائياً لجميع طلاب {form.target_stage} بدون طلب انضمام
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
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
            <label className="block text-sm font-black text-amber-800 mb-1">⭐ نقاط إتمام الكورس {!form.is_free && <span className="text-red-500">*</span>}</label>
            <input type="number" min="0" max="9999" value={form.points_on_complete}
              onChange={e => { setForm({ ...form, points_on_complete: parseInt(e.target.value) || 0 }); clearError('points_on_complete'); }}
              className={`input-field ${formErrors.points_on_complete ? 'border-red-400 focus:ring-red-300' : ''}`} placeholder="0" />
            <FieldError error={formErrors.points_on_complete} />
            <p className="text-xs text-gray-500 mt-1.5">
              {form.points_on_complete > 0
                ? `✅ الطالب يكسب ${form.points_on_complete} نقطة لما يخلص مشاهدة كل فيديوهات الكورس (90%+ من كل فيديو)`
                : 'اكتب عدد النقاط لو عايز تكافئ الطلاب اللي يخلصوا الكورس'}
            </p>
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
    </div>
  );
}
