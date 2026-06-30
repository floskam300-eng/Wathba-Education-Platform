import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Video, CheckCircle2, Circle, XCircle, BookOpen, Download, Info } from 'lucide-react';
import api from '../../lib/api';
import { useTheme } from '../../context/ThemeContext';

const PRESENT_THRESHOLD = 70;
const PARTIAL_THRESHOLD = 20;

/**
 * الحساب الصحيح لنسبة المشاهدة الفعلية لفيديو واحد.
 *
 * الأولوية:
 *  1. actual_watched_seconds ÷ مدة الفيديو بالثواني (مقيّد بـ 100%)
 *     — يعكس الوقت الفعلي الذي أمضاه الطالب في المشاهدة
 *     — لا يكافئ التخطي السريع (skip)
 *  2. progress_percentage (أعلى موضع وصل إليه)
 *     — احتياطي إذا لم تتوفر بيانات actual_watched_seconds
 */
function effectivePct(videoId, p, durMap) {
  if (!p) return 0;
  const durSec = (durMap?.[videoId] || 0) * 60;
  const actualSec = p.actual_watched_seconds || 0;
  if (durSec > 0 && actualSec > 0) {
    return Math.min(100, Math.round((actualSec / durSec) * 100));
  }
  return Math.min(100, Math.round(p.progress_percentage || 0));
}

