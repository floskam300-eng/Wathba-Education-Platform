import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageCircle, Clock, Users, Search,
  ChevronDown, GraduationCap, Filter, Bell, CheckCircle, Megaphone,
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const PLATFORM_TYPES = [
  { value: 'general',             label: '📢 إعلان عام' },
  { value: 'exam_result',         label: '📊 نتيجة اختبار' },
  { value: 'new_exam',            label: '📝 اختبار جديد' },
  { value: 'new_course',          label: '📚 كورس جديد' },
  { value: 'retry_approved',      label: '🔄 قبول إعادة اختبار' },
  { value: 'enrollment_approved', label: '🎓 قبول في كورس' },
  { value: 'reminder',            label: '⏰ تذكير' },
  { value: 'announcement',        label: '📣 إعلان هام' },
];

const PLATFORM_TEMPLATES = [
  { type: 'general',     title: '🔴 بث مباشر الآن!',   text: 'أستاذك بدأ جلسة مباشرة الآن! ادخل على المنصة من قسم "بث مباشر" وانضم فوراً. 🎓🔴' },
  { type: 'reminder',    title: '📅 بث مباشر قريباً',  text: 'تذكير: سيبدأ الأستاذ بثاً مباشراً اليوم الساعة {time}. كون جاهز/ة وادخل على المنصة في الموعد. ⏰' },
  { type: 'new_exam',    title: 'اختبار جديد',         text: 'تم إضافة اختبار جديد — سجّل/ي الدخول لأداء الاختبار في أقرب وقت. 📝' },
  { type: 'exam_result', title: 'نتيجة اختبارك جاهزة', text: 'مرحباً {name}، تم تصحيح اختبارك ونتيجتك الآن متاحة. تفضل/ي بالاطلاع عليها. 📊' },
  { type: 'new_course',  title: 'كورس جديد متاح',      text: 'تم إضافة كورس جديد! تفضل/ي بالاطلاع على محتواه والتسجيل الآن. 📚' },
  { type: 'reminder',    title: 'تذكير',                text: 'تذكير: لا تنسَ/ي متابعة دروسك والاستعداد للاختبارات القادمة. ⏰' },
  { type: 'announcement',title: 'إعلان هام',            text: 'إعلان هام من المعلم — يرجى الاطلاع على أحدث التحديثات في المنصة. 📣' },
];

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function StudentPicker({
  search = '', setSearch, stageFilter = 'الكل', setStageFilter,
  selectedStudents = [], setSelectedStudents, students = [], filtered = [],
  stages = [], selectAll, selectStageAll, toggleStudent,
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-navy-600 flex items-center gap-2">
            <Users className="w-4 h-4 text-orange-500" /> اختر الطلاب
            {selectedStudents.length > 0 && (
              <span className="text-xs bg-orange-100 text-orange-700 font-bold px-2 py-0.5 rounded-full">
                {selectedStudents.length} محدد
              </span>
            )}
          </h2>
          <button onClick={selectAll} className="text-xs font-bold text-orange-600 hover:underline">
            {selectedStudents.length === filtered.length && filtered.length > 0 ? 'إلغاء الكل' : 'تحديد الكل'}
          </button>
        </div>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field pr-9 text-sm"
            placeholder="بحث باسم الطالب..."
          />
        </div>

        {stages.length > 1 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1 text-xs font-bold text-gray-500">
              <Filter className="w-3 h-3" /> فلتر حسب المرحلة
            </div>
            <div className="flex flex-wrap gap-1.5">
              {stages.map(stage => {
                const count = stage === 'الكل' ? students.length : students.filter(s => s.academic_stage === stage).length;
                const isActive = stageFilter === stage;
                return (
                  <button
                    key={stage}
                    onClick={() => stage !== 'الكل' ? selectStageAll(stage) : (setStageFilter('الكل'), setSelectedStudents([]))}
                    className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full transition-all border ${isActive ? 'bg-navy-600 text-white border-navy-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}
                  >
                    {stage !== 'الكل' && <GraduationCap className="w-3 h-3" />}
                    {stage}
                    <span className={`text-xs rounded-full px-1 font-black ${isActive ? 'bg-white/20 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="overflow-y-auto max-h-80 divide-y divide-slate-100">
        {filtered.length === 0 ? (
          <p className="text-center text-gray-400 py-8 text-sm">لا توجد نتائج</p>
        ) : filtered.map(s => {
          const selected = selectedStudents.includes(s.id);
          return (
            <label key={s.id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all ${selected ? 'bg-orange-50' : 'hover:bg-gray-50'}`}>
              <input type="checkbox" checked={selected} onChange={() => toggleStudent(s.id)}
                className="w-4 h-4 accent-orange-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-navy-700 text-sm">{s.name}</p>
                <p className="text-xs text-gray-400">{s.academic_stage}</p>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default function Notifications() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('الكل');
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState('platform');

  const [platformType, setPlatformType] = useState('general');
  const [platformTemplateOpen, setPlatformTemplateOpen] = useState(false);

  const { data: students = [] } = useQuery({
    queryKey: ['notif-students'],
    queryFn: () => api.get('/notifications/students').then(r => r.data),
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['notif-logs'],
    queryFn: () => api.get('/notifications/log').then(r => r.data),
    enabled: tab === 'history',
  });

  const platformMut = useMutation({
    mutationFn: (data) => api.post('/notifications/platform', data),
    onSuccess: (res) => {
      qc.invalidateQueries(['notif-logs']);
      toast.success(`تم إرسال الإشعار لـ ${res.data.sent} طالب بنجاح ✅`);
      setSelectedStudents([]);
      setMessage('');
    },
    onError: () => toast.error('حدث خطأ أثناء الإرسال'),
  });

  const stages = ['الكل', ...new Set(students.map(s => s.academic_stage).filter(Boolean))];

  const filtered = students.filter(s => {
    const matchSearch = s.name.includes(search);
    const matchStage = stageFilter === 'الكل' || s.academic_stage === stageFilter;
    return matchSearch && matchStage;
  });

  const toggleStudent = (id) =>
    setSelectedStudents(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const selectAll = () => {
    if (selectedStudents.length === filtered.length && filtered.length > 0) setSelectedStudents([]);
    else setSelectedStudents(filtered.map(s => s.id));
  };

  const selectStageAll = (stage) => {
    setStageFilter(stage);
    setSelectedStudents(students.filter(s => s.academic_stage === stage).map(s => s.id));
  };

  const sendPlatform = () => {
    if (!message.trim()) return toast.error('اكتب نص الإشعار أولاً');
    if (selectedStudents.length === 0) return toast.error('اختر طالباً واحداً على الأقل');
    const resolvedType = PLATFORM_TYPES.find(t => t.value === platformType);
    platformMut.mutate({
      student_ids: selectedStudents,
      message,
      type: platformType,
      title: resolvedType?.label.replace(/^[\S]+\s/, '') || 'إشعار جديد',
    });
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl sm:text-2xl font-black text-navy-600 flex items-center gap-2">
        <Bell className="w-6 h-6 sm:w-7 sm:h-7 text-indigo-500 flex-shrink-0" /> الإشعارات
      </h1>

      <div className="flex gap-1 sm:gap-2 bg-white rounded-xl border border-slate-200 p-1 shadow-sm overflow-x-auto">
        {[
          ['platform', '🔔 إشعار داخلي'],
          ['history',  '📋 سجل الإشعارات'],
        ].map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key); setMessage(''); setSelectedStudents([]); }}
            className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap flex-shrink-0 ${tab === key ? 'bg-navy-500 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'platform' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <StudentPicker
            search={search} setSearch={setSearch}
            stageFilter={stageFilter} setStageFilter={setStageFilter}
            selectedStudents={selectedStudents} setSelectedStudents={setSelectedStudents}
            students={students} filtered={filtered} stages={stages}
            selectAll={selectAll} selectStageAll={selectStageAll} toggleStudent={toggleStudent}
          />

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h2 className="font-black text-navy-600 flex items-center gap-2">
              <Bell className="w-4 h-4 text-indigo-500" /> إشعار داخلي للمنصة
            </h2>

            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-800 font-medium">
              <p className="font-bold mb-1">🔔 ما هو الإشعار الداخلي؟</p>
              <p>يصل الإشعار لجرس الإشعارات في حساب الطالب على المنصة مباشرةً.</p>
            </div>

            <div>
              <label className="block text-sm font-bold text-navy-700 mb-2">نوع الإشعار</label>
              <div className="grid grid-cols-2 gap-2">
                {PLATFORM_TYPES.map(t => (
                  <button key={t.value} onClick={() => setPlatformType(t.value)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border-2 text-right ${platformType === t.value ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-bold text-navy-700">نص الإشعار</label>
                <div className="relative">
                  <button onClick={() => setPlatformTemplateOpen(!platformTemplateOpen)}
                    className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">
                    قوالب جاهزة <ChevronDown className="w-3 h-3" />
                  </button>
                  {platformTemplateOpen && (
                    <div className="absolute left-0 top-6 w-72 bg-white border border-slate-200 rounded-xl shadow-lg z-10 overflow-hidden">
                      {PLATFORM_TEMPLATES.map(t => (
                        <button key={t.title} onClick={() => { setMessage(t.text); setPlatformType(t.type); setPlatformTemplateOpen(false); }}
                          className="w-full text-right px-3 py-2.5 hover:bg-indigo-50 transition-colors border-b border-slate-100 last:border-0">
                          <p className="text-xs font-bold text-navy-700">{t.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{t.text}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <textarea value={message} onChange={e => setMessage(e.target.value)}
                className="input-field h-32 resize-none text-sm"
                placeholder="اكتب نص الإشعار هنا... استخدم {name} لإدراج اسم الطالب" />
              <p className="text-xs text-gray-400 mt-1">استخدم &#123;name&#125; لإدراج اسم الطالب تلقائياً</p>
              {message && selectedStudents.length > 0 && (
                <div className="mt-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <p className="text-xs font-bold text-gray-500 mb-1.5">👁 معاينة (أول طالب مختار):</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {message.replace(/\{name\}/g, students.find(s => s.id === selectedStudents[0])?.name || 'الطالب')}
                  </p>
                </div>
              )}
            </div>

            <button onClick={sendPlatform} disabled={platformMut.isPending}
              className="w-full btn-primary flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60">
              {platformMut.isPending ? (
                <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Bell className="w-5 h-5" />
              )}
              إرسال إشعار للمنصة ({selectedStudents.length} طالب)
            </button>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h2 className="font-black text-navy-600 flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" /> سجل الإشعارات المرسلة
            </h2>
          </div>
          {logs.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">لم يتم إرسال أي إشعارات بعد</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {logs.map(log => (
                <div key={log.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-bold text-navy-700 text-sm">{log.student_name || 'طالب'}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-700">
                          🔔 إشعار داخلي
                        </span>
                        {log.title && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-purple-100 text-purple-700">{log.title}</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2">{log.message}</p>
                    </div>
                    <p className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">{fmtDate(log.sent_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
