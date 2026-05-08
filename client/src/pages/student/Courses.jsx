import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, Video, FileText, GraduationCap, Filter,
  Play, ChevronRight, Lock, Search, Bell, CheckCircle,
  Clock, XCircle, Plus
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

function RequestStatusBadge({ status }) {
  if (status === 'pending')  return <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3" />بانتظار الموافقة</span>;
  if (status === 'approved') return <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-green-100 text-green-800"><CheckCircle className="w-3 h-3" />تمت الموافقة</span>;
  if (status === 'rejected') return <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-red-100 text-red-800"><XCircle className="w-3 h-3" />مرفوض</span>;
  return null;
}

export default function StudentCourses() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState('enrolled');
  const [stageFilter, setStageFilter] = useState('الكل');
  const [requestMsg, setRequestMsg] = useState({});

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['student-courses'],
    queryFn: () => api.get('/courses/student/my-courses').then(r => r.data),
  });

  const { data: allCourses = [], isLoading: loadingAll } = useQuery({
    queryKey: ['student-courses-all'],
    queryFn: () => api.get('/courses/student/available-all').then(r => r.data),
    enabled: tab === 'browse',
  });

  const requestMut = useMutation({
    mutationFn: ({ courseId, message }) => api.post(`/courses/student/request/${courseId}`, { message }),
    onSuccess: () => {
      qc.invalidateQueries(['student-courses-all']);
      toast.success('تم إرسال طلب الانضمام للمعلم');
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-black text-navy-600 flex items-center gap-2">
          <BookOpen className="w-7 h-7 text-orange-500" /> الكورسات
          <span className="text-sm font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{courses.length}</span>
        </h1>
        {user?.academic_stage && (
          <span className={`text-xs font-bold px-3 py-1.5 rounded-full border hidden sm:flex items-center gap-1 ${STAGE_COLORS[user.academic_stage] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
            <GraduationCap className="w-3.5 h-3.5" />
            {user.academic_stage}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setTab('enrolled')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === 'enrolled' ? 'bg-white text-navy-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          كورساتي ({courses.length})
        </button>
        <button
          onClick={() => setTab('browse')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${tab === 'browse' ? 'bg-white text-navy-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <Search className="w-3.5 h-3.5" /> استعرض الكورسات
        </button>
      </div>

      {/* ── ENROLLED TAB ── */}
      {tab === 'enrolled' && (
        isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-40 rounded-2xl bg-gray-100 animate-pulse" />)}
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
                <div className="flex flex-wrap gap-2">
                  {availableStages.map(stage => (
                    <button key={stage} onClick={() => setStageFilter(stage)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                        stageFilter === stage ? 'bg-navy-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}>
                      {stage}
                      <span className={`text-xs rounded-full px-1.5 font-black ${stageFilter === stage ? 'bg-white/20 text-white' : 'bg-white text-gray-500'}`}>
                        {stageCounts[stage]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredCourses.map(c => (
                <button key={c.id} onClick={() => navigate(`/student/courses/${c.id}`)}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-orange-200 transition-all text-right overflow-hidden group">
                  <div className="h-3 bg-gradient-to-r from-navy-600 to-orange-500 group-hover:from-orange-500 group-hover:to-navy-600 transition-all duration-500" />
                  <div className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-navy-500 to-navy-700 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm group-hover:from-orange-500 group-hover:to-orange-700 transition-all">
                        <BookOpen className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-black text-navy-700 text-base leading-tight truncate">{c.name}</h3>
                        {c.target_stage && (
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold mt-1 px-2 py-0.5 rounded-full border ${STAGE_COLORS[c.target_stage] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                            <GraduationCap className="w-3 h-3" /> {c.target_stage}
                          </span>
                        )}
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-orange-500 transition-colors flex-shrink-0 mt-1" />
                    </div>
                    {c.description && (
                      <p className="text-gray-400 text-xs font-medium mt-3 line-clamp-2">{c.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-50">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-navy-600">
                        <div className="w-6 h-6 bg-navy-50 rounded-lg flex items-center justify-center">
                          <Play className="w-3 h-3 text-navy-600" />
                        </div>
                        {c.video_count || 0} فيديو
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-orange-600">
                        <div className="w-6 h-6 bg-orange-50 rounded-lg flex items-center justify-center">
                          <FileText className="w-3 h-3 text-orange-600" />
                        </div>
                        {c.pdf_count || 0} ملف
                      </div>
                      <div className="mr-auto">
                        <span className="text-[11px] font-black text-white bg-orange-500 group-hover:bg-navy-600 transition-colors px-2.5 py-1 rounded-lg">
                          ادخل الكورس
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )
      )}

      {/* ── BROWSE TAB ── */}
      {tab === 'browse' && (
        loadingAll ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-44 rounded-2xl bg-gray-100 animate-pulse" />)}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {notEnrolled.map(c => (
                <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="h-3 bg-gradient-to-r from-gray-300 to-gray-400" />
                  <div className="p-5">
                    <div className="flex items-start gap-4 mb-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-gray-400 to-gray-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
                        <BookOpen className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-black text-navy-700 text-base leading-tight truncate">{c.name}</h3>
                        {c.target_stage && (
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold mt-1 px-2 py-0.5 rounded-full border ${STAGE_COLORS[c.target_stage] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                            <GraduationCap className="w-3 h-3" /> {c.target_stage}
                          </span>
                        )}
                      </div>
                    </div>

                    {c.description && (
                      <p className="text-gray-400 text-xs font-medium mb-3 line-clamp-2">{c.description}</p>
                    )}

                    <div className="flex items-center gap-3 mb-4 text-xs">
                      <span className="flex items-center gap-1 text-navy-600 font-bold"><Play className="w-3 h-3" />{c.video_count || 0} فيديو</span>
                      <span className="flex items-center gap-1 text-orange-600 font-bold"><FileText className="w-3 h-3" />{c.pdf_count || 0} ملف</span>
                      {c.price > 0 && <span className="font-bold text-gray-700 mr-auto">{c.price} ج.م</span>}
                    </div>

                    {c.request_status ? (
                      <RequestStatusBadge status={c.request_status} />
                    ) : (
                      <div className="space-y-2">
                        <textarea
                          rows={2}
                          placeholder="رسالة اختيارية للمعلم..."
                          value={requestMsg[c.id] || ''}
                          onChange={e => setRequestMsg(prev => ({ ...prev, [c.id]: e.target.value }))}
                          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-200"
                        />
                        <button
                          onClick={() => requestMut.mutate({ courseId: c.id, message: requestMsg[c.id] })}
                          disabled={requestMut.isPending}
                          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-navy-600 hover:bg-navy-700 text-white text-sm font-bold transition-colors">
                          <Bell className="w-4 h-4" /> طلب الانضمام
                        </button>
                      </div>
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
