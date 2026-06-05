import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  BookOpen, Video, FileText, GraduationCap, Filter,
  Play, Lock, Search, Bell, CheckCircle,
  Clock, XCircle, ArrowLeft
} from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const STAGE_COLORS = {
  'الصف الأول الثانوي': 'bg-blue-50 text-blue-700 border-blue-200',
  'الصف الثاني الثانوي': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'الصف الثالث الثانوي': 'bg-purple-50 text-purple-700 border-purple-200',
  'الصف الأول الإعدادي': 'bg-green-50 text-green-700 border-green-200',
  'الصف الثاني الإعدادي': 'bg-teal-50 text-teal-700 border-teal-200',
  'الصف الثالث الإعدادي': 'bg-cyan-50 text-cyan-700 border-cyan-200',
  'جامعي': 'bg-orange-50 text-orange-700 border-orange-200',
};

const COVER_GRADIENTS = [
  'from-navy-600 to-indigo-700',
  'from-orange-500 to-rose-600',
  'from-teal-500 to-cyan-600',
  'from-purple-600 to-pink-600',
  'from-emerald-500 to-green-700',
  'from-blue-500 to-sky-600',
];

function getCoverGradient(id) {
  return COVER_GRADIENTS[(id || 0) % COVER_GRADIENTS.length];
}

function RequestStatusBadge({ status }) {
  if (status === 'pending')  return <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3" />بانتظار الموافقة</span>;
  if (status === 'approved') return <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-green-100 text-green-800"><CheckCircle className="w-3 h-3" />تمت الموافقة</span>;
  if (status === 'rejected') return <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-red-100 text-red-800"><XCircle className="w-3 h-3" />مرفوض</span>;
  return null;
}

