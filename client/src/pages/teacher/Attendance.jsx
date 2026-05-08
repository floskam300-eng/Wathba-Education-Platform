import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Video, CheckCircle2, Circle, XCircle, BookOpen, Download } from 'lucide-react';
import api from '../../lib/api';

const PRESENT_THRESHOLD = 70;
const PARTIAL_THRESHOLD = 20;

function getStatus(progress) {
  if (!progress) return 'absent';
  const pct = progress.progress_percentage;
  if (pct >= PRESENT_THRESHOLD) return 'present';
  if (pct >= PARTIAL_THRESHOLD) return 'partial';
  return 'absent';
}

const StatusIcon = ({ status }) => {
  if (status === 'present') return <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto" />;
  if (status === 'partial') return <Circle className="w-5 h-5 text-yellow-500 mx-auto" />;
  return <XCircle className="w-5 h-5 text-red-400 mx-auto" />;
};

export default function Attendance() {
  const [selectedCourse, setSelectedCourse] = useState('');

  const { data: courses, isLoading: loadingCourses } = useQuery({
    queryKey: ['courses-list'],
    queryFn: () => api.get('/courses').then(r => r.data),
  });

  const { data: attendance, isLoading: loadingAttendance } = useQuery({
    queryKey: ['attendance', selectedCourse],
    queryFn: () => api.get(`/students/attendance/${selectedCourse}`).then(r => r.data),
    enabled: !!selectedCourse,
  });

  const exportCSV = () => {
    if (!attendance) return;
    const { students, videos, progressMap } = attendance;
    const header = ['الطالب', 'المرحلة', ...videos.map(v => v.title), 'نسبة الحضور %'];
    const rows = students.map(s => {
      const statuses = videos.map(v => {
        const p = progressMap[s.id]?.[v.id];
        const st = getStatus(p);
        return st === 'present' ? 'حاضر' : st === 'partial' ? 'جزئي' : 'غائب';
      });
      const presentCount = statuses.filter(x => x === 'حاضر').length;
      const pct = videos.length ? Math.round((presentCount / videos.length) * 100) : 0;
      return [s.name, s.academic_stage || '', ...statuses, `${pct}%`];
    });
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `حضور-${attendance.course?.name || 'كورس'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStudentAttendancePct = (studentId) => {
    if (!attendance?.videos?.length) return 0;
    const presentCount = attendance.videos.filter(v => {
      const p = attendance.progressMap[studentId]?.[v.id];
      return getStatus(p) === 'present';
    }).length;
    return Math.round((presentCount / attendance.videos.length) * 100);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-navy-700">سجل الحضور والغياب</h1>
          <p className="text-sm text-gray-500 mt-1">تتبع تقدم الطلاب في مشاهدة فيديوهات كل كورس</p>
        </div>
        {attendance && (
          <button onClick={exportCSV} className="btn-secondary flex items-center gap-2">
            <Download className="w-4 h-4" />
            تصدير CSV
          </button>
        )}
      </div>

      <div className="card">
        <label className="block text-sm font-bold text-navy-700 mb-2">
          <BookOpen className="w-4 h-4 inline ml-1" />
          اختر الكورس
        </label>
        {loadingCourses ? (
          <div className="h-10 bg-gray-100 animate-pulse rounded-lg" />
        ) : (
          <select
            value={selectedCourse}
            onChange={e => setSelectedCourse(e.target.value)}
            className="input-field"
          >
            <option value="">— اختر كورساً —</option>
            {courses?.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.enrolled_count || 0} طالب)
              </option>
            ))}
          </select>
        )}
      </div>

      {!selectedCourse && (
        <div className="card text-center py-16 text-gray-500">
          <Video className="w-14 h-14 mx-auto mb-3 opacity-30" />
          <p className="font-semibold text-base">اختر كورساً لعرض سجل الحضور</p>
        </div>
      )}

      {selectedCourse && loadingAttendance && (
        <div className="card">
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 animate-pulse rounded-xl" />
            ))}
          </div>
        </div>
      )}

      {attendance && !loadingAttendance && (
        <>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'إجمالي الطلاب', value: attendance.students.length, color: 'text-navy-700', bg: 'bg-navy-50' },
              { label: 'إجمالي الفيديوهات', value: attendance.videos.length, color: 'text-blue-700', bg: 'bg-blue-50' },
              {
                label: 'متوسط الحضور',
                value: attendance.students.length
                  ? `${Math.round(attendance.students.reduce((s, st) => s + getStudentAttendancePct(st.id), 0) / attendance.students.length)}%`
                  : '0%',
                color: 'text-green-700',
                bg: 'bg-green-50',
              },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={`card text-center !p-4 ${bg}`}>
                <p className={`text-2xl font-black ${color}`}>{value}</p>
                <p className="text-xs text-gray-600 font-semibold mt-1">{label}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold flex-wrap">
            <span className="flex items-center gap-1.5 text-green-700">
              <CheckCircle2 className="w-4 h-4" /> حاضر (≥{PRESENT_THRESHOLD}% مشاهدة)
            </span>
            <span className="flex items-center gap-1.5 text-yellow-600">
              <Circle className="w-4 h-4" /> جزئي ({PARTIAL_THRESHOLD}–{PRESENT_THRESHOLD - 1}%)
            </span>
            <span className="flex items-center gap-1.5 text-red-500">
              <XCircle className="w-4 h-4" /> غائب ({'<'}{PARTIAL_THRESHOLD}%)
            </span>
          </div>

          {attendance.students.length === 0 ? (
            <div className="card text-center py-12 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-semibold">لا يوجد طلاب مسجلون في هذا الكورس بعد</p>
            </div>
          ) : attendance.videos.length === 0 ? (
            <div className="card text-center py-12 text-gray-500">
              <Video className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-semibold">لا يوجد فيديوهات في هذا الكورس بعد</p>
            </div>
          ) : (
            <div className="card !p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-max">
                  <thead className="bg-navy-600 text-white">
                    <tr>
                      <th className="py-3 px-4 text-right font-bold sticky right-0 bg-navy-600 z-10 min-w-[160px]">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          الطالب
                        </div>
                      </th>
                      {attendance.videos.map(v => (
                        <th key={v.id} className="py-3 px-3 text-center font-semibold min-w-[100px] max-w-[130px]">
                          <div className="truncate text-xs" title={v.title}>{v.title}</div>
                          {v.duration_minutes > 0 && (
                            <div className="text-navy-200 text-xs font-normal">{v.duration_minutes} د</div>
                          )}
                        </th>
                      ))}
                      <th className="py-3 px-4 text-center font-bold min-w-[90px] bg-navy-700">الحضور %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.students.map((student, idx) => {
                      const pct = getStudentAttendancePct(student.id);
                      return (
                        <tr key={student.id} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-orange-50/30 transition-colors`}>
                          <td className={`py-3 px-4 sticky right-0 z-10 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                            <div className="font-semibold text-navy-700 text-sm">{student.name}</div>
                            {student.academic_stage && (
                              <div className="text-xs text-gray-500">{student.academic_stage}</div>
                            )}
                          </td>
                          {attendance.videos.map(v => {
                            const p = attendance.progressMap[student.id]?.[v.id];
                            const status = getStatus(p);
                            return (
                              <td key={v.id} className="py-3 px-3 text-center" title={p ? `${Math.round(p.progress_percentage)}% مشاهدة` : 'لم يشاهد'}>
                                <StatusIcon status={status} />
                                {p && (
                                  <div className="text-xs text-gray-400 mt-0.5">{Math.round(p.progress_percentage)}%</div>
                                )}
                              </td>
                            );
                          })}
                          <td className="py-3 px-4 text-center font-bold bg-gray-50">
                            <span className={`text-base ${pct >= 70 ? 'text-green-700' : pct >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {pct}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
