import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, Video, FileText, GraduationCap, Filter,
  Play, ChevronRight, Lock
} from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const STAGE_COLORS = {
  'الصف الأول الثانوي': 'bg-blue-50 text-blue-700 border-blue-200',
  'الصف الثاني الثانوي': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'الصف الثالث الثانوي': 'bg-purple-50 text-purple-700 border-purple-200',
  'الصف الأول الإعدادي': 'bg-green-50 text-green-700 border-green-200',
  'الصف الثاني الإعدادي': 'bg-teal-50 text-teal-700 border-teal-200',
  'الصف الثالث الإعدادي': 'bg-cyan-50 text-cyan-700 border-cyan-200',
  'جامعي': 'bg-orange-50 text-orange-700 border-orange-200',
};

export default function StudentCourses() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stageFilter, setStageFilter] = useState('الكل');

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['student-courses'],
    queryFn: () => api.get('/courses/student/my-courses').then(r => r.data),
  });

  const availableStages = ['الكل', ...new Set(courses.map(c => c.target_stage).filter(Boolean))];

  const stageCounts = availableStages.reduce((acc, s) => {
    acc[s] = s === 'الكل' ? courses.length : courses.filter(c => c.target_stage === s).length;
    return acc;
  }, {});

  const filteredCourses = stageFilter === 'الكل'
    ? courses
    : courses.filter(c => c.target_stage === stageFilter);

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-navy-600 flex items-center gap-2">
          <BookOpen className="w-7 h-7 text-orange-500" /> كورساتي
          <span className="text-sm font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{courses.length}</span>
        </h1>
        {user?.academic_stage && (
          <span className={`text-xs font-bold px-3 py-1.5 rounded-full border hidden sm:flex items-center gap-1 ${STAGE_COLORS[user.academic_stage] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
            <GraduationCap className="w-3.5 h-3.5" />
            {user.academic_stage}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-40 rounded-2xl bg-gray-100 animate-pulse" />)}
        </div>
      ) : courses.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm text-center py-16 px-6">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-10 h-10 text-gray-300" />
          </div>
          <p className="text-gray-700 font-bold text-lg mb-1">لا توجد كورسات مسجّل بها</p>
          <p className="text-gray-400 text-sm">تواصل مع معلمك لتسجيلك في الكورسات المناسبة لمرحلتك الدراسية</p>
        </div>
      ) : (
        <>
          {/* Stage Filter */}
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

          {/* Course Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredCourses.map(c => (
              <button key={c.id} onClick={() => navigate(`/student/courses/${c.id}`)}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-orange-200 transition-all text-right overflow-hidden group">
                {/* Card Header */}
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

                  {/* Stats */}
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
      )}
    </div>
    </div>
  );
}
