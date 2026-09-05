import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageCircle, Clock, Users, Search,
  ChevronDown, GraduationCap, Filter, Bell, CheckCircle, Megaphone,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import WhatsAppTab from '../../components/WhatsAppTab';
import useUrlState from '../../hooks/useUrlState';

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

const STUDENTS_PER_PAGE = 20;
const LOG_PER_PAGE = 20;

// ── Pagination Controls ─────────────────────────────────────────────────────
function PaginationBar({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;
  const pages = [];
  const start = Math.max(1, page - 2);
  const end   = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center justify-center gap-1 pt-2 pb-1">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-gray-100 transition-colors"
      >
        <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
      </button>
      {pages.map(pg => (
        <button
          key={pg}
          onClick={() => onPageChange(pg)}
          className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
            pg === page ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {pg}
        </button>
      ))}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-gray-100 transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5 text-gray-600" />
      </button>
    </div>
  );
}

// ── StudentPicker (with client-side pagination) ─────────────────────────────
function StudentPicker({
  search = '', setSearch, stageFilter = 'الكل', setStageFilter,
  selectedStudents = [], setSelectedStudents, students = [], filtered = [],
  stages = [], selectAll, selectStageAll, toggleStudent,
}) {
  const [page, setPage] = useState(1);

  // Reset to page 1 whenever search or stage filter changes
  const handleSearch = (val) => { setSearch(val); setPage(1); };
  const handleStage  = (stage) => { setStageFilter(stage); setPage(1); };

  const totalPages  = Math.ceil(filtered.length / STUDENTS_PER_PAGE);
  const paginated   = filtered.slice((page - 1) * STUDENTS_PER_PAGE, page * STUDENTS_PER_PAGE);

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
            onChange={e => handleSearch(e.target.value)}
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
                    onClick={() => stage !== 'الكل' ? (selectStageAll(stage), setPage(1)) : (handleStage('الكل'), setSelectedStudents([]))}
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

        {/* نص إجمالي */}
        <p className="text-[10px] text-gray-400">
          عرض {paginated.length} من {filtered.length} طالب
          {totalPages > 1 && ` — صفحة ${page} من ${totalPages}`}
        </p>
      </div>

      <div className="divide-y divide-slate-100">
        {filtered.length === 0 ? (
          <p className="text-center text-gray-400 py-8 text-sm">لا توجد نتائج</p>
        ) : paginated.map(s => {
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="border-t border-slate-100 px-4">
          <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function Notifications() {
  const qc = useQueryClient();
  const [search, setSearch] = useUrlState('q', '');
  const [stageFilter, setStageFilter] = useUrlState('stage', 'الكل');
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useUrlState('tab', 'platform');

  const [platformType, setPlatformType] = useState('general');
  const [platformTemplateOpen, setPlatformTemplateOpen] = useState(false);

  // Pagination state for history log
  const [logPage, setLogPage] = useState(1);

  const { data: students = [] } = useQuery({
    queryKey: ['notif-students'],
    queryFn: () => api.get('/notifications/students').then(r => r.data),
  });

  const { data: logsData } = useQuery({
    queryKey: ['notif-logs', logPage],
    queryFn: () => api.get('/notifications/log', { params: { page: logPage, limit: LOG_PER_PAGE } }).then(r => r.data),
    enabled: tab === 'history',
    keepPreviousData: true,
  });

  const logs       = logsData?.logs   || logsData || [];
  const logTotal   = logsData?.total  ?? (Array.isArray(logsData) ? logsData.length : 0);
  const logPages   = Math.ceil(logTotal / LOG_PER_PAGE) || 1;
  // backward-compat: if server returns plain array (old API), use it directly
  const logItems   = Array.isArray(logsData) ? logsData : (logsData?.logs || []);

  const platformMut = useMutation({
    mutationFn: (data) => api.post('/notifications/platform', data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['notif-logs'] });
      setLogPage(1);
      toast.success(`تم إرسال الإشعار لـ ${res.data.sent} طالب بنجاح ✅`);
      setSelectedStudents([]);
      setMessage('');
    },
    onError: (err) => {
      const msg = err?.response?.data?.error || 'حدث خطأ أثناء الإرسال';
      toast.error(msg);
    },
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
          ['platform',  '🔔 إشعار داخلي'],
          ['whatsapp',  '💬 واتساب'],
          ['history',   '📋 سجل الإشعارات'],
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
            <h2 className="font-black text-navy-600 dark:text-[var(--dk-text-1)] flex items-center gap-2">
              <Bell className="w-4 h-4 text-orange-500" /> إشعار داخلي للمنصة
            </h2>

            <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/40 rounded-xl p-3 text-xs text-orange-800 dark:text-orange-300 font-medium">
              <p className="font-bold mb-1">🔔 ما هو الإشعار الداخلي؟</p>
              <p>يصل الإشعار لجرس الإشعارات في حساب الطالب على المنصة مباشرةً.</p>
            </div>

            <div>
              <label className="block text-sm font-bold text-navy-700 dark:text-[var(--dk-text-1)] mb-2">نوع الإشعار</label>
              <div className="grid grid-cols-2 gap-2">
                {PLATFORM_TYPES.map(t => (
                  <button key={t.value} onClick={() => setPlatformType(t.value)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border-2 text-right ${platformType === t.value ? 'border-orange-500 bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-600' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-bold text-navy-700 dark:text-[var(--dk-text-1)]">نص الإشعار</label>
                <div className="relative">
                  <button onClick={() => setPlatformTemplateOpen(!platformTemplateOpen)}
                    className="text-xs font-bold text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-1">
                    قوالب جاهزة <ChevronDown className="w-3 h-3" />
                  </button>
                  {platformTemplateOpen && (
                    <div className="absolute left-0 top-6 w-72 bg-white dark:bg-[var(--dk-elevated)] border border-slate-200 dark:border-[var(--dk-border)] rounded-xl shadow-lg z-10 overflow-hidden">
                      {PLATFORM_TEMPLATES.map(t => (
                        <button key={t.title} onClick={() => { setMessage(t.text); setPlatformType(t.type); setPlatformTemplateOpen(false); }}
                          className="w-full text-right px-3 py-2.5 hover:bg-orange-50 dark:hover:bg-[var(--dk-hover)] transition-colors border-b border-slate-100 dark:border-[var(--dk-border)] last:border-0">
                          <p className="text-xs font-bold text-navy-700 dark:text-[var(--dk-text-1)]">{t.title}</p>
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
                <div className="mt-2 bg-gray-50 dark:bg-[var(--dk-surface)] border border-gray-200 dark:border-[var(--dk-border)] rounded-xl p-3">
                  <p className="text-xs font-bold text-gray-500 mb-1.5">👁 معاينة (أول طالب مختار):</p>
                  <p className="text-sm text-gray-700 dark:text-[var(--dk-text-1)] whitespace-pre-wrap leading-relaxed">
                    {message.replace(/\{name\}/g, students.find(s => s.id === selectedStudents[0])?.name || 'الطالب')}
                  </p>
                </div>
              )}
            </div>

            {/* Delay notice for large sends */}
            {selectedStudents.length > 50 && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3 text-xs text-amber-800 dark:text-amber-300">
                <p className="font-bold mb-0.5 flex items-center gap-1">⏱ إرسال تدريجي وآمن</p>
                <p>سيتم معالجة الإشعارات لـ {selectedStudents.length} طالب عبر دفعات خفيفة ومجعدة لضمان سرعة الإرسال واستقرار السيرفر دون أي تعليق للمنصة.</p>
              </div>
            )}

            <button onClick={sendPlatform} disabled={platformMut.isPending}
              className="w-full btn-primary flex items-center justify-center gap-2 py-2.5 disabled:opacity-60">
              {platformMut.isPending ? (
                <span className="w-5 h-5 border-2 border-navy-900/30 border-t-navy-900 rounded-full animate-spin" />
              ) : (
                <Bell className="w-5 h-5" />
              )}
              إرسال إشعار للمنصة ({selectedStudents.length} طالب)
            </button>
          </div>
        </div>
      )}

      {tab === 'whatsapp' && <WhatsAppTab />}

      {tab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-black text-navy-600 flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" /> سجل الإشعارات المرسلة
            </h2>
            {logTotal > 0 && (
              <span className="text-xs text-gray-400 font-medium">{logTotal} إشعار</span>
            )}
          </div>

          {logItems.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">لم يتم إرسال أي إشعارات بعد</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-100">
                {logItems.map(log => (
                  <div key={log.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-bold text-navy-700 dark:text-[var(--dk-text-1)] text-sm">{log.student_name || 'طالب'}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300">
                            🔔 إشعار داخلي
                          </span>
                          {log.title && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">{log.title}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-[var(--dk-text-2)] line-clamp-2">{log.message}</p>
                      </div>
                      <p className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">{fmtDate(log.sent_at)}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Log Pagination */}
              {logPages > 1 && (
                <div className="border-t border-slate-100 dark:border-[var(--dk-border)] px-5 py-3 flex items-center justify-between">
                  <p className="text-xs text-gray-400">صفحة {logPage} من {logPages}</p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setLogPage(p => Math.max(1, p - 1))}
                      disabled={logPage <= 1}
                      className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-[var(--dk-hover)] transition-colors"
                    >
                      <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                    </button>
                    {Array.from({ length: Math.min(5, logPages) }, (_, i) => {
                      const pg = logPage <= 3 ? i + 1 : logPage + i - 2;
                      if (pg < 1 || pg > logPages) return null;
                      return (
                        <button
                          key={pg}
                          onClick={() => setLogPage(pg)}
                          className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                            pg === logPage ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[var(--dk-hover)]'
                          }`}
                        >
                          {pg}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setLogPage(p => Math.min(logPages, p + 1))}
                      disabled={logPage >= logPages}
                      className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-gray-100 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