function CourseCard({ course, onClick, children }) {
  const [imgError, setImgError] = useState(false);
  const grad = getCoverGradient(course.id);

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-2xl hover:border-orange-300 hover:-translate-y-1 transition-all duration-300 ease-out overflow-hidden flex flex-col group ${onClick ? 'cursor-pointer' : ''}`}
    >
      {/* Thumbnail */}
      <div className={`relative w-full bg-gradient-to-br ${grad} overflow-hidden flex-shrink-0`} style={{ paddingTop: '56.25%' }}>
        <img
          key={course.thumbnail_url || 'default'}
          src={(!imgError && course.thumbnail_url) ? course.thumbnail_url : '/default-course.svg'}
          alt={course.name}
          onError={() => setImgError(true)}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ease-out"
        />
        {/* Shine sweep on hover */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{ background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)' }} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
        {/* Badges */}
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          {course.is_free ? (
            <span className="text-[10px] font-black bg-green-500 text-white px-2 py-0.5 rounded-full shadow">مجاني</span>
          ) : course.price > 0 ? (
            <span className="text-[10px] font-black bg-orange-500 text-white px-2 py-0.5 rounded-full shadow">{parseFloat(course.price).toLocaleString()} ج</span>
          ) : null}
        </div>
        {course.target_stage && (
          <div className="absolute bottom-2 right-2">
            <span className="text-[9px] font-bold bg-black/50 text-white px-1.5 py-0.5 rounded-full backdrop-blur-sm">
              {course.target_stage}
            </span>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="p-3 flex-1 flex flex-col">
        <h3 className="font-black text-navy-700 text-sm leading-snug line-clamp-2 mb-1.5 group-hover:text-orange-600 transition-colors">
          {course.name}
        </h3>
        {course.description && (
          <p className="text-gray-400 text-[11px] line-clamp-2 mb-2 leading-relaxed">{course.description}</p>
        )}
        <div className="flex items-center gap-3 mt-auto pt-2 border-t border-gray-50">
          <span className="flex items-center gap-1 text-[11px] font-bold text-navy-600">
            <Play className="w-3 h-3" />{course.video_count || 0}
          </span>
          <span className="flex items-center gap-1 text-[11px] font-bold text-orange-500">
            <FileText className="w-3 h-3" />{course.pdf_count || 0}
          </span>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function StudentCourses() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [tab, setTab] = useState('enrolled');
  const [stageFilter, setStageFilter] = useState('الكل');
  const [requestMsg, setRequestMsg] = useState({});

  useEffect(() => {
    if (location.state?.tab) {
      setTab(location.state.tab);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['student-courses'],
    queryFn: () => api.get('/courses/student/my-courses').then(r => r.data),
    staleTime: 0,
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
  });

  const { data: allCourses = [], isLoading: loadingAll } = useQuery({
    queryKey: ['student-courses-all'],
    queryFn: () => api.get('/courses/student/available-all').then(r => r.data),
    staleTime: 0,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const requestMut = useMutation({
    mutationFn: ({ courseId, message }) => api.post(`/courses/student/request/${courseId}`, { message }),
    onSuccess: (res) => {
      qc.invalidateQueries(['student-courses-all']);
      qc.invalidateQueries(['student-courses']);
      if (res.data?.enrolled) {
        toast.success('🎁 تم تسجيلك تلقائياً في الكورس المجاني');
      } else {
        toast.success('تم إرسال طلب الانضمام للمعلم');
      }
    },
    onError: (e) => toast.error(e.response?.data?.error || 'حدث خطأ'),
  });

  const availableStages = ['الكل', ...new Set(courses.map(c => c.target_stage).filter(Boolean))];
  const stageCounts = availableStages.reduce((acc, s) => {
    acc[s] = s === 'الكل' ? courses.length : courses.filter(c => c.target_stage === s).length;
    return acc;
  }, {});
  const filteredCourses = stageFilter === 'الكل' ? courses : courses.filter(c => c.target_stage === stageFilter);
  const notEnrolled = allCourses.filter(c => !c.is_enrolled);

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-black text-navy-600 flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-orange-500" /> الكورسات
            <span className="text-sm font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{courses.length}</span>
          </h1>
          {user?.academic_stage && (
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full border hidden sm:flex items-center gap-1 ${STAGE_COLORS[user.academic_stage] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
              <GraduationCap className="w-3.5 h-3.5" />{user.academic_stage}
            </span>
          )}
        </div>

        {/* Banner: new courses available */}
        {tab === 'enrolled' && notEnrolled.length > 0 && (
          <button
            onClick={() => setTab('browse')}
            className="w-full flex items-center gap-3 px-4 py-3 bg-gradient-to-l from-orange-500/10 to-amber-500/5 border border-orange-300/50 dark:border-orange-600/40 rounded-2xl hover:border-orange-400/80 dark:hover:border-orange-500/60 transition-all group text-right">
            <span className="w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
              <Bell className="w-4 h-4 text-white" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-orange-600 dark:text-orange-400">
                {notEnrolled.length === 1 ? 'كورس جديد متاح!' : `${notEnrolled.length} كورسات جديدة متاحة!`}
              </p>
              <p className="text-xs text-orange-500/80 dark:text-orange-400/70 font-medium">اضغط هنا لاستعراض الكورسات المتاحة والانضمام إليها</p>
            </div>
            <ArrowLeft className="w-4 h-4 text-orange-400 dark:text-orange-500 group-hover:text-orange-600 flex-shrink-0" />
          </button>
        )}

        {/* Tabs */}
        <div className="flex gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
          <button onClick={() => setTab('enrolled')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === 'enrolled' ? 'bg-white dark:bg-gray-700 text-navy-700 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
            كورساتي ({courses.length})
          </button>
          <button onClick={() => setTab('browse')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${tab === 'browse' ? 'bg-white dark:bg-gray-700 text-navy-700 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
            <Search className="w-3.5 h-3.5" /> استعرض الكورسات
            {notEnrolled.length > 0 && (
              <span className="bg-orange-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                {notEnrolled.length}
              </span>
            )}
          </button>
        </div>

        {/* ── ENROLLED TAB ── */}
        {tab === 'enrolled' && (
          isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-2xl overflow-hidden border border-gray-100">
                  <div className="bg-gray-200 animate-pulse" style={{ paddingTop: '56.25%' }} />
                  <div className="p-3 space-y-2">
                    <div className="h-4 bg-gray-200 animate-pulse rounded" />
                    <div className="h-3 bg-gray-100 animate-pulse rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : courses.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm text-center py-16 px-6">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-10 h-10 text-gray-300" />
              </div>
              <p className="text-gray-700 font-bold text-lg mb-1">لا توجد كورسات مسجّل بها</p>
              <p className="text-gray-400 text-sm mb-4">يمكنك طلب الانضمام لكورس من تبويب "استعرض الكورسات"</p>
              <button onClick={() => setTab('browse')} className="btn-primary px-6 py-2 text-sm">
                استعرض الكورسات المتاحة
              </button>
            </div>
          ) : (
            <>
              {availableStages.length > 2 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <Filter className="w-4 h-4 text-gray-400" />
                    <span className="text-xs font-bold text-gray-400">عرض حسب المرحلة</span>
                  </div>
                  <div className="filter-scroll">
                    {availableStages.map(stage => (
                      <button key={stage} onClick={() => setStageFilter(stage)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${stageFilter === stage ? 'bg-navy-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        {stage}
                        <span className={`text-xs rounded-full px-1.5 font-black ${stageFilter === stage ? 'bg-white/20 text-white' : 'bg-white text-gray-500'}`}>
                          {stageCounts[stage]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCourses.map(c => (
                  <CourseCard
                    key={c.id}
                    course={c}
                    onClick={() => navigate(`/student/courses/${c.id}`)}
                  >
                    <span className="mr-auto inline-flex items-center gap-1 text-[10px] font-black text-white bg-orange-500 group-hover:bg-navy-600 transition-colors px-2 py-0.5 rounded-lg">
                      ادخل <ArrowLeft className="w-2.5 h-2.5" />
                    </span>
                  </CourseCard>
                ))}
              </div>
            </>
          )
        )}

        {/* ── BROWSE TAB ── */}
        {tab === 'browse' && (
          loadingAll ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-2xl overflow-hidden border border-gray-100">
                  <div className="bg-gray-200 animate-pulse" style={{ paddingTop: '56.25%' }} />
                  <div className="p-3 space-y-2">
                    <div className="h-4 bg-gray-200 animate-pulse rounded" />
                    <div className="h-3 bg-gray-100 animate-pulse rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : notEnrolled.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm text-center py-16 px-6">
              <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-3" />
              <p className="text-gray-700 font-bold text-lg mb-1">أنت مسجّل في كل الكورسات المتاحة</p>
              <p className="text-gray-400 text-sm">لا توجد كورسات جديدة للانضمام إليها حالياً</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 font-medium">{notEnrolled.length} كورس متاح للانضمام</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {notEnrolled.map(c => (
                  <div key={c.id} className="flex flex-col">
                    <CourseCard course={c}>
                      {c.price > 0 && !c.is_free && (
                        <span className="mr-auto text-[10px] font-black text-orange-600">{parseFloat(c.price).toLocaleString()} ج</span>
                      )}
                    </CourseCard>
                    <div className="mt-2 space-y-1.5">
                      {c.request_status && c.request_status !== 'rejected' ? (
                        <RequestStatusBadge status={c.request_status} />
                      ) : (
                        <>
                          {c.request_status === 'rejected' && (
                            <div className="flex items-center gap-2">
                              <RequestStatusBadge status="rejected" />
                              <span className="text-xs text-gray-500 font-medium">يمكنك إعادة الطلب</span>
                            </div>
                          )}
                          <textarea
                            rows={2}
                            placeholder="رسالة اختيارية للمعلم..."
                            value={requestMsg[c.id] || ''}
                            onChange={e => setRequestMsg(prev => ({ ...prev, [c.id]: e.target.value }))}
                            className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-200"
                          />
                          <button
                            onClick={() => requestMut.mutate({ courseId: c.id, message: requestMsg[c.id] })}
                            disabled={requestMut.isPending}
                            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-navy-600 hover:bg-navy-700 text-white text-xs font-bold transition-colors">
                            <Bell className="w-3.5 h-3.5" />
                            {c.request_status === 'rejected' ? 'إعادة طلب الانضمام' : 'طلب الانضمام'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
