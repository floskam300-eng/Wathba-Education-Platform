import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays, ChevronRight, ChevronLeft, Users, BookOpen,
  CheckCircle2, XCircle, Save, Plus, Trash2, BarChart3,
  Download, AlertCircle, ClipboardList, Settings2, Pencil, X
} from 'lucide-react';
import api from '../../lib/api';
import { useTheme } from '../../context/ThemeContext';

/* ═══════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════ */
const WEEKDAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTH_NAMES   = [
  'يناير','فبراير','مارس','إبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDateAr(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

/* ═══════════════════════════════════════════════════════════
   MINI CALENDAR COMPONENT
═══════════════════════════════════════════════════════════ */
function MiniCalendar({ selectedDate, onSelectDate, onMonthChange, markedDates = [], dark }) {
  const [cursor, setCursor] = useState(() => {
    const d = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const { year, month } = cursor;

  useEffect(() => {
    if (onMonthChange) {
      onMonthChange(year, month + 1);
    }
  }, [year, month, onMonthChange]);

  const firstDay  = new Date(year, month, 1).getDay();
  const daysCount = new Date(year, month + 1, 0).getDate();
  const today     = todayStr();
  const markedSet = useMemo(() => new Set(markedDates), [markedDates]);

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysCount; d++) cells.push(d);

  const go = (delta) => setCursor(c => {
    let m = c.month + delta;
    let y = c.year;
    if (m > 11) { m = 0; y++; }
    if (m < 0)  { m = 11; y--; }
    return { year: y, month: m };
  });

  const dayStr = (d) => `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

  return (
    <div className={`rounded-2xl overflow-hidden border ${dark ? 'border-[var(--dk-border)] bg-[var(--dk-surface)]' : 'border-gray-200 bg-white'} shadow-sm`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-l from-blue-600 to-blue-700 text-white">
        <button onClick={() => go(1)} className="p-1 rounded-lg hover:bg-white/20 transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
        <span className="font-black text-base">{MONTH_NAMES[month]} {year}</span>
        <button onClick={() => go(-1)} className="p-1 rounded-lg hover:bg-white/20 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 text-center text-[11px] font-bold py-2 px-2"
           style={{ color: dark ? 'var(--dk-text-2)' : '#64748b' }}>
        {WEEKDAY_NAMES.map(d => <div key={d}>{d[0]}</div>)}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1 px-2 pb-3">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const ds = dayStr(d);
          const isSelected = ds === selectedDate;
          const isToday    = ds === today;
          const hasRecord  = markedSet.has(ds);
          return (
            <button key={i} onClick={() => { onSelectDate(ds); setCursor({ year, month }); }}
              className={`relative aspect-square flex items-center justify-center rounded-lg text-sm font-semibold transition-all duration-150 ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-md'
                  : isToday
                  ? dark ? 'bg-blue-900/40 text-blue-300 ring-1 ring-blue-500' : 'bg-blue-50 text-blue-700 ring-1 ring-blue-300'
                  : dark ? 'text-[var(--dk-text-1)] hover:bg-[var(--dk-elevated)]' : 'text-gray-700 hover:bg-gray-100'
              }`}>
              {d}
              {hasRecord && (
                <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-500'}`} />
              )}
            </button>
          );
        })}
      </div>

      {/* Jump to today */}
      {selectedDate !== today && (
        <div className="border-t px-3 pb-3 pt-2" style={{ borderColor: dark ? 'var(--dk-border)' : '#e2e8f0' }}>
          <button onClick={() => { onSelectDate(today); setCursor({ year: new Date().getFullYear(), month: new Date().getMonth() }); }}
            className="w-full text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors py-1">
            انتقل إلى اليوم
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SUBJECT MANAGER MODAL
═══════════════════════════════════════════════════════════ */
function SubjectModal({ stages, onClose, onRefresh, dark }) {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [newName, setNewName]   = useState('');
  const [newStage, setNewStage] = useState('');
  const [saving, setSaving]     = useState(false);
  const [editId, setEditId]     = useState(null);
  const [editName, setEditName] = useState('');
  const [editStage, setEditStage] = useState('');

  useEffect(() => {
    api.get('/attendance/subjects').then(r => { setSubjects(r.data); setLoading(false); });
  }, []);

  const addSubject = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const r = await api.post('/attendance/subjects', { name: newName.trim(), academic_stage: newStage || null });
      setSubjects(prev => [...prev, r.data]);
      setNewName(''); setNewStage('');
      onRefresh();
    } catch (e) {
      alert(e.response?.data?.error || 'خطأ في الحفظ');
    } finally { setSaving(false); }
  };

  const saveEdit = async (id) => {
    if (!editName.trim()) return;
    try {
      const r = await api.put(`/attendance/subjects/${id}`, { name: editName.trim(), academic_stage: editStage || null });
      setSubjects(prev => prev.map(s => s.id === id ? r.data : s));
      setEditId(null);
      onRefresh();
    } catch (e) { alert(e.response?.data?.error || 'خطأ في الحفظ'); }
  };

  const deleteSubject = async (id, name) => {
    if (!confirm(`حذف مادة "${name}" وكل سجلات الحضور المرتبطة بها؟ هذا الإجراء لا يمكن التراجع عنه.`)) return;
    try {
      await api.delete(`/attendance/subjects/${id}`);
      setSubjects(prev => prev.filter(s => s.id !== id));
      onRefresh();
    } catch (e) { alert(e.response?.data?.error || 'خطأ في الحذف'); }
  };

  const bg = dark ? 'bg-[var(--dk-surface)]' : 'bg-white';
  const border = dark ? 'border-[var(--dk-border)]' : 'border-gray-200';
  const text1 = dark ? 'text-[var(--dk-text-1)]' : 'text-navy-700';
  const text2 = dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden ${bg} border ${border}`} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: dark ? 'var(--dk-border)' : '#e2e8f0' }}>
          <h2 className={`font-black text-lg ${text1}`}>إدارة المواد الدراسية</h2>
          <button onClick={onClose} className={`p-2 rounded-lg hover:bg-red-50 transition-colors ${text2}`}><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Add new */}
          <div className={`rounded-xl border p-4 ${border} ${dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-50'}`}>
            <p className={`text-xs font-bold mb-3 ${text2}`}>إضافة مادة جديدة</p>
            <div className="flex gap-2 mb-2">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="اسم المادة (مثال: رياضيات)"
                className="input-field flex-1 text-sm"
                onKeyDown={e => e.key === 'Enter' && addSubject()}
              />
              <select value={newStage} onChange={e => setNewStage(e.target.value)} className="input-field text-sm" style={{ minWidth: '140px' }}>
                <option value="">السنة الدراسية</option>
                {stages.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <button onClick={addSubject} disabled={saving || !newName.trim()}
              className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50">
              <Plus className="w-4 h-4" />{saving ? 'جارٍ الحفظ...' : 'إضافة'}
            </button>
          </div>

          {/* List */}
          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />)}
            </div>
          ) : subjects.length === 0 ? (
            <div className={`text-center py-8 ${text2}`}>
              <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">لا توجد مواد بعد</p>
            </div>
          ) : (
            <div className="space-y-2">
              {subjects.map(s => (
                <div key={s.id} className={`flex items-center gap-3 p-3 rounded-xl border ${border} ${bg} hover:border-blue-300 transition-colors`}>
                  {editId === s.id ? (
                    <>
                      <input value={editName} onChange={e => setEditName(e.target.value)} className="input-field flex-1 text-sm py-1.5" />
                      <select value={editStage} onChange={e => setEditStage(e.target.value)} className="input-field text-sm py-1.5" style={{ minWidth: '130px' }}>
                        <option value="">السنة الدراسية</option>
                        {stages.map(st => <option key={st} value={st}>{st}</option>)}
                      </select>
                      <button onClick={() => saveEdit(s.id)} className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700"><Save className="w-4 h-4" /></button>
                      <button onClick={() => setEditId(null)} className="p-1.5 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300"><X className="w-4 h-4" /></button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className={`font-bold text-sm ${text1}`}>{s.name}</p>
                        {s.academic_stage && <p className={`text-xs ${text2}`}>{s.academic_stage}</p>}
                      </div>
                      <button onClick={() => { setEditId(s.id); setEditName(s.name); setEditStage(s.academic_stage || ''); }}
                        className={`p-1.5 rounded-lg hover:bg-blue-50 transition-colors ${text2}`}>
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteSubject(s.id, s.name)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ANALYTICS TAB
═══════════════════════════════════════════════════════════ */
function AnalyticsTab({ dark }) {
  const [subjectId, setSubjectId] = useState('');
  const [stage, setStage]         = useState('');

  const { data: subjects = [] } = useQuery({
    queryKey: ['class-subjects'],
    queryFn: () => api.get('/attendance/subjects').then(r => r.data),
  });
  const { data: stages = [] } = useQuery({
    queryKey: ['attendance-stages'],
    queryFn: () => api.get('/attendance/stages').then(r => r.data),
  });
  const { data: analytics = [], isLoading } = useQuery({
    queryKey: ['attendance-analytics', subjectId, stage],
    queryFn: () => api.get('/attendance/analytics', { params: { subject_id: subjectId || undefined, stage: stage || undefined } }).then(r => r.data),
  });

  // Group by student
  const studentMap = useMemo(() => {
    const m = {};
    for (const row of analytics) {
      if (!m[row.id]) {
        m[row.id] = { id: row.id, name: row.name, username: row.username, phone: row.phone, academic_stage: row.academic_stage, subjects: [] };
      }
      m[row.id].subjects.push({
        subject_id: row.subject_id,
        subject_name: row.subject_name,
        total: parseInt(row.total_sessions),
        present: parseInt(row.present_count),
        absent: parseInt(row.absent_count),
        avg_exam: row.avg_exam_score,
      });
    }
    return Object.values(m);
  }, [analytics]);

  const exportCSV = () => {
    if (!analytics.length) return;
    const header = ['اسم الطالب', 'الكود', 'رقم الهاتف', 'السنة الدراسية', 'المادة', 'إجمالي الحصص', 'حاضر', 'غائب', 'نسبة الحضور%', 'متوسط الدرجة'];
    const rows = analytics.map(r => [
      r.name, r.username, r.phone, r.academic_stage, r.subject_name,
      r.total_sessions, r.present_count, r.absent_count,
      r.total_sessions > 0 ? Math.round((r.present_count / r.total_sessions) * 100) : 0,
      r.avg_exam_score || '—'
    ]);
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = 'تحليل-الحضور.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const text1 = dark ? 'text-[var(--dk-text-1)]' : 'text-navy-700';
  const text2 = dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500';

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-40">
            <label className={`block text-xs font-bold mb-1.5 ${text2}`}>المادة</label>
            <select value={subjectId} onChange={e => setSubjectId(e.target.value)} className="input-field text-sm">
              <option value="">كل المواد</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name} {s.academic_stage ? `(${s.academic_stage})` : ''}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-40">
            <label className={`block text-xs font-bold mb-1.5 ${text2}`}>السنة الدراسية</label>
            <select value={stage} onChange={e => setStage(e.target.value)} className="input-field text-sm">
              <option value="">كل السنوات</option>
              {stages.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {analytics.length > 0 && (
            <button onClick={exportCSV} className="btn-secondary flex items-center gap-2 text-sm">
              <Download className="w-4 h-4" />تصدير CSV
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />)}</div>
      ) : studentMap.length === 0 ? (
        <div className="card text-center py-16">
          <BarChart3 className="w-14 h-14 mx-auto mb-3 opacity-20" style={{ color: dark ? 'var(--dk-text-2)' : '#94a3b8' }} />
          <p className={`font-semibold ${text2}`}>لا توجد بيانات حضور بعد</p>
        </div>
      ) : (
        <div className="card !p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-max">
              <thead className="bg-navy-600 text-white">
                <tr>
                  <th className="py-3 px-4 text-right font-bold min-w-[160px] sticky right-0 bg-navy-600 z-10">الطالب</th>
                  <th className="py-3 px-4 text-center font-bold min-w-[130px]">المادة</th>
                  <th className="py-3 px-4 text-center font-bold min-w-[90px]">الحصص</th>
                  <th className="py-3 px-4 text-center font-bold min-w-[80px] bg-green-700">حاضر</th>
                  <th className="py-3 px-4 text-center font-bold min-w-[80px] bg-red-700">غائب</th>
                  <th className="py-3 px-4 text-center font-bold min-w-[100px]">نسبة الحضور</th>
                  <th className="py-3 px-4 text-center font-bold min-w-[100px]">متوسط الدرجة</th>
                </tr>
              </thead>
              <tbody>
                {studentMap.map((st, si) => st.subjects.map((sub, subi) => (
                  <tr key={`${st.id}-${sub.subject_id}`}
                    className={`border-b transition-colors ${dark ? 'border-[var(--dk-border)] hover:bg-[var(--dk-hover)]' : 'border-gray-100 hover:bg-blue-50/20 ' + (si % 2 === 0 ? 'bg-white' : 'bg-gray-50/50')}`}>
                    {subi === 0 && (
                      <td rowSpan={st.subjects.length} className={`py-3 px-4 sticky right-0 z-10 align-top ${dark ? 'bg-[var(--dk-surface)]' : si % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                        <div className={`font-bold text-sm ${text1}`}>{st.name}</div>
                        {st.username && <div className="text-[10px] font-mono font-bold text-orange-600">{st.username}</div>}
                        {st.academic_stage && <div className={`text-xs ${text2}`}>{st.academic_stage}</div>}
                        {st.phone && <div className={`text-xs ${text2}`}>{st.phone}</div>}
                      </td>
                    )}
                    <td className="py-3 px-4 text-center">
                      <span className={`text-xs font-bold px-2 py-1 rounded-full bg-blue-100 text-blue-700`}>{sub.subject_name}</span>
                    </td>
                    <td className={`py-3 px-4 text-center font-bold ${text1}`}>{sub.total}</td>
                    <td className="py-3 px-4 text-center font-bold text-green-600">{sub.present}</td>
                    <td className="py-3 px-4 text-center font-bold text-red-500">{sub.absent}</td>
                    <td className="py-3 px-4 text-center">
                      {sub.total > 0 ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className={`font-black text-sm ${
                            Math.round(sub.present/sub.total*100) >= 75 ? 'text-green-600'
                            : Math.round(sub.present/sub.total*100) >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                            {Math.round(sub.present/sub.total*100)}%
                          </span>
                          <div className="w-16 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                            <div className={`h-full rounded-full ${
                              Math.round(sub.present/sub.total*100) >= 75 ? 'bg-green-500'
                              : Math.round(sub.present/sub.total*100) >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                              style={{ width: `${Math.round(sub.present/sub.total*100)}%` }} />
                          </div>
                        </div>
                      ) : '—'}
                    </td>
                    <td className={`py-3 px-4 text-center font-bold ${text1}`}>
                      {sub.avg_exam !== null ? `${parseFloat(sub.avg_exam).toFixed(1)}` : '—'}
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ATTENDANCE TABLE TAB (main recording page)
═══════════════════════════════════════════════════════════ */
function AttendanceTableTab({ dark }) {
  const qc = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const [subjectId, setSubjectId]       = useState('');
  const [examTotal, setExamTotal]       = useState('');
  const [rows, setRows]                 = useState({});   // { student_id: { status, exam_score } }
  const [saving, setSaving]             = useState(false);
  const [savedMsg, setSavedMsg]         = useState('');
  const [showSubjectModal, setShowSubjectModal] = useState(false);

  const calYear  = calendarCursor.year;
  const calMonth = calendarCursor.month;

  const handleMonthChange = useCallback((y, m) => {
    setCalendarCursor({ year: y, month: m });
  }, []);

  const { data: subjects = [], refetch: refetchSubjects } = useQuery({
    queryKey: ['class-subjects'],
    queryFn: () => api.get('/attendance/subjects').then(r => r.data),
  });
  const { data: stages = [] } = useQuery({
    queryKey: ['attendance-stages'],
    queryFn: () => api.get('/attendance/stages').then(r => r.data),
  });
  const { data: markedDates = [] } = useQuery({
    queryKey: ['attendance-calendar', subjectId, calYear, calMonth],
    queryFn: () => api.get('/attendance/calendar', { params: { subject_id: subjectId, year: calYear, month: calMonth } }).then(r => r.data),
    enabled: !!subjectId,
  });

  const { data: dayData, isLoading: loadingDay } = useQuery({
    queryKey: ['attendance-day', selectedDate, subjectId],
    queryFn: () => api.get('/attendance/records', { params: { date: selectedDate, subject_id: subjectId } }).then(r => r.data),
    enabled: !!(selectedDate && subjectId),
  });

  // Reset rows when query data changes
  useEffect(() => {
    if (dayData) {
      const init = {};
      dayData.students.forEach(s => {
        init[s.id] = { status: s.status ?? 'present', exam_score: s.exam_score !== null && s.exam_score !== undefined ? String(s.exam_score) : '' };
      });
      setRows(init);
      setExamTotal(dayData.exam_total !== null && dayData.exam_total !== undefined ? String(dayData.exam_total) : '');
    }
  }, [dayData]);

  const toggleStatus = useCallback((id) => {
    setRows(prev => ({
      ...prev,
      [id]: { ...prev[id], status: (prev[id]?.status === 'present' ? 'absent' : 'present') }
    }));
  }, []);

  const setScore = useCallback((id, val) => {
    setRows(prev => ({ ...prev, [id]: { ...prev[id], exam_score: val } }));
  }, []);

  const markAll = (status) => {
    const next = {};
    dayData?.students.forEach(s => { next[s.id] = { status, exam_score: rows[s.id]?.exam_score ?? '' }; });
    setRows(next);
  };

  const handleSave = async () => {
    if (!dayData || !subjectId) return;
    setSaving(true);
    try {
      const records = dayData.students.map(s => ({
        student_id: s.id,
        status: rows[s.id]?.status ?? 'present',
        exam_score: rows[s.id]?.exam_score !== '' ? rows[s.id]?.exam_score : null,
      }));
      await api.post('/attendance/records/bulk', {
        date: selectedDate,
        subject_id: subjectId,
        exam_total: examTotal !== '' ? examTotal : null,
        records,
      });
      qc.invalidateQueries(['attendance-calendar', subjectId, calYear, calMonth]);
      qc.invalidateQueries(['attendance-day', selectedDate, subjectId]);
      qc.invalidateQueries(['attendance-analytics']);
      setSavedMsg('تم الحفظ بنجاح ✓');
      setTimeout(() => setSavedMsg(''), 2500);
    } catch (e) {
      alert(e.response?.data?.error || 'خطأ في الحفظ');
    } finally { setSaving(false); }
  };

  const selectedSubject = subjects.find(s => String(s.id) === String(subjectId));
  const text1 = dark ? 'text-[var(--dk-text-1)]' : 'text-navy-700';
  const text2 = dark ? 'text-[var(--dk-text-2)]' : 'text-gray-500';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: Calendar + filters */}
        <div className="space-y-4">
          <MiniCalendar
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onMonthChange={handleMonthChange}
            markedDates={markedDates}
            dark={dark}
          />

          {/* Subject selector */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <label className={`text-xs font-bold ${text2}`}>المادة الدراسية</label>
              <button onClick={() => setShowSubjectModal(true)}
                className={`text-xs font-bold flex items-center gap-1 text-blue-600 hover:text-blue-700 transition-colors`}>
                <Settings2 className="w-3.5 h-3.5" />إدارة المواد
              </button>
            </div>
            <select
              value={subjectId}
              onChange={e => { setSubjectId(e.target.value); setRows({}); setExamTotal(''); }}
              className="input-field text-sm">
              <option value="">— اختر مادة —</option>
              {subjects.map(s => (
                <option key={s.id} value={s.id}>{s.name} {s.academic_stage ? `(${s.academic_stage})` : ''}</option>
              ))}
            </select>

            {/* Exam total */}
            {subjectId && dayData && (
              <div>
                <label className={`block text-xs font-bold mb-1.5 ${text2}`}>الدرجة الكلية للامتحان (اختياري)</label>
                <input
                  type="number" min="0" value={examTotal}
                  onChange={e => setExamTotal(e.target.value)}
                  placeholder="مثال: 30"
                  className="input-field text-sm"
                />
                <p className={`text-[10px] mt-1 ${text2}`}>تُطبّق على كل الطلاب — اتركها فارغة إذا لا يوجد امتحان اليوم</p>
              </div>
            )}
          </div>

          {/* Selected date display */}
          {selectedDate && (
            <div className={`rounded-xl border p-3 text-center ${dark ? 'border-[var(--dk-border)] bg-[var(--dk-elevated)]' : 'border-blue-200 bg-blue-50'}`}>
              <p className={`text-xs font-bold ${text2} mb-0.5`}>اليوم المحدد</p>
              <p className={`font-black text-base ${text1}`}>{formatDateAr(selectedDate)}</p>
              <p className={`text-xs ${text2}`}>{WEEKDAY_NAMES[new Date(selectedDate+'T00:00:00').getDay()]}</p>
            </div>
          )}
        </div>

        {/* RIGHT: Attendance table */}
        <div className="lg:col-span-2 space-y-4">
          {!subjectId && (
            <div className="card text-center py-20">
              <ClipboardList className="w-16 h-16 mx-auto mb-4 opacity-20" style={{ color: '#94a3b8' }} />
              <p className={`font-bold text-base ${text2}`}>اختر مادة لبدء تسجيل الحضور</p>
              <p className={`text-sm mt-1 ${text2} opacity-60`}>يمكنك إضافة مواد دراسية من زر «إدارة المواد»</p>
            </div>
          )}

          {subjectId && loadingDay && (
            <div className="card space-y-3">
              {[1,2,3,4,5].map(i => <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />)}
            </div>
          )}

          {subjectId && dayData && !loadingDay && (
            <>
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => markAll('present')}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors">
                    <CheckCircle2 className="w-3.5 h-3.5" />تحضير الكل
                  </button>
                  <button onClick={() => markAll('absent')}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors">
                    <XCircle className="w-3.5 h-3.5" />تغييب الكل
                  </button>
                </div>
                <div className={`mr-auto flex items-center gap-2 text-xs ${text2}`}>
                  <span className="font-bold text-green-600">
                    {(dayData.students || []).filter(s => (rows[s.id]?.status ?? 'present') === 'present').length} حاضر
                  </span>
                  <span>·</span>
                  <span className="font-bold text-red-500">
                    {(dayData.students || []).filter(s => (rows[s.id]?.status ?? 'present') === 'absent').length} غائب
                  </span>
                </div>
              </div>

              {dayData.students.length === 0 ? (
                <div className="card text-center py-12">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-20" style={{ color: '#94a3b8' }} />
                  <p className={`font-semibold ${text2}`}>
                    {selectedSubject?.academic_stage
                      ? `لا يوجد طلاب في "${selectedSubject.academic_stage}"`
                      : 'لا يوجد طلاب مسجلون'}
                  </p>
                </div>
              ) : (
                <div className="card !p-0 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-navy-600 text-white">
                        <tr>
                          <th className="py-3 px-4 text-right font-bold sticky right-0 bg-navy-600 z-10 min-w-[50px]">#</th>
                          <th className="py-3 px-3 text-right font-bold min-w-[80px]">الكود</th>
                          <th className="py-3 px-3 text-right font-bold min-w-[150px]">الاسم</th>
                          <th className="py-3 px-3 text-center font-bold min-w-[100px]">الهاتف</th>
                          <th className="py-3 px-3 text-center font-bold min-w-[120px]">السنة الدراسية</th>
                          <th className="py-3 px-3 text-center font-bold min-w-[80px]">المادة</th>
                          <th className="py-3 px-3 text-center font-bold min-w-[100px]">الحضور</th>
                          <th className="py-3 px-3 text-center font-bold min-w-[100px] bg-navy-700">الدرجة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dayData.students.map((student, idx) => {
                          const row = rows[student.id] || { status: 'present', exam_score: '' };
                          const isPresent = row.status === 'present';
                          return (
                            <tr key={student.id}
                              className={`border-b transition-colors ${
                                dark ? 'border-[var(--dk-border)] hover:bg-[var(--dk-hover)]'
                                : `border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/20`}`}>
                              <td className={`py-3 px-4 text-xs font-bold sticky right-0 z-10 ${dark ? 'bg-[var(--dk-surface)]' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} text-center`}
                                style={{ color: dark ? 'var(--dk-text-2)' : '#94a3b8' }}>
                                {idx + 1}
                              </td>
                              <td className={`py-3 px-3 font-mono font-bold text-xs text-orange-600`}>{student.username || '—'}</td>
                              <td className={`py-3 px-3 font-semibold ${text1}`}>{student.name}</td>
                              <td className={`py-3 px-3 text-center text-xs ${text2}`}>{student.phone || '—'}</td>
                              <td className={`py-3 px-3 text-center text-xs ${text2}`}>{student.academic_stage || '—'}</td>
                              <td className="py-3 px-3 text-center">
                                <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                  {selectedSubject?.name}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-center">
                                <button
                                  onClick={() => toggleStatus(student.id)}
                                  className={`flex items-center gap-1.5 mx-auto text-xs font-black px-3 py-1.5 rounded-xl transition-all duration-200 ${
                                    isPresent
                                      ? 'bg-green-100 text-green-700 hover:bg-green-200 border border-green-300'
                                      : 'bg-red-100 text-red-600 hover:bg-red-200 border border-red-300'
                                  }`}>
                                  {isPresent
                                    ? <><CheckCircle2 className="w-3.5 h-3.5" />حاضر</>
                                    : <><XCircle className="w-3.5 h-3.5" />غائب</>
                                  }
                                </button>
                              </td>
                              <td className={`py-3 px-3 text-center ${dark ? '' : 'bg-gray-50'}`}>
                                {isPresent ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <input
                                      type="number" min="0" max={examTotal || undefined}
                                      value={row.exam_score}
                                      onChange={e => setScore(student.id, e.target.value)}
                                      placeholder="—"
                                      className={`w-16 text-center text-sm font-bold rounded-lg border px-2 py-1 outline-none transition-colors
                                        ${dark ? 'bg-[var(--dk-elevated)] border-[var(--dk-border)] text-[var(--dk-text-1)]' : 'bg-white border-gray-300 text-navy-700'}
                                        focus:border-blue-400 focus:ring-1 focus:ring-blue-200`}
                                    />
                                    {examTotal && <span className={`text-xs ${text2}`}>/{examTotal}</span>}
                                  </div>
                                ) : (
                                  <span className={`text-xs ${text2}`}>—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Save button */}
              {dayData.students.length > 0 && (
                <div className="flex items-center gap-3">
                  <button onClick={handleSave} disabled={saving}
                    className="btn-primary flex items-center gap-2 disabled:opacity-50 px-8">
                    <Save className="w-4 h-4" />{saving ? 'جارٍ الحفظ...' : 'حفظ سجل اليوم'}
                  </button>
                  {savedMsg && (
                    <span className="flex items-center gap-1.5 text-green-600 text-sm font-bold animate-pulse">
                      <CheckCircle2 className="w-4 h-4" />{savedMsg}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showSubjectModal && (
        <SubjectModal
          stages={stages}
          dark={dark}
          onClose={() => setShowSubjectModal(false)}
          onRefresh={() => { refetchSubjects(); }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════ */
export default function ClassAttendance() {
  const { dark } = useTheme();
  const [activeTab, setActiveTab] = useState('record'); // 'record' | 'analytics'

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-navy-700">سجل الحضور والغياب اليومي</h1>
          <p className="text-sm text-gray-500 mt-1">تسجيل حضور وغياب الطلاب يوماً بيوم لكل مادة دراسية</p>
        </div>
      </div>

      {/* Tabs */}
      <div className={`flex gap-1 p-1 rounded-xl w-fit ${dark ? 'bg-[var(--dk-elevated)]' : 'bg-gray-100'}`}>
        {[
          { key: 'record',    label: 'تسجيل الحضور', icon: ClipboardList },
          { key: 'analytics', label: 'التحليلات',     icon: BarChart3 },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200 ${
              activeTab === key
                ? 'bg-white shadow-sm text-navy-700'
                : dark ? 'text-[var(--dk-text-2)] hover:text-[var(--dk-text-1)]' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'record'    && <AttendanceTableTab dark={dark} />}
      {activeTab === 'analytics' && <AnalyticsTab dark={dark} />}
    </div>
  );
}