function getStatus(pct) {
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
  const { dark } = useTheme();
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

  /* خريطة مدد الفيديوهات: { videoId → duration_minutes } */
  const durMap = useMemo(() => {
    const m = {};
    attendance?.videos?.forEach(v => { m[v.id] = v.duration_minutes || 0; });
    return m;
  }, [attendance?.videos]);

  /**
   * متوسط نسبة المشاهدة الفعلية للطالب على كل فيديوهات الكورس.
   * المتوسط المُرجَّح يعطي نتيجة أدق من العدّ الثنائي (حاضر/غائب فقط).
   * مثال: طالب شاهد 10 فيديوهات كلها بنسبة 65% يظهر 65% (لا 0%).
   */
  const getStudentAttendancePct = (studentId) => {
    if (!attendance?.videos?.length) return 0;
    const total = attendance.videos.reduce((sum, v) => {
      const p = attendance.progressMap[studentId]?.[v.id];
      return sum + effectivePct(v.id, p, durMap);
    }, 0);
    return Math.round(total / attendance.videos.length);
  };

  /* إحصائيات الصف: متوسط حضور جميع الطلاب */
  const avgAttendance = useMemo(() => {
    if (!attendance?.students?.length) return 0;
    const sum = attendance.students.reduce((s, st) => s + getStudentAttendancePct(st.id), 0);
    return Math.round(sum / attendance.students.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendance, durMap]);

  /* كم طالب حضور فعلي ≥70% في أكثر من نصف الفيديوهات */
  const fullyPresentCount = useMemo(() => {
    if (!attendance?.students?.length) return 0;
    return attendance.students.filter(st => getStudentAttendancePct(st.id) >= PRESENT_THRESHOLD).length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendance, durMap]);

  const exportCSV = () => {
    if (!attendance) return;
    const { students, videos, progressMap } = attendance;
    const header = ['الطالب', 'المرحلة', ...videos.map(v => v.title), 'متوسط المشاهدة %', 'الحالة'];
    const rows = students.map(s => {
      const pcts = videos.map(v => {
        const p = progressMap[s.id]?.[v.id];
        return effectivePct(v.id, p, durMap);
      });
      const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
      const labels = pcts.map(pct => {
        const st = getStatus(pct);
        return st === 'present' ? 'حاضر' : st === 'partial' ? 'جزئي' : 'غائب';
      });
      const overallStatus = avg >= PRESENT_THRESHOLD ? 'حاضر' : avg >= PARTIAL_THRESHOLD ? 'جزئي' : 'غائب';
      return [s.name, s.academic_stage || '', ...labels, `${avg}%`, overallStatus];
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

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-navy-700">سجل الحضور والغياب</h1>
          <p className="text-sm text-gray-500 mt-1">تتبع تقدم الطلاب في مشاهدة فيديوهات كل كورس</p>
        </div>
        {attendance && (
          <button onClick={exportCSV} className="btn-secondary flex items-center gap-2">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">تصدير CSV</span>
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
          {/* ── الإحصائيات الإجمالية ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
            <div className="card text-center !p-3 sm:!p-4 bg-navy-50">
              <p className="text-xl sm:text-2xl font-black text-navy-700">{attendance.students.length}</p>
              <p className="text-[11px] sm:text-xs text-gray-600 font-semibold mt-1 leading-tight">إجمالي الطلاب</p>
            </div>
            <div className="card text-center !p-3 sm:!p-4 bg-blue-50">
              <p className="text-xl sm:text-2xl font-black text-blue-700">{attendance.videos.length}</p>
              <p className="text-[11px] sm:text-xs text-gray-600 font-semibold mt-1 leading-tight">إجمالي الفيديوهات</p>
            </div>
            <div className="card text-center !p-3 sm:!p-4 bg-green-50">
              <p className="text-xl sm:text-2xl font-black text-green-700">{avgAttendance}%</p>
              <p className="text-[11px] sm:text-xs text-gray-600 font-semibold mt-1 leading-tight">متوسط المشاهدة</p>
            </div>
            <div className="card text-center !p-3 sm:!p-4 bg-orange-50">
              <p className="text-xl sm:text-2xl font-black text-orange-700">{fullyPresentCount}</p>
              <p className="text-[11px] sm:text-xs text-gray-600 font-semibold mt-1 leading-tight">طلاب حضور كامل</p>
            </div>
          </div>

          {/* ── مفتاح الألوان + ملاحظة المنهجية ── */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700">
              <CheckCircle2 className="w-4 h-4" /> حاضر (≥{PRESENT_THRESHOLD}% مشاهدة فعلية)
            </span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-yellow-600">
              <Circle className="w-4 h-4" /> جزئي ({PARTIAL_THRESHOLD}–{PRESENT_THRESHOLD - 1}%)
            </span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-red-500">
              <XCircle className="w-4 h-4" /> غائب ({'<'}{PARTIAL_THRESHOLD}%)
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-400 mr-auto">
              <Info className="w-3.5 h-3.5 flex-shrink-0" />
              النسبة = وقت المشاهدة الفعلي ÷ مدة الفيديو
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
              <p className="text-[10px] text-gray-400 font-semibold px-4 pt-2 text-center sm:hidden">
                ← اسحب للجانب لرؤية كل الفيديوهات →
              </p>
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
                      <th className="py-3 px-4 text-center font-bold min-w-[100px] bg-navy-700 whitespace-nowrap">
                        متوسط المشاهدة
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.students.map((student, idx) => {
                      const avgPct = getStudentAttendancePct(student.id);
                      const overallStatus = getStatus(avgPct);
                      return (
                        <tr
                          key={student.id}
                          className={`border-b transition-colors ${
                            dark
                              ? 'border-[var(--dk-border)] hover:bg-[var(--dk-hover)]'
                              : `border-gray-100 hover:bg-orange-50/30 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`
                          }`}
                        >
                          <td className={`py-3 px-4 sticky right-0 z-10 ${dark ? 'bg-[var(--dk-surface)]' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                            <div className="font-semibold text-navy-700 text-sm">{student.name}</div>
                            {student.username && (
                              <div className="text-[10px] font-mono font-bold text-orange-600">{student.username}</div>
                            )}
                            {student.academic_stage && (
                              <div className="text-xs text-gray-500">{student.academic_stage}</div>
                            )}
                          </td>

                          {attendance.videos.map(v => {
                            const p   = attendance.progressMap[student.id]?.[v.id];
                            const pct = effectivePct(v.id, p, durMap);
                            const status = getStatus(pct);
                            return (
                              <td
                                key={v.id}
                                className="py-3 px-3 text-center"
                                title={p
                                  ? `مشاهدة فعلية: ${pct}%${p.actual_watched_seconds > 0 ? ` (${Math.round(p.actual_watched_seconds / 60)} د فعلية)` : ''}`
                                  : 'لم يشاهد'}
                              >
                                <StatusIcon status={status} />
                                {p && (
                                  <div className="text-xs text-gray-400 mt-0.5">{pct}%</div>
                                )}
                              </td>
                            );
                          })}

                          {/* عمود المتوسط الكلي */}
                          <td className={`py-3 px-4 text-center font-bold ${dark ? '' : 'bg-gray-50'}`}>
                            <div className="flex flex-col items-center gap-0.5">
                              <span className={`text-base font-black ${
                                overallStatus === 'present'
                                  ? 'text-green-700'
                                  : overallStatus === 'partial'
                                  ? 'text-yellow-600'
                                  : 'text-red-600'
                              }`}>
                                {avgPct}%
                              </span>
                              {/* شريط تقدم مصغر */}
                              <div className="w-14 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    overallStatus === 'present'
                                      ? 'bg-green-500'
                                      : overallStatus === 'partial'
                                      ? 'bg-yellow-400'
                                      : 'bg-red-400'
                                  }`}
                                  style={{ width: `${avgPct}%` }}
                                />
                              </div>
                            </div>
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
